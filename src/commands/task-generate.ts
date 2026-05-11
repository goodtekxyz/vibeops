import { isAbsolute, join, relative, resolve } from "node:path";

import { pathExists, writeText } from "../lib/filesystem.js";
import { bold, cyan, dim, log, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import {
  collectInputDocs,
  type CollectedDocs,
  type DocSlot,
} from "../lib/project-docs.js";
import { formatTaskId, nextTaskNumber } from "../lib/task.js";
import {
  buildTaskGeneratePrompt,
  type BuildTaskGeneratePromptInputs,
} from "../lib/task-generator.js";
import {
  planScaffoldEntries,
  renderScaffoldMarkdown,
  writeScaffoldFiles,
  type ScaffoldEntry,
} from "../lib/task-scaffold.js";
import { VERSION } from "../version.js";

const DEFAULT_PROMPT_REL = ".vibeops/generated/task-generate-prompt.md";
const DEFAULT_COUNT = 8;
const COUNT_SOFT_CAP = 20;
const BRIEF_REL = ".vibeops/brief/project-brief.md";

export interface TaskGenerateOptions {
  from?: string;
  output?: string;
  count?: number | string;
  phase?: string;
  scaffold?: boolean;
  dryRun?: boolean;
  cwd?: string;
}

function toAbsolute(root: string, candidate: string): string {
  return isAbsolute(candidate) ? candidate : resolve(root, candidate);
}

function relDisplay(root: string, abs: string): string {
  const r = relative(root, abs);
  return r.length === 0 ? "." : r;
}

function parseCount(raw: TaskGenerateOptions["count"]): {
  count: number;
  warning: boolean;
  error?: string;
} {
  if (raw === undefined) return { count: DEFAULT_COUNT, warning: false };
  const n =
    typeof raw === "number" ? raw : Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n <= 0) {
    return {
      count: DEFAULT_COUNT,
      warning: false,
      error: `--count must be a positive integer (got: "${String(raw)}"). Falling back to default ${DEFAULT_COUNT}.`,
    };
  }
  return { count: Math.floor(n), warning: n > COUNT_SOFT_CAP };
}

function presentInventory(docs: CollectedDocs): { present: DocSlot[]; missing: DocSlot[] } {
  const present: DocSlot[] = [];
  const missing: DocSlot[] = [];
  if (docs.from) (docs.from.content !== null ? present : missing).push(docs.from);
  for (const slot of docs.slots) (slot.content !== null ? present : missing).push(slot);
  if (docs.brief.content !== null) present.push(docs.brief);
  else missing.push(docs.brief);
  return { present, missing };
}

export async function taskGenerateCommand(
  options: TaskGenerateOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const dryRun = options.dryRun === true;
  const scaffold = options.scaffold === true;
  const briefAbs = join(cwd, BRIEF_REL);

  const parsedCount = parseCount(options.count);
  if (parsedCount.error) log.warn(parsedCount.error);
  const count = parsedCount.count;
  const countWarning = parsedCount.warning;
  if (countWarning) {
    log.warn(
      `--count ${count} is large (soft cap ${COUNT_SOFT_CAP}). Continuing, but the Planner Agent may push back.`,
    );
  }

  const fromAbs = options.from ? toAbsolute(cwd, options.from) : undefined;
  if (typeof fromAbs === "string" && !(await pathExists(fromAbs))) {
    log.error(`--from path not found: ${fromAbs}`);
    log.info(
      `If you meant a relative path, run from the project root or pass --cwd <path>.`,
    );
    process.exitCode = 1;
    return;
  }

  log.info(bold(scaffold ? "vibeops task generate --scaffold" : "vibeops task generate"));
  log.info(`  ${dim("cwd")}        ${cwd}`);
  log.info(`  ${dim("mode")}       ${scaffold ? "scaffold (write skeleton TASK files)" : "prompt (build Cursor prompt)"}`);
  if (options.phase) log.info(`  ${dim("phase")}      ${options.phase}`);
  log.info(`  ${dim("count")}      ${count}${countWarning ? yellow("  (above soft cap)") : ""}`);
  if (fromAbs) log.info(`  ${dim("--from")}     ${relDisplay(cwd, fromAbs)}`);
  if (dryRun) log.info(`  ${dim("dry-run")}    on (no file writes)`);
  log.blank();

  if (scaffold) {
    await runScaffold({
      tasksDir: paths.docsTasks,
      cwd,
      count,
      phase: options.phase,
      dryRun,
    });
    return;
  }

  await runPromptMode({
    cwd,
    paths,
    options,
    fromAbs,
    briefAbs,
    count,
    countWarning,
    dryRun,
  });
}

interface RunPromptModeInputs {
  cwd: string;
  paths: ReturnType<typeof projectPaths>;
  options: TaskGenerateOptions;
  fromAbs: string | undefined;
  briefAbs: string;
  count: number;
  countWarning: boolean;
  dryRun: boolean;
}

async function runPromptMode(inputs: RunPromptModeInputs): Promise<void> {
  const { cwd, paths, options, fromAbs, briefAbs, count, countWarning, dryRun } = inputs;
  const promptAbs =
    typeof options.output === "string"
      ? toAbsolute(cwd, options.output)
      : join(cwd, DEFAULT_PROMPT_REL);

  const docs = await collectInputDocs({ cwd, fromPath: options.from, fromAbs, briefAbs });
  const { present, missing } = presentInventory(docs);

  log.info(bold("Input documents"));
  for (const s of present) log.info(`  ${cyan("✓")} ${relDisplay(cwd, s.path)}  ${dim(`(${s.label})`)}`);
  for (const s of missing) log.info(`  ${dim("·")} ${relDisplay(cwd, s.path)}  ${dim(`(${s.label} — missing)`)}`);
  log.blank();

  const nextNum = await nextTaskNumber(paths.docsTasks);
  const nextId = formatTaskId(nextNum);

  log.info(bold("Plan"));
  log.info(`  ${dim("next TASK id")}   ${nextId}`);
  log.info(`  ${dim("prompt output")}  ${relDisplay(cwd, promptAbs)}`);
  log.blank();

  if (dryRun) {
    log.info(bold("dry-run — would perform:"));
    log.info(`  · read ${present.length} input doc(s) (skipped ${missing.length} missing slot${missing.length === 1 ? "" : "s"})`);
    log.info(`  · build Cursor prompt for ~${count} TASK starting at ${nextId}`);
    log.info(`  · write prompt to ${relDisplay(cwd, promptAbs)}`);
    log.info(`  · no LLM / Cursor / Notion / GitHub / Git call`);
    log.blank();
    log.info(dim("no files were written."));
    return;
  }

  const promptInputs: BuildTaskGeneratePromptInputs = {
    cwd,
    vibeopsVersion: VERSION,
    generatedAt: new Date().toISOString(),
    nextTaskId: nextId,
    count,
    outputPath: promptAbs,
    outputRelative: relDisplay(cwd, promptAbs),
    docs,
    countWarning,
    ...(typeof options.phase === "string" && options.phase.length > 0
      ? { phase: options.phase }
      : {}),
  };
  const md = buildTaskGeneratePrompt(promptInputs);
  await writeText(promptAbs, md);
  log.ok(`Cursor task-generate prompt: ${relDisplay(cwd, promptAbs)}`);
  log.blank();

  log.info(bold("Next steps"));
  log.info(`  1) Cursor에서 새 채팅 → ${cyan(relDisplay(cwd, promptAbs))} 의 전체 내용을 그대로 붙여넣는다.`);
  log.info(`  2) Planner Agent가 \`docs/tasks/TASK-NNN-*.md\` 파일들을 만들면 \`git diff\`로 검토 후 커밋한다.`);
  log.info(`  3) 첫 번째 새 TASK부터 ${cyan(`vibeops task start ${nextId}`)}로 라이프사이클 시작.`);
  if (missing.length > 0) {
    log.blank();
    log.info(
      `${yellow("!")} ${missing.length} input slot(s) are missing on disk. Planner Agent에게 \"missing\"으로 노출되며, 이 라운드에서 보강할지 결정해야 한다.`,
    );
  }
}

interface RunScaffoldInputs {
  tasksDir: string;
  cwd: string;
  count: number;
  phase?: string;
  dryRun: boolean;
}

async function runScaffold(inputs: RunScaffoldInputs): Promise<void> {
  const plan = await planScaffoldEntries({
    tasksDir: inputs.tasksDir,
    count: inputs.count,
    ...(typeof inputs.phase === "string" && inputs.phase.length > 0
      ? { phase: inputs.phase }
      : {}),
  });

  log.info(bold("Scaffold plan"));
  log.info(`  ${dim("start at")}  ${formatTaskId(plan.startNumber)}`);
  log.info(`  ${dim("count")}     ${plan.entries.length}`);
  log.blank();

  log.info(bold("Files to create"));
  for (const e of plan.entries) {
    log.info(`  · ${relDisplay(inputs.cwd, e.absPath)}  ${dim(`(${e.phase})`)}`);
  }
  log.blank();

  if (inputs.dryRun) {
    log.info(dim("dry-run — no files were written."));
    log.info(
      `Skeleton preview (first entry, ${plan.entries[0]?.id ?? "TASK-???"}):`,
    );
    log.blank();
    log.info(dim("─".repeat(60)));
    log.raw(renderScaffoldMarkdown(plan.entries[0] ?? fallbackPreviewEntry(plan.startNumber, inputs.phase)));
    log.info(dim("─".repeat(60)));
    return;
  }

  const written = await writeScaffoldFiles(plan);
  for (const abs of written) log.ok(`created   ${relDisplay(inputs.cwd, abs)}`);
  if (written.length < plan.entries.length) {
    const skipped = plan.entries.length - written.length;
    log.warn(`${skipped} planned file(s) already existed and were skipped (won't overwrite).`);
  }
  log.blank();
  log.info(bold("Next steps"));
  log.info(`  1) 만들어진 TASK 파일들의 비어 있는 섹션을 채운다 (Cursor에서 Planner 또는 Architect Agent로).`);
  log.info(`  2) 채운 뒤 \`git add docs/tasks/ && git commit\`.`);
  log.info(`  3) 첫 TASK부터 ${cyan(`vibeops task start ${plan.entries[0]?.id ?? "TASK-???"}`)} 로 진입.`);
}

function fallbackPreviewEntry(start: number, phase?: string): ScaffoldEntry {
  const id = formatTaskId(start);
  return {
    id,
    number: start,
    slug: "planned-task",
    title: "(scaffolded TASK — fill in)",
    fileName: `${id}-planned-task.md`,
    absPath: `${id}-planned-task.md`,
    phase: phase ?? "(미정)",
  };
}
