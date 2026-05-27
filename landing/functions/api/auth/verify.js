import {
  authErrorResponse,
  createSessionCookie,
  errorResponse,
  jsonResponse,
  verifySignedLogin
} from "../../_shared/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = await verifySignedLogin({
      challenge: body.challenge,
      walletAddress: body.wallet_address,
      signature: body.signature,
      message: body.message
    }, env);
    const cookie = await createSessionCookie(session, env);
    return jsonResponse(
      {
        ok: true,
        authenticated: true,
        wallet_address: session.wallet_address,
        expires_at: session.expires_at
      },
      { headers: { "set-cookie": cookie } }
    );
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse(400, "invalid-json");
    return authErrorResponse(error);
  }
}
