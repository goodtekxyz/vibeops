# TASK-001 · CLI bootstrap

## Status

done

## MVP Phase

MVP 1 · Project Bootstrapper

## Goal

VibeOps CLI 패키지의 **최소 골격**을 만든다. `pnpm install && pnpm run build` 이후 `vibeops --version`과 `vibeops --help`가 정상 동작하면 끝이다. 기능 명령(`init`, `plan` 등)은 아직 붙이지 않는다.

## Background

VibeOps 저장소에는 아직 어떤 코드도 없다(`package.json`도 없음). 이후 모든 TASK가 이 골격 위에 올라간다. 그래서 TASK-001은 **빌드 가능한 출발점**을 만드는 것에만 집중한다. 명령 라우팅 프레임워크와 패키지 메타 정도까지만 잡는다.

## Scope

- `package.json` (이름: `vibeops`, `bin.vibeops`, `engines.node >= 20`, `type: module`, `private: false`(개발 중에는 true 가능), `scripts: build/dev/test/lint`)
- `tsconfig.json` (ES2022 모듈, strict, `outDir: dist`)
- `src/cli.ts` — CLI 진입점, sub-command 라우팅 라이브러리(`commander` 권장) 사용
- `src/commands/help.ts` — 기본 도움말(또는 commander 기본 사용)
- `src/version.ts` — `package.json` 버전을 import해서 노출
- `.gitignore` (`node_modules/`, `dist/`, `.vibeops.env`)
- `.prettierrc`, `.eslintrc.cjs` (최소 설정)
- `pnpm-lock.yaml` 생성

## Out of Scope

- `vibeops init` 본체 구현 (→ TASK-002)
- 어떤 템플릿 파일도 작성하지 않음 (→ TASK-003)
- Notion, Git lifecycle 등 모든 도메인 명령
- 테스트 러너 통합 외의 실제 테스트 케이스(스모크 1개만)

## Acceptance Criteria

1. `pnpm install` 후 `pnpm run build`가 `dist/`에 빌드 산출물을 만든다.
2. `node dist/cli.js --version`이 `package.json`의 버전을 출력한다.
3. `node dist/cli.js --help`가 사용 가능한 명령 그룹(`init`, `status`, `agent`, `plan`, `task`, `notion`)을 **이름만이라도** 등록해 보여준다. 미구현 명령은 “not implemented yet” 안내를 출력해도 된다.
4. `package.json`의 `bin.vibeops`가 `dist/cli.js`를 가리킨다.
5. `pnpm run test`가 최소 1개의 vitest 스모크 테스트를 통과한다(예: `cli.ts`가 `--version` 호출 시 의도된 문자열을 출력).

## Files to Inspect First

- (없음 — 빈 저장소)
- `docs/project/01-architecture.md` — 명령 ↔ 컴포넌트 매핑 표
- `docs/project/02-tech-stack.md` — 라이브러리 후보

## Expected Files to Change

- 신규: `package.json`, `tsconfig.json`, `.gitignore`, `.prettierrc`, `.eslintrc.cjs`
- 신규: `src/cli.ts`, `src/version.ts`
- 신규: `src/commands/*.ts` (각 명령 그룹의 스텁 — 본체 없이 “not implemented” 출력)
- 신규: `tests/cli.smoke.test.ts`
- 갱신: `docs/project/03-current-state.md`, 본 TASK의 Result/Test Result, `docs/logs/YYYY-MM-DD.md`

## Risks

- Node 모듈 ESM 설정과 commander/TS 호환에서 보일러플레이트가 길어질 수 있다 → 최소 설정으로 끝낸다.
- `bin`을 `dist/cli.js`로 두면 shebang(`#!/usr/bin/env node`)이 필요하다 → cli.ts 첫 줄에 둔다.

## Test Plan

- `pnpm install`
- `pnpm run build`
- `node dist/cli.js --version` → 버전 문자열 확인
- `node dist/cli.js --help` → 명령 그룹 6개가 보이는지 확인
- `pnpm run test` → vitest 스모크 통과

## Rollback Plan

- 작업은 단일 task branch(`task/TASK-001-cli-bootstrap`)에서 진행. 머지 전 브랜치 폐기로 충분히 되돌릴 수 있다.

## Implementation Plan

1. `pnpm init` → `package.json` 기초 작성, name/bin/scripts/engines 채움.
2. TypeScript / commander / vitest / tsx / prettier / eslint 설치.
3. `tsconfig.json` 추가(ES2022, NodeNext, strict, outDir).
4. `src/cli.ts` 작성: shebang + commander 부트스트랩 + 명령 그룹 스텁 등록.
5. `src/commands/*.ts`에 미구현 안내(`console.log("[vibeops] not implemented yet: <cmd>")`) 스텁 추가.
6. `tests/cli.smoke.test.ts`로 `--version`·`--help` 동작 확인.
7. `pnpm run build`와 `pnpm run test` 통과 확인.
8. 문서 갱신: `03-current-state.md`(“CLI 골격 동작”), 본 TASK의 Result/Test Result, 로그.

## Result

2026-05-11 완료. VibeOps CLI의 최소 실행 가능한 뼈대를 만들었다.

- **패키지 메타**: `package.json` (`name: vibeops`, `version: 0.1.0`, `type: module`, `bin.vibeops: dist/cli.js`, `engines.node: >=20`, scripts: `build / dev / typecheck / start`).
- **TypeScript**: `tsconfig.json` (ES2022, NodeNext, strict, `outDir: dist`, `rootDir: src`).
- **CLI 진입점**: `src/cli.ts` — commander v12 기반 sub-command 라우팅. `--version`은 `src/version.ts`가 `package.json`을 직접 읽어 노출.
- **명령 구조 (16개)**: `init`, `status`, `plan`, `agent {list, show <name>, prompt <name> <taskId>}`, `task {generate, start <taskId>, prompt <taskId> --agent <name>, check <taskId>, done <taskId>, rollback <taskId>, pull}`, `notion {init, test, sync}`.
- **명령 스텁**: `src/commands/` 아래 15개 stub 파일 (`init.ts`, `status.ts`, `plan.ts`, `agent-list.ts`, `agent-show.ts`, `agent-prompt.ts`, `task-generate.ts`, `task-start.ts`, `task-check.ts`, `task-done.ts`, `task-rollback.ts`, `task-pull.ts`, `notion-init.ts`, `notion-test.ts`, `notion-sync.ts`). 각 스텁은 `[vibeops] not implemented yet: <cmd>`와 후속 TASK 참조 경로를 출력한다. `task prompt`는 `agent-prompt.ts`를 재사용해 `cli.ts`에서 인라인 위임.
- **스코프 밖**: 실제 init 파일 복사, Notion API 호출, Git branch 생성, rollback 실행, plan AI 생성은 모두 후속 TASK에 그대로 둠.
- **연기**: 본 TASK Acceptance Criteria #5(vitest 스모크 1개) — 사용자 지시로 본 라운드 구현 범위에서 제외. 후속 TASK 또는 별도 보강 TASK에서 추가한다.

### 변경 파일

| 파일 | 종류 |
| --- | --- |
| `package.json` | 신규 |
| `tsconfig.json` | 신규 |
| `.gitignore` | 신규 |
| `pnpm-lock.yaml` | 신규 (pnpm 자동 생성) |
| `src/version.ts` | 신규 |
| `src/cli.ts` | 신규 |
| `src/commands/init.ts` | 신규 |
| `src/commands/status.ts` | 신규 |
| `src/commands/plan.ts` | 신규 |
| `src/commands/agent-list.ts` | 신규 |
| `src/commands/agent-show.ts` | 신규 |
| `src/commands/agent-prompt.ts` | 신규 |
| `src/commands/task-generate.ts` | 신규 |
| `src/commands/task-start.ts` | 신규 |
| `src/commands/task-check.ts` | 신규 |
| `src/commands/task-done.ts` | 신규 |
| `src/commands/task-rollback.ts` | 신규 |
| `src/commands/task-pull.ts` | 신규 |
| `src/commands/notion-init.ts` | 신규 |
| `src/commands/notion-test.ts` | 신규 |
| `src/commands/notion-sync.ts` | 신규 |
| `docs/project/03-current-state.md` | 갱신 |
| `docs/tasks/TASK-001-cli-bootstrap.md` | 갱신 (Status / Result / Test Result) |
| `docs/logs/2026-05-11.md` | 갱신 |

## Test Result

- `pnpm install` → resolved 35, packages +10 (commander, tsx, typescript, @types/node 외), 1.9s, exit 0.
- `pnpm typecheck` → `tsc --noEmit` 에러 0건, exit 0.
- `pnpm build` → `dist/cli.js`(shebang 보존), `dist/version.js`, `dist/commands/*.js` 15개 생성. exit 0.
- `pnpm dev --help` → 6개 명령 그룹(`init`, `status`, `plan`, `agent`, `task`, `notion`)이 모두 노출됨. exit 0.
- `node dist/cli.js --version` → `0.1.0` (즉 `package.json`의 version과 일치). exit 0.
- `node dist/cli.js task --help` → 7개 task sub-command 모두 등록(`generate / start / prompt / check / done / rollback / pull`).
- `node dist/cli.js agent --help` → 3개 agent sub-command 모두 등록(`list / show / prompt`).
- `node dist/cli.js notion --help` → 3개 notion sub-command 모두 등록(`init / test / sync`).
- 스텁 실행 스모크: `node dist/cli.js init`, `agent prompt builder TASK-001`, `task prompt TASK-001 --agent builder`, `task rollback TASK-001` 모두 `[vibeops] not implemented yet: ...` 메시지를 정상 출력.
- Acceptance Criteria #1, #2, #3, #4 통과. #5(vitest)는 사용자 지시에 따라 본 라운드에서 보류.
