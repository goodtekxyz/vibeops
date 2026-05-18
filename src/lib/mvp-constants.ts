/** Fixed id for the single MVP build TASK (v2 workflow). */
export const TASK_MVP_ID = "TASK-mvp";

export const MVP_BUILD_PROMPT_REL = ".vibeops/generated/mvp-build.md";

export const NEXT_TASK_SUGGESTION_REL = ".vibeops/generated/next-task-suggestion.md";

/** CLI aliases → canonical TASK id */
export function resolveTaskRef(ref: string | undefined): string {
  if (ref === undefined || ref.trim().length === 0) return TASK_MVP_ID;
  const t = ref.trim();
  if (/^mvp$/i.test(t)) return TASK_MVP_ID;
  if (/^task-mvp$/i.test(t)) return TASK_MVP_ID;
  return t.toUpperCase().startsWith("TASK-") ? t : `TASK-${t}`;
}
