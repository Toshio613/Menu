function randomIndex(length, random = Math.random) {
  return Math.floor(random() * length);
}

function recipeLabel(recipe) {
  return `${recipe.id || "(no-id)"} / ${recipe.main || "(no-name)"}`;
}

function eligibleRecipeItems(recipes, { matchesSeason, recipeUsesExcludedIngredient }) {
  return recipes.map((recipe, index) => ({ recipe, index }))
    .filter(item => matchesSeason(item.recipe) && !recipeUsesExcludedIngredient(item.recipe));
}

function buildCandidates(items, {
  blocked,
  attributes,
  recipes,
  matchesSeason,
  recipeUsesExcludedIngredient,
  matchesAttributes,
  recipeAttributes
}) {
  let candidates = items.filter(item => !blocked.has(item.index));
  if (!candidates.length) return candidates;
  if (!attributes.length) return candidates;

  const attributeMatches = candidates.filter(item => matchesAttributes(item.recipe, attributes));
  if (attributeMatches.length) return attributeMatches;

  candidates = eligibleRecipeItems(recipes, { matchesSeason, recipeUsesExcludedIngredient })
    .filter(item => matchesAttributes(item.recipe, attributes));
  if (candidates.length) return candidates;

  const seasonalCandidates = eligibleRecipeItems(recipes, { matchesSeason, recipeUsesExcludedIngredient });
  if (!seasonalCandidates.length) return [];
  const bestAttributeScore = Math.max(...seasonalCandidates.map(item =>
    attributes.filter(attribute => recipeAttributes(item.recipe).includes(attribute)).length));
  return seasonalCandidates.filter(item =>
    attributes.filter(attribute => recipeAttributes(item.recipe).includes(attribute)).length === bestAttributeScore);
}

function randomMenu({
  recipes,
  excludes = [],
  preferBudget = false,
  vegetables = [],
  attributes = [],
  matchesSeason,
  recipeUsesExcludedIngredient,
  matchesAttributes,
  recipeAttributes,
  vegetableMatchCount,
  estimateRecipeCost,
  random = Math.random,
  debug
}) {
  const blocked = new Set(Array.isArray(excludes) ? excludes : [excludes]);
  let candidates = buildCandidates(eligibleRecipeItems(recipes, { matchesSeason, recipeUsesExcludedIngredient }), {
    blocked,
    attributes,
    recipes,
    matchesSeason,
    recipeUsesExcludedIngredient,
    matchesAttributes,
    recipeAttributes
  });
  if (!candidates.length) return null;

  const bestVegetableScore = Math.max(...candidates.map(item => vegetableMatchCount(item.recipe, vegetables)));
  if (bestVegetableScore > 0) {
    candidates = candidates.filter(item => vegetableMatchCount(item.recipe, vegetables) === bestVegetableScore);
  }
  if (preferBudget) candidates = candidates.sort((a, b) => estimateRecipeCost(a.recipe) - estimateRecipeCost(b.recipe)).slice(0, 8);

  const pickedCandidateIndex = randomIndex(candidates.length, random);
  const picked = candidates[pickedCandidateIndex];
  debug?.selectedRandomIndexes.push({
    dayIndex: debug.currentDayIndex,
    candidateIndex: pickedCandidateIndex,
    recipeIndex: picked.index,
    recipeId: picked.recipe.id,
    recipeName: picked.recipe.main,
    candidateCount: candidates.length
  });
  return picked.index;
}

function applyConsecutiveSelections(week, {
  recipes,
  conditions,
  unavailableDays,
  consecutiveRecipeIds,
  matchesAttributes,
  debug
}) {
  const nextWeek = [...week];
  for (let dayIndex = 0; dayIndex < nextWeek.length - 1; dayIndex += 1) {
    const recipeIndex = nextWeek[dayIndex];
    const recipe = recipes[recipeIndex];
    if (!recipe || !consecutiveRecipeIds.has(recipe.id)) continue;
    const nextDayIndex = dayIndex + 1;
    if (unavailableDays[nextDayIndex]) continue;
    if (!matchesAttributes(recipe, conditions[nextDayIndex] || [])) continue;
    nextWeek[nextDayIndex] = recipeIndex;
    debug?.consecutiveExpansions.push({
      fromDayIndex: dayIndex,
      toDayIndex: nextDayIndex,
      recipeIndex,
      recipeId: recipe.id,
      recipeName: recipe.main
    });
    dayIndex += 1;
  }
  return nextWeek;
}

export function generateMenuWeek({
  recipes,
  daysCount = 7,
  preferBudget = false,
  vegetables = [],
  conditions = Array.from({ length: daysCount }, () => []),
  unavailableDays = Array(daysCount).fill(false),
  consecutiveRecipeIds = new Set(),
  requestedAssignments = [],
  matchesSeason,
  recipeUsesExcludedIngredient,
  matchesAttributes,
  recipeAttributes,
  vegetableMatchCount,
  estimateRecipeCost,
  random = Math.random,
  debug = false,
  logger = console
}) {
  const selectedRandomIndexes = [];
  const consecutiveExpansions = [];
  const debugState = { selectedRandomIndexes, consecutiveExpansions, currentDayIndex: 0 };
  const eligibleRecipes = eligibleRecipeItems(recipes, { matchesSeason, recipeUsesExcludedIngredient });
  const week = [];

  while (week.length < daysCount) {
    if (unavailableDays[week.length]) {
      week.push(null);
      continue;
    }
    debugState.currentDayIndex = week.length;
    const choice = randomMenu({
      recipes,
      excludes: week.filter(index => index !== null),
      preferBudget,
      vegetables,
      attributes: conditions[week.length] || [],
      matchesSeason,
      recipeUsesExcludedIngredient,
      matchesAttributes,
      recipeAttributes,
      vegetableMatchCount,
      estimateRecipeCost,
      random,
      debug: debugState
    });
    if (choice === null) break;
    week.push(choice);
  }

  const finalWeek = applyConsecutiveSelections(week, {
    recipes,
    conditions,
    unavailableDays,
    consecutiveRecipeIds,
    matchesAttributes,
    debug: debugState
  });

  if (debug) {
    logger.info("[shuffle-debug]", {
      totalRecipes: recipes.length,
      eligibleRecipes: eligibleRecipes.length,
      eligibleRecipeIdsAndNames: eligibleRecipes.map(item => recipeLabel(item.recipe)),
      requestedPinnedRecipes: requestedAssignments.map(assignment => ({
        dayIndex: assignment.dayIndex,
        recipeId: assignment.recipeId,
        recipeName: assignment.recipeName
      })),
      consecutiveRecipeIds: [...consecutiveRecipeIds],
      selectedRandomIndexes,
      consecutiveExpansions,
      finalSelectedRecipes: finalWeek.map((recipeIndex, dayIndex) => ({
        dayIndex,
        recipeIndex,
        recipeId: recipes[recipeIndex]?.id || null,
        recipeName: recipes[recipeIndex]?.main || null
      }))
    });
  }

  return finalWeek;
}
