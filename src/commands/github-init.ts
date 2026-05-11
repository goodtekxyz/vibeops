import { basename, resolve } from "node:path";
import { select } from "@inquirer/prompts";

import { mergeGithubConfig, readConfig, writeConfig } from "../lib/config.js";
import { pathExists } from "../lib/filesystem.js";
import {
  buildGhCreateRepoArgs,
  ghAuthLoginInteractive,
  ghAuthStatus,
  ghCreateRepo,
  ghCurrentUser,
  gitRemoteAdd,
  gitRemoteList,
  gitRemoteSetUrl,
  isGhInstalled,
  parseGitHubRemote,
  type GitHubRemoteInfo,
} from "../lib/github-cli.js";
import { askInput, askYesNo } from "../lib/inquirer-helpers.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";
import {
  buildRepositoryFieldsPatch,
  readPackageJson,
  readBugsUrl,
  readHomepage,
  readRepositoryUrl,
  updatePackageRepositoryFields,
} from "../lib/package-json.js";
import type { GithubConfig, GithubVisibility } from "../types/config.js";

export interface GithubInitOptions {
  dryRun?: boolean;
  yes?: boolean;
  owner?: string;
  repo?: string;
  public?: boolean;
  private?: boolean;
  remote?: string;
  connect?: string;
  noPackageUpdate?: boolean;
  packageUpdate?: boolean;
  cwd?: string;
}

interface InitContext {
  cwd: string;
  dryRun: boolean;
  interactive: boolean;
  remoteName: string;
  /** Visibility forced by --public / --private. */
  forcedVisibility: GithubVisibility;
  /** When defined, force "connect to this existing repo" mode and skip new-repo creation. */
  connectTarget: GitHubRemoteInfo | null;
  /** Effective `--no-package-update` decision. */
  packageUpdate: boolean;
  ownerFlag: string;
  repoFlag: string;
  /** Project config (already validated). */
  configPath: string;
  packageJsonPath: string;
}

interface InitPlan {
  ghInstalled: boolean;
  ghAuthenticated: boolean;
  remoteUsed: boolean;
  remoteAdded: boolean;
  remoteUrl: string | null;
  remoteSetUrl: boolean;
  repoCreated: boolean;
  repoCreationCommand: string | null;
  /** Final owner/repo VibeOps will store. */
  owner: string;
  repo: string;
  visibility: GithubVisibility;
  description: string;
  configChanged: boolean;
  packageWrites: { repositoryUrl: string; homepage: string; bugsUrl: string } | null;
  packageDiffs: { field: string; before: string; after: string }[];
}

const REMOTE_DEFAULT = "origin";

export async function githubInitCommand(
  options: GithubInitOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const dryRun = options.dryRun === true;
  const explicitYes = options.yes === true;
  const isTty = process.stdin.isTTY === true;
  const interactive = !dryRun && !explicitYes && isTty;

  const ctx: InitContext = {
    cwd,
    dryRun,
    interactive,
    remoteName: options.remote && options.remote.length > 0 ? options.remote : REMOTE_DEFAULT,
    forcedVisibility:
      options.public === true ? "public" : options.private === true ? "private" : "",
    connectTarget: typeof options.connect === "string" && options.connect.length > 0
      ? parseGitHubRemote(options.connect)
      : null,
    packageUpdate:
      options.noPackageUpdate === true
        ? false
        : typeof options.packageUpdate === "boolean"
          ? options.packageUpdate
          : true,
    ownerFlag: typeof options.owner === "string" ? options.owner.trim() : "",
    repoFlag: typeof options.repo === "string" ? options.repo.trim() : "",
    configPath: resolve(cwd, ".vibeops.json"),
    packageJsonPath: resolve(cwd, "package.json"),
  };

  log.info(bold("vibeops github init"));
  log.info(`  ${dim("cwd")}        ${cwd}`);
  log.info(
    `  ${dim("mode")}       ${
      dryRun
        ? "dry-run (no gh / git / file mutation)"
        : interactive
          ? "interactive (방향키 · Enter — y/n 타이핑 안 함)"
          : "non-interactive (flags only)"
    }`,
  );
  if (ctx.connectTarget !== null) {
    if (!ctx.connectTarget.isGithub) {
      log.error(
        `--connect ${cyan(ctx.connectTarget.url)} 가 GitHub URL / owner/repo 슬러그가 아니다. 'https://github.com/<owner>/<repo>' 또는 'owner/repo' 형식이어야 한다.`,
      );
      process.exitCode = 1;
      return;
    }
    log.info(`  ${dim("connect")}    ${cyan(`${ctx.connectTarget.owner}/${ctx.connectTarget.repo}`)}`);
  }
  log.blank();

  if (!(await pathExists(ctx.configPath))) {
    log.error(
      `.vibeops.json 이 없다. 먼저 ${cyan("vibeops init")} 를 실행해 VibeOps 운영 구조를 설치하세요.`,
    );
    process.exitCode = 1;
    return;
  }

  const baseConfig = await readConfig(cwd);
  if (baseConfig === null) {
    log.error(
      `.vibeops.json 을 읽지 못했다(스키마 불일치 또는 JSON 파싱 실패). 파일을 확인하거나 ${cyan("vibeops init")} 로 다시 생성하세요.`,
    );
    process.exitCode = 1;
    return;
  }

  const plan: InitPlan = {
    ghInstalled: false,
    ghAuthenticated: false,
    remoteUsed: false,
    remoteAdded: false,
    remoteUrl: null,
    remoteSetUrl: false,
    repoCreated: false,
    repoCreationCommand: null,
    owner: ctx.ownerFlag,
    repo: ctx.repoFlag,
    visibility: ctx.forcedVisibility,
    description: "",
    configChanged: false,
    packageWrites: null,
    packageDiffs: [],
  };

  // ── A. gh installed ──────────────────────────────────────────────────────
  plan.ghInstalled = await isGhInstalled();
  if (!plan.ghInstalled) {
    if (dryRun) {
      log.warn(
        `gh CLI 가 설치돼 있지 않다. 실제 실행 전 ${cyan("brew install gh")} (macOS) 또는 https://cli.github.com/ 로 설치 필요. dry-run 은 그래도 계획을 계속 보여 준다.`,
      );
    } else {
      log.error(
        `gh CLI 가 설치돼 있지 않다. macOS: ${cyan("brew install gh")} (또는 https://cli.github.com/) 후 다시 실행하세요.`,
      );
      process.exitCode = 1;
      return;
    }
  } else {
    log.ok(`gh CLI installed`);
  }

  // ── B. gh authenticated ──────────────────────────────────────────────────
  const auth = plan.ghInstalled
    ? await ghAuthStatus()
    : {
        installed: false,
        authenticated: false,
        username: null,
        hosts: [] as string[],
        detail: "gh CLI not installed",
      };
  plan.ghAuthenticated = auth.authenticated;
  if (!auth.authenticated) {
    if (dryRun) {
      log.warn(
        `gh 가 인증되지 않았다. 실제 실행 전 ${cyan("gh auth login")} 필요. dry-run 은 계속 진행.`,
      );
    } else {
      log.warn(`gh 가 인증되지 않았다. Run ${cyan("gh auth login")} first.`);
      let runLogin = false;
      if (interactive) {
        runLogin = await askYesNo({
          message: "Run gh auth login now?  (TTY 가 child process 로 넘어간다)",
          nonInteractive: false,
          defaultValue: true,
        });
      } else if (explicitYes) {
        // --yes 만으로는 자동으로 TTY 점유를 강제하지 않는다.
        log.info(
          dim(
            `  · --yes 만으로는 gh auth login 을 자동 실행하지 않는다. interactive 환경에서 다시 실행하라.`,
          ),
        );
      }
      if (runLogin) {
        log.info(dim(`  · spawning: gh auth login`));
        const code = await ghAuthLoginInteractive();
        if (code !== 0) {
          log.error(`gh auth login exited with code ${code}. 다시 시도해 주세요.`);
          process.exitCode = code;
          return;
        }
        const auth2 = await ghAuthStatus();
        plan.ghAuthenticated = auth2.authenticated;
        if (!plan.ghAuthenticated) {
          log.error(
            "gh auth login 후에도 인증 상태가 확인되지 않는다. 'gh auth status' 로 진단하라.",
          );
          process.exitCode = 1;
          return;
        }
        log.ok("gh authenticated");
      } else {
        log.info(dim(`  · gh auth login 없이는 신규 repo 생성이 불가능하다. 종료.`));
        process.exitCode = 1;
        return;
      }
    }
  } else {
    log.ok(
      `gh authenticated${auth.username !== null ? `  ${dim(`as ${auth.username}`)}` : ""}`,
    );
  }

  // ── C. inspect current remotes ───────────────────────────────────────────
  const remotes = await gitRemoteList(cwd);
  const existingRemote = remotes.find((r) => r.name === ctx.remoteName) ?? null;
  const existingInfo = existingRemote !== null ? parseGitHubRemote(existingRemote.url) : null;
  log.info(
    `${dim("git remote")} ${cyan(ctx.remoteName)}${
      existingRemote === null
        ? `  ${dim("(none)")}`
        : `  ${existingRemote.url}${existingInfo?.isGithub ? `  ${dim(`(${existingInfo.owner}/${existingInfo.repo})`)}` : `  ${yellow("(not a GitHub URL)")}`}`
    }`,
  );

  // ── D / E. decide path ───────────────────────────────────────────────────
  type Path = "use-existing" | "create-new" | "connect-existing";
  let path: Path;
  if (ctx.connectTarget !== null) {
    path = "connect-existing";
  } else if (
    existingRemote !== null &&
    existingInfo !== null &&
    existingInfo.isGithub === true
  ) {
    if (interactive) {
      const useThis = await askYesNo({
        message: `Use existing remote ${cyan(`${ctx.remoteName} = ${existingRemote.url}`)} (${existingInfo.owner}/${existingInfo.repo})?`,
        nonInteractive: false,
        defaultValue: true,
      });
      path = useThis ? "use-existing" : "create-new";
    } else {
      path = "use-existing";
    }
  } else if (existingRemote !== null && existingInfo !== null && !existingInfo.isGithub) {
    // existing non-github remote — propose new repo by default.
    if (interactive) {
      const overwrite = await askYesNo({
        message: `${ctx.remoteName} 이 GitHub URL 이 아니다. Create a new GitHub repo and overwrite ${ctx.remoteName}?`,
        nonInteractive: false,
        defaultValue: false,
      });
      path = overwrite ? "create-new" : "use-existing";
    } else {
      path = "use-existing";
    }
  } else {
    // no existing remote
    if (interactive) {
      const wantCreate = await askYesNo({
        message: "Create a new GitHub repo?  (No → 기존 GitHub URL 을 입력해 연결)",
        nonInteractive: false,
        defaultValue: true,
      });
      path = wantCreate ? "create-new" : "connect-existing";
    } else {
      path = ctx.ownerFlag.length > 0 && ctx.repoFlag.length > 0 ? "create-new" : "connect-existing";
    }
  }
  log.blank();
  log.info(bold(`Path: ${path}`));

  // ── package.json defaults (used by D and to render F preview) ────────────
  const pkg = await readPackageJson(cwd);
  if (pkg !== null) {
    log.info(`  ${dim("package.json")} ${cyan(pkg.path)}`);
  } else if (path === "create-new") {
    log.info(
      `  ${dim("package.json")} ${dim("(not found — repo name/description defaults will use folder name only)")}`,
    );
  }

  // ── execute the chosen path ──────────────────────────────────────────────
  if (path === "use-existing") {
    if (existingInfo !== null && existingInfo.isGithub) {
      plan.remoteUsed = true;
      plan.owner = existingInfo.owner ?? "";
      plan.repo = existingInfo.repo ?? "";
      plan.remoteUrl = existingRemote!.url;
    } else if (existingInfo !== null) {
      // user opted to keep a non-github remote — record best-effort
      plan.remoteUsed = true;
      plan.remoteUrl = existingRemote!.url;
    }
  } else if (path === "create-new") {
    const owner =
      ctx.ownerFlag.length > 0
        ? ctx.ownerFlag
        : (await ghCurrentUser()) ??
          (interactive
            ? await askInput({
                message: "GitHub owner (user or org)",
                nonInteractive: false,
                required: true,
              })
            : "");
    if (owner.length === 0) {
      log.error(
        `owner 를 결정하지 못했다. ${cyan("--owner <user>")} 를 명시하거나 ${cyan("gh auth login")} 후 다시 실행하세요.`,
      );
      process.exitCode = 1;
      return;
    }
    const defaultRepo =
      ctx.repoFlag.length > 0
        ? ctx.repoFlag
        : typeof pkg?.data.name === "string" && pkg.data.name.length > 0
          ? pkg.data.name
          : basename(cwd);
    const repoName = interactive
      ? await askInput({
          message: "Repository name",
          nonInteractive: false,
          default: defaultRepo,
          required: true,
        })
      : defaultRepo;
    if (repoName.length === 0) {
      log.error("repo name 이 비어 있다.");
      process.exitCode = 1;
      return;
    }
    const defaultDesc =
      typeof pkg?.data.description === "string" ? pkg.data.description : "";
    const description = interactive
      ? await askInput({
          message: "Description (Enter to skip)",
          nonInteractive: false,
          default: defaultDesc,
        })
      : defaultDesc;
    let resolvedVisibility: "public" | "private";
    if (ctx.forcedVisibility === "public" || ctx.forcedVisibility === "private") {
      resolvedVisibility = ctx.forcedVisibility;
    } else if (interactive) {
      resolvedVisibility = await pickVisibility();
    } else {
      resolvedVisibility = "private";
    }
    plan.owner = owner;
    plan.repo = repoName;
    plan.visibility = resolvedVisibility;
    plan.description = description;
    const argv = buildGhCreateRepoArgs({
      owner,
      repo: repoName,
      visibility: resolvedVisibility,
      source: cwd,
      remote: ctx.remoteName,
      description: description.length > 0 ? description : undefined,
    });
    plan.repoCreationCommand = `gh ${argv.join(" ")}`;
    plan.remoteUrl = `https://github.com/${owner}/${repoName}`;
    plan.repoCreated = true;
    plan.remoteAdded = existingRemote === null; // gh repo create adds remote when missing
    plan.remoteSetUrl = existingRemote !== null;
  } else {
    // connect-existing
    let target = ctx.connectTarget;
    if (target === null) {
      let ans = "";
      if (interactive) {
        ans = await askInput({
          message: "Existing GitHub URL or owner/repo slug",
          nonInteractive: false,
          required: true,
        });
      } else if (ctx.ownerFlag.length > 0 && ctx.repoFlag.length > 0) {
        ans = `${ctx.ownerFlag}/${ctx.repoFlag}`;
      } else {
        log.error(
          `non-interactive (dry-run / --yes / non-TTY) 인데 ${cyan("--connect <owner/repo or url>")} 또는 ${cyan("--owner <user> --repo <name>")} 가 없다.`,
        );
        log.info(
          dim(
            `  예: vibeops github init --dry-run --connect goodtek/vibeops`,
          ),
        );
        process.exitCode = 1;
        return;
      }
      target = parseGitHubRemote(ans);
    }
    if (target === null || !target.isGithub || target.owner === null || target.repo === null) {
      log.error(
        `유효한 GitHub URL / owner/repo 슬러그가 아니다. 예: ${cyan("https://github.com/<owner>/<repo>")} 또는 ${cyan("<owner>/<repo>")}`,
      );
      process.exitCode = 1;
      return;
    }
    plan.owner = target.owner;
    plan.repo = target.repo;
    plan.remoteUrl = target.httpsUrl ?? target.url;
    if (existingRemote === null) {
      plan.remoteAdded = true;
    } else if (existingRemote.url !== plan.remoteUrl) {
      let allow = false;
      if (interactive) {
        allow = await askYesNo({
          message: `${ctx.remoteName} 이미 존재 (${existingRemote.url}). 이 URL 로 set-url 할까?`,
          nonInteractive: false,
          defaultValue: false,
        });
      }
      if (!allow) {
        log.info(
          `${dim("·")} ${ctx.remoteName} 보존 — 새 URL 로 설정하지 않음.`,
        );
        plan.remoteUrl = existingRemote.url;
      } else {
        plan.remoteSetUrl = true;
      }
    } else {
      plan.remoteUsed = true;
    }
  }

  // ── F. package.json fields preview ───────────────────────────────────────
  if (plan.owner.length > 0 && plan.repo.length > 0) {
    if (ctx.packageUpdate && pkg !== null) {
      const patch = buildRepositoryFieldsPatch({ owner: plan.owner, repo: plan.repo });
      const before = {
        repositoryUrl: readRepositoryUrl(pkg.data),
        homepage: readHomepage(pkg.data),
        bugsUrl: readBugsUrl(pkg.data),
      };
      const fields = [
        { field: "repository.url", before: before.repositoryUrl, after: patch.repositoryUrl },
        { field: "homepage", before: before.homepage, after: patch.homepage },
        { field: "bugs.url", before: before.bugsUrl, after: patch.bugsUrl },
      ].filter((f) => f.before !== f.after);
      let allow = true;
      if (interactive && fields.length > 0) {
        const anyExisting = fields.some((f) => f.before.length > 0);
        if (anyExisting) {
          allow = await askYesNo({
            message: `package.json 의 repository / homepage / bugs 를 덮어쓸까? (${fields.length} field${fields.length === 1 ? "" : "s"} change)`,
            nonInteractive: false,
            defaultValue: false,
          });
        } else {
          allow = await askYesNo({
            message: `package.json 에 repository / homepage / bugs 필드를 채울까? (${fields.length} field${fields.length === 1 ? "" : "s"} new)`,
            nonInteractive: false,
            defaultValue: true,
          });
        }
      } else if (!interactive && fields.length > 0) {
        const anyExisting = fields.some((f) => f.before.length > 0);
        // default in non-interactive: write new fields, but never silently overwrite existing ones unless --yes.
        allow = !anyExisting || explicitYes;
      }
      if (allow && fields.length > 0) {
        plan.packageWrites = patch;
        plan.packageDiffs = fields;
      } else if (!allow && fields.length > 0) {
        if (interactive) {
          log.info(`${dim("·")} package.json update 건너뜀 (사용자 선택).`);
        } else {
          log.info(
            `${dim("·")} package.json update 건너뜀 (기존 값 보존 — 덮어쓰려면 ${cyan("--yes")} 또는 interactive 실행).`,
          );
        }
      }
    } else if (!ctx.packageUpdate) {
      log.info(`${dim("·")} --no-package-update — package.json 수정 0건.`);
    }
  }

  // ── render plan ──────────────────────────────────────────────────────────
  log.blank();
  log.info(bold("Plan"));
  renderPlan(ctx, plan);

  if (dryRun) {
    log.blank();
    log.info(dim("dry-run — no commands executed, no files written."));
    log.info(bold("Next steps"));
    log.info(
      `  1) Drop ${cyan("--dry-run")} to apply this plan (gh / git / config / package.json mutation).`,
    );
    log.info(
      `  2) After commit, run ${cyan(`git push -u ${ctx.remoteName} <branch>`)} manually — VibeOps does not auto-push.`,
    );
    log.info(`  3) Verify with ${cyan("vibeops github status")}.`);
    return;
  }

  // ── execute ──────────────────────────────────────────────────────────────
  if (plan.repoCreated) {
    log.step(`gh repo create ${plan.owner}/${plan.repo}`);
    const res = await ghCreateRepo({
      owner: plan.owner,
      repo: plan.repo,
      visibility: plan.visibility === "" ? "private" : plan.visibility,
      source: cwd,
      remote: ctx.remoteName,
      description: plan.description.length > 0 ? plan.description : undefined,
    });
    if (!res.ok) {
      log.error(`gh repo create 실패 (exit ${res.exitCode ?? "?"}).`);
      if (typeof res.stderr === "string" && res.stderr.length > 0) {
        log.info(dim(res.stderr.trim()));
      }
      process.exitCode = res.exitCode ?? 1;
      return;
    }
    log.ok(`created ${plan.owner}/${plan.repo}  ${dim(plan.visibility)}`);
  } else if (plan.remoteAdded && plan.remoteUrl !== null) {
    log.step(`git remote add ${ctx.remoteName} ${plan.remoteUrl}`);
    try {
      await gitRemoteAdd(cwd, ctx.remoteName, plan.remoteUrl);
      log.ok(`added remote ${ctx.remoteName}`);
    } catch (err) {
      log.error(`git remote add 실패: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }
  } else if (plan.remoteSetUrl && plan.remoteUrl !== null) {
    log.step(`git remote set-url ${ctx.remoteName} ${plan.remoteUrl}`);
    try {
      await gitRemoteSetUrl(cwd, ctx.remoteName, plan.remoteUrl);
      log.ok(`updated remote ${ctx.remoteName}`);
    } catch (err) {
      log.error(`git remote set-url 실패: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }
  }

  // ── .vibeops.json ───────────────────────────────────────────────────────
  const githubPatch: Partial<GithubConfig> = {
    enabled: true,
    mode: "gh-cli",
    owner: plan.owner,
    repo: plan.repo,
    remote: ctx.remoteName,
    visibility: plan.visibility === "" ? guessVisibilityFromExistingConfig(baseConfig.github) : plan.visibility,
    url: plan.remoteUrl ?? "",
  };
  const { merged, changed } = mergeGithubConfig(baseConfig, githubPatch);
  plan.configChanged = changed;
  if (changed) {
    await writeConfig(cwd, merged);
    log.ok(".vibeops.json updated  (github section)");
  } else {
    log.info(dim(".vibeops.json unchanged"));
  }

  // ── package.json ────────────────────────────────────────────────────────
  if (plan.packageWrites !== null && plan.packageDiffs.length > 0) {
    const res = await updatePackageRepositoryFields({
      cwd,
      patch: { owner: plan.owner, repo: plan.repo },
      dryRun: false,
    });
    if (!res.ok) {
      log.warn(`package.json 갱신 실패: ${res.reason ?? "unknown"}`);
    } else if (res.written) {
      log.ok(`package.json updated  ${dim(`(${res.diffs.length} field${res.diffs.length === 1 ? "" : "s"})`)}`);
    } else {
      log.info(dim(`package.json unchanged`));
    }
  }

  log.blank();
  log.info(bold("Done"));
  log.info(
    `  · git remote ${ctx.remoteName} → ${cyan(plan.remoteUrl ?? "(unset)")}`,
  );
  log.info(
    `  · ${cyan("vibeops github status")} 로 결과 검증.`,
  );
  log.info(
    `  · push 는 자동으로 하지 않는다. 준비되면 ${cyan(`git push -u ${ctx.remoteName} <branch>`)} 를 직접 실행.`,
  );
}

function guessVisibilityFromExistingConfig(prev?: GithubConfig): GithubVisibility {
  return prev?.visibility ?? "";
}

async function pickVisibility(): Promise<"public" | "private"> {
  return await select<"public" | "private">({
    message: "Repository visibility?",
    choices: [
      { name: "private", value: "private" },
      { name: "public", value: "public" },
    ],
    default: "private",
    loop: false,
    pageSize: 2,
  });
}

function renderPlan(ctx: InitContext, plan: InitPlan): void {
  if (plan.repoCreated) {
    log.info(
      `  ${green("+")} gh repo create ${cyan(`${plan.owner}/${plan.repo}`)} ${dim(`--${plan.visibility === "" ? "private" : plan.visibility} --source=${ctx.cwd} --remote=${ctx.remoteName}`)}`,
    );
    if (plan.description.length > 0) {
      log.info(`      ${dim("--description")} ${plan.description}`);
    }
    log.info(`      ${dim("→")} 이 명령이 ${ctx.remoteName} remote 도 함께 등록한다.`);
  }
  if (plan.remoteAdded && !plan.repoCreated && plan.remoteUrl !== null) {
    log.info(`  ${green("+")} git remote add ${cyan(ctx.remoteName)} ${plan.remoteUrl}`);
  }
  if (plan.remoteSetUrl && plan.remoteUrl !== null) {
    log.info(`  ${green("~")} git remote set-url ${cyan(ctx.remoteName)} ${plan.remoteUrl}`);
  }
  if (plan.remoteUsed && !plan.remoteAdded && !plan.remoteSetUrl && !plan.repoCreated) {
    log.info(`  ${dim("·")} keep existing remote ${cyan(ctx.remoteName)} ${plan.remoteUrl ?? ""}`);
  }
  if (plan.packageWrites !== null && plan.packageDiffs.length > 0) {
    log.info(`  ${green("~")} package.json fields:`);
    for (const f of plan.packageDiffs) {
      log.info(
        `      ${dim(f.field.padEnd(16, " "))} ${dim(f.before.length === 0 ? "(empty)" : f.before)} → ${cyan(f.after)}`,
      );
    }
  } else if (!ctx.packageUpdate) {
    log.info(`  ${dim("·")} package.json untouched  ${dim("(--no-package-update)")}`);
  }
  log.info(`  ${green("~")} .vibeops.json github:`);
  log.info(
    `      ${dim("owner".padEnd(16, " "))} ${cyan(plan.owner.length > 0 ? plan.owner : "(none)")}`,
  );
  log.info(
    `      ${dim("repo".padEnd(16, " "))} ${cyan(plan.repo.length > 0 ? plan.repo : "(none)")}`,
  );
  log.info(`      ${dim("remote".padEnd(16, " "))} ${cyan(ctx.remoteName)}`);
  log.info(
    `      ${dim("visibility".padEnd(16, " "))} ${cyan(plan.visibility.length > 0 ? plan.visibility : "(unknown)")}`,
  );
  log.info(
    `      ${dim("url".padEnd(16, " "))} ${cyan(plan.remoteUrl ?? "(unset)")}`,
  );
}
