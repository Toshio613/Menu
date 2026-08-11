import { APP_CONFIG } from "./app-config.js";

const TOKEN_KEY = "familyAuthToken";
const CLIENT_ID_KEY = "menuPicClientId";

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getClientId() {
  let value = localStorage.getItem(CLIENT_ID_KEY);
  if (!value) {
    value = crypto.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, value);
  }
  return value;
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", body, timeoutMs = APP_CONFIG.api.timeoutMs, auth = true } = options;
  if (!APP_CONFIG.api.baseUrl) throw new ApiError("API_URL_MISSING", "APIのURLが未設定です。");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers();
  if (body !== undefined && !(body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (auth && getAuthToken()) headers.set("Authorization", `Bearer ${getAuthToken()}`);
  try {
    const response = await fetch(`${APP_CONFIG.api.baseUrl}${path}`, {
      method, headers, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body), signal: controller.signal
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && auth) setAuthToken("");
      throw new ApiError(payload?.error?.code || "HTTP_ERROR", payload?.error?.message || "通信に失敗しました。", response.status);
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new ApiError("TIMEOUT", "通信がタイムアウトしました。");
    if (error instanceof ApiError) throw error;
    throw new ApiError("NETWORK_ERROR", "サーバーへ接続できませんでした。");
  } finally {
    clearTimeout(timeout);
  }
}
