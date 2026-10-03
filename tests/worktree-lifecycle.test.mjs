import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parseWorktreePorcelain } from "../dist/lib/git-worktree.js";
import {
  taskNumberFromBranch,
  taskNumberFromFilename,
} from "../dist/lib/task-id-allocation.js";

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

function vibeops(cwd, ...args) {
  const r = spawnSync(process.execPath, [cli, ...args, "--cwd", cwd], {
    env: ENV,
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

test("taskNumberFromBranch / taskNumberFromFilename", () => {
  assert.equal(taskNumberFromBranch("task/270-ui-nav"), 270);
  assert.equal(taskNumberFromBranch("refs/heads/task/012-x"), 12);
  assert.equal(taskNumberFromBranch("refs/remotes/origin/task/007"), 7);
  assert.equal(taskNumberFromBranch("task/task-020-merge-gate"), 20);
  assert.equal(taskNumberFromBranch("feature/300-x"), null);
  assert.equal(taskNumberFromBranch("task/abc"), null);
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

test("id allocation skips ids held only by a remote task branch (ls-remote)", () => {
  const { seed, b } = setupTwoWorktrees();
  git(seed, "switch", "-q", "-c", "task/012-someone-else", "origin/develop");
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
  const { a, b } = setupTwoWorktrees();
  git(a, "branch", "task/017-local-only", "develop");

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
  assert.match(r.out, /Cannot list task branches on origin/);
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
