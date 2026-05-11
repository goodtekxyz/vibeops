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

너는 위 에이전트 정의의 **Role / Inputs / Output Format / Rules / 금지사항**을 그대로 적용한다.
출력은 Cursor 채팅창에 그대로 붙여 넣을 수 있는 단일 마크다운이다.

작업이 끝나면 \`AGENTS.md\` § "작업 완료 후 보고 형식"에 따라 보고한다:
TASK ID · 요약 · 변경 파일 · 검증 · 문서 반영(05-current-state / TASK / docs/logs).
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
