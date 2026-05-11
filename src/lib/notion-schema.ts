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
}

export const PROJECTS_DB_PROPERTIES: readonly PropertyRequirement[] = [
  { name: "Name",          allowedTypes: ["title"],            description: "프로젝트 페이지 제목 (Notion 'Title' 컬럼)" },
  { name: "Project ID",    allowedTypes: ["rich_text"],        description: ".vibeops.json 의 projectId 와 매칭" },
  { name: "Status",        allowedTypes: ["status"],           description: "프로젝트 단계 (Notion 'Status' 타입; select 아님)" },
  { name: "Local Path",    allowedTypes: ["rich_text"],        description: "로컬 저장소 경로" },
  { name: "Git Repo",      allowedTypes: ["rich_text", "url"], description: "원격 저장소 URL (rich_text 또는 url 둘 다 허용)" },
  { name: "Current Phase", allowedTypes: ["select"],           description: "현재 MVP phase" },
  { name: "Docs Path",     allowedTypes: ["rich_text"],        description: "docs/project 경로" },
  { name: "Summary",       allowedTypes: ["rich_text"],        description: "00-overview.md 요약" },
];

export const TASKS_DB_PROPERTIES: readonly PropertyRequirement[] = [
  { name: "Name",            allowedTypes: ["title"],     description: "TASK 페이지 제목" },
  { name: "Task ID",         allowedTypes: ["rich_text"], description: "TASK-NNN" },
  { name: "Project ID",      allowedTypes: ["rich_text"], description: "어떤 프로젝트의 TASK 인가" },
  { name: "Status",          allowedTypes: ["status"],    description: "Planned / In Progress / Review / Done (Notion 'Status' 타입)" },
  { name: "Priority",        allowedTypes: ["select"],    description: "P0 / P1 / P2 등" },
  { name: "MVP Phase",       allowedTypes: ["select"],    description: "MVP 1 / MVP 2 / …" },
  { name: "Git Branch",      allowedTypes: ["rich_text"], description: "task/TASK-NNN-slug" },
  { name: "Docs Path",       allowedTypes: ["rich_text"], description: "docs/tasks/TASK-NNN-*.md" },
  { name: "Summary",         allowedTypes: ["rich_text"], description: "TASK Goal 요약" },
  { name: "Result Summary",  allowedTypes: ["rich_text"], description: "TASK Result 섹션 요약 (Review/Done 시)" },
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
  /** required property name */
  readonly property: string;
  /** "missing" or "type-mismatch" */
  readonly kind: "missing" | "type-mismatch";
  /** if type-mismatch, the actual type we saw */
  readonly actualType?: string;
  /** expected types from the requirement */
  readonly allowedTypes: readonly string[];
  /** description */
  readonly description: string;
}

export interface ValidateSchemaInputs {
  db: "projects" | "tasks";
  required: readonly PropertyRequirement[];
  /** raw `properties` map from `databases.retrieve()` */
  properties: Record<string, { type?: string } | unknown>;
}

export function validateDatabaseSchema(
  inputs: ValidateSchemaInputs,
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  for (const req of inputs.required) {
    const prop = inputs.properties[req.name];
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
    }
  }
  return violations;
}
