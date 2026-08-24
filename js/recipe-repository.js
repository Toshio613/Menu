import { apiRequest, getAuthToken } from "./api-client.js";
import { recipeIcon } from "./recipe-icon.js";

export function toApiRecipe(recipe) {
  return {
    id: recipe.id,
    name: recipe.main,
    category: recipe.type === "side" ? "side" : recipe.type === "soup" ? "soup" : "main",
    season: recipe.season || "none",
    emoji: recipeIcon(recipe),
    cookingTime: Math.max(1, Math.round(Number(recipe.time) || 1)),
    servings: Math.max(1, Math.round(Number(recipe.servings) || 2)),
    attributes: Array.isArray(recipe.attributes) ? recipe.attributes : [],
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    steps: Array.isArray(recipe.steps) ? recipe.steps : [],
    sauces: Array.isArray(recipe.sauces) ? recipe.sauces : [],
    memo: typeof recipe.memo === "string" ? recipe.memo : "",
    confidence: Number.isInteger(recipe.confidence) ? recipe.confidence : null,
    isCustom: Boolean(recipe.isCustom)
  };
}

export function fromApiRecipe(recipe) {
  return {
    id: recipe.id,
    ...(recipe.category === "main" ? {} : { type: recipe.category }),
    main: recipe.name,
    season: recipe.season,
    icon: recipeIcon(recipe),
    time: recipe.cookingTime,
    servings: recipe.servings,
    attributes: recipe.attributes,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    sauces: recipe.sauces || [],
    memo: recipe.memo || "",
    ...(Number.isInteger(recipe.confidence) ? { confidence: recipe.confidence } : {}),
    isCustom: Boolean(recipe.isCustom)
  };
}

export const recipeRepository = {
  isAuthenticated: () => Boolean(getAuthToken()),
  async list() {
    const payload = await apiRequest("/api/recipes");
    return payload.recipes.map(fromApiRecipe);
  },
  async create(recipe) {
    const payload = await apiRequest("/api/recipes", { method: "POST", body: toApiRecipe(recipe) });
    return fromApiRecipe(payload.recipe);
  },
  async update(recipe) {
    const payload = await apiRequest(`/api/recipes/${encodeURIComponent(recipe.id)}`, { method: "PUT", body: toApiRecipe(recipe) });
    return fromApiRecipe(payload.recipe);
  },
  async delete(id) {
    await apiRequest(`/api/recipes/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async importOnce(recipes) {
    return apiRequest("/api/recipes/import", { method: "POST", body: { recipes: recipes.map(toApiRecipe) }, timeoutMs: 60000 });
  }
};
