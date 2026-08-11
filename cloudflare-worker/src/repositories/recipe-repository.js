const SELECT_COLUMNS = `id, name, category, season, emoji, cooking_time, servings,
  attributes, ingredients, steps, sauces, memo, confidence, is_custom, created_at, updated_at`;

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function fromRow(row) {
  return {
    id: row.id, name: row.name, category: row.category, season: row.season, emoji: row.emoji,
    cookingTime: row.cooking_time, servings: row.servings,
    attributes: parseJson(row.attributes, []), ingredients: parseJson(row.ingredients, []),
    steps: parseJson(row.steps, []), sauces: parseJson(row.sauces, []), memo: row.memo,
    confidence: row.confidence, isCustom: Boolean(row.is_custom), createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function values(recipe, now) {
  return [recipe.id, recipe.name, recipe.category, recipe.season, recipe.emoji, recipe.cookingTime, recipe.servings,
    JSON.stringify(recipe.attributes), JSON.stringify(recipe.ingredients), JSON.stringify(recipe.steps),
    JSON.stringify(recipe.sauces), recipe.memo, recipe.confidence, recipe.isCustom ? 1 : 0, now, now];
}

function insertStatement(db, recipe, now, conflict = "") {
  return db.prepare(`INSERT INTO recipes (${SELECT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ${conflict}`)
    .bind(...values(recipe, now));
}

export class RecipeRepository {
  constructor(db) { this.db = db; }

  async list() {
    const { results } = await this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM recipes ORDER BY created_at, id`).all();
    return results.map(fromRow);
  }

  async get(id) {
    const row = await this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM recipes WHERE id = ?`).bind(id).first();
    return row ? fromRow(row) : null;
  }

  async create(recipe) {
    const now = new Date().toISOString();
    await insertStatement(this.db, recipe, now).run();
    return this.get(recipe.id);
  }

  async update(recipe) {
    const now = new Date().toISOString();
    const result = await this.db.prepare(`UPDATE recipes SET name = ?, category = ?, season = ?, emoji = ?, cooking_time = ?, servings = ?,
      attributes = ?, ingredients = ?, steps = ?, sauces = ?, memo = ?, confidence = ?, is_custom = ?, updated_at = ? WHERE id = ?`)
      .bind(recipe.name, recipe.category, recipe.season, recipe.emoji, recipe.cookingTime, recipe.servings,
        JSON.stringify(recipe.attributes), JSON.stringify(recipe.ingredients), JSON.stringify(recipe.steps), JSON.stringify(recipe.sauces),
        recipe.memo, recipe.confidence, recipe.isCustom ? 1 : 0, now, recipe.id).run();
    return result.meta.changes ? this.get(recipe.id) : null;
  }

  async delete(id) {
    const result = await this.db.prepare("DELETE FROM recipes WHERE id = ?").bind(id).run();
    return result.meta.changes > 0;
  }

  async importOnce(recipes) {
    const imported = await this.db.prepare("SELECT value FROM app_meta WHERE key = 'recipes_imported'").first();
    if (imported) return { imported: false, count: 0 };
    const now = new Date().toISOString();
    const statements = recipes.map(recipe => insertStatement(this.db, recipe, now, "ON CONFLICT(id) DO NOTHING"));
    statements.push(this.db.prepare("INSERT INTO app_meta (key, value, updated_at) VALUES ('recipes_imported', ?, ?) ON CONFLICT(key) DO NOTHING").bind(now, now));
    await this.db.batch(statements);
    return { imported: true, count: recipes.length };
  }
}
