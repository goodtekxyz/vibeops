import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { open, readFile, stat, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { readTextOrNull } from "./filesystem.js";
import { isGitRepository, runGit } from "./git.js";
import { dim, log } from "./logger.js";
import { VIBEOPS_CONFIG_FILE } from "./paths.js";

/**
 * Repository-wide lock for VibeOps operations that allocate TASK ids, write TASK
 * files, create / switch / delete task branches, or stash (D-006). All worktrees
 * of a repository share one git common dir, so the lock file lives there:
 * `<git-common-dir>/vibeops-task.lock`, created with O_EXCL.
 *
 * Stale lock: holder on THIS host whose pid is no longer alive, or (other host,
 * pid not checkable) older than `lock.staleSeconds`. A live holder on this host
 * is never considered stale.
 */

export const LOCK_FILE_NAME = "vibeops-task.lock";

export interface TaskLockConfig {
  /** Max time to wait for another holder, seconds. Default 60. */
  readonly waitSeconds: number;
  /** Age after which a lock from another host is considered stale, seconds. Default 600. */
  readonly staleSeconds: number;
}

export const TASK_LOCK_DEFAULTS: TaskLockConfig = { waitSeconds: 60, staleSeconds: 600 };
export const TASK_LOCK_LIMITS = {
  waitSeconds: { min: 0, max: 600 },
  staleSeconds: { min: 60, max: 86_400 },
} as const;

export class TaskLockConfigError extends Error {
  constructor(message: string) {
    super(`${VIBEOPS_CONFIG_FILE} lock: ${message}`);
    this.name = "TaskLockConfigError";
  }
}

export class TaskLockHeldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskLockHeldError";
  }
}

/** Validate `.vibeops.json` `lock` (fail closed). `undefined` → defaults. */
export function parseTaskLockConfig(raw: unknown): TaskLockConfig {
  if (raw === undefined) return TASK_LOCK_DEFAULTS;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TaskLockConfigError("must be an object.");
  }
  const o = raw as Record<string, unknown>;
  const allowed = Object.keys(TASK_LOCK_LIMITS);
  const unknown = Object.keys(o).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new TaskLockConfigError(
      `unknown key ${unknown.map((k) => `\`${k}\``).join(", ")} (allowed: ${allowed.join(", ")}).`,
    );
  }
  const out = { ...TASK_LOCK_DEFAULTS };
  for (const key of allowed as Array<keyof TaskLockConfig>) {
    const v = o[key];
    if (v === undefined) continue;
    const { min, max } = TASK_LOCK_LIMITS[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      throw new TaskLockConfigError(`\`${key}\` must be an integer between ${min} and ${max}.`);
    }
    out[key] = v;
  }
  return out;
}

export async function readTaskLockConfig(root: string): Promise<TaskLockConfig> {
  const text = await readTextOrNull(join(root, VIBEOPS_CONFIG_FILE));
  if (text === null) return TASK_LOCK_DEFAULTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TaskLockConfigError("file is not valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return TASK_LOCK_DEFAULTS;
  }
  return parseTaskLockConfig((parsed as { lock?: unknown }).lock);
}

interface LockInfo {
  readonly token: string;
  readonly pid: number;
  readonly host: string;
  readonly startedAt: string;
  readonly operation: string;
  readonly cwd: string;
}

export async function taskLockPath(cwd: string): Promise<string> {
  const { stdout } = await runGit(cwd, ["rev-parse", "--git-common-dir"]);
  const dir = stdout.trim();
  return join(isAbsolute(dir) ? dir : resolve(cwd, dir), LOCK_FILE_NAME);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readLock(path: string): Promise<LockInfo | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as LockInfo;
  } catch {
    return null;
  }
}

/** Why the existing lock is stale, or null when it must be respected. */
export function staleReason(info: LockInfo | null, cfg: TaskLockConfig, now = Date.now()): string | null {
  if (info === null) return null; // unreadable (being written) — respect it, age is checked via retry
  if (info.host === hostname()) {
    return pidAlive(info.pid) ? null : `pid ${info.pid} is not running`;
  }
  const age = (now - Date.parse(info.startedAt)) / 1000;
  return Number.isFinite(age) && age > cfg.staleSeconds
    ? `older than ${cfg.staleSeconds}s (host ${info.host})`
    : null;
}

function describe(info: LockInfo | null, path: string): string {
  if (info === null) return `lock file ${path}`;
  return `pid ${info.pid} on ${info.host} since ${info.startedAt} (${info.operation} in ${info.cwd})`;
}

export interface TaskLockHandle {
  readonly path: string;
  release(): Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Acquire the repository task lock, waiting up to `waitSeconds` for another holder. */
export async function acquireTaskLock(
  cwd: string,
  operation: string,
  cfg: TaskLockConfig = TASK_LOCK_DEFAULTS,
): Promise<TaskLockHandle> {
  const path = await taskLockPath(cwd);
  const info: LockInfo = {
    token: randomUUID(),
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
    operation,
    cwd: resolve(cwd),
  };
  const deadline = Date.now() + cfg.waitSeconds * 1000;
  let loggedWait = false;

  for (;;) {
    try {
      const fh = await open(path, "wx");
      try {
        await fh.writeFile(`${JSON.stringify(info)}\n`);
      } finally {
        await fh.close();
      }
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }

    const holder = await readLock(path);
    let stale = staleReason(holder, cfg);
    if (holder === null) {
      // Unreadable / empty (crash between create and write): stale only by age.
      const st = await stat(path).catch(() => null);
      if (st !== null && (Date.now() - st.mtimeMs) / 1000 > cfg.staleSeconds) {
        stale = `unreadable and older than ${cfg.staleSeconds}s`;
      }
    }
    if (stale !== null) {
      log.warn(`Removing stale VibeOps lock (${stale}): ${path}`);
      // Remove only if it is still the same stale lock.
      const again = await readLock(path);
      if (holder === null ? again === null : again !== null && again.token === holder.token) {
        await unlink(path).catch(() => undefined);
      }
      continue;
    }
    if (Date.now() >= deadline) {
      throw new TaskLockHeldError(
        `Another VibeOps task operation holds the repository lock: ${describe(holder, path)}. ` +
          `Wait for it to finish and rerun. If that process is gone, delete ${path}.`,
      );
    }
    if (!loggedWait) {
      log.info(dim(`Waiting for VibeOps lock held by ${describe(holder, path)}…`));
      loggedWait = true;
    }
    await sleep(Math.min(200, Math.max(0, deadline - Date.now())));
  }

  let released = false;
  const releaseSync = (): void => {
    if (released) return;
    released = true;
    try {
      const cur = JSON.parse(readFileSync(path, "utf8")) as LockInfo;
      if (cur.token === info.token) unlinkSync(path);
    } catch {
      // already gone
    }
  };
  process.once("exit", releaseSync);

  return {
    path,
    async release() {
      process.removeListener("exit", releaseSync);
      releaseSync();
    },
  };
}

/** Run `fn` while holding the repository task lock. */
export async function withTaskLock<T>(
  cwd: string,
  operation: string,
  fn: () => Promise<T>,
  cfg?: TaskLockConfig,
): Promise<T> {
  const lock = await acquireTaskLock(cwd, operation, cfg ?? (await readTaskLockConfig(cwd)));
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

/**
 * Command wrapper: run `fn` under the repository task lock, reporting lock /
 * config errors with exit code 1. Outside a git repository `fn` runs unlocked
 * (it reports that error itself).
 */
export async function runUnderTaskLock(
  cwd: string,
  operation: string,
  fn: () => Promise<void>,
): Promise<void> {
  if (!(await isGitRepository(cwd))) {
    await fn();
    return;
  }
  let cfg: TaskLockConfig;
  try {
    cfg = await readTaskLockConfig(cwd);
  } catch (e) {
    if (e instanceof TaskLockConfigError) {
      log.error(e.message);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
  try {
    await withTaskLock(cwd, operation, fn, cfg);
  } catch (e) {
    if (e instanceof TaskLockHeldError) {
      log.error(e.message);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}
