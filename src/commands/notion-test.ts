import { resolve } from "node:path";

import {
  notionProjectsTargetId,
  notionTasksTargetId,
  readConfig,
} from "../lib/config.js";
import { bold, cyan, dim, green, log, red, yellow } from "../lib/logger.js";
import { loadNotionEnv, maskToken, type NotionEnvInputs } from "../lib/notion-env.js";
import {
  createNotionClient,
  notionApiError,
  type DatabaseShapeProbe,
  type NotionApiError,
  type NotionClient,
} from "../lib/notion-client.js";
import {
  PROJECTS_DB_PROPERTIES,
  TASKS_DB_PROPERTIES,
  validateDatabaseSchema,
  type SchemaViolation,
} from "../lib/notion-schema.js";
import {
  resolveNotionDataSourceTarget,
  type ResolveResult,
} from "../lib/notion-target.js";
import { projectPaths } from "../lib/paths.js";
import type { NotionConfig } from "../types/config.js";

export interface NotionTestOptions {
  json?: boolean;
  /**
   * When set, emit a token-safe `databases.retrieve` shape probe for each
   * configured DB (`top-level keys`, `has properties`, `data_sources` count
   * + ids/names). Never includes the bearer token, property values, or
   * page content. Surfaces under the `debugShape` JSON key in `--json`.
   */
  debugShape?: boolean;
  cwd?: string;
}

interface ShapeProbeEntry {
  kind: "projects" | "tasks";
  inputId: string;
  resolvedDataSourceId?: string;
  source?: string;
  hasProperties?: boolean;
  propertiesKeysCount?: number;
  schemaHint?: "project" | "task" | "unknown";
  shape?: DatabaseShapeProbe;
  /** populated when retrieve threw (e.g. 404) — `shape` is omitted */
  error?: { code: string; status?: number; message: string };
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
  /** Populated only when `--debug-shape` is set. */
  debugShape?: ShapeProbeEntry[];
  ok: boolean;
}

export async function notionTestCommand(options: NotionTestOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const wantJson = options.json === true;
  const wantShape = options.debugShape === true;

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

  const projectsInputId = notion === null ? "" : notionProjectsTargetId(notion);
  const tasksInputId = notion === null ? "" : notionTasksTargetId(notion);

  const projDbCheck: CheckResult =
    notion && projectsInputId.length > 0
      ? {
          id: "config.notion.projectsTarget",
          label: "notion.projectsTargetId/projectsDatabaseId 설정",
          ok: true,
          status: "ok",
          detail:
            notion.projectsTargetId.length > 0
              ? `projectsTargetId=${notion.projectsTargetId}`
              : `projectsDatabaseId=${notion.projectsDatabaseId}`,
        }
      : {
          id: "config.notion.projectsTarget",
          label: "notion.projectsTargetId/projectsDatabaseId 설정",
          ok: false,
          status: "fail",
          detail:
            "비어 있음. `vibeops notion init` 으로 data_source target 을 찾거나 `--projects-db <id>` 로 fallback 설정하세요.",
        };
  report.checks.push(projDbCheck);

  const tasksDbCheck: CheckResult =
    notion && tasksInputId.length > 0
      ? {
          id: "config.notion.tasksTarget",
          label: "notion.tasksTargetId/tasksDatabaseId 설정",
          ok: true,
          status: "ok",
          detail:
            notion.tasksTargetId.length > 0
              ? `tasksTargetId=${notion.tasksTargetId}`
              : `tasksDatabaseId=${notion.tasksDatabaseId}`,
        }
      : {
          id: "config.notion.tasksTarget",
          label: "notion.tasksTargetId/tasksDatabaseId 설정",
          ok: false,
          status: "fail",
          detail:
            "비어 있음. `vibeops notion init` 으로 data_source target 을 찾거나 `--tasks-db <id>` 로 fallback 설정하세요.",
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
    projectsInputId.length > 0 &&
    tasksInputId.length > 0 &&
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

  if (wantShape) {
    report.debugShape = [];
    for (const kind of ["projects", "tasks"] as const) {
      const inputId = kind === "projects" ? projectsInputId : tasksInputId;
      try {
        const resolved = await resolveNotionDataSourceTarget(client, inputId, kind);
        if (resolved.ok) {
          const configuredContainer =
            kind === "projects" ? notion!.projectsDatabaseId : notion!.tasksDatabaseId;
          const configuredTarget =
            kind === "projects" ? notion!.projectsTargetId : notion!.tasksTargetId;
          const projectViolations = validateDatabaseSchema({
            db: "projects",
            required: PROJECTS_DB_PROPERTIES,
            retrieveResponse: resolved.properties,
          });
          const taskViolations = validateDatabaseSchema({
            db: "tasks",
            required: TASKS_DB_PROPERTIES,
            retrieveResponse: resolved.properties,
          });
          const schemaHint =
            projectViolations.length === 0
              ? "project"
              : taskViolations.length === 0
                ? "task"
                : "unknown";
          report.debugShape.push({
            kind,
            inputId,
            resolvedDataSourceId: resolved.resolvedId,
            source: debugSourceLabel({
              rawSource: resolved.source,
              configuredTarget,
              configuredContainer,
              inputId,
            }),
            hasProperties: true,
            propertiesKeysCount: Object.keys(resolved.properties).length,
            schemaHint,
          });
          continue;
        }
      } catch {
        // Keep going to the raw database-shape probe below.
      }
      try {
        const shape = await client.probeDatabaseShape(inputId);
        report.debugShape.push({ kind, inputId, shape });
      } catch (err) {
        const apiErr = notionApiError(err);
        report.debugShape.push({
          kind,
          inputId,
          error: {
            code: apiErr.code,
            ...(apiErr.status !== undefined ? { status: apiErr.status } : {}),
            message: apiErr.message,
          },
        });
      }
    }
  }

  await runResolveAndSchema(client, projectsInputId, "projects", report);
  await runResolveAndSchema(client, tasksInputId, "tasks", report);

  return finalize(report, wantJson);
}

function debugSourceLabel(inputs: {
  rawSource: string;
  configuredTarget: string;
  configuredContainer: string;
  inputId: string;
}): "direct-data-source" | "database-data-source" | "page-child-database" | string {
  if (
    inputs.configuredTarget.length > 0 &&
    inputs.configuredContainer.length > 0 &&
    inputs.inputId === inputs.configuredTarget
  ) {
    return "page-child-database";
  }
  if (inputs.rawSource === "input-data-source") return "direct-data-source";
  if (inputs.rawSource === "database-default-data-source") return "database-data-source";
  return inputs.rawSource;
}

/**
 * Shared resolve + schema-check pair — keeps `notion test` in lock-step with
 * `notion sync`. Both go through `resolveNotionDataSourceTarget` so the
 * `database → data_source` fallback path applies uniformly.
 *
 * Emits three checks per kind:
 *   - `notion.{kind}.retrieve`  — the `database` retrieve call (transport).
 *   - `notion.{kind}.resolve`   — the resolver result (input id → resolved id).
 *   - `notion.{kind}.schema`    — the property-schema validation.
 */
async function runResolveAndSchema(
  client: NotionClient,
  inputId: string,
  kind: "projects" | "tasks",
  report: TestReport,
): Promise<void> {
  const required = kind === "projects" ? PROJECTS_DB_PROPERTIES : TASKS_DB_PROPERTIES;
  const retrieveId = `notion.${kind}.retrieve`;
  const resolveId = `notion.${kind}.resolve`;
  const schemaId = `notion.${kind}.schema`;
  const labelDb = kind === "projects" ? "Projects DB" : "Tasks DB";

  let resolved: ResolveResult;
  try {
    resolved = await resolveNotionDataSourceTarget(client, inputId, kind);
  } catch (err) {
    const apiErr = notionApiError(err);
    report.checks.push({
      id: retrieveId,
      label: `${labelDb} retrieve 접근`,
      ok: false,
      status: "fail",
      detail: explainNotionError(apiErr),
      apiError: apiErr,
    });
    report.checks.push({
      id: resolveId,
      label: `${labelDb} target 해석 (database → data_source)`,
      ok: false,
      status: "skip",
      detail: "retrieve 실패로 인해 해석 생략",
    });
    report.checks.push({
      id: schemaId,
      label: `${labelDb} 필수 속성 검증`,
      ok: false,
      status: "skip",
      detail: "retrieve 실패로 인해 검증 생략",
    });
    return;
  }

  // `notion.{kind}.retrieve` — pass when resolver got past at least one Notion call.
  if (resolved.ok) {
    report.checks.push({
      id: retrieveId,
      label: `${labelDb} retrieve 접근`,
      ok: true,
      status: "ok",
      detail: `input id=${inputId}  input object=${resolved.inputObject}`,
    });
  } else if (resolved.reason === "transport") {
    report.checks.push({
      id: retrieveId,
      label: `${labelDb} retrieve 접근`,
      ok: false,
      status: "fail",
      detail: resolved.message,
      ...(resolved.apiError !== undefined ? { apiError: resolved.apiError } : {}),
    });
    report.checks.push({
      id: resolveId,
      label: `${labelDb} target 해석 (database → data_source)`,
      ok: false,
      status: "skip",
      detail: "retrieve 실패로 인해 해석 생략",
    });
    report.checks.push({
      id: schemaId,
      label: `${labelDb} 필수 속성 검증`,
      ok: false,
      status: "skip",
      detail: "retrieve 실패로 인해 검증 생략",
    });
    return;
  } else {
    // resolver did the database retrieve OK but found no usable data_source.
    report.checks.push({
      id: retrieveId,
      label: `${labelDb} retrieve 접근`,
      ok: true,
      status: "ok",
      detail: `input id=${inputId}  input object=${resolved.partial?.inputObject ?? "(unknown)"}`,
    });
  }

  // `notion.{kind}.resolve`
  if (resolved.ok) {
    const detail =
      `input id=${resolved.inputId}  input object=${resolved.inputObject}  ` +
      `resolved id=${resolved.resolvedId}  resolved object=${resolved.resolvedObject}  ` +
      `source=${resolved.source}`;
    report.checks.push({
      id: resolveId,
      label: `${labelDb} target 해석 (database → data_source)`,
      ok: true,
      status: "ok",
      detail,
    });
  } else {
    report.checks.push({
      id: resolveId,
      label: `${labelDb} target 해석 (database → data_source)`,
      ok: false,
      status: "fail",
      detail: resolved.message,
    });
    report.checks.push({
      id: schemaId,
      label: `${labelDb} 필수 속성 검증`,
      ok: false,
      status: "skip",
      detail: "target 해석 실패로 인해 검증 생략",
    });
    return;
  }

  // `notion.{kind}.schema`
  const violations = validateDatabaseSchema({
    db: kind,
    required,
    retrieveResponse: resolved.properties,
  });
  report.checks.push({
    id: schemaId,
    label: `${labelDb} 필수 속성 검증`,
    ok: violations.length === 0,
    status: violations.length === 0 ? "ok" : "fail",
    ...(violations.length === 0
      ? { detail: `${required.length} 속성 모두 존재 및 타입 일치` }
      : { detail: `${violations.length} 위반`, violations }),
  });
}

interface RunCheckInputs {
  id: string;
  label: string;
  run: () => Promise<{ detail?: string }>;
}

async function runCheck(inputs: RunCheckInputs): Promise<CheckResult> {
  try {
    const r = await inputs.run();
    return {
      id: inputs.id,
      label: inputs.label,
      ok: true,
      status: "ok",
      ...(r.detail ? { detail: r.detail } : {}),
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
  if (report.debugShape !== undefined && report.debugShape.length > 0) {
    for (const probe of report.debugShape) {
      const kindLabel = probe.kind === "projects" ? "Projects DB shape" : "Tasks DB shape";
      log.info(`  ${bold(kindLabel)}  ${dim(`input id=${probe.inputId}`)}`);
      if (probe.error !== undefined) {
        log.info(
          `    ${dim("retrieve failed:")} ${red(probe.error.code)}${probe.error.status !== undefined ? ` (HTTP ${probe.error.status})` : ""} — ${probe.error.message}`,
        );
        continue;
      }
      if (probe.resolvedDataSourceId !== undefined) {
        log.info(`    ${dim("selected input id  ")} ${cyan(probe.inputId)}`);
        log.info(`    ${dim("resolved source    ")} ${probe.source ?? "(unknown)"}`);
        log.info(`    ${dim("resolved data src ")} ${cyan(probe.resolvedDataSourceId)}`);
        log.info(
          `    ${dim("has properties    ")} ${probe.hasProperties ? green("yes") : red("no")}`,
        );
        log.info(
          `    ${dim("property keys     ")} ${String(probe.propertiesKeysCount ?? 0)}`,
        );
        log.info(`    ${dim("schema hint       ")} ${probe.schemaHint ?? "unknown"}`);
        continue;
      }
      const s = probe.shape!;
      log.info(`    ${dim("object             ")} ${s.object}`);
      log.info(`    ${dim("id                 ")} ${cyan(s.id)}`);
      if (s.title !== undefined) {
        log.info(`    ${dim("title              ")} ${s.title}`);
      }
      log.info(
        `    ${dim("has properties     ")} ${s.hasProperties ? green("yes") : red("no")}${s.hasProperties ? ` ${dim(`(len=${s.propertiesKeysLength})`)}` : ""}`,
      );
      log.info(
        `    ${dim("data_sources       ")} ${s.hasDataSources ? "" : red("not present")}${s.hasDataSources ? `${cyan(`${s.dataSourcesLength}`)}${s.dataSourcesField !== undefined && s.dataSourcesField !== "data_sources" ? ` ${yellow(`(via '${s.dataSourcesField}')`)}` : ""}` : ""}`,
      );
      for (const ref of s.dataSources) {
        log.info(`      ${dim("-")} id=${cyan(ref.id)}${ref.name !== undefined ? `  name=${ref.name}` : ""}`);
      }
      log.info(
        `    ${dim("top-level keys     ")} ${s.topLevelKeys.join(", ")}`,
      );
    }
    log.blank();
  }
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
        if (
          v.kind === "status-options-missing" ||
          v.kind === "status-options-unreadable"
        ) {
          const tag2 = red(
            v.kind === "status-options-missing"
              ? "status-options-missing"
              : "status-options-unreadable",
          );
          log.info(`      · ${tag2} ${cyan(v.property)}`);
          if (
            v.kind === "status-options-missing" &&
            v.missingOptions !== undefined &&
            v.missingOptions.length > 0
          ) {
            log.info(`          ${dim("missing")} ${v.missingOptions.join(", ")}`);
          }
          if (v.requiredOptions !== undefined && v.requiredOptions.length > 0) {
            log.info(
              `          ${dim("Add these options in Notion")}:  Status property → Edit options → ${v.requiredOptions.join(", ")}`,
            );
          }
          if (
            v.kind === "status-options-missing" &&
            v.foundOptions !== undefined &&
            v.foundOptions.length > 0
          ) {
            log.info(
              `          ${dim("found in Notion")}: ${v.foundOptions.join(", ")}`,
            );
          }
          continue;
        }
        const tag2 =
          v.kind === "missing"
            ? red("missing")
            : v.kind === "type-mismatch"
              ? red("type-mismatch")
              : v.kind === "missing-properties"
                ? red("missing-properties")
                : red(v.kind);
        const detail =
          v.kind === "missing"
            ? `expected types: ${v.allowedTypes.join(" | ")}`
            : v.kind === "type-mismatch"
              ? `expected ${v.allowedTypes.join(" | ")} but got ${v.actualType ?? "?"}`
              : v.description;
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
          projectsTargetId: report.notion.projectsTargetId,
          tasksTargetId: report.notion.tasksTargetId,
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
    ...(report.debugShape !== undefined
      ? { debugShape: report.debugShape }
      : {}),
  };
}
