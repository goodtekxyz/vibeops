import { dim, log, yellow } from "../lib/logger.js";
import { taskShipCommand } from "./task-ship.js";

export interface TaskReshipCommandOptions {
  dryRun?: boolean;
  cwd?: string;
  noPr?: boolean;
  noIntegrate?: boolean;
  recreateBranch?: boolean;
  skipLlm?: boolean;
  allowOpenMr?: boolean;
}

/**
 * @deprecated `reship` is now `vibeops task ship --new-cycle`.
 * Kept as a thin alias for backward compatibility.
 */
export async function taskReshipCommand(
  taskRef: string | undefined,
  options: TaskReshipCommandOptions = {},
): Promise<void> {
  log.warn(`${yellow("reship is now `ship` (deprecated alias)")} — delegating to \`vibeops task ship --new-cycle\`.`);
  log.info(dim("Run `vibeops task ship` directly; it detects first submit / open-PR update / new PR cycle."));
  log.blank();

  await taskShipCommand(taskRef, {
    dryRun: options.dryRun,
    cwd: options.cwd,
    noPr: options.noPr,
    newCycle: true,
    noIntegrate: options.noIntegrate,
    recreateBranch: options.recreateBranch,
    skipLlm: options.skipLlm,
    allowOpenMr: options.allowOpenMr,
  });
}
