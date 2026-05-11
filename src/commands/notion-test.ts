import { resolve } from "node:path";

import { readConfig } from "../lib/config.js";
import { bold, cyan, dim, green, log, red, yellow } from "../lib/logger.js";
import { loadNotionEnv, maskToken, type NotionEnvInputs } from "../lib/notion-env.js";
import {
  createNotionClient,
  notionApiError,
  type NotionApiError,
  type NotionClient,
} from "../lib/notion-client.js";
import {
  PROJECTS_DB_PROPERTIES,
  TASKS_DB_PROPERTIES,
  validateDatabaseSchema,
  type SchemaViolation,
} from "../lib/notion-schema.js";
import { projectPaths } from "../lib/paths.js";
import type { NotionConfig } from "../types/config.js";

export interface NotionTestOptions {
  json?: boolean;
  cwd?: string;
}

interface CheckResult {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
  /** when ok=false and we have structured info */
  violations?: SchemaViolation[];
  /** when this check exposed a Notion error */
  apiError?: NotionApiError;
  /** stable, machine-friendly status for --json */
  status: "ok" | "fail" | "skip";
}

interface TestReport {
  cwd: string;
  configPresent: boolean;
  notion: NotionConfig | null;
  envSource: NotionEnvInputs["source"];
  hasToken: boolean;
  tokenMasked: string | null;
  checks: CheckResult[];
  ok: boolean;
}

export async function notionTestCommand(options: NotionTestOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const wantJson = options.json === true;

  const report: TestReport = {
    cwd,
    configPresent: false,
    notion: null,
    envSource: "none",
    hasToken: false,
    tokenMasked: null,
    checks: [],
    ok: false,
  };

  const config = await readConfig(paths.root);
  report.configPresent = config !== null;

  const cfgCheck: CheckResult = config
    ? {
        id: "config.present",
        label: ".vibeops.json 로드",
        ok: true,
        status: "ok",
      }
    : {
        id: "config.present",
        label: ".vibeops.json 로드",
        ok: false,
        status: "fail",
        detail: `${paths.config} 가 없습니다. 먼저 \`vibeops init\` 실행.`,
      };
  report.checks.push(cfgCheck);
  if (config === null) {
    return finalize(report, wantJson);
  }

  const notion = config.notion ?? null;
  report.notion = notion;

  const enabledCheck: CheckResult = notion?.enabled
    ? {
        id: "config.notion.enabled",
        label: "notion.enabled = true",
        ok: true,
        status: "ok",
      }
    : {
        id: "config.notion.enabled",
        label: "notion.enabled = true",
        ok: false,
        status: "fail",
        detail: `현재 false (또는 누락). \`vibeops notion init --enable\` 로 켜세요.`,
      };
  report.checks.push(enabledCheck);

  const projDbCheck: CheckResult =
    notion && notion.projectsDatabaseId.length > 0
      ? {
          id: "config.notion.projectsDatabaseId",
          label: "notion.projectsDatabaseId 설정",
          ok: true,
          status: "ok",
          detail: notion.projectsDatabaseId,
        }
      : {
          id: "config.notion.projectsDatabaseId",
          label: "notion.projectsDatabaseId 설정",
          ok: false,
          status: "fail",
          detail:
            "비어 있음. `vibeops notion init --projects-db <id>` 로 설정하세요.",
        };
  report.checks.push(projDbCheck);

  const tasksDbCheck: CheckResult =
    notion && notion.tasksDatabaseId.length > 0
      ? {
          id: "config.notion.tasksDatabaseId",
          label: "notion.tasksDatabaseId 설정",
          ok: true,
          status: "ok",
          detail: notion.tasksDatabaseId,
        }
      : {
          id: "config.notion.tasksDatabaseId",
          label: "notion.tasksDatabaseId 설정",
          ok: false,
          status: "fail",
          detail:
            "비어 있음. `vibeops notion init --tasks-db <id>` 로 설정하세요.",
        };
  report.checks.push(tasksDbCheck);

  const envInputs = await loadNotionEnv(cwd);
  report.envSource = envInputs.source;
  report.hasToken = envInputs.token !== null;
  report.tokenMasked = envInputs.token === null ? null : maskToken(envInputs.token);

  const tokenCheck: CheckResult = envInputs.token
    ? {
        id: "env.notion.token",
        label: `NOTION_TOKEN 로드 (source: ${envInputs.source})`,
        ok: true,
        status: "ok",
        detail: report.tokenMasked!,
      }
    : {
        id: "env.notion.token",
        label: "NOTION_TOKEN 로드",
        ok: false,
        status: "fail",
        detail:
          "찾지 못함. .vibeops.env 에 `NOTION_TOKEN=secret_…` 을 추가하거나 환경변수로 설정.",
      };
  report.checks.push(tokenCheck);

  const canCallApi =
    config !== null &&
    notion !== null &&
    notion.enabled &&
    notion.projectsDatabaseId.length > 0 &&
    notion.tasksDatabaseId.length > 0 &&
    envInputs.token !== null;

  if (!canCallApi) {
    skipApi(report, "config / env 가 준비되지 않아 Notion API 호출 생략");
    return finalize(report, wantJson);
  }

  let client: NotionClient;
  try {
    client = await createNotionClient(envInputs.token!);
  } catch (err) {
    const apiErr = notionApiError(err);
    report.checks.push({
      id: "notion.sdk.load",
      label: "@notionhq/client 로드",
      ok: false,
      status: "fail",
      detail: apiErr.message,
      apiError: apiErr,
    });
    skipApi(report, "@notionhq/client 로드 실패");
    return finalize(report, wantJson);
  }

  report.checks.push({
    id: "notion.sdk.load",
    label: "@notionhq/client 로드",
    ok: true,
    status: "ok",
  });

  const usersMeOk = await runCheck({
    id: "notion.users.me",
    label: "Notion API 인증 (users.me)",
    run: async () => {
      const me = await client.usersMe();
      return { detail: `${me.type ?? "bot"} · ${me.id}` };
    },
  });
  report.checks.push(usersMeOk);
  if (!usersMeOk.ok) {
    skipApi(report, "users.me 실패로 인해 후속 검증 생략", [
      "notion.projects.retrieve",
      "notion.projects.schema",
      "notion.tasks.retrieve",
      "notion.tasks.schema",
    ]);
    return finalize(report, wantJson);
  }

  const projRetrieve = await runCheck({
    id: "notion.projects.retrieve",
    label: `databases.retrieve(projectsDatabaseId) 접근`,
    run: async () => {
      const db = await client.databasesRetrieve(notion!.projectsDatabaseId);
      return {
        detail: `id=${db.id}`,
        properties: db.properties,
      };
    },
  });
  report.checks.push(projRetrieve);

  if (projRetrieve.ok) {
    const violations = validateDatabaseSchema({
      db: "projects",
      required: PROJECTS_DB_PROPERTIES,
      properties: (projRetrieve as CheckResult & { properties?: Record<string, unknown> })
        .properties as Record<string, unknown>,
    });
    report.checks.push({
      id: "notion.projects.schema",
      label: "Projects DB 필수 속성 검증",
      ok: violations.length === 0,
      status: violations.length === 0 ? "ok" : "fail",
      ...(violations.length === 0
        ? { detail: `${PROJECTS_DB_PROPERTIES.length} 속성 모두 존재 및 타입 일치` }
        : { detail: `${violations.length} 위반`, violations }),
    });
  } else {
    report.checks.push({
      id: "notion.projects.schema",
      label: "Projects DB 필수 속성 검증",
      ok: false,
      status: "skip",
      detail: "DB 조회 실패로 인해 검증 생략",
    });
  }

  const tasksRetrieve = await runCheck({
    id: "notion.tasks.retrieve",
    label: `databases.retrieve(tasksDatabaseId) 접근`,
    run: async () => {
      const db = await client.databasesRetrieve(notion!.tasksDatabaseId);
      return {
        detail: `id=${db.id}`,
        properties: db.properties,
      };
    },
  });
  report.checks.push(tasksRetrieve);

  if (tasksRetrieve.ok) {
    const violations = validateDatabaseSchema({
      db: "tasks",
      required: TASKS_DB_PROPERTIES,
      properties: (tasksRetrieve as CheckResult & { properties?: Record<string, unknown> })
        .properties as Record<string, unknown>,
    });
    report.checks.push({
      id: "notion.tasks.schema",
      label: "Tasks DB 필수 속성 검증",
      ok: violations.length === 0,
      status: violations.length === 0 ? "ok" : "fail",
      ...(violations.length === 0
        ? { detail: `${TASKS_DB_PROPERTIES.length} 속성 모두 존재 및 타입 일치` }
        : { detail: `${violations.length} 위반`, violations }),
    });
  } else {
    report.checks.push({
      id: "notion.tasks.schema",
      label: "Tasks DB 필수 속성 검증",
      ok: false,
      status: "skip",
      detail: "DB 조회 실패로 인해 검증 생략",
    });
  }

  return finalize(report, wantJson);
}

interface RunCheckInputs {
  id: string;
  label: string;
  run: () => Promise<{ detail?: string; properties?: Record<string, unknown> }>;
}

async function runCheck(inputs: RunCheckInputs): Promise<CheckResult & { properties?: Record<string, unknown> }> {
  try {
    const r = await inputs.run();
    return {
      id: inputs.id,
      label: inputs.label,
      ok: true,
      status: "ok",
      ...(r.detail ? { detail: r.detail } : {}),
      ...(r.properties ? { properties: r.properties } : {}),
    };
  } catch (err) {
    const apiErr = notionApiError(err);
    return {
      id: inputs.id,
      label: inputs.label,
      ok: false,
      status: "fail",
      detail: explainNotionError(apiErr),
      apiError: apiErr,
    };
  }
}

function explainNotionError(err: NotionApiError): string {
  const tail = err.status ? ` (HTTP ${err.status})` : "";
  switch (err.code) {
    case "unauthorized":
      return `NOTION_TOKEN 이 거부됐다. integration 이 만료되었거나 잘못된 token 입니다.${tail}`;
    case "restricted_resource":
      return `Notion DB 가 integration 에 공유되지 않았습니다. DB 페이지 → ⋯ → Connections 에서 integration 을 추가하세요.${tail}`;
    case "object_not_found":
      return `database id 를 찾지 못했다. .vibeops.json 의 projects/tasksDatabaseId 가 올바른지 확인.${tail}`;
    case "validation_error":
      return `요청이 거부됐다 (validation_error): ${err.message}${tail}`;
    case "rate_limited":
      return `Notion API rate limit. 잠시 후 다시 시도.${tail}`;
    case "request_timeout":
    case "ETIMEDOUT":
      return `Notion API 5s timeout. 네트워크 상태를 확인하세요.${tail}`;
    default:
      return `${err.code}: ${err.message}${tail}`;
  }
}

function skipApi(report: TestReport, reason: string, ids: string[] = [
  "notion.sdk.load",
  "notion.users.me",
  "notion.projects.retrieve",
  "notion.projects.schema",
  "notion.tasks.retrieve",
  "notion.tasks.schema",
]): void {
  for (const id of ids) {
    if (report.checks.some((c) => c.id === id)) continue;
    report.checks.push({
      id,
      label: humanLabel(id),
      ok: false,
      status: "skip",
      detail: reason,
    });
  }
}

function humanLabel(id: string): string {
  switch (id) {
    case "notion.sdk.load":           return "@notionhq/client 로드";
    case "notion.users.me":            return "Notion API 인증 (users.me)";
    case "notion.projects.retrieve":   return "databases.retrieve(projectsDatabaseId) 접근";
    case "notion.projects.schema":     return "Projects DB 필수 속성 검증";
    case "notion.tasks.retrieve":      return "databases.retrieve(tasksDatabaseId) 접근";
    case "notion.tasks.schema":        return "Tasks DB 필수 속성 검증";
    default:                            return id;
  }
}

function finalize(report: TestReport, wantJson: boolean): void {
  report.ok = report.checks.every((c) => c.status === "ok");

  if (wantJson) {
    const sanitized = sanitizeForJson(report);
    process.stdout.write(`${JSON.stringify(sanitized, null, 2)}\n`);
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  log.info(bold("vibeops notion test"));
  log.info(`  ${dim("cwd")}  ${report.cwd}`);
  log.blank();
  for (const c of report.checks) {
    const tag =
      c.status === "ok"
        ? green("✓")
        : c.status === "skip"
          ? yellow("·")
          : red("✗");
    log.info(`  ${tag} ${c.label}`);
    if (c.detail) log.info(`      ${dim(c.detail)}`);
    if (c.violations && c.violations.length > 0) {
      for (const v of c.violations) {
        const tag2 = v.kind === "missing" ? red("missing") : red("type-mismatch");
        const detail =
          v.kind === "missing"
            ? `expected types: ${v.allowedTypes.join(" | ")}`
            : `expected ${v.allowedTypes.join(" | ")} but got ${v.actualType ?? "?"}`;
        log.info(`      · ${tag2} ${cyan(v.property)} — ${dim(detail)}`);
      }
    }
  }
  log.blank();
  if (report.ok) {
    log.ok("Notion 연결 OK — sync 직전 단계 모두 통과.");
    process.exitCode = 0;
  } else {
    const failed = report.checks.filter((c) => c.status === "fail").length;
    const skipped = report.checks.filter((c) => c.status === "skip").length;
    log.error(
      `Notion 연결 실패 — ${failed} fail${skipped > 0 ? `, ${skipped} skipped` : ""}.`,
    );
    log.info(
      dim(
        "  보안: NOTION_TOKEN 값은 마스킹되어 출력됐다. 실제 값은 .vibeops.env 에만 있다.",
      ),
    );
    process.exitCode = 1;
  }
}

function sanitizeForJson(report: TestReport): Record<string, unknown> {
  return {
    cwd: report.cwd,
    configPresent: report.configPresent,
    notion: report.notion
      ? {
          enabled: report.notion.enabled,
          projectsDatabaseId: report.notion.projectsDatabaseId,
          tasksDatabaseId: report.notion.tasksDatabaseId,
        }
      : null,
    env: {
      source: report.envSource,
      hasToken: report.hasToken,
      tokenMasked: report.tokenMasked,
    },
    ok: report.ok,
    checks: report.checks.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.status,
      ok: c.ok,
      ...(c.detail ? { detail: c.detail } : {}),
      ...(c.violations ? { violations: c.violations } : {}),
      ...(c.apiError ? { apiError: c.apiError } : {}),
    })),
  };
}
