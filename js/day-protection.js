export const MENU_DAYS_COUNT = 7;

function emptyProtection() {
  return { manual: false, requested: false };
}

export function createDayProtections() {
  return Array.from({ length: MENU_DAYS_COUNT }, emptyProtection);
}

export function normalizeDayProtections(value) {
  const hasDayProtections = Array.isArray(value) && value.length === MENU_DAYS_COUNT;
  return Array.from({ length: MENU_DAYS_COUNT }, (_, index) => {
    const saved = hasDayProtections ? value[index] : null;
    const manual = saved?.manual === true && saved?.manualSource === "button";
    return {
      manual,
      requested: saved?.requested === true,
      ...(manual ? { manualSource: "button" } : {})
    };
  });
}

export function manualProtectionDays(protections) {
  return normalizeDayProtections(protections).map(protection => protection.manual);
}

export function setManualProtection(protections, dayIndex, manual) {
  const next = normalizeDayProtections(protections);
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= MENU_DAYS_COUNT) return next;
  next[dayIndex] = {
    ...next[dayIndex],
    manual: manual === true,
    ...(manual === true ? { manualSource: "button" } : {})
  };
  if (!manual) delete next[dayIndex].manualSource;
  return next;
}

export function reconcileRequestedProtections(protections, requestedDayIndexes = []) {
  const requestedDays = new Set(requestedDayIndexes);
  return normalizeDayProtections(protections).map((protection, dayIndex) => ({
    ...protection,
    requested: requestedDays.has(dayIndex)
  }));
}

export function isDayProtected({
  weeklyLocked = false,
  manualLocked = false,
  manual = false,
  requested = false,
  eatingOut = false
} = {}) {
  return weeklyLocked || manualLocked || manual || requested || eatingOut;
}

export function dayProtectionState(recipeId, protection, weeklyLocked = false) {
  return {
    weeklyLocked,
    manualLocked: protection?.manual === true,
    requested: protection?.requested === true,
    eatingOut: recipeId === null
  };
}

export function protectedDayFlags(recipeIds, protections, weeklyLocked = false) {
  const normalized = normalizeDayProtections(protections);
  return Array.from({ length: MENU_DAYS_COUNT }, (_, dayIndex) => isDayProtected(
    dayProtectionState(recipeIds[dayIndex], normalized[dayIndex], weeklyLocked)
  ));
}

export function requestedLoadProtectionFlags(
  recipeIds,
  protections,
  requestedDayIndexes,
  weeklyLocked = false
) {
  const requestedTargets = new Set(requestedDayIndexes);
  const normalized = normalizeDayProtections(protections);
  return Array.from({ length: MENU_DAYS_COUNT }, (_, dayIndex) => {
    const protection = {
      ...normalized[dayIndex],
      requested: normalized[dayIndex].requested && !requestedTargets.has(dayIndex)
    };
    return isDayProtected(dayProtectionState(recipeIds[dayIndex], protection, weeklyLocked));
  });
}
