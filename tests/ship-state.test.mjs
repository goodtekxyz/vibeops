import assert from "node:assert/strict";
import { test } from "node:test";

import { prNumberFromUrl } from "../dist/lib/pr-create.js";
import { taskScopedCommitMessage } from "../dist/lib/task-git-commit.js";
import { prRefLabel, resolveShipAction } from "../dist/lib/task-ship-state.js";

test("resolveShipAction maps PR state + TASK status to the ship action", () => {
  // State 1: first submit (no PR, still In Progress)
  assert.equal(resolveShipAction("none", "in_progress"), "first");
  assert.equal(resolveShipAction("closed", "in_progress"), "first");

  // State 2: open PR → update it (regardless of TASK status)
  assert.equal(resolveShipAction("open", "shipped"), "update-open");
  assert.equal(resolveShipAction("open", "in_progress"), "update-open");

  // State 3: merged PR → new PR cycle
  assert.equal(resolveShipAction("merged", "shipped"), "new-cycle");
  assert.equal(resolveShipAction("merged", "in_progress"), "new-cycle");

  // Mismatch: Shipped but no open/merged PR (likely merged + synced)
  assert.equal(resolveShipAction("none", "shipped"), "mismatch");
  assert.equal(resolveShipAction("closed", "shipped"), "mismatch");
});

test("taskScopedCommitMessage always carries the TASK id as scope", () => {
  assert.equal(
    taskScopedCommitMessage("TASK-001", "fix: handle null"),
    "fix(task-001): handle null",
  );
  // existing (wrong) scope is rewritten to the TASK id
  assert.equal(
    taskScopedCommitMessage("TASK-001", "fix(login): handle null"),
    "fix(task-001): handle null",
  );
  // no conventional type → default type prefix
  assert.equal(
    taskScopedCommitMessage("TASK-001", "handle null"),
    "feat(task-001): handle null",
  );
  // already correct → unchanged (whitespace normalized)
  assert.equal(
    taskScopedCommitMessage("TASK-002", "feat(task-002): add widget"),
    "feat(task-002): add widget",
  );
  // breaking-change bang is preserved
  assert.equal(
    taskScopedCommitMessage("TASK-001", "feat!: drop old api"),
    "feat(task-001)!: drop old api",
  );
  // empty message falls back to the TASK id subject
  assert.equal(taskScopedCommitMessage("TASK-009", "   "), "feat(task-009): TASK-009");
});

test("prNumberFromUrl extracts the PR/MR number", () => {
  assert.equal(prNumberFromUrl("https://github.com/o/r/pull/42"), "42");
  assert.equal(prNumberFromUrl("https://gitlab.com/o/r/-/merge_requests/7"), "7");
  assert.equal(prNumberFromUrl("13"), "13");
  assert.equal(prNumberFromUrl(""), null);
  assert.equal(prNumberFromUrl(null), null);
  assert.equal(prNumberFromUrl(undefined), null);
  assert.equal(prNumberFromUrl("https://example.com/no-number"), null);
});

test("prRefLabel renders #<n> or a generic label", () => {
  assert.equal(prRefLabel("42"), "#42");
  assert.equal(prRefLabel(null), "the PR");
});
