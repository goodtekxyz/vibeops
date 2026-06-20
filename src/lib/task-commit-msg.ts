import { readConfig } from "./config.js";
import { gitDiffNameOnly, listWorkingTreeRelPaths } from "./git.js";
import { anyLlmProviderAvailable, llmCompleteText } from "./llm-complete.js";
import { getLlmPreferenceFromConfig } from "./llm-preference.js";
import { askInput, isInteractiveSession } from "./inquirer-helpers.js";
import { dim, log } from "./logger.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";
import { featCommitMessageFor, taskScopedCommitMessage } from "./task-git-commit.js";

async function changedPathsForMessage(cwd: string): Promise<string[]> {
  const working = await listWorkingTreeRelPaths(cwd);
  if (working.length > 0) return working;
  return gitDiffNameOnly(cwd);
}

/** Ask the LLM for a one-line conventional-commit subject from the changed files. */
export async function generateCommitSubjectWithLlm(
  cwd: string,
  taskId: string,
  title: string,
): Promise<string | null> {
  const files = await changedPathsForMessage(cwd);
  const fileList = files.slice(0, 40).join("\n") || "(no file changes detected)";

  const messages: OpenAiChatMessage[] = [
    {
      role: "system",
      content:
        "Write a single Conventional Commit subject line (under 72 chars) for the change. " +
        "Reply with ONLY the subject line — no scope, no body, no quotes, no code fences. " +
        "Pick the type from feat, fix, docs, refactor, test, chore.",
    },
    {
      role: "user",
      content: [
        `TASK: ${taskId} — ${title}`,
        "",
        "Changed files:",
        fileList,
      ].join("\n"),
    },
  ];

  try {
    const config = await readConfig(cwd);
    const preference = getLlmPreferenceFromConfig(config);
    const { text } = await llmCompleteText(messages, { cwd, preference });
    const line = text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (line === undefined) return null;
    return line.replace(/^["'`]+|["'`]+$/g, "").trim() || null;
  } catch {
    return null;
  }
}

export interface ResolveShipCommitMessageOptions {
  readonly cwd: string;
  readonly taskId: string;
  readonly title: string;
  /** Explicit `-m/--message` value (highest priority). */
  readonly provided?: string;
  /** Skip the interactive prompt (CI). */
  readonly nonInteractive: boolean;
}

/**
 * Resolve the commit subject for a ship, always TASK-id-scoped:
 * 1. explicit `--message`, 2. LLM from diff (when a provider is connected),
 * 3. interactive prompt, 4. TASK-title fallback.
 */
export async function resolveShipCommitMessage(
  opts: ResolveShipCommitMessageOptions,
): Promise<string> {
  const provided = opts.provided?.trim();
  if (provided !== undefined && provided.length > 0) {
    return taskScopedCommitMessage(opts.taskId, provided);
  }

  if (await anyLlmProviderAvailable(opts.cwd)) {
    const subject = await generateCommitSubjectWithLlm(opts.cwd, opts.taskId, opts.title);
    if (subject !== null && subject.length > 0) {
      const msg = taskScopedCommitMessage(opts.taskId, subject);
      log.info(dim(`  commit message (LLM): ${msg}`));
      return msg;
    }
  }

  if (!opts.nonInteractive && isInteractiveSession()) {
    const typed = await askInput({
      message: `Commit message for ${opts.taskId}`,
      nonInteractive: false,
      default: opts.title,
    });
    if (typed.trim().length > 0) {
      return taskScopedCommitMessage(opts.taskId, typed);
    }
  }

  return featCommitMessageFor(opts.taskId, opts.title);
}
