# Claude Code — VibeOps

- Work from `docs/tasks/TASK-NNN-*.md` only.
- One TASK at a time.
- Fill **Result** and **Test Result** before telling the human to run `vibeops task ship TASK-NNN`. `ship` is state-aware: re-running before merge updates the open PR; after merge use `vibeops task ship --new-cycle`.
- Do not merge to integration or main unless the human runs `vibeops task merge` / `task sync` / `task release`.
