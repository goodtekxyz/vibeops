# TASK-008 · Task lifecycle — `start / prompt / check / done`

## Status

Review

## Git Context

- Base Branch: `main`
- Base Commit: `940d255`
- Task Branch: `task/008-task-lifecycle`
- Started At: `2026-05-11T01:18:00Z`

## MVP Phase

MVP 3 · Git Task Lifecycle

## Goal

한 TASK의 **시작부터 완료**까지를 명령으로 표현한다.

- `vibeops task start TASK-NNN` — base branch / base commit / task branch 기록 + task branch 생성
- `vibeops task prompt TASK-NNN --agent <name>` — 에이전트 + TASK + docs 컨텍스트로 Cursor 붙여넣기 프롬프트 출력
- `vibeops task check TASK-NNN` — Acceptance Criteria/Test Plan과 Git 상태를 비교해 통과/미달 항목 보고
- `vibeops task done TASK-NNN` — TASK 파일의 Status/ Result / Test Result 검증 + 머지 가이드(자동 머지 X)

`rollback`은 안전장치 분리를 위해 [TASK-009](TASK-009-rollback-safety.md)로 뺀다.

## Background

VibeOps의 “레일” 본체. 사람도 AI도 TASK의 진행 상태를 동일한 명령으로 확인하고 갱신한다. 모든 명령은 가능한 한 read-only가 기본이고, 상태 변경은 명시적이어야 한다.

## Scope

### state 파일

`.vibeops/state/tasks/TASK-NNN.json` 스키마:

```jsonc
{
  "id": "TASK-NNN",
  "slug": "...",
  "baseBranch": "main",
  "baseCommit": "abc1234",
  "taskBranch": "task/TASK-NNN-slug",
  "startedAt": "2026-05-11T...",
  "doneAt": null
}
```

### 명령별 동작

- `start`
  - 현재 Git 상태가 clean인지 확인(dirty면 거부, `--allow-dirty`로 우회 가능)
  - `baseBranch`/`baseCommit` 기록, `task/TASK-NNN-<slug>` 브랜치 생성·체크아웃
  - TASK 파일의 frontmatter `Status`를 `in_progress`로(있다면)
  - `--dry-run`: 위 동작들을 “계획”으로만 출력
- `prompt`
  - `vibeops agent prompt <name>`의 결과에 더해 TASK 파일 전체와 `docs/project/03-current-state.md`, 관련 `04-decisions.md` 항목을 컨텍스트로 묶어 출력
- `check`
  - TASK 파일에서 Acceptance Criteria와 Test Plan 항목 추출
  - 현재 브랜치/변경 파일 수/마지막 커밋 메시지/“Expected Files to Change” 매칭 정도를 보고
  - 누락 항목을 체크리스트로 표시(통과 자동 판정은 하지 않음)
- `done`
  - TASK 파일의 `Status`가 `done`이고 `Result`/`Test Result` 본문이 비어 있지 않은지 검증
  - `.vibeops/state/tasks/TASK-NNN.json`에 `doneAt` 기록
  - `git log baseCommit..HEAD` 요약과 함께 “머지 가이드” 출력(예: `git switch main && git merge task/...`)
  - **자동 머지/푸시는 절대 하지 않는다**

### 옵션

- 모든 명령에 `--cwd`, `--json`(기계 가독)
- `start --allow-dirty`, `start --dry-run`
- `prompt --context <path>...`
- `check --strict` (누락 항목 있으면 exit code ≠ 0)
- `done --dry-run`

## Out of Scope

- 파괴적 rollback(→ TASK-009)
- Notion 측 상태 변경(→ TASK-011)
- 여러 TASK 동시 진행

## Acceptance Criteria

1. `vibeops task start TASK-001`이 clean한 저장소에서 `task/TASK-001-cli-bootstrap` 브랜치를 만들고 상태 파일을 기록한다. dirty 저장소에서는 거부한다.
2. `vibeops task prompt TASK-001 --agent builder`가 “에이전트 정의 + TASK 본문 + project 컨텍스트”를 합친 단일 마크다운을 출력한다.
3. `vibeops task check TASK-001`이 Acceptance Criteria/Test Plan 항목을 체크리스트로 표시하고, 현재 변경 파일이 “Expected Files to Change”와 얼마나 일치하는지 % 또는 매칭 표를 보여준다.
4. `vibeops task done TASK-001`이 TASK 파일의 Status/Result/Test Result를 검증한다. 비어 있으면 “fill Result/Test Result first” 안내와 exit code 1.
5. `done` 성공 시 상태 파일에 `doneAt`이 기록되고 머지 가이드가 출력되지만 **자동 머지/푸시 0건**.
6. 모든 명령에 `--dry-run`(또는 read-only 본성) 동작이 있고 그 옵션에서 파일·Git 변경이 0건.

## Files to Inspect First

- `src/agent/*` (TASK-005)
- `src/tasks/scanner.ts`, `src/tasks/schema.ts` (TASK-004)
- `src/config/projectConfig.ts`

## Expected Files to Change

- 신규: `src/commands/task/{start,prompt,check,done}.ts`
- 신규: `src/lifecycle/state.ts` (state 파일 read/write)
- 신규: `src/lifecycle/git.ts` (branch / commit / dirty 검사)
- 신규: `src/lifecycle/check.ts` (Acceptance Criteria vs Git)
- 신규: `tests/lifecycle.test.ts` (가짜 Git repo 또는 stub)
- 갱신: `src/commands/agent.ts` (`prompt` 빌더 공유)
- 갱신: 본 TASK Result/Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`

## Risks

- 테스트에서 실제 git 명령을 돌리면 환경에 의존. → `simple-git` 사용 + tmpdir에 실제 작은 repo를 만들어 테스트. CI 환경에서 git이 있는지는 가정한다.
- TASK 파일 frontmatter를 명령이 갱신할 때 사용자의 손글씨가 깨질 수 있음 → `gray-matter`로 frontmatter 영역만 안전 갱신.

## Test Plan

- vitest로 tmpdir에 작은 git repo + 가짜 `docs/tasks/TASK-001-*.md` fixture를 만들어:
  - clean에서 `start` 성공, dirty에서 `start` 실패
  - `prompt` 출력이 에이전트·TASK·project 컨텍스트를 포함
  - `check` 출력이 체크리스트 형태
  - `done`이 Result 비어 있을 때 실패, 채워 넣은 후 성공
- 수동: 본 저장소에서 `vibeops task start TASK-001 --dry-run` 등 스모크.

## Rollback Plan

- 브랜치 폐기로 코드 변경은 되돌릴 수 있다.
- 사용자 측: 만든 task branch가 마음에 안 들면 `git switch <base> && git branch -D task/...`로 직접 처리(또는 TASK-009의 `task rollback`).

## Implementation Plan

1. `lifecycle/state.ts`로 state 파일 read/write.
2. `lifecycle/git.ts`로 branch / dirty / log / show.
3. `lifecycle/check.ts`로 Acceptance Criteria/Test Plan 추출 및 Git 상태와 매칭.
4. `commands/task/start.ts` ~ `done.ts` 구현.
5. `agent/prompt.ts` 빌더 재사용해 `prompt` 출력.
6. tests + 문서 갱신.

## Result

2026-05-11 완료(Review 대기). MVP 3 Git Task Lifecycle의 4개 명령(`task start / prompt / check / done`)을 구현했다. 사용자의 갱신된 요구 사항 — Status 흐름이 **Planned → In Progress → Review → Done**, Git 상태를 별도 JSON 대신 TASK markdown의 **`## Git Context`** 섹션에 inline 기록, `task done`은 기본적으로 `Done`이 아니라 `Review`로 전이 — 을 그대로 반영했다.

### 추가/확장된 파일

- 신규: `src/lib/task-prompt.ts` — agent 정의 + TASK + project 컨텍스트로 Cursor 붙여넣기 프롬프트 문자열을 만드는 헬퍼(`buildTaskPromptString`). `task start`와 `task check`가 공유.
- 확장: `src/types/task.ts` — `TaskStatus`에 `"review"` 추가, `TaskCounts.review` 추가, `GitContext` 인터페이스 추가.
- 확장: `src/lib/task.ts` — `findTaskFile`, `parseTaskFilename` / `branchNameForTaskFile`, 섹션 헬퍼(`readSection` / `hasNonEmptySection` / `findExpectedFiles` / `findAcceptanceCriteria`), inline 갱신 헬퍼(`updateInlineStatus` / `upsertGitContext` / `readGitContext`). 상태별 화면 표기는 `statusDisplay`.
- 확장: `src/lib/git.ts` — `runGit`, `gitHeadCommit`, `gitBranchExists`, `gitCreateBranch`, `gitCheckout`, `gitCheckoutNewBranch`, `gitDeleteBranch`, `gitResetHard`, `gitDiffNameOnly`, `gitLogOneline`, `gitCommitsAhead`, `detectDefaultBranch`. 기존 `readGitInfo`는 유지. **2026-05-11 후속 패치**: `gitStatusPorcelain` + porcelain 파서(`?? / R  old -> new` 인지) + 6개 read-only 헬퍼(`gitWorkingTreeChangedFiles`, `gitStagedChangedFiles`, `gitUntrackedFiles`, `gitCommittedChangedFilesSince`, `gitAllChangedFilesSinceTaskStart`(`ChangedFilesSummary` 반환))를 추가. 합산 helper에서 `Set`으로 중복 제거.
- 신규: `src/commands/task-start.ts` — clean 검사(`--allow-dirty`로 우회) → base branch/HEAD 기록 → `task/<slug>` 브랜치 생성 + 체크아웃 → TASK markdown의 `## Status` / `## Git Context` 갱신 → Builder agent 프롬프트 출력. `--dry-run` 모드는 파일·Git 변경 0건.
- 신규: `src/commands/task-check.ts` — read-only. 현재 브랜치 / dirty / Git Context / Expected Files vs 실제 변경 매칭 % / Acceptance Criteria 체크리스트 / `docs/project/0[35]-current-state.md` 와 오늘 `docs/logs/YYYY-MM-DD.md` 존재 확인 / Result·Test Result placeholder 검사 + Reviewer agent 프롬프트. `--strict`이면 누락 항목 발견 시 exit 1.
  - **2026-05-11 후속 패치**: 변경 파일 감지가 `baseCommit..HEAD` 커밋 diff만 보던 버그를 수정. 이제 working tree(unstaged + staged + untracked) ∪ committed 를 Set-dedup으로 합산해서 `working tree changed files / committed changed files / total changed files` 3줄로 분해 표시. `Expected Files to Change` 매칭은 `total`(합산본) 기준. `git status --porcelain`을 직접 파싱해 rename(`R  old -> new` → `new`)과 untracked(`??`)를 모두 잡는다.
- 신규: `src/commands/task-done.ts` — Result/Test Result placeholder 검사(`Failed`면 exit 1) → 기본은 `Status → Review`(`--finalize`로 `Done`) → 추천 커밋 메시지 + 머지 가이드 출력 → 다음 TASK 후보 제시 + Notion 동기화 TODO 안내. 자동 git commit/머지/푸시 0건.
- 신규: `src/commands/task-rollback.ts` (실제 구현; 자세한 내용은 TASK-009 참조).
- 갱신: `src/cli.ts` — start/check/done/rollback 옵션 전체 노출(`--dry-run`, `--allow-dirty`, `--agent`, `--strict`, `--finalize`, `--confirm`, `--confirm-destructive`, `--strategy`, `--keep-branch`, `--cwd`).
- 갱신: `src/status/format.ts` — `vibeops status` Tasks 라인이 `review` 카운트도 표시.

### 사용자 요구사항 vs 원 TASK-008 문서

- 원 문서: `.vibeops/state/tasks/TASK-NNN.json`에 baseBranch/baseCommit/taskBranch 기록.  
  실제 구현: 같은 정보를 **TASK markdown의 `## Git Context` 섹션**에 inline 기록(사용자 갱신 요구). state JSON은 만들지 않는다.
- 원 문서: Status가 `done`이고 Result/Test Result가 비어 있지 않으면 `doneAt` 기록.  
  실제 구현: Status 흐름이 `Planned → In Progress → Review → Done` (사용자 갱신). `task done` 기본은 `Review`로 두고, 사람이 검토 후 `--finalize`로 `Done`까지 보낸다. `doneAt` 필드는 `GitContext` 타입에 정의해 두었으나 본 TASK에서는 자동 기록하지 않음(향후 Notion 동기화 시 활용).
- 원 문서: `Acceptance Criteria` 매칭은 “% 또는 매칭 표”.  
  실제 구현: `Expected Files to Change` ↔ `git diff --name-only baseCommit..HEAD`를 표 + % 모두 출력. AC 항목 자체는 통과 자동 판정 없이 체크리스트로 나열(사람 확인 위임).

### 안전장치 (사용자 강조 사항)

- `task start`: dirty면 거부(`--allow-dirty`로 우회). 기존 task branch가 있으면 거부.
- `task done`: Result/Test Result placeholder면 exit 1, 파일/Git 변경 0건. 자동 commit 없음. Notion 호출 없음.
- `task check`: read-only. 어떤 옵션에서도 파일·Git 변경 0건.
- `task start`, `task done`, `task rollback`은 모두 `--dry-run` 또는 read-only 본성을 지원.

## Test Result

- `pnpm typecheck` → tsc --noEmit 에러 0건, exit 0.
- `pnpm build` → `dist/cli.js` / `dist/commands/task-*.js` / `dist/lib/task.js` 등 38개 산출, exit 0.
- `pnpm exec tsx src/cli.ts task --help` → start / prompt / check / done / rollback 모두 옵션 포함해 노출.
- 실제 git sandbox(`/var/folders/.../vibeops-mvp3-XXXX/`)에 `vibeops init` 후 TASK-001 fixture를 넣고 다음 시퀀스 검증:
  1. `task start TASK-001 --dry-run` → branch 생성 없음, Status `done` 유지(파일 비변경), 계획 출력만.
  2. `task start TASK-001` → `task/001-cli-bootstrap` 브랜치 체크아웃, Status `In Progress`, `## Git Context` 섹션 정상 기록(`Base Branch: main`, `Base Commit: c217fbd`, `Task Branch: task/001-cli-bootstrap`, `Started At: 2026-05-11T01:27:56.869Z`), Builder agent 프롬프트가 stdout에 출력.
  3. `task prompt TASK-001 --agent builder` / `--agent reviewer` → 각 agent 정의 + TASK 본문이 합쳐진 단일 마크다운 출력.
  4. `task check TASK-001` → branch / dirty / Git Context / commits ahead / changed files / Expected Files 매칭(5개 중 0개) / AC 5개 체크리스트 / Docs 5개 확인 / Result·Test Result `✓` 표시 / Reviewer agent 프롬프트 출력. exit 0.
  5. `task done TASK-001 --dry-run` → Status 변경 없음, “would perform” 안내만.
  6. `task done TASK-001` → Status `Review`로 전이, 추천 커밋(`feat(task-001): CLI bootstrap`) + 머지 가이드 + 다음 TASK 후보(TASK-000) + Notion TODO 출력.
  7. `task done TASK-001 --finalize` → Status `Done`.
  8. placeholder Result만 가진 `TASK-099-fake.md`로 `task done TASK-099` → “2 required section(s) still empty” + exit 1.
- 라이브 저장소에서 read-only 확인: `node dist/cli.js task check TASK-008 --cwd /Users/hjhamm/goodtek/vibeops` → Status `Planned`, Git Context 누락 안내, AC 6개 체크리스트, Result/Test Result placeholder 감지, 누락 3건 안내, Reviewer agent 미설치 안내. 파일·Git 변경 0건.
- **2026-05-11 후속 패치 검증** — changed-files 감지 버그 수정:
  - 라이브 저장소(`git status --porcelain` 기준 13 modified + 17 untracked = 30 변경 파일, 0 staged, 0 committed-since-base)에서 `node dist/cli.js task check TASK-008 --cwd /Users/hjhamm/goodtek/vibeops` 실행 결과:
    - `working tree changed files 30`, `committed changed files 0`, `total changed files 30`
    - `Expected Files to Change vs current diff`에서 `docs/project/03-current-state.md`가 `✓`로 정상 매치(이전엔 unstaged라 0% 매칭됐음)
    - `basis: working tree(30) ∪ committed(0) = total(30) files` 출력으로 합산 근거 명시
    - 명령 실행 전/후 `git status --porcelain | wc -l` 둘 다 30 — read-only 보장.
  - 깨끗한 sandbox에서 모든 카테고리를 동시에 만들어(committed `committed-file.ts` 1건 + unstaged `docs/tasks/TASK-001-cli-bootstrap.md` + staged add `staged-file.ts` + staged rename `committed-file.ts -> renamed-file.ts` + untracked `untracked-file.ts`) `task check TASK-001` 실행:
    - 표시: `working tree changed files 4 / committed changed files 2 / total changed files 5`
    - 5 = working set {`docs/...md`, `renamed-file.ts`, `staged-file.ts`, `untracked-file.ts`} ∪ committed set {`docs/...md`, `committed-file.ts`} = 5개 고유 경로(Set-dedup이 중복 `docs/...md` 1건 제거).
    - rename은 새 경로(`renamed-file.ts`)로 잡혔고, untracked(`untracked-file.ts`)도 합산됨.
- 본 라운드에서는 자동 commit · 푸시 · Notion 호출 0건(원칙 준수).
- 보류: vitest 자동 회귀 테스트(TASK-001부터 누적된 deferred 항목; TASK-012 polish 라운드 또는 별도 TASK로).
