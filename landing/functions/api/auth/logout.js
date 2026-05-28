import { clearSessionCookie, jsonResponse } from "../../_shared/auth.js";

export async function onRequestPost() {
  return jsonResponse(
    {
      ok: true,
      authenticated: false
    },
    { headers: { "set-cookie": clearSessionCookie() } }
  );
}
