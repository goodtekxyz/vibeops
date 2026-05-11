import { isAbsolute, join, relative, resolve } from "node:path";

import {
  briefToMarkdown,
  findMissingRequired,
  gatherBrief,
  parseBriefFromMarkdown,
  parseIdea,
} from "../lib/brief.js";
import { pathExists, readText, writeText } from "../lib/filesystem.js";
import { bold, cyan, dim, log, yellow } from "../lib/logger.js";
import { buildPlanPrompt } from "../lib/prompt-builder.js";
import type { BriefBundle } from "../types/brief.js";

export interface PlanCommandOptions {
  idea?: string;
  from?: string;
  output?: string;
  nonInteractive?: boolean;
  cwd?: string;
}

const DEFAULT_BRIEF_REL = ".vibeops/brief/project-brief.md";
const DEFAULT_PROMPT_REL = ".vibeops/generated/plan-prompt.md";

function toAbsolute(root: string, candidate: string): string {
  return isAbsolute(candidate) ? candidate : resolve(root, candidate);
}

function relDisplay(root: string, abs: string): string {
  const r = relative(root, abs);
  return r.length === 0 ? "." : r;
}

export async function planCommand(options: PlanCommandOptions): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const nonInteractive = options.nonInteractive === true;
  const briefAbs = join(cwd, DEFAULT_BRIEF_REL);
  const promptAbs =
    typeof options.output === "string" ? toAbsolute(cwd, options.output) : join(cwd, DEFAULT_PROMPT_REL);

  log.info(bold(`vibeops plan`));
  log.info(dim(`  cwd: ${cwd}`));
  if (options.from) log.info(dim(`  from: ${options.from}`));
  if (options.idea) log.info(dim(`  idea: ${options.idea}`));
  if (nonInteractive) log.info(dim(`  mode: non-interactive`));
  log.blank();

  let bundle: BriefBundle;

  if (typeof options.from === "string" && options.from.length > 0) {
    bundle = await loadFromFile({
      cwd,
      fromPath: toAbsolute(cwd, options.from),
      nonInteractive,
      idea: options.idea,
    });
  } else {
    if (!nonInteractive && process.stdin.isTTY !== true) {
      log.error(
        "vibeops plan은 TTY가 필요합니다. CI/파이프 환경에서는 --non-interactive 를 사용하거나 --from <brief.md> 로 전달하세요.",
      );
      process.exitCode = 1;
      return;
    }
    log.step(
      nonInteractive
        ? "non-interactive: 주어진 값 + 안전한 placeholder로 ProjectBrief 생성"
        : "interactive: 20개 질문으로 ProjectBrief 생성 (방향키·Space·Enter)",
    );
    log.blank();
    bundle = await gatherBrief({
      cwd,
      idea: options.idea,
      nonInteractive,
    });
  }

  const briefMd = briefToMarkdown(bundle.brief, bundle.meta);
  await writeText(briefAbs, briefMd);
  log.ok(`brief 작성: ${relDisplay(cwd, briefAbs)}`);

  const promptMd = buildPlanPrompt({
    brief: bundle.brief,
    meta: bundle.meta,
    briefRelativePath: relDisplay(cwd, briefAbs),
  });
  await writeText(promptAbs, promptMd);
  log.ok(`Cursor 계획 프롬프트: ${relDisplay(cwd, promptAbs)}`);

  if (bundle.meta.assumptions.length > 0) {
    log.blank();
    log.info(`${yellow("!")} ${bold("Assumptions")} (Planner Agent가 다시 확인해야 할 항목):`);
    for (const a of bundle.meta.assumptions) log.info(`  · ${a}`);
  }

  log.blank();
  log.info(bold("다음 단계:"));
  log.info(`  1) Cursor에서 새 채팅 → ${cyan(relDisplay(cwd, promptAbs))} 의 전체 내용을 그대로 붙여넣는다.`);
  log.info(`  2) Planner Agent가 docs/project/* 와 초기 백로그를 만들면 git diff로 검토 후 커밋한다.`);
  log.info(`  3) brief를 수정하고 싶으면 ${cyan(relDisplay(cwd, briefAbs))} 를 편집한 뒤`);
  log.info(`     ${dim("vibeops plan --from " + DEFAULT_BRIEF_REL)} 로 prompt를 재생성한다.`);
}

interface LoadFromFileInputs {
  cwd: string;
  fromPath: string;
  nonInteractive: boolean;
  idea?: string;
}

async function loadFromFile(inputs: LoadFromFileInputs): Promise<BriefBundle> {
  const { cwd, fromPath, nonInteractive, idea } = inputs;
  if (!(await pathExists(fromPath))) {
    log.error(`--from 으로 지정한 파일이 없습니다: ${fromPath}`);
    process.exit(1);
  }
  const md = await readText(fromPath);
  log.step(`brief 로드: ${relDisplay(cwd, fromPath)}`);
  const parsed = parseBriefFromMarkdown(md);
  parsed.meta.source = "from-file";

  if (typeof idea === "string" && idea.length > 0) {
    const ideaParsed = parseIdea(idea);
    if (ideaParsed.projectName && parsed.brief.projectName.length === 0) {
      parsed.brief.projectName = ideaParsed.projectName;
    }
    if (ideaParsed.oneLineIdea && parsed.brief.oneLineIdea.length === 0) {
      parsed.brief.oneLineIdea = ideaParsed.oneLineIdea;
    }
  }

  const missing = findMissingRequired(parsed.brief);
  if (missing.length === 0) {
    return parsed;
  }

  if (nonInteractive) {
    log.warn(
      `필수 항목 누락: ${missing.join(", ")} → placeholder로 채우고 Assumptions에 기록합니다.`,
    );
    return parsed;
  }

  log.warn(`필수 항목 누락: ${missing.join(", ")} → 누락 항목만 추가 질문합니다.`);
  log.blank();
  const filled = await gatherBrief({
    cwd,
    idea,
    nonInteractive: false,
    seed: parsed.brief,
  });
  filled.meta.source = "from-file";
  return filled;
}
