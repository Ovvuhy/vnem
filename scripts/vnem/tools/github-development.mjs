import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const BIDI_PATTERN = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/u;
const SECRET_VALUE_PATTERN = /(?:github_pat_|gh[pousr]_|sk-|xox[baprs]-|cfut_)[A-Za-z0-9_-]{16,}/i;
const SECRET_ASSIGNMENT_PATTERN = /(?:token|secret|password|credential|api[_-]?key|authorization|cookie|session)\s*[=:]\s*["']?([^\s"']{12,})/i;
const SECRET_PATH_PATTERN = /(^|\/)(?:\.env(?:\.|$)|\.ssh|\.aws|credentials?|secrets?|cookies?|sessions?)(\/|$)|\.(?:pem|key|p12|pfx)$/i;
const REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/@{}^~:-]{0,255}$/;
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const REMOTE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/+:-]{0,127}$/;
const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const DEFAULT_MAX_BYTES = 256 * 1024;

const REVIEW_THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $limit: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      url
      reviewThreads(first: $limit) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          originalLine
          diffSide
          comments(first: 20) {
            nodes { id author { login } body createdAt url }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

export class GithubDevelopmentError extends Error {
  constructor(message, code = "github_development_error", details = {}) {
    super(message);
    this.name = "GithubDevelopmentError";
    this.code = code;
    this.details = details;
  }
}

export class GithubDevelopmentRuntime {
  constructor({ runProcess, resolveRoot, redact = String, protectedBranches = () => ["main", "master", "production"] }) {
    this.runProcess = runProcess;
    this.resolveRoot = resolveRoot;
    this.redact = redact;
    this.protectedBranches = protectedBranches;
  }

  async diffReview(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const maxBytes = boundedNumber(args.max_bytes, 8_000, 1024 * 1024, DEFAULT_MAX_BYTES);
    const prNumber = optionalPositiveInteger(args.pr, "PR number");
    let metadata = null;
    let files = [];
    let patchResult;
    let source;
    let patchTransport = "direct";
    let diffCheck = { ok: true, stdout: "", stderr: "" };

    if (prNumber) {
      source = "live_github_pr";
      const view = await this.runJson("gh", ["pr", "view", String(prNumber), "--json", "url,number,state,isDraft,baseRefName,headRefName,headRefOid,baseRefOid,mergeable,additions,deletions,changedFiles,files"], root.absolutePath, maxBytes);
      if (!view.ok) return blockedRead("vnem_tools_github_diff_review", "GitHub PR metadata was unavailable.", view.result);
      metadata = view.value;
      files = normalizePrFiles(metadata.files);
      patchResult = await this.runProcess("gh", ["pr", "diff", String(prNumber), "--patch"], processOptions(root.absolutePath, maxBytes, 30_000));
      if (!patchResult.ok && isGithubPatchTooLarge(patchResult)) {
        const baseSha = normalizeSha(metadata.baseRefOid);
        const headSha = normalizeSha(metadata.headRefOid);
        const baseObject = baseSha ? await this.runProcess("git", ["cat-file", "-e", `${baseSha}^{commit}`], processOptions(root.absolutePath, 4_000)) : null;
        const headObject = headSha ? await this.runProcess("git", ["cat-file", "-e", `${headSha}^{commit}`], processOptions(root.absolutePath, 4_000)) : null;
        if (baseObject?.ok && headObject?.ok) {
          const range = `${baseSha}...${headSha}`;
          patchResult = await this.runProcess("git", ["diff", "--no-ext-diff", "--unified=3", range], processOptions(root.absolutePath, maxBytes, 30_000));
          diffCheck = await this.runProcess("git", ["diff", "--check", range], processOptions(root.absolutePath, Math.min(maxBytes, 64 * 1024)));
          source = "live_github_pr_exact_sha_local_patch_fallback";
          patchTransport = "github_patch_too_large_exact_sha_local_git_fallback";
        }
      }
    } else {
      source = "local_git_range";
      const base = cleanRevision(args.base || "origin/main", "base revision");
      const head = cleanRevision(args.head || "HEAD", "head revision");
      const range = `${base}...${head}`;
      const names = await this.runProcess("git", ["diff", "--name-status", "--find-renames", range], processOptions(root.absolutePath, maxBytes));
      const numbers = await this.runProcess("git", ["diff", "--numstat", range], processOptions(root.absolutePath, maxBytes));
      patchResult = await this.runProcess("git", ["diff", "--no-ext-diff", "--unified=3", range], processOptions(root.absolutePath, maxBytes, 30_000));
      diffCheck = await this.runProcess("git", ["diff", "--check", range], processOptions(root.absolutePath, Math.min(maxBytes, 64 * 1024)));
      if (!names.ok || !patchResult.ok) return blockedRead("vnem_tools_github_diff_review", "The requested local Git range could not be inspected.", names.ok ? patchResult : names);
      files = mergeLocalDiffFiles(parseNameStatus(names.stdout), parseNumstat(numbers.stdout));
      metadata = { base, head, range, changedFiles: files.length, additions: sum(files, "additions"), deletions: sum(files, "deletions") };
    }

    if (!patchResult.ok) return blockedRead("vnem_tools_github_diff_review", "The bounded patch could not be read.", patchResult);
    if (!files.length) files = inferFilesFromPatch(patchResult.stdout);
    const scan = scanPatch(patchResult.stdout, this.redact);
    const checkFindings = diffCheck.ok ? [] : [{ severity: "medium", code: "git_diff_check", path: null, line: null, message: "Git reported whitespace or conflict-marker concerns in the selected range.", excerpt: this.redact(`${diffCheck.stdout}\n${diffCheck.stderr}`.trim()).slice(0, 800) }];
    const riskFindings = files.flatMap(fileRiskFinding);
    const findings = [...scan.findings, ...checkFindings, ...riskFindings];
    const patchBytes = Buffer.byteLength(patchResult.stdout || "", "utf8");
    const patchTruncated = patchBytes >= maxBytes - 16;
    const changedFiles = Number(metadata.changedFiles) || files.length;
    const fileListTruncated = changedFiles > files.length;
    const classes = countBy(files.map((file) => classifyFile(file.path)));
    return {
      schema_version: 1,
      operation_result: "reported",
      source,
      patch_transport: patchTransport,
      metadata,
      files,
      summary: {
        changed_files: changedFiles,
        listed_files: files.length,
        file_list_truncated: fileListTruncated,
        additions: metadata.additions ?? sum(files, "additions"),
        deletions: metadata.deletions ?? sum(files, "deletions"),
        classifications: classes,
        findings: findings.length,
        high_severity_findings: findings.filter((item) => item.severity === "high").length,
        generated_only: files.length > 0 && files.every((file) => classifyFile(file.path) === "generated")
      },
      findings,
      review_focus: reviewFocus(files, findings),
      scans: {
        bounded_patch_bytes: patchBytes,
        patch_truncated: patchTruncated,
        hidden_or_bidi_unicode_checked: true,
        hidden_or_bidi_unicode_findings: scan.bidi_count,
        secret_like_additions_checked: true,
        secret_like_additions: scan.secret_count,
        git_diff_check: source === "live_github_pr" ? "not_available_for_remote_patch" : (diffCheck.ok ? "clean" : "findings")
      },
      claim_status: findings.some((item) => item.severity === "high") || patchTruncated || fileListTruncated ? "manual_review_required" : "bounded_review_complete",
      must_not_claim: ["The code is semantically correct solely because structural scans passed.", patchTruncated ? "The complete patch was inspected." : null, fileListTruncated ? "The complete changed-file list was returned by GitHub." : null, source === "live_github_pr" ? null : "GitHub served the PR patch directly."].filter(Boolean),
      safe_next_step: findings.length ? "Inspect the highest-severity finding and its exact file before approving or changing the PR." : "Perform semantic review of the listed source and test changes, then verify checks and exact remote SHA."
    };
  }

  async reviewThreads(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const number = positiveInteger(args.pr, "PR number");
    const limit = boundedNumber(args.limit, 1, 50, 50);
    const ownerRepo = await this.ownerRepo(root.absolutePath, args.repo);
    if (!ownerRepo) throw new GithubDevelopmentError("A GitHub owner/repository could not be resolved.", "github_repo_unresolved");
    const [owner, name] = ownerRepo.split("/");
    const result = await this.runJson("gh", ["api", "graphql", "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${number}`, "-F", `limit=${limit}`, "-f", `query=${REVIEW_THREADS_QUERY}`], root.absolutePath, DEFAULT_MAX_BYTES, 30_000);
    if (!result.ok) return blockedRead("vnem_tools_github_review_threads", "GitHub review threads were unavailable.", result.result);
    const pullRequest = result.value?.data?.repository?.pullRequest;
    if (!pullRequest) return blockedRead("vnem_tools_github_review_threads", "The requested PR or its review threads were not returned.", result.result);
    const rawThreads = arrayify(pullRequest.reviewThreads?.nodes);
    const threads = rawThreads.map((thread) => ({
      id: thread.id,
      resolved: thread.isResolved === true,
      outdated: thread.isOutdated === true,
      path: normalizePath(thread.path || ""),
      line: Number(thread.line || thread.originalLine) || null,
      diff_side: thread.diffSide || null,
      comments: arrayify(thread.comments?.nodes).slice(0, 20).map((comment) => ({ id: comment.id, author: comment.author?.login || null, body_excerpt: this.redact(String(comment.body || "")).slice(0, 600), created_at: comment.createdAt || null, url: comment.url || null }))
    }));
    const visible = args.include_resolved === true ? threads : threads.filter((thread) => !thread.resolved);
    return {
      schema_version: 1,
      operation_result: "reported",
      repo: ownerRepo,
      pr: number,
      url: pullRequest.url || null,
      threads: visible,
      summary: { total_returned: threads.length, unresolved: threads.filter((thread) => !thread.resolved).length, resolved: threads.filter((thread) => thread.resolved).length, outdated: threads.filter((thread) => thread.outdated).length, comments: threads.reduce((count, thread) => count + thread.comments.length, 0) },
      pagination: { has_next_page: pullRequest.reviewThreads?.pageInfo?.hasNextPage === true, end_cursor_returned: Boolean(pullRequest.reviewThreads?.pageInfo?.endCursor) },
      bodies_redacted_and_bounded: true,
      mutation_performed: false,
      safe_next_step: visible.some((thread) => !thread.resolved) ? "Address or explicitly disposition each unresolved thread, then reread thread state before merge." : "No unresolved thread was returned in this bounded page; still verify reviews and checks before merge.",
      must_not_claim: [pullRequest.reviewThreads?.pageInfo?.hasNextPage ? "All review threads were inspected; another page exists." : null, "A review thread was resolved or replied to by this read-only tool."].filter(Boolean)
    };
  }

  async remoteProof(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const remote = cleanRemote(args.remote || "origin");
    const branchResult = await this.runProcess("git", ["branch", "--show-current"], processOptions(root.absolutePath, 4_000));
    const branch = cleanBranch(args.branch || branchResult.stdout.trim());
    const localHeadResult = await this.runProcess("git", ["rev-parse", "HEAD"], processOptions(root.absolutePath, 4_000));
    const status = await this.runProcess("git", ["status", "--short"], processOptions(root.absolutePath, 32 * 1024));
    const remoteUrl = await this.runProcess("git", ["remote", "get-url", remote], processOptions(root.absolutePath, 8_000));
    const remoteRef = await this.runProcess("git", ["ls-remote", "--heads", remote, `refs/heads/${branch}`], processOptions(root.absolutePath, 16 * 1024, 30_000));
    const localHead = normalizeSha(localHeadResult.stdout);
    const remoteHead = normalizeSha(remoteRef.stdout.split(/\s+/)[0]);
    const ownerRepo = parseGithubRepo(remoteUrl.stdout);
    const prSelector = args.pr ? String(positiveInteger(args.pr, "PR number")) : branch;
    const prView = await this.runJson("gh", ["pr", "view", prSelector, "--json", "url,number,state,isDraft,baseRefName,headRefName,headRefOid,baseRefOid,mergeable,reviewDecision,statusCheckRollup"], root.absolutePath, DEFAULT_MAX_BYTES, 30_000);
    const pr = prView.ok ? prView.value : null;
    const runsResult = await this.runJson("gh", ["run", "list", "--branch", branch, "--limit", String(boundedNumber(args.run_limit, 1, 20, 10)), "--json", "databaseId,name,event,status,conclusion,headSha,headBranch,url,createdAt"], root.absolutePath, DEFAULT_MAX_BYTES, 30_000);
    const runs = runsResult.ok && Array.isArray(runsResult.value) ? runsResult.value : [];
    const exactRuns = runs.filter((run) => normalizeSha(run.headSha) === localHead);
    const baseBranch = cleanBranch(args.base || pr?.baseRefName || "main");
    const protection = await this.branchProtection(root.absolutePath, ownerRepo, baseBranch);
    const configuredProtected = this.protectedBranches().map((item) => String(item).toLowerCase()).includes(baseBranch.toLowerCase());
    const expected = args.expected_sha ? normalizeSha(args.expected_sha) : localHead;
    const equality = {
      expected_matches_local: Boolean(expected && localHead === expected),
      local_matches_remote: Boolean(localHead && remoteHead && localHead === remoteHead),
      local_matches_pr_head: Boolean(localHead && pr?.headRefOid && localHead === normalizeSha(pr.headRefOid)),
      exact_head_actions_observed: exactRuns.length > 0
    };
    const blockers = [
      !localHead ? "local HEAD unavailable" : null,
      !remoteHead ? "remote branch SHA unavailable" : null,
      !pr ? "PR metadata unavailable" : null,
      !runsResult.ok ? "Actions list unavailable" : null,
      ...Object.entries(equality).filter(([, value]) => !value).map(([key]) => key.replaceAll("_", " "))
    ].filter(Boolean);
    return {
      schema_version: 1,
      operation_result: "reported",
      repo: ownerRepo,
      remote,
      remote_url: this.redact(remoteUrl.stdout.trim()),
      branch,
      base_branch: baseBranch,
      local_head_sha: localHead,
      expected_sha: expected,
      remote_branch_sha: remoteHead,
      worktree: { clean: !status.stdout.trim(), entries: status.stdout.split(/\r?\n/).filter(Boolean).slice(0, 100) },
      pr: pr ? { url: pr.url, number: pr.number, state: pr.state, draft: pr.isDraft, base: pr.baseRefName, head: pr.headRefName, head_sha: normalizeSha(pr.headRefOid), base_sha: normalizeSha(pr.baseRefOid), mergeable: pr.mergeable, review_decision: pr.reviewDecision || null, checks: normalizeCheckRollup(pr.statusCheckRollup) } : null,
      actions: { exact_head_runs: exactRuns, recent_runs: runs.slice(0, 10), status_checked: runsResult.ok },
      branch_protection: { configured_as_protected: configuredProtected, live: protection },
      equality,
      verified: blockers.length === 0,
      blockers,
      proof_level: "live_git_remote_and_github_cli",
      fetch_performed: false,
      mutation_performed: false,
      repair_or_rollback_guidance: equality.local_matches_remote ? "No remote repair is indicated. If a later mutation is wrong, use a normal corrective commit or PR update; do not force-push by default." : "Stop publication. Reconcile the local/remote/PR refs with a normal fetch and corrective commit or branch update; do not force-push.",
      safe_next_step: blockers[0] || "Use the exact matching SHA and Actions URL in the proof packet; keep merge decisions separate."
    };
  }

  async actionsRunInspect(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const runId = positiveInteger(args.run_id, "Actions run id");
    const maxBytes = boundedNumber(args.max_bytes, 4_000, 512 * 1024, 96 * 1024);
    const view = await this.runJson("gh", ["run", "view", String(runId), "--json", "status,conclusion,url,headSha,headBranch,name,event,createdAt,updatedAt,jobs"], root.absolutePath, maxBytes, 30_000);
    if (!view.ok) return blockedRead("vnem_tools_github_actions_run_inspect", "The Actions run could not be read.", view.result);
    const mode = String(args.log_mode || "failed");
    let logResult = null;
    if (mode === "failed") logResult = await this.runProcess("gh", ["run", "view", String(runId), "--log-failed"], processOptions(root.absolutePath, maxBytes, 30_000));
    if (mode === "job") {
      const jobId = positiveInteger(args.job_id, "Actions job id");
      logResult = await this.runProcess("gh", ["run", "view", String(runId), "--job", String(jobId), "--log"], processOptions(root.absolutePath, maxBytes, 30_000));
    }
    const jobs = arrayify(view.value.jobs).map((job) => ({ id: job.databaseId || job.id || null, name: job.name, status: job.status, conclusion: job.conclusion || null, url: job.url || null, started_at: job.startedAt || null, completed_at: job.completedAt || null, steps: arrayify(job.steps).map((step) => ({ number: step.number, name: step.name, status: step.status, conclusion: step.conclusion || null, started_at: step.startedAt || null, completed_at: step.completedAt || null })) }));
    const rawLog = logResult?.ok ? logResult.stdout : "";
    const logLines = rawLog.split(/\r?\n/).filter(Boolean);
    const importantLines = logLines.filter((line) => /error|failed|failure|exit code|exception|traceback|cannot find|not found|timeout|denied/i.test(line)).slice(0, 30).map((line) => this.redact(line).slice(0, 500));
    return {
      schema_version: 1,
      operation_result: "reported",
      run: { id: runId, status: view.value.status, conclusion: view.value.conclusion || null, url: view.value.url, head_sha: normalizeSha(view.value.headSha), head_branch: view.value.headBranch || null, name: view.value.name, event: view.value.event, created_at: view.value.createdAt || null, updated_at: view.value.updatedAt || null },
      jobs,
      summary: { jobs: jobs.length, failed_jobs: jobs.filter((job) => job.conclusion === "failure").length, steps: jobs.reduce((count, job) => count + job.steps.length, 0), failed_steps: jobs.flatMap((job) => job.steps).filter((step) => step.conclusion === "failure").length },
      logs: { mode, requested: mode !== "none", available: logResult?.ok === true, bounded_bytes: Buffer.byteLength(rawLog, "utf8"), important_lines: importantLines, error: logResult && !logResult.ok ? this.redact(`${logResult.stderr}\n${logResult.stdout}`.trim()).slice(0, 800) : null },
      mutation_performed: false,
      must_not_claim: [mode === "none" ? "Job logs were inspected." : null, logResult && !logResult.ok ? "The requested logs were available." : null, "A failed run was rerun by this read-only tool."].filter(Boolean),
      safe_next_step: view.value.conclusion === "failure" ? "Use the first concrete failed step/log line to reproduce the exact command locally before changing code or rerunning CI." : "Match this run head SHA to the remote branch and PR before claiming remote success."
    };
  }

  async releaseVerify(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const tag = cleanTag(args.tag);
    const remote = cleanRemote(args.remote || "origin");
    const expected = args.expected_sha ? normalizeSha(args.expected_sha) : null;
    const release = await this.runJson("gh", ["release", "view", tag, "--json", "tagName,name,isDraft,isPrerelease,url,targetCommitish,publishedAt,createdAt,assets"], root.absolutePath, DEFAULT_MAX_BYTES, 30_000);
    const refs = await this.runProcess("git", ["ls-remote", remote, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], processOptions(root.absolutePath, 16 * 1024, 30_000));
    const remoteTag = parseTagRefs(refs.stdout, tag);
    const releaseValue = release.ok ? release.value : null;
    const expectedMatches = expected ? remoteTag.sha === expected : null;
    const verified = Boolean(releaseValue && remoteTag.sha && (expectedMatches !== false));
    return {
      schema_version: 1,
      operation_result: releaseValue ? "reported" : "not_found_or_unavailable",
      tag,
      remote,
      expected_sha: expected,
      remote_tag: remoteTag,
      release: releaseValue ? { tag: releaseValue.tagName, name: releaseValue.name, draft: releaseValue.isDraft, prerelease: releaseValue.isPrerelease, url: releaseValue.url, target_commitish: releaseValue.targetCommitish, published_at: releaseValue.publishedAt || null, created_at: releaseValue.createdAt || null, assets: arrayify(releaseValue.assets).map((asset) => ({ name: asset.name, size: asset.size, state: asset.state || null, download_count: asset.downloadCount ?? null, url: asset.url || null })) } : null,
      equality: { expected_matches_remote_tag: expectedMatches, release_tag_matches_requested: releaseValue ? releaseValue.tagName === tag : false },
      verified,
      release_error_redacted: release.ok ? null : this.redact(`${release.result.stderr}\n${release.result.stdout}`.trim()).slice(0, 800),
      mutation_performed: false,
      must_not_claim: [!releaseValue ? "A GitHub release exists for this tag." : null, !remoteTag.sha ? "The remote tag SHA was verified." : null, expectedMatches === false ? "The release/tag points to the expected SHA." : null].filter(Boolean),
      safe_next_step: verified ? "Use the release URL, remote tag SHA, draft/prerelease state, and assets in the proof packet." : "Do not claim release completion; verify the tag target and create or repair only through an approved draft-release workflow."
    };
  }

  async publicSurfaceAudit(args = {}) {
    const root = await this.resolveRoot(args.root || ".");
    const defaults = ["README.md", "package.json", "public/api/index.json", "public/index.html", "llms.txt"];
    const requested = arrayify(args.paths).length ? arrayify(args.paths) : defaults;
    if (requested.length > 12) throw new GithubDevelopmentError("Public-surface audit is limited to 12 files.", "github_public_surface_limit");
    const files = [];
    for (const raw of requested) {
      const relative = cleanRelativePath(raw);
      const absolute = path.resolve(root.absolutePath, relative);
      if (!isInside(root.absolutePath, absolute) || SECRET_PATH_PATTERN.test(normalizePath(relative))) throw new GithubDevelopmentError("Public-surface path is outside the repo or secret-like.", "github_public_surface_path_blocked", { path: relative });
      if (!existsSync(absolute)) continue;
      const info = await stat(absolute);
      if (!info.isFile() || info.size > 1024 * 1024) continue;
      const text = await readFile(absolute, "utf8");
      files.push({ path: normalizePath(relative), bytes: info.size, text });
    }
    const packageFile = files.find((file) => file.path === "package.json");
    const readme = files.find((file) => /^readme\.md$/i.test(file.path));
    const publicIndex = files.find((file) => file.path === "public/api/index.json");
    const packageData = parseJson(packageFile?.text);
    const publicData = parseJson(publicIndex?.text);
    const remote = await this.runProcess("git", ["remote", "get-url", args.remote || "origin"], processOptions(root.absolutePath, 8_000));
    const repo = parseGithubRepo(remote.stdout);
    const allText = files.map((file) => file.text).join("\n");
    const repoLinks = [...new Set(extractGithubRepos(allText))];
    const headings = readme ? readme.text.split(/\r?\n/).filter((line) => /^#{1,6}\s+/.test(line)) : [];
    const badges = readme ? (readme.text.match(/!\[[^\]]*\]\([^)]*\)/g) || []) : [];
    const hasCore = /VNEM Core MCP|vnem(?:-core)?\b/i.test(readme?.text || "");
    const hasTools = /VNEM Tools MCP|vnem-tools\b/i.test(readme?.text || "");
    const hasSetup = /\bvnem\s+setup\b|npm(?:\.cmd)?\s+run\s+vnem:setup/i.test(readme?.text || "");
    const findings = [
      !readme ? finding("high", "readme_missing", "README.md", "The repository README was not available in the audited paths.") : null,
      readme && !hasCore ? finding("medium", "core_product_missing", "README.md", "The README does not clearly identify VNEM Core MCP.") : null,
      readme && !hasTools ? finding("medium", "tools_product_missing", "README.md", "The README does not clearly identify VNEM Tools MCP.") : null,
      readme && !hasSetup ? finding("medium", "setup_path_missing", "README.md", "The README does not expose the current `vnem setup` path.") : null,
      repo && !repoLinks.some((item) => item.toLowerCase() === repo.toLowerCase()) ? finding("medium", "canonical_repo_link_missing", "README.md", `The audited public text does not link the detected canonical repo ${repo}.`) : null,
      packageData && !packageData.name ? finding("medium", "package_name_missing", "package.json", "package.json has no package name.") : null,
      packageData && !packageData.version ? finding("medium", "package_version_missing", "package.json", "package.json has no version.") : null,
      publicIndex && !publicData ? finding("high", "public_api_invalid_json", publicIndex.path, "The public API index is not valid JSON.") : null
    ].filter(Boolean);
    const suggestions = [
      headings.length > 24 ? "Reduce or group README sections so setup, architecture, proof, and support truth remain scannable." : null,
      badges.length > 8 ? "Keep only badges that communicate current build, package, security, or compatibility status." : null,
      readme && readme.bytes > 40_000 ? "Move deep reference material out of the repo front page and retain a compact setup-first README." : null,
      !headings.some((line) => /quick start|setup|install/i.test(line)) ? "Add or preserve one obvious setup/quick-start section near the top." : null,
      repoLinks.length > 6 ? "Review public GitHub links and remove stale or duplicate repository destinations." : null
    ].filter(Boolean);
    return {
      schema_version: 1,
      operation_result: "reported",
      repo,
      files: files.map(({ path: filePath, bytes }) => ({ path: filePath, bytes })),
      package: packageData ? { name: packageData.name || null, version: packageData.version || null, repository: packageData.repository || null } : null,
      public_api: publicData ? { schema_version: publicData.schema_version || null, version: publicData.version || null, entry_count: Array.isArray(publicData.entries) ? publicData.entries.length : Array.isArray(publicData) ? publicData.length : null } : null,
      readme: readme ? { bytes: readme.bytes, headings: headings.length, badges: badges.length, core_mcp_named: hasCore, tools_mcp_named: hasTools, setup_command_named: hasSetup } : null,
      github_repositories_linked: repoLinks,
      findings,
      simplification_suggestions: suggestions,
      consistency_status: findings.some((item) => item.severity === "high") ? "blocked" : findings.length ? "review_needed" : "consistent_in_bounded_audit",
      content_modified: false,
      limitations: ["This is a bounded local consistency and front-page complexity audit, not a product or writing-quality certification.", "External links were not crawled by this tool.", "Only the listed files and explicit signals were compared."],
      safe_next_step: findings[0]?.message || suggestions[0] || "Keep the current public surface and rerun after any package, install, architecture, or repository-link change."
    };
  }

  async ownerRepo(cwd, explicit) {
    if (explicit) return cleanRepo(explicit);
    const remote = await this.runProcess("git", ["remote", "get-url", "origin"], processOptions(cwd, 8_000));
    return parseGithubRepo(remote.stdout);
  }

  async branchProtection(cwd, repo, branch) {
    if (!repo) return { status: "repo_unresolved", protected: null };
    const endpoint = `repos/${repo}/branches/${encodeURIComponent(branch)}/protection`;
    const result = await this.runProcess("gh", ["api", "--method", "GET", endpoint], processOptions(cwd, 32 * 1024, 20_000));
    if (result.ok) return { status: "reported", protected: true, required_status_checks: Boolean(parseJson(result.stdout)?.required_status_checks), restrictions: Boolean(parseJson(result.stdout)?.restrictions) };
    const message = this.redact(`${result.stderr}\n${result.stdout}`.trim());
    if (/404|not protected/i.test(message)) return { status: "not_protected", protected: false };
    return { status: "unavailable_or_access_denied", protected: null, error: message.slice(0, 500) };
  }

  async runJson(command, args, cwd, maxBytes = DEFAULT_MAX_BYTES, timeoutMs = 20_000) {
    const result = await this.runProcess(command, args, processOptions(cwd, maxBytes, timeoutMs));
    if (!result.ok) return { ok: false, value: null, result };
    try { return { ok: true, value: JSON.parse(result.stdout), result }; }
    catch (error) { return { ok: false, value: null, result: { ...result, stderr: `${result.stderr}\nJSON parse failed: ${error.message}`.trim() } }; }
  }
}

function isGithubPatchTooLarge(result) {
  return /(?:HTTP 406|diff exceeded the maximum|PullRequest\.diff too_large)/i.test(`${result?.stderr || ""}\n${result?.stdout || ""}`);
}

function scanPatch(patch, redact) {
  const findings = [];
  let currentPath = null;
  let newLine = 0;
  let bidiCount = 0;
  let secretCount = 0;
  for (const line of String(patch || "").split(/\r?\n/)) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) { currentPath = normalizePath(fileMatch[1]); continue; }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) { newLine = Number(hunk[1]); continue; }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      const content = line.slice(1);
      if (BIDI_PATTERN.test(content)) {
        bidiCount += 1;
        findings.push({ severity: "high", code: "hidden_or_bidi_unicode", path: currentPath, line: newLine || null, message: "An added line contains a bidirectional or directional-control character.", excerpt: redact(content).replace(BIDI_PATTERN, "[CONTROL]").slice(0, 300) });
      }
      if (containsLikelySecret(content)) {
        secretCount += 1;
        findings.push({ severity: "high", code: "secret_like_addition", path: currentPath, line: newLine || null, message: "An added line contains a secret-like value and must not be committed.", excerpt: redact(content).slice(0, 300) });
      }
      newLine += 1;
    } else if (!line.startsWith("-") && !line.startsWith("diff --git") && !line.startsWith("index ")) newLine += 1;
  }
  return { findings, bidi_count: bidiCount, secret_count: secretCount };
}

function containsLikelySecret(text) {
  if (/\b(?:EXAMPLE|CANARY|REDACTED|PLACEHOLDER|FAKE|TEST_ONLY)\b/i.test(text)) return false;
  if (SECRET_VALUE_PATTERN.test(text) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) || /\bAKIA[0-9A-Z]{16}\b/.test(text)) return true;
  const assignment = text.match(SECRET_ASSIGNMENT_PATTERN);
  return Boolean(assignment && !/[\[({+*?\\]/.test(assignment[1]));
}

function normalizePrFiles(files) {
  return arrayify(files).map((file) => ({ path: normalizePath(file.path || file.filename || ""), status: String(file.status || "modified").toUpperCase().slice(0, 1), additions: Number(file.additions) || 0, deletions: Number(file.deletions) || 0, binary: file.additions === null || file.deletions === null }));
}

function parseNameStatus(text) {
  return String(text || "").split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split("\t");
    const status = parts[0];
    const filePath = status.startsWith("R") || status.startsWith("C") ? parts[2] : parts[1];
    return { path: normalizePath(filePath || ""), status, previous_path: status.startsWith("R") || status.startsWith("C") ? normalizePath(parts[1] || "") : null };
  });
}

function parseNumstat(text) {
  const out = new Map();
  for (const line of String(text || "").split(/\r?\n/).filter(Boolean)) {
    const [added, deleted, filePath] = line.split("\t");
    out.set(normalizePath(filePath || ""), { additions: added === "-" ? null : Number(added) || 0, deletions: deleted === "-" ? null : Number(deleted) || 0, binary: added === "-" || deleted === "-" });
  }
  return out;
}

function mergeLocalDiffFiles(names, numbers) {
  return names.map((file) => ({ ...file, ...(numbers.get(file.path) || { additions: 0, deletions: 0, binary: false }) }));
}

function inferFilesFromPatch(patch) {
  return [...String(patch || "").matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map((match) => ({ path: normalizePath(match[2]), status: "M", additions: 0, deletions: 0, binary: false }));
}

function fileRiskFinding(file) {
  const value = file.path.toLowerCase();
  if (SECRET_PATH_PATTERN.test(value)) return [{ severity: "high", code: "secret_like_path", path: file.path, line: null, message: "A secret-like path is present in the diff." }];
  if (value.startsWith(".github/workflows/")) return [{ severity: "medium", code: "workflow_change", path: file.path, line: null, message: "Workflow changes require permission, action-version, trigger, and secret-context review." }];
  if (/^(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(value)) return [{ severity: "medium", code: "dependency_surface_change", path: file.path, line: null, message: "Dependency or lifecycle-script changes require lockfile and install-hook review." }];
  if (/^scripts\/|\.(?:ps1|cmd|bat|sh)$/.test(value)) return [{ severity: "info", code: "execution_surface_change", path: file.path, line: null, message: "Executable/tooling changes should be traced to focused behavior tests." }];
  return [];
}

function classifyFile(filePath) {
  const value = String(filePath || "").toLowerCase();
  if (/^(?:\.vnem\/runtime-|docs\/vnem_tool_registry|public\/api\/index|llms(?:-full)?\.txt|public\/install)/.test(value)) return "generated";
  if (/(^|\/)(?:test|tests|fixtures)(\/|\.)|\.test\.|\.spec\./.test(value)) return "test";
  if (value.startsWith(".github/")) return "workflow";
  if (/\.(?:md|mdx|rst|txt)$/.test(value)) return "docs";
  if (/\.(?:png|jpg|jpeg|gif|webp|ico|tgz|zip|pdf)$/.test(value)) return "binary_asset";
  if (/\.(?:js|mjs|cjs|ts|tsx|jsx|py|rs|go|java|cs|lua|luau)$/.test(value)) return "source";
  return "configuration_or_other";
}

function reviewFocus(files, findings) {
  const focus = [];
  if (files.some((file) => classifyFile(file.path) === "source")) focus.push("Trace source behavior to focused tests and error/permission paths.");
  if (files.some((file) => classifyFile(file.path) === "test")) focus.push("Confirm tests exercise handlers through the real MCP or runtime path rather than source-text presence only.");
  if (files.some((file) => classifyFile(file.path) === "generated")) focus.push("Verify generated ownership, deterministic regeneration, and absence of unrelated churn.");
  if (files.some((file) => classifyFile(file.path) === "workflow")) focus.push("Inspect workflow triggers, permissions, action SHAs/versions, secrets, and branch behavior.");
  if (findings.some((item) => item.severity === "high")) focus.unshift("Resolve high-severity secret/control/path findings before approval.");
  return focus.length ? focus : ["Inspect the complete bounded change set and its affected verification before approval."];
}

function normalizeCheckRollup(items) {
  return arrayify(items).map((item) => ({ name: item.name || item.context || null, status: item.status || item.state || null, conclusion: item.conclusion || null, url: item.detailsUrl || item.targetUrl || null }));
}

function parseTagRefs(text, tag) {
  let direct = null;
  let peeled = null;
  for (const line of String(text || "").split(/\r?\n/).filter(Boolean)) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (ref === `refs/tags/${tag}^{}`) peeled = normalizeSha(sha);
    if (ref === `refs/tags/${tag}`) direct = normalizeSha(sha);
  }
  return { exists: Boolean(direct || peeled), sha: peeled || direct, direct_sha: direct, annotated: Boolean(peeled) };
}

function parseGithubRepo(remoteUrl) {
  const match = String(remoteUrl || "").trim().match(/github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/i);
  return match ? `${match[1]}/${match[2].replace(/\.git$/i, "")}` : null;
}

function extractGithubRepos(text) {
  return [...String(text || "").matchAll(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi)].map((match) => `${match[1]}/${match[2].replace(/(?:\.git|[)#?].*)$/i, "")}`);
}

function cleanRevision(value, label) {
  const text = String(value || "").trim();
  if (!REVISION_PATTERN.test(text) || text.startsWith("-") || text.includes("..")) throw new GithubDevelopmentError(`${label} is not a safe Git revision.`, "github_revision_invalid", { value: text });
  return text;
}

function cleanBranch(value) {
  const text = String(value || "").trim();
  if (!BRANCH_PATTERN.test(text) || text.startsWith("-") || text.includes("..") || text.includes("//") || text.endsWith("/")) throw new GithubDevelopmentError("Branch name is invalid or unsafe.", "github_branch_invalid", { branch: text });
  return text;
}

function cleanRemote(value) {
  const text = String(value || "").trim();
  if (!REMOTE_PATTERN.test(text) || text.startsWith("-")) throw new GithubDevelopmentError("Remote name is invalid or unsafe.", "github_remote_invalid", { remote: text });
  return text;
}

function cleanTag(value) {
  const text = String(value || "").trim();
  if (!TAG_PATTERN.test(text) || text.startsWith("-") || text.includes("..")) throw new GithubDevelopmentError("Release tag is invalid or unsafe.", "github_release_tag_invalid", { tag: text });
  return text;
}

function cleanRepo(value) {
  const text = String(value || "").trim();
  if (!REPO_PATTERN.test(text)) throw new GithubDevelopmentError("Repository must be exact owner/name.", "github_repo_invalid", { repo: text });
  return text;
}

function cleanRelativePath(value) {
  const text = normalizePath(String(value || "").trim());
  if (!text || path.isAbsolute(text) || text.startsWith("../") || text.includes("/../") || /[\u0000\r\n]/.test(text)) throw new GithubDevelopmentError("Public-surface path must be a safe repository-relative path.", "github_public_surface_path_invalid", { path: text });
  return text;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new GithubDevelopmentError(`${label} must be a positive integer.`, "github_identifier_invalid", { label });
  return number;
}

function optionalPositiveInteger(value, label) {
  return value === undefined || value === null || value === "" ? null : positiveInteger(value, label);
}

function normalizeSha(value) {
  const text = String(value || "").trim().toLowerCase();
  return SHA_PATTERN.test(text) ? text : null;
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
}

function processOptions(cwd, maxOutputBytes, timeoutMs = 15_000) {
  return { cwd, maxOutputBytes, timeoutMs };
}

function blockedRead(tool, reason, result = {}) {
  return { schema_version: 1, operation_result: "blocked", tool, blocked_reason: reason, error_redacted: `${result.stderr || ""}\n${result.stdout || ""}`.trim().slice(0, 800), mutation_performed: false, must_not_claim: ["The requested live GitHub proof was collected."], safe_next_step: "Fix GitHub authentication, repository context, network access, or the exact target and retry the read." };
}

function finding(severity, code, filePath, message) {
  return { severity, code, path: filePath, line: null, message };
}

function parseJson(value) {
  try { return JSON.parse(String(value || "")); } catch { return null; }
}

function sum(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function countBy(values) {
  return Object.fromEntries([...new Set(values)].map((value) => [value, values.filter((item) => item === value).length]));
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function arrayify(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export const GITHUB_DEVELOPMENT_MARKERS = Object.freeze({
  review: sha256("bounded diff review|review threads|hidden unicode|secret additions"),
  proof: sha256("local head|remote branch|PR head|Actions exact SHA|release tag"),
  safety: sha256("read-only gh/git|protected branch|no force push|no repo delete|redacted bounded logs")
});
