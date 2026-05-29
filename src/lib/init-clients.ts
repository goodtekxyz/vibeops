import { checkbox } from "@inquirer/prompts";

import type { VibeopsClientId } from "../types/config.js";

export const VIBEOPS_CLIENT_IDS = ["cursor", "claude", "codex"] as const;

export const CLIENT_LABELS: Record<VibeopsClientId, string> = {
  cursor: "Cursor (.cursor/rules, .cursor/skills)",
  claude: "Claude Code (CLAUDE.md, .claude/skills)",
  codex: "Codex CLI (.agents/skills)",
};

/** Relative skill root per client (under project root). */
export const CLIENT_SKILL_ROOT: Record<VibeopsClientId, string> = {
  cursor: ".cursor/skills",
  claude: ".claude/skills",
  codex: ".agents/skills",
};

export function parseClientsArg(raw: string | undefined): VibeopsClientId[] | null {
  if (raw === undefined || raw.trim().length === 0) return null;
  const parts = raw.split(",").map((p) => p.trim().toLowerCase());
  const out: VibeopsClientId[] = [];
  for (const p of parts) {
    const id = parseOneClient(p);
    if (id === null) return null;
    if (!out.includes(id)) out.push(id);
  }
  return out.length > 0 ? out : null;
}

function parseOneClient(token: string): VibeopsClientId | null {
  if (token === "cursor") return "cursor";
  if (token === "claude" || token === "claude-code" || token === "claudecode") return "claude";
  if (token === "codex" || token === "codex-cli") return "codex";
  return null;
}

export function isVibeopsClientId(value: string): value is VibeopsClientId {
  return (VIBEOPS_CLIENT_IDS as readonly string[]).includes(value);
}

export async function askInitClients(): Promise<VibeopsClientId[]> {
  const selected = await checkbox<VibeopsClientId>({
    message: "Which coding agents will you use? (Space toggle · Enter confirm)",
    choices: VIBEOPS_CLIENT_IDS.map((id) => ({
      name: CLIENT_LABELS[id],
      value: id,
      checked: id === "cursor",
    })),
    loop: false,
    validate: (answer) =>
      answer.length > 0 ? true : "Select at least one agent (Cursor, Claude Code, and/or Codex).",
  });
  return selected;
}

export function formatClientsList(clients: readonly VibeopsClientId[]): string {
  return clients.map((c) => CLIENT_LABELS[c]).join(", ");
}
