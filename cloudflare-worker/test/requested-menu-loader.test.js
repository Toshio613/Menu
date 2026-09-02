import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRequestedMenuAssignments,
  parseRequestedMenuAssignments
} from "../../js/requested-menu-loader.js";

const recipes = [
  { main: "わが家の定番カレー" },
  { main: "焼き魚" },
  { main: "定番ハンバーグ" },
  { main: "白菜と豚肉のミルフィーユ鍋" }
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
