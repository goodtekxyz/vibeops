import { basename } from "node:path";

import { isDirectory, isFile, pathExists } from "../lib/filesystem.js";
import { readConfig } from "../lib/config.js";
import { readGitInfo, type GitInfo } from "../lib/git.js";
import { getNotionTokenSource } from "../lib/notion-env.js";
import {
  readPackageJson,
  type PackageJsonShape,
} from "../lib/package-json.js";
import { countTasks, pickNextTask, scanTasks } from "../lib/task.js";
import { projectPaths } from "../lib/paths.js";
import {
  DEFAULT_GITHUB_CONFIG,
  type GithubConfig,
  type GithubStatusSnapshot,
  type NotionConfig,
  type NotionStatusSnapshot,
  type PackageStatusSnapshot,
  type VibeopsConfig,
} from "../types/config.js";
import { type TaskCounts, type TaskMeta } from "../types/task.js";

export interface CheckEntry {
  label: string;
  path: string;
  present: boolean;
  required: boolean;
}

export interface StatusReport {
  cwd: string;
  isVibeopsProject: boolean;
  config: VibeopsConfig | null;
  checks: CheckEntry[];
  missingRequired: CheckEntry[];
  tasks: TaskMeta[];
  taskCounts: TaskCounts;
  nextTask: TaskMeta | null;
  git: GitInfo;
  notion: NotionStatusSnapshot;
  github: GithubStatusSnapshot;
  package: PackageStatusSnapshot;
}

async function presenceCheck(
  label: string,
  path: string,
  required: boolean,
  asDir: boolean,
): Promise<CheckEntry> {
  const present = asDir ? await isDirectory(path) : await isFile(path);
  return { label, path, present, required };
}

function snapshotNotion(
  notion: NotionConfig | undefined,
  token: { hasToken: boolean; source: NotionStatusSnapshot["tokenSource"] },
): NotionStatusSnapshot {
  const projects = (notion?.projectsTargetId ?? "").length > 0 ||
    (notion?.projectsDatabaseId ?? "").length > 0;
  const tasks = (notion?.tasksTargetId ?? "").length > 0 ||
    (notion?.tasksDatabaseId ?? "").length > 0;
  return {
    enabled: notion?.enabled ?? false,
    hasToken: token.hasToken,
    tokenSource: token.source,
    hasProjectsTarget: projects,
    hasTasksTarget: tasks,
  };
}

function snapshotGithub(github: GithubConfig | undefined): GithubStatusSnapshot {
  const g = github ?? DEFAULT_GITHUB_CONFIG;
  return {
    enabled: g.enabled,
    mode: g.enabled ? g.mode : "",
    owner: g.owner,
    repo: g.repo,
    remote: g.remote,
    url: g.url,
  };
}

function pickBinName(pkg: PackageJsonShape): string {
  const bin = pkg.bin;
  if (typeof bin === "string") {
    return basename(bin).replace(/\.[A-Za-z0-9]+$/, "");
  }
  if (bin !== null && typeof bin === "object") {
    const keys = Object.keys(bin as Record<string, unknown>);
    if (keys.length > 0) return keys[0]!;
  }
  return "";
}

function snapshotPackage(
  pkg: { data: PackageJsonShape } | null,
): PackageStatusSnapshot {
  if (pkg === null) {
    return { exists: false, name: "", version: "", bin: "" };
  }
  const data = pkg.data;
  const name = typeof data.name === "string" ? data.name : "";
  const version =
    typeof (data as { version?: unknown }).version === "string"
      ? ((data as { version?: string }).version ?? "")
      : "";
  return { exists: true, name, version, bin: pickBinName(data) };
}

export async function collectStatus(cwd: string): Promise<StatusReport> {
  const paths = projectPaths(cwd);
  const config = await readConfig(paths.root);

  const checks: CheckEntry[] = [
    await presenceCheck(".vibeops.json", paths.config, true, false),
    await presenceCheck("AGENTS.md", paths.agentsMd, true, false),
    await presenceCheck(".cursor/rules/", paths.cursorRules, true, true),
    await presenceCheck("docs/project/", paths.docsProject, true, true),
    await presenceCheck("docs/tasks/", paths.docsTasks, true, true),
    await presenceCheck("docs/logs/", paths.docsLogs, false, true),
    await presenceCheck(".vibeops/agents/", paths.vibeopsAgents, true, true),
    await presenceCheck(".vibeops/prompts/", paths.vibeopsPrompts, false, true),
    await presenceCheck(".vibeops/workflows/", paths.vibeopsWorkflows, false, true),
    await presenceCheck(".vibeops.env.example", paths.envExample, false, false),
  ];

  const missingRequired = checks.filter((c) => c.required && !c.present);

  const tasks = (await pathExists(paths.docsTasks))
    ? await scanTasks(paths.docsTasks)
    : [];
  const taskCounts = countTasks(tasks);
  const nextTask = pickNextTask(tasks);

  const git = await readGitInfo(paths.root);

  const tokenProbe = await getNotionTokenSource(paths.root);
  const notion = snapshotNotion(config?.notion, tokenProbe);
  const github = snapshotGithub(config?.github);

  const pkg = await readPackageJson(paths.root);
  const packageSnapshot = snapshotPackage(pkg);

  const isVibeopsProject = config !== null && missingRequired.length === 0;

  return {
    cwd: paths.root,
    isVibeopsProject,
    config,
    checks,
    missingRequired,
    tasks,
    taskCounts,
    nextTask,
    git,
    notion,
    github,
    package: packageSnapshot,
  };
}
