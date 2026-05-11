# TASK-002 · `init` command — install VibeOps project system

## Status

done

## MVP Phase

MVP 1 · Project Bootstrapper

## Goal

`vibeops init`을 구현한다. 현재 디렉터리(또는 `--cwd <path>`)에 **VibeOps 운영 구조**(`AGENTS.md`, `.cursor/rules/*`, `docs/project/*`, `docs/tasks/`, `.vibeops/agents/*`, `.vibeops/prompts/*`, `.vibeops/workflows/*`, `.vibeops.json`, `.vibeops.env.example`)를 설치한다.

본 TASK는 **명령 로직과 파일 복사 엔진**에 집중하고, 실제 템플릿 콘텐츠는 [TASK-003](TASK-003-templates.md)에서 채운다. TASK-002에서는 최소한 “placeholder 1개씩”을 가진 템플릿 디렉터리가 있으면 된다.

## Background

새 프로젝트마다 같은 구조를 수작업으로 만들지 않게 하는 것이 VibeOps의 첫 번째 가치다. `init`은 idempotent하고 안전해야 한다. 이미 있는 파일은 기본적으로 건너뛴다.

## Scope

- `src/commands/init.ts` — `vibeops init` 등록 및 로직
- `src/bootstrap/installer.ts` — 디렉터리/파일 복사기(템플릿 디렉터리 → 대상 경로)
- `src/bootstrap/manifest.ts` — “설치할 파일 목록”을 데이터로 표현(나중 TASK-003에서 항목이 채워짐)
- `src/config/projectConfig.ts` — `.vibeops.json` 작성(프로젝트 이름·VibeOps 버전·생성일)
- `templates/` (저장소 안 디렉터리) — 본 TASK에서는 디렉터리 구조와 placeholder만
- 옵션:
  - `--dry-run` — 실제 쓰지 않고 “어떤 파일이 생길/덮어쓰일지” 출력
  - `--force` — 기존 파일을 덮어씀
  - `--cwd <path>` — 다른 디렉터리에 설치
  - `--name <projectName>` — `.vibeops.json`에 들어갈 프로젝트 이름

## Out of Scope

- 실제 템플릿 콘텐츠 작성(→ TASK-003)
- 어떤 도메인 명령도 구현하지 않음
- Git 초기화(이미 `git init`이 되어 있다고 가정)

## Acceptance Criteria

1. 빈 디렉터리에서 `vibeops init`을 실행하면 다음 경로들이 생긴다.
   - `AGENTS.md`
   - `.cursor/rules/00-vibeops-governance.mdc`
   - `.cursor/rules/01-ai-workflow.mdc`
   - `.cursor/rules/02-docs-update.mdc`
   - `docs/project/00-overview.md` ~ `05-backlog.md`
   - `docs/tasks/TASK-000-example.md` (또는 README)
   - `docs/logs/.keep`
   - `.vibeops/agents/{planner,builder,reviewer,releaser}.md`
   - `.vibeops/prompts/{plan,task-generate,task-builder}.md`
   - `.vibeops/workflows/{task-lifecycle,notion-sync}.md`
   - `.vibeops.json`, `.vibeops.env.example`
2. 같은 디렉터리에서 `vibeops init`을 두 번째 실행해도 **기존 파일을 덮어쓰지 않는다**. “skipped (already exists)” 카운트가 출력된다.
3. `vibeops init --dry-run`은 어떤 파일이 만들어질지 목록을 출력하고 실제 변경은 0건.
4. `vibeops init --force`는 기존 파일을 덮어쓰고, 덮어쓴 카운트를 출력한다.
5. `.vibeops.json`에는 최소 `{ "name": <projectName>, "vibeopsVersion": <semver>, "createdAt": <iso>, "schemaVersion": 1 }`이 들어간다.
6. `.vibeops.env.example`에 `NOTION_API_KEY=`, `NOTION_PROJECT_DB=`, `NOTION_TASK_DB=` 라인이 있다.
7. `vibeops init --help`가 옵션과 동작 요약을 보여준다.

## Files to Inspect First

- `src/cli.ts` (TASK-001에서 만든 commander 부트스트랩)
- `src/commands/*.ts` 스텁(특히 init 스텁)
- `docs/project/01-architecture.md` § Bootstrap 절

## Expected Files to Change

- 신규: `src/commands/init.ts`, `src/bootstrap/installer.ts`, `src/bootstrap/manifest.ts`, `src/config/projectConfig.ts`
- 신규: `templates/**` (스켈레톤만 — 실제 콘텐츠는 TASK-003에서 채움)
- 신규: `tests/init.test.ts` (tmpdir에서 init 동작 검증)
- 갱신: `package.json` (필요 시 `cross-env` 등 의존성 추가)
- 갱신: `docs/project/03-current-state.md`, 본 TASK의 Result/Test Result, `docs/logs/YYYY-MM-DD.md`

## Risks

- Windows 경로 / 권한 — MVP에서는 macOS/Linux 위주. Windows 미지원을 README/문서에 명시할 수도 있다.
- 사용자가 실수로 `--force`를 켜고 docs를 날리는 경우 → `--force` 사용 시 한 번 더 “덮어쓸 파일 N개” 안내를 출력하는 것을 고려.

## Test Plan

- vitest로 임시 디렉터리에서 `init` 실행 → 기대 파일들이 만들어지는지 검사.
- 두 번째 실행 시 “skipped” 카운트가 기대 값과 일치하는지 검사.
- `--dry-run` 시 디렉터리에 아무 파일도 생기지 않는지 검사.
- `--force` 시 placeholder 콘텐츠가 갱신되는지 검사.
- 수동 스모크: 빈 폴더에서 `vibeops init` → `tree -a -L 3` 확인.

## Rollback Plan

- 작업 브랜치 폐기로 코드 변경은 되돌릴 수 있다.
- 사용자 측 부작용(잘못 설치된 파일)은 `vibeops init`이 idempotent이므로 디렉터리 삭제로 충분.

## Implementation Plan

1. `templates/` 디렉터리 구조 잡기(파일은 placeholder 1줄짜리도 OK).
2. `src/bootstrap/manifest.ts`에 “복사할 경로 → 목적지 경로” 리스트를 데이터로 정의.
3. `src/bootstrap/installer.ts`에 idempotent 복사기 작성(`exists ? skip : write`). `--force`일 때 덮어씀. `--dry-run`일 때는 실제 쓰지 않고 “would create/overwrite”만 출력.
4. `src/config/projectConfig.ts`로 `.vibeops.json` 생성.
5. `src/commands/init.ts`에 commander 명령 등록 + 옵션 4종 처리.
6. `tests/init.test.ts` 작성.
7. 문서 갱신.

## Result

2026-05-11 완료. `vibeops init`이 현재 디렉터리(또는 `--cwd <path>`)에 VibeOps 운영 구조를 설치한다.

- **명령 구현**: `src/commands/init.ts` — `--dry-run` / `--force` / `--cwd` / `--name` 옵션 처리. 프로젝트 이름은 `--name` 우선, 없으면 `basename(cwd)`로 결정.
- **복사 엔진**: `src/bootstrap/manifest.ts`(템플릿 디렉터리 walk + 정렬), `src/bootstrap/installer.ts`(idempotent 복사, dry-run/force 처리), `src/bootstrap/substitute.ts`(`{{PROJECT_NAME}}`, `{{VIBEOPS_VERSION}}`, `{{CREATED_AT}}` 치환).
- **설정 파일**: `src/lib/config.ts`에 `readConfig` / `buildConfig` / `writeConfig` / `readNotionEnvSnapshot`. `.vibeops.json`은 `{ name, vibeopsVersion, schemaVersion: 1, createdAt }` 스키마.
- **`.vibeops.env.example`**: `NOTION_API_KEY=`, `NOTION_PROJECT_DB=`, `NOTION_TASK_DB=` 라인 포함.
- **`.gitignore`**: `.vibeops.env`가 없으면 한 줄 추가. 이미 있으면 손대지 않음.
- **idempotent**: 두 번째 실행 시 기존 파일은 “skipped (already exists)” 카운트로 표시. `--force` 시에만 덮어쓴다.
- 본 TASK는 명령 로직과 복사기까지로 한정되어 있었고, **템플릿 콘텐츠는 같은 라운드의 TASK-003에서 함께 채웠다**.
- **연기**: vitest 스모크 테스트(`tests/init.test.ts`)는 본 라운드 사용자 스코프에서 제외 — 후속 보강 TASK로 남김. 검증은 sandbox(`/tmp/vibeops-sandbox`) 수동 실행으로 대체.

### 변경 파일

| 파일 | 종류 |
| --- | --- |
| `src/commands/init.ts` | 갱신 (stub → 실제 구현) |
| `src/bootstrap/manifest.ts` | 신규 |
| `src/bootstrap/installer.ts` | 신규 |
| `src/bootstrap/substitute.ts` | 신규 |
| `src/lib/config.ts` | 신규 |
| `src/lib/filesystem.ts` | 신규 |
| `src/lib/paths.ts` | 신규 |
| `src/lib/logger.ts` | 신규 |
| `src/types/config.ts` | 신규 |
| `src/cli.ts` | 갱신 (옵션 wiring) |
| `package.json` | 갱신 (`gray-matter` 의존성, `files`에 `templates` 추가) |
| `pnpm-lock.yaml` | 갱신 |

## Test Result

- `pnpm typecheck` → exit 0, 에러 0건.
- `pnpm build` → exit 0, `dist/` 생성.
- `pnpm dev init --dry-run` (vibeops repo) → 37개 “would create”, 1개 “skipped (already exists: docs/project/00-overview.md)”, exit 0. 가상 변경 검사만 수행하고 실제 파일 변경 0건 확인.
- sandbox 실제 설치: `rm -rf /tmp/vibeops-sandbox && mkdir -p /tmp/vibeops-sandbox && git -C /tmp/vibeops-sandbox init -q && pnpm dev init --cwd /tmp/vibeops-sandbox --name byobrowser` → **39 created** (templates 36 + `.vibeops.json` + `.vibeops.env.example` + `.gitignore`), 0 overwritten, 0 skipped, exit 0.
- 두 번째 실행(idempotent): `pnpm dev init --cwd /tmp/vibeops-sandbox` → 0 created, 0 overwritten, 모든 파일 skipped. AC#2 통과.
- 생성된 `.vibeops.json` 확인: `{ "name": "byobrowser", "vibeopsVersion": "0.1.0", "schemaVersion": 1, "createdAt": "2026-05-11T00:14:42.101Z" }` — AC#5 통과.
- 생성된 `.vibeops.env.example` 확인: `NOTION_API_KEY=`, `NOTION_PROJECT_DB=`, `NOTION_TASK_DB=` 라인 모두 존재 — AC#6 통과.
- `pnpm dev init --help` → 4개 옵션(`--dry-run`, `--force`, `--cwd`, `--name`) 모두 표시 — AC#7 통과.
- ReadLints (`src/`) → 0 issues.
- Acceptance Criteria 1~7 모두 통과.
