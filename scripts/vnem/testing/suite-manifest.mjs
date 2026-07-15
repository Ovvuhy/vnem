export const VNEM_FULL_SUITE = Object.freeze([
  "test:agents-rules",
  "test:vnem-mission-language",
  "validate",
  "test:super-library",
  "test:super-library-importer",
  "generate:check",
  "generate",
  "test:giga-deterministic-generation",
  "test:giga-performance-output",
  "test:giga-adoption-client-use",
  "test:giga-final-integration",
  "dashboard:build",
  "test:install-pack",
  "test:orchestration",
  "test:precision",
  "test:tools-mcp",
  "test:tools-browser",
  "test:tools-project-actions",
  "test:tools-giga-app-engineering",
  "test:tools-giga-project-automation",
  "test:tools-giga-game-domain",
  "test:tools-giga-dependency-security",
  "test:tools-giga-structural-code",
  "test:tools-giga-api-connectors",
  "test:tools-giga-skill-runtime",
  "test:tools-giga-current-documentation",
  "test:tools-giga-data-systems",
  "test:tools-giga-cloudflare-deployment",
  "test:tools-git-session",
  "test:tools-intelligence",
  "test:tools-research",
  "test:tools-browser-intelligence",
  "test:tools-browser-research-pack",
  "test:tools-search-power",
  "test:tools-risk-captcha",
  "test:tools-permission-profiles",
  "test:permission-runtime",
  "test:tools-scoped-permissions",
  "test:safety-cli",
  "test:tools-trust-boundary",
  "test:tools-secret-blocking",
  "test:tools-cloudflare-status-auth",
  "test:tools-cloudflare-plans",
  "test:tools-cloudflare-approval-gates",
  "test:tools-cloudflare-redaction",
  "test:tools-cloudflare-evidence-pack",
  "test:tools-quality-general",
  "test:tools-reliability-catalog",
  "test:tools-action-recovery-plan",
  "test:tools-high-power-action-review",
  "test:tools-capability-gap-report",
  "test:tools-quality-2-regression",
  "test:core-permission-planning",
  "test:core-research-strategy",
  "test:core-source-ingestion-planning",
  "test:tools-source-ingestion",
  "test:tools-source-graph",
  "test:research-evidence-audit",
  "test:core-debugging-plan",
  "test:core-evidence-to-fix",
  "test:core-code-quality-contract",
  "test:tools-architecture-review",
  "test:tools-debug-evidence",
  "test:completion-audit-code-quality",
  "test:core-ui-quality-plan",
  "test:core-visual-proof-contract",
  "test:ui-completion-audit",
  "test:tools-ui-surface-review",
  "test:tools-browser-evidence-plan",
  "test:tools-browser-evidence-run",
  "test:tools-ui-evidence-audit",
  "test:browser-evidence-completion-audit",
  "test:core-tool-selection",
  "test:core-tools-ecosystem",
  "test:core-browser-research-planning",
  "test:core-search-planning",
  "test:core-routing-memory-output",
  "test:core-output-quality",
  "test:core-anti-stagnation",
  "test:core-adaptive-effort",
  "test:core-fast-answer-contract",
  "test:core-anti-overhead-audit",
  "test:core-design-ambition",
  "test:core-visual-taste-audit",
  "test:core-redesign-comparison-scorecard",
  "test:core-total-impact-design-plan",
  "test:core-design-direction-selector",
  "test:core-compact-output-contract",
  "test:core-giga-intelligence",
  "test:core-speed-design-2-audit",
  "test:mcp-user-smoke",
  "test:core-tools-e2e",
  "test:omniscient",
  "test:100x-architecture",
  "test:detect-ai-clients",
  "test:clients",
  "test:preview-connector",
  "test:apply-connector",
  "test:app-server",
  "test:dev-health",
  "test:builder-session",
  "test:run-history",
  "test:builder-run",
  "test:builder-capture",
  "test:launch-dev",
  "test:dashboard-connector",
  "test:dashboard-telemetry",
  "test:dashboard-system",
  "test:dashboard-verdicts",
  "test:dashboard-missions",
  "test:dashboard-branch",
  "test:dashboard-work-status",
  "test:dashboard-builder-health",
  "test:dashboard-control-room",
  "test:giving-branch",
  "test:ard-research",
  "test:ard-protection",
  "test:ard-giving",
  "test:ard-pipeline",
  "test:ard-capability-engine",
  "test:ard-dogfood",
  "test:ard-browser-pipeline",
  "test:dashboard-ard",
  "test:dashboard-ard-browser",
  "test:ard-changes-branch",
  "test:dashboard-ard-changes",
  "test:ard-launch",
  "test:dashboard-auth-local",
  "test:building-ai-acceleration",
  "test:public-repo-hygiene",
  "test:precision-mcp",
  "test:tools-precision-subsystem",
  "test:cli",
  "test:mcp",
  "test:dashboard",
  "test:dashboard-api-local",
  "test:hermes-risk",
  "discover:dry-run",
  "digest",
  "test:tools-github-settings",
  "test:tools-github-status-profile",
  "test:tools-github-repo-intelligence",
  "test:tools-github-branch-commit-pr",
  "test:tools-github-issues-actions-ci",
  "test:tools-autonomy-efficiency",
  "test:tools-autonomy-1-regression",
  "test:tools-github-real-exec-paths",
  "test:tools-github-command-builder",
  "test:tools-github-live-readiness",
  "test:tools-github-mutation-dry-run",
  "test:tools-autonomy-2-regression",
  "test:tools-power-tools-1-regression",
  "test:tools-power-tools-2-regression",
  "test:tools-power-session-1-recovery",
  "test:tools-orchestrator-1-regression",
  "test:tools-code-intelligence-1-regression",
  "test:vnem-adoption-reliability-1-regression",
  "test:vnem-adoption-reliability-2-regression",
  "test:vnem-install-adoption-1-regression",
  "test:giga-capability-current",
  "test:giga-baseline"
]);

const SMOKE = Object.freeze([
  "test:agents-rules",
  "test:vnem-mission-language",
  "validate",
  "test:tools-mcp",
  "test:core-tool-selection",
  "test:mcp-user-smoke",
  "test:precision-mcp",
  "test:clients:setup",
  "test:public-repo-hygiene",
  "test:runtime-registry",
  "registry:behavior:check",
  "registry:check"
]);

const PRECISION_COMPAT = Object.freeze([
  "test:precision",
  "test:precision-mcp",
  "test:tools-precision-subsystem"
]);

const CLIENTS = Object.freeze([
  "test:detect-ai-clients",
  "test:clients:setup",
  "test:preview-connector",
  "test:apply-connector",
  "test:cli",
  "test:vnem-install-adoption-1-regression",
  "test:giga-adoption-client-use"
]);

const INTEGRATION_PATTERN = /(?:giga-app-engineering|giga-project-automation|project-actions|browser|app-server|builder|launch-dev|dashboard|ard-|giving-branch|core-tools-e2e|mcp-user-smoke|cloudflare)/;

export function scriptsForTier(tier, affected = []) {
  if (tier === "affected") return unique(affected);
  if (tier === "smoke") return [...SMOKE];
  if (tier === "precision-compat") return [...PRECISION_COMPAT];
  if (tier === "clients") return [...CLIENTS];
  if (tier === "benchmarks") return ["test:giga-baseline:capability", "test:runtime-registry", "registry:behavior:check", "registry:check"];
  if (tier === "core") return VNEM_FULL_SUITE.filter((name) => /^test:core-|^test:mcp-user-smoke$|^test:mcp$|^test:vnem-adoption-/.test(name));
  if (tier === "tools") return unique([...VNEM_FULL_SUITE.filter((name) => /^test:tools-|^test:permission-runtime$|^test:safety-cli$/.test(name)), "test:tools-giga-testing-ci", "test:tools-giga-browser-interaction", "test:tools-giga-windows-local", "test:tools-giga-github-development", "test:tools-giga-game-domain"]);
  if (tier === "integration") return unique([...VNEM_FULL_SUITE.filter((name) => INTEGRATION_PATTERN.test(name)), "test:tools-giga-testing-ci", "test:tools-giga-browser-interaction", "test:tools-giga-windows-local", "test:tools-giga-github-development", "test:tools-giga-game-domain"]);
  if (tier === "full" || tier === "ci") return VNEM_FULL_SUITE.flatMap((script) => {
    if (script === "test:clients") return ["test:clients:setup"];
    if (script === "test:giga-baseline") return ["test:giga-baseline:capability", "test:runtime-registry", "registry:behavior:check", "registry:check"];
    if (script === "test:tools-giga-project-automation") return [script, "test:tools-giga-testing-ci", "test:tools-giga-windows-local", "test:tools-giga-github-development"];
    return script === "test:tools-browser-evidence-run" ? [script, "test:tools-giga-browser-interaction"] : [script];
  });
  throw new Error(`Unknown test tier: ${tier}`);
}

export function stageForScript(script, tier) {
  if (!['full', 'ci'].includes(tier)) return 0;
  if (["test:agents-rules", "test:vnem-mission-language", "validate", "test:super-library", "test:super-library-importer", "generate:check"].includes(script)) return 0;
  if (["generate", "dashboard:build"].includes(script)) return 1;
  if (script === "discover:dry-run") return 3;
  if (script === "digest") return 4;
  if (["test:giga-capability-current", "test:giga-baseline", "test:giga-baseline:capability", "test:runtime-registry", "registry:behavior:check", "registry:check"].includes(script)) return 5;
  return 2;
}

export function manifestResourceHints(script) {
  const resources = [];
  if (["generate", "generate:check", "test:giga-deterministic-generation", "test:giga-final-integration", "test:giga-adoption-client-use", "test:vnem-install-adoption-1-regression", "dashboard:build", "test:install-pack", "discover:dry-run", "digest", "test:giga-baseline"].includes(script)) resources.push("repo-generated-state");
  if (/browser|giga-app-engineering/.test(script)) resources.push("browser-runtime");
  if (/project-actions|giga-project-automation|app-server|dashboard-api-local|launch-dev/.test(script)) resources.push("dev-server-runtime");
  if (/github|git-session|autonomy|power-session|orchestrator/.test(script)) resources.push("git-fixture-runtime");
  return resources;
}

export const RETRY_POLICY = Object.freeze({
  default_attempts: 1,
  infrastructure_attempts: 2,
  enabled_scripts: Object.freeze([]),
  infrastructure_signatures: Object.freeze(["EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "HTTP 429", "rate limit"])
});

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
