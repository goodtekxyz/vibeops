# 08 — Environment

이 프로젝트가 사용하는 환경 변수와 그 의미.

## 로컬 개발

`.vibeops.env.example`을 `.vibeops.env`로 복사하고 값을 채운다. `.vibeops.env`는 절대 커밋하지 않는다(`.gitignore`에 포함).

| 변수                | 용도                                          | 필수 여부                |
| ------------------- | --------------------------------------------- | ------------------------ |
| `NOTION_API_KEY`    | Notion integration secret                     | Notion 사용 시           |
| `NOTION_PROJECT_DB` | Notion Project DB id (또는 페이지)            | Notion 사용 시           |
| `NOTION_TASK_DB`    | Notion Task DB id                             | Notion 사용 시           |

<!--
프로젝트가 자체 환경 변수를 가지게 되면 여기에 추가한다.
예) DATABASE_URL, OAUTH_CLIENT_ID, ...
-->

## 스테이징 / 운영

<!-- 채울 자리 -->

## 비밀 관리

- `.vibeops.env`는 평문 로컬 파일이다. 운영 비밀은 별도 secret manager에 둔다.
- 어떤 VibeOps 명령도 이 값을 stdout에 그대로 노출하지 않는다(마스킹).
