import { createHash } from "node:crypto";

const SCHEMA = "https://json-schema.org/draft/2020-12/schema";

export const ORCHESTRATION_PATTERNS = Object.freeze({
  SINGLE_AGENT: "single_agent",
  ORCHESTRATOR_WORKER: "orchestrator_worker",
  SPLIT_AND_MERGE: "split_and_merge"
});

export const ORCHESTRATION_ROLES = Object.freeze({
  SINGLE_AGENT: "single_agent",
  LEAD_ARCHITECT: "lead_architect",
  UI_AGENT: "ui_agent",
  LOGIC_AGENT: "logic_agent",
  INTEGRATION_AGENT: "integration_agent",
  QA_AGENT: "qa_agent",
  RESEARCH_LEAD: "research_lead",
  RESEARCH_WORKER: "research_worker",
  SOURCE_VERIFIER: "source_verifier",
  SYNTHESIS_AGENT: "synthesis_agent",
  GENERATOR_AGENT: "generator_agent",
  EVALUATOR_AGENT: "evaluator_agent"
});

const OUTPUT_CONTRACT = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    agent_id: { type: "string" },
    status: { enum: ["complete", "blocked", "needs_revision"] },
    summary: { type: "string" },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string" },
          path: { type: "string" },
          description: { type: "string" }
        },
        required: ["kind", "description"]
      }
    },
    evidence: {
      type: "array",
      items: { type: "string" }
    },
    blockers: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["id", "status", "summary", "evidence"]
};

export const ORCHESTRATION_SCHEMAS = Object.freeze({
  route_decision: {
    $schema: SCHEMA,
    type: "object",
    additionalProperties: false,
    properties: {
      pattern: { enum: Object.values(ORCHESTRATION_PATTERNS) },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasons: { type: "array", items: { type: "string" } },
      signals: { type: "object" },
      reflection_required: { type: "boolean" },
      max_iterations: { type: "integer", minimum: 1, maximum: 3 },
      recommended_workers: { type: "integer", minimum: 1, maximum: 12 }
    },
    required: ["pattern", "confidence", "reasons", "signals", "reflection_required", "max_iterations", "recommended_workers"]
  },
  architect_task_list: {
    $schema: SCHEMA,
    type: "object",
    additionalProperties: false,
    properties: {
      project_type: { enum: ["web_app", "web_game", "app", "research", "general"] },
      tasks: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            role: { type: "string" },
            description: { type: "string" },
            dependencies: { type: "array", items: { type: "string" } },
            acceptance_criteria: { type: "array", items: { type: "string" } },
            mcp_tool_contract: { type: "array", items: { type: "string" } }
          },
          required: ["id", "title", "role", "description", "dependencies", "acceptance_criteria", "mcp_tool_contract"]
        }
      }
    },
    required: ["project_type", "tasks"]
  },
  worker_claim: {
    $schema: SCHEMA,
    type: "object",
    additionalProperties: false,
    properties: {
      task_id: { type: "string" },
      agent_id: { type: "string" },
      role: { type: "string" },
      claim_reason: { type: "string" }
    },
    required: ["task_id", "agent_id", "role", "claim_reason"]
  },
  worker_report: OUTPUT_CONTRACT,
  generator_output: {
    $schema: SCHEMA,
    type: "object",
    additionalProperties: false,
    properties: {
      iteration: { type: "integer", minimum: 1, maximum: 3 },
      answer_or_patch_plan: { type: "string" },
      changed_files: { type: "array", items: { type: "string" } },
      assumptions: { type: "array", items: { type: "string" } },
      verification_plan: { type: "array", items: { type: "string" } },
      residual_risks: { type: "array", items: { type: "string" } }
    },
    required: ["iteration", "answer_or_patch_plan", "changed_files", "assumptions", "verification_plan", "residual_risks"]
  },
  evaluator_output: {
    $schema: SCHEMA,
    type: "object",
    additionalProperties: false,
    properties: {
      iteration: { type: "integer", minimum: 1, maximum: 3 },
      verdict: { enum: ["pass", "revise", "blocked"] },
      score: { type: "number", minimum: 0, maximum: 1 },
      failures: { type: "array", items: { type: "string" } },
      required_changes: { type: "array", items: { type: "string" } },
      verification_requirements: { type: "array", items: { type: "string" } }
    },
    required: ["iteration", "verdict", "score", "failures", "required_changes", "verification_requirements"]
  },
  shared_state_event: {
    $schema: SCHEMA,
    type: "object",
    additionalProperties: false,
    properties: {
      ordinal: { type: "integer", minimum: 1 },
      type: { type: "string" },
      agent_id: { type: "string" },
      task_id: { type: "string" },
      payload: { type: "object" }
    },
    required: ["ordinal", "type", "payload"]
  }
});

export const AGENT_SYSTEM_PROMPTS = Object.freeze({
  generator_agent: [
    "You are the VNEM Generator Agent.",
    "Return only JSON matching the generator_output schema.",
    "Use the provided task contract, shared state, and evaluator feedback.",
    "Do not invent file changes that were not requested. Preserve performance, visuals, playability, accessibility, maintainability, and safety when relevant.",
    "Include a verification plan that can be executed by a coding agent or MCP file/tool environment."
  ].join("\n"),
  evaluator_agent: [
    "You are the VNEM Evaluator Agent.",
    "Return only JSON matching the evaluator_output schema.",
    "Judge the generator output against the task goal, quality contract, MCP safety boundary, project conventions, and verification evidence.",
    "Pass only when the output is specific, implementable, verified or honestly blocked, and no important quality domain was silently sacrificed.",
    "If failing, provide concrete required_changes for the next generator iteration."
  ].join("\n"),
  lead_architect: [
    "You are the VNEM Lead Architect Agent.",
    "Return only JSON matching the architect_task_list schema.",
    "Break the project into atomic tasks with unique ids, owner roles, dependencies, acceptance criteria, and allowed MCP tool contracts.",
    "For web apps and games, separate UI, logic, integration, QA, performance, accessibility, and visual verification work.",
    "Never assign two workers the same writable file surface at the same time unless the task explicitly says it is read-only review."
  ].join("\n"),
  worker_agent: [
    "You are a VNEM Worker Agent.",
    "Claim exactly one task from shared state before doing work.",
    "Use MCP file tools only within the task's allowed contract and report every artifact you touched.",
    "Return only JSON matching the worker_report schema.",
    "If blocked by missing context, dependency conflict, or unsafe permission, report blocked instead of improvising."
  ].join("\n"),
  research_worker: [
    "You are a VNEM Research Worker.",
    "Investigate only your assigned strand. Prefer primary sources and record provenance.",
    "Return compact findings, citations, uncertainty, and follow-up leads to shared state.",
    "Do not synthesize the whole answer unless assigned the synthesis role."
  ].join("\n")
});

export function detectTaskSignals(task) {
  const text = normalizeText(task);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const has = (pattern) => pattern.test(text);
  const signals = {
    simple_question: has(/^(what|who|when|where|why|how)\b/) && wordCount <= 20,
    coding_or_build: has(/\b(build|create|implement|code|develop|make|fix|debug|refactor|web app|app|frontend|backend|dashboard|component|api|repo|website|site)\b/),
    web_or_app: has(/\b(web app|website|site|frontend|dashboard|react|vite|next|ui|ux|component|landing page|app)\b/),
    game: has(/\b(game|web game|browser game|canvas|webgl|webgpu|controls|physics|level|sprite|playability|game feel)\b/),
    research: has(/\b(research|deep research|investigate|compare|scan|current|latest|sources|citations|benchmark|market|ecosystem|find docs)\b/),
    multi_tool: has(/\b(mcp|tools|browser|filesystem|github|api|database|shell|multiple tools|multi-tool)\b/),
    complex: wordCount >= 36 || has(/\b(complex|full-scale|large|deep|multi-step|multiple|orchestrate|architecture|system)\b/)
  };

  signals.visual_surface = signals.web_or_app || signals.game || has(/\b(visual|polish|animation|layout|responsive|mobile|aesthetic)\b/);
  signals.needs_parallelism = signals.research && (signals.complex || has(/\b(broad|many|multiple|landscape|ecosystem|all sources)\b/));
  return signals;
}

export function routePrompt(task, options = {}) {
  const signals = detectTaskSignals(task);
  const maxWorkers = clampInt(options.maxWorkers ?? options.max_workers ?? 5, 1, 12);
  const reasons = [];
  let pattern = ORCHESTRATION_PATTERNS.SINGLE_AGENT;
  let confidence = 0.72;
  let recommendedWorkers = 1;
  let reflectionRequired = false;

  if (signals.coding_or_build || signals.web_or_app || signals.game) {
    pattern = ORCHESTRATION_PATTERNS.ORCHESTRATOR_WORKER;
    confidence = signals.game || signals.visual_surface ? 0.9 : 0.84;
    recommendedWorkers = Math.min(maxWorkers, signals.game ? 5 : 4);
    reflectionRequired = true;
    reasons.push("coding/app/game work benefits from a Lead Architect plus specialized workers and QA");
  } else if (signals.needs_parallelism) {
    pattern = ORCHESTRATION_PATTERNS.SPLIT_AND_MERGE;
    confidence = 0.88;
    recommendedWorkers = Math.min(maxWorkers, 4);
    reflectionRequired = true;
    reasons.push("complex research can split independent strands across separate context windows");
  } else if (signals.research) {
    pattern = ORCHESTRATION_PATTERNS.SPLIT_AND_MERGE;
    confidence = 0.78;
    recommendedWorkers = Math.min(maxWorkers, 3);
    reflectionRequired = true;
    reasons.push("research needs source separation and synthesis even when the query is not huge");
  } else {
    reasons.push("simple or low-risk request should avoid unnecessary multi-agent overhead");
  }

  if (signals.simple_question && !signals.coding_or_build && !signals.needs_parallelism) {
    pattern = ORCHESTRATION_PATTERNS.SINGLE_AGENT;
    confidence = 0.86;
    recommendedWorkers = 1;
    reflectionRequired = false;
    reasons.unshift("simple question can be answered by one agent with direct verification");
  }

  return {
    pattern,
    confidence,
    reasons,
    signals,
    reflection_required: reflectionRequired,
    max_iterations: reflectionRequired ? 3 : 1,
    recommended_workers: recommendedWorkers
  };
}

export function buildOrchestrationPlan(task, options = {}) {
  const route = routePrompt(task, options);
  const runId = options.runId || createRunId(task);
  const workflow =
    route.pattern === ORCHESTRATION_PATTERNS.ORCHESTRATOR_WORKER
      ? createMagenticCodingWorkflow(task, { ...options, runId, route })
      : route.pattern === ORCHESTRATION_PATTERNS.SPLIT_AND_MERGE
        ? createSplitAndMergeWorkflow(task, { ...options, runId, route })
        : createSingleAgentWorkflow(task, { ...options, runId, route });
  const reflection = buildReflectionContract(task, route);

  return {
    schema_version: "1.0.0",
    run_id: runId,
    task,
    route,
    workflow,
    reflection_loop: reflection,
    shared_state: createInitialSharedState(runId, task, workflow.tasks),
    schemas: ORCHESTRATION_SCHEMAS,
    prompts: AGENT_SYSTEM_PROMPTS,
    safety:
      "This is deterministic orchestration guidance. It does not call models, edit files, install packages, start daemons, or bypass MCP client permissions by itself."
  };
}

export function createMagenticCodingWorkflow(task, options = {}) {
  const projectType = detectTaskSignals(task).game ? "web_game" : detectTaskSignals(task).web_or_app ? "web_app" : "app";
  const tasks = [
    taskDef("T001", "Repo sensing and implementation map", ORCHESTRATION_ROLES.LEAD_ARCHITECT, "Inspect manifests, existing patterns, assets, tests, and MCP/file-tool availability before assigning writable work.", [], ["repo constraints captured", "shared state initialized", "no worker starts without file ownership"], ["mcp.vnem_recommend", "mcp.filesystem.read", "mcp.search.read"]),
    taskDef("T002", "UI and visual system slice", ORCHESTRATION_ROLES.UI_AGENT, "Implement or refine layout, responsive surfaces, visual hierarchy, accessibility basics, and design-system alignment.", ["T001"], ["first screen looks intentional", "mobile layout fits", "visual changes are scoped"], ["mcp.filesystem.read", "mcp.filesystem.write:ui-surface", "mcp.browser.screenshot"]),
    taskDef("T003", "Logic and interaction slice", ORCHESTRATION_ROLES.LOGIC_AGENT, "Implement core application/game logic, state transitions, input handling, error states, and deterministic behavior.", ["T001"], ["core behavior works", "state transitions are explicit", "input handling is tested"], ["mcp.filesystem.read", "mcp.filesystem.write:logic-surface", "mcp.test.run"]),
    taskDef("T004", "Integration and performance pass", ORCHESTRATION_ROLES.INTEGRATION_AGENT, "Integrate UI and logic, preserve performance and visuals/playability together, and add quality profile/settings hooks when constraints conflict.", ["T002", "T003"], ["no silent quality downgrade", "performance-sensitive paths identified", "integration avoids duplicate ownership"], ["mcp.filesystem.read", "mcp.filesystem.write:integration-surface", "mcp.test.run"]),
    taskDef("T005", "Verification and perception gate", ORCHESTRATION_ROLES.QA_AGENT, "Run focused checks, browser/mobile inspection, interaction verification, accessibility basics, and final quality-gate review.", ["T004"], ["tests or build checked", "desktop/mobile rendered state inspected when applicable", "quality gate verdict recorded"], ["mcp.test.run", "mcp.browser.screenshot", "mcp.vnem_quality_gate"])
  ];

  return {
    pattern: ORCHESTRATION_PATTERNS.ORCHESTRATOR_WORKER,
    name: "Magentic Coding Workflow",
    project_type: projectType,
    objective: "Build or improve a web app, app, or game through role-scoped workers coordinated by a Lead Architect.",
    agents: [
      agentDef("architect-1", ORCHESTRATION_ROLES.LEAD_ARCHITECT, "Owns decomposition, file ownership, sequencing, and final synthesis."),
      agentDef("ui-1", ORCHESTRATION_ROLES.UI_AGENT, "Owns visible surfaces, responsive layout, accessibility basics, and visual polish."),
      agentDef("logic-1", ORCHESTRATION_ROLES.LOGIC_AGENT, "Owns behavior, state, rules, game/app logic, and input handling."),
      agentDef("integration-1", ORCHESTRATION_ROLES.INTEGRATION_AGENT, "Owns integration, performance/quality trade-offs, and cross-surface consistency."),
      agentDef("qa-1", ORCHESTRATION_ROLES.QA_AGENT, "Owns verification, perception gate, and final risk report.")
    ],
    tasks,
    communication:
      "Agents communicate through shared state events, task claims, worker reports, and MCP resource/tool results. Do not rely on private conversational memory between workers.",
    mcp_contract: [
      "Use MCP resources for shared context and task contracts.",
      "Use MCP file tools only after task claim and file-surface ownership are recorded.",
      "Workers must report artifacts and evidence back to shared state before another worker depends on them."
    ],
    lead_architect_output_schema: ORCHESTRATION_SCHEMAS.architect_task_list
  };
}

export function createSplitAndMergeWorkflow(task, options = {}) {
  const workerCount = Math.max(2, Math.min(options.route?.recommended_workers || 4, 6));
  const researchTasks = Array.from({ length: workerCount }, (_, index) =>
    taskDef(
      `R${String(index + 1).padStart(3, "0")}`,
      `Research strand ${index + 1}`,
      ORCHESTRATION_ROLES.RESEARCH_WORKER,
      `Investigate one independent aspect of the question, using primary sources first and recording provenance.`,
      ["R000"],
      ["source quality scored", "claims include citations", "uncertainty recorded"],
      ["mcp.web.search", "mcp.sources.read", "mcp.resources.read"]
    )
  );
  const tasks = [
    taskDef("R000", "Research scope and strand split", ORCHESTRATION_ROLES.RESEARCH_LEAD, "Define independent strands, source policy, success criteria, and stop conditions.", [], ["strands do not duplicate each other", "source policy is explicit"], ["mcp.vnem_sources", "mcp.vnem_search"]),
    ...researchTasks,
    taskDef("R900", "Source verification", ORCHESTRATION_ROLES.SOURCE_VERIFIER, "Check citations, source quality, contradictions, and unsupported claims.", researchTasks.map((item) => item.id), ["unsupported claims flagged", "primary source preference enforced"], ["mcp.resources.read", "mcp.web.open"]),
    taskDef("R999", "Synthesis", ORCHESTRATION_ROLES.SYNTHESIS_AGENT, "Merge verified findings into a concise answer with citations and residual uncertainty.", ["R900"], ["answer covers requested scope", "citations match claims", "uncertainty is explicit"], ["mcp.resources.read"])
  ];

  return {
    pattern: ORCHESTRATION_PATTERNS.SPLIT_AND_MERGE,
    name: "Split-and-Merge Research Workflow",
    objective: "Divide complex research into independent strands, verify sources, and synthesize only after evidence is gathered.",
    agents: [
      agentDef("research-lead-1", ORCHESTRATION_ROLES.RESEARCH_LEAD, "Owns strand design and stop conditions."),
      ...researchTasks.map((item, index) => agentDef(`research-worker-${index + 1}`, ORCHESTRATION_ROLES.RESEARCH_WORKER, `Owns ${item.id} only.`)),
      agentDef("source-verifier-1", ORCHESTRATION_ROLES.SOURCE_VERIFIER, "Owns citation and claim verification."),
      agentDef("synthesis-1", ORCHESTRATION_ROLES.SYNTHESIS_AGENT, "Owns final answer synthesis.")
    ],
    tasks,
    communication:
      "Research workers write compact findings to shared state. The synthesis agent cannot produce the final answer until verification reports are present.",
    mcp_contract: [
      "Use source-radar and official sources before broad search.",
      "Keep each research strand independent until merge.",
      "Return citations and source quality metadata in structured reports."
    ]
  };
}

export function createSingleAgentWorkflow(task, options = {}) {
  return {
    pattern: ORCHESTRATION_PATTERNS.SINGLE_AGENT,
    name: "Single Agent Direct Workflow",
    objective: "Answer or handle the prompt with one scoped agent and no unnecessary coordination overhead.",
    agents: [agentDef("single-agent-1", ORCHESTRATION_ROLES.SINGLE_AGENT, "Owns the complete answer and focused verification.")],
    tasks: [
      taskDef("S001", "Direct answer or focused action", ORCHESTRATION_ROLES.SINGLE_AGENT, "Answer the question or perform the narrow task, checking the minimum necessary sources or repo files.", [], ["answer is direct", "uncertainty is stated", "no unnecessary multi-agent cost"], ["mcp.vnem_search", "mcp.resources.read"])
    ],
    communication: "No agent-to-agent communication required.",
    mcp_contract: ["Use read-only MCP context when it materially improves accuracy."]
  };
}

export function buildReflectionContract(task, route = routePrompt(task)) {
  return {
    enabled: route.reflection_required,
    max_iterations: route.max_iterations,
    generator_agent: {
      role: ORCHESTRATION_ROLES.GENERATOR_AGENT,
      system_prompt: AGENT_SYSTEM_PROMPTS.generator_agent,
      output_schema: ORCHESTRATION_SCHEMAS.generator_output
    },
    evaluator_agent: {
      role: ORCHESTRATION_ROLES.EVALUATOR_AGENT,
      system_prompt: AGENT_SYSTEM_PROMPTS.evaluator_agent,
      output_schema: ORCHESTRATION_SCHEMAS.evaluator_output
    },
    loop:
      "Generator produces JSON -> Evaluator scores JSON against quality metrics -> Generator receives required_changes -> stop on pass/blocked or after 3 iterations.",
    quality_metrics: [
      "task alignment",
      "schema validity",
      "source or repo grounding",
      "performance/visual/playability/accessibility/maintainability/safety balance",
      "MCP tool-use discipline",
      "verification evidence"
    ],
    task
  };
}

export async function runReflectionLoop({ task, context = {}, generate, evaluate, maxIterations = 3 }) {
  if (typeof generate !== "function" || typeof evaluate !== "function") {
    throw new TypeError("runReflectionLoop requires generate and evaluate callback functions.");
  }

  const iterations = [];
  let feedback = [];
  const limit = clampInt(maxIterations, 1, 3);

  for (let iteration = 1; iteration <= limit; iteration += 1) {
    const generatorOutput = await generate({ task, context, iteration, feedback });
    assertRequired(generatorOutput, ORCHESTRATION_SCHEMAS.generator_output, "generator_output");
    const evaluatorOutput = await evaluate({ task, context, iteration, generator_output: generatorOutput });
    assertRequired(evaluatorOutput, ORCHESTRATION_SCHEMAS.evaluator_output, "evaluator_output");
    iterations.push({ iteration, generator_output: generatorOutput, evaluator_output: evaluatorOutput });

    if (evaluatorOutput.verdict === "pass" || evaluatorOutput.verdict === "blocked") {
      return {
        verdict: evaluatorOutput.verdict,
        iterations,
        final_output: generatorOutput,
        final_evaluation: evaluatorOutput
      };
    }
    feedback = evaluatorOutput.required_changes || [];
  }

  return {
    verdict: "needs_revision",
    iterations,
    final_output: iterations.at(-1)?.generator_output || null,
    final_evaluation: iterations.at(-1)?.evaluator_output || null
  };
}

export class SharedStateMemory {
  constructor({ run_id, task, tasks = [] }) {
    this.state = createInitialSharedState(run_id || createRunId(task), task, tasks);
  }

  snapshot() {
    return structuredClone(this.state);
  }

  claimTask(claim) {
    assertRequired(claim, ORCHESTRATION_SCHEMAS.worker_claim, "worker_claim");
    const task = this.#findTask(claim.task_id);
    if (task.status !== "unclaimed") {
      throw new Error(`Task ${claim.task_id} is already ${task.status}.`);
    }
    task.status = "claimed";
    task.agent_id = claim.agent_id;
    this.state.claims.push({ ...claim, ordinal: this.#nextOrdinal() });
    this.#event("task_claimed", claim.agent_id, claim.task_id, claim);
    return this.snapshot();
  }

  reportTask(report) {
    assertRequired(report, ORCHESTRATION_SCHEMAS.worker_report, "worker_report");
    const task = this.#findTask(report.id);
    task.status = report.status;
    this.state.reports.push({ ...report, ordinal: this.#nextOrdinal() });
    for (const artifact of report.artifacts || []) {
      this.state.artifacts.push({ task_id: report.id, ...artifact });
    }
    this.#event("task_reported", report.agent_id || task.agent_id || "unknown-agent", report.id, report);
    return this.snapshot();
  }

  recordDecision(agentId, decision) {
    const item = { ordinal: this.#nextOrdinal(), agent_id: agentId, decision: String(decision) };
    this.state.decisions.push(item);
    this.#event("decision_recorded", agentId, null, item);
    return this.snapshot();
  }

  recordFact(agentId, fact, source = null) {
    const item = { ordinal: this.#nextOrdinal(), agent_id: agentId, fact: String(fact), source };
    this.state.facts.push(item);
    this.#event("fact_recorded", agentId, null, item);
    return this.snapshot();
  }

  #findTask(taskId) {
    const task = this.state.tasks.find((item) => item.id === taskId);
    if (!task) {
      throw new Error(`Unknown task id: ${taskId}`);
    }
    return task;
  }

  #nextOrdinal() {
    this.state.next_ordinal += 1;
    return this.state.next_ordinal;
  }

  #event(type, agentId, taskId, payload) {
    this.state.events.push({
      ordinal: this.#nextOrdinal(),
      type,
      agent_id: agentId,
      task_id: taskId || undefined,
      payload
    });
  }
}

function createInitialSharedState(runId, task, tasks) {
  return {
    schema_version: "1.0.0",
    run_id: runId,
    task,
    status: "planned",
    next_ordinal: 1,
    tasks: tasks.map((item) => ({
      ...item,
      status: item.status || "unclaimed",
      agent_id: item.agent_id || null
    })),
    claims: [],
    reports: [],
    artifacts: [],
    facts: [],
    decisions: [],
    events: [
      {
        ordinal: 1,
        type: "run_created",
        payload: { task_count: tasks.length }
      }
    ]
  };
}

function taskDef(id, title, role, description, dependencies, acceptanceCriteria, mcpToolContract) {
  return {
    id,
    title,
    role,
    description,
    dependencies,
    acceptance_criteria: acceptanceCriteria,
    mcp_tool_contract: mcpToolContract,
    output_schema: OUTPUT_CONTRACT
  };
}

function agentDef(id, role, responsibility) {
  return {
    id,
    role,
    responsibility,
    communication_contract: "read shared state, claim task, use allowed MCP tools, report structured output"
  };
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createRunId(task) {
  return `vnem-run-${createHash("sha256").update(String(task)).digest("hex").slice(0, 12)}`;
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function assertRequired(value, schema, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  for (const key of schema.required || []) {
    if (!(key in value)) {
      throw new TypeError(`${label} missing required field: ${key}`);
    }
  }
  return true;
}
