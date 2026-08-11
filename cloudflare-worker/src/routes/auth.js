import { createFamilyToken, passwordsMatch } from "../lib/auth.js";
import { json, jsonError } from "../lib/http.js";

export async function handleLogin(request, env, cors) {
  if (!env.FAMILY_PASSWORD || !env.TOKEN_SECRET) {
    return jsonError("AUTH_NOT_CONFIGURED", "家族ログインが設定されていません。", 503, cors);
  }
  let body;
  try { body = await request.json(); } catch { return jsonError("INVALID_JSON", "ログイン情報を読み取れません。", 400, cors); }
  if (env.AI_RATE_LIMITER) {
    const clientId = String(body?.clientId || "");
    const key = /^[a-zA-Z0-9-]{12,100}$/.test(clientId) ? clientId : "unknown";
    const { success } = await env.AI_RATE_LIMITER.limit({ key: `family-login:${key}` });
    if (!success) return jsonError("RATE_LIMITED", "ログイン試行が多すぎます。少し待ってください。", 429, cors);
  }
  if (!await passwordsMatch(body?.password, env.FAMILY_PASSWORD)) {
    return jsonError("INVALID_PASSWORD", "家族パスワードが違います。", 401, cors);
  }
  const token = await createFamilyToken(env);
  return json({ token, expiresIn: Math.max(300, Number(env.AUTH_TOKEN_TTL_SECONDS) || 604800) }, 200, cors);
}
