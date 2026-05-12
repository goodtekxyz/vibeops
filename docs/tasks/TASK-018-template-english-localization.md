# TASK-018 · Template English localization

## Status

Review

## MVP Phase

후속 (post-MVP 4, public release)

## Goal

`vibeops init` 으로 새 프로젝트가 받는 모든 템플릿 파일(`templates/**`)을 영문으로 번역해, npm 으로 공개 배포되는 `@goodtekxyz/vibeops` 의 사용자가 한국어 노출 없이 깨끗한 영문 프로젝트 골격을 받게 한다. CLI/help/runtime 출력은 TASK-017 에서 영문화 했지만, npm tarball 에 동봉되는 `templates/` 의 본문은 아직 한국어라서 init 직후 사용자 워크스페이스에 한국어 markdown 이 그대로 깔린다 — 이 격차를 해소한다.

## Background

TASK-017 (Public release polish) 에서 CLI 출력 / README / CHANGELOG 까지는 영문 통일했지만, 같은 task 의 명시적 Out of Scope 로 `templates/**` 본문 번역은 별도 follow-up 으로 미뤘다. `package.json#files = [dist, templates, README.md, LICENSE, CHANGELOG.md]` 이므로 `templates/` 내용은 npm tarball 에 그대로 들어가고, `vibeops init` 시 사용자 프로젝트로 idempotent 복사된다. 따라서 글로벌 사용자가 `npm i -g @goodtekxyz/vibeops` 후 init 하면 `AGENTS.md`, `.cursor/rules/*.mdc`, `docs/project/00 ~ 09-*.md`, `docs/tasks/TASK-000-template.md` 등이 모두 한국어로 깔린다. 본 TASK 는 그 격차만 메운다.

## Scope

- `templates/AGENTS.md` 영문화 (placeholder `{{PROJECT_NAME}}` / `{{VIBEOPS_VERSION}}` / `{{CREATED_AT}}` 유지).
- `templates/.cursor/rules/00-project-governance.mdc` ~ `04-docs-update.mdc` 5 파일 영문화.
- `templates/.vibeops/agents/*.md` 8 파일 영문화 (planner.md 는 TASK-017 에서 BYOBrowser 예시만 교체했으므로 본 라운드에서 본문 전체 번역).
- `templates/.vibeops/prompts/*.md` 6 파일 영문화.
- `templates/.vibeops/workflows/*.md` 4 파일 영문화.
- `templates/docs/project/00 ~ 09-*.md` 10 파일 영문화 (placeholder · path 유지).
- `templates/docs/tasks/TASK-000-template.md` 영문화.
- `templates/docs/logs/README.md` 영문화.
- vibeops 저장소 자신의 self-installed 미러 (`.vibeops/agents/*`, `.vibeops/prompts/*`, `.vibeops/workflows/*`) 도 templates 와 1:1 sync 유지 — TASK-017 에서 planner.md 만 sync 했던 정책 확장.
- VibeOps 용어 일관성 유지: `workflow rails`, `source of truth`, `human dashboard`, `prompt mode`, `task lifecycle`.

## Out of Scope

- vibeops 저장소 자신의 `AGENTS.md` / `.cursor/rules/*.mdc` / `docs/project/**` / `docs/tasks/TASK-001..017-*.md` / `docs/logs/2026-05-{11,12}.md` 의 한국어 → 영문 전환. 이 파일들은 npm 패키지에 포함되지 않으며 historical record. 사용자 정책 "Do not remove Korean from historical docs/tasks unless those files are shipped to npm" 준수.
- 런타임 동작 변경 / Notion · GitHub 로직 변경 / 새 명령 / 새 옵션.
- 실제 npm publish (dry-run 까지만).
- `src/lib/task.ts` 의 legacy Korean placeholder regex (`/^\(.*미수행.*\)$/`) — backward compat 차원 유지.

## Acceptance Criteria

- `templates/**` 안에 한국어 글자(`[가-힣]`) 0건.
- `.vibeops/agents/**`, `.vibeops/prompts/**`, `.vibeops/workflows/**` (vibeops 자기 자신) 안에 한국어 글자 0건.
- `vibeops init` 으로 sandbox 디렉터리 init 시 생성된 모든 파일에 한국어 글자 0건.
- `pnpm typecheck` / `pnpm build` / `pnpm smoke` 모두 exit 0.
- `pnpm publish --dry-run --access public --no-git-checks` exit 0 + tarball 에 `dist`, `templates`, `README.md`, `LICENSE`, `CHANGELOG.md` 정확히 포함.
- 모든 markdown 의 placeholder (`{{PROJECT_NAME}}`, `{{VIBEOPS_VERSION}}`, `{{CREATED_AT}}`) / 파일 경로 (예: `docs/project/05-current-state.md`) / TASK section heading (예: `## Acceptance Criteria`) 전부 보존.
- VibeOps 용어 일관성 (workflow rails / source of truth / human dashboard / prompt mode / task lifecycle) — 본문에 자연스럽게 등장.

## Files to Inspect First

- `templates/AGENTS.md`
- `templates/.cursor/rules/*.mdc`
- `templates/.vibeops/{agents,prompts,workflows}/*.md`
- `templates/docs/project/*.md`
- `templates/docs/tasks/TASK-000-template.md`
- `templates/docs/logs/README.md`
- `src/bootstrap/manifest.ts`, `src/bootstrap/installer.ts` — template 복사 동작 확인 (코드는 변경 없음 예상)

## Expected Files to Change

- `templates/AGENTS.md`
- `templates/.cursor/rules/00-project-governance.mdc`
- `templates/.cursor/rules/01-agent-orchestration.mdc`
- `templates/.cursor/rules/02-task-workflow.mdc`
- `templates/.cursor/rules/03-git-safety.mdc`
- `templates/.cursor/rules/04-docs-update.mdc`
- `templates/.vibeops/agents/architect.md`
- `templates/.vibeops/agents/builder.md`
- `templates/.vibeops/agents/docs.md`
- `templates/.vibeops/agents/orchestrator.md`
- `templates/.vibeops/agents/planner.md`
- `templates/.vibeops/agents/recovery.md`
- `templates/.vibeops/agents/reviewer.md`
- `templates/.vibeops/agents/tester.md`
- `templates/.vibeops/prompts/create-plan.md`
- `templates/.vibeops/prompts/generate-tasks.md`
- `templates/.vibeops/prompts/implement-task.md`
- `templates/.vibeops/prompts/review-task.md`
- `templates/.vibeops/prompts/rollback.md`
- `templates/.vibeops/prompts/start-project.md`
- `templates/.vibeops/workflows/notion-sync.md`
- `templates/.vibeops/workflows/project-start.md`
- `templates/.vibeops/workflows/rollback.md`
- `templates/.vibeops/workflows/task-lifecycle.md`
- `templates/docs/logs/README.md`
- `templates/docs/project/00-overview.md` ~ `09-deployment.md` (10 파일)
- `templates/docs/tasks/TASK-000-template.md`
- `.vibeops/agents/*.md` (8 파일) — templates sync
- `.vibeops/prompts/*.md` (6 파일) — templates sync
- `.vibeops/workflows/*.md` (4 파일) — templates sync
- `docs/project/03-current-state.md`, `docs/logs/2026-05-12.md`, `docs/tasks/TASK-018-template-english-localization.md` (이 파일).

## Risks

- 광범위 markdown 번역 — 의미 표류 가능. 대응: placeholder / 경로 / heading / VibeOps 용어를 직접 보존하고, 번역 후 grep + diff 로 형태 확인.
- vibeops 자체 self-installed `.vibeops/` 미러를 sync 하지 않으면 vibeops 자기 자신의 working state 가 한국어 / 영어 혼재. → 본 TASK 에서 같이 sync.
- 한국어 placeholder `(미수행)` 같은 문구가 vibeops 자체 `docs/tasks/TASK-000-*.md` 와 함께 사라지면 TASK-008 `task done` validator (legacy placeholder regex 가 한국어와 영문 둘 다 인식하도록 둠 — TASK-017) 가 새 영문 placeholder `(not yet)` 를 정상으로 인식해야 함. `src/lib/task.ts` 의 PLACEHOLDER_RE 와 `src/lib/task-summary.ts` 의 PLACEHOLDER_RE 이미 양쪽 인식 — 회귀 없음.

## Test Plan

- `pnpm typecheck` / `pnpm build` / `pnpm smoke`.
- `rg '[가-힣]' templates/ .vibeops/` 출력 0건.
- `node dist/cli.js init --dry-run --cwd <sandbox>` exit 0 + Korean grep 0건.
- 새 sandbox 에서 `node dist/cli.js init --git --initial-commit` 실행 후 `rg '[가-힣]' <sandbox>` 0건.
- `pnpm publish --dry-run --access public --no-git-checks` exit 0 + tarball 포함 파일 변경 없음 (총 93 files 유지 예상).
- `node dist/cli.js task generate --scaffold --count 1 --cwd <sandbox>` 또는 `node dist/cli.js task done <id> --dry-run` 가 새 영문 placeholder 를 정상 처리하는지 회귀 확인.

## Rollback Plan

`templates/` 와 `.vibeops/` 의 markdown 변경은 모두 텍스트 변경이라 Git revert 만으로 즉시 복원 가능. 런타임 동작 변경 0건이라 회귀 위험 작음.

## Git Context

- Branch: main 직접 진행
- Touched paths: `templates/**`, `.vibeops/**`, `docs/tasks/TASK-018-*.md`, `docs/project/03-current-state.md`, `docs/logs/2026-05-12.md`

## Notion Page

미연동.

## Implementation Plan

1. 본 TASK 파일 생성 (`docs/tasks/TASK-018-template-english-localization.md`, Status=In Progress).
2. `templates/AGENTS.md` 영문화 (placeholder 보존).
3. `templates/.cursor/rules/*.mdc` 5 파일 영문화.
4. `templates/.vibeops/agents/*.md` 8 파일 영문화.
5. `templates/.vibeops/prompts/*.md` 6 파일 영문화.
6. `templates/.vibeops/workflows/*.md` 4 파일 영문화.
7. `templates/docs/project/*.md` 10 파일 영문화.
8. `templates/docs/tasks/TASK-000-template.md` 영문화.
9. `templates/docs/logs/README.md` 영문화.
10. `.vibeops/agents/`, `.vibeops/prompts/`, `.vibeops/workflows/` 의 vibeops 자체 미러를 templates 와 동일 본문으로 sync.
11. `pnpm typecheck` / `pnpm build` / `pnpm smoke` 통과.
12. sandbox `vibeops init --git --initial-commit` 후 Korean grep 0건 검증.
13. `pnpm publish --dry-run --access public --no-git-checks` 통과 + tarball 포함 파일 확인.
14. `docs/project/03-current-state.md`, `docs/logs/2026-05-12.md`, 본 TASK Status=Review + Result/Test Result 작성.

## Result

- `templates/AGENTS.md` 영문화 — placeholders (`{{PROJECT_NAME}}`, `{{VIBEOPS_VERSION}}`, `{{CREATED_AT}}`) 보존. Required reading 표 / Source of truth 표 / TASK-driven rules / Agent roles / Forbidden / Cursor rule files / Completion report / VibeOps metadata 8 섹션 그대로 유지하고 본문만 영문 번역.
- `templates/.cursor/rules/*.mdc` 5 파일 영문화 — frontmatter `description` / `alwaysApply` 그대로 유지. 본문 (Source of truth / One TASK at a time / MVP scope / Refactors / Branch policy / Commit messages / Safety / Docs Update 등) 영문 번역.
- `templates/.vibeops/agents/*.md` 8 파일 (`architect`, `builder`, `docs`, `orchestrator`, `planner`, `recovery`, `reviewer`, `tester`) — 각각 `name` / `role` / `description` frontmatter 유지, `Role / Inputs / Output Format / Rules / Forbidden` 5 섹션 영문 번역. planner.md 의 `Acme Automator` 예시는 TASK-017 에서 이미 영문 — 그대로 유지.
- `templates/.vibeops/prompts/*.md` 6 파일 (`create-plan`, `generate-tasks`, `implement-task`, `review-task`, `rollback`, `start-project`) — frontmatter `name` / `description` / `placeholders` 그대로, 본문은 Cursor 에 붙여 넣기 가능한 영문 markdown 으로 재작성. `vibeops task generate` 의 18-section 표준 placeholder 도 영문 (`Result` / `Test Result` body 는 `(not yet)`).
- `templates/.vibeops/workflows/*.md` 4 파일 (`notion-sync`, `project-start`, `rollback`, `task-lifecycle`) — 표·코드블록·명령 그대로 두고 산문만 영문 번역. notion-sync 의 legacy NOTION_API_KEY/PROJECT_DB/TASK_DB deprecation 한 줄은 영문으로 유지.
- `templates/docs/project/*.md` 10 파일 (`00-overview`, `01-requirements`, `02-mvp-scope`, `03-architecture`, `04-tech-stack`, `05-current-state`, `06-decisions`, `07-backlog`, `08-env`, `09-deployment`) — slot/placeholder 주석 + 테이블/예시 모두 영문화. `01-requirements.md` 의 `F-001` / `NF-001` 같은 ID 표기 그대로. `08-env.md` 의 NOTION_TOKEN 표 + legacy env deprecation 안내 영문 통일. `06-decisions.md` 의 D-001 ~ D-003 자유롭게 번역.
- `templates/docs/tasks/TASK-000-template.md` — 18-section 스켈레톤 영문화. `## Result` / `## Test Result` body 가 `(not yet)` 로 통일되어 `vibeops task done` 의 PLACEHOLDER_RE 정규식이 영문 placeholder 도 정상 인식 (TASK-017 에서 이미 양쪽 인식하도록 둠 — 회귀 없음).
- `templates/docs/logs/README.md` 영문화 — daily log 형식 표준 (`### Decision summary` / `### Changed files` / `### Verification` / `### Next work`) 영문 한 벌로 정리.
- VibeOps 저장소 자신의 self-installed 미러 sync (18 파일): `.vibeops/agents/{architect,builder,docs,orchestrator,planner,recovery,reviewer,tester}.md` 8 + `.vibeops/prompts/{create-plan,generate-tasks,implement-task,review-task,rollback,start-project}.md` 6 + `.vibeops/workflows/{notion-sync,project-start,rollback,task-lifecycle}.md` 4. `cp templates/... .vibeops/...` 로 1:1 sync.
- 호환성 정책 유지:
  - VibeOps 저장소 자신의 `AGENTS.md` / `.cursor/rules/*.mdc` / `docs/project/**` / `docs/tasks/TASK-001..017-*.md` / `docs/logs/2026-05-{11,12}.md` 는 historical record — npm 패키지에 포함되지 않으므로 그대로 한국어 유지. 사용자의 명시적 정책 "Do not remove Korean from historical docs/tasks unless those files are shipped to npm" 준수.
  - `src/lib/task.ts` / `src/lib/task-summary.ts` 의 legacy Korean placeholder regex 도 그대로 유지 (TASK-017 에서 이미 영문/한글 둘 다 인식). 기존 한국어 TASK markdown 도 새 CLI 로 정상 처리.
  - VibeOps 용어 일관성: `workflow rails`, `source of truth`, `human dashboard`, `prompt mode`, `task lifecycle` 모두 본문에 자연스럽게 등장.

## Test Result

- `pnpm typecheck` — exit 0.
- `pnpm build` — exit 0. `dist/` 재생성.
- `pnpm smoke` — exit 0. 8 스모크 케이스 (`--help` / `init --dry-run` / `init --dry-run --git --initial-commit` / `status` / `task generate --dry-run` / `notion init --dry-run` / `github status` / `github init --dry-run --connect goodtek/vibeops`) 모두 회귀 없음.
- 회귀 grep:
  - `templates/**` 한국어 글자 0건.
  - `.vibeops/**` (자체 미러) 한국어 글자 0건.
  - `README.md` / `CHANGELOG.md` / `package.json` 한국어 글자 0건.
  - `src/**` 잔여 한국어: `src/lib/task.ts` 와 `src/lib/task-summary.ts` 의 legacy placeholder regex 만 — 의도된 backward compat (TASK-017 ~ TASK-018 Out of Scope).
- Sandbox init (`/var/folders/.../vibeops-task018-XXXX.TljdO0KFFI`):
  - `node dist/cli.js init --cwd <sandbox> --name "acme-automator" --git --initial-commit` exit 0. 39 created, 0 overwritten, 0 skipped, `git init` + `default branch main` + initial commit 정상.
  - `find <sandbox> -type f -not -path "*/.git/*" | wc -l` = 39 — VibeOps 가 38 템플릿 + `.vibeops.json` + `.gitignore` 를 모두 깔았다.
  - `grep -RP '[\\x{ac00}-\\x{d7a3}]' <sandbox>` 0건 — 사용자 워크스페이스에 한국어 0 글자.
- `pnpm publish --dry-run --access public --no-git-checks` — exit 0. `name: @goodtekxyz/vibeops`, `version: 0.2.0`, `total files: 93`, `package size: 122.9 kB` (영문 번역으로 약 2.4kB 감소), `unpacked size: 476.4 kB`, `Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)` 확인. tarball 에 `dist/`, `templates/`, `README.md`, `LICENSE`, `CHANGELOG.md` 모두 정상 포함. 실제 npm publish 는 수행하지 않음.

## Review Notes

- 본 TASK 의 모든 변경은 markdown 텍스트 수정뿐 — TypeScript 코드 / `dist/` / `src/**` 동작 0건 변경. `pnpm typecheck` / `pnpm build` / `pnpm smoke` 가 모두 통과한 것은 그 정책의 확인.
- vibeops 저장소 자신의 `docs/project/**` / `AGENTS.md` / `.cursor/rules/**` / `docs/tasks/TASK-NNN-*.md` (현재 TASK-001 ~ TASK-018) 와 `docs/logs/2026-05-{11,12}.md` 는 historical record 로 한국어 유지. 향후 vibeops 자체 문서 영문화를 원하면 별도 TASK 로 분리. npm 패키지 사용자는 이 파일들을 받지 않음 (`package.json#files` 에 `docs/` 없음).
- `pnpm publish --dry-run` 의 total files 가 93 으로 TASK-017 과 동일. package size 만 122.9 kB 로 약 2.4 kB 감소 — 영문 번역의 자연스러운 결과.
- `src/lib/task.ts` 의 PLACEHOLDER_RE (`/^\\(.*미수행.*\\)$/`) 는 영문 placeholder `(not yet)` 도 인식하도록 이미 확장돼 있다. 새 template (`templates/docs/tasks/TASK-000-template.md`) 에서 `(not yet)` 를 쓰지만 기존 사용자의 한국어 TASK markdown 도 계속 동작.
- 새 사용자가 `vibeops init` 으로 받는 모든 markdown 의 첫인상이 영문 통일 — 글로벌 사용자 경험 격차 해소. 한국어 사용자도 markdown 본문은 자유롭게 한국어로 다시 채울 수 있다 (placeholder · 섹션 헤더는 영문 유지).
- 실제 `npm publish` 는 사용자가 직접 `pnpm publish --access public` (2FA 입력) 으로 수동 수행.
