import { join, relative } from "node:path";

import { readTextOrNull } from "./filesystem.js";
import { llmCompleteJson } from "./llm-complete.js";
import { bold, dim, log } from "./logger.js";
import { askInput, askSelect, yesNoSelect } from "./inquirer-helpers.js";
import { pickPlanLlmProvider } from "./plan-llm-session.js";
import { extractJsonObject } from "./plan-llm-openai.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";
import type { PlanLlmProviderId } from "./plan-llm-types.js";
import { projectPaths } from "./paths.js";
import { slugify } from "./slug.js";
import { buildTaskBuildPrompt } from "./task-add-build-prompt.js";
import { statusDisplay } from "./task.js";
import type { TaskMeta } from "../types/task.js";

const MAX_PLAN_TURNS = 36;

const REQUIRED_SECTIONS = [
  "Status",
  "MVP Phase",
  "Goal",
  "Background",
  "Scope",
  "Out of Scope",
  "Acceptance Criteria",
  "Files to Inspect First",
  "Expected Files to Change",
  "Risks",
  "Test Plan",
  "Rollback Plan",
  "Implementation Plan",
  "Result",
  "Test Result",
] as const;

export interface QuickTaskLlmResult {
  readonly title: string;
  readonly slug: string;
  readonly markdown: string;
  readonly provider: PlanLlmProviderId;
}

export interface TaskPlanLlmResult {
  readonly markdown: string;
  readonly buildPromptMarkdown: string;
  readonly provider: PlanLlmProviderId;
}

type TaskPlanTurn =
  | {
      turn: "question";
      message: string;
      inputKind: "text" | "select" | "confirm";
      options?: string[];
    }
  | {
      turn: "done";
      taskMarkdown: string;
      buildPromptMarkdown: string;
    };

function parseTaskPlanTurn(jsonText: string): TaskPlanTurn {
  const raw = JSON.parse(jsonText) as Record<string, unknown>;
  const turn = raw.turn;
  if (turn === "done") {
    const taskMarkdown = typeof raw.taskMarkdown === "string" ? raw.taskMarkdown.trim() : "";
    const buildPromptMarkdown =
      typeof raw.buildPromptMarkdown === "string" ? raw.buildPromptMarkdown.trim() : "";
    if (taskMarkdown.length === 0) {
      throw new Error('Invalid JSON: "done" needs non-empty "taskMarkdown".');
    }
    if (buildPromptMarkdown.length === 0) {
      throw new Error('Invalid JSON: "done" needs non-empty "buildPromptMarkdown".');
    }
    return { turn: "done", taskMarkdown, buildPromptMarkdown };
  }
  if (turn === "question") {
    const message = typeof raw.message === "string" ? raw.message.trim() : "";
    if (message.length === 0) throw new Error('Invalid JSON: "question" needs "message".');
    const kindRaw = typeof raw.inputKind === "string" ? raw.inputKind : "text";
    const inputKind =
      kindRaw === "select" || kindRaw === "confirm" ? kindRaw : ("text" as const);
    const options = Array.isArray(raw.options)
      ? raw.options.filter((x): x is string => typeof x === "string")
      : undefined;
    return { turn: "question", message, inputKind, options };
  }
  throw new Error('LLM JSON must use turn "question" or "done".');
}

async function readSnippet(absPath: string, maxChars: number): Promise<string | null> {
  const text = await readTextOrNull(absPath);
  if (text === null) return null;
  const t = text.trim();
  return t.length <= maxChars ? t : `${t.slice(0, maxChars)}\n…`;
}

export async function loadTaskAddProjectContext(cwd: string): Promise<string> {
  const paths = projectPaths(cwd);
  const chunks: string[] = [];
  const candidates = [
    join(paths.docsProject, "05-current-state.md"),
    join(paths.docsProject, "03-current-state.md"),
    join(paths.docsProject, "02-mvp-scope.md"),
    join(paths.docsProject, "03-architecture.md"),
    join(paths.docsProject, "04-tech-stack.md"),
    join(paths.docsProject, "06-decisions.md"),
  ];
  for (const p of candidates) {
    const snip = await readSnippet(p, 3500);
    if (snip) {
      chunks.push(`### ${relative(cwd, p)}\n\n${snip}`);
    }
  }
  return chunks.length > 0 ? chunks.join("\n\n") : "(no docs/project context files found)";
}

function quickTaskSystemPrompt(): string {
  return `You are a VibeOps TASK author. Respond with JSON only (no markdown fence).

Schema:
{
  "title": "short title without TASK- id prefix",
  "slug": "kebab-case-slug-max-60-chars-no-task-prefix",
  "markdown": "full TASK markdown file"
}

The markdown file must:
- Start with # TASK-NNN: title (use the exact TASK id provided)
- Include every section: ${REQUIRED_SECTIONS.join(", ")}
- Status body: ${statusDisplay("planned")}
- Result and Test Result: (not yet)
- Keep Scope and Acceptance Criteria minimal but valid — the human will edit heavily in Cursor
- Do not invent TASK numbers other than the one given`;
}

function taskPlanSystemPrompt(taskId: string, projectName: string): string {
  return `You are a VibeOps TASK planner. Interview the user, then produce a complete TASK and a Cursor build prompt.

Respond with JSON only (no markdown fence).

Turn "question":
{
  "turn": "question",
  "message": "…",
  "inputKind": "text" | "select" | "confirm",
  "options": ["…"]  // required for select; optional for confirm (Yes/No implied)
}

Turn "done":
{
  "turn": "done",
  "taskMarkdown": "full TASK file for ${taskId}",
  "buildPromptMarkdown": "markdown for Cursor — implement ${taskId} per the TASK"
}

taskMarkdown rules:
- # ${taskId}: … as first line
- All sections: ${REQUIRED_SECTIONS.join(", ")}
- Status: ${statusDisplay("planned")}; Result / Test Result: (not yet)
- Acceptance Criteria numbered and verifiable
- Align with docs/project; put out-of-MVP items in Out of Scope

buildPromptMarkdown rules:
- Standalone implementer brief for Cursor (like mvp-build.md)
- Reference the TASK path; list read-first docs; definition of done
- Project: ${projectName}

Ask enough questions to nail Scope, Acceptance Criteria, and Test Plan. Then finish with "done".`;
}

function parseQuickTaskJson(jsonText: string): Omit<QuickTaskLlmResult, "provider"> {
  const raw = JSON.parse(jsonText) as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const slug = typeof raw.slug === "string" ? slugify(raw.slug, "task") : "";
  const markdown = typeof raw.markdown === "string" ? raw.markdown.trim() : "";
  if (title.length === 0) throw new Error('LLM JSON missing "title".');
  if (markdown.length === 0) throw new Error('LLM JSON missing "markdown".');
  return { title, slug: slug.length > 0 ? slug : slugify(title), markdown };
}

export function normalizeTaskMarkdownHeader(markdown: string, taskId: string, title: string): string {
  const lines = markdown.split("\n");
  const header = `# ${taskId}: ${title}`;
  if (lines.length > 0 && /^#\s+/.test(lines[0]!)) {
    lines[0] = header;
    return lines.join("\n");
  }
  return `${header}\n\n${markdown}`;
}

export function ensureTaskSections(markdown: string): string {
  let body = markdown;
  for (const section of REQUIRED_SECTIONS) {
    const re = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
    if (!re.test(body)) {
      body = `${body.trimEnd()}\n\n## ${section}\n\n(not yet)\n`;
    }
  }
  return body;
}

async function collectTaskPlanAnswer(
  q: Extract<TaskPlanTurn, { turn: "question" }>,
): Promise<string> {
  if (q.inputKind === "confirm") {
    const yes = await yesNoSelect({ message: q.message, defaultValue: true });
    return yes ? "Yes" : "No";
  }
  if (q.inputKind === "select" && q.options && q.options.length > 0) {
    return await askSelect({
      message: q.message,
      nonInteractive: false,
      choices: q.options,
      default: q.options[0],
    });
  }
  return await askInput({ message: q.message, nonInteractive: false, required: true });
}

export async function llmGenerateQuickTask(params: {
  readonly cwd: string;
  readonly taskId: string;
  readonly idea: string;
  readonly latestDone?: TaskMeta | null;
}): Promise<QuickTaskLlmResult | null> {
  const provider = await pickPlanLlmProvider(params.cwd, undefined, { interactiveLogin: false });
  if (provider === null) return null;

  const context = await loadTaskAddProjectContext(params.cwd);
  const latest =
    params.latestDone !== undefined && params.latestDone !== null
      ? `Latest done TASK: ${params.latestDone.id} — ${params.latestDone.title}`
      : "";

  const messages: OpenAiChatMessage[] = [
    { role: "system", content: quickTaskSystemPrompt() },
    {
      role: "user",
      content: [
        `TASK id: ${params.taskId}`,
        `User intent: ${params.idea}`,
        latest,
        "",
        "Project context:",
        context,
      ]
        .filter((l) => l.length > 0)
        .join("\n"),
    },
  ];

  const { text: raw, provider: used } = await llmCompleteJson(messages, { cwd: params.cwd, provider });
  const parsed = parseQuickTaskJson(extractJsonObject(raw));
  const title = parsed.title.replace(/^TASK-\d+\s*[·:\-]\s*/i, "").trim() || parsed.title;
  const markdown = ensureTaskSections(
    normalizeTaskMarkdownHeader(parsed.markdown, params.taskId, title),
  );
  return {
    title,
    slug: parsed.slug,
    markdown,
    provider: used,
  };
}

export async function gatherTaskPlanViaLlm(params: {
  readonly cwd: string;
  readonly taskId: string;
  readonly projectName: string;
  readonly seedIdea?: string;
}): Promise<TaskPlanLlmResult | null> {
  const provider = await pickPlanLlmProvider(params.cwd, undefined, { interactiveLogin: true });
  if (provider === null) return null;

  const context = await loadTaskAddProjectContext(params.cwd);
  const messages: OpenAiChatMessage[] = [
    { role: "system", content: taskPlanSystemPrompt(params.taskId, params.projectName) },
    {
      role: "user",
      content: [
        `TASK id: ${params.taskId}`,
        params.seedIdea ? `Initial idea: ${params.seedIdea}` : "Ask what the user wants to build.",
        "",
        "Project context:",
        context,
        "",
        "Begin with your first question JSON.",
      ].join("\n"),
    },
  ];

  let lastQ = "";
  for (let step = 0; step < MAX_PLAN_TURNS; step++) {
    const { text: raw, provider: used } = await llmCompleteJson(messages, {
      cwd: params.cwd,
      provider,
    });
    const parsed = parseTaskPlanTurn(extractJsonObject(raw));
    if (parsed.turn === "done") {
      const titleMatch = /^#\s+TASK-\d+:\s*(.+)$/m.exec(parsed.taskMarkdown);
      const title = titleMatch?.[1]?.trim() ?? params.taskId;
      const markdown = ensureTaskSections(
        normalizeTaskMarkdownHeader(parsed.taskMarkdown, params.taskId, title),
      );
      return {
        markdown,
        buildPromptMarkdown: parsed.buildPromptMarkdown,
        provider: used,
      };
    }

    log.blank();
    log.info(dim(`Planning ${params.taskId} — question ${step + 1}`));
    log.info(bold(parsed.message));
    log.blank();

    const answer = await collectTaskPlanAnswer(parsed);
    lastQ = parsed.message;
    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `Previous Q: ${lastQ}\nUser answer: ${answer}\n\nContinue with next JSON (question or done).`,
    });
  }

  throw new Error(`Task planning stopped after ${MAX_PLAN_TURNS} turns — try a shorter scope or run again.`);
}

export function defaultBuildPromptForTask(
  projectName: string,
  taskId: string,
  taskRelativePath: string,
): string {
  return buildTaskBuildPrompt({ projectName, taskId, taskRelativePath });
}
