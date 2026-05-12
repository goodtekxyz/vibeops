import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function agentBin(): string {
  return process.env.VIBEOPS_CURSOR_AGENT_BIN?.trim() || "agent";
}

/**
 * Runs Cursor Agent CLI in print mode with JSON output and plan mode.
 * @see https://cursor.com/docs/cli/reference/parameters
 */
export async function cursorAgentPrint(params: {
  readonly cwd: string;
  readonly prompt: string;
}): Promise<string> {
  const command = agentBin();
  const argv = [
    "--print",
    "--output-format",
    "json",
    "--plan",
    "--workspace",
    params.cwd,
    "--trust",
    params.prompt,
  ];
  try {
    const { stdout, stderr } = await execFileAsync(command, argv, {
      cwd: params.cwd,
      maxBuffer: 16 * 1024 * 1024,
      env: process.env,
    });
    const combined = `${stdout}${stderr}`.trim();
    return combined.length > 0 ? combined : stdout;
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    const msg = [err.stderr, err.message].filter(Boolean).join("\n").trim();
    throw new Error(msg.length > 0 ? msg : `${command} --print failed`);
  }
}

/**
 * Parses `agent --print --output-format json` stdout.
 * Shape may be `{ "result": "..." }` or nested — try common keys then raw.
 */
export function extractAgentAssistantText(rawStdout: string): string {
  const trimmed = rawStdout.trim();
  try {
    const j = JSON.parse(trimmed) as Record<string, unknown>;
    for (const key of ["result", "response", "output", "text", "message", "content"]) {
      const v = j[key];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
    if (typeof j.assistant === "string") return j.assistant.trim();
  } catch {
    /* fall through */
  }
  return trimmed;
}
