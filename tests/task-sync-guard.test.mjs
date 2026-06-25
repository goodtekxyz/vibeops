import assert from "node:assert/strict";
import { test } from "node:test";

import { mrLifecycleBlocksSync } from "../dist/lib/task-sync-guard.js";

test("mrLifecycleBlocksSync blocks open and closed-not-merged MRs", () => {
  assert.equal(mrLifecycleBlocksSync("open"), "mr-open");
  assert.equal(mrLifecycleBlocksSync("closed"), "mr-closed-not-merged");
  assert.equal(mrLifecycleBlocksSync("merged"), null);
  assert.equal(mrLifecycleBlocksSync("none"), null);
  assert.equal(mrLifecycleBlocksSync("unknown"), null);
});
