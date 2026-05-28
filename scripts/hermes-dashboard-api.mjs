#!/usr/bin/env node
import http from "node:http";
import { buildHermesDashboardSummary } from "./lib/hermes-dashboard-summary.mjs";

const host = process.env.HERMES_DASHBOARD_API_HOST ?? "127.0.0.1";
const port = Number(process.env.HERMES_DASHBOARD_API_PORT ?? 8788);
const token = process.env.HERMES_DASHBOARD_API_TOKEN;

if (!token) {
  console.error("HERMES_DASHBOARD_API_TOKEN is required.");
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");

  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, { ok: true, service: "vnem-hermes-dashboard-api" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/summary") {
      if (request.headers.authorization !== `Bearer ${token}`) {
        writeJson(response, 401, { ok: false, error: "missing-or-invalid-dashboard-token" });
        return;
      }
      const summary = await buildHermesDashboardSummary();
      writeJson(response, 200, { ok: true, ...summary });
      return;
    }

    writeJson(response, 404, { ok: false, error: "not-found" });
  } catch (error) {
    writeJson(response, 500, { ok: false, error: "dashboard-api-error", message: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`vnem Hermes dashboard API listening on http://${host}:${port}`);
});

function writeJson(response, status, body) {
  response.statusCode = status;
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}
