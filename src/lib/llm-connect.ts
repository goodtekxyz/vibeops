import { spawn } from "node:child_process";
import { access, appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { dim, log } from "./logger.js";
import { codexAuthJsonPath, probeCodexOAuthFile } from "./plan-codex-auth.js";
import { probeCursorAgentCli, probeOpenAiApiKey } from "./plan-llm-detect.js";
import { VIBEOPS_ENV_FILE } from "./paths.js";

function agentBin(): string {
  return process.env.VIBEOPS_CURSOR_AGENT_BIN?.trim() || "agent";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function runCursorAgentLogin(cwd: string): Promise<{ ok: boolean; message: string }> {
  const command = agentBin();
  const before = await probeCursorAgentCli(cwd);
  if (before.reason?.includes("not found on PATH")) {
    return {
      ok: false,
      message: [
        `Command "${command}" is not on PATH.`,
        "Install Cursor Agent CLI: https://cursor.com/docs/cli",
        "Then rerun: vibeops llm connect",
      ].join("\n"),
    };
  }

  log.info(`Running ${command} login — complete auth in the browser if prompted.`);
  log.blank();

  return await new Promise((resolve) => {
    const child = spawn(command, ["login"], {
      cwd,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        resolve({
          ok: false,
          message: `Command "${command}" not found. Install from https://cursor.com/docs/cli`,
        });
        return;
      }
      resolve({ ok: false, message: err.message });
    });
    child.on("close", async (code) => {
      const after = await probeCursorAgentCli(cwd);
      if (after.ok) {
        resolve({ ok: true, message: "Cursor Agent CLI is authenticated." });
        return;
      }
      if (code === 0) {
        resolve({
          ok: false,
          message: after.reason ?? "Login finished but `agent status` still reports not authenticated.",
        });
        return;
      }
      resolve({
        ok: false,
        message: after.reason ?? `${command} login exited with code ${code ?? "unknown"}.`,
      });
    });
  });
}

export async function guideCodexOAuth(): Promise<{ ok: boolean; message: string }> {
  const path = codexAuthJsonPath();
  const probe = await probeCodexOAuthFile();
  if (probe.ok) {
    return { ok: true, message: `Codex OAuth already configured at ${path}` };
  }
  return {
    ok: false,
    message: [
      "Codex OAuth is not configured yet.",
      "",
      "Option A — official Codex CLI:",
      "  codex login",
      "",
      "Option B — copy auth from another machine:",
      `  Place auth.json at ${path}`,
      "",
      "Then rerun: vibeops llm connect",
    ].join("\n"),
  };
}

export async function configureOpenAiKey(
  projectRoot: string,
  apiKey: string,
): Promise<{ ok: boolean; message: string; envPath: string }> {
  const trimmed = apiKey.trim();
  const envPath = join(projectRoot, VIBEOPS_ENV_FILE);
  if (trimmed.length === 0) {
    return { ok: false, message: "API key cannot be empty.", envPath };
  }

  const line = `OPENAI_API_KEY=${trimmed}`;

  if (await fileExists(envPath)) {
    const existing = await readFile(envPath, "utf-8");
    if (/^OPENAI_API_KEY=/m.test(existing)) {
      const next = existing.replace(/^OPENAI_API_KEY=.*$/m, line);
      await writeFile(envPath, next.endsWith("\n") ? next : `${next}\n`, "utf-8");
    } else {
      await appendFile(envPath, existing.endsWith("\n") ? `${line}\n` : `\n${line}\n`, "utf-8");
    }
  } else {
    await writeFile(
      envPath,
      ["# VibeOps · optional environment (gitignored)", "# Never commit secrets.", "", line, ""].join(
        "\n",
      ),
      "utf-8",
    );
  }

  process.env.OPENAI_API_KEY = trimmed;
  const verify = await probeOpenAiApiKey();
  if (!verify.ok) {
    return {
      ok: false,
      message: verify.reason ?? "Key saved but OpenAI verification failed.",
      envPath,
    };
  }

  return {
    ok: true,
    message: `OpenAI API key saved to ${VIBEOPS_ENV_FILE} and verified.`,
    envPath,
  };
}

export function codexAuthHint(): string {
  return codexAuthJsonPath();
}

export function cursorAgentHint(): string {
  return agentBin();
}

export function openAiEnvHint(projectRoot: string): string {
  return join(projectRoot, VIBEOPS_ENV_FILE);
}

export function printConnectSetupHint(provider: "codex-oauth" | "cursor-agent" | "openai"): void {
  switch (provider) {
    case "cursor-agent":
      log.info(dim("  https://cursor.com/docs/cli"));
      log.info(dim("  Then: agent login  (or vibeops llm connect → Set up Cursor Agent CLI)"));
      break;
    case "codex-oauth":
      log.info(dim(`  codex login  → ${codexAuthHint()}`));
      break;
    case "openai":
      log.info(dim(`  vibeops llm connect → Set up OpenAI API key  (writes ${VIBEOPS_ENV_FILE})`));
      break;
  }
}
