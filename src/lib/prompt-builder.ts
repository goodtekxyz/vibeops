import type { BriefMeta, ProjectBrief } from "../types/brief.js";

interface BuildPlanPromptInputs {
  brief: ProjectBrief;
  meta: BriefMeta;
  briefRelativePath: string;
}

function renderTopList(values: string[]): string {
  if (values.length === 0) return "- _(none selected)_";
  return values.map((v) => `- ${v}`).join("\n");
}

function renderInlineList(label: string, values: string[]): string {
  if (values.length === 0) return `- **${label}**: _(none selected)_`;
  const head = `- **${label}**:`;
  const items = values.map((v) => `  - ${v}`).join("\n");
  return `${head}\n${items}`;
}

function renderBool(value: boolean): string {
  return value ? "yes" : "no";
}

function summary(brief: ProjectBrief): string {
  const lines: string[] = [];
  lines.push(`- **Project name**: ${brief.projectName}`);
  lines.push(`- **One-line idea**: ${brief.oneLineIdea}`);
  lines.push(`- **Project type**: ${brief.projectType}`);
  lines.push(renderInlineList("Target users", brief.targetUsers));
  lines.push(`- **Core problem**: ${brief.coreProblem}`);
  lines.push(renderInlineList("MVP must-have features", brief.mvpFeatures));
  lines.push(renderInlineList("Out of scope for MVP", brief.outOfScope));
  lines.push(`- **Frontend**: ${brief.frontend}`);
  lines.push(`- **Backend**: ${brief.backend}`);
  lines.push(`- **Database**: ${brief.database}`);
  lines.push(`- **ORM / DB layer**: ${brief.dbLayer}`);
  lines.push(`- **Package manager**: ${brief.packageManager}`);
  lines.push(renderInlineList("Deployment target", brief.deploymentTargets));
  lines.push(renderInlineList("Auth requirement", brief.authRequirements));
  lines.push(renderInlineList("External integrations", brief.integrations));
  lines.push(`- **Use Notion dashboard sync**: ${renderBool(brief.useNotion)}`);
  lines.push(`- **Use Git task branch workflow**: ${renderBool(brief.useGitWorkflow)}`);
  lines.push(`- **Agent workflow level**: ${brief.agentWorkflowLevel}`);
  lines.push(renderInlineList("Risk areas", brief.risks));
  lines.push(`- **Success criteria**: ${brief.successCriteria}`);
  return lines.join("\n");
}

export function buildPlanPrompt(inputs: BuildPlanPromptInputs): string {
  const { brief, meta, briefRelativePath } = inputs;

  const assumptions =
    meta.assumptions.length > 0
      ? meta.assumptions.map((a) => `- ${a}`).join("\n")
      : "- _(none recorded)_";

  const viaLlm = meta.source === "llm-openai" || meta.source === "llm-cursor-agent";
  const opener = viaLlm
    ? "This file was produced by `vibeops plan` using an **LLM planning session** (OpenAI or Cursor Agent CLI). Open a new chat in **Cursor** and paste the full contents of this file. The Planner Agent receives this input and fills in `docs/project/*` plus the initial backlog."
    : "This file was produced by `vibeops plan`. Open a new chat in **Cursor** and paste the full contents of this file. VibeOps does not call LLMs for this path — the Planner Agent receives this input and fills in `docs/project/*` plus the initial backlog.";

  return `# VibeOps Plan Prompt — Cursor Planner Agent

> ${opener}

- Brief location: \`${briefRelativePath}\`
- VibeOps version: ${meta.vibeopsVersion}
- Generated: ${meta.generatedAt}
- Source: ${meta.source} · schemaVersion: ${meta.schemaVersion}

---

## Role: Planner Agent

Follow the definition in \`.vibeops/agents/planner.md\`. You do not write application code. You produce:

1. Updates to \`docs/project/*\` — vision / requirements / scope / architecture draft / tech stack / decisions / backlog / environment / deployment notes.
2. An initial backlog of \`docs/tasks/TASK-NNN-*.md\` files (3-6 to start). Each TASK contains the sections Status · MVP Phase · Goal · Scope · Out of Scope · Acceptance Criteria · Test Plan · Result · Test Result.

## Hard rules (failure if violated)

- Do not produce application code. The deliverable for this round is limited to \`docs/**\`.
- Do not touch VibeOps' own config (\`.vibeops/\`, \`.vibeops.json\`, \`templates/\`).
- Source-of-truth rules: \`docs/tasks/*.md\` = AI execution baseline, \`docs/project/*.md\` = design / current-state baseline, Git commits/branches = change history, Notion = human dashboard (summary / status / priority / docs path only), chat is never a baseline.
- One TASK, one focus. Surface inter-TASK dependencies in the body.
- Never hide assumptions. Record them in both the docs/project bodies and the closing "Assumptions" section.
- Notion / Git workflow / agent workflow level follow the ProjectBrief values below as-is. Do not change them on a whim.

## ProjectBrief (user answers)

${summary(brief)}

### Assumptions inherited from the brief

${assumptions}

## Output format

Produce the response in this exact order:

1. **Plan Summary** — 5 to 8 bullets capturing the direction derived from the ProjectBrief (audience, scope, tech selections, key risks).
2. **docs/project/\\*** — emit the 8 files below, each in its own fenced code block. The first line of each block is \`<!-- file: docs/project/XX-name.md -->\`. (\`03-architecture\` and \`05-current-state\` are not produced in this round.)
   - \`docs/project/00-overview.md\`
   - \`docs/project/01-requirements.md\`
   - \`docs/project/02-mvp-scope.md\`
   - \`docs/project/04-tech-stack.md\`
   - \`docs/project/06-decisions.md\`
   - \`docs/project/07-backlog.md\`
   - \`docs/project/08-env.md\`
   - \`docs/project/09-deployment.md\`
3. **docs/tasks/TASK-NNN-\\*** — 3 to 6 initial backlog items. Each in a fenced block beginning with \`<!-- file: docs/tasks/TASK-NNN-slug.md -->\`.
4. **Changed file list** — the full list of files produced above.
5. **Assumptions** — decisions the user must reconfirm (\`(none)\` if there are none).

## Field mapping (brief field → docs file)

- \`00-overview.md\` ← projectName, oneLineIdea, projectType, targetUsers, coreProblem, successCriteria
- \`01-requirements.md\` ← mvpFeatures, authRequirements, integrations, targetUsers
- \`02-mvp-scope.md\` ← mvpFeatures (IN), outOfScope (OUT), successCriteria
- \`04-tech-stack.md\` ← frontend, backend, database, dbLayer, packageManager
- \`06-decisions.md\` ← useNotion, useGitWorkflow, agentWorkflowLevel, packageManager, plus any auto-derived decisions.
- \`07-backlog.md\` ← decompose mvpFeatures into TASKs (1-2 per feature + 1 setup). Include priority and definition of done.
- \`08-env.md\` ← env variables per integration (e.g. OpenAI → OPENAI_API_KEY) and their purpose.
- \`09-deployment.md\` ← deployment notes per deploymentTargets. If only "Not sure" is selected, state that explicitly and mark the decision as pending.

## Notion / Git / Agent workflow handling

- Use Notion dashboard sync: ${renderBool(brief.useNotion)} → record in \`06-decisions.md\`. ${brief.useNotion ? "Decision: VibeOps will sync Notion DB metadata." : "Decision: no Notion sync (revisit in a future TASK if needed)."}
- Use Git task branch workflow: ${renderBool(brief.useGitWorkflow)} → ${brief.useGitWorkflow ? "TASK lifecycle assumes the task/TASK-NNN-slug branch model." : "Record that the Git task-branch model is not used (linear workflow)."}
- Agent workflow level: \`${brief.agentWorkflowLevel}\` → fix the agent line-up in \`06-decisions.md\`.

## Risk areas → docs

${renderTopList(brief.risks)}

Record each risk in \`07-backlog.md\` or in the Risks section of the corresponding TASK. Operational risks such as "Authentication/security" or "Browser automation reliability" become candidates for their own TASK.

---

Apply the rules above and produce the response. After you respond, a human reviews via \`git diff\` and commits.
`;
}
