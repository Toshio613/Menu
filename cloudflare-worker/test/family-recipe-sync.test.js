import test from "node:test";
import assert from "node:assert/strict";
import { synchronizeFamilyRecipes } from "../../js/family-recipe-sync.js";

function recipe(id, name = id) {
  return {
    id, main: name, season: "none", icon: "🍳", time: 10, servings: 2,
    ingredients: [["その他", "材料", 1, "個"]], steps: ["作る"], attributes: [], sauces: [], memo: "", isCustom: true
  };
}

function storageWithPending() {
  const values = new Map([
    ["menuRecipeEdits", JSON.stringify({ custom: recipe("custom") })],
    ["deletedRecipeIds", "[]"]
  ]);
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

test("D1移行済みの家庭でも2台目端末の独自料理を追加してからローカルを削除する", async () => {
  const builtIn = recipe("built-in");
  const custom = recipe("custom");
  let shared = [builtIn];
  const imported = [];
  const storage = storageWithPending();
  const applied = [];

  await synchronizeFamilyRecipes({
    repository: {
      list: async () => shared,
      importMissing: async recipes => {
        imported.push(...recipes);
        shared = [...shared, ...recipes];
        return { imported: true, count: recipes.length };
      }
    },
    localRecipes: [builtIn, custom],
    pendingRecipes: [custom],
    deletedRecipeIds: [],
    storage,
    applySharedRecipes: recipes => applied.push(recipes.map(item => item.id))
  });

  assert.deepEqual(imported.map(item => item.id), ["custom"]);
  assert.deepEqual(applied, [["built-in", "custom"]]);
  assert.equal(storage.getItem("menuRecipeEdits"), null);
  assert.ok(storage.getItem("recipeMigrationBackup_v1"));
});

test("D1 import失敗時はlocalStorageを削除しない", async () => {
  const custom = recipe("custom");
  const storage = storageWithPending();

  await assert.rejects(() => synchronizeFamilyRecipes({
    repository: {
      list: async () => [],
      importMissing: async () => { throw new Error("network failed"); }
    },
    localRecipes: [custom], pendingRecipes: [custom], deletedRecipeIds: [], storage,
    applySharedRecipes: () => assert.fail("must not apply")
  }));
  assert.ok(storage.getItem("menuRecipeEdits"));
});

test("D1に同じID・同じ内容が存在する場合は重複登録しない", async () => {
  const custom = recipe("custom");
  const storage = storageWithPending();
  let importCalled = false;

  await synchronizeFamilyRecipes({
    repository: {
      list: async () => [custom],
      importMissing: async () => { importCalled = true; }
    },
    localRecipes: [custom], pendingRecipes: [custom], deletedRecipeIds: [], storage,
    applySharedRecipes: () => {}
  });

  assert.equal(importCalled, false);
  assert.equal(storage.getItem("menuRecipeEdits"), null);
});

test("import後の再取得失敗でもlocalStorageを削除しない", async () => {
  const custom = recipe("custom");
  const storage = storageWithPending();
  let listCount = 0;

  await assert.rejects(() => synchronizeFamilyRecipes({
    repository: {
      list: async () => {
        listCount += 1;
        if (listCount === 1) return [];
        throw new Error("refresh failed");
      },
      importMissing: async () => ({ imported: true, count: 1 })
    },
    localRecipes: [custom], pendingRecipes: [custom], deletedRecipeIds: [], storage,
    applySharedRecipes: () => assert.fail("must not apply")
  }));
  assert.ok(storage.getItem("menuRecipeEdits"));
});

test("同じIDで内容が異なる場合は競合としてローカル編集を残す", async () => {
  const local = recipe("custom", "端末の料理");
  const remote = recipe("custom", "D1の料理");
  const storage = storageWithPending();
  storage.setItem("menuRecipeEdits", JSON.stringify({ custom: local }));

  await assert.rejects(() => synchronizeFamilyRecipes({
    repository: {
      list: async () => [remote],
      importMissing: async () => assert.fail("同じIDは追加しない")
    },
    localRecipes: [local], pendingRecipes: [local], deletedRecipeIds: [], storage,
    applySharedRecipes: () => assert.fail("競合データを適用しない")
  }), error => error.code === "LOCAL_RECIPE_MIGRATION_CONFLICT");

  assert.ok(storage.getItem("menuRecipeEdits"));
  assert.equal(storage.getItem("d1RecipeMigrationComplete"), null);
});

test("端末側の削除記録をD1へ反映し、再取得で確認してから記録を消す", async () => {
  const removed = recipe("removed");
  let shared = [removed];
  const storage = storageWithPending();
  storage.setItem("menuRecipeEdits", "{}");
  storage.setItem("deletedRecipeIds", '["removed"]');

  await synchronizeFamilyRecipes({
    repository: {
      list: async () => shared,
      importMissing: async () => assert.fail("削除料理を再追加しない"),
      delete: async id => { shared = shared.filter(item => item.id !== id); }
    },
    localRecipes: [], pendingRecipes: [], deletedRecipeIds: ["removed"], storage,
    applySharedRecipes: recipes => assert.deepEqual(recipes, [])
  });

  assert.equal(storage.getItem("deletedRecipeIds"), null);
});
