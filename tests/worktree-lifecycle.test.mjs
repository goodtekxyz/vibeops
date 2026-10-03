import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  restoreGovernanceStashAfterSwitch,
  stashGovernanceIfBlocking,
} from "../dist/lib/git.js";
import { fastForwardLocalIntegration, parseWorktreePorcelain } from "../dist/lib/git-worktree.js";
import {
  assertTaskIdFreeOnRemote,
  taskNumberFromBranch,
  taskNumberFromFilename,
} from "../dist/lib/task-id-allocation.js";
import { parseTaskLockConfig, taskLockPath } from "../dist/lib/task-lock.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist/cli.js");

// Fake `gh` / `glab` that always fail: no host MR lookup, no network.
const binDir = mkdtempSync(join(tmpdir(), "vibeops-nohost-"));
for (const name of ["gh", "glab"]) {
  const p = join(binDir, name);
  writeFileSync(p, "#!/bin/sh\nexit 1\n");
  chmodSync(p, 0o755);
}

const ENV = {
  ...process.env,
  PATH: `${binDir}:${process.env.PATH}`,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();
}

function vibeopsAsync(cwd, ...args) {
  return new Promise((resolveRun) => {
    const p = spawn(process.execPath, [cli, ...args, "--cwd", cwd], { env: ENV });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolveRun({ code, out }));
  });
}

function vibeops(cwd, ...args) {
  return vibeopsEnv(ENV, cwd, ...args);
}

function vibeopsEnv(env, cwd, ...args) {
  const r = spawnSync(process.execPath, [cli, ...args, "--cwd", cwd], {
    env,
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const CONFIG = {
  name: "wt",
  vibeopsVersion: "3.1.0",
  schemaVersion: 1,
  createdAt: "2026-10-03T00:00:00Z",
  clients: ["cursor"],
  git: { remote: "origin", host: "github", integrationBranch: "develop", productionBranch: "main" },
};

/** Bare remote + seed clone with main/develop, a Shipped TASK-001, and .vibeops.json. */
function setupRemote() {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-wt-"));
  const bare = join(dir, "remote.git");
  git(dir, "init", "--bare", "-b", "main", bare);
  const seed = join(dir, "seed");
  git(dir, "clone", "-q", bare, seed);
  git(seed, "switch", "-q", "-c", "main");
  writeFileSync(join(seed, ".vibeops.json"), `${JSON.stringify(CONFIG, null, 2)}\n`);
  mkdirSync(join(seed, "docs", "tasks"), { recursive: true });
  writeFileSync(
    join(seed, "docs", "tasks", "TASK-001-seed.md"),
    "# TASK-001: seed\n\n## Status\n\nShipped\n",
  );
  writeFileSync(join(seed, "README.md"), "seed\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "seed");
  git(seed, "push", "-q", "origin", "main");
  git(seed, "switch", "-q", "-c", "develop");
  git(seed, "push", "-q", "-u", "origin", "develop");
  return { dir, bare, seed };
}

/** Commit a file on develop in the seed clone and push (moves origin/develop). */
function advanceRemoteDevelop(seed, name) {
  git(seed, "switch", "-q", "develop");
  git(seed, "pull", "-q", "--ff-only", "origin", "develop");
  writeFileSync(join(seed, name), `${name}\n`);
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", `add ${name}`);
  git(seed, "push", "-q", "origin", "develop");
  return git(seed, "rev-parse", "HEAD");
}

/** Merge a pushed task branch into develop on the remote (what the host does on merge). */
function mergeOnRemote(seed, taskBranch) {
  git(seed, "fetch", "-q", "origin");
  git(seed, "switch", "-q", "develop");
  git(seed, "pull", "-q", "--ff-only", "origin", "develop");
  git(seed, "merge", "-q", "--no-ff", "-m", `Merge ${taskBranch}`, `origin/${taskBranch}`);
  git(seed, "push", "-q", "origin", "develop");
}

/** Create (in seed) a branch off origin/develop whose tree has docs/tasks/<file>. */
function seedBranchWithTaskFile(seed, branch, file) {
  git(seed, "fetch", "-q", "origin");
  git(seed, "switch", "-q", "-c", branch, "origin/develop");
  if (file !== null) {
    writeFileSync(join(seed, "docs", "tasks", file), `# ${file}\n\n## Status\n\nIn Progress\n`);
  } else {
    writeFileSync(join(seed, "notes.txt"), "no task file\n");
  }
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", `branch ${branch}`);
  git(seed, "switch", "-q", "develop");
}

/** Primary clone `a` on develop + linked worktree `b` detached at origin/develop. */
function setupTwoWorktrees() {
  const env = setupRemote();
  const a = join(env.dir, "a");
  git(env.dir, "clone", "-q", "-b", "develop", env.bare, a);
  const b = join(env.dir, "b");
  git(a, "worktree", "add", "-q", "--detach", b, "origin/develop");
  return { ...env, a, b };
}

function currentBranch(cwd) {
  try {
    return git(cwd, "symbolic-ref", "--quiet", "--short", "HEAD");
  } catch {
    return null;
  }
}

function taskFiles(cwd) {
  return readdirSync(join(cwd, "docs", "tasks")).filter((n) => n.startsWith("TASK-"));
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test("parseWorktreePorcelain reads branch / detached / bare entries", () => {
  const out = parseWorktreePorcelain(
    [
      "worktree /r/a",
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/develop",
      "",
      "worktree /r/b",
      "HEAD 2222222222222222222222222222222222222222",
      "detached",
      "",
      "worktree /r/bare.git",
      "bare",
      "",
    ].join("\n"),
  );
  assert.deepEqual(
    out.map((w) => [w.path, w.branch, w.detached, w.bare]),
    [
      ["/r/a", "develop", false, false],
      ["/r/b", null, true, false],
      ["/r/bare.git", null, false, true],
    ],
  );
});

test("taskNumberFromBranch accepts only the generated form task/<NNN>[-<slug>]", () => {
  assert.equal(taskNumberFromBranch("task/270-ui-nav"), 270);
  assert.equal(taskNumberFromBranch("refs/heads/task/012-x"), 12);
  assert.equal(taskNumberFromBranch("refs/remotes/origin/task/007"), 7);
  assert.equal(taskNumberFromBranch("task/1000-big"), 1000);
  // Not generated by VibeOps:
  assert.equal(taskNumberFromBranch("task/task-020-merge-gate"), null); // extra prefix
  assert.equal(taskNumberFromBranch("task/12-short"), null); // not zero-padded to 3
  assert.equal(taskNumberFromBranch("task/012-Upper"), null); // slugify is lowercase
  assert.equal(taskNumberFromBranch("task/012-a--b"), null); // slugify collapses hyphens
  assert.equal(taskNumberFromBranch("task/012_x"), null);
  assert.equal(taskNumberFromBranch("feature/300-x"), null);
  assert.equal(taskNumberFromBranch("task/abc"), null);
  // Matches the form (year-like number) — excluded later unless the branch has TASK-2026-*.md:
  assert.equal(taskNumberFromBranch("task/2026-q4-plan"), 2026);
  assert.equal(taskNumberFromFilename("TASK-042-foo.md"), 42);
  assert.equal(taskNumberFromFilename("README.md"), null);
});

// ---------------------------------------------------------------------------
// Two worktrees: develop checked out in `a`, commands run in `b`
// ---------------------------------------------------------------------------

test("task add succeeds while develop is checked out in another worktree; base = origin tip", () => {
  const { seed, a, b } = setupTwoWorktrees();
  const aHeadBefore = git(a, "rev-parse", "HEAD");
  const remoteTip = advanceRemoteDevelop(seed, "newer.txt"); // origin moves past a's develop

  const r = vibeops(b, "task", "add", "--non-interactive", "--idea", "Worktree slice");
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /already used by worktree/);

  const branch = currentBranch(b);
  assert.match(branch, /^task\/002-/);
  assert.equal(git(b, "rev-parse", `${branch}~0`), remoteTip, "task branch starts at origin/develop tip");
  assert.ok(taskFiles(b).some((n) => n.startsWith("TASK-002-")));

  // Other worktree untouched: still on develop at the same commit, clean.
  assert.equal(currentBranch(a), "develop");
  assert.equal(git(a, "rev-parse", "HEAD"), aHeadBefore);
  assert.equal(git(a, "status", "--porcelain"), "");
  assert.match(r.out, /checked out in worktree .* left unchanged/);
});

test("task branch is created with --no-track (no upstream on origin/develop)", () => {
  const { b } = setupTwoWorktrees();
  const r = vibeops(b, "task", "add", "--non-interactive", "--idea", "No track");
  assert.equal(r.code, 0, r.out);
  const branch = currentBranch(b);
  const upstream = spawnSync("git", ["rev-parse", "--abbrev-ref", `${branch}@{upstream}`], {
    cwd: b,
    env: ENV,
    encoding: "utf8",
  });
  assert.notEqual(upstream.status, 0, "task branch must not track origin/develop");
});

test("task sync succeeds while develop is checked out elsewhere; branches deleted, other worktree untouched", () => {
  const { seed, a, b } = setupTwoWorktrees();
  const add = vibeops(b, "task", "add", "--non-interactive", "--idea", "Sync me");
  assert.equal(add.code, 0, add.out);
  const branch = currentBranch(b);

  writeFileSync(join(b, "feature.txt"), "work\n");
  git(b, "add", "-A");
  git(b, "commit", "-q", "-m", "work");
  git(b, "push", "-q", "-u", "origin", branch);
  mergeOnRemote(seed, branch);

  const aHeadBefore = git(a, "rev-parse", "HEAD");
  const r = vibeops(b, "task", "sync");
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /already used by worktree/);

  // b left the task branch by detaching at origin/develop (develop is owned by a).
  assert.equal(currentBranch(b), null);
  assert.equal(git(b, "rev-parse", "HEAD"), git(b, "rev-parse", "origin/develop"));
  // local + remote task branch deleted
  assert.equal(git(b, "branch", "--list", branch), "");
  assert.equal(git(b, "ls-remote", "--heads", "origin", branch), "");
  // a untouched
  assert.equal(currentBranch(a), "develop");
  assert.equal(git(a, "rev-parse", "HEAD"), aHeadBefore);
  assert.equal(git(a, "status", "--porcelain"), "");
  assert.match(r.out, /checked out in worktree .* left unchanged/);
});

test("task sync refuses (before touching branches) when the task is not merged", () => {
  const { b } = setupTwoWorktrees();
  assert.equal(vibeops(b, "task", "add", "--non-interactive", "--idea", "Not merged").code, 0);
  const branch = currentBranch(b);
  writeFileSync(join(b, "x.txt"), "x\n");
  git(b, "add", "-A");
  git(b, "commit", "-q", "-m", "x");
  git(b, "push", "-q", "-u", "origin", branch);

  const r = vibeops(b, "task", "sync");
  assert.equal(r.code, 1, r.out);
  assert.equal(currentBranch(b), branch, "HEAD stays on the task branch");
  assert.notEqual(git(b, "branch", "--list", branch), "");
});

test("local develop not checked out anywhere is fast-forwarded by ref update", () => {
  const env = setupRemote();
  const a = join(env.dir, "a");
  git(env.dir, "clone", "-q", "-b", "develop", env.bare, a);
  git(a, "switch", "-q", "--detach");
  const b = join(env.dir, "b");
  git(a, "worktree", "add", "-q", "--detach", b, "origin/develop");
  const tip = advanceRemoteDevelop(env.seed, "later.txt");

  const r = vibeops(b, "task", "add", "--non-interactive", "--idea", "FF ref");
  assert.equal(r.code, 0, r.out);
  assert.equal(git(a, "rev-parse", "refs/heads/develop"), tip);
});

// ---------------------------------------------------------------------------
// Collision-free TASK ids
// ---------------------------------------------------------------------------

test("id allocation skips ids held only by a remote task branch (fetched)", () => {
  const { seed, b } = setupTwoWorktrees();
  seedBranchWithTaskFile(seed, "task/012-someone-else", "TASK-012-someone-else.md");
  git(seed, "push", "-q", "origin", "task/012-someone-else");

  const r = vibeops(b, "task", "add", "--non-interactive", "--idea", "After twelve");
  assert.equal(r.code, 0, r.out);
  assert.match(currentBranch(b), /^task\/013-/);
});

test("id allocation skips ids held by another worktree's uncommitted docs/tasks", () => {
  const { a, b } = setupTwoWorktrees();
  writeFileSync(join(a, "docs", "tasks", "TASK-015-in-a.md"), "# TASK-015: a\n\n## Status\n\nShipped\n");

  const r = vibeops(b, "task", "add", "--non-interactive", "--idea", "After fifteen");
  assert.equal(r.code, 0, r.out);
  assert.match(currentBranch(b), /^task\/016-/);
});

test("id allocation skips ids held by a local-only task branch", () => {
  const { seed, a, b } = setupTwoWorktrees();
  seedBranchWithTaskFile(seed, "task/017-local-only", "TASK-017-local-only.md");
  git(a, "fetch", "-q", seed, "task/017-local-only:task/017-local-only"); // local-only in a

  const r = vibeops(b, "task", "add", "--non-interactive", "--idea", "After seventeen");
  assert.equal(r.code, 0, r.out);
  assert.match(currentBranch(b), /^task\/018-/);
});

test("id allocation counts docs/tasks on origin/develop not yet in this worktree", () => {
  const { seed, b } = setupTwoWorktrees();
  git(seed, "switch", "-q", "develop");
  writeFileSync(join(seed, "docs", "tasks", "TASK-030-merged.md"), "# TASK-030: m\n\n## Status\n\nShipped\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "task 30");
  git(seed, "push", "-q", "origin", "develop");

  const r = vibeops(b, "task", "add", "--non-interactive", "--idea", "After thirty");
  assert.equal(r.code, 0, r.out);
  assert.match(currentBranch(b), /^task\/031-/);
});

test("unreachable remote → task add refuses and creates no TASK file (fail closed)", () => {
  const { b } = setupTwoWorktrees();
  git(b, "remote", "set-url", "origin", join(b, "does-not-exist.git"));
  const before = taskFiles(b);
  const r = vibeops(b, "task", "add", "--non-interactive", "--idea", "Offline");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /Cannot fetch task branches from origin/);
  assert.deepEqual(taskFiles(b), before);
});

// ---------------------------------------------------------------------------
// Single checkout: behaviour unchanged
// ---------------------------------------------------------------------------

test("single checkout: add fast-forwards develop and branches from origin tip; sync returns to develop", () => {
  const env = setupRemote();
  const a = join(env.dir, "a");
  git(env.dir, "clone", "-q", "-b", "develop", env.bare, a);
  const tip = advanceRemoteDevelop(env.seed, "single.txt");

  const add = vibeops(a, "task", "add", "--non-interactive", "--idea", "Single");
  assert.equal(add.code, 0, add.out);
  const branch = currentBranch(a);
  assert.match(branch, /^task\/002-/);
  assert.equal(git(a, "rev-parse", "develop"), tip, "local develop fast-forwarded");
  assert.equal(git(a, "rev-parse", branch), tip);
  assert.ok(existsSync(join(a, "docs", "tasks")));

  git(a, "add", "-A");
  git(a, "commit", "-q", "-m", "task file");
  git(a, "push", "-q", "-u", "origin", branch);
  mergeOnRemote(env.seed, branch);

  const sync = vibeops(a, "task", "sync");
  assert.equal(sync.code, 0, sync.out);
  assert.equal(currentBranch(a), "develop", "switched back to develop (not detached)");
  assert.equal(git(a, "rev-parse", "develop"), git(a, "rev-parse", "origin/develop"));
  assert.equal(git(a, "branch", "--list", branch), "");
  assert.equal(git(a, "ls-remote", "--heads", "origin", branch), "");
});

test("vibeops pull refuses to switch when develop is owned by another worktree", () => {
  const { b } = setupTwoWorktrees();
  const r = vibeops(b, "pull");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /checked out in worktree/);
  assert.equal(currentBranch(b), null);
});

// ---------------------------------------------------------------------------
// Review follow-up: generated-form ids with TASK-file evidence
// ---------------------------------------------------------------------------

test("id allocation ignores task/2026-q4-plan and generated-form branches without their TASK file", () => {
  const { seed, b } = setupTwoWorktrees();
  seedBranchWithTaskFile(seed, "task/2026-q4-plan", null);
  seedBranchWithTaskFile(seed, "task/050-no-file", null);
  git(seed, "push", "-q", "origin", "task/2026-q4-plan", "task/050-no-file");

  const r = vibeops(b, "task", "add", "--non-interactive", "--idea", "Not inflated");
  assert.equal(r.code, 0, r.out);
  assert.match(currentBranch(b), /^task\/002-/);
});

// ---------------------------------------------------------------------------
// Repository lock
// ---------------------------------------------------------------------------

test("concurrent task add in two worktrees allocates distinct ids (lock)", async () => {
  const { a, b } = setupTwoWorktrees();
  const c = join(dirname(b), "c");
  git(a, "worktree", "add", "-q", "--detach", c, "origin/develop");

  const [rb, rc] = await Promise.all([
    vibeopsAsync(b, "task", "add", "--non-interactive", "--idea", "Alpha"),
    vibeopsAsync(c, "task", "add", "--non-interactive", "--idea", "Beta"),
  ]);
  assert.equal(rb.code, 0, rb.out);
  assert.equal(rc.code, 0, rc.out);
  const ids = [currentBranch(b), currentBranch(c)].map((br) => br.slice("task/".length, "task/".length + 3));
  assert.deepEqual(ids.sort(), ["002", "003"]);
  assert.ok(taskFiles(b).some((n) => n.startsWith(`TASK-${currentBranch(b).slice(5, 8)}-`)));
  assert.ok(taskFiles(c).some((n) => n.startsWith(`TASK-${currentBranch(c).slice(5, 8)}-`)));
  assert.equal(existsSync(await taskLockPath(a)), false, "lock released");
});

test("lock held by a live process → clear error, no TASK file (waitSeconds 0)", async () => {
  const { b } = setupTwoWorktrees();
  writeFileSync(
    join(b, ".vibeops.json"),
    `${JSON.stringify({ ...CONFIG, lock: { waitSeconds: 0 } }, null, 2)}\n`,
  );
  const lockPath = await taskLockPath(b);
  writeFileSync(
    lockPath,
    JSON.stringify({
      token: "t",
      pid: process.pid, // this test process: alive
      host: hostname(),
      startedAt: new Date().toISOString(),
      operation: "task add",
      cwd: "/elsewhere",
    }),
  );
  const before = taskFiles(b);
  const r = vibeops(b, "task", "add", "--non-interactive", "--idea", "Blocked");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /holds the repository lock: pid \d+ on .* \(task add in \/elsewhere\)/);
  assert.deepEqual(taskFiles(b), before);
  assert.ok(existsSync(lockPath), "a live holder's lock is not removed");
});

test("stale lock (dead pid on this host) is removed and the command proceeds", async () => {
  const { b } = setupTwoWorktrees();
  const dead = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], {
    encoding: "utf8",
  });
  const lockPath = await taskLockPath(b);
  writeFileSync(
    lockPath,
    JSON.stringify({
      token: "t",
      pid: Number(dead.stdout),
      host: hostname(),
      startedAt: new Date().toISOString(),
      operation: "task add",
      cwd: "/gone",
    }),
  );
  const r = vibeops(b, "task", "add", "--non-interactive", "--idea", "After stale");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Removing stale VibeOps lock \(pid \d+ is not running\)/);
  assert.equal(existsSync(lockPath), false);
});

test("parseTaskLockConfig: defaults and strict validation", () => {
  assert.deepEqual(parseTaskLockConfig(undefined), { waitSeconds: 60, staleSeconds: 600 });
  assert.deepEqual(parseTaskLockConfig({ waitSeconds: 0, staleSeconds: 3600 }), {
    waitSeconds: 0,
    staleSeconds: 3600,
  });
  assert.throws(() => parseTaskLockConfig({ wait: 5 }), /unknown key `wait`/);
  assert.throws(() => parseTaskLockConfig({ waitSeconds: -1 }), /`waitSeconds` must be an integer between 0 and 600/);
  assert.throws(() => parseTaskLockConfig({ staleSeconds: 10 }), /`staleSeconds` must be an integer between 60 and 86400/);
  assert.throws(() => parseTaskLockConfig([]), /must be an object/);
});

// ---------------------------------------------------------------------------
// Shared refs/stash
// ---------------------------------------------------------------------------

test("governance stash restores by SHA and leaves another worktree's stash entry alone", async () => {
  const { a, b } = setupTwoWorktrees();
  // b: tracked governance change + untracked governance file
  writeFileSync(join(b, "docs", "tasks", "TASK-001-seed.md"), "# TASK-001: seed\n\n## Status\n\nShipped\n\nb edit\n");
  writeFileSync(join(b, "docs", "tasks", "TASK-002-new.md"), "# TASK-002: new\n");

  const sha = await stashGovernanceIfBlocking(b);
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.ok(existsSync(join(b, "docs", "tasks", "TASK-002-new.md")), "untracked file not stashed");
  assert.doesNotMatch(readFileSync(join(b, "docs", "tasks", "TASK-001-seed.md"), "utf8"), /b edit/);

  // Meanwhile, worktree a pushes its own stash entry on top of the shared stack.
  writeFileSync(join(a, "README.md"), "a edit\n");
  git(a, "stash", "push", "-q", "-m", "a's own work");

  await restoreGovernanceStashAfterSwitch(b, sha);
  assert.match(readFileSync(join(b, "docs", "tasks", "TASK-001-seed.md"), "utf8"), /b edit/);
  assert.doesNotMatch(readFileSync(join(b, "README.md"), "utf8"), /a edit/, "a's entry not applied in b");
  const list = git(a, "stash", "list");
  assert.match(list, /a's own work/, "a's entry kept");
  assert.doesNotMatch(list, /vibeops: governance/, "b's entry dropped");
});

// ---------------------------------------------------------------------------
// Local integration ref updates via fetch <remote> <b>:<b>
// ---------------------------------------------------------------------------

test("fastForwardLocalIntegration: owned elsewhere / non-ff (stale old value) / unowned behind", async () => {
  const env = setupRemote();
  const a = join(env.dir, "a");
  git(env.dir, "clone", "-q", "-b", "develop", env.bare, a);
  const b = join(env.dir, "b");
  git(a, "worktree", "add", "-q", "--detach", b, "origin/develop");
  advanceRemoteDevelop(env.seed, "x1.txt");
  git(b, "fetch", "-q", "origin");

  // develop checked out in a → git refuses; reported as owned elsewhere, unchanged
  const aDev = git(a, "rev-parse", "develop");
  const owned = await fastForwardLocalIntegration(b, "origin", "develop");
  assert.equal(owned.kind, "owned_elsewhere");
  assert.equal(git(a, "rev-parse", "develop"), aDev);

  // a leaves develop; develop gets a local-only commit (stale vs remote) → non-ff refused
  git(a, "switch", "-q", "--detach");
  git(a, "commit", "-q", "--allow-empty", "-m", "local only");
  git(a, "branch", "-f", "develop", "HEAD");
  const local = git(a, "rev-parse", "develop");
  const nonFf = await fastForwardLocalIntegration(b, "origin", "develop");
  assert.equal(nonFf.kind, "not_fast_forward");
  assert.equal(git(a, "rev-parse", "develop"), local, "never forced");

  // unowned and simply behind → fast-forwarded by fetch
  git(a, "branch", "-f", "develop", "origin/develop~1");
  const ff = await fastForwardLocalIntegration(b, "origin", "develop");
  assert.equal(ff.kind, "fast_forwarded");
  assert.equal(git(a, "rev-parse", "develop"), git(a, "rev-parse", "origin/develop"));
});

// ---------------------------------------------------------------------------
// baseCommit, ship collision guard, task del, task ship --new-cycle
// ---------------------------------------------------------------------------

test("Git Context records the full base commit SHA", () => {
  const { b } = setupTwoWorktrees();
  assert.equal(vibeops(b, "task", "add", "--non-interactive", "--idea", "Full sha").code, 0);
  const file = taskFiles(b).find((n) => n.startsWith("TASK-002-"));
  const text = readFileSync(join(b, "docs", "tasks", file), "utf8");
  assert.ok(text.includes(git(b, "rev-parse", "origin/develop")), text);
});

test("assertTaskIdFreeOnRemote refuses a different branch with the same id; fails closed offline", async () => {
  const { seed, b } = setupTwoWorktrees();
  seedBranchWithTaskFile(seed, "task/013-other-machine", "TASK-013-other-machine.md");
  git(seed, "push", "-q", "origin", "task/013-other-machine");

  const clash = await assertTaskIdFreeOnRemote(b, "origin", "task/013-mine");
  assert.equal(clash.ok, false);
  assert.match(clash.message, /TASK id collision: origin already has task\/013-other-machine/);
  assert.deepEqual(await assertTaskIdFreeOnRemote(b, "origin", "task/013-other-machine"), { ok: true });
  assert.deepEqual(await assertTaskIdFreeOnRemote(b, "origin", "task/014-free"), { ok: true });

  git(b, "remote", "set-url", "origin", join(b, "nope.git"));
  const offline = await assertTaskIdFreeOnRemote(b, "origin", "task/014-free");
  assert.equal(offline.ok, false);
  assert.match(offline.message, /Cannot list task branches/);
});

test("task ship refuses to push when another machine pushed the same TASK id", () => {
  const { seed, b } = setupTwoWorktrees();
  assert.equal(vibeops(b, "task", "add", "--non-interactive", "--idea", "Mine").code, 0);
  const mine = currentBranch(b);
  seedBranchWithTaskFile(seed, "task/002-other-machine", "TASK-002-other-machine.md");
  git(seed, "push", "-q", "origin", "task/002-other-machine");

  const r = vibeops(b, "task", "ship", "-m", "feat: mine", "--no-pr", "--non-interactive");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /TASK id collision/);
  assert.equal(git(b, "ls-remote", "--heads", "origin", mine), "", "not pushed");
});

test("task del works while develop is checked out in another worktree", () => {
  const { a, b } = setupTwoWorktrees();
  assert.equal(vibeops(b, "task", "add", "--non-interactive", "--idea", "Delete me").code, 0);
  const branch = currentBranch(b);
  const aHead = git(a, "rev-parse", "HEAD");

  const r = vibeops(b, "task", "del", "--force", "--no-close-mr");
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /already used by worktree/);
  assert.equal(currentBranch(b), null, "detached at origin/develop");
  assert.match(r.out, /detached this worktree at origin\/develop/);
  assert.equal(git(b, "branch", "--list", branch), "");
  assert.equal(currentBranch(a), "develop");
  assert.equal(git(a, "rev-parse", "HEAD"), aHead);
});

test("task ship --new-cycle --recreate-branch works while develop is checked out elsewhere", () => {
  const { seed, a, b } = setupTwoWorktrees();
  assert.equal(vibeops(b, "task", "add", "--non-interactive", "--idea", "Cycle").code, 0);
  const branch = currentBranch(b);
  writeFileSync(join(b, "one.txt"), "1\n");
  const ship1 = vibeops(b, "task", "ship", "-m", "feat: first", "--no-pr", "--non-interactive");
  assert.equal(ship1.code, 0, ship1.out);
  mergeOnRemote(seed, branch);
  const tip = git(seed, "rev-parse", "develop");
  const aHead = git(a, "rev-parse", "HEAD");

  // Host reports the first PR as merged (fake gh: `pr list --state merged` → one PR).
  const ghDir = mkdtempSync(join(tmpdir(), "vibeops-gh-merged-"));
  writeFileSync(
    join(ghDir, "gh"),
    [
      "#!/bin/sh",
      'if [ "$1" = "--version" ]; then echo "gh version 2.92.0"; exit 0; fi',
      'case "$*" in',
      '  *"pr list"*"--state merged"*) echo \'[{"url":"https://github.com/o/r/pull/1","state":"MERGED"}]\'; exit 0;;',
      '  *"pr list"*) echo "[]"; exit 0;;',
      "esac",
      "exit 1",
      "",
    ].join("\n"),
  );
  chmodSync(join(ghDir, "gh"), 0o755);
  const ghEnv = { ...ENV, PATH: `${ghDir}:${ENV.PATH}` };

  writeFileSync(join(b, "two.txt"), "2\n");
  const r = vibeopsEnv(
    ghEnv,
    b,
    "task",
    "ship",
    "--new-cycle",
    "--recreate-branch",
    "--skip-llm",
    "--no-pr",
    "--non-interactive",
    "-m",
    "fix: second",
  );
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /already used by worktree/);
  assert.equal(currentBranch(b), branch);
  assert.match(r.out, /detached this worktree at origin\/develop/);
  const anc = spawnSync("git", ["merge-base", "--is-ancestor", tip, "HEAD"], { cwd: b, env: ENV });
  assert.equal(anc.status, 0, `recreated from origin/develop tip\n${r.out}`);
  assert.equal(currentBranch(a), "develop");
  assert.equal(git(a, "rev-parse", "HEAD"), aHead);
});
