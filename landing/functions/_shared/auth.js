import bs58 from "bs58";
import nacl from "tweetnacl";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const NONCE_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const COOKIE_NAME = "vnem_dashboard_session";

export function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {})
    }
  });
}

export function errorResponse(status, message, details = {}) {
  return jsonResponse({ ok: false, error: message, ...details }, { status });
}

export function allowedWallets(env) {
  return String(env?.DASHBOARD_ALLOWED_WALLETS ?? "")
    .split(",")
    .map((wallet) => wallet.trim())
    .filter(Boolean);
}

export function isWalletAllowed(walletAddress, env) {
  const allowed = allowedWallets(env);
  return allowed.length > 0 && allowed.includes(walletAddress);
}

export function dashboardConfigured(env) {
  return Boolean(env?.DASHBOARD_AUTH_SECRET && allowedWallets(env).length > 0);
}

export function createCanonicalMessage(payload) {
  return [
    "vnem hermes dashboard",
    "",
    `${payload.domain} wants you to sign in with your Solana wallet.`,
    "",
    `Wallet: ${payload.wallet_address}`,
    `URI: ${payload.uri}`,
    `Version: 1`,
    `Issued At: ${payload.issued_at}`,
    `Expiration Time: ${payload.expires_at}`,
    `Nonce: ${payload.nonce}`,
    `Intent: read sanitized Hermes operational summary`
  ].join("\n");
}

export function signInInputForPayload(payload) {
  return {
    domain: payload.domain,
    address: payload.wallet_address,
    statement: "Read the sanitized vnem Hermes owner dashboard.",
    uri: payload.uri,
    version: "1",
    nonce: payload.nonce,
    issuedAt: payload.issued_at,
    expirationTime: payload.expires_at
  };
}

export async function createLoginChallenge({ walletAddress, origin, now = new Date() }, env) {
  if (!dashboardConfigured(env)) {
    throw new DashboardAuthError(503, "dashboard-auth-not-configured");
  }

  if (!walletAddress || !isWalletAllowed(walletAddress, env)) {
    throw new DashboardAuthError(403, "wallet-not-allowlisted");
  }

  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + NONCE_TTL_SECONDS * 1000).toISOString();
  const domain = domainFromOrigin(origin);
  const payload = {
    kind: "vnem-dashboard-login",
    domain,
    wallet_address: walletAddress,
    uri: `${origin.replace(/\/+$/, "")}/dashboard/`,
    issued_at: issuedAt,
    expires_at: expiresAt,
    nonce: randomNonce()
  };
  payload.message = createCanonicalMessage(payload);
  payload.sign_in_input = signInInputForPayload(payload);

  return {
    challenge: await signObject(payload, env.DASHBOARD_AUTH_SECRET),
    message: payload.message,
    sign_in_input: payload.sign_in_input,
    expires_at: payload.expires_at
  };
}

export async function verifySignedLogin({ challenge, walletAddress, signature, message, now = new Date() }, env) {
  if (!dashboardConfigured(env)) {
    throw new DashboardAuthError(503, "dashboard-auth-not-configured");
  }

  const payload = await verifyObject(challenge, env.DASHBOARD_AUTH_SECRET);
  if (payload.kind !== "vnem-dashboard-login") {
    throw new DashboardAuthError(400, "invalid-challenge-kind");
  }
  if (payload.wallet_address !== walletAddress) {
    throw new DashboardAuthError(400, "wallet-address-mismatch");
  }
  if (!isWalletAllowed(walletAddress, env)) {
    throw new DashboardAuthError(403, "wallet-not-allowlisted");
  }
  if (new Date(payload.expires_at).getTime() <= now.getTime()) {
    throw new DashboardAuthError(401, "login-challenge-expired");
  }

  const expectedMessage = createCanonicalMessage(payload);
  const signedMessage = String(message ?? expectedMessage);
  if (signedMessage !== expectedMessage && !isValidSignInMessage(signedMessage, payload)) {
    throw new DashboardAuthError(400, "signed-message-does-not-match-challenge");
  }

  if (!verifySolanaSignature(walletAddress, signedMessage, signature)) {
    throw new DashboardAuthError(401, "invalid-wallet-signature");
  }

  return {
    wallet_address: walletAddress,
    expires_at: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString()
  };
}

export async function createSessionCookie(session, env, options = {}) {
  const now = options.now ?? new Date();
  const payload = {
    kind: "vnem-dashboard-session",
    wallet_address: session.wallet_address,
    issued_at: now.toISOString(),
    expires_at: session.expires_at
  };
  const value = await signObject(payload, env.DASHBOARD_AUTH_SECRET);
  return [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.floor((new Date(payload.expires_at).getTime() - now.getTime()) / 1000))}`
  ].join("; ");
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function readSession(request, env, options = {}) {
  if (!env?.DASHBOARD_AUTH_SECRET) return null;

  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!value) return null;

  try {
    const payload = await verifyObject(value, env.DASHBOARD_AUTH_SECRET);
    if (payload.kind !== "vnem-dashboard-session") return null;
    if (new Date(payload.expires_at).getTime() <= (options.now ?? new Date()).getTime()) return null;
    if (!isWalletAllowed(payload.wallet_address, env)) return null;
    return {
      wallet_address: payload.wallet_address,
      expires_at: payload.expires_at
    };
  } catch {
    return null;
  }
}

export class DashboardAuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function authErrorResponse(error) {
  if (error instanceof DashboardAuthError) {
    return errorResponse(error.status, error.message);
  }
  return errorResponse(500, "dashboard-auth-error");
}

function domainFromOrigin(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return "vnem.pages.dev";
  }
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}

async function signObject(value, secret) {
  const body = base64UrlEncodeString(JSON.stringify(value));
  const signature = await hmac(body, secret);
  return `${body}.${signature}`;
}

async function verifyObject(token, secret) {
  const [body, signature] = String(token ?? "").split(".");
  if (!body || !signature) throw new DashboardAuthError(400, "invalid-signed-token");
  const expected = await hmac(body, secret);
  if (!timingSafeEqual(signature, expected)) throw new DashboardAuthError(400, "invalid-token-signature");
  return JSON.parse(base64UrlDecodeString(body));
}

async function hmac(body, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(body));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function verifySolanaSignature(walletAddress, message, signature) {
  let publicKey;
  let signatureBytes;
  try {
    publicKey = bs58.decode(walletAddress);
    signatureBytes = decodeSignature(signature);
  } catch {
    return false;
  }
  if (publicKey.length !== 32 || signatureBytes.length !== 64) return false;
  return nacl.sign.detached.verify(textEncoder.encode(message), signatureBytes, publicKey);
}

function decodeSignature(signature) {
  if (signature instanceof Uint8Array) return signature;
  const value = String(signature ?? "").trim();
  if (!value) throw new Error("missing signature");
  try {
    return bs58.decode(value);
  } catch {
    return base64ToBytes(value);
  }
}

function isValidSignInMessage(message, payload) {
  return [
    payload.domain,
    payload.wallet_address,
    payload.uri,
    payload.nonce,
    payload.issued_at,
    payload.expires_at
  ].every((part) => message.includes(part));
}

function timingSafeEqual(a, b) {
  const left = textEncoder.encode(a);
  const right = textEncoder.encode(b);
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left[index] ^ right[index];
  }
  return result === 0;
}

function base64UrlEncodeString(value) {
  return base64UrlEncodeBytes(textEncoder.encode(value));
}

function base64UrlDecodeString(value) {
  return textDecoder.decode(base64UrlDecodeBytes(value));
}

function base64UrlEncodeBytes(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeBytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + (4 - (normalized.length % 4 || 4)), "=");
  return base64ToBytes(padded);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
