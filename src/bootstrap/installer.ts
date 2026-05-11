import { join } from "node:path";

import { ensureDir, pathExists, readText, readTextOrNull, writeText } from "../lib/filesystem.js";
import { dim, green, log, yellow } from "../lib/logger.js";
import { projectPaths, VIBEOPS_ENV_FILE } from "../lib/paths.js";

import { type ManifestEntry, loadManifest, resolveDestination } from "./manifest.js";
import {
  applySubstitutions,
  buildSubstitutions,
  isTextPath,
  type Substitutions,
} from "./substitute.js";

import { configToJson } from "../lib/config.js";
import { type VibeopsConfig } from "../types/config.js";

export type FileAction = "created" | "overwritten" | "skipped" | "would-create" | "would-overwrite";

export interface FileOutcome {
  action: FileAction;
  relativePath: string;
}

export interface InstallOptions {
  projectRoot: string;
  config: VibeopsConfig;
  dryRun: boolean;
  force: boolean;
}

export interface InstallReport {
  files: FileOutcome[];
  created: number;
  overwritten: number;
  skipped: number;
}

function envExampleContents(): string {
  return [
    "# VibeOps · environment example",
    "# Copy this file to .vibeops.env and fill in the values.",
    "# Never commit .vibeops.env — it is added to .gitignore by `vibeops init`.",
    "",
    "NOTION_API_KEY=",
    "NOTION_PROJECT_DB=",
    "NOTION_TASK_DB=",
    "",
  ].join("\n");
}

async function copyOne(
  entry: ManifestEntry,
  dest: string,
  subs: Substitutions,
  options: InstallOptions,
): Promise<FileOutcome> {
  const exists = await pathExists(dest);
  const relPath = entry.relativePath;

  if (exists && !options.force) {
    return { action: "skipped", relativePath: relPath };
  }

  if (options.dryRun) {
    return {
      action: exists ? "would-overwrite" : "would-create",
      relativePath: relPath,
    };
  }

  const raw = await readText(entry.sourceAbs);
  const out = isTextPath(entry.sourceAbs) ? applySubstitutions(raw, subs) : raw;
  await writeText(dest, out);
  return {
    action: exists ? "overwritten" : "created",
    relativePath: relPath,
  };
}

async function writeBlobIfNeeded(
  dest: string,
  relPath: string,
  contents: string,
  options: InstallOptions,
): Promise<FileOutcome> {
  const exists = await pathExists(dest);
  if (exists && !options.force) {
    return { action: "skipped", relativePath: relPath };
  }
  if (options.dryRun) {
    return {
      action: exists ? "would-overwrite" : "would-create",
      relativePath: relPath,
    };
  }
  await writeText(dest, contents);
  return {
    action: exists ? "overwritten" : "created",
    relativePath: relPath,
  };
}

async function ensureGitignoreEntry(
  projectRoot: string,
  dryRun: boolean,
): Promise<FileOutcome | null> {
  const path = join(projectRoot, ".gitignore");
  const existing = await readTextOrNull(path);
  const line = VIBEOPS_ENV_FILE;
  if (existing && existing.split("\n").some((l) => l.trim() === line)) {
    return null;
  }
  if (dryRun) {
    return {
      action: existing ? "would-overwrite" : "would-create",
      relativePath: ".gitignore",
    };
  }
  const next = existing
    ? `${existing.endsWith("\n") ? existing : `${existing}\n`}${line}\n`
    : `${line}\n`;
  await writeText(path, next);
  return {
    action: existing ? "overwritten" : "created",
    relativePath: ".gitignore",
  };
}

export async function install(options: InstallOptions): Promise<InstallReport> {
  const paths = projectPaths(options.projectRoot);
  const subs = buildSubstitutions(options.config);

  if (!options.dryRun) {
    await ensureDir(paths.root);
  }

  const manifest = await loadManifest();
  const outcomes: FileOutcome[] = [];

  for (const entry of manifest) {
    const dest = resolveDestination(entry, paths.root);
    const outcome = await copyOne(entry, dest, subs, options);
    outcomes.push(outcome);
  }

  const configOutcome = await writeBlobIfNeeded(
    paths.config,
    ".vibeops.json",
    configToJson(options.config),
    options,
  );
  outcomes.push(configOutcome);

  const envExampleOutcome = await writeBlobIfNeeded(
    paths.envExample,
    ".vibeops.env.example",
    envExampleContents(),
    options,
  );
  outcomes.push(envExampleOutcome);

  const gitignoreOutcome = await ensureGitignoreEntry(paths.root, options.dryRun);
  if (gitignoreOutcome) outcomes.push(gitignoreOutcome);

  let created = 0;
  let overwritten = 0;
  let skipped = 0;
  for (const o of outcomes) {
    if (o.action === "created" || o.action === "would-create") created++;
    else if (o.action === "overwritten" || o.action === "would-overwrite") overwritten++;
    else skipped++;
  }
  return { files: outcomes, created, overwritten, skipped };
}

export function printReport(report: InstallReport, dryRun: boolean): void {
  for (const f of report.files) {
    switch (f.action) {
      case "created":
        log.ok(`created   ${f.relativePath}`);
        break;
      case "overwritten":
        log.ok(`${yellow("overwrote")} ${f.relativePath}`);
        break;
      case "skipped":
        log.skip(`skipped   ${f.relativePath} (already exists)`);
        break;
      case "would-create":
        log.info(`${dim("would create   ")}${f.relativePath}`);
        break;
      case "would-overwrite":
        log.info(`${dim("would overwrite")} ${f.relativePath}`);
        break;
    }
  }
  log.blank();
  if (dryRun) {
    log.info(
      `${green("dry-run")}: ${report.created} would be created, ${report.overwritten} would be overwritten, ${report.skipped} already exist.`,
    );
  } else {
    log.info(
      `${green("done")}: ${report.created} created, ${report.overwritten} overwritten, ${report.skipped} skipped.`,
    );
  }
}
