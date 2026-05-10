# TASK-012 · Package polish and README

## Status

planned

## MVP Phase

마무리 (post-MVP 4)

## Goal

VibeOps를 외부 사용자에게 배포 가능한 상태로 다듬는다. `package.json` 메타, `bin` 경로, `engines`, `files`, `keywords`, `license`를 정리하고, README를 “사람이 처음 마주쳤을 때 5분 안에 무엇인지 이해되는” 수준으로 다시 정돈한다.

## Background

여기까지 오면 모든 명령이 동작한다. 하지만 사용자가 `npm i -g vibeops`로 처음 만났을 때의 첫 인상은 README와 `vibeops --help`다. 이 TASK는 그 첫 인상에 집중한다.

## Scope

### `package.json`

- `name`: `vibeops` (또는 namespace)
- `version`: `0.1.0`(MVP1~4 통과 시)
- `description`: 한 줄(영문 + 한글 둘 다 둘 수도 있음)
- `bin`: `{ "vibeops": "dist/cli.js" }`
- `engines.node`: `>=20`
- `files`: `dist`, `templates`, `README.md`, `LICENSE`
- `keywords`: `cursor`, `ai`, `coding`, `cli`, `task`, `notion`, `vibeops`
- `repository`, `homepage`, `bugs`
- `license`: 선택(예: `MIT`)
- `scripts`: `build`, `dev`, `test`, `lint`, `prepublishOnly`(빌드 후)

### README

- 한 줄 정의
- 왜 필요한가 (5줄 이내)
- 5분 시작 가이드 (BYOBrowser 예시 그대로)
- 명령어 표 (MVP별)
- Source of Truth 표
- 명시적 비목표
- 문서 링크

### CHANGELOG.md

- `0.1.0` 항목: MVP 1~4 통과한 첫 배포

### LICENSE

- MIT 또는 사용자가 정한 라이선스 파일.

### 배포 체크

- `pnpm pack` 결과 `dist/`와 `templates/`가 포함되는지 확인.
- `npm publish --dry-run` 시 의도된 파일 목록인지 확인.

## Out of Scope

- 새 기능 추가(이 TASK는 polish 전용)
- 기존 명령의 동작 변경

## Acceptance Criteria

1. `package.json`에 `bin`, `engines`, `files`, `keywords`, `license`, `description`, `repository`, `homepage`가 모두 채워져 있다.
2. `pnpm pack` 산출물에 `dist/`, `templates/`, `README.md`, `LICENSE`가 포함되고, `src/`나 `tests/`는 **포함되지 않는다**.
3. README가 “5분 시작 가이드 → 명령어 표 → Source of Truth → 비목표 → 문서 링크” 순서로 정돈되어 있다.
4. `CHANGELOG.md`에 `0.1.0`이 추가되어 있다.
5. `npm publish --dry-run`이 에러 없이 통과한다(실제 publish는 별도).
6. `vibeops --help`가 모든 MVP 명령을 보여주고, 각 명령에 한 줄 설명이 붙어 있다.

## Files to Inspect First

- 본 저장소 `README.md` (TASK 시작 시 갱신)
- `package.json`, `tsconfig.json`
- `dist/` 출력물

## Expected Files to Change

- 갱신: `package.json`, `README.md`
- 신규: `CHANGELOG.md`, `LICENSE`(필요 시)
- 갱신: 본 TASK Result/Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`

## Risks

- `files` 화이트리스트를 잘못 설정해 템플릿이 누락되면 `vibeops init`이 실패 → `pnpm pack` 결과를 반드시 검증.
- 라이선스 결정은 사람의 의사 결정 → MVP에서는 MIT 기본, 사용자가 PR 시 변경 가능.

## Test Plan

- `pnpm run build` → `dist/` 산출 확인.
- `pnpm pack` → tar 안에 `dist/`, `templates/`가 들어 있는지 검사.
- `npm publish --dry-run` → 출력 목록이 의도와 일치.
- 임시 디렉터리에서 tar를 `npm i -g <path-to-tgz>`로 설치 후 `vibeops init`까지 동작하는지 스모크.

## Rollback Plan

- 브랜치 폐기.
- 실수로 publish 했다면 즉시 `npm deprecate` 안내(자동화하지 않음).

## Implementation Plan

1. `package.json` 메타 정리.
2. README 재정돈.
3. `LICENSE` 추가(또는 결정).
4. `CHANGELOG.md` 추가.
5. `pnpm pack` / `npm publish --dry-run`으로 검증.
6. tests(스모크)와 문서 갱신.

## Result

(미수행)

## Test Result

(미수행)
