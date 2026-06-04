import { humanize, vectorLabel } from "./dashboardFormat.js";
import { derivePipelineVerdict } from "./pipelineVerdicts.js";

const BASE_BRANCH = "main";
const BRANCH_PREFIX = "vnem-giving";
const DEFAULT_QUERY = "VNEM dashboard AI mission engine";
const TERMINAL_REVIEW_STATUSES = new Set(["staged_for_review", "completed"]);

export function deriveImprovementMission({ telemetry = {}, summary = null, branchPreview = null } = {}) {
  const telemetryMode = telemetry.status === "connected" ? "live" : "offline-or-sample";
  const missionSource = telemetry.mission ?? summary?.mission ?? {};
  const query = normalizeMissionQuery(missionSource.query ?? summary?.mission?.query ?? DEFAULT_QUERY);
  const slug = slugify(query);
  const candidates = normalizeMissionCandidates({ telemetry, summary });
  const verdictSummary = countVerdicts(candidates);
  const allowedCandidates = candidates.filter((candidate) => candidate.givingEligible && !candidate.reviewRequiredForGiving);
  const reviewableCandidates = candidates.filter((candidate) => candidate.givingEligible && candidate.reviewRequiredForGiving && candidate.userReviewSatisfied);
  const includedCandidates = [...allowedCandidates, ...reviewableCandidates];
  const blockedCandidateIds = candidates
    .filter((candidate) => candidate.verdict === "quarantine" || candidate.verdict === "blocked" || !candidate.givingEligible)
    .map((candidate) => candidate.id);
  const hasUnsafeBlocked = verdictSummary.quarantine > 0 || verdictSummary.blocked > 0;
  const status = missionStatus({ telemetryMode, candidates, verdictSummary, includedCandidates });
  const currentStage = missionStage(status, candidates);
  const givingBranch = applyBranchPreview(buildGivingBranch({ slug, includedCandidates, blockedCandidateIds, excludedCandidates: candidates.filter((candidate) => !includedCandidates.includes(candidate)) }), branchPreview);
  const logs = buildMissionLogs({ telemetry, candidates, givingBranch, telemetryMode });
  const nextAction = buildNextAction({ status, telemetryMode, includedCandidates, hasUnsafeBlocked, verdictSummary, givingBranch });

  return {
    id: `mission-${slug}`,
    title: missionSource.title ?? `Improve ${humanReadableQuery(query)}`,
    goal: missionSource.goal ?? "Make Research AI produce safe, reviewable, branch-ready VNEM improvements without touching main.",
    status,
    priority: missionSource.priority ?? (hasUnsafeBlocked ? "high" : "normal"),
    currentStage,
    telemetryMode,
    currentSource: missionSource.source ?? (telemetryMode === "live" ? "live-app-server" : "dashboard-summary"),
    researchTargets: buildResearchTargets(missionSource, candidates),
    candidates,
    verdictSummary,
    givingBranch,
    nextAction,
    controls: buildControls({ telemetryMode, givingBranch, includedCandidates }),
    logs
  };
}

export function buildGivingBranchContract({ missionId, branchName, includedCandidates = [], verdicts = [] } = {}) {
  const safeVerdicts = verdicts.filter(Boolean);
  const blocked = safeVerdicts.filter((verdict) => ["quarantine", "blocked"].includes(verdict.verdict ?? verdict));
  return {
    branchName: normalizeBranchName(branchName ?? `${BRANCH_PREFIX}/${slugify(missionId ?? "vnem-improvement")}`),
    baseBranch: BASE_BRANCH,
    sourceMissionId: missionId ?? null,
    includedCandidates: includedCandidates.map((candidate) => typeof candidate === "string" ? candidate : candidate.id).filter(Boolean),
    protectionVerdicts: safeVerdicts.map((verdict) => verdict.verdict ?? verdict),
    changedFiles: [],
    validationCommands: [
      "npm run test:dashboard-missions",
      "npm run test:dashboard-verdicts",
      "npm run test:dashboard-system",
      "npm run dashboard:build"
    ],
    validationStatus: "not-run",
    commitHash: null,
    pushStatus: "not-pushed",
    reviewStatus: blocked.length > 0 ? "blocked-by-protection" : "waiting-for-manual-review",
    rollbackNotes: [
      "Giving AI branch work starts from main and stays off main until manual review.",
      "Do not push if validation fails, unrelated files are present, or quarantine/blocked candidates are included."
    ]
  };
}

function normalizeMissionCandidates({ telemetry = {}, summary = null }) {
  const live = (telemetry.activeIngestions ?? []).map((item) => normalizeCandidate(item, "live-ingestion"));
  const findings = (summary?.findings ?? []).map((item) => normalizeCandidate(item, "dashboard-finding"));
  const byId = new Map();
  for (const candidate of [...findings, ...live]) {
    byId.set(candidate.id, candidate);
  }
  return [...byId.values()];
}

function normalizeCandidate(item, origin) {
  const verdict = derivePipelineVerdict(item);
  const id = String(item.id ?? item.repository?.id ?? item.title ?? `${origin}-candidate`);
  const userReviewSatisfied = Boolean(item.review_satisfied || item.maintainer_review_satisfied || item.approved_dispatch || item.status === "completed");
  const staged = item.staged_dispatch ?? null;
  const approved = item.approved_dispatch ?? null;
  return {
    id,
    title: item.title ?? item.repository?.full_name ?? "Untitled VNEM improvement candidate",
    sourceRoute: item.source_route ?? item.repository?.source_route ?? "unknown-route",
    sourceUrl: item.source_url ?? item.repository?.html_url ?? null,
    origin,
    status: item.status ?? item.recommended_action ?? "candidate",
    stage: item.current_agent ?? verdict.stageKey,
    summary: item.signal_summary ?? item.latest_event?.message ?? item.repository?.description ?? "Source-backed candidate awaiting pipeline classification.",
    verdict: verdict.verdict,
    verdictLabel: verdict.shortLabel,
    verdictTone: verdict.tone,
    verdictReason: verdict.reason,
    nextAction: verdict.nextAction,
    givingEligible: verdict.givingEligible,
    reviewRequiredForGiving: verdict.userReviewRequired,
    userReviewSatisfied,
    trustScore: verdict.trustScore,
    threatScore: verdict.threatScore,
    stagedDispatch: staged ? { fileName: staged.file_name ?? staged.fileName ?? null, generatedAt: staged.generated_at ?? null } : null,
    approvedDispatch: approved ? { fileName: approved.file_name ?? approved.fileName ?? null, approvedAt: approved.approved_at ?? null } : null,
    branchReady: verdict.givingEligible && (!verdict.userReviewRequired || userReviewSatisfied),
    raw: item
  };
}

function countVerdicts(candidates) {
  return candidates.reduce((counts, candidate) => {
    if (candidate.verdict === "allow") counts.allow += 1;
    else if (candidate.verdict === "needs-review") counts.needsReview += 1;
    else if (candidate.verdict === "quarantine") counts.quarantine += 1;
    else if (candidate.verdict === "blocked") counts.blocked += 1;
    return counts;
  }, { allow: 0, needsReview: 0, quarantine: 0, blocked: 0 });
}

function missionStatus({ telemetryMode, candidates, verdictSummary, includedCandidates }) {
  if (candidates.length === 0) return telemetryMode === "live" ? "researching" : "idle";
  if (includedCandidates.length > 0) return candidates.some((candidate) => TERMINAL_REVIEW_STATUSES.has(candidate.status)) ? "ready-for-giving" : "protecting";
  if (verdictSummary.quarantine + verdictSummary.blocked === candidates.length) return "blocked";
  if (verdictSummary.needsReview > 0) return "protecting";
  return "researching";
}

function missionStage(status, candidates) {
  if (["blocked", "protecting"].includes(status)) return "protection";
  if (["ready-for-giving", "branch-preparing"].includes(status)) return "giving";
  if (["branch-pushed", "review-needed"].includes(status)) return "review";
  if (candidates.length > 0) return "protection";
  return "research";
}

function buildGivingBranch({ slug, includedCandidates, blockedCandidateIds, excludedCandidates = [] }) {
  const contract = buildGivingBranchContract({
    missionId: `mission-${slug}`,
    branchName: `${BRANCH_PREFIX}/${slug}`,
    includedCandidates,
    verdicts: includedCandidates.map((candidate) => candidate.verdict)
  });
  const blockedByProtection = includedCandidates.length === 0 && blockedCandidateIds.length > 0;
  return {
    name: contract.branchName,
    base: contract.baseBranch,
    status: blockedByProtection ? "blocked-by-protection" : includedCandidates.length > 0 ? "planned" : "not-created",
    commit: null,
    validation: contract.validationStatus,
    validationCommands: contract.validationCommands,
    pushStatus: contract.pushStatus,
    reviewStatus: blockedByProtection ? "blocked-by-protection" : contract.reviewStatus,
    includedCandidates: contract.includedCandidates,
    blockedCandidateIds,
    changedFiles: contract.changedFiles,
    rollbackNotes: contract.rollbackNotes,
    mainProtected: true,
    backendAction: "preview-available",
    previewStatus: "not-requested",
    requestPayload: {
      sourceMissionId: contract.sourceMissionId,
      missionTitle: `Improve ${slug.replace(/-/g, " ")}`,
      branchName: contract.branchName,
      baseBranch: contract.baseBranch,
      includedCandidates: includedCandidates.map(toBranchCandidate),
      excludedCandidates: excludedCandidates.map(toBranchCandidate),
      validationCommands: contract.validationCommands
    }
  };
}

function applyBranchPreview(branch, preview) {
  if (!preview) return branch;
  return {
    ...branch,
    status: preview.ok ? "preview-ready" : "preview-rejected",
    validation: preview.validationStatus ?? branch.validation,
    pushStatus: preview.pushStatus ?? branch.pushStatus,
    reviewStatus: preview.reviewStatus ?? branch.reviewStatus,
    commit: preview.commitHash ?? branch.commit,
    previewStatus: preview.ok ? "ready" : "rejected",
    backendAction: preview.ok ? "prepare-available" : "blocked-by-backend-preview",
    error: preview.ok ? null : preview.message ?? preview.error_code ?? "Branch preview rejected",
    requiredChecks: preview.requiredChecks ?? [],
    blockedCandidateIds: preview.blockedCandidateIds ?? branch.blockedCandidateIds
  };
}

function toBranchCandidate(candidate) {
  return {
    id: candidate.id,
    title: candidate.title,
    verdict: candidate.verdict,
    reviewSatisfied: candidate.userReviewSatisfied,
    sourceRoute: candidate.sourceRoute,
    sourceUrl: candidate.sourceUrl
  };
}

function buildResearchTargets(missionSource, candidates) {
  const routes = new Set();
  if (missionSource.vector) routes.add(vectorRouteFromValue(missionSource.vector));
  for (const candidate of candidates) routes.add(candidate.sourceRoute);
  if (routes.size === 0) routes.add("github-search");
  return [...routes].map((route) => ({ route, label: routeLabel(route), status: candidates.some((candidate) => candidate.sourceRoute === route) ? "candidate-found" : "planned" }));
}

function buildMissionLogs({ telemetry = {}, candidates, givingBranch, telemetryMode }) {
  const logs = [];
  const events = telemetry.events ?? [];
  for (const event of events.slice(-4)) {
    logs.push({ stage: event.agent_stage ?? event.type ?? "telemetry", message: event.message ?? "Telemetry event", timestamp: event.timestamp ?? null, tone: "quiet" });
  }
  for (const candidate of candidates.slice(0, 5)) {
    logs.push({
      stage: candidate.stage,
      message: `${candidate.title}: ${candidate.verdictLabel} — ${candidate.verdictReason}`,
      timestamp: candidate.raw?.latest_event?.timestamp ?? candidate.raw?.generated_at ?? null,
      tone: candidate.verdictTone
    });
  }
  if (givingBranch.status === "planned") {
    logs.push({ stage: "giving", message: `Safe branch planned: ${givingBranch.name} from main. Manual review required before main.`, timestamp: null, tone: "review" });
  }
  if (logs.length === 0) {
    logs.push({ stage: "research", message: telemetryMode === "live" ? "Research AI is ready to accept a dashboard target." : "Demo/offline state is honest: start the local app server for live research telemetry.", timestamp: null, tone: "quiet" });
  }
  return logs.slice(-6).reverse();
}

function buildNextAction({ status, telemetryMode, includedCandidates, hasUnsafeBlocked, verdictSummary, givingBranch }) {
  if (status === "idle") return "Start a focused research target from Manual Override; branch actions stay planned until live backend support exists.";
  if (status === "blocked") return "Protection AI isolated every candidate; do not prepare a Giving AI branch.";
  if (hasUnsafeBlocked && includedCandidates.length === 0) return "Audit quarantined/blocked candidates before Giving AI can continue.";
  if (verdictSummary.needsReview > 0 && includedCandidates.length === 0) return "Resolve needs-review questions before Giving AI prepares branch-ready work.";
  if (includedCandidates.length > 0) return `Review planned safe branch ${givingBranch.name}; backend branch creation is planned and main remains protected.`;
  return telemetryMode === "live" ? "Wait for Research AI and Protection AI to finish candidate classification." : "Start live telemetry to turn sample findings into an active mission.";
}

function buildControls({ telemetryMode, givingBranch, includedCandidates }) {
  return [
    {
      key: "start-research",
      label: "Start research mission",
      enabled: false,
      state: telemetryMode === "live" ? "available-in-target-console" : "planned-disabled",
      detail: telemetryMode === "live" ? "Use Manual Override above to deploy a target through the existing app-server route." : "Manual Override requires the local app server; this dashboard state is sample/offline."
    },
    {
      key: "run-protection",
      label: "Run Protection review",
      enabled: false,
      state: "automatic-currently",
      detail: "Protection AI verdicts are derived from current telemetry/candidate metadata. Manual rerun endpoint is planned."
    },
    {
      key: "preview-branch",
      label: "Preview branch plan",
      enabled: telemetryMode === "live" && includedCandidates.length > 0,
      state: includedCandidates.length > 0 ? "backend-preview-available" : "blocked-or-waiting",
      detail: givingBranch.status === "planned" || givingBranch.status === "preview-ready"
        ? `Ask the local app server to validate the branch plan for ${givingBranch.name}; preview does not mutate git.`
        : "Preview is unavailable until Protection AI leaves at least one allowed or reviewed candidate."
    },
    {
      key: "prepare-branch",
      label: "Prepare Giving branch",
      enabled: false,
      state: givingBranch.previewStatus === "ready" ? "requires-explicit-confirmation" : "preview-required",
      detail: givingBranch.previewStatus === "ready"
        ? `Backend preview passed. Prepare still requires explicit confirmation, clean main, validation, and no push to main.`
        : "Run branch preview first. Prepare is disabled in the dashboard until explicit confirmation support is added."
    },
    {
      key: "manual-review",
      label: "Manual review / merge",
      enabled: false,
      state: "main-protected",
      detail: "Main is protected. Research-derived Giving AI output must wait for manual review before any merge."
    }
  ];
}

function normalizeMissionQuery(value) {
  const text = String(value ?? "").trim();
  return text || DEFAULT_QUERY;
}

function humanReadableQuery(query) {
  return normalizeMissionQuery(query).replace(/\s+(or|and)\s+/gi, " ").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54)
    .replace(/-+$/g, "");
  return slug || "vnem-improvement";
}

function normalizeBranchName(value) {
  const text = String(value ?? "").trim();
  if (text.startsWith(`${BRANCH_PREFIX}/`)) return text;
  return `${BRANCH_PREFIX}/${slugify(text)}`;
}

function vectorRouteFromValue(value) {
  const map = { github: "github-search", npm: "npm-search", mcp: "mcp-registry" };
  return map[value] ?? String(value ?? "github-search");
}

function routeLabel(route) {
  if (route === "github-search") return vectorLabel("github");
  if (route === "npm-search") return vectorLabel("npm");
  if (route === "mcp-registry") return vectorLabel("mcp");
  return humanize(route);
}
