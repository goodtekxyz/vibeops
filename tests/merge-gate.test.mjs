import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, test } from "node:test";

import {
  checkNameMatches,
  classifyRollupItem,
  evaluateCheckGate,
} from "../dist/lib/check-rollup.js";
import { buildConfig, readConfig } from "../dist/lib/config.js";
import {
  MERGE_GATE_DEFAULTS,
  MergeConfigError,
  parseMergeConfig,
} from "../dist/lib/merge-config.js";
import { pipelineGateState, pipelineStatusFromHost } from "../dist/lib/merge-request-readiness.js";
import { MergeGateError, mergeMergeRequest } from "../dist/lib/pr-create.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Fake `gh` / `glab` on PATH: `pr view` / `mr view` return the next queued
// response (last one repeats); `pr merge` / `mr merge` append argv to a log.
// If `<state>/merge-fail` holds N > 0, the merge fails with HTTP 405 and N--.
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
  const failPath = dir + "/merge-fail";
  const left = fs.existsSync(failPath) ? Number(fs.readFileSync(failPath, "utf8")) : 0;
  if (left > 0) {
    fs.writeFileSync(failPath, String(left - 1));
    process.stderr.write("PUT merge: 405 Method Not Allowed");
    process.exit(1);
  }
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

function failNextMerges(n) {
  writeFileSync(join(stateDir, "merge-fail"), String(n));
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

// Shapes match `gh pr view --json state,mergeable,headRefOid,statusCheckRollup`.
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

// Success paths end as soon as the fake host reports green (event-driven); the timeout only
// bounds a broken run. Tests that exercise the timeout set a small `timeoutMs` explicitly.
const FAST = { timeoutMs: 30_000, intervalMs: 10, emptyRollupGraceMs: 0 };
const URL = "https://github.com/o/r/pull/7";

async function merge(extra = {}) {
  return mergeMergeRequest({
    cwd: process.cwd(),
    host: "github",
    url: URL,
    method: "squash",
    waitForCi: true,
    ...extra,
    gate: { ...FAST, ...(extra.gate ?? {}) },
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
  assert.equal(checkNameMatches("lint · unit", "lint · unit"), true);
  assert.equal(checkNameMatches("lint · unit", "lint"), false);
  assert.equal(checkNameMatches("lint · e2e", "lint*"), true);
  assert.equal(checkNameMatches("build · linux", "* · linux"), true);
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

test("evaluateCheckGate: duplicate check names — any failure fails", () => {
  const pass = classifyRollupItem(checkRun("build", "COMPLETED", "SUCCESS"));
  const fail = classifyRollupItem(checkRun("build", "COMPLETED", "FAILURE"));
  assert.equal(evaluateCheckGate([pass, fail], ["build"]).state, "red");
  assert.equal(evaluateCheckGate([fail, pass], ["build"]).state, "red");
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

// ---------------------------------------------------------------------------
// merge config validation (fail closed)
// ---------------------------------------------------------------------------

test("parseMergeConfig: absent block → documented defaults", () => {
  assert.deepEqual(parseMergeConfig(undefined), MERGE_GATE_DEFAULTS);
  assert.equal(MERGE_GATE_DEFAULTS.waitTimeoutSeconds, 900);
  assert.equal(MERGE_GATE_DEFAULTS.pollIntervalSeconds, 5);
  assert.equal(MERGE_GATE_DEFAULTS.emptyRollupGraceSeconds, 30);
  assert.equal(MERGE_GATE_DEFAULTS.allowNoChecks, false);
});

test("parseMergeConfig: valid block", () => {
  const cfg = parseMergeConfig({
    requiredChecks: [" build ", "lint*"],
    releaseRequiredChecks: ["release smoke"],
    waitTimeoutSeconds: 120,
    pollIntervalSeconds: 3,
    emptyRollupGraceSeconds: 0,
    allowNoChecks: true,
  });
  assert.deepEqual(cfg, {
    requiredChecks: ["build", "lint*"],
    releaseRequiredChecks: ["release smoke"],
    waitTimeoutSeconds: 120,
    pollIntervalSeconds: 3,
    emptyRollupGraceSeconds: 0,
    allowNoChecks: true,
  });
});

test("parseMergeConfig: malformed blocks throw MergeConfigError naming the key", () => {
  const bad = [
    [null, /must be an object/],
    ["build", /must be an object/],
    [["build"], /must be an object/],
    [{ requiredChecks: "build" }, /`requiredChecks` must be an array/],
    [{ requiredChecks: ["build", 3] }, /`requiredChecks\[1\]` must be a non-empty string/],
    [{ requiredChecks: ["build", "  "] }, /`requiredChecks\[1\]` must be a non-empty string/],
    [{ releaseRequiredChecks: {} }, /`releaseRequiredChecks` must be an array/],
    [{ requiredCheck: ["build"] }, /unknown key `requiredCheck`/],
    [{ waitTimeoutSeconds: 0 }, /`waitTimeoutSeconds` must be an integer between 1 and 7200/],
    [{ waitTimeoutSeconds: 1.5 }, /`waitTimeoutSeconds`/],
    [{ waitTimeoutSeconds: "60" }, /`waitTimeoutSeconds`/],
    [{ waitTimeoutSeconds: 99999 }, /`waitTimeoutSeconds`/],
    [{ pollIntervalSeconds: 0 }, /`pollIntervalSeconds` must be an integer between 1 and 300/],
    [{ emptyRollupGraceSeconds: -1 }, /`emptyRollupGraceSeconds` must be an integer between 0 and 600/],
    [{ waitTimeoutSeconds: 10, pollIntervalSeconds: 20 }, /must not exceed `waitTimeoutSeconds`/],
    [{ allowNoChecks: "yes" }, /`allowNoChecks` must be true or false/],
  ];
  for (const [raw, re] of bad) {
    assert.throws(
      () => parseMergeConfig(raw),
      (e) => e instanceof MergeConfigError && re.test(e.message),
      JSON.stringify(raw),
    );
  }
});

test("re-init preserves the raw merge block verbatim", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-cfg-"));
  const merge = { requiredChecks: ["build"], allowNoChecks: false };
  writeFileSync(
    join(dir, ".vibeops.json"),
    JSON.stringify({
      name: "x",
      vibeopsVersion: "2.6.0",
      schemaVersion: 1,
      createdAt: "2026-10-03T00:00:00Z",
      clients: ["cursor"],
      merge,
    }),
  );
  const existing = await readConfig(dir);
  const rebuilt = buildConfig(
    "x",
    ["cursor"],
    { remote: "origin", host: "github", integrationBranch: "develop", productionBranch: "main" },
    existing,
  );
  assert.deepEqual(rebuilt.merge, merge);
});

// ---------------------------------------------------------------------------
// mergeMergeRequest with fake gh
// ---------------------------------------------------------------------------

test("merge: CheckRun FAILURE refuses (no merge call), names the check", async () => {
  queueViews([
    ghPr([checkRun("lint", "COMPLETED", "SUCCESS"), checkRun("build", "COMPLETED", "FAILURE")]),
  ]);
  await assert.rejects(merge(), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(e.message, /failed checks: "build" \(FAILURE\)/);
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

test("merge: duplicate check name with one failure refuses", async () => {
  queueViews([
    ghPr([checkRun("build", "COMPLETED", "SUCCESS"), checkRun("build", "COMPLETED", "FAILURE")]),
  ]);
  await assert.rejects(merge({ requiredChecks: ["build"] }), /"build" \(FAILURE\)/);
  assert.deepEqual(mergeCalls(), []);
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
  await assert.rejects(merge({ gate: { timeoutMs: 60 } }), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(e.message, /checks still pending: "build" \(IN_PROGRESS\)/);
    assert.match(e.message, /gave up after/);
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
  queueViews([ghPr([checkRun("build", "COMPLETED", "SUCCESS")])]);
  await assert.rejects(
    merge({ requiredChecks: ["build", "lint*"], gate: { timeoutMs: 60 } }),
    (e) => {
      assert.ok(e instanceof MergeGateError);
      assert.match(e.message, /required check "lint\*" never ran/);
      return true;
    },
  );
  assert.deepEqual(mergeCalls(), []);
});

test("merge: required check that appears later merges", async () => {
  queueViews([
    ghPr([checkRun("build", "COMPLETED", "SUCCESS")]),
    ghPr([
      checkRun("build", "COMPLETED", "SUCCESS"),
      checkRun("lint · unit", "COMPLETED", "SUCCESS"),
    ]),
  ]);
  await merge({ requiredChecks: ["build", "lint*"] });
  assert.equal(mergeCalls().length, 1);
});

test("merge: NEUTRAL and SKIPPED pass", async () => {
  queueViews([
    ghPr([
      checkRun("lint", "COMPLETED", "NEUTRAL"),
      checkRun("preview", "COMPLETED", "SKIPPED"),
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

test("merge: empty rollup waits through the grace window, then merges once checks appear", async () => {
  queueViews([ghPr([]), ghPr([checkRun("build", "COMPLETED", "SUCCESS")])]);
  await merge({ gate: { emptyRollupGraceMs: 5_000 } });
  assert.equal(viewCount(), 2);
  assert.equal(mergeCalls().length, 1);
});

test("merge: no checks after grace refuses by default (fail closed)", async () => {
  queueViews([ghPr([])]);
  await assert.rejects(merge({ gate: { emptyRollupGraceMs: 30 } }), (e) => {
    assert.ok(e instanceof MergeGateError);
    assert.match(e.message, /reports no checks/);
    assert.match(e.message, /merge\.allowNoChecks/);
    return true;
  });
  assert.deepEqual(mergeCalls(), []);
});

test("merge: no checks with allowNoChecks merges and warns exactly once", async () => {
  // Several polls before the host reports mergeable: the warning must not repeat.
  queueViews([
    ghPr([], { mergeable: "UNKNOWN" }),
    ghPr([], { mergeable: "UNKNOWN" }),
    ghPr([], { mergeable: "UNKNOWN" }),
    ghPr([]),
  ]);
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    // Event-driven: the gate returns as soon as the 4th view reports MERGEABLE; the
    // generous timeout only bounds a broken run (each poll spawns a fake gh process).
    await merge({ gate: { allowNoChecks: true, timeoutMs: 60_000 } });
  } finally {
    console.warn = original;
  }
  assert.equal(viewCount(), 4);
  assert.equal(mergeCalls().length, 1);
  assert.equal(warnings.filter((w) => w.includes("with NO checks")).length, 1);
});

test("merge: no checks + requiredChecks refuses with 'never ran' even if allowNoChecks", async () => {
  queueViews([ghPr([])]);
  await assert.rejects(
    merge({ requiredChecks: ["build"], gate: { allowNoChecks: true, timeoutMs: 60 } }),
    /required check "build" never ran/,
  );
  assert.deepEqual(mergeCalls(), []);
});

test("merge: already merged PR does not call gh pr merge", async () => {
  queueViews([
    ghPr([], { state: "MERGED", mergedAt: "2026-10-03T00:00:00Z", mergeable: "UNKNOWN" }),
  ]);
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
    assert.match(e.message, /`statusCheckRollup` is missing or not a list/);
    return true;
  });
  assert.equal(viewCount(), 1);
  assert.deepEqual(mergeCalls(), []);
});

for (const [label, value] of [
  ["missing", undefined],
  ["null", null],
  ["empty", ""],
]) {
  test(`merge: gh headRefOid ${label} fails closed (never merges unpinned)`, async () => {
    const pr = ghPr([checkRun("build", "COMPLETED", "SUCCESS")]);
    if (value === undefined) delete pr.headRefOid;
    else pr.headRefOid = value;
    queueViews([pr]);
    await assert.rejects(merge(), /`headRefOid` is missing or empty/);
    assert.deepEqual(mergeCalls(), []);
  });
}

test("merge: gh mergeable null fails closed", async () => {
  queueViews([ghPr([checkRun("build", "COMPLETED", "SUCCESS")], { mergeable: null })]);
  await assert.rejects(merge(), /`mergeable` is missing or empty/);
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
    ...extra,
    gate: { ...FAST, ...(extra.gate ?? {}) },
  });
}

const GL_MERGE = ["mr", "merge", "9", "--auto-merge=false", "--sha", "def456", "--squash"];

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

test("gitlab: running then success merges immediately, pinned with --sha", async () => {
  queueViews([
    glMr("running", { detailed_merge_status: "ci_still_running" }),
    glMr("success"),
  ]);
  await mergeGitLab();
  assert.deepEqual(mergeCalls(), [GL_MERGE]);
});

test("gitlab: 405 re-runs the gate and retries with the same flags (still --auto-merge=false)", async () => {
  queueViews([glMr("success")]);
  failNextMerges(1);
  await mergeGitLab();
  assert.deepEqual(mergeCalls(), [GL_MERGE, GL_MERGE]);
  assert.equal(viewCount(), 2);
});

test("gitlab: 405 twice propagates the error (no auto-merge fallback)", async () => {
  queueViews([glMr("success")]);
  failNextMerges(2);
  await assert.rejects(mergeGitLab(), /405/);
  assert.deepEqual(mergeCalls(), [GL_MERGE, GL_MERGE]);
});

test("gitlab: missing sha fails closed", async () => {
  queueViews([glMr("success", { sha: null })]);
  await assert.rejects(mergeGitLab(), /`sha` is missing or empty/);
  assert.deepEqual(mergeCalls(), []);
});

test("gitlab: no pipeline refuses by default, merges with allowNoChecks", async () => {
  queueViews([glMr(null)]);
  await assert.rejects(mergeGitLab(), /reports no checks/);
  assert.deepEqual(mergeCalls(), []);
  await mergeGitLab({ gate: { allowNoChecks: true } });
  assert.deepEqual(mergeCalls(), [GL_MERGE]);
});

// ---------------------------------------------------------------------------
// CLI: config errors and release dry-run
// ---------------------------------------------------------------------------

function projectWithMerge(merge) {
  const dir = mkdtempSync(join(tmpdir(), "vibeops-cli-"));
  writeFileSync(
    join(dir, ".vibeops.json"),
    JSON.stringify({
      name: "x",
      vibeopsVersion: "2.6.0",
      schemaVersion: 1,
      createdAt: "2026-10-03T00:00:00Z",
      clients: ["cursor"],
      git: {
        remote: "origin",
        host: "github",
        integrationBranch: "develop",
        productionBranch: "main",
      },
      ...(merge === undefined ? {} : { merge }),
    }),
  );
  return dir;
}

function runCli(args) {
  try {
    const stdout = execFileSync("node", [join(repoRoot, "dist/cli.js"), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("cli: task release --dry-run shows releaseRequiredChecks", () => {
  const dir = projectWithMerge({ releaseRequiredChecks: ["release smoke", "lint*"] });
  const r = runCli(["task", "release", "--dry-run", "--cwd", dir]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /required checks: release smoke, lint\*/);
});

test("cli: invalid merge config makes task merge / release exit 1 naming the key", () => {
  const dir = projectWithMerge({ requiredCheck: ["build"] });
  for (const cmd of [
    ["task", "merge"],
    ["task", "release"],
  ]) {
    const r = runCli([...cmd, "--dry-run", "--cwd", dir]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /unknown key `requiredCheck`/);
  }
});
