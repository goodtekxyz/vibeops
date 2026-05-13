import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface OpenAiProbeResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * Confirms `OPENAI_API_KEY` is set and accepted by the OpenAI API (lightweight).
 */
export async function probeOpenAiApiKey(): Promise<OpenAiProbeResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.length === 0) {
    return { ok: false, reason: "OPENAI_API_KEY is not set." };
  }
  try {
    const res = await fetch("https://api.openai.com/v1/models?limit=1", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `OpenAI API returned ${res.status}. ${body.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `Network error: ${msg}` };
  }
}

export interface CursorAgentProbeResult {
  readonly ok: boolean;
  readonly command: string;
  readonly stdout?: string;
  readonly reason?: string;
}

function agentBin(): string {
  return process.env.VIBEOPS_CURSOR_AGENT_BIN?.trim() || "agent";
}

/**
 * Checks that the Cursor Agent CLI is on PATH and `agent status` succeeds.
 */
export async function probeCursorAgentCli(cwd: string): Promise<CursorAgentProbeResult> {
  const command = agentBin();
  try {
    const { stdout, stderr } = await execFileAsync(command, ["status"], {
      cwd,
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    });
    const out = `${stdout}\n${stderr}`.trim();
    if (/not\s+logged\s+in|login\s+required|unauthorized|no\s+auth/i.test(out)) {
      return {
        ok: false,
        command,
        stdout: out,
        reason: "Cursor Agent CLI is installed but not authenticated.",
      };
    }
    return { ok: true, command, stdout: out };
  } catch (e: unknown) {
    const err = e as { code?: string; stderr?: string; message?: string };
    if (err.code === "ENOENT") {
      return {
        ok: false,
        command,
        reason: `Command "${command}" not found on PATH. Install from https://cursor.com/docs/cli`,
      };
    }
    const msg = [err.stderr, err.message].filter(Boolean).join(" ").trim();
    return {
      ok: false,
      command,
      reason: msg.length > 0 ? msg : "agent status failed",
    };
  }
}
