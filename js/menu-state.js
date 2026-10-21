import { manualProtectionDays, normalizeDayProtections } from "./day-protection.js";

export const MENU_DATA_VERSION = 2;

const DEFAULT_KEYS = {
  weeks: "weeklyMenus",
  legacyWeek: "weeklyMenu",
  version: "menuDataVersion",
  backup: "menuMigrationBackup_v1"
};

function isPlainObject(value) {
  return Boolean(value) && !Array.isArray(value) && typeof value === "object";
}

function isSevenItemArray(value) {
  return Array.isArray(value) && value.length === 7;
}

function collectionIds(collection) {
  return new Set((Array.isArray(collection) ? collection : []).map(item => item?.id).filter(Boolean));
}

function normalizeIdArray(value, validIds) {
  if (!isSevenItemArray(value)) return null;
  return value.map(id => typeof id === "string" && validIds.has(id) ? id : null);
}

function normalizeAdditionalSides(value, validIds) {
  if (!isSevenItemArray(value) || value.some(ids => !Array.isArray(ids))) return null;
  return value.map(ids => ids.filter(id => typeof id === "string" && validIds.has(id)));
}

function idsFromLegacyIndexes(value, collection) {
  if (!isSevenItemArray(value)) return null;
  return value.map(index => {
    if (index === null) return null;
    if (!Number.isInteger(index) || index < 0) return null;
    return collection[index]?.id || null;
  });
}

function isVersionTwoRecord(value) {
  return isPlainObject(value)
    && (value.version === MENU_DATA_VERSION
      || Object.hasOwn(value, "mainRecipeIds")
      || Object.hasOwn(value, "sideRecipeIds")
      || Object.hasOwn(value, "soupRecipeIds"));
}

export function normalizeWeeklyMenuRecord(record, collections, weekKey = record?.weekStart) {
  if (!isVersionTwoRecord(record) || typeof weekKey !== "string" || record.weekStart !== weekKey) return null;
  const mainRecipeIds = normalizeIdArray(record.mainRecipeIds, collectionIds(collections?.menus));
  const sideIds = collectionIds(collections?.sideDishes);
  const sideRecipeIds = normalizeIdArray(record.sideRecipeIds, sideIds);
  const soupRecipeIds = normalizeIdArray(record.soupRecipeIds, collectionIds(collections?.soups));
  const additionalSideIds = normalizeAdditionalSides(
    record.additionalSideIds ?? Array.from({ length: 7 }, () => []),
    sideIds
  );
  if (!mainRecipeIds || !sideRecipeIds || !soupRecipeIds || !additionalSideIds) return null;
  const dayProtections = normalizeDayProtections(record.dayProtections, record.manuallySelectedDays);
  return {
    version: MENU_DATA_VERSION,
    weekStart: weekKey,
    mainRecipeIds,
    sideRecipeIds,
    soupRecipeIds,
    additionalSideIds,
    dayProtections,
    manuallySelectedDays: manualProtectionDays(dayProtections),
    locked: record.locked === true
  };
}

function migrateLegacyRecord(record, collections, weekKey) {
  if (!isPlainObject(record) || record.weekStart !== weekKey) return null;
  const mainRecipeIds = idsFromLegacyIndexes(record.selected, collections?.menus || []);
  const sideRecipeIds = idsFromLegacyIndexes(record.selectedSides, collections?.sideDishes || []);
  const soupRecipeIds = idsFromLegacyIndexes(record.selectedSoups, collections?.soups || []);
  if (!mainRecipeIds || !sideRecipeIds || !soupRecipeIds) return null;
  return normalizeWeeklyMenuRecord({
    version: MENU_DATA_VERSION,
    weekStart: weekKey,
    mainRecipeIds,
    sideRecipeIds,
    soupRecipeIds,
    additionalSideIds: record.additionalSideIds ?? Array.from({ length: 7 }, () => []),
    dayProtections: record.dayProtections,
    manuallySelectedDays: record.manuallySelectedDays,
    locked: record.locked
  }, collections, weekKey);
}

export function migrateWeeklyMenusData(data, collections) {
  if (!isPlainObject(data)) return { data: {}, migrated: false, partial: false };
  const migratedData = {};
  let migrated = false;
  let partial = false;
  for (const [weekKey, record] of Object.entries(data)) {
    const next = isVersionTwoRecord(record)
      ? normalizeWeeklyMenuRecord(record, collections, weekKey)
      : migrateLegacyRecord(record, collections, weekKey);
    if (!next) {
      partial = true;
      continue;
    }
    migratedData[weekKey] = next;
    if (!isVersionTwoRecord(record) || JSON.stringify(next) !== JSON.stringify(record)) migrated = true;
  }
  return { data: migratedData, migrated, partial };
}

export function parseWeeklyMenusStorage(raw, collections) {
  if (raw === null || raw === "") return { data: {}, migrated: false, corrupted: false };
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return { data: {}, migrated: false, corrupted: true };
    const result = migrateWeeklyMenusData(parsed, collections);
    return { ...result, corrupted: false };
  } catch {
    return { data: {}, migrated: false, corrupted: true };
  }
}

export function hasLegacyWeeklyMenuData(raw) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) && Object.values(parsed).some(record =>
      isPlainObject(record) && !isVersionTwoRecord(record));
  } catch {
    return false;
  }
}

export function migrateWeeklyMenuStorage(storage, collections, options = {}) {
  const keys = { ...DEFAULT_KEYS, ...(options.keys || {}) };
  const rawWeeks = storage.getItem(keys.weeks);
  const rawLegacyWeek = storage.getItem(keys.legacyWeek);
  if (options.deferLegacy === true && (hasLegacyWeeklyMenuData(rawWeeks) || rawLegacyWeek)) {
    return { status: "deferred", data: {} };
  }

  const parsed = parseWeeklyMenusStorage(rawWeeks, collections);
  if (parsed.corrupted) return { status: "corrupted", data: {} };
  if (parsed.partial) return { status: "partial", data: parsed.data };
  const source = { ...parsed.data };
  let migrated = parsed.migrated;

  if (rawLegacyWeek) {
    try {
      const legacyRecord = JSON.parse(rawLegacyWeek);
      const weekKey = legacyRecord?.weekStart;
      if (typeof weekKey === "string" && !source[weekKey]) {
        const next = isVersionTwoRecord(legacyRecord)
          ? normalizeWeeklyMenuRecord(legacyRecord, collections, weekKey)
          : migrateLegacyRecord(legacyRecord, collections, weekKey);
        if (next) {
          source[weekKey] = next;
          migrated = true;
        }
      }
    } catch {
      return { status: "corrupted", data: parsed.data };
    }
  }

  const needsWrite = migrated
    || rawLegacyWeek !== null
    || storage.getItem(keys.version) !== String(MENU_DATA_VERSION);
  if (!needsWrite) return { status: "current", data: source };

  try {
    if (storage.getItem(keys.backup) === null) {
      storage.setItem(keys.backup, JSON.stringify({
        weeklyMenus: rawWeeks,
        weeklyMenu: rawLegacyWeek,
        menuDataVersion: storage.getItem(keys.version)
      }));
    }
  } catch {
    return { status: "write-failed", data: parsed.data };
  }

  const serialized = JSON.stringify(source);
  try {
    storage.setItem(keys.weeks, serialized);
  } catch {
    return { status: "write-failed", data: parsed.data };
  }
  const verified = parseWeeklyMenusStorage(storage.getItem(keys.weeks), collections);
  if (verified.corrupted || JSON.stringify(verified.data) !== serialized) {
    try {
      if (rawWeeks === null) storage.removeItem(keys.weeks);
      else storage.setItem(keys.weeks, rawWeeks);
    } catch { /* バックアップキーから復旧できるよう残す */ }
    return { status: "verification-failed", data: parsed.data };
  }

  try {
    storage.setItem(keys.version, String(MENU_DATA_VERSION));
    if (rawLegacyWeek !== null) storage.removeItem(keys.legacyWeek);
  } catch {
    return { status: "write-failed", data: verified.data };
  }
  return { status: "migrated", data: verified.data };
}
