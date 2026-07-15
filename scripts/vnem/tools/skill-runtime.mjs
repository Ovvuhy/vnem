import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const SCHEMA_VERSION = "1.0.0";
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_PACKAGE_BYTES = 1024 * 1024;
const MAX_PACKAGE_FILES = 80;
const MAX_PACKAGE_SCRIPTS = 80;
const MAX_PACKAGE_DEPENDENCIES = 500;
const MAX_SCAN_FILES = 120;
const MAX_FINDINGS = 120;
const MAX_SOURCE_BYTES = 256 * 1024;
const SOURCE_TIMEOUT_MS = 15_000;
const STALE_AFTER_DAYS = 120;
const LOCAL_SKILL_SHA256 = "037091f36ea5d72c5f0816f307260099c335063cfd659102180f27207de54f4b";
const SAFE_CLIENTS = ["VNEM Tools MCP over stdio", "generic MCP stdio client"];
const SKIPPED_DIRS = new Set([".git", ".vnem", "node_modules", "dist", "build", "coverage", ".next", ".turbo", ".cache"]);
const SECRET_PATH_RE = /(?:^|\/)(?:\.env(?:\.|$)|\.npmrc$|\.pypirc$|id_(?:rsa|ed25519)$|credentials?(?:\.|$)|secrets?(?:\.|$)|cookies?(?:\.|$))/i;
const SECRET_KEY_RE = /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|credential|cookie)/i;
const SECRET_BEARING_KEY_RE = /(?:^|[_-])(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|credential|cookie)(?:$|[_-](?:raw|value))$/i;
const SECRET_VALUE_RE = /(?:bearer\s+[a-z0-9._~+/-]{8,}|github_pat_[a-z0-9_]{20,}|gh[pousr]_[a-z0-9_]{20,}|sk-[a-z0-9_-]{10,})/i;
const SCRIPT_EXTENSIONS = new Set([".bat", ".cmd", ".js", ".mjs", ".cjs", ".py", ".ps1", ".sh"]);

export const SKILL_RUNTIME_CATEGORIES = Object.freeze([
  category("declarative_guidance", "Structured reviewed guidance only; Markdown remains data and is never evaluated as code.", ["vetted_skill_execute"]),
  category("local_pure_transformation", "Bounded deterministic transformation of supplied non-secret input.", ["vetted_skill_execute"]),
  category("repo_analyzer", "Read-only analysis of regular non-secret files inside an allowed root.", ["vetted_skill_execute"]),
  category("test_verification_adapter", "Test planning or evidence verification; process execution is separately classified.", ["vetted_skill_execute"]),
  category("browser_adapter", "Validation of disclosed browser evidence; browser launch requires the separate browser permission path.", ["vetted_skill_execute"]),
  category("api_backed_adapter", "Pinned bounded network operation requiring explicit network scope; arbitrary URLs are not allowed.", ["skill_execute", "external_fetch"]),
  category("command_backed_adapter", "Exact reviewed project command requiring skill and process permissions.", ["skill_execute", "run_test"]),
  category("unsupported_untrusted_skill", "Unreviewed instructions, scripts, dependencies, or provenance are inspectable but not executable.", [])
]);

const LOCAL_SOURCE = Object.freeze({
  source_kind: "vnem_local_reviewed_skill",
  repository_url: "https://github.com/Ovvuhy/vnem",
  discovery_url: null,
  version_or_commit: `sha256:${LOCAL_SKILL_SHA256}`,
  primary_path: "skills/vnem/SKILL.md",
  license: "MIT",
  license_source: "https://github.com/Ovvuhy/vnem/blob/6c387b5b773de498a5d00f5902073ee3d9dc419d/LICENSE",
  files: [{ kind: "skill", path: "skills/vnem/SKILL.md", sha256: LOCAL_SKILL_SHA256 }],
  source_review: "Local tracked source reviewed as data and normalized into VNEM-owned handlers."
});

const ANTHROPIC_FRONTEND_SOURCE = Object.freeze({
  source_kind: "official_agent_skill_repository",
  repository_url: "https://github.com/anthropics/skills",
  discovery_url: "https://www.skills.sh/anthropics/skills/frontend-design",
  version_or_commit: "9d2f1ae187231d8199c64b5b762e1bdf2244733d",
  primary_path: "skills/frontend-design/SKILL.md",
  license: "Apache-2.0",
  license_source: "skills/frontend-design/LICENSE.txt at the pinned commit",
  files: [
    pinnedFile("skill", "anthropics", "skills", "9d2f1ae187231d8199c64b5b762e1bdf2244733d", "skills/frontend-design/SKILL.md", "decdff43d05908b4c1fc2cfd2d80fc5743440934"),
    pinnedFile("license", "anthropics", "skills", "9d2f1ae187231d8199c64b5b762e1bdf2244733d", "skills/frontend-design/LICENSE.txt", "f433b1a53f5b830a205fd2df78e2b34974656c7b")
  ],
  source_review: "Pinned official repository bytes reviewed; upstream instructions are not executed directly."
});

const VERCEL_REACT_SOURCE = Object.freeze({
  source_kind: "official_agent_skill_repository",
  repository_url: "https://github.com/vercel-labs/agent-skills",
  discovery_url: "https://www.skills.sh/vercel-labs/agent-skills/vercel-react-best-practices",
  version_or_commit: "f8a72b9603728bb92a217a879b7e62e43ad76c81",
  primary_path: "skills/react-best-practices/SKILL.md",
  license: "MIT",
  license_source: "Pinned SKILL.md frontmatter",
  files: [pinnedFile("skill", "vercel-labs", "agent-skills", "f8a72b9603728bb92a217a879b7e62e43ad76c81", "skills/react-best-practices/SKILL.md", "237988de4a66dd8a71d30a2c24ebe1a86b58d04e")],
  source_review: "Pinned official Vercel skill reviewed and reduced to a bounded static analyzer."
});

const MATT_TDD_SOURCE = Object.freeze({
  source_kind: "inspectable_community_agent_skill_repository",
  repository_url: "https://github.com/mattpocock/skills",
  discovery_url: "https://www.skills.sh/mattpocock/skills/tdd",
  version_or_commit: "66898f60e8c744e269f8ce06c2b2b99ce7660d5f",
  primary_path: "skills/engineering/tdd/SKILL.md",
  license: "MIT",
  license_source: "Repository LICENSE at the pinned commit",
  files: [
    pinnedFile("skill", "mattpocock", "skills", "66898f60e8c744e269f8ce06c2b2b99ce7660d5f", "skills/engineering/tdd/SKILL.md", "9a2e1d2a1ad856b0d5903dd002209ff8c32c9a48"),
    pinnedFile("license", "mattpocock", "skills", "66898f60e8c744e269f8ce06c2b2b99ce7660d5f", "LICENSE", "f1dd2c09108dde1a5f56097cee8461b3ea834499")
  ],
  source_review: "Pinned inspectable source reviewed; VNEM owns the executable planning and command policy."
});

const BUILTIN_ADAPTERS = Object.freeze([
  skillAdapter({
    id: "vnem_workflow_guidance",
    name: "VNEM evidence-first workflow guidance",
    source: LOCAL_SOURCE,
    taskTypes: ["coding", "research", "debugging", "tool_selection", "handoff"],
    instructions: ["Classify the task before selecting tools.", "Separate plans from execution claims.", "Require direct evidence for completion."],
    runtimeType: "declarative_guidance",
    handler: "workflowGuidance",
    inputContract: { required: ["task"], optional: ["context", "constraints"] },
    risks: ["Guidance does not itself inspect or mutate the target project."],
    tests: ["scripts/test-tools-giga-skill-runtime.mjs#workflow-guidance"]
  }),
  skillAdapter({
    id: "frontend_design_brief",
    name: "Frontend design direction normalizer",
    source: ANTHROPIC_FRONTEND_SOURCE,
    taskTypes: ["frontend_ui", "website_ui", "design_direction"],
    instructions: ["Choose one coherent visual direction from explicit product context.", "Cover typography, color, composition, motion, responsive states, and accessibility.", "Return decisions and proof requirements, never generated code claims."],
    runtimeType: "local_pure_transformation",
    handler: "frontendDesignBrief",
    inputContract: { required: ["product", "audience"], optional: ["tone", "constraints", "primary_action"] },
    risks: ["A brief is not rendered UI proof.", "Source aesthetics are normalized; upstream prose is not executed."],
    tests: ["scripts/test-tools-giga-skill-runtime.mjs#frontend-design"]
  }),
  skillAdapter({
    id: "react_performance_audit",
    name: "React performance static audit",
    source: VERCEL_REACT_SOURCE,
    taskTypes: ["react", "nextjs", "frontend_performance", "code_review"],
    instructions: ["Inspect bounded React/Next source for high-value performance indicators.", "Attach file and line evidence.", "Keep regex-derived findings explicitly heuristic."],
    runtimeType: "repo_analyzer",
    handler: "reactPerformanceAudit",
    inputContract: { required: [], optional: ["files", "max_files"] },
    filesystemScope: { mode: "allowed_root_read", extensions: [".js", ".jsx", ".ts", ".tsx"], max_files: MAX_SCAN_FILES, symlinks: "blocked" },
    risks: ["Static patterns do not prove runtime cost or framework bundling behavior.", "Findings require human review before refactoring."],
    tests: ["scripts/test-tools-giga-skill-runtime.mjs#react-audit"]
  }),
  skillAdapter({
    id: "tdd_seam_plan",
    name: "Behavior-first TDD seam planner",
    source: MATT_TDD_SOURCE,
    taskTypes: ["testing", "bug_fix", "feature_development", "verification"],
    instructions: ["Bind tests to public behavior seams.", "Create one red-green slice at a time.", "Reject tautological and implementation-coupled proof."],
    runtimeType: "test_verification_adapter",
    handler: "tddSeamPlan",
    inputContract: { required: ["behavior"], optional: ["public_interfaces", "known_failures", "constraints"] },
    filesystemScope: { mode: "allowed_root_read", extensions: [".json", ".md"], max_files: 12, symlinks: "blocked" },
    risks: ["A generated test plan is not a failing test run.", "The user or project contract remains the source of expected behavior."],
    tests: ["scripts/test-tools-giga-skill-runtime.mjs#tdd-plan"]
  }),
  skillAdapter({
    id: "browser_evidence_audit",
    name: "Browser evidence completeness audit",
    source: LOCAL_SOURCE,
    taskTypes: ["browser_verification", "ui_acceptance", "responsive_quality"],
    instructions: ["Verify disclosed screenshot files and viewport metadata.", "Require loading, empty, error, and success states where applicable.", "Reject success when console, network, or accessibility failures remain."],
    runtimeType: "browser_adapter",
    handler: "browserEvidenceAudit",
    inputContract: { required: [], optional: ["desktop", "mobile", "states", "console_errors", "network_failures", "accessibility_violations"] },
    filesystemScope: { mode: "allowed_root_read", extensions: [".png", ".jpg", ".jpeg", ".webp"], max_files: 2, symlinks: "blocked" },
    risks: ["Image hashes and disclosed metadata do not prove every visual detail.", "This adapter validates evidence; it does not launch a browser."],
    tests: ["scripts/test-tools-giga-skill-runtime.mjs#browser-evidence"]
  }),
  skillAdapter({
    id: "research_claim_triage",
    name: "Research claim and source triage",
    source: LOCAL_SOURCE,
    taskTypes: ["research", "source_review", "claim_validation"],
    instructions: ["Rank supplied sources by declared provenance and freshness.", "Group claims by stable identifiers.", "Expose contradictions and missing official support without fetching pages."],
    runtimeType: "local_pure_transformation",
    handler: "researchClaimTriage",
    inputContract: { required: ["sources"], optional: ["freshness_days"] },
    risks: ["Declared source type may be wrong until independently verified.", "No page content is fetched by this adapter."],
    tests: ["scripts/test-tools-giga-skill-runtime.mjs#research-triage"]
  }),
  skillAdapter({
    id: "windows_script_safety_audit",
    name: "Windows script safety audit",
    source: LOCAL_SOURCE,
    taskTypes: ["windows", "powershell", "local_pc_safety", "code_review"],
    instructions: ["Inspect bounded PowerShell and batch files without executing them.", "Report command, persistence, security-control, and download-execute indicators with line evidence.", "Treat absence of findings as bounded static evidence only."],
    runtimeType: "repo_analyzer",
    handler: "windowsScriptSafetyAudit",
    inputContract: { required: [], optional: ["files", "max_files"] },
    filesystemScope: { mode: "allowed_root_read", extensions: [".ps1", ".cmd", ".bat"], max_files: MAX_SCAN_FILES, symlinks: "blocked" },
    risks: ["Obfuscated or runtime-constructed commands may evade static patterns.", "No Windows command is executed."],
    tests: ["scripts/test-tools-giga-skill-runtime.mjs#windows-audit"]
  }),
  skillAdapter({
    id: "mod_profile_safety_audit",
    name: "Mod profile and load-order safety audit",
    source: LOCAL_SOURCE,
    taskTypes: ["games", "modding", "load_order", "manifest_review"],
    instructions: ["Inspect text manifests and load-order files only.", "Detect duplicates, traversal-like paths, unresolved dependencies, and missing backup targets.", "Never execute mods, installers, plugins, or game binaries."],
    runtimeType: "repo_analyzer",
    handler: "modProfileSafetyAudit",
    inputContract: { required: [], optional: ["files", "max_files"] },
    filesystemScope: { mode: "allowed_root_read", extensions: [".json", ".yaml", ".yml", ".toml", ".ini", ".txt"], max_files: 80, symlinks: "blocked" },
    risks: ["Static manifest checks do not prove game-version or binary compatibility.", "Binary patching and plugin execution remain unsupported."],
    tests: ["scripts/test-tools-giga-skill-runtime.mjs#mod-audit"]
  }),
  skillAdapter({
    id: "package_test_verify",
    name: "Reviewed package test verifier",
    source: MATT_TDD_SOURCE,
    taskTypes: ["testing", "verification", "regression_check"],
    instructions: ["Review one exact project-declared test script.", "Default to a non-executing hash-bound command plan.", "Execute only after skill and process permissions match the current review id."],
    runtimeType: "command_backed_adapter",
    handler: "packageTestVerify",
    inputContract: { required: ["script"], optional: ["review_id", "timeout_ms"] },
    filesystemScope: { mode: "allowed_root_read", extensions: [".json"], max_files: 1, symlinks: "blocked" },
    commandScope: { mode: "reviewed_project_test", arbitrary_shell: false, package_scripts_only: true, lifecycle_hooks_reviewed: true, default: "dry_run" },
    permissionActions: ["skill_execute", "run_test"],
    risks: ["Project code can still have side effects despite command-token review.", "Execution is evidence-backed but not a sandbox or proof of total correctness."],
    tests: ["scripts/test-tools-giga-skill-runtime.mjs#package-test-command"]
  })
]);

export class SkillAdapterError extends Error {
  constructor(message, code = "skill_adapter_error", details = {}) {
    super(message);
    this.name = "SkillAdapterError";
    this.code = code;
    this.details = redactDeep(details);
  }
}

export class SkillAdapterRuntime {
  constructor(options = {}) {
    this.allowedRoots = (options.allowedRoots || [process.cwd()]).map((item) => path.resolve(item));
    this.evidenceRoot = path.resolve(options.evidenceRoot || path.join(this.allowedRoots[0], ".vnem", "tool-runs"));
    if (!insideAny(this.evidenceRoot, this.allowedRoots)) throw new SkillAdapterError("Skill evidence root must remain inside an allowed root.", "skill_evidence_root_blocked");
    this.commandRuntime = options.commandRuntime || null;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.environment = options.environment || process.env;
    this.now = options.now || (() => Date.now());
    this.adapters = new Map(BUILTIN_ADAPTERS.map((item) => [item.id, item]));
    this.handlers = new Map([
      ["workflowGuidance", runWorkflowGuidance],
      ["frontendDesignBrief", runFrontendDesignBrief],
      ["reactPerformanceAudit", runReactPerformanceAudit],
      ["tddSeamPlan", runTddSeamPlan],
      ["browserEvidenceAudit", runBrowserEvidenceAudit],
      ["researchClaimTriage", runResearchClaimTriage],
      ["windowsScriptSafetyAudit", runWindowsScriptSafetyAudit],
      ["modProfileSafetyAudit", runModProfileSafetyAudit],
      ["packageTestVerify", runPackageTestVerify]
    ]);
  }

  catalog(args = {}) {
    const runtimeType = String(args.runtime_type || "").trim();
    const taskType = String(args.task_type || "").trim();
    const adapters = [...this.adapters.values()].filter((item) => (!runtimeType || item.runtime_type === runtimeType) && (!taskType || item.supported_task_types.includes(taskType)));
    return {
      schema_version: SCHEMA_VERSION,
      operation_result: "skill_adapter_cataloged",
      adapter_count: adapters.length,
      initial_adapter_count: BUILTIN_ADAPTERS.length,
      adapters: adapters.map(publicAdapter),
      runtime_categories: SKILL_RUNTIME_CATEGORIES.map(clone),
      category_coverage: Object.fromEntries(SKILL_RUNTIME_CATEGORIES.map((item) => [item.id, adapters.filter((adapter) => adapter.runtime_type === item.id).length])),
      marketplace_evaluation: {
        skills_sh: "Discovery source only. Its own documentation says listed skills are routinely audited but quality and security are not guaranteed.",
        official_repositories: "Pinned primary-source commits and file identities are preferred over marketplace rank.",
        arbitrary_markdown_execution: false,
        automatic_installation: false,
        unsupported_or_untrusted_packages: "inspectable but never executable"
      },
      safe_default: "Vetted declarative, pure, evidence-validation, and bounded repo-read adapters may execute under vetted_skill_execute. Process, network, dependencies, credentials, mutation, and outside-root writes require separate exact permission actions.",
      raw_credentials_accepted_or_emitted: false,
      must_not_claim: ["Marketplace popularity proves safety.", "Unreviewed SKILL.md instructions were executed.", "A static skill adapter proved runtime behavior it did not observe."]
    };
  }

  async inspectPackage(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const target = await resolveSkillTarget(root, args.skill_path || "skills/vnem");
    const packageFiles = await collectPackageFiles(target.directory);
    const skillInfo = packageFiles.find((item) => item.relative.toLowerCase() === "skill.md");
    if (!skillInfo) throw new SkillAdapterError("Skill package requires a root SKILL.md file.", "skill_manifest_missing", { skill_path: args.skill_path || "skills/vnem" });
    const markdown = await readBoundedRegularFile(skillInfo.absolute, target.directory, MAX_FILE_BYTES);
    const parsed = parseSkillMarkdown(markdown.text);
    const packageMetadata = await inspectPackageManifests(packageFiles, target.directory);
    const combinedText = [markdown.text, packageMetadata.analysis_text].filter(Boolean).join("\n");
    const codeFiles = packageFiles.filter((item) => SCRIPT_EXTENSIONS.has(path.extname(item.relative).toLowerCase()));
    const requestedPermissions = inferPackagePermissions(combinedText, codeFiles);
    const findings = [...findPackageRisks(combinedText, codeFiles), ...packageMetadata.risk_findings];
    const packageSha256 = hashPackage(packageFiles.map((item) => ({ path: item.relative, sha256: item.sha256 })));
    const reviewedLocalDirectory = await realpath(path.join(this.allowedRoots[0], "skills", "vnem")).catch(() => null);
    const localMatch = reviewedLocalDirectory === target.directory && codeFiles.length === 0 && markdown.sha256 === LOCAL_SKILL_SHA256;
    const runtimeType = localMatch ? "declarative_guidance" : codeFiles.length || packageMetadata.scripts.length ? "command_backed_adapter" : requestedPermissions.includes("external_fetch") ? "api_backed_adapter" : "declarative_guidance";
    return {
      schema_version: SCHEMA_VERSION,
      operation_result: "skill_package_inspected",
      root,
      skill_path: normalizePath(path.relative(root, target.directory)) || ".",
      manifest: parsed.frontmatter,
      manifest_valid: parsed.valid,
      manifest_errors: parsed.errors,
      file_count: packageFiles.length,
      total_bytes: packageFiles.reduce((sum, item) => sum + item.size, 0),
      package_sha256: packageSha256,
      code_files: codeFiles.map((item) => item.relative),
      package_manifests: packageMetadata.manifests,
      package_scripts: packageMetadata.scripts,
      dependencies: packageMetadata.dependencies,
      dependency_count: packageMetadata.dependencies.length,
      package_manifest_errors: packageMetadata.errors,
      requested_permissions: requestedPermissions,
      inferred_runtime_type: runtimeType,
      risk_findings: findings,
      trust_status: localMatch ? "vetted_local_source_match" : "unsupported_untrusted_skill",
      executable: false,
      instructions_executed: false,
      safe_next_step: localMatch ? "Use the reviewed vnem_workflow_guidance adapter." : "Review provenance, exact version, license, scripts, dependencies, permissions, tests, and evidence before writing a VNEM-owned adapter.",
      must_not_claim: ["The package is safe because SKILL.md parsed.", "Scripts or Markdown were executed.", "Unknown dependencies or network instructions were approved."]
    };
  }

  async doctor(args = {}) {
    const selected = args.adapter_id ? [this.requireAdapter(args.adapter_id)] : [...this.adapters.values()];
    const checks = [];
    for (const adapter of selected) checks.push(await this.doctorAdapter(adapter));
    return {
      schema_version: SCHEMA_VERSION,
      operation_result: checks.every((item) => item.ready) ? "skill_doctor_ready" : "skill_doctor_blocked",
      ready: checks.every((item) => item.ready),
      adapter_count: checks.length,
      ready_count: checks.filter((item) => item.ready).length,
      blocked_count: checks.filter((item) => !item.ready).length,
      checks,
      checked_contracts: ["source", "version", "license", "manifest", "runtime handler", "requested permissions", "dependencies", "tests", "known risks", "stale verification", "compatibility", "evidence"],
      what_is_not_proven: ["Pinned external bytes have not been re-fetched unless skill source verification was run.", "Generic MCP proof does not prove every named client installation.", "Static adapters preserve their stated analysis limits."]
    };
  }

  async plan(args = {}) {
    const adapter = this.requireAdapter(args.adapter_id);
    const input = normalizeAdapterInput(args.input);
    assertNoRawCredentials(input);
    const root = await this.resolveRoot(args.root || ".");
    const base = {
      schema_version: SCHEMA_VERSION,
      operation_result: "skill_adapter_planned",
      adapter_id: adapter.id,
      name: adapter.name,
      runtime_type: adapter.runtime_type,
      trust_status: adapter.trust_status,
      root,
      input_contract: clone(adapter.input_contract),
      permission_actions: [...adapter.permission_actions],
      filesystem_scope: clone(adapter.filesystem_scope),
      network_scope: clone(adapter.network_scope),
      command_scope: clone(adapter.command_scope),
      instructions_executed_as_code: false,
      executed: false,
      risks: [...adapter.risk_findings],
      evidence_contract: clone(adapter.evidence)
    };
    validateRequiredInput(adapter, input);
    if (adapter.handler !== "packageTestVerify") return base;
    if (!this.commandRuntime) throw new SkillAdapterError("Command-backed skill runtime is unavailable.", "skill_command_runtime_unavailable");
    const script = safeText(input.script, "script", 120);
    const review = await this.commandRuntime.reviewCommand({ root, mode: "project_script", script, timeout_ms: clamp(input.timeout_ms, 1_000, 120_000, 30_000) });
    if (review.permission_action !== "run_test") throw new SkillAdapterError("Skill test verifier accepts test-class project scripts only.", "skill_command_scope_blocked", { script, permission_action: review.permission_action });
    return { ...base, command_review: review, permission_actions: unique(["skill_execute", review.permission_action]), dry_run_default: true };
  }

  async execute(args = {}) {
    const plan = await this.plan(args);
    const adapter = this.requireAdapter(plan.adapter_id);
    const input = normalizeAdapterInput(args.input);
    if (adapter.runtime_type === "command_backed_adapter" && args.dry_run !== false) return { ...plan, dry_run: true, safe_next_step: "Grant the exact skill_execute and run_test scopes, then re-submit dry_run=false with the current review_id." };
    assertPermissionDecisions(plan.permission_actions, args.permission_decisions);
    let output;
    if (adapter.handler === "packageTestVerify") {
      const reviewId = safeText(input.review_id || args.review_id, "review_id", 200);
      output = await this.commandRuntime.runCommand({ root: plan.root, mode: "project_script", script: input.script, review_id: reviewId, dry_run: false, timeout_ms: clamp(input.timeout_ms, 1_000, 120_000, 30_000) });
    } else {
      const handler = this.handlers.get(adapter.handler);
      if (!handler) throw new SkillAdapterError("Reviewed skill adapter handler is missing.", "skill_handler_missing", { adapter_id: adapter.id });
      output = await handler({ runtime: this, adapter, root: plan.root, input });
    }
    const result = {
      schema_version: SCHEMA_VERSION,
      operation_result: adapter.runtime_type === "command_backed_adapter" ? "skill_adapter_command_completed" : "skill_adapter_executed",
      adapter_id: adapter.id,
      runtime_type: adapter.runtime_type,
      trust_status: adapter.trust_status,
      executed: true,
      instructions_executed_as_code: false,
      permission_actions: [...plan.permission_actions],
      output: redactDeep(output),
      evidence_contract: clone(adapter.evidence),
      must_not_claim: adapter.risk_findings
    };
    result.evidence = await this.writeEvidence("execution", result);
    return result;
  }

  sourceVerificationPlan(args = {}) {
    const adapter = this.requireAdapter(args.adapter_id);
    const remoteFiles = (adapter.source.files || []).filter((item) => item.url && item.git_blob_sha);
    if (!remoteFiles.length) throw new SkillAdapterError("This adapter uses a local source verified by the skill doctor.", "skill_source_is_local", { adapter_id: adapter.id });
    return {
      schema_version: SCHEMA_VERSION,
      operation_result: "skill_source_verification_planned",
      adapter_id: adapter.id,
      repository_url: adapter.source.repository_url,
      version_or_commit: adapter.version_or_commit,
      files: remoteFiles.map((item) => ({ kind: item.kind, path: item.path, url: item.url, expected_git_blob_sha: item.git_blob_sha })),
      permission_actions: ["external_fetch"],
      content_will_be_executed: false,
      output_content_included: false,
      bounds: { max_file_bytes: MAX_SOURCE_BYTES, timeout_ms: SOURCE_TIMEOUT_MS, redirect: "error", allowed_origin: "https://raw.githubusercontent.com" }
    };
  }

  async verifySource(args = {}) {
    const plan = this.sourceVerificationPlan(args);
    assertPermissionDecisions(plan.permission_actions, args.permission_decisions);
    const testMap = parseTestSourceMap(this.environment);
    const files = [];
    for (const item of plan.files) {
      const testOverride = testMap[item.url] || null;
      const targetUrl = testOverride?.url || item.url;
      const expected = testOverride?.git_blob_sha || item.expected_git_blob_sha;
      validatePinnedSourceUrl(targetUrl, Boolean(testOverride));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
      try {
        const response = await this.fetchImpl(targetUrl, { method: "GET", redirect: "error", signal: controller.signal, headers: { Accept: "text/plain", "User-Agent": "VNEM/1.0" } });
        if (!response.ok) throw new SkillAdapterError("Pinned skill source returned a non-success status.", "skill_source_http_failed", { path: item.path, status: response.status });
        const bytes = await readBoundedResponse(response, MAX_SOURCE_BYTES);
        const actualBlob = gitBlobSha(bytes);
        files.push({
          kind: item.kind,
          path: item.path,
          status: response.status,
          bytes: bytes.length,
          sha256: sha256(bytes),
          expected_git_blob_sha: expected,
          actual_git_blob_sha: actualBlob,
          exact_match: actualBlob === expected,
          test_override: Boolean(testOverride),
          content_executed: false,
          content_returned: false
        });
      } catch (error) {
        if (error instanceof SkillAdapterError) throw error;
        const code = error?.name === "AbortError" ? "skill_source_timeout" : "skill_source_network_failed";
        throw new SkillAdapterError("Pinned skill source verification failed.", code, { path: item.path, message: error?.message || String(error) });
      } finally {
        clearTimeout(timer);
      }
    }
    const result = {
      schema_version: SCHEMA_VERSION,
      operation_result: files.every((item) => item.exact_match) ? "skill_source_verified" : "skill_source_mismatch",
      adapter_id: plan.adapter_id,
      repository_url: plan.repository_url,
      version_or_commit: plan.version_or_commit,
      verified_at: new Date(this.now()).toISOString(),
      files,
      exact_match: files.every((item) => item.exact_match),
      content_executed: false,
      raw_source_content_returned: false,
      safe_to_claim: files.every((item) => item.exact_match) ? ["The fetched primary-source bytes matched the pinned Git blob identities."] : [],
      must_not_claim: ["The upstream skill is permanently safe or current.", "Fetched Markdown or scripts were executed.", "Marketplace popularity proves trust."]
    };
    result.evidence = await this.writeEvidence("source-verification", result);
    return result;
  }

  requireAdapter(id) {
    const adapter = this.adapters.get(String(id || "").trim());
    if (!adapter) throw new SkillAdapterError("Reviewed skill adapter was not found.", "skill_adapter_not_found", { adapter_id: id || null });
    return adapter;
  }

  async doctorAdapter(adapter) {
    const contractErrors = validateSkillContract(adapter, this.handlers);
    const sourceChecks = { kind: adapter.source.source_kind, version_or_commit: adapter.version_or_commit, license: adapter.license, pinned_files: (adapter.source.files || []).length, local_hash_match: null, external_refetch_required_for_current_proof: adapter.source.source_kind !== "vnem_local_reviewed_skill" };
    if (adapter.source.source_kind === "vnem_local_reviewed_skill") {
      try {
        const file = await this.resolveAllowedFile(this.allowedRoots[0], adapter.source.primary_path, MAX_FILE_BYTES);
        sourceChecks.local_hash_match = file.sha256 === LOCAL_SKILL_SHA256;
        if (!sourceChecks.local_hash_match) contractErrors.push("local_source_hash_mismatch");
      } catch (error) {
        sourceChecks.local_hash_match = false;
        contractErrors.push(error.code || "local_source_unreadable");
      }
    }
    const ageDays = Math.max(0, Math.floor((this.now() - Date.parse(`${adapter.last_verified}T00:00:00.000Z`)) / 86_400_000));
    const stale = !Number.isFinite(ageDays) || ageDays > STALE_AFTER_DAYS;
    if (stale) contractErrors.push("source_verification_stale");
    return {
      adapter_id: adapter.id,
      ready: contractErrors.length === 0,
      source: sourceChecks,
      manifest_complete: contractErrors.filter((item) => item.startsWith("missing:")).length === 0,
      runtime_handler: { id: adapter.handler, present: this.handlers.has(adapter.handler) },
      requested_permissions: [...adapter.permission_actions],
      dependencies: clone(adapter.dependency_requirements),
      tests: [...adapter.tests],
      known_risks: [...adapter.risk_findings],
      stale_verification: stale,
      verification_age_days: ageDays,
      compatibility: clone(adapter.compatibility),
      evidence: clone(adapter.evidence),
      errors: unique(contractErrors)
    };
  }

  async resolveRoot(input = ".") {
    const base = this.allowedRoots[0];
    const candidate = path.isAbsolute(input) ? path.resolve(input) : path.resolve(base, input);
    if (!insideAny(candidate, this.allowedRoots)) throw new SkillAdapterError("Skill adapter root is outside allowed roots.", "skill_root_outside_allowed", { root: input });
    const resolved = await realpath(candidate).catch(() => null);
    if (!resolved || !insideAny(resolved, this.allowedRoots)) throw new SkillAdapterError("Skill adapter root is missing or escapes allowed roots.", "skill_root_invalid", { root: input });
    const info = await stat(resolved);
    if (!info.isDirectory()) throw new SkillAdapterError("Skill adapter root must be a directory.", "skill_root_not_directory", { root: input });
    return resolved;
  }

  async resolveAllowedFile(root, file, maxBytes = MAX_FILE_BYTES) {
    const candidate = path.isAbsolute(file) ? path.resolve(file) : path.resolve(root, file);
    if (!insidePath(root, candidate) || !insideAny(candidate, this.allowedRoots)) throw new SkillAdapterError("Skill adapter file escapes the allowed project root.", "skill_file_escape", { file });
    const info = await lstat(candidate).catch(() => null);
    if (!info || !info.isFile() || info.isSymbolicLink() || info.size > maxBytes) throw new SkillAdapterError("Skill adapter file must be a bounded regular file.", "skill_file_invalid", { file, max_bytes: maxBytes });
    const resolved = await realpath(candidate);
    if (!insidePath(root, resolved) || !insideAny(resolved, this.allowedRoots)) throw new SkillAdapterError("Skill adapter file resolves outside allowed roots.", "skill_file_link_escape", { file });
    const buffer = await readFile(resolved);
    return { absolute: resolved, relative: normalizePath(path.relative(root, resolved)), buffer, text: buffer.toString("utf8"), size: buffer.length, sha256: sha256(buffer) };
  }

  async writeEvidence(kind, value) {
    const directory = path.join(this.evidenceRoot, "skill-runtime");
    await mkdir(directory, { recursive: true });
    const resolved = await realpath(directory);
    if (!insideAny(resolved, this.allowedRoots)) throw new SkillAdapterError("Skill evidence directory escaped allowed roots.", "skill_evidence_escape");
    const id = `skill-${kind}-${new Date(this.now()).toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
    const file = path.join(resolved, `${id}.json`);
    const serialized = `${JSON.stringify(redactDeep(value), null, 2)}\n`;
    if (Buffer.byteLength(serialized) > 2 * 1024 * 1024) throw new SkillAdapterError("Skill evidence exceeded its bounded size.", "skill_evidence_too_large");
    await writeFile(file, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return { evidence_id: id, path: normalizePath(path.relative(this.allowedRoots[0], file)), sha256: sha256(serialized), raw_credentials_exposed: false };
  }
}

async function runWorkflowGuidance({ input }) {
  const task = safeText(input.task, "task", 4_000);
  const context = safeOptionalText(input.context, 4_000);
  const constraints = stringArray(input.constraints, 20, 300);
  const domains = unique([
    /frontend|ui|website|design/i.test(task) ? "user-visible quality" : null,
    /test|bug|debug|failure/i.test(task) ? "verification and diagnosis" : null,
    /api|network|provider/i.test(task) ? "external source boundary" : null,
    /windows|powershell|service|registry/i.test(task) ? "local machine boundary" : null,
    /game|mod|roblox|luau/i.test(task) ? "game/mod compatibility" : null,
    /repo|code|refactor|implement/i.test(task) ? "repository implementation" : null,
    "evidence truth"
  ].filter(Boolean));
  return {
    task,
    context_present: Boolean(context),
    domains,
    workflow: ["inspect the real current state", "select the smallest capable adapter", "plan trust and permission boundaries", "execute only supported actions", "run focused verification", "compare claims with evidence"],
    constraints,
    completion_contract: ["implementation path exists", "checks actually ran", "side effects and permissions are disclosed", "remaining unknowns are explicit"],
    safe_next_step: `Inspect the current ${domains[0]} evidence before selecting mutation-capable tools.`
  };
}

async function runFrontendDesignBrief({ input }) {
  const product = safeText(input.product, "product", 500);
  const audience = safeText(input.audience, "audience", 500);
  const tone = safeOptionalText(input.tone, 300) || "purposeful and domain-specific";
  const primaryAction = safeOptionalText(input.primary_action, 300) || "the user's most common task";
  const constraints = stringArray(input.constraints, 20, 300);
  const domain = /dashboard|admin|operations|developer/i.test(product) ? "dense operational" : /game|music|creative|event/i.test(product) ? "expressive interactive" : "clear product";
  return {
    product,
    audience,
    direction: `${domain} interface with a ${tone} point of view`,
    primary_action: primaryAction,
    decisions: {
      hierarchy: `Make ${primaryAction} visually and semantically dominant without hiding secondary workflows.`,
      typography: "Use one readable body family and one deliberate display treatment only where hierarchy needs it.",
      color: "Use semantic surface, text, border, status, and action tokens with measured contrast; avoid a one-hue wash.",
      composition: domain === "dense operational" ? "Prefer aligned tables, toolbars, and stable responsive tracks." : "Use a strong focal composition while preserving a complete first workflow.",
      motion: "Reserve motion for state transitions and feedback, respect reduced-motion preferences, and avoid ornamental delay.",
      responsive: "Preserve controls, labels, and reading order at narrow widths without horizontal clipping."
    },
    required_states: ["loading", "empty", "error", "success", "disabled or permission-blocked where relevant"],
    proof: ["desktop screenshot", "mobile screenshot", "keyboard/focus check", "console and network evidence", "primary user path"],
    constraints,
    not_proven: ["No UI was rendered or inspected by this pure adapter."]
  };
}

async function runReactPerformanceAudit({ runtime, root, input }) {
  const files = await collectTextFiles(runtime, root, input.files, new Set([".js", ".jsx", ".ts", ".tsx"]), clamp(input.max_files, 1, MAX_SCAN_FILES, 60));
  const findings = [];
  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/from\s+["'][^"']+\/index(?:\.[cm]?[jt]sx?)?["']/.test(line)) findings.push(finding(file.relative, index + 1, "bundle-index-import", "high", "Direct index-module import may widen a bundle; verify the package export map and import the narrow module when supported.", line));
      if (/useState\s*\(\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/.test(line)) findings.push(finding(file.relative, index + 1, "rerender-lazy-state-init", "medium", "An eager function call in useState may repeat work on renders; verify whether a lazy initializer is appropriate.", line));
      if (/addEventListener\s*\(\s*["'](?:scroll|touchmove|wheel)["']/.test(line) && !/passive\s*:\s*true/.test(line)) findings.push(finding(file.relative, index + 1, "client-passive-event-listener", "medium", "High-frequency listener has no same-line passive option; inspect the full registration before changing it.", line));
      if (/^\s*const\s+[A-Z][A-Za-z0-9_$]*\s*=\s*\([^)]*\)\s*=>/.test(line) && lines.slice(Math.max(0, index - 12), index).some((item) => /function\s+[A-Z]|const\s+[A-Z].*=>/.test(item))) findings.push(finding(file.relative, index + 1, "rerender-inline-component", "low", "A component-like declaration may be nested inside another component and recreated per render; confirm lexical context.", line));
    }
    const awaitLines = lines.map((line, index) => ({ line, index })).filter((item) => /\bawait\b/.test(item.line) && !/Promise\.all/.test(item.line));
    for (let index = 1; index < awaitLines.length; index += 1) {
      const previous = awaitLines[index - 1];
      const current = awaitLines[index];
      if (current.index - previous.index <= 6) findings.push(finding(file.relative, current.index + 1, "async-sequential-await", "medium", "Nearby awaits may form a waterfall; verify dependency before considering parallel execution.", current.line));
    }
    for (const match of file.text.matchAll(/useEffect\s*\([\s\S]{0,600}?\bset[A-Z][A-Za-z0-9_$]*\s*\(/g)) {
      const lineNumber = file.text.slice(0, match.index).split(/\r?\n/).length;
      findings.push(finding(file.relative, lineNumber, "rerender-derived-state-effect", "medium", "An effect appears to set React state; verify whether the value can be derived during render or moved to the triggering event.", lines[lineNumber - 1] || ""));
    }
  }
  return {
    scanned_files: files.length,
    scanned_bytes: files.reduce((sum, item) => sum + item.size, 0),
    findings: findings.slice(0, MAX_FINDINGS),
    finding_count: findings.length,
    truncated: findings.length > MAX_FINDINGS,
    rules_checked: ["bundle-index-import", "rerender-lazy-state-init", "client-passive-event-listener", "rerender-inline-component", "async-sequential-await", "rerender-derived-state-effect"],
    confidence: "bounded_static_heuristics",
    not_proven: ["Runtime timing, bundle output, React profiler behavior, and framework compiler transformations were not measured."]
  };
}

async function runTddSeamPlan({ root, input }) {
  const behavior = safeText(input.behavior, "behavior", 2_000);
  const publicInterfaces = stringArray(input.public_interfaces, 20, 300);
  const knownFailures = stringArray(input.known_failures, 20, 500);
  const pkg = await readJsonIfPresent(path.join(root, "package.json"));
  const scripts = Object.keys(pkg?.scripts || {}).filter((name) => /^test(?::|$)|^(?:validate|check|lint|typecheck)(?::|$)/.test(name));
  const seams = publicInterfaces.length ? publicInterfaces : inferSeams(behavior);
  return {
    behavior,
    agreed_seams_required: publicInterfaces.length === 0,
    proposed_seams: seams,
    first_red_test: {
      name: behaviorToTestName(behavior),
      arrange: `Prepare the smallest fixture at ${seams[0] || "the public boundary"}.`,
      act: `Exercise ${seams[0] || "the public behavior"} once.`,
      assert: "Compare against an independently stated expected result and observe the initial failure."
    },
    cycle: ["record the chosen public seam", "run one failing behavior test", "implement the minimum passing behavior", "rerun the exact test", "review for implementation coupling before the next slice"],
    anti_pattern_checks: ["no private-method assertions", "no expected value recomputed by production logic", "no bulk imagined test suite before the first slice", "no green claim without captured failing-then-passing evidence"],
    known_failures: knownFailures,
    available_test_scripts: scripts,
    recommended_script: scripts.find((name) => /^test:/.test(name)) || scripts[0] || null,
    execution_adapter: "package_test_verify",
    not_proven: ["No test was written or run by this planning adapter."]
  };
}

async function runBrowserEvidenceAudit({ runtime, root, input }) {
  const desktop = await inspectBrowserEvidenceFile(runtime, root, input.desktop, "desktop");
  const mobile = await inspectBrowserEvidenceFile(runtime, root, input.mobile, "mobile");
  const states = unique(stringArray(input.states, 20, 80).map((item) => item.toLowerCase()));
  const consoleErrors = stringArray(input.console_errors, 50, 500);
  const networkFailures = stringArray(input.network_failures, 50, 500);
  const accessibilityViolations = stringArray(input.accessibility_violations, 50, 500);
  const requiredStates = ["loading", "empty", "error", "success"];
  const missingStates = requiredStates.filter((item) => !states.includes(item));
  const blockers = [
    desktop ? null : "desktop screenshot evidence missing",
    mobile ? null : "mobile screenshot evidence missing",
    desktop && desktop.viewport_width < 768 ? "desktop viewport is too narrow for desktop proof" : null,
    mobile && mobile.viewport_width > 767 ? "mobile viewport is too wide for mobile proof" : null,
    ...missingStates.map((item) => `${item} state not evidenced`),
    ...consoleErrors.map((item) => `console: ${item}`),
    ...networkFailures.map((item) => `network: ${item}`),
    ...accessibilityViolations.map((item) => `accessibility: ${item}`)
  ].filter(Boolean);
  return {
    verdict: blockers.length ? "incomplete" : "complete",
    desktop,
    mobile,
    states,
    missing_states: missingStates,
    console_error_count: consoleErrors.length,
    network_failure_count: networkFailures.length,
    accessibility_violation_count: accessibilityViolations.length,
    blockers,
    proof_scope: "disclosed screenshot file identity, viewport metadata, states, console, network, and accessibility lists",
    not_proven: ["Screenshot pixels were not semantically reviewed by this adapter.", "Undisclosed browser events cannot be inferred."]
  };
}

async function runResearchClaimTriage({ input }) {
  const sources = Array.isArray(input.sources) ? input.sources.slice(0, 50).map(normalizeResearchSource) : [];
  if (!sources.length) throw new SkillAdapterError("Research triage requires at least one supplied source.", "skill_research_sources_required");
  const freshnessDays = clamp(input.freshness_days, 1, 3650, 180);
  const now = Date.now();
  const claims = new Map();
  for (const source of sources) {
    for (const claim of source.claims) {
      const current = claims.get(claim.id) || [];
      current.push({ source_id: source.id, stance: claim.stance, statement: claim.statement });
      claims.set(claim.id, current);
    }
  }
  const contradictionGroups = [...claims.entries()].filter(([, values]) => new Set(values.map((item) => item.stance)).size > 1).map(([id, values]) => ({ claim_id: id, positions: values }));
  const ranked = sources.map((source) => {
    const ageDays = source.published_at ? Math.max(0, Math.floor((now - Date.parse(source.published_at)) / 86_400_000)) : null;
    const provenance = source.source_type === "official" ? 3 : source.source_type === "primary" ? 2 : source.source_type === "community" ? 1 : 0;
    const score = provenance * 10 + (source.content_hash ? 3 : 0) + (ageDays !== null && ageDays <= freshnessDays ? 2 : 0);
    return { ...source, age_days: ageDays, stale: ageDays === null || ageDays > freshnessDays, rank_score: score };
  }).sort((a, b) => b.rank_score - a.rank_score || a.id.localeCompare(b.id));
  return {
    source_count: ranked.length,
    ranked_sources: ranked,
    contradiction_groups: contradictionGroups,
    unsupported_claims: [...claims.entries()].filter(([, values]) => !values.some((item) => ranked.find((source) => source.id === item.source_id)?.source_type === "official")).map(([id]) => id),
    context_injection: ranked.slice(0, 6).map((source) => ({ id: source.id, url: source.url, source_type: source.source_type, stale: source.stale, claim_ids: source.claims.map((item) => item.id) })),
    not_proven: ["Source declarations and hashes were supplied by the caller and were not fetched or independently authenticated."]
  };
}

async function runWindowsScriptSafetyAudit({ runtime, root, input }) {
  const files = await collectTextFiles(runtime, root, input.files, new Set([".ps1", ".cmd", ".bat"]), clamp(input.max_files, 1, MAX_SCAN_FILES, 60));
  const rules = [
    ["encoded-command", /-(?:enc|encodedcommand)\b/i, "critical", "Encoded PowerShell can hide behavior."],
    ["dynamic-evaluation", /\b(?:Invoke-Expression|iex)\b/i, "high", "Dynamic evaluation expands command-injection risk."],
    ["download-execute", /(?:Invoke-WebRequest|iwr|curl|wget).*(?:\||Invoke-Expression|Start-Process|&\s*)/i, "critical", "Download-and-execute chain requires separate artifact review."],
    ["security-control-change", /\b(?:Set-MpPreference|Add-MpPreference|DisableRealtimeMonitoring|netsh\s+advfirewall)\b/i, "critical", "Security-control mutation is outside a review-only skill."],
    ["persistence-change", /\b(?:New-Service|sc(?:\.exe)?\s+create|Register-ScheduledTask|schtasks\s+\/create|CurrentVersion\\Run)\b/i, "high", "Persistence-related change requires exact local-PC permission and rollback."],
    ["registry-mutation", /\b(?:Set-ItemProperty|New-ItemProperty|reg(?:\.exe)?\s+(?:add|delete))\b/i, "high", "Registry mutation requires exact scope and backup."],
    ["recursive-delete", /\b(?:Remove-Item\b.*-Recurse|rmdir\s+\/s|del\s+\/s)\b/i, "high", "Recursive deletion requires independently verified target bounds."]
  ];
  const findings = [];
  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) for (const [id, regex, severity, message] of rules) if (regex.test(lines[index])) findings.push(finding(file.relative, index + 1, id, severity, message, lines[index]));
  }
  return {
    scanned_files: files.length,
    findings: findings.slice(0, MAX_FINDINGS),
    finding_count: findings.length,
    truncated: findings.length > MAX_FINDINGS,
    rules_checked: rules.map((item) => item[0]),
    commands_executed: 0,
    verdict: findings.some((item) => ["critical", "high"].includes(item.severity)) ? "review_required" : "no_high_risk_pattern_observed",
    not_proven: ["Static text patterns do not deobfuscate every PowerShell or batch behavior."]
  };
}

async function runModProfileSafetyAudit({ runtime, root, input }) {
  const allowed = new Set([".json", ".yaml", ".yml", ".toml", ".ini", ".txt"]);
  const files = await collectTextFiles(runtime, root, input.files, allowed, clamp(input.max_files, 1, 80, 40), isModManifestPath);
  const findings = [];
  const identifiers = new Map();
  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    const entries = lines.map((line) => line.trim()).filter((line) => line && !/^[#;]/.test(line));
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/(?:^|["'=\s])\.\.\//.test(line) || /(?:^|["'=\s])\.\.\\/.test(line)) findings.push(finding(file.relative, index + 1, "path-traversal-reference", "high", "Manifest references a parent path; verify extraction and load roots.", line));
      if (/\b(?:http|https):\/\//i.test(line)) findings.push(finding(file.relative, index + 1, "remote-resource-reference", "medium", "Manifest contains a remote resource reference that requires separate download and reputation review.", line));
    }
    for (const entry of entries) {
      const normalized = entry.replace(/^[-+*!\s]+/, "").toLowerCase();
      if (!normalized || normalized.length > 240) continue;
      const seen = identifiers.get(normalized) || [];
      seen.push(file.relative);
      identifiers.set(normalized, seen);
    }
    if (path.extname(file.relative).toLowerCase() === ".json") {
      try { JSON.parse(file.text); } catch { findings.push(finding(file.relative, 1, "invalid-json", "high", "JSON manifest does not parse.", "")); }
    }
    if ([".yaml", ".yml"].includes(path.extname(file.relative).toLowerCase())) {
      try { yaml.load(file.text, { schema: yaml.FAILSAFE_SCHEMA, json: true }); } catch { findings.push(finding(file.relative, 1, "invalid-yaml", "high", "YAML manifest does not parse under the failsafe schema.", "")); }
    }
  }
  for (const [id, locations] of identifiers) if (locations.length > 1) findings.push({ rule_id: "duplicate-load-entry", severity: "medium", message: "The same normalized load entry appears more than once.", identifier: truncate(redactText(id), 120), files: unique(locations) });
  return {
    scanned_files: files.length,
    manifests: files.map((item) => item.relative),
    findings: findings.slice(0, MAX_FINDINGS),
    finding_count: findings.length,
    truncated: findings.length > MAX_FINDINGS,
    backup_targets: files.map((item) => ({ path: item.relative, sha256: item.sha256, bytes: item.size })),
    binaries_or_installers_executed: 0,
    verdict: findings.some((item) => item.severity === "high") ? "blocked_pending_review" : "static_review_complete",
    not_proven: ["Game version, loader behavior, binary compatibility, account state, and runtime load order were not executed."]
  };
}

async function runPackageTestVerify() {
  throw new SkillAdapterError("Command-backed adapter must execute through the reviewed command runtime.", "skill_command_dispatch_error");
}

function skillAdapter(options) {
  const source = clone(options.source);
  return deepFreeze({
    id: options.id,
    name: options.name,
    source,
    version_or_commit: source.version_or_commit,
    license: source.license,
    supported_clients: [...SAFE_CLIENTS],
    supported_task_types: options.taskTypes,
    instructions: options.instructions,
    runtime_type: options.runtimeType,
    filesystem_scope: options.filesystemScope || { mode: "none", extensions: [], max_files: 0, symlinks: "blocked" },
    network_scope: options.networkScope || { mode: "none", origins: [], credentials: "blocked", mutation: "blocked" },
    command_scope: options.commandScope || { mode: "none", arbitrary_shell: false },
    dependency_requirements: options.dependencies || [{ name: "Node.js", type: "existing_runtime", install_required: false }],
    risk_findings: options.risks,
    tests: options.tests,
    evidence: { mode: "persisted_redacted_json", raw_credentials: "blocked", includes: ["adapter id", "permission actions", "bounded output", "limitations"] },
    trust_status: "vetted_builtin_adapter",
    last_verified: "2026-07-14",
    permission_actions: options.permissionActions || ["vetted_skill_execute"],
    input_contract: options.inputContract,
    handler: options.handler,
    compatibility: { tested: ["generic MCP stdio"], expected: ["Codex MCP", "Claude MCP", "Cursor MCP", "Gemini MCP"], unproven: ["client-native skill installation", "every client version"] }
  });
}

function category(id, description, permissionActions) {
  return Object.freeze({ id, description, permission_actions: permissionActions, arbitrary_markdown_execution: false });
}

function pinnedFile(kind, owner, repo, commit, filePath, gitBlob) {
  return { kind, path: filePath, url: `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${filePath}`, git_blob_sha: gitBlob };
}

function publicAdapter(adapter) {
  return clone(adapter);
}

function validateSkillContract(adapter, handlers) {
  const errors = [];
  for (const key of ["id", "name", "source", "version_or_commit", "license", "supported_clients", "supported_task_types", "instructions", "runtime_type", "filesystem_scope", "network_scope", "command_scope", "dependency_requirements", "risk_findings", "tests", "evidence", "trust_status", "last_verified"]) {
    const value = adapter[key];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) errors.push(`missing:${key}`);
  }
  if (!SKILL_RUNTIME_CATEGORIES.some((item) => item.id === adapter.runtime_type)) errors.push("runtime_type_unknown");
  if (!handlers.has(adapter.handler)) errors.push("handler_missing");
  if (!adapter.permission_actions.length) errors.push("permission_actions_missing");
  if (!Array.isArray(adapter.source.files) || !adapter.source.files.length) errors.push("source_files_missing");
  if (!/^[a-z][a-z0-9_]{2,80}$/.test(adapter.id)) errors.push("id_invalid");
  return errors;
}

function validateRequiredInput(adapter, input) {
  for (const key of adapter.input_contract.required || []) if (input[key] === undefined || input[key] === null || input[key] === "") throw new SkillAdapterError("Skill adapter input is missing a required field.", "skill_input_required", { adapter_id: adapter.id, field: key });
}

function normalizeAdapterInput(value) {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) throw new SkillAdapterError("Skill adapter input must be a JSON object.", "skill_input_invalid");
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > MAX_INPUT_BYTES) throw new SkillAdapterError("Skill adapter input exceeds the bounded size.", "skill_input_too_large", { max_bytes: MAX_INPUT_BYTES });
  return clone(value);
}

function assertNoRawCredentials(value, location = "$input") {
  if (typeof value === "string") {
    if (SECRET_VALUE_RE.test(value)) throw new SkillAdapterError("Raw credential-shaped skill input is blocked.", "skill_raw_credential_blocked", { location });
    return;
  }
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoRawCredentials(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_BEARING_KEY_RE.test(key)) throw new SkillAdapterError("Secret-bearing skill input keys are blocked.", "skill_secret_key_blocked", { location: `${location}.${key}` });
    assertNoRawCredentials(child, `${location}.${key}`);
  }
}

function assertPermissionDecisions(actions, decisions = {}) {
  for (const action of actions) {
    const decision = decisions[action];
    if (!decision || decision.allowed !== true || decision.action_type !== action) throw new SkillAdapterError("Skill execution is missing an exact permission decision.", "skill_permission_missing", { action });
  }
}

async function resolveSkillTarget(root, requested) {
  const candidate = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(root, requested);
  if (!insidePath(root, candidate)) throw new SkillAdapterError("Skill package path escapes its project root.", "skill_package_escape", { skill_path: requested });
  const info = await lstat(candidate).catch(() => null);
  if (!info || info.isSymbolicLink()) throw new SkillAdapterError("Skill package target is missing or is a symbolic link.", "skill_package_invalid", { skill_path: requested });
  const resolved = await realpath(candidate);
  if (!insidePath(root, resolved)) throw new SkillAdapterError("Skill package resolves outside its project root.", "skill_package_link_escape", { skill_path: requested });
  if (info.isFile()) {
    if (path.basename(resolved).toLowerCase() !== "skill.md") throw new SkillAdapterError("Skill package file must be SKILL.md.", "skill_manifest_name_invalid");
    return { directory: path.dirname(resolved), manifest: resolved };
  }
  if (!info.isDirectory()) throw new SkillAdapterError("Skill package target must be a directory or SKILL.md.", "skill_package_not_directory");
  return { directory: resolved, manifest: path.join(resolved, "SKILL.md") };
}

async function collectPackageFiles(directory) {
  const output = [];
  const queue = [{ absolute: directory, relative: "" }];
  let totalBytes = 0;
  while (queue.length) {
    const current = queue.shift();
    const entries = await readdir(current.absolute, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = normalizePath(path.join(current.relative, entry.name));
      const absolute = path.join(current.absolute, entry.name);
      if (entry.isSymbolicLink()) throw new SkillAdapterError("Skill packages containing links are unsupported.", "skill_package_link_blocked", { path: relative });
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith(".")) queue.push({ absolute, relative });
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(absolute);
      totalBytes += info.size;
      if (totalBytes > MAX_PACKAGE_BYTES || output.length >= MAX_PACKAGE_FILES) throw new SkillAdapterError("Skill package exceeds bounded files or bytes.", "skill_package_too_large", { max_files: MAX_PACKAGE_FILES, max_bytes: MAX_PACKAGE_BYTES });
      const buffer = await readFile(absolute);
      output.push({ absolute, relative, size: buffer.length, sha256: sha256(buffer) });
    }
  }
  return output;
}

async function inspectPackageManifests(packageFiles, directory) {
  const manifests = [];
  const scripts = [];
  const dependencies = [];
  const errors = [];
  const riskFindings = [];
  const analysisText = [];
  const packageJsonFiles = packageFiles.filter((item) => path.basename(item.relative).toLowerCase() === "package.json");
  for (const item of packageJsonFiles) {
    manifests.push(item.relative);
    const file = await readBoundedRegularFile(item.absolute, directory, MAX_FILE_BYTES);
    let parsed;
    try {
      parsed = JSON.parse(file.text);
    } catch (error) {
      errors.push({ path: item.relative, code: "package_json_invalid", message: truncate(String(error.message || error), 240) });
      continue;
    }
    if (!isPlainObject(parsed)) {
      errors.push({ path: item.relative, code: "package_json_not_object" });
      continue;
    }
    if (parsed.scripts !== undefined && !isPlainObject(parsed.scripts)) errors.push({ path: item.relative, code: "package_scripts_not_object" });
    for (const [name, command] of Object.entries(isPlainObject(parsed.scripts) ? parsed.scripts : {})) {
      if (scripts.length >= MAX_PACKAGE_SCRIPTS) {
        errors.push({ path: item.relative, code: "package_scripts_truncated", max_scripts: MAX_PACKAGE_SCRIPTS });
        break;
      }
      if (typeof command !== "string") {
        errors.push({ path: item.relative, code: "package_script_not_string", script: truncate(redactText(name), 120) });
        continue;
      }
      const lifecycle = /^(?:preinstall|install|postinstall|prepare|prepublish|prepublishOnly)$/i.test(name);
      scripts.push({
        manifest: item.relative,
        name: truncate(redactText(name), 120),
        command_preview: truncate(redactText(command), 240),
        command_sha256: sha256(command),
        lifecycle
      });
      analysisText.push(command);
      if (lifecycle) riskFindings.push({ id: "package_lifecycle_script", severity: "high", path: item.relative, script: truncate(redactText(name), 120) });
    }
    for (const group of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const values = parsed[group];
      if (values !== undefined && !isPlainObject(values)) {
        errors.push({ path: item.relative, code: "package_dependencies_not_object", dependency_group: group });
        continue;
      }
      for (const [name, specifier] of Object.entries(values || {})) {
        if (dependencies.length >= MAX_PACKAGE_DEPENDENCIES) {
          errors.push({ path: item.relative, code: "package_dependencies_truncated", max_dependencies: MAX_PACKAGE_DEPENDENCIES });
          break;
        }
        const normalizedSpecifier = typeof specifier === "string" ? specifier : JSON.stringify(specifier);
        dependencies.push({ manifest: item.relative, group, name: truncate(redactText(name), 214), specifier: truncate(redactText(normalizedSpecifier), 240) });
        analysisText.push(`${name} ${normalizedSpecifier}`);
      }
    }
  }
  return {
    manifests,
    scripts,
    dependencies,
    errors,
    risk_findings: riskFindings,
    analysis_text: analysisText.join("\n")
  };
}

async function readBoundedRegularFile(file, root, maxBytes) {
  const info = await lstat(file).catch(() => null);
  if (!info || !info.isFile() || info.isSymbolicLink() || info.size > maxBytes) throw new SkillAdapterError("Skill manifest must be a bounded regular file.", "skill_manifest_invalid");
  const resolved = await realpath(file);
  if (!insidePath(root, resolved)) throw new SkillAdapterError("Skill manifest resolves outside the package.", "skill_manifest_escape");
  const buffer = await readFile(resolved);
  return { text: buffer.toString("utf8"), sha256: sha256(buffer) };
}

function parseSkillMarkdown(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { valid: false, frontmatter: {}, errors: ["yaml_frontmatter_missing"] };
  try {
    const parsed = yaml.load(match[1], { schema: yaml.FAILSAFE_SCHEMA, json: true });
    if (!isPlainObject(parsed)) return { valid: false, frontmatter: {}, errors: ["yaml_frontmatter_not_object"] };
    const frontmatter = redactDeep(parsed);
    const errors = [];
    if (!frontmatter.name) errors.push("name_missing");
    if (!frontmatter.description) errors.push("description_missing");
    return { valid: errors.length === 0, frontmatter, errors };
  } catch (error) {
    return { valid: false, frontmatter: {}, errors: [`yaml_parse_failed:${error.message}`] };
  }
}

function inferPackagePermissions(text, codeFiles) {
  return unique([
    "skill_inspect",
    codeFiles.length || /\b(?:run|execute|shell|terminal|command)\b/i.test(text) ? "skill_execute" : null,
    /https?:\/\/|\b(?:fetch|curl|wget|WebFetch)\b/i.test(text) ? "external_fetch" : null,
    /\b(?:npm|pnpm|yarn|pip|cargo|go)\s+(?:install|add|get)\b/i.test(text) ? "package_install" : null,
    SECRET_KEY_RE.test(text) ? "credential_api_read" : null,
    /\b(?:deploy|publish|push|create issue|open pr|external mutation)\b/i.test(text) ? "external_api_mutation" : null,
    /(?:~\/|%APPDATA%|\/etc\/|C:\\Windows|outside.*root)/i.test(text) ? "outside_allowed_root_write" : null
  ].filter(Boolean));
}

function findPackageRisks(text, codeFiles) {
  const rules = [
    ["prompt_injection_language", /ignore\s+(?:all\s+)?previous|system\s+prompt|bypass\s+(?:safety|policy)/i],
    ["download_execute_instruction", /(?:curl|wget|Invoke-WebRequest)[^\n]{0,200}(?:\||iex|Invoke-Expression|bash|sh)/i],
    ["dependency_install_instruction", /\b(?:npm|pnpm|yarn|pip|cargo)\s+(?:install|add)\b/i],
    ["credential_instruction", SECRET_KEY_RE],
    ["external_mutation_instruction", /\b(?:deploy|publish|git push|create issue|open pull request)\b/i]
  ];
  const findings = rules.filter(([, regex]) => regex.test(text)).map(([id]) => ({ id, severity: id === "prompt_injection_language" || id === "download_execute_instruction" ? "high" : "medium" }));
  for (const file of codeFiles) findings.push({ id: "executable_file_present", severity: "high", path: file.relative });
  return findings;
}

async function collectTextFiles(runtime, root, requestedFiles, extensions, maxFiles, extraPredicate = () => true) {
  const relativeFiles = requestedFiles?.length ? stringArray(requestedFiles, maxFiles, 500) : await discoverFiles(root, extensions, maxFiles, extraPredicate);
  const output = [];
  for (const file of relativeFiles) {
    if (SECRET_PATH_RE.test(normalizePath(file))) continue;
    if (!extensions.has(path.extname(file).toLowerCase()) || !extraPredicate(normalizePath(file))) continue;
    output.push(await runtime.resolveAllowedFile(root, file, MAX_FILE_BYTES));
  }
  return output;
}

async function discoverFiles(root, extensions, maxFiles, predicate) {
  const output = [];
  const queue = [root];
  while (queue.length && output.length < maxFiles) {
    const directory = queue.shift();
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = normalizePath(path.relative(root, absolute));
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith(".")) queue.push(absolute);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()) && !SECRET_PATH_RE.test(relative) && predicate(relative)) output.push(relative);
      if (output.length >= maxFiles) break;
    }
  }
  return output;
}

async function inspectBrowserEvidenceFile(runtime, root, value, label) {
  if (!value) return null;
  if (!isPlainObject(value)) throw new SkillAdapterError(`${label} browser evidence must be an object.`, "skill_browser_evidence_invalid", { label });
  const file = await runtime.resolveAllowedFile(root, safeText(value.path, `${label}.path`, 500), 10 * 1024 * 1024);
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(path.extname(file.relative).toLowerCase())) throw new SkillAdapterError("Browser evidence file must use a supported image extension.", "skill_browser_evidence_type_blocked", { path: file.relative });
  return { path: file.relative, sha256: file.sha256, bytes: file.size, viewport_width: clamp(value.viewport_width, 1, 8_000, 0), viewport_height: clamp(value.viewport_height, 1, 8_000, 0) };
}

function normalizeResearchSource(source, index) {
  if (!isPlainObject(source)) throw new SkillAdapterError("Research sources must be objects.", "skill_research_source_invalid", { index });
  let url;
  try {
    url = new URL(safeText(source.url, `sources[${index}].url`, 2_000));
  } catch {
    throw new SkillAdapterError("Research source URL is invalid.", "skill_research_url_invalid", { index });
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || [...url.searchParams.keys()].some((key) => SECRET_KEY_RE.test(key))) throw new SkillAdapterError("Research source URL violates the safe URL contract.", "skill_research_url_blocked", { index });
  const sourceType = ["official", "primary", "community", "unknown"].includes(source.source_type) ? source.source_type : "unknown";
  const claims = Array.isArray(source.claims) ? source.claims.slice(0, 40).map((claim, claimIndex) => {
    if (!isPlainObject(claim)) throw new SkillAdapterError("Research claims must be objects.", "skill_research_claim_invalid", { index, claim_index: claimIndex });
    const stance = ["supports", "contradicts", "uncertain"].includes(claim.stance) ? claim.stance : "uncertain";
    return { id: safeText(claim.id, "claim.id", 120), stance, statement: safeText(claim.statement, "claim.statement", 1_000) };
  }) : [];
  let publishedAt = null;
  if (source.published_at) {
    const parsed = new Date(source.published_at);
    if (!Number.isFinite(parsed.getTime())) throw new SkillAdapterError("Research source publication date is invalid.", "skill_research_date_invalid", { index });
    publishedAt = parsed.toISOString();
  }
  return { id: safeText(source.id || `source-${index + 1}`, "source.id", 120), url: url.toString(), source_type: sourceType, title: safeOptionalText(source.title, 500), published_at: publishedAt, content_hash: source.content_hash ? safeText(source.content_hash, "content_hash", 200) : null, claims };
}

function inferSeams(behavior) {
  if (/http|api|endpoint|request|response/i.test(behavior)) return ["public HTTP request/response contract"];
  if (/cli|command|terminal/i.test(behavior)) return ["CLI argv, exit code, and bounded output"];
  if (/ui|form|button|screen|page/i.test(behavior)) return ["user-visible interaction and resulting state"];
  return ["exported public function or process boundary"];
}

function behaviorToTestName(behavior) {
  const normalized = behavior.replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase().split(/\s+/).slice(0, 12).join(" ");
  return normalized ? `user can ${normalized}` : "public behavior matches the agreed example";
}

function isModManifestPath(file) {
  const name = path.basename(file).toLowerCase();
  return /(?:mod|plugin|load.?order|manifest|profile|pack|config)/i.test(name);
}

function finding(file, line, ruleId, severity, message, snippet) {
  return { file, line, rule_id: ruleId, severity, message, snippet: truncate(redactText(String(snippet || "").trim()), 240) };
}

function validatePinnedSourceUrl(value, testOverride) {
  const url = new URL(value);
  if (testOverride) {
    if (!/^(?:127\.0\.0\.1|localhost)$/.test(url.hostname) || url.protocol !== "http:") throw new SkillAdapterError("Skill source test override must use loopback HTTP.", "skill_source_test_origin_blocked");
    return;
  }
  if (url.protocol !== "https:" || url.origin !== "https://raw.githubusercontent.com" || url.username || url.password || url.search || url.hash) throw new SkillAdapterError("Skill source URL is outside the pinned GitHub raw origin.", "skill_source_origin_blocked", { origin: url.origin });
}

function parseTestSourceMap(environment) {
  if (environment.VNEM_TOOLS_SKILL_TEST_MODE !== "1") return {};
  try {
    const parsed = JSON.parse(environment.VNEM_TOOLS_SKILL_TEST_SOURCE_MAP || "{}");
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    throw new SkillAdapterError("Skill source test map is invalid JSON.", "skill_source_test_map_invalid");
  }
}

async function readBoundedResponse(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new SkillAdapterError("Pinned skill source exceeds its response bound.", "skill_source_too_large", { declared_bytes: declared, max_bytes: maxBytes });
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new SkillAdapterError("Pinned skill source exceeds its response bound.", "skill_source_too_large", { max_bytes: maxBytes });
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new SkillAdapterError("Pinned skill source exceeds its response bound.", "skill_source_too_large", { max_bytes: maxBytes });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function gitBlobSha(buffer) {
  const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return createHash("sha1").update(Buffer.from(`blob ${content.length}\0`)).update(content).digest("hex");
}

function hashPackage(files) {
  return sha256(files.sort((a, b) => a.path.localeCompare(b.path)).map((item) => `${item.path}\0${item.sha256}`).join("\n"));
}

function safeText(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim()) throw new SkillAdapterError(`Skill input ${field} must be a non-empty string.`, "skill_input_field_invalid", { field });
  if (value.length > maxLength) throw new SkillAdapterError(`Skill input ${field} exceeds its length bound.`, "skill_input_field_too_long", { field, max_length: maxLength });
  return value.trim();
}

function safeOptionalText(value, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > maxLength) throw new SkillAdapterError("Optional skill text exceeds its contract.", "skill_input_field_invalid");
  return value.trim();
}

function stringArray(value, maxItems, maxLength) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new SkillAdapterError("Skill input array exceeds its contract.", "skill_input_array_invalid", { max_items: maxItems });
  return value.map((item) => safeText(item, "array_item", maxLength));
}

async function readJsonIfPresent(file) {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES) return null;
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function redactDeep(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) output[key] = SECRET_BEARING_KEY_RE.test(key) ? "[REDACTED]" : redactDeep(child);
  return output;
}

function redactText(value) {
  return String(value)
    .replace(/bearer\s+[a-z0-9._~+/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/github_pat_[a-z0-9_]{20,}|gh[pousr]_[a-z0-9_]{20,}|sk-[a-z0-9_-]{10,}/gi, "[REDACTED]")
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s]+)/gi, "$1=[REDACTED]")
    .replace(/(\b(?:--?token|--?password|--?secret|--?api[-_]?key)\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|password|secret|api[-_]?key|access[-_]?key)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/)[^/\s:@]+:[^@\s/]+@/gi, "$1[REDACTED]@");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback;
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function unique(values) {
  return [...new Set(values)];
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/");
}

function insideAny(candidate, roots) {
  return roots.some((root) => insidePath(root, candidate));
}

function insidePath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
