/**
 * Thin async wrapper around `@notionhq/client`.
 *
 * We lazy-import the SDK so that:
 *   - other commands (init / status / plan / task / …) don't pay the import
 *     cost when Notion is disabled,
 *   - a missing or broken install of `@notionhq/client` doesn't crash the
 *     entire CLI — only the notion subcommands.
 *
 * The wrapper exposes the surface VibeOps actually uses:
 *   - `users.me()` to validate the token,                            (TASK-010)
 *   - `databases.retrieve(id)` to verify access + schema,            (TASK-010)
 *   - `dataSources.retrieve(id)` to read the actual schema (new API), (TASK-011 follow-up)
 *   - `databases.query(id, filter, page_size)` to look up a row,     (TASK-011)
 *   - `pages.create({ parent, properties })` to insert,              (TASK-011)
 *   - `pages.update({ page_id, properties })` to upsert in place,    (TASK-011)
 *   - `search({ filter: { value: "data_source" }})` to discover DBs. (TASK-010 UX)
 *   - `blocks.children.list(block_id, page_size, start_cursor)` to walk
 *     the 1-depth children of a page when we need to find inline databases
 *     that Notion search doesn't surface.                                (TASK-010 UX)
 *
 * Network calls have a 5s timeout (per TASK-010 Risks).
 *
 * Notion API note (TASK-011 follow-up):
 *   In the current Notion API ("2025-09-03" and later), a `database` is a
 *   shell that can contain 0…N `data_source` children. Property schema lives
 *   on the `data_source`, not on the `database`. VibeOps therefore exposes
 *   `databasesRetrieve(id)` (returns `{ id, object, data_sources, ... }`)
 *   AND `dataSourcesRetrieve(id)` (returns `{ id, object, properties, ... }`)
 *   so the resolver (`notion-target.ts`) can fall back between them.
 */

const NOTION_API_TIMEOUT_MS = 5_000;

/**
 * Notion API version VibeOps pins on every Client construction.
 *
 * `"2025-09-03"` is the first version in which `database.retrieve` returns
 * `{ object: "database", data_sources: [...] }` and the property schema
 * (`properties`) lives on `data_source` objects rather than on the
 * `database` shell. VibeOps' resolver (`notion-target.ts`) targets that
 * surface. Bumping this constant later requires re-validating the resolver
 * + schema validator against the new response shape.
 */
export const NOTION_API_VERSION = "2025-09-03";

export interface NotionPageRef {
  id: string;
  properties: Record<string, unknown>;
}

export interface NotionQueryResult {
  results: NotionPageRef[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface NotionSearchHit {
  /** stable Notion object id */
  id: string;
  /** "database" — modern API; "data_source" — newer API surface, also legal */
  object: "database" | "data_source" | string;
  /** raw title array from Notion; callers should pass through `readNotionTitle` */
  title?: unknown;
  /** raw `properties` map, only present when Notion returned it */
  properties?: Record<string, unknown>;
  /** Notion-hosted URL for the database */
  url?: string;
}

export interface NotionSearchResult {
  results: NotionSearchHit[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * One block returned by `blocks.children.list`. VibeOps only inspects a small
 * subset of fields; we keep the rest as opaque shape (`Record<string, unknown>`).
 *
 * For `child_database` blocks, Notion places the database title at
 * `block.child_database.title` (plain string). For `child_page` blocks the
 * title lives at `block.child_page.title`. For other block types we don't
 * inspect anything beyond `id` / `type`.
 */
export interface NotionBlock {
  id: string;
  type?: string;
  has_children?: boolean;
  // Notion places type-specific payloads under a key matching `type`.
  [key: string]: unknown;
}

export interface NotionBlockList {
  results: NotionBlock[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Notion search `object` filter values that the current API accepts.
 *
 * Note: `"database"` is **no longer accepted** by the current Notion REST API
 * (`POST /v1/search`). The API returns `validation_error` and requires either
 * `"data_source"` (databases as data sources) or `"page"`. `data_source`
 * objects in the response still carry `id` / `title` / `properties`, so VibeOps
 * treats them the same as databases — we never branch on the object kind.
 */
export type NotionSearchObjectFilter = "data_source" | "page";

export interface NotionSearchOptions {
  /** free-text query (default: empty — Notion returns everything shared with the integration) */
  query?: string;
  /** Notion search filter `{ property: "object", value: ... }` */
  objectFilter?: NotionSearchObjectFilter;
  /** page size cap (Notion max = 100; we default to 50 to keep init UX snappy) */
  pageSize?: number;
  /** pagination cursor for next batch */
  startCursor?: string;
}

/**
 * Trimmed-down view of a single `data_sources` entry that the new
 * `databases.retrieve` response carries. Notion currently emits
 * `{ id: string; name?: string; … }` per entry — we only consume `id`.
 */
export interface NotionDataSourceRef {
  id: string;
  name?: string;
}

/**
 * Trimmed shape of `databases.retrieve()` in the current Notion API.
 *
 * `properties` is **deprecated** on the database object since 2025-09-03 —
 * in modern workspaces it comes back as `undefined`. The real schema lives
 * on `data_sources[i]`. VibeOps therefore keeps `properties` optional and
 * never relies on it directly.
 */
export interface NotionDatabaseRetrieveResponse {
  id: string;
  object?: string;
  title?: unknown;
  /** legacy field — may be undefined in the new API surface */
  properties?: Record<string, unknown>;
  /**
   * New API: 0+ data source children attached to this database.
   *
   * Notion's official 2025-09-03 surface emits `data_sources` (snake_case).
   * VibeOps additionally accepts `dataSources` / `child_data_sources` /
   * `childDataSources` (parsed via {@link extractDataSourcesFromDatabaseResponse})
   * so future API revisions or proxy layers that camel-case payloads still
   * resolve cleanly.
   */
  data_sources?: NotionDataSourceRef[];
}

/**
 * Trimmed shape of `dataSources.retrieve()` in the current Notion API.
 * The schema (`properties`) always lives here in the new API.
 */
export interface NotionDataSourceRetrieveResponse {
  id: string;
  object?: string;
  title?: unknown;
  properties?: Record<string, unknown>;
  /** id of the database this data source belongs to (if Notion echoes it) */
  parent?: { type?: string; database_id?: string };
}

/**
 * Output of {@link NotionClient.probeDatabaseShape} — a token-safe digest of a
 * `databases.retrieve` response, intended for `--debug-shape`.
 *
 * Carries only field NAMES and COUNTS plus child `data_sources` id+name
 * pairs. NEVER contains the bearer token, property values, page content, or
 * any rich_text body. Safe to dump to stdout / JSON / logs.
 */
export interface DatabaseShapeProbe {
  /** echoed input id so the caller can correlate */
  inputId: string;
  /** Notion's `object` field (`"database"` etc.); `"(unknown)"` if missing */
  object: string;
  /** echoed `id` from the response (often equals `inputId`) */
  id: string;
  /** plain text reconstructed from `title[]` if Notion echoed it */
  title?: string;
  /** Whether the response carries a legacy `properties` map */
  hasProperties: boolean;
  /** Number of keys in `properties` (0 if missing) */
  propertiesKeysLength: number;
  /** Whether the response carries any of the data_sources naming variants */
  hasDataSources: boolean;
  /** Which key name carried the array (`"data_sources"`, `"dataSources"`, …) */
  dataSourcesField?: string;
  /** Count of normalised data source entries */
  dataSourcesLength: number;
  /** Normalised `{id, name?}[]` snapshot — empty when none found */
  dataSources: Array<{ id: string; name?: string }>;
  /** Alphabetised list of top-level keys on the response */
  topLevelKeys: string[];
}

export interface NotionClient {
  usersMe(): Promise<{ id: string; name?: string; type?: string }>;
  /** Alias for `databasesRetrieve`; explicit API-first name. */
  retrieveDatabase(databaseId: string): Promise<NotionDatabaseRetrieveResponse>;
  databasesRetrieve(databaseId: string): Promise<NotionDatabaseRetrieveResponse>;
  /**
   * `GET /v1/data_sources/{id}` — modern endpoint that returns the actual
   * `properties` schema. Returns `null` when the SDK environment does not
   * expose `client.dataSources` (older `@notionhq/client` builds) AND no
   * `client.request` raw helper is available either. Otherwise tries the
   * SDK path first and silently falls back to `client.request({ path:
   * "data_sources/<id>", method: "GET" })`. **404s and 4xx errors still
   * throw** — `null` is reserved for "no SDK endpoint reachable".
   */
  dataSourcesRetrieve(dataSourceId: string): Promise<NotionDataSourceRetrieveResponse | null>;
  /** Alias for `dataSourcesRetrieve`; explicit API-first name. */
  retrieveDataSource(dataSourceId: string): Promise<NotionDataSourceRetrieveResponse | null>;
  /**
   * Token-safe diagnostic of a `databases.retrieve` response. NEVER includes
   * the bearer token or any user-content. Returned to `notion test
   * --debug-shape`. Throws Notion API errors normally — callers decide
   * whether to wrap them.
   */
  probeDatabaseShape(databaseId: string): Promise<DatabaseShapeProbe>;
  databasesQuery(
    databaseId: string,
    options?: {
      filter?: Record<string, unknown>;
      pageSize?: number;
      startCursor?: string;
    },
  ): Promise<NotionQueryResult>;
  /**
   * `POST /v1/data_sources/{data_source_id}/query` — Notion 2025-09-03 surface.
   *
   * Tries the typed SDK call first (`client.dataSources.query`), then falls
   * back to a raw `client.request({ path: "data_sources/{id}/query", ... })`
   * when the installed SDK build does not expose it. Throws Notion API errors
   * normally — wrappers should pair this with a friendly explainer.
   */
  queryDataSource(
    dataSourceId: string,
    options?: {
      filter?: Record<string, unknown>;
      pageSize?: number;
      startCursor?: string;
    },
  ): Promise<NotionQueryResult>;
  pagesCreate(inputs: {
    databaseId: string;
    properties: Record<string, unknown>;
  }): Promise<{ id: string }>;
  /**
   * `POST /v1/pages` with `parent: { data_source_id }` — Notion 2025-09-03
   * surface. Uses the typed SDK call when available, raw `client.request`
   * fallback otherwise. The page is created inside the resolved
   * `data_source`, NOT the legacy database shell. Throws on 4xx.
   */
  createPageInDataSource(inputs: {
    dataSourceId: string;
    properties: Record<string, unknown>;
  }): Promise<{ id: string }>;
  pagesUpdate(inputs: {
    pageId: string;
    properties: Record<string, unknown>;
  }): Promise<{ id: string }>;
  /** Alias for `pagesUpdate` — explicit Notion 2025-09-03 surface. */
  updatePage(inputs: {
    pageId: string;
    properties: Record<string, unknown>;
  }): Promise<{ id: string }>;
  /**
   * `POST /v1/search` — returns objects shared with the current integration.
   * VibeOps uses this exclusively to discover database/data_source objects
   * during `vibeops notion init`. Read-only.
   */
  search(options?: NotionSearchOptions): Promise<NotionSearchResult>;
  /** Convenience wrapper for `POST /v1/search` with `object=page`. */
  searchPages(query?: string): Promise<NotionSearchResult>;
  /**
   * `GET /v1/blocks/{block_id}/children` — paginated list of a block's direct
   * children. VibeOps uses this only to scan a user-picked page for inline
   * `child_database` blocks during `notion init` discovery. 1-depth only —
   * VibeOps **never** recurses into nested blocks. Read-only.
   */
  blocksChildrenList(options: {
    blockId: string;
    pageSize?: number;
    startCursor?: string;
  }): Promise<NotionBlockList>;
  /** Alias for `blocksChildrenList`; explicit API-first name. */
  listBlockChildren(
    blockId: string,
    options?: { limit?: number; startCursor?: string },
  ): Promise<NotionBlockList>;
}

/**
 * Defensive normaliser for the `data_sources` child array on a
 * `databases.retrieve` response.
 *
 * Why this exists: Notion's official surface uses `data_sources`
 * (snake_case), but VibeOps has seen / expects to support multiple naming
 * shapes — `dataSources`, `child_data_sources`, `childDataSources` — as
 * well as entries that wrap the id under `data_source.id` instead of `id`.
 * This helper picks the first non-empty array it finds and normalises each
 * entry to `{ id, name? }`. Returns `[]` when nothing usable is present.
 *
 * Tuple in the returned diagnostic: `[fieldName, items[]]` — `fieldName` is
 * `null` when no array key was located, useful for `--debug-shape`.
 */
export function extractDataSourcesFromDatabaseResponse(
  response: unknown,
): { field: string | null; items: Array<{ id: string; name?: string }> } {
  if (response === null || typeof response !== "object") {
    return { field: null, items: [] };
  }
  const obj = response as Record<string, unknown>;
  // Order matters: prefer the canonical snake_case if both styles appear.
  const candidates: string[] = [
    "data_sources",
    "dataSources",
    "child_data_sources",
    "childDataSources",
  ];
  for (const key of candidates) {
    const raw = obj[key];
    if (!Array.isArray(raw)) continue;
    if (raw.length === 0) {
      // remember we saw the array even if empty (so the caller can show
      // `field=data_sources, len=0` instead of `field=null, len=0`).
      return { field: key, items: [] };
    }
    const items = raw
      .map((entry): { id: string; name?: string } | null => {
        if (entry === null || typeof entry !== "object") return null;
        const e = entry as Record<string, unknown>;
        // Accept `id` OR `data_source.id` (some payloads nest the id).
        const directId = typeof e.id === "string" ? e.id : "";
        const nestedRaw =
          e.data_source !== undefined && typeof e.data_source === "object"
            ? (e.data_source as Record<string, unknown>)
            : null;
        const nestedId =
          nestedRaw !== null && typeof nestedRaw.id === "string"
            ? (nestedRaw.id as string)
            : "";
        const id = directId.length > 0 ? directId : nestedId;
        if (id.length === 0) return null;
        // Pick the friendliest name: e.name, e.data_source.name, e.title text.
        let name: string | undefined;
        if (typeof e.name === "string" && e.name.length > 0) {
          name = e.name;
        } else if (
          nestedRaw !== null &&
          typeof nestedRaw.name === "string" &&
          (nestedRaw.name as string).length > 0
        ) {
          name = nestedRaw.name as string;
        } else if (Array.isArray(e.title)) {
          const t = (e.title as Array<{ plain_text?: string }>)
            .map((seg) => seg.plain_text ?? "")
            .join("")
            .trim();
          if (t.length > 0) name = t;
        }
        return name === undefined ? { id } : { id, name };
      })
      .filter((x): x is { id: string; name?: string } => x !== null);
    return { field: key, items };
  }
  return { field: null, items: [] };
}

/**
 * Build a token-safe {@link DatabaseShapeProbe} from a raw retrieve
 * response. Splits out from `probeDatabaseShape` so unit tests can hit it
 * directly without an SDK client.
 */
export function summariseDatabaseShape(
  inputId: string,
  raw: unknown,
): DatabaseShapeProbe {
  if (raw === null || typeof raw !== "object") {
    return {
      inputId,
      object: "(unknown)",
      id: inputId,
      hasProperties: false,
      propertiesKeysLength: 0,
      hasDataSources: false,
      dataSourcesLength: 0,
      dataSources: [],
      topLevelKeys: [],
    };
  }
  const obj = raw as Record<string, unknown>;
  const object =
    typeof obj.object === "string" ? (obj.object as string) : "(unknown)";
  const id = typeof obj.id === "string" && obj.id.length > 0 ? (obj.id as string) : inputId;
  let title: string | undefined;
  if (Array.isArray(obj.title)) {
    const text = (obj.title as Array<{ plain_text?: string }>)
      .map((seg) => seg.plain_text ?? "")
      .join("")
      .trim();
    if (text.length > 0) title = text;
  } else if (typeof obj.title === "string" && obj.title.length > 0) {
    title = obj.title as string;
  } else if (typeof obj.name === "string" && (obj.name as string).length > 0) {
    title = obj.name as string;
  }
  const props = obj.properties;
  const hasProperties =
    props !== null && props !== undefined && typeof props === "object";
  const propertiesKeysLength = hasProperties
    ? Object.keys(props as Record<string, unknown>).length
    : 0;
  const ds = extractDataSourcesFromDatabaseResponse(raw);
  const topLevelKeys = Object.keys(obj).sort();
  return {
    inputId,
    object,
    id,
    ...(title !== undefined ? { title } : {}),
    hasProperties,
    propertiesKeysLength,
    hasDataSources: ds.field !== null,
    ...(ds.field !== null ? { dataSourcesField: ds.field } : {}),
    dataSourcesLength: ds.items.length,
    dataSources: ds.items,
    topLevelKeys,
  };
}

export interface NotionApiError {
  ok: false;
  code: string;
  status?: number;
  message: string;
}

export function notionApiError(err: unknown): NotionApiError {
  const e = err as { code?: string; status?: number; message?: string };
  return {
    ok: false,
    code: typeof e.code === "string" ? e.code : "unknown_error",
    ...(typeof e.status === "number" ? { status: e.status } : {}),
    message: typeof e.message === "string" ? e.message : String(err),
  };
}

export async function createNotionClient(token: string): Promise<NotionClient> {
  // Use a dynamic specifier so TS/Node import this lazily even under
  // `--noEmitOnError`. Missing dep → caller catches and surfaces a friendly
  // "install @notionhq/client" message.
  const modSpecifier = "@notionhq/client";
  const mod: unknown = await import(/* @vite-ignore */ modSpecifier);
  interface ClientOptions {
    auth: string;
    timeoutMs: number;
    logLevel?: string;
    notionVersion?: string;
  }
  const ClientCtor =
    (mod as { Client?: new (opts: ClientOptions) => unknown }).Client ??
    (mod as { default?: { Client?: new (opts: ClientOptions) => unknown } }).default?.Client;
  if (typeof ClientCtor !== "function") {
    throw new Error(
      "Could not find `Client` export in `@notionhq/client`. Re-install the dependency: `pnpm add @notionhq/client`.",
    );
  }
  // `notionVersion: "2025-09-03"` pins the Notion API version VibeOps was
  // designed against. In this revision the schema (`properties`) lives on
  // `data_source` objects rather than on the `database` shell, so this pin
  // makes the response shape deterministic regardless of what default the
  // installed `@notionhq/client` build chose.
  //
  // `logLevel: "error"` suppresses the SDK's WARN-level "request fail"
  // chatter that otherwise polutes stderr on expected 4xx (e.g. when the
  // resolver intentionally probes `dataSources.retrieve(id)` and gets a 404
  // before falling back to `databases.retrieve(id)`). Real errors still
  // throw; this only silences the SDK's diagnostic console.warn.
  const client = new ClientCtor({
    auth: token,
    timeoutMs: NOTION_API_TIMEOUT_MS,
    logLevel: "error",
    notionVersion: NOTION_API_VERSION,
  }) as {
    users: { me: (q: object) => Promise<unknown> };
    databases: {
      retrieve: (q: { database_id: string }) => Promise<unknown>;
      query: (q: {
        database_id: string;
        filter?: unknown;
        page_size?: number;
        start_cursor?: string;
      }) => Promise<unknown>;
    };
    /** New API surface (@notionhq/client ≥ 5.x). May be `undefined` on older builds. */
    dataSources?: {
      retrieve: (q: { data_source_id: string }) => Promise<unknown>;
      query?: (q: {
        data_source_id: string;
        filter?: unknown;
        page_size?: number;
        start_cursor?: string;
      }) => Promise<unknown>;
    };
    /**
     * Public arbitrary-endpoint helper exposed by `@notionhq/client`. We use it
     * as a raw HTTP fallback for `dataSources.retrieve` when the installed
     * SDK build doesn't expose `client.dataSources` yet. It already attaches
     * `Authorization: Bearer <token>`, `Notion-Version: <pin>`, and
     * `Content-Type: application/json`.
     */
    request?: (q: {
      path: string;
      method: "GET" | "POST" | "PATCH" | "DELETE";
      body?: unknown;
    }) => Promise<unknown>;
    pages: {
      create: (q: { parent: unknown; properties: unknown }) => Promise<unknown>;
      update: (q: { page_id: string; properties: unknown }) => Promise<unknown>;
    };
    search: (q: {
      query?: string;
      filter?: { property: "object"; value: NotionSearchObjectFilter };
      page_size?: number;
      start_cursor?: string;
    }) => Promise<unknown>;
    blocks: {
      children: {
        list: (q: {
          block_id: string;
          page_size?: number;
          start_cursor?: string;
        }) => Promise<unknown>;
      };
    };
  };
  return {
    async usersMe() {
      const res = (await client.users.me({})) as {
        id: string;
        name?: string;
        type?: string;
      };
      return res;
    },
    async databasesRetrieve(databaseId: string) {
      const res = (await client.databases.retrieve({
        database_id: databaseId,
      })) as NotionDatabaseRetrieveResponse;
      return res;
    },
    async retrieveDatabase(databaseId: string) {
      const res = (await client.databases.retrieve({
        database_id: databaseId,
      })) as NotionDatabaseRetrieveResponse;
      return res;
    },
    async dataSourcesRetrieve(dataSourceId: string) {
      // (A) preferred — typed SDK call when present.
      if (
        client.dataSources !== undefined &&
        typeof client.dataSources.retrieve === "function"
      ) {
        const res = (await client.dataSources.retrieve({
          data_source_id: dataSourceId,
        })) as NotionDataSourceRetrieveResponse;
        return res;
      }
      // (B) raw HTTP fallback via SDK's public arbitrary-request helper.
      // The SDK already attaches Authorization / Notion-Version / JSON
      // headers, so we never touch the token from here.
      if (typeof client.request === "function") {
        const res = (await client.request({
          path: `data_sources/${dataSourceId}`,
          method: "GET",
        })) as NotionDataSourceRetrieveResponse;
        return res;
      }
      // (C) neither path available — let the resolver decide what to do.
      return null;
    },
    async retrieveDataSource(dataSourceId: string) {
      if (
        client.dataSources !== undefined &&
        typeof client.dataSources.retrieve === "function"
      ) {
        const res = (await client.dataSources.retrieve({
          data_source_id: dataSourceId,
        })) as NotionDataSourceRetrieveResponse;
        return res;
      }
      if (typeof client.request === "function") {
        const res = (await client.request({
          path: `data_sources/${dataSourceId}`,
          method: "GET",
        })) as NotionDataSourceRetrieveResponse;
        return res;
      }
      return null;
    },
    async probeDatabaseShape(databaseId: string) {
      const raw = (await client.databases.retrieve({
        database_id: databaseId,
      })) as Record<string, unknown>;
      return summariseDatabaseShape(databaseId, raw);
    },
    async databasesQuery(databaseId, options) {
      const q: {
        data_source_id?: string;
        database_id?: string;
        filter?: unknown;
        page_size?: number;
        start_cursor?: string;
      } = {};
      if (options?.filter !== undefined) q.filter = options.filter;
      if (typeof options?.pageSize === "number") q.page_size = options.pageSize;
      if (typeof options?.startCursor === "string") q.start_cursor = options.startCursor;
      const res = (await (client.dataSources?.query !== undefined
        ? client.dataSources.query({ ...q, data_source_id: databaseId })
        : client.databases.query({ ...q, database_id: databaseId }))) as {
        results: NotionPageRef[];
        has_more: boolean;
        next_cursor: string | null;
      };
      return {
        results: res.results ?? [],
        hasMore: res.has_more === true,
        nextCursor: res.next_cursor ?? null,
      };
    },
    async pagesCreate({ databaseId, properties }) {
      let res: { id: string };
      try {
        res = (await client.pages.create({
          parent: { data_source_id: databaseId },
          properties,
        })) as { id: string };
      } catch (err) {
        const apiErr = notionApiError(err);
        if (apiErr.code !== "validation_error" && apiErr.code !== "object_not_found") {
          throw err;
        }
        // Legacy fallback for older configs that still store database ids.
        res = (await client.pages.create({
          parent: { database_id: databaseId },
          properties,
        })) as { id: string };
      }
      return { id: res.id };
    },
    async queryDataSource(dataSourceId, options) {
      const body: {
        filter?: unknown;
        page_size?: number;
        start_cursor?: string;
      } = {};
      if (options?.filter !== undefined) body.filter = options.filter;
      if (typeof options?.pageSize === "number") body.page_size = options.pageSize;
      if (typeof options?.startCursor === "string") body.start_cursor = options.startCursor;
      let raw: {
        results?: NotionPageRef[];
        has_more?: boolean;
        next_cursor?: string | null;
      };
      // (A) typed SDK call when the installed build exposes `dataSources.query`.
      if (
        client.dataSources !== undefined &&
        typeof client.dataSources.query === "function"
      ) {
        raw = (await client.dataSources.query({
          data_source_id: dataSourceId,
          ...body,
        })) as {
          results?: NotionPageRef[];
          has_more?: boolean;
          next_cursor?: string | null;
        };
      } else if (typeof client.request === "function") {
        // (B) raw HTTP fallback — SDK attaches Authorization / Notion-Version /
        // Content-Type headers itself; we never touch the token from here.
        raw = (await client.request({
          path: `data_sources/${dataSourceId}/query`,
          method: "POST",
          body,
        })) as {
          results?: NotionPageRef[];
          has_more?: boolean;
          next_cursor?: string | null;
        };
      } else {
        throw new Error(
          "`@notionhq/client` does not expose `dataSources.query` nor `client.request`; cannot query data source.",
        );
      }
      return {
        results: Array.isArray(raw.results) ? raw.results : [],
        hasMore: raw.has_more === true,
        nextCursor: raw.next_cursor ?? null,
      };
    },
    async createPageInDataSource({ dataSourceId, properties }) {
      const body = {
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties,
      };
      // (A) typed SDK call first — `parent` is typed as `unknown` in our cast
      // so the new shape passes through transparently.
      try {
        const res = (await client.pages.create(body)) as { id: string };
        return { id: res.id };
      } catch (err) {
        const apiErr = notionApiError(err);
        // Only fall back when the SDK itself rejected the shape (validation
        // error on the SDK side). 401/403/404/429 must propagate so the
        // caller can show the precise reason.
        if (apiErr.code !== "validation_error") {
          throw err;
        }
        if (typeof client.request !== "function") throw err;
        const res = (await client.request({
          path: "pages",
          method: "POST",
          body,
        })) as { id: string };
        return { id: res.id };
      }
    },
    async pagesUpdate({ pageId, properties }) {
      const res = (await client.pages.update({
        page_id: pageId,
        properties,
      })) as { id: string };
      return { id: res.id };
    },
    async updatePage({ pageId, properties }) {
      const res = (await client.pages.update({
        page_id: pageId,
        properties,
      })) as { id: string };
      return { id: res.id };
    },
    async blocksChildrenList({ blockId, pageSize, startCursor }) {
      const q: { block_id: string; page_size?: number; start_cursor?: string } = {
        block_id: blockId,
      };
      // Notion API hard-caps page_size at 100; we keep ≤ 50 for snappy UX
      // unless a caller asks for more, but never above 100.
      const ps = typeof pageSize === "number" ? Math.min(100, Math.max(1, pageSize)) : 50;
      q.page_size = ps;
      if (typeof startCursor === "string") q.start_cursor = startCursor;
      const res = (await client.blocks.children.list(q)) as {
        results: NotionBlock[];
        has_more: boolean;
        next_cursor: string | null;
      };
      return {
        results: Array.isArray(res.results) ? res.results : [],
        hasMore: res.has_more === true,
        nextCursor: res.next_cursor ?? null,
      };
    },
    async listBlockChildren(blockId, options) {
      const q: { block_id: string; page_size?: number; start_cursor?: string } = {
        block_id: blockId,
      };
      q.page_size =
        typeof options?.limit === "number"
          ? Math.min(100, Math.max(1, options.limit))
          : 50;
      if (typeof options?.startCursor === "string") {
        q.start_cursor = options.startCursor;
      }
      const res = (await client.blocks.children.list(q)) as {
        results: NotionBlock[];
        has_more: boolean;
        next_cursor: string | null;
      };
      return {
        results: Array.isArray(res.results) ? res.results : [],
        hasMore: res.has_more === true,
        nextCursor: res.next_cursor ?? null,
      };
    },
    async search(options) {
      const q: {
        query?: string;
        filter?: { property: "object"; value: NotionSearchObjectFilter };
        page_size?: number;
        start_cursor?: string;
      } = {};
      if (typeof options?.query === "string") q.query = options.query;
      if (options?.objectFilter !== undefined)
        q.filter = { property: "object", value: options.objectFilter };
      q.page_size = typeof options?.pageSize === "number" ? options.pageSize : 50;
      if (typeof options?.startCursor === "string") q.start_cursor = options.startCursor;
      const res = (await client.search(q)) as {
        results: NotionSearchHit[];
        has_more: boolean;
        next_cursor: string | null;
      };
      return {
        results: Array.isArray(res.results) ? res.results : [],
        hasMore: res.has_more === true,
        nextCursor: res.next_cursor ?? null,
      };
    },
    async searchPages(query?: string) {
      const q: {
        query?: string;
        filter?: { property: "object"; value: NotionSearchObjectFilter };
        page_size?: number;
      } = {
        filter: { property: "object", value: "page" },
        page_size: 50,
      };
      if (typeof query === "string" && query.length > 0) q.query = query;
      const res = (await client.search(q)) as {
        results: NotionSearchHit[];
        has_more: boolean;
        next_cursor: string | null;
      };
      return {
        results: Array.isArray(res.results) ? res.results : [],
        hasMore: res.has_more === true,
        nextCursor: res.next_cursor ?? null,
      };
    },
  };
}
