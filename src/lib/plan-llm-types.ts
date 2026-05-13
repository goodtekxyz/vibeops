import type { ProjectBrief } from "../types/brief.js";

/** One assistant turn from the planning LLM (JSON). */
export type PlanLlmAssistantTurn = PlanLlmQuestionTurn | PlanLlmConfirmTurn | PlanLlmDoneTurn;

export interface PlanLlmQuestionTurn {
  readonly turn: "question";
  /** Shown to the user before the prompt control */
  readonly message: string;
  readonly questionType: "single" | "multi" | "text";
  /** Required for single/multi — short labels the user picks with arrow keys */
  readonly options?: readonly string[];
}

/** Final human-readable check before emitting projectBrief. */
export interface PlanLlmConfirmTurn {
  readonly turn: "confirm";
  /** Markdown shown to the user for approval (must use the chosen planning language). */
  readonly readableSummary: string;
  readonly plannerNote?: string;
}

export interface PlanLlmDoneTurn {
  readonly turn: "done";
  /** Must match ProjectBrief shape (arrays may be empty; booleans required) */
  readonly projectBrief: Partial<ProjectBrief> & Record<string, unknown>;
  /** Extra assumptions beyond normalization */
  readonly plannerAssumptions?: readonly string[];
}

export type PlanLlmProviderId = "openai" | "codex-oauth" | "cursor-agent";
