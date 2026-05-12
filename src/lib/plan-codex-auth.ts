/**
 * Codex / ChatGPT OAuth — same public client_id and token endpoint as
 * Hermes (`hermes_cli/auth.py`) and OpenClaw's openai-codex provider.
 * Reads credentials written by the official Codex CLI (`codex login`) under
 * `CODEX_HOME` (default ~/.codex/auth.json).
 *
 * @see https://developers.openai.com/codex/auth
 * @see https://docs.openclaw.ai/concepts/oauth (OpenAI Codex OAuth)
 */
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Public OAuth client id used by Codex CLI / Hermes / OpenClaw for ChatGPT login. */
export const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

export const CODEX_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";

const DEFAULT_CODEX_HOME = () => join(homedir(), ".codex");

export function codexAuthJsonPath(): string {
  const home = process.env.CODEX_HOME?.trim();
  return join(home && home.length > 0 ? home : DEFAULT_CODEX_HOME(), "auth.json");
}

function decodeJwtExpMs(accessToken: string): number | null {
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function codexAccessTokenExpiring(accessToken: string, skewSeconds: number): boolean {
  const expMs = decodeJwtExpMs(accessToken);
  if (expMs === null) return true;
  return Date.now() >= expMs - skewSeconds * 1000;
}

export interface CodexAuthProbeResult {
  readonly ok: boolean;
  readonly path: string;
  readonly reason?: string;
}

/**
 * Checks that `auth.json` exists and contains access + refresh tokens (shape
 * compatible with the Codex CLI file store).
 */
export async function probeCodexOAuthFile(): Promise<CodexAuthProbeResult> {
  const path = codexAuthJsonPath();
  try {
    const raw = await readFile(path, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const tokens = (data.tokens ?? data) as Record<string, unknown>;
    const access = typeof tokens.access_token === "string" ? tokens.access_token.trim() : "";
    const refresh = typeof tokens.refresh_token === "string" ? tokens.refresh_token.trim() : "";
    if (access.length === 0 || refresh.length === 0) {
      return {
        ok: false,
        path,
        reason: "auth.json exists but is missing access_token or refresh_token.",
      };
    }
    return { ok: true, path };
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "ENOENT") {
      return {
        ok: false,
        path,
        reason: `No Codex auth file. Run ${"codex login"} (ChatGPT) or copy auth.json from a machine where login succeeded.`,
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, path, reason: msg };
  }
}

export interface CodexTokenPair {
  readonly access_token: string;
  readonly refresh_token: string;
}

async function readAuthPayload(): Promise<{ path: string; root: Record<string, unknown> } | null> {
  const path = codexAuthJsonPath();
  try {
    const raw = await readFile(path, "utf-8");
    const root = JSON.parse(raw) as Record<string, unknown>;
    return { path, root };
  } catch {
    return null;
  }
}

function extractTokens(root: Record<string, unknown>): CodexTokenPair | null {
  const tokens = (root.tokens ?? root) as Record<string, unknown>;
  const access = typeof tokens.access_token === "string" ? tokens.access_token.trim() : "";
  const refresh = typeof tokens.refresh_token === "string" ? tokens.refresh_token.trim() : "";
  if (!access || !refresh) return null;
  return { access_token: access, refresh_token: refresh };
}

/**
 * Exchanges refresh_token for a new access_token (and optional rotated refresh).
 */
export async function refreshCodexOAuthTokens(refreshToken: string): Promise<CodexTokenPair> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CODEX_OAUTH_CLIENT_ID,
  });
  const res = await fetch(CODEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Codex OAuth refresh failed (${res.status}): ${text.slice(0, 400)}`);
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Codex OAuth refresh returned invalid JSON.");
  }
  const access = typeof json.access_token === "string" ? json.access_token.trim() : "";
  if (!access) {
    throw new Error("Codex OAuth refresh response missing access_token.");
  }
  const nextRefresh =
    typeof json.refresh_token === "string" && json.refresh_token.trim().length > 0
      ? json.refresh_token.trim()
      : refreshToken;
  return { access_token: access, refresh_token: nextRefresh };
}

/**
 * Returns a usable access token, refreshing and persisting to auth.json when
 * the JWT is near expiry (same pattern as Hermes `resolve_codex_runtime_credentials`).
 */
export async function resolveCodexOAuthAccessToken(
  skewSeconds = 120,
): Promise<{ accessToken: string }> {
  const loaded = await readAuthPayload();
  if (!loaded) {
    throw new Error(`Codex auth file missing: ${codexAuthJsonPath()}`);
  }
  const { path, root } = loaded;
  let pair = extractTokens(root);
  if (!pair) {
    throw new Error(`Codex auth file has no tokens: ${path}`);
  }

  if (codexAccessTokenExpiring(pair.access_token, skewSeconds)) {
    pair = await refreshCodexOAuthTokens(pair.refresh_token);
    const nextRoot = { ...root };
    const tokenBag =
      nextRoot.tokens !== undefined && typeof nextRoot.tokens === "object" && !Array.isArray(nextRoot.tokens)
        ? { ...(nextRoot.tokens as Record<string, unknown>) }
        : {};
    tokenBag.access_token = pair.access_token;
    tokenBag.refresh_token = pair.refresh_token;
    nextRoot.tokens = tokenBag;
    await writeFile(path, `${JSON.stringify(nextRoot, null, 2)}\n`, "utf-8");
  }

  return { accessToken: pair.access_token };
}
