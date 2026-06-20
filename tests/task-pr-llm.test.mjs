import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fallbackTaskPr,
  normalizeTaskPrTitle,
} from "../dist/lib/task-pr-llm.js";

test("normalizeTaskPrTitle uses conventional commits with task scope", () => {
  assert.equal(
    normalizeTaskPrTitle(
      "TASK-013",
      "TASK-013: ship public status page and design alignment",
    ),
    "feat(task-013): ship public status page and design alignment",
  );
  assert.equal(
    normalizeTaskPrTitle("TASK-013", "ship public status page and design alignment"),
    "feat(task-013): ship public status page and design alignment",
  );
  assert.equal(
    normalizeTaskPrTitle("TASK-013", "fix: handle null"),
    "fix(task-013): handle null",
  );
});

test("fallbackTaskPr title matches PR title lint rules", () => {
  const { prTitle } = fallbackTaskPr({
    taskId: "TASK-013",
    title: "ship public status page and design alignment",
    taskBody: "",
    diffSummary: "",
    baseBranch: "develop",
    headBranch: "task/013-public-status-page-design-refresh",
  });
  assert.equal(
    prTitle,
    "feat(task-013): ship public status page and design alignment",
  );
});
