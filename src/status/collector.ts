import { isDirectory, isFile, pathExists } from "../lib/filesystem.js";
import { readConfig, readNotionEnvSnapshot } from "../lib/config.js";
import { readGitInfo, type GitInfo } from "../lib/git.js";
import { countTasks, pickNextTask, scanTasks } from "../lib/task.js";
import { projectPaths } from "../lib/paths.js";
import { type VibeopsConfig, type NotionEnvSnapshot } from "../types/config.js";
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
  notion: NotionEnvSnapshot;
}

async function presenceCheck(label: string, path: string, required: boolean, asDir: boolean): Promise<CheckEntry> {
  const present = asDir ? await isDirectory(path) : await isFile(path);
  return { label, path, present, required };
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

  const tasks = (await pathExists(paths.docsTasks)) ? await scanTasks(paths.docsTasks) : [];
  const taskCounts = countTasks(tasks);
  const nextTask = pickNextTask(tasks);

  const git = await readGitInfo(paths.root);
  const notion = readNotionEnvSnapshot();

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
  };
}
