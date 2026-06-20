#!/usr/bin/env node
import { Command } from "commander";

import { pullCommand } from "./commands/pull.js";
import { initCommand } from "./commands/init.js";
import { llmConnectCommand, llmStatusCommand, llmUseCommand } from "./commands/llm.js";
import { statusCommand } from "./commands/status.js";
import { taskAddCommand } from "./commands/task-add.js";
import { taskDelCommand } from "./commands/task-del.js";
import { taskMergeCommand } from "./commands/task-merge.js";
import { taskReleaseCommand } from "./commands/task-release.js";
import { taskShipCommand } from "./commands/task-ship.js";
import { taskReshipCommand } from "./commands/task-reship.js";
import { taskSyncCommand } from "./commands/task-sync.js";
import { loadVibeopsEnv } from "./lib/env.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("vibeops")
  .description(
    "VibeOps — TASK workflow (init · task · pull · status · llm)",
  )
  .version(VERSION, "-v, --version", "Print the VibeOps version");

program.hook("preAction", async (_thisCommand, actionCommand) => {
  const opts = actionCommand.opts() as { cwd?: string };
  const cwd = typeof opts.cwd === "string" ? opts.cwd : process.cwd();
  await loadVibeopsEnv(cwd);
});

program
  .command("init")
  .description("Install core + agent client packs (cursor, claude, codex)")
  .option("--dry-run", "Show what would be created")
  .option("--force", "Overwrite existing template files (also implied when re-initializing with --yes)")
  .option("--yes", "Re-init an existing project without prompting")
  .option("--cwd <path>", "Target directory")
  .option("--name <projectName>", "Project name in .vibeops.json")
  .option(
    "--clients <list>",
    "Agent packs: comma-separated cursor, claude, codex (required in non-interactive mode)",
  )
  .option("--git", "Initialize Git (always on; flag kept for scripts)")
  .option("--initial-commit", "Create initial commit")
  .option("--no-initial-commit", "Skip initial commit")
  .option("--commit-message <message>", "Initial commit message")
  .option(
    "--git-policy <preset>",
    "Branch policy: gitflow (develop+main) or trunk (main only)",
  )
  .option("--integration-branch <name>", "Integration branch (with --production-branch)")
  .option("--production-branch <name>", "Production branch")
  .option("--git-host <host>", "github or gitlab (default: detect from remote)")
  .option("--allow-no-remote", "Smoke/CI: skip origin requirement")
  .action(async (opts) => {
    await initCommand({
      dryRun: Boolean(opts.dryRun),
      force: Boolean(opts.force),
      yes: Boolean(opts.yes),
      cwd: opts.cwd as string | undefined,
      name: opts.name as string | undefined,
      clients: opts.clients as string | undefined,
      git: opts.git as boolean | undefined,
      initialCommit: opts.initialCommit as boolean | undefined,
      commitMessage: opts.commitMessage as string | undefined,
      allowNoRemote: Boolean(opts.allowNoRemote),
      gitPolicy: opts.gitPolicy as string | undefined,
      integrationBranch: opts.integrationBranch as string | undefined,
      productionBranch: opts.productionBranch as string | undefined,
      gitHost: opts.gitHost as string | undefined,
    });
  });

const task = program
  .command("task")
  .description("TASK lifecycle (add · del · ship · reship · merge · sync · release)");

task
  .command("add")
  .description("Create next TASK-NNN, task branch, In Progress")
  .option("--dry-run", "Plan only")
  .option("--non-interactive", "CI: minimal scaffold (optional --idea)")
  .option("--idea <text>", "Short description (CI)")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await taskAddCommand({
      dryRun: Boolean(opts.dryRun),
      nonInteractive: Boolean(opts.nonInteractive),
      idea: opts.idea as string | undefined,
      cwd: opts.cwd as string | undefined,
    });
  });

task
  .command("del [taskRef]")
  .description("Delete TASK before merge: remove md, close open MR/PR, delete task branch")
  .option("--dry-run", "Plan only")
  .option("--force", "Proceed with a dirty working tree (changes may remain)")
  .option("--no-remote-delete", "Keep the task branch on the remote")
  .option("--no-close-mr", "Do not close an open MR/PR")
  .option("--cwd <path>", "Target directory")
  .action(async (taskRef: string | undefined, opts) => {
    await taskDelCommand(taskRef, {
      dryRun: Boolean(opts.dryRun),
      force: Boolean(opts.force),
      noRemoteDelete: Boolean(opts.noRemoteDelete),
      noCloseMr: Boolean(opts.noCloseMr),
      cwd: opts.cwd as string | undefined,
    });
  });

task
  .command("ship [taskRef]")
  .description(
    "State-aware submit: new PR · update open PR · new PR cycle after merge (Status → Shipped)",
  )
  .option("--dry-run", "Plan only")
  .option("-m, --message <msg>", "Commit message (TASK id auto-prefixed; LLM/prompt when omitted)")
  .option("--new-cycle", "Allow a new PR cycle after merge without prompting (alias: --reship)")
  .option("--reship", "Alias for --new-cycle")
  .option("--no-commit", "Push already-committed changes only (skip staging/commit)")
  .option("--no-pr", "Push only; skip creating MR/PR")
  .option("--non-interactive", "CI: never prompt")
  .option("--no-integrate", "New PR cycle: skip merging integration into the task branch")
  .option("--recreate-branch", "New PR cycle: recreate task branch from integration")
  .option("--skip-llm", "New PR cycle: do not run LLM for Result / Test Result")
  .option("--allow-open-mr", "Update the open MR/PR with new commits instead of a new cycle")
  .option("--cwd <path>", "Target directory")
  .action(async (taskRef: string | undefined, opts) => {
    await taskShipCommand(taskRef, {
      dryRun: Boolean(opts.dryRun),
      message: opts.message as string | undefined,
      newCycle: Boolean(opts.newCycle) || Boolean(opts.reship),
      noCommit: opts.commit === false,
      noPr: opts.pr === false,
      nonInteractive: Boolean(opts.nonInteractive),
      noIntegrate: opts.integrate === false,
      recreateBranch: Boolean(opts.recreateBranch),
      skipLlm: Boolean(opts.skipLlm),
      allowOpenMr: Boolean(opts.allowOpenMr),
      cwd: opts.cwd as string | undefined,
    });
  });

task
  .command("reship [taskRef]")
  .description("Deprecated alias for `task ship --new-cycle` (start a new PR cycle after merge)")
  .option("--dry-run", "Plan only")
  .option("--no-pr", "Push only; skip creating MR/PR")
  .option("--no-integrate", "Skip merging integration branch into task branch")
  .option(
    "--recreate-branch",
    "Create task branch from integration instead of reusing local/remote ref",
  )
  .option("--skip-llm", "Do not run LLM for Result / Test Result")
  .option(
    "--allow-open-mr",
    "Update the open MR/PR with new commits (merge before reship for a new PR)",
  )
  .option("--cwd <path>", "Target directory")
  .action(async (taskRef: string | undefined, opts) => {
    await taskReshipCommand(taskRef, {
      dryRun: Boolean(opts.dryRun),
      noPr: opts.pr === false,
      noIntegrate: opts.integrate === false,
      recreateBranch: Boolean(opts.recreateBranch),
      skipLlm: Boolean(opts.skipLlm),
      allowOpenMr: Boolean(opts.allowOpenMr),
      cwd: opts.cwd as string | undefined,
    });
  });

task
  .command("merge [taskRef]")
  .description("Merge TASK MR/PR into integration branch (default: squash)")
  .option("--dry-run", "Plan only")
  .option("--merge", "Merge commit (instead of squash)")
  .option("--rebase", "Rebase merge")
  .option("--cwd <path>", "Target directory")
  .action(async (taskRef: string | undefined, opts) => {
    await taskMergeCommand(taskRef, {
      dryRun: Boolean(opts.dryRun),
      merge: Boolean(opts.merge),
      rebase: Boolean(opts.rebase),
      cwd: opts.cwd as string | undefined,
    });
  });

task
  .command("sync [taskRef]")
  .description("After MR merge: integration pull and delete task branch (TASK md unchanged)")
  .option("--dry-run", "Plan only")
  .option("--no-remote-delete", "Keep the task branch on the remote")
  .option("--force", "Delete local task branch with -D if not fully merged")
  .option("--cwd <path>", "Target directory")
  .action(async (taskRef: string | undefined, opts) => {
    await taskSyncCommand(taskRef, {
      dryRun: Boolean(opts.dryRun),
      noRemoteDelete: Boolean(opts.noRemoteDelete),
      force: Boolean(opts.force),
      cwd: opts.cwd as string | undefined,
    });
  });

task
  .command("release")
  .description("Open (and merge) release MR/PR: integration branch → production")
  .option("--dry-run", "Plan only")
  .option("--no-merge", "Create release PR only")
  .option("--merge", "Merge commit (instead of squash)")
  .option("--rebase", "Rebase merge")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await taskReleaseCommand({
      dryRun: Boolean(opts.dryRun),
      noMerge: Boolean(opts.noMerge),
      merge: Boolean(opts.merge),
      rebase: Boolean(opts.rebase),
      cwd: opts.cwd as string | undefined,
    });
  });

program
  .command("pull")
  .description("Fetch remote and update integration branch (e.g. develop)")
  .option("--dry-run", "Plan only")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await pullCommand({
      dryRun: Boolean(opts.dryRun),
      cwd: opts.cwd as string | undefined,
    });
  });

program
  .command("status")
  .description("Briefing: active TASK, Git, LLM, next hint")
  .option("--json", "JSON output")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await statusCommand({
      json: Boolean(opts.json),
      cwd: opts.cwd as string | undefined,
    });
  });

const llm = program.command("llm").description("LLM providers for task add / task ship");

llm
  .command("connect")
  .description("Interactive menu: connect providers and choose default")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await llmConnectCommand({ cwd: opts.cwd as string | undefined });
  });

llm
  .command("status")
  .description("Show connected providers and project preference")
  .option("--json", "JSON output")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await llmStatusCommand({
      json: Boolean(opts.json),
      cwd: opts.cwd as string | undefined,
    });
  });

llm
  .command("use [provider]")
  .description("Set default provider: auto | codex-oauth | cursor-agent | openai")
  .option("--cwd <path>", "Target directory")
  .action(async (provider: string | undefined, opts) => {
    await llmUseCommand(provider, { cwd: opts.cwd as string | undefined });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("[vibeops] error:", err);
  process.exitCode = 1;
});
