import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isMergeRequestReadyToMerge,
  isPipelineActive,
  pipelineStatusFromHost,
} from "../dist/lib/merge-request-readiness.js";

test("isPipelineActive detects running CI", () => {
  assert.equal(isPipelineActive("running"), true);
  assert.equal(isPipelineActive("pending"), true);
  assert.equal(isPipelineActive("success"), false);
  assert.equal(isPipelineActive("none"), false);
});

test("pipelineStatusFromHost normalizes GitLab pipeline states", () => {
  assert.equal(pipelineStatusFromHost("running"), "running");
  assert.equal(pipelineStatusFromHost("success"), "success");
  assert.equal(pipelineStatusFromHost(undefined), "none");
});

test("isMergeRequestReadyToMerge blocks running pipeline and allows green mergeable MR", () => {
  assert.equal(
    isMergeRequestReadyToMerge({
      state: "open",
      mergeStatus: "can_be_merged",
      detailedMergeStatus: "ci_still_running",
      pipelineStatus: "running",
      hasConflicts: false,
    }),
    false,
  );

  assert.equal(
    isMergeRequestReadyToMerge({
      state: "open",
      mergeStatus: "can_be_merged",
      detailedMergeStatus: "mergeable",
      pipelineStatus: "success",
      hasConflicts: false,
    }),
    true,
  );

  assert.equal(
    isMergeRequestReadyToMerge({
      state: "merged",
      mergeStatus: "can_be_merged",
      detailedMergeStatus: "mergeable",
      pipelineStatus: "success",
      hasConflicts: false,
    }),
    true,
  );
});

test("isMergeRequestReadyToMerge allows mergeable MR with no pipeline", () => {
  assert.equal(
    isMergeRequestReadyToMerge({
      state: "open",
      mergeStatus: "can_be_merged",
      detailedMergeStatus: "mergeable",
      pipelineStatus: "none",
      hasConflicts: false,
    }),
    true,
  );
});
