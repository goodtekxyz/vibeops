# 02 — Tech Stack

VibeOps 자체는 **로컬에서 도는 작은 CLI**다. 무거운 런타임이나 백엔드 서비스를 도입하지 않는다.

## 런타임 / 언어

- **Node.js 20+ LTS** — 사용자 머신에 흔하고 macOS / Linux / WSL2에서 동일하게 동작
- **TypeScript 5.x** — `.vibeops/`·`docs/` 파일을 다루는 작은 타입(설정, TASK 메타, Notion 스키마)을 정확하게 표현하기 위함
- **패키지 매니저**: **pnpm** — 모노레포 친화·디스크 효율. 사용자에게는 `npm` / `pnpm` 어느 쪽으로도 설치 가능하게 배포(나중 `npm i -g vibeops`)

## CLI / 핵심 라이브러리 후보

> 구체 채택은 TASK-001에서 확정. 이 문서는 방향만 기록.

| 영역               | 후보                                                | 이유                                                                                |
| ------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| CLI 프레임워크     | `commander` 또는 `cac`                              | 작은 의존성, sub-command(`vibeops task start`) 표현이 자연스러움                    |
| 출력               | `picocolors` (또는 `kleur`)                         | 가벼움, 의존성 적음                                                                 |
| 대화형 프롬프트    | `@inquirer/prompts` (필요한 명령에서만 사용)        | `plan` / `task generate` 등에서 옵션 선택                                          |
| 파일 시스템·복사   | Node `fs/promises` + `fast-glob`                    | 템플릿 복사·존재 검사                                                               |
| 마크다운 frontmatter | `gray-matter`                                       | TASK 파일의 `---` 헤더(메타)와 본문 분리                                            |
| Git 조작           | `simple-git` 또는 `node:child_process` + `git` CLI | branch 생성·base commit 기록·log·revert                                             |
| Notion 클라이언트  | `@notionhq/client` (공식)                            | DB query / page create / update                                                      |
| 환경 변수          | `dotenv`                                            | `.vibeops.env`에서 `NOTION_API_KEY` 등 읽기                                         |
| 설정 파일          | JSON (`.vibeops.json`)                              | 사용자가 직접 편집해도 헷갈리지 않게. TOML/YAML은 도입하지 않는다.                  |

## 테스트 / 품질

- **vitest** — TypeScript 친화, 빠른 실행. unit 위주.
- **prettier + eslint** — 코드 스타일.
- **CI는 MVP 1에서는 생략 가능**, 다만 `pnpm run build`·`pnpm run test`·`vibeops --help` 스모크는 늘 통과해야 한다.

## 배포

- **npm registry**에 `vibeops` 이름(또는 namespace) 패키지로 배포 예정.
- 사용자는 `pnpm dlx vibeops init` 또는 `npm i -g vibeops`로 사용.
- 바이너리는 별도로 만들지 않는다(Node 환경 가정).

## 외부 의존성 / 자격 증명

- **Notion**: `NOTION_API_KEY`(integration secret), `NOTION_PROJECT_DB` (또는 page id), `NOTION_TASK_DB` (또는 db id). `.vibeops.env`에 두고 `.gitignore`에 들어간다.
- **Git**: 사용자 환경의 `git` 명령에 의존.
- **Cursor**: 직접 호출하지 않는다. VibeOps는 Cursor에 붙여 넣을 텍스트 프롬프트만 출력한다.

## 명시적 비채택

- 자체 LLM 호출 / OpenAI·Anthropic SDK 직접 사용 — 코드 생성은 Cursor 책임
- 자체 웹 서버 / 호스팅 / 대시보드
- 데이터베이스(SQLite 포함) — 상태는 평문 파일(`.vibeops/state/**.json`)로 충분
- 모노레포 워크스페이스 관리 / nx / turbo 도입(향후 별도 TASK에서만 검토)
