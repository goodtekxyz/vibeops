# 08 — Environment

Environment variables this project uses, and their meaning.

## Local development

Copy `.vibeops.env.example` to `.vibeops.env` and fill in the values. Never commit `.vibeops.env` (it is in `.gitignore`).

| Variable        | Purpose                                                              | Required when |
| --------------- | -------------------------------------------------------------------- | ------------- |
| `NOTION_TOKEN`  | Notion internal-integration secret (the only secret VibeOps reads).  | Using Notion. |

`NOTION_TOKEN` is the only secret VibeOps reads from the environment. The Notion **Projects / Tasks DB target IDs** are not environment variables — they live in `.vibeops.json` under `notion.projectsTargetId` / `notion.tasksTargetId`, populated by `vibeops notion init`. GitHub auth is handled by `gh auth`, so there is no need to set `GITHUB_TOKEN` here.

> Legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` environment variables are no longer used. Even if they remain in an old `.vibeops.env`, VibeOps ignores them — clean them up by hand for safety.

<!--
Add project-specific environment variables here as they appear.
e.g. DATABASE_URL, OAUTH_CLIENT_ID, ...
-->

## Staging / production

<!-- Slot to fill. -->

## Secret management

- `.vibeops.env` is a plain local file. Production secrets belong in a real secret manager.
- No VibeOps command prints these values verbatim to stdout (they are masked).
