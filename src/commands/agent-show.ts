import { resolve } from "node:path";

import { findAgent, listAgents } from "../agent/loader.js";
import { log } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";

export interface AgentShowOptions {
  raw?: boolean;
  cwd?: string;
}

export async function agentShowCommand(name: string, options: AgentShowOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const agent = await findAgent(paths.vibeopsAgents, name);

  if (!agent) {
    const available = (await listAgents(paths.vibeopsAgents)).map((a) => a.meta.name);
    log.error(`Unknown agent: "${name}".`);
    if (available.length > 0) {
      log.info(`Available: ${available.join(", ")}`);
    } else {
      log.info(`No agents installed in ${paths.vibeopsAgents}. Run \`vibeops init\` first.`);
    }
    process.exitCode = 1;
    return;
  }

  if (options.raw) {
    log.raw(agent.raw.endsWith("\n") ? agent.raw : `${agent.raw}\n`);
    return;
  }

  log.raw(agent.body.endsWith("\n") ? agent.body : `${agent.body}\n`);
}
