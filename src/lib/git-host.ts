import type { GitHost } from "../types/config.js";

/** Infer Git host from a remote URL. */
export function detectGitHost(remoteUrl: string): GitHost | null {
  const u = remoteUrl.trim().toLowerCase();
  if (u.includes("github.com")) return "github";
  if (u.includes("gitlab")) return "gitlab";
  return null;
}

export function mergeRequestLabel(host: GitHost): string {
  return host === "gitlab" ? "Merge request" : "Pull request";
}
