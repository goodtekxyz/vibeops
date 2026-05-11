#!/usr/bin/env node
import { Command } from "commander";

import { agentListCommand } from "./commands/agent-list.js";
import { agentPromptCommand } from "./commands/agent-prompt.js";
import { agentShowCommand } from "./commands/agent-show.js";
import { initCommand } from "./commands/init.js";
import { notionInitCommand } from "./commands/notion-init.js";
import { notionSyncCommand } from "./commands/notion-sync.js";
import { notionTestCommand } from "./commands/notion-test.js";
import { planCommand } from "./commands/plan.js";
import { statusCommand } from "./commands/status.js";
import { taskCheckCommand } from "./commands/task-check.js";
import { taskDoneCommand } from "./commands/task-done.js";
import { taskGenerateCommand } from "./commands/task-generate.js";
import { taskPullCommand } from "./commands/task-pull.js";
import { taskRollbackCommand } from "./commands/task-rollback.js";
import { taskStartCommand } from "./commands/task-start.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("vibeops")
  .description(
    "VibeOps — Cursor 기반 바이브 코딩을 체계적으로 굴리는 로컬 CLI.\n" +
      "  새 프로젝트에 문서 · Cursor Rules · AGENTS.md · 에이전트 · TASK 템플릿 · Git/Notion 워크플로를 설치하고,\n" +
      "  TASK 단위로 작업을 굴린다.",
  )
  .version(VERSION, "-v, --version", "VibeOps 버전 출력");

program
  .command("init")
  .description("현재 디렉터리에 VibeOps 운영 구조 설치 (MVP 1)")
  .option("--dry-run", "실제 파일 변경 없이 무엇이 만들어질지만 표시")
  .option("--force", "기존 파일을 덮어쓴다 (주의)")
  .option("--cwd <path>", "다른 디렉터리에 설치")
  .option("--name <projectName>", ".vibeops.json에 들어갈 프로젝트 이름")
  .action(
    async (options: {
      dryRun?: boolean;
      force?: boolean;
      cwd?: string;
      name?: string;
    }) => {
      await initCommand(options);
    },
  );

program
  .command("status")
  .description("VibeOps 설치 · TASK 현황 · Notion 연결 상태 표시 (MVP 1)")
  .option("--json", "기계 가독 JSON으로 출력")
  .option("--cwd <path>", "다른 디렉터리를 검사")
  .action(async (options: { json?: boolean; cwd?: string }) => {
    await statusCommand(options);
  });

program
  .command("plan")
  .description("20개 대화형 질문으로 ProjectBrief + Cursor Planner 프롬프트 생성 (MVP 2)")
  .option("--idea <text>", "one-line idea의 기본값 (`Name: idea` 형식이면 name도 추출)")
  .option("--from <path>", "기존 brief markdown을 읽어 prompt 재생성")
  .option("--output <path>", "Cursor 계획 프롬프트 출력 경로 (기본 .vibeops/generated/plan-prompt.md)")
  .option("--non-interactive", "질문 없이 주어진 값 + 안전한 placeholder로 생성")
  .option("--cwd <path>", "다른 디렉터리에서 실행")
  .action(
    async (options: {
      idea?: string;
      from?: string;
      output?: string;
      nonInteractive?: boolean;
      cwd?: string;
    }) => {
      await planCommand(options);
    },
  );

const agent = program
  .command("agent")
  .description(".vibeops/agents/* 에이전트 정의 도구 (MVP 1)");

agent
  .command("list")
  .description("에이전트 목록 출력")
  .option("--json", "기계 가독 JSON으로 출력")
  .option("--cwd <path>", "다른 디렉터리를 검사")
  .action(async (options: { json?: boolean; cwd?: string }) => {
    await agentListCommand(options);
  });

agent
  .command("show <name>")
  .description("에이전트 정의 본문 출력")
  .option("--raw", "frontmatter 포함 원본 출력")
  .option("--cwd <path>", "다른 디렉터리를 검사")
  .action(async (name: string, options: { raw?: boolean; cwd?: string }) => {
    await agentShowCommand(name, options);
  });

agent
  .command("prompt <name> <taskId>")
  .description("에이전트 + TASK 컨텍스트로 Cursor 붙여넣기 프롬프트 출력")
  .option("--context <path...>", "추가 컨텍스트 파일 경로")
  .option("--cwd <path>", "다른 디렉터리를 검사")
  .action(
    async (
      name: string,
      taskId: string,
      options: { context?: string[]; cwd?: string },
    ) => {
      await agentPromptCommand(name, taskId, options);
    },
  );

const task = program.command("task").description("TASK 라이프사이클 (MVP 2 ~ 4)");

task
  .command("generate")
  .description("TASK 파일 생성 또는 생성용 프롬프트 출력 (MVP 2)")
  .action(() => {
    taskGenerateCommand();
  });

task
  .command("start <taskId>")
  .description("base branch/commit 기록 + task branch 생성 (MVP 3)")
  .action((taskId: string) => {
    taskStartCommand(taskId);
  });

task
  .command("prompt <taskId>")
  .description("TASK + 에이전트 컨텍스트로 Cursor 붙여넣기 프롬프트 출력 (MVP 3)")
  .option(
    "--agent <name>",
    "사용할 에이전트 이름 (orchestrator / planner / architect / builder / reviewer / tester / docs / recovery)",
  )
  .option("--context <path...>", "추가 컨텍스트 파일 경로")
  .option("--cwd <path>", "다른 디렉터리를 검사")
  .action(
    async (
      taskId: string,
      options: { agent?: string; context?: string[]; cwd?: string },
    ) => {
      await agentPromptCommand(options.agent ?? "builder", taskId, {
        cwd: options.cwd,
        context: options.context,
      });
    },
  );

task
  .command("check <taskId>")
  .description("Acceptance Criteria / Test Plan vs Git 상태 비교 보고 (MVP 3)")
  .action((taskId: string) => {
    taskCheckCommand(taskId);
  });

task
  .command("done <taskId>")
  .description("TASK 완료 검증 + 머지 가이드 (자동 머지 금지) (MVP 3)")
  .action((taskId: string) => {
    taskDoneCommand(taskId);
  });

task
  .command("rollback <taskId>")
  .description("TASK 롤백 안내 (파괴적 작업은 --confirm 필요) (MVP 3)")
  .action((taskId: string) => {
    taskRollbackCommand(taskId);
  });

task
  .command("pull")
  .description("Notion → docs/tasks/*.md 메타 정합 (MVP 4)")
  .action(() => {
    taskPullCommand();
  });

const notion = program.command("notion").description("Notion 대시보드 동기화 (MVP 4)");

notion
  .command("init")
  .description(".vibeops.env 작성 안내")
  .action(() => {
    notionInitCommand();
  });

notion
  .command("test")
  .description("Notion API 접근 + DB 스키마 검증")
  .action(() => {
    notionTestCommand();
  });

notion
  .command("sync")
  .description("docs/tasks · docs/project → Notion 메타 푸시")
  .action(() => {
    notionSyncCommand();
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("[vibeops] error:", err);
  process.exitCode = 1;
});
