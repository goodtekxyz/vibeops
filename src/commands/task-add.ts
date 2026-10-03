import { resolve } from "node:path";

import { pathExists, writeText } from "../lib/filesystem.js";
import { GitConfigError, requireGitConfig } from "../lib/git-config.js";
import {
  ensureIntegrationSynced,
  printIntegrationSyncDiagnosis,
} from "../lib/git-integration-sync.js";
import { askInput } from "../lib/inquirer-helpers.js";
import { bold, cyan, dim, log, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { slugify } from "../lib/slug.js";
import { fallbackTaskDraft, llmScaffoldTask } from "../lib/task-add-llm.js";
import {
  allocateNextTaskNumber,
  formatTaskId,
  uniqueTaskPath,
} from "../lib/task-scaffold.js";
import { findBlockingTask, relPath } from "../lib/task-context.js";
import { allocateTaskId, TaskIdAllocationError } from "../lib/task-id-allocation.js";
import {
  readTaskLockConfig,
  TaskLockConfigError,
  TaskLockHeldError,
  withTaskLock,
  type TaskLockConfig,
} from "../lib/task-lock.js";
import { isIncompleteTaskStart, startTaskBranch } from "../lib/task-start.js";
import { loadActionableTasks, readGitContext } from "../lib/task.js";
import type { VibeopsGitConfig } from "../types/config.js";

export interface TaskAddCommandOptions {
  dryRun?: boolean;
  nonInteractive?: boolean;
  cwd?: string;
  idea?: string;
}

async function loadGitConfigOrNull(
  root: string,
  dryRun: boolean,
): Promise<VibeopsGitConfig | null> {
  try {
    return await requireGitConfig(root);
  } catch (e) {
    if (e instanceof GitConfigError) {
      if (dryRun) return null;
      log.error(e.message);
      process.exitCode = 1;
      return null;
    }
    throw e;
  }
}

async function finishWithBranch(
  root: string,
  taskId: string,
  filePath: string,
  gitCfg: VibeopsGitConfig,
  opts: { dryRun: boolean; skipIntegrationPull?: boolean },
): Promise<void> {
  const relFile = relPath(root, filePath);
  log.blank();
  log.step("Starting task branch…");
  const started = await startTaskBranch({
    cwd: root,
    taskFile: filePath,
    integrationBranch: gitCfg.integrationBranch,
    remote: gitCfg.remote,
    allowDirty: true,
    dryRun: opts.dryRun,
    skipIntegrationPull: opts.skipIntegrationPull,
  });
  if (!started) {
    process.exitCode = 1;
    return;
  }

  if (opts.dryRun) return;

  log.blank();
  log.info(bold("Next in Cursor"));
  log.info(`  Ask:  @${relFile} — plan Scope / Acceptance Criteria`);
  log.info(`  Agent: same file — implement`);
  log.info(`  Ship: ${cyan(`vibeops task ship ${taskId}`)}`);
}

type Phase = "done" | "continue";

/**
 * Run `fn` under the repository task lock (D-006). Lock errors are reported and
 * end the command with exit code 1.
 */
async function underLock(
  root: string,
  lockCfg: TaskLockConfig,
  fn: () => Promise<Phase>,
): Promise<Phase> {
  try {
    return await withTaskLock(root, "task add", fn, lockCfg);
  } catch (e) {
    if (e instanceof TaskLockHeldError) {
      log.error(e.message);
      log.info(dim("No TASK file was created."));
      process.exitCode = 1;
      return "done";
    }
    throw e;
  }
}

export async function taskAddCommand(opts: TaskAddCommandOptions = {}): Promise<void> {
  const root = resolve(opts.cwd ?? process.cwd());
  const dryRun = opts.dryRun === true;
  const nonInteractive =
    opts.nonInteractive === true || dryRun || process.stdin.isTTY !== true;

  log.info(bold("vibeops task add"));
  log.blank();

  const gitCfg = await loadGitConfigOrNull(root, dryRun);
  if (!dryRun && gitCfg === null) return;

  let lockCfg: TaskLockConfig;
  try {
    lockCfg = await readTaskLockConfig(root);
  } catch (e) {
    if (e instanceof TaskLockConfigError) {
      log.error(e.message);
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  const paths = projectPaths(root);

  // Phase 1 (locked): resume an incomplete add, or preflight the integration branch.
  const phase1 = async (): Promise<Phase> => {
    const blocking = await findBlockingTask(paths, root);

    // Resume: In Progress file exists but task branch / Git Context was never finished.
    if (blocking !== null && gitCfg !== null) {
      const incomplete = await isIncompleteTaskStart(root, blocking.filePath);
      if (incomplete) {
        log.warn(
          `${yellow("Incomplete")} — ${bold(blocking.id)} exists but the task branch was not created.`,
        );
        log.info(`  ${dim("file")}   ${relPath(root, blocking.filePath)}`);
        log.info(dim("Resuming branch setup (will not create a new TASK)…"));

        if (!dryRun) {
          const synced = await ensureIntegrationSynced({
            cwd: root,
            remote: gitCfg.remote,
            integrationBranch: gitCfg.integrationBranch,
            fetch: true,
          });
          if (!synced.ok) {
            printIntegrationSyncDiagnosis(synced.diagnosis);
            process.exitCode = 1;
            return "done";
          }
          if (synced.pulled) log.info(dim(synced.diagnosis.summary));
        }

        await finishWithBranch(root, blocking.id, blocking.filePath, gitCfg, {
          dryRun,
          skipIntegrationPull: true,
        });
        return "done";
      }

      const ctx = await readGitContext(blocking.filePath);
      log.warn(
        `${yellow("Blocked")} — ${bold(blocking.id)} is still open (${blocking.title || "no title"}).`,
      );
      if (ctx) {
        log.info(`  ${dim("branch")}  ${ctx.taskBranch}`);
      }
      log.info(`  ${dim("file")}   ${relPath(root, blocking.filePath)}`);
      log.blank();
      log.info(`Finish it first: ${cyan(`vibeops task ship ${blocking.id}`)}.`);
      log.info(`Then run ${cyan("vibeops task add")} again.`);
      process.exitCode = 1;
      return "done";
    }

    // Preflight: sync integration BEFORE writing a new TASK file (avoids half-created TASKs).
    if (!dryRun && gitCfg !== null) {
      log.step("Checking integration branch…");
      const synced = await ensureIntegrationSynced({
        cwd: root,
        remote: gitCfg.remote,
        integrationBranch: gitCfg.integrationBranch,
        fetch: true,
      });
      if (!synced.ok) {
        printIntegrationSyncDiagnosis(synced.diagnosis);
        log.blank();
        log.info(dim("No TASK file was created. Fix the integration branch, then rerun task add."));
        process.exitCode = 1;
        return "done";
      }
      if (synced.pulled) {
        log.ok(synced.diagnosis.summary);
      } else if (
        synced.diagnosis.kind === "no_remote_branch" ||
        synced.diagnosis.kind === "no_remote"
      ) {
        log.info(dim(synced.diagnosis.summary));
      } else {
        log.info(dim(`Integration ${gitCfg.integrationBranch} is ready.`));
      }
      log.blank();
    }
    return "continue";
  };
  if ((dryRun ? await phase1() : await underLock(root, lockCfg, phase1)) === "done") return;

  // Phase 2 (unlocked): ask + draft. The draft uses a provisional id; the final id
  // is allocated under the lock in phase 3 so a slow prompt / LLM never holds it.
  const ideaDefault = "New work slice";
  const idea = await askInput({
    message: "What are you doing now? (short)",
    nonInteractive,
    default: opts.idea?.trim() || ideaDefault,
    required: true,
  });

  const provisionalId = formatTaskId(
    allocateNextTaskNumber(await loadActionableTasks(paths.docsTasks)),
  );

  let title: string;
  let slug: string;
  let draftMarkdown: string;

  if (dryRun || nonInteractive) {
    const fb = fallbackTaskDraft(provisionalId, idea);
    title = fb.title;
    slug = fb.slug;
    draftMarkdown = fb.markdown;
  } else {
    const llm = await llmScaffoldTask({ cwd: root, taskId: provisionalId, idea });
    if (llm !== null) {
      title = llm.title;
      slug = llm.slug;
      draftMarkdown = llm.markdown;
      log.skip(`Scaffold via ${llm.provider}`);
    } else {
      log.warn("LLM unavailable — using minimal TASK template.");
      log.info(dim(`  Run ${cyan("vibeops llm connect")} to set up Codex, Cursor Agent CLI, or OpenAI.`));
      const fb = fallbackTaskDraft(provisionalId, idea);
      title = fb.title;
      slug = fb.slug;
      draftMarkdown = fb.markdown;
    }
  }

  // Phase 3 (locked): allocate id → write TASK file → create branch.
  const phase3 = async (): Promise<Phase> => {
    const tasks = await loadActionableTasks(paths.docsTasks);
    let taskNumber = allocateNextTaskNumber(tasks);
    if (gitCfg !== null) {
      // D-006: ids are unique across the integration branch, every worktree and
      // every local / remote VibeOps task branch — not just this worktree's docs/tasks.
      try {
        const alloc = await allocateTaskId({
          cwd: root,
          tasksDir: paths.docsTasks,
          remote: gitCfg.remote,
          integrationBranch: gitCfg.integrationBranch,
          fetchRemote: !dryRun,
        });
        taskNumber = Math.max(taskNumber, alloc.next);
      } catch (e) {
        if (e instanceof TaskIdAllocationError) {
          log.error(e.message);
          log.info(dim("No TASK file was created."));
          process.exitCode = 1;
          return "done";
        }
        if (!dryRun) throw e;
        // dry-run outside a git repo: local docs/tasks only.
      }
    }
    const taskId = formatTaskId(taskNumber);
    const markdown =
      taskId === provisionalId
        ? draftMarkdown
        : draftMarkdown.replace(new RegExp(`\\b${provisionalId}\\b`, "g"), taskId);

    const { filePath } = uniqueTaskPath(
      paths.docsTasks,
      taskId,
      slugify(slug || title),
      tasks.map((t) => t.filePath),
    );
    const relFile = relPath(root, filePath);
    const integration = gitCfg?.integrationBranch ?? "integration";

    if (dryRun) {
      log.info(`[dry-run] Would create ${bold(taskId)} → ${cyan(relFile)}`);
      log.info(
        dim(
          `  branch task/${slugify(slug || title).replace(/^(\d+)-/, "$1-")} from ${gitCfg?.remote ?? "origin"}/${integration}`,
        ),
      );
      if (gitCfg) {
        await startTaskBranch({
          cwd: root,
          taskFile: filePath,
          integrationBranch: gitCfg.integrationBranch,
          remote: gitCfg.remote,
          dryRun: true,
        });
      }
      return "done";
    }

    if (await pathExists(filePath)) {
      throw new Error(`TASK file already exists: ${relFile}`);
    }

    await writeText(filePath, markdown);
    log.ok(`Created ${bold(taskId)} → ${cyan(relFile)}`);

    await finishWithBranch(root, taskId, filePath, gitCfg!, {
      dryRun: false,
      skipIntegrationPull: true,
    });
    return "done";
  };
  if (dryRun) await phase3();
  else await underLock(root, lockCfg, phase3);
}
