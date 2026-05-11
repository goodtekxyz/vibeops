# 05 — Current State

> 이 문서는 **사실만** 기록한다. 구현이 끝날 때마다 `docs` 에이전트가 갱신한다.

## 단계

- **현재 단계**: bootstrap 완료. 계획·구현은 아직 시작 전.
- 아직 코드(`src/`, `package.json` 등)가 없다.

## 갖춰진 것

| 항목         | 위치                                   | 비고                       |
| ------------ | -------------------------------------- | -------------------------- |
| 운영 지침    | `AGENTS.md`, `.cursor/rules/*`         | VibeOps가 설치             |
| 에이전트 정의 | `.vibeops/agents/*`                    | 8개                        |
| 프로젝트 docs| `docs/project/00 ~ 09`                 | 비어 있음 (plan 대기)      |
| TASK 폴더    | `docs/tasks/`                          | 비어 있음 (task generate)  |
| 로그 폴더    | `docs/logs/`                           | 비어 있음                  |

## 아직 없는 것

- `docs/project/*`의 실제 본문 (planner / architect가 채울 자리)
- `docs/tasks/TASK-001-*.md` (task generate)
- 어떤 코드도 작성되지 않음
- Notion 연결(원할 경우 `vibeops notion init`)

## 다음 TASK

**아직 백로그가 없다.** `vibeops plan --idea "<your idea>"`를 실행해 docs/project/{00,01,02,07}을 채우면 첫 TASK 후보가 나온다.

## 진행 규칙 (간단 요약)

- 한 번에 **한 TASK**만 진행한다.
- 모든 변경 명령은 가능한 `--dry-run`을 갖는다.
- 구현이 끝나면 이 문서, 해당 TASK 파일, `docs/logs/YYYY-MM-DD.md`를 함께 갱신한다.
