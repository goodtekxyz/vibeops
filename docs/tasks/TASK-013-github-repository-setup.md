# TASK-013 · GitHub repository setup

## Status

Review

## MVP Phase

후속 (post-MVP 4)

## Goal

VibeOps 프로젝트를 GitHub repository와 interactive하게 연결하거나, repository가 없으면 생성할 수 있게 한다. 핵심 명령은 `vibeops github init` / `vibeops github status` 두 개.

## Background

MVP 1~4 가 끝나면 사용자는 두 가지 흐름 중 하나로 GitHub 와 연결한다:

1. 이미 만든 repo URL 을 `git remote add` 로 붙이고 `package.json` 의 `repository` / `homepage` / `bugs` 를 수동 수정한다.
2. GitHub web UI 로 들어가 빈 repo 를 만들고 SSH/HTTPS URL 을 복사한 뒤 1과 같은 작업을 한다.

VibeOps 가 CLI 레일을 깐다는 정체성을 유지하려면 이 두 흐름을 명령으로 표현해야 한다. 단, **GitHub 연동은 MVP1~MVP4 핵심과 분리된 후속 기능**이므로 별도 TASK 로 다룬다.

## Scope

### `vibeops github status`

read-only 점검:

- `gh` CLI 설치 여부.
- `gh auth status` 인증 여부.
- `git remote -v` 의 `origin` URL.
- `origin` URL 이 GitHub URL 인지 (`parseGitHubRemote`).
- `.vibeops.json` 의 `github` 섹션.
- `package.json` 의 `repository` / `homepage` / `bugs`.
- 결과를 사람이 보기 쉽게 6 줄 정도로 출력.

### `vibeops github init` (interactive)

다음 순서로 진행하고, 모든 Yes/No 는 `yesNoSelect` 기반(loop:false, pageSize:2).

A. **gh CLI 설치 여부** — 없으면 `brew install gh` 안내 후 종료.

B. **gh auth status** — 인증 안 됐으면 `Run gh auth login first` 안내. `Run gh auth login now?` Yes 면 child process 로 `gh auth login` 실행, No 면 종료.

C. **현재 git remote** — `origin` 있으면 "Use this remote?" Yes 시 owner/repo 추출 + `.vibeops.json github 섹션` 업데이트 + (옵션) `package.json` 업데이트. `origin` 없으면 "Create a new GitHub repo?" Yes / No 로 분기.

D. **새 repo 생성** — `gh api user --jq .login` 로 기본 owner, package.json name 또는 폴더명으로 기본 repo name, package.json description 로 기본 description, public/private select. `gh repo create <owner>/<repo> --public|--private --source=. --remote=origin --description "..."`. push 는 하지 않는다.

E. **기존 repo 연결** — 사용자 입력 URL 또는 `owner/repo` 슬러그 → `parseGitHubRemote` 검증 → `git remote add origin <url>`. `origin` 이 이미 있으면 변경 여부를 따로 묻고 기본 No.

F. **package.json 업데이트** — `repository.url`, `homepage`, `bugs.url`. 사용자가 Yes 선택 + 기존 값이 있을 때만 덮어쓰기 재확인.

G. **.vibeops.json 업데이트** — `github.enabled = true`, `github.mode = "gh-cli"`, `github.owner`, `github.repo`, `github.remote = "origin"`, `github.visibility`, `github.url`.

### Options

- `--dry-run` — 명령 실행 / 파일 수정 0. 계획만 출력.
- `--yes` — 가능한 기본값으로 진행 (interactive 건너뜀).
- `--owner <owner>` / `--repo <repo>` / `--public` / `--private` — visibility / repo 정보 직접 지정.
- `--remote <name>` — origin 외 remote 이름 사용.
- `--connect <owner/repo or url>` — 새 repo 생성 없이 기존 repo 연결.
- `--no-package-update` — `package.json` 수정 안 함.
- `--cwd <path>` — 다른 디렉터리에서 실행.

### gh helper (`src/lib/github-cli.ts`)

- `isGhInstalled()`
- `ghAuthStatus()` — 인증 여부 + (있으면) 사용자명.
- `ghCurrentUser()` — `gh api user --jq .login` 결과.
- `ghRepoExists(owner, repo)` — `gh repo view <owner>/<repo>` 의 exit code.
- `ghCreateRepo({ owner, repo, visibility, source, remote, description, dryRun })`.
- `ghAuthLoginInteractive()` — `gh auth login` 을 stdio inherit 로 실행.
- `parseGitHubRemote(url)` — ssh / https / `owner/repo` slug 지원.
- `gitRemoteList(cwd)` / `gitRemoteAdd(cwd, name, url)` / `gitRemoteSetUrl(cwd, name, url)` (read-only / mutation 모두 단일 모듈에서 정렬).
- `child_process` 호출은 모두 args 배열로 분리해 shell injection 차단. 토큰을 stdout 에 출력하지 않는다.

### package.json helper (`src/lib/package-json.ts`)

- `readPackageJson(cwd)` — 없으면 `null`.
- `updatePackageRepositoryFields(cwd, { owner, repo, dryRun })` — 변경된 필드 목록과 작성 결과 반환.

```json
{
  "repository": { "type": "git", "url": "git+https://github.com/<owner>/<repo>.git" },
  "homepage": "https://github.com/<owner>/<repo>#readme",
  "bugs": { "url": "https://github.com/<owner>/<repo>/issues" }
}
```

### .vibeops.json 스키마 확장

```ts
interface GithubConfig {
  enabled: boolean;
  mode: "gh-cli";
  owner: string;
  repo: string;
  remote: string;       // "origin"
  visibility: "public" | "private" | "";
  url: string;
}
```

## Out of Scope

- GitHub Actions / CI 워크플로 생성.
- `GITHUB_TOKEN` 기반 REST API 직접 호출 — 이번 TASK 는 `gh` CLI 중심. 향후 fallback 후보.
- 자동 `git push`. push 는 사용자가 직접.
- 다중 remote 관리.
- PR 자동 생성 / 이슈 / 라벨 동기화.
- MVP 1~4 명령 동작 변경.

## Acceptance Criteria

1. `vibeops github status` 가 6 줄 짧은 결과를 출력하고 read-only 다.
2. `vibeops github init --dry-run` 이 파일/명령 변경 없이 계획만 출력한다.
3. `vibeops github init` 이 interactive Yes/No 를 `select` 로만 묻는다 (`y/n` 타이핑 강제 없음).
4. `--connect <owner/repo or url>` 흐름이 `gh repo create` 를 호출하지 않고 `git remote add origin <url>` 만 계획한다.
5. `--no-package-update` 가 `package.json` 변경을 차단한다.
6. `--public` / `--private` flag 가 있으면 visibility 질문이 생략된다.
7. `parseGitHubRemote` 가 ssh / https / `owner/repo` 슬러그 세 형식을 모두 파싱한다.
8. `.vibeops.json` 의 `github` 섹션이 안전 merge 되고, 기존 `notion` 섹션을 건드리지 않는다.
9. `gh` 가 없거나 인증되지 않은 환경에서 명확한 안내 후 종료한다.
10. `--dry-run` / `--yes` 가 결합되어도 mutation 0건.

## Files to Inspect First

- `AGENTS.md`
- `README.md`
- `package.json`
- `.vibeops.json`
- `docs/project/00-overview.md`
- `docs/project/01-architecture.md`
- `docs/project/03-current-state.md`
- `docs/project/04-decisions.md`
- `src/cli.ts`
- `src/lib/config.ts`
- `src/lib/git.ts`

## Expected Files to Change

- 신규: `src/lib/github-cli.ts`, `src/lib/package-json.ts`, `src/commands/github-status.ts`, `src/commands/github-init.ts`, `docs/tasks/TASK-013-github-repository-setup.md`.
- 갱신: `src/cli.ts`, `src/types/config.ts`, `src/lib/config.ts`, `README.md`, `docs/project/03-current-state.md`, `docs/logs/2026-05-11.md`.

## Risks

- `gh repo create` 는 실제 mutation 이므로 `--dry-run` / interactive 확인이 필수다.
- `git remote add` 도 mutation 이므로 dry-run 게이트가 필요하다.
- `package.json` 의 기존 `repository` 값 보존 (TASK-012 에서 채운 placeholder URL).
- `gh auth login` 은 child process 가 TTY 를 사용한다 → `--dry-run` / `--yes` / non-TTY 일 때 자동 실행 금지.
- gh 응답 파싱은 버전 차이가 있을 수 있다 — 핵심은 exit code 와 `gh api user --jq .login` 한 줄 출력.

## Test Plan

- `pnpm typecheck`
- `pnpm build`
- `node dist/cli.js github --help`
- `node dist/cli.js github status`
- `node dist/cli.js github init --dry-run`
- `node dist/cli.js github init --dry-run --owner goodtek --repo vibeops --public`
- `node dist/cli.js github init --dry-run --connect goodtek/vibeops`
- `node dist/cli.js github init --dry-run --connect https://github.com/goodtek/vibeops.git`
- `node dist/cli.js github init --dry-run --no-package-update --connect goodtek/vibeops`
- (선택) 실제 repo 생성/연결은 사람이 별도 수행.

## Rollback Plan

- 코드 변경은 git revert 또는 branch-delete.
- 실수로 origin 을 잘못 설정하면 `git remote remove origin` 으로 복구.
- 실수로 `gh repo create` 가 실행되면 GitHub web 에서 repo 를 직접 삭제하고 `git remote remove origin`.

## Git Context

(작업 중 채워진다 — `task start TASK-013` 시 base branch / base commit / task branch 자동 기록)

## Notion Page

(없음 — TASK-013 은 Notion sync 대상이지만 본 TASK 의 docs path 만 동기화된다)

## Implementation Plan

1. `src/types/config.ts` 에 `GithubConfig` 타입과 `DEFAULT_GITHUB_CONFIG` 추가.
2. `src/lib/config.ts` 에 `parseGithubSection`, `mergeGithubConfig` 추가.
3. `src/lib/github-cli.ts` 작성 — gh / git remote 헬퍼.
4. `src/lib/package-json.ts` 작성 — package.json 읽기/repository 필드 업데이트.
5. `src/commands/github-status.ts` 작성 — read-only 점검 출력.
6. `src/commands/github-init.ts` 작성 — interactive flow + flag 지원 + dry-run.
7. `src/cli.ts` 에 `github status` / `github init` 등록.
8. README / 03-current-state / logs / TASK-013 Result/Test Result 갱신.
9. typecheck + build + 위 검증 명령 실행.

## Result

TASK-013 범위 내에서 VibeOps 가 GitHub repository 를 interactive 하게 연결하거나 새로 생성할 수 있게 했다. 모든 mutation 은 `--dry-run` 으로 미리 볼 수 있고, `GITHUB_TOKEN` 은 저장하지 않으며, `git push` 자동 실행 0건.

### 변경 요약

- `src/types/config.ts`: `GithubConfig` / `GithubVisibility` / `DEFAULT_GITHUB_CONFIG` 추가. `VibeopsConfig.github?: GithubConfig` 옵셔널 필드.
- `src/lib/config.ts`: `parseGithubSection` + `mergeGithubConfig(base, patch)` 추가. 빈 문자열은 기존 값 보존, boolean/enum 은 덮어쓰기, Notion 섹션과 동일한 안전 merge 패턴. 기존 `notion` 섹션은 손대지 않는다.
- `src/lib/github-cli.ts` 신규:
  - `runGh(args)` — 모든 호출은 `execFile` args 배열 (shell injection 차단).
  - `isGhInstalled` / `ghAuthStatus` (username + hosts 추출, gh token 마스킹) / `ghCurrentUser` (`gh api user --jq .login`) / `ghRepoExists` / `ghCreateRepo` / `buildGhCreateRepoArgs` (dry-run preview 용).
  - `ghAuthLoginInteractive` — `spawn` 으로 `gh auth login` stdio:inherit. 호출자가 dry-run / non-TTY / `--yes` 가드 책임을 진다.
  - `parseGitHubRemote` — ssh (`git@github.com:owner/repo.git`), https (`https://github.com/owner/repo`), `git+https`, `owner/repo` 슬러그 네 가지 형식 처리.
  - `gitRemoteList` / `gitRemoteAdd` / `gitRemoteSetUrl` — `runGit` 위임 헬퍼.
- `src/lib/package-json.ts` 신규:
  - `readPackageJson(cwd)` — JSON parse 실패 / 파일 부재 시 `null`. raw 문자열도 함께 보존.
  - `buildRepositoryFieldsPatch({ owner, repo })` 표준 패턴 생성.
  - `updatePackageRepositoryFields(...)` — `repository` / `homepage` / `bugs` 만 갱신, 다른 필드 보존, 기존 indent (2-space / tab) 유지. 변경 없으면 write 0.
- `src/commands/github-status.ts` 신규:
  - read-only 6 줄 (`gh installed / gh authenticated / git remote origin / config enabled / package repo`).
  - GitHub URL 이 아닌 origin / 비-github package.json 은 yellow 표시. 마지막에 상황별 권장 명령 1줄.
  - `--json` 으로 기계 가독 JSON. exit code 0 — CI probe 안전.
- `src/commands/github-init.ts` 신규:
  - interactive: `yesNoSelect` 기반 (`y/n` 타이핑 0).
  - A/B 단계 (gh 설치 / 인증) — `--dry-run` 에서는 warn 만 띄우고 plan 진행. 실제 실행 모드에서 미인증 시 `Run gh auth login now?` 묻고 Yes 면 child process spawn.
  - 경로 결정: `use-existing` / `create-new` / `connect-existing` 셋 중 하나. `--connect` 가 있으면 무조건 connect-existing.
  - F 단계: 기존 `package.json#repository` 가 있으면 덮어쓰기 별도 confirm (기본 No). 비-interactive 에서는 `--yes` 가 있어야 덮어쓰기 허용. `--no-package-update` 가 전체 차단.
  - G 단계: `.vibeops.json#github` merge — 기존 `notion` 섹션 보존.
- `src/cli.ts`: `vibeops github` 그룹 + `status` / `init` 등록. `--no-package-update` 처리.
- `scripts/smoke.mjs`: `github status` / `github init --dry-run --connect goodtek/vibeops` 2 케이스 추가.
- `README.md`: "GitHub Setup" 섹션 + Command Flow 트리 갱신 + Security Notes 한 줄.
- `docs/project/03-current-state.md`: 단계 / 컴포넌트 / 명령 트리 / 다음 TASK / 아직 없는 것 갱신.

### 변경 파일

- `src/types/config.ts`
- `src/lib/config.ts`
- `src/lib/github-cli.ts` (신규)
- `src/lib/package-json.ts` (신규)
- `src/commands/github-status.ts` (신규)
- `src/commands/github-init.ts` (신규)
- `src/cli.ts`
- `scripts/smoke.mjs`
- `README.md`
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-013-github-repository-setup.md`
- `docs/logs/2026-05-11.md`

## Test Result

### 정적 / 빌드

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints` (`src/cli.ts`, `src/lib/config.ts`, `src/lib/github-cli.ts`, `src/lib/package-json.ts`, `src/commands/github-init.ts`, `src/commands/github-status.ts`, `src/types/config.ts`) ✅ 0 warnings.

### CLI smoke

아래 명령 모두 ✅:

- `node dist/cli.js --help` — 최상위 `Commands` 에 `github` 그룹 노출.
- `node dist/cli.js github --help` — `status` / `init` 노출.
- `node dist/cli.js github init --help` — 9 개 옵션 (`--dry-run / --yes / --owner / --repo / --public / --private / --remote / --connect / --no-package-update / --cwd`) 노출.
- `node dist/cli.js github status` — 6 줄 출력 + 1 줄 권장. gh 미설치 환경에서도 정상.
- `node dist/cli.js github status --json` — 기계 가독 JSON.
- `node dist/cli.js github init --dry-run` exit 1 — 친절한 안내 (`--connect` 또는 `--owner --repo` 필요).
- `node dist/cli.js github init --dry-run --owner goodtek --repo vibeops --public` — `Path: create-new` + `gh repo create goodtek/vibeops --public --source=<cwd> --remote=origin --description …` 계획 출력.
- `node dist/cli.js github init --dry-run --connect goodtek/vibeops` — `Path: connect-existing` + `git remote add origin https://github.com/goodtek/vibeops` 계획.
- `node dist/cli.js github init --dry-run --connect https://github.com/goodtek/vibeops.git` — https url 도 동일.
- `node dist/cli.js github init --dry-run --connect git@github.com:goodtek/vibeops.git` — ssh url 도 동일.
- `node dist/cli.js github init --dry-run --no-package-update --connect goodtek/vibeops` — `--no-package-update — package.json 수정 0건` 출력.
- `node dist/cli.js github init --dry-run --connect goodtek/vibeops --remote myorigin` — `git remote add myorigin ...` 계획.
- `pnpm smoke` — 7 케이스 모두 통과.

### 보안 / 정책 검증

- `--dry-run` mutation 0건: `gh repo create` / `git remote add` / `git remote set-url` / `package.json` write / `.vibeops.json` write 어느 것도 일어나지 않는다.
- `gh auth login` 자동 실행 0건. `--dry-run` / `--yes` / non-TTY 어떤 조합에서도 TTY child process 강제 점유 없음.
- `GITHUB_TOKEN` 저장 0건. 인증은 `gh auth` 가 담당.
- origin remote 덮어쓰기 기본 거부 — 변경 시 별도 Yes/No (기본 No).
- `git push` 자동 실행 0건. Done 메시지에서 `git push -u <remote> <branch>` 를 사용자가 직접 실행하도록 안내.
- `gh` child process 호출은 모두 args 배열 (`execFile`). `gh*_…` 토큰 패턴 / `Authorization: Bearer …` 마스킹.

### 남은 위험 요소

- 실제 `gh repo create` / `git remote add` 시나리오는 사람이 별도로 실행해야 한다 (sandbox 환경에 gh 가 설치돼 있지 않아 dry-run 까지만 검증). 실제 실행 시에는 (a) `gh auth login` 으로 인증 후 (b) `vibeops github init --dry-run` 으로 plan 확인 후 (c) `--dry-run` 제거하고 실행하는 순서를 권장.
- `gh` 버전 차이로 `gh auth status` 출력 포맷이 달라지면 username 추출이 실패할 수 있다 — `username: null` 로 안전하게 fallback 되며 인증 여부 판단 자체는 `Logged in to` 패턴으로 보호.
- `parseGitHubRemote` 는 enterprise GitHub (`github.example.com`) 는 미지원. 필요 시 polish 라운드에서 host 인자로 확장.
- TASK-013 Status 는 `Review`. 사람/Reviewer Agent 가 실제 `gh auth login` 후 한 번 실제 실행 시나리오를 따라간 뒤 `vibeops task done TASK-013 --finalize` 처리.

## Review Notes

- 본 TASK 는 MVP 핵심 흐름 외부에 위치한다. Reviewer 는 GitHub 연동이 build / start / check / done / rollback 등 기존 명령 동작을 건드리지 않았는지 확인할 것.
- `gh auth login` 흐름은 child process 가 사용자 TTY 를 점유하기 때문에 CI / `--dry-run` / `--yes` 에서 자동 실행되지 않는지 검증해야 한다.
