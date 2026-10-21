import test from "node:test";
import assert from "node:assert/strict";
import {
  MENU_DATA_VERSION,
  migrateWeeklyMenuStorage,
  migrateWeeklyMenusData,
  normalizeWeeklyMenuRecord,
  parseWeeklyMenusStorage
} from "../../js/menu-state.js";

function memoryStorage(initial = {}, transformWrite = null) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, transformWrite?.(key, value) ?? value),
    removeItem: key => values.delete(key)
  };
}

const collections = {
  menus: [{ id: "main-a" }, { id: "main-b" }],
  sideDishes: [{ id: "side-a" }, { id: "side-b" }],
  soups: [{ id: "soup-a" }, { id: "soup-b" }]
};

const legacyWeek = {
  weekStart: "2026-10-19",
  selected: [1, 0, null, 1, 0, 1, 0],
  selectedSides: [0, 1, null, 0, 1, 0, 1],
  selectedSoups: [1, 0, null, 1, 0, 1, 0],
  additionalSideIds: [[], [], [], [], [], [], []],
  manuallySelectedDays: [false, true, false, false, false, false, false],
  locked: true
};

test("旧インデックス形式を料理ID形式へ移行する", () => {
  const result = migrateWeeklyMenusData({ "2026-10-19": legacyWeek }, collections);
  const migrated = result.data["2026-10-19"];

  assert.equal(result.migrated, true);
  assert.equal(migrated.version, MENU_DATA_VERSION);
  assert.deepEqual(migrated.mainRecipeIds.slice(0, 3), ["main-b", "main-a", null]);
  assert.deepEqual(migrated.sideRecipeIds.slice(0, 3), ["side-a", "side-b", null]);
  assert.deepEqual(migrated.soupRecipeIds.slice(0, 3), ["soup-b", "soup-a", null]);
  assert.equal(migrated.locked, true);
});

test("ID形式は料理配列の並び順が変わっても同じ料理を復元する", () => {
  const migrated = migrateWeeklyMenusData({ "2026-10-19": legacyWeek }, collections).data["2026-10-19"];
  const reordered = {
    menus: [...collections.menus].reverse(),
    sideDishes: [...collections.sideDishes].reverse(),
    soups: [...collections.soups].reverse()
  };
  const restored = normalizeWeeklyMenuRecord(migrated, reordered, "2026-10-19");

  assert.deepEqual(restored.mainRecipeIds.slice(0, 2), ["main-b", "main-a"]);
  assert.deepEqual(restored.sideRecipeIds.slice(0, 2), ["side-a", "side-b"]);
  assert.deepEqual(restored.soupRecipeIds.slice(0, 2), ["soup-b", "soup-a"]);
});

test("新形式をlocalStorageへ保存してページ再読み込み相当で同じ料理IDを復元する", () => {
  const migrated = migrateWeeklyMenusData({ "2026-10-19": legacyWeek }, collections).data;
  const reloaded = parseWeeklyMenusStorage(JSON.stringify(migrated), collections);
  assert.equal(reloaded.corrupted, false);
  assert.deepEqual(reloaded.data, migrated);
});

test("存在しない料理IDは別料理へ誤変換せず未設定にする", () => {
  const record = {
    version: MENU_DATA_VERSION,
    weekStart: "2026-10-19",
    mainRecipeIds: ["missing", "main-a", null, null, null, null, null],
    sideRecipeIds: Array(7).fill(null),
    soupRecipeIds: Array(7).fill(null),
    additionalSideIds: Array.from({ length: 7 }, () => []),
    manuallySelectedDays: Array(7).fill(false),
    locked: false
  };
  const restored = normalizeWeeklyMenuRecord(record, collections, "2026-10-19");

  assert.equal(restored.mainRecipeIds[0], null);
  assert.equal(restored.mainRecipeIds[1], "main-a");
});

test("壊れたJSONと一部欠損データを安全に扱う", () => {
  assert.deepEqual(parseWeeklyMenusStorage("{broken", collections), { data: {}, migrated: false, corrupted: true });
  const partial = migrateWeeklyMenusData({ "2026-10-19": { ...legacyWeek, selectedSides: [0] } }, collections);
  assert.equal(partial.data["2026-10-19"], undefined);
});

test("新形式の移行は二回実行しても内容を変更しない", () => {
  const first = migrateWeeklyMenusData({ "2026-10-19": legacyWeek }, collections);
  const second = migrateWeeklyMenusData(first.data, collections);

  assert.equal(second.migrated, false);
  assert.deepEqual(second.data, first.data);
});

test("localStorage移行は旧データをバックアップし、再読み込み検証後にversionを記録する", () => {
  const raw = JSON.stringify({ "2026-10-19": legacyWeek });
  const storage = memoryStorage({ weeklyMenus: raw });
  const first = migrateWeeklyMenuStorage(storage, collections);

  assert.equal(first.status, "migrated");
  assert.equal(storage.getItem("menuDataVersion"), String(MENU_DATA_VERSION));
  assert.equal(JSON.parse(storage.getItem("menuMigrationBackup_v1")).weeklyMenus, raw);
  assert.equal(JSON.parse(storage.getItem("weeklyMenus"))["2026-10-19"].mainRecipeIds[0], "main-b");

  const snapshot = storage.getItem("weeklyMenus");
  const second = migrateWeeklyMenuStorage(storage, collections);
  assert.equal(second.status, "current");
  assert.equal(storage.getItem("weeklyMenus"), snapshot);
});

test("移行後の読み戻し検証に失敗した場合は旧データを復元して削除しない", () => {
  const raw = JSON.stringify({ "2026-10-19": legacyWeek });
  let firstWeeklyWrite = true;
  const storage = memoryStorage({ weeklyMenus: raw }, (key, value) => {
    if (key === "weeklyMenus" && firstWeeklyWrite) {
      firstWeeklyWrite = false;
      return "{broken";
    }
    return value;
  });
  const result = migrateWeeklyMenuStorage(storage, collections);

  assert.equal(result.status, "verification-failed");
  assert.equal(storage.getItem("weeklyMenus"), raw);
  assert.equal(storage.getItem("menuDataVersion"), null);
  assert.ok(storage.getItem("menuMigrationBackup_v1"));
});

test("壊れた保存データは上書きせずそのまま残す", () => {
  const storage = memoryStorage({ weeklyMenus: "{broken" });
  const result = migrateWeeklyMenuStorage(storage, collections);
  assert.equal(result.status, "corrupted");
  assert.equal(storage.getItem("weeklyMenus"), "{broken");
  assert.equal(storage.getItem("menuMigrationBackup_v1"), null);
});

test("一部欠損した旧データは移行済み扱いにせず元データを残す", () => {
  const raw = JSON.stringify({ "2026-10-19": { ...legacyWeek, selectedSides: [0] } });
  const storage = memoryStorage({ weeklyMenus: raw });
  const result = migrateWeeklyMenuStorage(storage, collections);
  assert.equal(result.status, "partial");
  assert.equal(storage.getItem("weeklyMenus"), raw);
  assert.equal(storage.getItem("menuDataVersion"), null);
});

test("localStorage書き込み例外でも起動処理を失敗させず旧データを残す", () => {
  const raw = JSON.stringify({ "2026-10-19": legacyWeek });
  const storage = memoryStorage({ weeklyMenus: raw });
  storage.setItem = () => { throw new Error("quota exceeded"); };
  const result = migrateWeeklyMenuStorage(storage, collections);
  assert.equal(result.status, "write-failed");
  assert.equal(storage.getItem("weeklyMenus"), raw);
});

test("D1移行済み端末はログイン後のD1配列順で旧インデックスを一度だけID化する", () => {
  const d1Ordered = {
    menus: [...collections.menus].reverse(),
    sideDishes: [...collections.sideDishes].reverse(),
    soups: [...collections.soups].reverse()
  };
  const raw = JSON.stringify({ "2026-10-19": legacyWeek });
  const storage = memoryStorage({ weeklyMenus: raw, d1RecipeMigrationComplete: "true" });

  const beforeLogin = migrateWeeklyMenuStorage(storage, collections, { deferLegacy: true });
  assert.equal(beforeLogin.status, "deferred");
  assert.equal(storage.getItem("weeklyMenus"), raw);

  const afterLogin = migrateWeeklyMenuStorage(storage, d1Ordered);
  assert.equal(afterLogin.status, "migrated");
  assert.deepEqual(afterLogin.data["2026-10-19"].mainRecipeIds.slice(0, 2), ["main-a", "main-b"]);
});

test("曖昧な旧固定フラグを解除する前に専用バックアップを保存する", () => {
  const ambiguous = {
    version: MENU_DATA_VERSION,
    weekStart: "2026-10-19",
    mainRecipeIds: ["main-a", "main-b", null, null, null, null, null],
    sideRecipeIds: Array(7).fill(null),
    soupRecipeIds: Array(7).fill(null),
    additionalSideIds: Array.from({ length: 7 }, () => []),
    dayProtections: Array.from({ length: 7 }, (_, index) => ({
      manual: index === 1,
      requested: false
    })),
    manuallySelectedDays: [false, true, false, false, false, false, false],
    locked: false
  };
  const raw = JSON.stringify({ "2026-10-19": ambiguous });
  const storage = memoryStorage({
    weeklyMenus: raw,
    menuDataVersion: String(MENU_DATA_VERSION),
    menuMigrationBackup_v1: "existing-backup"
  });
  const result = migrateWeeklyMenuStorage(storage, collections);

  assert.equal(result.status, "migrated");
  assert.equal(result.data["2026-10-19"].dayProtections[1].manual, false);
  assert.equal(JSON.parse(storage.getItem("menuManualProtectionBackup_v2")).weeklyMenus, raw);
  assert.equal(storage.getItem("menuMigrationBackup_v1"), "existing-backup");
});
