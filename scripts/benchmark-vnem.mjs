#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const serverPath = path.join(scriptDir, "vnem-mcp-server.mjs");

const cases = [
  {
    name: "frontend build",
    task: "Build a responsive browser UI for a SaaS dashboard and verify it locally.",
    mode: "build",
    rubrics: ["frontend_ui", "aesthetic_experience"],
    readFirst: ["practice:frontend"]
  },
  {
    name: "aesthetic browser game",
    task: "Build a polished neon browser Snake game with Magi-sun collectibles, action-anchored reward flashes, restrained sound design, responsive board sizing, and a screenshot polish pass.",
    mode: "build",
    rubrics: ["aesthetic_experience", "interactive_canvas"],
    readFirst: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:browser-games"],
    perception: true
  },
  {
    name: "bento dashboard",
    task: "Build a dense bento SaaS dashboard with prioritized KPI tiles, a 12-column CSS Grid layout, responsive mobile collapse, and screenshot verification.",
    mode: "build",
    rubrics: ["aesthetic_experience", "frontend_ui"],
    readFirst: ["visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:frontend"],
    perception: true
  },
  {
    name: "agent evidence ui",
    task: "Build an agent chat UI with evidence cards, source visibility, sequential disclosure, and a compact dashboard handoff to reduce verification debt.",
    mode: "build",
    rubrics: ["aesthetic_experience", "frontend_ui"],
    readFirst: ["visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:visual-experience"],
    perception: true
  },
  {
    name: "brand landing page",
    task: "Build a polished landing page using provided brand assets, reference-style fidelity, responsive typography, and a screenshot polish pass.",
    mode: "build",
    rubrics: ["aesthetic_experience", "frontend_ui"],
    readFirst: ["visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:frontend"],
    perception: true
  },
  {
    name: "ugly ui polish review",
    task: "Review this ugly UI, name the worst visible issue, improve the visual hierarchy and spacing, then verify screenshots again.",
    mode: "review",
    rubrics: ["aesthetic_experience", "frontend_ui"],
    readFirst: ["visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:visual-experience"],
    perception: true
  },
  {
    name: "mobile responsive polish",
    task: "Review and polish a mobile responsive UI so text fits, tap targets are usable, motion respects reduced motion, and the final screenshots look intentional.",
    mode: "review",
    rubrics: ["aesthetic_experience", "frontend_ui"],
    readFirst: ["visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:frontend"],
    perception: true
  },
  {
    name: "repo review",
    task: "Review this repository for risky dependencies and outdated tooling before changing anything.",
    mode: "review",
    readFirst: ["practice:code-review"]
  },
  {
    name: "code simplification",
    task: "Simplify duplicate code in a JavaScript module without changing behavior.",
    mode: "build",
    rubrics: ["refactor"],
    readFirst: ["practice:code-simplification"]
  },
  {
    name: "debug failing test",
    task: "Debug a failing auth API test and patch only the smallest relevant cause.",
    mode: "debug",
    rubrics: ["backend_api", "security_sensitive"],
    readFirst: ["practice:backend", "practice:security"]
  },
  {
    name: "mcp tooling decision",
    task: "Choose MCP tooling for GitHub pull request triage with least-privilege permissions.",
    mode: "decision",
    rubrics: ["agent_tooling"],
    readFirst: ["practice:mcp-server-selection", "practice:agent-tooling"]
  },
  {
    name: "source intake decision",
    task: "Decide whether official MCP registry docs belong in vnem's source radar before adding entries.",
    mode: "decision",
    rubrics: ["agent_tooling"],
    readFirst: ["source:mcp-core-and-registry", "practice:research-source-intake"]
  },
  {
    name: "zero trust gateway plan",
    task: "Plan a zero-trust gateway policy for MCP tool schema pinning without adding a daemon.",
    mode: "plan",
    rubrics: ["agent_tooling", "security_sensitive"],
    readFirst: ["practice:zero-trust-agent-gateway", "source:agentic-gateway-security"]
  },
  {
    name: "memory policy",
    task: "Design a memory/context policy for this project that avoids storing secrets.",
    mode: "plan",
    rubrics: ["data_memory"],
    readFirst: ["practice:persistent-memory-context-files", "practice:context-engineering"]
  },
  {
    name: "prompt improvement",
    task: "Improve this coding-agent prompt with constraints, an output contract, and verification criteria.",
    mode: "prompt",
    rubrics: ["docs_prompt"],
    readFirst: ["practice:prompt-engineering", "prompt-pattern:prompt-enhancement"]
  }
];

const client = new Client(
  {
    name: "vnem-benchmark",
    version: "1.0.0"
  },
  {
    capabilities: {}
  }
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: rootDir,
  stderr: "pipe"
});

let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  await client.connect(transport);

  const results = [];
  for (const benchCase of cases) {
    const started = performance.now();
    const response = await client.callTool({
      name: "vnem_recommend",
      arguments: {
        task: benchCase.task,
        limit: 4
      }
    });
    const latencyMs = Math.round(performance.now() - started);
    const content = response.structuredContent;
    const contract = content?.task_contract || {};
    const rubricIds = new Set((contract.rubric || []).map((rubric) => rubric.id));
    const readFirstIds = new Set(contract.read_first || []);

    const checks = [
      ["mode", contract.mode === benchCase.mode],
      ["rubric", !benchCase.rubrics || benchCase.rubrics.some((id) => rubricIds.has(id))],
      ["read_first", !benchCase.readFirst || benchCase.readFirst.some((id) => readFirstIds.has(id))],
      ["recommendations", (content?.read_first?.length || 0) > 0 || (content?.registry_entries?.length || 0) > 0],
      ["approval_gates", (contract.approval_gates || []).length > 0],
      ["perception_gate", !benchCase.perception || contract.perception_gate?.required === true],
      ["perception_read_first", !benchCase.perception || readFirstIds.has("practice:visual-experience")],
      ["design_architecture", !benchCase.perception || readFirstIds.has("design-architecture:vnem-design-architecture")],
      ["visual_qa_protocol", !benchCase.perception || readFirstIds.has("visual-qa-protocol:vnem-visual-qa-protocol")],
      ["ship_blockers", !benchCase.perception || (contract.perception_gate?.ship_blockers || []).length > 0],
      ["visual_verification", !benchCase.perception || (contract.perception_gate?.visual_verification || []).length > 0],
      ["repo_sensing", !benchCase.perception || (contract.perception_gate?.repo_sensing || []).length > 0],
      ["verification", (contract.verification || []).length > 0],
      ["safety", String(contract.safety || "").includes("without explicit user approval")]
    ];
    const passed = checks.filter(([, ok]) => ok).length;
    results.push({
      name: benchCase.name,
      score: passed / checks.length,
      latencyMs,
      failures: checks.filter(([, ok]) => !ok).map(([name]) => name)
    });
  }

  const meanScore = results.reduce((sum, result) => sum + result.score, 0) / results.length;
  const failed = results.filter((result) => result.failures.length);

  console.log("vnem benchmark");
  for (const result of results) {
    const pct = Math.round(result.score * 100);
    const suffix = result.failures.length ? ` failed: ${result.failures.join(", ")}` : " passed";
    console.log(`- ${result.name}: ${pct}% in ${result.latencyMs}ms${suffix}`);
  }
  console.log(`Mean score: ${Math.round(meanScore * 100)}%`);

  assert.equal(failed.length, 0, "all benchmark cases should satisfy the task-contract criteria");
} catch (error) {
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  throw error;
} finally {
  await client.close().catch(() => {});
}
