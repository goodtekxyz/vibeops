import { randomUUID } from "node:crypto";
import {
  linkSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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

function readLockSync(path: string): LockInfo | null {
  try {
    const v = JSON.parse(readFileSync(path, "utf8")) as Partial<LockInfo>;
    // pid + host are enough to judge staleness; token / startedAt may be missing
    // in a foreign or older lock file.
    return typeof v.pid === "number" && typeof v.host === "string" ? (v as LockInfo) : null;
  } catch {
    return null;
  }
}

function inodeOf(path: string): number | null {
  try {
    return statSync(path).ino;
  } catch {
    return null;
  }
}

/** Why the existing lock is stale, or null when it must be respected. */
export function staleReason(
  info: LockInfo | null,
  cfg: TaskLockConfig,
  now = Date.now(),
  mtimeMs: number | null = null,
): string | null {
  if (info === null) {
    // Unparseable (foreign / truncated) file: stale only by age.
    return mtimeMs !== null && (now - mtimeMs) / 1000 > cfg.staleSeconds
      ? `unreadable and older than ${cfg.staleSeconds}s`
      : null;
  }
  if (info.host === hostname() && !pidAlive(info.pid)) {
    return `pid ${info.pid} is not running`;
  }
  const age = (now - Date.parse(info.startedAt)) / 1000;
  return Number.isFinite(age) && age > cfg.staleSeconds
    ? `older than ${cfg.staleSeconds}s (pid ${info.pid} on ${info.host})`
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
const sleepSync = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/**
 * Create `path` atomically WITH its content: write a private temp file, then
 * `link` it into place (fails with EEXIST if `path` exists). Readers never see a
 * half-written lock. Returns false when the lock already exists.
 */
function createExclusiveSync(path: string, content: string): boolean {
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, content, { flag: "wx" });
  try {
    linkSync(tmp, path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw e;
  } finally {
    unlinkSync(tmp);
  }
}

/** A breaker is held for microseconds; one older than this was left by a crash. */
const BREAKER_STALE_MS = 30_000;
const BREAKER_WAIT_MS = 60_000;

/**
 * Every REMOVAL of the lock file (release, stale takeover) happens while holding
 * the breaker `<lock>.break`. Creation needs the lock to be absent (link), so
 * while the breaker is held the lock file cannot change identity: "verify
 * identity, then unlink" is atomic with respect to all other VibeOps processes.
 */
function withBreakerSync<T>(lockPath: string, fn: () => T): T {
  const breaker = `${lockPath}.break`;
  const token = randomUUID();
  const deadline = Date.now() + BREAKER_WAIT_MS;
  for (;;) {
    if (createExclusiveSync(breaker, `${JSON.stringify({ token, pid: process.pid, host: hostname() })}\n`)) {
      break;
    }
    let st: ReturnType<typeof statSync> | null = null;
    try {
      st = statSync(breaker);
    } catch {
      continue; // released meanwhile
    }
    if (Date.now() - st.mtimeMs > BREAKER_STALE_MS) {
      // Crash inside a breaker section: move it aside, delete only if it is
      // still the same file (inode) we judged stale.
      const aside = `${breaker}.stale-${randomUUID()}`;
      try {
        renameSync(breaker, aside);
        if (statSync(aside).ino === st.ino) unlinkSync(aside);
        else {
          try {
            linkSync(aside, breaker);
          } catch {
            // a fresh breaker exists again; ours is not needed
          }
          unlinkSync(aside);
        }
      } catch {
        // someone else handled it
      }
      continue;
    }
    if (Date.now() >= deadline) {
      throw new TaskLockHeldError(`VibeOps lock breaker ${breaker} is held; retry, or delete it if no vibeops process is running.`);
    }
    sleepSync(2);
  }
  try {
    return fn();
  } finally {
    try {
      const cur = JSON.parse(readFileSync(breaker, "utf8")) as { token?: string };
      if (cur.token === token) unlinkSync(breaker);
    } catch {
      // already gone
    }
  }
}

/** Unlink the lock only if it is still the file identified by (inode, token). */
function removeLockIfSame(path: string, ino: number, token: string | null): boolean {
  return withBreakerSync(path, () => {
    if (inodeOf(path) !== ino) return false;
    const cur = readLockSync(path);
    if ((typeof cur?.token === "string" ? cur.token : null) !== token) return false;
    unlinkSync(path);
    return true;
  });
}

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
  const content = `${JSON.stringify(info)}\n`;
  const deadline = Date.now() + cfg.waitSeconds * 1000;
  let loggedWait = false;

  for (;;) {
    if (createExclusiveSync(path, content)) break;

    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(path);
    } catch {
      continue; // released meanwhile
    }
    const holder = readLockSync(path);
    const stale = staleReason(holder, cfg, Date.now(), st.mtimeMs);
    if (stale !== null) {
      if (removeLockIfSame(path, st.ino, typeof holder?.token === "string" ? holder.token : null)) {
        log.warn(`Removed stale VibeOps lock (${stale}): ${path}`);
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
    await sleep(Math.min(50, Math.max(0, deadline - Date.now())));
  }

  const ino = inodeOf(path);
  let released = false;
  const releaseSync = (): void => {
    if (released) return;
    released = true;
    if (ino !== null) removeLockIfSame(path, ino, info.token);
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
