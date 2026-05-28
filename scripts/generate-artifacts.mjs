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
  "better ui": ["frontend", "ui", "design", "component", "visual", "aesthetic", "visual polish", "composition", "accessibility", "prototype", "landing page", "brand assets"],
  "browser game": ["web game", "html5 game", "game", "canvas", "animation", "vite", "phaser", "pixi", "three.js", "input", "collision", "game ui", "game testing", "game feel", "reward feedback", "sound design"],
  "web game": ["browser game", "html5 game", "canvas", "webgl", "webgpu", "vite", "phaser", "pixi", "three.js", "playcanvas", "game testing"],
  "html5 game": ["browser game", "web game", "canvas", "webgl", "2d game", "phaser", "excalibur", "kaplay", "input"],
  "canvas game": ["browser game", "web game", "canvas", "2d", "game loop", "animation", "collision", "particles", "requestanimationframe"],
  "2d game": ["browser game", "canvas game", "phaser", "pixi", "excalibur", "kaplay", "matter.js", "rapier", "sprites"],
  "3d game": ["browser game", "webgl", "webgpu", "three.js", "babylon.js", "playcanvas", "webxr", "3d assets"],
  "game engine": ["game", "phaser", "pixi", "three.js", "babylon.js", "playcanvas", "excalibur", "kaplay", "matter.js", "rapier", "engine", "physics", "renderer"],
  "game ui": ["game hud", "menus", "contrast", "readability", "touch targets", "feedback", "reward feedback", "game feel", "screen composition", "onboarding", "pause", "restart"],
  "aesthetic experience": ["visual polish", "aesthetic", "aesthetics", "beautiful", "pretty", "polished", "taste", "composition", "layout polish", "neon", "glow", "glowing", "dopamine", "reward feedback", "game feel", "microinteractions", "sound design", "juice", "delight", "perception gate"],
  "visual polish": ["aesthetic experience", "beautiful ui", "pretty ui", "design polish", "composition", "visual hierarchy", "spacing", "typography", "color harmony", "reference fidelity"],
  "visual qa": ["perception gate", "screenshot verification", "rendered qa", "visual polish", "ugliest issue", "desktop screenshot", "mobile screenshot", "interaction evidence", "repo-first assets"],
  "screenshot polish": ["visual qa", "perception gate", "browser verification", "desktop screenshot", "mobile screenshot", "rendered result", "visual polish"],
  "game feel": ["aesthetic experience", "reward feedback", "juice", "sound design", "hit stop", "screen flash", "particles", "apple feedback", "input feel", "microinteractions"],
  "sound design": ["aesthetic experience", "audio", "web audio", "mute", "sfx", "sound effects", "game feel", "throttled audio", "pleasant tones"],
  "reward feedback": ["aesthetic experience", "score pulse", "screen flash", "particles", "apple", "reward", "dopamine", "glow follows action", "interaction anchored"],
  "perception gate": ["aesthetic experience", "visual acceptance", "pretty", "polished", "design review", "screenshot critique", "ship quality"],
  "ui architecture": ["design architecture", "visual system", "layout system", "spacing system", "typography system", "design tokens", "component architecture", "frontend architecture"],
  "bento dashboard": ["dashboard", "bento grid", "css grid", "grid layout", "cards", "kpi", "analytics", "agent dashboard", "dense ui"],
  "agent dashboard": ["conversational ui", "chat ui", "agent ui", "evidence cards", "verification debt", "thought process visibility", "sequential disclosure", "bento dashboard"],
  "conversational ui": ["agent dashboard", "chat interface", "chat ui", "message feed", "evidence cards", "sequential disclosure", "tool trace", "confidence"],
  "motion design": ["microinteraction", "animation", "easing", "duration", "transition", "reduced motion", "hover", "gesture", "feedback"],
  "design tokens": ["tokens", "css variables", "semantic tokens", "spacing scale", "type scale", "color roles", "component tokens"],
  "dark mode": ["dark theme", "surface elevation", "color contrast", "desaturated accents", "luminance", "theme tokens"],
  glassmorphism: ["glass", "frosted glass", "backdrop-filter", "blur", "translucency", "depth", "rim light", "layered shadow"],
  typography: ["type scale", "fluid typography", "clamp", "line height", "readability", "container query units", "cqi"],
  "layout spacing": ["8-point grid", "spacing", "rhythm", "padding", "margin", "gutter", "layout system", "optical spacing"],
  "optical alignment": ["perceptual alignment", "visual weight", "icon alignment", "hanging punctuation", "center of mass", "optical balance"],
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
  "source radar": ["research layer", "source intake", "official docs", "docs index", "mcp registry", "llms.txt", "freshness", "provenance"],
  "research layer": ["source radar", "source intake", "current docs", "official docs", "mcp registry", "benchmark evidence", "evidence"],
  "source intake": ["source radar", "research layer", "upstream source", "source trust", "source provenance", "source license", "source permissions", "source risk review"],
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
  "aesthetic experience": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:frontend", "practice:browser-games", "practice:evals"],
    compare_options: ["existing project design system and assets", "custom CSS/canvas polish pass", "lightweight animation and audio", "source-backed image/audio generation only with approval"],
    choose_by: ["first-screen composition", "visual hierarchy", "scale and spacing", "reference-style fidelity", "action-anchored reward feedback", "motion and sound restraint"],
    report: ["perception verdict", "screenshots or interaction evidence", "what was polished", "known taste or device risk"]
  },
  "visual polish": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:frontend", "practice:evals"],
    compare_options: ["existing design system", "CSS polish pass", "component/layout cleanup", "asset recreation only when needed and approved"],
    choose_by: ["composition", "hierarchy", "spacing", "typography", "color harmony", "responsive fit", "screenshot evidence"],
    report: ["perception verdict", "visual changes", "screenshot evidence", "remaining polish risk"]
  },
  "game feel": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["custom Canvas feedback", "engine-native particles/audio", "DOM HUD effects", "reduced-motion fallback"],
    choose_by: ["input feel", "reward timing", "effect origin", "sound pleasantness", "playfield scale", "restart path"],
    report: ["game-feel verdict", "reward/audio evidence", "browser playthrough", "known device risk"]
  },
  "reward feedback": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:browser-games", "practice:frontend"],
    compare_options: ["event-anchored flash", "score pulse", "particle burst", "short Web Audio cue", "reduced-motion fallback"],
    choose_by: ["effect follows the event", "readable HUD", "flashes are restrained", "audio is throttled and muteable"],
    report: ["reward feedback behavior", "effect origin evidence", "audio/motion safety", "remaining polish risk"]
  },
  "sound design": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:browser-games", "practice:frontend"],
    compare_options: ["Web Audio oscillator cues", "local audio asset", "muted-by-default mode", "visual-only cue"],
    choose_by: ["short pleasant cues", "throttling", "mute control", "audio unlock behavior", "no constant noise"],
    report: ["sound behavior", "mute/unlock handling", "verification evidence", "remaining audio risk"]
  },
  "perception gate": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:frontend", "practice:browser-games", "practice:evals"],
    compare_options: ["fix current visible defects", "tighten scale and layout", "improve motion/reward feedback", "block delivery until polish passes"],
    choose_by: ["ship-quality first impression", "reference fidelity", "no obvious ugliness", "interaction evidence", "responsive screenshots"],
    report: ["ship-quality, needs-polish, or blocked", "screenshots reviewed", "issues fixed before final", "remaining uncertainty"]
  },
  "visual qa": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:frontend", "practice:browser-games", "practice:evals"],
    compare_options: ["repo-first rendered inspection", "desktop and mobile screenshot pass", "interaction/reward moment check", "smallest polish fix", "blocked report if evidence cannot be produced"],
    choose_by: ["actual rendered result", "first-screen impression", "mobile fit", "interaction evidence", "ugliest issue fixed before final"],
    report: ["perception verdict", "ugliest issue found and fixed", "screenshot or rendered-inspection evidence", "remaining polish risk"]
  },
  "ui architecture": {
    read_first: ["practice:visual-experience", "design-architecture:vnem-design-architecture", "practice:frontend", "source:ui-architecture-sources"],
    compare_options: ["existing design system", "CSS variables and semantic tokens", "CSS Grid/Flexbox layout", "component-local container queries", "custom visual system only when the repo lacks one"],
    choose_by: ["repo-native conventions", "layout stability", "token reusability", "accessibility baseline", "screenshot verification"],
    report: ["design architecture chosen", "tokens or layout system used", "verification evidence", "remaining polish risk"]
  },
  "bento dashboard": {
    read_first: ["practice:visual-experience", "design-architecture:vnem-design-architecture", "practice:frontend", "source:ui-architecture-sources"],
    compare_options: ["plain responsive grid", "12-column CSS Grid bento", "existing dashboard components", "linear layout for sequential workflows"],
    choose_by: ["information priority", "grid fit", "consistent gutters", "mobile collapse", "scanability"],
    report: ["dashboard layout choice", "priority-to-size mapping", "responsive verification", "known density risk"]
  },
  "agent dashboard": {
    read_first: ["practice:visual-experience", "design-architecture:vnem-design-architecture", "practice:frontend", "practice:agent-tooling", "source:ui-architecture-sources"],
    compare_options: ["chat feed with evidence cards", "bento micro-dashboard", "task trace panel", "plain text report"],
    choose_by: ["verification debt", "source visibility", "cognitive load", "mobile readability", "trust-building evidence"],
    report: ["agent UI pattern", "evidence shown", "verification visibility", "residual trust risk"]
  },
  "conversational ui": {
    read_first: ["practice:visual-experience", "design-architecture:vnem-design-architecture", "practice:frontend", "source:ui-architecture-sources"],
    compare_options: ["linear chat disclosure", "inline evidence cards", "expandable tool trace", "dashboard handoff"],
    choose_by: ["message length", "data complexity", "source/evidence needs", "tap target size", "scroll readability"],
    report: ["conversation pattern", "evidence and disclosure design", "accessibility check", "known cognitive-load risk"]
  },
  "motion design": {
    read_first: ["practice:visual-experience", "design-architecture:vnem-design-architecture", "practice:frontend", "source:ui-architecture-sources"],
    compare_options: ["CSS transitions", "requestAnimationFrame animation", "reduced-motion fallback", "static state change"],
    choose_by: ["feedback immediacy", "duration", "easing", "motion sensitivity", "performance"],
    report: ["motion behavior", "reduced-motion handling", "interaction evidence", "remaining motion risk"]
  },
  "design tokens": {
    read_first: ["practice:visual-experience", "design-architecture:vnem-design-architecture", "practice:frontend", "source:ui-architecture-sources"],
    compare_options: ["existing tokens", "CSS custom properties", "semantic aliases", "component-specific tokens"],
    choose_by: ["repo conventions", "theme needs", "readability", "maintainability", "blast radius"],
    report: ["token strategy", "roles introduced or reused", "verification evidence", "migration risk"]
  },
  "dark mode": {
    read_first: ["practice:visual-experience", "design-architecture:vnem-design-architecture", "practice:frontend", "source:ui-architecture-sources"],
    compare_options: ["existing theme tokens", "dark surface ladder", "light-only design", "system color-scheme support"],
    choose_by: ["contrast baseline", "surface elevation", "brand color desaturation", "eye comfort", "theme consistency"],
    report: ["dark-mode strategy", "contrast/elevation evidence", "known accessibility risk"]
  },
  glassmorphism: {
    read_first: ["practice:visual-experience", "design-architecture:vnem-design-architecture", "practice:frontend", "source:ui-architecture-sources"],
    compare_options: ["solid surface", "subtle translucent panel", "backdrop-filter glass", "noise/matte overlay"],
    choose_by: ["text readability", "browser support", "background complexity", "performance", "fallback clarity"],
    report: ["material choice", "readability evidence", "fallback risk"]
  },
  typography: {
    read_first: ["practice:visual-experience", "design-architecture:vnem-design-architecture", "practice:frontend", "source:ui-architecture-sources"],
    compare_options: ["existing type scale", "static accessible scale", "fluid clamp scale", "container-query type"],
    choose_by: ["readability", "mobile fit", "line height", "zoom behavior", "component reuse"],
    report: ["type scale choice", "responsive evidence", "remaining readability risk"]
  },
  "layout spacing": {
    read_first: ["practice:visual-experience", "design-architecture:vnem-design-architecture", "practice:frontend"],
    compare_options: ["existing spacing tokens", "8-point spacing scale", "component-local spacing", "layout-specific exceptions"],
    choose_by: ["visual grouping", "internal vs external spacing", "responsive rhythm", "text fit"],
    report: ["spacing system", "grouping evidence", "responsive risk"]
  },
  "optical alignment": {
    read_first: ["practice:visual-experience", "design-architecture:vnem-design-architecture", "practice:frontend"],
    compare_options: ["geometric alignment", "manual optical offset", "icon/text contrast adjustment", "hanging punctuation or visual inset"],
    choose_by: ["perceived center", "visual weight", "text/icon harmony", "screenshot evidence"],
    report: ["alignment fix", "perception evidence", "remaining polish risk"]
  },
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
  "source radar": {
    read_first: ["source:mcp-core-and-registry", "source:coding-agent-clients", "source:documentation-ingestion", "practice:research-source-intake", "practice:agent-tooling"],
    compare_options: ["official docs", "canonical GitHub repositories", "official registries", "vendor MCP docs", "evaluation frameworks", "llms.txt indexes"],
    choose_by: ["source confidence", "freshness", "license clarity", "permission risk", "agent-client relevance", "verification path"],
    report: ["source category", "why it matters", "trust and risk", "intake path", "refresh cadence"]
  },
  "research layer": {
    read_first: ["source:mcp-core-and-registry", "source:coding-agent-clients", "source:evaluation-and-observability", "practice:research-source-intake", "practice:evals"],
    compare_options: ["static registry entry", "best-practice note", "prompt pattern", "watched source", "benchmark fixture"],
    choose_by: ["whether agents need it before editing", "source trust", "context saved", "maintenance effort", "risk flags"],
    report: ["sources consulted", "decision", "data to add", "verification evidence"]
  },
  "source intake": {
    read_first: ["source:mcp-core-and-registry", "source:documentation-ingestion", "practice:research-source-intake", "practice:security"],
    compare_options: ["add watched source only", "add registry entry", "add best-practice note", "add prompt pattern", "defer as out of scope"],
    choose_by: ["official provenance", "license posture", "permissions", "risk flags", "whether a real agent workflow improves"],
    report: ["candidate", "trust tier", "risk flags", "artifact to update", "verification"]
  },
  "benchmark evidence": {
    read_first: ["source:evaluation-and-observability", "practice:evals", "practice:research-source-intake"],
    compare_options: ["small repo pilot", "prompt regression suite", "tool-call trace review", "before/after recommendation diff", "manual maintainer review"],
    choose_by: ["measurable behavior", "repeatability", "cost", "failure-mode coverage", "fit to vnem's read-only model"],
    report: ["metric", "dataset or fixture", "baseline", "expected improvement", "review gate"]
  },
  "pre execution gateway": {
    read_first: ["practice:zero-trust-agent-gateway", "source:agentic-gateway-security", "practice:mcp-server-selection", "practice:security"],
    compare_options: ["read-only vnem guidance", "advisory gateway design", "client-side approval policy", "separate runtime proxy", "language/runtime rewrite"],
    choose_by: ["blast radius", "deterministic controls", "client compatibility", "secret handling", "path confinement", "verification coverage"],
    report: ["safe subset", "blocked risky scope", "phased design", "required tests", "approval gates"]
  },
  "zero trust gateway": {
    read_first: ["practice:zero-trust-agent-gateway", "source:agentic-gateway-security", "practice:mcp-server-selection", "practice:security"],
    compare_options: ["tool annotations as hints", "schema hash pinning", "workspace path policy", "redacted audit logging", "package firewall advisory", "runtime sandbox"],
    choose_by: ["enforceability", "trusted boundary", "false-positive cost", "rollback path", "whether the install pack remains read-only"],
    report: ["trust boundary", "control type", "what is deterministic", "what needs human approval"]
  },
  "tool pinning": {
    read_first: ["practice:zero-trust-agent-gateway", "source:agentic-gateway-security", "practice:mcp-server-selection"],
    compare_options: ["schema hash pinning", "tool allowlist", "server/version pin", "list_changed invalidation", "manual approval on schema drift"],
    choose_by: ["source trust", "schema stability", "client support", "failure mode", "auditability"],
    report: ["server", "tool", "known hash", "drift behavior", "review action"]
  },
  "package firewall": {
    read_first: ["practice:zero-trust-agent-gateway", "source:agentic-gateway-security", "practice:code-review", "practice:security"],
    compare_options: ["manifest diff review", "package metadata check", "typosquat heuristic", "maintainer/license check", "lockfile-only policy"],
    choose_by: ["ecosystem", "registry metadata quality", "install side effects", "maintainer trust", "verification path"],
    report: ["package", "risk signal", "recommended gate", "false-positive handling"]
  },
  "ast indexer": {
    read_first: ["practice:zero-trust-agent-gateway", "source:agentic-gateway-security", "practice:code-simplification", "practice:evals"],
    compare_options: ["plain lexical search", "AST-aware search", "disposable read-only graph", "durable code graph service"],
    choose_by: ["repo size", "language support", "index freshness", "write risk", "incremental update correctness"],
    report: ["index scope", "read-only guarantee", "verification", "deferred runtime scope"]
  },
  "codex vs claude": {
    read_first: ["practice:ide-agent-selection", "practice:model-and-provider-selection", "practice:agent-tooling", "practice:evals"],
    compare_options: ["Codex", "Claude Code", "Gemini/Google ADK", "Copilot-style agents", "Cursor/Cline-style tools", "framework-based agents"],
    choose_by: ["repo workflow fit", "approval boundaries", "shell and filesystem model", "memory and instruction model", "MCP/tool support", "verification and cost"],
    report: ["vnem intents searched", "top matches", "best fit", "pilot task"]
  },
  "gemini agent": {
    read_first: ["practice:ide-agent-selection", "practice:model-and-provider-selection", "practice:agent-tooling", "practice:evals"],
    compare_options: ["Gemini/Google ADK", "Codex", "Claude Code", "hosted agent runtimes", "model API tool-calling"],
    choose_by: ["Google ecosystem fit", "agent framework needs", "deployment path", "tooling and evaluation support", "privacy and cost"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "ai model selection": {
    read_first: ["practice:model-and-provider-selection", "practice:ide-agent-selection", "practice:evals", "practice:observability-and-tracing"],
    compare_options: ["coding agent", "model API", "agent framework", "MCP-enabled workflow", "existing project tool"],
    choose_by: ["task shape", "quality evidence", "latency", "cost", "privacy", "operational fit", "reversibility"],
    report: ["vnem intents searched", "top matches", "recommendation", "verification plan"]
  },
  "agent upgrade": {
    read_first: ["practice:ide-agent-selection", "practice:model-and-provider-selection", "practice:context-engineering", "practice:evals"],
    compare_options: ["better instructions", "prompt pattern", "MCP/tool addition", "memory policy", "eval fixture", "agent/provider switch"],
    choose_by: ["highest concrete capability gap", "permission risk", "verification path", "rollback path", "maintenance cost"],
    report: ["vnem intents searched", "top matches", "upgrade path", "risk and verification"]
  },
  "browser game": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas with Vite or a tiny static server", "Phaser", "PixiJS", "Excalibur", "KAPLAY", "Three.js", "Babylon.js", "PlayCanvas"],
    choose_by: ["2D or 3D gameplay", "asset loading and physics needs", "dependency budget", "input model", "aesthetic polish and game feel", "accessibility needs", "real-browser verification path"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "web game": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas with Vite for compact custom 2D", "Phaser for full 2D game framework needs", "PixiJS for rendering-heavy 2D", "Three.js/Babylon.js/PlayCanvas for true 3D"],
    choose_by: ["playability requirements", "rendering dimension", "engine structure needed", "browser support", "verification evidence"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "html5 game": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas", "Phaser", "PixiJS", "Excalibur", "KAPLAY"],
    choose_by: ["custom game feel", "scene and asset needs", "TypeScript preference", "prototype speed", "mobile/touch behavior"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "canvas game": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas with Vite or a tiny static server", "Phaser", "PixiJS", "Excalibur", "KAPLAY"],
    choose_by: ["custom game feel", "rendering complexity", "input model", "collision needs", "dependency budget", "canvas performance risk"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "2d game": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas for tiny bespoke games", "Phaser for scenes/sprites/audio/cameras", "PixiJS for renderer-first interaction", "Excalibur for TypeScript-first 2D", "KAPLAY for fast prototypes"],
    choose_by: ["scene complexity", "sprite/asset pipeline", "physics needs", "typing preference", "prototype speed", "polish budget"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "3d game": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Three.js for custom 3D scenes", "Babylon.js for full 3D engine features", "PlayCanvas for browser-first 3D engine/editor workflows"],
    choose_by: ["3D scene complexity", "asset pipeline", "physics/XR needs", "WebGL/WebGPU support", "performance tooling"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "game engine": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Phaser for full 2D game framework needs", "PixiJS for fast 2D rendering", "Excalibur for TypeScript-first 2D", "KAPLAY for quick playful 2D", "Three.js for custom 3D", "Babylon.js or PlayCanvas for full 3D engine workflows", "Canvas for compact custom 2D MVPs"],
    choose_by: ["engine features needed", "visual direction", "physics/audio/asset pipeline", "bundle size", "maintenance risk", "runtime verification path"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "game ui": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["in-canvas HUD", "DOM overlay UI", "engine UI primitives", "existing app design system"],
    choose_by: ["readability", "input method", "responsive scaling", "composition", "contrast", "feedback clarity", "game feel", "localization risk"],
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
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:frontend", "practice:context-engineering", "practice:evals"],
    compare_options: ["existing project design system", "mature UI primitives", "custom CSS only when scope is tiny"],
    choose_by: ["workflow fit", "first-screen composition", "aesthetic polish", "accessibility", "responsive verification", "dependency budget"],
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
    id: "visual-experience",
    title: "Visual Experience And Perception Gate",
    score: 18,
    summary: "For visual work, judge the actual perceptual artifact: if it looks ugly, generic, oversized, noisy, or mismatched to references, it is not done.",
    keywords: ["aesthetic experience", "visual polish", "pretty", "polished", "perception gate", "game feel", "reward feedback", "dopamine", "neon", "glow", "sound design", "screenshot critique", "first screen", "composition", "reference fidelity", "ui architecture", "bento dashboard", "agent dashboard", "motion design", "design tokens", "dark mode", "glassmorphism", "typography", "layout spacing", "optical alignment"],
    sources: [
      "https://developer.mozilla.org/en-US/docs/Web/CSS",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/grid",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/clamp",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_container_queries",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter",
      "https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API",
      "https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion",
      "https://w3c.github.io/wcag/guidelines/22/"
    ],
    practices: [
      "Read `.vnem/design-architecture.md` for UI, game, dashboard, animation, brand, or visual-polish tasks before choosing the final visual approach.",
      "A UI, game, animation, or visual artifact is not deliverable until the first screenshot looks intentionally designed, balanced, and domain-appropriate.",
      "Run a perception gate before final: composition, hierarchy, scale, spacing, color harmony, typography, motion, sound, and feedback origin.",
      "Anchor reward and dopamine effects to the user action or game event; avoid static center glow unless the center is truly the event.",
      "For canvas and games, keep the playfield within the viewport with breathing room; oversized empty boards fail the visual check unless the user asked for that scale.",
      "Sound design must be short, pleasant, throttled, and muteable; avoid constant tick noise unless it is subtle and intentionally improves feel.",
      "Use source-backed CSS capabilities deliberately: CSS Grid for two-dimensional dashboard layout, `clamp()` for bounded fluid sizing, container queries for component-local responsiveness, and `backdrop-filter` only with readable fallbacks.",
      "Use WCAG 2.2/current W3C contrast requirements as the accessibility baseline. Treat APCA and WCAG 3 contrast discussions as watchlist guidance until W3C finalizes the algorithm.",
      "Translate reference assets into a cohesive motif by extracting palette, texture, silhouette, glow behavior, and spatial mood instead of pasting a disconnected decoration.",
      "After a screenshot or browser pass, name the ugliest visible issue and fix it before reporting completion.",
      "If the artifact still looks ugly or unpleasant, report it as blocked or needs-polish instead of calling it done."
    ]
  },
  {
    id: "frontend",
    title: "Frontend And UI",
    summary: "Prefer mature component systems, accessibility-first primitives, screenshot verification, domain-specific UI patterns, and an aesthetic perception gate before inventing custom interaction layers.",
    keywords: ["better ui", "frontend", "design", "tailwind", "astro", "react", "accessibility", "screenshot", "component", "visual polish", "perception gate"],
    sources: [
      "https://www.anthropic.com/engineering/building-effective-agents"
    ],
    practices: [
      "Start with the product workflow, then pick UI libraries that reduce implementation risk.",
      "For user-facing UI, run the perception gate before final: first-screen composition, hierarchy, scale, spacing, color, typography, motion, and responsive fit.",
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
      "Reward feedback should originate at the relevant interaction or game-event coordinates, such as the collectible position, rather than defaulting to a static center flash.",
      "Treat game feel as a deliverable: score pulses, particles, hit-stop, glow, and sound should make success feel good without cluttering the playfield.",
      "Keep sound restrained, throttled, and muteable; do not tick or beep on every movement step unless the cue is subtle and intentionally improves rhythm.",
      "Treat accessibility as game feel: provide keyboard/touch parity where practical, avoid color-only cues, respect reduced-motion needs, watch photosensitive flashing, and add captions or visual audio cues when sound carries gameplay information.",
      "Verify delivered playability in a real browser: serve locally, confirm nonblank canvas pixels, simulate inputs, check state transitions and restart, inspect desktop and mobile viewports, and test audio unlock behavior.",
      "Before final, judge the first screenshot and one reward moment for polish; a playable game that looks oversized, muddy, static, or unpleasant is not done.",
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
    summary: "Treat vnem as a source router, not a document dump: capture official, current, machine-readable sources that help agents make better decisions before editing.",
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
      "Keep vnem metadata original and compact; preserve source URLs instead of copying long upstream docs into the install pack.",
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
      "Do not convert the read-only vnem install pack into a daemon, shell proxy, package installer, or runtime command interceptor.",
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

const operatingProtocol = {
  id: "vnem-operating-loop",
  title: "vnem Operating Loop",
  summary:
    "A universal read-only operating protocol for coding agents: sense the repo, route task context, choose the smallest sufficient capability, constrain risk, pass an aesthetic perception gate for UI/game work, verify with evidence, and report residual uncertainty.",
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
      step: "Perceive",
      instruction:
        "For UI, game, animation, visual, or content surfaces, judge the artifact like a human before final: first-screen composition, hierarchy, scale, spacing, color harmony, reference-style fidelity, motion, reward feedback, and sound. Iterate until it looks intentionally polished or report the blocker."
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
      "for aesthetic UI/game work, perform a perception pass on screenshots before final: no oversized empty canvases, no accidental center-only glow, reward effects should follow user action, and sound should be restrained and pleasant",
      "report checks that could not run and why"
    ],
    report: [
      "vnem intents searched",
      "top matches and chosen rubric",
      "choice and why",
      "verification evidence",
      "perception verdict for UI/game work: ship-quality, needs-polish, or blocked",
      "approval gates and residual uncertainty"
    ]
  }
};

const designArchitecture = {
  id: "vnem-design-architecture",
  title: "vnem Design Architecture",
  summary:
    "Source-backed design intelligence for UI, game, visual, dashboard, and conversational-agent work. Use it to make aesthetics a delivery requirement, not a decoration pass.",
  url_path: "/install/design-architecture.md",
  resource_uri: "vnem://install/design-architecture",
  tags: [
    "design architecture",
    "visual polish",
    "ui architecture",
    "bento dashboard",
    "agent dashboard",
    "conversational ui",
    "motion design",
    "design tokens",
    "dark mode",
    "glassmorphism",
    "typography",
    "layout spacing",
    "optical alignment",
    "perception gate"
  ],
  source_urls: [
    "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout",
    "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/repeat",
    "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/clamp",
    "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries",
    "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter",
    "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion",
    "https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API",
    "https://www.w3.org/TR/WCAG22/",
    "https://www.w3.org/TR/wcag-3.0/"
  ],
  guidance_classification: {
    standard: [
      "Use W3C WCAG 2.2 and current accessibility guidance as the hard baseline for contrast, focus visibility, non-color cues, labels, keyboard access, and reduced-motion accommodations.",
      "Treat browser feature behavior from MDN and linked specifications as source-backed capability guidance, then verify in the target browser when the effect matters."
    ],
    browser_capability: [
      "CSS Grid, `repeat()`, `minmax()`, `clamp()`, container queries, `backdrop-filter`, Web Audio, and `prefers-reduced-motion` are browser primitives to use deliberately, with fallbacks when support or accessibility matters.",
      "Browser capabilities are implementation tools, not proof that a design is good; rendered screenshots and interaction checks still decide the perception verdict."
    ],
    heuristic: [
      "8-point spacing, bento topology, optical alignment, grayscale-first hierarchy, modular type scales, layered shadows, dark-mode surface ladders, and motion timing windows are design heuristics.",
      "Use heuristics to produce better taste and consistency, but allow repo conventions, brand references, accessibility, and actual screenshots to override them."
    ],
    watchlist: [
      "WCAG 3 and APCA-style contrast work are draft/watchlist material in this pack, useful for future-facing review but not encoded as normative compliance.",
      "Do not report APCA numeric targets as required pass/fail criteria unless the project explicitly adopts them."
    ]
  },
  sections: [
    {
      title: "Delivery Rule",
      bullets: [
        "A visual surface is not complete just because it builds or responds to input. It must pass a perception gate in a real rendered state.",
        "Ship-quality means the first screen looks intentional, readable, proportional, responsive, and aligned with the user's reference or domain.",
        "Needs-polish means the core behavior works but visual balance, scale, contrast, motion, sound, or reference fidelity is visibly weak.",
        "Blocked means browser evidence shows obvious ugliness, unreadable content, oversized canvases, noisy effects, inaccessible motion/audio, or mismatched assets."
      ]
    },
    {
      title: "Perceptual Hierarchy And Optical Alignment",
      bullets: [
        "Build hierarchy with contrast, weight, spacing, and color role before simply making everything larger.",
        "Use muted icon color or weight to keep dense icons from overpowering adjacent text.",
        "Prefer perceived alignment over bounding-box math for asymmetric icons, play triangles, punctuation, badges, and visually heavy shapes.",
        "Start complex surfaces in grayscale when hierarchy is unclear; add color after the reading order works without it."
      ]
    },
    {
      title: "Spacing And Grid Rhythm",
      bullets: [
        "Use the repo's existing spacing tokens first. When none exist, prefer an 8-point scale for layout, padding, gaps, and stable rhythm.",
        "Keep internal component padding less than or equal to the external space separating unrelated groups.",
        "For dashboards and dense agent UIs, use CSS Grid for two-dimensional layouts instead of forcing row/column spans through Flexbox.",
        "Use bento grids only when spatial size communicates priority; avoid them for long-form reading or strictly sequential workflows."
      ]
    },
    {
      title: "Typography",
      bullets: [
        "Use readable body sizes and line heights. Large display text can use tighter line height; body copy needs looser line height for scanning.",
        "Use `clamp()` for bounded fluid typography when text must scale smoothly across viewports.",
        "Use container queries or container query units when a component's typography should respond to its own container rather than the whole viewport.",
        "Do not use viewport-only type scaling that makes compact panels, cards, or mobile views feel oversized."
      ]
    },
    {
      title: "Material, Depth, And Glass",
      bullets: [
        "Use shadows, highlights, and translucent materials to clarify depth, not to decorate every surface.",
        "Use `backdrop-filter` glass only when text remains readable and a solid or higher-opacity fallback is available.",
        "Layered shadows and glows should support state, focus, or brand atmosphere without muddying the interface.",
        "In dark mode, prefer deep neutral surfaces over pure black for large areas, and use surface luminance, borders, or subtle glow to show elevation."
      ]
    },
    {
      title: "Color And Accessibility",
      bullets: [
        "Use current WCAG/W3C guidance as the hard accessibility baseline for contrast, focus visibility, input targets, reduced motion, and non-color cues.",
        "Treat WCAG 3 and APCA-style contrast ideas as watchlist and review material until the relevant W3C algorithm is finalized.",
        "Desaturate intense accents in dark environments when they vibrate or damage readability.",
        "Do not let glow, blur, gradients, glass, or image backgrounds reduce text contrast below an acceptable reading level."
      ]
    },
    {
      title: "Motion, Sound, And Game Feel",
      bullets: [
        "Immediate interaction feedback should feel fast; longer transitions must explain spatial movement or state change.",
        "Prefer natural easing, short durations, and reduced-motion fallbacks for nonessential animation.",
        "Reward effects must originate at the user action or game event. A center flash is wrong unless the center is the event.",
        "Sound should be short, pleasant, throttled, and muteable. Constant movement ticks or harsh tones are ship blockers unless intentionally subtle."
      ]
    },
    {
      title: "Conversational And Agent UI",
      bullets: [
        "Use sequential disclosure for chat, but hand off complex evidence into compact cards, tables, or micro-dashboards instead of long text walls.",
        "Reduce verification debt by showing sources, steps, confidence, and checks in a readable evidence layer.",
        "Agent dashboards should make current state, next action, approval need, and verification evidence visible without overwhelming the first screen.",
        "Use bento or card layouts for evidence only when they improve scanability and priority, not because every agent response needs a card."
      ]
    },
    {
      title: "Verification Checklist",
      bullets: [
        "Capture or inspect desktop and mobile screenshots before final for meaningful visual work.",
        "Check one interaction or reward moment, not only the static initial state.",
        "Check reduced-motion behavior for motion-heavy work and mute/audio unlock behavior for sound.",
        "Name the ugliest visible issue after inspection and fix it before reporting ship-quality."
      ]
    }
  ]
};

const visualQaProtocol = {
  id: "vnem-visual-qa-protocol",
  title: "vnem Visual QA Protocol",
  summary:
    "A compact rendered-quality loop for UI, game, dashboard, canvas, motion, sound, and brand-facing work. Use it to make aesthetic inspection and screenshot evidence part of done.",
  url_path: "/install/visual-qa-protocol.md",
  resource_uri: "vnem://install/visual-qa-protocol",
  tags: [
    "visual qa",
    "perception gate",
    "screenshot verification",
    "repo-first assets",
    "mobile fit",
    "reward feedback",
    "sound design",
    "visual polish"
  ],
  sections: [
    {
      title: "Repo-First Sensing",
      bullets: [
        "Before visual edits, inspect the repo for existing assets, public images, fonts, icons, screenshots, CSS variables, Tailwind/theme config, design tokens, layout components, and current routes.",
        "Use local reference assets and established component/style conventions before inventing new visuals or adding dependencies.",
        "If the user supplied images or brand files, translate their palette, texture, silhouette, mood, and focal elements into the interface instead of pasting unrelated decoration.",
        "Do not fetch remote media, call generation services, add UI libraries, or use copyrighted assets without explicit approval."
      ]
    },
    {
      title: "Rendered QA Loop",
      bullets: [
        "Serve or open the actual app surface when possible; static code inspection is not enough for visual work.",
        "Inspect desktop and mobile states and check that text, controls, canvas, hero, cards, and HUD elements fit without overlap or awkward scale.",
        "Name the single ugliest visible issue after inspection, fix it, then re-check before claiming ship-quality.",
        "Use the verdicts `ship-quality`, `needs-polish`, or `blocked`; do not call a surface done when the first screen is ugly, oversized, unreadable, or mismatched to the reference."
      ]
    },
    {
      title: "Interaction Moment",
      bullets: [
        "For games and interactive tools, verify one meaningful interaction or reward moment, not only the initial screen.",
        "Reward glow, particles, score pulses, flashes, and audio must originate from the event location or user action unless the design intentionally explains a global effect.",
        "Keep flashes restrained, motion readable, and sound short, pleasant, throttled, and muteable.",
        "Check reduced-motion behavior for motion-heavy surfaces and audio unlock/mute behavior when sound is present."
      ]
    },
    {
      title: "Final Evidence Contract",
      bullets: [
        "Report the visual route used, the perception verdict, the ugliest issue found and fixed, and the verification evidence.",
        "For successful delivery, mention desktop screenshot or inspection, mobile screenshot or inspection, and interaction/reward evidence when applicable.",
        "If browser or screenshot verification cannot run, say exactly what could not be verified and mark the remaining polish risk.",
        "Keep the evidence concise; the goal is to prove the artifact was seen, not to write a design essay."
      ]
    }
  ]
};

const taskRubrics = [
  {
    id: "frontend_ui",
    title: "Frontend UI",
    summary:
      "Build usable, accessible, responsive interfaces that match the product workflow, existing design system, and aesthetic perception gate before adding decorative complexity.",
    modes: ["build", "review"],
    intents: ["better ui", "frontend", "ui", "design", "react", "tailwind", "dashboard", "landing page", "prototype", "visual polish", "pretty", "polished"],
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:frontend", "practice:evals"],
    quality_bar: [
      "primary user workflow is usable on the first screen",
      "first screen looks intentionally designed with balanced scale, hierarchy, spacing, and color",
      "layout is responsive and text fits on mobile and desktop",
      "accessibility basics are present: labels, contrast, focus states, and usable target sizes",
      "visual verification and a perception pass are performed for meaningful UI changes"
    ],
    approval_gates: ["adding UI frameworks or design-system dependencies", "calling paid design or image services"],
    verification: ["run project UI checks if present", "open the local page/app", "capture or inspect desktop and mobile states", "fix obvious visual defects before final"],
    output_contract: ["changed UI surface", "stack/library choice", "perception verdict", "visual verification evidence", "known responsive, accessibility, or polish risk"]
  },
  {
    id: "aesthetic_experience",
    title: "Aesthetic Experience And Game Feel",
    summary:
      "For visual and interactive work, the artifact is not deliverable until it feels intentionally designed, polished, responsive, and pleasant to use.",
    modes: ["build", "review"],
    intents: ["aesthetic experience", "visual polish", "pretty", "polished ui", "composition", "game feel", "sound design", "reward feedback", "dopamine", "neon", "glow", "microinteractions", "browser game", "interactive canvas"],
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:frontend", "practice:browser-games"],
    quality_bar: [
      "first screen has strong composition, clear hierarchy, balanced scale, and deliberate spacing",
      "visual effects are anchored to user actions and reinforce workflow or game state",
      "motion, flashes, glow, particles, and sound are tasteful rather than noisy",
      "reference assets and style cues are translated into one cohesive aesthetic",
      "the agent performs a browser/screenshot polish pass and fixes obvious ugliness before delivery"
    ],
    approval_gates: ["using copyrighted third-party assets", "calling image or audio generation services", "adding intense flashes, autoplay audio, or motion-heavy effects"],
    verification: ["capture desktop and mobile first-screen evidence", "play or interact through reward feedback", "check effect origin follows the interaction or game event", "listen to and mute sound if included", "compare against reference style and fix visible mismatches"],
    output_contract: ["perception verdict", "visual system changed", "reward/motion/audio evidence", "remaining taste, motion, or accessibility risk"]
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
    intents: ["agent", "mcp", "mcp servers", "mcp gateway", "one mcp", "tool routing", "coding agents", "codex config", "agent workspace", "source radar", "source intake", "ai model selection", "agent upgrade", "codex vs claude", "zero trust gateway"],
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
    intents: ["security", "auth", "secrets", "payments", "wallet", "database", "deployment", "production", "browser", "permissions", "pre execution gateway", "zero trust gateway", "tool pinning", "package firewall", "ast indexer"],
    read_first: ["practice:security", "practice:zero-trust-agent-gateway", "practice:human-approval-and-durability", "practice:evals"],
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
      "Deliver real playability or interaction with polished game feel: responsive rendering, input mapping, state transitions, action-anchored feedback, restart/error states, and real-browser verification.",
    modes: ["build", "debug", "review"],
    intents: ["browser game", "web game", "html5 game", "canvas game", "2d game", "3d game", "game physics", "game ui", "canvas performance", "game feel", "reward feedback", "sound design"],
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:browser-games", "practice:frontend", "practice:evals"],
    quality_bar: [
      "the experience is playable or interactive, not only visually present",
      "input works across relevant desktop and mobile controls",
      "start, win/loss, pause/restart, and error states are explicit where relevant",
      "reward feedback, glow, particles, score pulses, and sound are anchored to game events and feel good",
      "canvas or animation output is verified in a real browser"
    ],
    approval_gates: ["adding heavy engines or binary assets", "using paid asset services", "fetching remote media", "introducing audio/autoplay behavior"],
    verification: ["serve locally", "confirm nonblank rendering", "simulate or manually perform core input", "check state transition and restart", "inspect mobile viewport", "verify reward effect origin and sound/mute behavior", "run a perception pass on the first screen and one reward moment"],
    output_contract: ["chosen rendering/game stack", "core interaction built", "game-feel and perception verdict", "browser verification evidence", "known device/performance/polish risk"]
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
      "vnem needs to support Codex, Claude Code, OpenCode, Gemini/ADK, or similar coding agents.",
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
      "vnem should point to a source rather than copying long upstream docs into the registry.",
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
      "vnem needs to recommend a browser MCP or verification workflow.",
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
    id: "ui-architecture-sources",
    title: "UI Architecture And Design Systems Sources",
    category: "visual-design",
    priority: "high",
    summary: "Track official CSS, accessibility, motion, audio, and contrast sources so visual guidance stays source-backed and does not hard-code unfinished standards as requirements.",
    use_when: [
      "An agent is designing, reviewing, or polishing a UI, game, landing page, dashboard, chat interface, or interactive canvas.",
      "A recommendation depends on CSS Grid, fluid typography, container queries, glass/depth effects, motion, audio, dark mode, or accessibility contrast.",
      "vnem needs to distinguish current W3C/WCAG requirements from draft WCAG 3 or APCA-style watchlist ideas."
    ],
    monitor: [
      "MDN CSS Grid, repeat/minmax, clamp, container queries, backdrop-filter, prefers-reduced-motion, and Web Audio docs",
      "W3C WCAG 2.2 recommendation and WCAG 3 draft status",
      "Browser support notes for effects that can harm readability or performance"
    ],
    risk_checks: [
      "Draft contrast algorithms treated as production requirements",
      "Motion, flash, blur, or sound that harms accessibility",
      "Visual effects that reduce text contrast or lack fallback behavior",
      "Unsourced claims about exact design constants or benchmark improvements"
    ],
    source_urls: [
      "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/repeat",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/clamp",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion",
      "https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API",
      "https://www.w3.org/TR/WCAG22/",
      "https://www.w3.org/TR/wcag-3.0/"
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
      "vnem needs to recommend least-privilege, read-only, or sandbox-first setup."
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
    summary: "Track eval and tracing systems so vnem can prove whether an agent workflow actually improves output quality, speed, and safety.",
    use_when: [
      "A claim says vnem improves recommendations, engineering velocity, prompt quality, or tool choice.",
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
      "vnem needs to distinguish local, remote, containerized, and organization-approved MCP deployment paths."
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
      "A proposal asks vnem to act as a pre-execution gateway, command proxy, package firewall, schema pinning layer, or AST indexer.",
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
    id: "visual-build",
    title: "Visual Build Prompt",
    intents: ["visual build", "build ui", "make app", "landing page", "browser game", "agent dashboard", "bento dashboard"],
    summary: "Prompt an agent to build a usable visual surface that passes the vnem perception gate.",
    output_modes: ["agent_prompt"],
    template: [
      "Build the actual usable visual experience and treat aesthetics as part of done.",
      "",
      "Product/User:",
      "<who uses this and why>",
      "",
      "Core Surface:",
      "<page, app, dashboard, game, chat UI, or component>",
      "",
      "Visual Direction:",
      "- Use local assets, brand cues, and existing design tokens first.",
      "- Match the user's reference style through palette, scale, spacing, texture, motion, and mood.",
      "- Use source-backed browser primitives where helpful: CSS Grid, clamp(), container queries, reduced-motion media queries, and Web Audio only when needed.",
      "",
      "Perception Gate:",
      "- The first screen must look intentional, balanced, readable, and responsive.",
      "- Fix ugly scale, spacing, color, typography, glow, blur, or motion before final.",
      "- Reward effects must originate at the relevant user action or game event.",
      "- Sound must be short, pleasant, throttled, and muteable.",
      "",
      "Verification:",
      "- Follow `.vnem/visual-qa-protocol.md` when the vnem pack is present.",
      "- Inspect or capture desktop and mobile screenshots.",
      "- Verify one key interaction or reward moment.",
      "- Check reduced-motion and audio/mute behavior when applicable.",
      "",
      "Output:",
      "- Implemented surface.",
      "- Local URL or file path.",
      "- Perception verdict: ship-quality, needs-polish, or blocked.",
      "- Screenshot/interaction verification notes."
    ].join("\n")
  },
  {
    id: "visual-polish-review",
    title: "Visual Polish Review Prompt",
    intents: ["visual polish", "review ugly ui", "ui critique", "design review", "polish pass", "make it pretty"],
    summary: "Prompt an agent to inspect a rendered UI, name the ugliest visible issue, fix it, and verify again.",
    output_modes: ["agent_prompt", "review_checklist"],
    template: [
      "Review this visual surface and improve only what is needed to pass the perception gate.",
      "",
      "Target:",
      "<URL, app route, file path, screenshot, or component>",
      "",
      "Review Order:",
      "1. Inspect the rendered result before editing.",
      "2. Name the ugliest visible issue in plain language.",
      "3. Check composition, hierarchy, scale, spacing, color, typography, motion, sound, reference fidelity, and mobile fit.",
      "4. Patch the smallest visual/design changes that make the surface feel intentional.",
      "5. Re-check screenshots or interaction evidence before final.",
      "",
      "Constraints:",
      "- Preserve existing product behavior.",
      "- Use local assets and design tokens first.",
      "- Do not add packages, fetch media, call image/audio services, or use copyrighted assets without approval.",
      "- Treat APCA/WCAG 3 contrast notes as watchlist guidance, not final compliance requirements.",
      "",
      "Output:",
      "- Perception verdict.",
      "- Ugliest issue found and how it changed.",
      "- Verification evidence.",
      "- Remaining polish or accessibility risk."
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
      "- Pass a perception gate before final: first-screen composition, hierarchy, scale, spacing, color harmony, motion, and reference-style fidelity must look intentionally polished.",
      "- Anchor visual/reward effects to the relevant user action or game event; avoid disconnected center flashes unless the center is the event.",
      "- Keep sound effects short, pleasant, throttled, and muteable when audio is included.",
      "- Verify with browser screenshots after implementation.",
      "",
      "Output:",
      "- Implemented UI.",
      "- Local URL or file path.",
      "- Perception verdict and verification notes."
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
    id: "source-intake",
    title: "Source Intake Prompt",
    intents: ["source radar", "source intake", "research layer", "benchmark evidence"],
    summary: "Prompt an agent to decide whether an upstream source belongs in vnem without copying long docs or promoting unreviewed claims.",
    output_modes: ["source_review", "intake_plan"],
    template: [
      "Review this source for possible vnem intake.",
      "",
      "Source:",
      "<URL, repository, docs page, registry feed, benchmark, or MCP server>",
      "",
      "Decision criteria:",
      "- What agent decision does this source improve?",
      "- Is it official, canonical, vendor-maintained, or high-signal?",
      "- What license, permissions, install, data, or mutation risks are visible?",
      "- Is there a lightweight verification path such as link check, smoke test, fixture, or before/after recommendation diff?",
      "",
      "Rules:",
      "- Preserve source URLs and write original summaries.",
      "- Do not copy long upstream documentation into vnem.",
      "- Do not promote trust beyond the evidence.",
      "",
      "Output:",
      "- Source candidate.",
      "- Why it matters.",
      "- Trust and risk.",
      "- Smallest artifact to update.",
      "- Verification needed."
    ].join("\n")
  },
  {
    id: "zero-trust-gateway-roadmap",
    title: "Zero-Trust Gateway Roadmap Prompt",
    intents: ["pre execution gateway", "zero trust gateway", "tool pinning", "package firewall", "ast indexer"],
    summary: "Prompt for turning an ambitious agent-runtime security idea into phased read-only guidance, advisory checks, and deferred runtime scope.",
    output_modes: ["phased_plan", "risk_register", "verification_gates"],
    template: [
      "Review this agentic security proposal for vnem.",
      "",
      "Proposal:",
      "<gateway, tool pinning, package firewall, command policy, secret redaction, or AST index idea>",
      "",
      "Rules:",
      "- Keep the current vnem install pack read-only.",
      "- Separate guidance, advisory analysis, deterministic checks, and runtime enforcement.",
      "- Treat MCP tool annotations as risk hints, not security guarantees.",
      "- Require explicit approval before any tool install, config mutation, daemon, secret use, or external service call.",
      "",
      "Output:",
      "- Safe subset to add now.",
      "- Risky or blocked scope.",
      "- Phased implementation.",
      "- Required tests before enforcement.",
      "- Source anchors and unresolved assumptions."
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

  const sourceRadarDocs = sourceRadar.map((source) => ({
    id: `source:${source.id}`,
    kind: "source-radar",
    title: source.title,
    summary: source.summary,
    url_path: "/install/source-radar.json",
    trust_tier: "verified",
    type: "source-radar",
    score: source.priority === "critical" ? 17 : source.priority === "high" ? 14 : 10,
    tags: unique([source.category, source.priority, ...(source.use_when ?? [])]),
    use_cases: source.use_when,
    best_for: source.monitor,
    risk_flags: source.risk_checks,
    source_urls: unique([installFileUrl("source-radar.json"), ...(source.source_urls ?? [])]),
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

  const designArchitectureDocs = [
    {
      id: `design-architecture:${designArchitecture.id}`,
      kind: "design-architecture",
      title: designArchitecture.title,
      summary: designArchitecture.summary,
      url_path: designArchitecture.url_path,
      trust_tier: "verified",
      type: "design-architecture",
      score: 18,
      tags: designArchitecture.tags,
      use_cases: designArchitecture.sections.flatMap((section) => section.bullets),
      best_for: [
        "UI, game, dashboard, brand, animation, and conversational-agent visual work that must pass a perception gate.",
        "Tasks that need source-backed guidance for spacing, typography, motion, glass, dark mode, or visual verification."
      ],
      risk_flags: [],
      source_urls: unique([installFileUrl("design-architecture.md"), ...designArchitecture.source_urls]),
      keywords: unique(textTokens([
        designArchitecture.id,
        designArchitecture.title,
        designArchitecture.summary,
        ...designArchitecture.tags,
        ...designArchitecture.sections.flatMap((section) => [section.title, ...section.bullets]),
        ...designArchitecture.source_urls
      ].join(" "))).slice(0, 160)
    }
  ];

  const visualQaDocs = [
    {
      id: `visual-qa-protocol:${visualQaProtocol.id}`,
      kind: "visual-qa-protocol",
      title: visualQaProtocol.title,
      summary: visualQaProtocol.summary,
      url_path: visualQaProtocol.url_path,
      trust_tier: "verified",
      type: "visual-qa-protocol",
      score: 17,
      tags: visualQaProtocol.tags,
      use_cases: visualQaProtocol.sections.flatMap((section) => section.bullets),
      best_for: [
        "Rendered UI, game, dashboard, canvas, and brand-facing tasks that need screenshot or interaction evidence before final.",
        "Visual-polish reviews where the agent must name the ugliest visible issue, fix it, and re-check."
      ],
      risk_flags: [],
      source_urls: unique([
        installFileUrl("visual-qa-protocol.md"),
        installFileUrl("design-architecture.md"),
        ...designArchitecture.source_urls
      ]),
      keywords: unique(textTokens([
        visualQaProtocol.id,
        visualQaProtocol.title,
        visualQaProtocol.summary,
        ...visualQaProtocol.tags,
        ...visualQaProtocol.sections.flatMap((section) => [section.title, ...section.bullets])
      ].join(" "))).slice(0, 160)
    }
  ];

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

  return [...operatingDocs, ...sourceRadarDocs, ...designArchitectureDocs, ...visualQaDocs, ...rubricDocs, ...promptDocs, ...practiceDocs, ...entryDocs].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
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
    "- Perception gate: for UI, game, canvas, animation, or branded surfaces, screenshots and interaction moments must look intentionally polished before final.",
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
    "- Use `.vnem/design-architecture.md` for UI, game, visual polish, dashboard, motion, sound, and conversational-agent surfaces.",
    "- Use `.vnem/visual-qa-protocol.md` when the work has a rendered surface that needs screenshot, mobile, interaction, reward, or sound evidence.",
    "- Use `.vnem/search-index.json` to route intents and retrieve source-backed entries.",
    "- Use `.vnem/source-radar.json` when the task depends on current docs, upstream registries, benchmark evidence, or agent-client behavior.",
    "- Use `.vnem/best-practices.md` after routing, not as a wall of generic context.",
    "- Use `.vnem/agent-workspace.md` only for autonomous developer environment choices such as MCP gateways, memory files, agent clients, or mode systems.",
    ""
  ].join("\n");
}

function designArchitectureMarkdown() {
  return [
    "# vnem Design Architecture",
    "",
    `Generated: ${generatedAt}`,
    "",
    designArchitecture.summary,
    "",
    "## Safety Boundary",
    "",
    "- This file is read-only guidance.",
    "- Do not treat it as a UI library, style runtime, generated asset pack, or install recipe.",
    "- Use it only after task routing shows the work is visual, interactive, dashboard, agent UI, game, animation, or brand-facing.",
    "- Keep third-party assets, paid image/audio generation, remote media fetches, and design-system dependency changes behind explicit user approval.",
    "",
    "## Source Posture",
    "",
    "- Hard guidance is grounded in current browser and accessibility sources such as MDN CSS, Web Audio, reduced-motion media queries, and W3C WCAG 2.2.",
    "- WCAG 3 and APCA-style contrast work are watchlist/directional only in this pack; do not present them as final normative requirements.",
    "- The user-provided UI research is directional input, not source-backed benchmark evidence.",
    "",
    "## Guidance Classification",
    "",
    ...Object.entries(designArchitecture.guidance_classification).flatMap(([kind, items]) => [
      `### ${kind.replaceAll("_", " ")}`,
      "",
      ...items.map((item) => `- ${item}`),
      ""
    ]),
    ...designArchitecture.sections.flatMap((section) => [
      `## ${section.title}`,
      "",
      ...section.bullets.map((item) => `- ${item}`),
      ""
    ]),
    "## Source URLs",
    "",
    ...designArchitecture.source_urls.map((url) => `- ${url}`),
    ""
  ].join("\n");
}

function visualQaProtocolMarkdown() {
  return [
    "# vnem Visual QA Protocol",
    "",
    `Generated: ${generatedAt}`,
    "",
    visualQaProtocol.summary,
    "",
    "## Safety Boundary",
    "",
    "- This file is read-only guidance.",
    "- Do not treat it as a browser automation script, screenshot daemon, design runtime, generated asset pack, or install recipe.",
    "- Use it only when the task has a visible, interactive, motion, sound, dashboard, canvas, or brand-facing surface.",
    "- Ask before fetching remote assets, calling generation services, adding UI dependencies, changing client config, or using copyrighted media.",
    "",
    "## Verdicts",
    "",
    "- `ship-quality`: rendered evidence shows a polished, proportional, readable, responsive first screen and key interaction.",
    "- `needs-polish`: the behavior works, but the visible surface still has fixable aesthetic, scale, spacing, motion, sound, or reference-fidelity issues.",
    "- `blocked`: evidence cannot be gathered or the visible result has obvious ugliness, unreadable text, oversized surfaces, broken mobile fit, noisy effects, or inaccessible motion/audio.",
    "",
    ...visualQaProtocol.sections.flatMap((section) => [
      `## ${section.title}`,
      "",
      ...section.bullets.map((item) => `- ${item}`),
      ""
    ]),
    "## Related Files",
    "",
    "- `.vnem/design-architecture.md`: source-backed design architecture and guidance classification.",
    "- `.vnem/operating-protocol.md`: universal Sense -> Route -> Choose -> Constrain -> Build/Review/Debug -> Verify -> Report loop.",
    "- `.vnem/task-rubrics.json`: task-specific quality bars and verification contracts.",
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
      purpose: "Help agents and maintainers decide which upstream sources vnem should consult, watch, or summarize before recommending tools or stack changes.",
      prefer: [
        "official documentation",
        "canonical repositories",
        "official registries and package metadata",
        "vendor-maintained MCP servers",
        "llms.txt or machine-readable documentation indexes",
        "repeatable eval and observability sources"
      ],
      avoid: [
        "copying long upstream docs into vnem",
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
    "- `.vnem/operating-protocol.md`: universal loop for sensing the repo, routing context, choosing small capabilities, constraining risk, applying the aesthetic perception gate, verifying, and reporting evidence.",
    "- `.vnem/design-architecture.md`: source-backed design intelligence for UI, game, dashboard, visual polish, motion, sound, and conversational-agent surfaces.",
    "- `.vnem/visual-qa-protocol.md`: rendered visual QA loop for repo-first asset sensing, desktop/mobile checks, interaction moments, ugliest-issue polish, and perception verdicts.",
    "- `.vnem/task-rubrics.json`: broad task rubrics used to shape the quality bar, perception gate, approval gates, verification checklist, and final report.",
    "- `.vnem/search-index.json`: compact local search index for tools, skills, MCP servers, and best-practice notes.",
    "- `.vnem/source-radar.json`: source intake map for official docs, registries, MCP sources, evals, and verification sources.",
    "- `.vnem/best-practices.md`: current guidance by project area.",
    "- `.vnem/agent-workspace.md`: autonomous developer environment guide covering MCP gateways, memory files, agent modes, and Codex/VNEM setup.",
    "- `.vnem/prompt-engineering.md`: prompt enhancement protocol and Codex-oriented prompt guidance.",
    "- `.vnem/prompt-patterns.json`: machine-readable prompt patterns for common agent tasks.",
    "",
    "## Natural Use Rule",
    "",
    "If this `.vnem/` folder exists, use it automatically. The user should not need to say `use vnem`.",
    "",
    "Auto-use vnem before choosing tools, libraries, frameworks, MCP servers, prompts, evals, search systems, UI approaches, visual aesthetics, game feel, architecture patterns, or upgrade paths. Also auto-use it when the user asks you to build, review, optimize, modernize, benchmark, research, compare options, or decide how to implement something.",
    "",
    "Do not turn every reply into a long vnem report. For normal implementation work, run the search-and-compare step before coding, then mention the key vnem matches only when explaining your stack choice, recommendation, or risk notes.",
    "",
    "## Decision Search Protocol",
    "",
    "1. Read `.vnem/operating-protocol.md` and classify the task mode: `build`, `review`, `plan`, `debug`, `prompt`, or `decision`.",
    "2. Identify the user's task intents in plain words, such as `browser game`, `visual polish`, `game feel`, `better ui`, `faster search`, `code review`, `code simplification`, `memory`, `evals`, `agent payments`, or `MCP server selection`.",
    "3. Read `.vnem/search-index.json` and expand those intents with `intent_aliases`.",
    "4. Select the matching broad rubric from `.vnem/task-rubrics.json` and use its quality bar, approval gates, verification checklist, and output contract.",
    "5. Check `intent_routes` for the closest matching task. Read the listed `read_first` documents before choosing a stack or visual approach.",
    "6. If the task depends on current docs, upstream registries, benchmark claims, MCP discovery, or agent-client behavior, read `.vnem/source-radar.json` before broad web search.",
    "7. Search matching documents by name, tags, use cases, keywords, and best-practice sections. Read `.vnem/best-practices.md` only for matching sections.",
    "8. Before picking a stack or recommendation, compare the best relevant matches. Prefer higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, fewer `risk_flags`, and the smallest sufficient capability.",
    "9. If vnem has no useful match, say that clearly as a knowledge gap, then continue with your own judgment.",
    "10. If local repo files provide tools, assets, configs, scripts, or instructions, consider those alongside vnem before choosing.",
    "",
    "For nontrivial tasks, follow a compact task contract: `mode`, `intent`, `rubric`, `read first`, `smallest sufficient capability`, `approval gates`, `perception gate` when visual work is involved, `verification`, and `final report`.",
    "",
    "For UI, game, canvas, animation, dashboard, conversational-agent, or branded surfaces, read `.vnem/design-architecture.md` and `.vnem/visual-qa-protocol.md`, then follow the perception gate: inspect the actual rendered result, name and fix the ugliest visible issue, verify reward effects follow the user action or game event, and do not deliver if it does not look intentionally polished.",
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
    "Use `.vnem/source-radar.json` when workspace choices depend on current agent-client docs, MCP registry behavior, browser verification tooling, sensitive connectors, or benchmark/eval sources.",
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
    "## Zero-Trust Gateway Readiness",
    "",
    "Keep gateway-security ideas advisory until they have a threat model and tests. Tool annotations, schema hashes, path policy, secret redaction, package review, and AST indexing are useful controls, but the read-only vnem pack should not become a shell proxy, package installer, daemon, or enforcement runtime.",
    "",
    "For phased runtime-security planning, read the source-radar `agentic-gateway-security` entry and the root `SECURITY-ROADMAP.md` in this repository when available.",
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
    "Before choosing tools, libraries, frameworks, MCP servers, skills, prompts, evals, search systems, UI approaches, visual polish/game feel, architecture patterns, or upgrade paths, read `.vnem/AGENTS.md`, follow `.vnem/operating-protocol.md`, use `.vnem/search-index.json`, read `.vnem/design-architecture.md` and `.vnem/visual-qa-protocol.md` for visual surfaces, and consult `.vnem/agent-workspace.md` only for autonomous developer environment decisions.",
    "For current docs, MCP discovery, benchmark evidence, or upstream source decisions, also use `.vnem/source-radar.json` before broad web search.",
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
    design_architecture: {
      id: designArchitecture.id,
      title: designArchitecture.title,
      summary: designArchitecture.summary,
      url_path: designArchitecture.url_path,
      resource_uri: designArchitecture.resource_uri,
      source_urls: designArchitecture.source_urls,
      guidance_classification: designArchitecture.guidance_classification
    },
    visual_qa_protocol: {
      id: visualQaProtocol.id,
      title: visualQaProtocol.title,
      summary: visualQaProtocol.summary,
      url_path: visualQaProtocol.url_path,
      resource_uri: visualQaProtocol.resource_uri
    },
    source_radar: sourceRadar,
    source_radar_url: installFileUrl("source-radar.json"),
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
        "perception_gate",
        "perception_gate.repo_sensing",
        "verification",
        "final_report"
      ],
      read_first_for_build_tasks: ["operating protocol", "matching task rubric", "matching intent_routes", "design architecture and visual QA protocol when the task is visual or interactive", "matching best-practice documents", "matching source-radar entries when upstream currency matters", "high-signal registry entries", "prompt patterns only when a prompt artifact is requested"],
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
  design_architecture: searchIndex.design_architecture,
  visual_qa_protocol: searchIndex.visual_qa_protocol,
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
  "Installed files: .vnem/AGENTS.md, .vnem/operating-protocol.md, .vnem/design-architecture.md, .vnem/visual-qa-protocol.md, .vnem/task-rubrics.json, .vnem/search-index.json, .vnem/source-radar.json, .vnem/best-practices.md, .vnem/agent-workspace.md, .vnem/prompt-engineering.md, .vnem/prompt-patterns.json",
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
const designArchitectureMarkdownData = designArchitectureMarkdown();
const visualQaProtocolMarkdownData = visualQaProtocolMarkdown();
const taskRubricData = taskRubricsJson();
const sourceRadarData = sourceRadarJson();
const promptPatternData = promptPatternsJson();
const promptEngineering = promptEngineeringMarkdown(promptPatternData);
const agentWorkspace = agentWorkspaceMarkdown();
const agentInstructions = agentsMarkdown();
const rootAgentInstructions = rootAgentsMarkdown();
const archive = installArchive({
  "AGENTS.md": `${rootAgentInstructions}\n`,
  [`${installFolder}/AGENTS.md`]: `${agentInstructions}\n`,
  [`${installFolder}/operating-protocol.md`]: `${operatingProtocolMarkdownData}\n`,
  [`${installFolder}/design-architecture.md`]: `${designArchitectureMarkdownData}\n`,
  [`${installFolder}/visual-qa-protocol.md`]: `${visualQaProtocolMarkdownData}\n`,
  [`${installFolder}/task-rubrics.json`]: jsonText(taskRubricData),
  [`${installFolder}/search-index.json`]: jsonText(searchIndex),
  [`${installFolder}/source-radar.json`]: jsonText(sourceRadarData),
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
await writeJson(path.join(ROOT, "public", "install", "source-radar.json"), sourceRadarData);
await writeJson(path.join(ROOT, installFolder, "source-radar.json"), sourceRadarData);
await writeJson(path.join(ROOT, "public", "install", "prompt-patterns.json"), promptPatternData);
await writeJson(path.join(ROOT, installFolder, "prompt-patterns.json"), promptPatternData);
await writeBytes(path.join(ROOT, "public", installArchiveName), archive);
await writeText(path.join(ROOT, "public", "install", "AGENTS.md"), `${agentInstructions}\n`);
await writeText(path.join(ROOT, installFolder, "AGENTS.md"), `${agentInstructions}\n`);
await writeText(path.join(ROOT, "public", "install", "operating-protocol.md"), `${operatingProtocolMarkdownData}\n`);
await writeText(path.join(ROOT, installFolder, "operating-protocol.md"), `${operatingProtocolMarkdownData}\n`);
await writeText(path.join(ROOT, "public", "install", "design-architecture.md"), `${designArchitectureMarkdownData}\n`);
await writeText(path.join(ROOT, installFolder, "design-architecture.md"), `${designArchitectureMarkdownData}\n`);
await writeText(path.join(ROOT, "public", "install", "visual-qa-protocol.md"), `${visualQaProtocolMarkdownData}\n`);
await writeText(path.join(ROOT, installFolder, "visual-qa-protocol.md"), `${visualQaProtocolMarkdownData}\n`);
await writeText(path.join(ROOT, "public", "install", "best-practices.md"), `${bestPractices}\n`);
await writeText(path.join(ROOT, installFolder, "best-practices.md"), `${bestPractices}\n`);
await writeText(path.join(ROOT, "public", "install", "agent-workspace.md"), `${agentWorkspace}\n`);
await writeText(path.join(ROOT, installFolder, "agent-workspace.md"), `${agentWorkspace}\n`);
await writeText(path.join(ROOT, "public", "install", "prompt-engineering.md"), `${promptEngineering}\n`);
await writeText(path.join(ROOT, installFolder, "prompt-engineering.md"), `${promptEngineering}\n`);
await writeText(path.join(ROOT, "llms.txt"), `${llmsTxt}\n`);
await writeText(path.join(ROOT, "llms-full.txt"), `${llmsFull}\n`);

console.log(`Generated LLM/API/install artifacts for ${entries.length} entries and ${searchIndex.documents.length} search documents.`);
