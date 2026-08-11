export const menuAttributeInfo = {
  noodle: { label: "麺類", words: ["麺類", "麺", "そうめん", "うどん", "パスタ", "スパゲッティ", "ラーメン", "そば"] },
  rice: { label: "ご飯類", words: ["ご飯類", "ごはん類", "ご飯もの", "ごはんもの", "丼もの", "丼物"] },
  western: { label: "洋食", words: ["洋食", "洋風"] },
  japanese: { label: "和食", words: ["和食", "和風"] },
  chinese: { label: "中華", words: ["中華", "中国料理"] },
  seasonal: { label: "旬", words: ["旬の料理", "旬の食材", "旬"] },
  light: { label: "さっぱり", words: ["さっぱり", "あっさり", "軽め"] },
  rich: { label: "こってり", words: ["こってり", "濃厚", "がっつり"] }
};

export const mutuallyExclusiveAttributeGroups = [
  ["noodle", "rice"],
  ["western", "japanese", "chinese"],
  ["light", "rich"]
];

const dayReadings = ["にち", "げつ", "か", "すい", "もく", "きん", "ど"];

const vegetableAliases = {
  "きゃべつ": "きゃべつ", "キャベツ": "きゃべつ", "春キャベツ": "きゃべつ",
  "たまねぎ": "たまねぎ", "玉ねぎ": "たまねぎ", "玉葱": "たまねぎ", "新玉ねぎ": "たまねぎ",
  "じゃがいも": "じゃがいも", "ジャガイモ": "じゃがいも", "馬鈴薯": "じゃがいも", "新じゃがいも": "じゃがいも",
  "にんじん": "にんじん", "ニンジン": "にんじん", "人参": "にんじん",
  "だいこん": "だいこん", "ダイコン": "だいこん", "大根": "だいこん",
  "ねぎ": "ねぎ", "ネギ": "ねぎ", "葱": "ねぎ", "長ねぎ": "ねぎ", "長ネギ": "ねぎ",
  "はくさい": "はくさい", "ハクサイ": "はくさい", "白菜": "はくさい",
  "ほうれんそう": "ほうれんそう", "ホウレンソウ": "ほうれんそう", "ほうれん草": "ほうれんそう", "法蓮草": "ほうれんそう",
  "なす": "なす", "ナス": "なす", "茄子": "なす", "とまと": "とまと", "トマト": "とまと",
  "きゅうり": "きゅうり", "キュウリ": "きゅうり", "胡瓜": "きゅうり", "ぴーまん": "ぴーまん", "ピーマン": "ぴーまん",
  "ぱぷりか": "ぱぷりか", "パプリカ": "ぱぷりか", "ぶろっこりー": "ぶろっこりー", "ブロッコリー": "ぶろっこりー",
  "かぼちゃ": "かぼちゃ", "カボチャ": "かぼちゃ", "南瓜": "かぼちゃ", "れんこん": "れんこん", "レンコン": "れんこん", "蓮根": "れんこん",
  "ごぼう": "ごぼう", "ゴボウ": "ごぼう", "牛蒡": "ごぼう", "さつまいも": "さつまいも", "サツマイモ": "さつまいも", "薩摩芋": "さつまいも",
  "さといも": "さといも", "サトイモ": "さといも", "里芋": "さといも", "かぶ": "かぶ", "カブ": "かぶ", "蕪": "かぶ",
  "あすぱらがす": "あすぱらがす", "アスパラガス": "あすぱらがす", "アスパラ": "あすぱらがす", "ずっきーに": "ずっきーに", "ズッキーニ": "ずっきーに",
  "おくら": "おくら", "オクラ": "おくら", "とうもろこし": "とうもろこし", "トウモロコシ": "とうもろこし", "玉蜀黍": "とうもろこし", "コーン": "とうもろこし",
  "きのこ": "きのこ", "キノコ": "きのこ", "茸": "きのこ", "しめじ": "しめじ", "シメジ": "しめじ", "えのき": "えのき", "エノキ": "えのき",
  "まいたけ": "まいたけ", "マイタケ": "まいたけ", "舞茸": "まいたけ", "しいたけ": "しいたけ", "シイタケ": "しいたけ", "椎茸": "しいたけ"
};

export function toHiragana(value) {
  return value.normalize("NFKC").replace(/[\u30a1-\u30f6]/g, character =>
    String.fromCharCode(character.charCodeAt(0) - 0x60));
}

export function createRequestParser({ recipes, days }) {
  const normalizeVegetable = value => {
    const compact = value.replace(/[ 　]/g, "");
    return vegetableAliases[compact] || toHiragana(compact);
  };

  const parsePreferredVegetables = value => {
    let remainingText = toHiragana(value);
    const found = [];
    const knownVegetables = recipes.flatMap(recipe => recipe.ingredients)
      .map(([, name]) => [name, normalizeVegetable(name)]);
    const searchableNames = [...Object.entries(vegetableAliases), ...knownVegetables]
      .map(([alias, vegetable]) => [toHiragana(alias), vegetable])
      .sort((a, b) => b[0].length - a[0].length);
    searchableNames.forEach(([alias, vegetable]) => {
      if (!remainingText.includes(alias)) return;
      found.push(vegetable);
      remainingText = remainingText.replaceAll(alias, " ");
    });
    return [...new Set(found)];
  };

  const parseFoodInput = value => {
    const recognized = parsePreferredVegetables(value);
    const directTerms = value.split(/[、,，\n]+/)
      .map(term => normalizeVegetable(term.trim()))
      .filter(term => term && term.length <= 20);
    return [...new Set([...recognized, ...directTerms])];
  };

  const followingRequestWord = () => ["は", "に", "を", "で", "の", ...Object.values(menuAttributeInfo).flatMap(info => info.words)]
    .sort((a, b) => b.length - a.length).join("|");

  const parseRequestedDays = value => days
    .map((day, index) => ({ day, index, reading: dayReadings[index] }))
    .filter(({ day, reading }) => {
      const katakana = reading.replace(/[\u3041-\u3096]/g, character => String.fromCharCode(character.charCodeAt(0) + 0x60));
      const fullDayPattern = new RegExp(`${day}曜(?:日)?|${reading}(?:ようび|よう|曜日|曜)|${katakana}(?:ヨウビ|ヨウ|曜日|曜)`);
      if (fullDayPattern.test(value)) return true;
      return new RegExp(`(?:^|[\\s　、。,.，])(?:${day}|${reading}|${katakana})(?=$|[\\s　、。,.，]|${followingRequestWord()})`).test(value);
    })
    .map(({ day, index }) => ({ day, index }));

  const parseRequestAttributes = value => Object.entries(menuAttributeInfo)
    .filter(([, info]) => info.words.some(word => value.includes(word)))
    .map(([attribute]) => attribute);

  const parseRequestedConditions = value => {
    const conditions = Array.from({ length: 7 }, () => []);
    let pendingDayIndexes = [];
    value.split(/[、。,.，\n]+/).forEach(part => {
      const attributes = parseRequestAttributes(part);
      const partDays = parseRequestedDays(part);
      if (partDays.length && !attributes.length) {
        pendingDayIndexes = partDays.map(({ index }) => index);
        return;
      }
      if (!attributes.length) return;
      const targetIndexes = partDays.length ? partDays.map(({ index }) => index)
        : pendingDayIndexes.length ? pendingDayIndexes : days.map((_, index) => index);
      targetIndexes.forEach(index => {
        conditions[index] = [...new Set([...conditions[index], ...attributes])];
      });
      pendingDayIndexes = [];
    });
    return conditions;
  };

  const removeRequestedDay = (value, index) => {
    const day = days[index];
    const reading = dayReadings[index];
    const katakana = reading.replace(/[\u3041-\u3096]/g, character => String.fromCharCode(character.charCodeAt(0) + 0x60));
    const fullForms = new RegExp(`${day}曜(?:日)?|${reading}(?:ようび|よう|曜日|曜)|${katakana}(?:ヨウビ|ヨウ|曜日|曜)`, "g");
    const shortForms = new RegExp(`(^|[\\s　、。,.，])(?:${day}|${reading}|${katakana})(?=$|[\\s　、。,.，]|${followingRequestWord()})`, "g");
    return value.replace(fullForms, "").replace(shortForms, "$1");
  };

  return { normalizeVegetable, parsePreferredVegetables, parseFoodInput, parseRequestedDays, parseRequestAttributes, parseRequestedConditions, removeRequestedDay };
}
