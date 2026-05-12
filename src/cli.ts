#!/usr/bin/env node
import { Command } from "commander";

import { agentListCommand } from "./commands/agent-list.js";
import { agentPromptCommand } from "./commands/agent-prompt.js";
import { agentShowCommand } from "./commands/agent-show.js";
import { githubInitCommand } from "./commands/github-init.js";
import { githubStatusCommand } from "./commands/github-status.js";
import { initCommand } from "./commands/init.js";
import { notionInitCommand } from "./commands/notion-init.js";
import { notionSyncCommand } from "./commands/notion-sync.js";
import { notionTestCommand } from "./commands/notion-test.js";
import { planCommand } from "./commands/plan.js";
import { statusCommand } from "./commands/status.js";
import { taskCheckCommand } from "./commands/task-check.js";
import { taskDoneCommand } from "./commands/task-done.js";
import { taskGenerateCommand } from "./commands/task-generate.js";
import { taskPullCommand } from "./commands/task-pull.js";
import { taskRollbackCommand } from "./commands/task-rollback.js";
import { taskStartCommand } from "./commands/task-start.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("vibeops")
  .description(
    "VibeOps — a local CLI that keeps Cursor-based vibe coding on rails.\n" +
      "  It installs docs, Cursor rules, AGENTS.md, agents, TASK templates,\n" +
      "  and Git/Notion workflows into a project, then drives work one TASK at a time.",
  )
  .version(VERSION, "-v, --version", "Print the VibeOps version");

program
  .command("init")
  .description("Install the VibeOps workflow files into the current directory")
  .option("--dry-run", "Show what would be created without writing any files")
  .option("--force", "Overwrite existing files (use with care)")
  .option("--cwd <path>", "Run against a different directory")
  .option("--name <projectName>", "Project name written into .vibeops.json")
  .option("--git", "Initialize a Git repository without prompting")
  .option("--no-git", "Skip Git initialization and commits")
  .option("--initial-commit", "Run `git add .` and create an initial commit")
  .option("--no-initial-commit", "Do not create an initial commit")
  .option("--default-branch <name>", "Default Git branch name (default `main`)")
  .option(
    "--commit-message <message>",
    "Initial commit message (default 'chore: initialize vibeops project')",
  )
  .action(
    async (options: {
      dryRun?: boolean;
      force?: boolean;
      cwd?: string;
      name?: string;
      git?: boolean;
      initialCommit?: boolean;
      defaultBranch?: string;
      commitMessage?: string;
    }) => {
      await initCommand(options);
    },
  );

program
  .command("status")
  .description("Show VibeOps installation, TASK counts, and integration state")
  .option("--json", "Print machine-readable JSON")
  .option("--cwd <path>", "Inspect a different directory")
  .action(async (options: { json?: boolean; cwd?: string }) => {
    await statusCommand(options);
  });

program
  .command("plan")
  .description("Run 20 interactive questions and produce a ProjectBrief + Cursor planning prompt")
  .option("--idea <text>", "One-line idea default (use `Name: idea` to extract the project name)")
  .option("--from <path>", "Read an existing brief markdown and regenerate the prompt")
  .option(
    "--output <path>",
    "Output path for the Cursor planning prompt (default `.vibeops/generated/plan-prompt.md`)",
  )
  .option(
    "--non-interactive",
    "Skip prompts and use the supplied values plus safe placeholders",
  )
  .option("--cwd <path>", "Run against a different directory")
  .action(
    async (options: {
      idea?: string;
      from?: string;
      output?: string;
      nonInteractive?: boolean;
      cwd?: string;
    }) => {
      await planCommand(options);
    },
  );

const agent = program
  .command("agent")
  .description("Inspect the `.vibeops/agents/*` agent definitions");

agent
  .command("list")
  .description("List available agents")
  .option("--json", "Print machine-readable JSON")
  .option("--cwd <path>", "Inspect a different directory")
  .action(async (options: { json?: boolean; cwd?: string }) => {
    await agentListCommand(options);
  });

agent
  .command("show <name>")
  .description("Print an agent definition body")
  .option("--raw", "Include frontmatter in the output")
  .option("--cwd <path>", "Inspect a different directory")
  .action(async (name: string, options: { raw?: boolean; cwd?: string }) => {
    await agentShowCommand(name, options);
  });

agent
  .command("prompt <name> <taskId>")
  .description("Print a Cursor-ready prompt built from the agent + TASK context")
  .option("--context <path...>", "Additional context file paths")
  .option("--cwd <path>", "Inspect a different directory")
  .action(
    async (
      name: string,
      taskId: string,
      options: { context?: string[]; cwd?: string },
    ) => {
      await agentPromptCommand(name, taskId, options);
    },
  );

const task = program
  .command("task")
  .description("TASK lifecycle commands");

task
  .command("generate")
  .description(
    "Build a Cursor prompt for generating TASK files, or with --scaffold write skeleton TASK markdown",
  )
  .option("--from <path>", "Primary backlog/brief markdown to feed into the prompt")
  .option(
    "--output <path>",
    "Output path for the generated prompt (default `.vibeops/generated/task-generate-prompt.md`)",
  )
  .option("--count <number>", "Suggested TASK count for Cursor (default 8, warns above 20)")
  .option("--phase <name>", "Generate TASKs for a specific phase label only (e.g. 'MVP 4')")
  .option("--scaffold", "Write skeleton TASK markdown files directly, without an LLM")
  .option("--dry-run", "Print the plan without writing or modifying files")
  .option("--cwd <path>", "Run against a different directory")
  .action(
    async (options: {
      from?: string;
      output?: string;
      count?: string;
      phase?: string;
      scaffold?: boolean;
      dryRun?: boolean;
      cwd?: string;
    }) => {
      await taskGenerateCommand(options);
    },
  );

task
  .command("start <taskId>")
  .description(
    "Confirm a clean working tree (or docs-only governance changes), create the task branch, record Status/Git context, and print a Builder prompt",
  )
  .option("--dry-run", "Print the plan without touching files or Git")
  .option(
    "--allow-dirty",
    "Proceed even if the Git working tree is dirty (including non-doc changes)",
  )
  .option("--agent <name>", "Agent to build the prompt with (default `builder`)")
  .option("--cwd <path>", "Run against a different directory")
  .action(
    async (
      taskId: string,
      options: { dryRun?: boolean; allowDirty?: boolean; agent?: string; cwd?: string },
    ) => {
      await taskStartCommand(taskId, options);
    },
  );

task
  .command("prompt <taskId>")
  .description("Print a Cursor-ready prompt built from the TASK + agent context")
  .option(
    "--agent <name>",
    "Agent name (orchestrator / planner / architect / builder / reviewer / tester / docs / recovery)",
  )
  .option("--context <path...>", "Additional context file paths")
  .option("--cwd <path>", "Inspect a different directory")
  .action(
    async (
      taskId: string,
      options: { agent?: string; context?: string[]; cwd?: string },
    ) => {
      await agentPromptCommand(options.agent ?? "builder", taskId, {
        cwd: options.cwd,
        context: options.context,
      });
    },
  );

task
  .command("check <taskId>")
  .description(
    "Read-only check: git diff/log + acceptance criteria + doc updates + Result fields + a Reviewer prompt",
  )
  .option("--strict", "Exit with code 1 if any required item is missing")
  .option("--agent <name>", "Agent to build the prompt with (default `reviewer`)")
  .option("--cwd <path>", "Inspect a different directory")
  .action(
    async (
      taskId: string,
      options: { strict?: boolean; agent?: string; cwd?: string },
    ) => {
      await taskCheckCommand(taskId, options);
    },
  );

task
  .command("done <taskId>")
  .description(
    "Validate Result/Test Result, move Status to Review, and print a commit message (no auto-commit)",
  )
  .option("--dry-run", "Print the plan without touching files")
  .option("--finalize", "Move Status to Done instead of Review (use after human review)")
  .option("--cwd <path>", "Run against a different directory")
  .action(
    async (
      taskId: string,
      options: { dryRun?: boolean; finalize?: boolean; cwd?: string },
    ) => {
      await taskDoneCommand(taskId, options);
    },
  );

task
  .command("rollback <taskId>")
  .description(
    "Default: advisory only. --confirm: non-destructive rollback. --confirm-destructive: hard reset.",
  )
  .option("--confirm", "Allow non-destructive rollback execution (branch-delete etc.)")
  .option("--confirm-destructive", "Allow destructive rollback execution (reset --hard etc.)")
  .option(
    "--strategy <name>",
    "branch-delete | reset-base | revert-merge (default branch-delete)",
  )
  .option("--keep-branch", "Keep the task branch even when using branch-delete")
  .option("--dry-run", "Print the plan without running any git commands, even with --confirm")
  .option("--cwd <path>", "Run against a different directory")
  .action(
    async (
      taskId: string,
      options: {
        confirm?: boolean;
        confirmDestructive?: boolean;
        strategy?: "branch-delete" | "reset-base" | "revert-merge";
        keepBranch?: boolean;
        dryRun?: boolean;
        cwd?: string;
      },
    ) => {
      await taskRollbackCommand(taskId, options);
    },
  );

task
  .command("pull")
  .description(
    "Generate `docs/tasks/*.md` skeletons from Notion Tasks DB rows (defaults to Status = Planned)",
  )
  .option("--dry-run", "Print the plan without touching files or Notion")
  .option("--json", "Print machine-readable JSON")
  .option(
    "--status <name>",
    "Notion Status values to pull (comma-separated, e.g. 'Planned,Ready'). Default `Planned`",
  )
  .option("--limit <number>", "Maximum rows to pull from Notion (default 20, max 100)")
  .option("--cwd <path>", "Run against a different directory")
  .option(
    "--verbose",
    "Print a decision trace per considered row (taskId / pageId / docsPath / reason)",
  )
  .action(
    async (options: {
      dryRun?: boolean;
      json?: boolean;
      status?: string;
      limit?: string;
      cwd?: string;
      verbose?: boolean;
    }) => {
      await taskPullCommand(options);
    },
  );

const notion = program
  .command("notion")
  .description("Notion dashboard sync");

notion
  .command("init")
  .description(
    "Interactive setup: use arrow keys + Enter to pick Yes/No, then write `.vibeops.json` `notion` section and `.vibeops.env(.example)`",
  )
  .option("--dry-run", "Print the plan without changing files (no interactive prompts)")
  .option("--enable", "Set `notion.enabled = true` and skip the first prompt")
  .option("--projects-db <id>", "Set `notion.projectsDatabaseId` (skip the prompt)")
  .option("--tasks-db <id>", "Set `notion.tasksDatabaseId` (skip the prompt)")
  .option(
    "--non-interactive",
    "Force non-interactive mode in a TTY (use flag values + safe defaults only)",
  )
  .option("--cwd <path>", "Run against a different directory")
  .action(
    async (options: {
      dryRun?: boolean;
      enable?: boolean;
      projectsDb?: string;
      tasksDb?: string;
      nonInteractive?: boolean;
      cwd?: string;
    }) => {
      await notionInitCommand(options);
    },
  );

notion
  .command("test")
  .description(
    "Read-only check: Notion API auth + access to Projects/Tasks DBs + required-property schema validation",
  )
  .option("--json", "Print machine-readable JSON")
  .option(
    "--debug-shape",
    "Also print a token-safe diagnostic of the Projects/Tasks retrieve responses (top-level keys, data_sources, etc.)",
  )
  .option("--cwd <path>", "Run against a different directory")
  .action(
    async (options: { json?: boolean; debugShape?: boolean; cwd?: string }) => {
      await notionTestCommand(options);
    },
  );

notion
  .command("sync")
  .description(
    "Push `docs/project` + `docs/tasks` metadata into Notion Projects/Tasks DBs (read-only on local files)",
  )
  .option("--dry-run", "Print the plan without any Notion mutation (queries only)")
  .option("--json", "Print machine-readable JSON")
  .option("--only-tasks", "Sync the Tasks DB only (leave the Project row alone)")
  .option("--only-project", "Sync the Project DB only (leave Task rows alone)")
  .option("--cwd <path>", "Run against a different directory")
  .action(
    async (options: {
      dryRun?: boolean;
      json?: boolean;
      onlyTasks?: boolean;
      onlyProject?: boolean;
      cwd?: string;
    }) => {
      await notionSyncCommand(options);
    },
  );

const github = program
  .command("github")
  .description("GitHub repository integration");

github
  .command("status")
  .description(
    "Read-only check: gh install/auth + git remotes + `.vibeops.json` github section + `package.json` repo fields",
  )
  .option("--json", "Print machine-readable JSON")
  .option("--cwd <path>", "Inspect a different directory")
  .action(async (options: { json?: boolean; cwd?: string }) => {
    await githubStatusCommand(options);
  });

github
  .command("init")
  .description(
    "Interactive setup: check gh auth, manage the git remote, optionally `gh repo create`, then update `.vibeops.json` and `package.json`",
  )
  .option("--dry-run", "Print the plan without running gh / git or writing files")
  .option("--yes", "Skip interactive prompts and use safe defaults")
  .option("--owner <owner>", "GitHub owner (user or org)")
  .option("--repo <repo>", "GitHub repo name")
  .option("--public", "Force visibility = public (skip the prompt)")
  .option("--private", "Force visibility = private (skip the prompt)")
  .option("--remote <name>", "Git remote name (default `origin`)")
  .option(
    "--connect <ownerOrUrl>",
    "Connect to an existing repo instead of creating one (owner/repo or https/ssh URL)",
  )
  .option("--no-package-update", "Do not modify `package.json` repository/homepage/bugs fields")
  .option("--cwd <path>", "Run against a different directory")
  .action(
    async (options: {
      dryRun?: boolean;
      yes?: boolean;
      owner?: string;
      repo?: string;
      public?: boolean;
      private?: boolean;
      remote?: string;
      connect?: string;
      packageUpdate?: boolean;
      cwd?: string;
    }) => {
      await githubInitCommand({
        ...options,
        // Commander turns `--no-package-update` into `packageUpdate: false`.
        // Our command type still accepts the legacy `noPackageUpdate`
        // shape for tests / direct invocation.
        noPackageUpdate: options.packageUpdate === false,
      });
    },
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("[vibeops] error:", err);
  process.exitCode = 1;
});
