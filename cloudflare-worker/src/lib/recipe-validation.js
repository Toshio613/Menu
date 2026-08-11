const CATEGORIES = new Set(["main", "side", "soup"]);
const SEASONS = new Set(["spring", "summer", "autumn", "winter", "none"]);

export function normalizeRecipe(value) {
  if (!value || typeof value !== "object") return null;
  const recipe = {
    id: String(value.id || "").trim(),
    name: String(value.name || "").trim(),
    category: String(value.category || ""),
    season: String(value.season || "none"),
    emoji: String(value.emoji || "🍳").trim(),
    cookingTime: Number(value.cookingTime),
    servings: Number(value.servings),
    attributes: value.attributes,
    ingredients: value.ingredients,
    steps: value.steps,
    sauces: value.sauces ?? [],
    memo: String(value.memo || ""),
    confidence: value.confidence === null || value.confidence === undefined ? null : Number(value.confidence),
    isCustom: Boolean(value.isCustom)
  };
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/u.test(recipe.id)
    || !recipe.name || recipe.name.length > 100
    || !CATEGORIES.has(recipe.category) || !SEASONS.has(recipe.season)
    || !recipe.emoji || recipe.emoji.length > 16
    || !Number.isInteger(recipe.cookingTime) || recipe.cookingTime < 1 || recipe.cookingTime > 1440
    || !Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.servings > 100
    || !Array.isArray(recipe.attributes) || recipe.attributes.length > 20
    || !Array.isArray(recipe.ingredients) || !recipe.ingredients.length || recipe.ingredients.length > 100
    || !recipe.ingredients.every(item => Array.isArray(item) && item.length === 4 && typeof item[0] === "string" && typeof item[1] === "string" && Number.isFinite(Number(item[2])) && typeof item[3] === "string")
    || !Array.isArray(recipe.steps) || !recipe.steps.length || recipe.steps.length > 100
    || !recipe.steps.every(step => typeof step === "string" && step.trim())
    || !Array.isArray(recipe.sauces) || recipe.sauces.length > 30
    || (recipe.confidence !== null && (!Number.isInteger(recipe.confidence) || recipe.confidence < 0 || recipe.confidence > 100))) return null;
  return recipe;
}
