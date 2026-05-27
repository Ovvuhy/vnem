import { dashboardConfigured, jsonResponse, readSession } from "../../_shared/auth.js";

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  return jsonResponse({
    ok: true,
    configured: dashboardConfigured(env),
    authenticated: Boolean(session),
    wallet_address: session?.wallet_address ?? null,
    expires_at: session?.expires_at ?? null
  });
}
