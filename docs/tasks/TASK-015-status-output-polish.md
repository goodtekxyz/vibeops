# TASK-015 · Status output polish

## Status

Review

## MVP Phase

후속 (post-MVP 4)

## Goal

`vibeops status` 출력을 최신 VibeOps 구조에 맞게 정리한다. Notion 섹션의 legacy 환경변수 이름(`NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB`)을 기본 출력에서 제거하고, GitHub · Package 섹션을 로컬 파일만 보고 추가한다. Git 섹션의 unborn / detached 구분(TASK-014)은 그대로 유지한다.

## Background

현재 `vibeops status` 의 Notion 섹션은 TASK-002 시절 작성된 `readNotionEnvSnapshot` 을 그대로 노출한다. 최신 구조에서는 비밀값은 `.vibeops.env` 또는 `process.env` 의 `NOTION_TOKEN` 만 사용하고, 일반 설정은 `.vibeops.json` 의 `notion.projectsTargetId` / `notion.tasksTargetId` 에 저장된다. legacy 키들은 README · 새 문서 · 새 `init` 흐름에서 모두 빠졌는데 status 에만 남아 사용자에게 잘못된 정보를 준다.

GitHub 연동(TASK-013)이 들어왔지만 `vibeops status` 에는 그 결과를 표시하지 않아서 사용자가 `vibeops github status` 를 따로 돌려야 한다. Package(npm) 상태(`name` / `version` / `bin`)도 어디에도 표시되지 않는다.

## Scope

- `vibeops status` Notion 섹션 재설계:
  - `enabled` · `token` · `projects target` · `tasks target` · `hint` 다섯 줄만 표시.
  - `token` 은 `configured (.vibeops.env)` / `configured (process.env)` / `missing` 셋 중 하나.
  - legacy 키(`NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB`)는 기본 출력에서 제거.
  - `NOTION_TOKEN` 원문은 절대 출력하지 않는다.
- `vibeops status` 에 GitHub 섹션 추가:
  - `.vibeops.json` 의 `github` 만 읽는다. `gh` CLI 호출 금지.
  - enabled / mode / owner/repo / remote / url 표시. 미설정 시 `hint run \`vibeops github init\``.
- `vibeops status` 에 Package 섹션 추가:
  - `package.json` 만 읽는다. 없으면 `package.json missing` 한 줄.
  - 있을 때 `name` · `version` · `bin` 표시.
- Git 섹션(TASK-014 의 unborn 처리)은 그대로 유지.
- `vibeops status --json` 출력에 동등한 필드(`notion.tokenSource`, `github.*`, `package.*`)를 추가하되 기존 키와 충돌하지 않도록 한다.
- collector / formatter / config types / notion-env helper 정리.
- README 의 status 관련 설명 갱신.

## Out of Scope

- `notion test` / `notion sync` / `github status` / `github init` 본체 동작 변경.
- `.vibeops.env.example` · `installer.ts` 에 남아 있는 legacy 키 정리 (별도 follow-up).
- Notion API 호출, `gh auth` 확인 같은 네트워크/외부 명령 호출.
- 색상/테마 전반 리디자인.

## Acceptance Criteria

- `node dist/cli.js status` 가 Notion 섹션에서 `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` 글자를 더 이상 출력하지 않는다.
- `.vibeops.env` 에 `NOTION_TOKEN=...` 이 있을 때 Notion 토큰 줄이 `configured (.vibeops.env)` 로 표시되고, 토큰 원문은 출력되지 않는다.
- `.vibeops.env` 가 없고 `process.env.NOTION_TOKEN` 만 있을 때는 `configured (process.env)` 로 표시된다.
- `.vibeops.json` 에 `github.enabled = true` + owner/repo 가 있으면 GitHub 섹션이 enabled `yes` 와 함께 owner/repo · url 을 한 화면에 보여 준다.
- GitHub 설정이 없으면 `GitHub\n  enabled  no\n  hint     run \`vibeops github init\`` 형태로 한 블록으로 표시된다.
- `package.json` 이 있는 디렉터리에서 Package 섹션이 name/version/bin 을 표시한다. 없는 디렉터리에서는 `package.json missing` 한 줄만 표시되고 명령은 정상 종료한다.
- Git 섹션은 TASK-014 동작을 유지한다 (`normal` / `unborn` / `detached`).
- `node dist/cli.js status --json` 결과의 `notion` 객체에 `enabled` / `hasToken` / `tokenSource` / `hasProjectsTarget` / `hasTasksTarget` 가 모두 존재한다.
- `node dist/cli.js status --json` 결과에 `github` · `package` 객체가 추가된다.
- `vibeops status` 는 `gh` 자식 프로세스 호출 0건, Notion API 호출 0건이다.
- `pnpm typecheck` · `pnpm build` · `pnpm smoke` 모두 통과.

## Files to Inspect First

- `src/status/collector.ts`
- `src/status/format.ts`
- `src/lib/notion-env.ts`
- `src/lib/config.ts`
- `src/lib/package-json.ts`
- `src/types/config.ts`
- `README.md` (status 출력 예시)

## Expected Files to Change

- `src/status/collector.ts`
- `src/status/format.ts`
- `src/lib/config.ts` (legacy `readNotionEnvSnapshot` 제거 또는 deprecated)
- `src/lib/notion-env.ts` (token source helper)
- `src/types/config.ts` (`NotionStatusSnapshot` 등 신규 타입)
- `README.md`
- `docs/project/03-current-state.md`
- `docs/logs/2026-05-12.md`
- `docs/tasks/TASK-015-status-output-polish.md` (이 파일)

## Risks

- `package.json` 없는 디렉터리에서 status 가 깨질 위험 → `readPackageJson` 이 이미 `null` 반환을 처리하므로 collector 에서 safe-fallback.
- legacy `NotionEnvSnapshot` 타입을 제거하면 향후 외부 호출자가 깨질 수 있음 → `src/` 외부에서 import 한 곳은 없으므로 안전.
- `.vibeops.env` 가 있어도 `NOTION_TOKEN` 라인만 빠지는 경우가 있음 → `loadNotionEnv` 의 fallback chain 그대로 사용해 일관성 유지.
- JSON 스키마 변경이 외부 자동화에 영향을 줄 수 있음 → 기존 필드는 유지하고 새 필드만 추가.

## Test Plan

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke`
- `node dist/cli.js status` (현재 vibeops 저장소: Notion enabled=no, GitHub enabled=yes, Package=vibeops)
- 새 임시 폴더에서 `node dist/cli.js init --git --initial-commit` 후 `node dist/cli.js status` → Notion 섹션에 legacy 키가 없음 확인
- `package.json` 없는 임시 폴더에서 `node dist/cli.js status` → `Package\n  package.json missing` 확인 및 정상 종료
- `node dist/cli.js status --json` 출력에서 `notion.tokenSource`, `github`, `package` 필드 확인

## Rollback Plan

`src/status/{collector,format}.ts`, `src/lib/notion-env.ts`, `src/lib/config.ts`, `src/types/config.ts`, `README.md`, 문서 갱신을 되돌린다 — 모두 read-only 출력 변경이라 Git revert 만으로 완전 복원.

## Git Context

- Branch: 별도 브랜치 분리하지 않고 main 에서 진행 (TASK-014 와 동일 정책)
- Touched paths: `src/status/`, `src/lib/notion-env.ts`, `src/lib/config.ts`, `src/types/config.ts`, `README.md`, `docs/`

## Notion Page

미연동.

## Implementation Plan

1. `src/types/config.ts` 에 `NotionStatusSnapshot` · `GithubStatusSnapshot` · `PackageStatusSnapshot` 타입 추가. `NotionEnvSnapshot` 은 deprecated 표시 또는 제거.
2. `src/lib/notion-env.ts` 에 `getNotionTokenSource(cwd): Promise<{ hasToken, source }>` 추가 — `loadNotionEnv` 를 재사용하되 토큰 원문은 호출자에 노출하지 않는다.
3. `src/lib/config.ts` 의 `readNotionEnvSnapshot` 호출처를 collector 에서 제거. 함수 자체도 제거(외부 미사용).
4. `src/status/collector.ts` 를 재작성해 `notion` / `github` / `package` snapshot 을 채운다.
5. `src/status/format.ts` 의 `printHuman` · `toJson` 을 재작성해 새 섹션을 출력한다.
6. `README.md` 의 상태/Status 관련 문구를 새 섹션 예시로 업데이트.
7. `docs/project/03-current-state.md` · `docs/logs/2026-05-12.md` · 본 TASK 파일에 결과 기록.

## Result

- `src/types/config.ts` 에 `NotionStatusSnapshot` / `NotionTokenSource` / `GithubStatusSnapshot` / `PackageStatusSnapshot` 타입 추가. 기존 `NotionEnvSnapshot` 은 status 가 더 이상 참조하지 않으므로 제거.
- `src/lib/notion-env.ts` 에 token-safe `getNotionTokenSource(cwd)` 추가. 기존 `loadNotionEnv` 를 재사용해 `.vibeops.env` → `process.env` 우선순위 유지. 토큰 원문은 호출자에게 반환하지 않고 `{ hasToken, source }` 만 반환.
- `src/lib/config.ts` 에서 legacy `readNotionEnvSnapshot` / `NotionEnvSnapshot` import 제거 (외부 미사용 확인 후 deletion).
- `src/status/collector.ts` 재작성: `snapshotNotion` / `snapshotGithub` / `snapshotPackage` 로 분리. Notion 은 `loadNotionEnv` + `notion.{projectsTargetId,projectsDatabaseId}` / `notion.{tasksTargetId,tasksDatabaseId}` 를 OR 로 묶어 target 존재 여부 판단. GitHub 는 `.vibeops.json` `github` 섹션만 읽음. Package 는 `readPackageJson(cwd)` 의 `null` 반환을 그대로 `exists: false` 로 매핑. `bin` 은 string / object / 미설정 세 경우 처리 (`basename` + 확장자 제거 → object 첫 키 → "").
- `src/status/format.ts` 재작성: `printHuman` 의 Notion / GitHub / Package 섹션을 새 5/6/3 줄 형태로 출력. label width 정렬(`pad`), `tokenLine` / `targetLine` / `notionHint` 헬퍼 분리. `tokenSource` 값을 `configured (.vibeops.env)` / `configured (process.env)` 로 표시하지만 토큰 원문은 절대 출력하지 않음. legacy 키(NOTION_API_KEY/PROJECT_DB/TASK_DB) 출력 0건. GitHub 미설정 시 `enabled no` + `hint run \`vibeops github init\`` 두 줄로 축약. Package 가 없으면 `Package\n  package.json missing` 두 줄로 축약. JSON 출력에 `notion.{enabled, hasToken, tokenSource, hasProjectsTarget, hasTasksTarget}` / `github.*` / `package.*` 모두 포함.
- `README.md` 의 "Init Git Bootstrap" 직후에 새 "Status Output" 섹션 추가 — 풀 출력 예시 + 미설정 케이스 + BYOBrowser 케이스 + JSON 노출 키 안내. legacy env 키가 더 이상 출력되지 않는다는 정책을 명시.

## Test Result

- `pnpm typecheck` ✓
- `pnpm build` ✓
- `pnpm smoke` ✓ (8 cases pass — `--help`, `init --dry-run`, `init --dry-run --git --initial-commit`, `status`, `task generate --dry-run`, `notion init --dry-run`, `github status`, `github init --dry-run --connect goodtek/vibeops`)
- `node dist/cli.js status` (현재 vibeops 저장소): Notion enabled=no / token configured (.vibeops.env) / projects+tasks target missing / hint `vibeops notion init`. GitHub enabled=yes / mode gh-cli / owner/repo goodtekxyz/vibeops / remote origin / url. Package name vibeops / version 0.1.0 / bin vibeops. legacy 키 노출 0건.
- `node dist/cli.js status --json`: `notion.tokenSource = ".vibeops.env"` / `hasToken true` / `hasProjectsTarget false` / `hasTasksTarget false`. `github` 객체에 enabled / mode / owner / repo / remote / url 모두 포함. `package.exists true` + name/version/bin.
- `/tmp/vibeops-task015-sandbox` 에서 `init --git --initial-commit` 후 `status` → Git `branch main / status clean`, Notion `enabled no / token missing / projects+tasks target missing`, GitHub `enabled no / hint`, Package `package.json missing`. 모든 섹션 정상 + legacy 키 0건.
- `/tmp/vibeops-task015-unborn` 에서 `init --git --no-initial-commit` 후 `status` → Git `branch main (unborn, no commits yet) / status dirty / hint create the first commit ...` 유지. JSON 도 `git.state="unborn"` / `git.hasCommits=false`.
- `NOTION_TOKEN=secret_test_value node dist/cli.js status` → token line `configured (process.env)` 로 전환됨. 토큰 원문 출력 0건. 
- `src/status/` 내부 `github-cli` / `notion-client` import 검색 → 0건. status 가 외부 명령/네트워크를 호출하지 않음을 정적 확인.

## Review Notes

- legacy `NotionEnvSnapshot` 타입과 `readNotionEnvSnapshot` 함수는 외부에서 import 하지 않음을 grep 으로 확인 후 제거. 새 외부 자동화가 이 export 에 의존했을 가능성은 낮음.
- `package.json` 의 `bin` 이 객체 형태일 때 첫 키만 표시 — VibeOps 자기 자신처럼 단일 bin 만 가정. 다중 bin 프로젝트에서는 향후 보강 필요.
- `.vibeops.env.example` / `installer.ts` 에 남아 있는 legacy `NOTION_API_KEY=` 라인은 status 출력과 분리되어 있고 본 TASK 범위 밖. 별도 follow-up 으로 정리하면 됨.
- Notion enabled 여부는 `.vibeops.json` `notion.enabled` 만 본다 — 토큰이 있어도 사용자가 setup 을 끝내지 않으면 `no` 로 표기되어 UX 가 일관됨.
