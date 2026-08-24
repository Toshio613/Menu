const DEFAULT_RECIPE_ICONS = Object.freeze({
  main: "🍳",
  side: "🥗",
  soup: "🍲"
});

export function recipeCategory(recipe = {}) {
  if (recipe.type === "side" || recipe.category === "side") return "side";
  if (recipe.type === "soup" || recipe.category === "soup") return "soup";
  return "main";
}

export function recipeIcon(recipe = {}) {
  const icon = typeof recipe.icon === "string" && recipe.icon.trim()
    ? recipe.icon.trim()
    : typeof recipe.emoji === "string" && recipe.emoji.trim()
      ? recipe.emoji.trim()
      : "";
  return icon || DEFAULT_RECIPE_ICONS[recipeCategory(recipe)];
}
