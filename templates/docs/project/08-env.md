# 08 — Environment

Environment variables used by this project and what they mean.

## Local development

Copy `.vibeops.env.example` to `.vibeops.env` and fill in the values. Never commit `.vibeops.env` — it is listed in `.gitignore`.

| Variable        | Purpose                                                          | Required        |
| --------------- | ---------------------------------------------------------------- | --------------- |
| `NOTION_TOKEN`  | Notion internal integration secret (the only secret VibeOps reads) | If using Notion |

`NOTION_TOKEN` is the only secret VibeOps reads from the environment. Notion **Projects / Tasks DB target IDs** are not environment variables — they live in `.vibeops.json` as `notion.projectsTargetId` / `notion.tasksTargetId`, and `vibeops notion init` writes them. GitHub auth is owned by `gh auth`, so there is no need to put `GITHUB_TOKEN` here.

> The legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` environment variables are no longer used. VibeOps ignores them if they remain in an existing `.vibeops.env`. It is safe to remove them by hand.

<!--
Add project-specific environment variables here once they exist.
Examples: DATABASE_URL, OAUTH_CLIENT_ID, ...
-->

## Staging / production

<!-- Slot. -->

## Secret management

- `.vibeops.env` is a plain-text local file. Production secrets belong in a real secret manager.
- No VibeOps command prints secret values to stdout in the clear (they are masked).
