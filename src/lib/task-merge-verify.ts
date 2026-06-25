import { mergeRequestLabel } from "./git-host.js";
import {
  getMergeRequestDetails,
  waitForMergeRequestMerged,
  type MergeRequestState,
} from "./pr-create.js";
import type { GitHost } from "../types/config.js";

export async function assertMergeRequestMerged(input: {
  cwd: string;
  host: GitHost;
  url: string;
  integrationBranch: string;
  wait?: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const label = mergeRequestLabel(input.host);

  if (input.wait !== false) {
    const merged = await waitForMergeRequestMerged(input.cwd, input.host, input.url);
    if (!merged) {
      return {
        ok: false,
        message: `${label} merge did not complete (still open or auto-merge pending). Wait for Merged on the host, or rerun \`vibeops task merge\`.`,
      };
    }
  }

  const details = await getMergeRequestDetails(input.cwd, input.host, input.url);
  if (details?.state !== "merged" || details.mergedAt === null) {
    const state: MergeRequestState = details?.state ?? "unknown";
    return {
      ok: false,
      message: `${label} is ${state}, not merged into ${input.integrationBranch}. Do not run task sync until the host shows Merged.`,
    };
  }

  return { ok: true };
}
