import { join } from "node:path";

import { readTextOrNull, writeText } from "./filesystem.js";

/**
 * Helpers for reading and editing the project `package.json` repository
 * fields. Pure-text-aware where it matters: we use `JSON.parse` for typed
 * access but preserve the file's existing 2-space indentation and trailing
 * newline when writing back.
 */

export interface PackageJsonRepositoryObject {
  type?: string;
  url?: string;
  directory?: string;
}

export interface PackageJsonBugsObject {
  url?: string;
  email?: string;
}

export interface PackageJsonShape {
  name?: string;
  description?: string;
  homepage?: string;
  repository?: string | PackageJsonRepositoryObject;
  bugs?: string | PackageJsonBugsObject;
  [key: string]: unknown;
}

export interface PackageJsonRead {
  /** Absolute path read from. */
  path: string;
  /** Raw file text (preserved for write-back). */
  raw: string;
  /** Parsed JSON object. */
  data: PackageJsonShape;
}

const PACKAGE_JSON_FILE = "package.json";

export async function readPackageJson(
  cwd: string,
): Promise<PackageJsonRead | null> {
  const abs = join(cwd, PACKAGE_JSON_FILE);
  const raw = await readTextOrNull(abs);
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as PackageJsonShape;
    return { path: abs, raw, data };
  } catch {
    return null;
  }
}

/** Read the canonical repository URL string, regardless of shape. */
export function readRepositoryUrl(pkg: PackageJsonShape): string {
  const r = pkg.repository;
  if (typeof r === "string") return r;
  if (r !== null && typeof r === "object" && typeof r.url === "string")
    return r.url;
  return "";
}

export function readBugsUrl(pkg: PackageJsonShape): string {
  const b = pkg.bugs;
  if (typeof b === "string") return b;
  if (b !== null && typeof b === "object" && typeof b.url === "string")
    return b.url;
  return "";
}

export function readHomepage(pkg: PackageJsonShape): string {
  return typeof pkg.homepage === "string" ? pkg.homepage : "";
}

export interface PackageJsonRepositoryPatch {
  owner: string;
  repo: string;
}

export interface PackageJsonFieldDiff {
  field: "repository.url" | "homepage" | "bugs.url";
  before: string;
  after: string;
}

export interface UpdatePackageRepositoryFieldsInput {
  cwd: string;
  patch: PackageJsonRepositoryPatch;
  dryRun?: boolean;
}

export interface UpdatePackageRepositoryFieldsResult {
  ok: boolean;
  reason?: "missing" | "invalid";
  /** Planned diffs (whether dryRun or not). Empty when nothing changes. */
  diffs: PackageJsonFieldDiff[];
  /** The next package.json data object (for inspection). */
  next?: PackageJsonShape;
  /** Whether the file was actually written. */
  written: boolean;
  /** Absolute file path. */
  path: string;
}

function detectIndent(raw: string): number {
  // Look at the first indented line.
  for (const line of raw.split(/\r?\n/)) {
    const m = /^(\s+)\S/.exec(line);
    if (m === null) continue;
    const indent = m[1]!;
    if (indent.startsWith("\t")) return 0;
    if (indent.length > 0) return indent.length;
  }
  return 2;
}

function stringifyKeepingTrailingNewline(
  data: PackageJsonShape,
  raw: string,
  indent: number,
): string {
  const trailing = raw.endsWith("\n") ? "\n" : "";
  return `${JSON.stringify(data, null, indent || 2)}${trailing}`;
}

export function buildRepositoryFieldsPatch({
  owner,
  repo,
}: PackageJsonRepositoryPatch): {
  repositoryUrl: string;
  homepage: string;
  bugsUrl: string;
} {
  return {
    repositoryUrl: `git+https://github.com/${owner}/${repo}.git`,
    homepage: `https://github.com/${owner}/${repo}#readme`,
    bugsUrl: `https://github.com/${owner}/${repo}/issues`,
  };
}

export async function updatePackageRepositoryFields(
  input: UpdatePackageRepositoryFieldsInput,
): Promise<UpdatePackageRepositoryFieldsResult> {
  const read = await readPackageJson(input.cwd);
  const path = join(input.cwd, PACKAGE_JSON_FILE);
  if (read === null) {
    return {
      ok: false,
      reason: "missing",
      diffs: [],
      written: false,
      path,
    };
  }

  const patch = buildRepositoryFieldsPatch(input.patch);
  const before = {
    repositoryUrl: readRepositoryUrl(read.data),
    homepage: readHomepage(read.data),
    bugsUrl: readBugsUrl(read.data),
  };
  const next: PackageJsonShape = { ...read.data };

  // repository: always normalize to object shape with type=git.
  const prevRepo = read.data.repository;
  const repoObject: PackageJsonRepositoryObject =
    prevRepo !== null && typeof prevRepo === "object" ? { ...prevRepo } : {};
  repoObject.type = repoObject.type ?? "git";
  repoObject.url = patch.repositoryUrl;
  next.repository = repoObject;

  next.homepage = patch.homepage;

  const prevBugs = read.data.bugs;
  const bugsObject: PackageJsonBugsObject =
    prevBugs !== null && typeof prevBugs === "object" ? { ...prevBugs } : {};
  bugsObject.url = patch.bugsUrl;
  next.bugs = bugsObject;

  const diffs: PackageJsonFieldDiff[] = [];
  if (before.repositoryUrl !== patch.repositoryUrl) {
    diffs.push({
      field: "repository.url",
      before: before.repositoryUrl,
      after: patch.repositoryUrl,
    });
  }
  if (before.homepage !== patch.homepage) {
    diffs.push({
      field: "homepage",
      before: before.homepage,
      after: patch.homepage,
    });
  }
  if (before.bugsUrl !== patch.bugsUrl) {
    diffs.push({
      field: "bugs.url",
      before: before.bugsUrl,
      after: patch.bugsUrl,
    });
  }

  if (input.dryRun === true || diffs.length === 0) {
    return {
      ok: true,
      diffs,
      next,
      written: false,
      path,
    };
  }

  const indent = detectIndent(read.raw);
  const text = stringifyKeepingTrailingNewline(next, read.raw, indent);
  await writeText(path, text);
  return {
    ok: true,
    diffs,
    next,
    written: true,
    path,
  };
}
