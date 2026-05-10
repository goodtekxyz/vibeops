# TASK-008 · Task lifecycle — `start / prompt / check / done`

## Status

planned

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

(미수행)

## Test Result

(미수행)
