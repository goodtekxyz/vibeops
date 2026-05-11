# TASK-006 · `plan` command

## Status

done

## MVP Phase

MVP 2 · Project Planner

## Goal

`vibeops plan`을 **자유 텍스트 + 선택형 + 다중 선택형 + 확인형이 섞인 대화형 흐름**으로 구현한다. 20개 짧은 질문을 통해 정규화된 **ProjectBrief**(markdown)와 **Cursor Planner Agent용 계획 프롬프트**(markdown)를 만든다. 이 TASK는 거기까지만 책임진다 — Planner Agent의 실제 docs/project 채우기는 Cursor에서 사람이 트리거한다.

## Background

`vibeops init` 직후 사용자에게는 빈 `docs/project/00-overview.md` ~ `09-deployment.md`만 있다. 그걸 처음부터 사람이 손으로 쓰게 두면 막막하다. `vibeops plan`은 첫 1~2분 동안 방향키 / Space / Enter로 빠르게 답할 수 있는 짧은 질문들로 답을 모으고, 그 결과를 **사람이 검토·편집 가능한 brief markdown**과 **Cursor에 그대로 붙여 넣는 프롬프트 markdown**으로 떨어뜨린다. VibeOps는 여전히 LLM을 직접 호출하지 않는다.

## Scope

### 1) 인터랙티브 드라이버

- `@inquirer/prompts`(v8, 내부 select/checkbox v5.1.5) 기반.
- 질문 종류 4가지: `input` / `select` / `checkbox` / `confirm`.
- 키 입력 규약:
  - select·checkbox 모두 방향키, checkbox는 Space로 토글 + Enter 확정.
  - confirm은 Enter로 default 사용.
- 모든 `select`·`checkbox`에 **`loop: false`** 적용 — 마지막 항목에서 아래키를 더 눌러도 처음으로 점프하지 않는다. 선택지가 많을 때 흐름이 끊겨 거꾸로 올라가는 사용성 문제를 막는다.
- 모든 `select`·`checkbox`에 **`pageSize: 8`** 적용 — 한 화면에 최대 8행만 노출해 긴 목록의 가독성과 스크롤 비용을 통제한다.
- non-TTY(파이프·CI)에서 인터랙티브 진입 시 한 줄 안내 후 exit 1. CI에서는 `--non-interactive` 또는 `--from <brief.md>`을 요구한다.

### 2) 20개 질문 스키마

`src/types/brief.ts`에 라이브러리 독립적으로 정의됨. `Other`는 모든 선택지에서 **항상 마지막**.

| #  | Field                 | Type     | 선택지 / 비고                                                                                                                                       | 기본값                                                                                          |
| -- | --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1  | `projectName`         | input    | -                                                                                                                                                   | `basename(cwd)`                                                                                |
| 2  | `oneLineIdea`         | input    | -                                                                                                                                                   | `--idea`에서 파생 (있으면)                                                                     |
| 3  | `projectType`         | select   | SaaS / Web App / CLI Tool / Browser Automation / AI Agent / Internal Tool / Other                                                                  | idea에 `browser`가 포함되면 `Browser Automation`, 아니면 `SaaS`                                |
| 4  | `targetUsers`         | checkbox | Solo founders / Developers / Marketers / Small business owners / Internal team / Other                                                              | `[]`                                                                                            |
| 5  | `coreProblem`         | input    | -                                                                                                                                                   | (없음)                                                                                          |
| 6  | `mvpFeatures`         | checkbox | Authentication / Dashboard / Project/workspace management / Task/job creation / Background worker / Browser automation / Scheduling / Execution logs / External integrations / Other | `[]`                                                                                            |
| 7  | `outOfScope`          | checkbox | Billing / Team workspace / Mobile app / Marketplace / Advanced analytics / Enterprise SSO / Public API / Real-time collaboration / Other            | `[]`                                                                                            |
| 8  | `frontend`            | select   | Next.js / React + Vite / None / CLI only / Not sure / Other                                                                                         | **`Next.js`**                                                                                   |
| 9  | `backend`             | select   | NestJS / Next.js API routes / Node.js Fastify / Hono / Python FastAPI / None / Not sure / Other                                                     | **`NestJS`**                                                                                    |
| 10 | `database`            | select   | PostgreSQL / SQLite / MySQL / Supabase / None / Not sure / Other                                                                                    | **`PostgreSQL`**                                                                                |
| 11 | `dbLayer`             | select   | Drizzle / Prisma / Kysely / Raw SQL / None / Not sure / Other                                                                                       | **`Drizzle`**                                                                                   |
| 12 | `packageManager`      | select   | pnpm / npm / yarn / bun                                                                                                                             | **`pnpm`**                                                                                      |
| 13 | `deploymentTargets`   | checkbox | VPS / Docker / Podman / Vercel / Cloudflare / AWS / Not sure / Other                                                                                | `[]`                                                                                            |
| 14 | `authRequirements`    | checkbox | Email/password / Google login / GitHub login / Magic link / Admin-only / No auth for MVP / Not sure / Other                                         | `[]`                                                                                            |
| 15 | `integrations`        | checkbox | Notion / GitHub / Google Drive / Gmail / Slack / Stripe / OpenAI / Anthropic / Browser / Playwright / None / Other                                  | `[]`                                                                                            |
| 16 | `useNotion`           | confirm  | -                                                                                                                                                   | **`true`**                                                                                      |
| 17 | `useGitWorkflow`      | confirm  | -                                                                                                                                                   | **`true`**                                                                                      |
| 18 | `agentWorkflowLevel`  | select   | Simple / Standard / Advanced                                                                                                                        | **`Advanced: Orchestrator + Planner + Architect + Builder + Tester + Reviewer + Docs + Recovery`** |
| 19 | `risks`               | checkbox | Authentication/security / Browser automation reliability / Cost control / Scalability / Data privacy / Deployment complexity / Background jobs / AI hallucination / Other | `[]`                                                                                            |
| 20 | `successCriteria`     | input    | -                                                                                                                                                   | (없음)                                                                                          |

### 2-1) 선택지 다이어트(2026-05-11 라운드)

UX 개선을 위해 다음 항목들을 제거. 필요하면 사용자가 `Other → <text>`로 추가한다.

- Project type: `Chrome Extension`, `API Service`, `Content Site` 제거
- Target users: `Creators`, `Agencies`, `Enterprise users`, `Consumers` 제거
- MVP must-have features: `User settings`, `Notifications`, `Billing`, `Admin panel`, `API endpoints`, `File upload` 제거
- Out of scope: `Multi-language`, `Chrome extension` 제거
- Frontend: `SvelteKit`, `Vue/Nuxt` 제거 (+`Other` 추가)
- Backend: `Node.js Express`, `None / frontend only` 제거; `None`으로 단순화 (+`Other` 추가)
- Database: `MongoDB` 제거 (+`Other` 추가)
- DB Layer: `Supabase client` 제거 (+`Other` 추가)
- Deployment target: `GCP`, `Azure`, `Railway`, `Render` 제거 (+`Other` 추가)
- Auth requirement: `Passkey` 제거 (+`Other` 추가)
- External integrations: `Google Calendar`, `Discord` 제거. `Other`를 `None`보다 뒤로 이동.
- Risk areas: `Legal/compliance`, `Payment/billing` 제거

### 3) "Other" 체인

- select·checkbox에서 `Other` 선택 시 follow-up `input` 질문이 뜬다.
- 빈 값으로 Enter → 라벨 그대로 `"Other"` 유지.
- 텍스트 입력 → 라벨이 `"Other: <text>"`로 정규화된다.
- checkbox에서 콤마 구분으로 여러 개 입력 가능 (`"Other: a, b"` → `"Other: a"`, `"Other: b"`).

### 4) `ProjectBrief` 정규화

`src/types/brief.ts`:

```ts
export interface ProjectBrief {
  projectName: string;
  oneLineIdea: string;
  projectType: string;          // 표준 라벨 또는 "Other: ..."
  targetUsers: string[];
  coreProblem: string;
  mvpFeatures: string[];
  outOfScope: string[];
  frontend: string;
  backend: string;
  database: string;
  dbLayer: string;
  packageManager: string;
  deploymentTargets: string[];
  authRequirements: string[];
  integrations: string[];
  useNotion: boolean;
  useGitWorkflow: boolean;
  agentWorkflowLevel: string;
  risks: string[];
  successCriteria: string;
}
```

`BriefMeta`: `vibeopsVersion`, `generatedAt`, `source ("interactive" | "non-interactive" | "from-file")`, `schemaVersion=1`, `assumptions[]`.

### 5) 출력 파일

| 경로                                       | 내용                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `.vibeops/brief/project-brief.md`          | ProjectBrief를 사람이 검토·편집 가능한 markdown으로 직렬화. 헤더에 generated·source 메타. |
| `.vibeops/generated/plan-prompt.md` (기본) | Cursor Planner Agent에 그대로 붙여넣는 프롬프트.                                    |

`--output <path>`로 prompt 경로 변경 가능.

### 6) Plan prompt 본문 규약

prompt-builder가 만드는 Cursor 프롬프트는 다음을 포함한다.

- Planner Agent 역할 명시 (`.vibeops/agents/planner.md` 참조)
- Hard rules: "코드 작성 금지", "결과물은 `docs/**`만", "진실 공급원 규칙", "한 TASK 한 가지", "가정 기록"
- ProjectBrief 요약 (20개 필드 모두 markdown bullet으로)
- 산출물 형식: Plan Summary → `docs/project/*` 8개(00·01·02·04·06·07·08·09) → 초기 백로그 `docs/tasks/TASK-NNN-*` → Changed file list → Assumptions
- 매핑 가이드 (브리프 필드 → docs 파일)
- Notion / Git / Agent workflow 처리 규약

### 7) CLI 옵션

| 옵션                  | 의미                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------- |
| (없음)                | 대화형 (TTY 기본)                                                                             |
| `--idea <text>`       | `oneLineIdea` 기본값. `Name: idea` 형식이면 projectName도 추출.                              |
| `--from <path>`       | 기존 brief.md를 읽어 prompt만 재생성. 필수 필드 누락 시 그것만 추가 질문(또는 placeholder).   |
| `--output <path>`     | prompt 출력 경로 (기본 `.vibeops/generated/plan-prompt.md`)                                   |
| `--non-interactive`   | 질문 없이 주어진 값 + 안전한 placeholder로 생성. Assumptions에 명시.                          |
| `--cwd <path>`        | 다른 디렉터리에서 실행                                                                        |

### 8) 검증

- `projectName`, `oneLineIdea`는 인터랙티브 모드에서 필수(빈 값 거부).
- non-interactive 또는 `--from`로 비어 있으면 placeholder(`"Unnamed Project"`, `"(아이디어 미입력 — Planner Agent가 채워야 함)"`)로 채우고 `BriefMeta.assumptions`에 기록한다.

## Out of Scope

- VibeOps가 직접 LLM을 호출하는 모든 흐름 — 영구 비스코프.
- Cursor CLI 호출.
- Notion API 호출.
- Planner Agent의 응답을 `docs/project/*`에 분배하는 `--apply`(별도 TASK에서 다룰지 결정).
- 03-architecture / 05-current-state 직접 갱신.
- 백로그 자동 우선순위 매기기.
- 답변 기반 자동 의존성 설치.

## Acceptance Criteria

1. **대화형 동작**: TTY에서 `vibeops plan`이 20개 질문을 순차로 묻는다. 각 질문이 정의된 타입(input/select/checkbox/confirm)으로 표시된다.
2. **Other 체인**: select/checkbox에서 `Other` 선택 시 follow-up input이 뜨고, 결과 brief에 `"Other: <text>"`로 저장된다. 빈 입력 시 `"Other"` 유지.
3. **ProjectBrief 저장**: `.vibeops/brief/project-brief.md`가 위 스키마대로 생성된다.
4. **Plan prompt 생성**: `.vibeops/generated/plan-prompt.md`(또는 `--output`)에 Cursor에 그대로 붙여 넣을 수 있는 단일 markdown이 저장된다. 본문은 위 § 6 규약을 만족한다.
5. **`--idea "Name: idea"`**: projectName과 oneLineIdea가 자동 분리되어 기본값으로 채워진다.
6. **`--from <path>`**: 기존 brief.md를 읽어 동일한 brief을 재직렬화하고 prompt만 재생성한다. 필수 필드 누락 시 인터랙티브에선 그 항목만 다시 질문하고, non-interactive면 placeholder + Assumptions.
7. **non-TTY guard**: TTY가 아닐 때 인터랙티브 모드 진입 시 한 줄 안내 후 exit 1.
8. **`vibeops plan --help`**: 위 옵션을 모두 표시한다.
9. **typecheck/build**: `pnpm typecheck`, `pnpm build` 통과.
10. **LLM/외부 API 호출 0건**: 코드 어디에서도 fetch / Notion / OpenAI / Cursor API 호출 없음.

## Files to Inspect First

- `templates/.vibeops/prompts/create-plan.md`, `templates/.vibeops/agents/planner.md`
- `templates/docs/project/00 ~ 09`
- `src/agent/prompt.ts` (TASK-005) — 프롬프트 빌더 패턴
- `src/cli.ts` — 옵션 wiring 규약
- `package.json` — 의존성 추가 위치

## Expected Files to Change

- 신규: `src/types/brief.ts`
- 신규: `src/lib/inquirer-helpers.ts`
- 신규: `src/lib/brief.ts`
- 신규: `src/lib/prompt-builder.ts`
- 갱신: `src/commands/plan.ts` (stub → 실제)
- 갱신: `src/cli.ts` (옵션 wiring)
- 갱신: `package.json`, `pnpm-lock.yaml` (`@inquirer/prompts`)
- 갱신: `docs/project/03-current-state.md`, 본 TASK Result/Test Result, `docs/logs/YYYY-MM-DD.md`

## Risks

- `@inquirer/prompts` 키 핸들링이 Windows/일부 터미널에서 어긋날 수 있다 → MVP는 macOS·Linux 우선.
- 질문 수가 많아(20개) 중간에 닫을 위험 → 진행 표시(`Q n/20`)로 완료 감각 제공. (이번 TASK에선 draft 저장·`--resume`은 비스코프.)
- "Other" follow-up이 빈 값일 수 있다 → 그 경우 라벨 그대로 `"Other"` 유지하도록 정규화.
- `--from` 파서가 markdown 형식이 깨졌을 때 → 누락 필드는 빈 문자열/빈 배열로 fallback. 필수 필드 누락 시 위 § 8 검증으로 placeholder + Assumptions 처리.
- `.vibeops/brief/project-brief.md`에 민감 정보가 들어갈 수 있다 → 사용자 README에서 "평문으로 commit된다" 안내 필요(TASK-012).

## Test Plan

- **스모크 1**: `vibeops plan --non-interactive --idea "BYOBrowser: browser automation SaaS for solo founders"` → brief/prompt 둘 다 생성, projectName=`BYOBrowser`, oneLineIdea=후반부, coreProblem·successCriteria는 placeholder + Assumptions에 기록.
- **스모크 2**: 사람이 손으로 채운 brief.md → `vibeops plan --from <brief.md> --non-interactive` → brief을 그대로 재직렬화하고 prompt에도 모든 필드가 정상 반영(Other 체인 포함).
- **스모크 3**: `vibeops plan --non-interactive --idea "Foo: bar" --output <path>` → prompt가 지정한 경로로, brief는 기본 위치로 저장.
- **스모크 4**: `vibeops plan --cwd <sandbox> < /dev/null` → non-TTY guard 발동, exit 1.
- **스모크 5**: `pnpm typecheck`, `pnpm build`, `pnpm dev plan --help`.

(vitest 단위 테스트는 본 TASK 범위 밖 — TASK-012 정비 단계에서 함께 정리)

## Rollback Plan

- 코드 변경은 task 브랜치 폐기로 되돌릴 수 있다.
- 사용자 측: 생성된 `.vibeops/brief/project-brief.md`, `.vibeops/generated/plan-prompt.md`는 단순 데이터 파일이므로 `rm`만으로 충분. Planner Agent가 만든 `docs/**` 변경은 git diff/reset으로 되돌린다.

## Implementation Plan

1. **의존성 추가**: `pnpm add @inquirer/prompts` (8.4.3 픽됨).
2. **타입 + 옵션 상수**: `src/types/brief.ts`에 `ProjectBrief`, `BriefMeta`, 모든 select/checkbox 선택지 상수.
3. **인터랙티브 헬퍼**: `src/lib/inquirer-helpers.ts`에 `askInput / askSelect / askCheckbox / askConfirm`. 각 함수가 non-interactive 모드를 지원하고, select/checkbox는 Other 체인을 처리.
4. **brief 모듈**: `src/lib/brief.ts`에 `gatherBrief()`, `briefToMarkdown()`, `parseBriefFromMarkdown()`, `findMissingRequired()`, `parseIdea()` (Name: idea 분리).
5. **프롬프트 빌더**: `src/lib/prompt-builder.ts`에 `buildPlanPrompt(brief, meta, briefRelativePath)`. § 6 규약대로.
6. **명령 wiring**: `src/commands/plan.ts`에서 옵션 처리 → 흐름은 `--from` → `gatherBrief` → `briefToMarkdown` 저장 → `buildPlanPrompt` 저장 → 다음 단계 안내.
7. **CLI 등록**: `src/cli.ts`의 `plan`에 `--idea / --from / --output / --non-interactive / --cwd` 추가.
8. **스모크**: 5개 케이스(위 Test Plan) 수동 실행.
9. **문서**: TASK Result/Test Result, `03-current-state.md`, `docs/logs/2026-05-11.md` 갱신.

## Result

`vibeops plan`이 본 TASK 정의대로 구현되어 다음 산출물을 만든다 (UX 개선 라운드 반영: 2026-05-11):

- **`.vibeops/brief/project-brief.md`**: 20개 필드를 가진 ProjectBrief를 사람이 검토·편집 가능한 markdown으로 저장. 헤더에 `generatedAt · vibeopsVersion · source · schemaVersion=1`, 본문은 `## N. <title>` 헤딩 + 값(스칼라/리스트/yes·no), 끝에 `## Assumptions`.
- **`.vibeops/generated/plan-prompt.md`** (또는 `--output <path>`): Cursor Planner Agent용 단일 프롬프트. Role + Hard rules + ProjectBrief 요약 + 산출물 형식(Plan Summary → 8개 `docs/project/*` 채우기 → 백로그 → Changed file list → Assumptions) + 매핑 가이드 + Notion/Git/Agent workflow 처리 규약 포함.

추가 사실:

- `@inquirer/prompts 8.4.3`를 `dependencies`에 추가.
- `Other` 체인은 select/checkbox 양쪽 모두에서 follow-up `input`을 띄우고, 빈 입력은 `"Other"` 유지, 텍스트 입력은 `"Other: <text>"`. checkbox는 콤마 분리로 여러 개 입력 가능.
- `--idea "Name: idea"` 형식이면 `parseIdea()`가 자동 분리(콜론 앞이 한 단어이고 40자 미만일 때만)해 projectName + oneLineIdea의 기본값으로 사용.
- `--from <path>`는 brief.md를 파싱(`parseBriefFromMarkdown`) → 필수 필드(`projectName`, `oneLineIdea`) 누락 시 인터랙티브에선 그 항목만 추가 질문, non-interactive면 placeholder + Assumptions 기록.
- non-TTY에서 인터랙티브 진입 시 한 줄 안내(`"vibeops plan은 TTY가 필요합니다..."`) 후 exit 1.
- ESM + NodeNext에서 `--instructions`처럼 미지원 옵션을 피하기 위해 checkbox 안내는 message 자체에 dim 텍스트로 인라인.
- LLM / Cursor / Notion / GitHub 등 외부 API 호출은 코드 어디에도 없음(`grep -r fetch src/commands/plan.ts src/lib/brief.ts src/lib/prompt-builder.ts src/lib/inquirer-helpers.ts` 결과 0).

### UX 개선(2026-05-11 라운드)

- 선택지 12개 카테고리를 다이어트(§ 2-1 표). 합계 항목 수가 24개 줄어들었다(116 → 92). `Other`는 모든 카테고리에서 마지막 위치.
- 기본 스택 디폴트 적용: `frontend=Next.js`, `backend=NestJS`, `database=PostgreSQL`, `dbLayer=Drizzle`, `packageManager=pnpm`.
- `projectType` 스마트 디폴트: `--idea`(없으면 seed `oneLineIdea`)에 `/browser/i`가 매치되면 `Browser Automation`, 아니면 `SaaS`. 구현은 `deriveProjectTypeDefault()` 한 함수에 모음.
- `select` / `checkbox` 양쪽에 **`loop: false`** 적용 — `@inquirer/prompts 8.4.3`(내부 select·checkbox v5.1.5) 둘 다 옵션 지원 확인 후 일괄 적용. 마지막 항목에서 아래키를 더 눌러도 처음으로 점프하지 않는다.
- `select` / `checkbox` 양쪽에 **`pageSize: 8`** 적용 — 한 화면에 최대 8행만 노출.
- `confirm`은 `loop` / `pageSize` 모두 무의미해 미적용. `input`도 동일.

## Test Result

본 저장소 + 임시 sandbox(`/tmp/vibeops-plan-XXXXXX`)에서 다음을 수동 실행. 모두 통과.

### 1) Build / typecheck

```
$ pnpm typecheck
> tsc -p tsconfig.json --noEmit
(exit 0)

$ pnpm build
> tsc -p tsconfig.json
(exit 0)
```

### 2) `plan --help`

```
$ pnpm dev plan --help
Usage: vibeops plan [options]
20개 대화형 질문으로 ProjectBrief + Cursor Planner 프롬프트 생성 (MVP 2)
Options:
  --idea <text>      one-line idea의 기본값 (`Name: idea` 형식이면 name도 추출)
  --from <path>      기존 brief markdown을 읽어 prompt 재생성
  --output <path>    Cursor 계획 프롬프트 출력 경로 (기본 .vibeops/generated/plan-prompt.md)
  --non-interactive  질문 없이 주어진 값 + 안전한 placeholder로 생성
  --cwd <path>       다른 디렉터리에서 실행
  -h, --help         display help for command
```

### 3) `plan --non-interactive --idea "BYOBrowser: browser automation SaaS for solo founders"` (sandbox)

- `.vibeops/brief/project-brief.md` 1.4 KB 생성: projectName=`BYOBrowser`, oneLineIdea=`browser automation SaaS for solo founders`, useNotion=`yes`, useGitWorkflow=`yes`, agentWorkflowLevel=`Advanced: ...`, packageManager=`pnpm`, 그 외 select/checkbox는 default(`Not sure` / `[]`).
- `.vibeops/generated/plan-prompt.md` 5.7 KB 생성: § 6 규약 모두 포함, ProjectBrief 요약·매핑 가이드·산출물 형식 명시.
- Assumptions에 `coreProblem`, `successCriteria` 미입력 기록.
- stdout/stderr 인터리브 없이 출력 순서 정렬됨.

### 4) `plan --from <편집된 brief.md> --non-interactive` (sandbox)

- 사람이 손으로 20개 필드를 모두 채운 brief(`Target users`에 `Other: Marketing automation engineers` 포함)을 입력으로 사용.
- `.vibeops/brief/project-brief.md`로 동일한 brief 재직렬화, `source: from-file` 메타 보존.
- `.vibeops/generated/plan-prompt.md`의 "ProjectBrief 요약"에 모든 필드(list nested indent 포함, Other 라벨 포함)가 정확히 반영됨.

### 5) `plan --non-interactive --idea "Foo: bar" --output <custom-path>` (sandbox)

- brief는 기본 `.vibeops/brief/project-brief.md`로, prompt는 `--output`으로 지정한 `<custom-path>`로 저장.

### 6) `plan --cwd <sandbox> < /dev/null` (non-TTY)

```
✗ vibeops plan은 TTY가 필요합니다. CI/파이프 환경에서는 --non-interactive 를 사용하거나 --from <brief.md> 로 전달하세요.
(exit 1)
```

### 7) Lints

`ReadLints`로 변경 6개 파일 검사 → 오류 0건.

### 8) UX 개선 라운드(2026-05-11) 회귀 검증

| 케이스 | 결과 |
| --- | --- |
| `pnpm typecheck` | exit 0 |
| `pnpm build` | exit 0 |
| `pnpm dev plan --help` | 옵션 5개 노출(이전과 동일) |
| `plan --non-interactive --idea "BYOBrowser: browser automation SaaS" --cwd <sandbox>` | `projectType=Browser Automation`(스마트 디폴트), `frontend=Next.js`, `backend=NestJS`, `database=PostgreSQL`, `dbLayer=Drizzle`, `packageManager=pnpm`, `useNotion=yes`, `useGitWorkflow=yes`, `agentWorkflowLevel=Advanced: ...` |
| `plan --non-interactive --idea "Notely: minimal note app" --cwd <sandbox>` | `projectType=SaaS`(스마트 디폴트, idea에 browser 없음), 나머지 디폴트 동일 |
| `plan --non-interactive --idea "Foo: bar" --cwd <sandbox>` | Database / DB Layer / Package manager 디폴트 검증 → `PostgreSQL` / `Drizzle` / `pnpm` |
| `ReadLints` (`src/types/brief.ts`, `src/lib/brief.ts`, `src/lib/inquirer-helpers.ts`) | 0 issues |
