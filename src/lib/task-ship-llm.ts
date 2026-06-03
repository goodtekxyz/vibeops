import { join } from "node:path";

import { readText, readTextOrNull, writeText } from "./filesystem.js";
import { readConfig } from "./config.js";
import { llmCompleteJson } from "./llm-complete.js";
import { getLlmPreferenceFromConfig } from "./llm-preference.js";
import { gitDiffNameOnly, readGitInfo } from "./git.js";
import { projectPaths, PROJECT_MEMORY_FILES } from "./paths.js";
import { extractJsonObject } from "./plan-llm-openai.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";
import type { PlanLlmProviderId } from "./plan-llm-types.js";
import { readSection, updateTaskSection } from "./task.js";

export interface TaskShipLlmPatch {
  readonly result: string;
  readonly testResult: string;
  readonly currentStateMarkdown: string | null;
  readonly decisionsAppend: string | null;
  readonly architectureUpdate: string | null;
  readonly logLine: string;
  readonly provider: PlanLlmProviderId;
}

export interface ApplyMemoryResult {
  readonly updated: string[];
  readonly skipped: string[];
}

function localDateFilename(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}.md`;
}

async function readOptional(path: string): Promise<string | null> {
  return readTextOrNull(path);
}

export async function llmCompleteTaskShip(params: {
  readonly cwd: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly taskBody: string;
  readonly taskFileRel: string;
}): Promise<TaskShipLlmPatch | null> {
  const git = await readGitInfo(params.cwd);
  let diffSummary = "";
  if (git.isRepo) {
    const names = await gitDiffNameOnly(params.cwd);
    diffSummary = names.slice(0, 40).join("\n") || "(no diff vs HEAD index yet)";
  }

  const paths = projectPaths(params.cwd);
  const currentState = (await readOptional(join(paths.root, PROJECT_MEMORY_FILES.currentState))) ?? "";
  const architecture = (await readOptional(join(paths.root, PROJECT_MEMORY_FILES.architecture))) ?? "";
  const decisions = (await readOptional(join(paths.root, PROJECT_MEMORY_FILES.decisions))) ?? "";

  const messages: OpenAiChatMessage[] = [
    {
      role: "system",
      content: `You ship a VibeOps TASK for review. Reply with JSON only:
{
  "result": "markdown for TASK Result section — facts, paths, commands",
  "testResult": "markdown for Test Result — commands and outcomes",
  "currentStateMarkdown": "full replacement for docs/project/05-current-state.md OR null to skip",
  "decisionsAppend": "markdown bullets to append under ## Decisions in 06-decisions.md OR null",
  "architectureUpdate": "full replacement for 03-architecture.md OR null if structure unchanged",
  "logLine": "one line for docs/logs/YYYY-MM-DD.md"
}
Be factual. Do not invent files not in the diff.`,
    },
    {
      role: "user",
      content: [
        `TASK: ${params.taskId} — ${params.taskTitle}`,
        `File: ${params.taskFileRel}`,
        "",
        "TASK body:",
        params.taskBody.slice(0, 8000),
        "",
        "Changed paths (git):",
        diffSummary,
        "",
        "Current 05-current-state.md:",
        currentState.slice(0, 4000),
        "",
        "Current 03-architecture.md:",
        architecture.slice(0, 4000),
        "",
        "Current 06-decisions.md:",
        decisions.slice(0, 2000),
      ].join("\n"),
    },
  ];

  try {
    const config = await readConfig(params.cwd);
    const preference = getLlmPreferenceFromConfig(config);
    const { text: raw, provider } = await llmCompleteJson(messages, {
      cwd: params.cwd,
      preference,
    });
    const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
    const result = typeof parsed.result === "string" ? parsed.result.trim() : "";
    const testResult = typeof parsed.testResult === "string" ? parsed.testResult.trim() : "";
    if (result.length === 0 || testResult.length === 0) return null;
    return {
      result,
      testResult,
      currentStateMarkdown:
        typeof parsed.currentStateMarkdown === "string" && parsed.currentStateMarkdown.trim().length > 0
          ? parsed.currentStateMarkdown.trim()
          : null,
      decisionsAppend:
        typeof parsed.decisionsAppend === "string" && parsed.decisionsAppend.trim().length > 0
          ? parsed.decisionsAppend.trim()
          : null,
      architectureUpdate:
        typeof parsed.architectureUpdate === "string" && parsed.architectureUpdate.trim().length > 0
          ? parsed.architectureUpdate.trim()
          : null,
      logLine:
        typeof parsed.logLine === "string" && parsed.logLine.trim().length > 0
          ? parsed.logLine.trim()
          : `${params.taskId} shipped for review.`,
      provider,
    };
  } catch {
    return null;
  }
}

export async function applyTaskShipMemory(
  cwd: string,
  patch: TaskShipLlmPatch,
): Promise<ApplyMemoryResult> {
  const paths = projectPaths(cwd);
  const updated: string[] = [];
  const skipped: string[] = [];

  if (patch.currentStateMarkdown) {
    const p = join(paths.root, PROJECT_MEMORY_FILES.currentState);
    await writeText(p, `${patch.currentStateMarkdown.trimEnd()}\n`);
    updated.push(PROJECT_MEMORY_FILES.currentState);
  } else {
    skipped.push(PROJECT_MEMORY_FILES.currentState);
  }

  if (patch.architectureUpdate) {
    const p = join(paths.root, PROJECT_MEMORY_FILES.architecture);
    await writeText(p, `${patch.architectureUpdate.trimEnd()}\n`);
    updated.push(PROJECT_MEMORY_FILES.architecture);
  } else {
    skipped.push(PROJECT_MEMORY_FILES.architecture);
  }

  if (patch.decisionsAppend) {
    const p = join(paths.root, PROJECT_MEMORY_FILES.decisions);
    const existing = (await readOptional(p)) ?? "# Decisions\n\n";
    const next = `${existing.trimEnd()}\n\n${patch.decisionsAppend.trim()}\n`;
    await writeText(p, next);
    updated.push(PROJECT_MEMORY_FILES.decisions);
  } else {
    skipped.push(PROJECT_MEMORY_FILES.decisions);
  }

  const logPath = join(paths.docsLogs, localDateFilename());
  const logExisting = (await readOptional(logPath)) ?? `# ${localDateFilename().replace(".md", "")}\n\n`;
  await writeText(logPath, `${logExisting.trimEnd()}\n\n- ${patch.logLine}\n`);
  updated.push(relativeLogPath(logPath, paths.root));

  return { updated, skipped };
}

function relativeLogPath(abs: string, root: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export async function writeTaskResultSections(
  taskFile: string,
  result: string,
  testResult: string,
): Promise<void> {
  await updateTaskSection(taskFile, "Result", result);
  await updateTaskSection(taskFile, "Test Result", testResult);
}

export async function fallbackResultSections(
  cwd: string,
  taskId: string,
  taskFile: string,
): Promise<{ result: string; testResult: string }> {
  const names = await gitDiffNameOnly(cwd);
  const body = await readText(taskFile);
  const goal = readSection(body, "Goal").slice(0, 200);
  const result = [
    `Shipped ${taskId} for review.`,
    goal.length > 0 ? `Goal: ${goal}` : "",
    names.length > 0 ? `Paths: ${names.slice(0, 15).join(", ")}` : "",
  ]
    .filter((l) => l.length > 0)
    .join("\n");
  const testResult = names.length > 0 ? `Changed: ${names.join(", ")}` : "Manual verification required.";
  return { result, testResult };
}
