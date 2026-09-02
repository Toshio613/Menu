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

function findRecipeIndex(value, recipes) {
  const requested = compact(value.replace(/^[：:\-―ー]+|[。.!！]+$/g, ""));
  if (!requested) return -1;
  const candidates = recipes.map((recipe, index) => ({ index, name: compact(recipe.main) }))
    .filter(({ name }) => requested.includes(name) || name.includes(requested));
  candidates.sort((a, b) => {
    const aExact = a.name === requested ? 0 : 1;
    const bExact = b.name === requested ? 0 : 1;
    return aExact - bExact || a.name.length - b.name.length || a.index - b.index;
  });
  return candidates[0]?.index ?? -1;
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

export function parseRequestedMenuAssignments(request, recipes, visibleDates) {
  if (!request.trim() || !Array.isArray(visibleDates) || visibleDates.length !== 7) return [];
  const assignments = [];
  requestEntries(request).forEach(entry => {
    const dayIndex = findDayIndex(entry.label, visibleDates);
    const recipeIndex = findRecipeIndex(entry.value, recipes);
    if (dayIndex < 0 || recipeIndex < 0) return;
    const existing = assignments.findIndex(item => item.date === dateKey(visibleDates[dayIndex]));
    const assignment = { dayIndex, date: dateKey(visibleDates[dayIndex]), recipeIndex };
    if (existing >= 0) assignments[existing] = assignment;
    else assignments.push(assignment);
  });
  return assignments;
}

export function applyRequestedMenuAssignments(selection, assignments, visibleDates) {
  const nextSelection = [...selection];
  assignments.forEach(({ dayIndex, date, recipeIndex }) => {
    if (dateKey(visibleDates[dayIndex]) === date) nextSelection[dayIndex] = recipeIndex;
  });
  return nextSelection;
}
