import { llmCompleteJson } from "./llm-complete.js";
import { taskScopedCommitMessage } from "./task-git-commit.js";
import type { LlmProviderPreference } from "../types/config.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";

export interface TaskPrLlmInput {
  readonly taskId: string;
  readonly title: string;
  readonly taskBody: string;
  readonly diffSummary: string;
  readonly baseBranch: string;
  readonly headBranch: string;
}

export interface TaskPrLlmResult {
  readonly prTitle: string;
  readonly prBody: string;
}

const SYSTEM = `You write pull/merge request titles and bodies for a software task.
Output valid JSON only: { "title": string, "body": string }.
Title: Conventional Commits format — type(task-nnn): lowercase subject (under 72 chars total).
Use task id as scope in lowercase (e.g. feat(task-013): ship public status page).
Allowed types: feat, fix, docs, chore, perf, ci, refactor, test, build, style, revert.
Body: markdown with Summary, Changes, Test plan sections. Facts only from the input.`;

/** Normalize PR titles to Conventional Commits with the TASK id as scope. */
export function normalizeTaskPrTitle(taskId: string, rawTitle: string): string {
  const trimmed = rawTitle.trim().replace(/\s+/g, " ");
  const withoutTaskPrefix = trimmed.replace(/^TASK-\d+\s*[:\-]\s*/i, "").trim();
  return taskScopedCommitMessage(
    taskId,
    withoutTaskPrefix || trimmed,
  ).slice(0, 72);
}

export async function generateTaskPrWithLlm(
  input: TaskPrLlmInput,
  cwd: string,
  preference: LlmProviderPreference,
): Promise<TaskPrLlmResult | null> {
  const user = [
    `Task: ${input.taskId}`,
    `Title: ${input.title}`,
    `Base branch: ${input.baseBranch}`,
    `Head branch: ${input.headBranch}`,
    "",
    "## TASK",
    input.taskBody.slice(0, 12000),
    "",
    "## Diff summary",
    input.diffSummary.slice(0, 8000) || "(no diff captured)",
  ].join("\n");

  const messages: OpenAiChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];

  try {
    const { text: raw } = await llmCompleteJson(messages, { cwd, preference });
    const parsed = JSON.parse(raw) as { title?: string; body?: string };
    const prTitle = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const prBody = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (!prTitle || !prBody) return null;
    return {
      prTitle: normalizeTaskPrTitle(input.taskId, prTitle),
      prBody,
    };
  } catch {
    return null;
  }
}

export function fallbackTaskPr(input: TaskPrLlmInput): TaskPrLlmResult {
  const prTitle = normalizeTaskPrTitle(input.taskId, input.title);
  const prBody = [
    "## Summary",
    input.title,
    "",
    "## Changes",
    input.diffSummary || "(see commits on branch)",
    "",
    "## Test plan",
    "- [ ] Run project test/lint commands",
    "- [ ] Review TASK acceptance criteria",
  ].join("\n");
  return { prTitle, prBody };
}
