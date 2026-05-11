import { relative } from "node:path";

import { bold, cyan, dim, gray, green, log, red, yellow } from "../lib/logger.js";

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
    log.info(`  branch  ${report.git.branch ?? dim("(detached?)")}`);
    log.info(
      `  status  ${report.git.dirty ? yellow("dirty") : green("clean")}`,
    );
  }
  log.blank();

  log.info(bold("Notion"));
  const keys = [
    ["NOTION_TOKEN", report.notion.hasToken],
    ["NOTION_API_KEY", report.notion.hasApiKey],
    ["NOTION_PROJECT_DB", report.notion.hasProjectDb],
    ["NOTION_TASK_DB", report.notion.hasTaskDb],
  ] as const;
  for (const [name, present] of keys) {
    log.info(`  ${present ? green("✓") : gray("·")} ${name}`);
  }
  if (report.config?.notion) {
    const n = report.config.notion;
    log.info(
      `  ${n.enabled ? green("✓") : gray("·")} notion.enabled ${dim(`(${n.enabled})`)}`,
    );
    log.info(
      `  ${n.projectsDatabaseId.length > 0 ? green("✓") : gray("·")} projectsDatabaseId ${dim(`(${n.projectsDatabaseId.length > 0 ? "set" : "empty"})`)}`,
    );
    log.info(
      `  ${n.tasksDatabaseId.length > 0 ? green("✓") : gray("·")} tasksDatabaseId ${dim(`(${n.tasksDatabaseId.length > 0 ? "set" : "empty"})`)}`,
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
          ? { id: report.nextTask.id, title: report.nextTask.title, status: report.nextTask.status }
          : null,
      },
      git: report.git,
      notion: report.notion,
    },
    null,
    2,
  )}\n`;
}
