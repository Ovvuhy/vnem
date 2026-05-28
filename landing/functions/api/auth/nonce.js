import { authErrorResponse, createLoginChallenge, errorResponse, jsonResponse } from "../../_shared/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const origin = new URL(request.url).origin;
    const result = await createLoginChallenge({
      walletAddress: body.wallet_address,
      origin
    }, env);
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse(400, "invalid-json");
    return authErrorResponse(error);
  }
}
