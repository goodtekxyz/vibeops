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
  .description("docs/project 컨텍스트로 Cursor TASK 생성 프롬프트를 만들거나 (--scaffold면) skeleton TASK 파일을 생성 (MVP 2)")
  .option("--from <path>", "주 입력으로 쓸 backlog/brief markdown 경로")
  .option("--output <path>", "생성된 프롬프트 저장 경로 (기본 .vibeops/generated/task-generate-prompt.md)")
  .option("--count <number>", "Cursor에 권장할 TASK 개수 (기본 8, 20 초과면 경고)")
  .option("--phase <name>", "특정 MVP phase 만 생성 (예: 'MVP 4')")
  .option("--scaffold", "LLM 없이 VibeOps가 직접 skeleton TASK markdown 파일을 만든다")
  .option("--dry-run", "파일 생성/수정 없이 계획만 출력")
  .option("--cwd <path>", "다른 디렉터리에서 실행")
  .action(
    async (options: {
      from?: string;
      output?: string;
      count?: string;
      phase?: string;
      scaffold?: boolean;
      dryRun?: boolean;
      cwd?: string;
    }) => {
      await taskGenerateCommand(options);
    },
  );

task
  .command("start <taskId>")
  .description("Git clean 확인 + task branch 생성 + Status/Git Context 기록 + Builder 프롬프트 출력 (MVP 3)")
  .option("--dry-run", "파일·Git 변경 없이 계획만 출력")
  .option("--allow-dirty", "Git working tree가 dirty여도 진행")
  .option("--agent <name>", "프롬프트를 만들 에이전트 (기본 builder)")
  .option("--cwd <path>", "다른 디렉터리에서 실행")
  .action(
    async (
      taskId: string,
      options: { dryRun?: boolean; allowDirty?: boolean; agent?: string; cwd?: string },
    ) => {
      await taskStartCommand(taskId, options);
    },
  );

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
  .description("read-only · git diff/log + AC + 문서 갱신 + Result 확인 + Reviewer 프롬프트 (MVP 3)")
  .option("--strict", "누락 항목이 있으면 exit code 1")
  .option("--agent <name>", "프롬프트를 만들 에이전트 (기본 reviewer)")
  .option("--cwd <path>", "다른 디렉터리를 검사")
  .action(
    async (
      taskId: string,
      options: { strict?: boolean; agent?: string; cwd?: string },
    ) => {
      await taskCheckCommand(taskId, options);
    },
  );

task
  .command("done <taskId>")
  .description("Result/Test Result 검증 + Status → Review + 커밋 메시지 안내 (자동 commit 금지) (MVP 3)")
  .option("--dry-run", "파일 변경 없이 계획만 출력")
  .option("--finalize", "Review 대신 Done으로 마무리 (사람 검토 후 사용)")
  .option("--cwd <path>", "다른 디렉터리에서 실행")
  .action(
    async (
      taskId: string,
      options: { dryRun?: boolean; finalize?: boolean; cwd?: string },
    ) => {
      await taskDoneCommand(taskId, options);
    },
  );

task
  .command("rollback <taskId>")
  .description("기본: 안내만. --confirm: 비파괴(branch-delete). --confirm-destructive: hard reset. (MVP 3)")
  .option("--confirm", "비파괴 rollback 실행 허용 (branch-delete 등)")
  .option("--confirm-destructive", "파괴적 rollback 실행 허용 (reset --hard 등)")
  .option(
    "--strategy <name>",
    "branch-delete | reset-base | revert-merge (기본 branch-delete)",
  )
  .option("--keep-branch", "branch-delete 시에도 task branch는 남긴다")
  .option("--dry-run", "--confirm이 있어도 실제 git 명령은 실행하지 않고 출력만")
  .option("--cwd <path>", "다른 디렉터리에서 실행")
  .action(
    async (
      taskId: string,
      options: {
        confirm?: boolean;
        confirmDestructive?: boolean;
        strategy?: "branch-delete" | "reset-base" | "revert-merge";
        keepBranch?: boolean;
        dryRun?: boolean;
        cwd?: string;
      },
    ) => {
      await taskRollbackCommand(taskId, options);
    },
  );

task
  .command("pull")
  .description(
    "Notion Tasks DB → docs/tasks/*.md skeleton 생성 (기본 Status=Planned, MVP 4)",
  )
  .option("--dry-run", "파일/Notion 변경 없이 계획만 출력")
  .option("--json", "기계 가독 JSON 으로 출력")
  .option(
    "--status <name>",
    "가져올 Notion Status (콤마 구분 가능: 'Planned,Ready'). 기본 Planned",
  )
  .option("--limit <number>", "Notion에서 가져올 최대 row 개수 (기본 20, 최대 100)")
  .option("--cwd <path>", "다른 디렉터리에서 실행")
  .option(
    "--verbose",
    "considered 행마다 결정 trace (taskId / pageId / docsPath / 선택 사유) 출력",
  )
  .action(
    async (options: {
      dryRun?: boolean;
      json?: boolean;
      status?: string;
      limit?: string;
      cwd?: string;
      verbose?: boolean;
    }) => {
      await taskPullCommand(options);
    },
  );

const notion = program.command("notion").description("Notion 대시보드 동기화 (MVP 4)");

notion
  .command("init")
  .description(
    "대화형: 방향키 + Enter 로 Yes/No 선택 후 .vibeops.json notion 섹션 / .vibeops.env / .vibeops.env.example 정합 (TASK-010)",
  )
  .option("--dry-run", "파일 변경 없이 계획만 출력 (대화형 질문 없음)")
  .option("--enable", "notion.enabled = true 로 설정 (대화형 첫 질문 건너뜀)")
  .option("--projects-db <id>", "notion.projectsDatabaseId 설정 (대화형 입력 건너뜀)")
  .option("--tasks-db <id>", "notion.tasksDatabaseId 설정 (대화형 입력 건너뜀)")
  .option("--non-interactive", "TTY 환경에서도 대화형 질문 없이 flag 값 / 기본값만 사용 (CI 용)")
  .option("--cwd <path>", "다른 디렉터리에서 실행")
  .action(
    async (options: {
      dryRun?: boolean;
      enable?: boolean;
      projectsDb?: string;
      tasksDb?: string;
      nonInteractive?: boolean;
      cwd?: string;
    }) => {
      await notionInitCommand(options);
    },
  );

notion
  .command("test")
  .description("Notion API 인증 + Projects/Tasks DB 접근 + 필수 속성 스키마 검증 (read-only, TASK-010)")
  .option("--json", "기계 가독 JSON 으로 출력")
  .option(
    "--debug-shape",
    "Projects/Tasks DB retrieve 응답의 token-safe shape 진단(top-level keys / data_sources 등) 추가 출력",
  )
  .option("--cwd <path>", "다른 디렉터리에서 실행")
  .action(
    async (options: { json?: boolean; debugShape?: boolean; cwd?: string }) => {
      await notionTestCommand(options);
    },
  );

notion
  .command("sync")
  .description(
    "docs/project · docs/tasks → Notion Projects/Tasks DB 메타 푸시 (read-only on local files, MVP 4)",
  )
  .option("--dry-run", "Notion API mutation 없이 plan 만 출력 (query 만 수행)")
  .option("--json", "기계 가독 JSON 으로 출력")
  .option("--only-tasks", "Tasks DB 만 sync (Project row 건드리지 않음)")
  .option("--only-project", "Project DB 만 sync (TASK row 건드리지 않음)")
  .option("--cwd <path>", "다른 디렉터리에서 실행")
  .action(
    async (options: {
      dryRun?: boolean;
      json?: boolean;
      onlyTasks?: boolean;
      onlyProject?: boolean;
      cwd?: string;
    }) => {
      await notionSyncCommand(options);
    },
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("[vibeops] error:", err);
  process.exitCode = 1;
});
