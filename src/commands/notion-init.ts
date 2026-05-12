import { password, select } from "@inquirer/prompts";
import { resolve, relative } from "node:path";

import {
  mergeNotionConfig,
  readConfig,
  writeConfig,
} from "../lib/config.js";
import { pathExists, readText, writeText } from "../lib/filesystem.js";
import { askInput, askYesNo } from "../lib/inquirer-helpers.js";
import { bold, cyan, dim, green, log, red, yellow } from "../lib/logger.js";
import {
  createNotionClient,
  notionApiError,
  type NotionApiError,
  type NotionClient,
} from "../lib/notion-client.js";
import {
  buildChoiceLabel,
  discoverInlineDatabasesFromPage,
  discoverNotionDatabases,
  NOTION_DISCOVERY_MAX,
  NOTION_PAGE_SCAN_MAX_BLOCKS,
  sortForKind,
  type DatabaseScore,
  type NotionDatabaseChoice,
  type NotionPageChoice,
} from "../lib/notion-discovery.js";
import {
  inspectEnvFile,
  loadNotionEnv,
  maskToken,
  writeNotionTokenToEnvFile,
} from "../lib/notion-env.js";
import {
  PROJECTS_DB_PROPERTIES,
  TASKS_DB_PROPERTIES,
  type PropertyRequirement,
} from "../lib/notion-schema.js";
import { resolveNotionDataSourceTarget } from "../lib/notion-target.js";
import { projectPaths } from "../lib/paths.js";
import type { NotionConfig } from "../types/config.js";

const MANUAL_VALUE = "__manual__";
const SKIP_VALUE = "__skip__";

const NOTION_TOKEN_LINE = "NOTION_TOKEN=";

export interface NotionInitOptions {
  dryRun?: boolean;
  enable?: boolean;
  projectsDb?: string;
  tasksDb?: string;
  nonInteractive?: boolean;
  cwd?: string;
}

function relDisplay(root: string, abs: string): string {
  const r = relative(root, abs);
  return r.length === 0 ? "." : r;
}

function renderRequiredProps(label: string, props: readonly PropertyRequirement[]): void {
  log.info(bold(label));
  for (const p of props) {
    const types = p.allowedTypes.join(" | ");
    log.info(`  · ${p.name}  ${dim(`(${types})`)}  ${dim("— " + p.description)}`);
  }
}

export async function notionInitCommand(options: NotionInitOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const dryRun = options.dryRun === true;
  const explicitlyNonInteractive = options.nonInteractive === true;
  const isTty = process.stdin.isTTY === true;
  const interactive = !dryRun && !explicitlyNonInteractive && isTty;

  log.info(bold("vibeops notion init"));
  log.info(`  ${dim("cwd")}        ${cwd}`);
  log.info(
    `  ${dim("mode")}       ${
      dryRun
        ? "dry-run (no file writes)"
        : interactive
          ? "interactive (arrow keys + Enter, no y/n typing)"
          : "non-interactive (flags only)"
    }`,
  );
  log.blank();

  if (!(await pathExists(paths.config))) {
    log.error(
      `.vibeops.json is missing. Run ${cyan("vibeops init")} first to install the VibeOps workflow files.`,
    );
    log.info(dim(`  expected at: ${relDisplay(cwd, paths.config)}`));
    process.exitCode = 1;
    return;
  }

  const config = await readConfig(paths.root);
  if (config === null) {
    log.error(
      `Failed to read .vibeops.json (schema mismatch or invalid JSON). Inspect the file, or re-run ${cyan("vibeops init")} to recreate it.`,
    );
    process.exitCode = 1;
    return;
  }

  const currentNotion: NotionConfig = config.notion ?? {
    enabled: false,
    projectsTargetId: "",
    tasksTargetId: "",
    projectsDatabaseId: "",
    tasksDatabaseId: "",
  };

  // Resolve patch values from the priority chain:
  //   explicit CLI flags  →  interactive answers  →  current config value
  const patch: Partial<NotionConfig> = {};
  let enabled = currentNotion.enabled;
  if (options.enable === true) {
    patch.enabled = true;
    enabled = true;
  }
  let projectsDb = currentNotion.projectsDatabaseId;
  let projectsTarget = currentNotion.projectsTargetId;
  if (typeof options.projectsDb === "string" && options.projectsDb.length > 0) {
    projectsDb = options.projectsDb.trim();
    patch.projectsDatabaseId = projectsDb;
  }
  let tasksDb = currentNotion.tasksDatabaseId;
  let tasksTarget = currentNotion.tasksTargetId;
  if (typeof options.tasksDb === "string" && options.tasksDb.length > 0) {
    tasksDb = options.tasksDb.trim();
    patch.tasksDatabaseId = tasksDb;
  }

  let tokenToWrite: string | null = null;
  let willOverwriteToken = false;
  let envSnapshotKnown = false;
  let envHadToken = false;

  if (interactive) {
    // ── Q1. Use Notion dashboard sync? ─────────────────────────────────────
    if (options.enable !== true) {
      enabled = await askYesNo({
        message:
          "Use Notion dashboard sync?  (Notion as a human dashboard — Git docs/tasks remains the source of truth)",
        nonInteractive: false,
        defaultValue: currentNotion.enabled,
      });
      patch.enabled = enabled;
    } else {
      log.info(`${dim("·")} --enable provided → notion.enabled = true (skip question)`);
    }

    if (enabled) {
      // ── Q2. Paste NOTION_TOKEN now? (moved up — token gates DB search) ──
      log.blank();
      log.info(
        dim(
          "  NOTION_TOKEN is a Notion integration secret. VibeOps never prints the token value and only writes it to .vibeops.env (gitignored).",
        ),
      );
      const envSnap = await inspectEnvFile(cwd);
      envSnapshotKnown = true;
      envHadToken =
        envSnap.exists && envSnap.currentToken !== null && envSnap.currentToken.length > 0;
      const pasteNow = await askYesNo({
        message: envHadToken
          ? "Paste NOTION_TOKEN now?  (.vibeops.env already has a token — Yes will ask whether to overwrite next)"
          : "Paste NOTION_TOKEN now?  (Yes → save into .vibeops.env · No → edit the file manually later)",
        nonInteractive: false,
        defaultValue: false,
      });
      if (pasteNow) {
        let go = true;
        if (envHadToken) {
          // ── Q3. Overwrite or update existing NOTION_TOKEN? ───────────────
          const overwrite = await askYesNo({
            message: `Overwrite existing NOTION_TOKEN?  (current: ${maskToken(
              envSnap.currentToken!,
            )})`,
            nonInteractive: false,
            defaultValue: false,
          });
          willOverwriteToken = overwrite;
          go = overwrite;
        }
        if (go) {
          const entered = await password({
            message:
              "Enter NOTION_TOKEN  (input is hidden, starts with 'secret_…' or 'ntn_…')",
            mask: "*",
            validate: (v: string) =>
              v.trim().length === 0
                ? "Empty. Copy the secret from Notion → Settings → Integrations."
                : true,
          });
          tokenToWrite = entered.trim();
        }
      }
      log.blank();

      // ── Search-driven DB selection ───────────────────────────────────────
      //
      // We resolve the "effective token" for THIS run (newly typed, or
      // already present in .vibeops.env / process.env) so the user can use
      // notion init purely to pick DBs without re-entering a token.
      //
      // We DO NOT prompt to search if the user already gave us both DBs via
      // CLI flags — those wins are preserved.
      const needProjects =
        projectsTarget.length === 0 &&
        (typeof options.projectsDb !== "string" || options.projectsDb.length === 0) &&
        patch.projectsTargetId === undefined &&
        patch.projectsDatabaseId === undefined;
      const needTasks =
        tasksTarget.length === 0 &&
        (typeof options.tasksDb !== "string" || options.tasksDb.length === 0) &&
        patch.tasksTargetId === undefined &&
        patch.tasksDatabaseId === undefined;

      const effectiveToken = await resolveEffectiveToken(cwd, tokenToWrite);

      if ((needProjects || needTasks) && effectiveToken !== null) {
        const wantSearch = await askYesNo({
          message:
            "Search accessible Notion databases now?  (Yes → call /v1/search and pick from the list · No → enter the 32-char id manually)",
          nonInteractive: false,
          defaultValue: true,
        });
        if (wantSearch) {
          const picks = await pickDatabasesViaSearch({
            token: effectiveToken,
            needProjects,
            needTasks,
            currentProjects: projectsTarget.length > 0 ? projectsTarget : projectsDb,
            currentTasks: tasksTarget.length > 0 ? tasksTarget : tasksDb,
          });
          if (picks.projectsTarget !== null) {
            projectsTarget = picks.projectsTarget;
            patch.projectsTargetId = projectsTarget;
          }
          if (picks.tasksTarget !== null) {
            tasksTarget = picks.tasksTarget;
            patch.tasksTargetId = tasksTarget;
          }
          if (picks.projectsDatabase !== null) {
            projectsDb = picks.projectsDatabase;
            patch.projectsDatabaseId = projectsDb;
          }
          if (picks.tasksDatabase !== null) {
            tasksDb = picks.tasksDatabase;
            patch.tasksDatabaseId = tasksDb;
          }
        }
      } else if ((needProjects || needTasks) && effectiveToken === null) {
        log.info(
          dim(
            "  No Notion token available — skipping DB search. Enter the 32-char id manually (or leave empty to fill in later).",
          ),
        );
      }

      // ── Manual fallback for any DB id still empty ────────────────────────
      if (
        needProjects &&
        (patch.projectsTargetId ?? projectsTarget).length === 0 &&
        (patch.projectsDatabaseId ?? projectsDb).length === 0
      ) {
        const ans = await askInput({
          message:
            "Projects data source ID  (fallback: paste a data_source id, leave empty to fill later)",
          nonInteractive: false,
          default: projectsTarget.length > 0 ? projectsTarget : undefined,
        });
        if (ans.length > 0) {
          projectsTarget = ans;
          patch.projectsTargetId = projectsTarget;
        }
      }
      if (
        needTasks &&
        (patch.tasksTargetId ?? tasksTarget).length === 0 &&
        (patch.tasksDatabaseId ?? tasksDb).length === 0
      ) {
        const ans = await askInput({
          message:
            "Tasks data source ID  (fallback: paste a data_source id, leave empty to fill later)",
          nonInteractive: false,
          default: tasksTarget.length > 0 ? tasksTarget : undefined,
        });
        if (ans.length > 0) {
          tasksTarget = ans;
          patch.tasksTargetId = tasksTarget;
        }
      }

      // ── Q4. Continue without database IDs? (only if both empty) ──────────
      if (
        projectsTarget.length === 0 &&
        projectsDb.length === 0 &&
        tasksTarget.length === 0 &&
        tasksDb.length === 0
      ) {
        const proceed = await askYesNo({
          message:
            "Continue without database IDs?  (No → cancel, create the DBs, and re-run. Yes → enable now and fill in the IDs later)",
          nonInteractive: false,
          defaultValue: false,
        });
        if (!proceed) {
          log.blank();
          log.info(
            `${yellow("!")} Cancelled. Create the Projects/Tasks DBs in Notion, copy the 32-char ids, then re-run ${cyan(
              "vibeops notion init",
            )} or ${cyan(
              "vibeops notion init --projects-db <id> --tasks-db <id>",
            )}.`,
          );
          process.exitCode = 0;
          return;
        }
      }
    } else {
      log.info(
        dim(
          "  notion.enabled = false — skipping DB id and NOTION_TOKEN prompts.",
        ),
      );
    }
    log.blank();
  }

  const { merged, changed: notionChanged } = mergeNotionConfig(config, patch);

  log.info(bold("Plan: .vibeops.json"));
  if (config.notion === undefined) {
    log.info(`  ${green("+")} add ${cyan("notion")} section (enabled=${merged.notion!.enabled})`);
  }
  diffNotionSection(config.notion, merged.notion!);
  log.blank();

  log.info(bold("Plan: .vibeops.env.example"));
  const envExampleAbs = paths.envExample;
  const existingExample = (await pathExists(envExampleAbs))
    ? await readText(envExampleAbs)
    : null;
  const exampleNeedsToken = !hasLine(existingExample, NOTION_TOKEN_LINE);
  const nextExample = ensureEnvLine(existingExample, NOTION_TOKEN_LINE);
  if (existingExample === null) {
    log.info(`  ${green("+")} create ${cyan(relDisplay(cwd, envExampleAbs))} with ${cyan(NOTION_TOKEN_LINE)}`);
  } else if (exampleNeedsToken) {
    log.info(`  ${green("+")} append ${cyan(NOTION_TOKEN_LINE)} to ${cyan(relDisplay(cwd, envExampleAbs))}`);
  } else {
    log.info(`  ${dim("·")} ${cyan(NOTION_TOKEN_LINE)} already present in ${cyan(relDisplay(cwd, envExampleAbs))}`);
  }
  log.blank();

  if (interactive && tokenToWrite !== null) {
    log.info(bold("Plan: .vibeops.env  (local secret · NEVER COMMITTED)"));
    if (envHadToken && willOverwriteToken) {
      log.info(`  ${green("~")} overwrite ${cyan("NOTION_TOKEN=")} (${maskToken(tokenToWrite)})`);
    } else if (envSnapshotKnown && (await pathExists(paths.envExample)) === false) {
      log.info(`  ${green("+")} create .vibeops.env with ${cyan("NOTION_TOKEN=")} (${maskToken(tokenToWrite)})`);
    } else {
      log.info(`  ${green("+")} write ${cyan("NOTION_TOKEN=")} line (${maskToken(tokenToWrite)})`);
    }
    log.blank();
  }

  log.info(bold("Required Notion DB schema (create manually in Notion)"));
  log.info(
    dim(
      "  VibeOps never creates Notion databases. Create the properties below by hand, then share the DBs with the integration.",
    ),
  );
  log.blank();
  renderRequiredProps("Projects DB", PROJECTS_DB_PROPERTIES);
  log.blank();
  renderRequiredProps("Tasks DB", TASKS_DB_PROPERTIES);
  log.blank();

  log.info(bold("Security"));
  log.info(`  ${dim("·")} The raw ${cyan("NOTION_TOKEN")} value is never printed to stdout (interactive input is password-masked).`);
  log.info(`  ${dim("·")} ${cyan(".vibeops.env")} is gitignored — never commit it.`);
  log.info(`  ${dim("·")} ${cyan(".vibeops.env")} is only created when you answer ${cyan("Paste NOTION_TOKEN now? Yes")} in the interactive flow.`);
  log.blank();

  if (dryRun) {
    log.info(dim("dry-run — no files were written."));
    log.blank();
    log.info(bold("Next steps"));
    log.info(`  1) Create the Projects / Tasks DBs in Notion and share them with the integration.`);
    log.info(`  2) Re-run ${cyan("vibeops notion init")} interactively, or supply ${cyan("--enable --projects-db <id> --tasks-db <id>")} in one line.`);
    log.info(`  3) Validate with ${cyan("vibeops notion test")}.`);
    return;
  }

  if (notionChanged) {
    await writeConfig(paths.root, merged);
    log.ok(`updated ${relDisplay(cwd, paths.config)}`);
  } else {
    log.info(dim(`unchanged ${relDisplay(cwd, paths.config)}`));
  }

  if (existingExample === null || exampleNeedsToken) {
    await writeText(envExampleAbs, nextExample);
    log.ok(`updated ${relDisplay(cwd, envExampleAbs)}`);
  } else {
    log.info(dim(`unchanged ${relDisplay(cwd, envExampleAbs)}`));
  }

  if (interactive && tokenToWrite !== null) {
    const res = await writeNotionTokenToEnvFile(cwd, tokenToWrite);
    if (res.created) {
      log.ok(`created  .vibeops.env  ${dim("(NOTION_TOKEN saved · masked)")}`);
    } else if (res.replaced) {
      log.ok(`updated  .vibeops.env  ${dim("(NOTION_TOKEN replaced · masked)")}`);
    } else {
      log.ok(`appended .vibeops.env  ${dim("(NOTION_TOKEN added · masked)")}`);
    }
    log.info(dim("         The token value is never displayed on stdout."));
  }

  log.blank();
  log.info(bold("Next steps"));
  log.info(`  1) Create the Projects / Tasks DB properties listed above in Notion.`);
  log.info(`  2) Share the DBs with the integration via the page ⋯ menu → ${cyan("Connections")}.`);
  if (!interactive || tokenToWrite === null) {
    log.info(`  3) Create a local ${cyan(".vibeops.env")} with ${cyan("NOTION_TOKEN=secret_…")}.`);
    log.info(`     ${dim(".vibeops.env is gitignored — never commit it.")}`);
  } else {
    log.info(`  3) ${dim(".vibeops.env is gitignored — never commit it.")}`);
  }
  if (!merged.notion!.enabled) {
    log.info(`  4) When ready, enable with ${cyan("vibeops notion init --enable")} and validate with ${cyan("vibeops notion test")}.`);
  } else {
    log.info(`  4) Validate with ${cyan("vibeops notion test")}.`);
  }
  if (
    merged.notion!.enabled &&
    (effectiveProjectsTarget(merged.notion!).length === 0 ||
      effectiveTasksTarget(merged.notion!).length === 0)
  ) {
    log.blank();
    log.info(
      `${yellow("!")} notion.enabled = true but ${
        effectiveProjectsTarget(merged.notion!).length === 0 ? "projectsTargetId/projectsDatabaseId " : ""
      }${
        effectiveTasksTarget(merged.notion!).length === 0 ? "tasksTargetId/tasksDatabaseId " : ""
      }is empty. Fill it in with ${cyan("vibeops notion init --projects-db <id> --tasks-db <id>")}.`,
    );
  }
}

function effectiveProjectsTarget(notion: NotionConfig): string {
  return notion.projectsTargetId.length > 0
    ? notion.projectsTargetId
    : notion.projectsDatabaseId;
}

function effectiveTasksTarget(notion: NotionConfig): string {
  return notion.tasksTargetId.length > 0 ? notion.tasksTargetId : notion.tasksDatabaseId;
}

/**
 * Pick the auth token to use for THIS interactive run, without writing it.
 *
 *   1. If the user just typed a new one in `Paste NOTION_TOKEN now?`, use it.
 *   2. Otherwise load whatever is currently in `.vibeops.env` /
 *      `process.env.NOTION_TOKEN` so the user can re-run `notion init` purely
 *      to re-pick DBs.
 *
 * Returns `null` when no token can be resolved — callers MUST fall back to
 * manual id input in that case.
 */
async function resolveEffectiveToken(
  cwd: string,
  freshlyTyped: string | null,
): Promise<string | null> {
  if (typeof freshlyTyped === "string" && freshlyTyped.length > 0) return freshlyTyped;
  const env = await loadNotionEnv(cwd);
  return env.token;
}

interface SearchPicks {
  projectsTarget: string | null;
  tasksTarget: string | null;
  projectsDatabase: string | null;
  tasksDatabase: string | null;
}

interface PickInputs {
  token: string;
  needProjects: boolean;
  needTasks: boolean;
  currentProjects: string;
  currentTasks: string;
}

async function pickDatabasesViaSearch(inputs: PickInputs): Promise<SearchPicks> {
  log.info(dim("  → Calling Notion /v1/search (read-only, 5s timeout, page_size ≤ 50)…"));
  let client: NotionClient;
  try {
    client = await createNotionClient(inputs.token);
  } catch (err) {
    const apiErr = sanitiseApiError(err);
    log.warn(`Failed to load @notionhq/client — ${apiErr.message}`);
    log.info(
      dim(
        "  Skipping search. Enter the 32-char id manually (or fill it in later with `vibeops notion init --projects-db <id> --tasks-db <id>`).",
      ),
    );
    return {
      projectsTarget: null,
      tasksTarget: null,
      projectsDatabase: null,
      tasksDatabase: null,
    };
  }

  let dataSources: NotionDatabaseChoice[] = [];
  let pages: NotionPageChoice[] = [];
  let dataSourcesTruncated = false;
  let pagesTruncated = false;
  try {
    const combined = await discoverNotionDatabases(client);
    dataSources = combined.dataSources;
    pages = combined.pages;
    dataSourcesTruncated = combined.dataSourcesTruncated;
    pagesTruncated = combined.pagesTruncated;
    if (combined.dataSourceErrored) {
      log.warn(
        "Notion rejected the \"data_source\" object filter — continuing in compatibility mode.",
      );
      log.info(
        dim(
          "  (Internal: current Notion API expects search filter \"data_source\"; the @notionhq/client SDK may be outdated.)",
        ),
      );
    }
    for (const w of combined.warnings) {
      log.info(dim(`  · ${w}`));
    }
  } catch (err) {
    const apiErr = sanitiseApiError(err);
    log.warn(`Notion search failed — ${explainSearchError(apiErr)}`);
    log.info(
      dim(
        "  Skipping search. Enter the 32-char id manually (or re-run later).",
      ),
    );
    return {
      projectsTarget: null,
      tasksTarget: null,
      projectsDatabase: null,
      tasksDatabase: null,
    };
  }

  // Candidate pool used by both the Projects-DB and Tasks-DB pickers.
  let candidates: NotionDatabaseChoice[] = dataSources;

  if (dataSources.length > 0) {
    log.info(
      dim(
        `  · ${dataSources.length} database${dataSources.length === 1 ? "" : "s"} accessible to this integration${
          dataSourcesTruncated ? ` (capped at ${NOTION_DISCOVERY_MAX} — Notion has more)` : ""
        }`,
      ),
    );
  } else {
    // No data sources surfaced. Show the corrected guidance (this is the
    // common case for inline DBs that live inside a shared parent page).
    log.info(
      yellow(
        "  VibeOps can access pages, but no data sources were returned by Notion search.\n" +
          "  If your databases are inline, select the parent page so VibeOps can scan its child blocks.\n" +
          "  If they still do not appear, open each database as a page and add the VibeOps integration directly.",
      ),
    );

    if (pages.length === 0) {
      log.info(
        dim(
          "  · No accessible pages either — falling back to manual 32-char id input.",
        ),
      );
      return {
        projectsTarget: null,
        tasksTarget: null,
        projectsDatabase: null,
        tasksDatabase: null,
      };
    }
    log.info(
      dim(
        `  · ${pages.length} page${pages.length === 1 ? "" : "s"} accessible — pick a parent page to scan its 1-depth blocks (cap ${NOTION_PAGE_SCAN_MAX_BLOCKS} blocks)${
          pagesTruncated ? ` (capped at ${NOTION_DISCOVERY_MAX} pages — Notion has more)` : ""
        }`,
      ),
    );
    const inlineCandidates = await pickPageAndScanForInlineDatabases({
      client,
      pages,
    });
    if (inlineCandidates.length === 0) {
      log.info(
        dim(
          "  · No inline databases found in the selected page — falling back to manual 32-char id input.",
        ),
      );
      return {
        projectsTarget: null,
        tasksTarget: null,
        projectsDatabase: null,
        tasksDatabase: null,
      };
    }
    candidates = inlineCandidates;
    log.info(
      dim(
        `  · Found ${inlineCandidates.length} inline database candidate${inlineCandidates.length === 1 ? "" : "s"}.`,
      ),
    );
  }

  const picks: SearchPicks = {
    projectsTarget: null,
    tasksTarget: null,
    projectsDatabase: null,
    tasksDatabase: null,
  };
  if (inputs.needProjects) {
    const pick = await pickOneDatabase({
      kind: "projects",
      databases: candidates,
      current: inputs.currentProjects,
      client,
    });
    if (pick !== null) {
      picks.projectsTarget = pick.targetId;
      if (pick.databaseId !== null) picks.projectsDatabase = pick.databaseId;
    }
  } else {
    log.info(dim("  · Projects DB is already configured — skipping selection."));
  }
  if (inputs.needTasks) {
    const pick = await pickOneDatabase({
      kind: "tasks",
      databases: candidates,
      current: inputs.currentTasks,
      client,
    });
    if (pick !== null) {
      picks.tasksTarget = pick.targetId;
      if (pick.databaseId !== null) picks.tasksDatabase = pick.databaseId;
    }
  } else {
    log.info(dim("  · Tasks DB is already configured — skipping selection."));
  }
  return picks;
}

interface PageScanInputs {
  client: NotionClient;
  pages: readonly NotionPageChoice[];
}

const SCAN_SKIP_VALUE = "__skip_scan__";

/**
 * Show a select prompt of accessible pages, scan the one the user picks for
 * inline database / data_source child blocks, and normalize the results into
 * `NotionDatabaseChoice[]` so the rest of the picker can reuse them.
 *
 * Returns `[]` if the user chooses to skip or no inline databases are found.
 */
async function pickPageAndScanForInlineDatabases(
  inputs: PageScanInputs,
): Promise<NotionDatabaseChoice[]> {
  const choices: { name: string; value: string }[] = inputs.pages.map((p) => ({
    name: `${p.title}  (${maskId(p.id)})`,
    value: p.id,
  }));
  choices.push({
    name: "Skip page scan — fall back to manual 32-char id input",
    value: SCAN_SKIP_VALUE,
  });
  const picked = await select<string>({
    message: "Select a page to scan for inline databases",
    choices,
    default: inputs.pages[0]?.id ?? SCAN_SKIP_VALUE,
    loop: false,
    pageSize: 10,
  });
  if (picked === SCAN_SKIP_VALUE) {
    log.info(dim("  · page scan skip"));
    return [];
  }
  const page = inputs.pages.find((p) => p.id === picked);
  const parentTitle = page?.title;
  log.info(
    dim(
      `  → blocks.children.list(${maskId(picked)}) — 1-depth scan (cap ${NOTION_PAGE_SCAN_MAX_BLOCKS} blocks, read-only)…`,
    ),
  );
  try {
    const inline = await discoverInlineDatabasesFromPage(
      inputs.client,
      picked,
      parentTitle,
    );
    return inline;
  } catch (err) {
    const apiErr = sanitiseApiError(err);
    log.warn(`Page scan failed — ${explainSearchError(apiErr)}`);
    return [];
  }
}

interface PickOneInputs {
  kind: "projects" | "tasks";
  databases: readonly NotionDatabaseChoice[];
  current: string;
  client: NotionClient;
}

interface PickedTarget {
  /** Always the id VibeOps should use for test/sync; preferably data_source. */
  targetId: string;
  /** Optional child database/container id for compatibility/debug. */
  databaseId: string | null;
}

async function pickOneDatabase(inputs: PickOneInputs): Promise<PickedTarget | null> {
  const { ordered, recommendedIds } = sortForKind(inputs.kind, inputs.databases);
  const recommendedSet = new Set(recommendedIds);
  const label = inputs.kind === "projects" ? "Projects DB" : "Tasks DB";
  const choices: { name: string; value: string; description?: string }[] = ordered.map((c) => ({
    name: buildChoiceLabel({
      kind: inputs.kind,
      database: c,
      isRecommended: recommendedSet.has(c.id),
    }),
    value: c.id,
  }));
  choices.push({ name: "Enter data source ID manually…", value: MANUAL_VALUE });
  choices.push({ name: "Skip for now (use existing value or leave empty)", value: SKIP_VALUE });

  const defaultValue =
    inputs.current.length > 0 && ordered.some((c) => c.id === inputs.current)
      ? inputs.current
      : recommendedIds[0] ?? ordered[0]?.id ?? MANUAL_VALUE;

  const picked = await select<string>({
    message: `Select ${label}  (arrow keys + Enter — recommended: ${recommendedIds.length})`,
    choices,
    default: defaultValue,
    loop: false,
    pageSize: 10,
  });

  if (picked === SKIP_VALUE) {
    log.info(dim(`  · ${label} skipped — keeping existing value (${inputs.current.length > 0 ? maskId(inputs.current) : "(empty)"})`));
    return null;
  }
  if (picked === MANUAL_VALUE) {
    const ans = await askInput({
      message: `${label} data source ID  (last fallback; Notion data_source id)`,
      nonInteractive: false,
      default: inputs.current.length > 0 ? inputs.current : undefined,
    });
    if (ans.length === 0) {
      log.info(dim(`  · ${label} empty input — keeping existing value`));
      return null;
    }
    await softValidateSchema(inputs.client, ans, inputs.kind);
    return { targetId: ans, databaseId: null };
  }
  const chosen = ordered.find((c) => c.id === picked) ?? null;
  if (chosen !== null) {
    const matched = inputs.kind === "projects" ? chosen.projectsScore : chosen.tasksScore;
    renderImmediateSchemaCheck(inputs.kind, chosen, matched);
    return {
      targetId: chosen.dataSourceId ?? chosen.id,
      databaseId: chosen.databaseId ?? null,
    };
  }
  return { targetId: picked, databaseId: null };
}

function maskId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function renderImmediateSchemaCheck(
  kind: "projects" | "tasks",
  db: NotionDatabaseChoice,
  score: DatabaseScore,
): void {
  if (score.total === 0) {
    log.info(
      dim(
        `      · No properties in the search response to verify ${kind} schema — re-validate with 'notion test'.`,
      ),
    );
    return;
  }
  if (score.matched === score.total) {
    log.info(`      ${green("✓")} ${kind} schema OK (${score.matched}/${score.total} matched)`);
    return;
  }
  const required = kind === "projects" ? PROJECTS_DB_PROPERTIES : TASKS_DB_PROPERTIES;
  const props = db.properties ?? {};
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const req of required) {
    const p = props[req.name] as { type?: string } | undefined;
    if (p === undefined || p === null) {
      missing.push(req.name);
      continue;
    }
    if (!req.allowedTypes.includes((p.type ?? "") as never)) {
      mismatched.push(`${req.name} (${p.type ?? "?"} ≠ ${req.allowedTypes.join("|")})`);
    }
  }
  log.warn(
    `${kind} schema partial (${score.matched}/${score.total} matched, ${score.missing} missing, ${score.typeMismatch} mismatch) — 'notion test' will validate strictly. Saving anyway.`,
  );
  if (missing.length > 0) {
    log.info(`      ${dim("missing:")} ${missing.map((s) => red(s)).join(", ")}`);
  }
  if (mismatched.length > 0) {
    log.info(`      ${dim("type mismatch:")} ${mismatched.map((s) => red(s)).join(", ")}`);
  }
}

/**
 * Soft schema validation for the *manual* path — we don't have properties
 * from search there, so we route through `resolveNotionDataSourceTarget`
 * which knows how to follow `database → data_source` in the current Notion
 * API. Failure is logged as a warning; init still saves the id so the user
 * can fix Notion later.
 */
async function softValidateSchema(
  client: NotionClient,
  id: string,
  kind: "projects" | "tasks",
): Promise<void> {
  const resolved = await resolveNotionDataSourceTarget(client, id, kind);
  if (!resolved.ok) {
    log.warn(`${kind} DB inline validation failed — ${resolved.message}`);
    log.info(dim("      Inspect with 'notion test'."));
    return;
  }
  if (resolved.source === "database-default-data-source") {
    log.info(
      dim(
        `      resolved data_source id=${maskId(resolved.resolvedId)} (parent database=${maskId(resolved.parentDatabaseId ?? id)})`,
      ),
    );
  }
  const required = kind === "projects" ? PROJECTS_DB_PROPERTIES : TASKS_DB_PROPERTIES;
  let matched = 0;
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const req of required) {
    const p = resolved.properties[req.name] as { type?: string } | undefined;
    if (p === undefined || p === null) {
      missing.push(req.name);
      continue;
    }
    if (!req.allowedTypes.includes((p.type ?? "") as never)) {
      mismatched.push(`${req.name} (${p.type ?? "?"} ≠ ${req.allowedTypes.join("|")})`);
      continue;
    }
    matched++;
  }
  if (matched === required.length) {
    log.info(`      ${green("✓")} ${kind} schema OK (${matched}/${required.length} matched)`);
    return;
  }
  log.warn(
    `${kind} schema partial (${matched}/${required.length} matched, ${missing.length} missing, ${mismatched.length} mismatch) — validate precisely with 'notion test'.`,
  );
  if (missing.length > 0) {
    log.info(`      ${dim("missing:")} ${missing.map((s) => red(s)).join(", ")}`);
  }
  if (mismatched.length > 0) {
    log.info(`      ${dim("type mismatch:")} ${mismatched.map((s) => red(s)).join(", ")}`);
  }
}

/**
 * Wrap `notionApiError` to scrub any raw token text that might appear in the
 * underlying error message (e.g. when Notion echoes the integration secret
 * in a debug field). Defence-in-depth.
 */
function sanitiseApiError(err: unknown): NotionApiError {
  const apiErr = notionApiError(err);
  const msg = apiErr.message ?? "";
  const sanitised = msg
    .replace(/(secret_[A-Za-z0-9]{20,}|ntn_[A-Za-z0-9_-]{20,})/g, "secret_***")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1***");
  return { ...apiErr, message: sanitised };
}

function explainSearchError(err: NotionApiError): string {
  const tail = err.status ? ` (HTTP ${err.status})` : "";
  switch (err.code) {
    case "unauthorized":
      return `NOTION_TOKEN was rejected. Verify the integration secret.${tail}`;
    case "restricted_resource":
      return `The Notion DB is not shared with the integration — add it via DB → Connections.${tail}`;
    case "object_not_found":
      return `Notion resource not found. Verify the 32-char id.${tail}`;
    case "validation_error": {
      const msg = err.message ?? "";
      if (
        /body\.filter\.value/i.test(msg) ||
        /data_source/i.test(msg)
      ) {
        return (
          `Request rejected (validation_error)${tail}. ` +
          "The current Notion API only accepts \"data_source\" as the search object filter. " +
          "If VibeOps already sends that filter and Notion still rejects it, the @notionhq/client SDK may be outdated. " +
          "Workaround: enter the DB id (32-char hex) manually to get the same behavior."
        );
      }
      return `Request rejected (validation_error): ${msg}${tail}`;
    }
    case "rate_limited":
      return `Notion API rate limit — retry shortly.${tail}`;
    case "request_timeout":
    case "notionhq_client_request_timeout":
    case "ETIMEDOUT":
      return `Notion API 5s timeout. Check your network.${tail}`;
    default:
      return `${err.code}: ${err.message}${tail}`;
  }
}

function diffNotionSection(prev: NotionConfig | undefined, next: NotionConfig): void {
  const prevVals: Record<keyof NotionConfig, string | boolean> = {
    enabled: prev?.enabled ?? false,
    projectsTargetId: prev?.projectsTargetId ?? "",
    tasksTargetId: prev?.tasksTargetId ?? "",
    projectsDatabaseId: prev?.projectsDatabaseId ?? "",
    tasksDatabaseId: prev?.tasksDatabaseId ?? "",
  };
  const fields: (keyof NotionConfig)[] = [
    "enabled",
    "projectsTargetId",
    "tasksTargetId",
    "projectsDatabaseId",
    "tasksDatabaseId",
  ];
  for (const f of fields) {
    const before = prevVals[f];
    const after = next[f];
    if (before === after) {
      log.info(`  ${dim("·")} ${f} ${dim(`= ${display(after)}`)}`);
    } else {
      log.info(
        `  ${green("~")} ${f} ${dim(`${display(before)}`)} → ${cyan(display(after))}`,
      );
    }
  }
}

function display(v: string | boolean): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v.length === 0) return '""';
  return v;
}

function hasLine(text: string | null, keyEq: string): boolean {
  if (text === null) return false;
  return text.split(/\r?\n/).some((l) => l.trimStart().startsWith(keyEq));
}

function ensureEnvLine(text: string | null, keyEq: string): string {
  if (text === null) {
    return `# VibeOps · environment example
# Copy this file to .vibeops.env and fill in the values.
# Never commit .vibeops.env — it is added to .gitignore by \`vibeops init\`.

${keyEq}
`;
  }
  if (hasLine(text, keyEq)) return text;
  const needsTrailingNewline = !text.endsWith("\n");
  return `${text}${needsTrailingNewline ? "\n" : ""}${keyEq}\n`;
}
