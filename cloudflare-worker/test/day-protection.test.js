import test from "node:test";
import assert from "node:assert/strict";
import {
  createDayProtections,
  isDayProtected,
  manualProtectionDays,
  normalizeDayProtections,
  reconcileRequestedProtections,
  requestedLoadProtectionFlags,
  setManualProtection
} from "../../js/day-protection.js";
import { mergeProtectedMenuDays, replaceMenuDay } from "../../js/menu-shuffler.js";
import { normalizeWeeklyMenuRecord } from "../../js/menu-state.js";
import { loadRequestedMenuSelection } from "../../js/requested-menu-loader.js";
import { normalizeWeeklyMenu } from "../src/routes/weekly-menus.js";
import { WeeklyMenuRepository } from "../src/repositories/weekly-menu-repository.js";

const none = () => createDayProtections();
const protectedAt = (index, reason) => none().map((entry, dayIndex) =>
  dayIndex === index ? { ...entry, [reason]: true } : entry);

const collections = {
  menus: ["a", "b", "c", "d", "e", "f", "g", "curry", "hamburg"].map(id => ({ id })),
  sideDishes: [],
  soups: []
};

function record(overrides = {}) {
  return {
    version: 2,
    weekStart: "2026-10-18",
    mainRecipeIds: ["a", "b", "c", "d", "e", "f", "g"],
    sideRecipeIds: Array(7).fill(null),
    soupRecipeIds: Array(7).fill(null),
    additionalSideIds: Array.from({ length: 7 }, () => []),
    manuallySelectedDays: Array(7).fill(false),
    locked: false,
    ...overrides
  };
}

test("1 manual固定日は週再提案で変更されない", () => {
  const protections = protectedAt(3, "manual");
  assert.equal(mergeProtectedMenuDays(record().mainRecipeIds, Array(7).fill("new"), protections)[3], "d");
});

test("2 manual固定した水曜・金曜だけを未固定日再提案から除外する", () => {
  let protections = setManualProtection(none(), 3, true);
  protections = setManualProtection(protections, 5, true);
  assert.deepEqual(
    mergeProtectedMenuDays(record().mainRecipeIds, Array(7).fill("new"), protections),
    ["new", "new", "new", "d", "new", "f", "new"]
  );
});

test("3 manual固定解除は料理をその場で変えず次回再提案を可能にする", () => {
  const before = record().mainRecipeIds;
  const protections = setManualProtection(protectedAt(3, "manual"), 3, false);
  assert.deepEqual(before, record().mainRecipeIds);
  assert.equal(mergeProtectedMenuDays(before, Array(7).fill("new"), protections)[3], "new");
});

test("4 manual固定は保存と再読み込み後も維持される", () => {
  const saved = record({ dayProtections: protectedAt(3, "manual") });
  assert.equal(normalizeWeeklyMenuRecord(JSON.parse(JSON.stringify(saved)), collections, saved.weekStart).dayProtections[3].manual, true);
});

test("5 週ごとの保存記録は移動後に元の週のmanual固定を復元できる", () => {
  const weeks = {
    "2026-10-18": record({ dayProtections: protectedAt(3, "manual") }),
    "2026-10-25": { ...record(), weekStart: "2026-10-25" }
  };
  assert.equal(normalizeWeeklyMenuRecord(weeks["2026-10-18"], collections, "2026-10-18").dayProtections[3].manual, true);
});

test("6 manual固定状態はD1用ペイロードで検証・復元できる", () => {
  const value = record({ dayProtections: protectedAt(3, "manual") });
  assert.equal(normalizeWeeklyMenu(value, value.weekStart).dayProtections[3].manual, true);
});

test("7 requested指定日のカレーは週シャッフルで維持される", () => {
  const protections = protectedAt(3, "requested");
  assert.equal(mergeProtectedMenuDays(record({ mainRecipeIds: ["a", "b", "c", "curry", "e", "f", "g"] }).mainRecipeIds,
    Array(7).fill("new"), protections)[3], "curry");
});

test("8 すべて再提案でrequested日を保持し未保護日は変更できる", () => {
  const merged = mergeProtectedMenuDays(record().mainRecipeIds, Array(7).fill("new"), protectedAt(3, "requested"));
  assert.equal(merged[3], "d");
  assert.equal(merged[2], "new");
});

test("9 一部再提案でrequested日を保持する", () => {
  assert.equal(mergeProtectedMenuDays(record().mainRecipeIds, Array(7).fill("partial"), protectedAt(3, "requested"))[3], "d");
});

test("10 requested保護はリロード相当の正規化後も維持される", () => {
  const value = record({ dayProtections: protectedAt(3, "requested") });
  assert.equal(normalizeWeeklyMenuRecord(JSON.parse(JSON.stringify(value)), collections, value.weekStart).dayProtections[3].requested, true);
});

test("11 週移動後に元の週のrequested保護を復元できる", () => {
  const saved = record({ dayProtections: protectedAt(3, "requested") });
  assert.equal(normalizeWeeklyMenuRecord(saved, collections, "2026-10-18").dayProtections[3].requested, true);
});

test("12 requested指定をカレーからハンバーグへ更新し保護を維持できる", () => {
  const before = ["a", "b", "c", "curry", "e", "f", "g"];
  const protections = protectedAt(3, "requested");
  const dates = Array.from({ length: 7 }, (_, index) => new Date(2026, 9, 18 + index));
  const assignments = [{
    dayIndex: 3,
    date: "2026-10-21",
    recipeId: "hamburg",
    recipeName: "ハンバーグ"
  }];
  const result = loadRequestedMenuSelection(before, assignments, dates, {
    recipes: collections.menus,
    useRecipeIds: true,
    protectedDays: requestedLoadProtectionFlags(before, protections, [3])
  });
  const nextProtections = reconcileRequestedProtections(protections, result.appliedDayIndexes);
  assert.equal(result.selection[3], "hamburg");
  assert.equal(mergeProtectedMenuDays(result.selection, Array(7).fill("new"), nextProtections)[3], "hamburg");
});

test("13 requested指定削除は料理を残しrequested保護だけ解除する", () => {
  const before = ["a", "b", "c", "curry", "e", "f", "g"];
  const protections = reconcileRequestedProtections(protectedAt(3, "requested"), []);
  assert.equal(before[3], "curry");
  assert.equal(protections[3].requested, false);
  assert.equal(mergeProtectedMenuDays(before, Array(7).fill("new"), protections)[3], "new");
});

test("14 manualとrequestedの複合状態からrequestedだけ解除できる", () => {
  const protections = reconcileRequestedProtections([{ manual: true, requested: true }, ...none().slice(1)], []);
  assert.deepEqual(protections[0], { manual: true, requested: false });
});

test("15 週全体ロックONは理由のない日も保護する", () => {
  assert.equal(isDayProtected({ weeklyLocked: true }), true);
});

test("16 週全体ロックOFFではmanual・requesed・外食日だけを保護する", () => {
  assert.equal(isDayProtected({}), false);
  assert.equal(isDayProtected({ manualLocked: true }), true);
  assert.equal(isDayProtected({ requested: true }), true);
  assert.equal(isDayProtected({ eatingOut: true }), true);
});

test("17 外食日はシャッフルで上書きされない", () => {
  const previous = ["a", "b", null, "d", "e", "f", "g"];
  assert.equal(mergeProtectedMenuDays(previous, Array(7).fill("new"), none())[2], null);
});

test("18 manual固定日をお気に入り経由で上書きしない", () => {
  assert.equal(replaceMenuDay(record().mainRecipeIds, 3, "favorite", { dayProtections: protectedAt(3, "manual") }).changed, false);
});

test("19 manual固定日をかんたん経由で上書きしない", () => {
  assert.equal(replaceMenuDay(record().mainRecipeIds, 3, "simple", { dayProtections: protectedAt(3, "manual") }).changed, false);
});

test("20 requested指定日をお気に入り・かんたん・通常再提案で上書きしない", () => {
  const options = { dayProtections: protectedAt(3, "requested") };
  assert.equal(replaceMenuDay(record().mainRecipeIds, 3, "favorite", options).changed, false);
  assert.equal(replaceMenuDay(record().mainRecipeIds, 3, "simple", options).changed, false);
  assert.equal(mergeProtectedMenuDays(record().mainRecipeIds, Array(7).fill("new"), options.dayProtections)[3], "d");
});

test("21 旧version 2データはmanuallySelectedDaysをmanual理由として安全に読み込む", () => {
  const old = record({ manuallySelectedDays: [false, false, false, true, false, false, false] });
  const normalized = normalizeWeeklyMenuRecord(old, collections, old.weekStart);
  assert.equal(normalized.dayProtections[3].manual, true);
  assert.equal(normalized.dayProtections[3].requested, false);
});

test("22 D1保存・再取得後もmanual/requested状態を維持する", async () => {
  const dayProtections = none();
  dayProtections[2] = { manual: true, requested: false };
  dayProtections[3] = { manual: false, requested: true };
  const normalized = normalizeWeeklyMenu(record({ dayProtections }), "2026-10-18");
  let savedRow = null;
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          if (sql.includes("INSERT INTO weekly_menus")) {
            return { run: async () => {
              savedRow = {
                week_start: values[0],
                main_recipe_ids: values[1],
                side_recipe_ids: values[2],
                soup_recipe_ids: values[3],
                additional_side_ids: values[4],
                manually_selected_days: values[5],
                day_protections: values[6],
                locked: values[7],
                updated_at: values[8]
              };
            } };
          }
          return { first: async () => savedRow };
        }
      };
    }
  };
  const restored = await new WeeklyMenuRepository(db).save(normalized);
  assert.deepEqual(restored.dayProtections, dayProtections);
  assert.deepEqual(manualProtectionDays(normalizeDayProtections(restored.dayProtections)), [false, false, true, false, false, false, false]);
});

test("旧D1行にday_protectionsがなくてもmanualの互換状態とrequested=falseを復元する", async () => {
  const oldRow = {
    week_start: "2026-10-18",
    main_recipe_ids: JSON.stringify(record().mainRecipeIds),
    side_recipe_ids: JSON.stringify(Array(7).fill(null)),
    soup_recipe_ids: JSON.stringify(Array(7).fill(null)),
    additional_side_ids: JSON.stringify(Array.from({ length: 7 }, () => [])),
    manually_selected_days: JSON.stringify([false, false, true, false, false, false, false]),
    locked: 0,
    updated_at: "2026-10-20T00:00:00.000Z"
  };
  const db = { prepare: () => ({ bind: () => ({ first: async () => oldRow }) }) };
  const restored = await new WeeklyMenuRepository(db).get("2026-10-18");
  assert.deepEqual(restored.dayProtections[2], { manual: true, requested: false });
});
