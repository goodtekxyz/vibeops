# Workflow · Project Start

새 프로젝트를 시작할 때의 첫 한 시간.

## 0. 준비

- 빈 디렉터리에서 시작한다.
- 사용자는 한두 문단짜리 **아이디어**를 가지고 있다.

## 1. Bootstrap

```bash
vibeops init --name <project-name>
git init && git add . && git commit -m "chore: bootstrap vibeops"
```

생성되는 것:
- `AGENTS.md`, `.cursor/rules/*`, `docs/project/*`, `docs/tasks/`, `docs/logs/`
- `.vibeops/agents/*`, `.vibeops/prompts/*`, `.vibeops/workflows/*`
- `.vibeops.json`, `.vibeops.env.example`

## 2. Plan

```bash
vibeops plan --idea "<one-paragraph idea>"
```

출력된 프롬프트를 Cursor에 붙여 넣는다. Cursor는 `planner` 에이전트가 되어 4개 파일을 채운다.

- `docs/project/00-overview.md`
- `docs/project/01-requirements.md`
- `docs/project/02-mvp-scope.md`
- `docs/project/07-backlog.md`

다음으로 `architect`를 호출해 `03-architecture.md`·`04-tech-stack.md`를 채운다.

## 3. Backlog → TASKs

각 백로그 항목에 대해:

```bash
vibeops task generate --from-backlog TASK-NNN
```

`docs/tasks/TASK-NNN-*.md` 파일이 생긴다.

## 4. First TASK

```bash
vibeops task start TASK-001
vibeops task prompt TASK-001 --agent builder
# Cursor에 붙여 넣어 작업
vibeops task check TASK-001
vibeops task done TASK-001
```

머지 가이드를 보고 사람이 직접 머지·푸시.

## 5. (옵션) Notion

```bash
vibeops notion init      # .vibeops.env 작성 안내
vibeops notion test      # API 접근·DB 스키마 검증
vibeops notion sync      # docs/tasks 메타 → Notion
```

## 6. 매일

```bash
vibeops status           # 어디까지 왔는지 1초 안에 확인
```

`docs/logs/YYYY-MM-DD.md`에 그날 결정·진척을 한 항목씩 남긴다.
