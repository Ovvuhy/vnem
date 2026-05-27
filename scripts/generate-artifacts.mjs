import path from "node:path";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { ROOT, publicEntry, readEntries, uniqueSorted, writeBytes, writeJson, writeText } from "./lib/registry.mjs";

const generatedAt = new Date().toISOString();
const generatedDate = generatedAt.slice(0, 10);
const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
const packageVersion = packageJson.version;
const releaseVersion = packageVersion;
const releaseDate = generatedDate;
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
  "backend api": ["backend", "api", "database", "server", "runtime", "deployment"],
  security: ["security", "trust", "identity", "compliance", "guardrails", "audit"],
  "coding agents": ["coding-agent", "codebase", "repository", "diff", "terminal", "tests", "pull request"],
  subagents: ["sub-agent", "delegation", "parallel", "specialist", "agent team", "coordination"],
  "multi agent": ["multi-agent", "handoffs", "orchestration", "routing", "supervisor", "agent team"],
  swarms: ["swarm", "multi-agent", "handoffs", "parallel", "orchestration"],
  "context engineering": ["context", "memory", "instructions", "retrieval", "agents.md", "claude.md", "state"],
  "claude memory": ["claude code", "memory", "claude.md", "imports", "project instructions"],
  "claude md": ["claude.md", "claude code", "memory", "project instructions", "context engineering"],
  "agents md": ["agents.md", "codex", "repository instructions", "context engineering", "coding-agent"],
  "codex config": ["codex", "agents.md", "mcp", "config.toml", "repository instructions", "context engineering"],
  "agent workspace": ["autonomous developer environment", "mcp gateway", "tool routing", "memory bank", "agents.md", "claude.md", "roo code", "cline"],
  "mcp gateway": ["mcp", "gateway", "tool routing", "discovery control", "policy", "least privilege", "lunar mcpx", "microsoft mcp gateway"],
  "one mcp": ["mcp gateway", "tool routing", "gateway", "aggregation", "policy", "catalog"],
  "tool routing": ["mcp gateway", "routing", "tool discovery", "tool exposure", "permissions", "policy"],
  "memory bank": ["memory", "context", "persistent memory", "decision log", "active context", "roo code", "cline"],
  "roo code": ["roo code", "custom modes", "agent modes", "cline", "mcp", "memory bank"],
  "agent modes": ["custom modes", "roo code", "cline", "architect mode", "code mode", "debug mode", "permissions"],
  "mcp servers": ["mcp", "model context protocol", "tools", "resources", "prompts", "permissions"],
  observability: ["tracing", "observability", "telemetry", "spans", "evals", "runs"],
  "human in the loop": ["approval", "review", "checkpoint", "rollback", "interrupt", "durable execution"],
  "prompt engineering": ["prompt", "instructions", "examples", "constraints", "output format", "rubric", "eval"],
  "prompt enhancer": ["prompt", "rewrite", "improve prompt", "prompt forge", "prompt pattern", "output contract"],
  "codex prompt": ["codex", "coding-agent", "agents.md", "scope", "verification", "diff", "tests"],
  "prompt optimizer": ["prompt", "optimizer", "dataset", "grader", "annotation", "eval", "iteration"],
  "code simplification": ["refactor", "minimalism", "code quality", "dead code", "duplication", "complexity", "tests", "ast-grep", "knip", "jscpd"],
  "code compaction": ["simplify code", "reduce code", "minimal code", "dead code", "duplication", "behavior preserving", "refactor"],
  "minimal code": ["minimalism", "simple design", "small API", "refactor", "remove duplication", "delete dead code", "feature preservation"],
  "professional code": ["code quality", "maintainability", "clarity", "refactor", "tests", "lint", "style guide", "review"],
  refactor: ["behavior preserving", "small steps", "tests", "code review", "simplify code", "ast-grep", "codemod"],
  "dead code": ["unused exports", "unused files", "unused dependencies", "knip", "dependency audit", "delete code"]
};

const intentRoutes = {
  "mcp gateway": {
    read_first: ["practice:mcp-gateway-tool-routing", "practice:mcp-server-selection", "practice:security"],
    compare_options: ["No gateway with a small MCP set", "Lunar MCPX", "Microsoft MCP Gateway", "Managed control plane"],
    choose_by: ["tool count", "auth and audit requirements", "deployment environment", "least-privilege policy", "session/routing needs"],
    report: ["vnem intents searched", "top matches", "choice", "why", "permission risks"]
  },
  "one mcp": {
    read_first: ["practice:mcp-gateway-tool-routing", "practice:mcp-server-selection", "practice:security"],
    compare_options: ["curated small server list", "gateway aggregation", "role-scoped catalogs"],
    choose_by: ["context budget", "tool discovery size", "user approval flow", "secret handling", "rollback path"],
    report: ["vnem intents searched", "top matches", "choice", "why", "permission risks"]
  },
  "tool routing": {
    read_first: ["practice:mcp-gateway-tool-routing", "practice:security"],
    compare_options: ["static client config", "role-scoped gateway routing", "task-scoped tool catalogs"],
    choose_by: ["agent role", "task intent", "permissions", "auditability", "blast radius"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "memory bank": {
    read_first: ["practice:persistent-memory-context-files", "practice:context-engineering", "practice:codex-vnem-setup"],
    compare_options: ["AGENTS.md", "CLAUDE.md", "repo-local memory bank", "tool-specific rules and modes"],
    choose_by: ["agent client", "team maintenance capacity", "secret risk", "context volatility", "need for decision history"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "roo code": {
    read_first: ["practice:ide-agent-selection", "practice:persistent-memory-context-files", "practice:mcp-gateway-tool-routing"],
    compare_options: ["Roo Code", "Cline", "Cursor Agent", "Claude Code", "Codex"],
    choose_by: ["editor fit", "custom mode needs", "BYOM needs", "approval model", "upstream maintenance status"],
    report: ["vnem intents searched", "top matches", "choice", "why", "source uncertainty"]
  },
  "agent modes": {
    read_first: ["practice:ide-agent-selection", "practice:persistent-memory-context-files", "practice:security"],
    compare_options: ["single generalist agent", "planning/code/debug modes", "specialist subagents", "gateway-scoped roles"],
    choose_by: ["tool permissions", "task phase", "context budget", "reviewability", "risk of over-broad tools"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "codex config": {
    read_first: ["practice:codex-vnem-setup", "practice:persistent-memory-context-files", "practice:mcp-gateway-tool-routing"],
    compare_options: ["AGENTS.md", "Codex MCP config", "vnem read-only MCP", "project-local prompt patterns"],
    choose_by: ["repository scope", "needed tools", "verification commands", "approval boundary", "secrets policy"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "claude md": {
    read_first: ["practice:persistent-memory-context-files", "practice:ide-agent-selection", "practice:context-engineering"],
    compare_options: ["CLAUDE.md", "AGENTS.md", "tool-specific memory bank", "local untracked overrides"],
    choose_by: ["agent client", "shared versus local instructions", "secrets policy", "maintenance cadence"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "agent workspace": {
    read_first: ["practice:codex-vnem-setup", "practice:mcp-gateway-tool-routing", "practice:persistent-memory-context-files", "practice:ide-agent-selection"],
    compare_options: ["read-only guidance only", "small direct MCP set", "gateway-controlled MCP workspace", "IDE agent plus terminal agent"],
    choose_by: ["repository risk", "tool permissions", "agent client", "audit needs", "how often context changes"],
    report: ["vnem intents searched", "top matches", "choice", "why", "remaining uncertainty"]
  },
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
  },
  "minimal code": {
    read_first: ["practice:code-simplification", "practice:code-review", "practice:evals"],
    compare_options: ["delete proven waste", "reuse existing helpers", "collapse duplication", "defer abstractions"],
    choose_by: ["behavior preservation", "public API stability", "test evidence", "reviewability"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "professional code": {
    read_first: ["practice:code-simplification", "practice:code-review", "practice:evals"],
    compare_options: ["small behavior-preserving refactor", "dependency audit", "dead-code cleanup", "repo-native conventions"],
    choose_by: ["maintainability", "behavior evidence", "team conventions", "test coverage"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  refactor: {
    read_first: ["practice:code-simplification", "practice:code-review", "practice:evals"],
    compare_options: ["small manual refactor", "AST-aware codemod", "dead-code audit", "duplicate-code cleanup"],
    choose_by: ["blast radius", "test coverage", "public API stability", "call-site count"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "dead code": {
    read_first: ["practice:code-simplification", "practice:code-review", "practice:evals"],
    compare_options: ["lexical search", "unused export checks", "dependency checks", "duplicate-code checks"],
    choose_by: ["static evidence", "runtime reachability", "test coverage", "delete safety"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  }
};

const bestPracticeSections = [
  {
    id: "mcp-gateway-tool-routing",
    title: "MCP Gateway And Tool Routing",
    score: 20,
    summary: "Use MCP gateways as a policy, discovery, routing, and observability layer only when the agent would otherwise see too many tools or credentials directly.",
    keywords: ["mcp gateway", "one mcp", "tool routing", "discovery control", "least privilege", "policy", "lunar mcpx", "microsoft mcp gateway", "catalog"],
    sources: [
      "https://modelcontextprotocol.io/docs/getting-started/intro",
      "https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices",
      "https://docs.lunar.dev/mcpx/architecture",
      "https://github.com/microsoft/mcp-gateway"
    ],
    practices: [
      "Start with a small direct MCP server set; add a gateway when tool discovery, authentication, policy, logging, or routing becomes hard to govern.",
      "Expose tools by role and task intent instead of broadcasting every server schema to the model.",
      "Keep high-risk tools behind explicit policy: repositories, browsers, databases, payments, filesystem writes, deployments, and production data.",
      "Centralize audit logs, credential propagation, and rate limits at the gateway when multiple agents or teams share tool access.",
      "Treat gateway catalog recommendations as architecture guidance; do not ship gateway daemons, secrets, or runnable configs from a read-only knowledge pack."
    ]
  },
  {
    id: "persistent-memory-context-files",
    title: "Persistent Memory And Context Files",
    score: 16,
    summary: "Put stable project facts in versioned instruction files, keep volatile task state separate, and review memory for secrets, stale assumptions, and repeated failed approaches.",
    keywords: ["memory bank", "persistent memory", "context files", "agents.md", "claude.md", "decision log", "active context", "roo code", "cline"],
    sources: [
      "https://developers.openai.com/codex/guides/agents-md",
      "https://docs.anthropic.com/en/docs/claude-code/memory",
      "https://github.com/Bhartendu-Kumar/rules_template"
    ],
    practices: [
      "Use `AGENTS.md` for Codex-facing repository instructions: commands, conventions, scope, and safety boundaries.",
      "Use `CLAUDE.md` for Claude Code memory when that client is active, and separate shared project instructions from local machine overrides.",
      "Add a memory bank only when the team will maintain it; stale active context is worse than a short instruction file.",
      "Record architectural decisions and abandoned approaches so agents do not repeat known dead ends.",
      "Never store secrets, credentials, private customer data, or unverified claims in durable agent memory."
    ]
  },
  {
    id: "ide-agent-selection",
    title: "IDE Agent Selection",
    score: 15,
    summary: "Choose coding agents by editor fit, approval model, model routing, MCP support, maintenance status, and the repo's need for autonomous multi-file changes.",
    keywords: ["ide agent", "coding agents", "roo code", "cline", "cursor agent", "claude code", "codex", "byom", "agent modes"],
    sources: [
      "https://docs.cursor.com/agent/overview",
      "https://docs.cline.bot/introduction/overview",
      "https://docs.anthropic.com/en/docs/claude-code/overview",
      "https://developers.openai.com/codex"
    ],
    practices: [
      "Use source-backed product capabilities rather than unsourced benchmark claims when comparing agents.",
      "Prefer strong human approval flows for agents that can edit files, run shell commands, or mutate repositories.",
      "Use BYOM or OpenRouter-style routing only when the client supports it and the task can tolerate model variability.",
      "Treat archived or community-maintained forks as watchlist options until maintenance and security posture are clear.",
      "Evaluate agents on one real repository workflow: plan quality, file selection, diffs, verification behavior, and recovery from failed tests."
    ]
  },
  {
    id: "codex-vnem-setup",
    title: "Codex/VNEM Setup",
    score: 15,
    summary: "For Codex-based workspaces, keep vnem read-only, load `AGENTS.md` instructions, expose MCP resources deliberately, and use generated guidance before installing tools.",
    keywords: ["codex config", "codex", "vnem", "agents.md", "mcp resources", "agent workspace", "prompt patterns", "read-only knowledge pack"],
    sources: [
      "https://developers.openai.com/codex/guides/agents-md",
      "https://platform.openai.com/docs/docs-mcp",
      "https://github.com/openai/codex"
    ],
    practices: [
      "Keep `AGENTS.md` concise and repository-specific: commands, conventions, verification, and approval boundaries.",
      "Read `.vnem/agent-workspace.md` before designing a new autonomous developer environment.",
      "Expose vnem through MCP as read-only resources and tools; use it for recommendation context, not for installation or mutation.",
      "Prefer generated prompt patterns for recurring architecture, gateway, memory, and implementation prompts.",
      "Ask before adding MCP servers, editing client config, installing packages, using secrets, or starting daemons."
    ]
  },
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

const operatingProtocol = {
  id: "vnem-operating-loop",
  title: "vnem Operating Loop",
  summary:
    "A universal read-only operating protocol for coding agents: sense the repo, route task context, choose the smallest sufficient capability, constrain risk, verify with evidence, and report residual uncertainty.",
  loop: [
    {
      step: "Sense",
      instruction:
        "Inspect the repository, existing instructions, manifests, scripts, tests, current stack, and risk surface before recommending tools or changing code."
    },
    {
      step: "Route",
      instruction:
        "Classify the task mode and intent, expand aliases from the search index, and read only the matching rubric, route, best-practice notes, and high-signal entries."
    },
    {
      step: "Choose",
      instruction:
        "Prefer existing project patterns and the smallest sufficient source-backed tool or framework; compare trust tier, source confidence, freshness, license clarity, permissions, and reversibility."
    },
    {
      step: "Constrain",
      instruction:
        "State scope, non-goals, approval gates, and risky operations before mutation; keep installs, secrets, browsers, databases, deployments, payments, and production writes behind explicit approval."
    },
    {
      step: "Build/Review/Debug",
      instruction:
        "Use the task mode to work in small coherent steps: implement, review, debug, plan, or produce a prompt artifact without drifting into unrelated refactors."
    },
    {
      step: "Verify",
      instruction:
        "Run the strongest reasonable local checks; use tests, fixtures, type checks, screenshots, browser interaction, or structured evidence depending on the task."
    },
    {
      step: "Report",
      instruction:
        "Summarize changed or recommended surfaces, vnem intent and matches, verification evidence, approval needs, source-trust uncertainty, and residual risk."
    }
  ],
  default_contract: {
    modes: ["build", "review", "plan", "debug", "prompt", "decision"],
    approval_gates: [
      "installing packages or changing dependency managers",
      "editing agent, MCP, CI, deployment, database, browser, wallet, payment, or secret configuration",
      "using credentials, secrets, paid APIs, production data, or external services",
      "starting daemons, deploying, purchasing, or performing irreversible writes"
    ],
    verification: [
      "inspect local project instructions and manifests",
      "run the narrowest relevant check first",
      "run broader tests or builds when blast radius justifies it",
      "for UI or canvas work, verify in a real browser with desktop and mobile evidence",
      "report checks that could not run and why"
    ],
    report: [
      "vnem intents searched",
      "top matches and chosen rubric",
      "choice and why",
      "verification evidence",
      "approval gates and residual uncertainty"
    ]
  }
};

const taskRubrics = [
  {
    id: "frontend_ui",
    title: "Frontend UI",
    summary:
      "Build usable, accessible, responsive interfaces that match the product workflow and existing design system before adding decorative complexity.",
    modes: ["build", "review"],
    intents: ["better ui", "frontend", "ui", "design", "react", "tailwind", "dashboard", "landing page", "prototype"],
    read_first: ["practice:frontend", "practice:evals"],
    quality_bar: [
      "primary user workflow is usable on the first screen",
      "layout is responsive and text fits on mobile and desktop",
      "accessibility basics are present: labels, contrast, focus states, and usable target sizes",
      "visual verification is performed for meaningful UI changes"
    ],
    approval_gates: ["adding UI frameworks or design-system dependencies", "calling paid design or image services"],
    verification: ["run project UI checks if present", "open the local page/app", "capture or inspect desktop and mobile states"],
    output_contract: ["changed UI surface", "stack/library choice", "visual verification evidence", "known responsive or accessibility risk"]
  },
  {
    id: "backend_api",
    title: "Backend API",
    summary:
      "Keep APIs boring, typed, observable, and narrow enough that agents can verify behavior without guessing about auth or data side effects.",
    modes: ["build", "debug", "review"],
    intents: ["backend api", "backend", "api", "server", "database", "auth", "postgres", "runtime"],
    read_first: ["practice:backend", "practice:security", "practice:evals"],
    quality_bar: [
      "request and response boundaries are typed or validated",
      "auth, permissions, and data mutation paths are explicit",
      "errors are structured enough for callers and agents to diagnose",
      "tests or fixtures cover changed behavior"
    ],
    approval_gates: ["database writes or migrations", "auth policy changes", "production data access", "new network services"],
    verification: ["run focused API tests or fixtures", "run type/lint checks when present", "verify error paths for changed behavior"],
    output_contract: ["API surface changed", "data/auth risk", "verification evidence", "migration or rollout notes if any"]
  },
  {
    id: "refactor",
    title: "Refactor And Simplification",
    summary:
      "Preserve behavior first, then delete proven waste, collapse duplication, simplify control flow, and reuse local abstractions before adding new ones.",
    modes: ["build", "review"],
    intents: ["code simplification", "code compaction", "minimal code", "professional code", "refactor", "dead code", "duplication"],
    read_first: ["practice:code-simplification", "practice:code-review", "practice:evals"],
    quality_bar: [
      "public APIs, data formats, and user-visible behavior remain stable unless explicitly requested",
      "deletions are backed by search, tests, or static evidence",
      "diff is small enough to review",
      "focused and broad checks are run according to blast radius"
    ],
    approval_gates: ["changing public APIs or data formats", "large rewrites", "dependency replacement", "deleting code without reachability evidence"],
    verification: ["inspect call sites and tests", "run focused tests first", "run broader project checks after shared behavior changes"],
    output_contract: ["behavior preserved", "what was simplified", "evidence for deletion/refactor", "verification results"]
  },
  {
    id: "agent_tooling",
    title: "Agent Tooling",
    summary:
      "Choose MCP servers, skills, agents, gateways, and prompt tooling as permissioned capabilities with provenance, least privilege, and reviewable setup.",
    modes: ["decision", "plan", "review"],
    intents: ["agent", "mcp", "mcp servers", "mcp gateway", "one mcp", "tool routing", "coding agents", "codex config", "agent workspace"],
    read_first: ["practice:agent-tooling", "practice:mcp-server-selection", "practice:mcp-gateway-tool-routing", "practice:security"],
    quality_bar: [
      "tool choice is tied to one concrete workflow",
      "permissions and environment variables are called out",
      "official or high-confidence sources are preferred for sensitive resources",
      "gateway or memory complexity is justified by governance needs"
    ],
    approval_gates: ["installing MCP servers", "editing client config", "using secrets", "starting daemons", "giving agents write access"],
    verification: ["compare source trust and permissions", "verify the client can expose only intended tools", "record unknown install/runtime risk"],
    output_contract: ["recommended capability", "why it is needed", "permission risks", "approval and verification path"]
  },
  {
    id: "data_memory",
    title: "Data And Memory",
    summary:
      "Keep durable agent memory short, factual, reviewed, and separate from volatile task state or sensitive data.",
    modes: ["plan", "review", "decision"],
    intents: ["memory", "memory bank", "context engineering", "claude memory", "claude md", "agents md", "data", "persistence"],
    read_first: ["practice:persistent-memory-context-files", "practice:context-engineering", "practice:data", "practice:security"],
    quality_bar: [
      "stable project facts are separated from temporary task notes",
      "decision history is recorded only when it prevents repeated mistakes",
      "secrets and private data stay out of durable memory",
      "memory review or reset cadence is explicit"
    ],
    approval_gates: ["writing durable memory files", "storing sensitive data", "connecting memory services", "using cross-project memory"],
    verification: ["inspect existing instruction files", "check for secret leakage", "confirm owner and update cadence"],
    output_contract: ["what to store", "where to store it", "what to avoid", "review cadence"]
  },
  {
    id: "security_sensitive",
    title: "Security Sensitive Work",
    summary:
      "Treat security, auth, secrets, payments, production data, deployments, browsers, and databases as high-risk surfaces requiring explicit boundaries and evidence.",
    modes: ["build", "review", "debug", "decision"],
    intents: ["security", "auth", "secrets", "payments", "wallet", "database", "deployment", "production", "browser", "permissions"],
    read_first: ["practice:security", "practice:human-approval-and-durability", "practice:evals"],
    quality_bar: [
      "sensitive resources and mutation paths are named",
      "least privilege and rollback are considered before action",
      "external side effects are approval-gated",
      "logs or reports avoid exposing secrets"
    ],
    approval_gates: ["using secrets", "touching production data", "deploying", "making purchases", "changing auth or permission policy"],
    verification: ["run local checks without secrets where possible", "verify rollback or recovery path", "report untested risk plainly"],
    output_contract: ["risk surface", "approval required", "verification evidence", "remaining uncertainty"]
  },
  {
    id: "docs_prompt",
    title: "Docs And Prompts",
    summary:
      "Turn rough instructions, docs, and prompts into operational artifacts with goal, context, constraints, output contract, and verification criteria.",
    modes: ["prompt", "plan", "review"],
    intents: ["prompt engineering", "prompt enhancer", "codex prompt", "prompt optimizer", "docs", "documentation", "instructions"],
    read_first: ["practice:prompt-engineering", "prompt-pattern:prompt-enhancement", "prompt-pattern:codex-implementation"],
    quality_bar: [
      "original intent is preserved",
      "missing inputs that materially change the outcome are named",
      "output format and non-goals are explicit",
      "verification criteria are included for objective or risky tasks"
    ],
    approval_gates: ["turning guidance into executable config", "adding external tools", "embedding secrets or private data in prompts"],
    verification: ["check prompt against desired output contract", "include a compact version when useful", "state missing inputs"],
    output_contract: ["enhanced artifact", "compact version if requested", "what changed", "missing inputs"]
  },
  {
    id: "interactive_canvas",
    title: "Interactive Canvas And Games",
    summary:
      "Deliver real playability or interaction: responsive rendering, input mapping, state transitions, visual feedback, restart/error states, and real-browser verification.",
    modes: ["build", "debug", "review"],
    intents: ["browser game", "web game", "html5 game", "canvas game", "2d game", "3d game", "game physics", "game ui", "canvas performance"],
    read_first: ["practice:browser-games", "practice:frontend", "practice:evals"],
    quality_bar: [
      "the experience is playable or interactive, not only visually present",
      "input works across relevant desktop and mobile controls",
      "start, win/loss, pause/restart, and error states are explicit where relevant",
      "canvas or animation output is verified in a real browser"
    ],
    approval_gates: ["adding heavy engines or binary assets", "using paid asset services", "fetching remote media", "introducing audio/autoplay behavior"],
    verification: ["serve locally", "confirm nonblank rendering", "simulate or manually perform core input", "check state transition and restart", "inspect mobile viewport"],
    output_contract: ["chosen rendering/game stack", "core interaction built", "browser verification evidence", "known device/performance risk"]
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
    id: "agent-workspace-architecture",
    title: "Agent Workspace Architecture Prompt",
    intents: ["agent workspace", "autonomous developer environment", "coding agents", "codex config"],
    summary: "Prompt for designing a read-only-first autonomous developer workspace with agent choice, MCP routing, memory, and verification boundaries.",
    output_modes: ["architecture_plan", "risk_register"],
    template: [
      "Design an autonomous developer workspace for this repository.",
      "",
      "Goal:",
      "<what the agent environment should help builders do>",
      "",
      "Constraints:",
      "- Keep the first version read-only unless a maintainer approves mutations.",
      "- Separate knowledge/catalog guidance from runtime daemons or gateway implementations.",
      "- Identify secrets, database, browser, repository, filesystem, and deployment risks.",
      "",
      "Evaluate:",
      "- Coding agent client and approval model.",
      "- MCP servers and whether a gateway is justified.",
      "- Persistent memory files and update cadence.",
      "- Verification commands and rollback path.",
      "",
      "Output:",
      "- Recommended architecture.",
      "- Minimal first setup.",
      "- Deferred capabilities.",
      "- Risks and required approvals."
    ].join("\n")
  },
  {
    id: "mcp-gateway-evaluation",
    title: "MCP Gateway Evaluation Prompt",
    intents: ["mcp gateway", "one mcp", "tool routing", "mcp servers"],
    summary: "Prompt for deciding whether an MCP gateway is needed and which routing, policy, and observability requirements matter.",
    output_modes: ["gateway_recommendation"],
    template: [
      "Evaluate MCP gateway options for this agent workspace.",
      "",
      "Current tools:",
      "<MCP servers, clients, credentials, and high-risk operations>",
      "",
      "Decision criteria:",
      "- Does the agent see too many tools or schemas?",
      "- Are credentials, policies, logs, or rate limits hard to manage directly?",
      "- Which tools need role-scoped or task-scoped exposure?",
      "- Can the team operate a gateway safely?",
      "",
      "Output:",
      "- Gateway needed or not needed.",
      "- Options to compare.",
      "- Least-privilege routing plan.",
      "- Risks, unknowns, and next verification steps."
    ].join("\n")
  },
  {
    id: "memory-bank-initialization",
    title: "Memory Bank Initialization Prompt",
    intents: ["memory bank", "agent modes", "roo code", "cline", "claude md"],
    summary: "Prompt for creating durable agent memory without storing secrets or stale task state.",
    output_modes: ["memory_bank_plan"],
    template: [
      "Initialize persistent agent memory for this project.",
      "",
      "Inputs:",
      "- Repository purpose and architecture.",
      "- Stable commands and verification steps.",
      "- Current task state, blockers, and decisions.",
      "",
      "Rules:",
      "- Store durable project facts separately from temporary session notes.",
      "- Include a decision log for major choices and rejected approaches.",
      "- Do not store secrets, credentials, private data, or unsourced claims.",
      "- Define when memory should be reviewed or reset.",
      "",
      "Output:",
      "- Proposed files.",
      "- Contents for each file.",
      "- Update protocol.",
      "- Risks and maintenance notes."
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

  const rubricDocs = taskRubrics.map((rubric) => ({
    id: `task-rubric:${rubric.id}`,
    kind: "task-rubric",
    title: rubric.title,
    summary: rubric.summary,
    url_path: "/install/task-rubrics.json",
    trust_tier: "verified",
    type: "task-rubric",
    score: 14,
    tags: rubric.intents,
    use_cases: rubric.quality_bar,
    best_for: rubric.output_contract,
    risk_flags: [],
    source_urls: [installFileUrl("task-rubrics.json")],
    keywords: unique(textTokens([
      rubric.id,
      rubric.title,
      rubric.summary,
      ...rubric.modes,
      ...rubric.intents,
      ...rubric.quality_bar,
      ...rubric.approval_gates,
      ...rubric.verification,
      ...rubric.output_contract
    ].join(" "))).slice(0, 120)
  }));

  const operatingDocs = [
    {
      id: `operating-protocol:${operatingProtocol.id}`,
      kind: "operating-protocol",
      title: operatingProtocol.title,
      summary: operatingProtocol.summary,
      url_path: "/install/operating-protocol.md",
      trust_tier: "verified",
      type: "operating-protocol",
      score: 15,
      tags: ["operating protocol", "agent contract", "task contract", "verification", "approval", "context routing"],
      use_cases: operatingProtocol.loop.map((item) => item.instruction),
      best_for: operatingProtocol.default_contract.report,
      risk_flags: [],
      source_urls: [installFileUrl("operating-protocol.md")],
      keywords: unique(textTokens([
        operatingProtocol.title,
        operatingProtocol.summary,
        ...operatingProtocol.loop.flatMap((item) => [item.step, item.instruction]),
        ...operatingProtocol.default_contract.modes,
        ...operatingProtocol.default_contract.approval_gates,
        ...operatingProtocol.default_contract.verification,
        ...operatingProtocol.default_contract.report
      ].join(" "))).slice(0, 120)
    }
  ];

  return [...operatingDocs, ...rubricDocs, ...promptDocs, ...practiceDocs, ...entryDocs].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
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

function operatingProtocolMarkdown() {
  return [
    "# vnem Operating Protocol",
    "",
    `Generated: ${generatedAt}`,
    "",
    operatingProtocol.summary,
    "",
    "## Safety Boundary",
    "",
    "- This file is read-only guidance.",
    "- Do not treat it as a script, runtime config, gateway definition, memory daemon, or install recipe.",
    "- Use it to shape a compact task contract before choosing tools or changing code.",
    "",
    "## Universal Loop",
    "",
    ...operatingProtocol.loop.flatMap((item, index) => [
      `${index + 1}. **${item.step}**`,
      `   ${item.instruction}`
    ]),
    "",
    "## Task Contract",
    "",
    "For nontrivial tasks, produce or internally follow a compact task contract:",
    "",
    "- Mode: build, review, plan, debug, prompt, or decision.",
    "- Intent and route: matching intent alias, route, rubric, and read-first documents.",
    "- Smallest sufficient capability: existing project pattern first, then source-backed tool only if justified.",
    "- Approval gates: actions that need explicit user consent before mutation or external side effects.",
    "- Verification: the strongest reasonable local evidence for this task class.",
    "- Final report: vnem intent, top matches, choice, evidence, uncertainty, and residual risk.",
    "",
    "## Default Approval Gates",
    "",
    ...operatingProtocol.default_contract.approval_gates.map((item) => `- ${item}`),
    "",
    "## Default Verification",
    "",
    ...operatingProtocol.default_contract.verification.map((item) => `- ${item}`),
    "",
    "## Relationship To Other vnem Files",
    "",
    "- Use `.vnem/task-rubrics.json` to choose the broad quality bar for the task.",
    "- Use `.vnem/search-index.json` to route intents and retrieve source-backed entries.",
    "- Use `.vnem/best-practices.md` after routing, not as a wall of generic context.",
    "- Use `.vnem/agent-workspace.md` only for autonomous developer environment choices such as MCP gateways, memory files, agent clients, or mode systems.",
    ""
  ].join("\n");
}

function taskRubricsJson() {
  return {
    generated_at: generatedAt,
    schema_version: "1.0.0",
    safety: {
      mode: "read-only-task-rubrics",
      executes_code: false,
      installs_packages: false,
      starts_daemons: false,
      requires_secrets: false
    },
    purpose:
      "Broad task rubrics for producing compact agent task contracts across common coding-agent workflows without maintaining narrow playbooks.",
    rubrics: taskRubrics
  };
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
    "- `.vnem/operating-protocol.md`: universal loop for sensing the repo, routing context, choosing small capabilities, constraining risk, verifying, and reporting evidence.",
    "- `.vnem/task-rubrics.json`: broad task rubrics used to shape the quality bar, approval gates, verification checklist, and final report.",
    "- `.vnem/search-index.json`: compact local search index for tools, skills, MCP servers, and best-practice notes.",
    "- `.vnem/best-practices.md`: current guidance by project area.",
    "- `.vnem/agent-workspace.md`: autonomous developer environment guide covering MCP gateways, memory files, agent modes, and Codex/VNEM setup.",
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
    "## Decision Search Protocol",
    "",
    "1. Read `.vnem/operating-protocol.md` and classify the task mode: `build`, `review`, `plan`, `debug`, `prompt`, or `decision`.",
    "2. Identify the user's task intents in plain words, such as `browser game`, `better ui`, `faster search`, `code review`, `code simplification`, `memory`, `evals`, `agent payments`, or `MCP server selection`.",
    "3. Read `.vnem/search-index.json` and expand those intents with `intent_aliases`.",
    "4. Select the matching broad rubric from `.vnem/task-rubrics.json` and use its quality bar, approval gates, verification checklist, and output contract.",
    "5. Check `intent_routes` for the closest matching task. Read the listed `read_first` documents before choosing a stack.",
    "6. Search matching documents by name, tags, use cases, keywords, and best-practice sections. Read `.vnem/best-practices.md` only for matching sections.",
    "7. Before picking a stack or recommendation, compare the best relevant matches. Prefer higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, fewer `risk_flags`, and the smallest sufficient capability.",
    "8. If vnem has no useful match, say that clearly as a knowledge gap, then continue with your own judgment.",
    "9. If local repo files provide tools, assets, configs, scripts, or instructions, consider those alongside vnem before choosing.",
    "",
    "For nontrivial tasks, follow a compact task contract: `mode`, `intent`, `rubric`, `read first`, `smallest sufficient capability`, `approval gates`, `verification`, and `final report`.",
    "",
    "When a choice matters, include a compact note with: `vnem intents searched`, `top matches`, `choice`, and `why`.",
    "",
    "## Project Review Protocol",
    "",
    "1. Inspect the user's repository shape before recommending tech. Look for manifests and configs such as `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Dockerfile`, `astro.config.*`, `next.config.*`, `vite.config.*`, `.github/workflows/*`, `.mcp.*`, and existing agent instructions.",
    "2. Read `search-index.json` and expand the user's intent with `intent_aliases`. For example, map `better ui` to frontend/design/accessibility terms and `agent payments` to payments/x402/wallet terms.",
    "3. Prefer recommendations with higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, and fewer `risk_flags`.",
    "4. When a recommendation touches files, databases, browsers, repositories, wallets, paid APIs, or secrets, call out that risk plainly.",
    "5. Output the review in this exact order: `Current stack`, `Outdated or risky choices`, `Better current options`, `Drop-in opportunities`, `Ask before changing`.",
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

function agentWorkspaceMarkdown() {
  return [
    "# Agent Workspace",
    "",
    "Generated read-only guidance for designing an autonomous developer environment with vnem.",
    "",
    "## Safety Boundary",
    "",
    "- This file is guidance only.",
    "- Do not treat it as a gateway config, daemon script, credential template, or install recipe.",
    "- Ask before adding MCP servers, editing agent config, using secrets, starting services, or giving an agent write access.",
    "",
    "## Recommended Default",
    "",
    "Start with a small, readable setup: Codex or another coding agent, repository-local instructions, the vnem read-only pack, and only the MCP servers required for the current workflow.",
    "",
    "Add gateways, memory banks, browser sessions, database access, and repository mutation tools only after the team can name the approval path and rollback plan.",
    "",
    "## MCP Gateway And Tool Routing",
    "",
    "Use a gateway when a direct MCP setup becomes hard to govern: too many tool schemas, repeated credential setup, missing audit logs, or different roles needing different tool catalogs.",
    "",
    "Evaluate gateways by these questions:",
    "",
    "- Which tools must be visible to this agent role right now?",
    "- Which tools can mutate repositories, databases, browsers, deployments, payments, or files?",
    "- Where are credentials stored and how are they scoped?",
    "- Can the gateway log requests, enforce rate limits, and narrow discovery responses?",
    "- Is the team ready to operate the gateway, or is a smaller direct MCP list safer?",
    "",
    "Use the registry entries for Lunar MCPX, Microsoft MCP Gateway, official GitHub MCP Server, Supabase MCP, Qdrant MCP, OpenTabs, and Crawl4AI RAG as catalog guidance before changing runtime config.",
    "",
    "## Persistent Memory And Context Files",
    "",
    "Keep durable memory short, factual, and reviewed.",
    "",
    "- Codex: use `AGENTS.md` for repository purpose, commands, conventions, verification, and approval boundaries.",
    "- Claude Code: use `CLAUDE.md` for Claude-specific project memory and keep local machine overrides out of shared files.",
    "- Roo/Cline-style workflows: use mode rules or a memory bank only when maintainers will keep active context and decision logs current.",
    "- Store architectural decisions and rejected approaches when repeating the same mistake would be costly.",
    "- Keep secrets, credentials, private customer data, and unverified research out of memory files.",
    "",
    "## IDE Agent Selection",
    "",
    "Choose agents by fit rather than hype. Compare editor workflow, approval model, model routing, MCP support, maintenance status, terminal behavior, and how well the agent verifies changes in this repository.",
    "",
    "Use Cursor Agent when editor-native multi-file work and Cursor rules are the main workflow. Use Cline or similar VS Code agents when explicit approvals and model flexibility matter. Treat Roo Code and community mode libraries as watchlist inputs when upstream maintenance is unclear. Use Claude Code or Codex when terminal-native repo work, command verification, and explicit project memory are a better fit.",
    "",
    "## Codex/VNEM Setup",
    "",
    "For Codex-based workspaces:",
    "",
    "- Keep vnem read-only and use it before choosing tools, MCP servers, memory patterns, or agent clients.",
    "- Keep project instructions in `AGENTS.md`; keep them concise and stable.",
    "- Register vnem as an MCP resource only for lookup and recommendations.",
    "- Prefer the prompt patterns for recurring architecture, gateway evaluation, and memory initialization tasks.",
    "- Do not add runnable gateway prototypes, daemon changes, secrets, or third-party code to the vnem pack.",
    "",
    "## Decision Checklist",
    "",
    "- What does the agent need to read?",
    "- What can the agent mutate?",
    "- Which approvals are required before mutation?",
    "- Which MCP servers are official or high-confidence sources?",
    "- Does a gateway reduce risk, or does it add operational surface area?",
    "- Which memory file owns stable facts, current task state, and decisions?",
    "- Which tests or checks prove the environment is helping rather than drifting?",
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
    "Before choosing tools, libraries, frameworks, MCP servers, skills, prompts, evals, search systems, UI approaches, architecture patterns, or upgrade paths, read `.vnem/AGENTS.md`, follow `.vnem/operating-protocol.md`, use `.vnem/search-index.json`, and consult `.vnem/agent-workspace.md` only for autonomous developer environment decisions.",
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
    package_version: packageVersion,
    release_version: releaseVersion,
    release_date: releaseDate,
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
    operating_protocol: operatingProtocol,
    task_rubrics: taskRubrics,
    decision_protocol: {
      auto_use: true,
      user_trigger_required: false,
      operating_loop: operatingProtocol.loop.map((item) => item.step),
      task_contract_fields: [
        "mode",
        "intent",
        "rubric",
        "read_first",
        "smallest_sufficient_capability",
        "approval_gates",
        "verification",
        "final_report"
      ],
      read_first_for_build_tasks: ["operating protocol", "matching task rubric", "matching intent_routes", "matching best-practice documents", "high-signal registry entries", "prompt patterns only when a prompt artifact is requested"],
      evidence_note: ["vnem intents searched", "top matches", "chosen rubric", "choice", "why", "verification evidence", "residual uncertainty"]
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
  package_version: packageVersion,
  release_version: releaseVersion,
  release_date: releaseDate,
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
  operating_protocol: operatingProtocol,
  task_rubrics: taskRubrics,
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
  "Installed files: .vnem/AGENTS.md, .vnem/operating-protocol.md, .vnem/task-rubrics.json, .vnem/search-index.json, .vnem/best-practices.md, .vnem/agent-workspace.md, .vnem/prompt-engineering.md, .vnem/prompt-patterns.json",
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
const operatingProtocolMarkdownData = operatingProtocolMarkdown();
const taskRubricData = taskRubricsJson();
const promptPatternData = promptPatternsJson();
const promptEngineering = promptEngineeringMarkdown(promptPatternData);
const agentWorkspace = agentWorkspaceMarkdown();
const agentInstructions = agentsMarkdown();
const rootAgentInstructions = rootAgentsMarkdown();
const archive = installArchive({
  "AGENTS.md": `${rootAgentInstructions}\n`,
  [`${installFolder}/AGENTS.md`]: `${agentInstructions}\n`,
  [`${installFolder}/operating-protocol.md`]: `${operatingProtocolMarkdownData}\n`,
  [`${installFolder}/task-rubrics.json`]: jsonText(taskRubricData),
  [`${installFolder}/search-index.json`]: jsonText(searchIndex),
  [`${installFolder}/best-practices.md`]: `${bestPractices}\n`,
  [`${installFolder}/agent-workspace.md`]: `${agentWorkspace}\n`,
  [`${installFolder}/prompt-engineering.md`]: `${promptEngineering}\n`,
  [`${installFolder}/prompt-patterns.json`]: jsonText(promptPatternData)
});

await writeJson(path.join(ROOT, "public", "api", "index.json"), index);
await writeJson(path.join(ROOT, "public", "install", "search-index.json"), searchIndex);
await writeJson(path.join(ROOT, installFolder, "search-index.json"), searchIndex);
await writeJson(path.join(ROOT, "public", "install", "task-rubrics.json"), taskRubricData);
await writeJson(path.join(ROOT, installFolder, "task-rubrics.json"), taskRubricData);
await writeJson(path.join(ROOT, "public", "install", "prompt-patterns.json"), promptPatternData);
await writeJson(path.join(ROOT, installFolder, "prompt-patterns.json"), promptPatternData);
await writeBytes(path.join(ROOT, "public", installArchiveName), archive);
await writeText(path.join(ROOT, "public", "install", "AGENTS.md"), `${agentInstructions}\n`);
await writeText(path.join(ROOT, installFolder, "AGENTS.md"), `${agentInstructions}\n`);
await writeText(path.join(ROOT, "public", "install", "operating-protocol.md"), `${operatingProtocolMarkdownData}\n`);
await writeText(path.join(ROOT, installFolder, "operating-protocol.md"), `${operatingProtocolMarkdownData}\n`);
await writeText(path.join(ROOT, "public", "install", "best-practices.md"), `${bestPractices}\n`);
await writeText(path.join(ROOT, installFolder, "best-practices.md"), `${bestPractices}\n`);
await writeText(path.join(ROOT, "public", "install", "agent-workspace.md"), `${agentWorkspace}\n`);
await writeText(path.join(ROOT, installFolder, "agent-workspace.md"), `${agentWorkspace}\n`);
await writeText(path.join(ROOT, "public", "install", "prompt-engineering.md"), `${promptEngineering}\n`);
await writeText(path.join(ROOT, installFolder, "prompt-engineering.md"), `${promptEngineering}\n`);
await writeText(path.join(ROOT, "llms.txt"), `${llmsTxt}\n`);
await writeText(path.join(ROOT, "llms-full.txt"), `${llmsFull}\n`);

console.log(`Generated LLM/API/install artifacts for ${entries.length} entries and ${searchIndex.documents.length} search documents.`);
