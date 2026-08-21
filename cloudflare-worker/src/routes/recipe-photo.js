import { json, jsonError } from "../lib/http.js";
import { selectedModel, validClientId, validateImage } from "../lib/validation.js";
import { analyzeImage } from "../services/openai-client.js";
import { isRecipeResult, recipeSchema } from "../schemas/recipe.js";

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function handleRecipePhoto(request, env, cors) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  const maxBytes = Math.max(1, Number(env.MAX_IMAGE_BYTES) || 1_572_864);
  if (contentLength && contentLength > maxBytes + 50_000) return jsonError("IMAGE_TOO_LARGE", "画像サイズが上限を超えています。", 413, cors);
  let form;
  try { form = await request.formData(); } catch { return jsonError("INVALID_FORM", "送信データを読み取れません。", 400, cors); }
  const image = form.get("image");
  const imageError = validateImage(image, env);
  if (imageError) return jsonError(imageError.code, imageError.message, imageError.status, cors);
  const model = selectedModel(form.get("model"), env);
  if (!model) return jsonError("MODEL_NOT_ALLOWED", "設定されたAIモデルはWorkerで許可されていません。", 400, cors);
  const id = validClientId(form.get("clientId"));
  if (!id) return jsonError("INVALID_CLIENT", "端末識別情報が不正です。", 400, cors);
  if (!String(env.OPENAI_API_KEY || "").trim()) {
    return jsonError("OPENAI_CONFIG_MISSING", "AIサービスのAPIキーが設定されていません。", 503, cors);
  }
  if (env.AI_RATE_LIMITER) {
    const { success } = await env.AI_RATE_LIMITER.limit({ key: `recipe-photo:${id}` });
    if (!success) return jsonError("RATE_LIMITED", "短時間の利用回数が上限に達しました。", 429, cors);
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  const imageDataUrl = `data:${image.type};base64,${bytesToBase64(bytes)}`;
  try {
    const recipe = await analyzeImage({ apiKey: env.OPENAI_API_KEY, model, imageDataUrl, schema: recipeSchema });
    if (!isRecipeResult(recipe)) return jsonError("INVALID_AI_RESPONSE", "AIの解析結果が不正です。", 502, cors);
    if (recipe.confidence < 15) return jsonError("NOT_A_RECIPE", "料理を十分に判別できませんでした。", 422, cors);
    return json({ recipe }, 200, cors);
  } catch (error) {
    console.error("OpenAI request failed", { code: error.code, status: error.status, message: error.message });
    if (error.status === 429) return jsonError("OPENAI_RATE_LIMITED", "AIサービスの利用制限に達しました。", 429, cors);
    if (error.status === 401) return jsonError("OPENAI_AUTH_ERROR", "AIサービスの設定を確認してください。", 502, cors);
    return jsonError("AI_ANALYSIS_FAILED", "料理写真の解析に失敗しました。", 502, cors);
  }
}
