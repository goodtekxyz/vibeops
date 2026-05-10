# TASK-004 · `status` command

## Status

planned

## MVP Phase

MVP 1 · Project Bootstrapper

## Goal

`vibeops status`를 구현한다. 현재 디렉터리(또는 `--cwd`)가 VibeOps 프로젝트인지 검사하고, 설치 상태/문서 상태/TASK 카운트/Notion 연결 가능 여부를 사람이 읽기 좋은 형태로 보여준다.

## Background

부트스트랩 직후 사용자가 “지금 어디까지 깔렸지?”를 알기 위한 첫 진단 명령이다. 이후 모든 명령이 이 정보를 부분적으로 다시 쓰기 때문에 **상태 수집 로직**을 한 번 잘 모듈화해 두면 재사용 가치가 크다.

## Scope

- `src/commands/status.ts`
- `src/status/collector.ts` — 다음 정보를 수집:
  - VibeOps 설치 여부(`.vibeops.json` 존재? `AGENTS.md`? `.cursor/rules/`?)
  - 템플릿 파일 누락 여부(필수 파일 N개 중 M개 존재)
  - `docs/tasks/*.md`를 스캔해 TASK 카운트(전체 / planned / in_progress / done)
  - 현재 Git 브랜치, dirty 여부(요약)
  - Notion 환경 변수 존재 여부(실제 호출은 하지 않음, 단순 키 존재 여부)
- 옵션:
  - `--json` — 기계 친화 JSON 출력(이후 명령들이 status를 재사용)
  - `--cwd <path>`

## Out of Scope

- Notion 실제 호출(→ TASK-010 `notion test`에서)
- TASK 상태 변경(→ TASK-008)

## Acceptance Criteria

1. VibeOps가 설치되지 않은 디렉터리에서 `vibeops status` 실행 시 “Not a VibeOps project” 안내와 함께 어떤 파일이 빠졌는지 보여준다(종료 코드 ≠ 0).
2. 설치된 디렉터리에서 다음 섹션이 출력된다.
   - Project (name, vibeopsVersion, schemaVersion)
   - Installation (필수 파일 체크리스트, 빠진 항목)
   - Tasks (total / planned / in_progress / done, 다음 진행 가능한 TASK 1개)
   - Git (현재 브랜치, dirty?)
   - Notion (env keys present? — 실제 호출 없음)
3. `--json` 사용 시 위 정보가 valid JSON으로 출력된다.
4. 모든 정보 수집이 **읽기 전용**이다(어떤 파일도 수정/생성하지 않음).
5. 빠른 동작 — 큰 저장소에서도 1초 이내 완료(파일 수 수십 ~ 수백 가정).

## Files to Inspect First

- `src/config/projectConfig.ts` (TASK-002)
- `templates/docs/tasks/TASK-000-example.md` (TASK 메타 헤더 포맷 확인)
- `docs/project/01-architecture.md` § 컴포넌트 표

## Expected Files to Change

- 신규: `src/commands/status.ts`, `src/status/collector.ts`, `src/status/format.ts`
- 신규: `src/tasks/scanner.ts` (TASK 파일 스캔 — TASK-008에서도 재사용 예정)
- 신규: `tests/status.test.ts`
- 갱신: 본 TASK Result/Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`

## Risks

- TASK 메타 포맷(frontmatter)이 TASK-003 템플릿과 일치해야 한다 → 양쪽을 같은 schema 모듈에서 검증.
- Git 호출 실패(저장소가 아닌 경우)에서 status가 죽으면 안 됨 → catch해서 “not a git repo”로 표시.

## Test Plan

- vitest로 다음 케이스 검증:
  - 빈 디렉터리 → `Not a VibeOps project`, exit code 1
  - `init` 직후 디렉터리 → 모든 필수 파일 OK, tasks=0(또는 예시 1)
  - TASK 파일 몇 개를 만든 fixture에서 status가 카운트를 맞게 보고
  - `--json`이 valid JSON
- 수동: 본 저장소에서 `vibeops status`를 돌려 자기 자신을 검사.

## Rollback Plan

- 브랜치 폐기로 충분. 읽기 전용이라 사용자 부작용은 없음.

## Implementation Plan

1. TASK 메타 frontmatter 스키마를 `src/tasks/schema.ts`에 정의(zod 권장).
2. `scanner.ts`로 `docs/tasks/*.md`를 읽어 메타+제목을 추출.
3. `collector.ts`에서 installation/tasks/git/notion 정보를 모아 객체로 반환.
4. `format.ts`에서 사람용 출력 vs `--json` 출력 분기.
5. `commands/status.ts`에서 명령 등록.
6. 테스트 + 문서 갱신.

## Result

(미수행)

## Test Result

(미수행)
