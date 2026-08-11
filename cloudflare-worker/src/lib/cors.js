export function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean));
}

export function isAllowedOrigin(origin, env) {
  return Boolean(origin) && allowedOrigins(env).has(origin);
}

export function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
