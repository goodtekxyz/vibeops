import { readGitContext } from "./task.js";
import { runGit } from "./git.js";

export async function summarizeTaskDiff(cwd: string, taskFile: string): Promise<string | null> {
  const ctx = await readGitContext(taskFile);
  if (ctx === null || ctx.baseCommit.length === 0) return null;

  const range = `${ctx.baseCommit}..HEAD`;
  const lines: string[] = [
    `Git range: \`${range}\` (base \`${ctx.baseBranch}\` → branch \`${ctx.taskBranch}\`)`,
    "",
  ];

  try {
    const log = await runGit(cwd, ["log", "--oneline", range]);
    const commits = log.stdout.trim().split("\n").filter((l) => l.length > 0);
    lines.push("### Commits");
    if (commits.length === 0) {
      lines.push("(no commits on task branch since start)");
    } else {
      for (const c of commits.slice(0, 30)) lines.push(`- ${c}`);
      if (commits.length > 30) lines.push(`- … and ${commits.length - 30} more`);
    }
    lines.push("");
  } catch {
    lines.push("### Commits");
    lines.push("(could not read git log)");
    lines.push("");
  }

  try {
    const stat = await runGit(cwd, ["diff", "--stat", range]);
    lines.push("### Diff stat");
    const body = stat.stdout.trim();
    lines.push(body.length > 0 ? "```\n" + body + "\n```" : "(no file changes vs base commit)");
  } catch {
    lines.push("### Diff stat");
    lines.push("(could not read git diff)");
  }

  return lines.join("\n");
}
