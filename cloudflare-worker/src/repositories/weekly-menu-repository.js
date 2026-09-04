function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function fromRow(row) {
  return row ? {
    weekStart: row.week_start,
    mainRecipeIds: parseJson(row.main_recipe_ids, []),
    sideRecipeIds: parseJson(row.side_recipe_ids, []),
    soupRecipeIds: parseJson(row.soup_recipe_ids, []),
    additionalSideIds: parseJson(row.additional_side_ids, []),
    manuallySelectedDays: parseJson(row.manually_selected_days, Array(7).fill(false)),
    locked: row.locked === 1,
    updatedAt: row.updated_at
  } : null;
}

export class WeeklyMenuRepository {
  constructor(db) { this.db = db; }

  async get(weekStart) {
    const row = await this.db.prepare("SELECT * FROM weekly_menus WHERE week_start = ?").bind(weekStart).first();
    return fromRow(row);
  }

  async save(menu, { allowUnlock = false } = {}) {
    const updatedAt = new Date().toISOString();
    await this.db.prepare(`INSERT INTO weekly_menus
      (week_start, main_recipe_ids, side_recipe_ids, soup_recipe_ids, additional_side_ids, manually_selected_days, locked, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(week_start) DO UPDATE SET
        main_recipe_ids = CASE WHEN weekly_menus.locked = 1 AND ? = 0 THEN weekly_menus.main_recipe_ids ELSE excluded.main_recipe_ids END,
        side_recipe_ids = CASE WHEN weekly_menus.locked = 1 AND ? = 0 THEN weekly_menus.side_recipe_ids ELSE excluded.side_recipe_ids END,
        soup_recipe_ids = CASE WHEN weekly_menus.locked = 1 AND ? = 0 THEN weekly_menus.soup_recipe_ids ELSE excluded.soup_recipe_ids END,
        additional_side_ids = CASE WHEN weekly_menus.locked = 1 AND ? = 0 THEN weekly_menus.additional_side_ids ELSE excluded.additional_side_ids END,
        manually_selected_days = CASE WHEN weekly_menus.locked = 1 AND ? = 0 THEN weekly_menus.manually_selected_days ELSE excluded.manually_selected_days END,
        locked = CASE WHEN weekly_menus.locked = 1 AND ? = 0 THEN 1 ELSE excluded.locked END,
        updated_at = CASE WHEN weekly_menus.locked = 1 AND ? = 0 THEN weekly_menus.updated_at ELSE excluded.updated_at END`)
      .bind(menu.weekStart, JSON.stringify(menu.mainRecipeIds), JSON.stringify(menu.sideRecipeIds),
        JSON.stringify(menu.soupRecipeIds), JSON.stringify(menu.additionalSideIds),
        JSON.stringify(menu.manuallySelectedDays), menu.locked ? 1 : 0, updatedAt,
        ...Array(7).fill(allowUnlock ? 1 : 0)).run();
    return this.get(menu.weekStart);
  }
}
