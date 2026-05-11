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

  return `# VibeOps Plan Prompt — Cursor Planner Agent

> 이 파일은 \`vibeops plan\`이 생성했다. **Cursor**에서 새 채팅을 열고 이 파일의 전체 내용을 그대로 붙여 넣어라. VibeOps는 LLM을 직접 호출하지 않는다 — Planner Agent가 이 입력을 받아 \`docs/project/*\`를 채우고 초기 백로그를 만든다.

- Brief 위치: \`${briefRelativePath}\`
- VibeOps version: ${meta.vibeopsVersion}
- Generated: ${meta.generatedAt}
- Source: ${meta.source} · schemaVersion: ${meta.schemaVersion}

---

## Role: Planner Agent

\`.vibeops/agents/planner.md\`의 정의를 따른다. 너는 코드를 만들지 않는다. 너는 다음을 만든다.

1. \`docs/project/*\` 갱신 — 비전 / 요구사항 / MVP 범위 / 아키텍처 초안 / 기술 스택 / 의사결정 / 백로그 / 환경변수 / 배포 메모.
2. \`docs/tasks/TASK-NNN-*.md\` 초기 백로그(최소 3 ~ 6개). 각 TASK는 Status·MVP Phase·Goal·Scope·Out of Scope·Acceptance Criteria·Test Plan·Result·Test Result 섹션을 가진다.

## Hard rules (지키지 않으면 작업 실패)

- 애플리케이션 코드를 작성하지 마라. 이번 단계의 결과물은 \`docs/**\`로 한정한다.
- VibeOps 자체 설정(\`.vibeops/\`, \`.vibeops.json\`, \`templates/\`)은 건드리지 마라.
- 진실 공급원 규칙: \`docs/tasks/*.md\` = AI 실행 기준, \`docs/project/*.md\` = 설계/현재 상태 기준, Git commits/branches = 변경 이력, Notion = 사람이 보는 대시보드(요약·상태·우선순위·docs path만), 채팅은 기준 아님.
- 한 TASK는 한 가지에 집중하게 쪼개라. TASK 간 의존성은 본문에 명시하라.
- 가정(Assumption)은 절대 숨기지 말고 docs/project 본문과 응답 끝의 "Assumptions" 섹션에 둘 다 기록하라.
- Notion / Git workflow / agent workflow level은 아래 ProjectBrief 값을 그대로 따른다. 임의로 바꾸지 마라.

## ProjectBrief (사용자 답변 요약)

${summary(brief)}

### 기존 brief의 Assumptions

${assumptions}

## 산출물 형식

응답은 다음 순서를 정확히 지킨다.

1. **Plan Summary** — 5 ~ 8 bullet. ProjectBrief에서 도출한 핵심 방향(타깃·MVP 범위·기술 선택·핵심 위험).
2. **docs/project/\\*** — 다음 8개 파일을 fenced code block으로 각각 출력. 각 block 첫 줄은 \`<!-- file: docs/project/XX-name.md -->\`. 03-architecture와 05-current-state는 이 단계에서 다루지 않는다.
   - \`docs/project/00-overview.md\`
   - \`docs/project/01-requirements.md\`
   - \`docs/project/02-mvp-scope.md\`
   - \`docs/project/04-tech-stack.md\`
   - \`docs/project/06-decisions.md\`
   - \`docs/project/07-backlog.md\`
   - \`docs/project/08-env.md\`
   - \`docs/project/09-deployment.md\`
3. **docs/tasks/TASK-NNN-\\*** — 초기 백로그 3 ~ 6개. 각각 \`<!-- file: docs/tasks/TASK-NNN-slug.md -->\`로 시작하는 fenced block.
4. **Changed file list** — 위에서 만든 모든 파일 경로 목록.
5. **Assumptions** — 사용자에게 다시 확인이 필요한 결정 목록(없으면 \`(none)\`).

## 매핑 가이드 (브리프 필드 → docs 파일)

- \`00-overview.md\` ← projectName, oneLineIdea, projectType, targetUsers, coreProblem, successCriteria
- \`01-requirements.md\` ← mvpFeatures, authRequirements, integrations, targetUsers
- \`02-mvp-scope.md\` ← mvpFeatures (IN), outOfScope (OUT), successCriteria
- \`04-tech-stack.md\` ← frontend, backend, database, dbLayer, packageManager
- \`06-decisions.md\` ← useNotion, useGitWorkflow, agentWorkflowLevel, packageManager, 그 외 자동 도출 가능한 결정
- \`07-backlog.md\` ← mvpFeatures를 TASK 단위로 분해(기능별 1 ~ 2개 + 셋업 1개). 우선순위·완료 정의 포함.
- \`08-env.md\` ← integrations마다 필요한 env 변수(예: OpenAI → OPENAI_API_KEY) 목록과 의미
- \`09-deployment.md\` ← deploymentTargets별 배포 절차 메모. Not sure만 있으면 그렇게 명시하고 결정 대기로 둔다.

## Notion / Git / Agent 워크플로 처리

- Use Notion dashboard sync: ${renderBool(brief.useNotion)} → \`06-decisions.md\`에 명시. ${brief.useNotion ? "Notion DB 메타 동기화를 사용 결정." : "Notion 동기화는 사용하지 않음(추후 도입 시 별도 TASK)."}
- Use Git task branch workflow: ${renderBool(brief.useGitWorkflow)} → ${brief.useGitWorkflow ? "TASK lifecycle은 task/TASK-NNN-slug 브랜치 모델을 가정." : "Git task branch 모델을 사용하지 않음을 명시(직선 작업)."}
- Agent workflow level: \`${brief.agentWorkflowLevel}\` → \`06-decisions.md\`에 사용할 에이전트 조합을 박는다.

## Risk areas → docs 반영

${renderTopList(brief.risks)}

각 risk는 \`07-backlog.md\` 또는 해당 TASK의 Risks 섹션에 적어라. "Authentication/security"나 "Browser automation reliability"처럼 운영 위험이 있으면 별도 TASK 후보로 둔다.

---

이제 위 규칙을 모두 지켜 응답을 작성하라. 응답이 끝나면 사람이 \`git diff\`로 검토 후 커밋한다.
`;
}
