import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { isDirectory, pathExists, readText, readTextOrNull, writeText } from "./filesystem.js";
import { runGit } from "./git.js";
import { llmCompleteJson, llmCompleteText, resolveAvailableLlmProvider } from "./llm-complete.js";
import { cyan, dim, log } from "./logger.js";
import type { PlanLlmProviderId } from "./plan-llm-types.js";
import { summarizeTaskDiff } from "./mvp-diff-summary.js";
import {
  findAcceptanceCriteria,
  hasNonEmptySection,
  readGitContext,
  readSection,
  updateTaskSection,
} from "./task.js";

export const LAST_DONE_SUMMARY_REL = ".vibeops/generated/last-done-summary.md";
export const DONE_SUMMARIES_DIR = ".vibeops/generated/done-summaries";

const MAX_PATCH_CHARS = 48_000;

export interface WriteDoneSummaryInput {
  readonly cwd: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly taskFile: string;
  readonly dryRun?: boolean;
  /** Overwrite non-placeholder Result / Test Result (default: fill placeholders only). */
  readonly refreshTaskSections?: boolean;
  readonly skipTaskAutoFill?: boolean;
}

export interface DoneSummaryBundle {
  readonly markdown: string;
  readonly resultSection: string;
  readonly testResultSection: string;
}

export interface WriteDoneSummaryResult extends DoneSummaryBundle {
  readonly lastPath: string;
  readonly archivePath: string;
  readonly taskSectionsUpdated: boolean;
}

function rel(cwd: string, abs: string): string {
  const r = relative(cwd, abs);
  return r.length === 0 ? "." : r.startsWith("..") ? abs : r;
}

async function gitNameStatus(cwd: string, range: string): Promise<string> {
  try {
    const res = await runGit(cwd, ["diff", "--name-status", range]);
    const body = res.stdout.trim();
    return body.length > 0 ? body : "(no changed files in range)";
  } catch {
    return "(could not read name-status)";
  }
}

async function gitPatchExcerpt(cwd: string, range: string): Promise<string> {
  try {
    const res = await runGit(cwd, ["diff", "--no-color", range]);
    let patch = res.stdout;
    if (patch.length > MAX_PATCH_CHARS) {
      patch =
        patch.slice(0, MAX_PATCH_CHARS) +
        `\n\n… (patch truncated at ${MAX_PATCH_CHARS} characters)\n`;
    }
    return patch.length > 0 ? patch : "(empty patch)";
  } catch {
    return "(could not read patch)";
  }
}

async function llmTaskSections(
  cwd: string,
  inputs: {
    readonly taskId: string;
    readonly taskTitle: string;
    readonly gitBlock: string;
    readonly nameStatus: string;
    readonly acceptanceCriteria: readonly string[];
    readonly testPlan: string;
  },
): Promise<{ result: string; testResult: string; provider: PlanLlmProviderId } | null> {
  try {
    const { text: raw, provider } = await llmCompleteJson(
      [
        {
          role: "system",
          content:
            "You complete a TASK file after implementation. Reply JSON only: result (markdown, what shipped + key paths), testResult (markdown, commands run and outcomes). Be factual; use bullet lists.",
        },
        {
          role: "user",
          content: [
            `TASK: ${inputs.taskId} — ${inputs.taskTitle}`,
            "",
            "## Acceptance criteria",
            inputs.acceptanceCriteria.length > 0
              ? inputs.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")
              : "(none listed)",
            "",
            "## Test plan (from TASK)",
            inputs.testPlan.length > 0 ? inputs.testPlan : "(none listed)",
            "",
            "## Git",
            inputs.gitBlock,
            "",
            "## Files changed",
            "```\n" + inputs.nameStatus + "\n```",
          ].join("\n"),
        },
      ],
      { cwd },
    );
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result = String(parsed.result ?? "").trim();
    const testResult = String(parsed.testResult ?? "").trim();
    if (result.length === 0 || testResult.length === 0) return null;
    return { result, testResult, provider };
  } catch {
    return null;
  }
}

async function llmChangeNarrative(
  cwd: string,
  inputs: {
    readonly taskId: string;
    readonly taskTitle: string;
    readonly result: string;
    readonly testResult: string;
    readonly gitBlock: string;
    readonly nameStatus: string;
  },
): Promise<string | null> {
  try {
    const { text } = await llmCompleteText(
      [
        {
          role: "system",
          content:
            "You summarize a completed software TASK for the next iteration. Write concise markdown: ## What shipped (bullets), ## Key files, ## Notes for next TASK. No fluff.",
        },
        {
          role: "user",
          content: [
            `TASK: ${inputs.taskId} — ${inputs.taskTitle}`,
            "",
            "## Result",
            inputs.result,
            "",
            "## Test Result",
            inputs.testResult,
            "",
            inputs.gitBlock,
            "",
            "## Files changed",
            "```\n" + inputs.nameStatus + "\n```",
          ].join("\n"),
        },
      ],
      { cwd },
    );
    return text;
  } catch {
    return null;
  }
}

function fallbackTaskSections(inputs: {
  readonly completedAt: string;
  readonly gitBlock: string;
  readonly nameStatus: string;
  readonly acceptanceCriteria: readonly string[];
}): { result: string; testResult: string } {
  const criteriaLines =
    inputs.acceptanceCriteria.length > 0
      ? inputs.acceptanceCriteria.map((c, i) => `- [ ] ${i + 1}. ${c}`).join("\n")
      : "- [ ] Review Acceptance Criteria in the TASK file.";

  const result = [
    `_Auto-generated by vibeops done at ${inputs.completedAt}._`,
    "",
    "## What changed",
    "",
    inputs.gitBlock,
    "",
    "## Files touched",
    "",
    "```",
    inputs.nameStatus,
    "```",
  ].join("\n");

  const testResult = [
    `_Auto-generated by vibeops done at ${inputs.completedAt}._`,
    "",
    "Run your project verification commands (for example `pnpm test`, `pnpm lint`) and update this section if anything differs.",
    "",
    "## Acceptance criteria checklist",
    "",
    criteriaLines,
  ].join("\n");

  return { result, testResult };
}

function archiveFileName(taskId: string): string {
  const safe = taskId.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safe}-${stamp}.md`;
}

export async function buildDoneSummaryBundle(
  input: WriteDoneSummaryInput,
): Promise<DoneSummaryBundle> {
  const ctx = await readGitContext(input.taskFile);
  const body = await readText(input.taskFile);
  const existingResult = readSection(body, "Result");
  const existingTest = readSection(body, "Test Result");
  const acceptanceCriteria = findAcceptanceCriteria(body);
  const testPlan = readSection(body, "Test Plan");
  const completedAt = new Date().toISOString();

  const gitBlock =
    (await summarizeTaskDiff(input.cwd, input.taskFile)) ??
    "_No Git Context on TASK file — run `vibeops start` before the next done._";

  const range =
    ctx !== null && ctx.baseCommit.length > 0 ? `${ctx.baseCommit}..HEAD` : null;
  const nameStatus =
    range !== null ? await gitNameStatus(input.cwd, range) : "(no git range)";
  const patch = range !== null ? await gitPatchExcerpt(input.cwd, range) : "(no git range)";

  const llmProvider = await resolveAvailableLlmProvider(input.cwd);
  let llmProviderUsed: PlanLlmProviderId | null = null;

  const llmSections = await llmTaskSections(input.cwd, {
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    gitBlock,
    nameStatus,
    acceptanceCriteria,
    testPlan,
  });

  let resultSection: string;
  let testResultSection: string;
  if (llmSections !== null) {
    resultSection = llmSections.result;
    testResultSection = llmSections.testResult;
    llmProviderUsed = llmSections.provider;
  } else {
    const fallback = fallbackTaskSections({
      completedAt,
      gitBlock,
      nameStatus,
      acceptanceCriteria,
    });
    resultSection = fallback.result;
    testResultSection = fallback.testResult;
  }

  const narrative = await llmChangeNarrative(input.cwd, {
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    result: resultSection,
    testResult: testResultSection,
    gitBlock,
    nameStatus,
  });
  if (narrative !== null && llmProviderUsed === null && llmProvider !== null) {
    llmProviderUsed = llmProvider;
  }

  const lines: string[] = [
    `# Done summary · ${input.taskId}`,
    "",
    `- **Title:** ${input.taskTitle}`,
    `- **Completed at:** ${completedAt}`,
    `- **TASK file:** \`${rel(input.cwd, input.taskFile)}\``,
    ctx
      ? `- **Git range:** \`${ctx.baseCommit}..HEAD\` (\`${ctx.taskBranch}\` → \`${ctx.baseBranch}\`)`
      : "",
    "",
    "## Result (TASK)",
    "",
    input.skipTaskAutoFill === true && hasNonEmptySection(body, "Result")
      ? existingResult
      : resultSection,
    "",
    "## Test Result (TASK)",
    "",
    input.skipTaskAutoFill === true && hasNonEmptySection(body, "Test Result")
      ? existingTest
      : testResultSection,
    "",
    "## Git",
    "",
    gitBlock,
    "",
    "## Files changed",
    "",
    "```",
    nameStatus,
    "```",
    "",
  ];

  if (narrative !== null && narrative.trim().length > 0) {
    const via = llmProviderUsed ?? llmProvider;
    const viaLabel =
      via === "codex-oauth"
        ? "Codex OAuth"
        : via === "cursor-agent"
          ? "Cursor Agent CLI"
          : via === "openai"
            ? "OpenAI API"
            : "LLM";
    lines.push(`## Change summary (${viaLabel})`, "", narrative.trim(), "");
  } else {
    lines.push(
      "## Change summary (LLM)",
      "",
      "_(Connect Codex OAuth, Cursor Agent CLI, or OPENAI_API_KEY for a narrative; git + TASK sections above are always recorded.)_",
      "",
    );
  }

  lines.push(
    "## Patch excerpt",
    "",
    "```diff",
    patch,
    "```",
    "",
    "---",
    "",
    "_Used by `vibeops next` and the next `vibeops plan` as prior iteration context._",
  );

  return {
    markdown: lines.join("\n"),
    resultSection,
    testResultSection,
  };
}

export async function applyTaskDoneSections(
  taskFile: string,
  sections: { readonly result: string; readonly testResult: string },
  opts: { readonly dryRun?: boolean; readonly refresh?: boolean },
): Promise<boolean> {
  const body = await readText(taskFile);
  let updated = false;

  const writeResult = opts.refresh === true || !hasNonEmptySection(body, "Result");
  const writeTest = opts.refresh === true || !hasNonEmptySection(body, "Test Result");

  if (writeResult) {
    if (opts.dryRun === true) {
      log.info(dim("  dry-run: would update TASK → Result"));
    } else {
      await updateTaskSection(taskFile, "Result", sections.result);
      log.ok("TASK → Result (auto-filled)");
    }
    updated = true;
  }

  if (writeTest) {
    if (opts.dryRun === true) {
      log.info(dim("  dry-run: would update TASK → Test Result"));
    } else {
      await updateTaskSection(taskFile, "Test Result", sections.testResult);
      log.ok("TASK → Test Result (auto-filled)");
    }
    updated = true;
  }

  return updated;
}

/** Write summary files + auto-fill TASK Result / Test Result when empty. */
export async function writeDoneSummary(
  input: WriteDoneSummaryInput,
): Promise<WriteDoneSummaryResult> {
  const bundle = await buildDoneSummaryBundle(input);

  let taskSectionsUpdated = false;
  if (input.skipTaskAutoFill !== true) {
    taskSectionsUpdated = await applyTaskDoneSections(
      input.taskFile,
      { result: bundle.resultSection, testResult: bundle.testResultSection },
      { dryRun: input.dryRun, refresh: input.refreshTaskSections === true },
    );
  }

  const lastPath = join(input.cwd, LAST_DONE_SUMMARY_REL);
  const archivePath = join(input.cwd, DONE_SUMMARIES_DIR, archiveFileName(input.taskId));

  const provider = await resolveAvailableLlmProvider(input.cwd);
  if (provider !== null) {
    const label =
      provider === "codex-oauth"
        ? "Codex OAuth"
        : provider === "cursor-agent"
          ? "Cursor Agent CLI"
          : "OpenAI API";
    log.info(dim(`  LLM: ${label}`));
  } else {
    log.info(dim("  LLM: none (git-only TASK sections)"));
  }

  if (input.dryRun === true) {
    log.info(dim(`  dry-run: would write ${LAST_DONE_SUMMARY_REL} and archive under done-summaries/`));
    return { ...bundle, lastPath, archivePath, taskSectionsUpdated };
  }

  const archiveDir = join(input.cwd, DONE_SUMMARIES_DIR);
  if (!(await isDirectory(archiveDir))) {
    await mkdir(archiveDir, { recursive: true });
  }

  await writeText(lastPath, bundle.markdown);
  await writeText(archivePath, bundle.markdown);
  log.ok(`Wrote ${cyan(LAST_DONE_SUMMARY_REL)} (+ archive)`);

  return { ...bundle, lastPath, archivePath, taskSectionsUpdated };
}

export async function readLastDoneSummary(cwd: string): Promise<string | null> {
  const path = join(cwd, LAST_DONE_SUMMARY_REL);
  if (!(await pathExists(path))) return null;
  const text = await readTextOrNull(path);
  return text !== null && text.trim().length > 0 ? text : null;
}

export function excerptDoneSummary(full: string, maxLines = 40): string {
  const lines = full.split("\n");
  if (lines.length <= maxLines) return full;
  return [...lines.slice(0, maxLines), "", `… (${lines.length - maxLines} more lines in file)`].join(
    "\n",
  );
}

export function renderPriorIterationSection(priorSummary: string): string {
  return `## Previous iteration (from last \`vibeops done\`)

${priorSummary.trim()}

---
`;
}

/** @deprecated Use buildDoneSummaryBundle */
export async function buildDoneSummaryMarkdown(
  input: WriteDoneSummaryInput,
): Promise<string> {
  const bundle = await buildDoneSummaryBundle(input);
  return bundle.markdown;
}
