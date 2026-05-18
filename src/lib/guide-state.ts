import { join } from "node:path";

import { mkdir } from "node:fs/promises";

import { pathExists, readTextOrNull, writeText } from "./filesystem.js";
import type { GuideStepId } from "./workflow-guide.js";

export const GUIDE_STATE_SCHEMA_VERSION = 1 as const;

export interface GuideStateFile {
  readonly schemaVersion: typeof GUIDE_STATE_SCHEMA_VERSION;
  readonly taskId: string | null;
  readonly stepId: GuideStepId;
  /** Step ids visited (for Prev). */
  readonly history: readonly string[];
  readonly updatedAt: string;
}

export function guideStatePath(vibeopsDir: string): string {
  return join(vibeopsDir, "state", "guide.json");
}

export async function readGuideState(vibeopsDir: string): Promise<GuideStateFile | null> {
  const path = guideStatePath(vibeopsDir);
  const raw = await readTextOrNull(path);
  if (raw === null || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as GuideStateFile;
    if (parsed.schemaVersion !== GUIDE_STATE_SCHEMA_VERSION) return null;
    if (typeof parsed.stepId !== "string") return null;
    return {
      schemaVersion: GUIDE_STATE_SCHEMA_VERSION,
      taskId: typeof parsed.taskId === "string" ? parsed.taskId : null,
      stepId: parsed.stepId as GuideStepId,
      history: Array.isArray(parsed.history)
        ? parsed.history.filter((x): x is string => typeof x === "string")
        : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function writeGuideState(
  vibeopsDir: string,
  state: GuideStateFile,
): Promise<void> {
  const dir = join(vibeopsDir, "state");
  if (!(await pathExists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  await writeText(guideStatePath(vibeopsDir), `${JSON.stringify(state, null, 2)}\n`);
}

export function pushGuideHistory(
  prev: GuideStateFile | null,
  taskId: string | null,
  stepId: GuideStepId,
): GuideStateFile {
  const history = [...(prev?.history ?? [])];
  if (prev?.stepId && prev.stepId !== stepId) {
    history.push(prev.stepId);
  }
  return {
    schemaVersion: GUIDE_STATE_SCHEMA_VERSION,
    taskId,
    stepId,
    history,
    updatedAt: new Date().toISOString(),
  };
}

export function popGuideHistory(state: GuideStateFile): {
  readonly next: GuideStateFile | null;
  readonly stepId: GuideStepId | null;
} {
  if (state.history.length === 0) {
    return { next: null, stepId: null };
  }
  const history = [...state.history];
  const stepId = history.pop() as GuideStepId;
  return {
    stepId,
    next: {
      schemaVersion: GUIDE_STATE_SCHEMA_VERSION,
      taskId: state.taskId,
      stepId,
      history,
      updatedAt: new Date().toISOString(),
    },
  };
}
