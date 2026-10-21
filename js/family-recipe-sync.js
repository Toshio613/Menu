function normalizedRecipe(recipe) {
  return {
    id: recipe?.id || "",
    type: recipe?.type === "side" ? "side" : recipe?.type === "soup" ? "soup" : "main",
    main: recipe?.main || "",
    season: recipe?.season || "none",
    icon: recipe?.icon || recipe?.emoji || "",
    time: Math.max(1, Math.round(Number(recipe?.time) || 1)),
    servings: Math.max(1, Math.round(Number(recipe?.servings) || 2)),
    attributes: Array.isArray(recipe?.attributes) ? recipe.attributes : [],
    ingredients: Array.isArray(recipe?.ingredients) ? recipe.ingredients : [],
    steps: Array.isArray(recipe?.steps) ? recipe.steps : [],
    sauces: Array.isArray(recipe?.sauces) ? recipe.sauces : [],
    memo: typeof recipe?.memo === "string" ? recipe.memo : "",
    confidence: Number.isInteger(recipe?.confidence) ? recipe.confidence : null,
    isCustom: Boolean(recipe?.isCustom)
  };
}

function recipesEqual(left, right) {
  return JSON.stringify(normalizedRecipe(left)) === JSON.stringify(normalizedRecipe(right));
}

function conflict(message) {
  const error = new Error(message);
  error.code = "LOCAL_RECIPE_MIGRATION_CONFLICT";
  return error;
}

function saveMigrationBackup(storage) {
  if (storage.getItem("recipeMigrationBackup_v1") !== null) return;
  storage.setItem("recipeMigrationBackup_v1", JSON.stringify({
    menuRecipeEdits: storage.getItem("menuRecipeEdits"),
    deletedRecipeIds: storage.getItem("deletedRecipeIds")
  }));
}

export async function synchronizeFamilyRecipes({
  repository,
  localRecipes = [],
  pendingRecipes = [],
  deletedRecipeIds = [],
  storage = localStorage,
  applySharedRecipes
}) {
  const sharedBefore = await repository.list();
  const sharedIds = new Set(sharedBefore.map(recipe => recipe.id));
  const deletedIds = new Set(deletedRecipeIds);
  const candidates = (sharedBefore.length ? pendingRecipes : localRecipes)
    .filter(recipe => recipe?.id && !deletedIds.has(recipe.id) && !sharedIds.has(recipe.id));
  const remoteDeletes = deletedRecipeIds.filter(id => sharedIds.has(id));

  if (candidates.length) await repository.importMissing(candidates);
  for (const id of remoteDeletes) await repository.delete(id);

  const mustRefresh = candidates.length > 0 || remoteDeletes.length > 0;
  const sharedAfter = mustRefresh ? await repository.list() : sharedBefore;
  const sharedById = new Map(sharedAfter.map(recipe => [recipe.id, recipe]));
  const recipesToVerify = (sharedBefore.length ? pendingRecipes : localRecipes)
    .filter(recipe => !deletedIds.has(recipe.id));

  for (const localRecipe of recipesToVerify) {
    const remoteRecipe = sharedById.get(localRecipe.id);
    if (!remoteRecipe) throw conflict(`D1に料理 ${localRecipe.id} が保存されていません。`);
    if (!recipesEqual(localRecipe, remoteRecipe)) {
      throw conflict(`料理 ${localRecipe.id} は端末とD1で内容が異なります。`);
    }
  }
  for (const deletedId of deletedRecipeIds) {
    if (sharedById.has(deletedId)) {
      throw conflict(`削除済み料理 ${deletedId} がD1に残っています。`);
    }
  }

  applySharedRecipes(sharedAfter);
  saveMigrationBackup(storage);
  storage.removeItem("menuRecipeEdits");
  storage.removeItem("deletedRecipeIds");
  storage.setItem("d1RecipeMigrationComplete", "true");
  return { recipes: sharedAfter, importedCount: candidates.length };
}
