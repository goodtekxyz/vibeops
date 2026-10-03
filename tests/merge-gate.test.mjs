import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";

import {
  checkNameMatches,
  classifyRollupItem,
  evaluateCheckGate,
} from "../dist/lib/check-rollup.js";
import { parseMergeBlock } from "../dist/lib/config.js";
import { pipelineGateState, pipelineStatusFromHost } from "../dist/lib/merge-request-readiness.js";
import { MergeGateError, mergeMergeRequest } from "../dist/lib/pr-create.js";

// ---------------------------------------------------------------------------
// Fake `gh` / `glab` on PATH: `pr view` / `mr view` return the next queued
// response (last one repeats); `pr merge` / `mr merge` append argv to a log.
// ---------------------------------------------------------------------------

const binDir = mkdtempSync(join(tmpdir(), "vibeops-fake-host-"));
const FAKE = `#!/usr/bin/env node
const fs = require("node:fs");
const dir = process.env.FAKE_HOST_DIR;
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("fake 1.0"); process.exit(0); }
if (args[1] === "view") {
  const views = JSON.parse(fs.readFileSync(dir + "/views.json", "utf8"));
  const counterPath = dir + "/counter";
  const i = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath, "utf8")) : 0;
  fs.writeFileSync(counterPath, String(i + 1));
  process.stdout.write(JSON.stringify(views[Math.min(i, views.length - 1)]));
  process.exit(0);
}
if (args[1] === "merge") {
  fs.appendFileSync(dir + "/merge.log", JSON.stringify(args) + "\\n");
  process.exit(0);
}
process.stderr.write("fake host: unsupported " + args.join(" "));
process.exit(2);
`;
for (const name of ["gh", "glab"]) {
  const p = join(binDir, name);
  writeFileSync(p, FAKE);
  chmodSync(p, 0o755);
}
process.env.PATH = `${binDir}:${process.env.PATH}`;

let stateDir;
beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "vibeops-fake-state-"));
  process.env.FAKE_HOST_DIR = stateDir;
});

function queueViews(views) {
  writeFileSync(join(stateDir, "views.json"), JSON.stringify(views));
}

function mergeCalls() {
  const p = join(stateDir, "merge.log");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
}

function viewCount() {
  const p = join(stateDir, "counter");
  return existsSync(p) ? Number(readFileSync(p, "utf8")) : 0;
}

// Real shape observed on goodtekxyz/zarvix.ai PR 286/288 (`gh pr view --json statusCheckRollup`).
const checkRun = (name, status, conclusion) => ({
  __typename: "CheckRun",
  name,
  status,
  conclusion,
  workflowName: "wf",
  detailsUrl: "https://example.invalid",
});
const statusContext = (context, state) => ({
  __typename: "StatusContext",
  context,
  state,
  targetUrl: "https://example.invalid",
});
const ghPr = (rollup, extra = {}) => ({
  state: "OPEN",
  mergedAt: null,
  mergeCommit: null,
  mergeable: "MERGEABLE",
  headRefOid: "abc123",
  statusCheckRollup: rollup,
  ...extra,
});

const FAST = { timeoutMs: 400, intervalMs: 10, emptyRollupGraceMs: 0 };
const URL = "https://github.com/o/r/pull/7";

async function merge(extra = {}) {
  return mergeMergeRequest({
    cwd: process.cwd(),
    host: "github",
    url: URL,
    method: "squash",
    waitForCi: true,
    gate: FAST,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Pure classification
// ---------------------------------------------------------------------------

test("classifyRollupItem: CheckRun uses status/conclusion (no state field)", () => {
  assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", "SUCCESS")).verdict, "passed");
  assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", "NEUTRAL")).verdict, "passed");
  assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", "SKIPPED")).verdict, "passed");
  for (const c of [
    "FAILURE",
    "CANCELLED",
    "TIMED_OUT",
    "ACTION_REQUIRED",
    "STARTUP_FAILURE",
    "STALE",
  ]) {
    assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", c)).verdict, "failed", c);
  }
  for (const s of ["QUEUED", "IN_PROGRESS", "WAITING", "PENDING", "REQUESTED"]) {
    assert.equal(classifyRollupItem(checkRun("a", s, null)).verdict, "pending", s);
  }
  // Missing / undocumented values fail closed.
  assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", null)).verdict, "failed");
  assert.equal(classifyRollupItem(checkRun("a", "COMPLETED", "BRAND_NEW")).verdict, "failed");
  assert.equal(classifyRollupItem(checkRun("a", "SOMETHING_ELSE", null)).verdict, "failed");
  assert.equal(classifyRollupItem({ __typename: "CheckRun", name: "a" }).verdict, "failed");
});

test("classifyRollupItem: StatusContext uses state", () => {
  assert.equal(classifyRollupItem(statusContext("ci", "SUCCESS")).verdict, "passed");
  assert.equal(classifyRollupItem(statusContext("ci", "PENDING")).verdict, "pending");
  assert.equal(classifyRollupItem(statusContext("ci", "EXPECTED")).verdict, "pending");
  assert.equal(classifyRollupItem(statusContext("ci", "FAILURE")).verdict, "failed");
  assert.equal(classifyRollupItem(statusContext("ci", "ERROR")).verdict, "failed");
  assert.equal(classifyRollupItem(statusContext("ci", "SUCCESS")).name, "ci");
  assert.equal(classifyRollupItem(statusContext("ci", "WEIRD")).verdict, "failed");
  assert.equal(classifyRollupItem({ __typename: "StatusContext", context: "ci" }).verdict, "failed");
});

test("checkNameMatches: exact and * glob", () => {
  assert.equal(checkNameMatches("Migrations lint · vs develop", "Migrations lint · vs develop"), true);
  assert.equal(checkNameMatches("Migrations lint · vs develop", "Migrations lint"), false);
  assert.equal(checkNameMatches("Strategy diff guards · vs develop", "Strategy diff guards*"), true);
  assert.equal(checkNameMatches("Migrations lint · vs develop", "* · vs develop"), true);
  assert.equal(checkNameMatches("a.b (x)", "a.b (x)"), true);
  assert.equal(checkNameMatches("aXb", "a.b"), false);
});

test("evaluateCheckGate: red beats pending; missing required is pending", () => {
  const ok = classifyRollupItem(checkRun("A", "COMPLETED", "SUCCESS"));
  const bad = classifyRollupItem(checkRun("B", "COMPLETED", "FAILURE"));
  const wait = classifyRollupItem(checkRun("C", "IN_PROGRESS", null));
  assert.equal(evaluateCheckGate([ok, bad, wait]).state, "red");
  assert.equal(evaluateCheckGate([ok, wait]).state, "pending");
  assert.equal(evaluateCheckGate([ok]).state, "green");
  assert.equal(evaluateCheckGate([]).state, "green");
  const missing = evaluateCheckGate([ok], ["A", "Z*"]);
  assert.equal(missing.state, "pending");
  assert.deepEqual(missing.missingRequired, ["Z*"]);
});

test("GitLab pipeline mapping: manual / unknown are red, scheduled is pending", () => {
  assert.equal(pipelineGateState(pipelineStatusFromHost("success")), "green");
  assert.equal(pipelineGateState(pipelineStatusFromHost("skipped")), "green");
  assert.equal(pipelineGateState(pipelineStatusFromHost(null)), "green");
  assert.equal(pipelineGateState(pipelineStatusFromHost("running")), "pending");
  assert.equal(pipelineGateState(pipelineStatusFromHost("scheduled")), "pending");
  assert.equal(pipelineGateState(pipelineStatusFromHost("failed")), "red");
  assert.equal(pipelineGateState(pipelineStatusFromHost("canceled")), "red");
  assert.equal(pipelineGateState(pipelineStatusFromHost("manual")), "red");
  assert.equal(pipelineGateState(pipelineStatusFromHost("something_new")), "red");
});

test("parseMergeBlock reads requiredChecks / releaseRequiredChecks", () => {
  assert.equal(parseMergeBlock(undefined), undefined);
  assert.equal(parseMergeBlock({ requiredChecks: [] }), undefined);
  assert.deepEqual(parseMergeBlock({ requiredChecks: [" A ", 3, "", "B*"] }), {
    requiredChecks: ["A", "B*"],
  });
  assert.deepEqual(parseMergeBlock({ releaseRequiredChecks: ["R"] }), {
    releaseRequiredChecks: ["R"],
  });
});

// ---------------------------------------------------------------------------
// mergeMergeRequest with fake gh
// ---------------------------------------------------------------------------

test("merge: CheckRun FAILURE refuses (no merge call), names the check", async () => {
  queueViews([
    ghPr([
      checkRun("Migrations lint · vs develop", "COMPLETED", "SUCCESS"),
      checkRun("Strategy diff guards · vs develop", "COMPLETED", "FAILURE"),
    ]),
  ]);
  await assert.rejects(merge(), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(e.message, /Strategy diff guards · vs develop" \(FAILURE\)/);
    return true;
  });
  assert.deepEqual(mergeCalls(), []);
  // Fail fast: no waiting on a red check.
  assert.equal(viewCount(), 1);
});

test("merge: CheckRun SUCCESS + StatusContext SUCCESS merges pinned to head sha", async () => {
  queueViews([
    ghPr([checkRun("build", "COMPLETED", "SUCCESS"), statusContext("ext/ci", "SUCCESS")]),
  ]);
  await merge();
  assert.deepEqual(mergeCalls(), [
    ["pr", "merge", "7", "--squash", "--match-head-commit", "abc123"],
  ]);
});

test("merge: pending then success merges after waiting", async () => {
  queueViews([
    ghPr([checkRun("build", "QUEUED", null), statusContext("ext/ci", "PENDING")]),
    ghPr([checkRun("build", "IN_PROGRESS", null), statusContext("ext/ci", "SUCCESS")]),
    ghPr([checkRun("build", "COMPLETED", "SUCCESS"), statusContext("ext/ci", "SUCCESS")]),
  ]);
  await merge();
  assert.equal(viewCount(), 3);
  assert.equal(mergeCalls().length, 1);
});

test("merge: pending that never finishes refuses after timeout", async () => {
  queueViews([ghPr([checkRun("build", "IN_PROGRESS", null)])]);
  await assert.rejects(merge({ gate: { ...FAST, timeoutMs: 60 } }), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(e.message, /checks still pending: "build" \(IN_PROGRESS\)/);
    return true;
  });
  assert.deepEqual(mergeCalls(), []);
});

test("merge: pending without waitForCi refuses immediately", async () => {
  queueViews([ghPr([checkRun("build", "IN_PROGRESS", null)])]);
  await assert.rejects(merge({ waitForCi: false }), MergeGateError);
  assert.equal(viewCount(), 1);
  assert.deepEqual(mergeCalls(), []);
});

test("merge: missing required check refuses with 'never ran'", async () => {
  queueViews([ghPr([checkRun("Migrations lint · vs develop", "COMPLETED", "SUCCESS")])]);
  await assert.rejects(
    merge({
      requiredChecks: ["Migrations lint · vs develop", "Strategy diff guards*"],
      gate: { ...FAST, timeoutMs: 60 },
    }),
    (e) => {
      assert.ok(e instanceof MergeGateError);
      assert.match(e.message, /required check "Strategy diff guards\*" never ran/);
      return true;
    },
  );
  assert.deepEqual(mergeCalls(), []);
});

test("merge: required check that appears later merges", async () => {
  queueViews([
    ghPr([checkRun("Migrations lint · vs develop", "COMPLETED", "SUCCESS")]),
    ghPr([
      checkRun("Migrations lint · vs develop", "COMPLETED", "SUCCESS"),
      checkRun("Strategy diff guards · vs develop", "COMPLETED", "SUCCESS"),
    ]),
  ]);
  await merge({ requiredChecks: ["Migrations lint · vs develop", "Strategy diff guards*"] });
  assert.equal(mergeCalls().length, 1);
});

test("merge: NEUTRAL and SKIPPED pass", async () => {
  queueViews([
    ghPr([
      checkRun("lint", "COMPLETED", "NEUTRAL"),
      checkRun("deploy-preview", "COMPLETED", "SKIPPED"),
      checkRun("build", "COMPLETED", "SUCCESS"),
    ]),
  ]);
  await merge();
  assert.equal(mergeCalls().length, 1);
});

test("merge: mixed — green CheckRuns but StatusContext ERROR refuses", async () => {
  queueViews([
    ghPr([checkRun("build", "COMPLETED", "SUCCESS"), statusContext("ext/ci", "ERROR")]),
  ]);
  await assert.rejects(merge(), /"ext\/ci" \(ERROR\)/);
  assert.deepEqual(mergeCalls(), []);
});

test("merge: mixed — CANCELLED + still running refuses immediately (red beats pending)", async () => {
  queueViews([
    ghPr([checkRun("build", "COMPLETED", "CANCELLED"), checkRun("e2e", "IN_PROGRESS", null)]),
  ]);
  await assert.rejects(merge(), (e) => {
    assert.match(e.message, /failed checks: "build" \(CANCELLED\)/);
    assert.match(e.message, /checks still pending: "e2e" \(IN_PROGRESS\)/);
    return true;
  });
  assert.equal(viewCount(), 1);
  assert.deepEqual(mergeCalls(), []);
});

test("merge: empty rollup waits through the grace window, then merges", async () => {
  queueViews([ghPr([]), ghPr([checkRun("build", "COMPLETED", "SUCCESS")])]);
  await merge({ gate: { ...FAST, emptyRollupGraceMs: 5_000 } });
  assert.equal(viewCount(), 2);
  assert.equal(mergeCalls().length, 1);
});

test("merge: already merged PR does not call gh pr merge", async () => {
  queueViews([ghPr([], { state: "MERGED", mergedAt: "2026-10-03T00:00:00Z" })]);
  await merge();
  assert.deepEqual(mergeCalls(), []);
});

test("merge: conflicting PR refuses", async () => {
  queueViews([ghPr([checkRun("build", "COMPLETED", "SUCCESS")], { mergeable: "CONFLICTING" })]);
  await assert.rejects(merge(), /merge conflicts/);
  assert.deepEqual(mergeCalls(), []);
});

test("merge: gh output missing statusCheckRollup fails closed immediately", async () => {
  const pr = ghPr([]);
  delete pr.statusCheckRollup;
  queueViews([pr]);
  await assert.rejects(merge(), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(e.message, /gh output is missing `statusCheckRollup`/);
    return true;
  });
  assert.equal(viewCount(), 1);
  assert.deepEqual(mergeCalls(), []);
});

test("merge: gh output missing headRefOid fails closed", async () => {
  const pr = ghPr([checkRun("build", "COMPLETED", "SUCCESS")]);
  delete pr.headRefOid;
  queueViews([pr]);
  await assert.rejects(merge(), /missing `headRefOid`/);
  assert.deepEqual(mergeCalls(), []);
});

// ---------------------------------------------------------------------------
// GitLab path (fake glab)
// ---------------------------------------------------------------------------

const glMr = (pipelineStatus, extra = {}) => ({
  state: "opened",
  merged_at: null,
  merge_status: "can_be_merged",
  detailed_merge_status: "mergeable",
  has_conflicts: false,
  head_pipeline: pipelineStatus === null ? null : { status: pipelineStatus },
  sha: "def456",
  ...extra,
});

async function mergeGitLab(extra = {}) {
  return mergeMergeRequest({
    cwd: process.cwd(),
    host: "gitlab",
    url: "https://gitlab.com/o/r/-/merge_requests/9",
    method: "squash",
    waitForCi: true,
    immediate: true,
    gate: FAST,
    ...extra,
  });
}

test("gitlab: failed pipeline refuses", async () => {
  queueViews([glMr("failed")]);
  await assert.rejects(mergeGitLab(), /head pipeline is failed/);
  assert.deepEqual(mergeCalls(), []);
});

test("gitlab: manual pipeline refuses (previously treated as mergeable)", async () => {
  queueViews([glMr("manual")]);
  await assert.rejects(mergeGitLab(), /head pipeline is manual/);
  assert.deepEqual(mergeCalls(), []);
});

test("gitlab: running then success merges immediately", async () => {
  queueViews([
    glMr("running", { detailed_merge_status: "ci_still_running" }),
    glMr("success"),
  ]);
  await mergeGitLab();
  assert.deepEqual(mergeCalls(), [["mr", "merge", "9", "--auto-merge=false", "--squash"]]);
});
