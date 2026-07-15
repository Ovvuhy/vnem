import path from "node:path";
import { readFile } from "node:fs/promises";
import { ROOT, publicEntry, readEntries, uniqueSorted, writeBytes, writeJson } from "./lib/registry.mjs";
import { buildInstallAdoptionFiles } from "./vnem-install-adoption.mjs";
import { buildDailyDigest, latestCandidateReport } from "./vnem/generation/daily-digest.mjs";
import {
  buildGeneratedArtifactManifest,
  createDeterministicTarGzip,
  resolveGenerationClock
} from "./vnem/generation/generated-artifacts.mjs";

const generationMetadata = JSON.parse(await readFile(path.join(ROOT, "generation", "metadata.json"), "utf8"));
const records = await readEntries();
const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
const generationClock = resolveGenerationClock({ sourceDateEpoch, semanticTimestamp: generationMetadata.semantic_timestamp });
const generatedAt = generationClock.iso;
const generationNowMs = generationClock.date.getTime();
const generatedDate = generatedAt.slice(0, 10);
const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
const packageVersion = packageJson.version;
const releaseVersion = packageVersion;
const releaseDate = generatedDate;
const installFolder = ".vnem";
const installArchiveName = "install.tgz";
const defaultInstallBaseUrl = "https://raw.githubusercontent.com/Ovvuhy/vnem/main/public";
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
  "holistic excellence": ["quality gate", "triple check", "production ready", "performance visuals", "playability", "accessibility", "maintainability", "safety", "balanced quality", "ai booster"],
  "triple check": ["analyze architect review", "quality gate", "analyze", "architect", "review", "before code", "preflight", "final review"],
  "performance visuals": ["performance and visuals", "fast and beautiful", "fps visual quality", "optimize visuals", "quality profiles", "settings gui", "adaptive effects"],
  playability: ["game feel", "controls", "input feedback", "reward feedback", "level design", "physics", "sound design", "responsive game"],
  "quality gate": ["holistic excellence", "production ready", "domain balance", "triple check", "quality floor", "ship quality", "review before final"],
  "production ready": ["ship quality", "quality gate", "professional code", "performance", "visual polish", "accessibility", "maintainability", "verification"],
  "settings gui": ["quality profiles", "settings panel", "graphics settings", "performance mode", "high quality mode", "adaptive quality", "toggles"],
  "intelligent tradeoff": ["trade off", "performance conflict", "avoid degrading visuals", "settings gui", "quality profiles", "progressive enhancement", "fallback path"],
  "multi agent orchestration": ["multi-agent", "orchestration", "agent team", "subagents", "orchestrator worker", "split and merge", "reflection loop", "shared state", "magentic coding"],
  "orchestrator worker": ["orchestrator-workers", "manager agent", "lead architect", "worker agents", "delegation", "task graph", "agent as tool", "specialist agents"],
  "split and merge": ["split-and-merge", "parallel research", "research strands", "source verifier", "synthesis agent", "fan out", "merge findings"],
  "reflection loop": ["evaluator optimizer", "planner generator evaluator", "generator evaluator", "critique loop", "max iterations", "quality metrics"],
  "magentic coding": ["multi-agent coding", "lead architect", "ui agent", "logic agent", "integration agent", "qa agent", "shared state", "worker claim"],
  "shared state": ["agent memory", "task claims", "worker reports", "state events", "coordination log", "artifact log", "handoff"],
  "precision execution": ["surgical patch", "dynamic documentation", "stateful terminal", "safe terminal", "exact patch", "destructive editing", "knowledge decay"],
  "surgical patch": ["apply diff patch", "search replace", "unified diff", "exact match", "atomic write", "small diff", "scalpel"],
  "apply diff patch": ["mcp_apply_diff_patch", "unified diff", "search replace", "exact match", "patch rejection", "safe edit"],
  "dynamic documentation": ["fetch documentation", "mcp_fetch_documentation", "current docs", "live docs", "framework syntax", "knowledge decay"],
  "fetch documentation": ["dynamic documentation", "official docs", "markdown docs", "context injection", "read before write", "source-backed code"],
  "stateful terminal": ["mcp_execute_terminal_command", "safe terminal", "build test check", "stdout stderr", "timeout", "stateful cwd"],
  "safe terminal": ["stateful terminal", "sandboxed command", "allowlist", "timeout", "stdout", "stderr", "non-interactive"],
  "destructive editing": ["full file rewrite", "truncate file", "surgical patch", "exact match", "patch rejection", "atomic write"],
  "semantic code search": ["mcp_semantic_code_search", "local rag", "codebase embeddings", "code search", "concept search", "file discovery", "scale blindness"],
  "local rag": ["semantic code search", "codebase embeddings", "local vector index", "private embeddings", "retrieval", "code search"],
  "codebase embeddings": ["semantic code search", "local rag", "hashed vectors", "vector database", "code chunks", "workspace index"],
  "proof engine": ["self healing", "verification tests", "test driven", "tdd", "healing loop", "silent logic failure", "mcp_run_verification_tests"],
  "self healing": ["proof engine", "healing loop", "verification tests", "red green", "test first", "repair loop"],
  "verification tests": ["mcp_run_verification_tests", "proof engine", "test first", "healing loop", "red green", "unit test", "integration test"],
  "healing loop": ["proof engine", "self healing", "verification tests", "max attempts", "test patch retest", "silent logic failure"],
  "ephemeral scripting": ["mcp_execute_ephemeral_script", "dynamic tool generation", "temporary script", "sandbox", "one off parser", "bulk transform"],
  "dynamic tool generation": ["ephemeral scripting", "temporary script", "ad hoc tool", "roadblock parser", "local script", "sandboxed helper"],
  "scale blindness": ["semantic code search", "local rag", "codebase embeddings", "massive codebase", "file discovery", "context collapse"],
  "silent logic failure": ["proof engine", "verification tests", "self healing", "test first", "healing loop", "regression test"],
  "install vnem": ["download vnem", "setup vnem", "install pack", "curl install", "repo install", "managed agents", "doctor"],
  "download vnem": ["install vnem", "install archive", "install.tgz", "curl tar", "powershell download", "safe archive"],
  "mcp setup": ["vnem mcp", "mcp config", "mcp json", "stdio server", "claude mcp", "codex mcp", "connect mcp"],
  "mcp config": ["mcp setup", "mcp json", "stdio config", "client config", "vnem mcp-config", "claude add-json"],
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
  "cloudflare control": ["Cloudflare", "Wrangler", "Pages deploy", "Workers deploy", "DNS management", "cache purge", "rollback", "env secrets", "approval gates", "evidence pack", "reliability labels", "action recovery"],
  "deployment": ["deploy", "release", "Cloudflare", "Pages", "Workers", "rollback", "cache purge", "verification"],
  "pre execution gateway": ["zero trust gateway", "agent gateway", "tool firewall", "command risk", "alignment barrier", "path confinement", "secret redaction"],
  "zero trust gateway": ["pre execution gateway", "tool pinning", "schema hashing", "mcp rug pull", "tool poisoning", "read only hint", "destructive hint"],
  "tool pinning": ["schema hash", "tool schema", "mcp rug pull", "tool poisoning", "tools/list_changed", "tool annotations", "tool metadata"],
  "package firewall": ["dependency firewall", "package risk", "typosquatting", "dependency install", "npm package", "cargo package", "package metadata"],
  "ast indexer": ["tree-sitter", "code graph", "codebase graph", "structural index", "symbol graph", "imports", "call graph", "soft delete"],
  "coding task": ["implementation", "feature", "bug fix", "web app", "app build", "repo understanding", "tests", "verification", "plan first", "code quality"],
  "app build": ["build app", "application", "web app", "frontend", "backend", "full stack", "feature build", "implementation", "tests", "local verification"],
  "web app": ["frontend app", "react app", "vite app", "next app", "dashboard", "landing page", "api integration", "responsive", "browser verification"],
  "feature build": ["implement feature", "add feature", "new feature", "application code", "small diff", "tests", "acceptance criteria"],
  "bug fix": ["debug", "fix bug", "failing test", "regression", "root cause", "reproduce", "patch", "verify fix"],
  "failure recovery": ["failed command", "retry", "sandbox", "eperm", "network error", "permission", "blocked", "missing dependency", "bad path", "stale cache"],
  "root cause": ["bug fix", "debug", "failing test", "regression", "reproduce", "trace", "smallest patch"],
  "test first": ["tests", "tdd", "verification first", "acceptance criteria", "unit test", "integration test", "screenshot", "fixture"],
  "repo understanding": ["codebase understanding", "trace flow", "architecture map", "entrypoint", "call graph", "manifest", "existing pattern"],
  "large change": ["migration", "refactor", "multi file", "plan first", "checkpoint", "acceptance criteria", "incremental implementation", "reviewable diff"],
  "backend api": ["backend", "api", "database", "server", "runtime", "deployment"],
  security: ["security", "trust", "identity", "compliance", "guardrails", "audit"],
  "coding agents": ["coding-agent", "codebase", "repository", "diff", "terminal", "tests", "pull request", "plan first", "verification loop"],
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
  "code simplification": ["simplify", "simplify code", "simplify duplicate", "duplicate code", "duplicate helper", "deduplicate", "refactor", "minimalism", "code quality", "dead code", "duplication", "complexity", "tests", "ast-grep", "knip", "jscpd"],
  "code compaction": ["simplify code", "reduce code", "minimal code", "dead code", "duplication", "behavior preserving", "refactor"],
  "minimal code": ["minimalism", "simple design", "small API", "refactor", "remove duplication", "delete dead code", "feature preservation"],
  "professional code": ["code quality", "maintainability", "clarity", "refactor", "tests", "lint", "style guide", "review"],
  refactor: ["behavior preserving", "small steps", "tests", "code review", "simplify code", "ast-grep", "codemod"],
  "dead code": ["unused exports", "unused files", "unused dependencies", "knip", "dependency audit", "delete code"]
};

const intentRoutes = {
  "holistic excellence": {
    read_first: ["quality-contract:vnem-quality-contract", "practice:holistic-excellence-intelligent-tradeoffs", "coding-protocol:vnem-coding-protocol", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:agentic-coding-execution", "practice:evals"],
    compare_options: ["balanced implementation", "quality profile controls", "progressive enhancement", "adaptive rendering/effects", "scoped fallback with evidence"],
    choose_by: ["no important domain silently regresses", "performance and visuals/playability are both preserved when relevant", "trade-offs are explicit and controllable", "verification covers every detected domain"],
    report: ["detected quality domains", "triple-check result", "trade-off decision", "verification evidence"]
  },
  "triple check": {
    read_first: ["quality-contract:vnem-quality-contract", "practice:holistic-excellence-intelligent-tradeoffs", "operating-protocol:vnem-operating-loop", "coding-protocol:vnem-coding-protocol"],
    compare_options: ["Analyze goal and hidden requirements", "Architect balanced solution", "Review sacrificed domains before final"],
    choose_by: ["task goal clarity", "domain balance", "risk surface", "verification evidence"],
    report: ["Analyze", "Architect", "Review", "residual trade-offs"]
  },
  "performance visuals": {
    read_first: ["quality-contract:vnem-quality-contract", "practice:holistic-excellence-intelligent-tradeoffs", "design-architecture:vnem-design-architecture", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:frontend", "practice:browser-games"],
    compare_options: ["render-path optimization", "asset optimization", "adaptive effects", "quality profiles/settings GUI", "progressive enhancement", "fallback mode"],
    choose_by: ["measured or plausible bottleneck", "preserved first-screen quality", "preserved interaction/game feel", "user-controllable quality trade-off", "browser/device verification"],
    report: ["performance strategy", "visual/playability preservation", "settings or fallback", "verification evidence"]
  },
  playability: {
    read_first: ["quality-contract:vnem-quality-contract", "practice:holistic-excellence-intelligent-tradeoffs", "practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games"],
    compare_options: ["input responsiveness", "reward feedback", "sound and motion polish", "difficulty/restart loop", "performance profile"],
    choose_by: ["controls feel responsive", "feedback follows action", "game remains readable", "performance does not destroy visual/game feel", "mobile/touch path"],
    report: ["playability verdict", "interaction evidence", "performance/visual balance", "remaining feel risk"]
  },
  "quality gate": {
    read_first: ["quality-contract:vnem-quality-contract", "practice:holistic-excellence-intelligent-tradeoffs", "operating-protocol:vnem-operating-loop", "coding-protocol:vnem-coding-protocol", "visual-qa-protocol:vnem-visual-qa-protocol"],
    compare_options: ["pass", "needs targeted revision", "blocked until verification or approval"],
    choose_by: ["detected domains", "trade-off risks", "verification coverage", "approval gates", "user-visible quality floor"],
    report: ["quality gate verdict", "domains checked", "warnings", "required verification"]
  },
  "production ready": {
    read_first: ["quality-contract:vnem-quality-contract", "practice:holistic-excellence-intelligent-tradeoffs", "coding-protocol:vnem-coding-protocol", "coding-playbook:feature-slice", "practice:agentic-coding-execution", "practice:evals"],
    compare_options: ["small production slice", "settings/profile controls", "accessibility/performance pass", "test/eval gate", "defer risky scope"],
    choose_by: ["works end-to-end", "quality domains are balanced", "tests/build/rendered evidence exist", "risks are explicit", "rollback path"],
    report: ["production readiness verdict", "domains verified", "known limitations", "remaining approvals"]
  },
  "settings gui": {
    read_first: ["quality-contract:vnem-quality-contract", "practice:holistic-excellence-intelligent-tradeoffs", "practice:frontend", "design-architecture:vnem-design-architecture", "visual-qa-protocol:vnem-visual-qa-protocol"],
    compare_options: ["quality profile selector", "advanced settings panel", "adaptive auto mode", "reduced-motion/accessibility controls", "minimal fallback toggle"],
    choose_by: ["clear user control", "safe defaults", "preserved visual quality", "fast mode does not feel broken", "mobile usability"],
    report: ["settings surface", "default profile", "high-quality path", "fast/fallback path", "verification evidence"]
  },
  "intelligent tradeoff": {
    read_first: ["quality-contract:vnem-quality-contract", "practice:holistic-excellence-intelligent-tradeoffs", "operating-protocol:vnem-operating-loop", "practice:agentic-coding-execution", "practice:evals"],
    compare_options: ["optimize bottleneck", "add quality profiles", "progressive enhancement", "defer noncritical work", "explicit fallback with user control"],
    choose_by: ["constraint evidence", "preserved important domains", "user can choose quality/performance", "honest residual risk", "verification path"],
    report: ["constraint", "trade-off alternative", "domain preservation", "verification"]
  },
  "multi agent orchestration": {
    read_first: ["orchestration-protocol:vnem-orchestration-protocol", "practice:multi-agent-orchestration-reflection", "operating-protocol:vnem-operating-loop", "quality-contract:vnem-quality-contract", "practice:agentic-coding-execution", "practice:research-source-intake"],
    compare_options: ["single agent", "orchestrator-worker", "split-and-merge", "reflection loop", "shared-state handoff"],
    choose_by: ["task complexity", "context pressure", "independent subtask count", "verification criteria", "latency and cost overhead", "one owner for final synthesis"],
    report: ["selected pattern", "agent roles", "task graph", "reflection gate", "shared-state fields", "verification evidence"]
  },
  "orchestrator worker": {
    read_first: ["orchestration-protocol:vnem-orchestration-protocol", "practice:multi-agent-orchestration-reflection", "coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "quality-contract:vnem-quality-contract", "visual-qa-protocol:vnem-visual-qa-protocol"],
    compare_options: ["lead architect plus UI/logic/integration/QA workers", "single-agent implementation", "parallel read-only exploration then one diff owner"],
    choose_by: ["coding/app/game scope", "file ownership clarity", "worker independence", "integration risk", "quality gate coverage"],
    report: ["lead architect JSON task list", "worker claims", "shared-state reports", "integration owner", "QA verdict"]
  },
  "split and merge": {
    read_first: ["orchestration-protocol:vnem-orchestration-protocol", "practice:multi-agent-orchestration-reflection", "practice:research-source-intake", "source:mcp-core-and-registry", "practice:evals"],
    compare_options: ["parallel research strands", "single-agent source review", "source-verifier before synthesis", "follow-up research pass"],
    choose_by: ["independent source strands", "need for primary-source verification", "contradiction risk", "citation burden", "context-window pressure"],
    report: ["research strands", "sources verified", "contradictions", "synthesis confidence", "remaining uncertainty"]
  },
  "reflection loop": {
    read_first: ["orchestration-protocol:vnem-orchestration-protocol", "practice:multi-agent-orchestration-reflection", "quality-contract:vnem-quality-contract", "practice:agentic-coding-execution", "practice:evals"],
    compare_options: ["generator/evaluator loop", "single pass with checklist", "blocked escalation"],
    choose_by: ["clear evaluation criteria", "expected improvement from critique", "max three iterations", "schema-valid output", "verification evidence"],
    report: ["iteration count", "evaluator verdict", "required changes", "quality metrics", "remaining risk"]
  },
  "magentic coding": {
    read_first: ["orchestration-protocol:vnem-orchestration-protocol", "practice:multi-agent-orchestration-reflection", "coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "quality-contract:vnem-quality-contract", "design-architecture:vnem-design-architecture", "visual-qa-protocol:vnem-visual-qa-protocol"],
    compare_options: ["Lead Architect -> UI Agent -> Logic Agent -> Integration Agent -> QA Agent", "single-agent small slice", "read-only parallel exploration"],
    choose_by: ["web/app/game build scope", "visual and logic separation", "task dependencies", "file-surface ownership", "browser verification need"],
    report: ["project type", "agent task list", "claimed tasks", "artifacts", "perception gate", "quality gate"]
  },
  "shared state": {
    read_first: ["orchestration-protocol:vnem-orchestration-protocol", "practice:multi-agent-orchestration-reflection", "operating-protocol:vnem-operating-loop", "practice:persistent-memory-context-files"],
    compare_options: ["in-memory task state", "MCP resource snapshot", "versioned handoff file", "external memory store after approval"],
    choose_by: ["deterministic ordinals", "no secrets", "artifact traceability", "task ownership clarity", "client compatibility"],
    report: ["state schema", "claims", "reports", "decisions", "artifacts", "open blockers"]
  },
  "precision execution": {
    read_first: ["precision-execution-protocol:vnem-precision-execution-protocol", "coding-protocol:vnem-coding-protocol", "orchestration-protocol:vnem-orchestration-protocol", "practice:precision-execution-dynamic-knowledge", "source:agentic-gateway-security"],
    compare_options: ["read-only guidance only", "dry-run exact patch", "approved exact patch", "current documentation fetch", "safe build/test terminal check"],
    choose_by: ["smallest possible edit", "exact context verified", "current docs fetched before framework-specific code", "terminal command allowlisted", "rollback path clear"],
    report: ["precision mode used", "dry-run result", "documentation evidence", "terminal evidence", "residual mutation risk"]
  },
  "surgical patch": {
    read_first: ["precision-execution-protocol:vnem-precision-execution-protocol", "coding-protocol:vnem-coding-protocol", "practice:precision-execution-dynamic-knowledge"],
    compare_options: ["SEARCH/REPLACE exact block", "unified diff hunk", "manual review before apply", "blocked until context matches"],
    choose_by: ["SEARCH block has one exact match", "diff hunk context matches", "atomic write path stays inside workspace", "no broad file rewrite"],
    report: ["target file", "match count", "dry-run hash", "apply hash", "changed ranges"]
  },
  "apply diff patch": {
    read_first: ["precision-execution-protocol:vnem-precision-execution-protocol", "coding-protocol:vnem-coding-protocol", "practice:precision-execution-dynamic-knowledge"],
    compare_options: ["mcp_apply_diff_patch dry_run", "mcp_apply_diff_patch apply", "re-read and retry context", "blocked mismatch"],
    choose_by: ["target path confined", "exact context verified", "expected occurrence count", "user approval for non-dry-run"],
    report: ["patch tool", "dry-run status", "applied status", "sha256 before after", "error if mismatch"]
  },
  "dynamic documentation": {
    read_first: ["precision-execution-protocol:vnem-precision-execution-protocol", "source:agentic-coding-best-practices", "source:mcp-core-and-registry", "practice:research-source-intake"],
    compare_options: ["built-in docs route", "specific HTTPS docs URL", "local docs from repo", "block write until docs fetched"],
    choose_by: ["official source", "version/topic relevance", "fetched context injected before code", "no syntax from stale memory"],
    report: ["library", "docs URL", "fetched hash", "worker context injected", "remaining docs uncertainty"]
  },
  "fetch documentation": {
    read_first: ["precision-execution-protocol:vnem-precision-execution-protocol", "practice:precision-execution-dynamic-knowledge", "practice:research-source-intake"],
    compare_options: ["mcp_fetch_documentation", "repo-local docs", "manual source citation"],
    choose_by: ["source is HTTPS and official where possible", "topic matches code being written", "context block is compact enough for worker"],
    report: ["source URL", "topic", "fetch result", "context injection status"]
  },
  "stateful terminal": {
    read_first: ["precision-execution-protocol:vnem-precision-execution-protocol", "coding-protocol:vnem-coding-protocol", "practice:precision-execution-dynamic-knowledge"],
    compare_options: ["mcp_execute_terminal_command", "client-native terminal tool", "manual verification if command is unsafe"],
    choose_by: ["allowlisted command", "workspace-confined cwd", "timeout configured", "stdout/stderr captured"],
    report: ["command", "cwd", "exit code", "timeout", "stdout/stderr summary"]
  },
  "safe terminal": {
    read_first: ["precision-execution-protocol:vnem-precision-execution-protocol", "practice:precision-execution-dynamic-knowledge", "coding-protocol:vnem-coding-protocol"],
    compare_options: ["build command", "test command", "lint/typecheck command", "blocked destructive command"],
    choose_by: ["non-interactive", "single command", "no shell operators", "allowlisted script", "timeout evidence"],
    report: ["command safety decision", "result", "blocked reason if unsafe"]
  },
  "destructive editing": {
    read_first: ["precision-execution-protocol:vnem-precision-execution-protocol", "practice:precision-execution-dynamic-knowledge", "coding-protocol:vnem-coding-protocol"],
    compare_options: ["exact patch", "split smaller patch", "re-read target", "stop and ask"],
    choose_by: ["no whole-file rewrite", "no truncation risk", "diff scoped to intended function", "dry-run passes before apply"],
    report: ["edit risk", "chosen patch method", "verification", "remaining corruption risk"]
  },
  "semantic code search": {
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol", "practice:omniscient-context-self-healing", "precision-execution-protocol:vnem-precision-execution-protocol", "coding-protocol:vnem-coding-protocol"],
    compare_options: ["mcp_semantic_code_search", "ripgrep for exact strings", "manual file read after semantic target is found", "full code graph later if language-specific structure is required"],
    choose_by: ["query is conceptual rather than exact", "repo is large enough that manual traversal wastes context", "results return path, line numbers, snippets, and score", "index is local and private"],
    report: ["query", "top paths", "line ranges", "index freshness", "follow-up files read"]
  },
  "local rag": {
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol", "practice:omniscient-context-self-healing", "practice:context-engineering"],
    compare_options: ["local hashed-vector index", "SQLite/vector store", "external vector DB after approval", "plain lexical search"],
    choose_by: ["privacy", "index freshness", "latency", "dependency weight", "retrieval quality", "maintenance cost"],
    report: ["index engine", "external API use", "files/chunks indexed", "freshness behavior"]
  },
  "codebase embeddings": {
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol", "practice:omniscient-context-self-healing", "practice:context-engineering"],
    compare_options: ["deterministic local embeddings", "AST graph", "hybrid lexical-semantic search", "hosted embeddings after approval"],
    choose_by: ["no paid external API required", "workspace privacy preserved", "line-number snippets returned", "stale indexes detected"],
    report: ["embedding/storage method", "privacy boundary", "query quality", "staleness handling"]
  },
  "proof engine": {
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol", "practice:omniscient-context-self-healing", "coding-protocol:vnem-coding-protocol", "coding-playbook:test-first-evidence", "practice:evals"],
    compare_options: ["test-first red/green loop", "existing regression test", "focused build/typecheck", "manual verification if no test surface exists"],
    choose_by: ["test proves the requested behavior", "red phase fails before implementation when possible", "green phase passes after patch", "loop has max attempts and blocks honestly"],
    report: ["test written or selected", "red verdict", "green verdict", "attempt count", "remaining proof gap"]
  },
  "self healing": {
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol", "practice:omniscient-context-self-healing", "precision-execution-protocol:vnem-precision-execution-protocol", "practice:agentic-coding-execution"],
    compare_options: ["patch and rerun", "narrow failing test first", "semantic search before patching", "blocked after max attempts"],
    choose_by: ["failure output is actionable", "patch is surgical", "attempt limit prevents token burn", "human handoff includes concrete stdout/stderr"],
    report: ["healing status", "attempts", "patch evidence", "test output", "handoff if blocked"]
  },
  "verification tests": {
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol", "practice:omniscient-context-self-healing", "coding-playbook:test-first-evidence", "practice:evals"],
    compare_options: ["unit test", "integration test", "browser test", "static check", "existing project command"],
    choose_by: ["closest automated proof", "fast feedback", "low flake risk", "matches user-visible acceptance criteria"],
    report: ["command", "phase", "verdict", "stdout/stderr summary", "residual coverage risk"]
  },
  "healing loop": {
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol", "practice:omniscient-context-self-healing", "precision-execution-protocol:vnem-precision-execution-protocol"],
    compare_options: ["red -> patch -> green loop", "green-only regression repair", "blocked escalation"],
    choose_by: ["max five attempts", "smallest patch each time", "no silent pass without verification", "failure reason reported"],
    report: ["phase", "attempts", "current verdict", "next action", "blocked reason"]
  },
  "ephemeral scripting": {
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol", "practice:omniscient-context-self-healing", "practice:precision-execution-dynamic-knowledge"],
    compare_options: ["mcp_execute_ephemeral_script", "repo-native script after approval", "manual one-off command", "blocked when script needs unsafe APIs"],
    choose_by: ["temporary helper solves a concrete roadblock", "no permanent workspace clutter", "dangerous APIs are blocked", "stdout is sufficient evidence"],
    report: ["language", "sandbox cleanup", "stdout summary", "blocked risk if rejected"]
  },
  "dynamic tool generation": {
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol", "practice:omniscient-context-self-healing", "practice:mcp-server-selection"],
    compare_options: ["ephemeral script", "temporary fixture parser", "new durable tool after repeated need", "do not proceed when unsafe"],
    choose_by: ["roadblock is unique", "script is bounded and local", "no network/secrets/destructive API", "cleanup verified"],
    report: ["generated helper purpose", "execution result", "cleanup", "whether durable tooling is justified later"]
  },
  "scale blindness": {
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol", "practice:omniscient-context-self-healing", "coding-protocol:vnem-coding-protocol"],
    compare_options: ["semantic concept search", "code graph", "targeted rg", "manual architecture map"],
    choose_by: ["context saved", "retrieval precision", "index freshness", "line-number evidence"],
    report: ["search path", "files found", "context avoided", "next read targets"]
  },
  "silent logic failure": {
    read_first: ["omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol", "practice:omniscient-context-self-healing", "coding-playbook:test-first-evidence", "practice:evals"],
    compare_options: ["write failing test first", "reuse existing test", "property/fixture test", "browser interaction proof"],
    choose_by: ["test catches wrong behavior", "red phase observed", "green phase observed", "no success claim without proof"],
    report: ["failure prevented", "test evidence", "green proof", "remaining manual risk"]
  },
  "install vnem": {
    read_first: ["install-guide:vnem-install-guide", "operating-protocol:vnem-operating-loop", "quality-contract:vnem-quality-contract", "practice:codex-vnem-setup"],
    compare_options: ["archive install into a project", "local CLI managed install", "Claude/Codex agent instruction pointer", "MCP stdio server from checkout"],
    choose_by: ["fewest manual steps", "no destructive writes", "existing AGENTS.md preservation", "clear verification command", "MCP client compatibility"],
    report: ["install path chosen", "command used", "doctor result", "MCP config if requested"]
  },
  "download vnem": {
    read_first: ["install-guide:vnem-install-guide", "operating-protocol:vnem-operating-loop"],
    compare_options: ["curl archive", "PowerShell archive download", "local checkout CLI install"],
    choose_by: ["platform shell", "safe archive URL", "no pipe-to-shell", "clean extraction", "refresh path"],
    report: ["download command", "installed files", "verification command", "remaining platform risk"]
  },
  "mcp setup": {
    read_first: ["install-guide:vnem-install-guide", "practice:codex-vnem-setup", "practice:mcp-gateway-tool-routing", "source:mcp-core-and-registry"],
    compare_options: ["generic .mcp.json", "Claude Code add-json", "user-scoped MCP config", "project-scoped MCP config"],
    choose_by: ["local stdio support", "path correctness", "read-only safety", "team sharing needs", "client approval behavior"],
    report: ["MCP config JSON", "client command", "verification with vnem_status", "safety boundary"]
  },
  "mcp config": {
    read_first: ["install-guide:vnem-install-guide", "practice:codex-vnem-setup", "source:mcp-core-and-registry"],
    compare_options: ["full client config", "single-server JSON", "project .mcp.json", "user/client settings"],
    choose_by: ["client schema", "absolute path", "VNEM_ROOT env", "stdio transport", "read-only annotations"],
    report: ["config format", "server command", "verification command", "scope recommendation"]
  },
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
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas with Vite or a tiny static server", "Phaser", "PixiJS", "Excalibur", "KAPLAY", "Three.js", "Babylon.js", "PlayCanvas"],
    choose_by: ["2D or 3D gameplay", "asset loading and physics needs", "dependency budget", "input model", "aesthetic polish and game feel", "accessibility needs", "real-browser verification path"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "web game": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas with Vite for compact custom 2D", "Phaser for full 2D game framework needs", "PixiJS for rendering-heavy 2D", "Three.js/Babylon.js/PlayCanvas for true 3D"],
    choose_by: ["playability requirements", "rendering dimension", "engine structure needed", "browser support", "verification evidence"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "html5 game": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas", "Phaser", "PixiJS", "Excalibur", "KAPLAY"],
    choose_by: ["custom game feel", "scene and asset needs", "TypeScript preference", "prototype speed", "mobile/touch behavior"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "canvas game": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas with Vite or a tiny static server", "Phaser", "PixiJS", "Excalibur", "KAPLAY"],
    choose_by: ["custom game feel", "rendering complexity", "input model", "collision needs", "dependency budget", "canvas performance risk"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "2d game": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Canvas for tiny bespoke games", "Phaser for scenes/sprites/audio/cameras", "PixiJS for renderer-first interaction", "Excalibur for TypeScript-first 2D", "KAPLAY for fast prototypes"],
    choose_by: ["scene complexity", "sprite/asset pipeline", "physics needs", "typing preference", "prototype speed", "polish budget"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "3d game": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Three.js for custom 3D scenes", "Babylon.js for full 3D engine features", "PlayCanvas for browser-first 3D engine/editor workflows"],
    choose_by: ["3D scene complexity", "asset pipeline", "physics/XR needs", "WebGL/WebGPU support", "performance tooling"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "game engine": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["Phaser for full 2D game framework needs", "PixiJS for fast 2D rendering", "Excalibur for TypeScript-first 2D", "KAPLAY for quick playful 2D", "Three.js for custom 3D", "Babylon.js or PlayCanvas for full 3D engine workflows", "Canvas for compact custom 2D MVPs"],
    choose_by: ["engine features needed", "visual direction", "physics/audio/asset pipeline", "bundle size", "maintenance risk", "runtime verification path"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "game ui": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:browser-games", "practice:frontend", "practice:evals"],
    compare_options: ["in-canvas HUD", "DOM overlay UI", "engine UI primitives", "existing app design system"],
    choose_by: ["readability", "input method", "responsive scaling", "composition", "contrast", "feedback clarity", "game feel", "localization risk"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "game accessibility": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "practice:browser-games", "practice:frontend", "practice:evals"],
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
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:test-first-evidence", "coding-playbook:web-app-rendered-quality", "practice:browser-games", "practice:evals"],
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
  "coding task": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:feature-slice", "coding-playbook:failure-recovery", "operating-protocol:vnem-operating-loop", "practice:agentic-coding-execution", "practice:code-review", "practice:evals"],
    compare_options: ["small scoped patch", "plan-first implementation", "test-first fix", "repo-native refactor", "defer broad rewrite"],
    choose_by: ["acceptance criteria", "repo conventions", "existing patterns", "fast verification", "diff reviewability", "rollback path"],
    report: ["task contract", "files inspected", "implementation choice", "verification evidence", "residual risk"]
  },
  "app build": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:feature-slice", "coding-playbook:web-app-rendered-quality", "practice:agentic-coding-execution", "practice:frontend", "practice:backend", "practice:evals"],
    compare_options: ["existing app stack", "frontend-only implementation", "backend/API change", "full-stack slice", "prototype behind a narrow route"],
    choose_by: ["user workflow", "current manifests", "existing routes/components", "state/data needs", "test and browser verification path"],
    report: ["app slice built", "stack reused or changed", "verification evidence", "remaining product risk"]
  },
  "web app": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:web-app-rendered-quality", "coding-playbook:feature-slice", "practice:agentic-coding-execution", "practice:frontend", "design-architecture:vnem-design-architecture", "visual-qa-protocol:vnem-visual-qa-protocol", "practice:evals"],
    compare_options: ["existing framework route", "component-level implementation", "static Vite surface", "server/API-backed workflow", "dashboard or landing surface"],
    choose_by: ["current framework", "responsive fit", "accessibility", "browser verification", "visual polish", "dependency budget"],
    report: ["web surface changed", "framework/pattern reused", "browser evidence", "remaining responsive or polish risk"]
  },
  "feature build": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:feature-slice", "coding-playbook:test-first-evidence", "practice:agentic-coding-execution", "practice:code-review", "practice:evals"],
    compare_options: ["single-file patch", "small cross-module change", "new component/helper", "feature flag or isolated route", "defer architecture change"],
    choose_by: ["acceptance criteria", "minimal behavior surface", "existing tests", "local conventions", "reviewability"],
    report: ["feature behavior", "files changed", "checks run", "known edge cases"]
  },
  "bug fix": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:bug-root-cause", "coding-playbook:test-first-evidence", "coding-playbook:failure-recovery", "practice:agentic-coding-execution", "practice:code-review", "practice:evals"],
    compare_options: ["reproduce first", "add/adjust failing test", "small root-cause patch", "guardrail plus regression test", "defer speculative rewrite"],
    choose_by: ["reproduction evidence", "root cause", "narrowest patch", "regression coverage", "blast radius"],
    report: ["root cause", "fix", "regression evidence", "remaining uncertainty"]
  },
  "root cause": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:bug-root-cause", "coding-playbook:failure-recovery", "practice:agentic-coding-execution", "practice:code-review", "practice:evals"],
    compare_options: ["reproduce first", "trace call path", "isolate failing input", "smallest root-cause patch", "regression test"],
    choose_by: ["failure evidence", "call-path proof", "minimal patch", "regression coverage", "blast radius"],
    report: ["observed failure", "root cause", "fix", "verification evidence"]
  },
  "failure recovery": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:failure-recovery", "operating-protocol:vnem-operating-loop", "practice:agentic-coding-execution"],
    compare_options: ["permission retry with approval", "dependency setup", "path or quoting fix", "narrower command", "summarize constraints and restart slice"],
    choose_by: ["classified failure cause", "changed retry condition", "safety boundary", "original task relevance"],
    report: ["failure class", "changed strategy", "verification result", "remaining blocker"]
  },
  "test first": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:test-first-evidence", "practice:agentic-coding-execution", "practice:evals", "practice:code-review"],
    compare_options: ["unit test", "integration fixture", "browser/screenshot check", "golden snapshot", "manual smoke when automation is impossible"],
    choose_by: ["observable behavior", "speed", "flakiness risk", "coverage of acceptance criteria", "agent can rerun it"],
    report: ["verification target", "test or check added", "result", "uncovered risk"]
  },
  "repo understanding": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:review-risk-scan", "practice:agentic-coding-execution", "practice:code-review", "source:coding-agent-clients"],
    compare_options: ["manifest/config scan", "entrypoint trace", "request/data flow map", "component ownership map", "dependency risk pass"],
    choose_by: ["task relevance", "source proximity", "call-site evidence", "existing docs", "context budget"],
    report: ["current stack", "important files", "flow summary", "risks and unknowns"]
  },
  "large change": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:large-change-checkpoints", "coding-playbook:refactor-preserve", "practice:agentic-coding-execution", "practice:code-simplification", "practice:evals"],
    compare_options: ["split into checkpoints", "plan-only first", "codemod with review", "migration in slices", "defer until tests exist"],
    choose_by: ["blast radius", "test coverage", "rollback path", "API/data compatibility", "review and merge strategy"],
    report: ["implementation plan", "checkpoint order", "verification ladder", "approval gates"]
  },
  "backend api": {
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:api-data-contract", "coding-playbook:bug-root-cause", "practice:backend", "practice:security", "practice:evals"],
    compare_options: ["existing route/service pattern", "focused service-layer change", "contract-preserving API patch", "schema or migration behind approval", "defer external service wiring"],
    choose_by: ["current API contract", "validation and auth boundaries", "caller compatibility", "migration risk", "focused service tests"],
    report: ["contract changed or preserved", "auth/data risk", "verification evidence", "deployment or migration gates"]
  },
  "better ui": {
    read_first: ["practice:visual-experience", "visual-qa-protocol:vnem-visual-qa-protocol", "design-architecture:vnem-design-architecture", "practice:frontend", "practice:context-engineering", "practice:evals"],
    compare_options: ["existing project design system", "mature UI primitives", "custom CSS only when scope is tiny"],
    choose_by: ["workflow fit", "first-screen composition", "aesthetic polish", "accessibility", "responsive verification", "dependency budget"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "code simplification": {
    read_first: ["practice:code-simplification", "coding-protocol:vnem-coding-protocol", "coding-playbook:refactor-preserve", "practice:code-review", "practice:evals"],
    compare_options: ["behavior-preserving refactor", "dead-code audit", "duplicate-code audit", "AST-aware codemods", "repo-native lint and format rules"],
    choose_by: ["language and framework", "test coverage", "public API stability", "blast radius", "reviewability", "tool permission risk"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "code compaction": {
    read_first: ["practice:code-simplification", "coding-protocol:vnem-coding-protocol", "coding-playbook:refactor-preserve", "practice:code-review", "practice:evals"],
    compare_options: ["delete unreachable code", "collapse duplication", "extract only proven shared concepts", "replace custom code with existing local helpers", "defer dependency changes until justified"],
    choose_by: ["feature preservation evidence", "test coverage", "runtime behavior", "readability after change", "diff size"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "minimal code": {
    read_first: ["practice:code-simplification", "coding-protocol:vnem-coding-protocol", "coding-playbook:refactor-preserve", "practice:code-review", "practice:evals"],
    compare_options: ["delete proven waste", "reuse existing helpers", "collapse duplication", "defer abstractions"],
    choose_by: ["behavior preservation", "public API stability", "test evidence", "reviewability"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "professional code": {
    read_first: ["practice:code-simplification", "coding-protocol:vnem-coding-protocol", "coding-playbook:refactor-preserve", "coding-playbook:review-risk-scan", "practice:code-review", "practice:evals"],
    compare_options: ["small behavior-preserving refactor", "dependency audit", "dead-code cleanup", "repo-native conventions"],
    choose_by: ["maintainability", "behavior evidence", "team conventions", "test coverage"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  refactor: {
    read_first: ["practice:code-simplification", "coding-protocol:vnem-coding-protocol", "coding-playbook:refactor-preserve", "practice:code-review", "practice:evals"],
    compare_options: ["small manual refactor", "AST-aware codemod", "dead-code audit", "duplicate-code cleanup"],
    choose_by: ["blast radius", "test coverage", "public API stability", "call-site count"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  },
  "dead code": {
    read_first: ["practice:code-simplification", "coding-protocol:vnem-coding-protocol", "coding-playbook:refactor-preserve", "practice:code-review", "practice:evals"],
    compare_options: ["lexical search", "unused export checks", "dependency checks", "duplicate-code checks"],
    choose_by: ["static evidence", "runtime reachability", "test coverage", "delete safety"],
    report: ["vnem intents searched", "top matches", "choice", "why"]
  }
};

const codingAgentSourceUrls = [
  "https://www.anthropic.com/engineering/claude-code-best-practices",
  "https://openai.com/business/guides-and-resources/how-openai-uses-codex/",
  "https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results",
  "https://docs.github.com/en/copilot/concepts/prompting/response-customization",
  "https://code.visualstudio.com/docs/copilot/customization/custom-instructions",
  "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
  "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/auto-memory.md",
  "https://docs.cursor.com/context/rules-for-ai",
  "https://www.anthropic.com/engineering/writing-tools-for-agents",
  "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
  "https://www.anthropic.com/engineering/building-effective-agents",
  "https://developers.openai.com/api/docs/guides/agent-evals"
];

const qualitySourceUrls = unique([
  "https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/",
  "https://modelcontextprotocol.io/specification/2025-11-25/schema",
  "https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/",
  "https://www.anthropic.com/engineering/writing-tools-for-agents",
  "https://code.claude.com/docs/en/best-practices",
  "https://openai.com/index/introducing-codex/",
  "https://www.anthropic.com/engineering/building-effective-agents",
  ...codingAgentSourceUrls
]);

const orchestrationSourceUrls = unique([
  "https://www.anthropic.com/engineering/building-effective-agents",
  "https://www.anthropic.com/engineering/multi-agent-research-system",
  "https://www.anthropic.com/engineering/writing-tools-for-agents",
  "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
  "https://openai.github.io/openai-agents-python/multi_agent/",
  "https://openai.github.io/openai-agents-python/guardrails/",
  "https://modelcontextprotocol.io/specification/2025-11-25/schema",
  "https://modelcontextprotocol.io/specification/2025-06-18/server/tools",
  "https://modelcontextprotocol.io/specification/2025-06-18/server/resources"
]);

const precisionSourceUrls = unique([
  "https://modelcontextprotocol.io/specification/2025-11-25/schema",
  "https://modelcontextprotocol.io/specification/2025-06-18/server/tools",
  "https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/",
  "https://www.anthropic.com/engineering/writing-tools-for-agents",
  "https://code.claude.com/docs/en/best-practices",
  "https://developers.openai.com/codex/guides/agents-md",
  "https://context7.com/",
  ...codingAgentSourceUrls
]);

const omniscientSourceUrls = unique([
  "https://www.anthropic.com/engineering/building-effective-agents",
  "https://www.anthropic.com/engineering/writing-tools-for-agents",
  "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
  "https://code.claude.com/docs/en/best-practices",
  "https://developers.openai.com/codex/guides/agents-md",
  "https://modelcontextprotocol.io/specification/2025-11-25/schema",
  "https://modelcontextprotocol.io/specification/2025-06-18/server/tools",
  "https://github.com/DeusData/codebase-memory-mcp",
  "https://github.com/qdrant/mcp-server-qdrant",
  ...precisionSourceUrls
]);

const bestPracticeSections = [
  {
    id: "holistic-excellence-intelligent-tradeoffs",
    title: "Holistic Excellence And Intelligent Trade-offs",
    score: 23,
    summary:
      "Treat vnem as an AI booster that prevents agents from satisfying one requirement by silently degrading another: performance, visuals, playability, accessibility, maintainability, and safety must be balanced with explicit evidence.",
    keywords: ["holistic excellence", "quality gate", "triple check", "performance visuals", "playability", "production ready", "settings gui", "intelligent tradeoff", "domain balance", "proactive enhancement"],
    sources: qualitySourceUrls,
    practices: [
      "Use the Triple-Check Workflow before coding and before final output: Analyze hidden requirements, Architect a balanced solution, then Review that no important domain was sacrificed.",
      "When the user asks for speed, optimization, or low latency, do not automatically remove visual quality, animation, sound, accessibility, or game feel; optimize the bottleneck first.",
      "When quality domains conflict, propose intelligent alternatives such as quality profiles, settings GUIs, adaptive effects, lazy loading, reduced-motion handling, asset optimization, feature flags, or scoped fallbacks.",
      "For UI, games, dashboards, canvas, animation, or branded surfaces, treat visual perception and interaction feel as part of the definition of done, not an optional decoration pass.",
      "For production-ready code, require evidence across relevant domains: tests/builds for behavior, browser or screenshot checks for visuals, interaction checks for playability, and explicit approval gates for risky operations.",
      "If a trade-off remains after optimization, state it plainly with the reason, user impact, mitigation, and verification that was or was not possible."
    ]
  },
  {
    id: "multi-agent-orchestration-reflection",
    title: "Multi-Agent Orchestration And Reflection",
    score: 24,
    summary:
      "Use deterministic orchestration only when it beats a single agent: simple questions stay single-agent, complex coding/app/game work uses an orchestrator-worker task graph, and broad research splits into independently verified strands before synthesis.",
    keywords: ["multi agent orchestration", "orchestrator worker", "split and merge", "reflection loop", "magentic coding", "shared state", "subagents", "lead architect", "generator evaluator", "planner generator evaluator"],
    sources: orchestrationSourceUrls,
    practices: [
      "Default to a single agent for simple questions and narrow tasks; multi-agent coordination adds latency, cost, and integration risk unless the task has independent subtasks or context pressure.",
      "Use code-level routing for determinism: classify the prompt, choose the orchestration pattern, then give agents strict JSON contracts instead of vague free-form delegation.",
      "For web apps, apps, and games, use an orchestrator-worker pattern: Lead Architect decomposes the task, UI and Logic workers own separate writable surfaces, Integration owns cross-surface merge, and QA owns verification.",
      "For deep research, use split-and-merge: separate source strands, require provenance from each worker, run source verification, then synthesize after contradictions and uncertainty are recorded.",
      "For output quality, use a generator/evaluator reflection loop with a maximum of three iterations and explicit pass, revise, or blocked verdicts.",
      "Use shared state as the coordination surface: task claims, ordinals, artifacts, decisions, blockers, and verification evidence should be visible to other agents through MCP resources or structured tool results.",
      "Keep one owner responsible for the final answer or integrated diff. Parallel workers should not independently edit overlapping file surfaces or produce conflicting final narratives.",
      "Treat VNEM orchestration as read-only guidance unless a separate runtime with approvals exists; the MCP server returns plans, schemas, and prompts, not hidden workers or file mutations."
    ]
  },
  {
    id: "precision-execution-dynamic-knowledge",
    title: "Precision Execution And Dynamic Knowledge",
    score: 25,
    summary:
      "Prevent destructive editing and stale framework syntax by routing mutation-capable work through exact patch verification, current documentation fetches, and bounded build/test terminal feedback.",
    keywords: ["precision execution", "surgical patch", "apply diff patch", "dynamic documentation", "fetch documentation", "stateful terminal", "safe terminal", "destructive editing", "knowledge decay", "mcp_apply_diff_patch", "mcp_fetch_documentation", "mcp_execute_terminal_command"],
    sources: precisionSourceUrls,
    practices: [
      "Keep the default VNEM MCP server read-only; expose mutation through a separate opt-in precision server with explicit workspace scope.",
      "For code edits, prefer exact SEARCH/REPLACE or unified diff hunks over whole-file rewrites. Reject the change when the context does not match instead of guessing.",
      "Run mcp_apply_diff_patch in dry-run mode first. Apply only after the hash, match count, and changed ranges match the task contract and approval posture.",
      "Before writing framework-specific code, fetch current documentation with mcp_fetch_documentation or an equivalent current-docs MCP and inject the returned context into the worker task.",
      "Use terminal execution only for allowlisted build/test/check commands. Block shell operators, destructive commands, production deploys, broad installs, and commands outside the workspace.",
      "Treat command output as feedback for the next patch. If the command times out, reports input prompts, or is blocked, revise the plan instead of pretending verification passed."
    ]
  },
  {
    id: "omniscient-context-self-healing",
    title: "Omniscient Context And Self-Healing",
    score: 26,
    summary:
      "Solve scale blindness and silent logic failures by finding code through local semantic search, proving behavior with red/green tests, and using temporary bounded scripts only for narrow roadblocks.",
    keywords: ["semantic code search", "local rag", "codebase embeddings", "proof engine", "self healing", "verification tests", "healing loop", "ephemeral scripting", "dynamic tool generation", "scale blindness", "silent logic failure", "mcp_semantic_code_search", "mcp_run_verification_tests", "mcp_execute_ephemeral_script"],
    sources: omniscientSourceUrls,
    practices: [
      "Before manually traversing a large repository, ask a semantic code-search tool for the concept and then read only the returned path/line ranges.",
      "Keep indexing local and private by default. External embeddings or hosted vector databases require explicit approval and a data-handling review.",
      "For new features or logic changes, write or select the automated test first. Prefer a red phase that proves the test catches the missing behavior.",
      "Patch only after the red phase or a confirmed failing regression. Use surgical patching, then rerun the verification command until it passes or the bounded attempt limit is reached.",
      "Cap self-healing loops at five attempts. If the loop hits the limit, stop and report the failing command, stdout/stderr, attempted fixes, and the smallest human decision needed.",
      "Use ephemeral scripts only for one-off local parsing, data shaping, or bulk inspection. They should run in a temporary sandbox, block dangerous APIs, return stdout, and delete themselves afterward.",
      "Do not present tests as mathematical proof of all correctness. Present them as executable evidence tied to the user's acceptance criteria and name residual coverage risk."
    ]
  },
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
    id: "agentic-coding-execution",
    title: "Agentic Coding Execution",
    score: 22,
    summary: "Make AI coding agents better by giving them a tight repo-sensing, plan-first, implementation, verification, and reporting loop instead of vague autonomy.",
    keywords: ["coding task", "app build", "web app", "feature build", "bug fix", "root cause", "failure recovery", "test first", "repo understanding", "large change", "backend api", "coding agents", "plan first", "verification loop", "acceptance criteria"],
    sources: [
      "https://www.anthropic.com/engineering/claude-code-best-practices",
      "https://openai.com/business/guides-and-resources/how-openai-uses-codex/",
      "https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results",
      "https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-best-practices",
      "https://docs.github.com/en/copilot/concepts/prompting/response-customization",
      "https://code.visualstudio.com/docs/copilot/customization/custom-instructions",
      "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
      "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/auto-memory.md",
      "https://docs.cursor.com/context/rules-for-ai",
      "https://www.anthropic.com/engineering/writing-tools-for-agents",
      "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
      "https://developers.openai.com/api/docs/guides/agent-evals"
    ],
    practices: [
      "Start implementation tasks by sensing the repo: read local instructions, manifests, scripts, tests, framework config, and the nearest existing implementation pattern before editing.",
      "For nontrivial work, explore first, then write a short plan, then code. For large changes, make the plan reviewable before mutation.",
      "Make the task issue-shaped: problem, acceptance criteria, target files or discovery path, non-goals, constraints, and the verification command or visual check that proves success.",
      "Give the agent a check it can run before or during coding: failing test, unit fixture, build, typecheck, screenshot, browser flow, or expected output.",
      "Use the smallest coherent diff that satisfies the acceptance criteria; avoid drive-by rewrites, public API churn, dependency swaps, and style conversions unless explicitly required.",
      "Prefer existing project patterns and local helper APIs over new abstractions. Add an abstraction only when it removes real repeated complexity.",
      "Run narrow checks first for speed, then broader tests/builds when the change touches shared behavior, app shell, build config, auth, data, or UI routing.",
      "For web apps and UI, a passing build is not enough: open or serve the app, verify desktop and mobile fit, inspect the first screen, and fix the ugliest visible issue before final.",
      "Control context: read the exact files needed, summarize findings, avoid dumping huge docs, and reset/split sessions when failed attempts or unrelated history start dominating the context window.",
      "Select a mode-specific playbook before coding: feature slice, root-cause bug fix, test-first evidence, refactor, rendered web app, API/data contract, large change, review, or failure recovery.",
      "Use subagents, parallel candidates, or Best-of-N only for independent exploration, critique, or alternative designs; keep one owner responsible for the integrated diff.",
      "Keep repository instruction files concise, stable, and versioned. Record commands, conventions, verification, and approval boundaries, not temporary task state.",
      "Report like an engineer: what changed, why, files touched, verification run, failed checks or unrun checks, residual risk, and any approval needed before deployment or package installs."
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
    "A universal read-only operating protocol for coding agents: sense the repo, route task context, choose the smallest sufficient capability, constrain risk, pass the holistic quality gate, verify with evidence, and report residual uncertainty.",
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
      step: "Quality Gate",
      instruction:
        "Apply the vnem Quality Contract before implementation and before final output: analyze hidden requirements, architect performance and visuals/playability together, and review that no important domain was sacrificed."
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
      "apply the Triple-Check Workflow: Analyze, Architect, Review",
      "verify performance, visuals, playability, accessibility, maintainability, and safety were not silently traded away when those domains apply",
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

const qualityContract = {
  id: "vnem-quality-contract",
  title: "vnem Quality Contract",
  summary:
    "A read-only AI-booster contract that forces coding agents to optimize performance, visuals, playability, accessibility, maintainability, and safety together instead of silently sacrificing one domain for another.",
  url_path: "/install/quality-contract.md",
  resource_uri: "vnem://install/quality-contract",
  tags: [
    "holistic excellence",
    "proactive enhancement",
    "intelligent trade-offs",
    "triple check",
    "quality gate",
    "performance visuals",
    "playability",
    "production ready",
    "settings gui",
    "domain balance",
    "adaptive effort",
    "no ceremony",
    "harsh truth",
    "visual ambition"
  ],
  principles: [
    {
      name: "Holistic Excellence",
      rule: "Performance, visuals, playability, accessibility, maintainability, and safety are all part of done when they apply to the task."
    },
    {
      name: "Proactive Enhancement",
      rule: "Infer the stronger product the user actually wants, not only the smallest literal interpretation of the prompt."
    },
    {
      name: "Intelligent Trade-offs",
      rule: "When constraints conflict, engineer controls, modes, fallbacks, and evidence before lowering product quality."
    },
    {
      name: "Quality Floor, Adaptive Effort Ceiling",
      rule: "Use VNEM Core to classify every task, keep simple stable answers direct, and escalate only when truth, safety, files, UI, debugging, current facts, repo work, or public claims need evidence."
    },
    {
      name: "Harsh Truth Without Fake Comfort",
      rule: "Say bad/unknown/current-source-needed plainly; never claim a file, browser, repo, UI, source, test, or deployment was checked unless it was actually checked."
    },
    {
      name: "Visual Ambition",
      rule: "For UI/redesign work, adapt to the user's style or the business/audience/brand instead of shipping generic safe templates; prove visual claims with browser/visual evidence."
    }
  ],
  triple_check: [
    {
      step: "Analyze",
      instruction:
        "Identify the user's stated goal, hidden requirements, visible or interactive surfaces, risk domains, and what the user will judge even if they did not say it explicitly."
    },
    {
      step: "Architect",
      instruction:
        "Plan for maximum feasible performance and top-tier visuals/playability together. Prefer robust settings, quality profiles, progressive enhancement, fallback paths, asset optimization, and smarter algorithms over degrading the product."
    },
    {
      step: "Review",
      instruction:
        "Before final output or code delivery, verify no important domain was sacrificed. If a trade-off remains, state it explicitly with evidence and the next best mitigation."
    }
  ],
  quality_floor: [
    "Do not solve one requirement by quietly damaging another important requirement.",
    "Do not remove visual quality, game feel, accessibility, or verification just to claim better performance.",
    "If performance conflicts with visuals or playability, first offer an intelligent alternative: quality toggles, settings GUI, adaptive effects, lazy loading, reduced-motion handling, asset optimization, feature flags, or scoped fallback.",
    "For production-ready work, require evidence that the task still works, still looks/feels intentional when visual or interactive, and remains maintainable.",
    "If evidence cannot be gathered, report the blocked verification and residual risk instead of claiming ship-quality.",
    "Do not add long reports, decorative tool plans, fake proof sections, or pointless clarification when a direct answer is enough.",
    "Do not skip research/tools when facts may be current, high-stakes, source-dependent, file/repo/debug/UI/security-related, or explicitly requested for verification."
  ],
  domain_balance: [
    "performance",
    "visual quality",
    "playability",
    "accessibility",
    "maintainability",
    "safety"
  ],
  adaptive_effort_modes: ["instant_answer", "quick_plan", "standard", "deep_proof", "max_verification"],
  truth_rules: [
    "truth_over_comfort_status",
    "no_sugarcoating_status",
    "uncertainty_must_be_labeled_status",
    "harsh_truth_quality_status"
  ],
  design_ambition_rules: [
    "Follow explicit user style when supplied.",
    "If style is not supplied, adapt to the website/business/audience/content/purpose and improve weak original choices.",
    "Do not force premium/modern/minimal/fun/corporate by default.",
    "Internally consider directions, then implement the strongest one unless uncertainty materially changes the result.",
    "Flag generic/template-like/boring design and missing visual proof."
  ],
  tradeoff_policy: [
    "Optimize the actual bottleneck before lowering quality.",
    "Expose user-controllable quality/performance modes when both high performance and high visual quality matter.",
    "Use progressive enhancement so capable devices get the best experience while constrained devices get a deliberate fallback.",
    "Document any remaining trade-off plainly in the final report."
  ],
  source_urls: qualitySourceUrls
};

const orchestrationProtocol = {
  id: "vnem-orchestration-protocol",
  title: "vnem Orchestration Protocol",
  summary:
    "A deterministic, model-agnostic routing and multi-agent coordination protocol for choosing Single Agent, Orchestrator-Worker, Split-and-Merge, and Generator/Evaluator reflection patterns before complex work consumes context.",
  url_path: "/install/orchestration-protocol.md",
  resource_uri: "vnem://install/orchestration-protocol",
  tags: [
    "multi agent orchestration",
    "orchestrator worker",
    "split and merge",
    "reflection loop",
    "magentic coding",
    "shared state",
    "lead architect",
    "worker agents",
    "source verifier",
    "generator evaluator"
  ],
  routing: [
    {
      pattern: "single_agent",
      use_when: "The request is a simple question, narrow lookup, or low-risk single-file task where coordination overhead would exceed the value.",
      output: "One scoped agent answers or acts with focused verification."
    },
    {
      pattern: "orchestrator_worker",
      use_when: "The request asks to code, build, improve, debug, or verify an app, web app, game, dashboard, UI, API, or multi-file feature.",
      output: "Lead Architect creates a strict JSON task graph, workers claim scoped tasks, Integration merges, and QA verifies."
    },
    {
      pattern: "split_and_merge",
      use_when: "The request is complex research, broad comparison, current-source investigation, benchmark collection, or ecosystem scanning.",
      output: "Research lead splits independent strands, workers gather evidence, source verifier checks claims, and synthesis merges findings."
    }
  ],
  reflection_loop: {
    max_iterations: 3,
    generator:
      "Produce JSON matching the generator_output schema with answer_or_patch_plan, changed_files, assumptions, verification_plan, and residual_risks.",
    evaluator:
      "Produce JSON matching the evaluator_output schema with pass, revise, or blocked verdict, score, failures, required_changes, and verification_requirements.",
    stop_conditions: ["evaluator verdict is pass", "evaluator verdict is blocked", "three iterations completed"]
  },
  magentic_coding_roles: [
    "lead_architect",
    "ui_agent",
    "logic_agent",
    "integration_agent",
    "qa_agent"
  ],
  shared_state_fields: [
    "run_id",
    "task",
    "tasks",
    "claims",
    "reports",
    "artifacts",
    "facts",
    "decisions",
    "events",
    "next_ordinal"
  ],
  source_urls: orchestrationSourceUrls
};

const precisionExecutionProtocol = {
  id: "vnem-precision-execution-protocol",
  title: "vnem Precision Execution Protocol",
  summary:
    "An opt-in mutation-capable execution protocol for preventing destructive editing and knowledge decay through exact patch verification, current documentation context, and bounded terminal feedback.",
  url_path: "/install/precision-execution-protocol.md",
  resource_uri: "vnem://install/precision-execution-protocol",
  tags: [
    "precision execution",
    "surgical patch",
    "apply diff patch",
    "dynamic documentation",
    "fetch documentation",
    "stateful terminal",
    "safe terminal",
    "destructive editing",
    "knowledge decay",
    "mcp_apply_diff_patch",
    "mcp_fetch_documentation",
    "mcp_execute_terminal_command"
  ],
  tools: [
    {
      name: "mcp_apply_diff_patch",
      type: "mutation",
      use_when: "A worker needs to change a file and can provide a narrow SEARCH/REPLACE block or unified diff hunk.",
      contract: "Read the target, verify exact context, reject mismatches, dry-run by default, then write atomically only when explicitly applied."
    },
    {
      name: "mcp_fetch_documentation",
      type: "read_with_network",
      use_when: "A worker needs current framework, library, engine, or API syntax before writing code.",
      contract: "Fetch HTTPS docs, normalize them into compact context, record the source hash, and inject the context before code is written."
    },
    {
      name: "mcp_execute_terminal_command",
      type: "bounded_execution",
      use_when: "A worker needs build, test, lint, typecheck, or verification feedback.",
      contract: "Run one allowlisted non-interactive command in a workspace-confined cwd, capture stdout/stderr, and timeout gracefully."
    }
  ],
  edit_policy: [
    "Do not rewrite an entire file to change one function.",
    "Use mcp_apply_diff_patch with dry_run=true before a real apply.",
    "Require exact SEARCH matches or exact unified-diff hunk context; if matching fails, re-read the file and retry with correct context.",
    "Keep patches inside the active workspace and block .git internals, binary files, symlink escapes, and traversal attempts.",
    "Report before/after hashes, changed ranges, and whether the patch was dry-run or applied."
  ],
  documentation_policy: [
    "Do not rely on memory for framework APIs when current docs matter.",
    "Fetch official or explicitly supplied HTTPS documentation before writing framework-specific code.",
    "Inject the documentation excerpt into the worker's active context and cite the URL/hash in the worker report.",
    "Block write attempts that declare required_documentation until those docs have been fetched for the worker/task."
  ],
  terminal_policy: [
    "Use terminal execution for feedback, not as a general shell.",
    "Allow only single build/test/check commands; block pipes, redirection, command chaining, deploys, installs, cleanup scripts, and destructive shell commands.",
    "Keep cwd state inside the workspace, capture stdout/stderr, and return timeout status instead of hanging the agent.",
    "Treat failed, blocked, or timed-out commands as evidence that the plan must be revised."
  ],
  source_urls: precisionSourceUrls
};

const omniscientSelfHealingProtocol = {
  id: "vnem-omniscient-self-healing-protocol",
  title: "vnem Omniscient Context And Self-Healing Protocol",
  summary:
    "An opt-in precision-server protocol for reducing scale blindness and silent logic failures with local semantic code search, red/green verification loops, and sandboxed ephemeral scripts.",
  url_path: "/install/omniscient-self-healing-protocol.md",
  resource_uri: "vnem://install/omniscient-self-healing-protocol",
  tags: [
    "semantic code search",
    "local rag",
    "codebase embeddings",
    "proof engine",
    "self healing",
    "verification tests",
    "healing loop",
    "ephemeral scripting",
    "dynamic tool generation",
    "scale blindness",
    "silent logic failure",
    "mcp_semantic_code_search",
    "mcp_run_verification_tests",
    "mcp_execute_ephemeral_script"
  ],
  tools: [
    {
      name: "mcp_semantic_code_search",
      type: "read_only_local_index",
      use_when: "A worker needs to locate code by concept, behavior, or responsibility before reading files in a large workspace.",
      contract: "Use a local private code index to return exact file paths, line ranges, snippets, matched terms, and scores without external embedding APIs."
    },
    {
      name: "mcp_run_verification_tests",
      type: "bounded_execution",
      use_when: "A worker needs executable proof that a feature, bug fix, or logic change works before reporting success.",
      contract: "Run a safe verification command in red, green, or check phase; track attempts by task id; return pass, red_confirmed, needs_healing, or blocked after max five attempts."
    },
    {
      name: "mcp_execute_ephemeral_script",
      type: "temporary_sandboxed_execution",
      use_when: "A worker hits a narrow roadblock that needs a one-off local parser, transformer, or data-inspection helper.",
      contract: "Run a short Node/Python helper in an isolated temporary cwd with sanitized env, dangerous APIs blocked, stdout/stderr captured, timeout enforced, and cleanup reported."
    }
  ],
  semantic_index_policy: [
    "Build or refresh the local code index when the precision server boots or when watched files change.",
    "Index text/code files only; skip .git, node_modules, build outputs, runtime caches, binary files, and oversized files.",
    "Chunk files with line numbers and store deterministic local vectors plus snippets in .vnem-runtime instead of calling paid or external embedding APIs.",
    "Use semantic search to identify candidate files, then read the returned file ranges before patching or reasoning about exact behavior.",
    "Treat semantic scores as retrieval signals, not ground truth. Verify with direct file reads and tests."
  ],
  proof_engine_policy: [
    "Before adding new feature or logic code, write or select the automated test that represents the user's acceptance criteria.",
    "Prefer a red phase that fails before implementation; a test that passes before code changes is not proof of the missing behavior.",
    "Patch with mcp_apply_diff_patch only after a failing test or confirmed bug reproduction, then rerun the verification command.",
    "Repeat patch-and-test only until the command passes or the hard max-attempt limit is reached.",
    "If the loop blocks, report the failing command, attempt count, stdout/stderr summary, and the smallest human decision needed."
  ],
  ephemeral_script_policy: [
    "Use ephemeral scripts for unique local roadblocks, not as a replacement for durable project tooling.",
    "Keep scripts small, deterministic, and local; do not use secrets, network APIs, process spawning, destructive filesystem operations, or shell control tricks.",
    "Run scripts from a temporary sandbox and delete the script/sandbox after execution.",
    "Promote a helper into a reviewed repo script only if the same need repeats and the user approves durable tooling."
  ],
  worker_prompt_additions: [
    "Before manual repo traversal, call mcp_semantic_code_search with the concept you need.",
    "Before feature or logic code, create or identify the failing automated test and run mcp_run_verification_tests with phase=red when possible.",
    "After every patch, rerun mcp_run_verification_tests with phase=green and stop only on pass or blocked.",
    "Use mcp_execute_ephemeral_script only for short local roadblocks and report cleanup status."
  ],
  source_urls: omniscientSourceUrls
};

const installGuide = {
  id: "vnem-install-guide",
  title: "vnem Install And MCP Guide",
  summary:
    "A compact setup guide for downloading the read-only vnem pack, installing it into an existing repo without overwriting local agent instructions, and connecting the local stdio MCP server with generated JSON config.",
  url_path: "/install/install-guide.md",
  resource_uri: "vnem://install/install-guide",
  tags: [
    "install vnem",
    "download vnem",
    "install guide",
    "mcp setup",
    "mcp config",
    "stdio server",
    "mcp json",
    "doctor",
    "managed agents",
    "safe archive"
  ],
  source_urls: [
    installArchiveUrl,
    "https://modelcontextprotocol.io/legacy/concepts/transports",
    "https://docs.anthropic.com/en/docs/claude-code/mcp",
    "https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-mcp"
  ]
};

const codingProtocol = {
  id: "vnem-coding-protocol",
  title: "vnem Coding Protocol",
  summary:
    "A read-only coding execution protocol for making agents better at apps, web apps, features, debugging, refactors, and reviews through repo sensing, plan-first work, small diffs, and verifiable outcomes.",
  url_path: "/install/coding-protocol.md",
  resource_uri: "vnem://install/coding-protocol",
  tags: [
    "coding task",
    "app build",
    "web app",
    "feature build",
    "bug fix",
    "root cause",
    "failure recovery",
    "test first",
    "backend api",
    "repo understanding",
    "large change",
    "holistic excellence",
    "quality gate",
    "triple check",
    "performance visuals",
    "verification loop",
    "context engineering"
  ],
  source_urls: codingAgentSourceUrls,
  sections: [
    {
      title: "What Actually Improves AI Coding",
      bullets: [
        "Give the agent stable project instructions, but keep them concise enough that the important parts remain visible.",
        "Give the agent a verification loop it can run itself: tests, build, typecheck, browser screenshot, fixture, expected output, or reproduction step.",
        "Shape tasks like good issues: problem, acceptance criteria, scope, target files or discovery path, non-goals, and evidence required before final.",
        "Use an explore -> plan -> implement -> verify loop for nontrivial changes instead of speculative editing.",
        "Keep the context budget clean: read exact files, summarize discoveries, avoid broad doc dumps, and split unrelated work into a fresh session.",
        "Prefer small reviewable diffs that reuse existing patterns over broad rewrites, new frameworks, or clever abstractions.",
        "Apply the vnem Quality Contract so performance, visuals, playability, accessibility, maintainability, and safety improve together instead of trading one away silently."
      ]
    },
    {
      title: "Holistic Excellence Contract",
      bullets: [
        "Before coding, run the Triple-Check Workflow: Analyze the stated and hidden goal, Architect a balanced implementation, then Review for sacrificed domains before final.",
        "Do not satisfy a performance request by quietly removing visual quality, game feel, accessibility, or verification when those domains matter.",
        "If a fast path and high-quality path conflict, engineer a deliberate alternative such as a settings GUI, quality profile, adaptive effects, lazy loading, reduced-motion path, optimized assets, feature flag, or scoped fallback.",
        "For production-ready work, preserve behavior, speed, visual polish, interaction feel, maintainability, and safety to the strongest feasible level for the repo and task.",
        "If a trade-off remains, name it plainly with evidence, user impact, mitigation, and what could not be verified."
      ]
    },
    {
      title: "Repo Sensing Contract",
      bullets: [
        "Before editing, inspect the nearest agent instruction files, README, package or language manifests, lockfiles, framework config, scripts, tests, CI, and relevant source files.",
        "Find one or two existing examples of the pattern to copy: route, component, API handler, test, state store, data model, error handling, or styling convention.",
        "Name the current stack and verification commands before recommending new tooling.",
        "If the task is visual or browser-based, inspect assets, routes, CSS tokens, existing components, and available browser-test tooling.",
        "If the task touches auth, payments, data, deployment, secrets, package installs, or production-like resources, stop and identify the approval gate before mutation."
      ]
    },
    {
      title: "Plan Before Mutating",
      bullets: [
        "For small safe changes, keep the plan internal and proceed after sensing the repo.",
        "For large, ambiguous, security-sensitive, dependency-changing, or multi-module work, write a short plan before editing.",
        "A good plan names files or modules, the behavior change, non-goals, verification commands, rollback path, and likely risks.",
        "Do not let planning become an essay. The plan should be short enough to guide the next edits.",
        "When the plan reveals missing acceptance criteria or risky scope, ask one blocking question or propose the smallest safe first slice."
      ]
    },
    {
      title: "Implementation Rules",
      bullets: [
        "Make the smallest coherent change that satisfies the acceptance criteria.",
        "When a precision execution MCP is available, prefer exact SEARCH/REPLACE or unified-diff patching with a dry-run over rewriting whole files.",
        "Before writing framework-specific code, fetch current documentation when syntax, API shape, or engine setup might have changed.",
        "Reuse existing project helpers, components, styles, data access layers, and error patterns before adding new ones.",
        "Add dependencies only when local code or existing dependencies cannot reasonably solve the problem, and state why before installing.",
        "Preserve public APIs, data formats, migration behavior, and user-visible flows unless the user explicitly asked to change them.",
        "Keep generated code, formatting-only churn, dependency-lock churn, and unrelated refactors out of the diff unless required by the task.",
        "For web apps, build the actual usable workflow first, then polish the first viewport and core interaction."
      ]
    },
    {
      title: "Verification Ladder",
      bullets: [
        "Start with the narrowest relevant check: one failing test, a focused unit test, typecheck for touched files, or a small fixture.",
        "Escalate to broader test/build/lint when shared behavior, public APIs, routing, build config, auth, data, or dependencies changed.",
        "For UI and web apps, run the app or inspect the rendered artifact when practical; code review alone is not enough for visual fit.",
        "For bug fixes, reproduce or describe the original failure, then prove the new behavior prevents it.",
        "For refactors, prove behavior preservation with existing tests, snapshots, fixtures, or call-site evidence before deleting or reshaping code.",
        "If a check cannot run, report exactly why and what risk remains."
      ]
    },
    {
      title: "Web App And App Quality Bar",
      bullets: [
        "The first screen must reveal the real product/workflow, not a placeholder or generic landing copy.",
        "The primary workflow should be usable without reading explanatory feature text.",
        "Text must fit on mobile and desktop; controls need stable dimensions, labels, focus states, and usable tap targets.",
        "Use domain-appropriate density: dashboards and tools should be scannable and utilitarian; games and branded surfaces can be more expressive.",
        "Use source-backed libraries or existing project conventions for hard domains such as routing, auth, forms, payments, persistence, browser automation, game engines, and 3D.",
        "Before final, name and fix the ugliest visible issue if browser/screenshot evidence is available."
      ]
    },
    {
      title: "Context And Agent-Client Compatibility",
      bullets: [
        "AGENTS.md, CLAUDE.md, GEMINI.md, Copilot instructions, and Cursor rules are all repo-context surfaces; keep shared guidance stable and avoid client-specific clutter unless needed.",
        "Use `.vnem/search-index.json` for fast local routing and `.vnem/source-radar.json` for current upstream docs before broad web search.",
        "Use MCP tools and resources only when they reduce context or verification cost; do not expose large tool catalogs just because they are available.",
        "Use subagents or parallel sessions for independent investigation, review, or alternative designs, then integrate through one owner.",
        "After repeated failed attempts, summarize the learned constraints and restart the task in a cleaner context."
      ]
    },
    {
      title: "Final Report Contract",
      bullets: [
        "State what changed and where.",
        "State the vnem intent, top matches, and chosen route when the choice mattered.",
        "List verification commands or rendered checks and their result.",
        "Call out failed or skipped checks plainly.",
        "Call out approval gates that remain, such as package installs, deployment, secrets, paid APIs, or production data.",
        "Keep the report compact enough that the user can decide whether to review, merge, or ask for the next slice."
      ]
    }
  ]
};

const codingPlaybooks = [
  {
    id: "feature-slice",
    title: "Feature Slice Builder",
    mode: "build",
    intents: ["coding task", "feature build", "app build", "web app", "professional code"],
    triggers: ["implement", "add feature", "build", "app", "workflow", "user story", "acceptance criteria"],
    summary: "Turn a requested feature into the smallest working product slice that matches local architecture and can be verified.",
    read_first: ["coding-protocol:vnem-coding-protocol", "practice:agentic-coding-execution", "task-rubric:agentic_coding"],
    repo_sensing: [
      "Read local agent instructions, manifests, scripts, framework config, tests, and the closest existing feature pattern.",
      "Identify the entrypoint, state/data owner, component or route owner, and verification command before editing.",
      "Name non-goals and surfaces that must not change, especially public APIs, schemas, auth, deployment, and dependencies."
    ],
    execution_loop: [
      "Define observable acceptance criteria in one short list.",
      "Implement one thin vertical slice first, then fill edge cases only when the slice runs.",
      "Reuse existing helpers, components, styles, and data patterns before adding abstractions.",
      "Keep unrelated cleanup, formatting churn, and dependency swaps out of the diff."
    ],
    verification_ladder: [
      "Run the narrowest existing test or typecheck that covers the changed surface.",
      "Run the app/build when routing, bundle, framework config, or user-visible behavior changed.",
      "For UI slices, inspect the rendered screen and mobile fit before final."
    ],
    stop_conditions: [
      "Missing acceptance criteria would change architecture or data shape.",
      "The change requires a new dependency, deployment, secret, paid API, migration, or production data.",
      "The first slice reveals broad redesign or public API churn."
    ],
    anti_patterns: ["start with a rewrite", "invent a parallel architecture", "skip repo pattern discovery", "claim done without a runnable check"],
    final_report: ["feature behavior delivered", "files changed", "verification evidence", "skipped checks and residual risk"],
    source_urls: codingAgentSourceUrls
  },
  {
    id: "bug-root-cause",
    title: "Root-Cause Bug Fix",
    mode: "debug",
    intents: ["bug fix", "debug", "test first", "backend api", "security"],
    triggers: ["bug", "failing test", "regression", "error", "crash", "broken", "root cause", "auth api"],
    summary: "Debug by reproducing or localizing the failure, patching the narrow cause, and proving the regression is blocked.",
    read_first: ["coding-protocol:vnem-coding-protocol", "practice:agentic-coding-execution", "practice:code-review", "practice:evals"],
    repo_sensing: [
      "Capture the exact failing command, error text, route, log, screenshot, or assertion before editing.",
      "Trace the closest call path and recent local pattern instead of guessing from file names.",
      "Check whether the failure touches auth, security, data, external services, or generated files."
    ],
    execution_loop: [
      "Reproduce first when practical; if not, state the missing reproduction evidence.",
      "Make one hypothesis at a time and patch the smallest root cause.",
      "Add or adjust a focused regression test when the test harness exists and the bug is behaviorally important.",
      "Avoid speculative cleanups until the original failure is proven fixed."
    ],
    verification_ladder: [
      "Run the failing test or smallest reproduction command.",
      "Run nearby tests for the touched module.",
      "Run broader build/test only when shared behavior, contracts, auth, data, or routing changed."
    ],
    stop_conditions: [
      "The fix would weaken security, loosen validation, skip tests, or hide the symptom.",
      "A malicious test hook, forced pass, or unrelated config change is proposed.",
      "The failure depends on private credentials, production data, or unavailable services."
    ],
    anti_patterns: ["patch by string guessing", "delete failing assertions", "force tests to pass", "change broad config to hide one failure"],
    final_report: ["root cause", "fix", "regression evidence", "remaining uncertainty"],
    source_urls: codingAgentSourceUrls
  },
  {
    id: "test-first-evidence",
    title: "Test-First Evidence Builder",
    mode: "build",
    intents: ["test first", "bug fix", "feature build", "evals", "benchmark evidence"],
    triggers: ["test", "tdd", "coverage", "verify first", "fixture", "expected output", "regression"],
    summary: "Convert an intended behavior into executable evidence before or alongside implementation.",
    read_first: ["coding-protocol:vnem-coding-protocol", "practice:evals", "practice:agentic-coding-execution", "task-rubric:agentic_coding"],
    repo_sensing: [
      "Inspect existing tests, fixtures, snapshots, helpers, and naming conventions before writing a new test.",
      "Find the fastest command that runs only the relevant test scope.",
      "Identify observable behavior instead of implementation details to lock."
    ],
    execution_loop: [
      "Write or describe the failing expectation first when practical.",
      "Keep fixtures minimal and deterministic.",
      "Prefer public API/user behavior tests over brittle private internals.",
      "Use mocks only where the existing test style already uses them or the external dependency is unavoidable."
    ],
    verification_ladder: [
      "Run the new focused test and confirm it fails for the right reason if possible.",
      "Implement the smallest change and rerun the focused test.",
      "Run adjacent tests or build when shared code changed."
    ],
    stop_conditions: [
      "No local test harness exists and creating one would be a project decision.",
      "The test requires real secrets, paid services, production data, or network-only state.",
      "The only available check would be flaky or unrelated to the acceptance criteria."
    ],
    anti_patterns: ["snapshot huge output blindly", "mock away the behavior under test", "write tests that only mirror implementation"],
    final_report: ["behavior locked", "test or check added", "focused result", "uncovered risk"],
    source_urls: codingAgentSourceUrls
  },
  {
    id: "refactor-preserve",
    title: "Behavior-Preserving Refactor",
    mode: "build",
    intents: ["refactor", "code simplification", "code compaction", "minimal code", "dead code", "professional code"],
    triggers: ["simplify", "refactor", "remove duplication", "dead code", "cleanup", "maintainability", "reduce code"],
    summary: "Simplify code while preserving public behavior, call-site contracts, and reviewability.",
    read_first: ["coding-protocol:vnem-coding-protocol", "practice:code-simplification", "practice:code-review", "task-rubric:refactor"],
    repo_sensing: [
      "Map public interfaces, imports, exports, tests, and call sites before moving or deleting code.",
      "Identify duplicated behavior, dead branches, unused exports, or repeated helpers with evidence.",
      "Check formatting and generated-file conventions so mechanical churn stays contained."
    ],
    execution_loop: [
      "Preserve behavior first; only then remove complexity.",
      "Make small reviewable steps: rename, extract, inline, delete, or consolidate one pattern at a time.",
      "Avoid public API, schema, route, or data-format changes unless explicitly requested.",
      "Prefer deleting proven waste over adding abstractions."
    ],
    verification_ladder: [
      "Run tests for the touched module or call path.",
      "Run typecheck/build if interfaces, exports, imports, or framework routing changed.",
      "Use call-site evidence when tests are absent, and state the residual risk."
    ],
    stop_conditions: [
      "Behavior preservation cannot be checked and the refactor touches shared or critical code.",
      "The cleanup requires dependency replacement, architecture migration, or public API churn.",
      "Generated files or formatting-only churn dominate the diff."
    ],
    anti_patterns: ["rewrite because code looks old", "mix feature changes into refactor", "delete without call-site evidence"],
    final_report: ["what was simplified", "interfaces preserved", "verification evidence", "intentional leftovers"],
    source_urls: codingAgentSourceUrls
  },
  {
    id: "web-app-rendered-quality",
    title: "Rendered Web App Builder",
    mode: "build",
    intents: ["web app", "app build", "better ui", "visual qa", "frontend", "dashboard"],
    triggers: ["web app", "frontend", "react", "vite", "next", "dashboard", "landing", "responsive", "browser"],
    summary: "Build web surfaces as real usable workflows and verify rendered desktop/mobile states, not only code or builds.",
    read_first: ["coding-protocol:vnem-coding-protocol", "practice:frontend", "design-architecture:vnem-design-architecture", "visual-qa-protocol:vnem-visual-qa-protocol"],
    repo_sensing: [
      "Inspect routes, app shell, component library, design tokens, CSS architecture, assets, and dev-server scripts.",
      "Find the closest existing page/component interaction pattern before creating new UI primitives.",
      "Identify browser verification path and viewports before final."
    ],
    execution_loop: [
      "Build the actual primary workflow first, not a marketing placeholder.",
      "Use stable dimensions for boards, grids, counters, controls, and cards so labels and hover states do not shift layout.",
      "Keep domain density appropriate: operational apps should be scannable and quiet; games and brand surfaces can be more expressive.",
      "Polish the first visible screen after behavior works."
    ],
    verification_ladder: [
      "Run framework build/typecheck or the nearest focused check.",
      "Open or serve the app and inspect desktop plus mobile viewports when practical.",
      "Fix the single ugliest visible issue before final if rendered evidence is available."
    ],
    stop_conditions: [
      "The UI depends on unavailable assets, private accounts, paid APIs, or production data.",
      "A new UI framework or major design-system swap is needed.",
      "Rendered text overflows, controls overlap, or the first screen is still generic."
    ],
    anti_patterns: ["ship from static code review only", "oversized hero for an operational tool", "cards inside cards", "unverified responsive layout"],
    final_report: ["workflow built", "visual evidence", "viewport checks", "remaining polish risk"],
    source_urls: codingAgentSourceUrls
  },
  {
    id: "api-data-contract",
    title: "API And Data Contract Change",
    mode: "build",
    intents: ["backend api", "feature build", "bug fix", "security", "data memory"],
    triggers: ["api", "server", "database", "schema", "migration", "auth", "endpoint", "contract"],
    summary: "Change backend/API/data behavior by preserving contracts, isolating risk, and verifying caller-facing behavior.",
    read_first: ["coding-protocol:vnem-coding-protocol", "practice:backend", "practice:security", "task-rubric:backend_api"],
    repo_sensing: [
      "Inspect route handlers, service layers, schemas, migrations, auth middleware, validation, tests, and API docs.",
      "Find current error handling, status-code, logging, and serialization patterns.",
      "Identify callers and backwards-compatibility constraints before modifying contracts."
    ],
    execution_loop: [
      "Preserve current API/data contracts unless the user explicitly requests a breaking change.",
      "Validate inputs at the boundary and keep secret/auth handling out of logs.",
      "Use transaction/migration patterns already present in the repo.",
      "Keep external service calls and production data behind explicit approval."
    ],
    verification_ladder: [
      "Run focused API/service tests or a local request fixture.",
      "Run broader backend tests when auth, validation, schema, or shared services changed.",
      "Report migration/deployment checks separately from local code verification."
    ],
    stop_conditions: [
      "The change requires production credentials, data migrations, paid APIs, or deployment.",
      "The patch would log secrets or weaken auth/validation.",
      "A breaking contract change is implied but not explicitly accepted."
    ],
    anti_patterns: ["loosen validation to satisfy tests", "hardcode environment secrets", "change response shape casually", "skip migration risk"],
    final_report: ["contract changed or preserved", "validation/auth risk", "tests run", "deployment or migration gates"],
    source_urls: codingAgentSourceUrls
  },
  {
    id: "large-change-checkpoints",
    title: "Large Change Checkpoint Planner",
    mode: "plan",
    intents: ["large change", "migration", "refactor", "app build", "agent upgrade"],
    triggers: ["migration", "rewrite", "huge", "large", "multi file", "architecture", "upgrade", "overhaul"],
    summary: "Split broad work into checkpoints with approval gates, verification gates, rollback paths, and reviewable diffs.",
    read_first: ["coding-protocol:vnem-coding-protocol", "practice:agentic-coding-execution", "practice:code-simplification", "practice:evals"],
    repo_sensing: [
      "Map affected modules, ownership boundaries, public contracts, tests, CI, deployment, and generated artifacts.",
      "Identify the smallest reversible checkpoint that creates value without forcing the whole migration.",
      "Name what evidence is missing before code mutation."
    ],
    execution_loop: [
      "Plan in checkpoints before mutating.",
      "Land one reversible slice at a time.",
      "Use compatibility shims only when they reduce risk and have a removal path.",
      "Stop after each checkpoint for verification and review when blast radius is high."
    ],
    verification_ladder: [
      "Run focused checks per checkpoint.",
      "Run full build/test before declaring migration progress.",
      "Use diff review, API compatibility checks, and rollback notes as part of verification."
    ],
    stop_conditions: [
      "No reliable verification exists for a high-blast-radius change.",
      "The change requires dependency manager swaps, deployment, secrets, or data migrations without approval.",
      "The plan cannot be divided into reviewable checkpoints."
    ],
    anti_patterns: ["big bang rewrite", "change architecture and behavior together", "skip rollback path", "hide risk in a huge diff"],
    final_report: ["checkpoint order", "completed slice", "verification gate", "next safe slice"],
    source_urls: codingAgentSourceUrls
  },
  {
    id: "review-risk-scan",
    title: "Reviewer Risk Scan",
    mode: "review",
    intents: ["code review", "repo understanding", "security", "professional code"],
    triggers: ["review", "pr", "risk", "regression", "audit", "outdated", "dependencies"],
    summary: "Review code like an engineer: bugs, regressions, security/data risk, missing tests, and concrete file references first.",
    read_first: ["coding-protocol:vnem-coding-protocol", "practice:code-review", "practice:agentic-coding-execution", "task-rubric:agentic_coding"],
    repo_sensing: [
      "Inspect the diff, touched call paths, tests, manifests, and nearby implementation patterns.",
      "Identify behavior contracts and user-visible flows affected by the change.",
      "Separate confirmed issues from questions or style preferences."
    ],
    execution_loop: [
      "Lead with highest-severity findings and specific file/line references.",
      "Prioritize bugs, regressions, security/data exposure, concurrency, compatibility, and missing tests.",
      "Avoid nitpicks unless they hide real risk.",
      "If no issues are found, say so and name residual test gaps."
    ],
    verification_ladder: [
      "Run or inspect focused tests when the review request allows commands.",
      "Use static reasoning only when commands are unavailable, and state that limitation.",
      "Check generated/lockfile churn for unintended dependency or artifact changes."
    ],
    stop_conditions: [
      "Review requires private context, credentials, or production data.",
      "The diff is too large to review honestly without narrowing scope.",
      "The requested review would require destructive execution."
    ],
    anti_patterns: ["bury findings below summary", "style-only review", "claim safety without tests", "ignore generated dependency changes"],
    final_report: ["findings by severity", "open questions", "test gaps", "change summary only after findings"],
    source_urls: codingAgentSourceUrls
  },
  {
    id: "failure-recovery",
    title: "Failure Recovery Loop",
    mode: "debug",
    intents: ["bug fix", "large change", "coding task", "repo understanding"],
    triggers: ["failed", "blocked", "error", "retry", "cannot run", "eperm", "network", "sandbox", "dependency"],
    summary: "Recover from failed commands or agent attempts by classifying the failure and changing strategy instead of repeating noise.",
    read_first: ["coding-protocol:vnem-coding-protocol", "operating-protocol:vnem-operating-loop", "practice:agentic-coding-execution"],
    repo_sensing: [
      "Capture the exact command, exit code, error class, working directory, and whether sandbox/network/dependency/path state caused it.",
      "Check local scripts, package manager, lockfiles, and known environment constraints before retrying.",
      "Decide whether approval, dependency setup, a narrower command, or a code fix is the next safe move."
    ],
    execution_loop: [
      "Classify the failure: permission, sandbox, missing dependency, bad path/quoting, stale cache/process, network/service, incorrect assumption, or unsupported capability.",
      "Retry only with a changed condition that addresses the classified cause.",
      "When context is polluted by repeated failures, summarize learned constraints and restart the task slice cleanly.",
      "Preserve the original goal and avoid unrelated workaround churn."
    ],
    verification_ladder: [
      "Run the corrected narrow command.",
      "Run the original failing check again after the targeted fix.",
      "Run broader validation only after the original failure is resolved."
    ],
    stop_conditions: [
      "The next step needs user-private credentials, MFA, captcha, or a personal decision.",
      "The same blocker repeats after three genuinely different recovery attempts.",
      "The workaround would bypass safety, licensing, anti-cheat, DRM, or access controls."
    ],
    anti_patterns: ["repeat the exact failed command", "call a sandbox error a code failure", "install random packages without evidence", "hide failed checks"],
    final_report: ["failure class", "changed retry strategy", "verification result", "remaining blocker"],
    source_urls: codingAgentSourceUrls
  }
];

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
        "Visual quality, performance, playability, accessibility, and maintainability must be balanced together; do not make the interface faster by making it feel unfinished.",
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
        "Check that performance fixes did not silently strip visual quality, interaction feedback, playability, accessibility, or settings/fallback controls.",
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
    id: "agentic_coding",
    title: "Agentic Coding Execution",
    summary:
      "Build, debug, refactor, and review code through repo sensing, plan-first execution, small diffs, and verification evidence instead of broad speculative edits.",
    modes: ["build", "debug", "review", "plan"],
    intents: ["coding task", "app build", "web app", "feature build", "bug fix", "root cause", "failure recovery", "test first", "repo understanding", "large change", "backend api", "coding agents", "professional code"],
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:feature-slice", "coding-playbook:bug-root-cause", "coding-playbook:test-first-evidence", "coding-playbook:refactor-preserve", "practice:agentic-coding-execution", "operating-protocol:vnem-operating-loop", "practice:evals", "practice:code-review"],
    quality_bar: [
      "repo instructions, manifests, scripts, tests, and nearest local patterns are inspected before edits",
      "nontrivial changes use an explore -> plan -> implement -> verify loop",
      "diff is scoped to the acceptance criteria and avoids unrelated rewrites",
      "existing project conventions and helpers are reused before new dependencies or abstractions",
      "the strongest practical verification is run and skipped checks are reported honestly"
    ],
    approval_gates: ["new dependencies or package-manager changes", "large rewrites", "public API/data format changes", "CI/deploy/auth/database/secret config edits", "production data or external service use"],
    verification: ["inspect local instructions and manifests", "run focused tests/checks first", "run broader build/test when blast radius justifies it", "for UI/web app work, verify the rendered app state when practical", "report unrun checks and residual risk"],
    output_contract: ["repo sensing summary", "plan or chosen slice", "files changed", "verification evidence", "residual risk and approval gates"]
  },
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
    read_first: ["coding-protocol:vnem-coding-protocol", "coding-playbook:api-data-contract", "practice:backend", "practice:security", "practice:evals"],
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
    id: "agentic-coding-best-practices",
    title: "Agentic Coding Best-Practice Sources",
    category: "agentic-coding",
    priority: "critical",
    summary: "Track official and high-signal guidance on how coding agents perform better: repo instructions, plan-first work, verification loops, context management, tool design, and evals.",
    use_when: [
      "vnem needs to improve how agents build apps, web apps, features, bug fixes, and refactors.",
      "A maintainer wants source-backed guidance for AGENTS.md, CLAUDE.md, GEMINI.md, Copilot instructions, Cursor rules, or coding-agent task prompts.",
      "A benchmark should compare with/without-vnem coding quality, not only recommendation quality."
    ],
    monitor: [
      "Official coding-agent best-practice docs from OpenAI, Anthropic, GitHub, Google Gemini CLI, and Cursor",
      "Guidance on issue-shaped prompts, project instructions, plan mode, verification, context windows, subagents, and evals",
      "Tool-description and MCP ergonomics research that affects how agents choose and use tools"
    ],
    risk_checks: [
      "Vendor guidance can be client-specific; keep shared vnem rules client-neutral unless a client file is explicitly generated.",
      "Do not encode hype claims or productivity numbers without repeatable benchmarks.",
      "Do not turn best-practice guidance into automatic package installs, config edits, or broad runtime permissions."
    ],
    source_urls: [
      "https://www.anthropic.com/engineering/claude-code-best-practices",
      "https://openai.com/business/guides-and-resources/how-openai-uses-codex/",
      "https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results",
      "https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-best-practices",
      "https://docs.github.com/en/copilot/concepts/prompting/response-customization",
      "https://code.visualstudio.com/docs/copilot/customization/custom-instructions",
      "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
      "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/auto-memory.md",
      "https://docs.cursor.com/context/rules-for-ai",
      "https://www.anthropic.com/engineering/writing-tools-for-agents",
      "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
      "https://developers.openai.com/api/docs/guides/agent-evals"
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
      "1. If `.vnem/quality-contract.md` exists, apply the Triple-Check Workflow: Analyze, Architect, Review.",
      "2. If `.vnem/coding-protocol.md` exists, read it before editing application code.",
      "3. If `.vnem/coding-playbooks.json` exists, choose the closest playbook and follow its repo_sensing, execution_loop, verification_ladder, stop_conditions, and anti_patterns.",
      "4. Inspect the current implementation, repo instructions, manifests, scripts, and nearest local patterns before editing.",
      "5. For nontrivial work, write a short plan before mutation.",
      "6. Make the smallest cohesive change that satisfies the objective without silently sacrificing performance, visuals, playability, accessibility, maintainability, or safety.",
      "7. Add or update tests only where risk justifies it.",
      "8. Run verification: <commands>.",
      "9. Report selected playbook, quality gate result, changed files, verification results, skipped checks, and residual risk.",
      "",
      "Constraints:",
      "- Do not run destructive commands.",
      "- Ask before installing packages, changing secrets, deploying, or touching production data.",
      "- Preserve user changes already present in the worktree."
    ].join("\n")
  },
  {
    id: "agentic-coding-task",
    title: "Agentic Coding Task Prompt",
    intents: ["coding task", "app build", "web app", "feature build", "bug fix", "large change", "test first"],
    summary: "Prompt a coding agent to turn a product or engineering request into a repo-grounded, verifiable implementation.",
    output_modes: ["agent_prompt", "task_contract"],
    template: [
      "You are a coding agent working in this repository.",
      "",
      "Goal:",
      "<what the user wants built, fixed, reviewed, or improved>",
      "",
      "Acceptance criteria:",
      "- <observable behavior 1>",
      "- <observable behavior 2>",
      "- <verification or visual evidence expected>",
      "",
      "Required repo sensing:",
      "- Read `.vnem/quality-contract.md` if present and apply Holistic Excellence, Proactive Enhancement, Intelligent Trade-offs, and the Triple-Check Workflow.",
      "- Read local agent instructions and `.vnem/coding-protocol.md` if present.",
      "- Read `.vnem/coding-playbooks.json` if present and select the nearest playbook before editing.",
      "- Inspect manifests, scripts, tests, framework config, and the nearest existing implementation pattern.",
      "- Name risky surfaces before mutation: dependencies, auth, database, deployment, secrets, external services, browser automation, or paid APIs.",
      "",
      "Execution rules:",
      "- For nontrivial work, produce a short plan before editing.",
      "- Prefer existing project patterns and helpers.",
      "- Keep the diff small and scoped to the acceptance criteria.",
      "- Do not solve one requirement by silently degrading another important domain; use settings, quality profiles, progressive enhancement, or scoped fallback when constraints conflict.",
      "- Ask before installing packages, changing config outside scope, deploying, or using secrets.",
      "",
      "Verification:",
      "- Run the narrowest relevant check first: <command or check>.",
      "- Run broader checks when blast radius justifies it: <command or check>.",
      "- For web/UI work, inspect the rendered app on desktop and mobile when practical.",
      "",
      "Final report:",
      "- What changed and where.",
      "- Verification run and result.",
      "- Checks skipped and why.",
      "- Remaining risk or approval needed."
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
      "1. If `.vnem/coding-playbooks.json` exists, use the `refactor-preserve` playbook.",
      "2. Inspect the current implementation, tests, public interfaces, and call sites.",
      "3. Identify removable code with evidence: unused files, unused exports, duplicate branches, dead paths, repeated helpers, or needless state.",
      "4. Preserve behavior with focused tests, snapshots, fixtures, type checks, or golden examples before risky edits.",
      "5. Make small reviewable changes: delete proven waste, collapse duplication, simplify control flow, and reuse existing local helpers.",
      "6. Run focused verification first, then the broader project checks.",
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
      "- Apply `.vnem/quality-contract.md` when present: performance, visuals, playability, accessibility, maintainability, and safety must not be silently traded away.",
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
      "- Apply `.vnem/quality-contract.md` when present and preserve performance, visuals, accessibility, maintainability, and safety together.",
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

function daysSince(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.valueOf())) return null;
  return Math.floor((generationNowMs - date.getTime()) / 86400000);
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

  const qualityContractDocs = [
    {
      id: `quality-contract:${qualityContract.id}`,
      kind: "quality-contract",
      title: qualityContract.title,
      summary: qualityContract.summary,
      url_path: qualityContract.url_path,
      trust_tier: "verified",
      type: "quality-contract",
      score: 24,
      tags: qualityContract.tags,
      use_cases: [
        ...qualityContract.principles.map((principle) => `${principle.name}: ${principle.rule}`),
        ...qualityContract.triple_check.map((item) => `${item.step}: ${item.instruction}`),
        ...qualityContract.quality_floor,
        ...qualityContract.adaptive_effort_modes.map((mode) => `Adaptive effort mode: ${mode}`),
        ...qualityContract.truth_rules,
        ...qualityContract.design_ambition_rules
      ],
      best_for: qualityContract.tradeoff_policy,
      risk_flags: [],
      source_urls: unique([installFileUrl("quality-contract.md"), ...qualityContract.source_urls]),
      keywords: unique(textTokens([
        qualityContract.id,
        qualityContract.title,
        qualityContract.summary,
        ...qualityContract.tags,
        ...qualityContract.principles.flatMap((principle) => [principle.name, principle.rule]),
        ...qualityContract.triple_check.flatMap((item) => [item.step, item.instruction]),
        ...qualityContract.quality_floor,
        ...qualityContract.adaptive_effort_modes,
        ...qualityContract.truth_rules,
        ...qualityContract.design_ambition_rules,
        ...qualityContract.domain_balance,
        ...qualityContract.tradeoff_policy,
        ...qualityContract.source_urls
      ].join(" "))).slice(0, 180)
    }
  ];

  const orchestrationProtocolDocs = [
    {
      id: `orchestration-protocol:${orchestrationProtocol.id}`,
      kind: "orchestration-protocol",
      title: orchestrationProtocol.title,
      summary: orchestrationProtocol.summary,
      url_path: orchestrationProtocol.url_path,
      trust_tier: "verified",
      type: "orchestration-protocol",
      score: 25,
      tags: orchestrationProtocol.tags,
      use_cases: [
        ...orchestrationProtocol.routing.map((route) => `${route.pattern}: ${route.use_when}`),
        orchestrationProtocol.reflection_loop.generator,
        orchestrationProtocol.reflection_loop.evaluator,
        ...orchestrationProtocol.magentic_coding_roles,
        ...orchestrationProtocol.shared_state_fields
      ],
      best_for: [
        "Complex coding, app, web app, or game work where one agent would lose context or mix file ownership.",
        "Deep research where independent source strands should be gathered and verified before synthesis.",
        "Generator/evaluator reflection loops with strict JSON schemas and bounded iterations."
      ],
      risk_flags: [],
      source_urls: unique([installFileUrl("orchestration-protocol.md"), ...orchestrationProtocol.source_urls]),
      keywords: unique(textTokens([
        orchestrationProtocol.id,
        orchestrationProtocol.title,
        orchestrationProtocol.summary,
        ...orchestrationProtocol.tags,
        ...orchestrationProtocol.routing.flatMap((route) => [route.pattern, route.use_when, route.output]),
        orchestrationProtocol.reflection_loop.generator,
        orchestrationProtocol.reflection_loop.evaluator,
        ...orchestrationProtocol.reflection_loop.stop_conditions,
        ...orchestrationProtocol.magentic_coding_roles,
        ...orchestrationProtocol.shared_state_fields,
        ...orchestrationProtocol.source_urls
      ].join(" "))).slice(0, 180)
    }
  ];

  const precisionExecutionProtocolDocs = [
    {
      id: `precision-execution-protocol:${precisionExecutionProtocol.id}`,
      kind: "precision-execution-protocol",
      title: precisionExecutionProtocol.title,
      summary: precisionExecutionProtocol.summary,
      url_path: precisionExecutionProtocol.url_path,
      trust_tier: "verified",
      type: "precision-execution-protocol",
      score: 26,
      tags: precisionExecutionProtocol.tags,
      use_cases: [
        ...precisionExecutionProtocol.tools.map((tool) => `${tool.name}: ${tool.use_when}`),
        ...precisionExecutionProtocol.edit_policy,
        ...precisionExecutionProtocol.documentation_policy,
        ...precisionExecutionProtocol.terminal_policy
      ],
      best_for: [
        "Mutation-capable agent workflows that need exact file edits instead of whole-file rewrites.",
        "Framework-specific coding where current documentation must be fetched before implementation.",
        "Build/test/check feedback loops that need stdout, stderr, cwd state, and timeout reporting."
      ],
      risk_flags: ["opt-in mutation-capable server", "network fetch for documentation", "bounded terminal execution"],
      source_urls: unique([installFileUrl("precision-execution-protocol.md"), ...precisionExecutionProtocol.source_urls]),
      keywords: unique(textTokens([
        precisionExecutionProtocol.id,
        precisionExecutionProtocol.title,
        precisionExecutionProtocol.summary,
        ...precisionExecutionProtocol.tags,
        ...precisionExecutionProtocol.tools.flatMap((tool) => [tool.name, tool.type, tool.use_when, tool.contract]),
        ...precisionExecutionProtocol.edit_policy,
        ...precisionExecutionProtocol.documentation_policy,
        ...precisionExecutionProtocol.terminal_policy,
        ...precisionExecutionProtocol.source_urls
      ].join(" "))).slice(0, 200)
    }
  ];

  const omniscientSelfHealingProtocolDocs = [
    {
      id: `omniscient-self-healing-protocol:${omniscientSelfHealingProtocol.id}`,
      kind: "omniscient-self-healing-protocol",
      title: omniscientSelfHealingProtocol.title,
      summary: omniscientSelfHealingProtocol.summary,
      url_path: omniscientSelfHealingProtocol.url_path,
      trust_tier: "verified",
      type: "omniscient-self-healing-protocol",
      score: 27,
      tags: omniscientSelfHealingProtocol.tags,
      use_cases: [
        ...omniscientSelfHealingProtocol.tools.map((tool) => `${tool.name}: ${tool.use_when}`),
        ...omniscientSelfHealingProtocol.semantic_index_policy,
        ...omniscientSelfHealingProtocol.proof_engine_policy,
        ...omniscientSelfHealingProtocol.ephemeral_script_policy
      ],
      best_for: [
        "Large repositories where agents need conceptual code search before reading files.",
        "Feature and bug-fix work where a red/green verification loop should block silent logic failures.",
        "One-off local parsing or transformation roadblocks that need temporary helper scripts without permanent workspace clutter."
      ],
      risk_flags: ["opt-in mutation-capable server", "bounded terminal execution", "temporary script execution", "local index cache"],
      source_urls: unique([installFileUrl("omniscient-self-healing-protocol.md"), ...omniscientSelfHealingProtocol.source_urls]),
      keywords: unique(textTokens([
        omniscientSelfHealingProtocol.id,
        omniscientSelfHealingProtocol.title,
        omniscientSelfHealingProtocol.summary,
        ...omniscientSelfHealingProtocol.tags,
        ...omniscientSelfHealingProtocol.tools.flatMap((tool) => [tool.name, tool.type, tool.use_when, tool.contract]),
        ...omniscientSelfHealingProtocol.semantic_index_policy,
        ...omniscientSelfHealingProtocol.proof_engine_policy,
        ...omniscientSelfHealingProtocol.ephemeral_script_policy,
        ...omniscientSelfHealingProtocol.worker_prompt_additions,
        ...omniscientSelfHealingProtocol.source_urls
      ].join(" "))).slice(0, 220)
    }
  ];

  const installGuideDocs = [
    {
      id: `install-guide:${installGuide.id}`,
      kind: "install-guide",
      title: installGuide.title,
      summary: installGuide.summary,
      url_path: installGuide.url_path,
      trust_tier: "verified",
      type: "install-guide",
      score: 23,
      tags: installGuide.tags,
      use_cases: [
        "Download the read-only vnem pack into a clean project without package installation.",
        "Use the local CLI installer when an existing AGENTS.md should be preserved.",
        "Generate absolute-path MCP JSON for local stdio clients.",
        "Verify installation with vnem doctor and MCP connection with vnem_status."
      ],
      best_for: [
        "New users who need the fewest possible setup decisions.",
        "Maintainers connecting vnem to Codex, Claude Code, or any MCP-compatible local client.",
        "Agents that need a read-first setup path before recommending runtime tool changes."
      ],
      risk_flags: [],
      source_urls: unique([installFileUrl("install-guide.md"), ...installGuide.source_urls]),
      keywords: unique(textTokens([
        installGuide.id,
        installGuide.title,
        installGuide.summary,
        ...installGuide.tags,
        "curl tar powershell archive install.tgz mcp config mcp-config stdio claude add-json codex agent doctor npm run mcp"
      ].join(" "))).slice(0, 160)
    }
  ];

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

  const codingProtocolDocs = [
    {
      id: `coding-protocol:${codingProtocol.id}`,
      kind: "coding-protocol",
      title: codingProtocol.title,
      summary: codingProtocol.summary,
      url_path: codingProtocol.url_path,
      trust_tier: "verified",
      type: "coding-protocol",
      score: 21,
      tags: codingProtocol.tags,
      use_cases: codingProtocol.sections.flatMap((section) => section.bullets),
      best_for: [
        "Coding-agent implementation tasks that need repo sensing, plan-first changes, small diffs, and verification evidence.",
        "Apps, web apps, features, bug fixes, refactors, and reviews where the agent must code rather than only recommend tools."
      ],
      risk_flags: [],
      source_urls: unique([installFileUrl("coding-protocol.md"), ...codingProtocol.source_urls]),
      keywords: unique(textTokens([
        codingProtocol.id,
        codingProtocol.title,
        codingProtocol.summary,
        ...codingProtocol.tags,
        ...codingProtocol.sections.flatMap((section) => [section.title, ...section.bullets]),
        ...codingProtocol.source_urls
      ].join(" "))).slice(0, 180)
    }
  ];

  const codingPlaybookDocs = codingPlaybooks.map((playbook) => ({
    id: `coding-playbook:${playbook.id}`,
    kind: "coding-playbook",
    title: playbook.title,
    summary: playbook.summary,
    url_path: "/install/coding-playbooks.json",
    trust_tier: "verified",
    type: "coding-playbook",
    score: 20,
    tags: unique(["coding playbook", playbook.mode, ...playbook.intents, ...playbook.triggers]),
    use_cases: [...playbook.repo_sensing, ...playbook.execution_loop],
    best_for: playbook.verification_ladder,
    risk_flags: playbook.stop_conditions,
    source_urls: unique([installFileUrl("coding-playbooks.json"), ...playbook.source_urls]),
    keywords: unique(textTokens([
      playbook.id,
      playbook.title,
      playbook.summary,
      playbook.mode,
      ...playbook.intents,
      ...playbook.triggers,
      ...playbook.read_first
    ].join(" "))).slice(0, 180)
  }));

  return [...omniscientSelfHealingProtocolDocs, ...precisionExecutionProtocolDocs, ...orchestrationProtocolDocs, ...qualityContractDocs, ...installGuideDocs, ...operatingDocs, ...codingProtocolDocs, ...codingPlaybookDocs, ...sourceRadarDocs, ...designArchitectureDocs, ...visualQaDocs, ...rubricDocs, ...promptDocs, ...practiceDocs, ...entryDocs].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
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
    "- Quality gate: Triple-Check Workflow, detected domains, quality floor, and intelligent trade-off policy.",
    "- Orchestration: single-agent, orchestrator-worker, or split-and-merge pattern when task complexity warrants it.",
    "- Precision execution: use exact patching, dynamic documentation, and safe terminal feedback only when the opt-in precision server is explicitly available and appropriate.",
    "- Omniscient/self-healing: use semantic code search before blind traversal, red/green verification loops before success claims, and ephemeral scripts only for narrow temporary roadblocks.",
    "- Smallest sufficient capability: existing project pattern first, then source-backed tool only if justified.",
    "- Approval gates: actions that need explicit user consent before mutation or external side effects.",
    "- perception gate: for UI, game, canvas, animation, or branded surfaces, screenshots and interaction moments must look intentionally polished before final.",
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
    "- Use `.vnem/coding-protocol.md` for app, web app, feature, bug fix, refactor, and review execution guidance.",
    "- Use `.vnem/quality-contract.md` for holistic excellence, Triple-Check Workflow, and intelligent trade-off rules.",
    "- Use `.vnem/orchestration-protocol.md` for complex coding, app, game, research, split-and-merge, reflection, and shared-state workflows.",
    "- Use `.vnem/precision-execution-protocol.md` before using opt-in mutation-capable tools such as surgical patching, dynamic documentation fetches, or stateful terminal execution.",
    "- Use `.vnem/omniscient-self-healing-protocol.md` before using opt-in semantic code search, test-driven healing loops, or ephemeral scripting.",
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

function qualityContractMarkdown() {
  return [
    "# vnem Quality Contract",
    "",
    `Generated: ${generatedAt}`,
    "",
    qualityContract.summary,
    "",
    "## Safety Boundary",
    "",
    "- This file is read-only guidance.",
    "- Do not treat it as a runtime optimizer, browser automation script, package installer, settings implementation, or enforcement daemon.",
    "- Use it to shape the agent's reasoning, MCP task contract, implementation plan, verification, and final report.",
    "",
    "## The VNEM Standard",
    "",
    "VNEM is built around one rule: an AI agent should not satisfy one requirement by silently damaging another.",
    "",
    ...qualityContract.principles.map((principle) => `- **${principle.name}:** ${principle.rule}`),
    "",
    "If a user asks for extreme performance, VNEM should not let the agent quietly remove visual quality or game feel. The better answer is to optimize the system and expose control: fast defaults, high-quality modes, adaptive effects, and honest verification evidence.",
    "VNEM also should not turn every request into ceremony. Simple stable questions should be answered directly after Core classification; deep proof is reserved for current facts, files, repo changes, debugging, UI/browser proof, security/high-stakes work, public claims, and deployment/release workflows.",
    "",
    "## Triple-Check Workflow",
    "",
    ...qualityContract.triple_check.flatMap((item, index) => [
      `${index + 1}. **${item.step}**`,
      `   ${item.instruction}`
    ]),
    "",
    "## Quality Floor",
    "",
    ...qualityContract.quality_floor.map((item) => `- ${item}`),
    "",
    "## Adaptive Effort And Harsh Truth",
    "",
    ...qualityContract.adaptive_effort_modes.map((item) => `- ${item}`),
    "",
    ...qualityContract.truth_rules.map((item) => `- ${item}`),
    "",
    "## Design Ambition Rules",
    "",
    ...qualityContract.design_ambition_rules.map((item) => `- ${item}`),
    "",
    "## Domain Balance",
    "",
    ...qualityContract.domain_balance.map((item) => `- ${item}`),
    "",
    "## Intelligent Trade-off Policy",
    "",
    ...qualityContract.tradeoff_policy.map((item) => `- ${item}`),
    "",
    "## Related Files",
    "",
    "- `.vnem/operating-protocol.md`: universal workflow and task contract.",
    "- `.vnem/coding-protocol.md`: repo-sensing, implementation, verification, and final-report rules.",
    "- `.vnem/coding-playbooks.json`: task-mode execution loops.",
    "- `.vnem/design-architecture.md`: visual, motion, sound, dashboard, and game-feel guidance.",
    "- `.vnem/visual-qa-protocol.md`: rendered inspection and perception verdicts.",
    "",
    "## Source URLs",
    "",
    ...qualityContract.source_urls.map((url) => `- ${url}`),
    ""
  ].join("\n");
}

function orchestrationProtocolMarkdown() {
  return [
    "# vnem Orchestration Protocol",
    "",
    `Generated: ${generatedAt}`,
    "",
    orchestrationProtocol.summary,
    "",
    "## Safety Boundary",
    "",
    "- This file is read-only guidance.",
    "- Do not treat it as an API key template, model runtime, worker daemon, shell proxy, package installer, or file editor.",
    "- The MCP server returns deterministic plans, schemas, prompts, and task contracts. It does not secretly spawn LLM workers or mutate a repository.",
    "- Actual model calls, file writes, browser actions, package installs, network research, and deployments must stay under the connected agent client's normal tool permissions and user approvals.",
    "",
    "## Routing & Orchestration Engine",
    "",
    "VNEM chooses the smallest orchestration pattern that can realistically satisfy the task:",
    "",
    ...orchestrationProtocol.routing.flatMap((route) => [
      `### ${route.pattern}`,
      "",
      `Use when: ${route.use_when}`,
      "",
      `Output: ${route.output}`,
      ""
    ]),
    "Routing rule: simple work stays simple. Use multi-agent orchestration only when independent subtasks, context pressure, source verification, or multi-surface coding quality justify the coordination cost.",
    "",
    "## Reflection Loop",
    "",
    "Use the Planner-Generator-Evaluator pattern when the task has clear quality metrics and iterative critique is likely to improve the result.",
    "",
    "- Planner: route the task, define success criteria, choose the workflow, and initialize shared state.",
    `- Generator Agent: ${orchestrationProtocol.reflection_loop.generator}`,
    `- Evaluator Agent: ${orchestrationProtocol.reflection_loop.evaluator}`,
    `- Maximum iterations: ${orchestrationProtocol.reflection_loop.max_iterations}.`,
    "- Stop on `pass`, stop on `blocked`, or stop after the maximum iterations and return `needs_revision` with remaining failures.",
    "",
    "Generator system prompt:",
    "",
    "```text",
    "You are the VNEM Generator Agent. Return only JSON matching the generator_output schema. Use the task contract, shared state, and evaluator feedback. Preserve performance, visuals, playability, accessibility, maintainability, and safety when relevant. Include an executable verification plan and residual risks.",
    "```",
    "",
    "Evaluator system prompt:",
    "",
    "```text",
    "You are the VNEM Evaluator Agent. Return only JSON matching the evaluator_output schema. Pass only when the result is task-aligned, schema-valid, grounded in repo/source evidence, preserves all relevant quality domains, and includes honest verification. If not passing, return concrete required_changes.",
    "```",
    "",
    "## Magentic Coding Workflow",
    "",
    "Use this workflow for web apps, web games, apps, dashboards, UI surfaces, full-stack features, and multi-file coding work.",
    "",
    "1. Lead Architect inspects the repo and returns a strict JSON task list with ids, owner roles, dependencies, acceptance criteria, and allowed MCP tool contracts.",
    "2. Workers claim one unclaimed task in shared state before touching files.",
    "3. UI Agent owns visible surfaces, responsive layout, accessibility basics, and visual polish.",
    "4. Logic Agent owns app/game behavior, state transitions, inputs, rules, and deterministic logic.",
    "5. Integration Agent merges surfaces, resolves conflicts, and preserves performance plus visuals/playability together.",
    "6. QA Agent runs focused checks, browser or screenshot inspection when applicable, interaction checks, and the VNEM quality gate.",
    "7. Lead Architect synthesizes final status only after worker reports and QA evidence are present.",
    "",
    "Lead Architect system prompt:",
    "",
    "```text",
    "You are the VNEM Lead Architect Agent. Return only JSON matching the architect_task_list schema. Break the project into atomic tasks with unique ids, owner roles, dependencies, acceptance criteria, and allowed MCP tool contracts. For web apps and games, separate UI, logic, integration, QA, performance, accessibility, and visual verification work. Never assign overlapping writable file surfaces without explicit sequencing.",
    "```",
    "",
    "Worker system prompt:",
    "",
    "```text",
    "You are a VNEM Worker Agent. Claim exactly one task from shared state before doing work. Use MCP file tools only within the task's allowed contract and report every artifact touched. Return only JSON matching the worker_report schema. If blocked by missing context, dependency conflict, unsafe permission, or unclear file ownership, report blocked instead of improvising.",
    "```",
    "",
    "## Shared State",
    "",
    "All agent-to-agent coordination should be represented through MCP-readable context, not private side conversations. Required state fields:",
    "",
    ...orchestrationProtocol.shared_state_fields.map((field) => `- \`${field}\``),
    "",
    "State rules:",
    "",
    "- Every task claim and report receives a monotonically increasing ordinal.",
    "- Workers report artifacts, evidence, blockers, and changed file surfaces before dependent tasks begin.",
    "- Facts and decisions must include provenance or the agent that recorded them.",
    "- Never store secrets, passwords, private keys, raw tokens, or private user data in shared state.",
    "- One owner must synthesize the final answer or integrated diff; worker outputs are inputs, not competing final reports.",
    "",
    "## Required JSON Contracts",
    "",
    "- `route_decision`: pattern, confidence, reasons, signals, reflection requirement, max iterations, and worker count.",
    "- `architect_task_list`: project type plus task ids, roles, dependencies, acceptance criteria, and MCP tool contracts.",
    "- `worker_claim`: task id, agent id, role, and claim reason.",
    "- `worker_report`: task id, status, summary, artifacts, evidence, and blockers.",
    "- `generator_output`: iteration, answer or patch plan, changed files, assumptions, verification plan, and residual risks.",
    "- `evaluator_output`: iteration, verdict, score, failures, required changes, and verification requirements.",
    "- `shared_state_event`: ordinal, type, agent id, task id, and payload.",
    "",
    "## Web App And Game Quality Bar",
    "",
    "- Route app/game work through the Magentic Coding Workflow unless it is clearly a tiny single-surface change.",
    "- Preserve performance, visual quality, playability, accessibility, maintainability, and safety together.",
    "- If performance conflicts with visuals/playability, require quality profiles, settings toggles, adaptive effects, asset optimization, reduced-motion handling, or scoped fallbacks before reducing quality.",
    "- A passing build is not enough for visual or interactive work. Require rendered desktop/mobile evidence, interaction checks, and a perception gate when practical.",
    "",
    "## Source URLs",
    "",
    ...orchestrationProtocol.source_urls.map((url) => `- ${url}`),
    ""
  ].join("\n");
}

function precisionExecutionProtocolMarkdown() {
  return [
    "# vnem Precision Execution Protocol",
    "",
    `Generated: ${generatedAt}`,
    "",
    precisionExecutionProtocol.summary,
    "",
    "## Safety Boundary",
    "",
    "- This file describes an opt-in precision execution layer. It is not enabled by the default read-only VNEM MCP server.",
    "- Use the default `vnem` MCP server first for read-only recommendations, quality gates, orchestration plans, and source routing.",
    "- Use `vnem-precision` only when the user or project explicitly allows mutation-capable tools for the active workspace.",
    "- The precision server must never bypass the connected client's normal approvals, repository permissions, or user review.",
    "",
    "## Tool Contracts",
    "",
    ...precisionExecutionProtocol.tools.flatMap((tool) => [
      `### ${tool.name}`,
      "",
      `Type: \`${tool.type}\``,
      "",
      `Use when: ${tool.use_when}`,
      "",
      `Contract: ${tool.contract}`,
      ""
    ]),
    "## AST-Aware Surgical Patching",
    "",
    "VNEM's scalpel rule is strict: change only the intended region, verify the old context exactly, and reject the patch when context has drifted.",
    "",
    ...precisionExecutionProtocol.edit_policy.map((item) => `- ${item}`),
    "",
    "Required patch flow:",
    "",
    "1. Re-read the target file or function immediately before patching.",
    "2. Build a narrow SEARCH/REPLACE block or unified diff hunk.",
    "3. Call `mcp_apply_diff_patch` with `dry_run=true`.",
    "4. Review the match count, changed ranges, and before/after hashes.",
    "5. Apply with `dry_run=false` only after the dry run matches the task and approvals.",
    "6. Run focused verification and report the evidence.",
    "",
    "## Autonomous Knowledge Ingestor",
    "",
    "Agents must not guess framework syntax when current documentation matters.",
    "",
    ...precisionExecutionProtocol.documentation_policy.map((item) => `- ${item}`),
    "",
    "Required documentation flow:",
    "",
    "1. Identify framework/library/API names during Analyze or Architect.",
    "2. Call `mcp_fetch_documentation` for each library that affects code syntax, component APIs, engine setup, or build behavior.",
    "3. Put the returned `context_injection` block into the worker's active task context.",
    "4. If a patch declares `required_documentation`, block the patch until the required docs are recorded for the same worker/task.",
    "5. Prefer fetched docs over memory when syntax conflicts.",
    "",
    "## Stateful Terminal Execution",
    "",
    "Terminal feedback is for bounded verification. It is not a general-purpose shell.",
    "",
    ...precisionExecutionProtocol.terminal_policy.map((item) => `- ${item}`),
    "",
    "Allowed command classes:",
    "",
    "- Package-manager build/test/check scripts such as `npm run build`, `npm test`, `pnpm run test`, or `yarn run typecheck`.",
    "- Static checks such as `node --check file.js`.",
    "- Read-only Git inspection such as `git status`, `git diff`, `git log`, or `git show`.",
    "- Language test/check commands such as `cargo test`, `cargo check`, `go test`, `python -m pytest`, or `pytest`.",
    "",
    "Blocked command classes:",
    "",
    "- Shell chaining, pipes, redirection, backticks, and interactive shell launchers.",
    "- Package installs, deploys, publish/release scripts, cleanup scripts, destructive file operations, registry edits, system commands, and commands outside the workspace.",
    "",
    "## Relationship To VNEM",
    "",
    "- `.vnem/quality-contract.md` defines the quality bar.",
    "- `.vnem/orchestration-protocol.md` decides whether the task needs single-agent, worker orchestration, split-and-merge research, or reflection.",
    "- `.vnem/coding-protocol.md` defines repo sensing, small diffs, approval gates, verification, and final reporting.",
    "- This precision protocol defines the optional execution tools for exact patching, dynamic docs, and terminal feedback.",
    "",
    "## Source URLs",
    "",
    ...precisionExecutionProtocol.source_urls.map((url) => `- ${url}`),
    ""
  ].join("\n");
}

function omniscientSelfHealingProtocolMarkdown() {
  return [
    "# vnem Omniscient Context And Self-Healing Protocol",
    "",
    `Generated: ${generatedAt}`,
    "",
    omniscientSelfHealingProtocol.summary,
    "",
    "## Safety Boundary",
    "",
    "- This file describes opt-in tools on the mutation-capable precision server. The default VNEM MCP server remains read-only.",
    "- The semantic index is local and private; it does not call external embedding APIs.",
    "- Verification tests provide executable evidence, not absolute mathematical proof. Report residual coverage risk honestly.",
    "- Ephemeral scripts are temporary helpers, not a general shell, installer, deploy path, or persistent automation system.",
    "",
    "## Tool Contracts",
    "",
    ...omniscientSelfHealingProtocol.tools.flatMap((tool) => [
      `### ${tool.name}`,
      "",
      `Type: \`${tool.type}\``,
      "",
      `Use when: ${tool.use_when}`,
      "",
      `Contract: ${tool.contract}`,
      ""
    ]),
    "## Local RAG And Semantic Codebase Embeddings",
    "",
    "The goal is to stop agents from wasting context windows on blind directory traversal.",
    "",
    ...omniscientSelfHealingProtocol.semantic_index_policy.map((item) => `- ${item}`),
    "",
    "Required retrieval flow:",
    "",
    "1. Ask `mcp_semantic_code_search` for the concept, behavior, component, risk, or responsibility.",
    "2. Inspect the returned paths, line ranges, snippets, and scores.",
    "3. Read the exact source range before making claims or writing patches.",
    "4. Use targeted `rg`/file reads for exact symbols after semantic search narrows the surface.",
    "",
    "## Test-Driven Self-Healing",
    "",
    "The proof engine exists to stop silent logic failures before the human user finds them.",
    "",
    ...omniscientSelfHealingProtocol.proof_engine_policy.map((item) => `- ${item}`),
    "",
    "Required red/green flow:",
    "",
    "1. Create or identify the automated test that represents the requested behavior.",
    "2. Run `mcp_run_verification_tests` with `phase=red` when the test should fail before implementation.",
    "3. Use `mcp_apply_diff_patch` for the smallest exact patch.",
    "4. Run `mcp_run_verification_tests` with `phase=green`.",
    "5. If it returns `needs_healing`, patch again only with failure evidence.",
    "6. If it returns `blocked`, stop and ask for human intervention with concrete evidence.",
    "",
    "## Ephemeral Scripting",
    "",
    "Dynamic helpers are allowed only when a unique roadblock would otherwise waste context or manual effort.",
    "",
    ...omniscientSelfHealingProtocol.ephemeral_script_policy.map((item) => `- ${item}`),
    "",
    "## Worker Prompt Additions",
    "",
    ...omniscientSelfHealingProtocol.worker_prompt_additions.map((item) => `- ${item}`),
    "",
    "## Relationship To VNEM",
    "",
    "- `.vnem/quality-contract.md` defines the holistic quality bar.",
    "- `.vnem/orchestration-protocol.md` decides when work needs multiple agents or reflection.",
    "- `.vnem/precision-execution-protocol.md` defines exact patching, dynamic documentation, and terminal boundaries.",
    "- This protocol adds local semantic context, test-first healing loops, and temporary dynamic helper scripts.",
    "",
    "## Source URLs",
    "",
    ...omniscientSelfHealingProtocol.source_urls.map((url) => `- ${url}`),
    ""
  ].join("\n");
}

function installGuideMarkdown() {
  return [
    "# vnem Install And MCP Guide",
    "",
    `Generated: ${generatedAt}`,
    "",
    installGuide.summary,
    "",
    "## Safety Boundary",
    "",
    "- The install pack is read-only guidance and generated search data.",
    "- The archive install does not run package manager scripts, shell scripts, daemons, or MCP servers.",
    "- The MCP server is opt-in, local, stdio-based, and read-only; it exposes vnem search, recommendation, resources, quality gates, and deterministic orchestration plans.",
    "- The separate precision MCP server is mutation-capable and must be enabled only for an explicitly scoped workspace.",
    "- Review any client config before adding it to a shared project or user-wide MCP scope.",
    "",
    "## Fastest Pack Install",
    "",
    "Use this inside the project that should become vnem-aware:",
    "",
    "```bash",
    installCommand,
    "```",
    "",
    "This extracts `AGENTS.md` plus the `.vnem/` guidance pack. It is best for a clean repo or a repo where replacing/creating the root `AGENTS.md` is acceptable.",
    "",
    "PowerShell-safe archive download:",
    "",
    "```powershell",
    `Invoke-WebRequest -Uri \"${installArchiveUrl}\" -OutFile \"vnem-install.tgz\"`,
    "tar -xzf vnem-install.tgz",
    "Remove-Item vnem-install.tgz",
    "```",
    "",
    "## Existing Repo Install",
    "",
    "If the project already has an `AGENTS.md`, use the local CLI installer from a vnem checkout so it upserts a managed block instead of replacing the whole file:",
    "",
    "```bash",
    "git clone https://github.com/Ovvuhy/vnem.git",
    "cd vnem",
    "npm install",
    "npm run install:project -- /path/to/project",
    "npm run doctor -- /path/to/project",
    "```",
    "",
    "Claude-style projects can also receive a `CLAUDE.md` pointer:",
    "",
    "```bash",
    "npm run install:project -- /path/to/project --claude",
    "```",
    "",
    "## MCP Setup From A Checkout",
    "",
    "The MCP server requires a local checkout with dependencies installed:",
    "",
    "```bash",
    "git clone https://github.com/Ovvuhy/vnem.git",
    "cd vnem",
    "npm install",
    "npm run mcp",
    "```",
    "",
    "For client config, generate absolute-path JSON from the checkout:",
    "",
    "```bash",
    "node scripts/vnem-cli.mjs mcp-config",
    "node scripts/vnem-cli.mjs mcp-config --server-json",
    "```",
    "",
    "For reversible client detection, preview, setup, verification, and rollback, use the primary setup flow:",
    "",
    "```bash",
    "node scripts/vnem-cli.mjs clients --json",
    "node scripts/vnem-cli.mjs config preview --clients codex_app,codex_cli --workspace /path/to/project --json",
    "node scripts/vnem-cli.mjs setup",
    "node scripts/vnem-cli.mjs doctor --clients --workspace /path/to/project --json",
    "node scripts/vnem-cli.mjs rollback --yes --json",
    "```",
    "",
    "Setup preserves unrelated client settings, backs up every changed file, validates syntax, verifies Core and Tools entrypoints, and records exact rollback. Import-only profiles are used where VNEM has not verified a stable client config contract.",
    "",
    "For client-specific Core+Tools MCP adoption profiles, emit repo-local snippets without writing to Codex, Claude, Antigravity-style, or generic MCP client config paths:",
    "",
    "```bash",
    "node scripts/vnem-install-adoption.mjs emit --all",
    "node scripts/vnem-install-adoption.mjs doctor",
    "```",
    "",
    "The emitted profiles live under `.vnem/install-adoption/` and include both `vnem` and `vnem-tools`; merge/import only the profile for the client you use.",
    "",
    "Opt-in precision MCP config for a project that should allow exact patching, current-doc fetching, and safe terminal feedback:",
    "",
    "```bash",
    "node scripts/vnem-cli.mjs mcp-config --precision --workspace /path/to/project",
    "node scripts/vnem-cli.mjs mcp-config --precision --workspace /path/to/project --server-json",
    "```",
    "",
    "Opt-in Tools MCP foundation for a project that should allow bounded approved manifest/catalog discovery, reliability catalogs, action recovery plans, high-power action reviews, capability gap reports, deep repo maps, next-action ranking, no-placebo progress audits, change-impact planning, test-selection planning, failure triage, compact evidence packs, workspace maps, read-many/code-search/reference/dependency intelligence, safe source-quality/research-brief/research-pack helpers, bounded source-map/source-extract/source-graph helpers, provider-search query/build/run/rank tools, URL reputation/redirect/CAPTCHA/download risk checks, claim/source matrices, contradiction/freshness detection, research gap detection, safe static page inspection/readability/link-map/DOM-search/accessibility/snapshot-comparison helpers, permission-profile/trust-boundary previews (`safe-readonly` default, `safe-local-dev`, `approved-writes`, `creator-power`, and preview-only install/GitHub profiles), safe project scans, dry-run-first single/multi-file patches, batch restore/rollback, safe package tasks, local dev servers, approved GET/HEAD API requests, approved local browser screenshots, bounded localhost browser evidence runs, UI surface review, browser evidence planning, UI evidence audits, optional approved local git commits, and proof-compatible evidence/session logs:",
    "",
    "```bash",
    "node scripts/vnem-cli.mjs mcp-config --core --tools --workspace /path/to/project",
    "npm run tools:mcp",
    "npm run test:tools-mcp",
    "npm run test:tools-browser",
    "npm run test:tools-project-actions",
    "npm run test:tools-git-session",
    "npm run test:tools-intelligence",
    "npm run test:tools-research",
    "npm run test:tools-browser-intelligence",
    "npm run test:tools-browser-research-pack",
    "npm run test:tools-search-power",
    "npm run test:tools-risk-captcha",
    "npm run test:tools-permission-profiles",
    "npm run test:tools-trust-boundary",
    "npm run test:tools-secret-blocking",
    "npm run test:tools-ui-surface-review",
    "npm run test:tools-browser-evidence-plan",
    "npm run test:tools-browser-evidence-run",
    "npm run test:tools-ui-evidence-audit",
    "npm run test:browser-evidence-completion-audit",
    "npm run test:core-ui-quality-plan",
    "npm run test:core-visual-proof-contract",
    "npm run test:ui-completion-audit",
    "npm run test:core-permission-planning",
    "npm run test:core-research-strategy",
    "npm run test:core-source-ingestion-planning",
    "npm run test:tools-source-ingestion",
    "npm run test:tools-source-graph",
    "npm run test:research-evidence-audit",
    "npm run test:core-tool-selection",
    "npm run test:core-tools-ecosystem",
    "npm run test:core-browser-research-planning",
    "npm run test:core-search-planning",
    "npm run test:core-routing-memory-output",
    "npm run test:core-output-quality",
    "npm run test:core-anti-stagnation",
    "npm run test:core-adaptive-effort",
    "npm run test:core-fast-answer-contract",
    "npm run test:core-anti-overhead-audit",
    "npm run test:core-design-ambition",
    "npm run test:core-visual-taste-audit",
    "npm run test:mcp-user-smoke",
    "npm run test:core-tools-e2e",
    "npm run tools:readiness",
    "npm run core:readiness",
    "```",
    "",
    "Tools MCP is separate from Core MCP and is not Giga MCP: no Giga MCP, unrestricted filesystem, arbitrary shell, package installs, package publishing, deployment, unrestricted external browser browsing by default, search-engine result page scraping by default, automatic CAPTCHA bypass, unrestricted crawling, login/session/cookie automation, credential capture, automatic downloads/installers, secret-backed live API execution, and unrestricted API calls remain unsupported. GitHub autonomy is now scoped command-backed gh/git workflow support for allowed repo inspection, feature-branch push, PR/issue/comment/label, Actions status/rerun, CI triage, and draft release paths; repo deletion/force-push/protected direct push/settings mutation remain blocked by default unless exact config allows. Default Tools profile is `safe-readonly`; real local dev/write/API/browser/git/GitHub actions require explicit profile/config/auth plus approval/evidence/rollback where applicable. Real provider search works only when configured and approved; otherwise Tools returns honest unavailable/unconfigured status.",
    "",
    "Actual Core → Tools use path: start/connect Core MCP; start/connect Tools MCP for a specific workspace; ask Core `vnem_plan_effort_budget`, `vnem_fast_answer_contract`, `vnem_route_task`, `vnem_output_quality_plan`, `vnem_anti_stagnation_check`, `vnem_design_ambition_plan`, `vnem_visual_taste_audit`, `vnem_redesign_comparison_scorecard`, `vnem_total_impact_design_plan`, `vnem_design_direction_selector`, `vnem_compact_output_contract`, `vnem_build_debugging_plan`, `vnem_evidence_to_fix_check`, `vnem_build_architecture_map`, `vnem_code_change_contract`, `vnem_build_ui_quality_plan`, `vnem_visual_proof_contract`, `vnem_select_tools_for_task`, `vnem_build_tools_plan`, `vnem_assess_research_need`, `vnem_build_search_plan`, `vnem_build_browsing_plan`, `vnem_build_browser_research_plan`, `vnem_build_research_strategy`, `vnem_build_source_ingestion_plan`, `vnem_research_evidence_audit`, `vnem_explain_tools_chain`, or `vnem_boost_task` to select tool capabilities, classify relevant/ignored memory, make material missing-context ask/no-ask decisions, prevent repeated finished work, and build a compact-first plan-only handoff; use `vnem_tools_manifest`, `vnem_tools_permission_status`, `vnem_tools_action_policy_preview`, and `vnem_tools_trust_boundary_classify` for catalog/profile/trust-boundary discovery; dry-run first; ask the user for exact approval including active/required profile, trust boundary, scope, rollback, and evidence; map/read/search the project, inspect dependencies without installing, build deep repo maps, rank next actions, audit no-placebo progress, plan change impact and test selection, triage failures, build compact evidence packs, build search queries, run configured/approved provider search or return honest unavailable status, rank search results, evaluate direct/provided/local sources, inspect page structure, extract readability, map links without following them, search DOM-like content, detect CAPTCHA/access blocks, check URL/redirect/download risk, build claim/source matrices, detect research gaps, build source maps, extract explicit bounded targets, compare source graphs for official/community conflicts, freshness, and contradictions, review architecture entry points/registries/tests/configs for fake parallel systems and possible dead code, review UI routes/components/render paths/state coverage, plan browser evidence without hidden automation, execute bounded approved localhost browser evidence packs, audit UI evidence objects, and do not treat blocked/partial browser runs as proof. Browser evidence run requires `VNEM_TOOLS_ALLOW_LOCALHOST=1`, permission/approval, requested routes only, and `browser_was_run=true` before visual/browser claims; no login/cookie/session/CAPTCHA/broad browsing is supported. audit provided UI evidence objects, collect bounded log-first debug evidence without arbitrary commands, run static accessibility checks, compare page snapshots, apply approved patch batches/restores, run safe project tasks, start/stop local dev servers, perform approved API/browser proof, optionally make an approved local git commit, and collect `vnem_tools_collect_evidence` or `vnem_tools_finish_session`; use `proof_trail_compatible_summary` with `vnem_completion_audit` / `vnem_research_evidence_audit` / `vnem_proof_trail`; do not claim visual/live API/search proof unless those evidence fields exist.",
    "",
    "How to test Core + Tools MCP locally without external internet: `npm run test:mcp-user-smoke`, `npm run tools:readiness`, and `npm run core:readiness`. Public Tools MCP reports permission profiles, allowed-root/workspace/evidence-root status, broad-root warnings, blocked categories, action policy previews, reliability labels, action recovery plans, high-power action reviews, capability gaps, and trust-boundary classifications. It can build search queries, run configured/approved provider search, rank results, inspect sources/pages, map allowed local repos/docs, extract explicit bounded targets, build source graphs, detect freshness/contradictions, check URL/reputation/download risk, build claim/source matrices, detect research gaps, review architecture entry points/registries/tests/configs, review UI route/component/render/state coverage, plan browser proof without hidden automation, execute bounded approved localhost browser evidence packs, audit UI evidence objects, flag fake parallel systems and possible dead code, and collect bounded log-first debug evidence without arbitrary commands. It blocks secret paths/values, cookies/sessions/browser profiles/password-manager-like paths, and hard-dangerous actions by default. It does not automatically bypass CAPTCHA, scrape search engine result pages by default, perform login/session/cookie automation, run arbitrary downloads/installers, crawl broadly, read secret/session/browser-profile paths, or claim live/current search, full repo/site understanding, root cause, completed fixes, UI improvement, responsive/accessibility/browser-working status, wired implementation, or dead-code-free status without matching visual/browser/source evidence. Browser proof requires `browser_was_run=true` plus screenshot/DOM/route/console/network/a11y/viewport/state evidence as applicable; blocked runs are not proof.",
    "",
    "Generic `.mcp.json` shape:",
    "",
    "```json",
    JSON.stringify({
      mcpServers: {
        vnem: {
          command: "node",
          args: ["/absolute/path/to/vnem/scripts/vnem-mcp-server.mjs"],
          env: {
            VNEM_ROOT: "/absolute/path/to/vnem"
          }
        }
      }
    }, null, 2),
    "```",
    "",
    "Claude Code can add a single-server JSON object with `claude mcp add-json vnem '<json>'`. Other MCP clients usually accept either the full `mcpServers` object above or the single `vnem` server object printed by `--server-json`.",
    "",
    "For the precision server, use the generated `vnem-precision` config and review `VNEM_PRECISION_ROOT` before connecting it. The default read-only server remains the safer default.",
    "",
    "GitHub Tools MCP settings example:",
    "",
    "```toml",
    "[mcp_servers.\"vnem-tools\".env]",
    "# ============================================================",
    "# GITHUB SETTINGS",
    "# ============================================================",
    "VNEM_TOOLS_AUTONOMY_MODE = \"fast\"",
    "VNEM_TOOLS_GITHUB_PROFILE = \"maintainer\"",
    "VNEM_TOOLS_GITHUB_ALLOWED_REPOS = \"Ovvuhy/vnem;Ovvuhy/ME3-By-my-AI-and-Me\"",
    "VNEM_TOOLS_GITHUB_PROTECTED_BRANCHES = \"main;master;production\"",
    "VNEM_TOOLS_GITHUB_ALLOW_DIRECT_PUSH = \"0\"",
    "VNEM_TOOLS_GITHUB_ALLOW_FORCE_PUSH = \"0\"",
    "VNEM_TOOLS_GITHUB_ALLOW_REPO_DELETE = \"0\"",
    "VNEM_TOOLS_GITHUB_ALLOW_SETTINGS_MUTATION = \"0\"",
    "VNEM_TOOLS_GITHUB_ALLOW_RELEASES = \"1\"",
    "VNEM_TOOLS_GITHUB_ALLOW_ACTIONS_RERUN = \"1\"",
    "VNEM_TOOLS_MALWARE_DOWNLOAD_BLOCK = \"1\"",
    "```",
    "",
    "## Verify",
    "",
    "- Pack install: run `npm run doctor -- /path/to/project` from the vnem checkout.",
    "- MCP activation: connect the client and call `vnem_bootstrap` with the real task. Confirm the structured output includes `activation.status=active`, `read_only=true`, `precision_tools_exposed=false`, `compact_startup_contract`, `missing_context`, `domain_quality_contracts`, task-specific `required_rules`, `recommended_vnem_calls`, `protection_needs`, `verification_contract`, `completion_audit_expectations`, proof-trail recommendation, and `anti_placebo_checks`.",
    "- Agent flow: call `vnem_bootstrap`, then `vnem_plan_effort_budget` or `vnem_boost_task` for the concrete user-task workflow. It selects usable API/skill packs rather than raw records and returns a compact `tools_mcp_handoff`. Use `vnem_prepare_tools_handoff` when a standalone Tools MCP handoff is needed; for source/browser work, use `vnem_build_browser_research_plan` and `vnem_explain_tools_chain` to separate direct-source, website-understanding, local-UI, and current-search needs. Connect the separate `vnem-tools` MCP foundation only when approved actions are needed; it dry-runs first, asks permission, scans projects safely, applies approved path-limited patch batches, restores from approved backups/restore plans, runs only allowlisted commands and safe package tasks, starts/stops only local Tools-started dev servers, performs only approved GET/HEAD API requests, inspects direct/local/provided page sources, maps links without following/crawling, runs heuristic accessibility/snapshot checks, captures approved local browser screenshots, can make approved local git commits of explicit safe files, and collects redacted action/session evidence. Use `vnem_compose_capability_contract` only when lower-level capability IDs/details are needed. Call `vnem_protection_review` before risky filesystem/terminal/browser/GitHub/package/API/skill/modding actions; collect task-specific checks/evidence; call/apply `vnem_completion_audit`; then call `vnem_proof_trail` and include its compact proof/evidence summary in the final response.",
    "- Capability library: when `vnem_bootstrap` reports skill/API availability, use `vnem_library_status`, `vnem_get_required_capabilities`, `vnem_activate_capability_pack`, `vnem_apply_skill_guidance`, `vnem_boost_task`, `vnem_plan_effort_budget`, `vnem_fast_answer_contract`, `vnem_route_task`, `vnem_output_quality_plan`, `vnem_anti_stagnation_check`, `vnem_design_ambition_plan`, `vnem_visual_taste_audit`, `vnem_redesign_comparison_scorecard`, `vnem_total_impact_design_plan`, `vnem_design_direction_selector`, `vnem_compact_output_contract`, `vnem_prepare_tools_handoff`, `vnem_build_tools_plan`, `vnem_build_debugging_plan`, `vnem_evidence_to_fix_check`, `vnem_build_architecture_map`, `vnem_code_change_contract`, `vnem_build_browser_research_plan`, `vnem_explain_tools_chain`, `vnem_build_api_integration_plan`, `vnem_api_safety_profile`, `vnem_skill_safety_profile`, `vnem_get_agent_profile`, `vnem_compose_capability_contract`, `vnem_completion_audit`, `vnem_protection_review`, `vnem_proof_trail`, `vnem_recommend_skills`, `vnem_recommend_apis`, and `vnem_review_skill_or_api` for read-only capability activation, usable pack selection, routing/memory relevance, missing-context decisions, output-quality contracts, anti-stagnation checks, browser/source planning, audit, proof, and protection review. The default Core MCP chooses useful APIs/skills and prepares Tools MCP handoff, but it does not install skills, execute scripts, call APIs, mutate files, open browsers, run terminals, or push GitHub changes. Tools MCP is separate and approval-gated.",
    "- Domain contracts: research/source-quality work must use current/high-quality sources where facts can change; UI/backend work needs visible user-path, backend-to-UI data flow, loading/error/empty/success/responsive/accessibility checks, design ambition/taste audit, realistic redesign comparison, total-impact direction planning, compact output that keeps proof/caveats, and visual evidence; API work needs auth/CORS/HTTPS/secret/backend handling plus docs/freshness/rate-limit unknowns; game/build/modding work needs specific game/version/tool/file-format context, backups/isolation where mutation is proposed, and no generic best-build claims without PvE/PvP/DLC/progression assumptions.",
    "- Real task examples: Elden Ring build boosts ask PvE/PvP, DLC/base game, progression/rune level, weapon/stat preference, armor/poise, player skill, and patch/source freshness; weather widgets select a usable weather API pack and require frontend/backend, CORS, secret, rate-limit, loading/error/empty/success, and mocked-test proof; currency converters select a usable exchange API pack and require mocked rates, stale-rate handling, rate-limit/backoff, and no frontend secrets; repo issue triage helpers select a usable GitHub API pack with backend OAuth/PAT and GitHub/action handoff; suspicious domain/IP checks select a usable threat/IP pack with backend API-key handling, corroboration, and human review; dashboard UI/backend tasks require visible user path, backend-to-UI data flow, visual/browser/screenshot, responsive, accessibility, and state proof; modding tasks require game version, platform, toolchain, file formats, backup, restore, compatibility, and Tools/Precision MCP for edits; Gmail/PC security tasks separate user actions from tool actions, require current source-quality checks, and forbid impossible guarantees; repo debugging tasks require logs first, reproduction, root cause, minimal patch, tests, and before/after proof.",

    "- Orchestration: for complex app, game, coding, or research work, call `vnem_orchestrate` and confirm it returns the expected pattern and JSON schemas.",
    "- Precision server: call `mcp_apply_diff_patch` with `dry_run=true` before any real apply, `mcp_fetch_documentation` before framework-specific code, `mcp_execute_terminal_command` only for allowlisted checks, `mcp_semantic_code_search` before blind traversal, `mcp_run_verification_tests` for red/green proof loops, and `mcp_execute_ephemeral_script` only for temporary local helpers. These tools are not exposed by the default read-only MCP server.",
    "- Current limits: Super MCP skill/API records are metadata/enrichment only, not automatic install/execution. VNEM is not a standalone trained AI model.",
    "",
    "## Troubleshooting",
    "",
    "- If the archive command fails, download `install.tgz` directly from the HTTPS URL and extract it with `tar -xzf`.",
    "- If an MCP client cannot start the server, use the absolute `node` path or verify Node.js 20+ is available to that client process.",
    "- If paths contain spaces, keep JSON strings quoted and prefer the generated config over hand-written paths.",
    "- If a project should share MCP config, commit only read-only config and avoid secrets in `.mcp.json`.",
    "",
    "## Source URLs",
    "",
    ...installGuide.source_urls.map((url) => `- ${url}`),
    ""
  ].join("\n");
}

function codingProtocolMarkdown() {
  return [
    "# vnem Coding Protocol",
    "",
    `Generated: ${generatedAt}`,
    "",
    codingProtocol.summary,
    "",
    "## Safety Boundary",
    "",
    "- This file is read-only guidance.",
    "- Do not treat it as a script, package installer, dependency recommendation, CI config, or runtime agent.",
    "- Use it to improve how a coding agent thinks and verifies before it edits application code.",
    "- Keep package installs, deployment, production data, secrets, paid APIs, and broad rewrites behind explicit user approval.",
    "",
    "## How To Use",
    "",
    "- Read this file for coding tasks, app builds, web apps, feature work, bug fixes, refactors, and code reviews.",
    "- Read `.vnem/quality-contract.md` for the holistic quality gate: performance, visuals, playability, accessibility, maintainability, and safety must not be silently traded away.",
    "- Then use `.vnem/coding-playbooks.json` to select the closest concrete execution loop for the task mode.",
    "- Use `.vnem/search-index.json` to route the task and `.vnem/task-rubrics.json` to pick the quality bar.",
    "- Use `.vnem/design-architecture.md` and `.vnem/visual-qa-protocol.md` when the task has a visible app, web, UI, canvas, or game surface.",
    "- Use `.vnem/source-radar.json` when current docs, agent-client behavior, benchmark claims, or framework/tool choices matter.",
    "",
    ...codingProtocol.sections.flatMap((section) => [
      `## ${section.title}`,
      "",
      ...section.bullets.map((item) => `- ${item}`),
      ""
    ]),
    "## Source URLs",
    "",
    ...codingProtocol.source_urls.map((url) => `- ${url}`),
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
    "- `.vnem/operating-protocol.md`: universal Sense -> Route -> Choose -> Constrain -> Quality Gate -> Build/Review/Debug -> Verify -> Report loop.",
    "- `.vnem/quality-contract.md`: holistic excellence and intelligent trade-off policy.",
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

function codingPlaybooksJson() {
  return {
    generated_at: generatedAt,
    schema_version: "1.0.0",
    safety: {
      mode: "read-only-coding-playbooks",
      executes_code: false,
      installs_packages: false,
      starts_daemons: false,
      requires_secrets: false,
      edits_files: false
    },
    purpose:
      "Mode-specific coding-agent execution playbooks. Use them after the coding protocol to pick the right loop for feature work, debugging, tests, refactors, web apps, API/data changes, reviews, large changes, and failure recovery.",
    selection_rule:
      "Select the first playbook whose mode, intents, or triggers match the task. If several match, prefer the one with the strongest verification ladder for the requested outcome.",
    quality_contract: {
      resource_uri: qualityContract.resource_uri,
      triple_check: qualityContract.triple_check.map((item) => item.step),
      tradeoff_policy: qualityContract.tradeoff_policy
    },
    playbooks: codingPlaybooks
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
    "- `.vnem/install-guide.md`: setup guide for downloading the pack, refreshing an existing repo install, and connecting the read-only MCP server.",
    "- `.vnem/operating-protocol.md`: universal loop for sensing the repo, routing context, choosing small capabilities, constraining risk, applying the aesthetic perception gate, verifying, and reporting evidence.",
    "- `.vnem/quality-contract.md`: Holistic Excellence, Proactive Enhancement, Intelligent Trade-offs, and the Triple-Check Workflow for balancing performance, visuals, playability, accessibility, maintainability, and safety.",
    "- `.vnem/orchestration-protocol.md`: deterministic routing, reflection, Magentic Coding Workflow, split-and-merge research, and shared-state contracts for multi-agent work.",
    "- `.vnem/precision-execution-protocol.md`: opt-in exact patching, dynamic documentation, stateful terminal feedback, and mutation safety rules for precision-capable MCP clients.",
    "- `.vnem/omniscient-self-healing-protocol.md`: opt-in local semantic code search, red/green healing loops, and ephemeral scripting rules for precision-capable MCP clients.",
    "- `.vnem/coding-protocol.md`: coding execution guide for apps, web apps, features, bug fixes, refactors, repo sensing, plan-first work, and verification loops.",
    "- `.vnem/coding-playbooks.json`: mode-specific execution playbooks for feature slices, root-cause bug fixes, test-first work, refactors, rendered web apps, API/data changes, large changes, reviews, and failure recovery.",
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
    "Auto-use vnem before choosing tools, libraries, frameworks, MCP servers, prompts, evals, search systems, UI approaches, visual aesthetics, game feel, performance strategies, architecture patterns, or upgrade paths. Also auto-use it when the user asks you to build, code, review, debug, optimize, modernize, benchmark, research, compare options, or decide how to implement something.",
    "",
    "Do not turn every reply into a long vnem report. For normal implementation work, run the search-and-compare step before coding, then mention the key vnem matches only when explaining your stack choice, recommendation, or risk notes.",
    "",
    "## Decision Search Protocol",
    "",
    "1. Read `.vnem/operating-protocol.md` and classify the task mode: `build`, `review`, `plan`, `debug`, `prompt`, or `decision`.",
    "2. For coding, app, UI, game, optimization, or production-ready tasks, read `.vnem/quality-contract.md` and apply the Triple-Check Workflow: Analyze, Architect, Review.",
    "3. For complex coding, app, web app, game, or deep research tasks, read `.vnem/orchestration-protocol.md` and choose Single Agent, Orchestrator-Worker, Split-and-Merge, or the bounded reflection loop.",
    "4. Before using mutation-capable precision tools, read `.vnem/precision-execution-protocol.md`; use dry-run exact patching before apply, fetch current docs before framework-specific code, and use only safe terminal checks.",
    "5. Before large-repo traversal or feature/logic proof work, read `.vnem/omniscient-self-healing-protocol.md`; use semantic code search before blind file traversal and red/green verification loops before claiming logic works.",
    "6. For coding tasks, read `.vnem/coding-protocol.md` before editing application code.",
    "7. For implementation/debug/review/refactor/test work, select the closest playbook from `.vnem/coding-playbooks.json` and follow its repo sensing, execution loop, verification ladder, stop conditions, anti-patterns, and final-report fields.",
    "8. Identify the user's task intents in plain words, such as `coding task`, `web app`, `feature build`, `bug fix`, `browser game`, `multi agent orchestration`, `orchestrator worker`, `split and merge`, `reflection loop`, `magentic coding`, `precision execution`, `surgical patch`, `dynamic documentation`, `stateful terminal`, `semantic code search`, `proof engine`, `self healing`, `ephemeral scripting`, `visual polish`, `game feel`, `performance visuals`, `quality gate`, `settings gui`, `code review`, `code simplification`, `memory`, `evals`, `agent payments`, or `MCP server selection`.",
    "9. Read `.vnem/search-index.json` and expand those intents with `intent_aliases`.",
    "10. Select the matching broad rubric from `.vnem/task-rubrics.json` and use its quality bar, approval gates, verification checklist, and output contract.",
    "11. Check `intent_routes` for the closest matching task. Read the listed `read_first` documents before choosing a stack or visual approach.",
    "12. If the task depends on current docs, upstream registries, benchmark claims, MCP discovery, or agent-client behavior, read `.vnem/source-radar.json` before broad web search.",
    "13. Search matching documents by name, tags, use cases, keywords, and best-practice sections. Read `.vnem/best-practices.md` only for matching sections.",
    "14. Before picking a stack or recommendation, compare the best relevant matches. Prefer higher `score`, stronger `source_confidence`, fresher `freshness`, clearer licenses, fewer `risk_flags`, and the smallest sufficient capability.",
    "15. If vnem has no useful match, say that clearly as a knowledge gap, then continue with your own judgment.",
    "16. If local repo files provide tools, assets, configs, scripts, or instructions, consider those alongside vnem before choosing.",
    "",
    "For nontrivial tasks, follow a compact task contract: `mode`, `intent`, `rubric`, `coding playbook`, `orchestration pattern`, `worker roles`, `shared state`, `reflection loop`, `precision execution`, `semantic code search`, `local code index`, `verification tests`, `healing loop`, `ephemeral script`, `documentation fetched`, `patch dry-run`, `safe terminal command`, `quality gate`, `triple check`, `domain balance`, `tradeoff policy`, `read first`, `smallest sufficient capability`, `approval gates`, `perception gate` when visual work is involved, `verification`, and `final report`.",
    "",
    "For coding implementation, follow the coding protocol: sense the repo, find existing patterns, plan nontrivial edits, make the smallest coherent diff, run focused checks first, run broader verification when blast radius justifies it, and report skipped checks honestly.",
    "",
    "For UI, game, canvas, animation, dashboard, conversational-agent, or branded surfaces, read `.vnem/design-architecture.md` and `.vnem/visual-qa-protocol.md`, then follow the perception gate: inspect the actual rendered result, name and fix the ugliest visible issue, verify reward effects follow the user action or game event, and do not deliver if it does not look intentionally polished.",
    "For performance-sensitive visual or game work, do not silently remove visual quality, playability, accessibility, or feedback. Prefer optimized rendering, quality profiles, settings toggles, progressive enhancement, or scoped fallbacks with honest verification.",
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
    "For actual implementation work, route the agent through `.vnem/quality-contract.md`, `.vnem/orchestration-protocol.md`, `.vnem/precision-execution-protocol.md`, `.vnem/omniscient-self-healing-protocol.md`, `.vnem/coding-protocol.md`, and `.vnem/coding-playbooks.json` before editing code. The quality contract prevents silent trade-offs; the orchestration protocol decides whether the task stays single-agent, uses orchestrator-workers, splits research, or enters reflection; the precision protocol defines optional exact patching, current-docs injection, and safe terminal feedback; the omniscient protocol defines optional semantic code search, red/green healing loops, and temporary scripts; the coding protocol defines repo-sensing and verification rules; the playbooks select the concrete loop for feature slices, bug fixes, tests, refactors, rendered web apps, API/data changes, large changes, reviews, or recovery.",
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
    "Before choosing tools, libraries, frameworks, MCP servers, skills, prompts, evals, search systems, UI approaches, visual polish/game feel, performance strategies, architecture patterns, orchestration patterns, or upgrade paths, read `.vnem/AGENTS.md`, follow `.vnem/operating-protocol.md`, apply `.vnem/quality-contract.md`, read `.vnem/orchestration-protocol.md` for complex coding/research workflows, read `.vnem/precision-execution-protocol.md` before using mutation-capable precision tools, read `.vnem/omniscient-self-healing-protocol.md` before semantic search/healing-loop/ephemeral-script workflows, read `.vnem/coding-protocol.md` and `.vnem/coding-playbooks.json` for coding/app/web/feature/debug work, use `.vnem/search-index.json`, read `.vnem/design-architecture.md` and `.vnem/visual-qa-protocol.md` for visual surfaces, and consult `.vnem/agent-workspace.md` only for autonomous developer environment decisions.",
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
    quality_contract: {
      id: qualityContract.id,
      title: qualityContract.title,
      summary: qualityContract.summary,
      url_path: qualityContract.url_path,
      resource_uri: qualityContract.resource_uri,
      principles: qualityContract.principles,
      triple_check: qualityContract.triple_check,
      quality_floor: qualityContract.quality_floor,
      adaptive_effort_modes: qualityContract.adaptive_effort_modes,
      truth_rules: qualityContract.truth_rules,
      design_ambition_rules: qualityContract.design_ambition_rules,
      domain_balance: qualityContract.domain_balance,
      tradeoff_policy: qualityContract.tradeoff_policy,
      source_urls: qualityContract.source_urls
    },
    orchestration_protocol: {
      id: orchestrationProtocol.id,
      title: orchestrationProtocol.title,
      summary: orchestrationProtocol.summary,
      url_path: orchestrationProtocol.url_path,
      resource_uri: orchestrationProtocol.resource_uri,
      routing: orchestrationProtocol.routing,
      reflection_loop: orchestrationProtocol.reflection_loop,
      magentic_coding_roles: orchestrationProtocol.magentic_coding_roles,
      shared_state_fields: orchestrationProtocol.shared_state_fields,
      source_urls: orchestrationProtocol.source_urls
    },
    precision_execution_protocol: {
      id: precisionExecutionProtocol.id,
      title: precisionExecutionProtocol.title,
      summary: precisionExecutionProtocol.summary,
      url_path: precisionExecutionProtocol.url_path,
      resource_uri: precisionExecutionProtocol.resource_uri,
      tools: precisionExecutionProtocol.tools,
      edit_policy: precisionExecutionProtocol.edit_policy,
      documentation_policy: precisionExecutionProtocol.documentation_policy,
      terminal_policy: precisionExecutionProtocol.terminal_policy,
      source_urls: precisionExecutionProtocol.source_urls
    },
    omniscient_self_healing_protocol: {
      id: omniscientSelfHealingProtocol.id,
      title: omniscientSelfHealingProtocol.title,
      summary: omniscientSelfHealingProtocol.summary,
      url_path: omniscientSelfHealingProtocol.url_path,
      resource_uri: omniscientSelfHealingProtocol.resource_uri,
      tools: omniscientSelfHealingProtocol.tools,
      semantic_index_policy: omniscientSelfHealingProtocol.semantic_index_policy,
      proof_engine_policy: omniscientSelfHealingProtocol.proof_engine_policy,
      ephemeral_script_policy: omniscientSelfHealingProtocol.ephemeral_script_policy,
      worker_prompt_additions: omniscientSelfHealingProtocol.worker_prompt_additions,
      source_urls: omniscientSelfHealingProtocol.source_urls
    },
    install_guide: {
      id: installGuide.id,
      title: installGuide.title,
      summary: installGuide.summary,
      url_path: installGuide.url_path,
      resource_uri: installGuide.resource_uri,
      tags: installGuide.tags,
      source_urls: installGuide.source_urls
    },
    coding_protocol: {
      id: codingProtocol.id,
      title: codingProtocol.title,
      summary: codingProtocol.summary,
      url_path: codingProtocol.url_path,
      resource_uri: codingProtocol.resource_uri,
      source_urls: codingProtocol.source_urls,
      tags: codingProtocol.tags
    },
    coding_playbooks: codingPlaybooksJson(),
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
        "coding_playbook",
        "orchestration_pattern",
        "worker_roles",
        "shared_state",
        "reflection_loop",
        "precision_execution",
        "semantic_code_search",
        "local_code_index",
        "verification_tests",
        "healing_loop",
        "ephemeral_script",
        "documentation_fetched",
        "patch_dry_run",
        "safe_terminal_command",
        "quality_gate",
        "triple_check",
        "domain_balance",
        "tradeoff_policy",
        "read_first",
        "repo_sensing",
        "smallest_sufficient_capability",
        "approval_gates",
        "perception_gate",
        "perception_gate.repo_sensing",
        "verification",
        "final_report"
      ],
      read_first_for_build_tasks: ["operating protocol", "quality contract", "orchestration protocol for complex app/game/research work", "precision execution protocol when exact patching/current docs/safe terminal tooling is available", "omniscient self-healing protocol when semantic search/test-healing/ephemeral scripts are available", "coding protocol for app/web/feature/debug/refactor work", "matching coding playbook", "matching task rubric", "matching intent_routes", "design architecture and visual QA protocol when the task is visual or interactive", "matching best-practice documents", "matching source-radar entries when upstream currency matters", "high-signal registry entries", "prompt patterns only when a prompt artifact is requested"],
      evidence_note: ["vnem intents searched", "top matches", "chosen rubric", "chosen coding playbook", "orchestration pattern", "precision execution evidence", "semantic search evidence", "verification/healing-loop evidence", "quality gate verdict", "trade-off warnings", "choice", "why", "verification evidence", "residual uncertainty"]
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
  quality_contract: searchIndex.quality_contract,
  orchestration_protocol: searchIndex.orchestration_protocol,
  precision_execution_protocol: searchIndex.precision_execution_protocol,
  omniscient_self_healing_protocol: searchIndex.omniscient_self_healing_protocol,
  install_guide: searchIndex.install_guide,
  coding_protocol: searchIndex.coding_protocol,
  coding_playbooks: searchIndex.coding_playbooks,
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

function archivePath(value) {
  return String(value).split(path.sep).join("/");
}

const llmsTxt = [
  "# vnem",
  "",
  "Read-only AI booster and perception layer for coding agents.",
  "",
  "Use vnem to recommend current tools, MCPs, skills, evals, security utilities, memory systems, payment rails, identity primitives, and workflow patterns before changing a repo. For coding work, enforce holistic excellence: performance, visuals, playability, accessibility, maintainability, and safety should not be silently traded away.",
  "When installed, vnem should be used automatically for build, code, debug, review, optimization, benchmark, research, and stack/tool decision tasks; no special trigger phrase should be required.",
  "",
  `Safe install command: ${installCommand}`,
  "",
  "Installed files: .vnem/AGENTS.md, .vnem/install-guide.md, .vnem/operating-protocol.md, .vnem/quality-contract.md, .vnem/orchestration-protocol.md, .vnem/precision-execution-protocol.md, .vnem/omniscient-self-healing-protocol.md, .vnem/coding-protocol.md, .vnem/coding-playbooks.json, .vnem/design-architecture.md, .vnem/visual-qa-protocol.md, .vnem/task-rubrics.json, .vnem/search-index.json, .vnem/source-radar.json, .vnem/best-practices.md, .vnem/agent-workspace.md, .vnem/prompt-engineering.md, .vnem/prompt-patterns.json",
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
const qualityContractMarkdownData = qualityContractMarkdown().trimEnd();
const orchestrationProtocolMarkdownData = orchestrationProtocolMarkdown().trimEnd();
const precisionExecutionProtocolMarkdownData = precisionExecutionProtocolMarkdown().trimEnd();
const omniscientSelfHealingProtocolMarkdownData = omniscientSelfHealingProtocolMarkdown().trimEnd();
const installGuideMarkdownData = installGuideMarkdown().trimEnd();
const codingProtocolMarkdownData = codingProtocolMarkdown().trimEnd();
const codingPlaybookData = codingPlaybooksJson();
const designArchitectureMarkdownData = designArchitectureMarkdown().trimEnd();
const visualQaProtocolMarkdownData = visualQaProtocolMarkdown().trimEnd();
const taskRubricData = taskRubricsJson();
const sourceRadarData = sourceRadarJson();
const promptPatternData = promptPatternsJson();
const promptEngineering = promptEngineeringMarkdown(promptPatternData);
const agentWorkspace = agentWorkspaceMarkdown();
const agentInstructions = agentsMarkdown();
const rootAgentInstructions = rootAgentsMarkdown();
const installAdoptionFiles = buildInstallAdoptionFiles(ROOT, { portable: true });
const installAdoptionArchiveFiles = Object.fromEntries(
  Object.entries(installAdoptionFiles).map(([name, content]) => [archivePath(name), content])
);
const archive = createDeterministicTarGzip({
  "AGENTS.md": `${rootAgentInstructions}\n`,
  [`${installFolder}/AGENTS.md`]: `${agentInstructions}\n`,
  [`${installFolder}/install-guide.md`]: `${installGuideMarkdownData}\n`,
  [`${installFolder}/operating-protocol.md`]: `${operatingProtocolMarkdownData}\n`,
  [`${installFolder}/quality-contract.md`]: `${qualityContractMarkdownData}\n`,
  [`${installFolder}/orchestration-protocol.md`]: `${orchestrationProtocolMarkdownData}\n`,
  [`${installFolder}/precision-execution-protocol.md`]: `${precisionExecutionProtocolMarkdownData}\n`,
  [`${installFolder}/omniscient-self-healing-protocol.md`]: `${omniscientSelfHealingProtocolMarkdownData}\n`,
  [`${installFolder}/coding-protocol.md`]: `${codingProtocolMarkdownData}\n`,
  [`${installFolder}/coding-playbooks.json`]: jsonText(codingPlaybookData),
  [`${installFolder}/design-architecture.md`]: `${designArchitectureMarkdownData}\n`,
  [`${installFolder}/visual-qa-protocol.md`]: `${visualQaProtocolMarkdownData}\n`,
  [`${installFolder}/task-rubrics.json`]: jsonText(taskRubricData),
  [`${installFolder}/search-index.json`]: jsonText(searchIndex),
  [`${installFolder}/source-radar.json`]: jsonText(sourceRadarData),
  [`${installFolder}/best-practices.md`]: `${bestPractices}\n`,
  [`${installFolder}/agent-workspace.md`]: `${agentWorkspace}\n`,
  [`${installFolder}/prompt-engineering.md`]: `${promptEngineering}\n`,
  [`${installFolder}/prompt-patterns.json`]: jsonText(promptPatternData),
  ...installAdoptionArchiveFiles
}, { epochSeconds: generationClock.epoch_seconds });

const generatedOutputs = new Map();
const addText = (relativePath, value) => generatedOutputs.set(archivePath(relativePath), Buffer.from(value));
const addJson = (relativePath, value) => addText(relativePath, jsonText(value));
const addBytes = (relativePath, value) => generatedOutputs.set(archivePath(relativePath), Buffer.from(value));
const candidateReport = await latestCandidateReport(ROOT);
const dailyDigest = buildDailyDigest({ generatedAt, registry: index, searchIndex, candidateReport });

addJson("public/api/index.json", index);
addJson("public/install/search-index.json", searchIndex);
addJson(`${installFolder}/search-index.json`, searchIndex);
addJson("public/install/task-rubrics.json", taskRubricData);
addJson(`${installFolder}/task-rubrics.json`, taskRubricData);
addJson("public/install/source-radar.json", sourceRadarData);
addJson(`${installFolder}/source-radar.json`, sourceRadarData);
addJson("public/install/prompt-patterns.json", promptPatternData);
addJson(`${installFolder}/prompt-patterns.json`, promptPatternData);
addText("discovery/daily-digest.md", dailyDigest);
for (const [relativeName, content] of Object.entries(installAdoptionFiles)) {
  const archiveName = archivePath(relativeName);
  const publicName = archiveName.replace(`${installFolder}/`, "");
  addText(archiveName, content);
  addText(`public/install/${publicName}`, content);
}
addBytes(`public/${installArchiveName}`, archive);
addBytes(`landing/${installArchiveName}`, archive);
addText("public/install/AGENTS.md", `${agentInstructions}\n`);
addText(`${installFolder}/AGENTS.md`, `${agentInstructions}\n`);
addText("public/install/install-guide.md", `${installGuideMarkdownData}\n`);
addText(`${installFolder}/install-guide.md`, `${installGuideMarkdownData}\n`);
addText("public/install/operating-protocol.md", `${operatingProtocolMarkdownData}\n`);
addText(`${installFolder}/operating-protocol.md`, `${operatingProtocolMarkdownData}\n`);
addText("public/install/quality-contract.md", `${qualityContractMarkdownData}\n`);
addText(`${installFolder}/quality-contract.md`, `${qualityContractMarkdownData}\n`);
addText("public/install/orchestration-protocol.md", `${orchestrationProtocolMarkdownData}\n`);
addText(`${installFolder}/orchestration-protocol.md`, `${orchestrationProtocolMarkdownData}\n`);
addText("public/install/precision-execution-protocol.md", `${precisionExecutionProtocolMarkdownData}\n`);
addText(`${installFolder}/precision-execution-protocol.md`, `${precisionExecutionProtocolMarkdownData}\n`);
addText("public/install/omniscient-self-healing-protocol.md", `${omniscientSelfHealingProtocolMarkdownData}\n`);
addText(`${installFolder}/omniscient-self-healing-protocol.md`, `${omniscientSelfHealingProtocolMarkdownData}\n`);
addText("public/install/coding-protocol.md", `${codingProtocolMarkdownData}\n`);
addText(`${installFolder}/coding-protocol.md`, `${codingProtocolMarkdownData}\n`);
addJson("public/install/coding-playbooks.json", codingPlaybookData);
addJson(`${installFolder}/coding-playbooks.json`, codingPlaybookData);
addText("public/install/design-architecture.md", `${designArchitectureMarkdownData}\n`);
addText(`${installFolder}/design-architecture.md`, `${designArchitectureMarkdownData}\n`);
addText("public/install/visual-qa-protocol.md", `${visualQaProtocolMarkdownData}\n`);
addText(`${installFolder}/visual-qa-protocol.md`, `${visualQaProtocolMarkdownData}\n`);
addText("public/install/best-practices.md", `${bestPractices}\n`);
addText(`${installFolder}/best-practices.md`, `${bestPractices}\n`);
addText("public/install/agent-workspace.md", `${agentWorkspace}\n`);
addText(`${installFolder}/agent-workspace.md`, `${agentWorkspace}\n`);
addText("public/install/prompt-engineering.md", `${promptEngineering}\n`);
addText(`${installFolder}/prompt-engineering.md`, `${promptEngineering}\n`);
addText("llms.txt", `${llmsTxt}\n`);
addText("llms-full.txt", `${llmsFull}\n`);

for (const [relativePath, bytes] of [...generatedOutputs.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  await writeBytes(path.join(ROOT, relativePath), bytes);
}

const sourcePaths = [
  "generation/metadata.json",
  "package.json",
  "scripts/generate-artifacts.mjs",
  "scripts/generate-digest.mjs",
  "scripts/lib/registry.mjs",
  "scripts/vnem-install-adoption.mjs",
  "scripts/vnem/generation/daily-digest.mjs",
  "scripts/vnem/generation/generated-artifacts.mjs",
  ...records.flatMap((item) => [item.relativeEntryPath, ...(item.profile ? [item.relativeProfilePath] : [])])
];
const artifactManifest = await buildGeneratedArtifactManifest({
  root: ROOT,
  outputs: generatedOutputs,
  sourcePaths,
  sourcePatterns: ["discovery/candidates/hermes*.json"],
  semanticTimestamp: generatedAt,
  timestampSource: generationClock.source,
  generationSettings: {
    install_base_url: installBaseUrl,
    archive_order: "portable_path_ascending",
    archive_header_policy: "normalized_ustar_gzip"
  }
});
await writeJson(path.join(ROOT, ".vnem", "generated-artifacts.json"), artifactManifest);

console.log(`Generated ${generatedOutputs.size} deterministic artifacts for ${entries.length} entries and ${searchIndex.documents.length} search documents.`);
