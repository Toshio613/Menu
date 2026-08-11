export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export function jsonError(code, message, status, headers = {}, details) {
  return json({ error: { code, message, ...(details ? { details } : {}) } }, status, headers);
}
