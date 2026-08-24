import test from "node:test";
import assert from "node:assert/strict";
import { isRecipeResult } from "../src/schemas/recipe.js";
import { selectedModel, validClientId } from "../src/lib/validation.js";
import { normalizeRecipe } from "../src/lib/recipe-validation.js";
import { createFamilyToken, passwordsMatch, verifyFamilyToken } from "../src/lib/auth.js";
import { validateRecipeResult } from "../../js/recipe-photo.js";
import { recipeIcon } from "../../js/recipe-icon.js";

const recipe = {
  name: "豚の生姜焼き",
  category: "main",
  servings: 2,
  time: 20,
  confidence: 72,
  ingredients: [{ category: "肉・魚", name: "豚肉", amount: 250, unit: "g" }],
  steps: ["豚肉を焼く"]
};

test("写真解析結果をWorkerとフロントの両方で検証する", () => {
  assert.equal(isRecipeResult(recipe), true);
  assert.equal(validateRecipeResult({ ...recipe, season: "none", icon: "🍳", attributes: [], memo: "", warnings: [] }), true);
  assert.equal(isRecipeResult({ ...recipe, confidence: 101 }), false);
  assert.equal(isRecipeResult({ ...recipe, ingredients: [] }), false);
});

test("モデルと端末IDの許可リストを検証する", () => {
  const env = { DEFAULT_OPENAI_MODEL: "fallback", ALLOWED_OPENAI_MODELS: "vision-low-cost,fallback" };
  assert.equal(selectedModel("vision-low-cost", env), "vision-low-cost");
  assert.equal(selectedModel("not-allowed", env), null);
  assert.equal(validClientId("client-1234567890"), "client-1234567890");
});

test("D1へ保存するレシピを正規化する", () => {
  const normalized = normalizeRecipe({
    id: "ginger-pork", name: recipe.name, category: "main", season: "none", emoji: "🍳",
    cookingTime: recipe.time, servings: recipe.servings, attributes: [],
    ingredients: [["肉・魚", "豚肉", 250, "g"]], steps: recipe.steps, memo: "", confidence: 72
  });
  assert.equal(normalized?.id, "ginger-pork");
  assert.equal(normalizeRecipe({ ...normalized, category: "dessert" }), null);
});

test("旧形式や絵文字欠落データの料理アイコンを復元する", () => {
  assert.equal(recipeIcon({ icon: "🐟", type: "main" }), "🐟");
  assert.equal(recipeIcon({ emoji: "🥬", category: "side" }), "🥬");
  assert.equal(recipeIcon({ category: "main" }), "🍳");
  assert.equal(recipeIcon({ type: "side" }), "🥗");
  assert.equal(recipeIcon({ type: "soup", icon: "  " }), "🍲");
});

test("家族パスワードと期限付きトークンを検証する", async () => {
  const env = { TOKEN_SECRET: "test-token-secret-with-more-than-32-characters", AUTH_TOKEN_TTL_SECONDS: "600" };
  const token = await createFamilyToken(env);
  assert.equal(await verifyFamilyToken(token, env), true);
  assert.equal(await verifyFamilyToken(`${token}x`, env), false);
  assert.equal(await passwordsMatch("family-pass", "family-pass"), true);
  assert.equal(await passwordsMatch("wrong", "family-pass"), false);
});
