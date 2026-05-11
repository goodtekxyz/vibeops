import { resolve } from "node:path";

import { collectStatus } from "../status/collector.js";
import { printHuman, toJson } from "../status/format.js";
import { log } from "../lib/logger.js";

export interface StatusOptions {
  json?: boolean;
  cwd?: string;
}

export async function statusCommand(options: StatusOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const report = await collectStatus(cwd);

  if (options.json) {
    log.raw(toJson(report));
  } else {
    printHuman(report);
  }

  if (!report.isVibeopsProject) {
    process.exitCode = 1;
  }
}
