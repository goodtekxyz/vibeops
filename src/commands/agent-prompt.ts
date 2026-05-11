import { resolve } from "node:path";

import { findAgent, listAgents } from "../agent/loader.js";
import { buildPrompt } from "../agent/prompt.js";
import { readConfig } from "../lib/config.js";
import { readText } from "../lib/filesystem.js";
import { log } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { readTaskFile, scanTasks } from "../lib/task.js";

export interface AgentPromptOptions {
  cwd?: string;
  context?: string[];
}

async function locateTaskFile(tasksDir: string, taskId: string): Promise<string | null> {
  const all = await scanTasks(tasksDir);
  const target = taskId.toUpperCase();
  for (const t of all) {
    if (t.id.toUpperCase() === target) return t.filePath;
  }
  return null;
}

export async function agentPromptCommand(
  name: string,
  taskId: string,
  options: AgentPromptOptions = {},
): Promise<void> {
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

  const config = await readConfig(paths.root);

  let task: { meta: Awaited<ReturnType<typeof readTaskFile>>; body: string } | undefined;
  const looksLikeTaskId = /^TASK-\d+/i.test(taskId);
  if (looksLikeTaskId) {
    const filePath = await locateTaskFile(paths.docsTasks, taskId);
    if (!filePath) {
      log.error(`TASK not found: ${taskId} (looked in ${paths.docsTasks})`);
      process.exitCode = 1;
      return;
    }
    const meta = await readTaskFile(filePath);
    const body = await readText(filePath);
    task = { meta, body };
  } else if (taskId !== "(unspecified)" && taskId.length > 0) {
    log.warn(
      `"${taskId}" does not look like a TASK id (expected TASK-NNN). Continuing without TASK context.`,
    );
  }

  const prompt = await buildPrompt({
    agent,
    config,
    task,
    projectRoot: paths.root,
    contextPaths: options.context ?? [],
  });

  log.raw(prompt.endsWith("\n") ? prompt : `${prompt}\n`);
}
