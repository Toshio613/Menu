CREATE TABLE IF NOT EXISTS weekly_menus (
  week_start TEXT PRIMARY KEY,
  main_recipe_ids TEXT NOT NULL DEFAULT '[]',
  side_recipe_ids TEXT NOT NULL DEFAULT '[]',
  soup_recipe_ids TEXT NOT NULL DEFAULT '[]',
  additional_side_ids TEXT NOT NULL DEFAULT '[]',
  manually_selected_days TEXT NOT NULL DEFAULT '[false,false,false,false,false,false,false]',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS weekly_menus_updated_at_index ON weekly_menus(updated_at);
