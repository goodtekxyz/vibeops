import { password, select } from "@inquirer/prompts";
import { resolve, relative } from "node:path";

import {
  mergeNotionConfig,
  readConfig,
  writeConfig,
} from "../lib/config.js";
import { pathExists, readText, writeText } from "../lib/filesystem.js";
import { askInput, askYesNo } from "../lib/inquirer-helpers.js";
import { bold, cyan, dim, green, log, red, yellow } from "../lib/logger.js";
import {
  createNotionClient,
  notionApiError,
  type NotionApiError,
  type NotionClient,
} from "../lib/notion-client.js";
import {
  buildChoiceLabel,
  discoverInlineDatabasesFromPage,
  discoverNotionDatabases,
  NOTION_DISCOVERY_MAX,
  NOTION_PAGE_SCAN_MAX_BLOCKS,
  sortForKind,
  type DatabaseScore,
  type NotionDatabaseChoice,
  type NotionPageChoice,
} from "../lib/notion-discovery.js";
import {
  inspectEnvFile,
  loadNotionEnv,
  maskToken,
  writeNotionTokenToEnvFile,
} from "../lib/notion-env.js";
import {
  PROJECTS_DB_PROPERTIES,
  TASKS_DB_PROPERTIES,
  type PropertyRequirement,
} from "../lib/notion-schema.js";
import { resolveNotionDataSourceTarget } from "../lib/notion-target.js";
import { projectPaths } from "../lib/paths.js";
import type { NotionConfig } from "../types/config.js";

const MANUAL_VALUE = "__manual__";
const SKIP_VALUE = "__skip__";

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
    projectsTargetId: "",
    tasksTargetId: "",
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
  let projectsTarget = currentNotion.projectsTargetId;
  if (typeof options.projectsDb === "string" && options.projectsDb.length > 0) {
    projectsDb = options.projectsDb.trim();
    patch.projectsDatabaseId = projectsDb;
  }
  let tasksDb = currentNotion.tasksDatabaseId;
  let tasksTarget = currentNotion.tasksTargetId;
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
      // ── Q2. Paste NOTION_TOKEN now? (moved up — token gates DB search) ──
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
      log.blank();

      // ── Search-driven DB selection ───────────────────────────────────────
      //
      // We resolve the "effective token" for THIS run (newly typed, or
      // already present in .vibeops.env / process.env) so the user can use
      // notion init purely to pick DBs without re-entering a token.
      //
      // We DO NOT prompt to search if the user already gave us both DBs via
      // CLI flags — those wins are preserved.
      const needProjects =
        projectsTarget.length === 0 &&
        (typeof options.projectsDb !== "string" || options.projectsDb.length === 0) &&
        patch.projectsTargetId === undefined &&
        patch.projectsDatabaseId === undefined;
      const needTasks =
        tasksTarget.length === 0 &&
        (typeof options.tasksDb !== "string" || options.tasksDb.length === 0) &&
        patch.tasksTargetId === undefined &&
        patch.tasksDatabaseId === undefined;

      const effectiveToken = await resolveEffectiveToken(cwd, tokenToWrite);

      if ((needProjects || needTasks) && effectiveToken !== null) {
        const wantSearch = await askYesNo({
          message:
            "Search accessible Notion databases now?  (Yes → /v1/search 호출 후 select 로 고른다 · No → 32-char id 를 직접 입력)",
          nonInteractive: false,
          defaultValue: true,
        });
        if (wantSearch) {
          const picks = await pickDatabasesViaSearch({
            token: effectiveToken,
            needProjects,
            needTasks,
            currentProjects: projectsTarget.length > 0 ? projectsTarget : projectsDb,
            currentTasks: tasksTarget.length > 0 ? tasksTarget : tasksDb,
          });
          if (picks.projectsTarget !== null) {
            projectsTarget = picks.projectsTarget;
            patch.projectsTargetId = projectsTarget;
          }
          if (picks.tasksTarget !== null) {
            tasksTarget = picks.tasksTarget;
            patch.tasksTargetId = tasksTarget;
          }
          if (picks.projectsDatabase !== null) {
            projectsDb = picks.projectsDatabase;
            patch.projectsDatabaseId = projectsDb;
          }
          if (picks.tasksDatabase !== null) {
            tasksDb = picks.tasksDatabase;
            patch.tasksDatabaseId = tasksDb;
          }
        }
      } else if ((needProjects || needTasks) && effectiveToken === null) {
        log.info(
          dim(
            "  Notion token 이 없어 DB search 를 건너뛴다. 32-char id 를 직접 입력해라(빈 값으로 두면 나중에 채울 수 있다).",
          ),
        );
      }

      // ── Manual fallback for any DB id still empty ────────────────────────
      if (
        needProjects &&
        (patch.projectsTargetId ?? projectsTarget).length === 0 &&
        (patch.projectsDatabaseId ?? projectsDb).length === 0
      ) {
        const ans = await askInput({
          message:
            "Projects data source ID  (fallback: 직접 복사한 data_source id, 빈 값이면 나중에 설정)",
          nonInteractive: false,
          default: projectsTarget.length > 0 ? projectsTarget : undefined,
        });
        if (ans.length > 0) {
          projectsTarget = ans;
          patch.projectsTargetId = projectsTarget;
        }
      }
      if (
        needTasks &&
        (patch.tasksTargetId ?? tasksTarget).length === 0 &&
        (patch.tasksDatabaseId ?? tasksDb).length === 0
      ) {
        const ans = await askInput({
          message:
            "Tasks data source ID  (fallback: 직접 복사한 data_source id, 빈 값이면 나중에 설정)",
          nonInteractive: false,
          default: tasksTarget.length > 0 ? tasksTarget : undefined,
        });
        if (ans.length > 0) {
          tasksTarget = ans;
          patch.tasksTargetId = tasksTarget;
        }
      }

      // ── Q4. Continue without database IDs? (only if both empty) ──────────
      if (
        projectsTarget.length === 0 &&
        projectsDb.length === 0 &&
        tasksTarget.length === 0 &&
        tasksDb.length === 0
      ) {
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
    (effectiveProjectsTarget(merged.notion!).length === 0 ||
      effectiveTasksTarget(merged.notion!).length === 0)
  ) {
    log.blank();
    log.info(
      `${yellow("!")} notion.enabled = true 이지만 ${
        effectiveProjectsTarget(merged.notion!).length === 0 ? "projectsTargetId/projectsDatabaseId " : ""
      }${
        effectiveTasksTarget(merged.notion!).length === 0 ? "tasksTargetId/tasksDatabaseId " : ""
      }가 비어 있다. ${cyan("vibeops notion init --projects-db <id> --tasks-db <id>")} 로 채우세요.`,
    );
  }
}

function effectiveProjectsTarget(notion: NotionConfig): string {
  return notion.projectsTargetId.length > 0
    ? notion.projectsTargetId
    : notion.projectsDatabaseId;
}

function effectiveTasksTarget(notion: NotionConfig): string {
  return notion.tasksTargetId.length > 0 ? notion.tasksTargetId : notion.tasksDatabaseId;
}

/**
 * Pick the auth token to use for THIS interactive run, without writing it.
 *
 *   1. If the user just typed a new one in `Paste NOTION_TOKEN now?`, use it.
 *   2. Otherwise load whatever is currently in `.vibeops.env` /
 *      `process.env.NOTION_TOKEN` so the user can re-run `notion init` purely
 *      to re-pick DBs.
 *
 * Returns `null` when no token can be resolved — callers MUST fall back to
 * manual id input in that case.
 */
async function resolveEffectiveToken(
  cwd: string,
  freshlyTyped: string | null,
): Promise<string | null> {
  if (typeof freshlyTyped === "string" && freshlyTyped.length > 0) return freshlyTyped;
  const env = await loadNotionEnv(cwd);
  return env.token;
}

interface SearchPicks {
  projectsTarget: string | null;
  tasksTarget: string | null;
  projectsDatabase: string | null;
  tasksDatabase: string | null;
}

interface PickInputs {
  token: string;
  needProjects: boolean;
  needTasks: boolean;
  currentProjects: string;
  currentTasks: string;
}

async function pickDatabasesViaSearch(inputs: PickInputs): Promise<SearchPicks> {
  log.info(dim("  → Notion /v1/search 호출 (read-only, 5s timeout, page_size ≤ 50)…"));
  let client: NotionClient;
  try {
    client = await createNotionClient(inputs.token);
  } catch (err) {
    const apiErr = sanitiseApiError(err);
    log.warn(`@notionhq/client 로드 실패 — ${apiErr.message}`);
    log.info(
      dim(
        "  search 를 건너뛴다. 32-char id 를 직접 입력해라 (또는 나중에 `vibeops notion init --projects-db <id> --tasks-db <id>` 로 채워라).",
      ),
    );
    return {
      projectsTarget: null,
      tasksTarget: null,
      projectsDatabase: null,
      tasksDatabase: null,
    };
  }

  let dataSources: NotionDatabaseChoice[] = [];
  let pages: NotionPageChoice[] = [];
  let dataSourcesTruncated = false;
  let pagesTruncated = false;
  try {
    const combined = await discoverNotionDatabases(client);
    dataSources = combined.dataSources;
    pages = combined.pages;
    dataSourcesTruncated = combined.dataSourcesTruncated;
    pagesTruncated = combined.pagesTruncated;
    if (combined.dataSourceErrored) {
      log.warn(
        "Notion 이 object filter \"data_source\" 를 거부했다 — 호환 모드로 진행한다.",
      );
      log.info(
        dim(
          "  (Internal: current Notion API expects search filter \"data_source\"; SDK 버전이 오래됐을 수 있다.)",
        ),
      );
    }
    for (const w of combined.warnings) {
      log.info(dim(`  · ${w}`));
    }
  } catch (err) {
    const apiErr = sanitiseApiError(err);
    log.warn(`Notion search 실패 — ${explainSearchError(apiErr)}`);
    log.info(
      dim(
        "  search 를 건너뛴다. 32-char id 를 직접 입력해라 (또는 나중에 다시 실행).",
      ),
    );
    return {
      projectsTarget: null,
      tasksTarget: null,
      projectsDatabase: null,
      tasksDatabase: null,
    };
  }

  // Candidate pool used by both the Projects-DB and Tasks-DB pickers.
  let candidates: NotionDatabaseChoice[] = dataSources;

  if (dataSources.length > 0) {
    log.info(
      dim(
        `  · ${dataSources.length} database${dataSources.length === 1 ? "" : "s"} accessible to this integration${
          dataSourcesTruncated ? ` (capped at ${NOTION_DISCOVERY_MAX} — Notion has more)` : ""
        }`,
      ),
    );
  } else {
    // No data sources surfaced. Show the corrected guidance (this is the
    // common case for inline DBs that live inside a shared parent page).
    log.info(
      yellow(
        "  VibeOps can access pages, but no data sources were returned by Notion search.\n" +
          "  If your databases are inline, select the parent page so VibeOps can scan its child blocks.\n" +
          "  If they still do not appear, open each database as a page and add the VibeOps integration directly.",
      ),
    );

    if (pages.length === 0) {
      log.info(
        dim(
          "  · 접근 가능한 page 도 없다 — 32-char id 직접 입력으로 진행.",
        ),
      );
      return {
        projectsTarget: null,
        tasksTarget: null,
        projectsDatabase: null,
        tasksDatabase: null,
      };
    }
    log.info(
      dim(
        `  · ${pages.length} page${pages.length === 1 ? "" : "s"} accessible — 부모 페이지를 골라 1-depth 블록을 스캔한다 (cap ${NOTION_PAGE_SCAN_MAX_BLOCKS} blocks)${
          pagesTruncated ? ` (capped at ${NOTION_DISCOVERY_MAX} pages — Notion has more)` : ""
        }`,
      ),
    );
    const inlineCandidates = await pickPageAndScanForInlineDatabases({
      client,
      pages,
    });
    if (inlineCandidates.length === 0) {
      log.info(
        dim(
          "  · 선택한 page 에서 inline database 를 못 찾았다 — 32-char id 직접 입력으로 진행.",
        ),
      );
      return {
        projectsTarget: null,
        tasksTarget: null,
        projectsDatabase: null,
        tasksDatabase: null,
      };
    }
    candidates = inlineCandidates;
    log.info(
      dim(
        `  · ${inlineCandidates.length} inline database${inlineCandidates.length === 1 ? "" : "s"} 후보 발견.`,
      ),
    );
  }

  const picks: SearchPicks = {
    projectsTarget: null,
    tasksTarget: null,
    projectsDatabase: null,
    tasksDatabase: null,
  };
  if (inputs.needProjects) {
    const pick = await pickOneDatabase({
      kind: "projects",
      databases: candidates,
      current: inputs.currentProjects,
      client,
    });
    if (pick !== null) {
      picks.projectsTarget = pick.targetId;
      if (pick.databaseId !== null) picks.projectsDatabase = pick.databaseId;
    }
  } else {
    log.info(dim("  · Projects DB는 이미 설정돼 있어 선택을 건너뛴다."));
  }
  if (inputs.needTasks) {
    const pick = await pickOneDatabase({
      kind: "tasks",
      databases: candidates,
      current: inputs.currentTasks,
      client,
    });
    if (pick !== null) {
      picks.tasksTarget = pick.targetId;
      if (pick.databaseId !== null) picks.tasksDatabase = pick.databaseId;
    }
  } else {
    log.info(dim("  · Tasks DB는 이미 설정돼 있어 선택을 건너뛴다."));
  }
  return picks;
}

interface PageScanInputs {
  client: NotionClient;
  pages: readonly NotionPageChoice[];
}

const SCAN_SKIP_VALUE = "__skip_scan__";

/**
 * Show a select prompt of accessible pages, scan the one the user picks for
 * inline database / data_source child blocks, and normalize the results into
 * `NotionDatabaseChoice[]` so the rest of the picker can reuse them.
 *
 * Returns `[]` if the user chooses to skip or no inline databases are found.
 */
async function pickPageAndScanForInlineDatabases(
  inputs: PageScanInputs,
): Promise<NotionDatabaseChoice[]> {
  const choices: { name: string; value: string }[] = inputs.pages.map((p) => ({
    name: `${p.title}  (${maskId(p.id)})`,
    value: p.id,
  }));
  choices.push({
    name: "Skip page scan — 32-char id 직접 입력으로 진행",
    value: SCAN_SKIP_VALUE,
  });
  const picked = await select<string>({
    message: "Select a page to scan for inline databases",
    choices,
    default: inputs.pages[0]?.id ?? SCAN_SKIP_VALUE,
    loop: false,
    pageSize: 10,
  });
  if (picked === SCAN_SKIP_VALUE) {
    log.info(dim("  · page scan skip"));
    return [];
  }
  const page = inputs.pages.find((p) => p.id === picked);
  const parentTitle = page?.title;
  log.info(
    dim(
      `  → blocks.children.list(${maskId(picked)}) — 1-depth scan (cap ${NOTION_PAGE_SCAN_MAX_BLOCKS} blocks, read-only)…`,
    ),
  );
  try {
    const inline = await discoverInlineDatabasesFromPage(
      inputs.client,
      picked,
      parentTitle,
    );
    return inline;
  } catch (err) {
    const apiErr = sanitiseApiError(err);
    log.warn(`page scan 실패 — ${explainSearchError(apiErr)}`);
    return [];
  }
}

interface PickOneInputs {
  kind: "projects" | "tasks";
  databases: readonly NotionDatabaseChoice[];
  current: string;
  client: NotionClient;
}

interface PickedTarget {
  /** Always the id VibeOps should use for test/sync; preferably data_source. */
  targetId: string;
  /** Optional child database/container id for compatibility/debug. */
  databaseId: string | null;
}

async function pickOneDatabase(inputs: PickOneInputs): Promise<PickedTarget | null> {
  const { ordered, recommendedIds } = sortForKind(inputs.kind, inputs.databases);
  const recommendedSet = new Set(recommendedIds);
  const label = inputs.kind === "projects" ? "Projects DB" : "Tasks DB";
  const choices: { name: string; value: string; description?: string }[] = ordered.map((c) => ({
    name: buildChoiceLabel({
      kind: inputs.kind,
      database: c,
      isRecommended: recommendedSet.has(c.id),
    }),
    value: c.id,
  }));
  choices.push({ name: "Enter data source ID manually…", value: MANUAL_VALUE });
  choices.push({ name: "Skip for now (use existing value or leave empty)", value: SKIP_VALUE });

  const defaultValue =
    inputs.current.length > 0 && ordered.some((c) => c.id === inputs.current)
      ? inputs.current
      : recommendedIds[0] ?? ordered[0]?.id ?? MANUAL_VALUE;

  const picked = await select<string>({
    message: `Select ${label}  (방향키 · Enter — 추천: ${recommendedIds.length} 개)`,
    choices,
    default: defaultValue,
    loop: false,
    pageSize: 10,
  });

  if (picked === SKIP_VALUE) {
    log.info(dim(`  · ${label} 선택 skip — 기존 값 유지 (${inputs.current.length > 0 ? maskId(inputs.current) : "(empty)"})`));
    return null;
  }
  if (picked === MANUAL_VALUE) {
    const ans = await askInput({
      message: `${label} data source ID  (last fallback; Notion data_source id)`,
      nonInteractive: false,
      default: inputs.current.length > 0 ? inputs.current : undefined,
    });
    if (ans.length === 0) {
      log.info(dim(`  · ${label} 비어 있는 입력 — 기존 값 유지`));
      return null;
    }
    await softValidateSchema(inputs.client, ans, inputs.kind);
    return { targetId: ans, databaseId: null };
  }
  const chosen = ordered.find((c) => c.id === picked) ?? null;
  if (chosen !== null) {
    const matched = inputs.kind === "projects" ? chosen.projectsScore : chosen.tasksScore;
    renderImmediateSchemaCheck(inputs.kind, chosen, matched);
    return {
      targetId: chosen.dataSourceId ?? chosen.id,
      databaseId: chosen.databaseId ?? null,
    };
  }
  return { targetId: picked, databaseId: null };
}

function maskId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function renderImmediateSchemaCheck(
  kind: "projects" | "tasks",
  db: NotionDatabaseChoice,
  score: DatabaseScore,
): void {
  if (score.total === 0) {
    log.info(
      dim(
        `      · ${kind} schema 검사를 위한 properties 정보가 search 응답에 없다 — 'notion test' 로 다시 검증.`,
      ),
    );
    return;
  }
  if (score.matched === score.total) {
    log.info(`      ${green("✓")} ${kind} schema OK (${score.matched}/${score.total} matched)`);
    return;
  }
  const required = kind === "projects" ? PROJECTS_DB_PROPERTIES : TASKS_DB_PROPERTIES;
  const props = db.properties ?? {};
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const req of required) {
    const p = props[req.name] as { type?: string } | undefined;
    if (p === undefined || p === null) {
      missing.push(req.name);
      continue;
    }
    if (!req.allowedTypes.includes((p.type ?? "") as never)) {
      mismatched.push(`${req.name} (${p.type ?? "?"} ≠ ${req.allowedTypes.join("|")})`);
    }
  }
  log.warn(
    `${kind} schema 일부 누락 (${score.matched}/${score.total} matched, ${score.missing} missing, ${score.typeMismatch} mismatch) — 'notion test' 가 엄격하게 검증한다. 그래도 저장은 허용.`,
  );
  if (missing.length > 0) {
    log.info(`      ${dim("missing:")} ${missing.map((s) => red(s)).join(", ")}`);
  }
  if (mismatched.length > 0) {
    log.info(`      ${dim("type mismatch:")} ${mismatched.map((s) => red(s)).join(", ")}`);
  }
}

/**
 * Soft schema validation for the *manual* path — we don't have properties
 * from search there, so we route through `resolveNotionDataSourceTarget`
 * which knows how to follow `database → data_source` in the current Notion
 * API. Failure is logged as a warning; init still saves the id so the user
 * can fix Notion later.
 */
async function softValidateSchema(
  client: NotionClient,
  id: string,
  kind: "projects" | "tasks",
): Promise<void> {
  const resolved = await resolveNotionDataSourceTarget(client, id, kind);
  if (!resolved.ok) {
    log.warn(`${kind} DB 즉시 검증 실패 — ${resolved.message}`);
    log.info(dim("      'notion test' 로 자세히 확인."));
    return;
  }
  if (resolved.source === "database-default-data-source") {
    log.info(
      dim(
        `      resolved data_source id=${maskId(resolved.resolvedId)} (parent database=${maskId(resolved.parentDatabaseId ?? id)})`,
      ),
    );
  }
  const required = kind === "projects" ? PROJECTS_DB_PROPERTIES : TASKS_DB_PROPERTIES;
  let matched = 0;
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const req of required) {
    const p = resolved.properties[req.name] as { type?: string } | undefined;
    if (p === undefined || p === null) {
      missing.push(req.name);
      continue;
    }
    if (!req.allowedTypes.includes((p.type ?? "") as never)) {
      mismatched.push(`${req.name} (${p.type ?? "?"} ≠ ${req.allowedTypes.join("|")})`);
      continue;
    }
    matched++;
  }
  if (matched === required.length) {
    log.info(`      ${green("✓")} ${kind} schema OK (${matched}/${required.length} matched)`);
    return;
  }
  log.warn(
    `${kind} schema 일부 누락 (${matched}/${required.length} matched, ${missing.length} missing, ${mismatched.length} mismatch) — 'notion test' 로 정확히 검증.`,
  );
  if (missing.length > 0) {
    log.info(`      ${dim("missing:")} ${missing.map((s) => red(s)).join(", ")}`);
  }
  if (mismatched.length > 0) {
    log.info(`      ${dim("type mismatch:")} ${mismatched.map((s) => red(s)).join(", ")}`);
  }
}

/**
 * Wrap `notionApiError` to scrub any raw token text that might appear in the
 * underlying error message (e.g. when Notion echoes the integration secret
 * in a debug field). Defence-in-depth.
 */
function sanitiseApiError(err: unknown): NotionApiError {
  const apiErr = notionApiError(err);
  const msg = apiErr.message ?? "";
  const sanitised = msg
    .replace(/(secret_[A-Za-z0-9]{20,}|ntn_[A-Za-z0-9_-]{20,})/g, "secret_***")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1***");
  return { ...apiErr, message: sanitised };
}

function explainSearchError(err: NotionApiError): string {
  const tail = err.status ? ` (HTTP ${err.status})` : "";
  switch (err.code) {
    case "unauthorized":
      return `NOTION_TOKEN 이 거부됐다. integration secret 을 확인하라.${tail}`;
    case "restricted_resource":
      return `Notion DB 가 integration 에 공유되지 않았다 — DB → Connections 에 추가하라.${tail}`;
    case "object_not_found":
      return `Notion 리소스를 찾지 못했다. 32-char id 가 올바른지 확인.${tail}`;
    case "validation_error": {
      const msg = err.message ?? "";
      if (
        /body\.filter\.value/i.test(msg) ||
        /data_source/i.test(msg)
      ) {
        return (
          `요청 거부 (validation_error)${tail}. ` +
          "현재 Notion API 에서는 search object filter 로 \"data_source\" 만 허용한다. " +
          "VibeOps 가 이미 그렇게 호출하는데도 거부됐다면 @notionhq/client 가 오래됐을 수 있다. " +
          "임시로 DB id 를 32-char hex 로 직접 입력하면 같은 동작을 얻을 수 있다."
        );
      }
      return `요청 거부 (validation_error): ${msg}${tail}`;
    }
    case "rate_limited":
      return `Notion API rate limit — 잠시 후 다시 시도.${tail}`;
    case "request_timeout":
    case "notionhq_client_request_timeout":
    case "ETIMEDOUT":
      return `Notion API 5s timeout. 네트워크 상태를 확인하라.${tail}`;
    default:
      return `${err.code}: ${err.message}${tail}`;
  }
}

function diffNotionSection(prev: NotionConfig | undefined, next: NotionConfig): void {
  const prevVals: Record<keyof NotionConfig, string | boolean> = {
    enabled: prev?.enabled ?? false,
    projectsTargetId: prev?.projectsTargetId ?? "",
    tasksTargetId: prev?.tasksTargetId ?? "",
    projectsDatabaseId: prev?.projectsDatabaseId ?? "",
    tasksDatabaseId: prev?.tasksDatabaseId ?? "",
  };
  const fields: (keyof NotionConfig)[] = [
    "enabled",
    "projectsTargetId",
    "tasksTargetId",
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
