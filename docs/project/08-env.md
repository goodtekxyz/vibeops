# 08 — Environment

이 프로젝트가 사용하는 환경 변수와 그 의미.

## 로컬 개발

`.vibeops.env.example`을 `.vibeops.env`로 복사하고 값을 채운다. `.vibeops.env`는 절대 커밋하지 않는다(`.gitignore`에 포함).

| 변수            | 용도                                                       | 필수 여부      |
| --------------- | ---------------------------------------------------------- | -------------- |
| `NOTION_TOKEN`  | Notion internal integration secret (VibeOps 가 읽는 유일한 비밀값) | Notion 사용 시 |

VibeOps 가 환경변수로 읽는 비밀값은 `NOTION_TOKEN` 하나뿐이다. Notion **Projects / Tasks DB target ID** 는 환경변수가 아니라 `.vibeops.json` 의 `notion.projectsTargetId` / `notion.tasksTargetId` 에 저장된다 — `vibeops notion init` 이 채워 준다. GitHub 인증은 `gh auth` 가 담당하므로 `GITHUB_TOKEN` 을 여기에 둘 필요는 없다.

> Legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` 환경변수는 더 이상 사용되지 않는다. 기존 프로젝트의 `.vibeops.env` 에 남아 있어도 VibeOps 는 무시한다 — 안전을 위해 직접 정리하면 좋다.

<!--
프로젝트가 자체 환경 변수를 가지게 되면 여기에 추가한다.
예) DATABASE_URL, OAUTH_CLIENT_ID, ...
-->

## 스테이징 / 운영

<!-- 채울 자리 -->

## 비밀 관리

- `.vibeops.env`는 평문 로컬 파일이다. 운영 비밀은 별도 secret manager에 둔다.
- 어떤 VibeOps 명령도 이 값을 stdout에 그대로 노출하지 않는다(마스킹).
