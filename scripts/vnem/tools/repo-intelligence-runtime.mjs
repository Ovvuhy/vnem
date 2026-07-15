export function createRepoIntelligenceRuntime({
  existsSync,
  readFile,
  stat,
  path,
  CONTROL_OPERATOR_PATTERN,
  UNSAFE_PACKAGE_SCRIPT_PATTERN,
  LARGE_FILE_BYTES,
  testingCiRuntime,
  toolsRegistry,
  ToolsError,
  buildActionRecoveryPlan,
  highPowerActionReview,
  capabilityGapReport,
  uniqueToolNames,
  resolveAllowedRoot,
  resolveAllowedFile,
  walkWorkspace,
  looksBinary,
  detectFrameworks,
  gitValue,
  taskProgressTruthCheck,
  writeEvidenceLog,
  isSecretLikePath,
  shouldSkipRelative,
  normalizePath,
  redactSecrets,
  truncate,
  arrayify
}) {
  async function repoDeepMap(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    const entries = [];
    const skipped = [];
    await walkWorkspace(root.absolutePath, root.absolutePath, entries, skipped, { maxDepth: args.max_depth || 6, maxFiles: args.max_files || 500, includeHidden: false });
    const files = entries.filter((item) => item.type === "file");
    const dirs = entries.filter((item) => item.type === "directory");
    const pkg = await readPackageJsonIfPresent(root.absolutePath);
    const scripts = pkg?.scripts || {};
    const packageScripts = summarizePackageScripts(scripts);
    const git = args.include_git === false ? compactNoGitState() : await compactGitState(root.absolutePath);
    const changedFiles = git.changed_files.map((item) => item.path);
    const sourceDirs = classifyDirs(dirs, files, ["src", "app", "pages", "lib", "server", "api", "components", "dashboard", "landing", "scripts"]);
    const testDirs = classifyDirs(dirs, files, ["test", "tests", "__tests__", "spec", "test-fixtures", "fixtures"]);
    const docsFiles = files.map((f) => f.path).filter(isDocsPath).slice(0, 60);
    const configFiles = files.map((f) => f.path).filter(isConfigPath).slice(0, 60);
    const generatedDirs = ["dist", "build", "coverage", ".next", ".turbo", ".cache", "public/install", "landing/dist"].filter((dir) => existsSync(path.join(root.absolutePath, dir)));
    const generatedFiles = files.map((f) => f.path).filter(isGeneratedArtifactPath).slice(0, 60);
    const registries = files.map((f) => f.path).filter(isLikelyRegistryPath).slice(0, 60);
    const entrypoints = files.map((f) => f.path).filter(isLikelyEntrypointPath).slice(0, 80);
    const riskyFiles = [...new Set([...changedFiles, ...files.map((f) => f.path)].filter((f) => isSecretLikePath(f) || /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/.test(f) || /(^|\/)(install|setup|postinstall|deploy|release)[-.A-Za-z0-9_]*\.(mjs|js|sh|ps1|cmd|bat)$/i.test(f)).slice(0, 60))];
    const largeFiles = files.filter((f) => f.bytes >= LARGE_FILE_BYTES || isBinaryLikePath(f.path)).map((f) => ({ path: f.path, bytes: f.bytes, generated: isGeneratedArtifactPath(f.path), binary_like: isBinaryLikePath(f.path) })).slice(0, 60);
    const languages = detectLanguagesFromFiles(files);
    const frameworks = detectFrameworks(pkg, files);
    const todoMarkers = await scanTodoMarkers(root.absolutePath, files, 20);
    const fileGroups = buildRepoFileGroups(files, changedFiles);
    const likelyImportantFiles = buildLikelyImportantFiles(files, changedFiles, registries, entrypoints, configFiles);
    const suspiciousWorkFlags = buildSuspiciousWorkFlags(changedFiles, args.completed_summary || args.user_goal || "");
    const map = {
      operation_result: "reported",
      repo_root: root.absolutePath,
      package_manager: detectPackageManager(root.absolutePath, pkg),
      package_scripts: packageScripts,
      languages,
      frameworks,
      source_dirs: sourceDirs,
      test_dirs: testDirs,
      config_files: configFiles,
      docs_handoff_files: docsFiles,
      generated_artifact_dirs: generatedDirs,
      generated_artifact_files: generatedFiles,
      generated_artifact_status: {
        directories_present: generatedDirs.slice(0, 20),
        changed_generated_files: changedFiles.filter(isGeneratedArtifactPath).slice(0, 30),
        source_generator_reason_required: changedFiles.some(isGeneratedArtifactPath) && !changedFiles.some((file) => /scripts\/generate-artifacts\.mjs|registry\/|capabilities\/|src\/|scripts\/vnem-tools-mcp-server\.mjs/.test(file))
      },
      likely_entrypoints: entrypoints,
      likely_important_files: likelyImportantFiles,
      likely_tool_or_server_registries: registries,
      git,
      changed_or_untracked_files: changedFiles.slice(0, 80),
      dirty_state_summary: {
        dirty: changedFiles.length > 0,
        changed_file_count: changedFiles.length,
        main_changed_files: changedFiles.filter((file) => !isGeneratedArtifactPath(file)).slice(0, 20),
        generated_changed_files: changedFiles.filter(isGeneratedArtifactPath).slice(0, 20),
        docs_changed_files: changedFiles.filter(isDocsPath).slice(0, 20),
        tests_changed_files: changedFiles.filter(isTestPath).slice(0, 20)
      },
      file_groups: fileGroups,
      suspicious_work_flags: suspiciousWorkFlags,
      large_files: largeFiles,
      risky_files: riskyFiles,
      todo_markers: todoMarkers,
      ignored_or_noise_dirs: [...new Set([...skipped, ...["node_modules", ".git", "dist", "build", "coverage", ".cache"].filter((dir) => existsSync(path.join(root.absolutePath, dir)))])].slice(0, 100),
      output_limits: { max_files_sampled: args.max_files || 500, max_depth: args.max_depth || 6, large_lists_capped: true },
      compact_summary: {
        file_count_sampled: files.length,
        source_area_count: sourceDirs.length,
        test_area_count: testDirs.length,
        dirty_file_count: changedFiles.length,
        generated_file_count: generatedFiles.length,
        todo_count_sampled: todoMarkers.length
      },
      output_compact: true,
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("repo_deep_map", map);
    map.evidence_log_id = log.evidence_log_id;
    return map;
  }

  async function nextActionRanker(args = {}) {
    const map = await repoDeepMap({ root: args.root || ".", max_files: 500, max_depth: 6 });
    const impact = await changeImpactPlan({ root: args.root || "." });
    const placebo = await noPlaceboProgressAudit({ root: args.root || ".", completed_summary: args.user_goal || "", tests_run: [] });
    const goal = String(args.user_goal || "");
    const goalFlags = {
      local_only: /local-only|no push|no pr|do not publish|do not push|do not create a pr/i.test(goal),
      dogfood_repo_power: /dogfood|power-tools-2|ranking quality|triage quality|proof usefulness/i.test(goal),
      tune_existing_tools: /tune|sharper|improve|quality|existing tools|do not add more tool|no new tool/i.test(goal),
      forbids_publish: /no push|no pr|do not publish|no merge|direct main/i.test(goal)
    };
    const knownFailures = arrayify(args.known_failures).map(String);
    const candidates = [];
    const add = (action) => candidates.push({ should_do_now: true, deferred_reason: "", ...action });
    if (knownFailures.length) {
      const triage = await failureTriage({ root: args.root || ".", stderr: knownFailures.join("\n"), context: goal });
      add({
        action: "Fix the first real failing check before adding new scope.",
        category: "implementation",
        reason: triage.likely_root_cause,
        expected_files_to_touch: triage.exact_file_or_function_to_inspect ? [triage.exact_file_or_function_to_inspect] : impact.likely_affected_tools_or_features.slice(0, 3),
        expected_proof_checks: [triage.command_to_rerun],
        risk_level: triage.blocks_acceptance ? "high" : "medium",
        estimated_implementation_value: 92,
        placebo_risk: "low"
      });
    }
    if (goalFlags.dogfood_repo_power || goalFlags.tune_existing_tools) {
      add({
        action: "Dogfood current repo-power output, then tune the existing implementation where the output is vague or misleading.",
        category: "implementation",
        reason: "The requested value is better future Building AI guidance; validation-only work would not improve ranking, triage, or proof usefulness.",
        why_now: "Clean worktree plus explicit dogfood/tuning goal means the highest-value next step is behavior tuning, not publish or broad validation.",
        expected_files_to_touch: ["scripts/vnem-tools-mcp-server.mjs", "scripts/test-tools-power-tools-2-regression.mjs", "package.json", "scripts/tools-readiness-report.mjs"],
        expected_proof_checks: ["npm.cmd run test:tools-power-tools-2-regression", "npm.cmd run test:tools-power-tools-1-regression", "npm.cmd run tools:readiness"],
        risk_level: "medium",
        estimated_implementation_value: 96,
        placebo_risk: "medium",
        skip_or_defer_reason: "Defer push/PR/live proof; this is a local-only dogfood batch."
      });
    }
    if (map.changed_or_untracked_files.length) {
      add({
        action: "Review changed files and complete the smallest behavior-backed implementation slice.",
        category: "implementation",
        reason: `${map.changed_or_untracked_files.length} dirty/untracked file(s) exist; finish or intentionally exclude them before validation loops.`,
        expected_files_to_touch: map.changed_or_untracked_files.slice(0, 8),
        expected_proof_checks: impact.minimum_targeted_tests.slice(0, 6),
        risk_level: impact.risk_level,
        estimated_implementation_value: 90,
        placebo_risk: placebo.placebo_risks.length ? "medium" : "low",
        why_now: "Dirty files are the strongest immediate signal; finish or exclude them before judging proof."
      });
    }
    if (impact.generation_required) {
      add({
        action: "Refresh generated artifacts after source behavior and targeted tests are stable.",
        category: "validation",
        reason: "Source or generator changes touch install/API/dashboard generated outputs.",
        expected_files_to_touch: ["public/install/*", ".vnem/*", "public/api/index.json", "landing/install.tgz"].filter((item, index) => index < 4),
        expected_proof_checks: ["npm.cmd run validate", "npm.cmd run generate", "npm.cmd run test:install-pack"],
        risk_level: "medium",
        estimated_implementation_value: 70,
        placebo_risk: "medium",
        should_do_now: false,
        deferred_reason: "Do after implementation tests pass to avoid generated-only churn.",
        skip_or_defer_reason: "Generated churn is weak proof until source/generator behavior and targeted checks pass."
      });
    }
    if (map.todo_markers.length) {
      add({
        action: "Turn the highest-signal TODO/FIXME near touched code into a real fix or defer it explicitly.",
        category: "cleanup",
        reason: `Found ${map.todo_markers.length} TODO/FIXME marker(s) in sampled source/tests/docs.`,
        expected_files_to_touch: [...new Set(map.todo_markers.map((item) => item.path))].slice(0, 5),
        expected_proof_checks: testSelectionFromAreas(impact.changed_areas, map.package_scripts).targeted_tests.slice(0, 4),
        risk_level: "low",
        estimated_implementation_value: 55,
        placebo_risk: "medium",
        should_do_now: /todo|fixme|cleanup/i.test(goal),
        deferred_reason: /todo|fixme|cleanup/i.test(goal) ? "" : "Defer unless it supports the current user goal.",
        skip_or_defer_reason: /todo|fixme|cleanup/i.test(goal) ? "" : "Not part of the stated batch unless near touched repo-power code."
      });
    }
    add({
      action: "Run the smallest targeted verification set for the affected areas.",
      category: "validation",
      reason: "Targeted proof is cheaper and more useful than repeating broad validation when risk is bounded.",
      expected_files_to_touch: [],
      expected_proof_checks: impact.minimum_targeted_tests.slice(0, 8),
      risk_level: impact.risk_level,
      estimated_implementation_value: 65,
      placebo_risk: "low",
      should_do_now: impact.minimum_targeted_tests.length > 0 && !goalFlags.dogfood_repo_power,
      why_now: "Run after a behavior change or when changed files already exist.",
      deferred_reason: goalFlags.dogfood_repo_power ? "Dogfood/tune behavior first; validation-only is not enough for this goal." : ""
    });
    add({
      action: "Avoid docs-only or registration-only work unless it directly supports implemented behavior.",
      category: "docs",
      reason: placebo.placebo_risks.length ? placebo.placebo_risks[0] : "POWER tasks should change behavior, not just language.",
      expected_files_to_touch: ["source files before generated docs"],
      expected_proof_checks: ["no-placebo audit", "targeted behavior tests"],
      risk_level: "low",
      estimated_implementation_value: 20,
      placebo_risk: "high",
      should_do_now: false,
      deferred_reason: "Docs are follow-up unless source behavior exists.",
      skip_or_defer_reason: "Do not spend this batch on docs/generation before behavior proof."
    });
    const ranked = candidates
      .filter((item) => !(goalFlags.local_only && /\b(push|publish|deploy)\b|\bPR\b|pull request/i.test(`${item.action} ${item.reason}`)))
      .map((item) => ({ ...item, score: scoreNextAction(item, goal) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, args.max_actions || 5)
      .map((item, index) => ({
        rank: index + 1,
        why_now: item.why_now || item.reason,
        skip_or_defer_reason: item.skip_or_defer_reason || item.deferred_reason || "",
        ...item
      }));
    return {
      operation_result: "reported",
      user_goal: goal,
      repo_branch: map.git.branch,
      git_dirty: map.changed_or_untracked_files.length > 0,
      task_constraints: goalFlags,
      actions: ranked,
      penalties_applied: [
        "docs-only work without implementation proof",
        "tests-only work that proves only registration",
        "wrapper/tool-name additions without execution paths",
        "broad rewrites with weak proof",
        "validation-only loops after adequate targeted proof",
        "safety ceremony without enforcement",
        "broad new-tool expansion when existing repo-power tools can be tuned",
        goalFlags.local_only ? "publish/push/PR recommendations blocked by local-only task constraint" : null
      ].filter(Boolean),
      evidence_sources: ["repo_deep_map", "change_impact_plan", "no_placebo_progress_audit"],
      output_compact: true
    };
  }

  async function noPlaceboProgressAudit(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    const changed = arrayify(args.changed_files).length ? arrayify(args.changed_files).map(normalizePath) : await gitChangedFileNames(root.absolutePath);
    const testsRun = arrayify(args.tests_run).map(String);
    const summary = `${args.proposed_summary || ""}\n${args.completed_summary || ""}`;
    const sourceChanged = changed.filter(isSourceBehaviorPath);
    const testsChanged = changed.filter(isTestPath);
    const docsChanged = changed.filter(isDocsPath);
    const generatedChanged = changed.filter(isGeneratedArtifactPath);
    const serverImplementations = toolsServerImplementationFiles(root.absolutePath, "scripts/vnem-tools-mcp-server.mjs");
    const serverText = (await Promise.all(serverImplementations.map(async (file) => {
      const absolute = path.join(root.absolutePath, file);
      return existsSync(absolute) ? readFile(absolute, "utf8") : "";
    }))).join("\n");
    const risks = [];
    const inspect = [];
    if (changed.length && !sourceChanged.length && docsChanged.length) risks.push("docs-only claims without source behavior change");
    if (changed.length && !sourceChanged.length && generatedChanged.length && generatedChanged.length >= changed.length) risks.push("generated artifact churn without source behavior");
    if (testsChanged.length && !sourceChanged.length) risks.push("tests-only work may not add real behavior");
    if (/mocked|simulated|dry-run/i.test(summary) && /live|real github|production|deployed|pushed/i.test(summary) && !arrayify(args.live_proof).length) risks.push("mocked-only proof is being described as live proof");
    if (/planned|future|preview/i.test(summary) && /implemented|complete|done/i.test(summary)) risks.push("planned wording may be replacing implementation");
    if (/register|manifest|catalog|tool name|exposed/i.test(summary) && !/execution|behavior|implementation|source behavior/i.test(summary)) risks.push("registration-only changes may not add execution behavior");
    if (/safety|guardrail|protected|blocked/i.test(summary) && !/throw new ToolsError|blocked|enforce|approval_required|secret_path_blocked/.test(serverText)) risks.push("safety language without visible enforcement path");
    if (/registerTool/.test(serverText) && sourceChanged.some((file) => /vnem-tools-mcp-server\.mjs$/.test(file))) {
      const newNames = [...serverText.matchAll(/vnem_tools_[a-z0-9_]+/g)].map((m) => m[0]);
      if (newNames.length && !/function\s+[a-zA-Z0-9_]+|async function\s+[a-zA-Z0-9_]+/.test(serverText)) risks.push("tool names exist but implementation functions are hard to identify");
    }
    if (/wrapper|catalog|manifest only|registration only/i.test(summary)) risks.push("wrapper/tool-name addition risk");
    for (const file of changed.slice(0, 80)) {
      if (isSourceBehaviorPath(file) || isTestPath(file) || isDocsPath(file)) inspect.push(file);
    }
    const missingProof = [];
    if (sourceChanged.length && !testsRun.length && !testsChanged.length) missingProof.push("targeted behavior test or command evidence");
    if (/\b(github|push|issue|actions)\b|\bPR\b|pull request/i.test(summary) && !arrayify(args.live_proof).length) missingProof.push("exact live GitHub URL/SHA/run proof or explicit blocked reason");
    if (generatedChanged.length && !testsRun.some((cmd) => /generate|install-pack|dashboard|validate/.test(cmd))) missingProof.push("generation/install-pack validation");
    const hasBehaviorProof = sourceChanged.length > 0 && (testsRun.length > 0 || testsChanged.length > 0);
    const proofCount = testsRun.length + arrayify(args.live_proof).length;
    const score = Math.max(0, Math.min(100, 25 + (sourceChanged.length ? 28 : 0) + (hasBehaviorProof ? 24 : 0) + Math.min(proofCount, 4) * 6 + Math.min(testsChanged.length, 3) * 4 - risks.length * 16 - missingProof.length * 12 - (generatedChanged.length && !sourceChanged.length ? 12 : 0) - (docsChanged.length && !sourceChanged.length ? 10 : 0)));
    const notProven = [
      !hasBehaviorProof ? "source behavior plus targeted proof" : null,
      !arrayify(args.live_proof).length && (/\b(github|push|issue|actions|cloudflare|deploy)\b|\bPR\b|pull request/i.test(summary)) ? "live external proof" : null,
      risks.length ? `risk correction: ${risks[0]}` : null
    ].filter(Boolean);
    return {
      operation_result: "reported",
      real_progress_score: score,
      progress_level: score >= 80 ? "strong_real_progress" : score >= 55 ? "partial_progress_needs_proof" : "placebo_risk_high",
      changed_files_reviewed: changed.slice(0, 100),
      implementation_files: sourceChanged.slice(0, 40),
      test_files: testsChanged.slice(0, 40),
      docs_files: docsChanged.slice(0, 40),
      generated_files: generatedChanged.slice(0, 40),
      placebo_risks: [...new Set(risks)],
      missing_proof: [...new Set(missingProof)],
      safe_to_claim: hasBehaviorProof && !risks.length ? ["Source behavior changed and targeted/local proof exists."] : testsRun.length ? ["Local checks were run, but claims are limited by missing behavior/live proof fields."] : [],
      not_proven: [...new Set(notProven)],
      exact_files_or_functions_to_inspect: [...new Set(inspect)].slice(0, 30),
      exact_next_correction: risks.length ? correctionForPlaceboRisk(risks[0]) : missingProof.length ? `Add proof for: ${missingProof[0]}.` : "Keep implementation, tests, and claims aligned; no correction required from this audit.",
      required_correction: risks.length || missingProof.length ? (risks.length ? correctionForPlaceboRisk(risks[0]) : `Add proof for: ${missingProof[0]}.`) : "",
      mocked_proof_count: arrayify(args.mocked_proof).length,
      live_proof_count: arrayify(args.live_proof).length,
      output_compact: true
    };
  }

  async function changeImpactPlan(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    const changed = arrayify(args.changed_files).length ? arrayify(args.changed_files).map(normalizePath) : await gitChangedFileNames(root.absolutePath, args.include_staged);
    const pkg = await readPackageJsonIfPresent(root.absolutePath);
    const scripts = summarizePackageScripts(pkg?.scripts || {});
    const areas = classifyChangedAreas(changed);
    const affected = affectedFeaturesForAreas(areas, changed);
    const generationRequired = changed.some((file) => /scripts\/generate-artifacts\.mjs|registry\/|capabilities\/|public\/install|\.vnem\/|public\/api\/index\.json|llms/.test(file));
    const generatedOnly = changed.length > 0 && changed.every(isGeneratedArtifactPath);
    const docsOnly = changed.length > 0 && changed.every(isDocsPath);
    const sourceGeneratorReasonRequired = changed.some(isGeneratedArtifactPath) && !changed.some((file) => /scripts\/generate-artifacts\.mjs|registry\/|capabilities\/|scripts\/vnem-tools-mcp-server\.mjs|src\//.test(file));
    const targeted = targetedTestsForChange(areas, changed, pkg?.scripts || {});
    const finalChecks = ["git diff --check", "node --check scripts/vnem-tools-mcp-server.mjs"].filter((cmd) => changed.some((file) => /scripts\/vnem-tools-mcp-server\.mjs|scripts\/test-tools-|package\.json/.test(file)) || cmd === "git diff --check");
    if (changed.some((file) => /scripts\/tools-readiness-report\.mjs/.test(file))) finalChecks.push("node --check scripts/tools-readiness-report.mjs", "npm.cmd run tools:readiness");
    if (changed.some((file) => /scripts\/generate-artifacts\.mjs/.test(file))) finalChecks.push("node --check scripts/generate-artifacts.mjs");
    if (generationRequired && !docsOnly) finalChecks.push("npm.cmd run validate", "npm.cmd run generate", "npm.cmd run test:install-pack");
    const fullTriggers = [];
    if (areas.includes("tools_mcp") && areas.includes("github_autonomy")) fullTriggers.push("shared Tools MCP and GitHub autonomy paths both changed");
    if (areas.includes("generator") || changed.length > 25) fullTriggers.push("generated/readiness behavior changed broadly");
    if (areas.includes("package_scripts")) fullTriggers.push("package script/test orchestration changed");
    if (areas.includes("dashboard") && changed.some((file) => /\.(jsx|tsx|css|html)$/.test(file))) fullTriggers.push("UI/dashboard surface changed");
    const risk = fullTriggers.length ? "high" : areas.some((area) => ["tools_mcp", "github_autonomy", "cloudflare_control", "core_mcp"].includes(area)) ? "medium" : "low";
    return {
      operation_result: "reported",
      changed_files: changed.slice(0, 120),
      changed_areas: areas,
      risk_level: risk,
      likely_affected_tools_or_features: affected.slice(0, 30),
      per_file_impacts: changed.slice(0, 80).map((file) => ({ file, areas: classifyChangedAreas([file]), requires_source_reason: isGeneratedArtifactPath(file) && sourceGeneratorReasonRequired })),
      minimum_targeted_tests: [...new Set(targeted)].slice(0, 20),
      final_checks: [...new Set(finalChecks)].slice(0, 20),
      generation_required: generationRequired,
      docs_only: docsOnly,
      generated_only: generatedOnly,
      source_generator_reason_required: sourceGeneratorReasonRequired,
      full_npm_test_justified: fullTriggers.length > 0,
      full_suite_trigger_conditions: fullTriggers,
      what_not_to_run_yet: buildWhatNotToRunYet(areas, generationRequired, fullTriggers),
      package_scripts_detected: scripts,
      output_compact: true
    };
  }

  async function testSelectionPlan(args = {}) {
    const impact = await changeImpactPlan({ root: args.root || ".", changed_files: args.changed_files || [] });
    const root = await resolveAllowedRoot(args.root || ".");
    const affectedGraph = await testingCiRuntime.affectedGraph({ root: root.absolutePath, changed_files: impact.changed_files });
    const goal = String(args.user_goal || "");
    const selection = testSelectionFromAreas(impact.changed_areas, impact.package_scripts);
    let targeted = [...affectedGraph.selected_scripts.map((script) => `npm.cmd run ${script}`), ...selection.targeted_tests, ...impact.minimum_targeted_tests];
    if (/github|pr|issue|actions/i.test(goal)) targeted.push("npm.cmd run test:tools-github-real-exec-paths", "npm.cmd run test:tools-github-command-builder", "npm.cmd run test:tools-github-live-readiness", "npm.cmd run test:tools-github-mutation-dry-run");
    if (/cloudflare/i.test(goal)) targeted.push("npm.cmd run test:tools-cloudflare-status-auth");
    if (/readiness|manifest|catalog|quality|power/i.test(goal)) targeted.push("npm.cmd run test:tools-reliability-catalog", "npm.cmd run test:tools-quality-general");
    const baseline = impact.changed_files.length ? ["git diff --check"] : [];
    const regression = selection.regression_tests;
    const readiness = impact.final_checks.filter((cmd) => /readiness|validate|generate|install-pack|dashboard/.test(cmd));
    const fullTriggers = [...impact.full_suite_trigger_conditions];
    if (/full suite|broad shared helper|many areas/i.test(args.failure_context || "")) fullTriggers.push("failure context requests broad escalation");
    return {
      operation_result: "reported",
      baseline_checks: [...new Set(baseline)],
      targeted_tests: [...new Set(targeted)].slice(0, 24),
      regression_tests: [...new Set(regression)].slice(0, 18),
      readiness_or_generation_checks: [...new Set(readiness)].slice(0, 16),
      affected_test_graph: {
        selected_tests: affectedGraph.selected_tests,
        graph_summary: affectedGraph.graph_summary,
        generated_checks: affectedGraph.generated_checks,
        filename_substring_only_selection: false
      },
      full_suite_trigger_conditions: [...new Set(fullTriggers)],
      full_npm_test_recommended: fullTriggers.length > 0,
      first_checks_to_run: [...new Set([...baseline, ...targeted])].slice(0, 8),
      proof_boundaries: {
        browser_proof_required: impact.changed_areas.includes("dashboard"),
        live_github_proof_required: /\b(publish|push|issue|actions|release)\b|\bPR\b|pull request/i.test(goal) && !/local-only|no push|no pr|do not publish/i.test(goal),
        external_network_required: /deploy|publish|external api|live api/i.test(goal)
      },
      avoid_over_validation: [
        "Do not recommend full npm test for tiny isolated docs/test changes unless a broad trigger is present.",
        "Do not recommend browser proof for backend-only or MCP-only changes.",
        "Do not recommend live GitHub proof for local-only features unless publishing/GitHub mutation is the task."
      ],
      escalation_rule: "Run targeted tests first; escalate to readiness/generation or full npm test only after shared/high-risk changes or targeted failures.",
      output_compact: true
    };
  }

  async function failureTriage(args = {}) {
    const text = redactSecrets(`${args.command || ""}\n${args.stdout || ""}\n${args.stderr || ""}\n${args.context || ""}`);
    const lower = text.toLowerCase();
    let classification = "real_regression";
    if (/gh\s*:|gh cli unavailable|not authenticated|auth status|gh auth|permission denied|eacces|unauthorized|forbidden/.test(lower)) classification = "auth_permission_issue";
    else if (/ebusy|eperm|enotempty|taskkill|process cannot access|resource busy|rmdir/.test(lower)) classification = "windows_path_process_cleanup_issue";
    else if (/generated|install\.tgz|public\/install|\.vnem|stale|digest|snapshot/.test(lower)) classification = "generated_artifact_staleness";
    else if (/fetch failed|enotfound|econnreset|network|timeout|rate limit|429|dns|source unavailable/.test(lower)) classification = "environment_network_issue";
    else if (/cannot find module|module not found|missing dependency|is not recognized|command not found|enoent/.test(lower)) classification = "missing_dependency";
    else if (/assertionerror|expected|actual/.test(lower)) classification = /fixture|golden|mock|snapshot|test-fixtures/.test(lower) ? "test_fixture_bug" : "real_assertion_failure";
    else if (/typeerror|referenceerror|syntaxerror|failed|error:|exit code 1/.test(lower)) classification = "product_bug";
    const fileMatch = text.match(/[A-Za-z0-9_.:/\\-]+\.(mjs|js|ts|tsx|jsx|json|md|yml|yaml|css|html)(?::\d+)?/);
    const command = String(args.command || "").trim();
    const rerun = command || rerunCommandForFailure(classification, text);
    const blocks = !["environment_network_issue", "windows_path_process_cleanup_issue"].includes(classification) || /acceptance|validate|readiness|test/.test(lower);
    const decision = classification === "auth_permission_issue" ? "ask_user_or_report_blocked" : classification === "environment_network_issue" ? "stop_or_retry_once_without_product_patch" : blocks ? "continue_after_fix" : "continue_with_caveat";
    return {
      operation_result: "reported",
      classification,
      likely_root_cause: rootCauseForFailure(classification, text),
      exact_file_or_function_to_inspect: fileMatch ? normalizePath(fileMatch[0]) : fallbackInspectionTarget(classification),
      smallest_fix: smallestFixForFailure(classification),
      command_to_rerun: rerun,
      smallest_next_command: rerun,
      recommended_next_action: smallestFixForFailure(classification),
      decision,
      continue_stop_or_ask_user: decision,
      blocks_acceptance: blocks,
      acceptance_blocker: blocks,
      confidence: /error|failed|assert|cannot find|not authenticated|ebusy|generated/i.test(text) ? "medium" : "low",
      must_not_claim: ["Do not claim the failing check passed until rerun evidence exists.", classification.includes("network") ? "Do not claim product regression if the only evidence is network/provider failure." : null, classification.includes("auth") ? "Do not claim live account/GitHub/Cloudflare proof." : null].filter(Boolean),
      output_excerpt: truncate(text, 900),
      output_compact: true
    };
  }

  async function repoEvidencePack(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    const changed = await gitChangedFileNames(root.absolutePath);
    const statusText = await gitValue(root.absolutePath, ["status", "--short"], 16000);
    const head = await gitValue(root.absolutePath, ["rev-parse", "HEAD"]);
    const branch = await gitValue(root.absolutePath, ["branch", "--show-current"]);
    const commands = arrayify(args.commands_run).map(redactSecrets);
    const testsPassed = arrayify(args.tests_passed).map(redactSecrets);
    const testsFailed = arrayify(args.tests_failed).map(redactSecrets);
    const mocked = arrayify(args.mocked_proof).map(redactSecrets);
    const live = arrayify(args.live_proof).map(redactSecrets);
    const blocked = arrayify(args.blocked_proof).map(redactSecrets);
    const safeClaims = [
      args.real_behavior_added?.length ? `Real behavior added: ${arrayify(args.real_behavior_added).join("; ")}` : null,
      testsPassed.length ? `Local checks passed: ${testsPassed.join("; ")}` : null,
      mocked.length ? `Mocked/local proof exists: ${mocked.join("; ")}` : null,
      args.commit_sha || head ? `Local commit/status SHA observed: ${args.commit_sha || head}` : null
    ].filter(Boolean).map(redactSecrets);
    const mustNot = [
      testsFailed.length ? "All tests passed." : null,
      !live.length && /github|cloudflare|deploy|push|pr|issue/i.test([...commands, ...mocked, ...blocked].join(" ")) ? "Live external GitHub/Cloudflare/deploy proof succeeded." : null,
      blocked.length ? "Blocked proof was completed." : null,
      "Secrets or secret files were inspected or safe to print."
    ].filter(Boolean);
    const generatedUpdated = changed.filter(isGeneratedArtifactPath);
    const testsChanged = changed.filter(isTestPath);
    const mainChanged = changed.filter((file) => !isGeneratedArtifactPath(file) && !isTestPath(file)).slice(0, 30);
    const whatNotProven = [
      ...mustNot,
      !live.length ? "Live proof was not attempted or did not produce exact URL/SHA/run evidence." : null,
      testsFailed.length ? "Failed checks are not resolved." : null
    ].filter(Boolean);
    const nextBestTask = args.next_best_task || (testsFailed.length ? `Fix failing check: ${testsFailed[0]}` : changed.length ? "Run the next targeted proof for changed source files." : "Choose the next behavior-backed implementation slice.");
    const pack = {
      operation_result: "reported",
      branch,
      head_sha: head,
      worktree_status: statusText ? statusText.split(/\r?\n/).filter(Boolean).map(redactSecrets) : [],
      commit_status: args.commit_sha ? { committed: true, commit_sha: args.commit_sha, commit_message: redactSecrets(args.commit_message || "") } : { committed: Boolean(head), commit_sha: head || "", commit_message: "" },
      changed_files: changed.slice(0, 120),
      files_changed_count: changed.length,
      main_files_changed: mainChanged,
      new_or_changed_tests: testsChanged,
      commands_run: commands,
      tests_passed: testsPassed,
      tests_failed: testsFailed,
      real_behavior_added: arrayify(args.real_behavior_added).map(redactSecrets),
      proof: { mocked_or_local: mocked, live, blocked },
      live_proof_attempted: live.length > 0,
      generated_artifacts_updated: generatedUpdated,
      remaining_risk: arrayify(args.remaining_risk).map(redactSecrets),
      safe_to_claim: safeClaims,
      not_safe_to_claim: mustNot,
      what_is_not_proven: [...new Set(whatNotProven)],
      next_best_task: nextBestTask,
      proof_packet: {
        Branch: branch,
        "Commit SHA": args.commit_sha || head || "",
        "Commit message": redactSecrets(args.commit_message || ""),
        "Worktree status": statusText ? statusText.split(/\r?\n/).filter(Boolean).map(redactSecrets) : [],
        "Files changed count": changed.length,
        "Main files changed": mainChanged,
        "New/changed tests": testsChanged,
        "Exact tests/checks passed": testsPassed,
        "Exact tests/checks failed": testsFailed,
        "Generated artifacts updated": generatedUpdated,
        "Live proof attempted": live.length > 0 ? "yes" : "no",
        "What is not proven": [...new Set(whatNotProven)],
        "Next best task": nextBestTask
      },
      output_compact: true,
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("repo_evidence_pack", pack);
    pack.evidence_log_id = log.evidence_log_id;
    return pack;
  }

  async function localSessionRecovery(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    const maxCommits = Math.max(3, Math.min(Number(args.max_commits || 12), 30));
    const git = await compactGitState(root.absolutePath);
    const statusText = await gitValue(root.absolutePath, ["status", "--short"], 24000);
    const rawStatus = statusText.split(/\r?\n/).filter(Boolean).map(parseGitStatusLine).filter(Boolean);
    const changedFiles = rawStatus.map((item) => item.path);
    const baseRefRequested = String(args.base_ref || "origin/main").trim() || "origin/main";
    const baseRef = await firstExistingGitRef(root.absolutePath, [baseRefRequested, "origin/main", "main", "master"]);
    const upstream = await gitValue(root.absolutePath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    const stackRange = baseRef ? `${baseRef}..HEAD` : "HEAD";
    const stackLog = await gitValue(root.absolutePath, baseRef
      ? ["log", "--oneline", "--decorate", "--first-parent", `-${maxCommits}`, stackRange]
      : ["log", "--oneline", "--decorate", "--first-parent", `-${maxCommits}`], 24000);
    const recentLog = await gitValue(root.absolutePath, ["log", "--oneline", "--decorate", `-${maxCommits}`], 24000);
    const aheadBehindBase = baseRef ? parseAheadBehind(await gitValue(root.absolutePath, ["rev-list", "--left-right", "--count", `${baseRef}...HEAD`])) : null;
    const aheadBehindUpstream = upstream ? parseAheadBehind(await gitValue(root.absolutePath, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`])) : null;
    const localBranches = (await gitValue(root.absolutePath, ["branch", "--format=%(refname:short) %(objectname:short)"], 16000))
      .split(/\r?\n/).filter(Boolean).map((line) => {
        const [name, short_sha = ""] = line.trim().split(/\s+/);
        return { name, short_sha };
      }).filter((item) => item.name);
    const branchesContainingHead = (await gitValue(root.absolutePath, ["branch", "--contains", "HEAD", "--format=%(refname:short)"], 12000))
      .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const stackCommits = parseGitLogEntries(stackLog);
    const recentCommits = parseGitLogEntries(recentLog);
    const dirtyCategories = classifyRecoveryDirtyFiles(changedFiles);
    const stackBranchCandidates = localBranches
      .filter((branch) => branch.name === git.branch || branchesContainingHead.includes(branch.name) || String(branch.name).startsWith(args.expected_branch_prefix || "feat/"))
      .slice(0, 30);
    const comparisonRef = upstream || baseRef || "";
    const unpushedLog = comparisonRef ? await gitValue(root.absolutePath, ["log", "--oneline", "--decorate", `-${maxCommits}`, `${comparisonRef}..HEAD`], 24000) : stackLog;
    const unpushedCommits = parseGitLogEntries(unpushedLog);
    const recovery = {
      operation_result: "reported",
      repo_root: root.absolutePath,
      current_branch: git.branch,
      head_sha: git.head,
      base_ref: { requested: baseRefRequested, selected: baseRef || "", found: Boolean(baseRef) },
      upstream: upstream || "",
      worktree: {
        dirty: rawStatus.length > 0,
        status: rawStatus.slice(0, 120),
        changed_file_count: rawStatus.length,
        dirty_categories: dirtyCategories
      },
      local_stack: {
        comparison_ref: baseRef || "",
        ahead_count: aheadBehindBase?.ahead ?? null,
        behind_count: aheadBehindBase?.behind ?? null,
        commits: stackCommits,
        recent_commits: recentCommits,
        branches_containing_head: branchesContainingHead,
        local_branches_on_stack: stackBranchCandidates
      },
      unpushed_commits: {
        comparison_ref: comparisonRef,
        ahead_count: (aheadBehindUpstream || aheadBehindBase)?.ahead ?? (comparisonRef ? unpushedCommits.length : null),
        behind_count: (aheadBehindUpstream || aheadBehindBase)?.behind ?? null,
        commits: unpushedCommits
      },
      likely_next_branch: inferLikelyRecoveryBranch(git.branch, args),
      safe_next_action: chooseSessionRecoverySafeNext(rawStatus, unpushedCommits, git.branch),
      what_not_to_touch: [
        "Do not mutate main/master or protected branches during recovery.",
        "Do not force-push, merge, push, or open a PR from recovery output alone.",
        "Do not inspect or print secret file contents; only path/status classification is used.",
        "Do not rewrite previous local stack commits unless the user explicitly asks.",
        "Do not treat local refs as proof of remote GitHub/CI/deploy state."
      ],
      safe_to_claim: [
        "Local branch, HEAD, worktree status, local branches, and commit stack were reconstructed from git.",
        "Unpushed/ahead counts are inferred from local refs only.",
        "No secret file contents were read and no network/live GitHub proof was attempted."
      ],
      not_proven: [
        "Remote GitHub branch, PR, issue, Actions, and CI state.",
        "Whether origin/main is freshly fetched.",
        "Whether a push, merge, deploy, or release happened elsewhere.",
        "That hidden chat context was recovered."
      ],
      live_proof_attempted: false,
      secret_values_exposed: false,
      output_compact: true,
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("local_session_recovery", recovery);
    recovery.evidence_log_id = log.evidence_log_id;
    return recovery;
  }

  async function repoWorkflowOrchestrator(args = {}) {
    const root = await resolveAllowedRoot(args.repo_path || args.root || ".");
    const goal = redactSecrets(String(args.user_goal || ""));
    const taskMode = normalizeWorkflowTaskMode(args.task_mode);
    const proofLevel = ["targeted", "full_local", "remote"].includes(args.proof_level) ? args.proof_level : "targeted";
    const changed = arrayify(args.changed_files).map(normalizePath).filter(Boolean);
    const failingOutput = redactSecrets(String(args.failing_output || ""));
    const map = await repoDeepMap({ root: root.absolutePath, max_files: 500, max_depth: 6, include_git: true, user_goal: goal });
    const changedForPlanning = changed.length ? changed : map.changed_or_untracked_files;
    const impact = await changeImpactPlan({ root: root.absolutePath, changed_files: changedForPlanning });
    const testPlan = await testSelectionPlan({ root: root.absolutePath, user_goal: goal, changed_files: changedForPlanning, failure_context: failingOutput });
    const audit = await noPlaceboProgressAudit({ root: root.absolutePath, proposed_summary: goal, completed_summary: goal, changed_files: changedForPlanning, tests_run: [] });
    const ranking = await nextActionRanker({ root: root.absolutePath, user_goal: goal, known_failures: failingOutput ? [failingOutput] : [], max_actions: 5 });
    const recovery = await localSessionRecovery({ root: root.absolutePath, task_goal: goal, max_commits: 8 });
    const failure = taskMode === "ci_failure" || failingOutput ? await failureTriage({ root: root.absolutePath, command: "gh run view <run-id> --log", stderr: failingOutput, context: goal }) : null;
    const actionRecovery = failingOutput ? buildActionRecoveryPlan({ tool_name: "vnem_tools_repo_workflow_orchestrator", operation: taskMode, stderr: failingOutput, context: goal }) : null;
    const highPowerReview = highPowerActionReview({ tool_name: "vnem_tools_repo_workflow_orchestrator", operation: taskMode, target: root.relativePath || root.absolutePath, mutation_type: taskMode === "publish" ? "remote publish planning" : "read-only planning", expected_effect: goal });
    const truthCheck = taskProgressTruthCheck({ changed_files: changedForPlanning, tested: [], simulated_only: false, proven: [], blockers: [] });
    const selectedAction = workflowSelectedAction({ taskMode, proofLevel, goal, map, impact, testPlan, audit, ranking, recovery, failure });
    const rejectedActions = workflowRejectedActions(taskMode, proofLevel, audit);
    const exactChecks = workflowExactChecks({ taskMode, proofLevel, branch: recovery.current_branch || map.git.branch || "<feature-branch>", testPlan, impact, failure, goal });
    const remoteProofRequired = taskMode === "publish" || proofLevel === "remote";
    const stopConditions = workflowStopConditions(taskMode, recovery, failure);
    const whatNotProven = workflowNotProven({ taskMode, proofLevel, remoteProofRequired, allowLiveRemote: args.allow_live_remote, failure });
    const proofPacketFields = [
      "Branch",
      "Local HEAD SHA",
      "Remote branch SHA",
      "PR URL",
      "PR head SHA",
      "Actions run URL",
      "Actions status/conclusion",
      "Local checks run",
      "Remote checks observed",
      "Files changed in this task",
      "New commits made in this task",
      "Worktree status",
      "Live proof attempted",
      "What is not proven",
      "Next best task"
    ];
    const orchestration = {
      operation_result: "reported",
      task_mode: taskMode,
      proof_level: proofLevel,
      user_goal: goal,
      repo_root: root.absolutePath,
      repo_state_summary: {
        current_branch: recovery.current_branch || map.git.branch,
        head_sha: recovery.head_sha || map.git.head,
        dirty_worktree: recovery.worktree.dirty,
        dirty_file_count: recovery.worktree.changed_file_count,
        changed_files: changedForPlanning.slice(0, 80),
        dirty_categories: recovery.worktree.dirty_categories,
        recent_commit_stack: map.git.recent_commits.slice(0, 8),
        local_stack: recovery.local_stack.commits.slice(0, 8),
        unpushed_local_only: {
          comparison_ref: recovery.unpushed_commits.comparison_ref,
          ahead_count: recovery.unpushed_commits.ahead_count,
          behind_count: recovery.unpushed_commits.behind_count,
          commits: recovery.unpushed_commits.commits.slice(0, 8)
        }
      },
      synthesis: {
        selected_action: selectedAction,
        rejected_actions: rejectedActions,
        why_this_not_raw_tool: "This tool runs the existing repo-power helpers, compares their outputs, and returns one mode-aware workflow contract instead of making the caller manually reconcile map/rank/audit/impact/test/triage/recovery signals."
      },
      selected_action: selectedAction,
      rejected_actions: rejectedActions,
      exact_checks: exactChecks,
      evidence_contract: {
        proof_packet_required: true,
        proof_packet_fields: proofPacketFields,
        remote_proof_required: remoteProofRequired,
        live_remote_allowed: args.allow_live_remote === true,
        local_vs_remote: remoteProofRequired ? "Local checks are insufficient; exact remote SHA/PR/Actions evidence must be observed by the caller." : "Local proof can justify local progress, but remote GitHub/CI/deploy state remains unproven."
      },
      no_placebo_gate: {
        real_progress_score: audit.real_progress_score,
        progress_level: audit.progress_level,
        placebo_risks: audit.placebo_risks,
        missing_proof: audit.missing_proof,
        required_correction: audit.exact_next_correction,
        docs_only_rejected: audit.placebo_risks.some((risk) => /docs-only/i.test(risk))
      },
      failure_triage_plan: failure ? {
        classification: failure.classification,
        likely_root_cause: failure.likely_root_cause,
        exact_file_or_function_to_inspect: failure.exact_file_or_function_to_inspect,
        smallest_fix: failure.smallest_fix,
        command_to_rerun: failure.command_to_rerun,
        continue_stop_or_ask_user: failure.continue_stop_or_ask_user,
        must_not_claim: failure.must_not_claim
      } : {
        classification: "not_applicable",
        next_if_failure_appears: "Run vnem_tools_failure_triage with the exact failing output before patching."
      },
      recovery_plan: {
        safe_next_action: recovery.safe_next_action,
        what_not_to_touch: recovery.what_not_to_touch,
        not_proven: recovery.not_proven,
        action_recovery_plan: actionRecovery
      },
      validation_plan: {
        first_checks_to_run: testPlan.first_checks_to_run,
        targeted_tests: testPlan.targeted_tests,
        regression_tests: testPlan.regression_tests,
        readiness_or_generation_checks: testPlan.readiness_or_generation_checks,
        full_npm_test_recommended: taskMode === "publish" || proofLevel === "full_local" ? testPlan.full_npm_test_recommended : false,
        proof_boundaries: testPlan.proof_boundaries
      },
      connected_tools: {
        repo_deep_map: { branch: map.git.branch, dirty: map.git.dirty, files_sampled: map.compact_summary.file_count_sampled },
        next_action_ranker: ranking.actions.slice(0, 3),
        no_placebo_progress_audit: { score: audit.real_progress_score, risks: audit.placebo_risks },
        change_impact_plan: { areas: impact.changed_areas, risk_level: impact.risk_level, generation_required: impact.generation_required },
        test_selection_plan: { first_checks_to_run: testPlan.first_checks_to_run, full_npm_test_recommended: testPlan.full_npm_test_recommended },
        failure_triage: failure ? { classification: failure.classification, smallest_fix: failure.smallest_fix } : null,
        evidence_pack_contract: { proof_packet_required: true, fields: proofPacketFields },
        local_session_recovery: { branch: recovery.current_branch, head_sha: recovery.head_sha, safe_next_action: recovery.safe_next_action },
        capability_gap_report: capabilityGapReport().missing_or_limited_capabilities.slice(0, 3).map((gap) => gap.capability),
        high_power_action_review: { action_allowed: highPowerReview.action_allowed, reasons_to_block: highPowerReview.reasons_to_block },
        action_recovery_plan: actionRecovery ? { likely_cause: actionRecovery.likely_cause, next: actionRecovery.exact_next_steps[0] } : null,
        task_progress_truth_check: { status: truthCheck.status, what_not_to_claim: truthCheck.what_not_to_claim },
        pr_quality_gate: taskMode === "publish" ? { required_after_local_checks: true, tool: "vnem_tools_pr_quality_gate" } : { required_after_local_checks: false },
        tools_manifest: { repo_power_tool_count_expected: 15, includes: "vnem_tools_repo_workflow_orchestrator,vnem_tools_code_symbol_map" }
      },
      stop_conditions: stopConditions,
      safety_boundaries: [
        "The orchestrator is read-only and does not execute commands, edit files, push, create PRs, or inspect secret contents.",
        "Remote proof must be collected by explicit gh/git commands or scoped GitHub tools; this plan is not itself remote proof.",
        "Do not force-push, reset, merge, or mutate protected branches from this output.",
        "If worktree is dirty, inspect exact files before publish or validation claims."
      ],
      final_handoff_shape: proofPacketFields,
      safe_next_step: selectedAction.next_best_step,
      what_is_not_proven: whatNotProven,
      remote_proof_required: remoteProofRequired,
      live_proof_attempted: false,
      output_compact: true,
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("repo_workflow_orchestrator", orchestration);
    orchestration.evidence_log_id = log.evidence_log_id;
    return orchestration;
  }

  async function codeSymbolMap(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    const maxFiles = Math.min(Math.max(args.max_files || 260, 20), 1000);
    const maxSymbols = Math.min(Math.max(args.max_symbols || 220, 20), 1000);
    const candidates = await codeIntelligenceCandidateFiles(root.absolutePath, { maxFiles, includeTests: args.include_tests !== false });
    const symbols = [];
    const fileSummaries = [];
    const warnings = [];
    for (const file of candidates.files.slice(0, maxFiles)) {
      if (symbols.length >= maxSymbols) break;
      const read = await readRepoTextFile(root.absolutePath, file.path, 256000);
      if (!read.text) continue;
      const extracted = extractLightweightSymbols(file.path, read.text);
      if (read.truncated) warnings.push(`${file.path} truncated before symbol extraction`);
      symbols.push(...extracted.symbols);
      fileSummaries.push({
        path: file.path,
        category: codeFileCategory(file.path),
        bytes_read: read.bytes_read,
        truncated: read.truncated,
        symbol_count: extracted.symbols.length,
        imports_or_exports: extracted.imports_or_exports.slice(0, 8),
        tool_related: extracted.tool_related
      });
    }
    const capped = symbols.slice(0, maxSymbols);
    const toolRelated = capped.filter((symbol) => symbol.tool_related || /vnem_tools_|Tool|Handler|Action|Recovery|Audit|Guard|Orchestrator/i.test(`${symbol.name} ${symbol.file}`));
    const map = {
      operation_result: "reported",
      repo_path: root.absolutePath,
      parser_type: "lightweight-regex-heuristic",
      files_scanned: fileSummaries.length,
      symbols_found: capped.length,
      important_files: buildCodeIntelligenceImportantFiles(fileSummaries, toolRelated),
      top_symbols: capped.slice(0, 80),
      tool_related_symbols: toolRelated.slice(0, 80),
      file_summaries: fileSummaries.slice(0, 120),
      skipped: candidates.skipped.slice(0, 80),
      warnings: [...new Set(warnings.concat(capped.length < symbols.length ? "symbol output capped" : []))].filter(Boolean),
      limits: { max_files: maxFiles, max_symbols: maxSymbols, max_file_bytes: 256000, parser_is_not_ast: true },
      output_compact: true,
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("code_symbol_map", map);
    map.evidence_log_id = log.evidence_log_id;
    return map;
  }

  async function mcpSurfaceAudit(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    const serverFile = normalizePath(args.server_file || "scripts/vnem-tools-mcp-server.mjs");
    const implementationFiles = toolsServerImplementationFiles(root.absolutePath, serverFile);
    const implementationSources = [];
    for (const file of implementationFiles) {
      const source = await readRepoTextFile(root.absolutePath, file, 900000);
      implementationSources.push({ file, text: source.text || "" });
    }
    const serverText = implementationSources.map((source) => source.text).join("\n");
    const packageRead = await readRepoTextFile(root.absolutePath, "package.json", 320000);
    const readinessRead = await readRepoTextFile(root.absolutePath, "scripts/tools-readiness-report.mjs", 900000);
    const registrations = implementationSources.flatMap((source) => parseRegisteredToolsFromServer(source.text, source.file)).slice(0, args.max_tools || 160);
    const toolNames = registrations.map((tool) => tool.name);
    const coverage = await scanToolCoverage(root.absolutePath, toolNames, { packageText: packageRead.text, readinessText: readinessRead.text });
    const tools = registrations.map((tool) => {
      const cov = coverage.per_tool[tool.name] || {};
      const catalogReferenced = new RegExp(`mk\\(["']${escapeRegExp(tool.name)}["']`).test(serverText) || serverText.includes(tool.name);
      const readinessReferenced = readinessRead.text.includes(tool.name);
      const packageReferenced = packageRead.text.includes(tool.name) || (cov.package_scripts || []).length > 0;
      const weak = !tool.handler_candidates.length || cov.coverage_level !== "behavior_test";
      return {
        name: tool.name,
        implementation_file: tool.implementation_file,
        registration_line: tool.line_number,
        handler_candidates: tool.handler_candidates,
        primary_handler_candidate: tool.handler_candidates[0] || "",
        catalog_referenced: catalogReferenced,
        readiness_referenced: readinessReferenced,
        package_referenced: packageReferenced,
        coverage_level: cov.coverage_level || "no_test_found",
        behavior_test_files: cov.behavior_test_files || [],
        registration_only_test_files: cov.registration_only_test_files || [],
        weak_surface: weak,
        risk: !tool.handler_candidates.length ? "registration_without_clear_handler" : cov.coverage_level !== "behavior_test" ? "missing_behavior_test" : "low"
      };
    });
    const weakTools = tools.filter((tool) => tool.weak_surface);
    const audit = {
      operation_result: "reported",
      repo_path: root.absolutePath,
      server_file: serverFile,
      implementation_file: implementationFiles[0],
      implementation_files: implementationFiles,
      total_tools_detected: tools.length,
      tools_with_handlers: tools.filter((tool) => tool.handler_candidates.length).length,
      tools_with_tests: tools.filter((tool) => tool.coverage_level === "behavior_test").length,
      tools_with_readiness: tools.filter((tool) => tool.readiness_referenced).length,
      tools: tools.slice(0, args.max_tools || 160),
      weak_tools: weakTools.map((tool) => ({ name: tool.name, risk: tool.risk, handler_candidates: tool.handler_candidates, coverage_level: tool.coverage_level })).slice(0, 80),
      registration_only_risks: tools.filter((tool) => tool.coverage_level === "registration_only" || !tool.handler_candidates.length).map((tool) => tool.name).slice(0, 80),
      missing_tests: tools.filter((tool) => tool.coverage_level !== "behavior_test").map((tool) => tool.name).slice(0, 80),
      exact_files_to_inspect: [...new Set([...implementationFiles, serverFile, "scripts/tools-readiness-report.mjs", "package.json", ...Object.values(coverage.per_tool).flatMap((item) => [...(item.behavior_test_files || []), ...(item.registration_only_test_files || [])])])].slice(0, 80),
      recommended_next_repairs: weakTools.slice(0, 12).map((tool) => `${tool.name}: add/verify handler behavior and MCP-path behavior test`),
      parser_limits: { parser_type: "lightweight-regex-heuristic", block_matching_is_heuristic: true },
      output_compact: true,
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("mcp_surface_audit", audit);
    audit.evidence_log_id = log.evidence_log_id;
    return audit;
  }

  async function patchTargetFinder(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    const goal = redactSecrets(String(args.user_goal || ""));
    const exactTool = normalizeToolName(args.tool_name || goal.match(/vnem_tools_[a-z0-9_]+/i)?.[0] || "");
    const keyword = String(args.keyword || "");
    const tokens = tokenizeCodeGoal(`${goal} ${keyword} ${exactTool}`).slice(0, 14);
    const [audit, symbols] = await Promise.all([
      mcpSurfaceAudit({ root: root.absolutePath, max_tools: 220 }),
      codeSymbolMap({ root: root.absolutePath, max_files: 420, max_symbols: 420, include_tests: true })
    ]);
    const coverage = await toolTestCoverageMap({ root: root.absolutePath, tool_name: exactTool });
    const sourceScores = new Map();
    const functionScores = new Map();
    const testScores = new Map();
    const searchEvidence = [];
    const bump = (map, key, score) => { if (key) map.set(key, (map.get(key) || 0) + score); };
    if (exactTool) {
      const tool = audit.tools.find((item) => item.name === exactTool);
      if (tool) {
        bump(sourceScores, tool.implementation_file || audit.implementation_file || audit.server_file, 90);
        bump(sourceScores, audit.server_file, 20);
        for (const fn of tool.handler_candidates) bump(functionScores, fn, 80);
        for (const file of tool.behavior_test_files) bump(testScores, file, 80);
        for (const file of tool.registration_only_test_files) bump(testScores, file, 30);
        searchEvidence.push({ reason: "exact_tool_registration", tool: exactTool, server_file: audit.server_file, handler_candidates: tool.handler_candidates });
      }
    }
    for (const symbol of symbols.top_symbols) {
      const haystack = `${symbol.name} ${symbol.file} ${symbol.kind} ${symbol.snippet}`.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 12 : 0), 0);
      if (score > 0) {
        bump(sourceScores, symbol.file, score + (symbol.tool_related ? 12 : 0));
        bump(functionScores, symbol.name, score);
        searchEvidence.push({ reason: "symbol_token_match", file: symbol.file, symbol: symbol.name, matched_tokens: tokens.filter((token) => haystack.includes(token)).slice(0, 6) });
      }
    }
    const candidateFiles = await codeIntelligenceCandidateFiles(root.absolutePath, { maxFiles: 700, includeTests: true });
    for (const file of candidateFiles.files.slice(0, 700)) {
      const read = await readRepoTextFile(root.absolutePath, file.path, 120000);
      if (!read.text) continue;
      const haystack = `${file.path}\n${read.text}`.toLowerCase();
      const matches = tokens.filter((token) => haystack.includes(token));
      if (!matches.length) continue;
      const score = matches.length * (isTestPath(file.path) ? 8 : 10) + (isLikelyRegistryPath(file.path) ? 20 : 0);
      if (isTestPath(file.path)) bump(testScores, file.path, score);
      else bump(sourceScores, file.path, score);
      searchEvidence.push({ reason: "text_token_match", file: file.path, matched_tokens: matches.slice(0, 6), snippet: truncate(firstMatchingLine(read.text, matches), 180) });
    }
    const toRanked = (map, limit) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([item, score]) => ({ item, score }));
    const likelySourceFiles = toRanked(sourceScores, args.max_results || 12).map(({ item, score }) => ({ path: item, score }));
    const likelyFunctions = toRanked(functionScores, args.max_results || 12).map(({ item, score }) => ({ name: item, score }));
    const likelyTests = toRanked(testScores, args.max_results || 12).map(({ item, score }) => ({ path: item, score }));
    const readinessFiles = ["scripts/tools-readiness-report.mjs", "package.json"].filter((file) => existsSync(path.join(root.absolutePath, file)));
    const packageScripts = coverage.coverage_summary?.package_scripts_reviewed || [];
    const result = {
      operation_result: "reported",
      repo_path: root.absolutePath,
      query: { user_goal: goal, tool_name: exactTool, keyword, tokens },
      likely_source_files: likelySourceFiles,
      likely_functions: likelyFunctions,
      likely_tests: likelyTests,
      likely_readiness_files: readinessFiles,
      likely_generated_sources: ["scripts/generate-artifacts.mjs", "registry/", "capabilities/"].filter((item) => existsSync(path.join(root.absolutePath, item.replace(/\/$/, "")))),
      package_scripts: packageScripts.filter((script) => tokens.some((token) => script.toLowerCase().includes(token)) || (exactTool && script.includes(exactTool.replace("vnem_tools_", "").replace(/_/g, "-")))).slice(0, 20),
      search_evidence: searchEvidence.slice(0, 30),
      exact_next_file_to_open: likelySourceFiles[0]?.path || likelyTests[0]?.path || audit.server_file,
      confidence: exactTool && likelySourceFiles.length && likelyFunctions.length ? "high" : likelySourceFiles.length || likelyTests.length ? "medium" : "low",
      what_not_to_edit: ["generated artifacts before source behavior is stable", "unrelated registries/catalog text without handler behavior", "secret-like paths or .env files"],
      parser_limits: { parser_type: "lightweight-regex-heuristic", not_a_full_semantic_index: true },
      output_compact: true,
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("patch_target_finder", result);
    result.evidence_log_id = log.evidence_log_id;
    return result;
  }

  async function toolTestCoverageMap(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    const implementationFiles = toolsServerImplementationFiles(root.absolutePath, "scripts/vnem-tools-mcp-server.mjs");
    const registeredNames = [];
    for (const file of implementationFiles) {
      const source = await readRepoTextFile(root.absolutePath, file, 900000);
      registeredNames.push(...parseRegisteredToolsFromServer(source.text, file).map((tool) => tool.name));
    }
    const allTools = uniqueToolNames([
      ...registeredNames,
      ...toolsRegistry.manifest().map((tool) => tool.name)
    ]);
    const selected = normalizeToolName(args.tool_name || "");
    const toolNames = (selected ? allTools.filter((name) => name === selected) : allTools).slice(0, args.max_tools || 160);
    const packageRead = await readRepoTextFile(root.absolutePath, "package.json", 320000);
    const readinessRead = await readRepoTextFile(root.absolutePath, "scripts/tools-readiness-report.mjs", 900000);
    const coverage = await scanToolCoverage(root.absolutePath, toolNames, { packageText: packageRead.text, readinessText: readinessRead.text });
    const perTool = Object.fromEntries(toolNames.map((name) => [name, coverage.per_tool[name]]));
    const strong = Object.values(perTool).filter((item) => item.coverage_level === "behavior_test").map((item) => item.tool_name);
    const weak = Object.values(perTool).filter((item) => item.coverage_level !== "behavior_test").map((item) => item.tool_name);
    const result = {
      operation_result: "reported",
      repo_path: root.absolutePath,
      coverage_summary: {
        tools_reviewed: toolNames.length,
        behavior_tested: strong.length,
        weak_or_missing: weak.length,
        package_scripts_reviewed: coverage.package_scripts.slice(0, 120),
        readiness_file_reviewed: Boolean(readinessRead.text)
      },
      per_tool: perTool,
      strong_coverage_tools: strong.slice(0, 80),
      weak_coverage_tools: weak.slice(0, 80),
      untested_tools: Object.values(perTool).filter((item) => item.coverage_level === "no_test_found").map((item) => item.tool_name).slice(0, 80),
      behavior_test_files: [...new Set(Object.values(perTool).flatMap((item) => item.behavior_test_files || []))].slice(0, 80),
      registration_only_risks: Object.values(perTool).filter((item) => item.coverage_level === "registration_only").map((item) => item.tool_name).slice(0, 80),
      recommended_test_additions: weak.slice(0, 20).map((name) => `${name}: add MCP client behavior test that calls the tool and asserts structured output, not only listTools/manifest presence`),
      output_compact: true,
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("tool_test_coverage_map", result);
    result.evidence_log_id = log.evidence_log_id;
    return result;
  }

  function toolsServerImplementationFiles(root, requestedFile) {
    const normalized = normalizePath(requestedFile || "scripts/vnem-tools-mcp-server.mjs");
    if (normalized !== "scripts/vnem-tools-mcp-server.mjs") return [normalized];
    const modular = [
      "scripts/vnem/tools/server.mjs",
      "scripts/vnem/tools/client-setup.mjs",
      "scripts/vnem/tools/repo-intelligence-runtime.mjs",
      "scripts/vnem/tools/source-research-runtime.mjs",
      "scripts/vnem/tools/browser-research-runtime.mjs",
      "scripts/vnem/tools/github-operations-runtime.mjs"
    ].filter((file) => existsSync(path.join(root, file)));
    return modular.length ? modular : [normalized];
  }

  async function sourceImpactTrace(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    let changed = arrayify(args.changed_files).map(normalizePath).filter(Boolean);
    const targetFile = normalizePath(args.target_file || "");
    const targetSymbol = String(args.target_symbol || "");
    if (!changed.length && targetFile) changed = [targetFile];
    const finder = (!changed.length || targetSymbol || args.user_goal) ? await patchTargetFinder({ root: root.absolutePath, user_goal: args.user_goal || targetSymbol, keyword: targetSymbol, max_results: 12 }) : null;
    if (!changed.length && finder) changed = finder.likely_source_files.map((item) => item.path).slice(0, 6);
    const impact = await changeImpactPlan({ root: root.absolutePath, changed_files: changed });
    const audit = await mcpSurfaceAudit({ root: root.absolutePath, max_tools: 220 });
    const impactedTools = new Set();
    for (const tool of audit.tools) {
      if (targetSymbol && tool.handler_candidates.includes(targetSymbol)) impactedTools.add(tool.name);
      if (changed.includes(audit.server_file) && (tool.handler_candidates.some((fn) => targetSymbol && fn.toLowerCase().includes(targetSymbol.toLowerCase())) || !targetSymbol)) impactedTools.add(tool.name);
      if (changed.some((file) => [...tool.behavior_test_files, ...tool.registration_only_test_files].includes(file))) impactedTools.add(tool.name);
    }
    if (finder?.query?.tool_name) impactedTools.add(finder.query.tool_name);
    const coverage = await toolTestCoverageMap({ root: root.absolutePath });
    const impactedTests = [...impactedTools].flatMap((tool) => coverage.per_tool[tool]?.behavior_test_files || []);
    const exactChecks = [...new Set([
      ...impact.minimum_targeted_tests,
      ...impactedTests.map((file) => packageScriptForTestFile(coverage.coverage_summary.package_scripts_reviewed, file)).filter(Boolean),
      changed.some((file) => file === "scripts/tools-readiness-report.mjs" || file === "package.json" || file === audit.server_file) ? "npm.cmd run tools:readiness" : null
    ].filter(Boolean))];
    const trace = {
      operation_result: "reported",
      repo_path: root.absolutePath,
      changed_files: changed.slice(0, 80),
      target_file: targetFile,
      target_symbol: targetSymbol,
      impacted_tools: [...impactedTools].slice(0, 60),
      impacted_features: impact.likely_affected_tools_or_features,
      impacted_tests: [...new Set(impactedTests)].slice(0, 60),
      readiness_needed: changed.some((file) => /scripts\/tools-readiness-report\.mjs|package\.json|scripts\/vnem-tools-mcp-server\.mjs/.test(file)),
      generation_needed: impact.generation_required,
      dashboard_install_artifact_needed: changed.some((file) => /dashboard\/|public\/install|landing\/install\.tgz|scripts\/generate-artifacts\.mjs/.test(file)),
      full_suite_justified: impact.full_npm_test_justified,
      exact_minimum_checks: exactChecks.slice(0, 24),
      risk_level: impact.risk_level,
      why: impactedTools.size ? "Changed/targeted files map to MCP registered tool handlers or behavior tests." : "Impact is inferred from changed file areas and package/readiness/generation rules.",
      patch_target_context: finder ? { exact_next_file_to_open: finder.exact_next_file_to_open, confidence: finder.confidence } : null,
      output_compact: true,
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("source_impact_trace", trace);
    trace.evidence_log_id = log.evidence_log_id;
    return trace;
  }

  async function sourceControlCharacterGuard(args = {}) {
    const root = await resolveAllowedRoot(args.root || ".");
    const changed = arrayify(args.changed_files).map(normalizePath).filter(Boolean);
    const maxFiles = Math.min(Math.max(args.max_files || 500, 10), 1000);
    const skipped = [];
    let scanFiles = [];
    if (changed.length) {
      scanFiles = changed.map((file) => ({ path: file, bytes: 0 })).filter((file) => !isSecretLikePath(file.path));
    } else {
      const candidates = await codeIntelligenceCandidateFiles(root.absolutePath, { maxFiles, includeTests: true });
      scanFiles = candidates.files;
      skipped.push(...candidates.skipped);
    }
    const findings = [];
    const generatedOrBinary = [];
    let filesScanned = 0;
    for (const file of scanFiles.slice(0, maxFiles)) {
      const rel = normalizePath(file.path);
      if (isGeneratedArtifactPath(rel) || isBinaryLikePath(rel) || shouldSkipRelative(rel)) { generatedOrBinary.push(rel); continue; }
      if (!isSourceBehaviorPath(rel) && !isTestPath(rel) && !isConfigPath(rel)) { skipped.push(rel); continue; }
      const read = await readRepoTextFile(root.absolutePath, rel, 512000);
      if (!read.text) { skipped.push(rel); continue; }
      filesScanned += 1;
      findings.push(...hiddenControlFindings(rel, read.text));
    }
    const dangerous = findings.filter((finding) => finding.category === "bidi_or_directional_control" || finding.category === "dangerous_control_character");
    const result = {
      operation_result: "reported",
      repo_path: root.absolutePath,
      files_scanned: filesScanned,
      findings: findings.slice(0, 120),
      dangerous_source_findings: dangerous.slice(0, 120),
      source_clean: dangerous.length === 0,
      skipped_binary_or_generated: [...new Set(generatedOrBinary)].slice(0, 120),
      skipped_other: [...new Set(skipped)].slice(0, 120),
      warnings: [findings.length > 120 ? "finding output capped" : null, scanFiles.length > maxFiles ? "file scan capped" : null].filter(Boolean),
      output_compact: true,
      evidence_log_id: null
    };
    const log = await writeEvidenceLog("source_control_character_guard", result);
    result.evidence_log_id = log.evidence_log_id;
    return result;
  }

  function normalizeWorkflowTaskMode(value) {
    const mode = String(value || "implementation").toLowerCase().replace(/-/g, "_");
    if (mode === "ci_fix") return "ci_failure";
    return ["local_only", "publish", "ci_failure", "recovery", "implementation", "validation", "no_placebo"].includes(mode) ? mode : "implementation";
  }

  function workflowSelectedAction({ taskMode, proofLevel, goal, map, impact, testPlan, audit, ranking, recovery, failure }) {
    const topRank = ranking.actions[0];
    const branch = recovery.current_branch || map.git.branch || "<feature-branch>";
    if (taskMode === "local_only") {
      return {
        phase: "local_only",
        action: "Complete and prove the smallest local behavior slice without publish, PR, or Actions proof.",
        next_best_step: (testPlan.first_checks_to_run[0] || impact.minimum_targeted_tests[0] || topRank?.action || "Run the first targeted local check."),
        reason: "The task mode explicitly forbids remote proof; source/test/readiness evidence is the useful boundary.",
        expected_files_to_touch: topRank?.expected_files_to_touch || impact.changed_files.slice(0, 6),
        expected_proof_checks: workflowLocalChecks(testPlan, impact),
        source_behavior_required: true
      };
    }
    if (taskMode === "publish") {
      return {
        phase: "publish",
        action: `Publish branch ${branch}, then prove exact remote SHA, PR head SHA, and GitHub Actions status.`,
        next_best_step: `Verify clean worktree and push refs/heads/${branch} only after local checks pass.`,
        reason: "Publish mode requires remote evidence; local-only proof is not enough.",
        expected_files_to_touch: [],
        expected_proof_checks: ["git status --short", `git ls-remote origin refs/heads/${branch}`, "gh pr view/create", "gh run list/view"],
        remote_mutation_required: true
      };
    }
    if (taskMode === "ci_failure") {
      return {
        phase: "ci_failure",
        action: "Classify the failing CI log, patch only the smallest branch-caused product/test failure, then rerun the exact failing check.",
        next_best_step: failure?.smallest_fix || "Fetch the exact failing CI log before editing.",
        reason: failure?.likely_root_cause || "CI failure mode needs failure output before implementation.",
        expected_files_to_touch: failure?.exact_file_or_function_to_inspect ? [failure.exact_file_or_function_to_inspect] : impact.likely_affected_tools_or_features.slice(0, 4),
        expected_proof_checks: ["gh run view <run-id> --log", failure?.command_to_rerun || "rerun the smallest failing command"],
        failure_classification: failure?.classification || "missing_failure_output"
      };
    }
    if (taskMode === "recovery") {
      return {
        phase: "recovery",
        action: "Recover branch, HEAD, dirty files, local stack, and unpushed/local-only status before deciding on edits or publish.",
        next_best_step: recovery.safe_next_action,
        reason: "Recovery mode is about reconstructing local truth, not making mutations.",
        expected_files_to_touch: [],
        expected_proof_checks: ["git status --short", "git branch --show-current", "git log --oneline --decorate -8", "git rev-list --left-right --count origin/main...HEAD"],
        recovery_first: true
      };
    }
    if (taskMode === "validation") {
      const proofAlreadyExists = /proof already exists|tests? passed|passed and|already passed/i.test(goal);
      return {
        phase: "validation",
        action: proofAlreadyExists ? "Record the missing proof packet and avoid a broad validation loop unless a risk trigger is present." : "Run the smallest missing proof check, then build the evidence packet.",
        next_best_step: proofAlreadyExists ? "Assemble evidence_pack fields from observed command output." : (testPlan.first_checks_to_run[0] || "Run the first targeted check."),
        reason: proofAlreadyExists ? "The goal indicates proof already exists; repeating full npm test is lower value than preserving exact evidence." : "Validation should close the smallest proof gap first.",
        expected_files_to_touch: [],
        expected_proof_checks: proofAlreadyExists ? ["npm.cmd run tools:readiness", "vnem_tools_evidence_pack"] : workflowLocalChecks(testPlan, impact),
        avoid_full_suite_without_trigger: proofLevel !== "full_local"
      };
    }
    if (taskMode === "no_placebo") {
      return {
        phase: "no_placebo",
        action: "Reject docs-only, tests-only, generated-only, or registration-only claims until source behavior and proof are visible.",
        next_best_step: audit.exact_next_correction,
        reason: audit.placebo_risks[0] || "No-placebo mode requires implementation proof, not only claims.",
        expected_files_to_touch: audit.exact_files_or_functions_to_inspect,
        expected_proof_checks: ["vnem_tools_no_placebo_progress_audit", ...workflowLocalChecks(testPlan, impact).slice(0, 4)],
        source_behavior_required: true
      };
    }
    return {
      phase: "implementation",
      action: topRank?.action || "Implement the smallest behavior-backed slice, then run targeted proof.",
      next_best_step: topRank?.expected_proof_checks?.[0] || testPlan.first_checks_to_run[0] || "Run targeted proof after source behavior changes.",
      reason: topRank?.reason || "Implementation mode should favor source behavior plus focused proof over planning-only work.",
      expected_files_to_touch: topRank?.expected_files_to_touch || impact.changed_files.slice(0, 6),
      expected_proof_checks: topRank?.expected_proof_checks || workflowLocalChecks(testPlan, impact),
      source_behavior_required: true
    };
  }

  function workflowRejectedActions(taskMode, proofLevel, audit) {
    const common = [
      "Secret file/content inspection or printing",
      "Force push, reset --hard, history rewrite, or direct protected-branch mutation",
      "Claiming live GitHub/CI/deploy proof without exact URL/SHA/run evidence"
    ];
    const byMode = {
      local_only: ["git push / gh pr / gh run remote proof for a local-only task", "full npm test before targeted local checks pass", "generated-only churn before source behavior"],
      publish: ["new implementation before clean-worktree and local-check verification", "push to main or force push", "editing files unless CI proves a branch-caused failure"],
      ci_failure: ["broad refactor before reading exact failing log", "fixing environment/auth/network failures as product bugs", "claiming CI green before rerun evidence"],
      recovery: ["git reset --hard or checkout-away dirty files", "push/merge/open PR from recovery output alone", "treating local refs as remote proof"],
      implementation: ["docs-only implementation claim", "tests-only registration proof", "validation-only loop before behavior exists"],
      validation: ["re-running full npm test when exact proof already exists and no broad trigger is present", "browser/live proof unless UI or remote publish is in scope", "new implementation during validation unless a proof gap exposes a bug"],
      no_placebo: ["docs-only claims", "generated-only claims", "registration-only tool names without execution behavior", "mocked-only proof described as live proof"]
    };
    const extra = proofLevel === "remote" ? ["accepting local-only proof for remote acceptance"] : [];
    return [...new Set([...common, ...(byMode[taskMode] || byMode.implementation), ...extra, ...audit.placebo_risks.map((risk) => `placebo risk: ${risk}`)])];
  }

  function workflowExactChecks({ taskMode, proofLevel, branch, testPlan, impact, failure, goal }) {
    const local = workflowLocalChecks(testPlan, impact);
    if (taskMode === "publish") {
      return [
        "git fetch origin",
        "git status --short",
        "git rev-list --left-right --count origin/main...HEAD",
        ...local.slice(0, proofLevel === "remote" ? 8 : 5),
        `git push -u origin ${branch}`,
        `git ls-remote origin refs/heads/${branch}`,
        `gh pr view ${branch} --json url,number,state,headRefName,baseRefName,headRefOid,baseRefOid`,
        "gh pr create --base main --head <branch> --title <title> --body <body> if no PR exists",
        `gh run list --branch ${branch} --limit 10`,
        "gh run view <run-id> --json status,conclusion,url,headSha,name,event",
        "gh run view <run-id> --log if the latest relevant run fails"
      ];
    }
    if (taskMode === "ci_failure") {
      return [
        "gh run view <run-id> --log",
        failure?.command_to_rerun || "rerun the smallest failing command",
        "npm.cmd run tools:readiness",
        "gh run view <run-id> --json status,conclusion,url,headSha,name,event after pushing the fix"
      ];
    }
    if (taskMode === "recovery") {
      return ["git status --short", "git branch --show-current", "git log --oneline --decorate -8", "git rev-list --left-right --count origin/main...HEAD"];
    }
    if (taskMode === "validation" && /proof already exists|tests? passed|already passed/i.test(goal)) {
      return ["npm.cmd run tools:readiness", "vnem_tools_evidence_pack with the exact observed checks"];
    }
    return local;
  }

  function workflowLocalChecks(testPlan, impact) {
    return [...new Set([
      ...testPlan.baseline_checks,
      ...testPlan.first_checks_to_run,
      ...testPlan.targeted_tests,
      ...testPlan.regression_tests,
      ...impact.minimum_targeted_tests,
      ...impact.final_checks.filter((cmd) => /readiness|validate|generate|install-pack/.test(cmd))
    ])].filter((cmd) => !/\bgit push\b|\bgh pr\b|\bgh run\b|ls-remote/i.test(cmd)).slice(0, 18);
  }

  function workflowStopConditions(taskMode, recovery, failure) {
    const stops = [
      "Stop if a secret-like path is dirty or would need inspection; only report the path/status.",
      "Stop publish if worktree is dirty before push.",
      "Stop if expected branch/HEAD does not match the requested stack.",
      "Stop if remote URL/auth/network proof is missing for publish mode.",
      "Stop if targeted local checks fail; triage before broad changes."
    ];
    if (taskMode === "ci_failure") stops.push("Stop if the failure class is environment/network/auth/config; report blocker instead of patching product code.");
    if (taskMode === "publish") stops.push("Stop if remote branch SHA differs from local HEAD; do not force push.");
    if (recovery.worktree.dirty) stops.push("Dirty worktree detected; review exact changed files before commit/publish.");
    if (failure?.classification) stops.push(`Failure classification must be honored: ${failure.classification}.`);
    return [...new Set(stops)];
  }

  function workflowNotProven({ taskMode, proofLevel, remoteProofRequired, allowLiveRemote, failure }) {
    const items = [
      "This orchestrator did not edit files, run commands, push, create PRs, merge, or inspect CI logs.",
      "Hidden/lost chat context is not recovered; only local repo state and supplied arguments are used."
    ];
    if (!allowLiveRemote || !remoteProofRequired) items.push("Remote GitHub branch, PR, Actions, deploy, and release state are not proven by this read-only output.");
    if (remoteProofRequired) items.push("Exact remote SHA/PR/Actions proof is still required after executing the listed commands.");
    if (proofLevel !== "full_local") items.push("Full npm test pass is not proven unless the caller runs and records it.");
    if (taskMode === "ci_failure" && !failure) items.push("CI root cause is not proven without exact failing output/log.");
    return [...new Set(items)];
  }

  async function readPackageJsonIfPresent(root) {
    const packagePath = path.join(root, "package.json");
    if (!existsSync(packagePath)) return null;
    try { return JSON.parse(await readFile(packagePath, "utf8")); } catch { return null; }
  }

  function summarizePackageScripts(scripts = {}) {
    const names = Object.keys(scripts);
    return {
      all: names.slice(0, 80),
      test: names.filter((name) => /^test($|:)|validate|lint|type|check/i.test(name)).slice(0, 40),
      build: names.filter((name) => /build|generate|compile/i.test(name)).slice(0, 30),
      dev: names.filter((name) => /^(dev|start|preview|dashboard|ard:dev)$/i.test(name)).slice(0, 20),
      risky: names.filter((name) => UNSAFE_PACKAGE_SCRIPT_PATTERN.test(name) || UNSAFE_PACKAGE_SCRIPT_PATTERN.test(String(scripts[name])) || CONTROL_OPERATOR_PATTERN.test(String(scripts[name]))).slice(0, 30)
    };
  }

  function detectPackageManager(root, pkg) {
    if (existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(path.join(root, "yarn.lock"))) return "yarn";
    if (existsSync(path.join(root, "bun.lockb"))) return "bun";
    if (existsSync(path.join(root, "package-lock.json")) || pkg) return "npm";
    return "unknown";
  }

  function detectLanguagesFromFiles(files) {
    const extMap = { ".js": "JavaScript", ".mjs": "JavaScript", ".jsx": "React JSX", ".ts": "TypeScript", ".tsx": "React TSX", ".json": "JSON", ".md": "Markdown", ".css": "CSS", ".html": "HTML", ".py": "Python", ".rs": "Rust", ".go": "Go", ".yml": "YAML", ".yaml": "YAML" };
    const counts = new Map();
    for (const file of files) {
      const ext = path.extname(file.path);
      const lang = extMap[ext];
      if (lang) counts.set(lang, (counts.get(lang) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([language, count]) => ({ language, count }));
  }

  function classifyDirs(dirs, files, names) {
    const set = new Set();
    for (const dir of dirs) {
      const parts = dir.path.split("/");
      for (const part of parts) if (names.includes(part)) set.add(parts.slice(0, parts.indexOf(part) + 1).join("/"));
    }
    for (const file of files) {
      const parts = file.path.split("/");
      for (const name of names) {
        const index = parts.indexOf(name);
        if (index >= 0) set.add(parts.slice(0, index + 1).join("/"));
      }
    }
    return [...set].filter(Boolean).sort().slice(0, 50);
  }

  function isDocsPath(file) { return /(^|\/)(README|CHANGELOG|CONTRIBUTING|LICENSE|AGENTS|PRODUCT)\.md$|(^|\/)docs\//i.test(normalizePath(file)); }
  function isConfigPath(file) { return /(^|\/)(package\.json|vite\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|astro\.config\.[cm]?[jt]s|tsconfig\.json|eslint\.config\.[cm]?[jt]s|wrangler\.toml|\.github\/workflows\/.*\.ya?ml)$/i.test(normalizePath(file)); }
  function isTestPath(file) { return /(^|\/)(test|tests|__tests__|test-fixtures|fixtures)\/|(^|\/)scripts\/test-|(\.test|\.spec)\.[cm]?[jt]sx?$/i.test(normalizePath(file)); }
  function isGeneratedArtifactPath(file) { return /(^|\/)(dist|build|coverage|\.next|\.turbo|\.cache|public\/install|landing\/dist)\/|(^|\/)(public\/install\.tgz|landing\/install\.tgz|public\/api\/index\.json|llms(-full)?\.txt|\.vnem\/.*|discovery\/daily-digest\.md)$/i.test(normalizePath(file)); }
  function isSourceBehaviorPath(file) { const f = normalizePath(file); return !isDocsPath(f) && !isGeneratedArtifactPath(f) && !isTestPath(f) && /\.(mjs|js|ts|tsx|jsx|json|css|html|py|yml|yaml|toml)$/.test(f); }
  function isLikelyRegistryPath(file) { return /scripts\/vnem-(tools-)?mcp-server\.mjs|registerTool|registry\/|capabilities\/|dashboard\/src|landing\/functions|\.github\/workflows/i.test(normalizePath(file)); }
  function isLikelyEntrypointPath(file) { return /(^|\/)(index|main|app|server|cli|vnem-tools-mcp-server|vnem-mcp-server|hermes-dashboard-api|vnem-app-server)\.(js|mjs|ts|tsx|jsx|html)$|(^|\/)package\.json$/i.test(normalizePath(file)); }
  function isBinaryLikePath(file) { return /\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|tgz|gz|woff2?|ttf|exe|dll|bin)$/i.test(normalizePath(file)); }

  function buildRepoFileGroups(files, changedFiles) {
    const paths = files.map((file) => file.path);
    const count = (predicate) => paths.filter(predicate).length;
    const changed = (predicate) => changedFiles.filter(predicate).slice(0, 30);
    return {
      source: { count: count(isSourceBehaviorPath), changed: changed(isSourceBehaviorPath) },
      tests: { count: count(isTestPath), changed: changed(isTestPath) },
      docs: { count: count(isDocsPath), changed: changed(isDocsPath) },
      generated: { count: count(isGeneratedArtifactPath), changed: changed(isGeneratedArtifactPath) },
      config: { count: count(isConfigPath), changed: changed(isConfigPath) },
      registries: { count: count(isLikelyRegistryPath), changed: changed(isLikelyRegistryPath) }
    };
  }

  function buildLikelyImportantFiles(files, changedFiles, registries, entrypoints, configFiles) {
    const important = [
      ...changedFiles,
      ...registries,
      ...entrypoints,
      ...configFiles,
      ...files.map((file) => file.path).filter((file) => /(^|\/)(scripts\/vnem-tools-mcp-server\.mjs|scripts\/vnem-mcp-server\.mjs|scripts\/tools-readiness-report\.mjs|scripts\/generate-artifacts\.mjs|package\.json)$/.test(file))
    ];
    return [...new Set(important)].filter((file) => !isGeneratedArtifactPath(file)).slice(0, 40);
  }

  function buildSuspiciousWorkFlags(changedFiles, summary = "") {
    const flags = [];
    if (changedFiles.length && changedFiles.every(isDocsPath)) flags.push("docs_only_work_needs_behavior_proof");
    if (changedFiles.length && changedFiles.every(isGeneratedArtifactPath)) flags.push("generated_only_work_needs_source_generator_reason");
    if (changedFiles.some(isGeneratedArtifactPath) && !changedFiles.some((file) => /scripts\/generate-artifacts\.mjs|registry\/|capabilities\/|scripts\/vnem-tools-mcp-server\.mjs|src\//.test(file))) flags.push("generated_artifact_changed_without_source_generator_change");
    if (/mocked|simulated|dry-run/i.test(summary) && /live|real|production|deployed|pushed/i.test(summary)) flags.push("mocked_as_live_claim_risk");
    if (/register|manifest|catalog|tool name/i.test(summary) && !/behavior|execution|implementation/i.test(summary)) flags.push("registration_only_claim_risk");
    return flags;
  }

  async function compactGitState(root) {
    const branch = await gitValue(root, ["branch", "--show-current"]);
    const head = await gitValue(root, ["rev-parse", "HEAD"]);
    const statusText = await gitValue(root, ["status", "--short"], 16000);
    const recent = (await gitValue(root, ["log", "--oneline", "-6", "--decorate"], 16000)).split(/\r?\n/).filter(Boolean);
    const changed = statusText.split(/\r?\n/).filter(Boolean).map(parseGitStatusLine).filter(Boolean).filter((item) => !isSecretLikePath(item.path));
    return { branch, head, recent_commits: recent, changed_files: changed, dirty: changed.length > 0 };
  }

  function compactNoGitState() { return { branch: "", head: "", recent_commits: [], changed_files: [], dirty: false, skipped: "include_git=false" }; }

  function parseGitStatusLine(line) {
    const raw = String(line || "");
    let pathText = raw.length >= 3 && raw[2] === " " ? raw.slice(3).trim() : raw.slice(2).trim();
    if (/^\?\?\s+/.test(raw)) pathText = raw.slice(3).trim();
    if (!pathText) return null;
    const parts = pathText.split(" -> ");
    return { status: raw.slice(0, 2).trim(), path: normalizePath(parts[parts.length - 1]) };
  }

  async function gitChangedFileNames(root, includeStaged = true) {
    const statusText = await gitValue(root, ["status", "--short"], 24000);
    const files = statusText.split(/\r?\n/).filter(Boolean).map(parseGitStatusLine).filter(Boolean).map((item) => item.path).filter((file) => !isSecretLikePath(file));
    if (files.length || includeStaged) return [...new Set(files)];
    const diff = await gitValue(root, ["diff", "--name-only"], 16000);
    return [...new Set(diff.split(/\r?\n/).filter(Boolean).filter((file) => !isSecretLikePath(file)).map(normalizePath))];
  }

  async function firstExistingGitRef(root, refs) {
    for (const ref of refs.filter(Boolean)) {
      const found = await gitValue(root, ["rev-parse", "--verify", "--quiet", ref]);
      if (found) return ref;
    }
    return "";
  }

  function parseAheadBehind(text) {
    const [behindRaw, aheadRaw] = String(text || "").trim().split(/\s+/);
    const behind = Number.parseInt(behindRaw, 10);
    const ahead = Number.parseInt(aheadRaw, 10);
    return { behind: Number.isFinite(behind) ? behind : 0, ahead: Number.isFinite(ahead) ? ahead : 0 };
  }

  function parseGitLogEntries(text) {
    return String(text || "").split(/\r?\n/).filter(Boolean).map((line) => {
      const match = line.match(/^([0-9a-f]{7,40})\s+(.*)$/i);
      return match ? { short_sha: match[1], subject: redactSecrets(match[2]) } : { short_sha: "", subject: redactSecrets(line) };
    });
  }

  function classifyRecoveryDirtyFiles(files) {
    const unique = [...new Set(files.map(normalizePath))];
    const risky = unique.filter(isSecretLikePath);
    const tests = unique.filter((file) => !risky.includes(file) && isTestPath(file));
    const docs = unique.filter((file) => !risky.includes(file) && isDocsPath(file));
    const generated = unique.filter((file) => !risky.includes(file) && isGeneratedArtifactPath(file));
    const source = unique.filter((file) => !risky.includes(file) && !tests.includes(file) && !docs.includes(file) && !generated.includes(file) && isSourceBehaviorPath(file));
    const known = new Set([...risky, ...tests, ...docs, ...generated, ...source]);
    return {
      source: source.slice(0, 40),
      tests: tests.slice(0, 40),
      docs: docs.slice(0, 40),
      generated: generated.slice(0, 40),
      risky_or_secret_like: risky.slice(0, 40),
      other: unique.filter((file) => !known.has(file)).slice(0, 40)
    };
  }

  function inferLikelyRecoveryBranch(currentBranch, args = {}) {
    const current = String(currentBranch || "");
    const prefix = String(args.expected_branch_prefix || "feat/");
    if (current && current !== "main" && current !== "master") return current;
    const goal = String(args.task_goal || "session recovery").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "session-recovery";
    return `${prefix}${goal}`;
  }

  function chooseSessionRecoverySafeNext(statusItems, unpushedCommits, branch) {
    const dirty = statusItems.length > 0;
    if (/^(main|master)$/.test(String(branch || ""))) return "Create or switch to a feature branch before any edits or commits.";
    if (dirty) return "Review dirty files with change-impact/test-selection before committing or excluding anything.";
    if (unpushedCommits.length) return "Resume on the current feature branch and run targeted local checks before any publish step.";
    return "Choose one behavior-backed implementation slice on the current feature branch.";
  }

  async function scanTodoMarkers(root, files, maxResults) {
    const results = [];
    for (const file of files) {
      if (results.length >= maxResults) break;
      if (file.bytes > 256000 || shouldSkipRelative(file.path) || isBinaryLikePath(file.path)) continue;
      if (!/\.(mjs|js|ts|tsx|jsx|md|json|css|html|yml|yaml)$/.test(file.path)) continue;
      try {
        const target = await resolveAllowedFile(path.join(root, file.path), { mustExist: true, blockSecrets: true });
        const bytes = await readFile(target.absolutePath);
        if (bytes.includes(0) || looksBinary(bytes)) continue;
        const lines = bytes.toString("utf8").split(/\r?\n/);
        for (let i = 0; i < lines.length && results.length < maxResults; i += 1) {
          if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(lines[i])) results.push({ path: target.relativePath, line_number: i + 1, marker: truncate(redactSecrets(lines[i].trim()), 180) });
        }
      } catch {}
    }
    return results;
  }

  function classifyChangedAreas(changed) {
    const areas = new Set();
    for (const file of changed.map(normalizePath)) {
      if (/scripts\/vnem-tools-mcp-server\.mjs/.test(file)) areas.add("tools_mcp");
      if (/scripts\/vnem-mcp-server\.mjs|scripts\/core-readiness-report\.mjs/.test(file)) areas.add("core_mcp");
      if (/scripts\/tools-readiness-report\.mjs/.test(file)) areas.add("tools_readiness");
      if (/scripts\/generate-artifacts\.mjs|registry\/|capabilities\/|public\/install|\.vnem\/|public\/api\/index\.json|llms/.test(file)) areas.add("generator");
      if (/(^|\/)package\.json$/.test(file)) areas.add("package_scripts");
      if (/dashboard\/|landing\//.test(file)) areas.add("dashboard");
      if (/github|test-tools-github|repo_intelligence|pr_quality|task_progress/i.test(file)) areas.add("github_autonomy");
      if (/cloudflare|wrangler/i.test(file)) areas.add("cloudflare_control");
      if (isTestPath(file)) areas.add("tests");
      if (isDocsPath(file)) areas.add("docs");
      if (isGeneratedArtifactPath(file)) areas.add("generated_artifacts");
      if (!areas.size || isSourceBehaviorPath(file)) areas.add("source");
    }
    return [...areas].sort();
  }

  function affectedFeaturesForAreas(areas, changed) {
    const out = [];
    if (areas.includes("tools_mcp")) out.push("Tools MCP tool registry", "Tools MCP structured outputs", "permission/reliability evidence behavior");
    if (areas.includes("github_autonomy")) out.push("GitHub autonomy tools", "PR quality gate", "task truth-checking");
    if (areas.includes("cloudflare_control")) out.push("Cloudflare status/planning/mutation guardrails");
    if (areas.includes("tools_readiness")) out.push("Tools readiness report");
    if (areas.includes("generator")) out.push("install pack generation", "public API index", "LLM artifacts");
    if (areas.includes("package_scripts")) out.push("package scripts and verification orchestration");
    if (areas.includes("dashboard")) out.push("dashboard/local app UI or API");
    if (areas.includes("core_mcp")) out.push("Core MCP read-only planning tools");
    if (changed.some((file) => /package\.json/.test(file))) out.push("package scripts/test orchestration");
    return [...new Set(out)];
  }

  function targetedTestsForChange(areas, changed, scripts) {
    const tests = [];
    if (areas.includes("tools_mcp") || areas.includes("source")) tests.push("node --check scripts/vnem-tools-mcp-server.mjs", "npm.cmd run test:tools-intelligence");
    if (areas.includes("github_autonomy")) tests.push("npm.cmd run test:tools-github-real-exec-paths", "npm.cmd run test:tools-autonomy-2-regression");
    if (areas.includes("cloudflare_control")) tests.push("npm.cmd run test:tools-cloudflare-status-auth");
    if (areas.includes("tools_readiness")) tests.push("node --check scripts/tools-readiness-report.mjs", "npm.cmd run tools:readiness");
    if (areas.includes("generator")) tests.push("npm.cmd run validate", "npm.cmd run generate", "npm.cmd run test:install-pack");
    if (areas.includes("package_scripts")) tests.push("npm.cmd run validate", "npm.cmd run tools:readiness");
    if (areas.includes("docs") && !areas.includes("source") && !areas.includes("tools_mcp")) tests.push("npm.cmd run check:links");
    if (areas.includes("dashboard")) tests.push("npm.cmd run dashboard:build", "npm.cmd run test:dashboard");
    if (areas.includes("core_mcp")) tests.push("node --check scripts/vnem-mcp-server.mjs", "npm.cmd run core:readiness");
    for (const file of changed) {
      const base = path.basename(file);
      if (/power-tools-2/.test(base)) tests.push("npm.cmd run test:tools-power-tools-2-regression");
      if (/power-session-1|local-session-recovery/.test(base)) tests.push("npm.cmd run test:tools-power-session-1-recovery");
      if (/orchestrator|repo-workflow/.test(base)) tests.push("npm.cmd run test:tools-orchestrator-1-regression");
      if (/code-intelligence|symbol-map|surface-audit|patch-target|coverage-map|source-impact|control-character/.test(base)) tests.push("npm.cmd run test:tools-code-intelligence-1-regression");
      if (/^test-tools-power/.test(base) || /power-tools-1/.test(base)) tests.push("npm.cmd run test:tools-power-tools-1-regression");
    }
    if (scripts?.["test:tools-code-intelligence-1-regression"] && areas.includes("tools_mcp")) tests.push("npm.cmd run test:tools-code-intelligence-1-regression");
    if (scripts?.["test:tools-orchestrator-1-regression"] && areas.includes("tools_mcp")) tests.push("npm.cmd run test:tools-orchestrator-1-regression");
    if (scripts?.["test:tools-power-session-1-recovery"] && areas.includes("tools_mcp")) tests.push("npm.cmd run test:tools-power-session-1-recovery");
    if (scripts?.["test:tools-power-tools-2-regression"] && areas.includes("tools_mcp")) tests.push("npm.cmd run test:tools-power-tools-2-regression");
    if (scripts?.["test:tools-quality-general"] && areas.includes("tools_mcp")) tests.push("npm.cmd run test:tools-quality-general");
    return [...new Set(tests)];
  }

  function buildWhatNotToRunYet(areas, generationRequired, fullTriggers) {
    const out = [];
    if (!areas.includes("dashboard")) out.push("browser/UI proof unless UI files changed");
    if (!generationRequired) out.push("generate/install-pack churn before source behavior changes");
    if (!fullTriggers.length) out.push("full npm test before targeted checks pass");
    out.push("live GitHub proof for local-only repo intelligence work");
    return out;
  }

  function testSelectionFromAreas(areas, packageScripts = {}) {
    const targeted = [];
    const regression = [];
    if (areas.includes("tools_mcp") || areas.includes("repo_power")) targeted.push("node --check scripts/vnem-tools-mcp-server.mjs", "npm.cmd run test:tools-power-tools-1-regression");
    if (areas.includes("tools_mcp")) regression.push("npm.cmd run test:tools-reliability-catalog", "npm.cmd run test:tools-action-recovery-plan", "npm.cmd run test:tools-high-power-action-review");
    if (areas.includes("github_autonomy")) regression.push("npm.cmd run test:tools-autonomy-2-regression");
    if (areas.includes("cloudflare_control")) regression.push("npm.cmd run test:tools-cloudflare-status-auth");
    if (areas.includes("generator")) targeted.push("npm.cmd run validate", "npm.cmd run generate");
    if (Object.keys(packageScripts).includes("validate")) targeted.push("npm.cmd run validate");
    return { targeted_tests: [...new Set(targeted)], regression_tests: [...new Set(regression)] };
  }

  function scoreNextAction(item, goal) {
    let score = item.estimated_implementation_value || 50;
    if (item.risk_level === "high") score += 8;
    if (item.should_do_now) score += 12;
    if (item.placebo_risk === "high") score -= 20;
    if (/implement|fix|power|repo|tool|test|validate/i.test(goal) && /implement|fix|verify|test/i.test(item.action)) score += 8;
    if (/dogfood|tune|repo-power|power-tools/i.test(goal) && /dogfood|tune|repo-power|existing implementation/i.test(item.action)) score += 22;
    if (/local-only|no push|no pr|do not publish/i.test(goal) && /push|pr|publish|deploy/i.test(item.action)) score -= 100;
    return score;
  }

  function correctionForPlaceboRisk(risk) {
    if (/docs-only/i.test(risk)) return "Add or inspect the source behavior that makes the docs true, then run a behavior test.";
    if (/generated/i.test(risk)) return "Change source/generator behavior first, then regenerate artifacts after tests pass.";
    if (/tests-only/i.test(risk)) return "Add real execution/inspection behavior, not only assertions around registration.";
    if (/mocked/i.test(risk)) return "Label proof as mocked/local or collect exact live URL/SHA/run proof.";
    if (/safety/i.test(risk)) return "Add an enforcement path such as a block, thrown error, redaction, or approval gate.";
    return "Inspect source implementation and add the smallest behavior-backed correction.";
  }

  function rerunCommandForFailure(classification, text) {
    const match = text.match(/npm(?:\.cmd)?\s+run\s+[A-Za-z0-9:_-]+|node\s+[A-Za-z0-9_./\\-]+\.mjs|node\s+--check\s+[A-Za-z0-9_./\\-]+/);
    if (match) return match[0];
    if (classification === "generated_artifact_staleness") return "npm.cmd run generate";
    if (classification === "auth_permission_issue") return "rerun after auth/setup, or report blocked";
    return "rerun the smallest failing command";
  }

  function rootCauseForFailure(classification, text) {
    const causes = {
      product_bug: "Output shows a likely implementation/runtime bug.",
      real_assertion_failure: "A focused assertion failed and should be treated as a real behavior regression until the failing expectation is explained.",
      test_fixture_bug: "Output points to assertion/fixture mismatch more than product behavior.",
      environment_network_issue: "Network/provider/runtime environment failed or timed out.",
      missing_dependency: "A module, command, or local dependency is missing/unavailable.",
      auth_permission_issue: "Authentication or permission is missing for the requested account/tool action.",
      generated_artifact_staleness: "Generated artifacts or snapshots appear stale relative to source.",
      windows_path_process_cleanup_issue: "Windows file/process cleanup is likely holding a temp path or process.",
      real_regression: "The failure is inconclusive but should be treated as a possible regression until inspected."
    };
    return `${causes[classification] || causes.real_regression} ${truncate(text.split(/\r?\n/).find((line) => /error|failed|assert|cannot find|not authenticated|ebusy|stale/i.test(line)) || "", 220)}`.trim();
  }

  function fallbackInspectionTarget(classification) {
    if (classification === "generated_artifact_staleness") return "scripts/generate-artifacts.mjs";
    if (classification === "auth_permission_issue") return "auth/config environment and tool status";
    if (classification === "windows_path_process_cleanup_issue") return "test cleanup/finally block or process stop helper";
    if (classification === "missing_dependency") return "package.json scripts/dependencies";
    if (classification === "real_assertion_failure") return "first failing assertion and changed implementation path";
    return "first failing stack frame or changed source file";
  }

  function smallestFixForFailure(classification) {
    const fixes = {
      product_bug: "Patch the first failing implementation path and add/adjust the focused regression test.",
      real_assertion_failure: "Inspect the assertion and changed source, patch the smallest behavior path, then rerun the same focused test.",
      test_fixture_bug: "Fix the fixture setup/expected value only after confirming product behavior is correct.",
      environment_network_issue: "Report blocked or retry once with bounded output; do not patch product code for provider/network noise.",
      missing_dependency: "Use existing dependencies/scripts or document the missing local command; do not auto-install unknown packages.",
      auth_permission_issue: "Authenticate/configure the tool outside secret-printing paths, then retry or report blocked.",
      generated_artifact_staleness: "Run validation/generation and inspect generated diff before committing.",
      windows_path_process_cleanup_issue: "Make cleanup retry/tolerate transient locks or stop the process tree explicitly.",
      real_regression: "Inspect the first error line and changed files, then patch the smallest behavior path."
    };
    return fixes[classification] || fixes.real_regression;
  }

  async function codeIntelligenceCandidateFiles(root, options = {}) {
    const entries = [];
    const skipped = [];
    const maxFiles = Math.max((options.maxFiles || 500) * 4, options.maxFiles || 500);
    await walkWorkspace(root, root, entries, skipped, { maxDepth: options.maxDepth || 12, maxFiles, includeHidden: false });
    const includeTests = options.includeTests !== false;
    const files = entries
      .filter((entry) => entry.type === "file")
      .filter((entry) => !isSecretLikePath(entry.path) && !shouldSkipRelative(entry.path) && !isGeneratedArtifactPath(entry.path) && !isBinaryLikePath(entry.path))
      .filter((entry) => isSourceBehaviorPath(entry.path) || isConfigPath(entry.path) || (includeTests && isTestPath(entry.path)))
      .filter((entry) => /\.(mjs|cjs|js|jsx|ts|tsx|json|yml|yaml|toml|css|html)$/.test(entry.path))
      .sort((a, b) => codeIntelligenceFilePriority(a.path) - codeIntelligenceFilePriority(b.path) || a.path.localeCompare(b.path))
      .slice(0, options.maxFiles || 500);
    return { files, skipped };
  }

  function codeIntelligenceFilePriority(file) {
    const f = normalizePath(file);
    if (/scripts\/vnem-tools-mcp-server\.mjs$/.test(f)) return 0;
    if (/scripts\/tools-readiness-report\.mjs$|package\.json$/.test(f)) return 1;
    if (isLikelyRegistryPath(f)) return 2;
    if (isSourceBehaviorPath(f)) return 3;
    if (isTestPath(f)) return 4;
    return 8;
  }

  async function readRepoTextFile(root, file, maxBytes = 256000) {
    try {
      const targetPath = path.isAbsolute(file) ? file : path.join(root, file);
      const target = await resolveAllowedFile(targetPath, { mustExist: true, blockSecrets: true });
      const info = await stat(target.absolutePath);
      if (!info.isFile() || isBinaryLikePath(target.relativePath)) return { text: "", bytes_read: 0, truncated: false, skipped: "not_text_file" };
      const bytes = await readFile(target.absolutePath);
      if (bytes.includes(0) || looksBinary(bytes)) return { text: "", bytes_read: 0, truncated: false, skipped: "binary_file" };
      const take = Math.min(bytes.length, maxBytes);
      return { text: redactSecrets(bytes.subarray(0, take).toString("utf8")), bytes_read: take, truncated: take < bytes.length, path: target.relativePath };
    } catch (error) {
      return { text: "", bytes_read: 0, truncated: false, skipped: error instanceof ToolsError ? error.code : "read_failed" };
    }
  }

  function extractLightweightSymbols(file, text) {
    const symbols = [];
    const importsOrExports = [];
    const lines = String(text || "").split(/\r?\n/);
    const fileToolRelated = /vnem_tools_|registerTool|mcpServer\.registerTool|toolResult|McpServer/i.test(text);
    const push = (name, kind, lineNumber, exported, snippet) => {
      symbols.push({
        file,
        name,
        kind,
        line_number: lineNumber,
        exported,
        async: /\basync\b/.test(snippet),
        tool_related: fileToolRelated || /vnem_tools_|Tool|Handler|Action|Recovery|Audit|Guard|Orchestrator/i.test(`${name} ${snippet}`),
        snippet: truncate(snippet.trim(), 180)
      });
    };
    const patterns = [
      { kind: "function", re: /^\s*(export\s+)?(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/ },
      { kind: "class", re: /^\s*(export\s+)?class\s+([A-Za-z_$][\w$]*)\b/ },
      { kind: "arrow_function", re: /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/ },
      { kind: "function_expression", re: /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/ },
      { kind: "tool_registration", re: /registerTool\s*\(\s*["'](vnem_tools_[a-z0-9_]+)["']/i }
    ];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^\s*(import|export)\b/.test(line)) importsOrExports.push(truncate(line.trim(), 160));
      for (const pattern of patterns) {
        const match = line.match(pattern.re);
        if (!match) continue;
        const name = pattern.kind === "function" ? match[3] : pattern.kind === "class" || pattern.kind === "arrow_function" || pattern.kind === "function_expression" ? match[2] : match[1];
        const exported = Boolean(match[1]) || /^\s*export\b/.test(line);
        push(name, pattern.kind, index + 1, exported, line);
        break;
      }
    }
    return { symbols, imports_or_exports: importsOrExports, tool_related: fileToolRelated || symbols.some((symbol) => symbol.tool_related) };
  }

  function codeFileCategory(file) {
    if (isTestPath(file)) return "test";
    if (isConfigPath(file)) return "config";
    if (isLikelyRegistryPath(file)) return "registry";
    if (isSourceBehaviorPath(file)) return "source";
    return "other";
  }

  function buildCodeIntelligenceImportantFiles(fileSummaries, toolRelated) {
    return [...new Set([
      ...toolRelated.map((symbol) => symbol.file),
      ...fileSummaries.filter((file) => file.category === "registry" || file.tool_related).map((file) => file.path),
      ...fileSummaries.filter((file) => file.symbol_count > 0).map((file) => file.path)
    ])].slice(0, 40);
  }

  function parseRegisteredToolsFromServer(serverText, implementationFile = "scripts/vnem/tools/server.mjs") {
    const text = String(serverText || "");
    const matches = [...text.matchAll(/registerTool\s*\(\s*["'](vnem_tools_[a-z0-9_]+)["']/gi)];
    return matches.map((match, index) => {
      const start = match.index || 0;
      const next = matches[index + 1]?.index ?? Math.min(text.length, start + 5000);
      const block = text.slice(start, next);
      return {
        name: match[1],
        implementation_file: implementationFile,
        index: start,
        line_number: lineNumberAt(text, start),
        handler_candidates: handlerCandidatesForRegistrationBlock(block)
      };
    });
  }

  function handlerCandidatesForRegistrationBlock(block) {
    const ignored = new Set(["registerTool", "withToolErrors", "toolResult", "String", "Number", "Boolean", "Array", "Object", "Promise", "redactSecrets", "truncate", "filter", "map", "slice", "join", "includes", "push", "min", "max", "default", "optional", "array", "enum", "string", "number", "int", "boolean"]);
    const out = [];
    for (const match of String(block || "").matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = match[1];
      if (ignored.has(name) || /^format[A-Z]/.test(name) || /^[A-Z]/.test(name) || name === "async") continue;
      if (!out.includes(name)) out.push(name);
    }
    return out.slice(0, 8);
  }

  async function scanToolCoverage(root, toolNames, options = {}) {
    const packageText = options.packageText ?? (await readRepoTextFile(root, "package.json", 320000)).text;
    const readinessText = options.readinessText ?? (await readRepoTextFile(root, "scripts/tools-readiness-report.mjs", 900000)).text;
    const packageScripts = packageText ? Object.entries(safeJsonParse(packageText)?.scripts || {}).map(([name, value]) => `${name}: ${value}`) : [];
    const candidates = await codeIntelligenceCandidateFiles(root, { maxFiles: 900, includeTests: true });
    const testFiles = candidates.files.filter((file) => isTestPath(file.path));
    const testTexts = [];
    for (const file of testFiles) {
      const read = await readRepoTextFile(root, file.path, 320000);
      if (read.text) testTexts.push({ path: file.path, text: read.text, behavior_wrappers: behaviorCallWrappers(read.text) });
    }
    const perTool = {};
    for (const toolName of toolNames) {
      const escaped = escapeRegExp(toolName);
      const behaviorFiles = [];
      const registrationFiles = [];
      const mentionFiles = [];
      for (const file of testTexts) {
        if (!file.text.includes(toolName)) continue;
        mentionFiles.push(file.path);
        const behaviorRe = new RegExp(`(callTool\\s*\\(\\s*\\{[^}]*name\\s*:\\s*["']${escaped}["']|call\\s*\\(\\s*client\\s*,\\s*["']${escaped}["'])`, "s");
        const wrapperBehavior = file.behavior_wrappers.some((wrapper) => behaviorWrapperCallPattern(wrapper, `["']${escaped}["']`).test(file.text));
        const registrationOnlyRe = new RegExp(`(listTools|tools\\.has|manifest\\.tools|includes\\s*\\(\\s*["']${escaped}["'])`, "s");
        if (behaviorRe.test(file.text) || wrapperBehavior) behaviorFiles.push(file.path);
        else if (registrationOnlyRe.test(file.text)) registrationFiles.push(file.path);
      }
      const packageMatches = packageScripts.filter((script) => script.includes(toolName) || script.toLowerCase().includes(toolName.replace("vnem_tools_", "").replace(/_/g, "-")));
      const readinessMention = readinessText.includes(toolName);
      const coverageLevel = behaviorFiles.length ? "behavior_test" : registrationFiles.length ? "registration_only" : readinessMention ? "readiness_only" : packageMatches.length ? "package_script_only" : mentionFiles.length ? "mentioned_only" : "no_test_found";
      perTool[toolName] = {
        tool_name: toolName,
        coverage_level: coverageLevel,
        behavior_test_files: behaviorFiles,
        registration_only_test_files: registrationFiles,
        mentioned_test_files: mentionFiles,
        readiness_referenced: readinessMention,
        package_scripts: packageMatches,
        evidence: behaviorFiles.length ? "MCP client call path found in test text." : registrationFiles.length ? "Only listTools/manifest-style evidence found." : readinessMention ? "Readiness/report mention found without behavior test." : "No direct proof found."
      };
    }
    return { per_tool: perTool, package_scripts: packageScripts };
  }

  function behaviorCallWrappers(source) {
    const text = String(source || "");
    const declarations = [...text.matchAll(/(?:^|\n)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g)];
    const functions = declarations.map((match, index) => ({
      name: match[1],
      parameters: match[2].split(",").map((value) => value.trim().replace(/\s*=.*$/, "")),
      body: text.slice(match.index, declarations[index + 1]?.index ?? text.length)
    }));
    const wrappers = new Map();
    for (const item of functions) {
      const nameArgumentIndex = item.parameters.indexOf("name");
      if (nameArgumentIndex >= 0 && /\b[A-Za-z_$][\w$]*\.callTool\s*\(\s*\{\s*name\b/.test(item.body)) wrappers.set(item.name, { name: item.name, name_argument_index: nameArgumentIndex });
    }
    let changed = true;
    while (changed && wrappers.size) {
      changed = false;
      for (const item of functions) {
        const nameArgumentIndex = item.parameters.indexOf("name");
        if (nameArgumentIndex >= 0 && !wrappers.has(item.name) && [...wrappers.values()].some((wrapper) => behaviorWrapperCallPattern(wrapper, "name\\b").test(item.body))) {
          wrappers.set(item.name, { name: item.name, name_argument_index: nameArgumentIndex });
          changed = true;
        }
      }
    }
    return [...wrappers.values()];
  }

  function behaviorWrapperCallPattern(wrapper, namePattern) {
    const precedingArguments = "[^,\\n]+,\\s*".repeat(wrapper.name_argument_index);
    return new RegExp(`\\b${escapeRegExp(wrapper.name)}\\s*\\(\\s*${precedingArguments}${namePattern}`);
  }

  function safeJsonParse(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  function normalizeToolName(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^vnem_tools_[a-z0-9_]+$/i.test(raw)) return raw;
    return `vnem_tools_${raw.toLowerCase().replace(/^vnem[-_ ]tools[-_ ]/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
  }

  function tokenizeCodeGoal(value) {
    const stop = new Set(["the", "and", "for", "with", "from", "this", "that", "tool", "tools", "make", "add", "real", "vnem", "mcp", "repo", "code"]);
    return [...new Set(String(value || "").toLowerCase().replace(/vnem_tools_/g, " ").replace(/[_/-]+/g, " ").split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !stop.has(token)))];
  }

  function firstMatchingLine(text, tokens) {
    const lines = String(text || "").split(/\r?\n/);
    return lines.find((line) => tokens.some((token) => line.toLowerCase().includes(token))) || "";
  }

  function packageScriptForTestFile(scripts, file) {
    const normalized = normalizePath(file);
    const found = arrayify(scripts).find((script) => script.includes(normalized));
    return found ? `npm.cmd run ${String(found).split(":")[0]}` : "";
  }

  function hiddenControlFindings(file, text) {
    const findings = [];
    let line = 1;
    let column = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      const ch = text[index];
      column += 1;
      const isNewline = ch === "\n";
      const bidi = (code >= 0x202A && code <= 0x202E) || (code >= 0x2066 && code <= 0x2069) || code === 0x200E || code === 0x200F;
      const dangerousControl = (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
      if (bidi || dangerousControl) {
        findings.push({
          file,
          line_number: line,
          column,
          code_point: `U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
          category: bidi ? "bidi_or_directional_control" : "dangerous_control_character",
          name: sourceControlCharacterName(code)
        });
      }
      if (isNewline) { line += 1; column = 0; }
    }
    return findings;
  }

  function sourceControlCharacterName(code) {
    const names = {
      0x0008: "BACKSPACE",
      0x007F: "DELETE",
      0x200E: "LEFT-TO-RIGHT MARK",
      0x200F: "RIGHT-TO-LEFT MARK",
      0x202A: "LEFT-TO-RIGHT EMBEDDING",
      0x202B: "RIGHT-TO-LEFT EMBEDDING",
      0x202C: "POP DIRECTIONAL FORMATTING",
      0x202D: "LEFT-TO-RIGHT OVERRIDE",
      0x202E: "RIGHT-TO-LEFT OVERRIDE",
      0x2066: "LEFT-TO-RIGHT ISOLATE",
      0x2067: "RIGHT-TO-LEFT ISOLATE",
      0x2068: "FIRST STRONG ISOLATE",
      0x2069: "POP DIRECTIONAL ISOLATE"
    };
    return names[code] || `CONTROL_${code}`;
  }

  function lineNumberAt(text, index) {
    return String(text || "").slice(0, index).split(/\r?\n/).length;
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function formatRepoDeepMap(map) { return [`vnem_tools_repo_deep_map: ${map.compact_summary.file_count_sampled} file(s) sampled`, `branch=${map.git.branch || "unknown"}`, `dirty=${map.git.dirty}`, `sources=${map.source_dirs.slice(0, 5).join(",") || "none"}`, `tests=${map.test_dirs.slice(0, 5).join(",") || "none"}`].join("\n"); }
  function formatNextActionRanker(ranking) { return [`vnem_tools_next_action_ranker: ${ranking.actions.length} action(s)`, ...ranking.actions.slice(0, 3).map((action) => `${action.rank}. ${action.action} [value=${action.estimated_implementation_value}, risk=${action.risk_level}, placebo=${action.placebo_risk}]`)].join("\n"); }
  function formatNoPlaceboAudit(audit) { return [`vnem_tools_no_placebo_progress_audit: ${audit.real_progress_score}/100`, `level=${audit.progress_level}`, `risks=${audit.placebo_risks.join("; ") || "none"}`, `next=${audit.exact_next_correction}`].join("\n"); }
  function formatChangeImpactPlan(plan) { return [`vnem_tools_change_impact_plan: ${plan.changed_files.length} file(s)`, `areas=${plan.changed_areas.join(",") || "none"}`, `risk=${plan.risk_level}`, `generation_required=${plan.generation_required}`, `targeted=${plan.minimum_targeted_tests.slice(0, 4).join("; ") || "none"}`].join("\n"); }
  function formatTestSelectionPlan(plan) { return [`vnem_tools_test_selection_plan: targeted=${plan.targeted_tests.length}`, `regression=${plan.regression_tests.length}`, `readiness=${plan.readiness_or_generation_checks.length}`, `full_npm_test_recommended=${plan.full_npm_test_recommended}`].join("\n"); }
  function formatFailureTriage(triage) { return [`vnem_tools_failure_triage: ${triage.classification}`, `cause=${triage.likely_root_cause}`, `inspect=${triage.exact_file_or_function_to_inspect}`, `rerun=${triage.command_to_rerun}`, `blocks=${triage.blocks_acceptance}`].join("\n"); }
  function formatRepoEvidencePack(pack) { return [`vnem_tools_evidence_pack: branch=${pack.branch || "unknown"}`, `changed=${pack.changed_files.length}`, `passed=${pack.tests_passed.length}`, `failed=${pack.tests_failed.length}`, `safe_claims=${pack.safe_to_claim.length}`, `not_safe=${pack.not_safe_to_claim.length}`].join("\n"); }
  function formatLocalSessionRecovery(recovery) { return [`vnem_tools_local_session_recovery: branch=${recovery.current_branch || "unknown"}`, `head=${recovery.head_sha ? recovery.head_sha.slice(0, 12) : "unknown"}`, `dirty=${recovery.worktree.dirty}`, `stack_commits=${recovery.local_stack.commits.length}`, `unpushed=${recovery.unpushed_commits.ahead_count ?? "unknown"}`, `next=${recovery.safe_next_action}`].join("\n"); }
  function formatRepoWorkflowOrchestrator(orchestration) { return [`vnem_tools_repo_workflow_orchestrator: mode=${orchestration.task_mode}`, `branch=${orchestration.repo_state_summary.current_branch || "unknown"}`, `selected=${orchestration.selected_action.phase}`, `remote_proof_required=${orchestration.remote_proof_required}`, `checks=${orchestration.exact_checks.length}`, `next=${orchestration.safe_next_step}`].join("\n"); }
  function formatCodeSymbolMap(map) { return [`vnem_tools_code_symbol_map: files=${map.files_scanned}`, `symbols=${map.symbols_found}`, `parser=${map.parser_type}`, `top=${map.top_symbols.slice(0, 5).map((symbol) => `${symbol.name}@${symbol.file}:${symbol.line_number}`).join("; ") || "none"}`].join("\n"); }
  function formatMcpSurfaceAudit(audit) { return [`vnem_tools_mcp_surface_audit: tools=${audit.total_tools_detected}`, `handlers=${audit.tools_with_handlers}`, `behavior_tests=${audit.tools_with_tests}`, `weak=${audit.weak_tools.length}`, `inspect=${audit.exact_files_to_inspect.slice(0, 5).join("; ") || "none"}`].join("\n"); }
  function formatPatchTargetFinder(targets) { return [`vnem_tools_patch_target_finder: confidence=${targets.confidence}`, `next=${targets.exact_next_file_to_open}`, `sources=${targets.likely_source_files.slice(0, 5).map((item) => item.path).join("; ") || "none"}`, `functions=${targets.likely_functions.slice(0, 5).map((item) => item.name).join("; ") || "none"}`].join("\n"); }
  function formatToolTestCoverageMap(map) { return [`vnem_tools_tool_test_coverage_map: tools=${map.coverage_summary.tools_reviewed}`, `behavior=${map.coverage_summary.behavior_tested}`, `weak=${map.coverage_summary.weak_or_missing}`, `untested=${map.untested_tools.slice(0, 5).join("; ") || "none"}`].join("\n"); }
  function formatSourceImpactTrace(trace) { return [`vnem_tools_source_impact_trace: changed=${trace.changed_files.length}`, `tools=${trace.impacted_tools.slice(0, 5).join("; ") || "none"}`, `risk=${trace.risk_level}`, `checks=${trace.exact_minimum_checks.slice(0, 5).join("; ") || "none"}`].join("\n"); }
  function formatSourceControlCharacterGuard(guard) { return [`vnem_tools_source_control_character_guard: scanned=${guard.files_scanned}`, `source_clean=${guard.source_clean}`, `findings=${guard.dangerous_source_findings.length}`, `skipped_generated_or_binary=${guard.skipped_binary_or_generated.length}`].join("\n"); }

  return {
    changeImpactPlan,
    codeSymbolMap,
    failureTriage,
    formatChangeImpactPlan,
    formatCodeSymbolMap,
    formatFailureTriage,
    formatLocalSessionRecovery,
    formatMcpSurfaceAudit,
    formatNextActionRanker,
    formatNoPlaceboAudit,
    formatPatchTargetFinder,
    formatRepoDeepMap,
    formatRepoEvidencePack,
    formatRepoWorkflowOrchestrator,
    formatSourceControlCharacterGuard,
    formatSourceImpactTrace,
    formatTestSelectionPlan,
    formatToolTestCoverageMap,
    localSessionRecovery,
    mcpSurfaceAudit,
    nextActionRanker,
    noPlaceboProgressAudit,
    patchTargetFinder,
    repoDeepMap,
    repoEvidencePack,
    repoWorkflowOrchestrator,
    sourceControlCharacterGuard,
    sourceImpactTrace,
    testSelectionPlan,
    toolTestCoverageMap
  };
}
