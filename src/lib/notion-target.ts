/**
 * Resolve a user-stored Notion id (saved in `.vibeops.json` as a "database
 * id") to the underlying `data_source` that actually carries the property
 * schema.
 *
 * Why this exists
 * ───────────────
 * In the current Notion API ("2025-09-03" and later) a `database` object is a
 * shell that owns 0…N `data_source` children. The real schema (`properties`)
 * lives on the `data_source`. `databases.retrieve(id).properties` is
 * deprecated and frequently comes back `undefined` on workspaces that have
 * been migrated. Result: VibeOps' `notion test` / `notion sync` saw
 * `object=database`, no `properties`, and emitted `missing-properties`
 * violations even though the user's DB schema is fine.
 *
 * What this does
 * ──────────────
 * `resolveNotionDataSourceTarget(client, id, label)`:
 *
 *   A. Try `dataSources.retrieve(id)` first.
 *      - If the SDK supports it AND the response has a `properties` map → done.
 *      - If the SDK supports it but Notion responds 4xx, fall through.
 *      - If the SDK does **not** expose `client.dataSources` (null return),
 *        fall through.
 *   B. Try `databases.retrieve(id)`.
 *      - If the response has `data_sources[]` non-empty, pick `[0]` (warn if
 *        the array has more than one), then call `dataSources.retrieve` on
 *        that id.
 *      - If the response carries a legacy `properties` map (very old SDKs),
 *        treat the database id itself as the resolved target.
 *      - If `data_sources` is empty and there is no legacy `properties` map,
 *        return a structured `missing-properties` error pointing the user
 *        at the "share the data source with the integration" fix.
 *   C. Any unexpected exception is normalised through `notionApiError` so
 *      callers never get a raw SDK Error / TypeError.
 *
 * Read-only. No mutation. Never logs the token. Returns `{ ok: true | false,
 * … }` — no exceptions for the documented failure modes.
 */

import {
  extractDataSourcesFromDatabaseResponse,
  notionApiError,
  type NotionApiError,
  type NotionClient,
} from "./notion-client.js";
import {
  getNotionProperties,
  readNotionObjectKind,
} from "./notion-schema.js";

/** Why VibeOps chose this resolved target. */
export type ResolveSource =
  /** the input id was itself a data_source — `dataSources.retrieve(id)` worked */
  | "input-data-source"
  /** the input id was a database; we used `database.data_sources[0]` */
  | "database-default-data-source"
  /** legacy SDK / legacy workspace — the database object itself carried `properties` */
  | "legacy-database";

export interface ResolvedNotionTarget {
  ok: true;
  /** id the caller saved (unchanged) */
  inputId: string;
  /** id whose `properties` we actually validated against */
  resolvedId: string;
  /** label of the configured DB ("projects" | "tasks"); echoed for logs */
  label: string;
  /** object kind of the resolved target — "data_source" or "database" */
  resolvedObject: "data_source" | "database" | string;
  /** object kind of the input id (what Notion called it on the first call) */
  inputObject: "data_source" | "database" | string;
  /** how we found this target */
  source: ResolveSource;
  /** title text (if Notion echoed it), for diagnostic display */
  title?: string;
  /** id of the parent database (for `database-default-data-source`) */
  parentDatabaseId?: string;
  /** raw `properties` map — validated downstream */
  properties: Record<string, unknown>;
  /**
   * Soft warnings (e.g. "database has 3 data sources — used [0]; ids: …").
   * Empty when nothing notable happened.
   */
  warnings: string[];
}

export type ResolveFailureReason =
  /** SDK was missing `dataSources` AND database retrieve had no usable schema */
  | "no-data-source"
  /** transport failure on whichever endpoint we ultimately depended on */
  | "transport"
  /** the resolved data_source returned a properties-less shape */
  | "no-properties";

export interface ResolveFailure {
  ok: false;
  inputId: string;
  label: string;
  reason: ResolveFailureReason;
  /** user-facing message (already sanitised — never echoes the token) */
  message: string;
  /** underlying Notion error, if any */
  apiError?: NotionApiError;
  /** any partial diagnostic we managed to collect before failing */
  partial?: {
    inputObject?: string;
    childDataSourceIds?: string[];
  };
}

export type ResolveResult = ResolvedNotionTarget | ResolveFailure;

interface DataSourceRetrieveOutcome {
  ok: boolean;
  /** raw response when `ok === true` */
  response?: {
    id: string;
    object?: string;
    title?: unknown;
    properties?: Record<string, unknown>;
    parent?: { database_id?: string };
  } | null;
  /** when `ok === false`, the underlying error */
  apiError?: NotionApiError;
  /**
   * Set to `true` when the SDK did not expose `dataSourcesRetrieve`. This is
   * the "fall through to databases.retrieve" path — *not* a real failure.
   */
  sdkMissing?: boolean;
}

async function tryDataSourcesRetrieve(
  client: NotionClient,
  id: string,
): Promise<DataSourceRetrieveOutcome> {
  try {
    const res = await client.dataSourcesRetrieve(id);
    if (res === null) {
      return { ok: false, sdkMissing: true };
    }
    return { ok: true, response: res };
  } catch (err) {
    return { ok: false, apiError: notionApiError(err) };
  }
}

interface DatabaseRetrieveOutcome {
  ok: boolean;
  /** raw response (typed loosely — we parse via `extractDataSourcesFromDatabaseResponse`) */
  response?: unknown;
  apiError?: NotionApiError;
}

async function tryDatabasesRetrieve(
  client: NotionClient,
  id: string,
): Promise<DatabaseRetrieveOutcome> {
  try {
    const res = (await client.databasesRetrieve(id)) as unknown;
    return { ok: true, response: res };
  } catch (err) {
    return { ok: false, apiError: notionApiError(err) };
  }
}

function readTitleText(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined;
  const text = raw
    .map((seg) => (seg as { plain_text?: string }).plain_text ?? "")
    .join("")
    .trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Common tail for resolver error messages — points the user at the new
 * `--debug-shape` diagnostic when they need to inspect what Notion actually
 * returned.
 */
const HINT_DEBUG_SHAPE =
  "Run `vibeops notion test --debug-shape` to inspect the Notion response shape.";

const HINT_NO_DATA_SOURCE =
  "Notion returned no data_sources for this database. The integration may " +
  "be connected to the parent page only — open the database as a full page " +
  "in Notion and add the VibeOps integration directly via its " +
  "'⋯ → Connections' menu. " +
  HINT_DEBUG_SHAPE;

const HINT_NO_PROPERTIES =
  "Resolved a data_source but it returned no `properties` map. " +
  "This usually means the integration has access to the database shell " +
  "but not the underlying data_source. Open the data source and add the " +
  "VibeOps integration to it. " +
  HINT_DEBUG_SHAPE;

/**
 * Main entry point.
 *
 * Steps A → B → fail, as documented at the top of this file. `label` is
 * `"projects"` / `"tasks"` etc. and is only used for diagnostic strings.
 */
export async function resolveNotionDataSourceTarget(
  client: NotionClient,
  id: string,
  label: string,
): Promise<ResolveResult> {
  const warnings: string[] = [];

  // ── A. Try dataSources.retrieve(id) directly ─────────────────────────
  const dsOutcome = await tryDataSourcesRetrieve(client, id);
  if (dsOutcome.ok && dsOutcome.response) {
    const ds = dsOutcome.response;
    const props = getNotionProperties(ds);
    if (props !== null) {
      return {
        ok: true,
        inputId: id,
        resolvedId: typeof ds.id === "string" && ds.id.length > 0 ? ds.id : id,
        label,
        inputObject: readNotionObjectKind(ds),
        resolvedObject: "data_source",
        source: "input-data-source",
        ...(readTitleText(ds.title) !== undefined
          ? { title: readTitleText(ds.title) as string }
          : {}),
        ...(typeof ds.parent?.database_id === "string"
          ? { parentDatabaseId: ds.parent.database_id }
          : {}),
        properties: props,
        warnings,
      };
    }
    warnings.push(
      `dataSources.retrieve(${id}) succeeded but returned no properties map.`,
    );
  } else if (
    dsOutcome.apiError !== undefined &&
    dsOutcome.apiError.code !== "object_not_found" &&
    dsOutcome.apiError.code !== "validation_error" &&
    dsOutcome.apiError.code !== "unknown_error"
  ) {
    // unauthorized / restricted_resource / rate_limited / timeout — surface
    // these immediately rather than masquerading as a missing data source.
    return {
      ok: false,
      inputId: id,
      label,
      reason: "transport",
      message: dsOutcome.apiError.message,
      apiError: dsOutcome.apiError,
    };
  } else if (
    dsOutcome.apiError !== undefined &&
    dsOutcome.apiError.code === "object_not_found"
  ) {
    warnings.push(
      `dataSources.retrieve(${id}) → object_not_found (id is likely a database id, falling back).`,
    );
  }
  // (sdkMissing or 4xx that we want to fall through)

  // ── B. Try databases.retrieve(id) ────────────────────────────────────
  const dbOutcome = await tryDatabasesRetrieve(client, id);
  if (!dbOutcome.ok || dbOutcome.response === undefined) {
    const apiErr = dbOutcome.apiError ?? {
      ok: false as const,
      code: "unknown_error",
      message: "databases.retrieve failed without a structured error.",
    };
    return {
      ok: false,
      inputId: id,
      label,
      reason: "transport",
      message: apiErr.message,
      apiError: apiErr,
    };
  }
  const db = dbOutcome.response as Record<string, unknown>;
  const inputObject = readNotionObjectKind(db);
  const dbProps = getNotionProperties(db);
  const dbTitle = readTitleText((db as { title?: unknown }).title);
  const dbId =
    typeof (db as { id?: unknown }).id === "string" && ((db as { id: string }).id).length > 0
      ? ((db as { id: string }).id)
      : id;

  // Centralised parser handles `data_sources` / `dataSources` /
  // `child_data_sources` / `childDataSources` + nested `data_source.id`.
  const extracted = extractDataSourcesFromDatabaseResponse(db);
  if (extracted.field !== null && extracted.field !== "data_sources") {
    warnings.push(
      `database response carried data sources under '${extracted.field}' (non-canonical naming).`,
    );
  }
  const childIds = extracted.items.map((it) => it.id);

  // ── Legacy SDK / very old workspace: properties on database itself ───
  if (dbProps !== null && childIds.length === 0) {
    warnings.push(
      "Legacy database object carries a `properties` map directly — using it (no data_source fallback needed).",
    );
    return {
      ok: true,
      inputId: id,
      resolvedId: dbId,
      label,
      inputObject,
      resolvedObject: "database",
      source: "legacy-database",
      ...(dbTitle !== undefined ? { title: dbTitle } : {}),
      properties: dbProps,
      warnings,
    };
  }

  if (childIds.length === 0) {
    return {
      ok: false,
      inputId: id,
      label,
      reason: "no-data-source",
      message: HINT_NO_DATA_SOURCE,
      partial: { inputObject, childDataSourceIds: [] },
    };
  }

  if (childIds.length > 1) {
    warnings.push(
      `database has ${childIds.length} data_sources — used [0]; ids: ${childIds.join(", ")}.`,
    );
  }

  const chosenId = childIds[0]!;
  const childOutcome = await tryDataSourcesRetrieve(client, chosenId);
  if (!childOutcome.ok || childOutcome.response === undefined || childOutcome.response === null) {
    const apiErr = childOutcome.apiError ?? {
      ok: false as const,
      code: "unknown_error",
      message: `dataSources.retrieve(${chosenId}) failed without a structured error.`,
    };
    return {
      ok: false,
      inputId: id,
      label,
      reason: "transport",
      message: apiErr.message,
      apiError: apiErr,
      partial: { inputObject, childDataSourceIds: childIds },
    };
  }
  const child = childOutcome.response;
  const childProps = getNotionProperties(child);
  if (childProps === null) {
    return {
      ok: false,
      inputId: id,
      label,
      reason: "no-properties",
      message: `Resolved data_source ${chosenId} returned no properties map. ${HINT_NO_PROPERTIES}`,
      partial: { inputObject, childDataSourceIds: childIds },
    };
  }
  return {
    ok: true,
    inputId: id,
    resolvedId: typeof child.id === "string" && child.id.length > 0 ? child.id : chosenId,
    label,
    inputObject,
    resolvedObject: "data_source",
    source: "database-default-data-source",
    ...(readTitleText(child.title) !== undefined
      ? { title: readTitleText(child.title) as string }
      : {}),
    parentDatabaseId: dbId,
    properties: childProps,
    warnings,
  };
}
