# TASK-012 · Package polish and README

## Status

Review

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

TASK-012 범위 내에서 VibeOps MVP 1~4 구현물을 npm 배포 가능한 CLI 패키지 형태로 정리했다.

### 변경 요약

- `README.md` 를 첫 사용자 기준으로 재구성:
  - `VibeOps란 무엇인가`
  - `왜 필요한가`
  - 핵심 철학 (`VibeOps = workflow rail`, `Cursor = builder`, `Git docs/tasks = AI execution source of truth`, `Notion = human dashboard`)
  - 설치 방법 / 빠른 시작 / BYOBrowser 예시 흐름
  - 전체 명령어 흐름
  - MVP 기능 (`Project Bootstrapper`, `Interactive Planner`, `Task Generator`, `Git Task Lifecycle`, `Rollback Safety`, `Notion Dashboard Sync`)
  - Runner 모드 (`prompt mode` 기본, `cursor-cli` / `direct-llm` future)
  - Notion setup (`.vibeops.env`, `.vibeops.json`, data_source-first discovery, required properties, required Status options)
  - Git rollback safety / Agent workflow / Packaging / Security notes / Roadmap
- `package.json` 배포 메타 보강:
  - `description`, `packageManager`, `author`, `license`, `repository`, `homepage`, `bugs`, `keywords` 추가.
  - `files` 를 `dist`, `templates`, `README.md`, `LICENSE`, `CHANGELOG.md` 로 제한.
  - `scripts` 를 `dev`, `build`, `typecheck`, `start`, `smoke`, `prepack`, `publish:dry` 로 정리.
  - `private: true` 제거. 실제 publish 는 수행하지 않음.
- `LICENSE` 신규 추가: MIT, copyright holder `VibeOps contributors`.
- `CHANGELOG.md` 신규 추가: `0.1.0 - 2026-05-11` release candidate 항목.
- `.gitignore` 정리:
  - `dist/` 는 빌드 산출물이므로 커밋하지 않고, `prepack` 으로 생성해 npm package 에 포함하는 정책 명시.
  - `.vibeops.env`, `.vibeops/tmp/`, `.vibeops/cache/`, `.vibeops/brief/`, `.vibeops/generated/` ignore 유지.
  - `.vibeops/agents`, `.vibeops/prompts`, `.vibeops/workflows` 는 ignore 하지 않음.
- `scripts/smoke.mjs` 신규 추가:
  - `dist/cli.js` 존재 확인.
  - `node dist/cli.js --help`
  - `node dist/cli.js init --dry-run`
  - `node dist/cli.js status`
  - `node dist/cli.js task generate --dry-run`
  - `node dist/cli.js notion init --dry-run`
  - 네트워크가 필요한 Notion 실제 API 테스트는 포함하지 않음.
- `src/cli.ts` shebang (`#!/usr/bin/env node`) 과 `dist/cli.js` shebang 보존을 빌드 후 확인.
- `.vibeops.json` 는 실제 Notion target id 없이 안전 상태 유지:

  ```json
  {
    "notion": {
      "enabled": false,
      "projectsDatabaseId": "",
      "tasksDatabaseId": "",
      "projectsTargetId": "",
      "tasksTargetId": ""
    }
  }
  ```

### 변경 파일

- `.gitignore`
- `README.md`
- `package.json`
- `LICENSE` (신규)
- `CHANGELOG.md` (신규)
- `scripts/smoke.mjs` (신규)
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-012-package-polish-readme.md`
- `docs/logs/2026-05-11.md`

## Test Result

### 정적 / 빌드

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `dist/cli.js` 첫 줄 shebang 확인 ✅ `#!/usr/bin/env node`.
- `ReadLints` (`package.json`, `README.md`, `.gitignore`, `scripts/smoke.mjs`) ✅ 0 warnings.

### CLI smoke

아래 명령 모두 ✅ exit 0:

- `node dist/cli.js --help`
- `node dist/cli.js init --dry-run`
- `node dist/cli.js task generate --dry-run`
- `node dist/cli.js notion init --dry-run`
- `pnpm smoke`

`pnpm smoke` 내부 검증:

- `pnpm typecheck`
- `pnpm build`
- `node scripts/smoke.mjs`
  - `node dist/cli.js --help`
  - `node dist/cli.js init --dry-run`
  - `node dist/cli.js status`
  - `node dist/cli.js task generate --dry-run`
  - `node dist/cli.js notion init --dry-run`

### Packaging / publish dry-run

- `pnpm pack` ✅ exit 0.
  - tarball contents 에 `dist/`, `templates/`, `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json` 포함.
  - `src/` 미포함 확인.
  - 생성된 `vibeops-0.1.0.tgz` 는 검증 후 삭제.
- `pnpm publish --dry-run` ⚠️ pnpm git safety 로 차단:

  ```text
  ERR_PNPM_GIT_UNCLEAN Unclean working tree. Commit or stash changes first.
  ```

  실제 publish 명령은 uncommitted 작업 트리에서 pnpm 이 막는 것이 정상이다. Git 체크만 비활성화한 패키지 검증은 통과:

- `pnpm publish --dry-run --no-git-checks` ✅ exit 0.
  - `prepack` 이 `pnpm build` 실행.
  - npm notice tarball contents 에 `dist/`, `templates/`, `README.md`, `LICENSE`, `CHANGELOG.md` 포함.
  - `src/` 미포함.
  - 실제 publish 는 수행하지 않음 (`dry-run`).

### 남은 위험 요소

- `pnpm publish --dry-run` 원 명령은 commit/stash 후 clean working tree 에서 재실행해야 pnpm git check 까지 통과한다.
- `repository` / `homepage` / `bugs` 는 `https://github.com/vibeops/vibeops` 기준으로 채웠다. 실제 원격 저장소 URL 이 다르면 배포 전 수정 필요.
- TASK-007~TASK-011은 여전히 사람/Reviewer Agent 검토 후 별도 `vibeops task done <id> --finalize` 대상이다. TASK-012에서 자동 finalize 하지 않았다.
