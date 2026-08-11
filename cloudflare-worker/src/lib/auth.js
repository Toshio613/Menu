import { jsonError } from "./http.js";

const encoder = new TextEncoder();

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function createFamilyToken(env) {
  if (!env.TOKEN_SECRET) throw new Error("TOKEN_SECRET_MISSING");
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(300, Number(env.AUTH_TOKEN_TTL_SECONDS) || 604800);
  const payload = base64Url(encoder.encode(JSON.stringify({ sub: "family", iat: now, exp: now + ttl })));
  return `${payload}.${base64Url(await hmac(payload, env.TOKEN_SECRET))}`;
}

export async function verifyFamilyToken(token, env) {
  if (!token || !env.TOKEN_SECRET) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  try {
    const expected = await hmac(payload, env.TOKEN_SECRET);
    const actual = decodeBase64Url(signature);
    if (actual.length !== expected.length) return false;
    const key = await crypto.subtle.importKey("raw", encoder.encode(env.TOKEN_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, actual, encoder.encode(payload))) return false;
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    return claims.sub === "family" && Number.isInteger(claims.exp) && claims.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function passwordsMatch(value, expected) {
  if (!value || !expected) return false;
  const left = await hmac(String(value), "menu-pic-password-check");
  const right = await hmac(String(expected), "menu-pic-password-check");
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function requireFamilyAuth(request, env, cors) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return await verifyFamilyToken(token, env)
    ? null
    : jsonError("AUTH_REQUIRED", "家族ログインが必要です。", 401, cors);
}
