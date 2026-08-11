import { isRecipeResult } from "../src/schemas/recipe.js";
import { selectedModel, validClientId } from "../src/lib/validation.js";
import { validateRecipeResult } from "../../js/recipe-photo.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const recipe = {
  name: "豚の生姜焼き",
  category: "main",
  servings: 2,
  time: 20,
  confidence: 72,
  ingredients: [{ category: "肉・魚", name: "豚肉", amount: 250, unit: "g" }],
  steps: ["豚肉を焼く"]
};

assert(isRecipeResult(recipe), "正常なレシピを受け入れること");
assert(validateRecipeResult({ ...recipe, season: "none", icon: "🍳", attributes: [], memo: "", warnings: [] }), "フロントエンドも正常なレシピを受け入れること");
assert(!isRecipeResult({ ...recipe, confidence: 101 }), "confidence上限を検証すること");
assert(!isRecipeResult({ ...recipe, ingredients: [] }), "空の材料を拒否すること");
assert(selectedModel("vision-low-cost", {
  DEFAULT_OPENAI_MODEL: "fallback",
  ALLOWED_OPENAI_MODELS: "vision-low-cost,fallback"
}) === "vision-low-cost", "許可された設定モデルを採用すること");
assert(selectedModel("not-allowed", {
  DEFAULT_OPENAI_MODEL: "fallback",
  ALLOWED_OPENAI_MODELS: "vision-low-cost,fallback"
}) === null, "許可されていないモデルを拒否すること");
assert(validClientId("client-1234567890") === "client-1234567890", "端末IDを検証すること");
