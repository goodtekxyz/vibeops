# TASK-017 · Public release polish

## Status

Review

## MVP Phase

후속 (post-MVP 4, public release)

## Goal

VibeOps 를 실제 npm 공개 배포 가능한 오픈소스 CLI 로 정리한다. npm package name 을 `@goodtekxyz/vibeops` 로 변경하고, 브랜드명 `VibeOps` 와 CLI 명령 `vibeops` 는 그대로 유지한다. README · CHANGELOG · 프로그램 내부 로그/help/error 메시지를 공개 배포 톤으로 영어 통일한다.

> ID 충돌 주: 같은 날짜의 TASK-016 · Notion env template cleanup 이 이미 Review 상태라서 본 작업은 TASK-017 로 번호를 올려서 진행한다. 사용자가 메시지에서 "TASK-016 · Public release polish" 로 칭했지만 ID 만 보존 정책 상 011 / 012 / 015 / 016 follow-up 패턴과 동일하게 다음 번호 사용.

## Background

TASK-012 에서 npm packaging 기본 골격은 완성했지만, 그 때는 패키지명이 unscoped `vibeops` 였고 README 가 `BYOBrowser` 같은 내부 가상 프로젝트 예시 + MVP 단계 라벨을 그대로 포함하고 있었다. 실제 공개 배포에서는 (a) goodtek 조직 scope 으로 게시하고, (b) 외부 사용자가 부담 없이 읽을 수 있도록 내부 개발 단계 흔적을 정리해야 한다. 또한 프로그램 출력이 한국어 / 영어 혼재라 글로벌 사용자에게 친절하지 않다.

## Scope

- `package.json`
  - `name` 을 `@goodtekxyz/vibeops` 로 변경.
  - `bin`, `repository`, `homepage`, `bugs`, `author`, `license` 는 기존 그대로 유지/확인.
  - `publishConfig: { access: "public" }` 추가 — scoped package 가 기본 private 으로 게시되는 함정 방지.
- `LICENSE` 는 MIT 그대로 유지 (변경 없음 확인).
- `CHANGELOG.md`
  - 새 `0.2.0 - 2026-05-12` 엔트리 추가: 패키지 이름 변경 · README/CHANGELOG/CLI 텍스트 영문화 · Acme Automator 예시 · support contact 정리 등.
  - 기존 `0.1.0` 엔트리에서 `MVP 1 / 2 / 3 / 4` 같은 단계 라벨 제거 후 기능 묶음 톤으로 재작성.
- `README.md`
  - "BYOBrowser Example Flow" 섹션을 "Quick Tutorial: Acme Automator" 로 교체.
  - `BYOBrowser-style scaffolded directory` 등 BYOBrowser 모든 잔재 제거.
  - `MVP Features` 섹션 → `Features`. 내부 MVP1~4 라벨 제거.
  - Runner Modes 의 `not implemented in the MVP` / `future maybe` 식 표현 정리.
  - GitHub Setup, Roadmap, Documentation 섹션에서 `post-MVP`, `MVP boundaries`, `No planned MVP support for ...` 같은 표현 정리.
  - `Roadmap` 섹션의 "TASK-007 through TASK-011" 같은 내부 번호 제거 — 외부 사용자에게 의미 없음. 공개용 톤으로 정리.
  - install 안내를 `npm install -g vibeops` → `npm install -g @goodtekxyz/vibeops`.
  - 새 "Support" 섹션 추가:
    - Bugs / setup issues / usage questions → support@goodtek.xyz
    - Collaboration / feedback → hello@goodtek.xyz
- `src/cli.ts`
  - 전체 `.description()` / `.option()` 텍스트 영문 통일. "(MVP 1)" / "(TASK-010)" / "(post-MVP 4)" 같은 내부 라벨 제거.
- `src/commands/*.ts`
  - 모든 `log.info` / `log.warn` / `log.error` / `log.ok` / `throw new Error(...)` 의 user-facing 한국어 메시지를 영문화.
- `src/lib/*.ts`
  - 위와 동일. 단 prompt-builder, brief, notion-* 의 사용자 표시 문자열 위주. 코드 주석(영문/한글 혼재)은 그대로 둘 수 있다.
- `src/types/config.ts`
  - `BYOBrowser-style scaffolded directory` 주석을 `Acme Automator-style scaffolded directory` 같은 일반 예시로 바꿔 BYOBrowser 잔재 제거.
- `templates/.vibeops/agents/planner.md`
  - `BYOBrowser` 예시 한 줄을 일반 예시로 교체.
- 검증
  - `pnpm typecheck` / `pnpm build` / `pnpm smoke` 통과.
  - `pnpm publish --dry-run --access public --no-git-checks` 가 `@goodtekxyz/vibeops` 이름으로 pass 하고 package contents 가 의도된 파일만 포함.
- 문서 반영
  - `docs/project/03-current-state.md` / `docs/logs/2026-05-12.md` / 본 TASK 파일 Result/Test Result.

## Out of Scope

- npm `publish` 실제 실행 — dry-run 까지만.
- GitHub release 생성 / git tag.
- 코드 동작 변경. 기능 회귀 없음 보장.
- 템플릿 markdown 본문(예: `templates/AGENTS.md`, `templates/.cursor/rules/*.mdc`, `templates/docs/project/00-overview.md` 등)의 한국어 → 영어 전면 번역. 이번 TASK 의 "프로그램 내부 로그/help/error" 정의는 CLI / src 코드 출력만 포함. 템플릿 본문 영문화는 별도 follow-up 으로 처리.
- `docs/project/` 하위 vibeops 자체 설계 문서의 MVP 표현 제거 — 이 문서는 npm package 에 포함되지 않으며(`package.json#files` 에 없음) historical record. 최신 사실은 `03-current-state.md` 가 책임짐.

## Acceptance Criteria

- `package.json` `name = "@goodtekxyz/vibeops"`, `bin.vibeops = "dist/cli.js"`, `publishConfig.access = "public"`.
- `pnpm publish --dry-run --access public --no-git-checks` 가 exit 0 으로 통과하고 출력에서 `name: @goodtekxyz/vibeops` 가 확인된다.
- `pnpm typecheck` / `pnpm build` / `pnpm smoke` 모두 exit 0.
- `node dist/cli.js --help` 출력에 한국어 글자(`[\uac00-\ud7a3]`) 0건.
- `node dist/cli.js init --help` / `task generate --help` / `notion test --help` / `github init --help` 출력에 한국어 글자 0건.
- README 안에 `BYOBrowser` / `MVP 1` / `MVP 2` / `MVP 3` / `MVP 4` 문자열 0건.
- README 안에 `support@goodtek.xyz` 와 `hello@goodtek.xyz` 각각 1회 이상.
- CHANGELOG 안에 `MVP 1` / `MVP 2` / `MVP 3` / `MVP 4` 문자열 0건.
- `src/cli.ts` 안에 한국어 글자 0건.
- `src/types/config.ts` 안에 `BYOBrowser` 0건.
- `templates/.vibeops/agents/planner.md` 안에 `BYOBrowser` 0건.
- `pnpm smoke` 가 새 명령 출력에서도 회귀 없이 통과.

## Files to Inspect First

- `package.json`, `CHANGELOG.md`, `LICENSE`, `README.md`
- `src/cli.ts`, `src/commands/**`, `src/lib/**`, `src/status/format.ts`
- `src/types/config.ts`
- `templates/.vibeops/agents/planner.md`

## Expected Files to Change

- `package.json`, `CHANGELOG.md`, `README.md`
- `src/cli.ts`
- `src/commands/{init,status,plan,task-*,notion-*,github-*,agent-*}.ts` (user-facing strings)
- `src/lib/{brief,prompt-builder,task-generator,task-scaffold,task-summary,project-docs,notion-{schema,sync,target,client,env,discovery},task-pull,github-cli,package-json,inquirer-helpers}.ts` (user-facing strings)
- `src/agent/prompt.ts`
- `src/types/config.ts`
- `templates/.vibeops/agents/planner.md`
- `docs/project/03-current-state.md`
- `docs/logs/2026-05-12.md`
- `docs/tasks/TASK-017-public-release-polish.md` (이 파일)

## Risks

- 광범위 문자열 교체 → 정규식 매칭 실수로 기능 동작 영향 가능. 대응: typecheck + build + smoke 의 8 케이스로 매 단계 회귀 검출.
- `pnpm publish --dry-run --access public` 명령은 npm registry 의 scoped package 동작에 의존. 실제 publish 는 ID 정책 / 2FA 가 별도이므로 본 TASK 의 dry-run pass 가 실제 publish 성공을 보장하지 않음.
- `MVP Phase` 는 Notion DB property 이름이라 그대로 유지해야 함 (사용자 데이터 호환). schema / sync / status / template 모두 `MVP Phase` 키를 그대로 사용. README 의 "MVP 표현 제거" 와 충돌하지 않도록 이 한 가지 예외는 명시.
- BYOBrowser → Acme Automator 같은 예시 교체로 외부 검색 / 링크가 잠시 깨질 수 있음. 공개 전이라 영향 작음.

## Test Plan

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke`
- `node dist/cli.js --help` / `node dist/cli.js init --help` / `node dist/cli.js task generate --help` / `node dist/cli.js notion test --help` / `node dist/cli.js github init --help` 출력에서 한국어 글자 grep 0건 확인.
- README · CHANGELOG · src/cli.ts 의 잔재 문자열 grep (`BYOBrowser`, `MVP 1` 등) 0건 확인.
- `pnpm publish --dry-run --access public --no-git-checks` exit 0 + package name `@goodtekxyz/vibeops` 확인.

## Rollback Plan

`package.json` name 변경 + `src/cli.ts` 번역 + README/CHANGELOG 수정은 모두 텍스트 변경이라 Git revert 만으로 완전 복원. dry-run publish 외에는 부작용 없음.

## Git Context

- Branch: main 직접 진행
- Touched paths: `package.json`, `CHANGELOG.md`, `README.md`, `src/**`, `templates/.vibeops/agents/planner.md`, `docs/**`

## Notion Page

미연동.

## Implementation Plan

1. `package.json` name → `@goodtekxyz/vibeops`, `publishConfig.access` 추가.
2. `CHANGELOG.md` 0.1.0 톤 다듬기 + 새 0.2.0 엔트리 추가.
3. `README.md` 풀 rewrite: BYOBrowser → Acme Automator 예시 / MVP 라벨 제거 / Support 섹션 추가 / install 명령 scoped 패키지명으로.
4. `src/cli.ts` 영문 통일 — description / option 텍스트 + 내부 "(MVP 1)" / "(TASK-010)" / "(post-MVP 4)" 라벨 제거.
5. `src/types/config.ts` BYOBrowser 주석 일반화.
6. `templates/.vibeops/agents/planner.md` BYOBrowser 예시 교체.
7. `src/commands/*.ts` + `src/lib/*.ts` 사용자 출력 문자열 영문 통일 (file by file).
8. typecheck / build / smoke 통과 확인.
9. `pnpm publish --dry-run --access public --no-git-checks` 통과 확인.
10. `03-current-state.md` / `2026-05-12.md` / 본 TASK 파일 Result/Test Result 업데이트.

## Result

- `package.json`: `name = "@goodtekxyz/vibeops"`, `version = "0.2.0"`, `publishConfig.access = "public"`. `bin`, `repository`, `homepage`, `bugs`, `author = "VibeOps contributors"`, `license = "MIT"` 그대로 유지/확인.
- `CHANGELOG.md`: 새 `0.2.0 - 2026-05-12` 엔트리 추가 (Highlights / Added / Changed / Removed / Verification 구성). 기존 `0.1.0` 엔트리에서 `MVP 1 / 2 / 3 / 4` 단계 라벨 전부 제거하고 기능 묶음(Project bootstrap, Plan, Task generation, Git task lifecycle, Notion dashboard sync, Packaging) 으로 재작성.
- `README.md`: 풀 rewrite. BYOBrowser 예시 / "MVP Features" / 내부 단계 라벨 / "future maybe" / "post-MVP" 같은 표현 전부 제거. "Quick Tutorial: Acme Automator" 섹션 신설. install 명령 `npm install -g @goodtekxyz/vibeops`. 새 "Support" 섹션 (support@goodtek.xyz / hello@goodtek.xyz / issue tracker). Notion 섹션에 `MVP Phase` 가 호환용 free-form select 라는 한 줄 명시. 상태 출력 예시도 `@goodtekxyz/vibeops 0.2.0` 으로 갱신.
- 프로그램 내부 문자열 영문화 (사용자 출력만, 코드 주석은 보존):
  - `src/cli.ts`: `--description`, 모든 command/subcommand `description` 텍스트 영문화. `(MVP 1)` / `(TASK-010)` / `(post-MVP 4)` 같은 내부 라벨 제거.
  - `src/commands/notion-init.ts`, `notion-test.ts`, `notion-sync.ts`, `github-init.ts`, `github-status.ts`, `plan.ts`, `task-pull.ts`, `task-done.ts`, `task-rollback.ts`, `task-generate.ts`: `log.info` / `log.warn` / `log.error` / `log.ok` / `throw new Error(...)` / 가이드 메시지 한국어 → 영어.
  - `src/lib/brief.ts`, `prompt-builder.ts`, `task-generator.ts`, `task-summary.ts`, `task-scaffold.ts`, `notion-schema.ts`, `notion-sync.ts`, `notion-target.ts`, `inquirer-helpers.ts`, `task.ts`: 사용자 노출 문자열 영문화. brief markdown 헤더, 생성되는 TASK 파일의 placeholder (`(not yet)` / `(unassigned)`), Notion 스키마 description, 생성된 TASK prompt 본문 텍스트 모두 영문 통일.
  - `src/agent/prompt.ts`: FOOTER 영문화 (Role/Inputs/Output Format/Rules/Forbidden + completion report 안내).
  - `src/types/config.ts`: `BYOBrowser-style scaffolded directory` 주석 → 일반적인 "scaffolded directory that has not adopted Node tooling yet" 표현으로 교체.
- 호환성 유지:
  - `MVP Phase` Notion property 이름은 그대로 유지 (사용자 데이터 호환). README · schema · sync · template · status · CLI option 라벨 모두 `MVP Phase` / `MVP <n>` 표기 유지하되 README 에 "free-form select; compatibility name" 명시.
  - `src/lib/task.ts` 의 한국어 placeholder regex (`/^\\(.*미수행.*\\)$/`) 와 status prefix regex (`/(신규|갱신|...)/`) 는 유지하고 영문 패턴을 추가로 인식하도록 그대로 둠. 기존 한국어 TASK 마크다운이 새 CLI 로도 정상 해석되도록 보장.
- `templates/.vibeops/agents/planner.md`: BYOBrowser 예시 한 줄을 Acme Automator 로 교체. 그 외 템플릿 본문(한국어 markdown) 은 Out of Scope 정책대로 이번 TASK 에서 손대지 않음.
- `docs/project/03-current-state.md` / `docs/logs/2026-05-12.md` 갱신, 본 TASK 파일 Status=Review + Result/Test Result 채움.

## Test Result

- `pnpm typecheck` — exit 0.
- `pnpm build` — exit 0. `dist/` 재생성 정상.
- `pnpm smoke` — exit 0. `node dist/cli.js --help` / `init --dry-run` / `init --dry-run --git --initial-commit` / `status` / `task generate --dry-run` / `notion init --dry-run` / `github status` / `github init --dry-run --connect goodtek/vibeops` 8 케이스 모두 회귀 없음.
- `pnpm publish --dry-run --access public --no-git-checks` — exit 0. 출력 헤더에 `name: @goodtekxyz/vibeops`, `version: 0.2.0`, `total files: 93`, `Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)` 확인. 실제 npm publish 는 실행하지 않음.
- 회귀 grep:
  - `node dist/cli.js --help` 출력에서 한국어 글자 0건.
  - `README.md` 에서 `BYOBrowser` / `MVP 1` / `MVP 2` / `MVP 3` / `MVP 4` 0건. `support@goodtek.xyz` 1회, `hello@goodtek.xyz` 1회 확인.
  - `CHANGELOG.md` 에서 `MVP 1` / `MVP 2` / `MVP 3` / `MVP 4` 0건.
  - `src/cli.ts` 에서 한국어 글자 0건.
  - `src/types/config.ts` 에서 `BYOBrowser` 0건.
  - `templates/.vibeops/agents/planner.md` 에서 `BYOBrowser` 0건.
  - `src/lib/task.ts` / `src/lib/task-summary.ts` 의 한국어 잔재는 legacy placeholder/status regex 만 (의도된 backward compatibility) 으로 확인.

## Review Notes

- npm publish 는 사용자가 직접 `pnpm publish --access public` (2FA 입력) 으로 수동 수행. 본 TASK 는 dry-run 까지만.
- 템플릿 markdown 본문(`templates/AGENTS.md`, `templates/.cursor/rules/*.mdc`, `templates/docs/project/**`) 의 한국어 → 영어 전면 번역은 별도 follow-up TASK 후보. 새 프로젝트 사용자가 한국어 markdown 을 받아도 동작은 정상이지만 글로벌 사용자 경험을 위해 추후 정리 권장.
- `docs/project/` 하위 vibeops 자체 설계 문서는 npm 패키지에 포함되지 않으므로 historical record 로 유지. 최신 사실은 `03-current-state.md` 가 책임.
- `MVP Phase` 라는 Notion property 이름은 호환성 때문에 그대로. 향후 변경하려면 user 의 기존 Notion DB schema 도 같이 마이그레이션해야 함.
