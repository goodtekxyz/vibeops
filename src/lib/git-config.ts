import { readConfig } from "./config.js";
import type { VibeopsGitConfig } from "../types/config.js";

export class GitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitConfigError";
  }
}

/** Load `.vibeops.json` git block or throw with re-init guidance. */
export async function requireGitConfig(cwd: string): Promise<VibeopsGitConfig> {
  const config = await readConfig(cwd);
  if (!config) {
    throw new GitConfigError(
      "No .vibeops.json found. Run vibeops init in this project first.",
    );
  }
  if (!config.git?.integrationBranch || !config.git?.productionBranch) {
    throw new GitConfigError(
      "Missing git policy in .vibeops.json. Re-run vibeops init to set integration and production branches.",
    );
  }
  if (!config.git.host || !config.git.remote) {
    throw new GitConfigError(
      "Incomplete git config in .vibeops.json. Re-run vibeops init.",
    );
  }
  return config.git;
}
