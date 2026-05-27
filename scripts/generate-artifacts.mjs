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
  "browser game": ["web game", "html5 game", "game", "canvas", "animation", "vite", "phaser", "pixi", "three.js", "input", "collision", "game ui", "game testing"],
  "web game": ["browser game", "html5 game", "canvas", "webgl", "webgpu", "vite", "phaser", "pixi", "three.js", "playcanvas", "game testing"],
  "html5 game": ["browser game", "web game", "canvas", "webgl", "2d game", "phaser", "excalibur", "kaplay", "input"],
  "canvas game": ["browser game", "web game", "canvas", "2d", "game loop", "animation", "collision", "particles", "requestanimationframe"],
  "2d game": ["browser game", "canvas game", "phaser", "pixi", "excalibur", "kaplay", "matter.js", "rapier", "sprites"],
  "3d game": ["browser game", "webgl", "webgpu", "three.js", "babylon.js", "playcanvas", "webxr", "3d assets"],
  "game engine": ["game", "phaser", "pixi", "three.js", "babylon.js", "playcanvas", "excalibur", "kaplay", "matter.js", "rapier", "engine", "physics", "renderer"],
  "game ui": ["game hud", "menus", "contrast", "readability", "touch targets", "feedback", "onboarding", "pause", "restart"],
  "game accessibility": ["contrast", "input remapping", "keyboard", "gamepad", "touch", "captions", "reduced motion", "photosensitivity", "wcag"],
  "game physics": ["matter.js", "rapier", "fixed timestep", "collision", "rigid body", "determinism", "simulation"],
  "game testing": ["playwright", "browser testing", "canvas pixel check", "input simulation", "state transitions", "restart", "runtime verification"],
  "canvas performance": ["canvas", "requestanimationframe", "offscreen canvas", "render loop", "batch drawing", "pre-render", "webgl", "webgpu"],
  "faster search": ["search", "retrieval", "index", "semantic", "rerank", "latency"],
  "agent payments": ["payments", "x402", "wallet", "commerce", "checkout", "receipt"],
  "code review": ["pull request", "static analysis", "dependency", "upgrade", "outdated", "package audit"],
  memory: ["memory", "context", "persistence", "knowledge", "state"],
  evals: ["eval", "testing", "benchmark", "verification", "quality", "score"],
  "agent news": ["news", "signals", "release", "trend", "freshness", "registry"],
  "source radar": ["research layer", "source intake", "docs index", "mcp registry", "official docs", "llms.txt", "freshness", "provenance"],
  "research layer": ["source radar", "source intake", "current docs", "official docs", "mcp registry", "benchmark evidence", "evidence"],
  "source intake": ["source radar", "research layer", "upstream source", "source trust", "provenance", "license", "permissions", "risk review"],
  "benchmark evidence": ["evals", "inspect ai", "promptfoo", "ragas", "quality evidence", "performance data", "regression test", "pilot task"],
  "pre execution gateway": ["zero trust gateway", "agent gateway", "tool firewall", "command risk", "alignment barrier", "path confinement", "secret redaction"],
  "zero trust gateway": ["pre execution gateway", "tool pinning", "schema hashing", "mcp rug pull", "tool poisoning", "read only hint", "destructive hint"],
  "tool pinning": ["schema hash", "tool schema", "mcp rug pull", "tool poisoning", "tools/list_changed", "tool annotations", "tool metadata"],
  "package firewall": ["dependency firewall", "package risk", "typosquatting", "dependency install", "npm package", "cargo package", "package metadata"],
  "ast indexer": ["tree-sitter", "code graph", "codebase graph", "structural index", "symbol graph", "imports", "call graph", "soft delete"],
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
  "agent upgrade": ["upgrade", "capability", "workflow", "mcp", "eval", "memory", "observability"],
  "code simplification": ["refactor", "minimalism", "code quality", "dead code", "duplication", "complexity", "tests", "ast-grep", "knip", "jscpd"],
  "code compaction": ["simplify code", "reduce code", "minimal code", "dead code", "duplication", "behavior preserving", "refactor"],
  "minimal code": ["minimalism", "simple design", "small API", "refactor", "remove duplication", "delete dead code", "feature preservation"],
  "professional code": ["code quality", "maintainability", "clarity", "refactor", "tests", "lint", "style guide", "review"],
  refactor: ["behavior preserving", "small steps", "tests", "code review", "simplify code", "ast-grep", "codemod"],
  "dead code": ["unused exports", "unused files", "unused dependencies", "knip", "dependency audit", "delete code"]
};

const intentRoutes = {
  "browser game": {
    read_first: ["practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas with Vite or a tiny static server", "Phaser", "PixiJS", "Excalibur", "KAPLAY", "Three.js", "Babylon.js", "PlayCanvas"],
    choose_by: ["2D or 3D gameplay", "asset loading and physics needs", "dependency budget", "input model", "accessibility needs", "real-browser verification path"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "web game": {
    read_first: ["practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas with Vite for compact custom 2D", "Phaser for full 2D game framework needs", "PixiJS for rendering-heavy 2D", "Three.js/Babylon.js/PlayCanvas for true 3D"],
    choose_by: ["playability requirements", "rendering dimension", "engine structure needed", "browser support", "verification evidence"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "html5 game": {
    read_first: ["practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas", "Phaser", "PixiJS", "Excalibur", "KAPLAY"],
    choose_by: ["custom game feel", "scene and asset needs", "TypeScript preference", "prototype speed", "mobile/touch behavior"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "canvas game": {
    read_first: ["practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas with Vite or a tiny static server", "Phaser", "PixiJS", "Excalibur", "KAPLAY"],
    choose_by: ["custom game feel", "rendering complexity", "input model", "collision needs", "dependency budget", "canvas performance risk"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "2d game": {
    read_first: ["practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas for tiny bespoke games", "Phaser for scenes/sprites/audio/cameras", "PixiJS for renderer-first interaction", "Excalibur for TypeScript-first 2D", "KAPLAY for fast prototypes"],
    choose_by: ["scene complexity", "sprite/asset pipeline", "physics needs", "typing preference", "prototype speed", "polish budget"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "3d game": {
    read_first: ["practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Three.js for custom 3D scenes", "Babylon.js for full 3D engine features", "PlayCanvas for browser-first 3D engine/editor workflows"],
    choose_by: ["3D scene complexity", "asset pipeline", "physics/XR needs", "WebGL/WebGPU support", "performance tooling"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "game engine": {
    read_first: ["practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Phaser for full 2D game framework needs", "PixiJS for fast 2D rendering", "Excalibur for TypeScript-first 2D", "KAPLAY for quick playful 2D", "Three.js for custom 3D", "Babylon.js or PlayCanvas for full 3D engine workflows", "Canvas for compact custom 2D MVPs"],
    choose_by: ["engine features needed", "visual direction", "physics/audio/asset pipeline", "bundle size", "maintenance risk", "runtime verification path"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "game ui": {
    read_first: ["practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["in-canvas HUD", "DOM overlay UI", "engine UI primitives", "existing app design system"],
    choose_by: ["readability", "input method", "responsive scaling", "contrast", "feedback clarity", "localization risk"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "game accessibility": {
    read_first: ["practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["keyboard/touch/gamepad parity", "remappable controls", "high-contrast HUD", "reduced motion", "captions or visual audio cues"],
    choose_by: ["gameplay-critical information", "required inputs", "motion intensity", "audio dependence", "target devices"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "game physics": {
    read_first: ["practice:browser-games", "practice:evals"],
    compare_options: ["simple custom collision", "Matter.js for approachable 2D rigid bodies", "Rapier for higher-performance 2D/3D physics"],
    choose_by: ["collision complexity", "determinism needs", "WASM bundling tolerance", "engine integration", "fixed-step simulation requirements"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "game testing": {
    read_first: ["practice:browser-games", "practice:evals"],
    compare_options: ["unit tests for pure rules", "browser automation for input flows", "canvas pixel checks for nonblank rendering", "manual smoke playthrough"],
    choose_by: ["game state complexity", "visual regressions", "input coverage", "restart and terminal states", "CI browser availability"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "canvas performance": {
    read_first: ["practice:browser-games", "practice:frontend"],
    compare_options: ["plain Canvas 2D", "batched Canvas drawing", "OffscreenCanvas for heavy repeated work", "PixiJS/WebGL for many sprites", "Three.js/Babylon/PlayCanvas for 3D"],
    choose_by: ["number of moving objects", "text/render cost", "worker support", "GPU needs", "device targets"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "better ui": {
    read_first: ["practice:frontend", "practice:context-engineering", "practice:evals"],
    compare_options: ["existing project design system", "mature UI primitives", "custom CSS only when scope is tiny"],
    choose_by: ["workflow fit", "accessibility", "responsive verification", "dependency budget"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "codex vs claude": {
    read_first: ["playbook:coding-agent-selection", "practice:model-and-provider-selection", "practice:agent-tooling", "practice:evals"],
    compare_options: ["Codex", "Claude Code", "Gemini/Google ADK", "Copilot-style agents", "Cursor/Cline-style tools", "framework-based agents"],
    choose_by: ["repo workflow fit", "approval boundaries", "shell and filesystem model", "memory and instruction model", "MCP/tool support", "verification and cost"],
    report: ["vnem intents searched", "top matches", "best fit", "pilot task"]
  },
  "gemini agent": {
    read_first: ["playbook:coding-agent-selection", "practice:model-and-provider-selection", "practice:agent-tooling", "practice:evals"],
    compare_options: ["Gemini/Google ADK", "Codex", "Claude Code", "hosted agent runtimes", "model API tool-calling"],
    choose_by: ["Google ecosystem fit", "agent framework needs", "deployment path", "tooling and evaluation support", "privacy and cost"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "ai model selection": {
    read_first: ["playbook:coding-agent-selection", "practice:model-and-provider-selection", "practice:evals", "practice:observability-and-tracing"],
    compare_options: ["coding agent", "model API", "agent framework", "MCP-enabled workflow", "existing project tool"],
    choose_by: ["task shape", "quality evidence", "latency", "cost", "privacy", "operational fit", "reversibility"],
    report: ["vnem intents searched", "top matches", "recommendation", "verification plan"]
  },
  "agent upgrade": {
    read_first: ["playbook:project-stack-review", "playbook:coding-agent-selection", "playbook:prompt-upgrade", "practice:model-and-provider-selection", "practice:context-engineering", "practice:evals"],
    compare_options: ["better instructions", "prompt pattern", "MCP/tool addition", "memory policy", "eval fixture", "agent/provider switch"],
    choose_by: ["highest concrete capability gap", "permission risk", "verification path", "rollback path", "maintenance cost"],
    report: ["vnem intents searched", "top matches", "upgrade path", "risk and verification"]
  },
  "source radar": {
    read_first: ["source:mcp-core-and-registry", "source:coding-agent-clients", "source:documentation-ingestion", "playbook:source-intake-review", "practice:research-source-intake"],
    compare_options: ["official docs", "canonical GitHub repositories", "official registries", "vendor MCP docs", "evaluation frameworks", "llms.txt indexes"],
    choose_by: ["source confidence", "freshness", "license clarity", "permission risk", "agent-client relevance", "verification path"],
    report: ["source category", "why it matters", "trust and risk", "intake path", "refresh cadence"]
  },
  "research layer": {
    read_first: ["source:mcp-core-and-registry", "source:coding-agent-clients", "source:evaluation-and-observability", "playbook:source-intake-review", "practice:research-source-intake"],
    compare_options: ["static registry entry", "best-practice note", "prompt pattern", "watched source", "benchmark fixture"],
    choose_by: ["whether agents need it before editing", "source trust", "context saved", "maintenance effort", "risk flags"],
    report: ["sources consulted", "decision", "data to add", "verification evidence"]
  },
  "source intake": {
    read_first: ["playbook:source-intake-review", "practice:research-source-intake", "source:mcp-core-and-registry"],
    compare_options: ["add watched source only", "add registry entry", "add best-practice note", "add prompt pattern", "defer as out of scope"],
    choose_by: ["official provenance", "license posture", "permissions", "risk flags", "whether a real agent workflow improves"],
    report: ["candidate", "trust tier", "risk flags", "artifact to update", "verification"]
  },
  "benchmark evidence": {
    read_first: ["source:evaluation-and-observability", "practice:evals", "playbook:source-intake-review"],
    compare_options: ["small repo pilot", "prompt regression suite", "tool-call trace review", "before/after recommendation diff", "manual maintainer review"],
    choose_by: ["measurable behavior", "repeatability", "cost", "failure-mode coverage", "fit to Vnem's read-only model"],
    report: ["metric", "dataset or fixture", "baseline", "expected improvement", "review gate"]
  },
  "pre execution gateway": {
    read_first: ["playbook:zero-trust-gateway-review", "practice:zero-trust-agent-gateway", "source:agentic-gateway-security", "practice:mcp-server-selection"],
    compare_options: ["read-only Vnem guidance", "advisory gateway design", "client-side approval policy", "separate runtime proxy", "language/runtime rewrite"],
    choose_by: ["blast radius", "deterministic controls", "client compatibility", "secret handling", "path confinement", "verification coverage"],
    report: ["safe subset", "blocked risky scope", "phased design", "required tests", "approval gates"]
  },
  "zero trust gateway": {
    read_first: ["playbook:zero-trust-gateway-review", "practice:zero-trust-agent-gateway", "source:agentic-gateway-security"],
    compare_options: ["tool annotations as hints", "schema hash pinning", "workspace path policy", "redacted audit logging", "package firewall advisory", "runtime sandbox"],
    choose_by: ["enforceability", "trusted boundary", "false-positive cost", "rollback path", "whether the install pack remains read-only"],
    report: ["trust boundary", "control type", "what is deterministic", "what needs human approval"]
  },
  "tool pinning": {
    read_first: ["playbook:zero-trust-gateway-review", "practice:zero-trust-agent-gateway", "source:agentic-gateway-security"],
    compare_options: ["schema hash pinning", "tool allowlist", "server/version pin", "list_changed invalidation", "manual approval on schema drift"],
    choose_by: ["source trust", "schema stability", "client support", "failure mode", "auditability"],
    report: ["server", "tool", "known hash", "drift behavior", "review action"]
  },
  "package firewall": {
    read_first: ["playbook:zero-trust-gateway-review", "practice:zero-trust-agent-gateway", "practice:code-review"],
    compare_options: ["manifest diff review", "package metadata check", "typosquat heuristic", "maintainer/license check", "lockfile-only policy"],
    choose_by: ["ecosystem", "registry metadata quality", "install side effects", "maintainer trust", "verification path"],
    report: ["package", "risk signal", "allowed or blocked", "manual review needed"]
  },
  "ast indexer": {
    read_first: ["playbook:zero-trust-gateway-review", "practice:zero-trust-agent-gateway", "practice:code-simplification"],
    compare_options: ["read-only symbol extraction", "tree-sitter prototype", "language-specific parser", "existing repo search", "external code graph"],
    choose_by: ["language coverage", "index correctness", "incremental update safety", "soft deletion handling", "whether it changes project files"],
    report: ["languages", "nodes and edges", "incremental strategy", "consistency guard"]
  },
  "code simplification": {
    read_first: ["practice:code-simplification", "practice:code-review", "practice:evals"],
    compare_options: ["behavior-preserving refactor", "dead-code audit", "duplicate-code audit", "AST-aware codemods", "repo-native lint and format rules"],
    choose_by: ["language and framework", "test coverage", "public API stability", "blast radius", "reviewability", "tool permission risk"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "code compaction": {
    read_first: ["practice:code-simplification", "practice:code-review", "practice:evals"],
    compare_options: ["delete unreachable code", "collapse duplication", "extract only proven shared concepts", "replace custom code with existing local helpers", "defer dependency changes until justified"],
    choose_by: ["feature preservation evidence", "test coverage", "runtime behavior", "readability after change", "diff size"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  }
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
    intents: ["stack review", "upgrade audit", "better tools", "repo audit", "agent upgrade"],
    summary: "Use this when an agent needs to review a repository and recommend safer, current improvements before editing code.",
    workflow: [
      "Inspect manifests, lockfiles, framework configs, CI, deployment files, MCP config, and existing agent instructions.",
      "Map the user's goal into search aliases and retrieve matching registry entries, prompt patterns, routes, and best-practice notes.",
      "Score options with the decision rubric and prefer no change when no candidate beats the current stack.",
      "Separate safe reading from actions that would edit code, install packages, use secrets, deploy, or mutate external systems.",
      "Return the required review sections and include sources, risk flags, and verification commands."
    ],
    output_sections: reviewOutputSections
  },
  {
    id: "coding-agent-selection",
    title: "Coding Agent Selection",
    intents: ["codex vs claude", "choose coding agent", "agent upgrade", "gemini agent", "ai model selection"],
    summary: "Use this when comparing Codex, Claude Code, Gemini/Google ADK, Copilot-style agents, Cursor/Cline-style tools, or framework-based agents.",
    workflow: [
      "Start with the work shape: repository editing, app automation, hosted agent runtime, multi-agent orchestration, model-app development, or browser-game build work.",
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
    id: "source-intake-review",
    title: "Source Intake Review",
    intents: ["source radar", "research layer", "source intake", "mcp registry", "docs mcp", "benchmark evidence"],
    summary: "Use this when deciding whether an upstream doc, MCP server, registry, benchmark, or agent workflow source belongs in Vnem.",
    workflow: [
      "Classify the source as protocol docs, client docs, registry feed, MCP server, eval/observability, prompt pattern, or product signal.",
      "Prefer official docs, canonical repositories, vendor-maintained MCPs, and sources with llms.txt or clear machine-readable indexes.",
      "Record provenance, license posture, freshness, permissions, risk flags, and what agent decision the source improves.",
      "Do not copy long upstream documentation into Vnem; link to sources and write original summaries or small metadata entries.",
      "Choose the smallest artifact: watched source, registry entry, best-practice note, prompt pattern, eval fixture, or no change.",
      "Require a verification path before promoting trust: link check, local MCP smoke test, install review, or before/after agent benchmark."
    ],
    output_sections: ["Source candidate", "Why it matters", "Trust and risk", "Intake path", "Verification"]
  },
  {
    id: "zero-trust-gateway-review",
    title: "Zero-Trust Gateway Review",
    intents: ["pre execution gateway", "zero trust gateway", "tool pinning", "package firewall", "ast indexer", "agent gateway"],
    summary: "Use this when a proposal asks Vnem to intercept tools, pin schemas, redact secrets, block risky commands, index code, or add a package firewall.",
    workflow: [
      "Reject all-at-once runtime rewrites unless the current repo already has that runtime boundary and tests.",
      "Classify each proposal as guidance, advisory analysis, deterministic enforcement, or external runtime enforcement.",
      "Keep the install pack read-only: do not add daemons, shell proxies, package installs, or automatic mutation to `.vnem/`.",
      "Treat MCP tool annotations as useful risk hints, not security guarantees; untrusted servers can mislabel behavior.",
      "Prefer deterministic checks first: path prefix policy, schema hash drift detection, secret redaction, manifest diff review, and explicit approval gates.",
      "Require adversarial tests before any enforcement claim: traversal blocks, redaction, schema drift, mismatched write intent, malicious test hooks, and package-addition review.",
      "If a runtime gateway is still justified, build it as a separate reviewed surface with a threat model, small pilot, rollback path, and compatibility matrix."
    ],
    output_sections: ["Prompt review", "Safe subset", "Risky or blocked scope", "Phased implementation", "Verification gates"]
  },
  {
    id: "prompt-upgrade",
    title: "Prompt Upgrade",
    intents: ["prompt enhancer", "codex prompt", "claude prompt", "gemini prompt", "agent upgrade"],
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

const sourceRadar = [
  {
    id: "mcp-core-and-registry",
    title: "MCP Core Docs And Official Registry",
    category: "protocol-registry",
    priority: "critical",
    summary: "Track MCP protocol docs, specification changes, and the official MCP registry before adding or recommending MCP servers.",
    use_when: [
      "An agent is choosing, comparing, or installing MCP servers.",
      "A registry entry depends on MCP transport, tools, resources, prompts, elicitation, or auth behavior.",
      "Hermes or maintainers need a source of truth for new MCP server discovery."
    ],
    monitor: [
      "Protocol docs and llms.txt index",
      "Official registry API and repository updates",
      "Server metadata, package sources, licenses, and published versions"
    ],
    risk_checks: [
      "Registry preview or API stability notes",
      "Server provenance and package ownership",
      "Tool permissions, network access, secrets, and write capability"
    ],
    source_urls: [
      "https://modelcontextprotocol.io/docs/getting-started/intro",
      "https://modelcontextprotocol.io/llms.txt",
      "https://github.com/modelcontextprotocol/registry",
      "https://registry.modelcontextprotocol.io/v0.1/servers"
    ]
  },
  {
    id: "coding-agent-clients",
    title: "Coding Agent Client Docs",
    category: "agent-client",
    priority: "critical",
    summary: "Track how major coding agents load instructions, MCP tools, memory, subagents, approvals, and project context.",
    use_when: [
      "Vnem needs to support Codex, Claude Code, OpenCode, Gemini/ADK, or similar coding agents.",
      "A recommendation depends on how the agent reads AGENTS.md, CLAUDE.md, MCP resources, prompts, or memory.",
      "The install pack or MCP server should be easier to use across multiple agent clients."
    ],
    monitor: [
      "Instruction-file behavior",
      "MCP configuration and transport support",
      "Memory, subagent, approval, and tool-search behavior",
      "Windows, terminal, IDE, and browser support"
    ],
    risk_checks: [
      "Client-specific config drift",
      "Features that require account login, OAuth, or paid plans",
      "Actions that bypass repo review, approvals, or least privilege"
    ],
    source_urls: [
      "https://developers.openai.com/codex/guides/agents-md",
      "https://code.claude.com/docs/en/overview",
      "https://code.claude.com/docs/en/mcp",
      "https://code.claude.com/docs/en/memory",
      "https://code.claude.com/docs/en/sub-agents",
      "https://opencode.ai/docs/",
      "https://adk.dev/"
    ]
  },
  {
    id: "documentation-ingestion",
    title: "Documentation Ingestion Sources",
    category: "current-docs",
    priority: "high",
    summary: "Prefer LLM-oriented documentation indexes and source-backed doc retrieval so agents stop wasting context on broad web searches.",
    use_when: [
      "A coding agent needs current library, framework, SDK, or MCP documentation.",
      "Vnem should point to a source rather than copying long upstream docs into the registry.",
      "A source has an llms.txt index, canonical docs, or a docs-specific MCP."
    ],
    monitor: [
      "llms.txt and llms-full.txt availability",
      "Canonical documentation URLs",
      "Docs MCP servers and CLI doc retrievers"
    ],
    risk_checks: [
      "Stale generated docs",
      "Unclear docs provenance",
      "Copied upstream content that exceeds fair-use or license boundaries"
    ],
    source_urls: [
      "https://llmstxt.org/",
      "https://github.com/upstash/context7",
      "https://docs.firecrawl.dev/mcp-server"
    ]
  },
  {
    id: "browser-and-ui-verification",
    title: "Browser And UI Verification Sources",
    category: "verification-tooling",
    priority: "high",
    summary: "Track browser automation and hosted browser MCPs that let agents verify rendered apps instead of guessing from code.",
    use_when: [
      "An agent is building UI, debugging a browser app, validating accessibility snapshots, or checking frontend regressions.",
      "Vnem needs to recommend a browser MCP or verification workflow.",
      "A product claim depends on visible UI behavior rather than static code."
    ],
    monitor: [
      "Playwright MCP capabilities",
      "Browserbase MCP capabilities",
      "Client support for browser MCPs, screenshots, accessibility snapshots, and hosted sessions"
    ],
    risk_checks: [
      "Browser/network access",
      "Credential exposure through pages",
      "Stateful sessions and paid browser infrastructure"
    ],
    source_urls: [
      "https://github.com/microsoft/playwright-mcp",
      "https://docs.browserbase.com/integrations/mcp/introduction"
    ]
  },
  {
    id: "platform-and-data-connectors",
    title: "Platform And Data Connector Sources",
    category: "sensitive-connectors",
    priority: "high",
    summary: "Track official or vendor-maintained MCPs for repositories, databases, monitoring, payments, and web extraction with explicit permission review.",
    use_when: [
      "An agent needs GitHub, Supabase, Sentry, Stripe, Firecrawl, or another external service.",
      "A registry entry can read production-like data, write issues, query databases, spend money, or browse the web.",
      "Vnem needs to recommend least-privilege, read-only, or sandbox-first setup."
    ],
    monitor: [
      "Official MCP repositories and docs",
      "Available tool groups, scopes, and read-only modes",
      "OAuth, PAT, API key, and sandbox guidance"
    ],
    risk_checks: [
      "Repository write access",
      "Database writes or production data",
      "Payment or billing side effects",
      "Monitoring data sensitivity",
      "Prompt injection through fetched external content"
    ],
    source_urls: [
      "https://github.com/github/github-mcp-server",
      "https://supabase.com/docs/guides/ai-tools/mcp",
      "https://mcp.sentry.dev/",
      "https://docs.stripe.com/agents",
      "https://docs.firecrawl.dev/mcp-server"
    ]
  },
  {
    id: "evaluation-and-observability",
    title: "Evaluation And Observability Sources",
    category: "quality-evidence",
    priority: "high",
    summary: "Track eval and tracing systems so Vnem can prove whether an agent workflow actually improves output quality, speed, and safety.",
    use_when: [
      "A claim says Vnem improves recommendations, engineering velocity, prompt quality, or tool choice.",
      "A prompt, MCP, agent, or model switch needs a before/after benchmark.",
      "Maintainers need traces or eval logs to explain why an agent made a decision."
    ],
    monitor: [
      "Small repeatable eval frameworks",
      "Prompt and agent regression suites",
      "Trace, cost, latency, and tool-call observability"
    ],
    risk_checks: [
      "Benchmarks that do not match real repo tasks",
      "Scores without reproducible fixtures",
      "Telemetry or traces containing secrets or private code"
    ],
    source_urls: [
      "https://inspect.aisi.org.uk/",
      "https://www.promptfoo.dev/docs/intro/",
      "https://docs.ragas.io/",
      "https://docs.langfuse.com/",
      "https://docs.arize.com/phoenix"
    ]
  },
  {
    id: "secure-mcp-distribution",
    title: "Secure MCP Distribution Sources",
    category: "distribution",
    priority: "medium",
    summary: "Track curated MCP catalogs and containerized distribution models for safer team adoption of third-party MCP servers.",
    use_when: [
      "A team wants approved MCP catalogs instead of ad hoc server installs.",
      "A server has dependency, runtime, or package provenance concerns.",
      "Vnem needs to distinguish local, remote, containerized, and organization-approved MCP deployment paths."
    ],
    monitor: [
      "Catalog provenance and SBOM metadata",
      "Container signing and update cadence",
      "Team profiles, custom catalogs, and allowed-server policies"
    ],
    risk_checks: [
      "Catalog beta or preview status",
      "Container trust and host access",
      "Remote OAuth and external service permissions"
    ],
    source_urls: [
      "https://docs.docker.com/ai/mcp-catalog-and-toolkit/catalog/",
      "https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/"
    ]
  },
  {
    id: "agentic-gateway-security",
    title: "Agentic Gateway Security Sources",
    category: "security-architecture",
    priority: "high",
    summary: "Track security sources for tool annotations, schema drift, secret handling, workspace confinement, package risk, and agent runtime approval design.",
    use_when: [
      "A proposal asks Vnem to act as a pre-execution gateway, command proxy, package firewall, schema pinning layer, or AST indexer.",
      "An agent wants to classify tool calls as read-only, mutating, destructive, open-world, or approval-required.",
      "Maintainers need to distinguish metadata hints from enforceable security controls."
    ],
    monitor: [
      "MCP tool annotation semantics and list-changed behavior",
      "Client approval and sandbox behavior",
      "Package registry provenance and dependency-risk guidance",
      "Secret detection and redaction rules"
    ],
    risk_checks: [
      "Untrusted tool metadata must not be treated as enforcement.",
      "Runtime command interception needs a threat model before implementation.",
      "Path confinement and redaction claims require adversarial tests.",
      "Package firewall decisions can break valid developer workflows and need override paths."
    ],
    source_urls: [
      "https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/",
      "https://modelcontextprotocol.io/specification/2025-06-18/schema",
      "https://ts.sdk.modelcontextprotocol.io/variables/types.ToolAnnotationsSchema.html",
      "https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning",
      "https://docs.npmjs.com/about-registry-signatures"
    ]
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
    id: "browser-games",
    title: "Browser Games And Interactive Canvas",
    score: 16,
    summary: "For browser-native games, choose the lightest proven stack that can deliver real playability: responsive rendering, input, rules, state transitions, visible feedback, accessible UI, and browser-verified behavior.",
    keywords: ["browser game", "web game", "html5 game", "canvas game", "2d game", "3d game", "game engine", "game ui", "game accessibility", "game physics", "game testing", "canvas performance", "canvas", "animation", "vite", "phaser", "pixi", "excalibur", "kaplay", "three.js", "babylon.js", "playcanvas", "matter.js", "rapier"],
    sources: [
      "https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API",
      "https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame",
      "https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas",
      "https://web.dev/articles/canvas-performance",
      "https://vite.dev/guide/",
      "https://docs.phaser.io/",
      "https://pixijs.com/",
      "https://excaliburjs.com/",
      "https://kaplayjs.com/",
      "https://threejs.org/docs/",
      "https://doc.babylonjs.com/setup/support/webGPU",
      "https://github.com/playcanvas/engine",
      "https://github.com/liabru/matter-js",
      "https://github.com/dimforge/rapier.js/",
      "https://learn.microsoft.com/en-us/gaming/accessibility/guidelines",
      "https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/102",
      "https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107",
      "https://w3c.github.io/wcag/guidelines/22/",
      "https://arxiv.org/abs/2605.17637"
    ],
    practices: [
      "Pick the smallest stack that satisfies playability: Canvas with Vite for tiny custom 2D, Phaser for scene/sprite/audio/camera-heavy 2D, PixiJS for renderer-first 2D interaction, Excalibur for TypeScript-first 2D, and KAPLAY for fast playful prototypes.",
      "Use Three.js for custom 3D scenes, Babylon.js for richer 3D engine features, and PlayCanvas when a browser-first 3D engine/editor workflow is valuable; avoid 3D stacks for simple 2D games.",
      "Add physics only when game rules need it: prefer simple custom collision first, Matter.js for approachable 2D rigid bodies, and Rapier when higher-performance 2D/3D physics or determinism options matter.",
      "Build the loop around requestAnimationFrame timestamps, separate update and render work, use fixed-step simulation for physics-sensitive games, and keep pause/resume behavior explicit.",
      "Model input as actions rather than raw keys so keyboard, pointer, touch, and gamepad controls can share game logic and be remapped for nontrivial games.",
      "Include asset preload/loading, start, pause, win, lose, restart, and error states before visual flourishes; browser games fail quickly when a terminal state or restart path is missing.",
      "Design game UI for readability during motion: high-contrast HUD text, clear hit/damage/reward feedback, stable layout, large touch targets, and readable menus on both desktop and mobile.",
      "Treat accessibility as game feel: provide keyboard/touch parity where practical, avoid color-only cues, respect reduced-motion needs, watch photosensitive flashing, and add captions or visual audio cues when sound carries gameplay information.",
      "Verify delivered playability in a real browser: serve locally, confirm nonblank canvas pixels, simulate inputs, check state transitions and restart, inspect desktop and mobile viewports, and test audio unlock behavior.",
      "Use performance work after the game is playable: batch Canvas drawing, pre-render expensive repeated work to snug offscreen buffers, measure before optimizing, and move to WebGL/WebGPU libraries when object count or effects justify it.",
      "For coding-agent evaluation, judge the delivered game rather than just build success; browser games expose input, spatial mapping, rules, terminal conditions, restart, and visible-feedback failures that normal code checks miss."
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
    id: "code-simplification",
    title: "Code Simplification And Minimal Refactors",
    score: 18,
    summary: "Simplify code by preserving behavior first, deleting proven waste, reducing duplication, and using the project's existing abstractions before introducing new ones.",
    keywords: ["code simplification", "code compaction", "minimal code", "professional code", "refactor", "dead code", "duplication", "complexity", "knip", "jscpd", "ast-grep"],
    sources: [
      "https://refactoring.com/",
      "https://martinfowler.com/bliki/OpportunisticRefactoring.html",
      "https://knip.dev/",
      "https://jscpd.dev/",
      "https://ast-grep.github.io/"
    ],
    practices: [
      "Treat simplification as behavior-preserving refactoring: characterize current behavior with tests, snapshots, fixtures, or golden examples before deleting or reshaping code.",
      "Prefer deletion over abstraction when code is unused, unreachable, duplicated, or handled by an existing local helper.",
      "Use static evidence before edits: lexical search, AST-aware search, unused-file/export/dependency checks, duplicate-code detection, and existing lint or type checks.",
      "Keep public APIs, data formats, error behavior, and user-visible workflows stable unless the user explicitly asks for a product change.",
      "Make small reviewable steps: remove dead code, collapse duplication, simplify control flow, then rerun focused and broad verification."
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
    id: "research-source-intake",
    title: "Research Source Intake",
    score: 14,
    summary: "Treat Vnem as a source router, not a document dump: capture official, current, machine-readable sources that help agents make better decisions before editing.",
    keywords: ["source radar", "research layer", "source intake", "current docs", "official docs", "mcp registry", "llms.txt", "benchmark evidence", "provenance", "freshness"],
    sources: [
      "https://modelcontextprotocol.io/docs/getting-started/intro",
      "https://github.com/modelcontextprotocol/registry",
      "https://llmstxt.org/",
      "https://developers.openai.com/codex/guides/agents-md",
      "https://code.claude.com/docs/en/mcp",
      "https://inspect.aisi.org.uk/"
    ],
    practices: [
      "Start source intake from the agent decision it improves: tool choice, MCP adoption, model/provider selection, prompt upgrade, eval design, UI verification, or risk review.",
      "Prefer official docs, canonical repositories, maintained registries, llms.txt indexes, vendor MCP docs, and eval frameworks with repeatable fixtures.",
      "Keep Vnem metadata original and compact; preserve source URLs instead of copying long upstream docs into the install pack.",
      "Record trust tier, source confidence, freshness, permissions, license posture, risk flags, and whether the source can mutate external systems.",
      "Separate discovery from promotion: Hermes can suggest candidates, but maintainers should review before raising trust or recommending installs.",
      "Tie important claims to a small benchmark, smoke test, link check, or before/after agent recommendation diff."
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
    id: "zero-trust-agent-gateway",
    title: "Zero-Trust Agent Gateway Readiness",
    score: 14,
    summary: "Move toward gateway behavior in phases: advisory guidance first, deterministic checks second, runtime enforcement only after threat modeling and adversarial tests.",
    keywords: ["pre execution gateway", "zero trust gateway", "tool pinning", "schema hashing", "mcp rug pull", "tool poisoning", "package firewall", "ast indexer", "path confinement", "secret redaction", "command risk"],
    sources: [
      "https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/",
      "https://modelcontextprotocol.io/specification/2025-06-18/schema",
      "https://ts.sdk.modelcontextprotocol.io/variables/types.ToolAnnotationsSchema.html",
      "https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning",
      "https://docs.npmjs.com/about-registry-signatures"
    ],
    practices: [
      "Do not convert the read-only Vnem install pack into a daemon, shell proxy, package installer, or runtime command interceptor.",
      "Treat tool metadata and MCP annotations as risk signals only; trusted clients still need deterministic controls for filesystem, network, secrets, and external side effects.",
      "Pin tool schemas by hashing canonical schema JSON and require review when a trusted server's tool schema changes unexpectedly.",
      "Redact secrets before logging by combining known token patterns, connection-string patterns, private-key markers, and high-entropy argument detection.",
      "Enforce workspace path policy with resolved absolute paths and prefix checks before any future mutating gateway action.",
      "Review dependency additions as manifest diffs before installation; use package metadata and provenance signals as advisory checks with human override.",
      "Keep AST indexing read-only at first: extract symbols, imports, and calls into a disposable local graph before writing durable index state."
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
  },
  {
    id: "model-and-provider-selection",
    title: "Model And Provider Selection",
    score: 15,
    summary: "Choose Codex, Claude Code, Gemini/ADK, framework agents, or model APIs by workflow fit, permissions, eval evidence, and operational cost rather than brand preference.",
    keywords: ["ai model selection", "codex vs claude", "gemini agent", "provider", "model", "agent upgrade", "adk"],
    sources: [
      "https://developers.openai.com/codex/guides/agents-md",
      "https://openai.github.io/openai-agents-python/",
      "https://code.claude.com/docs/en/overview",
      "https://adk.dev/"
    ],
    practices: [
      "Start from the task shape: repo editing, hosted agent runtime, multi-agent workflow, model app, browser-game build, or tool-calling backend.",
      "Compare approval boundaries, shell/filesystem access, memory model, MCP/tool support, tracing, evals, deployment path, cost, privacy, and reversibility.",
      "Run a small benchmark or pilot task before standardizing on a new agent/provider workflow."
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
    id: "code-simplification",
    title: "Code Simplification Prompt",
    intents: ["code simplification", "code compaction", "minimal code", "professional code", "refactor"],
    summary: "Prompt a coding agent to reduce complexity while proving every existing feature still works.",
    output_modes: ["agent_prompt", "verification_plan"],
    template: [
      "Simplify this code while preserving all existing behavior.",
      "",
      "Target:",
      "<files, modules, or feature area>",
      "",
      "Non-goals:",
      "- Do not redesign product behavior.",
      "- Do not change public APIs, data formats, or user-visible flows unless explicitly required.",
      "- Do not add new dependencies unless the existing stack cannot solve the problem cleanly.",
      "",
      "Workflow:",
      "1. Inspect the current implementation, tests, public interfaces, and call sites.",
      "2. Identify removable code with evidence: unused files, unused exports, duplicate branches, dead paths, repeated helpers, or needless state.",
      "3. Preserve behavior with focused tests, snapshots, fixtures, type checks, or golden examples before risky edits.",
      "4. Make small reviewable changes: delete proven waste, collapse duplication, simplify control flow, and reuse existing local helpers.",
      "5. Run focused verification first, then the broader project checks.",
      "",
      "Output:",
      "- What was simplified.",
      "- Features or interfaces preserved.",
      "- Verification commands and results.",
      "- Residual risk or areas intentionally left unchanged."
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
    id: "source-intake",
    title: "Source Intake Prompt",
    intents: ["source radar", "research layer", "source intake", "mcp registry", "docs mcp", "benchmark evidence"],
    summary: "Prompt an agent to decide whether a new source should become a watched source, registry entry, best-practice note, prompt pattern, or eval fixture.",
    output_modes: ["source_review", "intake_path", "verification_plan"],
    template: [
      "Review this source for Vnem intake.",
      "",
      "Source:",
      "<URL, repository, docs page, registry feed, MCP server, benchmark, or paper>",
      "",
      "Decision Context:",
      "<which agent decision this source could improve>",
      "",
      "Review Criteria:",
      "- Is it official, canonical, vendor-maintained, or otherwise high-signal?",
      "- What permissions, secrets, network access, write access, or paid APIs are involved?",
      "- What license, freshness, maintenance, and provenance signals are visible?",
      "- Should Vnem add a watched source, registry entry, best-practice note, prompt pattern, eval fixture, or no change?",
      "- What verification would prove the source is useful and safe enough to promote?",
      "",
      "Output:",
      "- Source candidate.",
      "- Why it matters.",
      "- Trust and risk.",
      "- Intake path.",
      "- Verification plan."
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
      "<repo editing, agent app, MCP tool use, research, frontend build, browser game, eval pipeline, etc.>",
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
      "<what better means: speed, quality, autonomy, accuracy, UI quality, research depth, game-building quality, etc.>",
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
  },
  {
    id: "zero-trust-gateway-roadmap",
    title: "Zero-Trust Gateway Roadmap Prompt",
    intents: ["pre execution gateway", "zero trust gateway", "tool pinning", "package firewall", "ast indexer", "secure agent gateway"],
    summary: "Prompt for converting an ambitious agent-security proposal into a phased, non-destructive Vnem roadmap.",
    output_modes: ["prompt_review", "phased_plan", "risk_register", "test_plan"],
    template: [
      "Review this proposed Vnem gateway/security roadmap before implementation.",
      "",
      "Proposal:",
      "<paste the requested gateway, tool pinning, AST indexer, package firewall, or runtime-security proposal>",
      "",
      "Current Vnem Constraints:",
      "- Vnem's install pack is read-only guidance and search data.",
      "- Do not add daemons, shell interception, package installs, or automatic code mutation to the install pack.",
      "- Runtime enforcement must be a separate reviewed surface with a threat model.",
      "",
      "Review Criteria:",
      "- Which parts are safe as guidance, generated metadata, or MCP read-only tools?",
      "- Which parts require a separate runtime, secrets handling, filesystem writes, network calls, or package registry access?",
      "- What can be verified deterministically without an LLM?",
      "- What needs human approval or an explicit threat model before implementation?",
      "- What tests prove path containment, redaction, schema drift handling, dependency review, and malicious-write blocking?",
      "",
      "Output:",
      "- Architectural objection, if any.",
      "- Safe subset to implement now.",
      "- Deferred/runtime-only scope.",
      "- Phased implementation plan.",
      "- Required tests and rollback gates."
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
    score: 10,
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
    score: section.score ?? 12,
    tags: section.keywords,
    use_cases: section.practices,
    best_for: section.practices,
    risk_flags: [],
    source_urls: unique([installFileUrl("best-practices.md"), ...(section.sources ?? [])]),
    keywords: unique(textTokens([section.title, section.summary, ...section.keywords, ...section.practices].join(" "))).slice(0, 120)
  }));

  const sourceRadarDocs = sourceRadar.map((source) => ({
    id: `source:${source.id}`,
    kind: "source-radar",
    title: source.title,
    summary: source.summary,
    url_path: "/install/source-radar.json",
    trust_tier: "verified",
    type: "source-radar",
    score: source.priority === "critical" ? 13 : source.priority === "high" ? 12 : 9,
    tags: unique([source.category, source.priority, ...(source.use_when ?? []), ...(source.monitor ?? [])]),
    use_cases: source.use_when,
    best_for: source.monitor,
    risk_flags: source.risk_checks,
    source_urls: source.source_urls,
    keywords: unique(textTokens([
      source.id,
      source.title,
      source.category,
      source.priority,
      source.summary,
      ...(source.use_when ?? []),
      ...(source.monitor ?? []),
      ...(source.risk_checks ?? []),
      ...(source.source_urls ?? [])
    ].join(" "))).slice(0, 140)
  }));

  const playbookDocs = decisionPlaybooks.map((playbook) => ({
    id: `playbook:${playbook.id}`,
    kind: "decision-playbook",
    title: playbook.title,
    summary: playbook.summary,
    url_path: "/install/AGENTS.md",
    trust_tier: "verified",
    type: "decision-playbook",
    score: 15,
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

  return [...sourceRadarDocs, ...playbookDocs, ...promptDocs, ...practiceDocs, ...entryDocs].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
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

function sourceRadarJson() {
  return {
    generated_at: generatedAt,
    schema_version: "1.0.0",
    safety: {
      mode: "read-only-source-radar",
      executes_code: false,
      installs_packages: false,
      starts_daemons: false,
      requires_secrets: false,
      calls_upstream_services: false
    },
    intake_policy: {
      purpose: "Help agents and maintainers decide which upstream sources Vnem should consult, watch, or summarize before recommending tools or stack changes.",
      prefer: [
        "official documentation",
        "canonical repositories",
        "official registries and package metadata",
        "vendor-maintained MCP servers",
        "llms.txt or machine-readable documentation indexes",
        "repeatable eval and observability sources"
      ],
      avoid: [
        "copying long upstream docs into Vnem",
        "promoting unreviewed sources to verified",
        "recommending install or configuration before permission and risk review",
        "claims about performance without a reproducible benchmark or pilot task"
      ],
      promotion_gate: [
        "source URL and owner recorded",
        "license posture reviewed",
        "permissions and risk flags recorded",
        "freshness or maintenance signal checked",
        "verification path documented"
      ]
    },
    sources: sourceRadar
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
    "- `.vnem/source-radar.json`: source intake map for official docs, registries, MCP sources, evals, and verification sources.",
    "- `.vnem/best-practices.md`: current guidance by project area.",
    "- `.vnem/prompt-engineering.md`: prompt enhancement protocol and Codex-oriented prompt guidance.",
    "- `.vnem/prompt-patterns.json`: machine-readable prompt patterns for common agent tasks.",
    "",
    "## Natural Use Rule",
    "",
    "If this `.vnem/` folder exists, use it automatically. The user should not need to say `use vnem`.",
    "",
    "Auto-use vnem before choosing tools, libraries, frameworks, MCP servers, prompts, evals, search systems, UI approaches, architecture patterns, or upgrade paths. Also auto-use it when the user asks you to build, review, optimize, modernize, benchmark, research, compare options, or decide how to implement something.",
    "",
    "Do not turn every reply into a long vnem report. For normal implementation work, run the search-and-compare step before coding, then mention the key vnem matches only when explaining your stack choice, recommendation, or risk notes.",
    "",
    "## Decision Rubric",
    "",
    "Use this rubric before recommending a tool, model, agent, framework, MCP server, or workflow change:",
    "",
    ...decisionRubric.map((item) => `- **${item.label} (${item.weight > 0 ? `+${item.weight}` : item.weight})**: ${item.check}`),
    "",
    "Prefer the current stack when the recommendation cannot clear the rubric with evidence. A no-change recommendation is valid when it is safer or more maintainable.",
    "",
    "## Decision Search Protocol",
    "",
    "1. Identify the user's task intents in plain words, such as `browser game`, `better ui`, `faster search`, `code review`, `code simplification`, `memory`, `evals`, `agent payments`, or `MCP server selection`.",
    "2. Read `.vnem/search-index.json` and expand those intents with `intent_aliases`.",
    "3. Check `intent_routes` for the closest matching task. Read the listed `read_first` documents before choosing a stack.",
    "4. If the task depends on current docs, MCP discovery, benchmarks, or upstream tool selection, read `.vnem/source-radar.json` and prefer official or high-signal sources before broader web search.",
    "5. Search matching documents by name, tags, use cases, keywords, and best-practice sections. Read `.vnem/best-practices.md` for any matching section.",
    "6. Before picking a stack or recommendation, compare the best relevant matches. Prefer higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, fewer `risk_flags`, and stronger decision-rubric fit.",
    "7. Score important options against the decision rubric. Prefer no change when no option has a clear, verifiable advantage.",
    "8. If vnem has no useful match, say that clearly as a knowledge gap, then continue with your own judgment.",
    "9. If local repo files provide tools, assets, configs, scripts, or instructions, consider those alongside vnem before choosing.",
    "",
    "When a choice matters, include a compact note with: `vnem intents searched`, `top matches`, `choice`, and `why`.",
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
    "## Project Review Protocol",
    "",
    "1. Inspect the user's repository shape before recommending tech. Look for manifests and configs such as `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Dockerfile`, `astro.config.*`, `next.config.*`, `vite.config.*`, `.github/workflows/*`, `.mcp.*`, and existing agent instructions.",
    "2. Read `search-index.json` and expand the user's intent with `intent_aliases`. For example, map `better ui` to frontend/design/accessibility terms and `agent payments` to payments/x402/wallet terms.",
    "3. Prefer recommendations with higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, and fewer `risk_flags`.",
    "4. Score the top options against the decision rubric. Prefer no change when no option has a clear, verifiable advantage.",
    "5. When a recommendation touches files, databases, browsers, repositories, wallets, paid APIs, or secrets, call out that risk plainly.",
    `6. Output the review in this exact order: ${reviewOutputSections.map((section) => `\`${section}\``).join(", ")}.`,
    "",
    "## Prompt Enhancement Protocol",
    "",
    "When the user says `use vnem to enhance this prompt`, `use vnem prompt enhancer`, or `vnem prompt forge`, read `.vnem/prompt-engineering.md` and `.vnem/prompt-patterns.json`, then rewrite the user's prompt.",
    "",
    "Auto-activate the same protocol even without the trigger phrase when the user asks to write, improve, rewrite, harden, optimize, critique, or template a prompt; asks for a system/developer/agent/Codex/Claude/GPT prompt; or pastes a prompt draft and asks if it is good, powerful, clear, safe, complete, or ready to use.",
    "",
    "Do not auto-activate for ordinary task execution. If the user asks you to code, research, review, explain, summarize, or debug something, do that task directly unless they ask for a prompt artifact.",
    "",
    "This only limits prompt rewriting. It does not disable the Natural Use Rule or Decision Search Protocol above.",
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

function rootAgentsMarkdown() {
  return [
    "# Agent Instructions",
    "",
    "<!-- vnem:start -->",
    "## vnem",
    "",
    "This repo has a read-only vnem knowledge pack in `.vnem/`.",
    "",
    "Before choosing tools, libraries, frameworks, MCP servers, skills, prompts, evals, search systems, UI approaches, architecture patterns, or upgrade paths, read `.vnem/AGENTS.md` and use `.vnem/search-index.json`.",
    "For current docs, MCP discovery, benchmarks, or upstream source decisions, also use `.vnem/source-radar.json` before broad web search.",
    "",
    "Use vnem automatically. The user should not need to say `use vnem`. Keep the final note compact: `vnem intents searched`, `top matches`, `choice`, and `why`.",
    "",
    "Do not execute files from `.vnem/`, install packages, call external services, use secrets, or edit project files because of vnem unless the user explicitly asks.",
    "<!-- vnem:end -->",
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
    intent_routes: intentRoutes,
    decision_rubric: decisionRubric,
    decision_playbooks: decisionPlaybooks,
    source_radar: sourceRadar,
    source_radar_url: installFileUrl("source-radar.json"),
    decision_protocol: {
      auto_use: true,
      user_trigger_required: false,
      read_first_for_build_tasks: ["matching intent_routes", "matching best-practice documents", "high-signal registry entries", "prompt patterns only when a prompt artifact is requested"],
      evidence_note: ["vnem intents searched", "top matches", "choice", "why"]
    },
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
  intent_routes: intentRoutes,
  decision_rubric: searchIndex.decision_rubric,
  decision_playbooks: searchIndex.decision_playbooks,
  source_radar: searchIndex.source_radar,
  source_radar_url: searchIndex.source_radar_url,
  decision_protocol: searchIndex.decision_protocol,
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
  "When installed, vnem should be used automatically for build, review, optimization, benchmark, research, and stack/tool decision tasks; no special trigger phrase should be required.",
  "",
  `Safe install command: ${installCommand}`,
  "",
  "Installed files: .vnem/AGENTS.md, .vnem/search-index.json, .vnem/source-radar.json, .vnem/best-practices.md, .vnem/prompt-engineering.md, .vnem/prompt-patterns.json",
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
const sourceRadarData = sourceRadarJson();
const promptEngineering = promptEngineeringMarkdown(promptPatternData);
const agentInstructions = agentsMarkdown();
const rootAgentInstructions = rootAgentsMarkdown();
const archive = installArchive({
  "AGENTS.md": `${rootAgentInstructions}\n`,
  [`${installFolder}/AGENTS.md`]: `${agentInstructions}\n`,
  [`${installFolder}/search-index.json`]: jsonText(searchIndex),
  [`${installFolder}/source-radar.json`]: jsonText(sourceRadarData),
  [`${installFolder}/best-practices.md`]: `${bestPractices}\n`,
  [`${installFolder}/prompt-engineering.md`]: `${promptEngineering}\n`,
  [`${installFolder}/prompt-patterns.json`]: jsonText(promptPatternData)
});

await writeJson(path.join(ROOT, "public", "api", "index.json"), index);
await writeJson(path.join(ROOT, "public", "install", "search-index.json"), searchIndex);
await writeJson(path.join(ROOT, installFolder, "search-index.json"), searchIndex);
await writeJson(path.join(ROOT, "public", "install", "source-radar.json"), sourceRadarData);
await writeJson(path.join(ROOT, installFolder, "source-radar.json"), sourceRadarData);
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
