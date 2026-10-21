const dayLabels = ["日", "月", "火", "水", "木", "金", "土"];

function compact(value) {
  return String(value).normalize("NFKC").toLowerCase().replace(/[\s　・･]/g, "");
}

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function parseDateLabel(label, visibleDates) {
  const normalized = label.normalize("NFKC");
  const fullDate = normalized.match(/(?:(\d{4})[年/.-])?(\d{1,2})[月/.-](\d{1,2})日?/);
  if (!fullDate) return null;
  const year = fullDate[1] ? Number(fullDate[1]) : null;
  const month = Number(fullDate[2]);
  const day = Number(fullDate[3]);
  return visibleDates.findIndex(date => (!year || date.getFullYear() === year)
    && date.getMonth() + 1 === month && date.getDate() === day);
}

function findDayIndex(label, visibleDates) {
  const dateIndex = parseDateLabel(label, visibleDates);
  if (Number.isInteger(dateIndex) && dateIndex >= 0) return dateIndex;
  return dayLabels.findIndex(day => new RegExp(`^${day}(?:曜(?:日)?)?$`).test(label.trim()));
}

function findRecipe(value, recipes) {
  const requested = compact(cleanRequestedName(value));
  if (!requested) return { status: "not-found", candidates: [] };
  const searchable = recipes.map((recipe, index) => ({ index, name: compact(recipe.main), recipe }));
  const exact = searchable.filter(({ name }) => name === requested);
  if (exact.length === 1) return { status: "matched", recipeIndex: exact[0].index };
  if (exact.length > 1) return { status: "ambiguous", candidates: exact.map(item => item.recipe.main) };
  const partial = searchable.filter(({ name }) => name.includes(requested));
  if (partial.length === 1) return { status: "matched", recipeIndex: partial[0].index };
  if (partial.length > 1) return { status: "ambiguous", candidates: partial.map(item => item.recipe.main) };
  return { status: "not-found", candidates: [] };
}

function cleanRequestedName(value) {
  return value.replace(/^[：:\-―ー\s]+|[\s。.!！]+$/g, "").trim();
}

function requestEntries(value) {
  const normalized = value.normalize("NFKC");
  const marker = /(?:^|[\n、，,。])\s*((?:(?:\d{4}[年/.-])?\d{1,2}[月/.-]\d{1,2}日?(?:\s*\([^)]*\))?|[日月火水木金土](?:曜(?:日)?)?))\s*[：:\-―ー]?/g;
  const matches = [...normalized.matchAll(marker)];
  return matches.map((match, index) => ({
    label: match[1],
    value: normalized.slice(match.index + match[0].length, matches[index + 1]?.index ?? normalized.length)
      .replace(/^[\s、，,。]+|[\s、，,。]+$/g, "")
  }));
}

export function parseRequestedMenuResult(request, recipes, visibleDates) {
  if (!request.trim() || !Array.isArray(visibleDates) || visibleDates.length !== 7) {
    return { assignments: [], issues: [] };
  }
  const assignments = [];
  const issues = [];
  requestEntries(request).forEach(entry => {
    const dayIndex = findDayIndex(entry.label, visibleDates);
    if (dayIndex < 0) return;
    const requestedName = cleanRequestedName(entry.value);
    const match = findRecipe(entry.value, recipes);
    if (match.status !== "matched") {
      issues.push({ dayIndex, date: dateKey(visibleDates[dayIndex]), requestedName, ...match });
      return;
    }
    const recipeIndex = match.recipeIndex;
    const existing = assignments.findIndex(item => item.date === dateKey(visibleDates[dayIndex]));
    const assignment = {
      dayIndex,
      date: dateKey(visibleDates[dayIndex]),
      recipeIndex,
      recipeId: recipes[recipeIndex].id,
      recipeName: recipes[recipeIndex].main,
      requestedName
    };
    if (existing >= 0) assignments[existing] = assignment;
    else assignments.push(assignment);
  });
  return { assignments, issues };
}

export function parseRequestedMenuAssignments(request, recipes, visibleDates) {
  return parseRequestedMenuResult(request, recipes, visibleDates).assignments;
}

export function serializeRequestedMenuAssignments(assignments) {
  return assignments.map(({ date, recipeId, recipeName, requestedName }) => ({
    date, recipeId, recipeName, requestedName
  }));
}

export function restoreRequestedMenuAssignments(saved, recipes, visibleDates) {
  if (!Array.isArray(saved)) return [];
  return saved.map(item => ({
    ...item,
    dayIndex: visibleDates.findIndex(date => dateKey(date) === item.date),
    recipeIndex: recipes.findIndex(recipe => recipe.id === item.recipeId)
  })).filter(item => item.dayIndex >= 0 && item.recipeIndex >= 0);
}

export function applyRequestedMenuAssignments(
  selection,
  assignments,
  visibleDates,
  { recipes = [], consecutiveRecipeIds = new Set(), useRecipeIds = false, protectedDays = [] } = {}
) {
  const nextSelection = [...selection];
  const resolveRecipe = ({ recipeId, recipeIndex }) => {
    if (useRecipeIds) return recipes.some(recipe => recipe.id === recipeId) ? recipeId : null;
    if (recipeId && recipes.length) return recipes.findIndex(recipe => recipe.id === recipeId);
    return Number.isInteger(recipeIndex) ? recipeIndex : -1;
  };
  const explicitlyRequestedDates = new Set(assignments.map(({ date }) => date));
  assignments.forEach(assignment => {
    const { dayIndex, date, recipeId } = assignment;
    if (protectedDays[dayIndex]) return;
    const nextDayIndex = dayIndex + 1;
    if (!consecutiveRecipeIds.has(recipeId) || nextDayIndex >= visibleDates.length) return;
    if (dateKey(visibleDates[dayIndex]) !== date
      || protectedDays[nextDayIndex]
      || explicitlyRequestedDates.has(dateKey(visibleDates[nextDayIndex]))) return;
    const resolved = resolveRecipe(assignment);
    if (useRecipeIds ? resolved !== null : resolved >= 0) nextSelection[nextDayIndex] = resolved;
  });
  assignments.forEach(assignment => {
    const { dayIndex, date } = assignment;
    if (protectedDays[dayIndex]) return;
    const resolved = resolveRecipe(assignment);
    if ((useRecipeIds ? resolved !== null : resolved >= 0) && dateKey(visibleDates[dayIndex]) === date) {
      nextSelection[dayIndex] = resolved;
    }
  });
  return nextSelection;
}

export function loadRequestedMenuSelection(selection, assignments, visibleDates, options = {}) {
  const nextSelection = applyRequestedMenuAssignments(selection, assignments, visibleDates, options);
  const failedAssignment = assignments.find(({ dayIndex, date, recipeId }) =>
    dateKey(visibleDates[dayIndex]) !== date
      || (options.useRecipeIds
        ? nextSelection[dayIndex] !== recipeId
        : options.recipes?.[nextSelection[dayIndex]]?.id !== recipeId));
  const changedDayIndexes = nextSelection
    .map((value, dayIndex) => value !== selection[dayIndex] ? dayIndex : -1)
    .filter(dayIndex => dayIndex >= 0);
  const appliedDayIndexes = new Set(changedDayIndexes);
  assignments.forEach(({ dayIndex, recipeId }) => {
    const selectedId = options.useRecipeIds
      ? nextSelection[dayIndex]
      : options.recipes?.[nextSelection[dayIndex]]?.id;
    if (!options.protectedDays?.[dayIndex] && selectedId === recipeId) appliedDayIndexes.add(dayIndex);
    const nextDayIndex = dayIndex + 1;
    const nextSelectedId = options.useRecipeIds
      ? nextSelection[nextDayIndex]
      : options.recipes?.[nextSelection[nextDayIndex]]?.id;
    if (options.consecutiveRecipeIds?.has(recipeId)
      && nextDayIndex < visibleDates.length
      && !options.protectedDays?.[nextDayIndex]
      && nextSelectedId === recipeId) appliedDayIndexes.add(nextDayIndex);
  });
  return {
    selection: nextSelection,
    failedAssignment: failedAssignment || null,
    changedDayIndexes,
    appliedDayIndexes: [...appliedDayIndexes]
  };
}

export function regenerateRequestedAccompaniments(
  sideSelection,
  soupSelection,
  dayIndexes,
  { generateSide, generateSoup }
) {
  const nextSides = [...sideSelection];
  const nextSoups = [...soupSelection];
  for (const dayIndex of dayIndexes) {
    nextSides[dayIndex] = generateSide(dayIndex, nextSides, nextSoups);
    nextSoups[dayIndex] = generateSoup(dayIndex, nextSides, nextSoups);
  }
  return { sideSelection: nextSides, soupSelection: nextSoups };
}
