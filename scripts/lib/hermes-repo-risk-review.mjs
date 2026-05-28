const EXECUTABLE_EXTENSIONS = [
  "exe",
  "msi",
  "scr",
  "bat",
  "cmd",
  "ps1",
  "vbs",
  "hta",
  "lnk",
  "dmg",
  "pkg",
  "appimage"
];

const TRUST_BONUS_STARS = [
  [10_000, 16],
  [1_000, 10],
  [100, 5]
];

const RULES = [
  {
    id: "binary-download-instructions",
    weight: 38,
    flag: "binary-download",
    pattern: /\b(download|locate|run|double[-\s]?click|open)\b[\s\S]{0,180}\.(?:exe|msi|scr|bat|cmd|ps1|vbs|hta|lnk|dmg|pkg|appimage)\b/i,
    reason: "README or release text tells users to download/run an executable or installer."
  },
  {
    id: "download-button-copy",
    weight: 30,
    flag: "download-button",
    pattern: /\b(click (?:the )?(?:big )?(?:button|link)|download here|download page|getting started[\s\S]{0,300}download)\b/i,
    reason: "README uses consumer-download copy instead of a source-first developer workflow."
  },
  {
    id: "windows-installer-flow",
    weight: 26,
    flag: "windows-installer-flow",
    pattern: /\b(windows pc|windows 10|windows 11|system requirements|basic rights to install programs|no technical skills needed)\b/i,
    reason: "README resembles a Windows installer funnel, which is unusual for source-backed agent tooling."
  },
  {
    id: "antivirus-bypass",
    weight: 95,
    flag: "antivirus-bypass",
    pattern: /\b(disable (?:windows defender|defender|antivirus|anti-virus|smartscreen|gatekeeper)|allow(?: it)? through (?:defender|antivirus)|ignore (?:the )?(?:warning|virus warning))\b/i,
    reason: "Instructions ask users to bypass operating-system or antivirus protections."
  },
  {
    id: "admin-or-privilege-prompt",
    weight: 34,
    flag: "privileged-installer",
    pattern: /\b(run as administrator|administrator rights|root password|sudo curl|sudo bash|sudo sh)\b/i,
    reason: "Install instructions ask for elevated privileges."
  },
  {
    id: "archive-password",
    weight: 70,
    flag: "password-protected-archive",
    pattern: /\b(archive password|zip password|password\s*[:=]\s*(?:1234|infected|malware|[a-z0-9_-]{3,20}))\b/i,
    reason: "Download flow references a password-protected archive."
  },
  {
    id: "external-file-host",
    weight: 42,
    flag: "external-file-host",
    pattern: /\b(?:drive\.google\.com|dropbox\.com|mediafire\.com|mega\.nz|gofile\.io|anonfiles\.com|pixeldrain\.com|sendspace\.com|bit\.ly|tinyurl\.com|t\.me\/)\b/i,
    reason: "README or release text points users to a generic file host or shortener."
  },
  {
    id: "wallet-or-secret-request",
    weight: 80,
    flag: "secret-request",
    pattern: /\b(seed phrase|private key|recovery phrase|wallet password|paste your token|enter your api key)\b/i,
    reason: "Text appears to request wallet material, tokens, or other secrets."
  },
  {
    id: "binary-only-positioning",
    weight: 22,
    flag: "binary-first",
    pattern: /\b(latest version of the tool|installer file|setup wizard|basic rights to install)\b/i,
    reason: "Project positioning emphasizes installer download over inspectable source."
  }
];

export function reviewCandidateTrust(candidate, options = {}) {
  const blocklist = normalizeBlocklist(options.blocklist ?? []);
  const domainBlocklist = normalizeBlocklist(options.domainBlocklist ?? []);
  const readmeText = String(options.readmeText ?? "");
  const releaseText = String(options.releaseText ?? "");
  const fileNames = Array.isArray(options.fileNames) ? options.fileNames : [];
  const text = normalizeText([
    candidate.name,
    candidate.title,
    candidate.description,
    candidate.signal_summary,
    candidate.why_builders_should_care,
    releaseText,
    readmeText
  ].join("\n"));

  const matched = [];
  const flags = new Set();
  let riskScore = 0;

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      matched.push({ id: rule.id, weight: rule.weight, reason: rule.reason });
      flags.add(rule.flag);
      riskScore += rule.weight;
    }
  }

  const executableFiles = fileNames.filter((name) => executableFile(name));
  if (executableFiles.length > 0) {
    flags.add("executable-artifact");
    matched.push({
      id: "executable-artifact",
      weight: 30,
      reason: "Repository or release includes executable-looking artifacts."
    });
    riskScore += 30;
  }

  const hardBlocked = isBlocklisted(candidate, blocklist, domainBlocklist);
  if (hardBlocked) {
    flags.add("repo-blocklisted");
    matched.push({
      id: "repo-blocklisted",
      weight: 100,
      reason: "Repository or domain matched the maintainer blocklist."
    });
    riskScore += 100;
  }

  if (!candidate.metrics?.license) {
    flags.add("license-not-asserted");
    riskScore += 8;
  }

  const stars = Number(candidate.metrics?.stars ?? 0);
  if (stars < 5 && candidate.source_route === "github-search") {
    flags.add("low-repo-signal");
    riskScore += 12;
  }

  const createdAt = candidate.metrics?.created_at ? Date.parse(candidate.metrics.created_at) : NaN;
  if (Number.isFinite(createdAt)) {
    const ageDays = (Date.now() - createdAt) / 86_400_000;
    if (ageDays < 30 && candidate.source_route === "github-search") {
      flags.add("new-repository");
      riskScore += 10;
    }
  }

  const trustBonus = trustBonusFor(candidate);
  riskScore = clamp(Math.round(riskScore - trustBonus), 0, 100);
  if (flags.has("license-not-asserted")) riskScore = Math.max(riskScore, 8);
  if (matched.length > 0) riskScore = Math.max(riskScore, 18);
  const trustScore = clamp(100 - riskScore, 0, 100);
  const verdict = hardBlocked || riskScore >= 72
    ? "blocked"
    : riskScore >= 42 ? "suspicious" : riskScore >= 18 ? "needs-review" : "low-risk";

  return {
    verdict,
    risk_score: riskScore,
    trust_score: trustScore,
    flags: [...flags].sort(),
    reasons: matched
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((match) => match.reason),
    reviewed_at: options.reviewedAt ?? new Date().toISOString(),
    evidence: {
      readme_checked: readmeText.length > 0,
      release_text_checked: releaseText.length > 0,
      executable_artifact_count: executableFiles.length,
      hard_blocklisted: hardBlocked
    }
  };
}

export function applyTrustReview(candidate, review) {
  const riskFlags = compact([...(candidate.risk_flags ?? []), ...(review.flags ?? [])]);
  const patched = {
    ...candidate,
    repository_review: review,
    risk_flags: riskFlags,
    metrics: {
      ...(candidate.metrics ?? {}),
      repo_risk_score: review.risk_score,
      repo_trust_score: review.trust_score,
      repo_verdict: review.verdict
    }
  };

  if (review.verdict === "blocked") {
    return {
      ...patched,
      suggested_trust_tier: "watchlist",
      recommended_action: "blocked",
      reason: candidate.reason === "already-indexed" ? candidate.reason : "blocked",
      allow_registry_proposal: false,
      signal_summary: appendReviewSummary(candidate.signal_summary, review)
    };
  }

  if (review.verdict === "suspicious" && candidate.recommended_action !== "already-indexed") {
    return {
      ...patched,
      suggested_trust_tier: "watchlist",
      recommended_action: "watchlist",
      allow_registry_proposal: false,
      signal_summary: appendReviewSummary(candidate.signal_summary, review)
    };
  }

  return {
    ...patched,
    signal_summary: appendReviewSummary(candidate.signal_summary, review)
  };
}

function appendReviewSummary(summary, review) {
  const prefix = summary ?? "Source-discovered candidate.";
  return `${prefix} Repo review: ${review.verdict}, risk ${review.risk_score}/100, trust ${review.trust_score}/100.`;
}

function trustBonusFor(candidate) {
  let bonus = 0;
  const stars = Number(candidate.metrics?.stars ?? 0);
  for (const [threshold, value] of TRUST_BONUS_STARS) {
    if (stars >= threshold) {
      bonus += value;
      break;
    }
  }
  if (candidate.metrics?.license) bonus += 4;
  if (candidate.source_route === "github-releases") bonus += 4;
  if (candidate.source_route === "mcp-registry") bonus += 8;
  return bonus;
}

function isBlocklisted(candidate, blocklist, domainBlocklist) {
  const values = [
    candidate.name,
    candidate.repo_url,
    candidate.source_url,
    candidate.homepage_url,
    ...(candidate.source_urls ?? [])
  ].map(normalizeComparable).filter(Boolean);

  if (values.some((value) => blocklist.some((blocked) => value === blocked || value.includes(blocked)))) {
    return true;
  }

  return values.some((value) => {
    try {
      const host = new URL(value.startsWith("http") ? value : `https://${value}`).hostname.toLowerCase();
      return domainBlocklist.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
    } catch {
      return false;
    }
  });
}

function normalizeBlocklist(values) {
  return values.map(normalizeComparable).filter(Boolean);
}

function normalizeComparable(value) {
  return String(value ?? "")
    .trim()
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function executableFile(name) {
  const extension = String(name ?? "").toLowerCase().match(/\.([a-z0-9]+)(?:$|[?#])/i)?.[1];
  return extension ? EXECUTABLE_EXTENSIONS.includes(extension) : false;
}

function compact(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
