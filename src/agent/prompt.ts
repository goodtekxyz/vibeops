import { relative } from "node:path";

import { readText } from "../lib/filesystem.js";
import { type VibeopsConfig } from "../types/config.js";
import { type TaskMeta } from "../types/task.js";

import { type AgentRecord } from "./loader.js";

export interface PromptInputs {
  agent: AgentRecord;
  config: VibeopsConfig | null;
  task?: { meta: TaskMeta; body: string } | undefined;
  projectRoot: string;
  contextPaths?: string[];
}

function relOrAbs(root: string, p: string): string {
  const r = relative(root, p);
  return r === "" ? "." : r.startsWith("..") ? p : r;
}

function header(inputs: PromptInputs): string {
  const lines: string[] = [];
  lines.push(`# Cursor prompt — agent: ${inputs.agent.meta.name}`);
  lines.push("");
  if (inputs.config) {
    lines.push(`Project: \`${inputs.config.name}\``);
    lines.push(`VibeOps: \`${inputs.config.vibeopsVersion}\``);
  } else {
    lines.push("Project: (no .vibeops.json found — running outside a VibeOps project)");
  }
  if (inputs.task) {
    lines.push(`TASK: \`${inputs.task.meta.id}\``);
    lines.push(
      `TASK file: \`${relOrAbs(inputs.projectRoot, inputs.task.meta.filePath)}\``,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function agentSection(agent: AgentRecord): string {
  return `## Agent definition (${agent.meta.name})\n\n${agent.body.trim()}\n`;
}

function taskSection(task: { meta: TaskMeta; body: string }): string {
  return `## TASK file content\n\n${task.body.trim()}\n`;
}

async function contextSection(paths: string[], projectRoot: string): Promise<string> {
  if (paths.length === 0) return "";
  const parts: string[] = ["## Extra context\n"];
  for (const p of paths) {
    try {
      const text = await readText(p);
      parts.push(`### ${relOrAbs(projectRoot, p)}\n\n\`\`\`\n${text}\n\`\`\`\n`);
    } catch {
      parts.push(`### ${relOrAbs(projectRoot, p)}\n\n_(could not read file)_\n`);
    }
  }
  return parts.join("\n");
}

const FOOTER = `---

Apply the **Role / Inputs / Output Format / Rules / Forbidden** sections of the agent definition above as-is.
Your output must be a single markdown blob that pastes cleanly into the Cursor chat.

When done, follow the "Completion report" format in \`AGENTS.md\`:
TASK ID · summary · changed files · verification · doc updates (05-current-state / TASK / docs/logs).
`;

export async function buildPrompt(inputs: PromptInputs): Promise<string> {
  const parts: string[] = [
    header(inputs),
    agentSection(inputs.agent),
  ];
  if (inputs.task) parts.push(taskSection(inputs.task));
  const extra = await contextSection(inputs.contextPaths ?? [], inputs.projectRoot);
  if (extra.length > 0) parts.push(extra);
  parts.push(FOOTER);
  return parts.join("\n");
}
