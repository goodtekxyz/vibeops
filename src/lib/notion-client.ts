/**
 * Thin async wrapper around `@notionhq/client`.
 *
 * We lazy-import the SDK so that:
 *   - other commands (init / status / plan / task / …) don't pay the import
 *     cost when Notion is disabled,
 *   - a missing or broken install of `@notionhq/client` doesn't crash the
 *     entire CLI — only the notion subcommands.
 *
 * The wrapper exposes only the surface `notion test` actually uses:
 *   - `users.me()` to validate the token,
 *   - `databases.retrieve(id)` to verify access + schema.
 *
 * Network calls have a 5s timeout (per TASK-010 Risks).
 */

const NOTION_API_TIMEOUT_MS = 5_000;

export interface NotionClient {
  usersMe(): Promise<{ id: string; name?: string; type?: string }>;
  databasesRetrieve(databaseId: string): Promise<{
    id: string;
    title?: unknown;
    properties: Record<string, unknown>;
  }>;
}

export interface NotionApiError {
  ok: false;
  code: string;
  status?: number;
  message: string;
}

export function notionApiError(err: unknown): NotionApiError {
  const e = err as { code?: string; status?: number; message?: string };
  return {
    ok: false,
    code: typeof e.code === "string" ? e.code : "unknown_error",
    ...(typeof e.status === "number" ? { status: e.status } : {}),
    message: typeof e.message === "string" ? e.message : String(err),
  };
}

export async function createNotionClient(token: string): Promise<NotionClient> {
  // Use a dynamic specifier so TS/Node import this lazily even under
  // `--noEmitOnError`. Missing dep → caller catches and surfaces a friendly
  // "install @notionhq/client" message.
  const modSpecifier = "@notionhq/client";
  const mod: unknown = await import(/* @vite-ignore */ modSpecifier);
  const ClientCtor =
    (mod as { Client?: new (opts: { auth: string; timeoutMs: number }) => unknown }).Client ??
    (mod as { default?: { Client?: new (opts: { auth: string; timeoutMs: number }) => unknown } }).default?.Client;
  if (typeof ClientCtor !== "function") {
    throw new Error(
      "Could not find `Client` export in `@notionhq/client`. Re-install the dependency: `pnpm add @notionhq/client`.",
    );
  }
  const client = new ClientCtor({ auth: token, timeoutMs: NOTION_API_TIMEOUT_MS }) as {
    users: { me: (q: object) => Promise<unknown> };
    databases: { retrieve: (q: { database_id: string }) => Promise<unknown> };
  };
  return {
    async usersMe() {
      const res = (await client.users.me({})) as {
        id: string;
        name?: string;
        type?: string;
      };
      return res;
    },
    async databasesRetrieve(databaseId: string) {
      const res = (await client.databases.retrieve({ database_id: databaseId })) as {
        id: string;
        title?: unknown;
        properties: Record<string, unknown>;
      };
      return res;
    },
  };
}
