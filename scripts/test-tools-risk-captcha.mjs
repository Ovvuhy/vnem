#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
await mkdir(path.join(rootDir, ".tmp"), { recursive: true });
const tmpRoot = await mkdtemp(path.join(rootDir, ".tmp", "tools-risk-captcha-"));
const workspace = path.join(tmpRoot, "workspace");
await mkdir(workspace, { recursive: true });

const redirectServer = createServer((request, response) => {
  if (request.url === "/start") {
    response.writeHead(302, { location: "/middle" });
    response.end();
  } else if (request.url === "/middle") {
    response.writeHead(302, { location: "http://evil-download.example.ru/setup.exe" });
    response.end();
  } else {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<title>done</title>");
  }
});
await new Promise((resolve) => redirectServer.listen(0, "127.0.0.1", resolve));
const redirectUrl = `http://127.0.0.1:${redirectServer.address().port}/start`;

const client = new Client({ name: "vnem-tools-risk-captcha-test", version: "1.0.1" }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(scriptDir, "vnem-tools-mcp-server.mjs")], cwd: rootDir, env: { ...process.env, VNEM_TOOLS_ALLOWED_ROOTS: workspace, VNEM_TOOLS_PERMISSION_PROFILE: "safe-local-dev", VNEM_TOOLS_EVIDENCE_ROOT: path.join(workspace, ".vnem", "tool-runs"), VNEM_TOOLS_ALLOW_LOCALHOST: "1" }, stderr: "pipe" });
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await client.connect(transport);
  const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of ["vnem_tools_redirect_chain_check", "vnem_tools_url_reputation_check", "vnem_tools_captcha_detector", "vnem_tools_download_safety_check"]) assert.equal(toolNames.has(name), true, `missing ${name}`);

  const redirectDry = await client.callTool({ name: "vnem_tools_redirect_chain_check", arguments: { url: "https://example.com/login", dry_run: true } });
  const dry = redirectDry.structuredContent?.redirect_chain_check;
  assert.equal(dry.dry_run, true);
  assert.equal(dry.executed, false);
  assert.ok(dry.must_not_claim.some((item) => /redirect chain was checked/i.test(item)));

  const redirectCall = await client.callTool({ name: "vnem_tools_redirect_chain_check", arguments: { url: redirectUrl, dry_run: false, approved: true, approval_note: "local redirect fixture", max_redirects: 5 } });
  const redirect = redirectCall.structuredContent?.redirect_chain_check;
  assert.equal(redirect.executed, true);
  assert.ok(redirect.redirect_chain.length >= 2);
  assert.match(redirect.final_url, /evil-download\.example\.ru\/setup\.exe/);
  assert.equal(redirect.same_domain, false);
  assert.ok(redirect.cross_domain_redirects.length >= 1);
  assert.ok(redirect.suspicious_redirects.some((item) => /download|cross-domain|executable|suspicious/i.test(item.reason)));
  assert.ok(redirect.evidence_log_id);

  const reputationCall = await client.callTool({ name: "vnem_tools_url_reputation_check", arguments: { url: "https://paypaI-login-security.example.xyz/download/update.exe?password=secret", redirect_chain: redirect.redirect_chain } });
  const reputation = reputationCall.structuredContent?.url_reputation_check;
  assert.match(reputation.risk_level, /high|critical/i);
  assert.ok(reputation.risk_flags.some((item) => /credential|download|phishing|suspicious|punycode|shortener|redirect/i.test(item)));
  assert.equal(reputation.safe_to_download, false);
  assert.equal(reputation.requires_user_confirmation, true);
  assert.ok(reputation.must_not_claim.some((item) => /antivirus|safe/i.test(item)));
  assert.ok(reputation.evidence_log_id);

  const captchaHtml = `<!doctype html><title>Access Check</title><h1>Verify you are human</h1><div class="g-recaptcha" data-sitekey="test"></div><p>Cloudflare Ray ID: abc123</p>`;
  const captchaCall = await client.callTool({ name: "vnem_tools_captcha_detector", arguments: { html: captchaHtml, url: "https://example.com/protected" } });
  const captcha = captchaCall.structuredContent?.captcha_detector;
  assert.equal(captcha.captcha_or_block_detected, true);
  assert.match(captcha.block_type, /captcha|anti_bot|access_block/i);
  assert.equal(captcha.user_assisted_handoff_required, true);
  assert.ok(captcha.recommended_safe_next_steps.some((item) => /manually|paste|official API|stop/i.test(item)));
  assert.ok(captcha.alternative_research_paths.length > 0);
  assert.ok(captcha.must_not_claim.some((item) => /No automatic CAPTCHA bypass was attempted or provided/i.test(item)));
  assert.ok(captcha.evidence_log_id);

  const downloadDry = await client.callTool({ name: "vnem_tools_download_safety_check", arguments: { download_url: "https://vendor.example.com/tool.zip", dry_run: true } });
  assert.equal(downloadDry.structuredContent?.download_safety_check?.executed_head_request, false);
  const downloadCall = await client.callTool({ name: "vnem_tools_download_safety_check", arguments: { download_url: "https://free-vnem-update.example.xyz/installer.exe", source_page_url: "https://free-vnem-update.example.xyz", source_quality_score: 20 } });
  const download = downloadCall.structuredContent?.download_safety_check;
  assert.match(download.file_type_guess, /executable/i);
  assert.match(download.risk_level, /high|critical/i);
  assert.ok(download.risk_flags.some((item) => /executable|fake download|low source|suspicious/i.test(item)));
  assert.equal(download.requires_manual_review, true);
  assert.ok(download.must_not_claim.some((item) => /downloaded|safe/i.test(item)));
  assert.ok(download.evidence_log_id);

  console.log("vnem Tools risk/CAPTCHA tests passed");
} finally {
  await client.close().catch(() => {});
  redirectServer.close();
  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
