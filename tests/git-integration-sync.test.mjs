import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import { diagnoseIntegrationSync } from "../dist/lib/git-integration-sync.js";
import { isIncompleteTaskStart } from "../dist/lib/task-start.js";

const exec = promisify(execFile);

async function git(cwd, ...args) {
  await exec("git", args, { cwd });
}

async function initRepo() {
  const dir = await mkdtemp(join(tmpdir(), "vibeops-sync-"));
  await git(dir, "init");
  await git(dir, "config", "user.email", "test@example.com");
  await git(dir, "config", "user.name", "Test");
  await writeFile(join(dir, "README.md"), "a\n");
  await git(dir, "add", ".");
  await git(dir, "commit", "-m", "init");
  await git(dir, "branch", "-M", "develop");
  return dir;
}

test("diagnoseIntegrationSync: no remote", async () => {
  const dir = await initRepo();
  try {
    const d = await diagnoseIntegrationSync(dir, "origin", "develop");
    assert.equal(d.ok, true);
    assert.equal(d.kind, "no_remote");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("diagnoseIntegrationSync: diverged reports ahead and behind", async () => {
  const dir = await initRepo();
  try {
    // Fake origin/develop at the initial tip, then diverge local + remote-tracking ref.
    const { stdout: base } = await exec("git", ["rev-parse", "HEAD"], { cwd: dir });
    const baseSha = base.trim();
    await exec("git", ["update-ref", "refs/remotes/origin/develop", baseSha], { cwd: dir });

    await writeFile(join(dir, "local-only.txt"), "l\n");
    await git(dir, "add", ".");
    await git(dir, "commit", "-m", "local");

    await writeFile(join(dir, "remote-only.txt"), "r\n");
    await git(dir, "add", ".");
    const { stdout: tree } = await exec("git", ["write-tree"], { cwd: dir });
    // Undo the remote-only file from the index/worktree so only the commit-tree has it.
    await git(dir, "reset", "--hard", "HEAD");
    const { stdout: remoteCommit } = await exec(
      "git",
      ["commit-tree", tree.trim(), "-p", baseSha, "-m", "remote"],
      { cwd: dir },
    );
    await exec("git", ["update-ref", "refs/remotes/origin/develop", remoteCommit.trim()], {
      cwd: dir,
    });
    // Need a remote named origin for diagnose's first checks — URL can be dummy if
    // remote branch existence uses local remote-tracking refs only.
    await git(dir, "remote", "add", "origin", dir);

    const d = await diagnoseIntegrationSync(dir, "origin", "develop");
    assert.equal(d.ok, false);
    assert.equal(d.kind, "diverged");
    assert.ok((d.ahead ?? 0) >= 1);
    assert.ok((d.behind ?? 0) >= 1);
    assert.ok(d.fixes.some((f) => f.includes("reset --hard") || f.includes("rebase")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("isIncompleteTaskStart: true without Git Context", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vibeops-task-"));
  try {
    await mkdir(join(dir, "docs", "tasks"), { recursive: true });
    const file = join(dir, "docs", "tasks", "TASK-001-demo.md");
    await writeFile(
      file,
      `# TASK-001: Demo\n\n## Status\n\nIn Progress\n\n## Git Context\n\n(populated by vibeops task add)\n`,
    );
    await git(dir, "init");
    assert.equal(await isIncompleteTaskStart(dir, file), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
