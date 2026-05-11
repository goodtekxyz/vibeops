import { resolve } from "node:path";

import { listAgents } from "../agent/loader.js";
import { bold, dim, log } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";

export interface AgentListOptions {
  json?: boolean;
  cwd?: string;
}

export async function agentListCommand(options: AgentListOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const agents = await listAgents(paths.vibeopsAgents);

  if (options.json) {
    const payload = agents.map((a) => ({
      name: a.meta.name,
      role: a.meta.role,
      description: a.meta.description ?? null,
      filePath: a.meta.filePath,
    }));
    log.raw(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (agents.length === 0) {
    log.warn(`No agents found in ${paths.vibeopsAgents}`);
    log.info(dim("Run `vibeops init` first."));
    process.exitCode = 1;
    return;
  }

  log.info(bold("Agents"));
  const nameWidth = Math.max(...agents.map((a) => a.meta.name.length));
  for (const a of agents) {
    const padded = a.meta.name.padEnd(nameWidth);
    const summary = a.meta.description ?? a.meta.role;
    log.info(`  ${padded}  ${dim(summary)}`);
  }
}
