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
# .vibeops.env.example을 .vibeops.env로 복사하고 키 입력 안내
# NOTION_API_KEY, NOTION_PROJECT_DB, NOTION_TASK_DB

vibeops notion test
# API 접근 + DB 스키마 검증 (필수 속성: Name / TaskId / Status / Priority / Branch / DocsPath / ResultSummary)
```

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
