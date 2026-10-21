import test from "node:test";
import assert from "node:assert/strict";
import { createWeeklyMenuSynchronizer } from "../../js/weekly-menu-sync.js";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("遅れて返った別週のD1レスポンスを表示・保存へ適用しない", async () => {
  let currentWeekKey = "week-a";
  const requests = new Map([["week-a", deferred()], ["week-b", deferred()]]);
  const applied = [];
  const saved = [];
  const synchronizer = createWeeklyMenuSynchronizer({
    repository: {
      get: weekKey => requests.get(weekKey).promise,
      save: async menu => { saved.push(menu); return menu; }
    },
    getCurrentWeekKey: () => currentWeekKey,
    getLocalMenu: weekKey => ({ weekStart: weekKey }),
    applyRemoteMenu: (menu, weekKey) => applied.push([weekKey, menu.weekStart])
  });

  const weekA = synchronizer.sync("week-a");
  currentWeekKey = "week-b";
  const weekB = synchronizer.sync("week-b");
  requests.get("week-b").resolve({ weekStart: "week-b" });
  await weekB;
  requests.get("week-a").resolve({ weekStart: "week-a" });
  const staleResult = await weekA;

  assert.deepEqual(applied, [["week-b", "week-b"]]);
  assert.deepEqual(saved, []);
  assert.equal(staleResult.status, "stale");
});

test("取得中に週が変わった場合は空の週もD1へ誤保存しない", async () => {
  let currentWeekKey = "week-a";
  const request = deferred();
  const saved = [];
  const synchronizer = createWeeklyMenuSynchronizer({
    repository: {
      get: () => request.promise,
      save: async menu => { saved.push(menu); return menu; }
    },
    getCurrentWeekKey: () => currentWeekKey,
    getLocalMenu: weekKey => ({ weekStart: weekKey }),
    applyRemoteMenu: () => assert.fail("stale response must not be applied")
  });

  const syncing = synchronizer.sync("week-a");
  currentWeekKey = "week-b";
  request.resolve(null);
  const result = await syncing;

  assert.equal(result.status, "stale");
  assert.deepEqual(saved, []);
});

test("週Aと週Bがどちらも未保存なら、先に返った現在の週Bだけを保存する", async () => {
  let currentWeekKey = "week-a";
  const requests = new Map([["week-a", deferred()], ["week-b", deferred()]]);
  const saved = [];
  const synchronizer = createWeeklyMenuSynchronizer({
    repository: {
      get: weekKey => requests.get(weekKey).promise,
      save: async menu => { saved.push(menu.weekStart); return menu; }
    },
    getCurrentWeekKey: () => currentWeekKey,
    getLocalMenu: weekKey => ({ weekStart: weekKey }),
    applyRemoteMenu: () => assert.fail("空の週にremote menuはない")
  });

  const weekA = synchronizer.sync("week-a");
  currentWeekKey = "week-b";
  const weekB = synchronizer.sync("week-b");
  requests.get("week-b").resolve(null);
  await weekB;
  requests.get("week-a").resolve(null);
  await weekA;

  assert.deepEqual(saved, ["week-b"]);
});
