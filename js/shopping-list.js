// 1単位あたりの参考価格。地域や時期、購入単位によって実際の価格は異なります。
const referencePrices = {
  "豚ロース薄切り": 1.8, "豚こま切れ肉": 1.4, "鶏もも肉": 1.2, "鶏むね肉": .8, "鶏ひき肉": 1.1,
  "生鮭": 220, "さば": 180, "あじ（三枚おろし）": 140, "レタス": 198, "トマト": 100, "きゅうり": 70,
  "長ねぎ": 120, "しょうが": 50, "なす": 80, "玉ねぎ": 70, "ズッキーニ": 150, "パプリカ": 180,
  "キャベツ": 250, "ピーマン": 45, "大葉": 10, "とうもろこし": 180, "かぼちゃ": 400, "にんじん": 100,
  "オクラ": 20, "冬瓜": 500, "木綿豆腐": 110, "絹ごし豆腐": 110, "卵": 30, "冷凍枝豆": 1.2,
  "乾燥わかめ": 5, "カレールウ": 55, "そうめん": 60, "天ぷら粉": .4, "パン粉": .5, "片栗粉": .4,
  "梅干し": 45, "雑穀米の素": 80, "ポン酢": 8, "しょうゆ": 5, "みりん": 8, "酢": 1.5,
  "みそ": 7, "砂糖": 2, "オイスターソース": 12, "めんつゆ": 1, "ごま油": 12
};

const fallbackPrices = { g: 1, ml: 1, 個: 80, 本: 100, 玉: 220, 切れ: 200, 尾: 180, 枚: 100, 丁: 120, 束: 100, 袋: 150, 株: 120, 片: 40, 合: 80, 皿分: 55, 大さじ: 7, 小さじ: 3 };

export function estimateRecipeCost(recipe) {
  return recipe.ingredients.reduce((total, [, name, amount, unit]) =>
    total + amount * (referencePrices[name] || fallbackPrices[unit] || 100), 0);
}

export function calculateShoppingGroups(recipes, servings) {
  const totals = new Map();
  recipes.filter(Boolean).forEach(recipe => recipe.ingredients.forEach(([category, name, amount, unit]) => {
    const key = `${name}|${unit}`;
    const item = totals.get(key) || { category, name, amount: 0, unit };
    item.amount += amount;
    totals.set(key, item);
  }));
  const groups = {};
  totals.forEach(item => {
    item.amount *= servings / 2;
    item.price = Math.round(item.amount * (referencePrices[item.name] || fallbackPrices[item.unit] || 100));
    (groups[item.category] ||= []).push(item);
  });
  return groups;
}

export function formatAmount(amount) {
  return Number.isInteger(amount) ? amount : Number(amount.toFixed(2));
}
