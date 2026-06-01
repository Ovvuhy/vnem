#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import bs58 from "bs58";
import nacl from "tweetnacl";

const port = 18788;
const token = "local-test-token";
const secret = "local-test-secret-with-enough-entropy";
const keyPair = nacl.sign.keyPair();
const walletAddress = bs58.encode(keyPair.publicKey);
const child = spawn(process.execPath, ["scripts/hermes-dashboard-api.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HERMES_DASHBOARD_API_HOST: "127.0.0.1",
    HERMES_DASHBOARD_API_PORT: String(port),
    HERMES_DASHBOARD_API_TOKEN: token,
    DASHBOARD_AUTH_SECRET: secret,
    DASHBOARD_ALLOWED_WALLETS: walletAddress
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

let stdout = "";
let stderr = "";

try {
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  await waitForServer();

  const health = await requestJson("GET", "/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.service, "vnem-hermes-dashboard-api");

  const preflight = await requestRaw("OPTIONS", "/api/auth/nonce", null, {
    origin: "http://127.0.0.1:4174",
    "access-control-request-method": "POST"
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], "http://127.0.0.1:4174");
  assert.equal(preflight.headers["access-control-allow-credentials"], "true");

  const invalidJson = await requestRaw("POST", "/api/auth/nonce", "{", {
    "content-type": "application/json"
  });
  assert.equal(invalidJson.status, 400);
  assert.equal(JSON.parse(invalidJson.text).error, "invalid-json-body");

  const sessionBefore = await requestJson("GET", "/api/auth/session");
  assert.equal(sessionBefore.status, 200);
  assert.equal(sessionBefore.body.configured, true);
  assert.equal(sessionBefore.body.authenticated, false);

  const challenge = await requestJson("POST", "/api/auth/nonce", {
    wallet_address: walletAddress
  });
  assert.equal(challenge.status, 200);
  assert.equal(typeof challenge.body.challenge, "string");
  assert.equal(typeof challenge.body.message, "string");
  assert.equal(challenge.body.sign_in_input.address, walletAddress);

  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge.body.message), keyPair.secretKey));
  const verify = await requestJson("POST", "/api/auth/verify", {
    challenge: challenge.body.challenge,
    wallet_address: walletAddress,
    signature,
    message: challenge.body.message
  });
  assert.equal(verify.status, 200);
  assert.equal(verify.body.authenticated, true);
  assert.equal(verify.body.wallet_address, walletAddress);
  const cookie = Array.isArray(verify.headers["set-cookie"])
    ? verify.headers["set-cookie"][0]
    : verify.headers["set-cookie"];
  assert.ok(cookie, "verify must set a dashboard session cookie");
  assert.equal(cookie.includes("Secure"), false, "local HTTP cookie must not require Secure");

  const sessionAfter = await requestJson("GET", "/api/auth/session", null, { cookie });
  assert.equal(sessionAfter.status, 200);
  assert.equal(sessionAfter.body.authenticated, true);
  assert.equal(sessionAfter.body.wallet_address, walletAddress);

  const summary = await requestJson("GET", "/api/dashboard/summary", null, { cookie });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.ok, true);
  assert.ok(summary.body.generated_at || summary.body.aggregates || summary.body.findings);

  const deniedSummary = await requestJson("GET", "/api/dashboard/summary");
  assert.equal(deniedSummary.status, 401);
  assert.equal(deniedSummary.body.error, "dashboard-session-required");

  const logout = await requestJson("POST", "/api/auth/logout", null, { cookie });
  assert.equal(logout.status, 200);
  assert.equal(logout.body.authenticated, false);

  const legacyNonce = await requestJson("GET", "/api/auth/nonce");
  assert.equal(legacyNonce.status, 200);
  assert.equal(typeof legacyNonce.body.nonce, "string");

  const bearerSummary = await requestJson("GET", "/summary", null, {
    authorization: `Bearer ${token}`
  });
  assert.equal(bearerSummary.status, 200);
  assert.equal(bearerSummary.body.ok, true);

  console.log("local Hermes dashboard API tests passed");
} finally {
  child.kill();
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Hermes API did not start. stdout=${stdout}; stderr=${stderr}`));
    }, 8000);

    child.stdout.on("data", () => {
      if (stdout.includes(`http://127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Hermes API exited early with ${code}. stdout=${stdout}; stderr=${stderr}`));
    });
  });
}

async function requestJson(method, route, body, headers = {}) {
  const response = await requestRaw(method, route, body == null ? null : JSON.stringify(body), {
    ...(body == null ? {} : { "content-type": "application/json" }),
    ...headers
  });
  return {
    ...response,
    body: response.text ? JSON.parse(response.text) : {}
  };
}

function requestRaw(method, route, requestBody, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: route,
        method,
        headers: {
          host: `127.0.0.1:${port}`,
          origin: "http://127.0.0.1:4174",
          accept: "application/json",
          ...(requestBody ? { "content-length": Buffer.byteLength(requestBody) } : {}),
          ...headers
        }
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            text
          });
        });
      }
    );
    request.on("error", reject);
    if (requestBody) {
      request.write(requestBody);
    }
    request.end();
  });
}
