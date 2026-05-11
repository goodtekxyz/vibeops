/**
 * Database discovery for `vibeops notion init`.
 *
 * `vibeops notion init` calls `discoverDatabases(client)` after the user has
 * pasted a `NOTION_TOKEN`. We hit `POST /v1/search` (objectFilter="data_source"),
 * normalize each result into a `NotionDatabaseChoice`, and score it against
 * the Projects and Tasks schema requirements so the init command can show the
 * most likely candidates at the top of the select prompt.
 *
 * The current Notion API rejects `objectFilter: "database"` with a
 * `validation_error` ("body.filter.value should be `\"page\"` or
 * `\"data_source\"`"). `data_source` objects carry the same `{ id, title,
 * properties }` shape as legacy database results, so the rest of the pipeline
 * treats them identically. If `data_source` itself somehow trips an SDK
 * environment, we fall back to `"page"` once (which simply returns 0 db hits
 * after the kind filter, and gracefully drops the user into the manual id
 * entry path).
 *
 * Read-only — no mutation, no token logging.
 */

import {
  extractDataSourcesFromDatabaseResponse,
  type NotionBlock,
  type NotionClient,
  type NotionSearchHit,
  type NotionSearchObjectFilter,
} from "./notion-client.js";
import {
  PROJECTS_DB_PROPERTIES,
  TASKS_DB_PROPERTIES,
  getNotionProperties,
  type PropertyRequirement,
} from "./notion-schema.js";

/**
 * VibeOps cap. Notion API itself allows up to 100 results per page.
 * 50 keeps the init select prompt readable.
 */
export const NOTION_DISCOVERY_MAX = 50;

const UNTITLED = "(Untitled database)";

function readNotionTitle(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  const text = raw
    .map((seg) => (seg as { plain_text?: string }).plain_text ?? "")
    .join("");
  return text.trim();
}

export type DiscoveryKind = "projects" | "tasks" | "neither";

export interface DatabaseScore {
  /** number of required props that match by name + allowed type */
  matched: number;
  /** number of required props that are missing entirely */
  missing: number;
  /** number of required props that exist but have the wrong type */
  typeMismatch: number;
  /** denominator (total required props for this kind) */
  total: number;
}

export interface NotionDatabaseChoice {
  /** stable Notion database/data_source id */
  id: string;
  /** trimmed plain-text title, or `(Untitled database)` */
  title: string;
  /**
   * Object kind as it appeared in Notion.
   *   - `"data_source"` — current Notion search API.
   *   - `"database"` — legacy search API (some workspaces still return this).
   *   - `"child_database"` — block found via `blocks.children.list` (inline DB).
   *   - other strings — passed through (we don't crash on unknowns).
   */
  object: "database" | "data_source" | "child_database" | string;
  /** Notion-hosted URL (may be undefined when search omits it) */
  url?: string;
  /** raw `properties` map if Notion returned it; used by recommendation scorer */
  properties?: Record<string, unknown>;
  /**
   * How VibeOps found this candidate.
   *   - `"search"`     — returned by `/v1/search` directly.
   *   - `"page-block"` — legacy label for extracted page child blocks.
   *   - `"page-child-database"` — resolved from page child_database → database → data_source.
   * Used by the init UI to render a different choice label suffix.
   */
  source?: "search" | "page-block" | "page-child-database";
  /** child_database/container id when source === "page-child-database" */
  databaseId?: string;
  /** resolved data_source id when source === "page-child-database" */
  dataSourceId?: string;
  /** best schema fit for UI labels */
  schemaKindHint?: "projects" | "tasks" | "unknown";
  /** Title of the parent page for `source === "page-block"` candidates. */
  parentPageTitle?: string;
  /** Id of the parent page for `source === "page-block"` candidates. */
  parentPageId?: string;
  /** how well this DB matches the Projects schema */
  projectsScore: DatabaseScore;
  /** how well this DB matches the Tasks schema */
  tasksScore: DatabaseScore;
}

function emptyScore(total: number): DatabaseScore {
  return { matched: 0, missing: total, typeMismatch: 0, total };
}

function scoreAgainst(
  properties: Record<string, unknown> | undefined,
  required: readonly PropertyRequirement[],
): DatabaseScore {
  if (properties === undefined || properties === null) {
    return emptyScore(required.length);
  }
  let matched = 0;
  let missing = 0;
  let typeMismatch = 0;
  for (const req of required) {
    const prop = properties[req.name];
    if (prop === undefined || prop === null) {
      missing++;
      continue;
    }
    const actualType =
      typeof (prop as { type?: unknown }).type === "string"
        ? (prop as { type: string }).type
        : "";
    if (req.allowedTypes.includes(actualType as never)) {
      matched++;
    } else {
      typeMismatch++;
    }
  }
  return { matched, missing, typeMismatch, total: required.length };
}

export function normalizeHit(hit: NotionSearchHit): NotionDatabaseChoice {
  const title = readNotionTitle(hit.title);
  const properties =
    typeof hit.properties === "object" && hit.properties !== null
      ? (hit.properties as Record<string, unknown>)
      : undefined;
  const projectsScore = scoreAgainst(properties, PROJECTS_DB_PROPERTIES);
  const tasksScore = scoreAgainst(properties, TASKS_DB_PROPERTIES);
  const schemaKindHint =
    projectsScore.matched >= 4 && projectsScore.matched >= tasksScore.matched
      ? "projects"
      : tasksScore.matched >= 5 && tasksScore.matched > projectsScore.matched
        ? "tasks"
        : "unknown";
  return {
    id: hit.id,
    title: title.length > 0 ? title : UNTITLED,
    object: hit.object,
    ...(typeof hit.url === "string" && hit.url.length > 0 ? { url: hit.url } : {}),
    ...(properties !== undefined ? { properties } : {}),
    source: "search",
    schemaKindHint,
    projectsScore,
    tasksScore,
  };
}

export interface DiscoveryResult {
  /** Normalised hits sorted in the order they came back from Notion. */
  databases: NotionDatabaseChoice[];
  /** Did Notion say there were more pages we did not fetch? */
  truncated: boolean;
  /** Total raw hits seen (before dedup). */
  totalHits: number;
  /**
   * Which object filter eventually produced the results.
   * `null` when we did not fall back (i.e. `data_source` succeeded as expected).
   */
  filterUsed: NotionSearchObjectFilter;
  /**
   * Filter we attempted first but had to abandon because Notion rejected it
   * (validation_error). `undefined` when no fallback was needed.
   */
  fallbackFrom?: NotionSearchObjectFilter;
}

/**
 * Type re-export of the normalized data-source record.
 *
 * Older code (and TASK-010 spec) refers to these objects as "database"; the
 * current Notion API exposes them as `data_source` objects. The shape is
 * identical, so VibeOps keeps a single normalized type and offers
 * `NotionDataSourceChoice` as a clearer alias for new call sites.
 */
export type NotionDataSourceChoice = NotionDatabaseChoice;

function schemaKindHintForScores(
  projectsScore: DatabaseScore,
  tasksScore: DatabaseScore,
): "projects" | "tasks" | "unknown" {
  return projectsScore.matched >= 4 && projectsScore.matched >= tasksScore.matched
    ? "projects"
    : tasksScore.matched >= 5 && tasksScore.matched > projectsScore.matched
      ? "tasks"
      : "unknown";
}

interface NotionRawSearchError {
  status?: number;
  code?: string;
  message?: string;
}

/**
 * Best-effort detection of "current API rejects this object filter" errors.
 * Notion currently returns:
 *   400 / code = "validation_error"
 *   message contains: "should be `\"page\"` or `\"data_source\"`"
 */
function isUnsupportedObjectFilterError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const e = err as NotionRawSearchError;
  if (e.code === "validation_error") return true;
  if (e.status === 400 && typeof e.message === "string") {
    const m = e.message.toLowerCase();
    if (m.includes("data_source") || m.includes("body.filter.value")) {
      return true;
    }
  }
  return false;
}

async function runSearchPaginated(
  client: NotionClient,
  filter: NotionSearchObjectFilter,
): Promise<DiscoveryResult> {
  const seen = new Set<string>();
  const databases: NotionDatabaseChoice[] = [];
  let cursor: string | null = null;
  let totalHits = 0;
  let truncated = false;
  while (databases.length < NOTION_DISCOVERY_MAX) {
    const res = (await client.search({
      objectFilter: filter,
      pageSize: Math.min(50, NOTION_DISCOVERY_MAX - databases.length),
      ...(cursor !== null ? { startCursor: cursor } : {}),
    })) as {
      results: NotionSearchHit[];
      hasMore: boolean;
      nextCursor: string | null;
    };
    totalHits += res.results.length;
    for (const hit of res.results) {
      if (typeof hit.id !== "string" || hit.id.length === 0) continue;
      if (seen.has(hit.id)) continue;
      // Keep the historically-allowed kinds even if the request filter was
      // different (Notion is mid-migration: some workspaces still echo
      // `database` objects through `data_source` searches).
      if (
        hit.object !== "database" &&
        hit.object !== "data_source"
      ) {
        continue;
      }
      seen.add(hit.id);
      databases.push(normalizeHit(hit));
      if (databases.length >= NOTION_DISCOVERY_MAX) break;
    }
    if (databases.length >= NOTION_DISCOVERY_MAX) {
      truncated = res.hasMore === true;
      break;
    }
    if (!res.hasMore || res.nextCursor === null) {
      truncated = false;
      break;
    }
    cursor = res.nextCursor;
    if (cursor === null) break;
  }
  return { databases, truncated, totalHits, filterUsed: filter };
}

/**
 * Hit `POST /v1/search` and normalize the response.
 *
 * Strategy:
 *   1. Try `objectFilter: "data_source"` — this is the only value accepted by
 *      the current Notion API for database-style objects.
 *   2. If Notion responds with `validation_error` (extremely rare — happens
 *      on legacy SDK builds that wrap the filter differently), fall back to
 *      `objectFilter: "page"` once. Pages get filtered out by our kind guard,
 *      so the caller sees an empty list and is steered to manual id entry.
 *      We surface `fallbackFrom` in the result so callers can log a hint.
 *   3. The legacy `objectFilter: "database"` is **never** sent — Notion now
 *      rejects it.
 *
 * Read-only — no mutation, no token logging.
 */
export async function discoverDatabases(
  client: NotionClient,
): Promise<DiscoveryResult> {
  try {
    return await runSearchPaginated(client, "data_source");
  } catch (err) {
    if (!isUnsupportedObjectFilterError(err)) {
      // Re-throw — caller (notion-init) will format a user-friendly message.
      throw err;
    }
    // Internal cause: the current Notion API rejected our object filter.
    // We deliberately try `page` next so we still hit the API once with a
    // valid filter. Notion only returns `page` objects under that filter, so
    // the kind guard above drops them — callers see "0 databases" and the UI
    // steers the user to manual id entry, which is the desired fallback.
    try {
      const pageResult = await runSearchPaginated(client, "page");
      return { ...pageResult, fallbackFrom: "data_source" };
    } catch (err2) {
      // Wrap with a clearer, sanitized message. Tokens are never echoed
      // because we only forward Notion's own `message` field (which never
      // contains the auth header). Internal cause stays in the message so it
      // shows up in the caller's friendly-error formatter.
      const reason =
        (err2 as { message?: string }).message ??
        (err as { message?: string }).message ??
        "Notion API rejected the search filter.";
      const wrapped = new Error(
        `Notion search failed after fallback: ${reason} ` +
          `(Internal: current Notion API expects search filter "data_source"; ` +
          `"database" is no longer accepted.)`,
      ) as Error & { code?: string; status?: number };
      const errAny = err2 as { code?: string; status?: number };
      if (typeof errAny.code === "string") wrapped.code = errAny.code;
      if (typeof errAny.status === "number") wrapped.status = errAny.status;
      throw wrapped;
    }
  }
}

// ─── recommendation + sort ────────────────────────────────────────────────

export interface SortedChoices {
  /** preferred candidates first, then everything else, in display order */
  ordered: NotionDatabaseChoice[];
  /** ids that scored as "strong" candidates (≥60% matched) */
  recommendedIds: string[];
}

function scoreFor(kind: "projects" | "tasks", c: NotionDatabaseChoice): DatabaseScore {
  return kind === "projects" ? c.projectsScore : c.tasksScore;
}

function isRecommended(score: DatabaseScore): boolean {
  if (score.total === 0) return false;
  return score.matched / score.total >= 0.6;
}

/**
 * Return the discovery list ordered so that the candidates most likely to
 * match `kind` come first. Strong matches first, then partial matches, then
 * everything else. Within a tier we sort by title for stability.
 */
export function sortForKind(
  kind: "projects" | "tasks",
  databases: readonly NotionDatabaseChoice[],
): SortedChoices {
  const enriched = databases.map((c) => ({
    c,
    s: scoreFor(kind, c),
  }));
  const strong = enriched.filter((e) => isRecommended(e.s));
  const partial = enriched.filter(
    (e) => !isRecommended(e.s) && e.s.matched > 0,
  );
  const rest = enriched.filter(
    (e) => !isRecommended(e.s) && e.s.matched === 0,
  );
  const cmpTitle = (a: { c: NotionDatabaseChoice }, b: { c: NotionDatabaseChoice }): number =>
    a.c.title.localeCompare(b.c.title);
  const cmpScore = (
    a: { c: NotionDatabaseChoice; s: DatabaseScore },
    b: { c: NotionDatabaseChoice; s: DatabaseScore },
  ): number => {
    if (b.s.matched !== a.s.matched) return b.s.matched - a.s.matched;
    if (a.s.typeMismatch !== b.s.typeMismatch)
      return a.s.typeMismatch - b.s.typeMismatch;
    return cmpTitle(a, b);
  };
  strong.sort(cmpScore);
  partial.sort(cmpScore);
  rest.sort(cmpTitle);
  return {
    ordered: [...strong, ...partial, ...rest].map((e) => e.c),
    recommendedIds: strong.map((e) => e.c.id),
  };
}

// ─── display helpers ──────────────────────────────────────────────────────

/** First 8 + last 4 hex chars (with `-` removed) for compact display. */
export function shortId(id: string): string {
  const hex = id.replace(/-/g, "");
  if (hex.length <= 12) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}

export interface ChoiceLabelInputs {
  kind: "projects" | "tasks";
  database: NotionDatabaseChoice;
  isRecommended: boolean;
}

/**
 * Build the visible string used in the select prompt for one DB choice.
 * Example:
 *   "VibeOps Projects  (1a2b3c4d…0001) — projects 8/8 matched"
 *   "VibeOps Tasks     (4d5e6f7g…0002) — tasks 6/10 matched, 4 missing"
 *   "Tasks  (4d5e6f7g…0002) — inline database in VibeOps page (no property info)"
 */
export function buildChoiceLabel(inputs: ChoiceLabelInputs): string {
  const { database } = inputs;
  const score = scoreFor(inputs.kind, database);
  const isInline =
    database.source === "page-block" ||
    database.source === "page-child-database";
  // Lead tag — recommended > inline > kind
  let lead: string;
  if (inputs.isRecommended) {
    lead = "recommended";
  } else if (isInline) {
    const where =
      database.source === "page-child-database"
        ? "page child database"
        : typeof database.parentPageTitle === "string" &&
            database.parentPageTitle.length > 0
          ? `inline database in ${database.parentPageTitle}`
          : "inline database (parent page)";
    lead = where;
  } else {
    lead = inputs.kind;
  }
  const schemaHint =
    database.schemaKindHint === "projects"
      ? "✓ project schema"
      : database.schemaKindHint === "tasks"
        ? "✓ task schema"
        : database.schemaKindHint === "unknown"
          ? "? unknown schema"
          : "";
  const scoreDetail =
    score.total === 0
      ? "no property info"
      : `${score.matched}/${score.total} matched${score.missing > 0 ? `, ${score.missing} missing` : ""}${
          score.typeMismatch > 0 ? `, ${score.typeMismatch} mismatch` : ""
        }`;
  const target =
    database.source === "page-child-database" && database.dataSourceId !== undefined
      ? ` → data_source ${shortId(database.dataSourceId)}`
      : "";
  const detail =
    schemaHint.length > 0 ? `${schemaHint}; ${scoreDetail}` : scoreDetail;
  return `${database.title}  (${shortId(database.id)}) — ${lead}${target}: ${detail}`;
}

// ─── new public discovery API (TASK-010 follow-up #4) ──────────────────────

/**
 * Cap on the number of child blocks we scan per page during inline-database
 * discovery. We deliberately keep this small and **never** recurse: the
 * VibeOps workflow expects the user to put each database directly inside the
 * page they share with the integration. A typical VibeOps page has 2 inline
 * DBs and a few intro paragraphs.
 */
export const NOTION_PAGE_SCAN_MAX_BLOCKS = 100;

/** Normalised "page" search result, used to drive the page-picker UX. */
export interface NotionPageChoice {
  id: string;
  title: string;
  url?: string;
}

export interface PagesSearchResult {
  pages: NotionPageChoice[];
  truncated: boolean;
  totalHits: number;
}

/**
 * Pure `objectFilter: "data_source"` search. No fallback, no kind guard
 * surprises beyond what `discoverDatabases` already does. Returns the same
 * `DiscoveryResult` shape as `discoverDatabases`.
 */
export async function searchDataSources(
  client: NotionClient,
): Promise<DiscoveryResult> {
  const res = await runSearchPaginated(client, "data_source");
  const enriched: NotionDatabaseChoice[] = [];
  for (const c of res.databases) {
    if (c.properties !== undefined) {
      enriched.push(c);
      continue;
    }
    try {
      const ds = await client.retrieveDataSource(c.id);
      const props = ds === null ? null : getNotionProperties(ds);
      if (props === null) {
        enriched.push(c);
        continue;
      }
      const projectsScore = scoreAgainst(props, PROJECTS_DB_PROPERTIES);
      const tasksScore = scoreAgainst(props, TASKS_DB_PROPERTIES);
      enriched.push({
        ...c,
        object: "data_source",
        properties: props,
        schemaKindHint: schemaKindHintForScores(projectsScore, tasksScore),
        projectsScore,
        tasksScore,
      });
    } catch {
      enriched.push(c);
    }
  }
  return { ...res, databases: enriched };
}

/**
 * Pure `objectFilter: "page"` search. Returns up to `NOTION_DISCOVERY_MAX`
 * pages the integration has access to. Pages that the integration was given
 * implicit access to via "Add connections" on a parent page should appear
 * here even when their inline databases do not surface in data-source search.
 */
export async function searchPages(
  client: NotionClient,
): Promise<PagesSearchResult> {
  const seen = new Set<string>();
  const pages: NotionPageChoice[] = [];
  let cursor: string | null = null;
  let totalHits = 0;
  let truncated = false;
  while (pages.length < NOTION_DISCOVERY_MAX) {
    const res = await client.search({
      objectFilter: "page",
      pageSize: Math.min(50, NOTION_DISCOVERY_MAX - pages.length),
      ...(cursor !== null ? { startCursor: cursor } : {}),
    });
    totalHits += res.results.length;
    for (const hit of res.results) {
      if (typeof hit.id !== "string" || hit.id.length === 0) continue;
      if (seen.has(hit.id)) continue;
      if (hit.object !== "page") continue;
      seen.add(hit.id);
      pages.push(normalizePage(hit));
      if (pages.length >= NOTION_DISCOVERY_MAX) break;
    }
    if (pages.length >= NOTION_DISCOVERY_MAX) {
      truncated = res.hasMore === true;
      break;
    }
    if (!res.hasMore || res.nextCursor === null) {
      truncated = false;
      break;
    }
    cursor = res.nextCursor;
    if (cursor === null) break;
  }
  return { pages, truncated, totalHits };
}

/**
 * Best-effort title extraction for a `page` search hit.
 *
 * Notion places the title in different fields depending on the page kind:
 *   - workspace pages: `properties.title.title[]` (array of rich text)
 *   - DB-row pages:    `properties.<title-prop>.title[]`
 *   - some endpoints:  `title[]` at the top level
 * We scan all three locations in that order and return the first non-empty
 * value, falling back to `"(Untitled page)"`.
 */
function readPageTitle(hit: NotionSearchHit): string {
  // top-level (search response usually does NOT include this for pages)
  const top = readNotionTitle(hit.title);
  if (top.length > 0) return top;
  const props = hit.properties;
  if (props !== undefined && props !== null) {
    for (const key of Object.keys(props)) {
      const prop = props[key] as { type?: string; title?: unknown } | undefined;
      if (prop === undefined || prop === null) continue;
      if (prop.type === "title" || Array.isArray(prop.title)) {
        const t = readNotionTitle(prop.title);
        if (t.length > 0) return t;
      }
    }
  }
  return "(Untitled page)";
}

function normalizePage(hit: NotionSearchHit): NotionPageChoice {
  return {
    id: hit.id,
    title: readPageTitle(hit),
    ...(typeof hit.url === "string" && hit.url.length > 0 ? { url: hit.url } : {}),
  };
}

/**
 * Paginated `blocks.children.list(pageId)` — **1-depth only**, capped at
 * `NOTION_PAGE_SCAN_MAX_BLOCKS`. We never follow `has_children` recursively.
 *
 * Read-only.
 */
export async function listPageChildren(
  client: NotionClient,
  pageId: string,
): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | null = null;
  while (blocks.length < NOTION_PAGE_SCAN_MAX_BLOCKS) {
    const remaining = NOTION_PAGE_SCAN_MAX_BLOCKS - blocks.length;
    const res = await client.blocksChildrenList({
      blockId: pageId,
      pageSize: Math.min(50, remaining),
      ...(cursor !== null ? { startCursor: cursor } : {}),
    });
    for (const block of res.results) {
      if (typeof block.id !== "string" || block.id.length === 0) continue;
      blocks.push(block);
      if (blocks.length >= NOTION_PAGE_SCAN_MAX_BLOCKS) break;
    }
    if (blocks.length >= NOTION_PAGE_SCAN_MAX_BLOCKS) break;
    if (!res.hasMore || res.nextCursor === null) break;
    cursor = res.nextCursor;
    if (cursor === null) break;
  }
  return blocks;
}

/**
 * Pull the plain-text title out of a child-database / data-source block.
 *
 * Notion's API surface is mid-migration here, so we look in several
 * locations:
 *   1. `block[type].title` — string (current `child_database` shape)
 *   2. `block[type].title` — rich-text array (future-proof)
 *   3. `block.title` — string/rich-text (legacy)
 * Falls back to `"(Untitled database)"`.
 */
function readBlockTitle(block: NotionBlock): string {
  const type = typeof block.type === "string" ? block.type : "";
  if (type.length > 0) {
    const payload = block[type] as
      | { title?: unknown; database_id?: unknown }
      | undefined;
    if (payload !== undefined && payload !== null) {
      if (typeof payload.title === "string" && payload.title.trim().length > 0) {
        return payload.title.trim();
      }
      const arr = readNotionTitle(payload.title);
      if (arr.length > 0) return arr;
    }
  }
  const topLevel = (block as { title?: unknown }).title;
  if (typeof topLevel === "string" && topLevel.trim().length > 0) {
    return topLevel.trim();
  }
  const fromArr = readNotionTitle(topLevel);
  if (fromArr.length > 0) return fromArr;
  return UNTITLED;
}

/**
 * Pull the database id out of a child-database / data-source block.
 *
 * - For `child_database` blocks the **block id IS the database id** (Notion
 *   API quirk: you can call `databases.retrieve(blockId)` directly).
 * - For hypothetical `data_source` blocks we prefer `block.data_source.id`
 *   if present, then fall back to `block.id` for the same reason.
 */
function readBlockDatabaseId(block: NotionBlock): string | null {
  const type = typeof block.type === "string" ? block.type : "";
  if (type.length > 0) {
    const payload = block[type] as { database_id?: unknown; id?: unknown } | undefined;
    if (payload !== undefined && payload !== null) {
      if (typeof payload.id === "string" && payload.id.length > 0) {
        return payload.id;
      }
      if (
        typeof payload.database_id === "string" &&
        payload.database_id.length > 0
      ) {
        return payload.database_id;
      }
    }
  }
  if (typeof block.id === "string" && block.id.length > 0) return block.id;
  return null;
}

/** Block types we treat as "this is an inline database / data source". */
const INLINE_DB_BLOCK_TYPES = new Set(["child_database", "data_source"]);

/**
 * Scan a page (1-depth) for inline child_database / data_source blocks and
 * normalize them into actual **data_source** `NotionDatabaseChoice` records.
 *
 * Result candidates have:
 *   - `id = dataSourceId` (the value VibeOps should store/use)
 *   - `databaseId = child_database block id` (container/debug reference)
 *   - `source = "page-child-database"`
 *   - `parentPageId = pageId`
 *   - `parentPageTitle = parentTitle` (caller supplies if known)
 *   - `properties = data_source.properties`
 *
 * Candidates whose resolved data_source lacks a `properties` map are skipped:
 * they cannot be used for schema validation or sync.
 */
export async function discoverInlineDatabasesFromPage(
  client: NotionClient,
  pageId: string,
  parentTitle?: string,
): Promise<NotionDatabaseChoice[]> {
  const blocks = await listPageChildren(client, pageId);
  const candidates: NotionDatabaseChoice[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const type = typeof block.type === "string" ? block.type : "";
    if (!INLINE_DB_BLOCK_TYPES.has(type)) continue;
    const dbId = readBlockDatabaseId(block);
    if (dbId === null) continue;
    if (seen.has(dbId)) continue;
    seen.add(dbId);
    const title = readBlockTitle(block);
    const dataSourceIds: string[] = [];
    if (type === "data_source") {
      dataSourceIds.push(dbId);
    } else {
      const database = await client.retrieveDatabase(dbId);
      const extracted = extractDataSourcesFromDatabaseResponse(database);
      dataSourceIds.push(...extracted.items.map((it) => it.id));
    }

    for (const dataSourceId of dataSourceIds) {
      const dataSource = await client.retrieveDataSource(dataSourceId);
      if (dataSource === null) continue;
      const properties = getNotionProperties(dataSource);
      if (properties === null) continue;
      const projectsScore = scoreAgainst(properties, PROJECTS_DB_PROPERTIES);
      const tasksScore = scoreAgainst(properties, TASKS_DB_PROPERTIES);
      const schemaKindHint = schemaKindHintForScores(projectsScore, tasksScore);
      candidates.push({
        id: dataSourceId,
        title,
        object: "data_source",
        source: "page-child-database",
        databaseId: dbId,
        dataSourceId,
        parentPageId: pageId,
        ...(parentTitle !== undefined ? { parentPageTitle: parentTitle } : {}),
        properties,
        schemaKindHint,
        projectsScore,
        tasksScore,
      });
    }
  }
  return candidates;
}

/**
 * Combined result of `discoverNotionDatabases`.
 *
 * Either `dataSources` is non-empty (we found databases directly), or
 * `pages` is non-empty (the integration only has page-level access — the UI
 * should let the user pick a page and call `discoverInlineDatabasesFromPage`).
 * Both can also be empty if the integration is brand-new with nothing shared.
 *
 * `warnings` carries human-readable hints (e.g. truncation, fallback used).
 */
export interface CombinedDiscoveryResult {
  dataSources: NotionDatabaseChoice[];
  pages: NotionPageChoice[];
  warnings: string[];
  /** True iff data-source search returned zero hits (the page-scan trigger). */
  dataSourcesEmpty: boolean;
  /** True iff `data_source` search itself errored (we caught it and kept going). */
  dataSourceErrored: boolean;
  /** True iff search was truncated by `NOTION_DISCOVERY_MAX`. */
  dataSourcesTruncated: boolean;
  pagesTruncated: boolean;
}

/**
 * Orchestrator used by `vibeops notion init`.
 *
 * Flow:
 *   1. Try `searchDataSources(client)`.
 *      - If it returns ≥ 1 hit, return immediately — no page search needed.
 *   2. If data-source search returned 0 results, run `searchPages(client)`
 *      so the UI can offer "Select a page to scan for inline databases".
 *   3. We never throw on transport-level failures here — instead we annotate
 *      `dataSourceErrored = true` so the caller can fall back to manual
 *      entry. (Token / validation_error paths still throw so the caller's
 *      friendly-error formatter can run.)
 *
 * Read-only. 5 s SDK timeout. No mutation, no token logging.
 */
export async function discoverNotionDatabases(
  client: NotionClient,
): Promise<CombinedDiscoveryResult> {
  const warnings: string[] = [];
  let dataSources: NotionDatabaseChoice[] = [];
  let dataSourcesTruncated = false;
  let dataSourceErrored = false;
  try {
    const ds = await searchDataSources(client);
    dataSources = ds.databases;
    dataSourcesTruncated = ds.truncated;
    if (ds.truncated) {
      warnings.push(
        `Data-source search was capped at ${NOTION_DISCOVERY_MAX} results — Notion has more.`,
      );
    }
  } catch (err) {
    // The orchestrator absorbs `validation_error` (legacy `database` filter)
    // here because we want the CLI to keep going and still offer page-scan.
    // Other errors (unauthorized / restricted_resource / timeout) propagate.
    if (isUnsupportedObjectFilterError(err)) {
      dataSourceErrored = true;
      warnings.push(
        "Notion rejected `data_source` filter — falling back to page search.",
      );
    } else {
      throw err;
    }
  }
  if (dataSources.length > 0) {
    return {
      dataSources,
      pages: [],
      warnings,
      dataSourcesEmpty: false,
      dataSourceErrored,
      dataSourcesTruncated,
      pagesTruncated: false,
    };
  }
  // Either data-source search returned 0 or we trapped a validation_error.
  // Look for pages so the UI can offer page scanning.
  let pages: NotionPageChoice[] = [];
  let pagesTruncated = false;
  try {
    const ps = await searchPages(client);
    pages = ps.pages;
    pagesTruncated = ps.truncated;
    if (ps.truncated) {
      warnings.push(
        `Page search was capped at ${NOTION_DISCOVERY_MAX} results — Notion has more.`,
      );
    }
  } catch (err) {
    // Pages search rarely fails after a successful (empty) data-source
    // search. We surface the error message but keep going (UI will land on
    // manual entry).
    const msg = (err as { message?: string }).message ?? "Notion page search failed.";
    warnings.push(`Page search failed: ${msg}`);
  }
  return {
    dataSources: [],
    pages,
    warnings,
    dataSourcesEmpty: !dataSourceErrored,
    dataSourceErrored,
    dataSourcesTruncated,
    pagesTruncated,
  };
}
