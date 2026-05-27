import path from "node:path";
import { gzipSync } from "node:zlib";
import { ROOT, publicEntry, readEntries, uniqueSorted, writeBytes, writeJson, writeText } from "./lib/registry.mjs";

const generatedAt = new Date().toISOString();
const generatedDate = generatedAt.slice(0, 10);
const installFolder = ".vnem";
const installArchiveName = "install.tgz";
const defaultInstallBaseUrl = "https://raw.githubusercontent.com/naellisim/vnem/main/public";
const installBaseUrl = (process.env.VNEM_BASE_URL ?? defaultInstallBaseUrl).replace(/\/+$/, "");
const installArchiveUrl = `${installBaseUrl}/${installArchiveName}`;
const installCommand = `curl -fsSL ${installArchiveUrl} | tar -xz`;
const installFileUrl = (fileName) => `${installBaseUrl}/install/${fileName}`;

const intentAliases = {
  "better ui": ["frontend", "ui", "design", "component", "visual", "accessibility", "prototype"],
  "faster search": ["search", "retrieval", "index", "semantic", "rerank", "latency"],
  "agent payments": ["payments", "x402", "wallet", "commerce", "checkout", "receipt"],
  "code review": ["pull request", "static analysis", "dependency", "upgrade", "outdated", "package audit"],
  memory: ["memory", "context", "persistence", "knowledge", "state"],
  evals: ["eval", "testing", "benchmark", "verification", "quality", "score"],
  "agent news": ["news", "signals", "release", "trend", "freshness", "registry"],
  "backend api": ["backend", "api", "database", "server", "runtime", "deployment"],
  security: ["security", "trust", "identity", "compliance", "guardrails", "audit"],
  "coding agents": ["coding-agent", "codebase", "repository", "diff", "terminal", "tests", "pull request"],
  subagents: ["sub-agent", "delegation", "parallel", "specialist", "agent team", "coordination"],
  "multi agent": ["multi-agent", "handoffs", "orchestration", "routing", "supervisor", "agent team"],
  swarms: ["swarm", "multi-agent", "handoffs", "parallel", "orchestration"],
  "context engineering": ["context", "memory", "instructions", "retrieval", "agents.md", "claude.md", "state"],
  "claude memory": ["claude code", "memory", "claude.md", "imports", "project instructions"],
  "mcp servers": ["mcp", "model context protocol", "tools", "resources", "prompts", "permissions"],
  observability: ["tracing", "observability", "telemetry", "spans", "evals", "runs"],
  "human in the loop": ["approval", "review", "checkpoint", "rollback", "interrupt", "durable execution"],
  "prompt engineering": ["prompt", "instructions", "examples", "constraints", "output format", "rubric", "eval"],
  "prompt enhancer": ["prompt", "rewrite", "improve prompt", "prompt forge", "prompt pattern", "output contract"],
  "codex prompt": ["codex", "coding-agent", "agents.md", "scope", "verification", "diff", "tests"],
  "prompt optimizer": ["prompt", "optimizer", "dataset", "grader", "annotation", "eval", "iteration"],
  "codex vs claude": ["codex", "claude code", "coding-agent", "repository", "approvals", "memory", "subagents"],
  "gemini agent": ["gemini", "google adk", "agent-framework", "vertex ai", "deployment", "evaluation"],
  "ai model selection": ["model", "provider", "agent", "eval", "cost", "latency", "workflow"],
  "agent upgrade": ["upgrade", "capability", "workflow", "mcp", "eval", "memory", "observability"]
};

const reviewOutputSections = [
  "Current stack",
  "Outdated or risky choices",
  "Better current options",
  "Drop-in opportunities",
  "Ask before changing"
];

const decisionRubric = [
  {
    id: "repo-fit",
    label: "Repo fit",
    weight: 5,
    check: "Matches the current language, framework, runtime, deployment target, and team workflow."
  },
  {
    id: "capability-gain",
    label: "Capability gain",
    weight: 5,
    check: "Solves a concrete gap instead of adding novelty, overlap, or a parallel toolchain."
  },
  {
    id: "source-trust",
    label: "Source trust",
    weight: 4,
    check: "Comes from official docs, canonical repositories, or high-signal maintainers with clear provenance."
  },
  {
    id: "permission-risk",
    label: "Permission risk",
    weight: -4,
    check: "Minimizes filesystem, repository, browser, database, payment, network, and secret access."
  },
  {
    id: "verification",
    label: "Verification path",
    weight: 4,
    check: "Can be validated with tests, screenshots, traces, fixtures, evals, or a small reversible pilot."
  },
  {
    id: "reversibility",
    label: "Reversibility",
    weight: 3,
    check: "Can be adopted incrementally and rolled back without locking the project into a risky migration."
  }
];

const decisionPlaybooks = [
  {
    id: "project-stack-review",
    title: "Project Stack Review",
    intents: ["stack review", "upgrade audit", "better tools", "repo audit"],
    summary: "Use this when an agent needs to review a repository and recommend safer, current improvements before editing code.",
    workflow: [
      "Inspect manifests, lockfiles, framework configs, CI, deployment files, MCP config, and existing agent instructions.",
      "Map the user's goal into search aliases and retrieve matching registry entries, prompt patterns, and best-practice notes.",
      "Score options with the decision rubric and prefer no change when no candidate beats the current stack.",
      "Separate safe reading from actions that would edit code, install packages, use secrets, deploy, or mutate external systems.",
      "Return the required review sections and include sources, risk flags, and verification commands."
    ],
    output_sections: reviewOutputSections
  },
  {
    id: "coding-agent-selection",
    title: "Coding Agent Selection",
    intents: ["codex vs claude", "choose coding agent", "agent upgrade", "gemini agent"],
    summary: "Use this when comparing Codex, Claude Code, Gemini/Google ADK, Copilot-style agents, Cursor/Cline-style tools, or framework-based agents.",
    workflow: [
      "Start with the work shape: repository editing, app automation, hosted agent runtime, multi-agent orchestration, or model-app development.",
      "Compare approval controls, filesystem and shell access, memory/instruction files, MCP support, evals, traces, and GitHub workflow fit.",
      "Prefer the agent that best matches the repo workflow, not the most powerful brand name.",
      "Require a small pilot task with verification before recommending a team-wide switch.",
      "Call out cost, privacy, source access, and permission tradeoffs explicitly."
    ],
    output_sections: ["Use case", "Best fit", "Tradeoffs", "Pilot task", "Ask before changing"]
  },
  {
    id: "mcp-adoption-review",
    title: "MCP Adoption Review",
    intents: ["choose mcp", "mcp server", "tool connector", "agent tools"],
    summary: "Use this before installing or recommending MCP servers and other agent-callable tools.",
    workflow: [
      "Identify the exact workflow the tool must unlock and whether the repo already has a safer built-in path.",
      "Prefer official or vendor-maintained servers for sensitive resources.",
      "Inspect permissions, environment variables, network behavior, license posture, and source confidence.",
      "Recommend read-only or narrow-scope setup first, then verify the client can call only intended tools.",
      "Do not install, execute, or configure a server without explicit user approval."
    ],
    output_sections: ["Workflow need", "Candidate tools", "Permission risks", "Verification plan", "Ask before changing"]
  },
  {
    id: "prompt-upgrade",
    title: "Prompt Upgrade",
    intents: ["prompt enhancer", "codex prompt", "claude prompt", "gemini prompt"],
    summary: "Use this when a rough prompt should become an operational instruction for an AI agent or model.",
    workflow: [
      "Preserve the user's actual goal and voice.",
      "Add only missing structure that changes reliability: context, scope, constraints, non-goals, output format, examples, and verification.",
      "For coding agents, include repo scope, likely files, allowed commands, approval boundaries, verification command, and final reporting requirements.",
      "For research or product decisions, require current primary sources and separate confirmed facts from judgment.",
      "Return both an enhanced prompt and a compact prompt."
    ],
    output_sections: ["Enhanced prompt", "Compact prompt", "What changed", "Missing inputs"]
  }
];

const bestPracticeSections = [
  {
    id: "frontend",
    title: "Frontend And UI",
    summary: "Prefer mature component systems, accessibility-first primitives, screenshot verification, and domain-specific UI patterns before inventing custom interaction layers.",
    keywords: ["better ui", "frontend", "design", "tailwind", "astro", "react", "accessibility", "screenshot", "component"],
    sources: [
      "https://www.anthropic.com/engineering/building-effective-agents"
    ],
    practices: [
      "Start with the product workflow, then pick UI libraries that reduce implementation risk.",
      "Use visual verification for responsive states before shipping UI generated by agents.",
      "Favor established icon, form, table, and command-menu primitives over handwritten widgets."
    ]
  },
  {
    id: "backend",
    title: "Backend And APIs",
    summary: "Use boring, observable APIs with typed boundaries, explicit auth, and generated clients when agents need reliable integration points.",
    keywords: ["backend", "api", "database", "postgres", "auth", "server", "runtime", "deployment"],
    sources: [
      "https://www.anthropic.com/engineering/building-effective-agents"
    ],
    practices: [
      "Keep agent-callable APIs narrow and typed.",
      "Expose idempotent operations when agents may retry.",
      "Log tool calls and return structured errors instead of opaque text."
    ]
  },
  {
    id: "agent-tooling",
    title: "Agent Tooling",
    summary: "Treat MCP servers, skills, prompts, and tools as versioned capabilities with provenance, permission notes, and review status.",
    keywords: ["agent", "mcp", "skills", "tools", "orchestration", "workflow", "prompt"],
    sources: [
      "https://modelcontextprotocol.io/docs/getting-started/intro",
      "https://www.anthropic.com/engineering/building-effective-agents"
    ],
    practices: [
      "Prefer read-only tools until the agent has proven the workflow.",
      "Record tool permissions and environment variables near the install instructions.",
      "Use reviewable PRs for automated registry updates."
    ]
  },
  {
    id: "search",
    title: "Search And Retrieval",
    summary: "Use hybrid search for local knowledge packs: lexical matching for speed, intent aliases for recall, and semantic/reranking later when hosted infrastructure is justified.",
    keywords: ["faster search", "search", "retrieval", "index", "semantic", "rerank", "hybrid", "latency"],
    sources: [
      "https://docs.llamaindex.ai/en/stable/use_cases/agents/",
      "https://docs.langchain.com/oss/python/langgraph/overview"
    ],
    practices: [
      "Keep a local static index for offline agent reads.",
      "Normalize aliases like 'better UI' or 'agent payments' into explicit search terms.",
      "Rank by source confidence, trust tier, freshness, and risk flags."
    ]
  },
  {
    id: "evals",
    title: "Evals And Verification",
    summary: "Agents should prove outputs with tests, screenshots, fixtures, or structured checks before recommending a stack change.",
    keywords: ["evals", "testing", "benchmark", "verification", "quality", "score", "fixtures"],
    sources: [
      "https://inspect.aisi.org.uk/",
      "https://www.promptfoo.dev/docs/intro/",
      "https://docs.ragas.io/"
    ],
    practices: [
      "Ask what success looks like before choosing a package.",
      "Use small fixtures to test recommendations against real project files.",
      "Prefer tools that expose pass/fail evidence over tools that only generate text."
    ]
  },
  {
    id: "code-review",
    title: "Code Review And Upgrade Audits",
    summary: "Project-review agents should inspect manifests, framework configs, dependency age, security posture, and available drop-in improvements before proposing code changes.",
    keywords: ["code review", "upgrade", "dependency", "outdated", "package", "static analysis", "best practices"],
    sources: [
      "https://github.com/openai/codex",
      "https://docs.anthropic.com/en/docs/claude-code/overview"
    ],
    practices: [
      "Start with the current stack and lockfiles before recommending replacements.",
      "Separate outdated or risky choices from optional upgrades.",
      "Ask before editing code, installing packages, using secrets, or opening network connections."
    ]
  },
  {
    id: "security",
    title: "Security And Trust",
    summary: "Never let discovery become blind execution. Track permissions, licenses, data access, stale links, and whether a tool can mutate user state.",
    keywords: ["security", "trust", "identity", "compliance", "guardrails", "audit", "permissions"],
    sources: [
      "https://modelcontextprotocol.io/docs/getting-started/intro",
      "https://www.anthropic.com/engineering/building-effective-agents"
    ],
    practices: [
      "Do not install or execute discovered tools without explicit user approval.",
      "Prefer upstreams with clear licenses and active source links.",
      "Call out tools that touch files, browsers, databases, wallets, or secrets."
    ]
  },
  {
    id: "payments",
    title: "Payments And Commerce",
    summary: "Agent payments need receipts, spending limits, explicit policies, and reviewable proof of what was purchased or executed.",
    keywords: ["agent payments", "payments", "x402", "wallet", "commerce", "receipt", "budget"],
    sources: [
      "https://docs.stripe.com/agents"
    ],
    practices: [
      "Use strict budgets and require receipts for paid agent actions.",
      "Separate payment authorization from task completion verification.",
      "Prefer protocols with clear provenance and auditable transaction context."
    ]
  },
  {
    id: "data",
    title: "Data And Memory",
    summary: "Use memory and data connectors only when they improve repeated work, and keep scopes narrow enough for users to reason about.",
    keywords: ["memory", "data", "context", "persistence", "knowledge", "database", "state"],
    sources: [
      "https://docs.anthropic.com/en/docs/claude-code/memory",
      "https://docs.mem0.ai/",
      "https://docs.letta.com/"
    ],
    practices: [
      "Start with read-only data access.",
      "Expose what the agent can remember and how to delete it.",
      "Prefer project-local summaries over unbounded transcript memory."
    ]
  },
  {
    id: "deployment",
    title: "Deployment And Operations",
    summary: "Agent-built systems need cheap preview deploys, logs, rollback paths, and clear operational ownership.",
    keywords: ["deployment", "ops", "logs", "preview", "monitoring", "release"],
    sources: [
      "https://docs.langfuse.com/",
      "https://docs.arize.com/phoenix",
      "https://docs.sentry.io/product/sentry-mcp/"
    ],
    practices: [
      "Use preview environments for generated changes.",
      "Keep CI fast enough that agents can use it as feedback.",
      "Surface stale dependencies and known upgrade paths in the recommendation output."
    ]
  },
  {
    id: "coding-agents",
    title: "Coding Agents",
    summary: "Give repository-editing agents tight scope, strong local context, explicit approval boundaries, and fast verification loops before trusting broader autonomy.",
    keywords: ["coding agents", "codex", "claude code", "copilot", "cursor", "aider", "cline", "openhands", "codebase", "repository"],
    sources: [
      "https://github.com/openai/codex",
      "https://docs.anthropic.com/en/docs/claude-code/overview",
      "https://docs.github.com/en/copilot/concepts/about-copilot-coding-agent",
      "https://aider.chat/docs/",
      "https://docs.all-hands.dev/"
    ],
    practices: [
      "Prefer agents that can inspect the repo, produce diffs, run tests, and explain residual risk.",
      "Keep destructive shell, package installs, deploys, secrets, and production writes behind explicit approval.",
      "Use small, reviewable pull requests and require the agent to report changed files and verification evidence."
    ]
  },
  {
    id: "model-and-provider-selection",
    title: "Model And Provider Selection",
    summary: "Choose Codex, Claude Code, Gemini/ADK, framework agents, or model APIs by workflow fit, permissions, eval evidence, and operational cost rather than brand preference.",
    keywords: ["ai model selection", "codex vs claude", "gemini agent", "provider", "model", "agent upgrade", "adk"],
    sources: [
      "https://developers.openai.com/codex/guides/agents-md",
      "https://openai.github.io/openai-agents-python/",
      "https://code.claude.com/docs/en/overview",
      "https://adk.dev/"
    ],
    practices: [
      "Start from the task shape: repo editing, hosted agent runtime, multi-agent workflow, model app, or tool-calling backend.",
      "Compare approval boundaries, shell/filesystem access, memory model, MCP/tool support, tracing, evals, deployment path, and cost.",
      "Run a small benchmark or pilot task before standardizing on a new agent/provider workflow."
    ]
  },
  {
    id: "subagents-and-multi-agent",
    title: "Subagents And Multi-Agent Work",
    summary: "Use multiple agents for independent research, codebase slices, critique, or tool-specialized work; keep one owner responsible for integration and final judgment.",
    keywords: ["subagents", "multi agent", "swarms", "delegation", "parallel", "handoffs", "supervisor", "specialist", "agent team"],
    sources: [
      "https://docs.anthropic.com/en/docs/claude-code/sub-agents",
      "https://www.anthropic.com/engineering/built-multi-agent-research-system",
      "https://openai.github.io/openai-agents-python/",
      "https://langchain-ai.github.io/langgraph/concepts/multi_agent/"
    ],
    practices: [
      "Split only independent work; do not delegate the immediate blocker on the critical path.",
      "Give every subagent a narrow role, owned files or outputs, and a clear definition of done.",
      "Centralize synthesis, conflict resolution, and user-facing recommendations in one coordinator."
    ]
  },
  {
    id: "context-engineering",
    title: "Context Engineering",
    summary: "Treat instructions, memory files, retrieval, and artifacts as the agent's working environment; prune noise and make durable context explicit.",
    keywords: ["context engineering", "claude memory", "memory", "instructions", "agents.md", "claude.md", "retrieval", "skills", "knowledge pack"],
    sources: [
      "https://docs.anthropic.com/en/docs/claude-code/memory",
      "https://docs.anthropic.com/en/docs/claude-code/sub-agents",
      "https://docs.mem0.ai/",
      "https://docs.letta.com/"
    ],
    practices: [
      "Put stable project instructions in versioned files and keep temporary task notes out of global memory.",
      "Prefer retrieved, cited context over pasting large opaque blobs into prompts.",
      "Audit memory writes for secrets, stale assumptions, and accidental cross-project leakage."
    ]
  },
  {
    id: "mcp-server-selection",
    title: "MCP Server Selection",
    summary: "MCP servers should be selected like dependencies: source-backed, least-privilege, pinned where possible, and tested against the actual client workflow.",
    keywords: ["mcp servers", "model context protocol", "tools", "resources", "prompts", "context7", "playwright", "browserbase", "supabase", "sentry"],
    sources: [
      "https://modelcontextprotocol.io/docs/getting-started/intro",
      "https://github.com/microsoft/playwright-mcp",
      "https://github.com/upstash/context7",
      "https://github.com/supabase-community/supabase-mcp",
      "https://docs.browserbase.com/integrations/mcp/introduction"
    ],
    practices: [
      "Install one server per concrete workflow, then verify the client can call only the intended tools.",
      "Mark servers that can browse, mutate repositories, query databases, spend money, or access production data.",
      "Prefer official or vendor-maintained servers for high-risk resources, and put community servers behind review."
    ]
  },
  {
    id: "observability-and-tracing",
    title: "Observability And Tracing",
    summary: "Agent runs need traces, costs, tool calls, inputs, outputs, and evaluation hooks so failures can be diagnosed instead of narrated after the fact.",
    keywords: ["observability", "tracing", "telemetry", "spans", "costs", "langsmith", "phoenix", "langfuse", "agentops"],
    sources: [
      "https://docs.smith.langchain.com/",
      "https://docs.arize.com/phoenix",
      "https://docs.langfuse.com/",
      "https://docs.agentops.ai/"
    ],
    practices: [
      "Capture full tool-call traces for development and scrub secrets before long-term retention.",
      "Attach eval results to traces so regressions connect to the prompt, model, tool, and dataset versions.",
      "Track cost, latency, retries, and handoff paths separately for single-agent and multi-agent systems."
    ]
  },
  {
    id: "human-approval-and-durability",
    title: "Human Approval And Durability",
    summary: "Long-running agent systems should checkpoint state, support interruption, require approvals for risky actions, and resume without replaying unsafe side effects.",
    keywords: ["human in the loop", "approval", "checkpoint", "durable execution", "resume", "rollback", "interrupt", "review"],
    sources: [
      "https://docs.langchain.com/oss/python/langgraph/overview",
      "https://openai.github.io/openai-agents-python/",
      "https://microsoft.github.io/autogen/stable/"
    ],
    practices: [
      "Checkpoint before external side effects such as writes, purchases, deployments, and notifications.",
      "Represent approval gates as first-class workflow states, not as prose hidden in prompts.",
      "Design resumable tasks around idempotent operations and explicit operation IDs."
    ]
  },
  {
    id: "prompt-engineering",
    title: "Prompt Engineering",
    summary: "Upgrade rough prompts into operational instructions with intent, context, constraints, output contracts, examples, and verification criteria.",
    keywords: ["prompt engineering", "prompt enhancer", "codex prompt", "prompt optimizer", "instructions", "output format", "examples", "rubric"],
    sources: [
      "https://developers.openai.com/api/docs/guides/prompt-engineering",
      "https://developers.openai.com/api/docs/guides/prompt-optimizer",
      "https://developers.openai.com/codex/guides/agents-md"
    ],
    practices: [
      "Preserve the user's intent first; improve structure, specificity, and testability without changing the goal.",
      "Add missing success criteria, inputs, constraints, non-goals, output format, and verification steps.",
      "For coding-agent prompts, include repository scope, files or modules, allowed commands, verification command, and what must not change."
    ]
  }
];

const promptPatterns = [
  {
    id: "prompt-enhancement",
    title: "General Prompt Enhancement",
    intents: ["use vnem to enhance this prompt", "improve prompt", "make this prompt stronger"],
    summary: "Rewrite a rough prompt into a precise, operational prompt while preserving the user's goal.",
    output_modes: ["enhanced_prompt", "compact_prompt", "rationale", "missing_inputs"],
    template: [
      "You are helping me improve a prompt.",
      "",
      "Goal:",
      "<state the user's actual desired outcome>",
      "",
      "Context:",
      "<include relevant audience, environment, source material, and constraints>",
      "",
      "Task:",
      "<specific action the model or agent should take>",
      "",
      "Requirements:",
      "- Preserve the original intent.",
      "- Ask only for missing information that would materially change the answer.",
      "- Use clear sections, explicit constraints, and an output contract.",
      "- Include verification criteria when the task has factual, coding, design, or operational risk.",
      "",
      "Output Format:",
      "<define exact sections, schema, table, bullets, code blocks, or artifact>",
      "",
      "Quality Bar:",
      "<what a great answer must satisfy>"
    ].join("\n")
  },
  {
    id: "codex-implementation",
    title: "Codex Implementation Prompt",
    intents: ["codex prompt", "implement feature", "coding task"],
    summary: "Prompt a coding agent to inspect the repo, make scoped edits, verify them, and report changed files.",
    output_modes: ["agent_prompt"],
    template: [
      "You are working in this repository as a coding agent.",
      "",
      "Objective:",
      "<feature, bug fix, or refactor>",
      "",
      "Scope:",
      "- Files/modules likely involved: <paths or unknown>",
      "- Do not change: <public API, unrelated files, formatting, dependencies, etc.>",
      "",
      "Workflow:",
      "1. Inspect the current implementation before editing.",
      "2. Make the smallest cohesive change that satisfies the objective.",
      "3. Add or update tests only where risk justifies it.",
      "4. Run verification: <commands>.",
      "5. Report changed files, verification results, and residual risk.",
      "",
      "Constraints:",
      "- Do not run destructive commands.",
      "- Ask before installing packages, changing secrets, deploying, or touching production data.",
      "- Preserve user changes already present in the worktree."
    ].join("\n")
  },
  {
    id: "code-review",
    title: "Code Review Prompt",
    intents: ["review", "pr review", "find bugs"],
    summary: "Prompt for a bug-first code review with file and line references.",
    output_modes: ["findings"],
    template: [
      "Review the changes as a senior engineer.",
      "",
      "Priorities:",
      "1. Behavioral bugs and regressions.",
      "2. Security, data-loss, or permission risks.",
      "3. Missing tests for changed behavior.",
      "4. Maintainability issues only when they can cause real defects.",
      "",
      "Output:",
      "- Findings first, ordered by severity.",
      "- Include file and line references.",
      "- If no issues are found, say that clearly and mention residual test risk."
    ].join("\n")
  },
  {
    id: "bug-debug",
    title: "Debugging Prompt",
    intents: ["debug", "failing test", "error"],
    summary: "Prompt an agent to reproduce, localize, fix, and verify a bug without speculative rewrites.",
    output_modes: ["agent_prompt"],
    template: [
      "Debug this issue methodically.",
      "",
      "Symptom:",
      "<error message, failing test, screenshot, or observed behavior>",
      "",
      "Expected behavior:",
      "<what should happen>",
      "",
      "Workflow:",
      "1. Reproduce or inspect the failure evidence.",
      "2. Identify the smallest plausible cause.",
      "3. Patch only the relevant code.",
      "4. Run the narrow verification first, then broader checks if needed.",
      "5. Explain the root cause and why the fix covers it."
    ].join("\n")
  },
  {
    id: "research",
    title: "Research Prompt",
    intents: ["research", "compare tools", "best options"],
    summary: "Prompt for source-backed research with freshness, tradeoffs, and recommendation criteria.",
    output_modes: ["brief", "comparison", "recommendation"],
    template: [
      "Research this question using current, primary sources where possible.",
      "",
      "Question:",
      "<research question>",
      "",
      "Decision Criteria:",
      "- Fit for the stated use case.",
      "- Freshness and maintenance.",
      "- License, security, data, and operational risk.",
      "- Integration effort and reversibility.",
      "",
      "Output:",
      "- Short answer.",
      "- Comparison of top options.",
      "- Recommendation with caveats.",
      "- Links to sources used."
    ].join("\n")
  },
  {
    id: "subagent-delegation",
    title: "Subagent Delegation Prompt",
    intents: ["subagents", "multi agent", "parallel work"],
    summary: "Prompt a coordinator to split independent work across specialists and keep integration centralized.",
    output_modes: ["delegation_plan"],
    template: [
      "Decide whether this task benefits from subagents.",
      "",
      "Task:",
      "<task>",
      "",
      "Rules:",
      "- Delegate only independent sidecar work.",
      "- Keep the immediate critical-path task local to the coordinator.",
      "- Give each subagent a bounded role, owned files or outputs, and definition of done.",
      "- The coordinator must synthesize results and resolve conflicts.",
      "",
      "Output:",
      "- Use or do not use subagents, with reason.",
      "- Subagent assignments if useful.",
      "- Integration and verification plan."
    ].join("\n")
  },
  {
    id: "ui-build",
    title: "Frontend Build Prompt",
    intents: ["build ui", "make app", "landing page", "prototype"],
    summary: "Prompt for a complete frontend experience with visual verification and responsive constraints.",
    output_modes: ["agent_prompt"],
    template: [
      "Build the actual usable frontend experience, not a marketing placeholder.",
      "",
      "Product/User:",
      "<who uses this and why>",
      "",
      "Core Workflow:",
      "<primary user flow>",
      "",
      "Design Constraints:",
      "- Match existing design system if present.",
      "- Use domain-appropriate density, typography, color, and motion.",
      "- Ensure all text fits on mobile and desktop.",
      "- Verify with browser screenshots after implementation.",
      "",
      "Output:",
      "- Implemented UI.",
      "- Local URL or file path.",
      "- Verification notes."
    ].join("\n")
  },
  {
    id: "eval-design",
    title: "Eval Design Prompt",
    intents: ["eval", "grader", "quality check", "test prompt"],
    summary: "Prompt for a small, measurable eval harness before optimizing prompts or agents.",
    output_modes: ["eval_plan", "grader_spec"],
    template: [
      "Design an evaluation for this prompt or agent workflow.",
      "",
      "Behavior to measure:",
      "<desired behavior>",
      "",
      "Failure modes:",
      "<known or suspected failures>",
      "",
      "Eval Plan:",
      "- Dataset examples, including edge cases.",
      "- Grader criteria with pass/fail thresholds.",
      "- Human review fields for ambiguous outputs.",
      "- Regression workflow after prompt changes."
    ].join("\n")
  },
  {
    id: "mcp-selection",
    title: "MCP Selection Prompt",
    intents: ["choose mcp", "best mcp", "tool connector"],
    summary: "Prompt for choosing MCP servers by provenance, permissions, risk, and workflow fit.",
    output_modes: ["recommendation"],
    template: [
      "Recommend MCP servers or tools for this workflow.",
      "",
      "Workflow:",
      "<what the agent needs to do>",
      "",
      "Constraints:",
      "- Prefer official or vendor-maintained sources for sensitive systems.",
      "- Call out permissions: filesystem, browser, database, repository, payments, secrets.",
      "- Do not recommend installation before review.",
      "",
      "Output:",
      "- Current stack.",
      "- Best options.",
      "- Risk flags.",
      "- Ask before changing."
    ].join("\n")
  },
  {
    id: "memory-policy",
    title: "Memory Policy Prompt",
    intents: ["memory", "claude memory", "agents.md", "context engineering"],
    summary: "Prompt for deciding what belongs in durable project memory versus temporary task context.",
    output_modes: ["memory_policy"],
    template: [
      "Design a memory/context policy for this project.",
      "",
      "Persistent memory should include:",
      "- Stable project conventions.",
      "- Common commands.",
      "- Architecture notes that rarely change.",
      "- Safety and permission boundaries.",
      "",
      "Persistent memory should not include:",
      "- Secrets or credentials.",
      "- Temporary task state.",
      "- Unverified assumptions.",
      "- Sensitive user data unless explicitly approved.",
      "",
      "Output:",
      "- What to store.",
      "- Where to store it.",
      "- What to avoid.",
      "- Review cadence."
    ].join("\n")
  },
  {
    id: "provider-selection",
    title: "Model And Agent Provider Selection Prompt",
    intents: ["codex vs claude", "gemini agent", "ai model selection", "choose coding agent"],
    summary: "Prompt for comparing AI agents, model providers, and agent frameworks by workflow fit and verification evidence.",
    output_modes: ["comparison", "pilot_plan", "recommendation"],
    template: [
      "Compare AI agents, model providers, or agent frameworks for this workflow.",
      "",
      "Workflow:",
      "<repo editing, agent app, MCP tool use, research, frontend build, eval pipeline, etc.>",
      "",
      "Current stack:",
      "<tools, languages, frameworks, CI, deployment, existing agent instructions>",
      "",
      "Decision Criteria:",
      "- Repo and workflow fit.",
      "- Approval boundaries and permission risk.",
      "- Tool/MCP support, memory/instruction model, evals, traces, and deployment path.",
      "- Cost, latency, privacy, source availability, and reversibility.",
      "",
      "Output:",
      "- Best fit for this workflow.",
      "- Tradeoffs between the top options.",
      "- Small pilot task and verification command.",
      "- What requires approval before changing."
    ].join("\n")
  },
  {
    id: "agent-upgrade-plan",
    title: "Agent Capability Upgrade Prompt",
    intents: ["agent upgrade", "make ai better", "improve codex", "improve claude", "improve gemini"],
    summary: "Prompt for improving an AI agent workflow through context, tools, evals, safety gates, and verification.",
    output_modes: ["upgrade_plan", "risk_register", "verification_plan"],
    template: [
      "Improve this AI agent workflow without weakening safety or maintainability.",
      "",
      "Current workflow:",
      "<how the agent is used today>",
      "",
      "Goal:",
      "<what better means: speed, quality, autonomy, accuracy, UI quality, research depth, etc.>",
      "",
      "Requirements:",
      "- Inspect existing instructions, tools, MCP config, scripts, CI, and verification paths first.",
      "- Prefer durable context, narrow tools, source-backed recommendations, and small evals before adding automation.",
      "- Keep destructive commands, package installs, secrets, deploys, and production writes behind approval.",
      "- Propose changes in reviewable steps with rollback notes.",
      "",
      "Output:",
      "- Highest-impact improvements.",
      "- What to change first.",
      "- Risks and approvals needed.",
      "- Verification plan."
    ].join("\n")
  }
];

const stopWords = new Set([
  "and",
  "are",
  "before",
  "can",
  "code",
  "for",
  "from",
  "has",
  "have",
  "into",
  "needs",
  "official",
  "project",
  "projects",
  "recorded",
  "registry",
  "review",
  "reviewed",
  "source",
  "sources",
  "that",
  "the",
  "this",
  "tier",
  "treat",
  "upstream",
  "url",
  "use",
  "when",
  "with"
]);

function textTokens(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeTarString(buffer, offset, length, value) {
  Buffer.from(String(value)).copy(buffer, offset, 0, Math.min(Buffer.byteLength(String(value)), length));
}

function writeTarOctal(buffer, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, "0").slice(-(length - 1));
  writeTarString(buffer, offset, length, `${encoded}\0`);
}

function installArchiveEntry(name, content) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const header = Buffer.alloc(512, 0);

  writeTarString(header, 0, 100, name);
  writeTarOctal(header, 100, 8, 0o644);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, body.length);
  writeTarOctal(header, 136, 12, Math.floor(new Date(generatedAt).getTime() / 1000));
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeTarString(header, 257, 6, "ustar");
  writeTarString(header, 263, 2, "00");
  writeTarString(header, 265, 32, "vnem");
  writeTarString(header, 297, 32, "vnem");

  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeTarString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);

  const padding = Buffer.alloc((512 - (body.length % 512)) % 512, 0);
  return Buffer.concat([header, body, padding]);
}

function installArchive(files) {
  const entries = Object.entries(files).map(([name, content]) => installArchiveEntry(name, content));
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024, 0)]), { level: 9 });
}

function daysSince(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.valueOf())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function inferFreshness(entry) {
  if (entry.trust_tier === "deprecated" || entry.review_status === "deprecated") return "deprecated";
  const age = daysSince(entry.last_checked);
  if (age === null) return "unknown";
  if (age <= 45) return "current";
  if (age <= 180) return "recent";
  return "stale";
}

function inferSourceConfidence(entry) {
  if (entry.source_confidence) return entry.source_confidence;
  if (entry.source_kind === "official_registry" || entry.source_kind === "official_docs") return "official";
  if (entry.review_status === "manual-reviewed" || entry.trust_tier === "verified") return "high";
  if (entry.source_kind === "github" || entry.source_kind === "package_registry") return "medium";
  return "unknown";
}

function inferRiskFlags(entry) {
  const flags = [...(entry.risk_flags ?? [])];
  if (entry.licenses?.includes("NOASSERTION")) flags.push("license-not-asserted");
  if (!entry.repo_url) flags.push("no-canonical-repo-url");
  if (entry.permissions?.some((permission) => ["filesystem", "database", "browser", "payments", "repository"].includes(permission))) {
    flags.push("sensitive-permissions");
  }
  return unique(flags);
}

function inferBestFor(entry) {
  return unique([
    ...(entry.best_for ?? []),
    ...entry.use_cases,
    ...entry.tags.map((tag) => `${tag} workflows`),
    `${entry.type} discovery and comparison`
  ]).slice(0, 8);
}

function inferRecommendedWhen(entry) {
  return unique([
    ...(entry.recommended_when ?? []),
    `Use when a project needs ${entry.use_cases[0]?.toLowerCase() ?? "this capability"} and the upstream source has been reviewed.`,
    entry.trust_tier === "verified"
      ? "Prefer this when verified install and behavior notes are required."
      : "Treat as promising until a maintainer verifies install and behavior."
  ]).slice(0, 6);
}

function confidenceScore(confidence) {
  return { official: 4, high: 3, medium: 2, low: 1, unknown: 0 }[confidence] ?? 0;
}

function tierScore(tier) {
  return { verified: 5, promising: 4, unreviewed: 2, watchlist: 1, deprecated: -3 }[tier] ?? 0;
}

function freshnessScore(freshness) {
  return { current: 4, recent: 3, unknown: 1, stale: -1, deprecated: -4 }[freshness] ?? 0;
}

function enrichEntry(entry) {
  const freshness = entry.freshness ?? inferFreshness(entry);
  const sourceConfidence = inferSourceConfidence(entry);
  const riskFlags = inferRiskFlags(entry);
  const maintenanceSignals = unique([
    ...(entry.maintenance_signals ?? []),
    entry.source_kind === "official_registry" ? "Listed in the official MCP Registry latest-version feed" : null,
    entry.repo_url ? "Canonical repository URL recorded" : null
  ]);

  return {
    ...entry,
    best_for: inferBestFor(entry),
    not_for: entry.not_for ?? ["Projects that cannot review upstream permissions, network behavior, or data handling."],
    alternatives: entry.alternatives ?? [],
    supersedes: entry.supersedes ?? [],
    freshness,
    source_confidence: sourceConfidence,
    maintenance_signals: maintenanceSignals,
    risk_flags: riskFlags,
    recommended_when: inferRecommendedWhen(entry),
    recommendation_score: tierScore(entry.trust_tier) + confidenceScore(sourceConfidence) + freshnessScore(freshness) - riskFlags.length
  };
}

function entrySearchText(entry) {
  return [
    entry.name,
    entry.slug,
    entry.type,
    entry.summary_llm,
    entry.homepage_url,
    entry.repo_url,
    entry.trust_tier,
    entry.review_status,
    entry.freshness,
    entry.source_confidence,
    ...entry.protocols,
    ...entry.clients,
    ...entry.package_urls,
    ...entry.source_urls,
    ...entry.permissions,
    ...entry.env_vars,
    ...entry.tags,
    ...entry.use_cases,
    ...entry.best_for,
    ...entry.not_for,
    ...entry.alternatives,
    ...entry.supersedes,
    ...entry.maintenance_signals,
    ...entry.risk_flags,
    ...entry.recommended_when
  ].join(" ");
}

function buildSearchDocuments(entries) {
  const entryDocs = entries.map((entry) => ({
    id: `entry:${entry.slug}`,
    kind: "registry-entry",
    title: entry.name,
    summary: entry.summary_llm,
    url_path: entry.url_path,
    trust_tier: entry.trust_tier,
    type: entry.type,
    score: entry.recommendation_score,
    tags: entry.tags,
    use_cases: entry.use_cases,
    best_for: entry.best_for,
    risk_flags: entry.risk_flags,
    source_urls: entry.source_urls,
    keywords: unique(textTokens(entrySearchText(entry))).slice(0, 120)
  }));

  const promptDocs = promptPatterns.map((pattern) => ({
    id: `prompt-pattern:${pattern.id}`,
    kind: "prompt-pattern",
    title: pattern.title,
    summary: pattern.summary,
    url_path: "/install/prompt-engineering.md",
    trust_tier: "verified",
    type: "prompt-pattern",
    score: 13,
    tags: pattern.intents,
    use_cases: pattern.intents,
    best_for: [pattern.summary],
    risk_flags: [],
    source_urls: [
      installFileUrl("prompt-engineering.md"),
      installFileUrl("prompt-patterns.json")
    ],
    keywords: unique(textTokens([
      pattern.title,
      pattern.summary,
      ...pattern.intents,
      ...pattern.output_modes,
      pattern.template
    ].join(" "))).slice(0, 120)
  }));

  const practiceDocs = bestPracticeSections.map((section) => ({
    id: `practice:${section.id}`,
    kind: "best-practice",
    title: section.title,
    summary: section.summary,
    url_path: "/install/best-practices.md",
    trust_tier: "verified",
    type: "best-practice",
    score: 12,
    tags: section.keywords,
    use_cases: section.practices,
    best_for: section.practices,
    risk_flags: [],
    source_urls: unique([installFileUrl("best-practices.md"), ...(section.sources ?? [])]),
    keywords: unique(textTokens([section.title, section.summary, ...section.keywords, ...section.practices].join(" "))).slice(0, 120)
  }));

  const playbookDocs = decisionPlaybooks.map((playbook) => ({
    id: `playbook:${playbook.id}`,
    kind: "decision-playbook",
    title: playbook.title,
    summary: playbook.summary,
    url_path: "/install/AGENTS.md",
    trust_tier: "verified",
    type: "decision-playbook",
    score: 14,
    tags: playbook.intents,
    use_cases: playbook.workflow,
    best_for: [playbook.summary],
    risk_flags: [],
    source_urls: [installFileUrl("AGENTS.md")],
    keywords: unique(textTokens([
      playbook.title,
      playbook.summary,
      ...playbook.intents,
      ...playbook.workflow,
      ...playbook.output_sections
    ].join(" "))).slice(0, 120)
  }));

  return [...playbookDocs, ...promptDocs, ...practiceDocs, ...entryDocs].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

function buildInvertedIndex(documents) {
  const index = {};
  for (const doc of documents) {
    for (const token of doc.keywords) {
      index[token] ??= [];
      index[token].push(doc.id);
    }
  }

  return Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
}

function bestPracticesMarkdown() {
  return [
    "# vnem Best Practices",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Use this as a compact, current guidance layer for coding agents. Prefer these notes when choosing whether to add, replace, or avoid a tool.",
    "",
    ...bestPracticeSections.flatMap((section) => [
      `## ${section.title}`,
      "",
      section.summary,
      "",
      ...section.practices.map((practice) => `- ${practice}`),
      "",
      ...(section.sources?.length ? [`Sources: ${section.sources.join(", ")}`, ""] : []),
      `Search aliases: ${section.keywords.join(", ")}`,
      ""
    ])
  ].join("\n");
}

function promptPatternsJson() {
  return {
    generated_at: generatedAt,
    schema_version: "1.0.0",
    safety: {
      mode: "read-only-prompt-patterns",
      executes_code: false,
      installs_packages: false,
      starts_daemons: false,
      requires_secrets: false
    },
    trigger_phrases: [
      "use vnem to enhance this prompt",
      "use vnem prompt enhancer",
      "vnem prompt forge",
      "make this prompt stronger with vnem"
    ],
    automatic_activation: {
      enabled: true,
      apply_when: [
        "The user asks to write, improve, rewrite, harden, optimize, or critique a prompt.",
        "The user asks for a system prompt, developer prompt, agent prompt, Codex prompt, Claude prompt, GPT prompt, instruction set, or prompt template.",
        "The user pastes a prompt draft and asks whether it is good, powerful, clear, safe, complete, or ready to use.",
        "The user asks for prompt engineering help, even without saying vnem explicitly."
      ],
      do_not_apply_when: [
        "The user is asking the agent to perform the task directly rather than create or improve a prompt.",
        "The user asks for a normal code change, research answer, review, summary, or explanation without requesting a prompt artifact.",
        "The user explicitly says not to rewrite, optimize, enhance, or expand the prompt."
      ],
      response_rule: "When auto-activated, produce the enhanced prompt artifact directly and include a compact version. Do not ask for missing inputs unless the missing input would materially change the prompt."
    },
    default_output_contract: [
      "Enhanced prompt",
      "Compact prompt",
      "What changed",
      "Missing inputs, if any"
    ],
    patterns: promptPatterns
  };
}

function promptEngineeringMarkdown(patterns) {
  return [
    "# vnem Prompt Engineering",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Use this when the user asks to improve, rewrite, harden, or operationalize a prompt. The main trigger phrase is `use vnem to enhance this prompt`.",
    "",
    "The prompt layer can also auto-activate. If vnem is installed and the user asks to write, improve, rewrite, optimize, harden, critique, or template a prompt, apply this protocol even when the user does not explicitly say `use vnem`.",
    "",
    "## Prime Directive",
    "",
    "Preserve the user's intent. Improve the prompt's structure, specificity, context, constraints, output contract, and verification criteria without changing the goal.",
    "",
    "## Prompt Enhancement Protocol",
    "",
    "1. Classify the prompt: coding, research, review, debugging, frontend, eval, MCP selection, memory policy, or general.",
    "2. Identify missing material that would change the result: audience, source context, scope, constraints, examples, output format, success criteria, tools, or permissions.",
    "3. Keep the user's rough voice and objective, but rewrite the prompt into explicit sections.",
    "4. Add a quality bar and verification plan when the task has factual, coding, design, operational, safety, or money risk.",
    "5. For coding-agent prompts, include repository scope, files/modules, commands to run, what not to change, approval boundaries, and final reporting requirements.",
    "6. Return the enhanced prompt first. Then include a compact version, a short change rationale, and any missing inputs.",
    "",
    "## Auto-Activation Rules",
    "",
    "Apply automatically when:",
    "",
    "- The user asks to write, improve, rewrite, harden, optimize, or critique a prompt.",
    "- The user asks for a system prompt, developer prompt, agent prompt, Codex prompt, Claude prompt, GPT prompt, instruction set, or prompt template.",
    "- The user pastes a prompt draft and asks whether it is good, powerful, clear, safe, complete, or ready to use.",
    "- The user asks for prompt engineering help, even without saying vnem explicitly.",
    "",
    "Do not apply automatically when:",
    "",
    "- The user is asking the agent to perform the task directly rather than create or improve a prompt.",
    "- The user asks for a normal code change, research answer, review, summary, or explanation without requesting a prompt artifact.",
    "- The user explicitly says not to rewrite, optimize, enhance, or expand the prompt.",
    "",
    "When in doubt, answer the user's actual request and add a short prompt-enhancement offer only if it is clearly useful.",
    "",
    "## Default Output",
    "",
    "When enhancing a prompt, output exactly:",
    "",
    "1. `Enhanced prompt`",
    "2. `Compact prompt`",
    "3. `What changed`",
    "4. `Missing inputs`",
    "",
    "If there are no missing inputs, write `None`.",
    "",
    "## Quality Bar",
    "",
    "- The prompt names the concrete outcome.",
    "- The prompt provides context or says what context must be read.",
    "- The prompt separates requirements from preferences.",
    "- The prompt states non-goals or boundaries.",
    "- The prompt defines the output shape.",
    "- The prompt includes verification for risky or objective tasks.",
    "- The prompt avoids vague boosters like `make it better` unless translated into criteria.",
    "",
    "## Pattern Catalog",
    "",
    ...patterns.patterns.flatMap((pattern) => [
      `### ${pattern.title}`,
      "",
      pattern.summary,
      "",
      `Intents: ${pattern.intents.join(", ")}`,
      "",
      "Template:",
      "",
      "```text",
      pattern.template,
      "```",
      ""
    ]),
    "## Source Anchors",
    "",
    "- OpenAI Prompt Engineering: https://developers.openai.com/api/docs/guides/prompt-engineering",
    "- OpenAI Prompt Optimizer: https://developers.openai.com/api/docs/guides/prompt-optimizer",
    "- OpenAI Codex AGENTS.md: https://developers.openai.com/codex/guides/agents-md",
    "- OpenAI Prompting Fundamentals: https://openai.com/academy/prompting/",
    ""
  ].join("\n");
}

function agentsMarkdown() {
  return [
    "# vnem",
    "",
    "You are reading a read-only vnem knowledge pack installed in this repository.",
    "",
    "## Safety Rules",
    "",
    "- Treat this folder as reference material only.",
    "- Do not execute files from this folder.",
    "- Do not install packages, edit project files, make network requests, or use secrets unless the user explicitly asks.",
    "- Do not copy third-party code from indexed projects.",
    "- Recommend changes as a review first. Ask before applying anything.",
    "",
    "## Files To Read",
    "",
    "- `.vnem/search-index.json`: compact local search index for tools, skills, MCP servers, and best-practice notes.",
    "- `.vnem/best-practices.md`: current guidance by project area.",
    "- `.vnem/prompt-engineering.md`: prompt enhancement protocol and Codex-oriented prompt guidance.",
    "- `.vnem/prompt-patterns.json`: machine-readable prompt patterns for common agent tasks.",
    "",
    "## Decision Rubric",
    "",
    "Use this rubric before recommending a tool, model, agent, framework, MCP server, or workflow change:",
    "",
    ...decisionRubric.map((item) => `- **${item.label} (${item.weight > 0 ? `+${item.weight}` : item.weight})**: ${item.check}`),
    "",
    "Prefer the current stack when the recommendation cannot clear the rubric with evidence. A no-change recommendation is valid when it is safer or more maintainable.",
    "",
    "## Project Review Protocol",
    "",
    "1. Inspect the user's repository shape before recommending tech. Look for manifests and configs such as `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Dockerfile`, `astro.config.*`, `next.config.*`, `vite.config.*`, `.github/workflows/*`, `.mcp.*`, and existing agent instructions.",
    "2. Read `search-index.json` and expand the user's intent with `intent_aliases`. For example, map `better ui` to frontend/design/accessibility terms and `agent payments` to payments/x402/wallet terms.",
    "3. Prefer recommendations with higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, and fewer `risk_flags`.",
    "4. Score the top options against the decision rubric. Prefer no change when no option has a clear, verifiable advantage.",
    "5. When a recommendation touches files, databases, browsers, repositories, wallets, paid APIs, or secrets, call out that risk plainly.",
    `6. Output the review in this exact order: ${reviewOutputSections.map((section) => `\`${section}\``).join(", ")}.`,
    "",
    "## Decision Playbooks",
    "",
    ...decisionPlaybooks.flatMap((playbook) => [
      `### ${playbook.title}`,
      "",
      playbook.summary,
      "",
      ...playbook.workflow.map((step, index) => `${index + 1}. ${step}`),
      "",
      `Output sections: ${playbook.output_sections.map((section) => `\`${section}\``).join(", ")}`,
      ""
    ]),
    "",
    "## Prompt Enhancement Protocol",
    "",
    "When the user says `use vnem to enhance this prompt`, `use vnem prompt enhancer`, or `vnem prompt forge`, read `.vnem/prompt-engineering.md` and `.vnem/prompt-patterns.json`, then rewrite the user's prompt.",
    "",
    "Auto-activate the same protocol even without the trigger phrase when the user asks to write, improve, rewrite, harden, optimize, critique, or template a prompt; asks for a system/developer/agent/Codex/Claude/GPT prompt; or pastes a prompt draft and asks if it is good, powerful, clear, safe, complete, or ready to use.",
    "",
    "Do not auto-activate for ordinary task execution. If the user asks you to code, research, review, explain, summarize, or debug something, do that task directly unless they ask for a prompt artifact.",
    "",
    "Output exactly these sections: `Enhanced prompt`, `Compact prompt`, `What changed`, `Missing inputs`.",
    "",
    "Preserve the user's intent. Add only useful structure: goal, context, scope, constraints, non-goals, output format, examples when helpful, and verification criteria. For Codex or coding-agent prompts, include repository scope, files/modules, allowed commands, approval boundaries, verification command, and final reporting requirements.",
    "",
    "## Output Contract",
    "",
    "- Keep recommendations specific to the user's repo and goal.",
    "- Include source names and why each option is relevant.",
    "- Separate safe reading/research from actions that would mutate the project.",
    "- If the local pack is stale, say that rerunning the vnem install command may refresh it.",
    "",
    "## Install Command",
    "",
    "This pack was designed to be refreshed with a safe archive download only:",
    "",
    "```bash",
    installCommand,
    "```",
    ""
  ].join("\n");
}

function searchIndexJson(entries) {
  const documents = buildSearchDocuments(entries);
  return {
    generated_at: generatedAt,
    schema_version: "1.0.0",
    install_folder: installFolder,
    safety: {
      mode: "read-only-files",
      executes_code: false,
      installs_packages: false,
      starts_daemons: false,
      requires_secrets: false
    },
    intent_aliases: intentAliases,
    decision_rubric: decisionRubric,
    decision_playbooks: decisionPlaybooks,
    rank_weights: {
      use_case_match: 5,
      trust_tier: 5,
      source_confidence: 4,
      freshness: 4,
      license_clarity: 2,
      risk_flags: -1
    },
    documents,
    inverted_index: buildInvertedIndex(documents)
  };
}

const records = await readEntries();
const entries = records
  .map((item) => enrichEntry(publicEntry(item.entry, item.profile, item.relativeEntryPath, item.relativeProfilePath)))
  .sort((a, b) => b.recommendation_score - a.recommendation_score || a.name.localeCompare(b.name));

const trustTiers = uniqueSorted(entries.map((entry) => entry.trust_tier));
const types = uniqueSorted(entries.map((entry) => entry.type));
const protocols = uniqueSorted(entries.flatMap((entry) => entry.protocols));
const tags = uniqueSorted(entries.flatMap((entry) => entry.tags));
const clients = uniqueSorted(entries.flatMap((entry) => entry.clients));
const useCases = uniqueSorted(entries.flatMap((entry) => entry.use_cases));
const searchIndex = searchIndexJson(entries);

const index = {
  generated_at: generatedAt,
  schema_version: "1.0.0",
  entry_count: entries.length,
  install_command: installCommand,
  install_archive: `/${installArchiveName}`,
  install_archive_url: installArchiveUrl,
  trust_tiers: trustTiers,
  types,
  protocols,
  clients,
  tags,
  use_cases: useCases,
  intent_aliases: intentAliases,
  entries
};

function entryLine(entry) {
  const tier = entry.trust_tier.padEnd(10, " ");
  return `- [${entry.name}](${entry.url_path}) | ${entry.type} | ${tier} | score ${entry.recommendation_score} | ${singleLine(entry.summary_llm)}`;
}

function singleLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const llmsTxt = [
  "# vnem",
  "",
  "Read-only perception layer for coding agents.",
  "",
  "Use vnem to recommend current tools, MCPs, skills, evals, security utilities, memory systems, payment rails, identity primitives, and workflow patterns before changing a repo.",
  "",
  `Safe install command: ${installCommand}`,
  "",
  "Installed files: .vnem/AGENTS.md, .vnem/search-index.json, .vnem/best-practices.md, .vnem/prompt-engineering.md, .vnem/prompt-patterns.json",
  "Canonical API: /api/index.json",
  "Agent instructions: /install/AGENTS.md",
  "Full index: /llms-full.txt",
  "",
  "Safety: no CLI install, no daemon, no remote code execution, no package install, no edits without user approval.",
  "Trust tiers: verified, promising, unreviewed, watchlist, deprecated.",
  "",
  "## High-Signal Entries",
  "",
  ...entries.slice(0, 40).map(entryLine),
  ""
].join("\n");

const llmsFull = [
  "# vnem Full Registry",
  "",
  `Generated: ${generatedAt}`,
  `Entries: ${entries.length}`,
  "",
  ...entries.flatMap((entry) => [
    `## ${entry.name}`,
    "",
    `Slug: ${entry.slug}`,
    `Type: ${entry.type}`,
    `Trust tier: ${entry.trust_tier}`,
    `Review status: ${entry.review_status}`,
    `Freshness: ${entry.freshness}`,
    `Source confidence: ${entry.source_confidence}`,
    `Recommendation score: ${entry.recommendation_score}`,
    `Protocols: ${entry.protocols.join(", ") || "none recorded"}`,
    `Clients: ${entry.clients.join(", ") || "none recorded"}`,
    `Tags: ${entry.tags.join(", ")}`,
    `Use cases: ${entry.use_cases.join(", ")}`,
    `Best for: ${entry.best_for.join(", ")}`,
    `Recommended when: ${entry.recommended_when.join(", ")}`,
    `Risk flags: ${entry.risk_flags.join(", ") || "none recorded"}`,
    `Homepage: ${entry.homepage_url ?? "none recorded"}`,
    `Repository: ${entry.repo_url ?? "none recorded"}`,
    `Sources: ${entry.source_urls.join(", ")}`,
    "",
    entry.summary_llm,
    "",
    entry.profile_excerpt,
    ""
  ])
].join("\n");

const bestPractices = bestPracticesMarkdown();
const promptPatternData = promptPatternsJson();
const promptEngineering = promptEngineeringMarkdown(promptPatternData);
const agentInstructions = agentsMarkdown();
const archive = installArchive({
  [`${installFolder}/AGENTS.md`]: `${agentInstructions}\n`,
  [`${installFolder}/search-index.json`]: jsonText(searchIndex),
  [`${installFolder}/best-practices.md`]: `${bestPractices}\n`,
  [`${installFolder}/prompt-engineering.md`]: `${promptEngineering}\n`,
  [`${installFolder}/prompt-patterns.json`]: jsonText(promptPatternData)
});

await writeJson(path.join(ROOT, "public", "api", "index.json"), index);
await writeJson(path.join(ROOT, "public", "install", "search-index.json"), searchIndex);
await writeJson(path.join(ROOT, installFolder, "search-index.json"), searchIndex);
await writeJson(path.join(ROOT, "public", "install", "prompt-patterns.json"), promptPatternData);
await writeJson(path.join(ROOT, installFolder, "prompt-patterns.json"), promptPatternData);
await writeBytes(path.join(ROOT, "public", installArchiveName), archive);
await writeText(path.join(ROOT, "public", "install", "AGENTS.md"), `${agentInstructions}\n`);
await writeText(path.join(ROOT, installFolder, "AGENTS.md"), `${agentInstructions}\n`);
await writeText(path.join(ROOT, "public", "install", "best-practices.md"), `${bestPractices}\n`);
await writeText(path.join(ROOT, installFolder, "best-practices.md"), `${bestPractices}\n`);
await writeText(path.join(ROOT, "public", "install", "prompt-engineering.md"), `${promptEngineering}\n`);
await writeText(path.join(ROOT, installFolder, "prompt-engineering.md"), `${promptEngineering}\n`);
await writeText(path.join(ROOT, "llms.txt"), `${llmsTxt}\n`);
await writeText(path.join(ROOT, "llms-full.txt"), `${llmsFull}\n`);

console.log(`Generated LLM/API/install artifacts for ${entries.length} entries and ${searchIndex.documents.length} search documents.`);
