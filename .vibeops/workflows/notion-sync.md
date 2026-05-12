# Workflow · Notion Sync

Notion은 **사람이 보는 운영판**이다. Source of truth가 아니다.

## 무엇이 동기화되는가

| 방향               | 무엇                                       | 어디                          |
| ------------------ | ------------------------------------------ | ----------------------------- |
| docs → Notion      | TASK ID, 제목, status, priority, branch, docs path, 결과 요약 | Task DB                        |
| docs → Notion      | 프로젝트 이름, 현재 상태 요약, 다음 TASK ID                     | Project DB(단일 row 기본)      |
| Notion → docs      | TASK의 status, priority (frontmatter)         | `docs/tasks/*.md` frontmatter |

## 무엇은 동기화되지 않는가

- TASK 본문 (Scope, Acceptance Criteria, Implementation Plan 등)
- `docs/project/00~07`의 본문
- 코드 변경 / Git 상태

상세는 항상 Git의 docs에서 본다.

## 설정

```bash
vibeops notion init
# NOTION_TOKEN 입력을 안내한다 (`.vibeops.env` 가 없으면 새로 만들지 묻고,
# 있으면 NOTION_TOKEN 라인만 안전하게 교체한다).
# Projects / Tasks DB 의 target ID 는 환경변수가 아니라
# `.vibeops.json` 의 `notion.projectsTargetId` / `notion.tasksTargetId` 에 저장된다.

vibeops notion test
# API 접근 + DB 스키마 검증 (필수 속성: Name / TaskId / Status / Priority / Branch / DocsPath / ResultSummary)
```

> Legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` 환경변수는 더 이상 사용하지 않는다. VibeOps 는 `NOTION_TOKEN` 만 읽는다.

## 사용

```bash
vibeops notion sync             # push (멱등)
vibeops notion sync --dry-run   # 미리보기

vibeops task pull               # Notion → docs frontmatter
vibeops task pull --dry-run     # 미리보기
```

## 비스코프 (MVP)

- 실시간 webhook
- 양방향 본문 동기화
- 페이지 child block 동기화
- 새 TASK를 Notion에서 만들고 docs로 끌어오기 (그건 `vibeops task generate`의 영역)
