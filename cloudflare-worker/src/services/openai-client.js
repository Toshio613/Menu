const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function outputText(response) {
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

export async function analyzeImage({ apiKey, model, imageDataUrl, schema }) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1400,
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "料理写真を見て、家庭で再現するためのレシピを日本語で推定してください。",
              "写真だけで確定できない内容は一般的な2人分を基準に控えめに推定し、warningsへ明記してください。",
              "servingsは根拠がなければ2。confidenceは料理名・材料・手順を含む推定全体の確信度を0〜100の整数で返してください。",
              "材料categoryは 肉・魚、野菜、調味料、乳製品、乾物、その他 など買い物分類に適した短い名称にしてください。",
              "amountは必ず正の数、unitはg、ml、個、本、枚、大さじ、小さじ、適量などに分離してください。",
              "料理が判別できない場合も推測を膨らませず、confidenceを低くしてwarningsに理由を書いてください。"
            ].join("\n")
          },
          { type: "input_image", image_url: imageDataUrl, detail: "low" }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "recipe_photo_analysis",
          strict: true,
          schema
        }
      }
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "OpenAI API request failed");
    error.status = response.status;
    error.code = payload?.error?.code || "OPENAI_ERROR";
    throw error;
  }
  const text = outputText(payload);
  if (!text) throw new Error("OPENAI_EMPTY_RESPONSE");
  try { return JSON.parse(text); } catch { throw new Error("OPENAI_INVALID_JSON"); }
}
