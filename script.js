import { RECIPES } from "./recipes.js";
import { SIDE_DISHES } from "./side-dishes.js";
import { SOUPS } from "./soups.js";
import {
  createRequestParser,
  menuAttributeInfo,
  mutuallyExclusiveAttributeGroups,
  toHiragana
} from "./js/request-parser.js";
import {
  calculateShoppingGroups,
  estimateRecipeCost,
  formatAmount
} from "./js/shopping-list.js";
import { APP_CONFIG } from "./js/app-config.js";
import { initializeRecipePhoto, resetRecipePhotoUI } from "./js/recipe-photo.js";
import { initializeFamilySharing } from "./js/family-sharing.js";
import { recipeRepository } from "./js/recipe-repository.js";

const menus = RECIPES;
const sideDishes = SIDE_DISHES;
const soups = SOUPS;
const menuEditsStorageKey = "menuRecipeEdits";
const selectedSaucesStorageKey = "selectedRecipeSauces";
const deletedRecipesStorageKey = "deletedRecipeIds";
let menuEdits = {};
let selectedSauces = {};
let deletedRecipeIds = [];
try { menuEdits = JSON.parse(localStorage.getItem(menuEditsStorageKey) || "{}"); } catch { menuEdits = {}; }
try { selectedSauces = JSON.parse(localStorage.getItem(selectedSaucesStorageKey) || "{}"); } catch { selectedSauces = {}; }
try { deletedRecipeIds = JSON.parse(localStorage.getItem(deletedRecipesStorageKey) || "[]"); } catch { deletedRecipeIds = []; }
if (!menuEdits || Array.isArray(menuEdits) || typeof menuEdits !== "object") menuEdits = {};
if (!selectedSauces || Array.isArray(selectedSauces) || typeof selectedSauces !== "object") selectedSauces = {};
if (!Array.isArray(deletedRecipeIds)) deletedRecipeIds = [];
Object.entries(menuEdits).forEach(([id, saved]) => {
  if (!saved?.isCustom || deletedRecipeIds.includes(id)) return;
  const target = saved.type === "side" ? sideDishes : saved.type === "soup" ? soups : menus;
  if (target.some(recipe => recipe.id === id)) return;
  target.push({
    id,
    type: saved.type === "main" ? undefined : saved.type,
    season: saved.season || "none",
    icon: saved.icon || "🍳",
    main: saved.main,
    time: Number(saved.time) || 15,
    servings: Math.max(1, Number(saved.servings) || APP_CONFIG.recipePhoto.defaultServings),
    memo: typeof saved.memo === "string" ? saved.memo : "",
    confidence: Number.isFinite(Number(saved.confidence)) ? Number(saved.confidence) : undefined,
    ingredients: saved.ingredients,
    steps: saved.steps,
    attributes: Array.isArray(saved.attributes) ? saved.attributes : [],
    sauces: Array.isArray(saved.sauces) ? saved.sauces : [],
    isCustom: true
  });
});
[menus, sideDishes, soups].forEach(collection => {
  for (let index = collection.length - 1; index >= 0; index -= 1) {
    if (deletedRecipeIds.includes(collection[index].id)) collection.splice(index, 1);
  }
});
[...menus, ...sideDishes, ...soups].forEach(recipe => {
  const saved = menuEdits[recipe.id];
  if (!saved || typeof saved !== "object") return;
  if (typeof saved.main === "string" && saved.main.trim()) recipe.main = saved.main;
  if (typeof saved.icon === "string" && saved.icon.trim()) recipe.icon = saved.icon;
  if (["spring", "summer", "autumn", "winter", "none"].includes(saved.season)) recipe.season = saved.season;
  if (Number.isFinite(Number(saved.time)) && Number(saved.time) > 0) recipe.time = Number(saved.time);
  if (Number.isFinite(Number(saved.servings)) && Number(saved.servings) > 0) recipe.servings = Number(saved.servings);
  if (typeof saved.memo === "string") recipe.memo = saved.memo;
  if (Number.isFinite(Number(saved.confidence))) recipe.confidence = Number(saved.confidence);
  if (Array.isArray(saved.ingredients) && saved.ingredients.length) recipe.ingredients = saved.ingredients;
  if (Array.isArray(saved.steps) && saved.steps.length) recipe.steps = saved.steps;
  if (Array.isArray(saved.attributes)) recipe.attributes = saved.attributes;
  recipe.sauces = Array.isArray(saved.sauces) ? saved.sauces : [];
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

const days = ["日", "月", "火", "水", "木", "金", "土"];
const now = new Date();
const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
let visibleWeekStart = new Date(currentWeekStart);
let weekDates = createWeekDates(visibleWeekStart);
let mobileDayIndex = now.getDay();
const todayKey = [now.getFullYear(), now.getMonth(), now.getDate()].join("-");
const weeklyMenuStorageKey = "weeklyMenu";
const weeklyMenusStorageKey = "weeklyMenus";
const weeklyMenuLocksStorageKey = "weeklyMenuLocks";
const weeklyMenuLockWeekKey = "weeklyMenuLockWeek";
let weeklyMenuLocks = {};
try { weeklyMenuLocks = JSON.parse(localStorage.getItem(weeklyMenuLocksStorageKey) || "{}"); } catch { weeklyMenuLocks = {}; }
if (!weeklyMenuLocks || Array.isArray(weeklyMenuLocks) || typeof weeklyMenuLocks !== "object") weeklyMenuLocks = {};
let weeklyMenuLocked = false;
function createWeekDates(start) {
  return Array.from({ length: 7 }, (_, index) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}
function dateStorageKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function visibleWeekKey() {
  return dateStorageKey(visibleWeekStart);
}

function loadVisibleWeekLock() {
  weeklyMenuLocked = weeklyMenuLocks[visibleWeekKey()] === true;
}

function saveVisibleWeekLock(locked) {
  if (locked) weeklyMenuLocks[visibleWeekKey()] = true;
  else delete weeklyMenuLocks[visibleWeekKey()];
  localStorage.setItem(weeklyMenuLocksStorageKey, JSON.stringify(weeklyMenuLocks));
  weeklyMenuLocked = locked;
}

function clearExpiredWeeklyData() {
  const currentKey = dateStorageKey(currentWeekStart);
  try {
    const parsedWeeks = JSON.parse(localStorage.getItem(weeklyMenusStorageKey) || "{}");
    if (parsedWeeks && !Array.isArray(parsedWeeks) && typeof parsedWeeks === "object") {
      const activeAndFutureWeeks = Object.fromEntries(
        Object.entries(parsedWeeks).filter(([weekKey]) => weekKey >= currentKey)
      );
      localStorage.setItem(weeklyMenusStorageKey, JSON.stringify(activeAndFutureWeeks));
    }
  } catch {
    // 壊れた保存データは読み込み処理側で無視する。
  }

  const savedLockWeek = localStorage.getItem(weeklyMenuLockWeekKey);
  if (localStorage.getItem("weeklyMenuLocked") === "true") {
    // 旧形式の固定状態は、対象週（情報がなければ今週）だけへ引き継ぐ。
    weeklyMenuLocks[savedLockWeek || currentKey] = true;
  }
  weeklyMenuLocks = Object.fromEntries(
    Object.entries(weeklyMenuLocks).filter(([weekKey, locked]) => weekKey >= currentKey && locked === true)
  );
  localStorage.setItem(weeklyMenuLocksStorageKey, JSON.stringify(weeklyMenuLocks));
  localStorage.removeItem("weeklyMenuLocked");
  localStorage.removeItem(weeklyMenuLockWeekKey);
  loadVisibleWeekLock();
}

clearExpiredWeeklyData();
let activeSeason = localStorage.getItem("menuSeason") || "summer";
if (!["spring", "summer", "autumn", "winter", "none"].includes(activeSeason)) activeSeason = "summer";
const matchesSeason = recipe => activeSeason === "none" ? recipe.season === "none" : recipe.season === activeSeason || recipe.season === "none";
function initialSeasonSelection() {
  const regular = menus.map((recipe, index) => recipe.season === "none" ? index : -1).filter(index => index >= 0);
  if (activeSeason === "none") return regular.slice(0, 7);
  const seasonal = menus.map((recipe, index) => recipe.season === activeSeason ? index : -1).filter(index => index >= 0);
  return [...seasonal.slice(0, 5), ...regular.slice(0, 2)];
}
let selected = initialSeasonSelection();
function initialSideSelection() {
  const regular = sideDishes.map((recipe, index) => recipe.season === "none" ? index : -1).filter(index => index >= 0);
  if (activeSeason === "none") return regular.slice(0, 7);
  const seasonal = sideDishes.map((recipe, index) => recipe.season === activeSeason ? index : -1).filter(index => index >= 0);
  return [...seasonal.slice(0, 5), ...regular.slice(0, 2)];
}
let selectedSides = initialSideSelection();
let additionalSideIds = Array.from({ length: 7 }, () => []);
function initialSoupSelection() {
  const regular = soups.map((recipe, index) => recipe.season === "none" ? index : -1).filter(index => index >= 0);
  if (activeSeason === "none") return regular.slice(0, 7);
  const seasonal = soups.map((recipe, index) => recipe.season === activeSeason ? index : -1).filter(index => index >= 0);
  return [...seasonal, ...regular.slice(0, 2)];
}
let selectedSoups = initialSoupSelection();

function selectedRecipeIds(selection, recipes) {
  return selection.map(index => Number.isInteger(index) ? recipes[index]?.id || null : null);
}

function indicesForRecipeIds(ids, recipes) {
  return ids.map(id => id ? recipes.findIndex(recipe => recipe.id === id) : null)
    .map(index => index === -1 ? null : index);
}

function applySharedRecipes(sharedRecipes) {
  const mainIds = selectedRecipeIds(selected, menus);
  const sideIds = selectedRecipeIds(selectedSides, sideDishes);
  const soupIds = selectedRecipeIds(selectedSoups, soups);
  menus.splice(0, menus.length, ...sharedRecipes.filter(recipe => !recipe.type));
  sideDishes.splice(0, sideDishes.length, ...sharedRecipes.filter(recipe => recipe.type === "side"));
  soups.splice(0, soups.length, ...sharedRecipes.filter(recipe => recipe.type === "soup"));
  selected = indicesForRecipeIds(mainIds, menus);
  selectedSides = indicesForRecipeIds(sideIds, sideDishes);
  selectedSoups = indicesForRecipeIds(soupIds, soups);
  additionalSideIds = additionalSideIds.map(ids => ids.filter(id => sideDishes.some(recipe => recipe.id === id)));
  saveWeeklyMenu();
  render();
}

function isValidWeeklySelection(selection, recipes) {
  return Array.isArray(selection)
    && selection.length === 7
    && selection.every(index => index === null
      || (Number.isInteger(index) && index >= 0 && index < recipes.length));
}

function isValidAdditionalSides(selection) {
  return Array.isArray(selection)
    && selection.length === 7
    && selection.every(ids => Array.isArray(ids) && ids.every(id => typeof id === "string"));
}

function loadWeeklyMenu() {
  try {
    const parsedWeeks = JSON.parse(localStorage.getItem(weeklyMenusStorageKey) || "{}");
    const savedWeeks = parsedWeeks && !Array.isArray(parsedWeeks) && typeof parsedWeeks === "object" ? parsedWeeks : {};
    let saved = savedWeeks[visibleWeekKey()];
    // 旧形式で保存された今週の献立を、新しい週別保存へ引き継ぐ。
    if (!saved && visibleWeekKey() === dateStorageKey(currentWeekStart)) {
      const legacy = JSON.parse(localStorage.getItem(weeklyMenuStorageKey));
      if (legacy?.weekStart === visibleWeekKey()) saved = legacy;
    }
    if (!saved
      || saved.weekStart !== visibleWeekKey()
      || !isValidWeeklySelection(saved.selected, menus)
      || !isValidWeeklySelection(saved.selectedSides, sideDishes)
      || !isValidWeeklySelection(saved.selectedSoups, soups)) return null;
    saved.additionalSideIds = isValidAdditionalSides(saved.additionalSideIds)
      ? saved.additionalSideIds
      : Array.from({ length: 7 }, () => []);
    return saved;
  } catch {
    return null;
  }
}

function saveWeeklyMenu() {
  let savedWeeks = {};
  try { savedWeeks = JSON.parse(localStorage.getItem(weeklyMenusStorageKey) || "{}"); } catch { /* 空の保存先を使う */ }
  if (!savedWeeks || Array.isArray(savedWeeks) || typeof savedWeeks !== "object") savedWeeks = {};
  savedWeeks[visibleWeekKey()] = {
    weekStart: visibleWeekKey(),
    selected,
    selectedSides,
    selectedSoups,
    additionalSideIds
  };
  localStorage.setItem(weeklyMenusStorageKey, JSON.stringify(savedWeeks));
}

const savedWeeklyMenu = loadWeeklyMenu();
if (savedWeeklyMenu) {
  selected = savedWeeklyMenu.selected;
  selectedSides = savedWeeklyMenu.selectedSides;
  selectedSoups = savedWeeklyMenu.selectedSoups;
  additionalSideIds = savedWeeklyMenu.additionalSideIds;
}

const list = document.querySelector("#menu-list");
const toast = document.querySelector("#toast");
let preferredVegetables = [];
let excludedIngredients = [];
let ingredientExclusionMode = localStorage.getItem("ingredientExclusionMode") === "true";
let requestedDays = [];
let requestedConditions = Array.from({ length: 7 }, () => []);

const {
  normalizeVegetable,
  parsePreferredVegetables,
  parseFoodInput,
  parseRequestedDays,
  parseRequestAttributes,
  parseRequestedConditions,
  removeRequestedDay
} = createRequestParser({ recipes: [...menus, ...sideDishes, ...soups], days });
function syncAttributeTabs() {
  const attributes = parseRequestAttributes(document.querySelector("#request").value);
  document.querySelectorAll("[data-request-attribute]").forEach(button => {
    const active = attributes.includes(button.dataset.requestAttribute);
    button.setAttribute("aria-pressed", active);
  });
}

function syncWeekdayTabs() {
  const activeIndexes = new Set(requestedDays.map(({ index }) => index));
  document.querySelectorAll("[data-request-day]").forEach(button => {
    button.setAttribute("aria-pressed", activeIndexes.has(Number(button.dataset.requestDay)));
  });
}

function updateRecognizedDays() {
  const request = document.querySelector("#request").value;
  localStorage.setItem("menuRequest", request);
  requestedDays = parseRequestedDays(request);
  requestedConditions = parseRequestedConditions(request);
  syncWeekdayTabs();
  syncAttributeTabs();
  const message = document.querySelector("#recognized-days");
  if (!requestedDays.length) {
    message.hidden = true;
    message.textContent = "";
    return;
  }
  message.textContent = `${requestedDays.map(({ day }) => `${day}曜日`).join("・")}を認識しました`;
  message.hidden = false;
}

function recipeVegetables(recipe) {
  return recipe.ingredients
    .map(([, name]) => normalizeVegetable(name));
}

function ingredientMatches(recipeIngredient, requestedIngredient) {
  if (requestedIngredient === "きのこ") {
    return ["きのこ", "しめじ", "えのき", "まいたけ", "しいたけ"].some(name => recipeIngredient.includes(name));
  }
  return recipeIngredient === requestedIngredient
    || recipeIngredient.includes(requestedIngredient)
    || requestedIngredient.includes(recipeIngredient);
}

function recipeUsesExcludedIngredient(recipe) {
  if (!ingredientExclusionMode || !excludedIngredients.length) return false;
  const ingredients = recipeVegetables(recipe);
  return excludedIngredients.some(excluded =>
    ingredients.some(ingredient => ingredientMatches(ingredient, excluded)));
}

function vegetableMatchCount(recipe, vegetables = preferredVegetables) {
  const ingredients = recipeVegetables(recipe);
  return vegetables.reduce((count, vegetable) => {
    const matched = ingredients.some(ingredient => ingredientMatches(ingredient, vegetable));
    return count + Number(matched);
  }, 0);
}

function recipeCuisine(recipe) {
  if (!recipe) return null;
  const explicit = recipe.attributes?.find(attribute => ["western", "japanese", "chinese"].includes(attribute));
  if (explicit) return explicit;
  const text = `${recipe.main} ${recipe.side} ${recipe.id} ${recipe.ingredients.map(([, name]) => name).join(" ")}`;
  const chineseWords = ["中華", "麻婆", "青椒", "回鍋", "酢豚", "八宝", "油淋", "チリ", "ナムル", "鶏がら", "春雨", "豆板醤", "オイスター"];
  const westernWords = ["カレー", "ハンバーグ", "グラタン", "オムレツ", "パスタ", "シチュー", "ムニエル", "フライ", "ポトフ", "チーズ", "クリーム", "マリネ", "コールスロー", "コンソメ", "ポタージュ", "ミネストローネ", "ミルク", "サラダ"];
  if (chineseWords.some(word => text.includes(word))) return "chinese";
  if (westernWords.some(word => text.includes(word))) return "western";
  return "japanese";
}

function recipeMealType(recipe) {
  const explicit = recipe.attributes?.find(attribute => ["noodle", "rice"].includes(attribute));
  if (explicit) return explicit;
  const mainText = `${recipe.main} ${recipe.ingredients.map(([, name]) => name).join(" ")}`;
  if (/そうめん|うどん|パスタ|スパゲッティ|ラーメン|そば|焼きそば|麺/.test(mainText)) return "noodle";
  if (/ご飯|ごはん|丼|オムライス|カレー|おにぎり|雑炊|チャーハン|炒飯/.test(recipe.main)) return "rice";
  return null;
}

function recipeTaste(recipe) {
  const explicit = recipe.attributes?.find(attribute => ["light", "rich"].includes(attribute));
  if (explicit) return explicit;
  const mainText = recipe.main;
  const allText = `${recipe.main} ${recipe.side} ${recipe.ingredients.map(([, name]) => name).join(" ")}`;
  const lightMain = /さっぱり|あっさり|冷や|そうめん|うどん|そば|蒸し|しゃぶ|梅|酢|南蛮|たたき|塩焼き|みぞれ|おろし|酒蒸し/;
  if (lightMain.test(mainText)) return "light";
  const richText = /揚げ|フライ|から揚げ|唐揚げ|カレー|グラタン|ハンバーグ|すき焼き|クリーム|シチュー|チーズ|生クリーム|バター|豚バラ|ひき肉|牛肉|牛こま|牛薄切り|ルウ/;
  if (richText.test(allText)) return "rich";
  const lightText = /魚|鮭|さば|さんま|あじ|かつお|ぶり|たら|えび|あさり|かき|豆腐|野菜|サラダ|ポン酢|柚子/;
  if (lightText.test(allText)) return "light";
  return recipe.ingredients.some(([category]) => category === "肉・魚") ? "rich" : "light";
}

function recipeAttributes(recipe) {
  const validAttributes = Object.keys(menuAttributeInfo);
  const explicit = Array.isArray(recipe.attributes)
    ? recipe.attributes.filter(attribute => validAttributes.includes(attribute))
    : [];
  const fromGroup = (group, inferred) => {
    const chosen = explicit.filter(attribute => group.includes(attribute));
    return chosen.length ? chosen : inferred ? [inferred] : [];
  };
  return [...new Set([
    ...fromGroup(["western", "japanese", "chinese"], recipeCuisine(recipe)),
    ...fromGroup(["noodle", "rice"], recipeMealType(recipe)),
    ...fromGroup(["light", "rich"], recipeTaste(recipe)),
    ...(explicit.includes("seasonal") || recipe.season !== "none" ? ["seasonal"] : [])
  ])];
}

function matchesAttributes(recipe, attributes = []) {
  const available = recipeAttributes(recipe);
  return attributes.every(attribute => available.includes(attribute));
}

function preferMatchingCuisine(candidates, mainRecipe) {
  const cuisine = recipeCuisine(mainRecipe);
  if (!cuisine) return candidates;
  const matching = candidates.filter(item => recipeCuisine(item.recipe) === cuisine);
  return matching.length ? matching : candidates;
}

// 保存済み献立がない場合だけ、初期献立の組み合わせを調整する。
if (!savedWeeklyMenu) {
  selectedSides = generateSideWeek([], selected);
  selectedSoups = generateSoupWeek([], selected);
  saveWeeklyMenu();
}

function isToday(date) {
  return [date.getFullYear(), date.getMonth(), date.getDate()].join("-") === todayKey;
}

function cardDateLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}${isToday(date) ? "・今日" : ""}`;
}

function renderMobileWeekOverview() {
  const start = weekDates[0];
  const end = weekDates[6];
  document.querySelector("#mobile-week-range").textContent = `${start.getMonth() + 1}/${start.getDate()}〜${end.getMonth() + 1}/${end.getDate()}`;
  document.querySelector("#mobile-week-days").innerHTML = selected.map((menuIndex, index) => {
    const date = weekDates[index];
    const menu = menuIndex === null ? null : menus[menuIndex];
    const name = menu?.main || "外食・サボり日";
    return `<button type="button" role="tab" data-mobile-day="${index}" aria-label="${date.getMonth() + 1}月${date.getDate()}日 ${days[index]}曜日 ${escapeHtml(name)}">
      <span class="mobile-weekday">${days[index]}</span>
      <span class="mobile-week-date">${date.getMonth() + 1}/${date.getDate()}</span>
      <span class="mobile-week-icon" aria-hidden="true">${menu?.icon || "☕"}</span>
      <span class="mobile-week-name">${escapeHtml(name)}</span>
    </button>`;
  }).join("");
}

function updateMobileDayUI() {
  const date = weekDates[mobileDayIndex];
  if (!date) return;
  document.querySelector("#mobile-day-date").textContent = `${date.getMonth() + 1}月${date.getDate()}日`;
  document.querySelector("#mobile-day-weekday").textContent = `${days[mobileDayIndex]}曜日${isToday(date) ? "・今日" : ""}`;
  list.querySelectorAll(".menu-card[data-day-index]").forEach(card => {
    card.classList.toggle("mobile-day-active", Number(card.dataset.dayIndex) === mobileDayIndex);
  });
  document.querySelectorAll("[data-mobile-day]").forEach(button => {
    const active = Number(button.dataset.mobileDay) === mobileDayIndex;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  if (window.matchMedia("(max-width: 768px)").matches) {
    const overview = document.querySelector("#mobile-week-days");
    const activeButton = overview.querySelector("[data-mobile-day].active");
    if (activeButton) {
      const targetLeft = activeButton.offsetLeft - (overview.clientWidth - activeButton.offsetWidth) / 2;
      overview.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
    }
  }
}

function changeMobileDay(offset) {
  const nextIndex = mobileDayIndex + offset;
  if (nextIndex < 0) {
    mobileDayIndex = 6;
    changeVisibleWeek(-1);
    return;
  }
  if (nextIndex > 6) {
    mobileDayIndex = 0;
    changeVisibleWeek(1);
    return;
  }
  mobileDayIndex = nextIndex;
  updateMobileDayUI();
}

function updateWeeklyDateUI() {
  const start = weekDates[0];
  const end = weekDates[6];
  const startLabel = `${start.getMonth() + 1}月${start.getDate()}日`;
  const endLabel = start.getMonth() === end.getMonth()
    ? `${end.getDate()}日`
    : `${end.getMonth() + 1}月${end.getDate()}日`;
  document.querySelector("#weekly-title").textContent = `${startLabel} — ${endLabel}の献立`;
  const offset = Math.round((visibleWeekStart - currentWeekStart) / (7 * 24 * 60 * 60 * 1000));
  document.querySelector("#weekly-eyebrow").textContent = offset === 0 ? "THIS WEEK" : offset < 0 ? "PREVIOUS WEEK" : "NEXT WEEK";
  const currentWeekButton = document.querySelector("#current-week");
  currentWeekButton.hidden = offset === 0;
}

function updateWeeklyLockUI() {
  const lockButton = document.querySelector("#lock-weekly-menu");
  lockButton.setAttribute("aria-pressed", String(weeklyMenuLocked));
  lockButton.classList.toggle("locked", weeklyMenuLocked);
  lockButton.innerHTML = weeklyMenuLocked
    ? '<span aria-hidden="true">🔒</span> 固定中'
    : '<span aria-hidden="true">🔓</span> 固定する';
  ["#generate", "#shuffle-partial", "#shuffle-all"].forEach(selector => {
    document.querySelector(selector).disabled = weeklyMenuLocked;
  });
  document.querySelectorAll("#season-buttons button").forEach(button => {
    button.disabled = weeklyMenuLocked;
  });
  document.querySelector("#take-week-off").disabled = weeklyMenuLocked;
}

function changeVisibleWeek(offset) {
  visibleWeekStart = new Date(visibleWeekStart.getFullYear(), visibleWeekStart.getMonth(), visibleWeekStart.getDate() + offset * 7);
  weekDates = createWeekDates(visibleWeekStart);
  loadVisibleWeekLock();
  const saved = loadWeeklyMenu();
  if (saved) {
    selected = saved.selected;
    selectedSides = saved.selectedSides;
    selectedSoups = saved.selectedSoups;
    additionalSideIds = saved.additionalSideIds;
  } else {
    selected = generateWeek(budgetMode, preferredVegetables);
    selectedSides = generateSideWeek(preferredVegetables, selected);
    selectedSoups = generateSoupWeek(preferredVegetables, selected);
    additionalSideIds = Array.from({ length: 7 }, () => []);
    saveWeeklyMenu();
  }
  list.classList.remove("slide-from-left", "slide-from-right");
  void list.offsetWidth;
  list.classList.add(offset < 0 ? "slide-from-left" : "slide-from-right");
  updateWeeklyDateUI();
  render();
}

function scheduleDateRollover() {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const delay = Math.max(0, nextMidnight.getTime() - Date.now());
  setTimeout(() => window.location.reload(), delay);
}

function render() {
  updateWeeklyLockUI();
  renderMobileWeekOverview();
  const allDaysOff = selected.length === 7 && selected.every(menuIndex => menuIndex === null);
  const takeWeekOffButton = document.querySelector("#take-week-off");
  takeWeekOffButton.disabled = weeklyMenuLocked || allDaysOff;
  takeWeekOffButton.setAttribute("aria-pressed", String(allDaysOff));
  list.classList.toggle("all-days-off-view", allDaysOff);
  document.querySelector("#mobile-day-navigation").hidden = allDaysOff;
  if (allDaysOff) {
    list.innerHTML = `<div class="all-days-off-stage">
      <div class="all-days-off-decor decor-left" aria-hidden="true">
        <span>🌼</span><span>⭐</span><span>🦋</span><span>🌙</span><span>🚀</span><span>🌸</span>
      </div>
      <section class="all-days-off-panel" aria-label="一週間すべて外食・サボり日">
        <div class="all-days-off-image">
          <img src="assets/all-days-off.jpeg" alt="一週間すべてお休みの記念画像">
          <div class="face-sparkles" aria-hidden="true">
            <span>✦</span><span>✧</span><span>⋆</span><span>✦</span><span>✧</span><span>✦</span><span>⋆</span><span>✧</span><span>✦</span>
          </div>
          <span class="cheek-heart" aria-hidden="true">♡</span>
          <span class="cry-emoji" aria-hidden="true">😭</span>
          <span class="yes-message" aria-hidden="true">Yes!!</span>
          <span class="summer-message" aria-hidden="true">夏＝Sammar!!</span>
        </div>
        <div class="all-days-off-caption">
          <div><p class="eyebrow">ALL DAYS OFF</p><strong>今週は自分でやれば？（笑）</strong></div>
          <button type="button" data-restore-week ${weeklyMenuLocked ? "disabled" : ""}>↻ 献立を戻す</button>
        </div>
      </section>
      <div class="all-days-off-decor decor-right" aria-hidden="true">
        <span>⭐</span><span>🌙</span><span>🌷</span><span>🦋</span><span>🚀</span><span>☁️</span><span>🌼</span>
        <span class="kabutomushi"><svg viewBox="0 0 64 88" aria-hidden="true"><ellipse cx="32" cy="56" rx="19" ry="27"/><circle cx="32" cy="31" r="10"/><path d="M32 25V15L24 7l8 3 8-3-8 8M32 39v43M18 42 7 33M46 42l11-9M15 57H4M49 57h11M18 70 8 79M46 70l10 9"/></svg></span>
      </div>
    </div>`;
    return;
  }
  list.innerHTML = selected.map((menuIndex, index) => {
    const date = weekDates[index];
    const today = isToday(date);
    const isEatingOut = menuIndex === null;
    if (isEatingOut) {
      return `<article class="menu-card eating-out ${today ? "today" : ""}" data-day-index="${index}">
        <div class="day-row"><span class="day">${days[index]}</span><span class="date">${cardDateLabel(date)}</span></div>
        <div class="eating-out-blank" aria-label="外食・サボり日">
          <span aria-hidden="true">☕</span>
          <strong>外食・サボり日</strong>
          <small>今日は作らなくてOK</small>
        </div>
        <button class="retry" type="button" data-index="${index}" ${weeklyMenuLocked ? "disabled" : ""}>↻ 献立を入れる</button>
      </article>`;
    }
    const menu = menus[menuIndex];
    const sideDishIndex = selectedSides[index];
    const soupIndex = selectedSoups[index];
    const sideDish = sideDishIndex === null ? null : sideDishes[sideDishIndex];
    const soup = soupIndex === null ? null : soups[soupIndex];
    const additionalSides = additionalSideIds[index]
      .map(id => sideDishes.find(recipe => recipe.id === id))
      .filter(Boolean);
    return `<article class="menu-card ${today ? "today" : ""}" data-day-index="${index}">
      <div class="day-row"><span class="day">${days[index]}</span><span class="date">${cardDateLabel(date)}</span></div>
      <button class="recipe-open" type="button" data-recipe="${menuIndex}" aria-label="${escapeHtml(menu.main)}のレシピを見る">
        <div class="dish-icon season-${menu.season}" aria-hidden="true">${menu.icon}</div>
        <span class="dish-kind">主菜</span><h3>${escapeHtml(menu.main)}</h3><span class="detail-link">レシピを見る →</span>
      </button>
      <div class="dish-slot ${sideDish ? "" : "empty"}">
        ${sideDish ? `<button class="side-dish-open" type="button" data-side-recipe="${sideDishIndex}" aria-label="${escapeHtml(sideDish.main)}のレシピを見る">
          <span class="dish-kind">副菜</span><strong>${sideDish.icon} ${escapeHtml(sideDish.main)}</strong>
        </button><button class="remove-dish" type="button" data-remove-side="${index}" aria-label="${days[index]}曜日の副菜を削除" ${weeklyMenuLocked ? "disabled" : ""}>×</button>`
        : '<div class="removed-dish"><span class="dish-kind">副菜</span><small>なし</small></div>'}
        <button class="change-dish-button" type="button" data-change-side-dish="${index}" aria-label="${days[index]}曜日の副菜だけ変える" title="副菜だけ変える" ${weeklyMenuLocked ? "disabled" : ""}>↻</button>
      </div>
      ${additionalSides.map(extraSide => `<div class="dish-slot additional-side">
        <button class="side-dish-open" type="button" data-side-recipe="${sideDishes.indexOf(extraSide)}" aria-label="${escapeHtml(extraSide.main)}のレシピを見る">
          <span class="dish-kind">追加の副菜</span><strong>${extraSide.icon} ${escapeHtml(extraSide.main)}</strong>
        </button><button class="remove-dish" type="button" data-remove-additional-side="${index}" data-side-id="${extraSide.id}" aria-label="${days[index]}曜日の追加副菜を削除" ${weeklyMenuLocked ? "disabled" : ""}>×</button>
      </div>`).join("")}
      <button class="add-side-dish-button" type="button" data-add-side-dish="${index}" ${weeklyMenuLocked ? "disabled" : ""}>＋ 副菜を追加</button>
      <div class="dish-slot ${soup ? "" : "empty"}">
        ${soup ? `<button class="soup-open" type="button" data-soup-recipe="${soupIndex}" aria-label="${escapeHtml(soup.main)}のレシピを見る">
          <span class="dish-kind">汁物</span><strong>${soup.icon} ${escapeHtml(soup.main)}</strong>
        </button><button class="remove-dish" type="button" data-remove-soup="${index}" aria-label="${days[index]}曜日の汁物を削除" ${weeklyMenuLocked ? "disabled" : ""}>×</button>`
        : '<div class="removed-dish soup-removed"><span class="dish-kind">汁物</span><small>なし</small></div>'}
        <button class="change-dish-button" type="button" data-change-soup="${index}" aria-label="${days[index]}曜日の汁物だけ変える" title="汁物だけ変える" ${weeklyMenuLocked ? "disabled" : ""}>↻</button>
      </div>
      <button class="retry" type="button" data-index="${index}" ${weeklyMenuLocked ? "disabled" : ""}>↻ この日を変える</button>
      <button class="simple-retry" type="button" data-simple-index="${index}" ${!weeklyMenuLocked && compatibleSimpleMenus().length ? "" : "disabled"}>✓ かんたんから選ぶ</button>
      <button class="favorite-retry" type="button" data-favorite-index="${index}" ${!weeklyMenuLocked && compatibleFavoriteMenus().length ? "" : "disabled"}>♥ お気に入りから選ぶ</button>
      <button class="eating-out-button" type="button" data-eating-out-index="${index}" ${weeklyMenuLocked ? "disabled" : ""}>☕ 外食・サボり日にする</button>
    </article>`;
  }).join("");
  updateMobileDayUI();
}

function renderKeepingScrollPosition() {
  const scrollLeft = window.scrollX;
  const scrollTop = window.scrollY;
  const previousHeight = list.getBoundingClientRect().height;
  if (previousHeight) list.style.minHeight = `${Math.ceil(previousHeight)}px`;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  render();
  const restorePosition = () => window.scrollTo(scrollLeft, scrollTop);
  restorePosition();
  requestAnimationFrame(() => {
    restorePosition();
    requestAnimationFrame(restorePosition);
  });
  const image = list.querySelector(".all-days-off-panel img");
  if (image && !image.complete) image.addEventListener("load", restorePosition, { once: true });
}

function randomMenu(excludes = [], preferBudget = budgetMode, hardExcludes = [], vegetables = preferredVegetables, attributes = []) {
  const blocked = new Set(Array.isArray(excludes) ? excludes : [excludes]);
  hardExcludes.forEach(index => blocked.add(index));
  let candidates = menus.map((recipe, i) => ({ recipe, i }))
    .filter(item => matchesSeason(item.recipe) && !recipeUsesExcludedIngredient(item.recipe) && !blocked.has(item.i));
  if (!candidates.length) return null;
  if (attributes.length) {
    const attributeMatches = candidates.filter(item => matchesAttributes(item.recipe, attributes));
    candidates = attributeMatches.length
      ? attributeMatches
      : menus.map((recipe, i) => ({ recipe, i }))
        .filter(item => matchesSeason(item.recipe) && !recipeUsesExcludedIngredient(item.recipe) && matchesAttributes(item.recipe, attributes));
    if (!candidates.length) {
      const seasonalCandidates = menus.map((recipe, i) => ({ recipe, i }))
        .filter(item => matchesSeason(item.recipe) && !recipeUsesExcludedIngredient(item.recipe));
      if (!seasonalCandidates.length) return null;
      const bestAttributeScore = Math.max(...seasonalCandidates.map(item =>
        attributes.filter(attribute => recipeAttributes(item.recipe).includes(attribute)).length));
      candidates = seasonalCandidates.filter(item =>
        attributes.filter(attribute => recipeAttributes(item.recipe).includes(attribute)).length === bestAttributeScore);
    }
  }
  const bestVegetableScore = Math.max(...candidates.map(item => vegetableMatchCount(item.recipe, vegetables)));
  if (bestVegetableScore > 0) {
    candidates = candidates.filter(item => vegetableMatchCount(item.recipe, vegetables) === bestVegetableScore);
  }
  if (preferBudget) candidates = candidates.sort((a, b) => estimateRecipeCost(a.recipe) - estimateRecipeCost(b.recipe)).slice(0, 8);
  return candidates[Math.floor(Math.random() * candidates.length)].i;
}

function generateWeek(
  preferBudget = budgetMode,
  vegetables = preferredVegetables,
  conditions = requestedConditions,
  unavailableDays = Array(7).fill(false)
) {
  const week = [];
  const seasonalIndexes = conditions
    .map((attributes, index) => attributes.includes("seasonal") ? index : -1)
    .filter(index => index >= 0 && !unavailableDays[index]);
  const shuffledSeasonalIndexes = [...seasonalIndexes].sort(() => Math.random() - .5);
  const requiredSeasonalIndexes = new Set(
    shuffledSeasonalIndexes.slice(0, Math.min(5, seasonalIndexes.length))
  );
  const effectiveConditions = conditions.map((attributes, index) =>
    attributes.filter(attribute => attribute !== "seasonal")
      .concat(requiredSeasonalIndexes.has(index) ? ["seasonal"] : []));
  const eligibleConsecutive = menus.map((recipe, index) => ({ recipe, index }))
    .filter(item => consecutiveIds.has(item.recipe.id) && matchesSeason(item.recipe) && !recipeUsesExcludedIngredient(item.recipe));
  const possiblePairs = [];
  eligibleConsecutive.forEach(item => {
    for (let start = 0; start < 6; start += 1) {
      if (!unavailableDays[start]
        && !unavailableDays[start + 1]
        && matchesAttributes(item.recipe, effectiveConditions[start])
        && matchesAttributes(item.recipe, effectiveConditions[start + 1])) {
        possiblePairs.push({ index: item.index, start });
      }
    }
  });
  const forcedPair = possiblePairs.length
    ? possiblePairs[Math.floor(Math.random() * possiblePairs.length)]
    : null;
  const consecutiveIndexes = eligibleConsecutive.map(item => item.index);
  while (week.length < 7) {
    if (forcedPair && week.length === forcedPair.start) {
      week.push(forcedPair.index, forcedPair.index);
      continue;
    }
    const choice = randomMenu(
      week,
      preferBudget,
      consecutiveIndexes,
      vegetables,
      effectiveConditions[week.length] || []
    );
    if (choice === null) break;
    week.push(choice);
  }
  return week;
}

function generateSideWeek(vegetables = preferredVegetables, mainWeek = selected) {
  const week = [];
  while (week.length < 7) {
    let candidates = sideDishes.map((recipe, index) => ({ recipe, index }))
      .filter(item => matchesSeason(item.recipe) && !recipeUsesExcludedIngredient(item.recipe) && !week.includes(item.index));
    if (!candidates.length) break;
    candidates = preferMatchingCuisine(candidates, menus[mainWeek[week.length]]);
    const bestScore = Math.max(...candidates.map(item => vegetableMatchCount(item.recipe, vegetables)));
    if (bestScore > 0) candidates = candidates.filter(item => vegetableMatchCount(item.recipe, vegetables) === bestScore);
    week.push(candidates[Math.floor(Math.random() * candidates.length)].index);
  }
  return week;
}

function randomSideDish(excludes = [], vegetables = preferredVegetables, mainRecipe = null) {
  let candidates = sideDishes.map((recipe, index) => ({ recipe, index }))
    .filter(item => matchesSeason(item.recipe) && !recipeUsesExcludedIngredient(item.recipe) && !excludes.includes(item.index));
  if (!candidates.length) return null;
  candidates = preferMatchingCuisine(candidates, mainRecipe);
  const bestScore = Math.max(...candidates.map(item => vegetableMatchCount(item.recipe, vegetables)));
  if (bestScore > 0) candidates = candidates.filter(item => vegetableMatchCount(item.recipe, vegetables) === bestScore);
  return candidates[Math.floor(Math.random() * candidates.length)].index;
}

function generateSoupWeek(vegetables = preferredVegetables, mainWeek = selected) {
  const week = [];
  while (week.length < 7) {
    let candidates = soups.map((recipe, index) => ({ recipe, index }))
      .filter(item => {
        const usedCount = week.filter(index => index === item.index).length;
        return matchesSeason(item.recipe) && !recipeUsesExcludedIngredient(item.recipe)
          && usedCount < 2 && week[week.length - 1] !== item.index;
      });
    if (!candidates.length) break;
    candidates = preferMatchingCuisine(candidates, menus[mainWeek[week.length]]);
    const bestScore = Math.max(...candidates.map(item => vegetableMatchCount(item.recipe, vegetables)));
    if (bestScore > 0) candidates = candidates.filter(item => vegetableMatchCount(item.recipe, vegetables) === bestScore);
    week.push(candidates[Math.floor(Math.random() * candidates.length)].index);
  }
  return week;
}

function randomSoup(index, vegetables = preferredVegetables) {
  const otherDays = selectedSoups.filter((_, day) => day !== index);
  let candidates = soups.map((recipe, soupIndex) => ({ recipe, soupIndex }))
    .filter(item => {
      const usedCount = otherDays.filter(used => used === item.soupIndex).length;
      const adjacent = selectedSoups[index - 1] === item.soupIndex || selectedSoups[index + 1] === item.soupIndex;
      return matchesSeason(item.recipe) && !recipeUsesExcludedIngredient(item.recipe) && usedCount < 2 && !adjacent;
  });
  if (!candidates.length) return null;
  candidates = preferMatchingCuisine(candidates, menus[selected[index]]);
  const bestScore = Math.max(...candidates.map(item => vegetableMatchCount(item.recipe, vegetables)));
  if (bestScore > 0) candidates = candidates.filter(item => vegetableMatchCount(item.recipe, vegetables) === bestScore);
  return candidates[Math.floor(Math.random() * candidates.length)].soupIndex;
}

function compatibleSimpleMenus() {
  return menus.map((recipe, index) => ({ recipe, index }))
    .filter(item => simpleIds.has(item.recipe.id) && matchesSeason(item.recipe) && !recipeUsesExcludedIngredient(item.recipe));
}

function compatibleFavoriteMenus() {
  return menus.map((recipe, index) => ({ recipe, index }))
    .filter(item => favoriteIds.has(item.recipe.id) && matchesSeason(item.recipe) && !recipeUsesExcludedIngredient(item.recipe));
}

function randomSimpleMenu(excludes = [], hardExcludes = [], attributes = []) {
  const blocked = new Set(excludes);
  hardExcludes.forEach(index => blocked.add(index));
  const candidates = compatibleSimpleMenus()
    .filter(item => !blocked.has(item.index) && matchesAttributes(item.recipe, attributes));
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)].index : null;
}

function randomFavoriteMenu(excludes = [], hardExcludes = [], attributes = []) {
  const blocked = new Set(excludes);
  hardExcludes.forEach(index => blocked.add(index));
  const candidates = compatibleFavoriteMenus()
    .filter(item => !blocked.has(item.index) && matchesAttributes(item.recipe, attributes));
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)].index : null;
}

function applyDayReplacement(index, replacement) {
  selected[index] = replacement;
  if (!consecutiveIds.has(menus[replacement].id)) return;
  const pairIndex = index < selected.length - 1 ? index + 1 : index - 1;
  selected[pairIndex] = replacement;
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

list.addEventListener("click", (event) => {
  const restoreWeekButton = event.target.closest("[data-restore-week]");
  if (restoreWeekButton) {
    selected = generateWeek();
    selectedSides = generateSideWeek(preferredVegetables, selected);
    selectedSoups = generateSoupWeek(preferredVegetables, selected);
    additionalSideIds = Array.from({ length: 7 }, () => []);
    saveWeeklyMenu();
    renderKeepingScrollPosition();
    notify("一週間の献立を戻しました");
    return;
  }
  const removeSideButton = event.target.closest("[data-remove-side]");
  if (removeSideButton) {
    const index = Number(removeSideButton.dataset.removeSide);
    selectedSides[index] = null;
    saveWeeklyMenu();
    render();
    notify(`${days[index]}曜日の副菜を外しました`);
    return;
  }
  const removeAdditionalSideButton = event.target.closest("[data-remove-additional-side]");
  if (removeAdditionalSideButton) {
    const index = Number(removeAdditionalSideButton.dataset.removeAdditionalSide);
    additionalSideIds[index] = additionalSideIds[index]
      .filter(id => id !== removeAdditionalSideButton.dataset.sideId);
    saveWeeklyMenu();
    render();
    notify(`${days[index]}曜日の追加副菜を外しました`);
    return;
  }
  const addSideDishButton = event.target.closest("[data-add-side-dish]");
  if (addSideDishButton) {
    openSideDishPicker(Number(addSideDishButton.dataset.addSideDish), "add-side");
    return;
  }
  const changeSideDishButton = event.target.closest("[data-change-side-dish]");
  if (changeSideDishButton) {
    openSideDishPicker(Number(changeSideDishButton.dataset.changeSideDish), "replace-side");
    return;
  }
  const changeSoupButton = event.target.closest("[data-change-soup]");
  if (changeSoupButton) {
    openSideDishPicker(Number(changeSoupButton.dataset.changeSoup), "replace-soup");
    return;
  }
  const removeSoupButton = event.target.closest("[data-remove-soup]");
  if (removeSoupButton) {
    const index = Number(removeSoupButton.dataset.removeSoup);
    selectedSoups[index] = null;
    saveWeeklyMenu();
    render();
    notify(`${days[index]}曜日の汁物を外しました`);
    return;
  }
  const eatingOutButton = event.target.closest(".eating-out-button");
  if (eatingOutButton) {
    const index = Number(eatingOutButton.dataset.eatingOutIndex);
    selected[index] = null;
    selectedSides[index] = null;
    selectedSoups[index] = null;
    additionalSideIds[index] = [];
    saveWeeklyMenu();
    const allDaysAreNowOff = selected.every(menuIndex => menuIndex === null);
    allDaysAreNowOff ? renderKeepingScrollPosition() : render();
    notify(`${days[index]}曜日を外食・サボり日にしました`);
    return;
  }
  const soupButton = event.target.closest(".soup-open");
  if (soupButton) {
    recipeReturnContext = null;
    showRecipe(soups[Number(soupButton.dataset.soupRecipe)]);
    return;
  }
  const sideRecipeButton = event.target.closest(".side-dish-open");
  if (sideRecipeButton) {
    recipeReturnContext = null;
    showRecipe(sideDishes[Number(sideRecipeButton.dataset.sideRecipe)]);
    return;
  }
  const recipeButton = event.target.closest(".recipe-open");
  if (recipeButton) {
    recipeReturnContext = null;
    showRecipe(menus[Number(recipeButton.dataset.recipe)]);
    return;
  }
  const simpleButton = event.target.closest(".simple-retry");
  if (simpleButton) {
    const index = Number(simpleButton.dataset.simpleIndex);
    const replacement = randomSimpleMenu(
      [selected[index - 1], selected[index + 1]].filter(value => value !== undefined),
      selected,
      requestedConditions[index]
    );
    if (replacement === null) {
      notify("この季節で選べる、かんたん料理がありません");
      return;
    }
    applyDayReplacement(index, replacement);
    if (selectedSides[index] === null) selectedSides[index] = randomSideDish(selectedSides.filter(value => value !== null), preferredVegetables, menus[replacement]);
    if (selectedSoups[index] === null) selectedSoups[index] = randomSoup(index);
    saveWeeklyMenu();
    render();
    notify(`${days[index]}曜日を、かんたん料理から選びました`);
    return;
  }
  const favoriteButton = event.target.closest(".favorite-retry");
  if (favoriteButton) {
    const index = Number(favoriteButton.dataset.favoriteIndex);
    const replacement = randomFavoriteMenu(
      [selected[index - 1], selected[index + 1]].filter(value => value !== undefined),
      selected,
      requestedConditions[index]
    );
    if (replacement === null) {
      notify("この季節で選べる、お気に入り料理がありません");
      return;
    }
    applyDayReplacement(index, replacement);
    if (selectedSides[index] === null) selectedSides[index] = randomSideDish(selectedSides.filter(value => value !== null), preferredVegetables, menus[replacement]);
    if (selectedSoups[index] === null) selectedSoups[index] = randomSoup(index);
    saveWeeklyMenu();
    render();
    notify(`${days[index]}曜日を、お気に入りから選びました`);
    return;
  }
  const button = event.target.closest(".retry");
  if (!button) return;
  const index = Number(button.dataset.index);
  const replacement = randomMenu(
    [selected[index - 1], selected[index + 1]].filter(value => value !== undefined),
    budgetMode,
    selected.filter((_, day) => day !== index),
    preferredVegetables,
    requestedConditions[index]
  );
  if (replacement === null) {
    notify("この条件で選べる別の料理がありません");
    return;
  }
  applyDayReplacement(index, replacement);
  const sideReplacement = randomSideDish(selectedSides.filter((_, day) => day !== index), preferredVegetables, menus[replacement]);
  if (sideReplacement !== null) selectedSides[index] = sideReplacement;
  const soupReplacement = randomSoup(index);
  if (soupReplacement !== null) selectedSoups[index] = soupReplacement;
  saveWeeklyMenu();
  render();
  notify(`${days[index]}曜日の献立を変えました`);
});

const recipeDialog = document.querySelector("#recipe-dialog");
const recipeEditDialog = document.querySelector("#recipe-edit-dialog");
const shoppingDialog = document.querySelector("#shopping-dialog");
const recipesDialog = document.querySelector("#recipes-dialog");
const favoritesDialog = document.querySelector("#favorites-dialog");
const sideDishPickerDialog = document.querySelector("#side-dish-picker-dialog");
let sideDishPickerDayIndex = null;
let dishPickerMode = "add-side";
let recipeReturnContext = null;
let editingRecipe = null;
let creatingRecipe = false;
let sauceDraft = [];
let favoriteIds = new Set(JSON.parse(localStorage.getItem("favoriteRecipes") || '["pork-shabu"]'));
let simpleIds = new Set(JSON.parse(localStorage.getItem("simpleRecipes") || "[]"));
let consecutiveIds = new Set(JSON.parse(localStorage.getItem("consecutiveRecipes") || "[]"));
let budgetMode = localStorage.getItem("budgetPreference") === "true";
let servings = Number(localStorage.getItem("shoppingServings")) || 2;
if (servings < 1 || servings > 5) servings = 2;
const shoppingExtras = {
  fruit: localStorage.getItem("shoppingFruit") || "",
  sweets: localStorage.getItem("shoppingSweets") || "",
  alcohol: localStorage.getItem("shoppingAlcohol") || "",
  memo: localStorage.getItem("shoppingMemo") || ""
};

function updateBudgetUI() {
  const button = document.querySelector("#budget-preference");
  button.classList.toggle("active", budgetMode);
  button.setAttribute("aria-pressed", budgetMode);
  button.textContent = budgetMode ? "✓ 節約を優先中" : "節約したい";
}

const seasonInfo = {
  spring: {
    label: "春の旬", title: "春の香りを楽しむ",
    text: "やわらかな食感とほろ苦さを、いつもの献立に取り入れます。",
    foods: {
      "果物": ["いちご", "甘夏", "夏みかん", "びわ", "さくらんぼ", "デコポン", "はっさく"],
      "野菜": ["春キャベツ", "たけのこ", "菜の花", "新玉ねぎ", "新じゃがいも", "アスパラガス", "そら豆", "さやえんどう", "ふき", "うど"],
      "魚介類": ["初がつお", "さわら", "桜えび", "しらす", "あさり", "はまぐり", "めばる", "ほたるいか", "たい", "もずく"]
    }
  },
  summer: {
    label: "夏の旬", title: "夏野菜をおいしく",
    text: "みずみずしい食材は彩りもよく、食欲がない日にもおすすめです。",
    foods: {
      "果物": ["すいか", "桃", "ぶどう", "メロン", "梨", "マンゴー", "ブルーベリー", "いちじく", "パイナップル", "あんず"],
      "野菜": ["トマト", "なす", "きゅうり", "とうもろこし", "オクラ", "ピーマン", "ゴーヤ", "ズッキーニ", "枝豆", "みょうが"],
      "魚介類": ["あじ", "いわし", "すずき", "たこ", "あなご", "はも", "あゆ", "かんぱち", "うに", "岩がき"]
    }
  },
  autumn: {
    label: "秋の旬", title: "実りの秋を味わう",
    text: "豊かな香りと、ほくほくした食感を楽しめる季節です。",
    foods: {
      "果物": ["梨", "柿", "りんご", "ぶどう", "栗", "いちじく", "ざくろ", "かぼす", "すだち", "ゆず"],
      "野菜": ["さつまいも", "里いも", "れんこん", "ごぼう", "かぼちゃ", "松茸", "しいたけ", "しめじ", "まいたけ", "銀杏"],
      "魚介類": ["さんま", "秋鮭", "さば", "戻りがつお", "いわし", "かます", "さけいくら", "するめいか", "甘えび", "ししゃも"]
    }
  },
  winter: {
    label: "冬の旬", title: "温かい料理でほっと",
    text: "甘みを増した食材を、鍋や煮込み料理でたっぷりいただきます。",
    foods: {
      "果物": ["みかん", "りんご", "いちご", "ゆず", "きんかん", "レモン", "ポンカン"],
      "野菜": ["白菜", "大根", "長ねぎ", "ほうれん草", "かぶ", "春菊", "小松菜", "水菜", "れんこん", "ブロッコリー"],
      "魚介類": ["ぶり", "たら", "かき", "あんこう", "ふぐ", "ひらめ", "ずわいがに", "わかさぎ", "金目だい", "ほっき貝"]
    }
  },
  none: {
    label: "旬の指定なし", title: "いつもの定番ごはん",
    text: "季節を問わず手に入りやすい食材から提案します。"
  }
};

const heroVisuals = {
  spring: [
    ["🍱","🌸","🍡","お花見弁当"], ["🍚","🌱","🐝","春のたけのこご飯"], ["🍵","🌸","🍓","桜のお茶時間"],
    ["🥪","🌷","🦋","春のピクニック"], ["🍙","🌼","🐤","菜の花おにぎり"]
  ],
  summer: [
    ["🍜","🌻","🎐","涼しいそうめん"], ["🍛","☀️","🍅","夏野菜カレー"], ["🍉","🌊","🐚","夏のすいか"],
    ["🍧","🎆","🏮","夏祭りのかき氷"], ["🌽","🌿","🦀","焼きとうもろこし"]
  ],
  autumn: [
    ["🍚","🍁","🌰","栗ごはん"], ["🍄","🦊","🍂","秋のきのこ"], ["🍠","🌕","🐇","お月見と焼きいも"],
    ["🐟","🍁","🌾","秋刀魚の食卓"], ["🥧","🎃","🍎","実りの秋"]
  ],
  winter: [
    ["🍲","⛄","❄️","雪の日のお鍋"], ["🐟","❄️","🍲","あんこう鍋"], ["🍢","♨️","⛄","あつあつおでん"],
    ["🥘","🎍","🗻","冬のすき焼き"], ["🦀","❄️","♨️","かに鍋と温泉"]
  ],
  none: [
    ["🍚","🌿","🥢","いつものごはん"], ["🍳","☕","🥗","朝の食卓"], ["🍙","✨","🥣","おにぎり定食"],
    ["🍽️","🥕","🥦","彩りごはん"], ["🥘","🏠","❤️","わが家のごはん"]
  ]
};
let lastHeroVisual = -1;

function updateHeroVisual() {
  const visuals = heroVisuals[activeSeason];
  let index = Math.floor(Math.random() * visuals.length);
  if (index === lastHeroVisual) index = (index + 1) % visuals.length;
  lastHeroVisual = index;
  const [main, sideOne, sideTwo, label] = visuals[index];
  const art = document.querySelector("#hero-art");
  art.setAttribute("aria-label", label);
  art.innerHTML = `<div class="season-scene" data-scene-season="${activeSeason}">
    <span class="scene-spark spark-one">✦</span><span class="scene-spark spark-two">●</span>
    <span class="scene-main">${main}</span><span class="scene-side side-one">${sideOne}</span><span class="scene-side side-two">${sideTwo}</span>
    <span class="scene-ground"></span></div>`;
}

function updateSeasonUI() {
  const info = seasonInfo[activeSeason];
  document.querySelector("#season-chip").textContent = info.label;
  document.querySelector("#season-tip-title").textContent = info.title;
  document.querySelector("#season-tip-text").textContent = info.text;
  const foodsElement = document.querySelector("#season-foods");
  foodsElement.hidden = !info.foods;
  foodsElement.innerHTML = info.foods
    ? Object.entries(info.foods)
      .map(([category, foods]) => `<p><strong>${category}</strong><span>${foods.join("、")}</span></p>`)
      .join("")
    : "";
  document.documentElement.dataset.themeSeason = activeSeason;
  updateHeroVisual();
  document.querySelectorAll("button[data-season]").forEach(button => {
    const active = button.dataset.season === activeSeason;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
}

function ingredientRows(ingredients) {
  return ingredients.map(([, name, amount, unit]) => `<li><span>${escapeHtml(name)}</span><strong>${escapeHtml(amount)}${escapeHtml(unit)}</strong></li>`).join("");
}

const seasonalSashimiRecommendations = {
  spring: { label: "春", fish: ["初がつお", "真鯛", "さより", "ほたるいか", "赤貝"] },
  summer: { label: "夏", fish: ["あじ", "すずき", "かんぱち", "いさき", "岩がき"] },
  autumn: { label: "秋", fish: ["戻りがつお", "さんま", "いわし", "するめいか", "甘えび"] },
  winter: { label: "冬", fish: ["ぶり", "ひらめ", "まぐろ", "ほたて", "つぶ貝"] }
};

function currentCalendarSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

function sashimiRecommendationCard(recipe) {
  if (recipe.id !== "seasonal-sashimi-set") return "";
  const recommendation = seasonalSashimiRecommendations[
    activeSeason === "none" ? currentCalendarSeason() : activeSeason
  ];
  return `<aside class="seasonal-sashimi-tip">
    <strong>${recommendation.label}のおすすめ刺身</strong>
    ${recommendation.fish.map(escapeHtml).join("・")}
    <br><small>お店の入荷状況に合わせて、必ず生食用として販売されているものを選んでください。</small>
  </aside>`;
}

function showRecipe(recipe) {
  const isSideDish = recipe.type === "side";
  const isSoup = recipe.type === "soup";
  const isMainDish = !isSideDish && !isSoup;
  const isFavorite = favoriteIds.has(recipe.id);
  const isSimple = simpleIds.has(recipe.id);
  const isConsecutive = consecutiveIds.has(recipe.id);
  const sauces = Array.isArray(recipe.sauces) ? recipe.sauces : [];
  const savedSauceId = selectedSauces[recipe.id];
  const selectedSauce = sauces.find(sauce => sauce.id === savedSauceId) || null;
  const attributes = recipeAttributes(recipe);
  if (savedSauceId && !selectedSauce) {
    delete selectedSauces[recipe.id];
    localStorage.setItem(selectedSaucesStorageKey, JSON.stringify(selectedSauces));
  }
  document.querySelector("#recipe-content").innerHTML = `
    ${recipeReturnContext ? `<button class="back-to-list" type="button" data-back-list>← ${recipeReturnContext.target === "favorites" ? "お気に入り" : "献立"}に戻る</button>` : ""}
    <div class="dialog-head"><div><p class="eyebrow">${isSoup ? "SOUP" : isSideDish ? "SIDE DISH" : "MAIN DISH"}・${Math.max(1, Number(recipe.servings) || APP_CONFIG.recipePhoto.defaultServings)}人分</p><h2>${recipe.icon} ${escapeHtml(recipe.main)}</h2></div><button class="close-dialog" type="button" aria-label="閉じる">×</button></div>
    <p class="recipe-meta">調理時間 約${recipe.time}分　／　${isSoup ? "汁物" : isSideDish ? "副菜" : "主菜"}</p>
    <div class="recipe-attribute-tags" aria-label="料理の属性">${attributes.map(attribute =>
      `<span>${escapeHtml(menuAttributeInfo[attribute]?.label || attribute)}</span>`).join("")}</div>
    <div class="recipe-save-actions">
      <button class="recipe-edit-button" type="button" data-edit-recipe="${recipe.id}" data-recipe-type="${isSoup ? "soup" : isSideDish ? "side" : "main"}">✎ メニューを編集</button>
      <button class="recipe-delete-button" type="button" data-delete-recipe="${recipe.id}" data-recipe-type="${isSoup ? "soup" : isSideDish ? "side" : "main"}">このメニューを削除</button>
    ${isMainDish ? `
      <button class="favorite-toggle ${isFavorite ? "saved" : ""}" type="button" data-favorite="${recipe.id}">${isFavorite ? "♥ お気に入り登録済み" : "♡ お気に入りに追加"}</button>
      <button class="simple-toggle ${isSimple ? "saved" : ""}" type="button" data-simple="${recipe.id}">${isSimple ? "✓ かんたん登録済み" : "＋ かんたんに登録"}</button>
      <button class="consecutive-toggle ${isConsecutive ? "saved" : ""}" type="button" data-consecutive="${recipe.id}">${isConsecutive ? "✓ 連日登録済み" : "＋ 連日に登録"}</button>
    ` : ""}</div>
    ${sashimiRecommendationCard(recipe)}
    ${sauces.length ? `<section class="recipe-sauce">
      <label>たれを選ぶ
        <select data-sauce-select="${recipe.id}">
          <option value="">選択なし</option>
          ${sauces.map(sauce => `<option value="${escapeHtml(sauce.id)}" ${selectedSauce?.id === sauce.id ? "selected" : ""}>${escapeHtml(sauce.name)}</option>`).join("")}
        </select>
      </label>
      <p class="selected-sauce-detail" ${selectedSauce ? "" : "hidden"}>${selectedSauce ? escapeHtml(selectedSauce.detail) : ""}</p>
    </section>` : ""}
    <h3 class="dialog-subtitle">材料</h3><ul class="ingredient-list">${ingredientRows(recipe.ingredients)}</ul>
    <h3 class="dialog-subtitle">作り方</h3><ol class="recipe-steps">${recipe.steps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    ${recipe.memo ? `<h3 class="dialog-subtitle">メモ</h3><p class="recipe-memo">${escapeHtml(recipe.memo)}</p>` : ""}`;
  if (!recipeDialog.open) recipeDialog.showModal();
}

function recipeSource(type) {
  return type === "side" ? sideDishes : type === "soup" ? soups : menus;
}

function renderSauceEditor() {
  const list = document.querySelector("#sauce-edit-list");
  list.innerHTML = sauceDraft.map((sauce, index) => `
    <div class="sauce-edit-row" data-sauce-row="${index}" data-sauce-id="${escapeHtml(sauce.id)}">
      <label>たれの名前<input data-sauce-name type="text" value="${escapeHtml(sauce.name)}" placeholder="例：ごまだれ" required></label>
      <label>材料・作り方<textarea data-sauce-detail rows="2" placeholder="例：しょうゆ、酢、砂糖を混ぜる" required>${escapeHtml(sauce.detail)}</textarea></label>
      <button type="button" data-remove-sauce="${index}" aria-label="このたれを削除">×</button>
    </div>`).join("");
  document.querySelector("#sauce-edit-empty").hidden = sauceDraft.length > 0;
}

function syncSauceDraft() {
  sauceDraft = Array.from(document.querySelectorAll(".sauce-edit-row")).map(row => ({
    id: row.dataset.sauceId,
    name: row.querySelector("[data-sauce-name]").value.trim(),
    detail: row.querySelector("[data-sauce-detail]").value.trim()
  }));
}

function setRecipeAttributeEditor(attributes = []) {
  const selected = new Set(attributes);
  document.querySelectorAll(".recipe-attribute-editor input").forEach(input => {
    input.checked = selected.has(input.value);
  });
}

function openRecipeEditor(recipe) {
  editingRecipe = recipe;
  creatingRecipe = false;
  sauceDraft = (recipe.sauces || []).map(sauce => ({ ...sauce }));
  document.querySelector("#recipe-edit-title").textContent = `${recipe.main}を編集`;
  const type = recipe.type === "side" ? "side" : recipe.type === "soup" ? "soup" : "main";
  document.querySelector("#recipe-edit-type").value = type;
  document.querySelector("#recipe-edit-type").disabled = true;
  document.querySelector("#recipe-edit-season").value = recipe.season;
  document.querySelector("#recipe-edit-name").value = recipe.main;
  document.querySelector("#recipe-edit-icon").value = recipe.icon;
  document.querySelector("#recipe-edit-time").value = recipe.time;
  document.querySelector("#recipe-edit-servings").value = Math.max(1, Number(recipe.servings) || APP_CONFIG.recipePhoto.defaultServings);
  setRecipeAttributeEditor(recipe.attributes || []);
  document.querySelector("#recipe-edit-ingredients").value = recipe.ingredients
    .map(([category, name, amount, unit]) => `${category}｜${name}｜${amount}｜${unit}`)
    .join("\n");
  document.querySelector("#recipe-edit-steps").value = recipe.steps.join("\n");
  document.querySelector("#recipe-edit-memo").value = recipe.memo || "";
  document.querySelector("#recipe-edit-confidence").value = Number.isFinite(Number(recipe.confidence)) ? Number(recipe.confidence) : "";
  document.querySelector("#delete-recipe").hidden = false;
  renderSauceEditor();
  resetRecipePhotoUI(false);
  recipeDialog.close();
  recipeEditDialog.showModal();
}

function openNewRecipeEditor(type = "main", season = activeSeason === "none" ? "none" : activeSeason) {
  editingRecipe = null;
  creatingRecipe = true;
  sauceDraft = [];
  recipeReturnContext = { target: "recipes", season, recipeType: type };
  document.querySelector("#recipe-edit-title").textContent = "新しいメニューを登録";
  document.querySelector("#recipe-edit-type").disabled = false;
  document.querySelector("#recipe-edit-type").value = type;
  document.querySelector("#recipe-edit-season").value = season;
  document.querySelector("#recipe-edit-name").value = "";
  document.querySelector("#recipe-edit-icon").value = "🍳";
  document.querySelector("#recipe-edit-time").value = 15;
  document.querySelector("#recipe-edit-servings").value = APP_CONFIG.recipePhoto.defaultServings;
  setRecipeAttributeEditor([]);
  document.querySelector("#recipe-edit-ingredients").value = "野菜｜材料名｜1｜個";
  document.querySelector("#recipe-edit-steps").value = "材料を下ごしらえする。\n加熱して味を調える。\n器に盛り付ける。";
  document.querySelector("#recipe-edit-memo").value = "";
  document.querySelector("#recipe-edit-confidence").value = "";
  document.querySelector("#delete-recipe").hidden = true;
  renderSauceEditor();
  resetRecipePhotoUI(true);
  recipesDialog.close();
  recipeEditDialog.showModal();
}

document.querySelector("#create-recipe").addEventListener("click", () => {
  const activeType = document.querySelector("#recipes-list [data-menu-type].active")?.dataset.menuType || "main";
  const activeSeasonButton = document.querySelector("#recipes-list [data-collection-season].active");
  const season = activeSeasonButton?.dataset.collectionSeason;
  openNewRecipeEditor(activeType, ["spring", "summer", "autumn", "winter", "none"].includes(season) ? season : activeSeason);
});

document.querySelector(".recipe-attribute-editor").addEventListener("change", event => {
  if (!event.target.matches('input[type="checkbox"]') || !event.target.checked) return;
  const group = mutuallyExclusiveAttributeGroups.find(attributes => attributes.includes(event.target.value));
  if (!group) return;
  document.querySelectorAll(".recipe-attribute-editor input").forEach(input => {
    if (input !== event.target && group.includes(input.value)) input.checked = false;
  });
});

function parseEditedIngredients(value) {
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const ingredients = [];
  for (const line of lines) {
    const parts = line.split(/[|｜]/).map(part => part.trim());
    if (parts.length !== 4 || !parts[0] || !parts[1] || !parts[3] || !Number.isFinite(Number(parts[2]))) return null;
    ingredients.push([parts[0], parts[1], Number(parts[2]), parts[3]]);
  }
  return ingredients.length ? ingredients : null;
}

document.querySelector("#add-sauce").addEventListener("click", () => {
  syncSauceDraft();
  sauceDraft.push({
    id: `sauce-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    detail: ""
  });
  renderSauceEditor();
  document.querySelector(".sauce-edit-row:last-child [data-sauce-name]")?.focus();
});

document.querySelector("#sauce-edit-list").addEventListener("click", event => {
  const button = event.target.closest("[data-remove-sauce]");
  if (!button) return;
  syncSauceDraft();
  sauceDraft.splice(Number(button.dataset.removeSauce), 1);
  renderSauceEditor();
});

document.querySelector("#recipe-edit-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!editingRecipe && !creatingRecipe) return;
  const ingredients = parseEditedIngredients(document.querySelector("#recipe-edit-ingredients").value);
  const steps = document.querySelector("#recipe-edit-steps").value.split(/\r?\n/).map(step => step.trim()).filter(Boolean);
  syncSauceDraft();
  if (!ingredients) {
    notify("材料は「分類｜材料名｜数量｜単位」で入力してください");
    return;
  }
  if (!steps.length || sauceDraft.some(sauce => !sauce.name || !sauce.detail)) {
    notify("作り方と、追加したたれの内容を入力してください");
    return;
  }
  const updated = {
    main: document.querySelector("#recipe-edit-name").value.trim(),
    icon: document.querySelector("#recipe-edit-icon").value.trim() || "🍳",
    season: document.querySelector("#recipe-edit-season").value,
    time: Math.max(1, Number(document.querySelector("#recipe-edit-time").value) || 1),
    servings: Math.max(1, Number(document.querySelector("#recipe-edit-servings").value) || APP_CONFIG.recipePhoto.defaultServings),
    memo: document.querySelector("#recipe-edit-memo").value.trim(),
    attributes: Array.from(document.querySelectorAll(".recipe-attribute-editor input:checked"))
      .map(input => input.value),
    ingredients,
    steps,
    sauces: sauceDraft.map(sauce => ({ ...sauce }))
  };
  const confidenceValue = document.querySelector("#recipe-edit-confidence").value;
  const confidence = Number(confidenceValue);
  if (confidenceValue !== "" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 100) updated.confidence = confidence;
  const isCreating = creatingRecipe;
  if (isCreating) {
    const type = document.querySelector("#recipe-edit-type").value;
    const id = `custom-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    editingRecipe = {
      id,
      type: type === "main" ? undefined : type,
      ...updated,
      isCustom: true
    };
    updated.id = id;
    updated.type = type;
    updated.isCustom = true;
  }
  if (editingRecipe.isCustom) {
    updated.id = editingRecipe.id;
    updated.type = editingRecipe.type === "side" ? "side" : editingRecipe.type === "soup" ? "soup" : "main";
    updated.isCustom = true;
  }
  const recipeToSave = { ...editingRecipe, ...updated };
  const saveButton = event.currentTarget.querySelector('[type="submit"]');
  let sharedRecipesAfterSave = null;
  if (recipeRepository.isAuthenticated()) {
    saveButton.disabled = true;
    saveButton.textContent = "共有へ保存中…";
    try {
      if (isCreating) await recipeRepository.create(recipeToSave);
      else await recipeRepository.update(recipeToSave);
      sharedRecipesAfterSave = await recipeRepository.list();
    } catch (error) {
      notify(error.message || "共有レシピを保存できませんでした");
      return;
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "変更を保存";
    }
  }
  Object.assign(editingRecipe, updated);
  if (isCreating) {
    recipeSource(updated.type).push(editingRecipe);
    creatingRecipe = false;
  }
  menuEdits[editingRecipe.id] = updated;
  const validSauceIds = new Set(updated.sauces.map(sauce => sauce.id));
  if (selectedSauces[editingRecipe.id] && !validSauceIds.has(selectedSauces[editingRecipe.id])) {
    delete selectedSauces[editingRecipe.id];
    localStorage.setItem(selectedSaucesStorageKey, JSON.stringify(selectedSauces));
  }
  if (recipeRepository.isAuthenticated()) {
    delete menuEdits[editingRecipe.id];
    localStorage.removeItem(menuEditsStorageKey);
  } else {
    localStorage.setItem(menuEditsStorageKey, JSON.stringify(menuEdits));
  }
  const savedRecipeType = editingRecipe.type === "side" ? "side" : editingRecipe.type === "soup" ? "soup" : "main";
  recipeReturnContext = {
    target: recipeReturnContext?.target || "recipes",
    season: updated.season,
    recipeType: savedRecipeType
  };
  if (sharedRecipesAfterSave) applySharedRecipes(sharedRecipesAfterSave);
  else render();
  recipeEditDialog.close();
  notify("メニューの変更を保存しました");
});

document.querySelector("#cancel-recipe-edit").addEventListener("click", () => recipeEditDialog.close());

function adjustedSelection(selection, deletedIndex) {
  return selection.map(index => index === null || index === undefined
    ? index
    : index === deletedIndex ? null : index > deletedIndex ? index - 1 : index);
}

function adjustSavedWeeksForDeletion(type, deletedIndex) {
  const field = type === "side" ? "selectedSides" : type === "soup" ? "selectedSoups" : "selected";
  const adjustSaved = saved => {
    if (!saved || !Array.isArray(saved[field])) return saved;
    const affectedDays = type === "main"
      ? saved.selected.map((index, day) => index === deletedIndex ? day : -1).filter(day => day >= 0)
      : [];
    saved[field] = adjustedSelection(saved[field], deletedIndex);
    affectedDays.forEach(day => {
      if (Array.isArray(saved.selectedSides)) saved.selectedSides[day] = null;
      if (Array.isArray(saved.selectedSoups)) saved.selectedSoups[day] = null;
    });
    return saved;
  };
  try {
    const weeks = JSON.parse(localStorage.getItem(weeklyMenusStorageKey) || "{}");
    Object.values(weeks).forEach(adjustSaved);
    localStorage.setItem(weeklyMenusStorageKey, JSON.stringify(weeks));
  } catch { /* 壊れた保存データはそのままにする */ }
  try {
    const legacy = JSON.parse(localStorage.getItem(weeklyMenuStorageKey) || "null");
    if (legacy) localStorage.setItem(weeklyMenuStorageKey, JSON.stringify(adjustSaved(legacy)));
  } catch { /* 旧形式の保存データは読み飛ばす */ }
}

async function deleteRecipe(recipe) {
  if (!recipe || !window.confirm(`「${recipe.main}」を本当に削除しますか？`)) return false;
  const type = recipe.type === "side" ? "side" : recipe.type === "soup" ? "soup" : "main";
  const collection = recipeSource(type);
  const deletedIndex = collection.findIndex(item => item.id === recipe.id);
  if (deletedIndex < 0) return false;
  if (recipeRepository.isAuthenticated()) {
    try { await recipeRepository.delete(recipe.id); }
    catch (error) {
      notify(error.message || "共有レシピを削除できませんでした");
      return false;
    }
  }

  adjustSavedWeeksForDeletion(type, deletedIndex);
  if (type === "main") {
    const affectedDays = selected.map((index, day) => index === deletedIndex ? day : -1).filter(day => day >= 0);
    selected = adjustedSelection(selected, deletedIndex);
    affectedDays.forEach(day => {
      selectedSides[day] = null;
      selectedSoups[day] = null;
    });
  } else if (type === "side") {
    selectedSides = adjustedSelection(selectedSides, deletedIndex);
  } else {
    selectedSoups = adjustedSelection(selectedSoups, deletedIndex);
  }
  collection.splice(deletedIndex, 1);
  delete menuEdits[recipe.id];
  delete selectedSauces[recipe.id];
  deletedRecipeIds = [...new Set([...deletedRecipeIds, recipe.id])];
  favoriteIds.delete(recipe.id);
  simpleIds.delete(recipe.id);
  consecutiveIds.delete(recipe.id);
  if (recipeRepository.isAuthenticated()) {
    localStorage.removeItem(menuEditsStorageKey);
    localStorage.removeItem(deletedRecipesStorageKey);
  } else {
    localStorage.setItem(menuEditsStorageKey, JSON.stringify(menuEdits));
    localStorage.setItem(deletedRecipesStorageKey, JSON.stringify(deletedRecipeIds));
  }
  localStorage.setItem(selectedSaucesStorageKey, JSON.stringify(selectedSauces));
  localStorage.setItem("favoriteRecipes", JSON.stringify([...favoriteIds]));
  localStorage.setItem("simpleRecipes", JSON.stringify([...simpleIds]));
  localStorage.setItem("consecutiveRecipes", JSON.stringify([...consecutiveIds]));
  saveWeeklyMenu();
  editingRecipe = null;
  render();
  notify("メニューを削除しました");
  return true;
}

document.querySelector("#delete-recipe").addEventListener("click", async () => {
  const recipe = editingRecipe;
  if (!await deleteRecipe(recipe)) return;
  recipeEditDialog.close();
  openRecipeList(recipe.season, recipe.type === "side" ? "side" : recipe.type === "soup" ? "soup" : "main");
});

recipeEditDialog.addEventListener("close", () => {
  if (creatingRecipe) {
    creatingRecipe = false;
    openRecipeList(recipeReturnContext?.season, recipeReturnContext?.recipeType || "main");
    return;
  }
  if (!editingRecipe) return;
  const recipe = editingRecipe;
  editingRecipe = null;
  showRecipe(recipe);
});

function collectionCards(recipes, removable = false, recipeType = "main") {
  if (!recipes.length) return '<p class="group-empty">登録はありません</p>';
  return recipes.map(recipe => `<article class="collection-card">
    <button class="collection-recipe" type="button" data-open-recipe="${recipe.id}" data-recipe-type="${recipeType}">
      <span class="collection-icon">${recipe.icon}</span><span><strong>${escapeHtml(recipe.main)}</strong>
        ${recipeType === "main" && favoriteIds.has(recipe.id) ? '<em class="favorite-badge" aria-label="お気に入り">♥</em>' : ""}
        ${recipeType === "main" && simpleIds.has(recipe.id) ? '<em class="simple-badge">かんたん</em>' : ""}
        ${recipeType === "main" && consecutiveIds.has(recipe.id) ? '<em class="consecutive-badge">連日</em>' : ""}
        <small>${recipeType === "main" ? "主菜" : recipeType === "side" ? "副菜" : "汁物"}・約${recipe.time}分</small></span><b>›</b>
    </button>${removable ? `<button class="favorite-remove" type="button" data-remove-favorite="${recipe.id}" aria-label="${escapeHtml(recipe.main)}をお気に入りから削除">♥</button>` : ""}
  </article>`).join("");
}

function groupedCollection(recipes, removable = false, selectedSeason = "spring", target = "recipes", recipeType = "main") {
  const seasonGroups = [
    { id: "spring", icon: "🌸", label: "春の献立", matches: recipe => recipe.season === "spring" },
    { id: "summer", icon: "🌿", label: "夏の献立", matches: recipe => recipe.season === "summer" },
    { id: "autumn", icon: "🍁", label: "秋の献立", matches: recipe => recipe.season === "autumn" },
    { id: "winter", icon: "❄️", label: "冬の献立", matches: recipe => recipe.season === "winter" },
    { id: "none", icon: "🍚", label: "汎用メニュー", matches: recipe => recipe.season === "none" }
  ];
  const mainCategoryGroups = [
    { id: "category-japanese", icon: "🍱", label: "和食", matches: recipe => recipeMealType(recipe) !== "noodle" && recipeCuisine(recipe) === "japanese" },
    { id: "category-western", icon: "🍽️", label: "洋食", matches: recipe => recipeMealType(recipe) !== "noodle" && recipeCuisine(recipe) === "western" },
    { id: "category-chinese", icon: "🥟", label: "中華", matches: recipe => recipeMealType(recipe) !== "noodle" && recipeCuisine(recipe) === "chinese" },
    { id: "category-noodle", icon: "🍜", label: "麺類", matches: recipe => recipeMealType(recipe) === "noodle" }
  ];
  const groups = target === "recipes" && recipeType === "main"
    ? [...seasonGroups, ...mainCategoryGroups]
    : seasonGroups;
  const current = groups.find(group => group.id === selectedSeason) || groups[0];
  const items = recipes.filter(current.matches);
  const buildTabs = tabGroups => tabGroups.map(group => {
    const count = recipes.filter(group.matches).length;
    const shortLabel = group.label.replace("の献立", "").replace("メニュー", "");
    return `<button type="button" class="${group.id === current.id ? "active" : ""}" data-collection-season="${group.id}" data-list-target="${target}" data-recipe-type="${recipeType}" aria-pressed="${group.id === current.id}"><span>${group.icon}</span>${shortLabel}<small>${count}</small></button>`;
  }).join("");
  const seasonTabs = buildTabs(seasonGroups);
  const categoryTabs = target === "recipes" && recipeType === "main"
    ? `<div class="collection-tabs category-collection-tabs" role="tablist" aria-label="料理の分類で絞り込む">${buildTabs(mainCategoryGroups)}</div>`
    : "";
  const typeTabs = target === "recipes" ? `<div class="recipe-type-tabs" role="tablist" aria-label="料理の種類">
    <button type="button" class="${recipeType === "main" ? "active" : ""}" data-menu-type="main" data-list-season="${current.id}">主菜 <small>${menus.length}</small></button>
    <button type="button" class="${recipeType === "side" ? "active" : ""}" data-menu-type="side" data-list-season="${current.id}">副菜 <small>${sideDishes.length}</small></button>
    <button type="button" class="${recipeType === "soup" ? "active" : ""}" data-menu-type="soup" data-list-season="${current.id}">汁物 <small>${soups.length}</small></button>
  </div>` : "";
  return `${typeTabs}<div class="collection-tabs" role="tablist" aria-label="季節で絞り込む">${seasonTabs}</div>
    ${categoryTabs}
    <section class="collection-group" data-group-season="${current.id}">
      <div class="collection-group-head"><h3><span>${current.icon}</span>${current.label}の${recipeType === "main" ? "主菜" : recipeType === "side" ? "副菜" : "汁物"}</h3><small>${items.length}件</small></div>
      <div class="collection-grid">${collectionCards(items, removable, recipeType)}</div>
    </section>`;
}

function openRecipeList(season = activeSeason === "none" ? "spring" : activeSeason, recipeType = "main") {
  const recipes = recipeType === "side" ? sideDishes : recipeType === "soup" ? soups : menus;
  document.querySelector("#recipes-list").innerHTML = groupedCollection(recipes, false, season, "recipes", recipeType);
  if (!recipesDialog.open) recipesDialog.showModal();
}

function openFavorites(season = activeSeason === "none" ? "spring" : activeSeason) {
  const favorites = menus.filter(recipe => favoriteIds.has(recipe.id));
  document.querySelector("#favorites-list").innerHTML = groupedCollection(favorites, true, season, "favorites");
  if (!favoritesDialog.open) favoritesDialog.showModal();
}

function dishSearchText(recipe) {
  return toHiragana(`${recipe.main} ${recipe.ingredients.map(([, name]) => name).join(" ")}`)
    .normalize("NFKC")
    .toLowerCase();
}

function renderSideDishSearchResults() {
  const input = document.querySelector("#side-dish-search-input");
  const query = toHiragana(input.value.trim()).normalize("NFKC").toLowerCase();
  const dayIndex = sideDishPickerDayIndex;
  const isSoup = dishPickerMode === "replace-soup";
  const recipes = isSoup ? soups : sideDishes;
  const currentId = dayIndex === null
    ? null
    : isSoup
      ? selectedSoups[dayIndex] === null ? null : soups[selectedSoups[dayIndex]]?.id
      : selectedSides[dayIndex] === null ? null : sideDishes[selectedSides[dayIndex]]?.id;
  const alreadyAdded = new Set(dayIndex === null || dishPickerMode !== "add-side" ? [] : additionalSideIds[dayIndex]);
  const matches = recipes.filter(recipe => {
    if (recipe.id === currentId || alreadyAdded.has(recipe.id)) return false;
    return !query || dishSearchText(recipe).includes(query);
  });
  document.querySelector("#side-dish-search-results").innerHTML = matches.length
    ? matches.map(recipe => {
      const ingredients = recipe.ingredients.map(([, name]) => name).join("、");
      return `<button class="side-dish-search-result" type="button" data-select-additional-side="${recipe.id}">
        <span aria-hidden="true">${recipe.icon}</span><span><strong>${escapeHtml(recipe.main)}</strong><small>${escapeHtml(ingredients)}・約${recipe.time}分</small></span><b>追加</b>
      </button>`;
    }).join("")
    : `<p class="side-dish-search-empty">「${escapeHtml(input.value.trim())}」を使う${isSoup ? "汁物" : "副菜"}は見つかりませんでした。<br>別の食材名でもお試しください。</p>`;
}

function openSideDishPicker(dayIndex, mode = "add-side") {
  sideDishPickerDayIndex = dayIndex;
  dishPickerMode = mode;
  const actionLabel = mode === "replace-soup" ? "汁物だけ変える" : mode === "replace-side" ? "副菜だけ変える" : "副菜を追加";
  document.querySelector("#side-dish-picker-title").textContent = `${days[dayIndex]}曜日の${actionLabel}`;
  document.querySelector("#side-dish-picker-note").textContent = mode === "add-side"
    ? "使いたい食材や料理名で検索して、この日だけ副菜を追加できます。"
    : `使いたい食材や料理名で検索して、主菜を変えずに${mode === "replace-soup" ? "汁物" : "副菜"}だけ差し替えられます。`;
  const input = document.querySelector("#side-dish-search-input");
  input.value = "";
  renderSideDishSearchResults();
  sideDishPickerDialog.showModal();
  input.focus();
}

document.querySelector("#side-dish-search-input").addEventListener("input", renderSideDishSearchResults);
document.querySelector("#side-dish-search-results").addEventListener("click", event => {
  const button = event.target.closest("[data-select-additional-side]");
  if (!button || sideDishPickerDayIndex === null || weeklyMenuLocked) return;
  const source = dishPickerMode === "replace-soup" ? soups : sideDishes;
  const recipe = source.find(item => item.id === button.dataset.selectAdditionalSide);
  if (!recipe) return;
  const dayIndex = sideDishPickerDayIndex;
  if (dishPickerMode === "replace-soup") {
    selectedSoups[dayIndex] = soups.indexOf(recipe);
  } else if (dishPickerMode === "replace-side") {
    selectedSides[dayIndex] = sideDishes.indexOf(recipe);
  } else {
    additionalSideIds[dayIndex].push(recipe.id);
  }
  saveWeeklyMenu();
  sideDishPickerDialog.close();
  render();
  const action = dishPickerMode === "add-side" ? "追加" : "変更";
  notify(`${days[dayIndex]}曜日を「${recipe.main}」に${action}しました`);
});

function buildShoppingList() {
  const weeklyRecipes = [
    ...selected.map(index => menus[index]),
    ...selectedSides.map(index => sideDishes[index]),
    ...additionalSideIds.flat().map(id => sideDishes.find(recipe => recipe.id === id)),
    ...selectedSoups.map(index => soups[index])
  ];
  const groups = calculateShoppingGroups(weeklyRecipes, servings);
  document.querySelector("#servings-buttons").innerHTML = [1, 2, 3, 4, 5].map(number =>
    `<button type="button" class="${servings === number ? "active" : ""}" data-servings="${number}" aria-pressed="${servings === number}">${number}<small>人分</small></button>`
  ).join("");
  document.querySelector("#shopping-list").innerHTML = Object.entries(groups).map(([category, items]) => `
    <section><h3>${escapeHtml(category)}</h3>${items.map(item => `<label data-item-price="${item.price}"><input type="checkbox" ${category === "調味料" ? "checked" : ""}><span>${escapeHtml(item.name)}<small>約${item.price.toLocaleString("ja-JP")}円</small></span><strong>${formatAmount(item.amount)}${escapeHtml(item.unit)}</strong></label>`).join("")}</section>`).join("");
  document.querySelector("#shopping-fruit").value = shoppingExtras.fruit;
  document.querySelector("#shopping-sweets").value = shoppingExtras.sweets;
  document.querySelector("#shopping-alcohol").value = shoppingExtras.alcohol;
  document.querySelector("#shopping-memo").value = shoppingExtras.memo;
  updateShoppingTotal();
  if (!shoppingDialog.open) shoppingDialog.showModal();
}

function updateShoppingTotal() {
  const remainingTotal = [...document.querySelectorAll("#shopping-list [data-item-price]")]
    .filter(item => !item.querySelector("input").checked)
    .reduce((total, item) => total + Number(item.dataset.itemPrice), 0);
  document.querySelector("#estimated-total").textContent = `約${remainingTotal.toLocaleString("ja-JP")}円`;
}

document.querySelector("#shopping-button").addEventListener("click", buildShoppingList);
document.querySelector("#shopping-nav").addEventListener("click", event => { event.preventDefault(); buildShoppingList(); });
document.querySelector("#recipes-nav").addEventListener("click", event => { event.preventDefault(); openRecipeList(); });
document.querySelector("#favorites-nav").addEventListener("click", event => { event.preventDefault(); openFavorites(); });
document.querySelector("#shopping-list").addEventListener("change", event => {
  if (event.target.matches('input[type="checkbox"]')) updateShoppingTotal();
});
document.querySelector("#recipe-content").addEventListener("change", event => {
  const select = event.target.closest("[data-sauce-select]");
  if (!select) return;
  const recipe = [...menus, ...sideDishes, ...soups].find(item => item.id === select.dataset.sauceSelect);
  if (!recipe) return;
  const sauce = (recipe.sauces || []).find(item => item.id === select.value);
  if (sauce) selectedSauces[recipe.id] = sauce.id;
  else delete selectedSauces[recipe.id];
  localStorage.setItem(selectedSaucesStorageKey, JSON.stringify(selectedSauces));
  const detail = select.closest(".recipe-sauce").querySelector(".selected-sauce-detail");
  detail.textContent = sauce?.detail || "";
  detail.hidden = !sauce;
  notify(sauce ? `${sauce.name}を選びました` : "たれの選択を外しました");
});
[
  ["#shopping-fruit", "fruit", "shoppingFruit"],
  ["#shopping-sweets", "sweets", "shoppingSweets"],
  ["#shopping-alcohol", "alcohol", "shoppingAlcohol"],
  ["#shopping-memo", "memo", "shoppingMemo"]
].forEach(([selector, property, storageKey]) => {
  document.querySelector(selector).addEventListener("input", event => {
    shoppingExtras[property] = event.target.value;
    localStorage.setItem(storageKey, event.target.value);
  });
});
document.addEventListener("click", async event => {
  const recipeDeleteButton = event.target.closest("[data-delete-recipe]");
  if (recipeDeleteButton) {
    const type = recipeDeleteButton.dataset.recipeType;
    const recipe = recipeSource(type).find(item => item.id === recipeDeleteButton.dataset.deleteRecipe);
    if (!await deleteRecipe(recipe)) return;
    const returnContext = recipeReturnContext ? { ...recipeReturnContext } : null;
    recipeDialog.close();
    returnContext?.target === "favorites"
      ? openFavorites(returnContext.season)
      : openRecipeList(returnContext?.season || recipe.season, returnContext?.recipeType || type);
    return;
  }
  const recipeEditButton = event.target.closest("[data-edit-recipe]");
  if (recipeEditButton) {
    const recipe = recipeSource(recipeEditButton.dataset.recipeType)
      .find(item => item.id === recipeEditButton.dataset.editRecipe);
    if (recipe) openRecipeEditor(recipe);
    return;
  }
  const backButton = event.target.closest("[data-back-list]");
  if (backButton && recipeReturnContext) {
    const context = { ...recipeReturnContext };
    recipeDialog.close();
    context.target === "favorites"
      ? openFavorites(context.season)
      : openRecipeList(context.season, context.recipeType || "main");
    return;
  }
  const collectionTab = event.target.closest("[data-collection-season]");
  if (collectionTab) {
    const season = collectionTab.dataset.collectionSeason;
    collectionTab.dataset.listTarget === "favorites"
      ? openFavorites(season)
      : openRecipeList(season, collectionTab.dataset.recipeType || "main");
    return;
  }
  const menuTypeButton = event.target.closest("[data-menu-type]");
  if (menuTypeButton) {
    openRecipeList(menuTypeButton.dataset.listSeason, menuTypeButton.dataset.menuType);
    return;
  }
  const seasonButton = event.target.closest("button[data-season]");
  if (seasonButton) {
    activeSeason = activeSeason === seasonButton.dataset.season ? "none" : seasonButton.dataset.season;
    localStorage.setItem("menuSeason", activeSeason);
    selected = ingredientExclusionMode ? generateWeek() : initialSeasonSelection();
    selectedSides = generateSideWeek([], selected);
    selectedSoups = generateSoupWeek([], selected);
    additionalSideIds = Array.from({ length: 7 }, () => []);
    saveWeeklyMenu();
    updateSeasonUI();
    render();
    notify(`${seasonInfo[activeSeason].label}の献立に変更しました`);
    return;
  }
  const servingsButton = event.target.closest("[data-servings]");
  if (servingsButton) {
    servings = Number(servingsButton.dataset.servings);
    localStorage.setItem("shoppingServings", servings);
    buildShoppingList();
    notify(`${servings}人分に変更しました`);
    return;
  }
  const openButton = event.target.closest("[data-open-recipe]");
  if (openButton) {
    const recipeType = openButton.dataset.recipeType || "main";
    const sourceDialog = event.target.closest("dialog");
    recipeReturnContext = {
      target: sourceDialog?.id === "favorites-dialog" ? "favorites" : "recipes",
      season: openButton.closest("[data-group-season]")?.dataset.groupSeason || "spring",
      recipeType
    };
    sourceDialog?.close();
    const source = recipeType === "side" ? sideDishes : recipeType === "soup" ? soups : menus;
    showRecipe(source.find(recipe => recipe.id === openButton.dataset.openRecipe));
    return;
  }
  const favoriteButton = event.target.closest("[data-favorite]");
  if (favoriteButton) {
    const id = favoriteButton.dataset.favorite;
    favoriteIds.has(id) ? favoriteIds.delete(id) : favoriteIds.add(id);
    localStorage.setItem("favoriteRecipes", JSON.stringify([...favoriteIds]));
    showRecipe(menus.find(recipe => recipe.id === id));
    render();
    notify(favoriteIds.has(id) ? "お気に入りに追加しました" : "お気に入りから外しました");
    return;
  }
  const simpleButton = event.target.closest("[data-simple]");
  if (simpleButton) {
    const id = simpleButton.dataset.simple;
    simpleIds.has(id) ? simpleIds.delete(id) : simpleIds.add(id);
    localStorage.setItem("simpleRecipes", JSON.stringify([...simpleIds]));
    showRecipe(menus.find(recipe => recipe.id === id));
    render();
    notify(simpleIds.has(id) ? "かんたんに登録しました" : "かんたん登録を外しました");
    return;
  }
  const consecutiveButton = event.target.closest("[data-consecutive]");
  if (consecutiveButton) {
    const id = consecutiveButton.dataset.consecutive;
    consecutiveIds.has(id) ? consecutiveIds.delete(id) : consecutiveIds.add(id);
    localStorage.setItem("consecutiveRecipes", JSON.stringify([...consecutiveIds]));
    showRecipe(menus.find(recipe => recipe.id === id));
    notify(consecutiveIds.has(id) ? "連日メニューに登録しました" : "連日登録を外しました");
    return;
  }
  const removeButton = event.target.closest("[data-remove-favorite]");
  if (removeButton) {
    const shownSeason = removeButton.closest("[data-group-season]")?.dataset.groupSeason || "spring";
    favoriteIds.delete(removeButton.dataset.removeFavorite);
    localStorage.setItem("favoriteRecipes", JSON.stringify([...favoriteIds]));
    openFavorites(shownSeason);
    render();
  }
});
document.querySelectorAll(".app-dialog").forEach(dialog => {
  dialog.addEventListener("click", event => {
    if (event.target === dialog || event.target.closest(".close-dialog")) dialog.close();
  });
});

document.querySelector("#shuffle-partial").addEventListener("click", () => {
  const eatingOutDays = selected.map(menuIndex => menuIndex === null);
  const regeneratedMenus = generateWeek(budgetMode, preferredVegetables, requestedConditions, eatingOutDays);
  const regeneratedSides = generateSideWeek(preferredVegetables, regeneratedMenus);
  const regeneratedSoups = generateSoupWeek(preferredVegetables, regeneratedMenus);
  selected = regeneratedMenus.map((menuIndex, index) => eatingOutDays[index] ? null : menuIndex);
  selectedSides = regeneratedSides.map((sideIndex, index) => eatingOutDays[index] ? null : sideIndex);
  selectedSoups = regeneratedSoups.map((soupIndex, index) => eatingOutDays[index] ? null : soupIndex);
  saveWeeklyMenu();
  render();
  const fixedCount = eatingOutDays.filter(Boolean).length;
  notify(fixedCount
    ? `外食・サボり日${fixedCount}日を残して再提案しました`
    : "一週間の献立を再提案しました");
});

document.querySelector("#shuffle-all").addEventListener("click", () => {
  selected = generateWeek();
  selectedSides = generateSideWeek();
  selectedSoups = generateSoupWeek();
  additionalSideIds = Array.from({ length: 7 }, () => []);
  saveWeeklyMenu();
  shoppingExtras.fruit = "";
  shoppingExtras.sweets = "";
  shoppingExtras.alcohol = "";
  shoppingExtras.memo = "";
  localStorage.removeItem("shoppingFruit");
  localStorage.removeItem("shoppingSweets");
  localStorage.removeItem("shoppingAlcohol");
  localStorage.removeItem("shoppingMemo");
  document.querySelector("#shopping-fruit").value = "";
  document.querySelector("#shopping-sweets").value = "";
  document.querySelector("#shopping-alcohol").value = "";
  document.querySelector("#shopping-memo").value = "";
  render();
  notify("一週間の献立を再提案しました");
});

document.querySelector("#take-week-off").addEventListener("click", () => {
  selected = Array(7).fill(null);
  selectedSides = Array(7).fill(null);
  selectedSoups = Array(7).fill(null);
  additionalSideIds = Array.from({ length: 7 }, () => []);
  saveWeeklyMenu();
  renderKeepingScrollPosition();
  notify("今週はお休みにしました。ゆっくりしてくださいね");
});

document.querySelector("#generate").addEventListener("click", () => {
  const request = document.querySelector("#request").value.trim();
  updateRecognizedDays();
  const vegetableInput = document.querySelector("#vegetable-input").value.trim();
  if (ingredientExclusionMode) {
    excludedIngredients = parseFoodInput(vegetableInput);
    preferredVegetables = [];
  } else {
    excludedIngredients = [];
    preferredVegetables = [...new Set([
      ...parseFoodInput(vegetableInput),
      ...parsePreferredVegetables(request)
    ])];
  }
  selected = generateWeek(budgetMode, preferredVegetables);
  selectedSides = generateSideWeek(preferredVegetables);
  selectedSoups = generateSoupWeek(preferredVegetables);
  additionalSideIds = Array.from({ length: 7 }, () => []);
  saveWeeklyMenu();
  render();
  const vegetableMessage = ingredientExclusionMode && excludedIngredients.length
    ? `${excludedIngredients.length}種類の食材を除外しました`
    : preferredVegetables.length
    ? `${preferredVegetables.length}種類の食材を優先しました`
    : vegetableInput
      ? "一致する食材を確認できなかったため通常の献立を提案しました"
      : "";
  notify(vegetableMessage || (request ? "希望を反映して献立をつくりました" : "旬の食材から献立をつくりました"));
  document.querySelector("#weekly-title").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("#request").addEventListener("input", updateRecognizedDays);

document.querySelector("#clear-request").addEventListener("click", () => {
  const field = document.querySelector("#request");
  field.value = "";
  updateRecognizedDays();
  field.focus();
});

document.querySelector("#clear-vegetables").addEventListener("click", () => {
  const field = document.querySelector("#vegetable-input");
  field.value = "";
  preferredVegetables = [];
  excludedIngredients = [];
  localStorage.removeItem("preferredVegetableInput");
  field.focus();
});

document.querySelector("#vegetable-input").addEventListener("input", event => {
  localStorage.setItem("preferredVegetableInput", event.target.value);
  if (ingredientExclusionMode) excludedIngredients = parseFoodInput(event.target.value);
});

function updateIngredientExclusionUI() {
  const button = document.querySelector("#exclude-ingredients");
  button.setAttribute("aria-pressed", String(ingredientExclusionMode));
  button.textContent = ingredientExclusionMode ? "✓ 除外中" : "除外";
  document.querySelector("#vegetable-input").setAttribute(
    "aria-label",
    ingredientExclusionMode ? "献立に使用しない食材" : "献立で優先する食材"
  );
}

document.querySelector("#exclude-ingredients").addEventListener("click", () => {
  ingredientExclusionMode = !ingredientExclusionMode;
  localStorage.setItem("ingredientExclusionMode", String(ingredientExclusionMode));
  const value = document.querySelector("#vegetable-input").value;
  if (ingredientExclusionMode) {
    excludedIngredients = parseFoodInput(value);
    preferredVegetables = [];
  } else {
    excludedIngredients = [];
    preferredVegetables = parseFoodInput(value);
  }
  updateIngredientExclusionUI();
  if (value.trim() && !document.querySelector("#generate").disabled) {
    document.querySelector("#generate").click();
    return;
  }
  notify(ingredientExclusionMode
    ? "入力した食材を献立の候補から除外します"
    : "入力した食材を優先する設定に戻しました");
});

document.querySelectorAll("[data-request-day]").forEach(button => {
  button.addEventListener("click", () => {
    const field = document.querySelector("#request");
    const index = Number(button.dataset.requestDay);
    const active = button.getAttribute("aria-pressed") === "true";
    if (active) {
      field.value = removeRequestedDay(field.value, index)
        .replace(/[、，,]{2,}/g, "、")
        .replace(/^[\s、，,]+|[\s、，,]+$/g, "")
        .trim();
    } else {
      const label = `${days[index]}曜`;
      field.value = field.value ? `${field.value}、${label}` : label;
    }
    updateRecognizedDays();
    field.focus();
  });
});

document.querySelectorAll("[data-request-attribute]").forEach(button => {
  button.addEventListener("click", () => {
    const field = document.querySelector("#request");
    const attribute = button.dataset.requestAttribute;
    const active = button.getAttribute("aria-pressed") === "true";
    const group = mutuallyExclusiveAttributeGroups.find(attributes => attributes.includes(attribute)) || [attribute];
    const attributesToRemove = active ? [attribute] : group;
    attributesToRemove.forEach(key => {
      menuAttributeInfo[key].words.forEach(word => {
        field.value = field.value.replaceAll(word, "");
      });
    });
    field.value = field.value
      .replace(/[、，,]{2,}/g, "、")
      .replace(/^[\s、，,]+|[\s、，,]+$/g, "")
      .trim();
    if (!active) {
      const label = menuAttributeInfo[attribute].label;
      field.value = field.value ? `${field.value}、${label}` : label;
    }
    updateRecognizedDays();
    field.focus();
  });
});

document.querySelectorAll("[data-request]").forEach(button => {
  button.addEventListener("click", () => {
    if (button.dataset.preference === "budget") {
      budgetMode = !budgetMode;
      localStorage.setItem("budgetPreference", budgetMode);
      updateBudgetUI();
      if (!budgetMode) {
        notify("節約の優先を解除しました");
        return;
      }
      notify("価格の低い献立を優先します");
    }
    const field = document.querySelector("#request");
    field.value = field.value ? `${field.value}、${button.dataset.request}` : button.dataset.request;
    updateRecognizedDays();
    field.focus();
  });
});

document.querySelector("#previous-week").addEventListener("click", () => changeVisibleWeek(-1));
document.querySelector("#next-week").addEventListener("click", () => changeVisibleWeek(1));
document.querySelector("#previous-day").addEventListener("click", () => changeMobileDay(-1));
document.querySelector("#next-day").addEventListener("click", () => changeMobileDay(1));
document.querySelector("#mobile-week-days").addEventListener("click", event => {
  const button = event.target.closest("[data-mobile-day]");
  if (!button) return;
  mobileDayIndex = Number(button.dataset.mobileDay);
  updateMobileDayUI();
});

let mobileSwipeStart = null;
list.addEventListener("touchstart", event => {
  const touch = event.changedTouches[0];
  mobileSwipeStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
list.addEventListener("touchend", event => {
  if (!mobileSwipeStart || !window.matchMedia("(max-width: 768px)").matches) return;
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - mobileSwipeStart.x;
  const deltaY = touch.clientY - mobileSwipeStart.y;
  mobileSwipeStart = null;
  if (Math.abs(deltaX) < 55 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
  changeMobileDay(deltaX < 0 ? 1 : -1);
}, { passive: true });
document.querySelector("#lock-weekly-menu").addEventListener("click", () => {
  saveVisibleWeekLock(!weeklyMenuLocked);
  updateWeeklyLockUI();
  render();
  notify(weeklyMenuLocked
    ? "この週の献立を固定しました"
    : "この週の献立の固定を解除しました");
});
document.querySelector("#current-week").addEventListener("click", () => {
  const offset = Math.round((currentWeekStart - visibleWeekStart) / (7 * 24 * 60 * 60 * 1000));
  if (offset) changeVisibleWeek(offset);
});

initializeRecipePhoto({
  onAnalyzed(recipe) {
    document.querySelector("#recipe-edit-type").value = recipe.category;
    document.querySelector("#recipe-edit-season").value = ["spring", "summer", "autumn", "winter", "none"].includes(recipe.season)
      ? recipe.season
      : "none";
    document.querySelector("#recipe-edit-name").value = recipe.name.trim();
    document.querySelector("#recipe-edit-icon").value = recipe.icon?.trim() || "🍳";
    document.querySelector("#recipe-edit-time").value = Math.max(1, Math.round(recipe.time));
    document.querySelector("#recipe-edit-servings").value = Math.max(1, Math.round(recipe.servings || APP_CONFIG.recipePhoto.defaultServings));
    document.querySelector("#recipe-edit-confidence").value = Math.round(recipe.confidence);
    setRecipeAttributeEditor(Array.isArray(recipe.attributes) ? recipe.attributes : []);
    document.querySelector("#recipe-edit-ingredients").value = recipe.ingredients.map(ingredient =>
      `${ingredient.category || "その他"}｜${ingredient.name.trim()}｜${ingredient.amount}｜${ingredient.unit.trim()}`
    ).join("\n");
    document.querySelector("#recipe-edit-steps").value = recipe.steps.map(step => step.trim()).filter(Boolean).join("\n");
    const warnings = Array.isArray(recipe.warnings) ? recipe.warnings.filter(Boolean) : [];
    document.querySelector("#recipe-edit-memo").value = [recipe.memo?.trim(), ...warnings.map(warning => `注意: ${warning}`)]
      .filter(Boolean)
      .join("\n");
  }
});

initializeFamilySharing({
  getLocalRecipes: () => [...menus, ...sideDishes, ...soups],
  applySharedRecipes,
  onReady: () => notify("家族の共有レシピと同期しました")
});

document.querySelector("#request").value = localStorage.getItem("menuRequest") || "";
document.querySelector("#vegetable-input").value = localStorage.getItem("preferredVegetableInput") || "";
if (ingredientExclusionMode) {
  excludedIngredients = parseFoodInput(document.querySelector("#vegetable-input").value);
}
updateIngredientExclusionUI();
updateRecognizedDays();
updateWeeklyDateUI();
updateSeasonUI();
updateBudgetUI();
updateWeeklyLockUI();
render();
scheduleDateRollover();
