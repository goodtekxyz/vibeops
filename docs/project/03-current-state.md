# 03 — Current State

> 이 문서는 **사실만** 기록한다. 계획은 [05-backlog.md](05-backlog.md)에 둔다.

## 단계

- **현재 단계**: TASK-001 완료 — VibeOps CLI 골격이 동작한다.
- 모든 도메인 명령은 stub 상태(“not implemented yet” 출력).
- 실제 동작 구현(템플릿 복사 / Notion API / Git lifecycle / rollback / plan AI 생성)은 후속 TASK들이 채운다.

## 갖춰진 것

| 항목                          | 위치                                            | 비고                                                                 |
| ----------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| 제품 정의                     | `docs/project/00-overview.md` ~ `05-backlog.md` | 2026-05-11 업데이트                                                  |
| 운영 지침                     | `AGENTS.md`, `.cursor/rules/*.mdc`              | VibeOps 자신을 만들 때 적용할 규칙                                   |
| TASK 목록                     | `docs/tasks/TASK-001 ~ TASK-012`                | MVP 1 → 4 순서                                                       |
| 로그                          | `docs/logs/YYYY-MM-DD.md`                       | `docs/logs/2026-05-11.md`                                            |
| **CLI 패키지 골격**           | `package.json`, `tsconfig.json`, `.gitignore`   | Node 20+, ESM(`type: module`), bin=`dist/cli.js`, scripts: `build / dev / typecheck / start` |
| **CLI 진입점**                | `src/cli.ts`, `src/version.ts`                  | commander v12 기반, shebang 포함, `--version`은 `package.json` 직접 읽음 |
| **명령 스텁(15개 파일)**       | `src/commands/*.ts`                             | 모든 도메인 명령이 “not implemented yet” 출력 + 후속 TASK 참조 경로  |
| **빌드 산출물**               | `dist/cli.js`, `dist/commands/*.js`             | `pnpm build` 통과                                                    |

### 등록된 명령 트리

```
vibeops
├─ init                                       (TASK-002 예정)
├─ status                                     (TASK-004 예정)
├─ plan                                       (TASK-006 예정)
├─ agent
│  ├─ list                                    (TASK-005 예정)
│  ├─ show <name>                             (TASK-005 예정)
│  └─ prompt <name> <taskId>                  (TASK-005 예정)
├─ task
│  ├─ generate                                (TASK-007 예정)
│  ├─ start <taskId>                          (TASK-008 예정)
│  ├─ prompt <taskId> --agent <name>          (TASK-008 예정, agent-prompt 재사용)
│  ├─ check <taskId>                          (TASK-008 예정)
│  ├─ done <taskId>                           (TASK-008 예정)
│  ├─ rollback <taskId>                       (TASK-009 예정)
│  └─ pull                                    (TASK-011 예정)
└─ notion
   ├─ init                                    (TASK-010 예정)
   ├─ test                                    (TASK-010 예정)
   └─ sync                                    (TASK-011 예정)
```

## 아직 없는 것

- 실제 명령 본체 구현 — 모두 스텁
- 템플릿(`templates/**`) 실제 파일들 (TASK-003에서 채움)
- vitest 통합 및 스모크 테스트 (TASK-001 AC#5는 본 라운드에서 보류)
- ESLint / Prettier 설정
- `.vibeops.env.example` (TASK-010에서 추가)

## 다음 TASK

**TASK-002 — `init` 명령 구현**.
목표: `vibeops init` 본체. 빈 디렉터리에 VibeOps 운영 구조(`AGENTS.md`, `.cursor/rules/`, `docs/project/`, `docs/tasks/`, `docs/logs/`, `.vibeops/agents/`, `.vibeops/prompts/`, `.vibeops/workflows/`, `.vibeops.json`, `.vibeops.env.example`)를 설치한다. `--dry-run`, `--force`, `--cwd`, `--name` 옵션을 지원하며 idempotent 동작.

## 진행 규칙 (간단 요약)

- 한 번에 **한 TASK**만 진행한다.
- 모든 변경 명령은 가능한 `--dry-run`을 갖는다.
- 구현이 끝나면 이 문서, 해당 TASK 파일, `docs/logs/YYYY-MM-DD.md`를 함께 갱신한다.
