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
    updatedAt: row.updated_at
  } : null;
}

export class WeeklyMenuRepository {
  constructor(db) { this.db = db; }

  async get(weekStart) {
    const row = await this.db.prepare("SELECT * FROM weekly_menus WHERE week_start = ?").bind(weekStart).first();
    return fromRow(row);
  }

  async save(menu) {
    const updatedAt = new Date().toISOString();
    await this.db.prepare(`INSERT INTO weekly_menus
      (week_start, main_recipe_ids, side_recipe_ids, soup_recipe_ids, additional_side_ids, manually_selected_days, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(week_start) DO UPDATE SET
        main_recipe_ids = excluded.main_recipe_ids,
        side_recipe_ids = excluded.side_recipe_ids,
        soup_recipe_ids = excluded.soup_recipe_ids,
        additional_side_ids = excluded.additional_side_ids,
        manually_selected_days = excluded.manually_selected_days,
        updated_at = excluded.updated_at`)
      .bind(menu.weekStart, JSON.stringify(menu.mainRecipeIds), JSON.stringify(menu.sideRecipeIds),
        JSON.stringify(menu.soupRecipeIds), JSON.stringify(menu.additionalSideIds),
        JSON.stringify(menu.manuallySelectedDays), updatedAt).run();
    return this.get(menu.weekStart);
  }
}
