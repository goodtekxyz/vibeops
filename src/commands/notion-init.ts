import { password } from "@inquirer/prompts";
import { resolve, relative } from "node:path";

import {
  mergeNotionConfig,
  readConfig,
  writeConfig,
} from "../lib/config.js";
import { pathExists, readText, writeText } from "../lib/filesystem.js";
import { askInput, askYesNo } from "../lib/inquirer-helpers.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";
import {
  inspectEnvFile,
  maskToken,
  writeNotionTokenToEnvFile,
} from "../lib/notion-env.js";
import {
  PROJECTS_DB_PROPERTIES,
  TASKS_DB_PROPERTIES,
  type PropertyRequirement,
} from "../lib/notion-schema.js";
import { projectPaths } from "../lib/paths.js";
import type { NotionConfig } from "../types/config.js";

const NOTION_TOKEN_LINE = "NOTION_TOKEN=";

export interface NotionInitOptions {
  dryRun?: boolean;
  enable?: boolean;
  projectsDb?: string;
  tasksDb?: string;
  nonInteractive?: boolean;
  cwd?: string;
}

function relDisplay(root: string, abs: string): string {
  const r = relative(root, abs);
  return r.length === 0 ? "." : r;
}

function renderRequiredProps(label: string, props: readonly PropertyRequirement[]): void {
  log.info(bold(label));
  for (const p of props) {
    const types = p.allowedTypes.join(" | ");
    log.info(`  · ${p.name}  ${dim(`(${types})`)}  ${dim("— " + p.description)}`);
  }
}

export async function notionInitCommand(options: NotionInitOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const dryRun = options.dryRun === true;
  const explicitlyNonInteractive = options.nonInteractive === true;
  const isTty = process.stdin.isTTY === true;
  const interactive = !dryRun && !explicitlyNonInteractive && isTty;

  log.info(bold("vibeops notion init"));
  log.info(`  ${dim("cwd")}        ${cwd}`);
  log.info(
    `  ${dim("mode")}       ${
      dryRun
        ? "dry-run (no file writes)"
        : interactive
          ? "interactive (방향키 · Enter — y/n 타이핑 안 함)"
          : "non-interactive (flags only)"
    }`,
  );
  log.blank();

  if (!(await pathExists(paths.config))) {
    log.error(
      `.vibeops.json 이 없습니다. 먼저 ${cyan("vibeops init")} 를 실행해 VibeOps 운영 구조를 설치하세요.`,
    );
    log.info(dim(`  expected at: ${relDisplay(cwd, paths.config)}`));
    process.exitCode = 1;
    return;
  }

  const config = await readConfig(paths.root);
  if (config === null) {
    log.error(
      `.vibeops.json 을 읽지 못했습니다(스키마 불일치 또는 JSON 파싱 실패). 파일을 확인하거나 ${cyan("vibeops init")} 로 다시 생성하세요.`,
    );
    process.exitCode = 1;
    return;
  }

  const currentNotion: NotionConfig = config.notion ?? {
    enabled: false,
    projectsDatabaseId: "",
    tasksDatabaseId: "",
  };

  // Resolve patch values from the priority chain:
  //   explicit CLI flags  →  interactive answers  →  current config value
  const patch: Partial<NotionConfig> = {};
  let enabled = currentNotion.enabled;
  if (options.enable === true) {
    patch.enabled = true;
    enabled = true;
  }
  let projectsDb = currentNotion.projectsDatabaseId;
  if (typeof options.projectsDb === "string" && options.projectsDb.length > 0) {
    projectsDb = options.projectsDb.trim();
    patch.projectsDatabaseId = projectsDb;
  }
  let tasksDb = currentNotion.tasksDatabaseId;
  if (typeof options.tasksDb === "string" && options.tasksDb.length > 0) {
    tasksDb = options.tasksDb.trim();
    patch.tasksDatabaseId = tasksDb;
  }

  let tokenToWrite: string | null = null;
  let willOverwriteToken = false;
  let envSnapshotKnown = false;
  let envHadToken = false;

  if (interactive) {
    // ── Q1. Use Notion dashboard sync? ─────────────────────────────────────
    if (options.enable !== true) {
      enabled = await askYesNo({
        message:
          "Use Notion dashboard sync?  (Notion 을 human dashboard 로 쓰기 — Git docs/tasks 가 여전히 source of truth)",
        nonInteractive: false,
        defaultValue: currentNotion.enabled,
      });
      patch.enabled = enabled;
    } else {
      log.info(`${dim("·")} --enable provided → notion.enabled = true (skip question)`);
    }

    if (enabled) {
      // ── Projects DB ID ───────────────────────────────────────────────────
      if (typeof options.projectsDb !== "string" || options.projectsDb.length === 0) {
        const ans = await askInput({
          message: "Projects DB ID  (Notion DB 페이지 URL 의 32-char id, 빈 값이면 나중에 설정)",
          nonInteractive: false,
          default: projectsDb.length > 0 ? projectsDb : undefined,
        });
        if (ans.length > 0) {
          projectsDb = ans;
          patch.projectsDatabaseId = projectsDb;
        }
      }

      // ── Tasks DB ID ──────────────────────────────────────────────────────
      if (typeof options.tasksDb !== "string" || options.tasksDb.length === 0) {
        const ans = await askInput({
          message: "Tasks DB ID  (Notion DB 페이지 URL 의 32-char id, 빈 값이면 나중에 설정)",
          nonInteractive: false,
          default: tasksDb.length > 0 ? tasksDb : undefined,
        });
        if (ans.length > 0) {
          tasksDb = ans;
          patch.tasksDatabaseId = tasksDb;
        }
      }

      // ── Q4. Continue without database IDs? (only if both empty) ──────────
      if (projectsDb.length === 0 && tasksDb.length === 0) {
        const proceed = await askYesNo({
          message:
            "Continue without database IDs?  (No → 명령을 취소하고 DB 만든 뒤 다시 실행. Yes → 일단 enabled=true 만 켜두고 ID 는 나중에 채움)",
          nonInteractive: false,
          defaultValue: false,
        });
        if (!proceed) {
          log.blank();
          log.info(
            `${yellow("!")} 취소했다. Notion 에서 Projects/Tasks DB 를 만들고 32-char id 를 복사한 뒤 다시 ${cyan(
              "vibeops notion init",
            )} 또는 ${cyan(
              "vibeops notion init --projects-db <id> --tasks-db <id>",
            )} 를 실행하라.`,
          );
          process.exitCode = 0;
          return;
        }
      }

      // ── Q2. Paste NOTION_TOKEN now? ──────────────────────────────────────
      log.blank();
      log.info(
        dim(
          "  NOTION_TOKEN 은 Notion integration secret 이다. VibeOps 는 token 값을 stdout 에 노출하지 않고, .vibeops.env (gitignored) 에만 저장한다.",
        ),
      );
      const envSnap = await inspectEnvFile(cwd);
      envSnapshotKnown = true;
      envHadToken =
        envSnap.exists && envSnap.currentToken !== null && envSnap.currentToken.length > 0;
      const pasteNow = await askYesNo({
        message: envHadToken
          ? "Paste NOTION_TOKEN now?  (.vibeops.env 에 이미 token 이 있다 — Yes 를 누르면 다음 질문에서 덮어쓸지 묻는다)"
          : "Paste NOTION_TOKEN now?  (Yes → 입력값을 .vibeops.env 에 저장 · No → 나중에 직접 편집)",
        nonInteractive: false,
        defaultValue: false,
      });
      if (pasteNow) {
        let go = true;
        if (envHadToken) {
          // ── Q3. Overwrite or update existing NOTION_TOKEN? ───────────────
          const overwrite = await askYesNo({
            message: `Overwrite existing NOTION_TOKEN?  (현재 값: ${maskToken(
              envSnap.currentToken!,
            )})`,
            nonInteractive: false,
            defaultValue: false,
          });
          willOverwriteToken = overwrite;
          go = overwrite;
        }
        if (go) {
          const entered = await password({
            message:
              "NOTION_TOKEN 입력  (입력값은 화면에 표시되지 않음 · 'secret_…' 또는 'ntn_…' 으로 시작)",
            mask: "*",
            validate: (v: string) =>
              v.trim().length === 0
                ? "비어 있다. Notion → Settings → Integrations 에서 secret 을 복사하라."
                : true,
          });
          tokenToWrite = entered.trim();
        }
      }
    } else {
      log.info(
        dim(
          "  notion.enabled = false 로 결정 — DB id / NOTION_TOKEN 질문은 건너뛴다.",
        ),
      );
    }
    log.blank();
  }

  const { merged, changed: notionChanged } = mergeNotionConfig(config, patch);

  log.info(bold("Plan: .vibeops.json"));
  if (config.notion === undefined) {
    log.info(`  ${green("+")} add ${cyan("notion")} section (enabled=${merged.notion!.enabled})`);
  }
  diffNotionSection(config.notion, merged.notion!);
  log.blank();

  log.info(bold("Plan: .vibeops.env.example"));
  const envExampleAbs = paths.envExample;
  const existingExample = (await pathExists(envExampleAbs))
    ? await readText(envExampleAbs)
    : null;
  const exampleNeedsToken = !hasLine(existingExample, NOTION_TOKEN_LINE);
  const nextExample = ensureEnvLine(existingExample, NOTION_TOKEN_LINE);
  if (existingExample === null) {
    log.info(`  ${green("+")} create ${cyan(relDisplay(cwd, envExampleAbs))} with ${cyan(NOTION_TOKEN_LINE)}`);
  } else if (exampleNeedsToken) {
    log.info(`  ${green("+")} append ${cyan(NOTION_TOKEN_LINE)} to ${cyan(relDisplay(cwd, envExampleAbs))}`);
  } else {
    log.info(`  ${dim("·")} ${cyan(NOTION_TOKEN_LINE)} already present in ${cyan(relDisplay(cwd, envExampleAbs))}`);
  }
  log.blank();

  if (interactive && tokenToWrite !== null) {
    log.info(bold("Plan: .vibeops.env  (local secret · NEVER COMMITTED)"));
    if (envHadToken && willOverwriteToken) {
      log.info(`  ${green("~")} ${cyan("NOTION_TOKEN=")} 덮어쓰기 (${maskToken(tokenToWrite)})`);
    } else if (envSnapshotKnown && (await pathExists(paths.envExample)) === false) {
      log.info(`  ${green("+")} create .vibeops.env with ${cyan("NOTION_TOKEN=")} (${maskToken(tokenToWrite)})`);
    } else {
      log.info(`  ${green("+")} write ${cyan("NOTION_TOKEN=")} 라인 (${maskToken(tokenToWrite)})`);
    }
    log.blank();
  }

  log.info(bold("Required Notion DB schema (Notion 에서 사람이 직접 만든다)"));
  log.info(
    dim(
      "  VibeOps 는 Notion DB 를 자동 생성하지 않는다. 아래 속성을 그대로 만든 뒤 integration 에 공유해야 한다.",
    ),
  );
  log.blank();
  renderRequiredProps("Projects DB", PROJECTS_DB_PROPERTIES);
  log.blank();
  renderRequiredProps("Tasks DB", TASKS_DB_PROPERTIES);
  log.blank();

  log.info(bold("보안"));
  log.info(`  ${dim("·")} ${cyan("NOTION_TOKEN")} 의 원본 값은 stdout 에 절대 노출하지 않는다 (interactive 입력은 password 마스킹).`);
  log.info(`  ${dim("·")} ${cyan(".vibeops.env")} 는 ${cyan(".gitignore")} 대상 — 절대 커밋하지 마라.`);
  log.info(`  ${dim("·")} interactive 흐름에서 ${cyan("Paste NOTION_TOKEN now? Yes")} 를 선택했을 때만 ${cyan(".vibeops.env")} 가 만들어진다.`);
  log.blank();

  if (dryRun) {
    log.info(dim("dry-run — no files were written."));
    log.blank();
    log.info(bold("Next steps"));
    log.info(`  1) Notion 에서 Projects / Tasks DB 를 만들고 integration 에 공유한다.`);
    log.info(`  2) ${cyan("vibeops notion init")} 를 다시 실행해 대화형으로 채우거나, ${cyan("--enable --projects-db <id> --tasks-db <id>")} 로 한 줄에 끝낸다.`);
    log.info(`  3) ${cyan("vibeops notion test")} 로 검증.`);
    return;
  }

  if (notionChanged) {
    await writeConfig(paths.root, merged);
    log.ok(`updated ${relDisplay(cwd, paths.config)}`);
  } else {
    log.info(dim(`unchanged ${relDisplay(cwd, paths.config)}`));
  }

  if (existingExample === null || exampleNeedsToken) {
    await writeText(envExampleAbs, nextExample);
    log.ok(`updated ${relDisplay(cwd, envExampleAbs)}`);
  } else {
    log.info(dim(`unchanged ${relDisplay(cwd, envExampleAbs)}`));
  }

  if (interactive && tokenToWrite !== null) {
    const res = await writeNotionTokenToEnvFile(cwd, tokenToWrite);
    if (res.created) {
      log.ok(`created  .vibeops.env  ${dim("(NOTION_TOKEN saved · masked)")}`);
    } else if (res.replaced) {
      log.ok(`updated  .vibeops.env  ${dim("(NOTION_TOKEN replaced · masked)")}`);
    } else {
      log.ok(`appended .vibeops.env  ${dim("(NOTION_TOKEN added · masked)")}`);
    }
    log.info(dim("         token 값은 stdout 에 표시되지 않는다."));
  }

  log.blank();
  log.info(bold("Next steps"));
  log.info(`  1) Notion 에서 위 Projects / Tasks DB 속성을 만든다.`);
  log.info(`  2) DB 페이지 우측 상단 ⋯ → ${cyan("Connections")} 로 integration 에 공유.`);
  if (!interactive || tokenToWrite === null) {
    log.info(`  3) 로컬에 ${cyan(".vibeops.env")} 파일을 만들고 ${cyan("NOTION_TOKEN=secret_…")} 을 넣는다.`);
    log.info(`     ${dim(".vibeops.env 는 .gitignore 대상 — 절대 커밋하지 마라.")}`);
  } else {
    log.info(`  3) ${dim(".vibeops.env 는 .gitignore 대상 — 절대 커밋하지 마라.")}`);
  }
  if (!merged.notion!.enabled) {
    log.info(`  4) 준비되면 ${cyan("vibeops notion init --enable")} 로 켜고, ${cyan("vibeops notion test")} 로 검증.`);
  } else {
    log.info(`  4) ${cyan("vibeops notion test")} 로 검증.`);
  }
  if (
    merged.notion!.enabled &&
    (merged.notion!.projectsDatabaseId.length === 0 ||
      merged.notion!.tasksDatabaseId.length === 0)
  ) {
    log.blank();
    log.info(
      `${yellow("!")} notion.enabled = true 이지만 ${
        merged.notion!.projectsDatabaseId.length === 0 ? "projectsDatabaseId " : ""
      }${
        merged.notion!.tasksDatabaseId.length === 0 ? "tasksDatabaseId " : ""
      }가 비어 있다. ${cyan("vibeops notion init --projects-db <id> --tasks-db <id>")} 로 채우세요.`,
    );
  }
}

function diffNotionSection(prev: NotionConfig | undefined, next: NotionConfig): void {
  const prevVals: Record<keyof NotionConfig, string | boolean> = {
    enabled: prev?.enabled ?? false,
    projectsDatabaseId: prev?.projectsDatabaseId ?? "",
    tasksDatabaseId: prev?.tasksDatabaseId ?? "",
  };
  const fields: (keyof NotionConfig)[] = [
    "enabled",
    "projectsDatabaseId",
    "tasksDatabaseId",
  ];
  for (const f of fields) {
    const before = prevVals[f];
    const after = next[f];
    if (before === after) {
      log.info(`  ${dim("·")} ${f} ${dim(`= ${display(after)}`)}`);
    } else {
      log.info(
        `  ${green("~")} ${f} ${dim(`${display(before)}`)} → ${cyan(display(after))}`,
      );
    }
  }
}

function display(v: string | boolean): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v.length === 0) return '""';
  return v;
}

function hasLine(text: string | null, keyEq: string): boolean {
  if (text === null) return false;
  return text.split(/\r?\n/).some((l) => l.trimStart().startsWith(keyEq));
}

function ensureEnvLine(text: string | null, keyEq: string): string {
  if (text === null) {
    return `# VibeOps · environment example
# Copy this file to .vibeops.env and fill in the values.
# Never commit .vibeops.env — it is added to .gitignore by \`vibeops init\`.

${keyEq}
`;
  }
  if (hasLine(text, keyEq)) return text;
  const needsTrailingNewline = !text.endsWith("\n");
  return `${text}${needsTrailingNewline ? "\n" : ""}${keyEq}\n`;
}
