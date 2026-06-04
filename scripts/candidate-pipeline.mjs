#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const REVIEW_DECISIONS = ["approve-for-giving", "keep-reviewing", "reject-low-signal", "quarantine", "block"];
const allowedLicenses = new Set(["mit", "apache-2.0", "bsd-2-clause", "bsd-3-clause", "isc", "mpl-2.0", "unlicense"]);
const reviewFlags = new Set(["license-not-asserted", "missing-license", "unknown-license", "needs-primary-source", "weak-source", "social-signal", "incomplete-metadata", "unclear-permissions", "unknown-install-surface", "low-confidence", "readme-review-unavailable"]);
const quarantineFlags = new Set(["binary-download", "unknown-binary", "download-button", "sensitive-permissions", "privileged-command", "postinstall-script", "lifecycle-script", "installer-required", "shell-pipe-install", "obfuscated-code", "network-execution", "shell-exec-node", "install-lifecycle-script", "download-pipe-shell", "remote-code-fetch", "dynamic-eval", "powershell-encoded"]);
const blockedFlags = new Set(["malware", "virus", "credential-theft", "secret-collection", "token-exfiltration", "phishing", "scam", "exploit-chain", "destructive-command", "hidden-persistence", "ransomware", "keylogger", "unsafe-automation", "secret-exfiltration-language"]);

export function enrichCandidate(candidate = {}, options = {}) {
  const repository = candidate.repository ?? candidate;
  const text = [candidate.title, candidate.source_url, repository.html_url, repository.description, repository.audit_text, JSON.stringify(repository.package ?? {})].filter(Boolean).join("\n").toLowerCase();
  const sourceUrl = candidate.source_url ?? repository.html_url ?? repository.package?.links?.repository ?? repository.package?.links?.npm ?? null;
  const sourceRoute = candidate.source_route ?? repository.source_route ?? routeFromUrl(sourceUrl);
  const sourceType = repository.kind ?? sourceTypeFromRoute(sourceRoute, sourceUrl);
  const sourceStrength = sourceStrengthFor({ sourceRoute, sourceUrl, repository });
  const license = normalizeLicense(repository.license?.spdx_id ?? repository.license ?? repository.package?.license ?? candidate.license);
  const flags = unique([...(candidate.risk_flags ?? []), ...(candidate.protection_report?.flags ?? []), ...(candidate.repository_review?.flags ?? []), ...(options.protectionFlags ?? []), ...unsafeTextFlags(text)].map(slugify).filter(Boolean));
  const duplicateKey = duplicateKeyFor({ sourceUrl, repository, title: candidate.title });
  const alreadyIndexed = Boolean(candidate.already_indexed || candidate.alreadyIndexed || options.indexedKeys?.has?.(duplicateKey) || options.indexedKeys?.has?.(String(repository.full_name ?? "").toLowerCase()));
  const duplicate = Boolean(options.seenKeys?.has?.(duplicateKey) || candidate.duplicate || candidate.duplicate_candidate);
  options.seenKeys?.add?.(duplicateKey);
  const hasReadme = Boolean(candidate.protection_report?.fetched_assets?.some?.((asset) => /readme/i.test(asset.label ?? "")) || repository.has_readme || /readme/i.test(text));
  const hasInstallScript = /"(?:preinstall|install|postinstall|prepare)"\s*:/.test(text);
  const hasPostinstall = /"postinstall"\s*:/.test(text);
  const hasBinaryDownload = flags.some((flag) => ["binary-download", "unknown-binary", "download-button"].includes(flag)) || /\b(binary|download exe|\.exe|\.msi|\.dmg)\b/.test(text);
  const hasPrivilegedCommands = flags.includes("privileged-command") || /\b(sudo|run as administrator|set-executionpolicy|chmod\s+\+x|reg\s+add)\b/i.test(text);
  const hasSecretKeywords = flags.some((flag) => blockedFlags.has(flag)) || /\b(token|password|private[_ -]?key|seed phrase|credential|secret)\b/.test(text);
  const hasUnsafeCommandHints = flags.some((flag) => quarantineFlags.has(flag)) || /\b(curl|wget)\b[\s\S]{0,120}\|\s*(sh|bash|powershell|pwsh)|\beval\s*\(|\bchild_process\b/.test(text);
  const primarySourceFound = Boolean(sourceUrl && (/^https:\/\/github\.com\//i.test(sourceUrl) || sourceRoute === "github-search" || sourceRoute === "github-releases" || sourceRoute === "npm-search" || sourceRoute === "mcp-registry"));
  const stars = numberOrZero(repository.stargazers_count ?? repository.stars ?? candidate.stars);
  const forks = numberOrZero(repository.forks_count ?? repository.forks ?? candidate.forks);
  const maturityScore = clamp(Math.round(Math.min(35, Math.log10(stars + 1) * 18) + Math.min(20, Math.log10(forks + 1) * 10) + (hasReadme ? 15 : 0) + (license ? 20 : 0) + (repository.updated_at || repository.pushed_at ? 10 : 0)), 0, 100);
  const relevanceScore = clamp(Math.round(candidate.trust_score ?? candidate.repository_review?.trust_score ?? (repository.package?.score?.final ?? 0.5) * 100), 0, 100);
  let riskScore = clamp(Math.round(candidate.threat_score ?? candidate.repository_review?.risk_score ?? candidate.protection_report?.threat_score ?? options.threatScore ?? 0), 0, 100);
  riskScore += flags.filter((flag) => reviewFlags.has(flag)).length * 5 + flags.filter((flag) => quarantineFlags.has(flag)).length * 18 + flags.filter((flag) => blockedFlags.has(flag)).length * 45;
  if (hasUnsafeCommandHints) riskScore += 15;
  if (hasSecretKeywords) riskScore += 20;
  riskScore = clamp(riskScore, 0, 100);
  const trustScore = clamp(Math.round((sourceStrength * 0.35) + (maturityScore * 0.35) + (relevanceScore * 0.3) - riskScore * 0.25 - (alreadyIndexed ? 12 : 0) - (duplicate ? 14 : 0)), 0, 100);
  const enrichmentReasons = [];
  if (primarySourceFound) enrichmentReasons.push("primary/source-backed route found");
  if (license) enrichmentReasons.push(`license: ${license}`);
  if (alreadyIndexed) enrichmentReasons.push("already indexed; hidden from main queue");
  if (duplicate) enrichmentReasons.push("duplicate candidate grouped");
  if (hasUnsafeCommandHints) enrichmentReasons.push("unsafe command/install hints detected");
  if (hasSecretKeywords) enrichmentReasons.push("secret/credential keywords detected");
  return { id: String(candidate.id ?? repository.id ?? duplicateKey), title: candidate.title ?? repository.full_name ?? repository.name ?? "Untitled candidate", sourceUrl, sourceRoute, sourceType, sourceStrength, primarySourceFound, repositoryUrl: repository.html_url ?? sourceUrl, packageName: repository.package?.name ?? (sourceType === "npm_package" ? repository.name : null), license, stars, forks, lastUpdated: repository.updated_at ?? repository.pushed_at ?? repository.package?.date ?? null, language: repository.language ?? null, hasReadme, hasInstallScript, hasPostinstall, hasBinaryDownload, hasPrivilegedCommands, hasSecretKeywords, hasUnsafeCommandHints, duplicateKey, duplicate, alreadyIndexed, maturityScore, relevanceScore, trustScore, riskScore, riskFlags: flags, enrichmentReasons };
}

export function classifyCandidate(candidate = {}, enrichment = enrichCandidate(candidate)) {
  const flags = new Set((enrichment.riskFlags ?? []).map(slugify));
  const reasons = [];
  if ([...flags].some((flag) => blockedFlags.has(flag)) || (enrichment.hasSecretKeywords && enrichment.riskScore >= 60)) return verdict("blocked", enrichment, ["blocked indicators: credential theft, malware, secret collection, destructive behavior, or unsafe automation"]);
  if ([...flags].some((flag) => quarantineFlags.has(flag)) || enrichment.hasBinaryDownload || enrichment.hasPrivilegedCommands || enrichment.hasPostinstall || (enrichment.hasUnsafeCommandHints && enrichment.riskScore >= 35)) return verdict("quarantine", enrichment, ["quarantine indicators: binary/download/install lifecycle, privileged command, obfuscation, or network execution concern"]);
  if (enrichment.alreadyIndexed) reasons.push("already indexed");
  if (enrichment.duplicate) reasons.push("duplicate candidate");
  if (!enrichment.primarySourceFound) reasons.push("primary source not confirmed");
  if (!enrichment.license || !allowedLicenses.has(enrichment.license)) reasons.push("license missing or not recognized as low-risk");
  if (enrichment.sourceStrength < 65) reasons.push("source route is weak or social-only");
  if (enrichment.trustScore < 70) reasons.push("trust score below auto-allow threshold");
  if (enrichment.riskScore > 24) reasons.push("risk score above auto-allow threshold");
  if ([...flags].some((flag) => reviewFlags.has(flag))) reasons.push("review flags require maintainer confirmation");
  if (reasons.length > 0) return verdict("needs-review", enrichment, unique(reasons));
  return verdict("allow", enrichment, ["strong/primary source, acceptable license, low-risk metadata, not duplicate, not already indexed"]);
}

export function applyCandidateClassification(candidate = {}, options = {}) {
  const enrichment = enrichCandidate(candidate, options);
  const classification = classifyCandidate(candidate, enrichment);
  const override = candidate.review_record?.verdictOverride ?? null;
  const finalVerdict = ["quarantine", "blocked"].includes(override) ? override : classification.verdict;
  const reasons = override
    ? [`manual review override: ${override}`, ...classification.reasons]
    : classification.reasons;
  return {
    ...candidate,
    enrichment,
    pipeline_verdict: finalVerdict,
    review_satisfied: Boolean(candidate.review_satisfied),
    review_record: candidate.review_record ?? null,
    protection_report: {
      ...(candidate.protection_report ?? {}),
      verdict: finalVerdict,
      risk_score: enrichment.riskScore,
      trust_score: enrichment.trustScore,
      flags: enrichment.riskFlags,
      reasons,
      enrichment
    }
  };
}

export function buildReviewQueue(candidates = [], options = {}) {
  const seenKeys = new Set();
  const annotated = candidates.map((candidate) => {
    const withReview = applyReviewRecord(candidate, options.reviewRecords?.get?.(String(candidate.id)) ?? candidate.review_record);
    const enriched = applyCandidateClassification(withReview, { ...options, seenKeys });
    return { ...enriched, branchEligible: isBranchEligible(enriched), queueReasons: queueReasons(enriched) };
  });
  const visible = annotated.filter((candidate) => !isHidden(candidate));
  const topBranchCandidates = visible.filter(isBranchEligible).sort(rankCandidates).slice(0, 5);
  const topReviewCandidates = visible.filter((candidate) => candidate.pipeline_verdict === "needs-review" && !candidate.review_satisfied).sort(rankCandidates).slice(0, 5);
  const counts = countQueue(annotated);
  return { ok: true, generated_at: new Date().toISOString(), totalFound: annotated.length, hiddenLowSignal: counts.hiddenLowSignal, alreadyIndexed: counts.alreadyIndexed, duplicateCandidates: counts.duplicateCandidates, needsPrimarySource: counts.needsPrimarySource, missingLicense: counts.missingLicense, rejected: counts.rejected, suspicious: counts.suspicious, blocked: counts.blocked, quarantined: counts.quarantined, branchEligible: counts.branchEligible, topReviewCandidates: topReviewCandidates.map(publicCandidate), topBranchCandidates: topBranchCandidates.map(publicCandidate), candidates: annotated.map(publicCandidate), recommendedAction: recommendedAction(counts, topReviewCandidates, topBranchCandidates), reason: queueReason(counts, topReviewCandidates, topBranchCandidates) };
}

export function buildBranchCandidateSet(candidates = [], options = {}) {
  const queue = options.queue ?? buildReviewQueue(candidates, options);
  const branchEligibleCandidates = queue.candidates.filter((candidate) => candidate.branchEligible);
  const excludedCandidates = queue.candidates.filter((candidate) => !candidate.branchEligible);
  const exclusionReasons = Object.fromEntries(excludedCandidates.map((candidate) => [candidate.id, candidate.queueReasons?.[0] ?? "not branch-eligible"]));
  return { branchEligibleCandidates, excludedCandidates, exclusionReasons, canPreviewBranch: branchEligibleCandidates.length > 0, canPrepareBranch: false, reason: branchEligibleCandidates.length > 0 ? `${branchEligibleCandidates.length} candidates are eligible for safe branch preview.` : "No candidate has passed Protection/review gates yet." };
}

export function applyReviewDecision(candidate = {}, review = {}) {
  const decision = String(review.decision ?? "");
  if (!REVIEW_DECISIONS.includes(decision)) throw new Error("Invalid review decision.");
  const currentVerdict = candidate.pipeline_verdict ?? candidate.protection_report?.verdict ?? candidate.repository_review?.verdict ?? candidate.verdict ?? "needs-review";
  if (decision === "approve-for-giving" && currentVerdict !== "needs-review") throw new Error("Only needs-review candidates can be approved for Giving by manual review.");
  const now = review.reviewedAt ?? new Date().toISOString();
  const record = { candidateId: String(candidate.id), decision, notes: String(review.notes ?? "").slice(0, 2000), reviewedBy: String(review.reviewedBy ?? "manual-owner").slice(0, 80), reviewedAt: now, reviewSatisfied: decision === "approve-for-giving", rejectedLowSignal: decision === "reject-low-signal", verdictOverride: decision === "quarantine" ? "quarantine" : decision === "block" ? "blocked" : null };
  return { ...candidate, review_record: record, review_satisfied: record.reviewSatisfied, rejected_low_signal: record.rejectedLowSignal, pipeline_verdict: record.verdictOverride ?? currentVerdict };
}

export async function readReviewRecords(repositoryRoot) {
  const dir = path.join(repositoryRoot, "discovery", "reviews");
  const records = new Map();
  try { for (const name of (await readdir(dir)).filter((item) => item.endsWith(".json"))) { const parsed = JSON.parse(await readFile(path.join(dir, name), "utf8")); if (parsed?.candidateId) records.set(String(parsed.candidateId), parsed); } } catch (error) { if (error?.code !== "ENOENT") throw error; }
  return records;
}

export async function writeReviewRecord(repositoryRoot, candidate, review) {
  const reviewed = applyReviewDecision(candidate, review);
  const record = reviewed.review_record;
  const dir = path.join(repositoryRoot, "discovery", "reviews");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${safeFileName(record.candidateId)}.json`);
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return { ok: true, record, filePath, candidate: reviewed };
}

function verdict(verdictValue, enrichment, reasons) { return { verdict: verdictValue, trustScore: enrichment.trustScore, riskScore: enrichment.riskScore, reasons }; }
function routeFromUrl(url) { return /^https:\/\/github\.com\//i.test(String(url ?? "")) ? "github-search" : /^https:\/\/www\.npmjs\.com\//i.test(String(url ?? "")) ? "npm-search" : "unknown-route"; }
function sourceTypeFromRoute(route, url) { if (route === "npm-search") return "npm_package"; if (route === "mcp-registry") return "mcp_tool"; if (/github\.com/i.test(String(url ?? ""))) return "github_repository"; return "source_lead"; }
function sourceStrengthFor({ sourceRoute, sourceUrl, repository }) { if (sourceRoute === "github-search" || sourceRoute === "github-releases") return 88; if (sourceRoute === "npm-search") return repository.package?.links?.repository ? 78 : 62; if (sourceRoute === "mcp-registry") return 68; if (/github\.com/i.test(String(sourceUrl ?? ""))) return 80; if (sourceRoute === "hacker-news") return 35; return 45; }
function normalizeLicense(value) { const raw = String(value ?? "").trim().toLowerCase(); if (!raw || raw === "noassertion" || raw === "unknown") return null; return raw.replace(/^license:/, ""); }
function unsafeTextFlags(text) { const flags = []; if (/\b(curl|wget)\b[\s\S]{0,120}\|\s*(sh|bash|powershell|pwsh)/.test(text)) flags.push("shell-pipe-install", "network-execution"); if (/"postinstall"\s*:/.test(text)) flags.push("postinstall-script"); if (/\bchild_process\b|\bexecsync\b|\bspawnsync\b/.test(text)) flags.push("shell-exec-node"); if (/\beval\s*\(/.test(text)) flags.push("dynamic-eval"); if (/\btoken exfiltration\b|\bcredential theft\b|\bsteal\b[\s\S]{0,80}\b(token|password|secret|cookie)\b/.test(text)) flags.push("credential-theft"); if (/\brm\s+-rf\s+\//.test(text)) flags.push("destructive-command"); return flags; }
function duplicateKeyFor({ sourceUrl, repository, title }) { return String(sourceUrl ?? repository.html_url ?? repository.id ?? repository.full_name ?? repository.name ?? title ?? "unknown").toLowerCase().replace(/\/+$/, ""); }
function slugify(value) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120); }
function safeFileName(value) { return slugify(value) || "candidate-review"; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function numberOrZero(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
function applyReviewRecord(candidate, record) { if (!record) return candidate; return { ...candidate, review_record: record, review_satisfied: Boolean(record.reviewSatisfied), rejected_low_signal: Boolean(record.rejectedLowSignal), pipeline_verdict: record.verdictOverride ?? candidate.pipeline_verdict }; }
function isBranchEligible(candidate) { const verdictValue = candidate.pipeline_verdict ?? candidate.protection_report?.verdict; if (candidate.enrichment?.alreadyIndexed || candidate.enrichment?.duplicate || candidate.rejected_low_signal) return false; if (verdictValue === "allow") return true; if (verdictValue === "needs-review" && candidate.review_satisfied) return true; return false; }
function isHidden(candidate) { return Boolean(candidate.rejected_low_signal || candidate.enrichment?.alreadyIndexed || candidate.enrichment?.duplicate || ((candidate.enrichment?.trustScore ?? 100) < 35 && candidate.pipeline_verdict === "needs-review")); }
function queueReasons(candidate) { const reasons = []; const e = candidate.enrichment ?? {}; if (candidate.rejected_low_signal) reasons.push("rejected low-signal"); if (e.alreadyIndexed) reasons.push("already indexed"); if (e.duplicate) reasons.push("duplicate"); if (!e.primarySourceFound) reasons.push("needs primary source"); if (!e.license) reasons.push("missing license"); if (candidate.pipeline_verdict === "quarantine") reasons.push("quarantined by Protection"); if (candidate.pipeline_verdict === "blocked") reasons.push("blocked by Protection"); if (e.hasUnsafeCommandHints) reasons.push("unsafe install/command hints"); if (reasons.length === 0 && candidate.pipeline_verdict === "needs-review") reasons.push("manual review required"); if (reasons.length === 0) reasons.push("branch-ready"); return reasons; }
function countQueue(candidates) { return candidates.reduce((acc, c) => { const e = c.enrichment ?? {}; if (isHidden(c) && !e.alreadyIndexed && !e.duplicate && !c.rejected_low_signal) acc.hiddenLowSignal++; if (e.alreadyIndexed) acc.alreadyIndexed++; if (e.duplicate) acc.duplicateCandidates++; if (!e.primarySourceFound) acc.needsPrimarySource++; if (!e.license) acc.missingLicense++; if (c.rejected_low_signal) acc.rejected++; if (e.hasUnsafeCommandHints || e.hasBinaryDownload || e.hasPostinstall || e.hasPrivilegedCommands) acc.suspicious++; if (c.pipeline_verdict === "blocked") acc.blocked++; if (c.pipeline_verdict === "quarantine") acc.quarantined++; if (isBranchEligible(c)) acc.branchEligible++; return acc; }, { hiddenLowSignal: 0, alreadyIndexed: 0, duplicateCandidates: 0, needsPrimarySource: 0, missingLicense: 0, rejected: 0, suspicious: 0, blocked: 0, quarantined: 0, branchEligible: 0 }); }
function rankCandidates(a, b) { return (b.enrichment?.trustScore ?? 0) - (a.enrichment?.trustScore ?? 0) || (a.enrichment?.riskScore ?? 100) - (b.enrichment?.riskScore ?? 100); }
function publicCandidate(candidate) { return { id: String(candidate.id), title: candidate.title ?? candidate.repository?.full_name ?? "Untitled candidate", sourceUrl: candidate.source_url ?? candidate.repository?.html_url ?? null, sourceRoute: candidate.source_route ?? candidate.repository?.source_route ?? null, verdict: candidate.pipeline_verdict ?? candidate.protection_report?.verdict ?? "needs-review", reviewSatisfied: Boolean(candidate.review_satisfied), branchEligible: isBranchEligible(candidate), rejectedLowSignal: Boolean(candidate.rejected_low_signal), enrichment: candidate.enrichment, queueReasons: candidate.queueReasons ?? queueReasons(candidate) }; }
function recommendedAction(counts, review, branch) { if (branch.length > 0) return "preview-branch"; if (review.length > 0) return "review-top-candidates"; if (counts.quarantined + counts.blocked > 0) return "audit-protection-blocks"; return "start-research"; }
function queueReason(counts, review, branch) { if (branch.length > 0) return `${branch.length} candidates are clean/review-satisfied and ready for branch preview.`; if (review.length > 0) return `${review.length} top candidates are worth checking first; duplicates, low-signal, and already-indexed items are grouped.`; return `${counts.alreadyIndexed + counts.duplicateCandidates + counts.hiddenLowSignal} candidates are hidden/grouped; no branch-ready candidate remains.`; }
