import test from "node:test";
import assert from "node:assert/strict";
import {
  generateMenuWeek,
  mergeProtectedMenuDays,
  replaceMenuDay,
  selectRecipeIndex
} from "../../js/menu-shuffler.js";
import {
  applyRequestedMenuAssignments,
  parseRequestedMenuAssignments
} from "../../js/requested-menu-loader.js";

function createRecipes(count = 30) {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? "classic-curry" : `recipe-${index}`,
    main: index === 0 ? "わが家の定番カレー" : `ダミー献立${index}`,
    season: "none",
    ingredients: []
  }));
}

function weekStarting(year, monthIndex, day) {
  return Array.from({ length: 7 }, (_, index) => new Date(year, monthIndex, day + index));
}

function createRandom(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleWeek(recipes, options = {}) {
  return generateMenuWeek({
    recipes,
    preferBudget: false,
    vegetables: [],
    conditions: Array.from({ length: 7 }, () => []),
    unavailableDays: Array(7).fill(false),
    consecutiveRecipeIds: new Set(),
    matchesSeason: () => true,
    recipeUsesExcludedIngredient: () => false,
    matchesAttributes: () => true,
    recipeAttributes: () => [],
    vegetableMatchCount: () => 0,
    estimateRecipeCost: () => 0,
    debug: false,
    ...options
  });
}

test("30品程度から1000回シャッフルして特定料理が毎回採用されない", () => {
  const recipes = createRecipes(30);
  const counts = new Map(recipes.map(recipe => [recipe.id, 0]));
  const random = createRandom(20260902);

  for (let trial = 0; trial < 1000; trial += 1) {
    const selectedIds = new Set(shuffleWeek(recipes, { random }).map(index => recipes[index]?.id));
    selectedIds.forEach(id => counts.set(id, counts.get(id) + 1));
  }

  assert.ok(counts.get("classic-curry") < 1000);
  assert.ok([...counts.values()].every(count => count < 1000));
});

test("固定日の料理は一部再提案の抽選候補から除外する", () => {
  const recipes = createRecipes(30);
  const fixedRecipeIndex = 0;
  const shuffled = shuffleWeek(recipes, {
    unavailableDays: [false, false, true, false, false, false, false],
    reservedRecipeIndexes: [fixedRecipeIndex],
    random: () => 0
  });

  assert.equal(shuffled[2], null);
  assert.equal(shuffled.includes(fixedRecipeIndex), false);
});

test("今週の希望を反映した週では指定曜日にカレーが入る", () => {
  const recipes = createRecipes(30);
  const dates = weekStarting(2026, 7, 30);
  const assignments = parseRequestedMenuAssignments("水曜：わが家の定番カレー", recipes, dates);
  const shuffled = shuffleWeek(recipes, { random: createRandom(1) });
  const selected = applyRequestedMenuAssignments(shuffled, assignments, dates, {
    recipes,
    consecutiveRecipeIds: new Set()
  });

  assert.equal(recipes[selected[3]].id, "classic-curry");
});

test("今週の希望を削除した後の通常シャッフルには保存済み希望を混ぜない", () => {
  const recipes = createRecipes(30);
  const dates = weekStarting(2026, 7, 30);
  const staleAssignments = parseRequestedMenuAssignments("水曜：わが家の定番カレー", recipes, dates);
  const random = createRandom(7);
  const afterDeletedRequest = shuffleWeek(recipes, {
    requestedAssignments: [],
    random
  });
  const wronglyApplied = applyRequestedMenuAssignments(afterDeletedRequest, staleAssignments, dates, {
    recipes,
    consecutiveRecipeIds: new Set()
  });

  assert.notEqual(afterDeletedRequest[3], recipes.findIndex(recipe => recipe.id === "classic-curry"));
  assert.equal(recipes[wronglyApplied[3]].id, "classic-curry");
});

test("連日料理は通常抽選で選ばれた場合だけ翌日に展開される", () => {
  const recipes = createRecipes(30);
  const neverPickCurry = shuffleWeek(recipes, {
    consecutiveRecipeIds: new Set(["classic-curry"]),
    random: createRandom(3)
  });
  assert.equal(neverPickCurry.includes(0), false);

  const pickCurryFirst = shuffleWeek(recipes, {
    consecutiveRecipeIds: new Set(["classic-curry"]),
    random: () => 0
  });
  assert.deepEqual(pickCurryFirst.slice(0, 2), [0, 0]);
});

test("ページ再読み込み相当で削除済み希望がなくても通常シャッフルに混入しない", () => {
  const recipes = createRecipes(30);
  const firstLoad = shuffleWeek(recipes, {
    requestedAssignments: [],
    random: createRandom(11)
  });
  const afterReload = shuffleWeek(recipes, {
    requestedAssignments: [],
    random: createRandom(11)
  });

  assert.deepEqual(afterReload, firstLoad);
  assert.ok(afterReload.some(index => recipes[index]?.id !== "classic-curry"));
});

test("候補不足を7日未満の正常結果として返さない", () => {
  assert.throws(
    () => shuffleWeek(createRecipes(3), { random: () => 0 }),
    error => error.code === "MENU_CANDIDATES_EXHAUSTED" && error.dayIndex === 3
  );
});

test("1日生成と週生成の先頭日は同じ候補抽出規則を使う", () => {
  const recipes = createRecipes(10);
  const options = {
    recipes,
    excludes: [],
    preferBudget: false,
    vegetables: [],
    attributes: [],
    matchesSeason: () => true,
    recipeUsesExcludedIngredient: () => false,
    matchesAttributes: () => true,
    recipeAttributes: () => [],
    vegetableMatchCount: () => 0,
    estimateRecipeCost: () => 0,
    random: () => 0.4
  };
  const oneDay = selectRecipeIndex(options);
  const week = shuffleWeek(recipes, { random: () => 0.4 });
  assert.equal(week[0], oneDay);
});

test("固定日と外食日は未固定日の再生成・お気に入り・かんたん経路でも変更しない", () => {
  const previous = ["fixed", null, "normal"];
  assert.deepEqual(
    mergeProtectedMenuDays(previous, ["new-a", "new-b", "new-c"], [true, false, false]),
    ["fixed", null, "new-c"]
  );
  const fixedResult = replaceMenuDay(previous, 0, "favorite", { manuallySelectedDays: [true, false, false] });
  const offResult = replaceMenuDay(previous, 1, "simple", { manuallySelectedDays: [true, false, false] });
  assert.equal(fixedResult.changed, false);
  assert.equal(offResult.changed, false);
  assert.deepEqual(fixedResult.selection, previous);
  assert.deepEqual(offResult.selection, previous);
});

test("連日料理でも翌日の固定・外食状態を上書きしない", () => {
  const fixedNext = replaceMenuDay(["old", "fixed"], 0, "hotpot", {
    manuallySelectedDays: [false, true],
    consecutiveRecipeIds: new Set(["hotpot"])
  });
  const offNext = replaceMenuDay(["old", null], 0, "hotpot", {
    consecutiveRecipeIds: new Set(["hotpot"])
  });
  assert.deepEqual(fixedNext.selection, ["hotpot", "fixed"]);
  assert.deepEqual(offNext.selection, ["hotpot", null]);
});
