import {
  dayProtectionState,
  isDayProtected,
  normalizeDayProtections
} from "./day-protection.js";

function randomIndex(length, random = Math.random) {
  return Math.floor(random() * length);
}

function recipeLabel(recipe) {
  return `${recipe.id || "(no-id)"} / ${recipe.main || "(no-name)"}`;
}

function eligibleRecipeItems(recipes, {
  matchesSeason,
  recipeUsesExcludedIngredient,
  allowedRecipeIds = null,
  candidateFilter = () => true
}) {
  const allowed = allowedRecipeIds ? new Set(allowedRecipeIds) : null;
  return recipes.map((recipe, index) => ({ recipe, index }))
    .filter(item => matchesSeason(item.recipe)
      && !recipeUsesExcludedIngredient(item.recipe)
      && (!allowed || allowed.has(item.recipe.id))
      && candidateFilter(item.recipe, item.index));
}

function buildCandidates(items, {
  blocked,
  attributes,
  recipes,
  matchesSeason,
  recipeUsesExcludedIngredient,
  allowedRecipeIds,
  candidateFilter,
  matchesAttributes,
  recipeAttributes
}) {
  let candidates = items.filter(item => !blocked.has(item.index));
  if (!candidates.length) return candidates;
  if (!attributes.length) return candidates;

  const attributeMatches = candidates.filter(item => matchesAttributes(item.recipe, attributes));
  if (attributeMatches.length) return attributeMatches;

  candidates = eligibleRecipeItems(recipes, {
    matchesSeason, recipeUsesExcludedIngredient, allowedRecipeIds, candidateFilter
  })
    .filter(item => !blocked.has(item.index) && matchesAttributes(item.recipe, attributes));
  if (candidates.length) return candidates;

  const seasonalCandidates = eligibleRecipeItems(recipes, {
    matchesSeason, recipeUsesExcludedIngredient, allowedRecipeIds, candidateFilter
  })
    .filter(item => !blocked.has(item.index));
  if (!seasonalCandidates.length) return [];
  const bestAttributeScore = Math.max(...seasonalCandidates.map(item =>
    attributes.filter(attribute => recipeAttributes(item.recipe).includes(attribute)).length));
  return seasonalCandidates.filter(item =>
    attributes.filter(attribute => recipeAttributes(item.recipe).includes(attribute)).length === bestAttributeScore);
}

export function selectRecipeIndex({
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
  allowedRecipeIds = null,
  candidateFilter = () => true,
  candidateRefiner = candidates => candidates,
  random = Math.random,
  debug
}) {
  const blocked = new Set(Array.isArray(excludes) ? excludes : [excludes]);
  let candidates = buildCandidates(eligibleRecipeItems(recipes, {
    matchesSeason, recipeUsesExcludedIngredient, allowedRecipeIds, candidateFilter
  }), {
    blocked,
    attributes,
    recipes,
    matchesSeason,
    recipeUsesExcludedIngredient,
    allowedRecipeIds,
    candidateFilter,
    matchesAttributes,
    recipeAttributes
  });
  if (!candidates.length) return null;
  candidates = candidateRefiner([...candidates]);
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

export class MenuGenerationError extends Error {
  constructor(dayIndex) {
    super(`${dayIndex + 1}日目の条件に合う料理がありません。`);
    this.name = "MenuGenerationError";
    this.code = "MENU_CANDIDATES_EXHAUSTED";
    this.dayIndex = dayIndex;
  }
}

export function isMenuDayProtected(recipeId, manuallySelected = false) {
  return isDayProtected(dayProtectionState(recipeId, { manual: manuallySelected }));
}

export function mergeProtectedMenuDays(previous, generated, dayProtections = [], weeklyLocked = false) {
  const legacyManualDays = Array.isArray(dayProtections)
    && dayProtections.every(item => typeof item === "boolean") ? dayProtections : [];
  const normalized = normalizeDayProtections(legacyManualDays.length ? null : dayProtections, legacyManualDays);
  return generated.map((value, dayIndex) =>
    isDayProtected(dayProtectionState(previous[dayIndex], normalized[dayIndex], weeklyLocked))
      ? previous[dayIndex]
      : value);
}

export function replaceMenuDay(selection, dayIndex, recipeId, {
  manuallySelectedDays = [],
  dayProtections = null,
  weeklyLocked = false,
  consecutiveRecipeIds = new Set(),
  allowProtectedOverride = false
} = {}) {
  const next = [...selection];
  const normalized = normalizeDayProtections(dayProtections, manuallySelectedDays);
  if (!allowProtectedOverride
    && isDayProtected(dayProtectionState(next[dayIndex], normalized[dayIndex], weeklyLocked))) {
    return { selection: next, changed: false };
  }
  next[dayIndex] = recipeId;
  const nextDayIndex = dayIndex + 1;
  if (consecutiveRecipeIds.has(recipeId)
    && nextDayIndex < next.length
    && !isDayProtected(dayProtectionState(next[nextDayIndex], normalized[nextDayIndex], weeklyLocked))) {
    next[nextDayIndex] = recipeId;
  }
  return { selection: next, changed: true };
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
  reservedRecipeIndexes = [],
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
    const choice = selectRecipeIndex({
      recipes,
      excludes: [...reservedRecipeIndexes, ...week.filter(index => index !== null)],
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
    if (choice === null) throw new MenuGenerationError(week.length);
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
