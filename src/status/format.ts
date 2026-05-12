import { relative } from "node:path";

import { bold, cyan, dim, green, log, red, yellow } from "../lib/logger.js";

import { type StatusReport } from "./collector.js";

function relOrAbs(root: string, p: string): string {
  const r = relative(root, p);
  if (r === "") return ".";
  if (r.startsWith("..")) return p;
  return r;
}

function statusBadge(value: number, label: string): string {
  if (value === 0) return dim(`${label}:0`);
  return `${label}:${value}`;
}

function pad(label: string, width: number): string {
  if (label.length >= width) return label;
  return label + " ".repeat(width - label.length);
}

function tokenLine(report: StatusReport): string {
  if (!report.notion.hasToken) return red("missing");
  return `${green("configured")} ${dim(`(${report.notion.tokenSource})`)}`;
}

function targetLine(present: boolean): string {
  return present ? green("configured") : red("missing");
}

function notionHint(report: StatusReport): string {
  if (!report.notion.enabled) return "run `vibeops notion init`";
  if (!report.notion.hasToken) return "set NOTION_TOKEN in `.vibeops.env`";
  if (!report.notion.hasProjectsTarget || !report.notion.hasTasksTarget) {
    return "run `vibeops notion init` to pick a Projects / Tasks DB";
  }
  return "run `vibeops notion test`";
}

export function printHuman(report: StatusReport): void {
  log.info(bold("Project"));
  if (report.config) {
    log.info(`  name           ${report.config.name}`);
    log.info(`  vibeopsVersion ${report.config.vibeopsVersion}`);
    log.info(`  schemaVersion  ${String(report.config.schemaVersion)}`);
    log.info(`  createdAt      ${report.config.createdAt}`);
  } else {
    log.info(`  ${red("(no .vibeops.json — not a VibeOps project)")}`);
  }
  log.blank();

  log.info(bold("Installation"));
  for (const c of report.checks) {
    const tag = c.present
      ? green("✓")
      : c.required
        ? red("✗")
        : yellow("·");
    const reqHint = c.required ? "" : dim(" (optional)");
    log.info(`  ${tag} ${c.label}${reqHint}  ${dim(relOrAbs(report.cwd, c.path))}`);
  }
  if (report.missingRequired.length > 0) {
    log.blank();
    log.warn(`${report.missingRequired.length} required path(s) missing.`);
  }
  log.blank();

  log.info(bold("Tasks"));
  const { total, planned, in_progress, review, blocked, done } = report.taskCounts;
  log.info(
    `  ${cyan(`total:${total}`)}  ${statusBadge(planned, "planned")}  ${statusBadge(
      in_progress,
      "in_progress",
    )}  ${statusBadge(review, "review")}  ${statusBadge(blocked, "blocked")}  ${statusBadge(done, "done")}`,
  );
  if (report.nextTask) {
    log.info(
      `  next  ${report.nextTask.id} — ${report.nextTask.title || dim("(no title)")}  ${dim(`[${report.nextTask.status}]`)}`,
    );
  } else if (total === 0) {
    log.info(`  ${dim("no TASK files yet — run `vibeops task generate`")}`);
  } else {
    log.info(`  ${dim("all tasks done")}`);
  }
  log.blank();

  log.info(bold("Git"));
  if (!report.git.isRepo) {
    log.info(`  ${dim("not a git repository")}`);
  } else {
    if (report.git.state === "unborn") {
      log.info(
        `  branch  ${report.git.branch ?? "(unknown)"} ${dim("(unborn, no commits yet)")}`,
      );
    } else if (report.git.state === "detached") {
      log.info(
        `  branch  ${dim("(detached)")}${report.git.branch ? ` ${report.git.branch}` : ""}`,
      );
    } else {
      log.info(`  branch  ${report.git.branch ?? dim("(unknown)")}`);
    }
    log.info(`  status  ${report.git.dirty ? yellow("dirty") : green("clean")}`);
    if (report.git.state === "unborn") {
      log.info(
        `  hint    create the first commit or run ${cyan("`vibeops init --git --initial-commit`")}`,
      );
    }
  }
  log.blank();

  // Notion: enabled / token / projects target / tasks target / hint.
  // We intentionally do NOT print legacy env names (NOTION_API_KEY,
  // NOTION_PROJECT_DB, NOTION_TASK_DB) — modern VibeOps only uses
  // NOTION_TOKEN + notion.{projectsTargetId,tasksTargetId}.
  log.info(bold("Notion"));
  const notionLabelWidth = 16; // "projects target"
  log.info(
    `  ${pad("enabled", notionLabelWidth)} ${report.notion.enabled ? green("yes") : dim("no")}`,
  );
  log.info(`  ${pad("token", notionLabelWidth)} ${tokenLine(report)}`);
  log.info(
    `  ${pad("projects target", notionLabelWidth)} ${targetLine(report.notion.hasProjectsTarget)}`,
  );
  log.info(
    `  ${pad("tasks target", notionLabelWidth)} ${targetLine(report.notion.hasTasksTarget)}`,
  );
  log.info(`  ${pad("hint", notionLabelWidth)} ${dim(notionHint(report))}`);
  log.blank();

  log.info(bold("GitHub"));
  const githubLabelWidth = 11; // "owner/repo"
  if (!report.github.enabled) {
    log.info(`  ${pad("enabled", githubLabelWidth)} ${dim("no")}`);
    log.info(`  ${pad("hint", githubLabelWidth)} ${dim("run `vibeops github init`")}`);
  } else {
    log.info(`  ${pad("enabled", githubLabelWidth)} ${green("yes")}`);
    if (report.github.mode.length > 0) {
      log.info(`  ${pad("mode", githubLabelWidth)} ${report.github.mode}`);
    }
    const slug =
      report.github.owner.length > 0 && report.github.repo.length > 0
        ? `${report.github.owner}/${report.github.repo}`
        : dim("(unknown)");
    log.info(`  ${pad("owner/repo", githubLabelWidth)} ${slug}`);
    log.info(
      `  ${pad("remote", githubLabelWidth)} ${report.github.remote.length > 0 ? report.github.remote : dim("(none)")}`,
    );
    log.info(
      `  ${pad("url", githubLabelWidth)} ${report.github.url.length > 0 ? report.github.url : dim("(none)")}`,
    );
  }
  log.blank();

  log.info(bold("Package"));
  const pkgLabelWidth = 8; // "version"
  if (!report.package.exists) {
    log.info(`  ${dim("package.json missing")}`);
  } else {
    log.info(
      `  ${pad("name", pkgLabelWidth)} ${report.package.name.length > 0 ? report.package.name : dim("(unset)")}`,
    );
    log.info(
      `  ${pad("version", pkgLabelWidth)} ${report.package.version.length > 0 ? report.package.version : dim("(unset)")}`,
    );
    log.info(
      `  ${pad("bin", pkgLabelWidth)} ${report.package.bin.length > 0 ? report.package.bin : dim("(none)")}`,
    );
  }
  log.blank();

  if (!report.isVibeopsProject) {
    log.error("Not a VibeOps project — run `vibeops init` first.");
  } else {
    log.ok("VibeOps project ready.");
  }
}

export function toJson(report: StatusReport): string {
  return `${JSON.stringify(
    {
      cwd: report.cwd,
      isVibeopsProject: report.isVibeopsProject,
      config: report.config,
      installation: {
        checks: report.checks.map((c) => ({
          label: c.label,
          path: c.path,
          present: c.present,
          required: c.required,
        })),
        missingRequired: report.missingRequired.map((c) => c.label),
      },
      tasks: {
        counts: report.taskCounts,
        next: report.nextTask
          ? {
              id: report.nextTask.id,
              title: report.nextTask.title,
              status: report.nextTask.status,
            }
          : null,
      },
      git: report.git,
      notion: report.notion,
      github: report.github,
      package: report.package,
    },
    null,
    2,
  )}\n`;
}
