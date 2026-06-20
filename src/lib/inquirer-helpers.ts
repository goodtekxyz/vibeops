import { checkbox, confirm, input, select } from "@inquirer/prompts";

export const OTHER_LABEL = "Other";

/** True when both stdin and stdout are TTYs (safe to show interactive prompts). */
export function isInteractiveSession(): boolean {
  return Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
}

function isOther(value: string): boolean {
  return value === OTHER_LABEL;
}

function formatCustom(text: string): string {
  return `Other: ${text.trim()}`;
}

export interface AskInputOptions {
  message: string;
  nonInteractive: boolean;
  default?: string;
  required?: boolean;
  fallback?: string;
}

export async function askInput(opts: AskInputOptions): Promise<string> {
  if (opts.nonInteractive) {
    const value = opts.default ?? opts.fallback ?? "";
    return value.trim();
  }
  const answer = await input({
    message: opts.message,
    default: opts.default,
    validate: (raw: string): string | true => {
      if (opts.required && raw.trim().length === 0) {
        return "This field is required.";
      }
      return true;
    },
  });
  return answer.trim();
}

export interface AskSelectOptions {
  message: string;
  nonInteractive: boolean;
  choices: readonly string[];
  default?: string;
}

export async function askSelect(opts: AskSelectOptions): Promise<string> {
  if (opts.nonInteractive) {
    const fallback = opts.default ?? opts.choices[0] ?? "";
    return fallback;
  }
  const choices = opts.choices.map((c) => ({ name: c, value: c }));
  const answer = await select({
    message: opts.message,
    choices,
    default: opts.default ?? opts.choices[0],
    loop: false,
    pageSize: 8,
  });
  if (!isOther(answer)) return answer;
  const custom = await input({
    message: `↳ ${opts.message} — enter the value for "Other" (leave empty to keep "Other")`,
  });
  return custom.trim().length > 0 ? formatCustom(custom) : OTHER_LABEL;
}

export interface AskCheckboxOptions {
  message: string;
  nonInteractive: boolean;
  choices: readonly string[];
  default?: readonly string[];
}

export async function askCheckbox(opts: AskCheckboxOptions): Promise<string[]> {
  if (opts.nonInteractive) {
    return [...(opts.default ?? [])];
  }
  const defaults = new Set(opts.default ?? []);
  const choices = opts.choices.map((c) => ({ name: c, value: c, checked: defaults.has(c) }));
  const answer = await checkbox<string>({
    message: `${opts.message}  ${"\u001b[2m"}(arrow keys · Space · Enter)${"\u001b[0m"}`,
    choices,
    loop: false,
    pageSize: 8,
  });
  const out: string[] = [];
  for (const item of answer) {
    if (!isOther(item)) {
      out.push(item);
      continue;
    }
    const custom = await input({
      message: `↳ ${opts.message} — enter values for "Other" (comma-separated, leave empty to keep "Other")`,
    });
    const trimmed = custom.trim();
    if (trimmed.length === 0) {
      out.push(OTHER_LABEL);
      continue;
    }
    for (const piece of trimmed.split(",")) {
      const t = piece.trim();
      if (t.length > 0) out.push(formatCustom(t));
    }
  }
  return out;
}

export interface AskConfirmOptions {
  message: string;
  nonInteractive: boolean;
  default: boolean;
}

export async function askConfirm(opts: AskConfirmOptions): Promise<boolean> {
  if (opts.nonInteractive) return opts.default;
  return await confirm({ message: opts.message, default: opts.default });
}

export interface YesNoSelectOptions {
  message: string;
  /** default selection — defaults to true (Yes) */
  defaultValue?: boolean;
}

/**
 * Yes/No question rendered as a 2-choice `select` prompt instead of a
 * `confirm` prompt. This means the user navigates with ←/→ or ↑/↓ and
 * presses Enter — they never have to type `y` or `n`.
 *
 * Returns a boolean (`true` = Yes, `false` = No).
 */
export async function yesNoSelect(opts: YesNoSelectOptions): Promise<boolean> {
  return await select<boolean>({
    message: opts.message,
    choices: [
      { name: "Yes", value: true },
      { name: "No", value: false },
    ],
    default: opts.defaultValue ?? true,
    loop: false,
    pageSize: 2,
  });
}

export interface AskYesNoOptions {
  message: string;
  /** when true, skip the prompt and return `defaultValue` */
  nonInteractive: boolean;
  /** default selection — defaults to true (Yes) */
  defaultValue?: boolean;
}

/**
 * Wrapper around `yesNoSelect` that respects a non-interactive flag (CI).
 */
export async function askYesNo(opts: AskYesNoOptions): Promise<boolean> {
  if (opts.nonInteractive) return opts.defaultValue ?? true;
  return yesNoSelect({ message: opts.message, defaultValue: opts.defaultValue ?? true });
}
