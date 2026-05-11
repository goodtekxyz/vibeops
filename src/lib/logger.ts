/* eslint-disable no-console */
const useColor = (): boolean => {
  if (process.env["NO_COLOR"]) return false;
  if (process.env["FORCE_COLOR"]) return true;
  return process.stdout.isTTY === true;
};

const color = (code: string, s: string): string => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : s);

export const dim = (s: string): string => color("2", s);
export const bold = (s: string): string => color("1", s);
export const green = (s: string): string => color("32", s);
export const yellow = (s: string): string => color("33", s);
export const red = (s: string): string => color("31", s);
export const cyan = (s: string): string => color("36", s);
export const gray = (s: string): string => color("90", s);

export const log = {
  info(msg: string): void {
    console.log(msg);
  },
  step(msg: string): void {
    console.log(`${cyan("→")} ${msg}`);
  },
  ok(msg: string): void {
    console.log(`${green("✓")} ${msg}`);
  },
  skip(msg: string): void {
    console.log(`${dim("·")} ${dim(msg)}`);
  },
  warn(msg: string): void {
    console.warn(`${yellow("!")} ${msg}`);
  },
  error(msg: string): void {
    console.error(`${red("✗")} ${msg}`);
  },
  raw(msg: string): void {
    process.stdout.write(msg);
  },
  blank(): void {
    console.log("");
  },
};
