import { findAgent, listAgents } from "../agent/loader.js";
import { buildPrompt } from "../agent/prompt.js";
import { readConfig } from "./config.js";
import { readText } from "./filesystem.js";
import { readTaskFile } from "./task.js";

export interface BuildTaskPromptInputs {
  projectRoot: string;
  agentsDir: string;
  agentName: string;
  taskFilePath: string;
  contextPaths?: string[];
}

export type BuildTaskPromptResult =
  | { ok: true; prompt: string }
  | { ok: false; reason: "agent-not-found"; available: string[] };

export async function buildTaskPromptString(
  inputs: BuildTaskPromptInputs,
): Promise<BuildTaskPromptResult> {
  const agent = await findAgent(inputs.agentsDir, inputs.agentName);
  if (!agent) {
    const available = (await listAgents(inputs.agentsDir)).map((a) => a.meta.name);
    return { ok: false, reason: "agent-not-found", available };
  }
  const config = await readConfig(inputs.projectRoot);
  const meta = await readTaskFile(inputs.taskFilePath);
  const body = await readText(inputs.taskFilePath);
  const prompt = await buildPrompt({
    agent,
    config,
    task: { meta, body },
    projectRoot: inputs.projectRoot,
    contextPaths: inputs.contextPaths ?? [],
  });
  return { ok: true, prompt };
}
