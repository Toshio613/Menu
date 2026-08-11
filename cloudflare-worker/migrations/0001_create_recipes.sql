CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('main', 'side', 'soup')),
  season TEXT NOT NULL CHECK (season IN ('spring', 'summer', 'autumn', 'winter', 'none')),
  emoji TEXT NOT NULL,
  cooking_time INTEGER NOT NULL,
  servings INTEGER NOT NULL DEFAULT 2,
  attributes TEXT NOT NULL DEFAULT '[]',
  ingredients TEXT NOT NULL,
  steps TEXT NOT NULL,
  sauces TEXT NOT NULL DEFAULT '[]',
  memo TEXT NOT NULL DEFAULT '',
  confidence INTEGER,
  is_custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS recipes_category_index ON recipes(category);
CREATE INDEX IF NOT EXISTS recipes_updated_at_index ON recipes(updated_at);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
