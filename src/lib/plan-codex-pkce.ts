/**
 * Browser PKCE OAuth for OpenAI Codex (ChatGPT) — same parameters as community
 * clients (authorize URL, localhost redirect, S256 challenge, token exchange).
 *
 * @see https://docs.rs/codex-oauth/latest/codex_oauth/
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { askInput } from "./inquirer-helpers.js";
import { bold, cyan, dim, log, yellow } from "./logger.js";
import {
  CODEX_OAUTH_CLIENT_ID,
  CODEX_OAUTH_TOKEN_URL,
  saveCodexAuthTokens,
} from "./plan-codex-auth.js";

export const CODEX_OAUTH_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";

/** Must match OpenAI's registered redirect for this public Codex client. */
export const CODEX_OAUTH_REDIRECT_URI = "http://localhost:1455/auth/callback";

const CODEX_SCOPES = "openid profile email offline_access";
const CALLBACK_WAIT_MS = 600_000;

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createPkceVerifier(): string {
  return toBase64Url(randomBytes(32));
}

export function createPkceChallenge(verifier: string): string {
  return toBase64Url(createHash("sha256").update(verifier).digest());
}

export function createOAuthState(): string {
  return randomBytes(16).toString("hex");
}

export function buildCodexAuthorizeUrl(params: { readonly state: string; readonly verifier: string }): string {
  const challenge = createPkceChallenge(params.verifier);
  const url = new URL(CODEX_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CODEX_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", CODEX_OAUTH_REDIRECT_URI);
  url.searchParams.set("scope", CODEX_SCOPES);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", "pi");
  return url.toString();
}

function openSystemBrowser(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

function parseCallbackInput(input: string, expectedState: string): string | null {
  const value = input.trim();
  if (value.length === 0) return null;
  try {
    const u = new URL(value);
    if (u.searchParams.get("state") !== expectedState) return null;
    const code = u.searchParams.get("code");
    return code && code.length > 0 ? code : null;
  } catch {
    if (value.includes("code=")) {
      try {
        const params = value.startsWith("http") ? new URL(value).searchParams : new URLSearchParams(value);
        if (params.get("state") !== expectedState) return null;
        const c = params.get("code");
        return c && c.length > 0 ? c : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function exchangeCodexAuthorizationCode(
  code: string,
  verifier: string,
): Promise<{ access_token: string; refresh_token: string; id_token?: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CODEX_OAUTH_CLIENT_ID,
    code,
    code_verifier: verifier,
    redirect_uri: CODEX_OAUTH_REDIRECT_URI,
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
    throw new Error(`Codex token exchange failed (${res.status}): ${text.slice(0, 600)}`);
  }
  const json = JSON.parse(text) as Record<string, unknown>;
  const access = typeof json.access_token === "string" ? json.access_token.trim() : "";
  const refresh = typeof json.refresh_token === "string" ? json.refresh_token.trim() : "";
  if (!access || !refresh) {
    throw new Error("Codex token exchange returned no access_token/refresh_token.");
  }
  const id =
    typeof json.id_token === "string" && json.id_token.trim().length > 0
      ? json.id_token.trim()
      : undefined;
  return { access_token: access, refresh_token: refresh, id_token: id };
}

export interface CallbackHandle {
  readonly wait: () => Promise<string | null>;
  readonly close: () => void;
}

export function startCodexCallbackServer(expectedState: string): Promise<CallbackHandle | null> {
  return new Promise((outerResolve) => {
    let outerDone = false;
    let deliverCode: ((c: string | null) => void) | null = null;
    const codePromise = new Promise<string | null>((r) => {
      deliverCode = r;
    });

    const server = createServer((req, res) => {
      try {
        const addr = server.address() as AddressInfo | null;
        const port = addr?.port ?? 1455;
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        if (url.pathname !== "/auth/callback") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        if (url.searchParams.get("state") !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<p>Invalid state. Close this tab and try again from the terminal.</p>");
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<p>Missing code. Close this tab and try again.</p>");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<p>ChatGPT sign-in complete. You can close this tab and return to the terminal.</p>",
        );
        deliverCode?.(code);
        deliverCode = null;
        server.close();
      } catch {
        res.writeHead(500);
        res.end();
      }
    });

    const finishOuter = (handle: CallbackHandle | null) => {
      if (outerDone) return;
      outerDone = true;
      outerResolve(handle);
    };

    server.once("error", () => {
      finishOuter(null);
    });

    server.listen(1455, "127.0.0.1", () => {
      finishOuter({
        wait: () =>
          Promise.race([
            codePromise,
            new Promise<string | null>((r) => setTimeout(() => r(null), CALLBACK_WAIT_MS)),
          ]),
        close: () => {
          deliverCode?.(null);
          deliverCode = null;
          server.close();
        },
      });
    });
  });
}

/**
 * Opens the system browser, completes PKCE OAuth, and writes `~/.codex/auth.json`.
 */
export async function runCodexPkceOAuthLogin(): Promise<void> {
  const verifier = createPkceVerifier();
  const state = createOAuthState();
  const authUrl = buildCodexAuthorizeUrl({ state, verifier });

  log.blank();
  log.info(bold("ChatGPT (Codex) OAuth"));
  log.info("A browser window will open. Sign in with your ChatGPT account that has Codex access.");
  log.info(`If it does not open, visit:`);
  log.info(`  ${cyan(authUrl)}`);
  log.blank();

  const handle = await startCodexCallbackServer(state);
  if (handle === null) {
    log.warn(
      `${yellow("!")} Could not listen on ${cyan("localhost:1455")} (port may be in use). Complete sign-in in the browser, then paste the redirect URL below.`,
    );
    openSystemBrowser(authUrl);
    const pasted = await askInput({
      message: "Paste the full redirect URL (http://localhost:1455/auth/callback?...)",
      nonInteractive: false,
    });
    const code = parseCallbackInput(pasted, state);
    if (!code) {
      throw new Error("Could not read authorization code from pasted URL.");
    }
    const tokens = await exchangeCodexAuthorizationCode(code, verifier);
    await saveCodexAuthTokens(tokens);
    log.ok(`Saved Codex tokens to ${dim("~/.codex/auth.json")} (or $CODEX_HOME).`);
    return;
  }

  try {
    openSystemBrowser(authUrl);
    log.info(dim("Waiting for redirect (up to 10 minutes). Press Ctrl+C to cancel."));
    let code = await handle.wait();
    if (code === null || code.length === 0) {
      log.warn("No redirect received in time — paste the callback URL from the browser.");
      const pasted = await askInput({
        message: "Paste the full redirect URL",
        nonInteractive: false,
      });
      code = parseCallbackInput(pasted, state);
    }
    if (!code) {
      throw new Error("No authorization code received.");
    }
    const tokens = await exchangeCodexAuthorizationCode(code, verifier);
    await saveCodexAuthTokens(tokens);
    log.ok(`Saved Codex tokens to ${dim("~/.codex/auth.json")} (or $CODEX_HOME).`);
  } finally {
    handle.close();
  }
}
