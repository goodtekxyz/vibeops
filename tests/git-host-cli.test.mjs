import assert from "node:assert/strict";
import test from "node:test";

import {
  hostCliTool,
  parseOwnerRepo,
  remoteUrlForHost,
} from "../dist/lib/git-host-cli.js";
import {
  computeNextHint,
  hintToLines,
} from "../dist/lib/task-context.js";

test("parseOwnerRepo accepts slug, https, and ssh", () => {
  assert.deepEqual(parseOwnerRepo("acme/app"), { owner: "acme", repo: "app" });
  assert.deepEqual(parseOwnerRepo("https://github.com/acme/app.git"), {
    owner: "acme",
    repo: "app",
  });
  assert.deepEqual(parseOwnerRepo("git@gitlab.com:acme/app.git"), {
    owner: "acme",
    repo: "app",
  });
  assert.equal(parseOwnerRepo("not a repo"), null);
});

test("remoteUrlForHost and hostCliTool", () => {
  assert.equal(hostCliTool("github"), "gh");
  assert.equal(hostCliTool("gitlab"), "glab");
  assert.equal(
    remoteUrlForHost("github", "a", "b"),
    "https://github.com/a/b.git",
  );
  assert.equal(
    remoteUrlForHost("gitlab", "a", "b"),
    "https://gitlab.com/a/b.git",
  );
});

test("computeNextHint follow-up uses ship, not reship", () => {
  const focus = {
    id: "TASK-001",
    title: "Demo",
    status: "shipped",
    filePath: "/tmp/TASK-001.md",
  };
  const hint = computeNextHint({
    isVibeopsProject: true,
    focus,
    resultFilled: true,
    testFilled: true,
    onTaskBranch: false,
    hasMergeRequest: false,
    mergeRequestMerged: true,
    needsSync: false,
    hasLocalChanges: true,
  });
  assert.equal(hint, "task-ship-followup");
  const lines = hintToLines(hint, "/tmp", focus);
  assert.ok(lines.some((l) => l.includes("task ship")));
  assert.ok(!lines.some((l) => l.includes("reship")));
});
