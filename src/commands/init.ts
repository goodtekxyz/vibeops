import { basename, resolve } from "node:path";

import { install, printReport } from "../bootstrap/installer.js";
import { buildConfig } from "../lib/config.js";
import { log } from "../lib/logger.js";

export interface InitOptions {
  dryRun?: boolean;
  force?: boolean;
  cwd?: string;
  name?: string;
}

function deriveProjectName(root: string, explicit: string | undefined): string {
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const base = basename(root);
  if (base.length > 0 && base !== "/") return base;
  return "untitled-project";
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const projectRoot = resolve(options.cwd ?? process.cwd());

  const name = deriveProjectName(projectRoot, options.name);
  const config = buildConfig(name);

  log.step(`vibeops init ${dryRun ? "(dry-run) " : ""}→ ${projectRoot}`);
  log.info(`  project: ${name}`);
  log.info(`  vibeops: ${config.vibeopsVersion}`);
  if (force) log.warn("--force is on — existing files will be overwritten.");
  log.blank();

  const report = await install({ projectRoot, config, dryRun, force });
  printReport(report, dryRun);

  if (!dryRun) {
    log.blank();
    log.info("Next steps:");
    log.info("  1. Open AGENTS.md and confirm the project name.");
    log.info("  2. Run `vibeops status` to verify installation.");
    log.info(
      "  3. Run `vibeops plan` to populate docs/project/* (or fill them by hand).",
    );
  }
}
