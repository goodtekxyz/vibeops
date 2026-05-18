#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("dist/cli.js");

if (!existsSync(cli)) {
  console.error("[smoke] dist/cli.js is missing. Run `pnpm build` first.");
  process.exit(1);
}

const tmpRoot = mkdtempSync(join(tmpdir(), "vibeops-smoke-"));
try {
  const cases = [
    ["--help"],
    ["init", "--cwd", tmpRoot, "--no-git", "--no-initial-commit", "--name", "smoke"],
    ["init", "--dry-run"],
    ["status"],
    ["plan", "--non-interactive", "--idea", "Smoke: test app", "--cwd", tmpRoot],
    [
      "task",
      "add",
      "--non-interactive",
      "--idea",
      "Smoke slice",
      "--cwd",
      tmpRoot,
    ],
    ["task", "status", "--cwd", tmpRoot],
    ["task", "status", "--json", "--cwd", tmpRoot],
    ["start", "--dry-run", "--cwd", tmpRoot],
    ["next", "--non-interactive", "--cwd", tmpRoot],
    ["notion", "init", "--dry-run"],
    ["github", "status"],
    ["rollback", "--dry-run", "--cwd", tmpRoot],
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
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
