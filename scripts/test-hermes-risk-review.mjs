import assert from "node:assert/strict";
import { applyTrustReview, reviewCandidateTrust } from "./lib/hermes-repo-risk-review.mjs";

const suspiciousReadme = `
# Easy-agentic-memory-system-easy-memory

## System Requirements
To run this tool on your Windows PC, your system should meet these basics:
- Windows 10 or later
- Basic rights to install programs on your computer

## Getting Started
Follow these steps to download and run Easy-agentic-memory-system-easy-memory on your Windows PC.
No technical skills needed.

1. Download the software
Click the big button below or this link to visit the download page.

2. Locate the installer file
Find the file called something like Easy-agentic-memory-system-easy-memory.exe.

3. Run the installer
Double-click the installer file to start.
`;

const candidate = {
  source_route: "github-search",
  name: "unknown/easy-agentic-memory-system-easy-memory",
  title: "easy-agentic-memory-system-easy-memory",
  description: "Agent memory helper",
  repo_url: "https://github.com/unknown/easy-agentic-memory-system-easy-memory",
  source_url: "https://github.com/unknown/easy-agentic-memory-system-easy-memory",
  suggested_trust_tier: "unreviewed",
  recommended_action: "review",
  risk_flags: [],
  metrics: {
    stars: 0,
    license: null,
    created_at: new Date().toISOString()
  }
};

const review = reviewCandidateTrust(candidate, {
  readmeText: suspiciousReadme,
  reviewedAt: "2026-05-28T00:00:00.000Z"
});

assert.equal(review.verdict, "blocked");
assert.ok(review.risk_score >= 72);
assert.ok(review.flags.includes("binary-download"));
assert.ok(review.flags.includes("windows-installer-flow"));
assert.ok(review.flags.includes("download-button"));

const patched = applyTrustReview(candidate, review);
assert.equal(patched.recommended_action, "blocked");
assert.equal(patched.allow_registry_proposal, false);
assert.equal(patched.suggested_trust_tier, "watchlist");
assert.equal(patched.metrics.repo_verdict, "blocked");

const healthyReview = reviewCandidateTrust({
  source_route: "github-search",
  name: "example/source-first-agent",
  title: "source-first-agent",
  description: "Open source MCP server with tests and documented API.",
  repo_url: "https://github.com/example/source-first-agent",
  source_url: "https://github.com/example/source-first-agent",
  risk_flags: [],
  metrics: {
    stars: 220,
    license: "MIT",
    created_at: "2024-01-01T00:00:00Z"
  }
}, {
  readmeText: "# source-first-agent\n\nInstall from source, run tests, then configure the MCP server.",
  reviewedAt: "2026-05-28T00:00:00.000Z"
});

assert.notEqual(healthyReview.verdict, "blocked");
assert.ok(healthyReview.trust_score > healthyReview.risk_score);

const blocklisted = reviewCandidateTrust(candidate, {
  blocklist: ["unknown/easy-agentic-memory-system-easy-memory"],
  reviewedAt: "2026-05-28T00:00:00.000Z"
});
assert.equal(blocklisted.verdict, "blocked");
assert.ok(blocklisted.flags.includes("repo-blocklisted"));

console.log("Hermes repository risk review tests passed.");
