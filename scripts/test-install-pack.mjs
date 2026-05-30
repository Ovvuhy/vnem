import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { ROOT, readJson } from "./lib/registry.mjs";

const failures = [];
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

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function tokenize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function dangerousPatternFound(text) {
  const patterns = [
    /curl\s+[^|]+?\|\s*(sh|bash|zsh)/i,
    /\bnpm\s+install\b/i,
    /\bpnpm\s+add\b/i,
    /\byarn\s+add\b/i,
    /\bpip\s+install\b/i,
    /\bcargo\s+install\b/i,
    /\bsudo\b/i,
    /\bchmod\s+\+x\b/i,
    /\bexport\s+[A-Z0-9_]+=/i
  ];
  return patterns.find((pattern) => pattern.test(text));
}

function safeHttpsUrl(value, expectedPathSuffix) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    url.pathname.endsWith(expectedPathSuffix);
}

function safeInstallCommand(command) {
  const archiveMatch = command.match(/^curl -fsSL (\S+) \| tar -xz$/);
  if (archiveMatch) {
    return safeHttpsUrl(archiveMatch[1], "/install.tgz") &&
      !dangerousPatternFound(command);
  }

  const expectedFiles = new Set([
    "AGENTS.md",
    "install-guide.md",
    "operating-protocol.md",
    "quality-contract.md",
    "orchestration-protocol.md",
    "precision-execution-protocol.md",
    "omniscient-self-healing-protocol.md",
    "coding-protocol.md",
    "coding-playbooks.json",
    "design-architecture.md",
    "visual-qa-protocol.md",
    "task-rubrics.json",
    "search-index.json",
    "source-radar.json",
    "best-practices.md",
    "agent-workspace.md",
    "prompt-engineering.md",
    "prompt-patterns.json"
  ]);
  const segments = command.split(/\s+&&\s+/);
  if (segments.length !== expectedFiles.size) {
    return false;
  }

  const seenFiles = new Set();
  for (const segment of segments) {
    const match = segment.match(/^curl -fsSL --create-dirs (\S+) -o \.vnem\/([A-Za-z0-9.-]+)$/);
    if (!match || dangerousPatternFound(segment)) {
      return false;
    }

    const [, url, fileName] = match;
    if (!expectedFiles.has(fileName) || seenFiles.has(fileName) || !safeHttpsUrl(url, `/install/${fileName}`)) {
      return false;
    }

    seenFiles.add(fileName);
  }

  return true;
}

function safeInstallArchiveUrl(value) {
  return !value || (safeHttpsUrl(value, "/install.tgz") && !dangerousPatternFound(value));
}

function tarNames(archive) {
  const data = gunzipSync(archive);
  const names = [];
  let offset = 0;

  while (offset < data.length) {
    const name = data.toString("utf8", offset, offset + 100).replace(/\0.*$/, "");
    if (!name) break;
    const sizeText = data.toString("utf8", offset + 124, offset + 136).replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    names.push(name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }

  return names;
}

function search(index, query) {
  const aliasTerms = index.intent_aliases?.[query] ?? [];
  const terms = [...new Set([...tokenize(query), ...aliasTerms.flatMap(tokenize)])];
  const ids = new Set();
  const routeList = index.intent_routes?.[query]?.read_first ?? [];
  const routeIds = new Set(routeList);
  const routeRank = new Map(routeList.map((id, index) => [id, Math.max(50 - index * 10, 20)]));
  const normalizedQuery = tokenize(query).join(" ");

  for (const term of terms) {
    for (const id of index.inverted_index?.[term] ?? []) {
      ids.add(id);
    }
  }
  for (const id of routeIds) {
    ids.add(id);
  }

  return index.documents
    .filter((document) => ids.has(document.id))
    .map((document) => {
      const keywords = new Set(document.keywords ?? []);
      const matchedTerms = terms.filter((term) => keywords.has(term)).length;
      const titleTokens = tokenize(document.title).join(" ");
      const rank_score = document.score + matchedTerms * 10 +
        (routeRank.get(document.id) ?? 0) +
        (normalizedQuery && titleTokens.includes(normalizedQuery) ? 20 : 0);
      return { ...document, rank_score };
    })
    .sort((a, b) => b.rank_score - a.rank_score || a.title.localeCompare(b.title));
}

const installDir = path.join(ROOT, "public", "install");
const localPackDir = path.join(ROOT, ".vnem");
const agents = await readFile(path.join(installDir, "AGENTS.md"), "utf8");
const installGuide = await readFile(path.join(installDir, "install-guide.md"), "utf8");
const operatingProtocol = await readFile(path.join(installDir, "operating-protocol.md"), "utf8");
const qualityContract = await readFile(path.join(installDir, "quality-contract.md"), "utf8");
const orchestrationProtocol = await readFile(path.join(installDir, "orchestration-protocol.md"), "utf8");
const precisionExecutionProtocol = await readFile(path.join(installDir, "precision-execution-protocol.md"), "utf8");
const omniscientSelfHealingProtocol = await readFile(path.join(installDir, "omniscient-self-healing-protocol.md"), "utf8");
const codingProtocol = await readFile(path.join(installDir, "coding-protocol.md"), "utf8");
const codingPlaybooks = await readJson(path.join(installDir, "coding-playbooks.json"));
const designArchitecture = await readFile(path.join(installDir, "design-architecture.md"), "utf8");
const visualQaProtocol = await readFile(path.join(installDir, "visual-qa-protocol.md"), "utf8");
const taskRubrics = await readJson(path.join(installDir, "task-rubrics.json"));
const sourceRadar = await readJson(path.join(installDir, "source-radar.json"));
const bestPractices = await readFile(path.join(installDir, "best-practices.md"), "utf8");
const agentWorkspace = await readFile(path.join(installDir, "agent-workspace.md"), "utf8");
const promptEngineering = await readFile(path.join(installDir, "prompt-engineering.md"), "utf8");
const promptPatterns = await readJson(path.join(installDir, "prompt-patterns.json"));
const searchIndex = await readJson(path.join(installDir, "search-index.json"));
const localSearchIndex = await readJson(path.join(localPackDir, "search-index.json"));
const localQualityContract = await readFile(path.join(localPackDir, "quality-contract.md"), "utf8");
const localOrchestrationProtocol = await readFile(path.join(localPackDir, "orchestration-protocol.md"), "utf8");
const localPrecisionExecutionProtocol = await readFile(path.join(localPackDir, "precision-execution-protocol.md"), "utf8");
const localOmniscientSelfHealingProtocol = await readFile(path.join(localPackDir, "omniscient-self-healing-protocol.md"), "utf8");
const localCodingProtocol = await readFile(path.join(localPackDir, "coding-protocol.md"), "utf8");
const localCodingPlaybooks = await readJson(path.join(localPackDir, "coding-playbooks.json"));
const localDesignArchitecture = await readFile(path.join(localPackDir, "design-architecture.md"), "utf8");
const localVisualQaProtocol = await readFile(path.join(localPackDir, "visual-qa-protocol.md"), "utf8");
const localTaskRubrics = await readJson(path.join(localPackDir, "task-rubrics.json"));
const localSourceRadar = await readJson(path.join(localPackDir, "source-radar.json"));
const localPromptPatterns = await readJson(path.join(localPackDir, "prompt-patterns.json"));
const apiIndex = await readJson(path.join(ROOT, "public", "api", "index.json"));
const installArchive = await readFile(path.join(ROOT, "public", "install.tgz"));

assert(agents.includes("Project Review Protocol"), "AGENTS.md must include the project review protocol.");
assert(agents.includes("Natural Use Rule"), "AGENTS.md must tell agents to auto-use vnem naturally.");
assert(agents.includes("Decision Search Protocol"), "AGENTS.md must include the decision search protocol.");
assert(agents.includes("The user should not need to say `use vnem`"), "AGENTS.md must not require a special user prompt to activate vnem.");
assert(agents.includes("If vnem has no useful match"), "AGENTS.md must require agents to report vnem knowledge gaps.");
assert(agents.includes("Current stack"), "AGENTS.md must include the required output sections.");
assert(agents.includes("Ask before changing"), "AGENTS.md must tell agents to ask before changing.");
assert(!dangerousPatternFound(agents), `AGENTS.md contains a dangerous install/execution pattern: ${dangerousPatternFound(agents)}`);
assert(safeInstallCommand(apiIndex.install_command), "install command must only download or extract the read-only pack files.");
assert(safeInstallArchiveUrl(apiIndex.install_archive_url), "install archive URL must be an HTTPS install.tgz URL when present.");
assert(
  JSON.stringify(tarNames(installArchive)) === JSON.stringify([
    "AGENTS.md",
    ".vnem/AGENTS.md",
    ".vnem/install-guide.md",
    ".vnem/operating-protocol.md",
    ".vnem/quality-contract.md",
    ".vnem/orchestration-protocol.md",
    ".vnem/precision-execution-protocol.md",
    ".vnem/omniscient-self-healing-protocol.md",
    ".vnem/coding-protocol.md",
    ".vnem/coding-playbooks.json",
    ".vnem/design-architecture.md",
    ".vnem/visual-qa-protocol.md",
    ".vnem/task-rubrics.json",
    ".vnem/search-index.json",
    ".vnem/source-radar.json",
    ".vnem/best-practices.md",
    ".vnem/agent-workspace.md",
    ".vnem/prompt-engineering.md",
    ".vnem/prompt-patterns.json"
  ]),
  "install archive must extract root AGENTS.md plus the eighteen read-only pack files."
);
assert(agents.includes("operating-protocol.md"), "AGENTS.md must tell agents to read the operating protocol.");
assert(agents.includes("install-guide.md"), "AGENTS.md must mention the install guide.");
assert(agents.includes("quality-contract.md"), "AGENTS.md must tell agents to read the quality contract.");
assert(agents.includes("Holistic Excellence"), "AGENTS.md must mention Holistic Excellence.");
assert(agents.includes("Triple-Check Workflow"), "AGENTS.md must mention the Triple-Check Workflow.");
assert(agents.includes("orchestration-protocol.md"), "AGENTS.md must tell agents to read the orchestration protocol for complex work.");
assert(agents.includes("precision-execution-protocol.md"), "AGENTS.md must tell agents to read the precision execution protocol before precision tools.");
assert(agents.includes("omniscient-self-healing-protocol.md"), "AGENTS.md must tell agents to read the omniscient self-healing protocol before semantic/proof tools.");
assert(agents.includes("coding-protocol.md"), "AGENTS.md must tell agents to read the coding protocol for implementation work.");
assert(agents.includes("coding-playbooks.json"), "AGENTS.md must tell agents to use coding playbooks for mode-specific implementation work.");
assert(agents.includes("design-architecture.md"), "AGENTS.md must tell agents to read the design architecture guide for visual work.");
assert(agents.includes("visual-qa-protocol.md"), "AGENTS.md must tell agents to read the visual QA protocol for rendered visual work.");
assert(agents.includes("task-rubrics.json"), "AGENTS.md must tell agents to use task rubrics.");
assert(agents.includes("source-radar.json"), "AGENTS.md must tell agents to use source radar when upstream currency matters.");
assert(agents.includes("compact task contract"), "AGENTS.md must define compact task contracts.");
assert(operatingProtocol.includes("Sense"), "operating-protocol.md must include the Sense step.");
assert(operatingProtocol.includes("Route"), "operating-protocol.md must include the Route step.");
assert(operatingProtocol.includes("Choose"), "operating-protocol.md must include the Choose step.");
assert(operatingProtocol.includes("Constrain"), "operating-protocol.md must include the Constrain step.");
assert(operatingProtocol.includes("Verify"), "operating-protocol.md must include the Verify step.");
assert(operatingProtocol.includes("Task Contract"), "operating-protocol.md must describe task contracts.");
assert(installGuide.includes("vnem Install And MCP Guide"), "install-guide.md must include the install guide title.");
assert(installGuide.includes("Fastest Pack Install"), "install-guide.md must include fastest install guidance.");
assert(installGuide.includes("Existing Repo Install"), "install-guide.md must include existing repo guidance.");
assert(installGuide.includes("MCP Setup From A Checkout"), "install-guide.md must include MCP setup guidance.");
assert(installGuide.includes("mcp-config"), "install-guide.md must mention mcp-config.");
assert(installGuide.includes("vnem_status"), "install-guide.md must explain MCP verification.");
assert(qualityContract.includes("vnem Quality Contract"), "quality-contract.md must include the quality contract title.");
assert(qualityContract.includes("Holistic Excellence"), "quality contract must include Holistic Excellence.");
assert(qualityContract.includes("Proactive Enhancement"), "quality contract must include Proactive Enhancement.");
assert(qualityContract.includes("Intelligent Trade-offs"), "quality contract must include Intelligent Trade-offs.");
assert(qualityContract.includes("Triple-Check Workflow"), "quality contract must include the Triple-Check Workflow.");
assert(qualityContract.includes("Analyze"), "quality contract must include Analyze.");
assert(qualityContract.includes("Architect"), "quality contract must include Architect.");
assert(qualityContract.includes("Review"), "quality contract must include Review.");
assert(qualityContract.includes("settings GUI"), "quality contract must include settings GUI trade-off guidance.");
assert(localQualityContract === qualityContract, "local .vnem quality contract must match the hosted install pack.");
assert(orchestrationProtocol.includes("vnem Orchestration Protocol"), "orchestration-protocol.md must include the orchestration protocol title.");
assert(orchestrationProtocol.includes("Routing & Orchestration Engine"), "orchestration protocol must include routing engine guidance.");
assert(orchestrationProtocol.includes("Reflection Loop"), "orchestration protocol must include reflection-loop guidance.");
assert(orchestrationProtocol.includes("Magentic Coding Workflow"), "orchestration protocol must include Magentic coding guidance.");
assert(orchestrationProtocol.includes("Shared State"), "orchestration protocol must include shared-state guidance.");
assert(orchestrationProtocol.includes("single_agent"), "orchestration protocol must include single-agent routing.");
assert(orchestrationProtocol.includes("orchestrator_worker"), "orchestration protocol must include orchestrator-worker routing.");
assert(orchestrationProtocol.includes("split_and_merge"), "orchestration protocol must include split-and-merge routing.");
assert(localOrchestrationProtocol === orchestrationProtocol, "local .vnem orchestration protocol must match the hosted install pack.");
assert(precisionExecutionProtocol.includes("vnem Precision Execution Protocol"), "precision-execution-protocol.md must include the precision protocol title.");
assert(precisionExecutionProtocol.includes("mcp_apply_diff_patch"), "precision protocol must include exact patching tool guidance.");
assert(precisionExecutionProtocol.includes("mcp_fetch_documentation"), "precision protocol must include documentation fetch guidance.");
assert(precisionExecutionProtocol.includes("mcp_execute_terminal_command"), "precision protocol must include terminal execution guidance.");
assert(precisionExecutionProtocol.includes("dry_run=true"), "precision protocol must require dry-run patch verification.");
assert(precisionExecutionProtocol.includes("reject the patch"), "precision protocol must reject mismatched patch context.");
assert(localPrecisionExecutionProtocol === precisionExecutionProtocol, "local .vnem precision execution protocol must match the hosted install pack.");
assert(omniscientSelfHealingProtocol.includes("vnem Omniscient Context And Self-Healing Protocol"), "omniscient-self-healing-protocol.md must include the protocol title.");
assert(omniscientSelfHealingProtocol.includes("mcp_semantic_code_search"), "omniscient protocol must include semantic code search guidance.");
assert(omniscientSelfHealingProtocol.includes("mcp_run_verification_tests"), "omniscient protocol must include verification test guidance.");
assert(omniscientSelfHealingProtocol.includes("mcp_execute_ephemeral_script"), "omniscient protocol must include ephemeral scripting guidance.");
assert(omniscientSelfHealingProtocol.includes("Local RAG And Semantic Codebase Embeddings"), "omniscient protocol must include local RAG guidance.");
assert(omniscientSelfHealingProtocol.includes("Test-Driven Self-Healing"), "omniscient protocol must include test-driven self-healing guidance.");
assert(omniscientSelfHealingProtocol.includes("Ephemeral Scripting"), "omniscient protocol must include ephemeral scripting guidance.");
assert(localOmniscientSelfHealingProtocol === omniscientSelfHealingProtocol, "local .vnem omniscient self-healing protocol must match the hosted install pack.");
assert(codingProtocol.includes("vnem Coding Protocol"), "coding-protocol.md must include the coding protocol title.");
assert(codingProtocol.includes("Repo Sensing Contract"), "coding protocol must include repo sensing guidance.");
assert(codingProtocol.includes("Plan Before Mutating"), "coding protocol must include plan-before-mutation guidance.");
assert(codingProtocol.includes("Verification Ladder"), "coding protocol must include a verification ladder.");
assert(codingProtocol.includes("Web App And App Quality Bar"), "coding protocol must include web app quality guidance.");
assert(localCodingProtocol === codingProtocol, "local .vnem coding protocol must match the hosted install pack.");
assert(codingPlaybooks.safety?.mode === "read-only-coding-playbooks", "coding-playbooks safety mode must be read-only-coding-playbooks.");
for (const playbookId of ["feature-slice", "bug-root-cause", "test-first-evidence", "refactor-preserve", "web-app-rendered-quality", "api-data-contract", "large-change-checkpoints", "review-risk-scan", "failure-recovery"]) {
  assert(codingPlaybooks.playbooks?.some((playbook) => playbook.id === playbookId), `coding-playbooks must include ${playbookId}.`);
}
assert(codingPlaybooks.playbooks?.every((playbook) => playbook.repo_sensing?.length && playbook.execution_loop?.length && playbook.verification_ladder?.length && playbook.stop_conditions?.length), "each coding playbook must include repo sensing, execution, verification, and stop conditions.");
assert(JSON.stringify(localCodingPlaybooks) === JSON.stringify(codingPlaybooks), "local .vnem coding playbooks must match the hosted install pack.");
assert(designArchitecture.includes("vnem Design Architecture"), "design-architecture.md must include the design architecture title.");
assert(designArchitecture.includes("WCAG 3 and APCA-style contrast work are watchlist/directional only"), "design architecture must mark WCAG 3/APCA as watchlist guidance.");
assert(designArchitecture.includes("CSS Grid"), "design architecture must include grid guidance.");
assert(designArchitecture.includes("clamp()"), "design architecture must include fluid typography guidance.");
assert(designArchitecture.includes("container queries"), "design architecture must include container query guidance.");
assert(designArchitecture.includes("backdrop-filter"), "design architecture must include glass/depth guidance.");
assert(designArchitecture.includes("Guidance Classification"), "design architecture must classify source-backed, heuristic, and watchlist guidance.");
assert(designArchitecture.includes("8-point spacing, bento topology"), "design architecture must mark spacing and bento rules as heuristics.");
assert(designArchitecture.includes("Do not report APCA numeric targets as required pass/fail criteria"), "design architecture must keep APCA guidance non-normative.");
assert(localDesignArchitecture === designArchitecture, "local .vnem design architecture must match the hosted install pack.");
assert(visualQaProtocol.includes("vnem Visual QA Protocol"), "visual-qa-protocol.md must include the visual QA title.");
assert(visualQaProtocol.includes("Repo-First Sensing"), "visual QA protocol must include repo-first sensing.");
assert(visualQaProtocol.includes("Name the single ugliest visible issue"), "visual QA protocol must require naming the ugliest visible issue.");
assert(visualQaProtocol.includes("desktop and mobile states"), "visual QA protocol must require desktop and mobile evidence.");
assert(localVisualQaProtocol === visualQaProtocol, "local .vnem visual QA protocol must match the hosted install pack.");
assert(taskRubrics.safety?.mode === "read-only-task-rubrics", "task-rubrics safety mode must be read-only-task-rubrics.");
for (const rubricId of ["agentic_coding", "frontend_ui", "backend_api", "refactor", "agent_tooling", "data_memory", "security_sensitive", "docs_prompt", "interactive_canvas"]) {
  assert(taskRubrics.rubrics?.some((rubric) => rubric.id === rubricId), `task-rubrics must include ${rubricId}.`);
}
assert(sourceRadar.safety?.mode === "read-only-source-radar", "source-radar safety mode must be read-only-source-radar.");
assert(sourceRadar.sources?.some((source) => source.id === "mcp-core-and-registry"), "source-radar must include MCP core and registry sources.");
assert(sourceRadar.sources?.some((source) => source.id === "coding-agent-clients"), "source-radar must include coding agent client docs.");
assert(sourceRadar.sources?.some((source) => source.id === "agentic-coding-best-practices"), "source-radar must include agentic coding best-practice sources.");
assert(sourceRadar.sources?.some((source) => source.id === "evaluation-and-observability"), "source-radar must include evaluation and observability sources.");
assert(sourceRadar.sources?.some((source) => source.id === "agentic-gateway-security"), "source-radar must include agentic gateway security sources.");
assert(sourceRadar.sources?.some((source) => source.id === "ui-architecture-sources"), "source-radar must include UI architecture sources.");
assert(localSourceRadar.sources?.length === sourceRadar.sources.length, "local .vnem source radar must match the hosted install pack.");
assert(bestPractices.includes("Frontend And UI"), "best-practices.md must include frontend guidance.");
assert(bestPractices.includes("Agentic Coding Execution"), "best-practices.md must include agentic coding execution guidance.");
assert(bestPractices.includes("Holistic Excellence And Intelligent Trade-offs"), "best-practices.md must include holistic excellence guidance.");
assert(bestPractices.includes("Multi-Agent Orchestration And Reflection"), "best-practices.md must include multi-agent orchestration guidance.");
assert(bestPractices.includes("Precision Execution And Dynamic Knowledge"), "best-practices.md must include precision execution guidance.");
assert(bestPractices.includes("Omniscient Context And Self-Healing"), "best-practices.md must include omniscient context and self-healing guidance.");
assert(bestPractices.includes("Browser Games And Interactive Canvas"), "best-practices.md must include browser game guidance.");
assert(bestPractices.includes("Excalibur"), "browser game guidance must include Excalibur as a TypeScript-first 2D option.");
assert(bestPractices.includes("real browser"), "browser game guidance must require real-browser verification.");
assert(bestPractices.includes("Code Simplification And Minimal Refactors"), "best-practices.md must include code simplification guidance.");
assert(bestPractices.includes("Payments And Commerce"), "best-practices.md must include payments guidance.");
assert(bestPractices.includes("MCP Gateway And Tool Routing"), "best-practices.md must include MCP gateway guidance.");
assert(bestPractices.includes("Persistent Memory And Context Files"), "best-practices.md must include persistent memory guidance.");
assert(bestPractices.includes("Codex/VNEM Setup"), "best-practices.md must include Codex/VNEM guidance.");
assert(bestPractices.includes("Visual Experience And Perception Gate"), "best-practices.md must include visual perception guidance.");
assert(bestPractices.includes("Research Source Intake"), "best-practices.md must include research source intake guidance.");
assert(bestPractices.includes("Zero-Trust Agent Gateway Readiness"), "best-practices.md must include zero-trust gateway guidance.");
assert(bestPractices.includes("Model And Provider Selection"), "best-practices.md must include model and provider selection guidance.");
assert(agentWorkspace.includes("MCP Gateway And Tool Routing"), "agent-workspace.md must include gateway guidance.");
assert(agentWorkspace.includes("Persistent Memory And Context Files"), "agent-workspace.md must include memory guidance.");
assert(agentWorkspace.includes("Codex/VNEM Setup"), "agent-workspace.md must include Codex guidance.");
assert(agents.includes("Prompt Enhancement Protocol"), "AGENTS.md must include the prompt enhancement protocol.");
assert(agents.includes("Auto-activate the same protocol"), "AGENTS.md must include prompt auto-activation instructions.");
assert(agents.includes("use vnem to enhance this prompt"), "AGENTS.md must include the vnem prompt trigger phrase.");
assert(promptEngineering.includes("Prompt Enhancement Protocol"), "prompt-engineering.md must include the enhancement protocol.");
assert(promptEngineering.includes("Auto-Activation Rules"), "prompt-engineering.md must include auto-activation rules.");
assert(promptEngineering.includes("Codex Implementation Prompt"), "prompt-engineering.md must include Codex-oriented prompting.");
assert(promptPatterns.safety?.mode === "read-only-prompt-patterns", "prompt-patterns safety mode must be read-only-prompt-patterns.");
assert(promptPatterns.automatic_activation?.enabled === true, "prompt-patterns must enable automatic prompt enhancement.");
assert(promptPatterns.patterns?.some((pattern) => pattern.id === "codex-implementation"), "prompt-patterns must include a Codex implementation pattern.");
assert(promptPatterns.patterns?.some((pattern) => pattern.id === "agentic-coding-task"), "prompt-patterns must include an agentic coding task pattern.");
assert(promptPatterns.patterns?.some((pattern) => pattern.id === "code-simplification"), "prompt-patterns must include a code simplification pattern.");
assert(promptPatterns.patterns?.some((pattern) => pattern.id === "source-intake"), "prompt-patterns must include a source intake pattern.");
assert(promptPatterns.patterns?.some((pattern) => pattern.id === "zero-trust-gateway-roadmap"), "prompt-patterns must include a zero-trust gateway roadmap pattern.");
assert(promptPatterns.patterns?.some((pattern) => pattern.id === "visual-build"), "prompt-patterns must include a visual build pattern.");
assert(promptPatterns.patterns?.some((pattern) => pattern.id === "visual-polish-review"), "prompt-patterns must include a visual polish review pattern.");
assert(localPromptPatterns.patterns?.length === promptPatterns.patterns.length, "local .vnem prompt patterns must match the hosted install pack.");
assert(localTaskRubrics.rubrics?.length === taskRubrics.rubrics.length, "local .vnem task rubrics must match the hosted install pack.");
assert(operatingProtocol.includes("Perceive"), "operating-protocol.md must include the perception loop step.");
assert(operatingProtocol.includes("perception gate"), "operating-protocol.md must include the perception gate.");
assert(searchIndex.safety?.mode === "read-only-files", "search-index safety mode must be read-only-files.");
assert(searchIndex.safety?.executes_code === false, "search-index must declare that it does not execute code.");
assert(searchIndex.safety?.installs_packages === false, "search-index must declare that it does not install packages.");
assert(searchIndex.package_version === "1.0.1", "search-index must expose package_version 1.0.1.");
assert(searchIndex.release_version === "1.0.1", "search-index must expose release_version 1.0.1.");
assert(apiIndex.package_version === "1.0.1", "public API must expose package_version 1.0.1.");
assert(apiIndex.release_version === "1.0.1", "public API must expose release_version 1.0.1.");
assert(localSearchIndex.release_version === searchIndex.release_version, "local .vnem search index must match release_version.");
assert(searchIndex.decision_protocol?.auto_use === true, "search-index must tell agents to auto-use vnem.");
assert(searchIndex.decision_protocol?.user_trigger_required === false, "search-index must not require a special vnem trigger.");
assert(Array.isArray(searchIndex.operating_protocol?.loop), "search-index must expose the operating protocol.");
assert(searchIndex.task_rubrics?.some((rubric) => rubric.id === "frontend_ui"), "search-index must expose task rubrics.");
assert(searchIndex.task_rubrics?.some((rubric) => rubric.id === "aesthetic_experience"), "search-index must expose the aesthetic experience rubric.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("verification"), "decision protocol must expose task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("repo_sensing"), "decision protocol must expose repo sensing task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("coding_playbook"), "decision protocol must expose coding playbook task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("orchestration_pattern"), "decision protocol must expose orchestration pattern task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("worker_roles"), "decision protocol must expose worker role task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("shared_state"), "decision protocol must expose shared-state task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("reflection_loop"), "decision protocol must expose reflection-loop task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("precision_execution"), "decision protocol must expose precision execution task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("semantic_code_search"), "decision protocol must expose semantic code search task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("local_code_index"), "decision protocol must expose local code index task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("verification_tests"), "decision protocol must expose verification test task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("healing_loop"), "decision protocol must expose healing-loop task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("ephemeral_script"), "decision protocol must expose ephemeral script task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("documentation_fetched"), "decision protocol must expose documentation-fetched task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("patch_dry_run"), "decision protocol must expose patch dry-run task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("safe_terminal_command"), "decision protocol must expose safe terminal task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("quality_gate"), "decision protocol must expose quality gate task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("triple_check"), "decision protocol must expose triple-check task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("domain_balance"), "decision protocol must expose domain balance task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("tradeoff_policy"), "decision protocol must expose tradeoff policy task contract fields.");
assert(searchIndex.decision_protocol?.task_contract_fields?.includes("perception_gate"), "decision protocol must expose perception gate contract fields.");
assert(searchIndex.source_radar?.length === sourceRadar.sources.length, "search-index must expose source radar entries.");
assert(searchIndex.coding_protocol?.id === "vnem-coding-protocol", "search-index must expose coding_protocol metadata.");
assert(searchIndex.quality_contract?.id === "vnem-quality-contract", "search-index must expose quality_contract metadata.");
assert(searchIndex.orchestration_protocol?.id === "vnem-orchestration-protocol", "search-index must expose orchestration_protocol metadata.");
assert(searchIndex.precision_execution_protocol?.id === "vnem-precision-execution-protocol", "search-index must expose precision_execution_protocol metadata.");
assert(searchIndex.omniscient_self_healing_protocol?.id === "vnem-omniscient-self-healing-protocol", "search-index must expose omniscient_self_healing_protocol metadata.");
assert(searchIndex.install_guide?.id === "vnem-install-guide", "search-index must expose install_guide metadata.");
assert(searchIndex.coding_playbooks?.playbooks?.length === codingPlaybooks.playbooks.length, "search-index must expose coding playbooks.");
assert(searchIndex.design_architecture?.id === "vnem-design-architecture", "search-index must expose design_architecture metadata.");
assert(searchIndex.design_architecture?.guidance_classification?.watchlist?.some((item) => item.includes("WCAG 3")), "search-index must expose watchlist classification for WCAG 3/APCA.");
assert(searchIndex.visual_qa_protocol?.id === "vnem-visual-qa-protocol", "search-index must expose visual_qa_protocol metadata.");
assert(searchIndex.documents?.some((document) => document.id === "design-architecture:vnem-design-architecture"), "search-index must index design architecture.");
assert(searchIndex.documents?.some((document) => document.id === "visual-qa-protocol:vnem-visual-qa-protocol"), "search-index must index visual QA protocol.");
assert(searchIndex.documents?.some((document) => document.id === "coding-protocol:vnem-coding-protocol"), "search-index must index coding protocol.");
assert(searchIndex.documents?.some((document) => document.id === "quality-contract:vnem-quality-contract"), "search-index must index quality contract.");
assert(searchIndex.documents?.some((document) => document.id === "orchestration-protocol:vnem-orchestration-protocol"), "search-index must index orchestration protocol.");
assert(searchIndex.documents?.some((document) => document.id === "precision-execution-protocol:vnem-precision-execution-protocol"), "search-index must index precision execution protocol.");
assert(searchIndex.documents?.some((document) => document.id === "omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol"), "search-index must index omniscient self-healing protocol.");
assert(searchIndex.documents?.some((document) => document.id === "install-guide:vnem-install-guide"), "search-index must index install guide.");
assert(searchIndex.documents?.some((document) => document.id === "coding-playbook:feature-slice"), "search-index must index feature-slice coding playbook.");
assert(searchIndex.documents?.some((document) => document.id === "coding-playbook:bug-root-cause"), "search-index must index bug-root-cause coding playbook.");
assert(searchIndex.documents?.some((document) => document.kind === "source-radar"), "search-index must index source radar documents.");
assert(searchIndex.intent_routes?.["coding task"]?.read_first?.includes("coding-protocol:vnem-coding-protocol"), "search-index must route coding tasks to the coding protocol.");
assert(searchIndex.intent_routes?.["quality gate"]?.read_first?.includes("quality-contract:vnem-quality-contract"), "search-index must route quality gate tasks to the quality contract.");
assert(searchIndex.intent_routes?.["performance visuals"]?.read_first?.includes("quality-contract:vnem-quality-contract"), "search-index must route performance/visual tasks to the quality contract.");
assert(searchIndex.intent_routes?.["settings gui"]?.read_first?.includes("quality-contract:vnem-quality-contract"), "search-index must route settings GUI tasks to the quality contract.");
assert(searchIndex.intent_routes?.["multi agent orchestration"]?.read_first?.includes("orchestration-protocol:vnem-orchestration-protocol"), "search-index must route multi-agent tasks to orchestration protocol.");
assert(searchIndex.intent_routes?.["orchestrator worker"]?.read_first?.includes("orchestration-protocol:vnem-orchestration-protocol"), "search-index must route orchestrator-worker tasks to orchestration protocol.");
assert(searchIndex.intent_routes?.["split and merge"]?.read_first?.includes("orchestration-protocol:vnem-orchestration-protocol"), "search-index must route split-and-merge tasks to orchestration protocol.");
assert(searchIndex.intent_routes?.["reflection loop"]?.read_first?.includes("orchestration-protocol:vnem-orchestration-protocol"), "search-index must route reflection-loop tasks to orchestration protocol.");
assert(searchIndex.intent_routes?.["magentic coding"]?.read_first?.includes("orchestration-protocol:vnem-orchestration-protocol"), "search-index must route Magentic coding tasks to orchestration protocol.");
assert(searchIndex.intent_routes?.["precision execution"]?.read_first?.includes("precision-execution-protocol:vnem-precision-execution-protocol"), "search-index must route precision execution tasks to precision protocol.");
assert(searchIndex.intent_routes?.["surgical patch"]?.read_first?.includes("precision-execution-protocol:vnem-precision-execution-protocol"), "search-index must route surgical patch tasks to precision protocol.");
assert(searchIndex.intent_routes?.["dynamic documentation"]?.read_first?.includes("precision-execution-protocol:vnem-precision-execution-protocol"), "search-index must route dynamic documentation tasks to precision protocol.");
assert(searchIndex.intent_routes?.["stateful terminal"]?.read_first?.includes("precision-execution-protocol:vnem-precision-execution-protocol"), "search-index must route stateful terminal tasks to precision protocol.");
assert(searchIndex.intent_routes?.["semantic code search"]?.read_first?.includes("omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol"), "search-index must route semantic code search tasks to omniscient protocol.");
assert(searchIndex.intent_routes?.["local rag"]?.read_first?.includes("omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol"), "search-index must route local RAG tasks to omniscient protocol.");
assert(searchIndex.intent_routes?.["codebase embeddings"]?.read_first?.includes("omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol"), "search-index must route codebase embedding tasks to omniscient protocol.");
assert(searchIndex.intent_routes?.["proof engine"]?.read_first?.includes("omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol"), "search-index must route proof engine tasks to omniscient protocol.");
assert(searchIndex.intent_routes?.["self healing"]?.read_first?.includes("omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol"), "search-index must route self-healing tasks to omniscient protocol.");
assert(searchIndex.intent_routes?.["ephemeral scripting"]?.read_first?.includes("omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol"), "search-index must route ephemeral scripting tasks to omniscient protocol.");
assert(searchIndex.intent_routes?.["install vnem"]?.read_first?.includes("install-guide:vnem-install-guide"), "search-index must route install tasks to the install guide.");
assert(searchIndex.intent_routes?.["download vnem"]?.read_first?.includes("install-guide:vnem-install-guide"), "search-index must route download tasks to the install guide.");
assert(searchIndex.intent_routes?.["mcp setup"]?.read_first?.includes("install-guide:vnem-install-guide"), "search-index must route MCP setup tasks to the install guide.");
assert(searchIndex.intent_routes?.["mcp config"]?.read_first?.includes("install-guide:vnem-install-guide"), "search-index must route MCP config tasks to the install guide.");
assert(searchIndex.intent_routes?.["coding task"]?.read_first?.includes("coding-playbook:feature-slice"), "search-index must route coding tasks to feature playbooks.");
assert(searchIndex.intent_routes?.["web app"]?.read_first?.includes("coding-protocol:vnem-coding-protocol"), "search-index must route web app tasks to the coding protocol.");
assert(searchIndex.intent_routes?.["web app"]?.read_first?.includes("coding-playbook:web-app-rendered-quality"), "search-index must route web app tasks to rendered web app playbooks.");
assert(searchIndex.intent_routes?.["feature build"]?.read_first?.includes("coding-protocol:vnem-coding-protocol"), "search-index must route feature builds to the coding protocol.");
assert(searchIndex.intent_routes?.["bug fix"]?.read_first?.includes("coding-protocol:vnem-coding-protocol"), "search-index must route bug fixes to the coding protocol.");
assert(searchIndex.intent_routes?.["bug fix"]?.read_first?.includes("coding-playbook:bug-root-cause"), "search-index must route bug fixes to root-cause playbooks.");
assert(searchIndex.intent_routes?.["test first"]?.read_first?.includes("practice:evals"), "search-index must route test-first tasks to eval guidance.");
assert(searchIndex.intent_routes?.["test first"]?.read_first?.includes("coding-playbook:test-first-evidence"), "search-index must route test-first tasks to test evidence playbooks.");
assert(searchIndex.intent_routes?.["browser game"]?.read_first?.includes("practice:browser-games"), "search-index must route browser game tasks to browser game guidance.");
assert(searchIndex.intent_routes?.["visual polish"]?.read_first?.includes("practice:visual-experience"), "search-index must route visual polish tasks to perception guidance.");
assert(searchIndex.intent_routes?.["game feel"]?.read_first?.includes("practice:visual-experience"), "search-index must route game-feel tasks to perception guidance.");
assert(searchIndex.intent_routes?.["perception gate"]?.read_first?.includes("practice:visual-experience"), "search-index must route perception gate tasks to perception guidance.");
assert(searchIndex.intent_routes?.["visual qa"]?.read_first?.includes("visual-qa-protocol:vnem-visual-qa-protocol"), "search-index must route visual QA tasks to the visual QA protocol.");
assert(searchIndex.intent_routes?.["ui architecture"]?.read_first?.includes("design-architecture:vnem-design-architecture"), "search-index must route UI architecture tasks to design architecture.");
assert(searchIndex.intent_routes?.["bento dashboard"]?.read_first?.includes("design-architecture:vnem-design-architecture"), "search-index must route bento dashboard tasks to design architecture.");
assert(searchIndex.intent_routes?.["agent dashboard"]?.read_first?.includes("design-architecture:vnem-design-architecture"), "search-index must route agent dashboard tasks to design architecture.");
assert(searchIndex.intent_routes?.["web game"]?.read_first?.includes("practice:browser-games"), "search-index must route web game tasks to browser game guidance.");
assert(searchIndex.intent_routes?.["game accessibility"]?.read_first?.includes("practice:browser-games"), "search-index must route game accessibility tasks to browser game guidance.");
assert(searchIndex.intent_routes?.["game physics"]?.read_first?.includes("practice:browser-games"), "search-index must route game physics tasks to browser game guidance.");
assert(searchIndex.intent_routes?.["code simplification"]?.read_first?.includes("practice:code-simplification"), "search-index must route code simplification tasks to code simplification guidance.");
assert(searchIndex.intent_routes?.["mcp gateway"]?.read_first?.includes("practice:mcp-gateway-tool-routing"), "search-index must route MCP gateway tasks to gateway guidance.");
assert(searchIndex.intent_routes?.["one mcp"]?.read_first?.includes("practice:mcp-gateway-tool-routing"), "search-index must route one MCP tasks to gateway guidance.");
assert(searchIndex.intent_routes?.["tool routing"]?.read_first?.includes("practice:mcp-gateway-tool-routing"), "search-index must route tool routing tasks to gateway guidance.");
assert(searchIndex.intent_routes?.["memory bank"]?.read_first?.includes("practice:persistent-memory-context-files"), "search-index must route memory bank tasks to memory guidance.");
assert(searchIndex.intent_routes?.["roo code"]?.read_first?.includes("practice:ide-agent-selection"), "search-index must route Roo Code tasks to IDE agent guidance.");
assert(searchIndex.intent_routes?.["agent modes"]?.read_first?.includes("practice:ide-agent-selection"), "search-index must route agent mode tasks to IDE agent guidance.");
assert(searchIndex.intent_routes?.["codex config"]?.read_first?.includes("practice:codex-vnem-setup"), "search-index must route Codex config tasks to Codex/VNEM guidance.");
assert(searchIndex.intent_routes?.["claude md"]?.read_first?.includes("practice:persistent-memory-context-files"), "search-index must route CLAUDE.md tasks to memory guidance.");
assert(searchIndex.intent_routes?.["agent workspace"]?.read_first?.includes("practice:codex-vnem-setup"), "search-index must route agent workspace tasks to Codex/VNEM guidance.");
assert(searchIndex.intent_routes?.["source radar"]?.read_first?.includes("source:mcp-core-and-registry"), "search-index must route source radar tasks to source guidance.");
assert(searchIndex.intent_routes?.["benchmark evidence"]?.read_first?.includes("source:evaluation-and-observability"), "search-index must route benchmark evidence tasks to eval sources.");
assert(searchIndex.intent_routes?.["zero trust gateway"]?.read_first?.includes("practice:zero-trust-agent-gateway"), "search-index must route zero-trust gateway tasks to gateway guidance.");
assert(searchIndex.intent_routes?.["tool pinning"]?.read_first?.includes("source:agentic-gateway-security"), "search-index must route tool pinning tasks to gateway security sources.");
assert(apiIndex.decision_protocol?.auto_use === true, "public API must expose the decision protocol.");
assert(apiIndex.operating_protocol?.id === "vnem-operating-loop", "public API must expose the operating protocol.");
assert(apiIndex.quality_contract?.id === "vnem-quality-contract", "public API must expose the quality contract.");
assert(apiIndex.orchestration_protocol?.id === "vnem-orchestration-protocol", "public API must expose the orchestration protocol.");
assert(apiIndex.precision_execution_protocol?.id === "vnem-precision-execution-protocol", "public API must expose the precision execution protocol.");
assert(apiIndex.omniscient_self_healing_protocol?.id === "vnem-omniscient-self-healing-protocol", "public API must expose the omniscient self-healing protocol.");
assert(apiIndex.install_guide?.id === "vnem-install-guide", "public API must expose the install guide.");
assert(apiIndex.coding_protocol?.id === "vnem-coding-protocol", "public API must expose the coding protocol.");
assert(apiIndex.coding_playbooks?.playbooks?.some((playbook) => playbook.id === "failure-recovery"), "public API must expose coding playbooks.");
assert(apiIndex.task_rubrics?.some((rubric) => rubric.id === "agent_tooling"), "public API must expose task rubrics.");
assert(apiIndex.task_rubrics?.some((rubric) => rubric.id === "agentic_coding"), "public API must expose agentic coding rubrics.");
assert(apiIndex.task_rubrics?.some((rubric) => rubric.id === "aesthetic_experience"), "public API must expose aesthetic task rubrics.");
assert(apiIndex.source_radar?.length === searchIndex.source_radar.length, "public API must expose source radar entries.");
assert(apiIndex.design_architecture?.id === "vnem-design-architecture", "public API must expose design architecture metadata.");
assert(apiIndex.visual_qa_protocol?.id === "vnem-visual-qa-protocol", "public API must expose visual QA protocol metadata.");
assert(apiIndex.intent_routes?.["browser game"]?.read_first?.includes("practice:browser-games"), "public API must expose intent routes.");
assert(apiIndex.intent_routes?.["web app"]?.read_first?.includes("coding-protocol:vnem-coding-protocol"), "public API must expose web app coding routes.");
assert(apiIndex.intent_routes?.["backend api"]?.read_first?.includes("coding-playbook:api-data-contract"), "public API must expose backend API coding routes.");
assert(apiIndex.intent_routes?.["web game"]?.read_first?.includes("practice:browser-games"), "public API must expose web game routes.");
assert(apiIndex.intent_routes?.["code simplification"]?.read_first?.includes("practice:code-simplification"), "public API must expose code simplification routes.");
assert(searchIndex.documents?.length > 0, "search-index must include documents.");
for (const entryId of ["entry:phaser", "entry:pixijs", "entry:three-js", "entry:babylon-js", "entry:excalibur-js", "entry:kaplay", "entry:playcanvas-engine", "entry:matter-js", "entry:rapier-js"]) {
  assert(searchIndex.documents?.some((document) => document.id === entryId), `search-index must include ${entryId}.`);
}
assert(localSearchIndex.documents?.length === searchIndex.documents.length, "local .vnem search index must match the hosted install pack.");
assert(localSearchIndex.source_radar?.length === searchIndex.source_radar.length, "local .vnem source radar metadata must match the hosted install pack.");
assert(localSearchIndex.coding_playbooks?.playbooks?.length === searchIndex.coding_playbooks.playbooks.length, "local .vnem search index must match coding playbook metadata.");

for (const query of ["coding task", "app build", "web app", "feature build", "bug fix", "test first", "repo understanding", "large change", "backend api", "failure recovery", "root cause", "holistic excellence", "triple check", "performance visuals", "playability", "quality gate", "production ready", "settings gui", "intelligent tradeoff", "multi agent orchestration", "orchestrator worker", "split and merge", "reflection loop", "magentic coding", "shared state", "precision execution", "surgical patch", "apply diff patch", "dynamic documentation", "fetch documentation", "stateful terminal", "safe terminal", "destructive editing", "semantic code search", "local rag", "codebase embeddings", "proof engine", "self healing", "verification tests", "healing loop", "ephemeral scripting", "dynamic tool generation", "scale blindness", "silent logic failure", "install vnem", "download vnem", "mcp setup", "mcp config", "better ui", "aesthetic experience", "visual polish", "visual qa", "screenshot polish", "game feel", "reward feedback", "sound design", "perception gate", "ui architecture", "bento dashboard", "agent dashboard", "conversational ui", "motion design", "design tokens", "dark mode", "glassmorphism", "typography", "layout spacing", "optical alignment", "browser game", "web game", "html5 game", "canvas game", "2d game", "3d game", "game engine", "game ui", "game accessibility", "game physics", "game testing", "canvas performance", "faster search", "agent payments", "code review", "code simplification", "code compaction", "minimal code", "professional code", "refactor", "dead code", "memory", "evals", "prompt engineering", "codex prompt", "mcp gateway", "one mcp", "tool routing", "memory bank", "roo code", "agent modes", "codex config", "claude md", "agent workspace", "source radar", "research layer", "source intake", "benchmark evidence", "pre execution gateway", "zero trust gateway", "tool pinning", "package firewall", "ast indexer", "codex vs claude", "gemini agent", "ai model selection", "agent upgrade"]) {
  const results = search(searchIndex, query);
  assert(results.length > 0, `search-index must return at least one result for "${query}".`);
  assert(results[0].rank_score >= results.at(-1).rank_score, `search results for "${query}" must be rank sorted.`);
  if (["browser game", "web game", "html5 game", "canvas game", "2d game", "3d game", "game engine", "game accessibility", "game physics", "game testing", "canvas performance"].includes(query)) {
    assert(results[0].id === "practice:browser-games", `search results for "${query}" should lead with browser game guidance.`);
  }
  if (["coding task", "app build", "web app", "feature build", "bug fix", "test first", "repo understanding", "large change"].includes(query)) {
    assert(results.some((result) => result.id === "coding-protocol:vnem-coding-protocol"), `search results for "${query}" should include coding protocol guidance.`);
    assert(results.some((result) => result.id === "practice:agentic-coding-execution"), `search results for "${query}" should include agentic coding execution guidance.`);
    assert(results.some((result) => result.id.startsWith("coding-playbook:")), `search results for "${query}" should include a coding playbook.`);
  }
  if (["backend api", "failure recovery", "root cause"].includes(query)) {
    assert(results.some((result) => result.id.startsWith("coding-playbook:")), `search results for "${query}" should include a coding playbook.`);
  }
  if (["holistic excellence", "triple check", "performance visuals", "playability", "quality gate", "production ready", "settings gui", "intelligent tradeoff"].includes(query)) {
    assert(
      results.some((result) => result.id === "quality-contract:vnem-quality-contract" || result.id === "practice:holistic-excellence-intelligent-tradeoffs"),
      `search results for "${query}" should include the quality contract or holistic excellence guidance.`
    );
  }
  if (["multi agent orchestration", "orchestrator worker", "split and merge", "reflection loop", "magentic coding", "shared state"].includes(query)) {
    assert(
      results.some((result) => result.id === "orchestration-protocol:vnem-orchestration-protocol" || result.id === "practice:multi-agent-orchestration-reflection"),
      `search results for "${query}" should include orchestration protocol or multi-agent guidance.`
    );
  }
  if (["precision execution", "surgical patch", "apply diff patch", "dynamic documentation", "fetch documentation", "stateful terminal", "safe terminal", "destructive editing"].includes(query)) {
    assert(
      results.some((result) => result.id === "precision-execution-protocol:vnem-precision-execution-protocol" || result.id === "practice:precision-execution-dynamic-knowledge"),
      `search results for "${query}" should include precision execution guidance.`
    );
  }
  if (["semantic code search", "local rag", "codebase embeddings", "proof engine", "self healing", "verification tests", "healing loop", "ephemeral scripting", "dynamic tool generation", "scale blindness", "silent logic failure"].includes(query)) {
    assert(
      results.some((result) => result.id === "omniscient-self-healing-protocol:vnem-omniscient-self-healing-protocol" || result.id === "practice:omniscient-context-self-healing"),
      `search results for "${query}" should include omniscient context and self-healing guidance.`
    );
  }
  if (["install vnem", "download vnem", "mcp setup", "mcp config"].includes(query)) {
    assert(results.some((result) => result.id === "install-guide:vnem-install-guide"), `search results for "${query}" should include the install guide.`);
  }
  if (["aesthetic experience", "visual polish", "game ui", "game feel", "reward feedback", "sound design", "perception gate"].includes(query)) {
    assert(results[0].id === "practice:visual-experience", `search results for "${query}" should lead with visual perception guidance.`);
  }
  if (["visual qa", "screenshot polish"].includes(query)) {
    assert(results.some((result) => result.id === "visual-qa-protocol:vnem-visual-qa-protocol"), `search results for "${query}" should include visual QA protocol guidance.`);
  }
  if (["ui architecture", "bento dashboard", "agent dashboard", "conversational ui", "motion design", "design tokens", "dark mode", "glassmorphism", "typography", "layout spacing", "optical alignment"].includes(query)) {
    assert(results.some((result) => result.id === "design-architecture:vnem-design-architecture"), `search results for "${query}" should include design architecture guidance.`);
  }
  if (["code simplification", "code compaction", "minimal code", "professional code", "refactor", "dead code"].includes(query)) {
    assert(results[0].id === "practice:code-simplification", `search results for "${query}" should lead with code simplification guidance.`);
  }
  if (["mcp gateway", "one mcp", "tool routing"].includes(query)) {
    assert(results[0].id === "practice:mcp-gateway-tool-routing", `search results for "${query}" should lead with MCP gateway guidance.`);
  }
  if (["memory bank", "claude md"].includes(query)) {
    assert(results[0].id === "practice:persistent-memory-context-files", `search results for "${query}" should lead with persistent memory guidance.`);
  }
  if (["agent workspace", "codex config"].includes(query)) {
    assert(["practice:codex-vnem-setup", "practice:mcp-gateway-tool-routing"].includes(results[0].id), `search results for "${query}" should lead with agent workspace or Codex guidance.`);
  }
  if (["source radar", "research layer", "source intake", "benchmark evidence"].includes(query)) {
    assert(["source-radar", "best-practice"].includes(results[0].kind), `search results for "${query}" should lead with source guidance.`);
  }
  if (["pre execution gateway", "zero trust gateway", "tool pinning", "package firewall", "ast indexer"].includes(query)) {
    assert(["best-practice", "source-radar", "task-rubric"].includes(results[0].kind), `search results for "${query}" should lead with gateway guidance.`);
  }
  if (["codex vs claude", "gemini agent", "ai model selection", "agent upgrade"].includes(query)) {
    assert(["best-practice", "task-rubric"].includes(results[0].kind), `search results for "${query}" should lead with model or agent guidance.`);
  }
}

if (failures.length > 0) {
  console.error(`Install pack tests failed with ${failures.length} issue(s):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Install pack tests passed for ${searchIndex.documents.length} search documents.`);
