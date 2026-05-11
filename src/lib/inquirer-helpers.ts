import { checkbox, confirm, input, select } from "@inquirer/prompts";

export const OTHER_LABEL = "Other";

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
        return "필수 항목입니다.";
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
    message: `↳ ${opts.message} — "Other"에 들어갈 값을 입력 (빈 값이면 그대로 "Other")`,
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
    message: `${opts.message}  ${"\u001b[2m"}(방향키 · Space · Enter)${"\u001b[0m"}`,
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
      message: `↳ ${opts.message} — "Other" 항목 입력 (쉼표로 구분 가능, 빈 값이면 그대로 "Other")`,
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
