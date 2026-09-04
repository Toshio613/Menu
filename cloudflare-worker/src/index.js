import { handleRecipePhoto } from "./routes/recipe-photo.js";
import { handleLogin } from "./routes/auth.js";
import { handleRecipeImport, handleRecipeItem, handleRecipeList } from "./routes/recipes.js";
import { handleWeeklyMenu } from "./routes/weekly-menus.js";
import { requireFamilyAuth } from "./lib/auth.js";
import { corsHeaders, isAllowedOrigin } from "./lib/cors.js";
import { jsonError } from "./lib/http.js";

function routeFor(method, pathname) {
  if (method === "POST" && pathname === "/api/auth/login") return { handler: handleLogin };
  if (method === "POST" && pathname === "/api/analyze-recipe") return { handler: handleRecipePhoto };
  if (pathname === "/api/recipes" && ["GET", "POST"].includes(method)) return { handler: handleRecipeList, auth: true };
  if (method === "POST" && pathname === "/api/recipes/import") return { handler: handleRecipeImport, auth: true };
  const weeklyMenuMatch = pathname.match(/^\/api\/weekly-menus\/(\d{4}-\d{2}-\d{2})$/);
  if (weeklyMenuMatch && ["GET", "PUT"].includes(method)) {
    return { handler: handleWeeklyMenu, auth: true, params: { weekStart: weeklyMenuMatch[1] } };
  }
  const match = pathname.match(/^\/api\/recipes\/([^/]+)$/);
  if (match && ["GET", "PUT", "DELETE"].includes(method)) {
    return { handler: handleRecipeItem, auth: true, params: { id: decodeURIComponent(match[1]) } };
  }
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin, env)) return jsonError("ORIGIN_NOT_ALLOWED", "許可されていないアクセス元です。", 403);
    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const route = routeFor(request.method, url.pathname);
    if (!route) return jsonError("NOT_FOUND", "APIが見つかりません。", 404, cors);
    try {
      if (route.auth) {
        const authError = await requireFamilyAuth(request, env, cors);
        if (authError) return authError;
      }
      return await route.handler(request, env, cors, route.params || {});
    } catch (error) {
      console.error("Unhandled Worker error", error);
      return jsonError("INTERNAL_ERROR", "サーバーで予期しないエラーが発生しました。", 500, cors);
    }
  }
};
