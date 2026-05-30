#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  ORCHESTRATION_PATTERNS,
  SharedStateMemory,
  buildOrchestrationPlan,
  routePrompt,
  runReflectionLoop
} from "./lib/orchestration-framework.mjs";

const simpleRoute = routePrompt("What is MCP?");
assert.equal(simpleRoute.pattern, ORCHESTRATION_PATTERNS.SINGLE_AGENT);
assert.equal(simpleRoute.reflection_required, false);
assert.equal(simpleRoute.recommended_workers, 1);

const gameTask = "Build a polished browser game with responsive controls, reward feedback, settings GUI, and browser verification.";
const gamePlan = buildOrchestrationPlan(gameTask);
assert.equal(gamePlan.route.pattern, ORCHESTRATION_PATTERNS.ORCHESTRATOR_WORKER);
assert.equal(gamePlan.workflow.name, "Magentic Coding Workflow");
assert.equal(gamePlan.workflow.project_type, "web_game");
assert.equal(gamePlan.reflection_loop.enabled, true);
assert.equal(gamePlan.reflection_loop.max_iterations, 3);
assert.ok(gamePlan.workflow.agents.some((agent) => agent.role === "ui_agent"));
assert.ok(gamePlan.workflow.agents.some((agent) => agent.role === "logic_agent"));
assert.ok(gamePlan.workflow.agents.some((agent) => agent.role === "qa_agent"));
assert.ok(gamePlan.workflow.tasks.some((task) => task.mcp_tool_contract.includes("mcp.vnem_quality_gate")));
assert.ok(gamePlan.schemas.route_decision);
assert.ok(gamePlan.schemas.worker_claim);
assert.ok(gamePlan.schemas.worker_report);

const researchPlan = buildOrchestrationPlan("Deep research the current MCP gateway landscape, compare sources, and synthesize risks.");
assert.equal(researchPlan.route.pattern, ORCHESTRATION_PATTERNS.SPLIT_AND_MERGE);
assert.equal(researchPlan.workflow.name, "Split-and-Merge Research Workflow");
assert.ok(researchPlan.workflow.tasks.some((task) => task.role === "source_verifier"));
assert.ok(researchPlan.workflow.tasks.some((task) => task.role === "synthesis_agent"));
assert.equal(researchPlan.reflection_loop.enabled, true);

const simplePlan = buildOrchestrationPlan("What is MCP?");
assert.equal(simplePlan.workflow.name, "Single Agent Direct Workflow");
JSON.stringify(simplePlan);

const memory = new SharedStateMemory({
  run_id: "test-run",
  task: gameTask,
  tasks: gamePlan.workflow.tasks
});
const claimed = memory.claimTask({
  task_id: "T002",
  agent_id: "ui-1",
  role: "ui_agent",
  claim_reason: "Owns visible surface work."
});
assert.equal(claimed.tasks.find((task) => task.id === "T002")?.status, "claimed");
assert.throws(
  () =>
    memory.claimTask({
      task_id: "T002",
      agent_id: "logic-1",
      role: "logic_agent",
      claim_reason: "Duplicate ownership should fail."
    }),
  /already claimed/
);
const reported = memory.reportTask({
  id: "T002",
  agent_id: "ui-1",
  status: "complete",
  summary: "Implemented the visible surface.",
  artifacts: [{ kind: "file", path: "src/App.jsx", description: "Updated app shell." }],
  evidence: ["desktop screenshot checked"],
  blockers: []
});
assert.equal(reported.tasks.find((task) => task.id === "T002")?.status, "complete");
assert.ok(reported.artifacts.some((artifact) => artifact.path === "src/App.jsx"));
assert.ok(reported.events.every((event, index, events) => index === 0 || event.ordinal > events[index - 1].ordinal));

let feedbackSeen = false;
const reflected = await runReflectionLoop({
  task: "Improve a web game without degrading visuals.",
  generate: async ({ iteration, feedback }) => {
    if (feedback.length) feedbackSeen = true;
    return {
      iteration,
      answer_or_patch_plan: iteration === 1 ? "Initial plan" : "Revised plan with settings profiles",
      changed_files: [],
      assumptions: [],
      verification_plan: ["run browser check"],
      residual_risks: []
    };
  },
  evaluate: async ({ iteration }) => ({
    iteration,
    verdict: iteration === 1 ? "revise" : "pass",
    score: iteration === 1 ? 0.6 : 0.95,
    failures: iteration === 1 ? ["settings profile missing"] : [],
    required_changes: iteration === 1 ? ["add settings profile alternative"] : [],
    verification_requirements: ["browser check"]
  })
});
assert.equal(reflected.verdict, "pass");
assert.equal(reflected.iterations.length, 2);
assert.equal(feedbackSeen, true);

console.log("orchestration framework tests passed");
