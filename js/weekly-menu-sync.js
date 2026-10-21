export function createWeeklyMenuSynchronizer({
  repository,
  getCurrentWeekKey,
  getLocalMenu,
  applyRemoteMenu
}) {
  let latestGeneration = 0;

  function isStale(generation, weekKey) {
    return generation !== latestGeneration || getCurrentWeekKey() !== weekKey;
  }

  return {
    async sync(requestedWeekKey = getCurrentWeekKey()) {
      const weekKey = requestedWeekKey;
      const generation = ++latestGeneration;
      const remoteMenu = await repository.get(weekKey);
      if (isStale(generation, weekKey)) return { status: "stale", weekKey };

      if (remoteMenu) {
        applyRemoteMenu(remoteMenu, weekKey);
        return { status: "applied", weekKey };
      }

      const localMenu = getLocalMenu(weekKey);
      if (!localMenu || localMenu.weekStart !== weekKey || isStale(generation, weekKey)) {
        return { status: "stale", weekKey };
      }
      await repository.save(localMenu);
      return isStale(generation, weekKey)
        ? { status: "stale", weekKey }
        : { status: "created", weekKey };
    }
  };
}
