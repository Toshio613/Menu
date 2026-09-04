import { json, jsonError } from "../lib/http.js";
import { WeeklyMenuRepository } from "../repositories/weekly-menu-repository.js";

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const validRecipeIds = value => Array.isArray(value) && value.length === 7
  && value.every(id => id === null || (typeof id === "string" && id.length > 0 && id.length <= 120));
const validAdditionalSides = value => Array.isArray(value) && value.length === 7
  && value.every(ids => Array.isArray(ids) && ids.every(id => typeof id === "string" && id.length > 0 && id.length <= 120));
const validFixedDays = value => Array.isArray(value) && value.length === 7
  && value.every(item => typeof item === "boolean");

export function normalizeWeeklyMenu(value, weekStart) {
  if (!WEEK_START_PATTERN.test(weekStart)
    || !validRecipeIds(value?.mainRecipeIds)
    || !validRecipeIds(value?.sideRecipeIds)
    || !validRecipeIds(value?.soupRecipeIds)
    || !validAdditionalSides(value?.additionalSideIds)
    || !validFixedDays(value?.manuallySelectedDays)
    || typeof value?.locked !== "boolean"
    || (value?.unlock !== undefined && typeof value.unlock !== "boolean")) return null;
  return { weekStart, mainRecipeIds: value.mainRecipeIds, sideRecipeIds: value.sideRecipeIds,
    soupRecipeIds: value.soupRecipeIds, additionalSideIds: value.additionalSideIds,
    manuallySelectedDays: value.manuallySelectedDays, locked: value.locked,
    unlock: value.unlock === true };
}

export async function handleWeeklyMenu(request, env, cors, { weekStart }) {
  if (!env.DB) return jsonError("D1_NOT_CONFIGURED", "共有DBが設定されていません。", 503, cors);
  if (!WEEK_START_PATTERN.test(weekStart)) return jsonError("INVALID_WEEK_START", "週の開始日が不正です。", 400, cors);
  const repo = new WeeklyMenuRepository(env.DB);
  if (request.method === "GET") {
    const menu = await repo.get(weekStart);
    return menu ? json({ menu }, 200, cors) : jsonError("WEEKLY_MENU_NOT_FOUND", "週献立が見つかりません。", 404, cors);
  }
  let body;
  try { body = await request.json(); } catch { return jsonError("INVALID_JSON", "週献立を読み取れません。", 400, cors); }
  const menu = normalizeWeeklyMenu(body, weekStart);
  return menu ? json({ menu: await repo.save(menu, { allowUnlock: menu.unlock }) }, 200, cors)
    : jsonError("INVALID_WEEKLY_MENU", "週献立の内容が不正です。", 400, cors);
}
