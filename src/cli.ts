#!/usr/bin/env node
import { Command } from "commander";

import { doneCommand } from "./commands/done.js";
import { githubInitCommand } from "./commands/github-init.js";
import { githubStatusCommand } from "./commands/github-status.js";
import { initCommand } from "./commands/init.js";
import { nextCommand } from "./commands/next.js";
import { notionInitCommand } from "./commands/notion-init.js";
import { notionSyncCommand } from "./commands/notion-sync.js";
import { notionTestCommand } from "./commands/notion-test.js";
import { planCommand } from "./commands/plan.js";
import { rollbackCommand } from "./commands/rollback.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";
import { taskAddCommand } from "./commands/task-add.js";
import { taskStatusCommand } from "./commands/task-status.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("vibeops")
  .description(
    "VibeOps — plan an MVP, build in Cursor (drag mvp-build.md), finish with Git rails.\n" +
      "  Commands: init · plan · start · done · next · status · task add · task status (+ optional notion · github · rollback)",
  )
  .version(VERSION, "-v, --version", "Print the VibeOps version");

program
  .command("init")
  .description("Install the VibeOps workflow into the current directory")
  .option("--dry-run", "Show what would be created without writing files")
  .option("--force", "Overwrite existing files")
  .option("--cwd <path>", "Target directory")
  .option("--name <projectName>", "Project name in .vibeops.json")
  .option("--git", "Initialize Git without prompting")
  .option("--no-git", "Skip Git")
  .option("--initial-commit", "Create initial commit")
  .option("--no-initial-commit", "Skip initial commit")
  .option("--default-branch <name>", "Default branch (default main)")
  .option("--commit-message <message>", "Initial commit message")
  .action(async (opts) => {
    await initCommand(opts);
  });

program
  .command("plan")
  .description("LLM planning → brief + TASK-mvp + .vibeops/generated/mvp-build.md")
  .option("--idea <text>", "One-line idea (optional Name: idea prefix)")
  .option("--from <path>", "Regenerate MVP artifacts from an existing brief")
  .option("--non-interactive", "Placeholders only (CI); no LLM")
  .option("--provider <id>", "openai | codex-oauth | cursor-agent")
  .option("--model <id>", "LLM model id")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    const provider =
      opts.provider === "openai" ||
      opts.provider === "codex-oauth" ||
      opts.provider === "cursor-agent"
        ? opts.provider
        : undefined;
    await planCommand({
      idea: opts.idea,
      from: opts.from,
      nonInteractive: opts.nonInteractive,
      provider,
      llmModel: opts.model,
      cwd: opts.cwd,
    });
  });

program
  .command("start [taskRef]")
  .description(
    "Create task branch (default: TASK-mvp, or active backlog TASK if no MVP file)",
  )
  .option("--dry-run", "Show plan only")
  .option("--allow-dirty", "Allow dirty working tree")
  .option("--cwd <path>", "Target directory")
  .action(async (taskRef: string | undefined, opts) => {
    await startCommand(taskRef, opts);
  });

program
  .command("done [taskRef]")
  .description(
    "Finish TASK: auto-fill Result/Test Result + summary md, merge to main, Notion sync (default: TASK-mvp or active backlog)",
  )
  .option("--dry-run", "Show plan only")
  .option("--no-merge", "Skip push / merge / branch delete")
  .option("--skip-summary", "Skip last-done-summary.md and TASK auto-fill")
  .option("--refresh-task-sections", "Overwrite existing Result / Test Result")
  .option("--merge-via-pr", "Merge via gh PR")
  .option("--allow-dirty", "Allow dirty tree during merge")
  .option("--no-notion-sync", "Skip automatic Notion sync after done")
  .option("--cwd <path>", "Target directory")
  .action(async (taskRef: string | undefined, opts) => {
    await doneCommand(taskRef, opts);
  });

program
  .command("next")
  .description("Interactive guide for the MVP workflow (↑/↓ · Yes/No)")
  .option("--dry-run", "On runnable steps, print only")
  .option("--non-interactive", "Print panel once")
  .option("--execute", "With --non-interactive, run the runnable step once")
  .option("--merge-via-pr", "On finish: merge via GitHub PR")
  .option("--allow-dirty", "Allow dirty tree on merge")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await nextCommand(opts);
  });

program
  .command("status")
  .description("Installation, TASK-mvp state, Git, Notion, GitHub")
  .option("--json", "JSON output")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await statusCommand(opts);
  });

const task = program.command("task").description("Backlog TASK files");

task
  .command("add")
  .description(
    "Interactive: close open TASK (optional), create next TASK-NNN, branch checkout, In Progress",
  )
  .option("--dry-run", "Show plan only (no writes, no LLM planning session)")
  .option("--non-interactive", "CI: minimal scaffold without prompts (optional --idea)")
  .option("--idea <text>", "Short description (CI / smoke only)")
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
  .command("status")
  .description("Briefing on current TASK progress and recommended next step")
  .option("--json", "JSON output")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await taskStatusCommand({
      json: Boolean(opts.json),
      cwd: opts.cwd as string | undefined,
    });
  });

program
  .command("rollback [taskRef]")
  .description("Advisory rollback for TASK-mvp (--confirm / --confirm-destructive to execute)")
  .option("--confirm", "Run non-destructive rollback")
  .option("--confirm-destructive", "Allow destructive rollback (reset --hard)")
  .option("--strategy <name>", "branch-delete | reset-base | revert-merge")
  .option("--keep-branch", "Keep task branch when deleting")
  .option("--dry-run", "Print plan only")
  .option("--cwd <path>", "Target directory")
  .action(async (taskRef: string | undefined, opts) => {
    await rollbackCommand(taskRef, opts);
  });

const notion = program.command("notion").description("Optional Notion dashboard sync");

notion
  .command("init")
  .description("Configure Notion in .vibeops.json and .vibeops.env")
  .option("--dry-run", "Plan only")
  .option("--enable", "Enable Notion")
  .option("--projects-db <id>", "Projects database id")
  .option("--tasks-db <id>", "Tasks database id")
  .option("--non-interactive", "No prompts")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await notionInitCommand(opts);
  });

notion
  .command("test")
  .description("Verify Notion token and database schema")
  .option("--json", "JSON output")
  .option("--debug-shape", "Print API shape diagnostics")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await notionTestCommand(opts);
  });

notion
  .command("sync")
  .description("Push docs/project + TASK metadata to Notion")
  .option("--dry-run", "Query only")
  .option("--json", "JSON output")
  .option("--only-tasks", "Tasks DB only")
  .option("--only-project", "Project DB only")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await notionSyncCommand(opts);
  });

const github = program.command("github").description("Optional GitHub remote setup");

github
  .command("status")
  .description("gh auth, remotes, .vibeops.json github section")
  .option("--json", "JSON output")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await githubStatusCommand(opts);
  });

github
  .command("init")
  .description("Connect or create a GitHub repo and update config")
  .option("--dry-run", "Plan only")
  .option("--yes", "Non-interactive defaults")
  .option("--owner <owner>", "GitHub owner")
  .option("--repo <repo>", "Repo name")
  .option("--public", "Public repo")
  .option("--private", "Private repo")
  .option("--remote <name>", "Remote name (default origin)")
  .option("--connect <ownerOrUrl>", "Existing repo")
  .option("--no-package-update", "Skip package.json repo fields")
  .option("--cwd <path>", "Target directory")
  .action(async (opts) => {
    await githubInitCommand({
      ...opts,
      noPackageUpdate: opts.packageUpdate === false,
    });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("[vibeops] error:", err);
  process.exitCode = 1;
});
