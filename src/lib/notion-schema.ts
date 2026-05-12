/**
 * Required Notion property schema for the **Projects DB** and **Tasks DB**.
 *
 * VibeOps validates the shape with `databases.retrieve` (read-only). It
 * never tries to create or migrate the schema — humans manage Notion.
 *
 * Property names are matched case-sensitively, exactly as users see them in
 * the Notion UI. If your Notion property has a different name or type, your
 * `notion test` will fail with a clear error.
 */

export type NotionPropertyType =
  | "title"
  | "rich_text"
  | "url"
  | "select"
  | "multi_select"
  | "status"
  | "number"
  | "checkbox"
  | "date"
  | "people"
  | "files"
  | "email"
  | "phone_number"
  | "formula"
  | "relation"
  | "rollup"
  | "created_time"
  | "created_by"
  | "last_edited_time"
  | "last_edited_by"
  | "unique_id"
  | "verification";

export interface PropertyRequirement {
  /** exact property name in Notion */
  readonly name: string;
  /** one or more allowed Notion property types */
  readonly allowedTypes: readonly NotionPropertyType[];
  /** short human-readable note shown in init guide / test failure */
  readonly description: string;
  /**
   * For `status` / `select` / `multi_select` properties: the option names
   * VibeOps will write at runtime. If Notion is missing any of these, the
   * actual sync would fail with `Invalid status/select option … does not
   * exist`. We surface this as a `status-options-missing` /
   * `select-options-missing` violation so the user is warned BEFORE the
   * mutation phase, not in the middle of a partial sync.
   */
  readonly requiredOptions?: readonly string[];
}

/**
 * Status option names VibeOps writes to the Projects DB. Add/rename these in
 * Notion (`Status` property → `Edit options`). Anything missing causes a
 * pre-flight `status-options-missing` violation; nothing is auto-created.
 */
export const PROJECTS_STATUS_REQUIRED_OPTIONS: readonly string[] = [
  "Building",
  "Planning",
  "Paused",
  "Done",
  "Archived",
];

/**
 * Status option names VibeOps writes to the Tasks DB. Mirrors the TASK
 * lifecycle (`Planned → In Progress → Review → Done`) plus `Blocked`.
 */
export const TASKS_STATUS_REQUIRED_OPTIONS: readonly string[] = [
  "Planned",
  "In Progress",
  "Review",
  "Done",
  "Blocked",
];

export const PROJECTS_DB_PROPERTIES: readonly PropertyRequirement[] = [
  { name: "Name",          allowedTypes: ["title"],            description: "Project page title (Notion 'Title' column)" },
  { name: "Project ID",    allowedTypes: ["rich_text"],        description: "Matches .vibeops.json projectId" },
  { name: "Status",        allowedTypes: ["status"],           description: "Project status (Notion 'Status' type; not select)", requiredOptions: PROJECTS_STATUS_REQUIRED_OPTIONS },
  { name: "Local Path",    allowedTypes: ["rich_text"],        description: "Local repository path" },
  { name: "Git Repo",      allowedTypes: ["rich_text", "url"], description: "Remote repository URL (rich_text or url allowed)" },
  { name: "Current Phase", allowedTypes: ["select"],           description: "Current phase label" },
  { name: "Docs Path",     allowedTypes: ["rich_text"],        description: "docs/project path" },
  { name: "Summary",       allowedTypes: ["rich_text"],        description: "Summary of 00-overview.md" },
];

export const TASKS_DB_PROPERTIES: readonly PropertyRequirement[] = [
  { name: "Name",            allowedTypes: ["title"],     description: "TASK page title" },
  { name: "Task ID",         allowedTypes: ["rich_text"], description: "TASK-NNN" },
  { name: "Project ID",      allowedTypes: ["rich_text"], description: "Owning project id" },
  { name: "Status",          allowedTypes: ["status"],    description: "Planned / In Progress / Review / Done / Blocked (Notion 'Status' type)", requiredOptions: TASKS_STATUS_REQUIRED_OPTIONS },
  { name: "Priority",        allowedTypes: ["select"],    description: "P0 / P1 / P2 / …" },
  { name: "MVP Phase",       allowedTypes: ["select"],    description: "Phase label (free-form select; compatibility name)" },
  { name: "Git Branch",      allowedTypes: ["rich_text"], description: "task/TASK-NNN-slug" },
  { name: "Docs Path",       allowedTypes: ["rich_text"], description: "docs/tasks/TASK-NNN-*.md" },
  { name: "Summary",         allowedTypes: ["rich_text"], description: "TASK Goal summary" },
  { name: "Result Summary",  allowedTypes: ["rich_text"], description: "TASK Result summary (set on Review/Done)" },
];

export interface NotionPropertyShape {
  /** exact property name */
  readonly name: string;
  /** the `.type` field from Notion `databases.retrieve` */
  readonly type: string;
}

export interface SchemaViolation {
  /** which DB the violation belongs to */
  readonly db: "projects" | "tasks";
  /** required property name — `"(properties)"` for `missing-properties` */
  readonly property: string;
  /** what went wrong */
  readonly kind:
    | "missing"
    | "type-mismatch"
    | "missing-properties"
    | "status-options-missing"
    | "status-options-unreadable";
  /** if type-mismatch, the actual type we saw */
  readonly actualType?: string;
  /** expected types from the requirement (empty for `missing-properties`) */
  readonly allowedTypes: readonly string[];
  /** description */
  readonly description: string;
  /**
   * For `status-options-missing` (and `select-options-missing` if we later
   * extend): the option names VibeOps requires but did not find in Notion.
   * Empty otherwise.
   */
  readonly missingOptions?: readonly string[];
  /**
   * For `status-options-missing` / `status-options-unreadable`: the full
   * required set, so callers can render "Add these options in Notion: …".
   */
  readonly requiredOptions?: readonly string[];
  /**
   * For `status-options-missing` (and similar): the option names we DID see
   * in Notion's response. Helpful diagnostic when names mismatch by casing
   * or whitespace ("planned" vs "Planned").
   */
  readonly foundOptions?: readonly string[];
}

/**
 * Friendly prefix shown in CLI output / 4xx hints whenever a status option
 * is missing. Surface it verbatim so user knows it's a Notion-side action.
 */
export const STATUS_OPTIONS_HINT =
  "Add missing Status options to the Notion database, then rerun `vibeops notion test`.";

/**
 * Friendly bilingual hint reused by `notion test` and `notion sync` when the
 * retrieve response does not expose a `properties` object. Surface it
 * verbatim in CLI error output — it is referenced from TASK-011 docs.
 */
export const MISSING_PROPERTIES_HINT =
  "Could not read Notion database properties. " +
  "This may happen if the selected ID is not a database/data source ID, " +
  "or the integration does not have access to the database itself. " +
  "Open the database as a full page and share it with the VibeOps integration, " +
  "then run `vibeops notion test`.";

/**
 * Best-effort extraction of a Notion `properties` map from a value that may be:
 *   - `undefined` / `null` / non-object → `null`
 *   - a `databases.retrieve()` response  →  the nested `properties` object
 *   - a `data_source` retrieve response  →  the nested `properties` object
 *   - a bare `properties` map already    →  the value itself
 *
 * VibeOps schema validators must funnel every input through this helper so
 * a malformed response (legacy SDK, partial mock, wrong id) yields a clean
 * `missing-properties` violation instead of a `TypeError`.
 */
export function getNotionProperties(
  input: unknown,
): Record<string, unknown> | null {
  if (input === null || input === undefined || typeof input !== "object") {
    return null;
  }
  const obj = input as Record<string, unknown>;
  const props = obj.properties;
  if (props !== undefined && props !== null && typeof props === "object") {
    return props as Record<string, unknown>;
  }
  // Already a properties map? Look for at least one well-known VibeOps key.
  if (
    "Name" in obj ||
    "Task ID" in obj ||
    "Project ID" in obj ||
    "Status" in obj
  ) {
    return obj;
  }
  return null;
}

/**
 * Best-effort extraction of the Notion API object kind:
 *   - `databases.retrieve()`   → "database"
 *   - data_source retrieve     → "data_source"
 *   - anything else / missing  → "(unknown)"
 *
 * Used by callers to render diagnostic detail without leaking any token.
 */
export function readNotionObjectKind(input: unknown): string {
  if (input === null || input === undefined || typeof input !== "object") {
    return "(unknown)";
  }
  const obj = input as { object?: unknown };
  return typeof obj.object === "string" ? obj.object : "(unknown)";
}

export interface ValidateSchemaInputs {
  db: "projects" | "tasks";
  required: readonly PropertyRequirement[];
  /**
   * Notion `databases.retrieve()` / data-source retrieve response, OR a bare
   * `properties` map. `validateDatabaseSchema` extracts the properties
   * defensively and emits a `missing-properties` violation when the shape is
   * unrecognised — it never throws.
   */
  retrieveResponse: unknown;
}

export function validateDatabaseSchema(
  inputs: ValidateSchemaInputs,
): SchemaViolation[] {
  const properties = getNotionProperties(inputs.retrieveResponse);
  if (properties === null) {
    return [
      {
        db: inputs.db,
        property: "(properties)",
        kind: "missing-properties",
        allowedTypes: [],
        description: MISSING_PROPERTIES_HINT,
      },
    ];
  }
  const violations: SchemaViolation[] = [];
  for (const req of inputs.required) {
    const prop = properties[req.name];
    if (prop === undefined || prop === null) {
      violations.push({
        db: inputs.db,
        property: req.name,
        kind: "missing",
        allowedTypes: req.allowedTypes,
        description: req.description,
      });
      continue;
    }
    const actual =
      typeof (prop as { type?: unknown }).type === "string"
        ? (prop as { type: string }).type
        : "(unknown)";
    if (!req.allowedTypes.includes(actual as NotionPropertyType)) {
      violations.push({
        db: inputs.db,
        property: req.name,
        kind: "type-mismatch",
        actualType: actual,
        allowedTypes: req.allowedTypes,
        description: req.description,
      });
      // skip option check — type is wrong already
      continue;
    }
    // status options check — only if (a) the requirement has them, (b) the
    // observed type is `status` (we don't check select/multi_select yet —
    // VibeOps doesn't write to them at runtime in this MVP).
    if (
      req.requiredOptions !== undefined &&
      req.requiredOptions.length > 0 &&
      actual === "status"
    ) {
      const extracted = extractStatusOptionNames(prop);
      if (extracted === null) {
        violations.push({
          db: inputs.db,
          property: req.name,
          kind: "status-options-unreadable",
          allowedTypes: req.allowedTypes,
          description: req.description,
          requiredOptions: req.requiredOptions,
        });
        continue;
      }
      const found = new Set(extracted);
      const missing = req.requiredOptions.filter((n) => !found.has(n));
      if (missing.length > 0) {
        violations.push({
          db: inputs.db,
          property: req.name,
          kind: "status-options-missing",
          allowedTypes: req.allowedTypes,
          description: req.description,
          requiredOptions: req.requiredOptions,
          missingOptions: missing,
          foundOptions: extracted,
        });
      }
    }
  }
  return violations;
}

/**
 * Extract `name` strings from a Notion `status` property's `options` array.
 * Notion's status response shape (API `2025-09-03`) looks like:
 *
 *   {
 *     id: "...",
 *     name: "Status",
 *     type: "status",
 *     status: {
 *       options: [{ id, name, color, description, ... }, …],
 *       groups:  [{ id, name, color, option_ids: [...] }, …]
 *     }
 *   }
 *
 * We also defensively look at `groups[].option_names` (some response shapes)
 * and the top-level `options` / `status_options` fallbacks. Returns `null`
 * when the property is shaped in a way we cannot recognise — callers should
 * surface that as `status-options-unreadable` so the user knows VibeOps
 * could not pre-flight check the option set rather than silently passing.
 *
 * IMPORTANT: never throws.
 */
export function extractStatusOptionNames(prop: unknown): string[] | null {
  if (prop === null || prop === undefined || typeof prop !== "object") {
    return null;
  }
  const names: string[] = [];
  const seen = new Set<string>();
  const pushName = (raw: unknown): void => {
    if (typeof raw !== "string") return;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    names.push(trimmed);
  };
  const collectFromOptions = (arr: unknown): void => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (item === null || typeof item !== "object") continue;
      pushName((item as { name?: unknown }).name);
    }
  };
  const obj = prop as Record<string, unknown>;
  // (a) modern shape: prop.status.options[].name
  const statusBody = obj.status;
  if (statusBody !== null && typeof statusBody === "object") {
    const sb = statusBody as Record<string, unknown>;
    collectFromOptions(sb.options);
    // some response shapes carry `groups[].options[].name` directly.
    if (Array.isArray(sb.groups)) {
      for (const g of sb.groups) {
        if (g !== null && typeof g === "object") {
          collectFromOptions((g as { options?: unknown }).options);
          const optionNames = (g as { option_names?: unknown }).option_names;
          if (Array.isArray(optionNames)) {
            for (const n of optionNames) pushName(n);
          }
        }
      }
    }
  }
  // (b) flat fallback: prop.options[].name  (older / partial shapes)
  collectFromOptions(obj.options);
  // (c) some legacy responses spell it `status_options`.
  collectFromOptions(obj.status_options);
  if (names.length === 0) {
    // Distinguish "we found the property but couldn't read any option names"
    // from "we read 0 options" — both look the same here, so return null to
    // tell the caller to surface `status-options-unreadable`. A real Notion
    // workspace always has at least 1 status option.
    return null;
  }
  return names;
}
