import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRequestedMenuAssignments,
  loadRequestedMenuSelection,
  parseRequestedMenuAssignments,
  parseRequestedMenuResult,
  restoreRequestedMenuAssignments,
  serializeRequestedMenuAssignments
} from "../../js/requested-menu-loader.js";

const recipes = [
  { id: "curry", main: "わが家の定番カレー" },
  { id: "fish", main: "焼き魚" },
  { id: "hamburger", main: "定番ハンバーグ" },
  { id: "hotpot", main: "白菜と豚肉のミルフィーユ鍋" }
];

function weekStarting(year, monthIndex, day) {
  return Array.from({ length: 7 }, (_, index) => new Date(year, monthIndex, day + index));
}

test("同じ料理を連日でも日付単位で保持する", () => {
  const result = parseRequestedMenuAssignments(
    "火：カレー\n水：カレー",
    recipes,
    weekStarting(2026, 7, 30)
  );
  assert.deepEqual(result.map(item => [item.dayIndex, item.recipeIndex]), [[2, 0], [3, 0]]);
});

test("希望がある曜日だけを抽出する", () => {
  const result = parseRequestedMenuAssignments(
    "火曜日：カレー\n木曜日：焼き魚",
    recipes,
    weekStarting(2026, 7, 30)
  );
  assert.deepEqual(result.map(item => item.dayIndex), [2, 4]);
});

test("同じ料理を3日連続で保持する", () => {
  const result = parseRequestedMenuAssignments(
    "月：鍋\n火：鍋\n水：鍋",
    recipes,
    weekStarting(2026, 7, 30)
  );
  assert.deepEqual(result.map(item => item.dayIndex), [1, 2, 3]);
});

test("空欄は割り当てを返さない", () => {
  assert.deepEqual(parseRequestedMenuAssignments("", recipes, weekStarting(2026, 7, 30)), []);
});

test("希望のない曜日は既存献立を残し、希望のある曜日だけ上書きする", () => {
  const dates = weekStarting(2026, 7, 30);
  const assignments = parseRequestedMenuAssignments("火：カレー\n木：焼き魚", recipes, dates);
  const existing = [2, 2, 2, 2, 2, 2, 2];
  assert.deepEqual(
    applyRequestedMenuAssignments(existing, assignments, dates),
    [2, 2, 0, 2, 1, 2, 2]
  );
});

test("希望が空欄なら既存献立を変更しない", () => {
  const dates = weekStarting(2026, 7, 30);
  const existing = [0, 1, 2, 3, 0, 1, 2];
  assert.deepEqual(applyRequestedMenuAssignments(existing, [], dates), existing);
});

test("月・年をまたぐ週も実日付で対応する", () => {
  const dates = weekStarting(2026, 11, 27);
  const result = parseRequestedMenuAssignments(
    "12/29：カレー\n2027年1月1日：焼き魚",
    recipes,
    dates
  );
  assert.deepEqual(result.map(item => [item.date, item.dayIndex]), [
    ["2026-12-29", 2],
    ["2027-01-01", 5]
  ]);
});

test("連日登録された料理は翌日にも展開する", () => {
  const dates = weekStarting(2026, 7, 30);
  const assignments = parseRequestedMenuAssignments("火曜 カレー", recipes, dates);
  const result = applyRequestedMenuAssignments([1, 1, 1, 1, 1, 1, 1], assignments, dates, {
    recipes,
    consecutiveRecipeIds: new Set(["curry"])
  });
  assert.deepEqual(result, [1, 1, 0, 0, 1, 1, 1]);
});

test("連日登録されていない料理は指定曜日だけに反映する", () => {
  const dates = weekStarting(2026, 7, 30);
  const assignments = parseRequestedMenuAssignments("火曜 カレー", recipes, dates);
  const result = applyRequestedMenuAssignments([1, 1, 1, 1, 1, 1, 1], assignments, dates, {
    recipes,
    consecutiveRecipeIds: new Set()
  });
  assert.deepEqual(result, [1, 1, 0, 1, 1, 1, 1]);
});

test("部分一致が複数なら料理を選ばない", () => {
  const curryRecipes = [
    { id: "classic", main: "わが家の定番カレー" },
    { id: "butter", main: "バターチキンカレー" },
    { id: "udon", main: "カレーうどん" }
  ];
  const result = parseRequestedMenuResult("火曜 カレー", curryRecipes, weekStarting(2026, 7, 30));
  assert.equal(result.assignments.length, 0);
  assert.equal(result.issues[0].status, "ambiguous");
  assert.equal(result.issues[0].candidates.length, 3);
});

test("完全一致は複数の部分一致より優先する", () => {
  const curryRecipes = [
    { id: "classic", main: "わが家の定番カレー" },
    { id: "butter", main: "バターチキンカレー" },
    { id: "udon", main: "カレーうどん" }
  ];
  const result = parseRequestedMenuResult("火曜 わが家の定番カレー", curryRecipes, weekStarting(2026, 7, 30));
  assert.equal(result.issues.length, 0);
  assert.equal(result.assignments[0].recipeId, "classic");
});

test("一致しない料理は未登録として返す", () => {
  const result = parseRequestedMenuResult("木曜 オムライス", recipes, weekStarting(2026, 7, 30));
  assert.equal(result.assignments.length, 0);
  assert.equal(result.issues[0].status, "not-found");
});

test("料理IDで保存した希望を再読み込み後に復元する", () => {
  const dates = weekStarting(2026, 7, 30);
  const parsed = parseRequestedMenuAssignments("火曜 カレー", recipes, dates);
  const saved = JSON.parse(JSON.stringify(serializeRequestedMenuAssignments(parsed)));
  const restored = restoreRequestedMenuAssignments(saved, recipes, dates);
  assert.equal(restored[0].recipeId, "curry");
  assert.equal(restored[0].dayIndex, 2);
  assert.equal(restored[0].recipeIndex, 0);
});

test("年跨ぎでも連日登録を実日付の翌日に展開する", () => {
  const dates = weekStarting(2026, 11, 27);
  const assignments = parseRequestedMenuAssignments("12/31 カレー", recipes, dates);
  const result = applyRequestedMenuAssignments([1, 1, 1, 1, 1, 1, 1], assignments, dates, {
    recipes,
    consecutiveRecipeIds: new Set(["curry"])
  });
  assert.equal(result[4], 0);
  assert.equal(result[5], 0);
});

test("D1同期後に料理の並び順が変わっても料理IDで反映する", () => {
  const dates = weekStarting(2026, 7, 30);
  const assignments = parseRequestedMenuAssignments("火曜 定番カレー", recipes, dates);
  const reorderedRecipes = [recipes[1], recipes[0], recipes[2], recipes[3]];
  const result = applyRequestedMenuAssignments([0, 0, 0, 0, 0, 0, 0], assignments, dates, {
    recipes: reorderedRecipes,
    consecutiveRecipeIds: new Set()
  });
  assert.equal(result[2], 1);
  assert.equal(reorderedRecipes[result[2]].id, "curry");
});

test("読み込み処理で2026/9/2水曜の主菜IDを定番カレーへ変更する", () => {
  const dates = weekStarting(2026, 7, 30);
  const assignments = [{
    dayIndex: 3,
    date: "2026-09-02",
    recipeId: "classic-curry",
    recipeName: "わが家の定番カレー",
    requestedName: "定番カレー"
  }];
  const menuRecipes = [
    { id: "fish", main: "焼き魚" },
    { id: "classic-curry", main: "わが家の定番カレー" }
  ];
  const result = loadRequestedMenuSelection(
    [0, 0, 0, 0, 0, 0, 0],
    assignments,
    dates,
    { recipes: menuRecipes, consecutiveRecipeIds: new Set() }
  );

  assert.equal(result.failedAssignment, null);
  assert.equal(menuRecipes[result.selection[3]].id, "classic-curry");
});
