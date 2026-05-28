import { errorResponse, jsonResponse, readSession } from "../../_shared/auth.js";

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  if (!session) {
    return errorResponse(401, "dashboard-session-required");
  }

  if (!env.HERMES_API_BASE_URL || !env.HERMES_API_TOKEN) {
    return errorResponse(503, "hermes-api-not-configured");
  }

  const upstreamUrl = `${String(env.HERMES_API_BASE_URL).replace(/\/+$/, "")}/summary`;
  const upstream = await fetch(upstreamUrl, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${env.HERMES_API_TOKEN}`
    }
  });

  const text = await upstream.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { ok: false, error: "invalid-hermes-api-response" };
  }

  if (!upstream.ok) {
    return jsonResponse(
      {
        ok: false,
        error: body.error ?? "hermes-api-error",
        status: upstream.status
      },
      { status: upstream.status }
    );
  }

  return jsonResponse({ ok: true, ...body });
}
