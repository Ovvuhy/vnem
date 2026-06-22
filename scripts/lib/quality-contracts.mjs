const TOKEN_BUDGETS = new Set(["compact", "normal", "expanded"]);
const RISK_LEVELS = ["low", "medium", "high", "critical"];

export function detectMissingContext(options = {}) {
  const task = String(options.task || "").trim();
  const context = String(options.project_context || options.claimed_result || "").trim();
  const text = normalize(`${task} ${context}`);
  const domains = classifyDomains(task, context);
  const questions = [];
  const missing = [];
  const assumptions = [];
  const add = (id, question, assumption, critical = true) => {
    if (!missing.includes(id)) missing.push(id);
    if (!questions.includes(question)) questions.push(question);
    if (assumption && !assumptions.includes(assumption)) assumptions.push(assumption);
    return critical;
  };

  if (domains.includes("game_build")) {
    if (!/(pve|pvp|duel|invasion|arena)/.test(text)) add("game_mode", "Is this for PvE, PvP, co-op, or mixed play?", "Assume PvE/general use if the user wants an immediate answer.");
    if (/elden ring/.test(text) && !/(dlc|shadow of the erdtree|base game|sote)/.test(text)) add("dlc_ownership", "Do you own/use Shadow of the Erdtree DLC, or base game only?", "Provide base-game-safe and DLC alternatives.");
    if (!/(level|rune level|rl\s?\d+|early|mid|late|ng\+|progression)/.test(text)) add("progression", "What level/progression stage and item availability should the build target?", "Separate early/mid/late-game assumptions.");
    if (!/(strength|dex|faith|int|arcane|bleed|mage|spell|incant|weapon|katana|greatsword)/.test(text)) add("build_preference", "Any stat, weapon, spell/incantation, or playstyle preference?", "Offer a balanced default plus alternatives.");
    if (!/(armor|poise|fashion|light roll|medium roll|heavy)/.test(text)) add("armor_relevance", "Does armor/poise/fashion-load matter for the recommendation?", "State armor as optional unless survivability/poise is requested.");
    if (!/(beginner|new|skill|easy|advanced|max damage|glass cannon)/.test(text)) add("skill_level", "Should it be beginner-friendly, forgiving, or maximum-damage/advanced?", "Prefer a forgiving build unless the user asks for max damage.");
  }

  if (domains.includes("research")) {
    if (!/(source|official|current|latest|patch|version|date|citation|docs)/.test(text)) add("source_freshness", "Does this answer need current sources, patch/version freshness, or official documentation?", "Use current/source-quality research before making changing-fact claims.");
  }

  if (domains.includes("modding")) {
    if (!/(game|elden ring|skyrim|minecraft|baldur|specific)/.test(text)) add("specific_game", "Which exact game/version/platform/mod loader is this for?", "Do not patch files until the game/tooling pipeline is known.");
    if (!/(format|file format|regulation|bundle|pak|bnd|dcx|json|xml)/.test(text)) add("file_formats", "Which file formats/assets are involved and what tools parse them safely?", "Research the file formats and tools first.");
    if (!/(backup|copy|isolate|workspace|restore)/.test(text)) add("backup_strategy", "What backup/isolation/restore plan protects the original files?", "Require backups before mutation in future Tools/Precision work.");
  }

  if (domains.includes("ui")) {
    if (!/(desktop|mobile|responsive|screenshot|visual|accessibility|a11y)/.test(text)) add("visual_targets", "Which desktop/mobile states and accessibility/visual checks are required?", "At minimum verify desktop, mobile/responsive, loading/error/empty states.", false);
  }

  if (domains.includes("api")) {
    if (!/(auth|api key|oauth|cors|https|backend|server|proxy|rate limit)/.test(text)) add("api_boundary", "What auth/CORS/HTTPS/rate-limit constraints and frontend/backend boundary apply?", "Assume server/backend proxy for secrets or uncertain CORS.");
  }

  if (domains.includes("debugging")) {
    if (!/(error|log|repro|failing command|stack trace|test)/.test(text)) add("debug_repro", "What exact error, log, failing command, or repro steps show the bug?", "Ask for or find a tight reproduction before fixing.");
  }

  const canAnswerWithAssumptions = missing.length === 0 || !missing.some((item) => ["api_boundary", "specific_game", "file_formats", "game_mode", "dlc_ownership"].includes(item));
  return compactForBudget({
    domains,
    critical_missing_context: missing,
    recommended_clarifying_questions: questions,
    can_answer_with_assumptions: canAnswerWithAssumptions,
    assumptions_if_no_answer: assumptions,
    risk_if_not_clarified: missing.length
      ? "Answer may be generic, unsafe, outdated, or unverifiable; state assumptions if proceeding."
      : "No critical missing context detected for compact contract."
  }, options.token_budget);
}

export function buildDomainQualityContracts(options = {}) {
  const task = String(options.task || "");
  const domains = classifyDomains(task, options.project_context || "");
  const contracts = [];
  const add = (contract) => contracts.push(contract);

  if (domains.includes("research")) {
    add({
      id: "contract:research-source-quality",
      name: "Research/source-quality contract",
      applies_to: ["research", "current facts", "recommendations"],
      compact_instructions: ["Use current/high-quality sources when facts can change.", "Prefer official/docs/primary sources; separate verified facts from assumptions.", "Do not claim certainty without cited evidence."],
      required_evidence: ["sources_used with URL/title/date where available", "freshness/version/patch notes when relevant", "assumptions and limitations"],
      fail_if_missing: ["no sources for changing/current facts", "generic memory answer presented as current research"]
    });
  }
  if (domains.includes("ui") || domains.includes("backend")) {
    add({
      id: "contract:ui-frontend-backend-quality",
      name: "UI/frontend/backend integration contract",
      applies_to: ["UI", "frontend", "web app", "backend feature"],
      compact_instructions: ["Backend work is incomplete unless a user can see/use it when the task expects an app feature.", "Trace data flow from backend/API to UI component/form/action path.", "Verify loading, error, empty, success, responsive, and accessibility states where relevant.", "Do not claim polished UI without visual evidence."],
      required_evidence: ["screenshot/visual or browser evidence for UI claims", "route/component/form/button/state exposing backend feature", "data-flow proof from backend/API response into user-visible UI", "loading/error/empty/success state evidence", "build/test evidence"],
      fail_if_missing: ["UI claims with no visual proof", "backend feature with no UI exposure", "UI component not connected to real backend/data", "hidden or broken user path"]
    });
  }
  if (domains.includes("api")) {
    add({
      id: "contract:api-integration-safety",
      name: "API integration safety contract",
      applies_to: ["API", "external service", "frontend/backend integration"],
      compact_instructions: ["Decide auth, HTTPS, CORS, frontend safety, and backend proxy before implementation.", "Never expose API keys in frontend code.", "Test success/loading/error/rate-limit paths."],
      required_evidence: ["auth/CORS/HTTPS decision", "secret-handling boundary", "mock/live-approved test evidence"],
      fail_if_missing: ["frontend API-key exposure", "no CORS/backend decision", "claiming API works with no tests"]
    });
  }
  if (domains.includes("game_build")) {
    add({
      id: "contract:game-build-research",
      name: "Game/build recommendation contract",
      applies_to: ["game build", "loadout", "Elden Ring example"],
      compact_instructions: ["Clarify PvE/PvP, DLC, progression/level, playstyle, armor/poise, and skill level.", "Check current patch/source quality before 'best/OP' claims.", "Give alternatives when items are unavailable."],
      required_evidence: ["missing-context questions or stated assumptions", "current/source-quality check", "alternatives and constraints"],
      fail_if_missing: ["best build claim without PvE/PvP/DLC/progression context", "outdated generic build advice"]
    });
  }
  if (domains.includes("modding")) {
    add({
      id: "contract:modding-safety-research",
      name: "Game/modding safety contract",
      applies_to: ["modding", "game files", "tooling pipeline"],
      compact_instructions: ["Research the specific game, file formats, tools, and compatibility issues before changing anything.", "Require backups/isolation and restore plan.", "Verify with safe local/game-specific tests."],
      required_evidence: ["game/version/tool/file-format research", "backup/isolation plan", "test/verification plan"],
      fail_if_missing: ["patching files before understanding pipeline", "no backup/restore plan"]
    });
  }
  if (domains.includes("code") || domains.includes("debugging")) {
    add({
      id: "contract:code-debug-verification",
      name: "Code/debug verification contract",
      applies_to: ["coding", "debugging", "CI", "tests"],
      compact_instructions: ["Reproduce failures before fixing.", "Trace root cause; do not guess.", "Run focused and regression checks before claiming done."],
      required_evidence: ["commands_run", "test/build/lint output", "root cause for bug fixes"],
      fail_if_missing: ["code change with no verification", "root-cause claim with no repro"]
    });
  }
  if (!contracts.length) {
    add({
      id: "contract:general-anti-placebo",
      name: "General anti-placebo contract",
      applies_to: ["general task"],
      compact_instructions: ["State the real deliverable, evidence, assumptions, and limits.", "Do not claim done without proof."],
      required_evidence: ["task-appropriate evidence", "limitations/remaining risks"],
      fail_if_missing: ["generic answer with no evidence"]
    });
  }
  return compactForBudget(contracts, options.token_budget);
}

export function completionAudit(options = {}) {
  const task = String(options.task || "").trim();
  const claimed = String(options.claimed_result || "").trim();
  const tokenBudget = normalizeBudget(options.token_budget);
  const evidence = arrayify(options.evidence);
  const commands = arrayify(options.commands_run);
  const sources = arrayify(options.sources_used);
  const visuals = arrayify(options.screenshots_or_visual_evidence);
  const changedFiles = arrayify(options.changed_files);
  const combined = normalize([task, claimed, ...evidence, ...commands, ...sources, ...visuals, ...changedFiles].join(" "));
  const domains = classifyDomains(task, claimed);
  const missingContext = detectMissingContext({ task, claimed_result: claimed, token_budget: tokenBudget });
  const missingEvidence = [];
  const unverifiedClaims = [];
  const researchFindings = [];
  const uiFindings = [];
  const codeFindings = [];
  const apiFindings = [];
  const gameFindings = [];
  const unsafeClaims = [];
  const nextActions = [];

  if (!evidence.length && /\b(done|finished|complete|implemented|fixed|works|safe|polished|best)\b/.test(combined)) {
    missingEvidence.push("Claimed completion/result but provided no concrete evidence.");
    unverifiedClaims.push("Completion claim is unsupported by evidence.");
  }
  if (/\b(done|complete|implemented|fixed|works)\b/.test(combined) && !commands.length && (domains.includes("code") || domains.includes("debugging") || domains.includes("ui") || domains.includes("api"))) {
    codeFindings.push("No commands_run/test/build/lint evidence supports the implementation claim.");
    missingEvidence.push("Focused verification command output is missing.");
  }
  if (domains.includes("ui") && !visuals.length && !/(screenshot|visual|browser|responsive|desktop|mobile|accessibility|a11y)/.test(combined)) {
    uiFindings.push("UI quality claim lacks screenshot/visual/browser/responsive/accessibility evidence.");
    missingEvidence.push("Visual evidence for UI claim is missing.");
  }
  if (domains.includes("ui") && /polish|dashboard|ui|frontend|component|form|app feature/.test(combined)) {
    if (!/(loading|spinner|pending)/.test(combined)) uiFindings.push("UI evidence does not mention loading/pending state coverage.");
    if (!/(error|failure|invalid)/.test(combined)) uiFindings.push("UI evidence does not mention error-state coverage.");
    if (!/(empty|no data|zero state)/.test(combined)) uiFindings.push("UI evidence does not mention empty-state coverage.");
    if (!/(success|saved|submitted|confirmed)/.test(combined)) uiFindings.push("UI evidence does not mention success-state coverage.");
    if (!/(mobile|responsive|desktop)/.test(combined)) uiFindings.push("UI evidence does not mention responsive desktop/mobile coverage.");
    if (!/(accessibility|a11y|keyboard|aria|contrast)/.test(combined)) uiFindings.push("UI evidence does not mention accessibility coverage.");
  }
  if ((domains.includes("backend") || /backend|database|api route|server route/.test(combined)) && domains.includes("ui")) {
    if (!/(component|page|route|button|form|screen|visible|ui exposed|user can|browser)/.test(combined)) {
      uiFindings.push("Backend work is not proven usable: no UI route/component/form/button/state exposes it.");
      missingEvidence.push("UI/backend integration proof is missing.");
    }
    if (!/(connect|wired|fetch|submit|posts? to|gets? from|data flow|api response|real backend|server action)/.test(combined)) {
      uiFindings.push("UI/backend data flow is not proven: no evidence that UI reads from or writes to the real backend/API.");
      missingEvidence.push("Backend-to-UI data-flow proof is missing.");
    }
  }
  if (domains.includes("api") && !/(cors|https|auth|api key|secret|backend|server|proxy|rate limit|env)/.test(combined)) {
    apiFindings.push("API integration lacks auth/CORS/HTTPS/frontend-backend/secret-handling evidence.");
    missingEvidence.push("API safety decision evidence is missing.");
  }
  if (domains.includes("api") && /(next_public|frontend key|browser api key|client api key|from react)/.test(combined) && !/(no key|no secret|public no-auth|backend|server|proxy)/.test(combined)) {
    apiFindings.push("Potential unsafe frontend API-key exposure or direct browser call without backend/CORS justification.");
    unsafeClaims.push("Do not claim API integration is safe while frontend secret exposure is unresolved.");
  }
  const evidenceText = normalize([evidence, commands, sources, visuals].flat().join(" "));
  const hasCurrentSourceEvidence = sources.length > 0 && /(official|docs|changelog|patch|version|current|release|source|http|https|wiki|fextralife|github)/.test(evidenceText);
  const hasAssumptions = /(assum|assuming|if you|for pve|for pvp|base game|dlc|progression|rune level)/.test(combined);
  if (domains.includes("research") && !sources.length && !/(source|official|docs|citation|url|patch|version|current)/.test(evidenceText)) {
    researchFindings.push("Research/current-fact answer has no source-quality/current verification evidence.");
    missingEvidence.push("Current/high-quality sources are missing.");
  } else if (domains.includes("research") && sources.length && !hasCurrentSourceEvidence) {
    researchFindings.push("Sources were provided but freshness/official/current quality is unclear.");
    unverifiedClaims.push("Research is partially sourced but not fully current/official." );
  }
  if (domains.includes("research") && hasAssumptions && !sources.length) {
    researchFindings.push("Assumptions were stated, but no sources were provided; answer is limited rather than fully verified.");
  }
  if (domains.includes("game_build")) {
    const gameMissing = missingContext.critical_missing_context || [];
    if (gameMissing.some((id) => ["game_mode", "dlc_ownership", "progression", "armor_relevance", "skill_level"].includes(id))) {
      gameFindings.push("Game build advice is missing PvE/PvP, DLC, progression/level, armor relevance, or skill-level assumptions/questions.");
      unverifiedClaims.push("Best/OP build claim is context-dependent and cannot be verified without missing game-build context.");
    }
  }
  if (domains.includes("modding") && !/(file format|format|tool|tooling|backup|restore|isolation|specific game|pipeline|compatibility|regulation|bnd|dcx|pak)/.test(combined)) {
    gameFindings.push("Modding work lacks specific-game file format/tooling/backup/pipeline research evidence.");
    missingEvidence.push("Game-specific modding research and backup/isolation plan are missing.");
  }
  if (/\bsafe\b|secure|no risk|risk-free|guaranteed/.test(combined) && !/(security|scan|review|threat|risk|secret|safety)/.test([evidence, commands, sources].flat().join(" ").toLowerCase())) {
    unsafeClaims.push("Safety/security claim lacks explicit safety review evidence.");
  }
  if (/\bvnem\b|core mcp|capability library/.test(normalize(claimed)) && !/\bvnem\b|core mcp|capability library/.test(normalize(task))) {
    unsafeClaims.push("The answer appears to redirect a non-VNEM user task into VNEM self-improvement.");
  }

  const skipped = skippedCapabilities(options.capability_contract, evidence, claimed);
  if (skipped.length) {
    missingEvidence.push("Required capability modules were not evidenced: " + skipped.join(", "));
  }

  nextActions.push(...missingEvidence.slice(0, 4).map((item) => `Provide evidence: ${item}`));
  if (missingContext.recommended_clarifying_questions?.length) nextActions.push("Ask/answer critical missing-context questions or state safe assumptions.");
  if (apiFindings.length) nextActions.push("Add API auth/CORS/HTTPS/secret/backend-boundary proof before claiming done.");
  if (uiFindings.length) nextActions.push("Provide UI visual evidence and UI/backend integration proof.");
  if (researchFindings.length) nextActions.push("Use current/high-quality sources and separate facts from assumptions.");
  if (gameFindings.length) nextActions.push("Add game/build/modding-specific context, source, tooling, and verification evidence.");

  let score = 100;
  score -= missingEvidence.length * 12;
  score -= unverifiedClaims.length * 8;
  score -= skipped.length * 10;
  score -= researchFindings.length * 12;
  score -= uiFindings.length * 12;
  score -= codeFindings.length * 10;
  score -= apiFindings.length * 14;
  score -= gameFindings.length * 14;
  score -= unsafeClaims.length * 12;
  if (commands.length) score += 5;
  if (evidence.length >= 3) score += 5;
  if (domains.includes("research") && hasCurrentSourceEvidence) score += 12;
  if (domains.includes("ui") && visuals.length && /(loading|error|empty|mobile|responsive|accessibility|a11y)/.test(combined)) score += 10;
  if (domains.includes("api") && /(cors|https|auth|secret|backend|server|proxy|rate limit)/.test(combined)) score += 8;
  if (domains.includes("game_build") && /(pve|pvp|dlc|shadow|progression|rune|armor|poise|skill|patch|source)/.test(combined)) score += 10;
  if (domains.includes("modding") && /(game|version|tool|file format|regulation|bnd|dcx|pak|backup|isolation|restore|compatibility|verification)/.test(combined)) score += 12;
  score = clamp(score, 0, 100);

  let verdict = "pass";
  if (apiFindings.some((item) => /frontend API-key/.test(item)) || (domains.includes("modding") && gameFindings.length && !evidence.length)) verdict = "blocked";
  else if (missingEvidence.length && !evidence.length) verdict = "insufficient_evidence";
  else if (score < 80 || missingEvidence.length || unverifiedClaims.length || researchFindings.length || uiFindings.length || apiFindings.length || gameFindings.length || unsafeClaims.length) verdict = "revise";

  return compactForBudget({
    verdict,
    score,
    task_domain: domains,
    missing_evidence: missingEvidence,
    unverified_claims: unverifiedClaims,
    skipped_required_capabilities: skipped,
    missing_context_questions: missingContext.recommended_clarifying_questions || [],
    research_quality_findings: researchFindings,
    ui_quality_findings: uiFindings,
    code_quality_findings: codeFindings,
    api_safety_findings: apiFindings,
    game_or_modding_findings: gameFindings,
    unsafe_or_overconfident_claims: unsafeClaims,
    required_next_actions: unique(nextActions).slice(0, tokenBudget === "expanded" ? 10 : 6),
    what_can_be_claimed_safely: safeClaims(verdict, evidence, commands),
    what_must_not_be_claimed: mustNotClaim(missingEvidence, unsafeClaims, domains),
    final_report_requirements: ["state verdict/evidence", "list commands/sources/visual proof used", "state skipped checks and remaining risks"],
    anti_placebo_result: verdict === "pass" ? "evidence supports the claim" : "completion claim is not fully supported; revise before claiming done",
    token_budget_used: tokenBudget
  }, tokenBudget);
}

export function protectionReview(options = {}) {
  const task = String(options.task || "").trim();
  const action = String(options.plan_or_action || "").trim();
  const target = options.target_type || "general";
  const tokenBudget = normalizeBudget(options.token_budget);
  const text = normalize(`${task} ${action} ${target}`);
  const risks = [];
  const safeguards = [];
  const forbidden = [];
  const preflight = [];
  const recovery = [];
  const evidence = [];
  let riskLevel = "low";
  let verdict = "allow";

  const mark = (level, risk) => {
    risks.push(risk);
    riskLevel = maxRisk(riskLevel, level);
  };

  if (["terminal_command", "filesystem_action", "browser_automation", "github_action", "package_install"].includes(target)) {
    mark("high", `${target} can mutate user environment or external state and belongs to future Precision/Tools MCP, not Core MCP.`);
    verdict = "needs_user_approval";
    safeguards.push("Scope the action to the exact repo/path/account.", "Inspect diffs/logs after action.", "Stop on unexpected file, lockfile, secret, or credential changes.");
    preflight.push("Confirm path/account/branch and expected side effects before action.");
    recovery.push("Record pre-action git status/backup; revert or restore if results are unexpected.");
  }
  if (target === "package_install" || /npm install|pip install|pnpm|yarn add|curl .*\|.*sh|install/.test(text)) {
    mark("high", "Package/install actions can run install scripts, change lockfiles, or introduce supply-chain risk.");
    verdict = "needs_user_approval";
    safeguards.push("Prefer lockfile-respecting commands when possible.", "Review package/source and lockfile diff.");
  }
  if (options.requires_secrets || options.touches_auth || /(api key|token|secret|password|oauth|auth)/.test(text)) {
    mark("high", "Secrets/auth are involved; avoid logging, frontend exposure, or storage in repo.");
    safeguards.push("Use server-side environment variables only; never commit or print secrets.");
    forbidden.push("No frontend API keys or committed secrets.");
  }
  if (target === "api_integration" && /(next_public|frontend|browser|react|client).*(api key|secret|token)|api key.*(frontend|browser|react|client)/.test(text)) {
    mark("critical", "Plan appears to expose an API key/secret in frontend or browser code.");
    verdict = "block";
    forbidden.push("Do not expose API keys in NEXT_PUBLIC/client/browser code.");
  }
  if (target === "skill_use" || /skill\.md|third-party skill|external skill/.test(text)) {
    mark("medium", "External skill instructions are prompt-injection and supply-chain surfaces that need manual review.");
    if (verdict === "allow") verdict = "revise";
    safeguards.push("Read SKILL.md, scripts, references, license, and repository provenance before use.");
    forbidden.push("Do not install or execute skill scripts blindly.");
  }
  if (target === "mcp_server") {
    mark("medium", "MCP servers may expose tools with network, filesystem, browser, or secret access.");
    if (verdict === "allow") verdict = "needs_user_approval";
    safeguards.push("Inspect tool list, permissions, transport, and data boundary before connecting.");
  }
  if (target === "research_answer") {
    mark("medium", "Research answers can become outdated or overconfident without current sources.");
    if (verdict === "allow") verdict = "revise";
    preflight.push("Identify official/current sources and separate facts from assumptions.");
  }
  if (target === "game_modding") {
    mark("high", "Game modding can corrupt saves/files or break compatibility without backups and tool/file-format research.");
    verdict = "needs_user_approval";
    safeguards.push("Use backups, isolated workspace, tool/file-format research, and restore plan.");
  }
  if (options.touches_user_files) mark("medium", "The plan touches user files; data loss or unwanted changes are possible.");
  if (options.touches_network) mark("medium", "The plan touches network/external sources; verify provenance and avoid leaking data.");

  if (!risks.length) {
    risks.push("No high-risk action detected from the provided plan, but Core MCP still does not perform the action.");
    preflight.push("Verify task scope, evidence expectations, and user constraints before proceeding.");
  }
  if (riskLevel === "critical") verdict = "block";
  else if (riskLevel === "high" && verdict === "allow") verdict = "needs_user_approval";
  else if (riskLevel === "medium" && verdict === "allow") verdict = "revise";

  evidence.push("Record exact action taken and output/result after approval.", "Report changed files, commands, sources, screenshots, or tests as applicable.");
  const permissionPrompt = buildPermissionPrompt({ action, target, task, riskLevel, risks, safeguards, recovery, verdict });

  return compactForBudget({
    verdict,
    risk_level: riskLevel,
    risks: unique(risks),
    why_it_matters: unique(risks.map((risk) => risk.replace(/^[^:]+: /, ""))).slice(0, 5),
    required_safeguards: unique(safeguards).slice(0, tokenBudget === "expanded" ? 8 : 5),
    permission_prompt: permissionPrompt,
    safe_alternative: safeAlternative(target, risks),
    preflight_checks: unique(preflight).slice(0, 5),
    rollback_or_recovery: unique(recovery.length ? recovery : ["Keep a rollback plan appropriate to the action; for repo work, inspect git status/diff and revert if needed."]).slice(0, 5),
    forbidden_actions: unique(forbidden).slice(0, 6),
    evidence_required_after_action: evidence,
    core_vs_tools_boundary: {
      core_mcp_reviews_only: true,
      core_mcp_performs_action: false,
      future_tools_or_precision_mcp_required: ["terminal_command", "filesystem_action", "browser_automation", "github_action", "package_install"].includes(target)
    },
    token_budget_used: tokenBudget
  }, tokenBudget);
}

export function proofTrail(options = {}) {
  const task = String(options.task || "").trim();
  const tokenBudget = normalizeBudget(options.token_budget);
  const capabilityIds = unique(arrayify(options.capability_ids_used));
  const commands = arrayify(options.commands_run);
  const sources = arrayify(options.sources_used);
  const changedFiles = arrayify(options.changed_files);
  const visuals = arrayify(options.visual_evidence || options.screenshots_or_visual_evidence);
  const tests = arrayify(options.tests_or_checks);
  const assumptions = arrayify(options.assumptions);
  const skippedItems = arrayify(options.skipped_items);
  const remainingRisks = arrayify(options.remaining_risks);
  const protectionReviews = arrayify(options.protection_reviews);
  const completion = normalizeObject(options.completion_audit);
  const contract = normalizeObject(options.capability_contract);
  const finalClaim = String(options.final_claim || "").trim();
  const domains = classifyDomains(task, finalClaim || JSON.stringify(contract || {}));
  const proofId = `vnem-proof-${stableHash([task, options.bootstrap_activation_id, capabilityIds.join(","), finalClaim].join("|"))}`;
  const missingEvidence = [];

  if (!options.bootstrap_activation_id) missingEvidence.push("bootstrap_activation_id missing; cannot prove bootstrap was used.");
  if (!capabilityIds.length) missingEvidence.push("capability_ids_used missing; cannot prove selected capabilities were applied.");
  if (domains.includes("ui") && !visuals.length) missingEvidence.push("UI visual evidence missing.");
  if (domains.includes("api") && !hasAnyText([completion, contract, protectionReviews, sources], /(cors|secret|api key|auth|https|backend|proxy|server)/i)) missingEvidence.push("API secret/CORS/backend safety proof missing.");
  if (domains.includes("research") && !sources.length) missingEvidence.push("Research/source freshness evidence missing.");
  if (domains.includes("game_build") && !hasAnyText([assumptions, sources, finalClaim, completion], /(pve|pvp|dlc|shadow|progression|rune|armor|poise|skill|patch|source)/i)) missingEvidence.push("Game/build assumptions and source freshness missing.");
  if (domains.includes("modding") && !hasAnyText([assumptions, sources, finalClaim, completion], /(game|version|tool|file format|regulation|bnd|dcx|pak|backup|isolation|restore|compatibility|verification)/i)) missingEvidence.push("Modding game/tool/file-format/backup proof missing.");
  if (completion?.missing_evidence?.length) missingEvidence.push(...arrayify(completion.missing_evidence).map((item) => `Completion audit: ${item}`));
  if (skippedItems.length) missingEvidence.push(...skippedItems.map((item) => `Skipped: ${item}`));

  const completionVerdict = completion?.verdict || "unknown";
  const protectionSummary = summarizeProtection(protectionReviews);
  const evidenceSummary = {
    commands_run: commands.slice(0, 6),
    tests_or_checks: tests.slice(0, 6),
    sources_used: sources.slice(0, 6),
    changed_files: changedFiles.slice(0, 8),
    visual_evidence: visuals.slice(0, 5),
    domain_evidence_status: {
      ui_visual_evidence_present: !domains.includes("ui") || visuals.length > 0,
      api_safety_evidence_present: !domains.includes("api") || !missingEvidence.some((item) => /API secret/.test(item)),
      research_sources_present: !domains.includes("research") || sources.length > 0,
      game_context_present: !domains.includes("game_build") || !missingEvidence.some((item) => /Game\/build/.test(item)),
      modding_pipeline_present: !domains.includes("modding") || !missingEvidence.some((item) => /Modding/.test(item))
    }
  };
  let finalVerdict = "pass";
  if (completionVerdict === "blocked" || protectionSummary.blocking_reviews > 0) finalVerdict = "blocked";
  else if (missingEvidence.length && !commands.length && !sources.length && !visuals.length && !tests.length) finalVerdict = "insufficient_evidence";
  else if (missingEvidence.length || completionVerdict === "revise" || completionVerdict === "insufficient_evidence") finalVerdict = "revise";

  const safeToClaim = finalVerdict === "pass"
    ? ["VNEM was used for task routing/contracting/audit/proof reporting.", "Claim only outcomes backed by listed evidence."]
    : ["Claim partial progress only; include missing evidence and remaining risks."];
  const mustNotClaim = unique([
    missingEvidence.length ? "Do not claim the task is fully done until missing evidence is resolved." : null,
    domains.includes("ui") && !visuals.length ? "Do not claim UI polish/quality without visual evidence." : null,
    domains.includes("api") ? "Do not claim API safety without auth/CORS/secret/backend evidence." : null,
    domains.includes("research") && !sources.length ? "Do not claim current/source-backed research without sources." : null,
    domains.includes("modding") ? "Do not claim modding safety without game/tool/file-format/backups verification." : null
  ]);

  const compactBlock = [
    `VNEM proof trail: ${proofId}`,
    `Verdict: ${finalVerdict}`,
    `Capabilities used: ${capabilityIds.join(", ") || "not provided"}`,
    `Evidence: commands=${commands.length}, tests=${tests.length}, sources=${sources.length}, visual=${visuals.length}, files=${changedFiles.length}`,
    missingEvidence.length ? `Missing: ${missingEvidence.slice(0, 4).join("; ")}` : "Missing: none detected in provided proof fields",
    remainingRisks.length ? `Remaining risks: ${remainingRisks.slice(0, 3).join("; ")}` : "Remaining risks: none provided"
  ].join("\n");

  return compactForBudget({
    proof_trail_id: proofId,
    task_summary: task.slice(0, 240),
    task_domain: domains,
    vnem_used: Boolean(options.bootstrap_activation_id || capabilityIds.length || contract || completion || protectionReviews.length),
    bootstrap_activation_id: options.bootstrap_activation_id || null,
    capability_ids_used: capabilityIds,
    contract_summary: summarizeContract(contract),
    protection_review_summary: protectionSummary,
    completion_audit_summary: summarizeCompletion(completion),
    evidence_summary: evidenceSummary,
    missing_evidence: unique(missingEvidence).slice(0, tokenBudget === "expanded" ? 12 : 7),
    assumptions: assumptions.slice(0, 6),
    skipped_items: skippedItems.slice(0, 6),
    remaining_risks: remainingRisks.slice(0, 6),
    safe_to_claim: safeToClaim,
    must_not_claim: mustNotClaim,
    final_verdict: finalVerdict,
    compact_final_report_block: compactBlock,
    token_budget_used: tokenBudget
  }, tokenBudget);
}

export function classifyDomains(task = "", context = "") {
  const text = normalize(`${task} ${context}`);
  const domains = new Set();
  if (/research|current|latest|best|compare|recommend|source|citation|fact|news|docs|patch/.test(text)) domains.add("research");
  if (/elden ring|build|loadout|pve|pvp|dlc|rune level|weapon|armor|talismans|skill level/.test(text)) domains.add("game_build"), domains.add("research");
  if (/modding|mod workflow|game mod|mods?|file format|regulation\.bin|bnd|dcx|pak|load order|save file/.test(text)) domains.add("modding"), domains.add("game_build");
  if (/next|react|website|frontend|\bui\b|ux|dashboard|component|responsive|accessibility|visual|screen|form|button/.test(text)) domains.add("ui"), domains.add("code");
  if (/backend|database|server|api route|storage|endpoint/.test(text)) domains.add("backend"), domains.add("code");
  if (/api|cors|oauth|webhook|api key|token|external service|weather|forecast|currency|exchange|github|gitlab|suspicious domain|domain or ip|ip lookup|threat api|integration/.test(text)) domains.add("api"), domains.add("code");
  if (/debug|bug|failing|failure|error|stack trace|regression|root cause|ci/.test(text)) domains.add("debugging"), domains.add("code");
  if (/code|test|lint|build|cli|package|refactor|implement|fix/.test(text)) domains.add("code");
  if (/security|secure|gmail|pc|device|account|malware|secret|auth|privacy|safe|risk|threat|permission/.test(text)) domains.add("security");
  if (/prompt|instruction|agent behavior|system prompt/.test(text)) domains.add("prompt");
  if (/\bvnem\b|core mcp|precision mcp|capability library/.test(text)) domains.add("vnem_development");
  if (!domains.size) domains.add("general");
  return [...domains];
}

function skippedCapabilities(contract, evidence, claimed) {
  if (!contract) return [];
  const text = normalize([JSON.stringify(evidence || []), claimed].join(" "));
  let parsed = contract;
  if (typeof contract === "string") {
    try { parsed = JSON.parse(contract); } catch { parsed = contract; }
  }
  const modules = Array.isArray(parsed?.required_capability_modules)
    ? parsed.required_capability_modules
    : Array.isArray(parsed?.selected_capability_modules)
      ? parsed.selected_capability_modules
      : [];
  return modules
    .map((module) => typeof module === "string" ? module : module?.id)
    .filter(Boolean)
    .filter((id) => !text.includes(normalize(id)) && modules.length > 1)
    .slice(0, 6);
}

function buildPermissionPrompt({ action, target, task, riskLevel, risks, safeguards, recovery, verdict }) {
  const scopedAction = action || `review/perform ${target} for: ${task}`;
  return [
    `Permission requested: ${scopedAction}`,
    `Exact action: ${scopedAction}`,
    `Danger level: ${capitalize(riskLevel)}.`,
    `Why it is needed: ${task || "advance the requested task while preserving safety boundaries."}`,
    `What can go wrong: ${risks.slice(0, 3).join("; ") || "unexpected side effects or unverifiable claims"}`,
    `Scope: only the explicit path/account/repository/action named above; no unrelated files, accounts, or secrets.`,
    `Safeguards: ${(safeguards.length ? safeguards : ["Limit scope, record evidence, and stop on unexpected changes."]).slice(0, 3).join("; ")}`,
    `Rollback/recovery: ${(recovery.length ? recovery : ["Inspect state after action and revert/restore if results are unexpected."]).slice(0, 2).join("; ")}`,
    `After approval: perform only the scoped action, report exact output/evidence, and stop if new risk appears.`,
    `Will not do: access unrelated paths, store or print secrets, escalate privileges, or perform extra actions not approved.`,
    `Core MCP verdict: ${verdict}; Core MCP does not perform this action.`
  ].join("\n");
}

function safeAlternative(target, risks) {
  if (target === "api_integration") return "Use a backend/server route for secret-bearing or CORS-unsafe APIs; mock responses until live calls are approved.";
  if (target === "skill_use") return "Apply compact guidance only after reading provenance; defer install/execution to user-approved Tools/Precision work.";
  if (["terminal_command", "filesystem_action", "package_install", "browser_automation", "github_action"].includes(target)) return "Ask for explicit approval with exact command/path/account and rollback plan; Core MCP reviews only.";
  if (target === "game_modding") return "Research game/tool/file-format pipeline and make backups before any future mutation.";
  return risks.length ? "Revise the plan to reduce risk and add verification evidence." : "Proceed with normal task-specific verification outside Core MCP.";
}

function safeClaims(verdict, evidence, commands) {
  if (verdict === "pass") return ["Claim only the work supported by listed evidence and commands."];
  const claims = [];
  if (evidence.length) claims.push("You can say partial evidence exists, but not full completion.");
  if (commands.length) claims.push("You can report commands run and their outcomes exactly.");
  if (!claims.length) claims.push("Only claim that a plan/answer was drafted; do not claim completion.");
  return claims;
}

function mustNotClaim(missingEvidence, unsafeClaims, domains) {
  return unique([
    missingEvidence.length ? "Do not claim done/complete until missing evidence is provided." : null,
    unsafeClaims.length ? "Do not claim safe/risk-free without safety review proof." : null,
    domains.includes("ui") ? "Do not claim polished UI without visual evidence." : null,
    domains.includes("api") ? "Do not claim API integration is safe without auth/CORS/secret/backend proof." : null,
    domains.includes("research") ? "Do not claim current/best facts without current/source-quality evidence." : null
  ]);
}

function summarizeContract(contract) {
  if (!contract) return { provided: false };
  return compactObject({
    provided: true,
    task_summary: contract.task_summary,
    capability_count: Array.isArray(contract.required_capability_modules) ? contract.required_capability_modules.length : undefined,
    capability_ids: Array.isArray(contract.required_capability_modules) ? contract.required_capability_modules.map((module) => typeof module === "string" ? module : module.id).filter(Boolean).slice(0, 8) : undefined,
    proof_trail_expected: contract.proof_trail_expectation?.tool || contract.proof_trail_expectation || undefined,
    final_report_requirements: Array.isArray(contract.final_report_requirements) ? contract.final_report_requirements.slice(0, 6) : undefined
  });
}

function summarizeCompletion(completion) {
  if (!completion) return { provided: false };
  return compactObject({
    provided: true,
    verdict: completion.verdict,
    score: completion.score,
    missing_evidence_count: arrayify(completion.missing_evidence).length,
    unverified_claims_count: arrayify(completion.unverified_claims).length,
    safe_claims: arrayify(completion.what_can_be_claimed_safely).slice(0, 3),
    must_not_claim: arrayify(completion.what_must_not_be_claimed).slice(0, 3)
  });
}

function summarizeProtection(reviews) {
  const parsed = reviews.map((item) => normalizeObject(item) || { raw: String(item) });
  return {
    provided: parsed.length > 0,
    count: parsed.length,
    blocking_reviews: parsed.filter((review) => review.verdict === "block" || review.verdict === "blocked").length,
    approval_required_reviews: parsed.filter((review) => review.verdict === "needs_user_approval").length,
    highest_risk: parsed.reduce((risk, review) => maxRisk(risk, review.risk_level || "low"), "low"),
    summaries: parsed.slice(0, 4).map((review) => compactObject({ verdict: review.verdict, risk_level: review.risk_level, first_risk: arrayify(review.risks)[0] || review.raw }))
  };
}

function normalizeObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return { raw: value }; }
  }
  return null;
}

function hasAnyText(values, regex) {
  return regex.test(values.map((value) => typeof value === "string" ? value : JSON.stringify(value || "")).join(" "));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 10);
}

function compactForBudget(value, budget = "compact") {
  const tokenBudget = normalizeBudget(budget);
  if (tokenBudget !== "compact") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => {
      if (!item || typeof item !== "object") return item;
      return compactObject({
        id: item.id,
        name: item.name,
        applies_to: Array.isArray(item.applies_to) ? item.applies_to.slice(0, 3) : item.applies_to,
        compact_instructions: Array.isArray(item.compact_instructions) ? item.compact_instructions.slice(0, 2) : item.compact_instructions,
        required_evidence: Array.isArray(item.required_evidence) ? item.required_evidence.slice(0, 2) : item.required_evidence,
        fail_if_missing: Array.isArray(item.fail_if_missing) ? item.fail_if_missing.slice(0, 2) : item.fail_if_missing
      });
    });
  }
  if (!value || typeof value !== "object") return value;
  const result = { ...value };
  for (const [key, item] of Object.entries(result)) {
    if (Array.isArray(item)) result[key] = item.slice(0, 6);
  }
  return compactObject(result);
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)));
}

function normalizeBudget(value) {
  return TOKEN_BUDGETS.has(value) ? value : "compact";
}

function arrayify(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => typeof item === "string" ? item : JSON.stringify(item));
  if (!value) return [];
  if (typeof value === "object") return [JSON.stringify(value)];
  return [String(value)];
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^a-z0-9+#._/-]+/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean).map(String))];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function maxRisk(a, b) {
  return RISK_LEVELS.indexOf(b) > RISK_LEVELS.indexOf(a) ? b : a;
}

function capitalize(value) {
  return String(value || "").slice(0, 1).toUpperCase() + String(value || "").slice(1);
}
