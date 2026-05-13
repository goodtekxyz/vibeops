import { join } from "node:path";

import { codexOAuthTextCompletion } from "./plan-codex-responses.js";
import { cursorAgentPrint, extractAgentAssistantText } from "./plan-llm-cursor-agent.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";
import { openAiChatCompletionText } from "./plan-llm-openai.js";
import type { PlanLlmProviderId } from "./plan-llm-types.js";
import { writeText } from "./filesystem.js";
import { bold, dim, log } from "./logger.js";
import { isGitRepository, runGit, gitCommit } from "./git.js";

const PLANNER_APPLY_SYSTEM = `You are executing the VibeOps **Planner Agent** step in this run.

The user message is the full planning prompt (role, ProjectBrief, output format, and file list). Follow it exactly: same doc files, same TASK template sections, same hard rules (docs only under docs/, no application code, no .vibeops edits).

Reply with normal markdown only. Include the **Plan Summary** bullets first, then one fenced code block per file.

For every file block:
- Use a fenced block (\`\`\`markdown ... \`\`\` or plain \`\`\` ... \`\`\`).
- The **first line inside the block** must be exactly: \`<!-- file: <repo-relative-path> -->\` with a path under \`docs/project/\` or \`docs/tasks/\` only.
- The remaining lines are the full file body.`;

export interface ParsedPlannerFile {
  readonly relativePath: string;
  readonly content: string;
}

const ALLOWED_PREFIXES = ["docs/project/", "docs/tasks/"] as const;

export function isSafePlannerRepoRelPath(p: string): boolean {
  const norm = p.replace(/\\/g, "/").trim().replace(/^\/+/, "");
  if (norm.includes("..")) return false;
  return ALLOWED_PREFIXES.some((pre) => norm.startsWith(pre));
}

/**
 * Extracts `<!-- file: path -->` fenced blocks from planner markdown output.
 */
export function parsePlannerFenceFiles(markdown: string): ParsedPlannerFile[] {
  const out: ParsedPlannerFile[] = [];
  const re = /```(?:[a-zA-Z0-9+-]*)?\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const inner = m[1]!.replace(/\r\n/g, "\n");
    const firstNl = inner.indexOf("\n");
    const firstLine = (firstNl >= 0 ? inner.slice(0, firstNl) : inner).trim();
    const body = firstNl >= 0 ? inner.slice(firstNl + 1) : "";
    const dm = /^\s*<!--\s*file:\s*(.+?)\s*-->\s*$/i.exec(firstLine);
    if (!dm) continue;
    const relPath = dm[1]!.trim().replace(/\\/g, "/");
    if (!isSafePlannerRepoRelPath(relPath)) {
      log.warn(`Skipping disallowed planner path: ${relPath}`);
      continue;
    }
    out.push({ relativePath: relPath, content: body });
  }
  return out;
}

function dedupeByPath(files: readonly ParsedPlannerFile[]): ParsedPlannerFile[] {
  const map = new Map<string, ParsedPlannerFile>();
  for (const f of files) {
    if (map.has(f.relativePath)) {
      log.warn(`Duplicate planner path in model output (using last): ${f.relativePath}`);
    }
    map.set(f.relativePath, f);
  }
  return [...map.values()];
}

export async function runPlannerApplyMarkdown(params: {
  readonly cwd: string;
  readonly planPromptMarkdown: string;
  readonly provider: PlanLlmProviderId;
  readonly model?: string;
}): Promise<string> {
  const { cwd, planPromptMarkdown, provider, model } = params;
  if (provider === "openai") {
    const messages: OpenAiChatMessage[] = [
      { role: "system", content: PLANNER_APPLY_SYSTEM },
      { role: "user", content: planPromptMarkdown },
    ];
    return openAiChatCompletionText({ messages, model });
  }
  if (provider === "codex-oauth") {
    const messages: OpenAiChatMessage[] = [
      { role: "system", content: PLANNER_APPLY_SYSTEM },
      { role: "user", content: planPromptMarkdown },
    ];
    return codexOAuthTextCompletion(messages, model !== undefined ? { model } : undefined);
  }
  const prompt = `${PLANNER_APPLY_SYSTEM}\n\n--- Planning prompt ---\n${planPromptMarkdown}`;
  const raw = await cursorAgentPrint({ cwd, prompt, model });
  return extractAgentAssistantText(raw);
}

export async function writePlannerFiles(
  cwd: string,
  files: readonly ParsedPlannerFile[],
): Promise<string[]> {
  const written: string[] = [];
  for (const f of files) {
    const abs = join(cwd, f.relativePath);
    await writeText(abs, f.content);
    written.push(f.relativePath);
  }
  return written;
}

export async function commitPlannerGit(
  cwd: string,
  repoRelativePaths: readonly string[],
  message: string,
): Promise<void> {
  if (!(await isGitRepository(cwd))) {
    log.warn("Not a Git repository — skipping commit.");
    return;
  }
  if (repoRelativePaths.length === 0) return;
  for (const p of repoRelativePaths) {
    await runGit(cwd, ["add", "--", p]);
  }
  await gitCommit(cwd, message);
}

export async function pushPlannerGit(cwd: string): Promise<void> {
  if (!(await isGitRepository(cwd))) {
    log.warn("Not a Git repository — skipping push.");
    return;
  }
  await runGit(cwd, ["push"]);
}

export interface ApplyPlannerMarkdownResult {
  readonly rawMarkdown: string;
  readonly files: ParsedPlannerFile[];
  readonly writtenRelativePaths: string[];
}

export async function applyPlannerMarkdownFlow(params: {
  readonly cwd: string;
  readonly planPromptMarkdown: string;
  readonly provider: PlanLlmProviderId;
  readonly model?: string;
  readonly dryRun: boolean;
}): Promise<ApplyPlannerMarkdownResult> {
  log.blank();
  log.step(bold("Planner apply — calling LLM with the planning prompt"));
  log.info(dim(`  provider: ${params.provider}${params.model ? `  model: ${params.model}` : ""}`));
  const rawMarkdown = await runPlannerApplyMarkdown(params);
  const files = dedupeByPath(parsePlannerFenceFiles(rawMarkdown));
  if (files.length === 0) {
    throw new Error(
      "Planner apply: model output contained no usable <!-- file: ... --> fenced blocks under docs/project/ or docs/tasks/.",
    );
  }
  if (params.dryRun) {
    log.blank();
    log.info(bold("[dry-run] Would write:"));
    for (const f of files) {
      log.info(`  · ${f.relativePath} (${f.content.length} chars)`);
    }
    return { rawMarkdown, files, writtenRelativePaths: [] };
  }
  const writtenRelativePaths = await writePlannerFiles(params.cwd, files);
  log.blank();
  log.ok(`Wrote ${writtenRelativePaths.length} file(s) under docs/`);
  for (const p of writtenRelativePaths) {
    log.info(dim(`  · ${p}`));
  }
  return { rawMarkdown, files, writtenRelativePaths };
}
