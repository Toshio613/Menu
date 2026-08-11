import { json, jsonError } from "../lib/http.js";
import { normalizeRecipe } from "../lib/recipe-validation.js";
import { RecipeRepository } from "../repositories/recipe-repository.js";

function repository(env, cors) {
  return env.DB ? new RecipeRepository(env.DB) : jsonError("D1_NOT_CONFIGURED", "共有レシピDBが設定されていません。", 503, cors);
}

async function requestRecipe(request, id) {
  try {
    const body = await request.json();
    return normalizeRecipe({ ...body, id: id || body?.id });
  } catch { return null; }
}

export async function handleRecipeList(request, env, cors) {
  const repo = repository(env, cors);
  if (repo instanceof Response) return repo;
  if (request.method === "GET") return json({ recipes: await repo.list() }, 200, cors);
  const recipe = await requestRecipe(request);
  if (!recipe) return jsonError("INVALID_RECIPE", "レシピの入力内容が不正です。", 400, cors);
  if (await repo.get(recipe.id)) return jsonError("RECIPE_EXISTS", "同じIDのレシピが登録済みです。", 409, cors);
  return json({ recipe: await repo.create(recipe) }, 201, cors);
}

export async function handleRecipeItem(request, env, cors, { id }) {
  const repo = repository(env, cors);
  if (repo instanceof Response) return repo;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/u.test(id)) return jsonError("INVALID_RECIPE_ID", "レシピIDが不正です。", 400, cors);
  if (request.method === "GET") {
    const recipe = await repo.get(id);
    return recipe ? json({ recipe }, 200, cors) : jsonError("RECIPE_NOT_FOUND", "レシピが見つかりません。", 404, cors);
  }
  if (request.method === "DELETE") {
    return await repo.delete(id) ? new Response(null, { status: 204, headers: cors }) : jsonError("RECIPE_NOT_FOUND", "レシピが見つかりません。", 404, cors);
  }
  const recipe = await requestRecipe(request, id);
  if (!recipe) return jsonError("INVALID_RECIPE", "レシピの入力内容が不正です。", 400, cors);
  const updated = await repo.update(recipe);
  return updated ? json({ recipe: updated }, 200, cors) : jsonError("RECIPE_NOT_FOUND", "レシピが見つかりません。", 404, cors);
}

export async function handleRecipeImport(request, env, cors) {
  const repo = repository(env, cors);
  if (repo instanceof Response) return repo;
  let body;
  try { body = await request.json(); } catch { return jsonError("INVALID_JSON", "移行データを読み取れません。", 400, cors); }
  if (!Array.isArray(body?.recipes) || body.recipes.length > 1000) return jsonError("INVALID_IMPORT", "移行するレシピ一覧が不正です。", 400, cors);
  const recipes = body.recipes.map(normalizeRecipe);
  if (recipes.some(recipe => !recipe) || new Set(recipes.map(recipe => recipe.id)).size !== recipes.length) {
    return jsonError("INVALID_IMPORT", "移行するレシピに不正または重複したデータがあります。", 400, cors);
  }
  return json(await repo.importOnce(recipes), 200, cors);
}
