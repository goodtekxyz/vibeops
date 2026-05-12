#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const cli = resolve("dist/cli.js");

if (!existsSync(cli)) {
  console.error("[smoke] dist/cli.js is missing. Run `pnpm build` first.");
  process.exit(1);
}

const cases = [
  ["--help"],
  ["init", "--dry-run"],
  ["init", "--dry-run", "--git", "--initial-commit"],
  ["status"],
  ["task", "generate", "--dry-run"],
  ["notion", "init", "--dry-run"],
  ["github", "status"],
  ["github", "init", "--dry-run", "--connect", "goodtek/vibeops"],
];

for (const args of cases) {
  const label = `node dist/cli.js ${args.join(" ")}`;
  process.stdout.write(`[smoke] ${label}\n`);
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    console.error(`[smoke] failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write("[smoke] OK\n");
