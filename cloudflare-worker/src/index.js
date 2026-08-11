import { handleRecipePhoto } from "./routes/recipe-photo.js";
import { corsHeaders, isAllowedOrigin } from "./lib/cors.js";
import { jsonError } from "./lib/http.js";

const routes = new Map([
  ["POST /api/analyze-recipe", handleRecipePhoto]
  // 将来: POST /api/ocr、POST /api/analyze-fridge、POST /api/build-shopping-list
]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin, env)) return jsonError("ORIGIN_NOT_ALLOWED", "許可されていないアクセス元です。", 403);
    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const handler = routes.get(`${request.method} ${url.pathname}`);
    if (!handler) return jsonError("NOT_FOUND", "APIが見つかりません。", 404, cors);
    try {
      return await handler(request, env, cors);
    } catch (error) {
      console.error("Unhandled Worker error", error);
      return jsonError("INTERNAL_ERROR", "サーバーで予期しないエラーが発生しました。", 500, cors);
    }
  }
};
