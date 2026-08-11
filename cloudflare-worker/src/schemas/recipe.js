export const recipeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "category", "servings", "time", "season", "icon", "attributes", "ingredients", "steps", "memo", "warnings", "confidence"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 80 },
    category: { type: "string", enum: ["main", "side", "soup"] },
    servings: { type: "integer", minimum: 1, maximum: 20 },
    time: { type: "integer", minimum: 1, maximum: 360 },
    season: { type: "string", enum: ["spring", "summer", "autumn", "winter", "none"] },
    icon: { type: "string", minLength: 1, maxLength: 8 },
    attributes: {
      type: "array",
      uniqueItems: true,
      maxItems: 5,
      items: { type: "string", enum: ["noodle", "rice", "western", "japanese", "chinese", "seasonal", "light", "rich"] }
    },
    ingredients: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "name", "amount", "unit"],
        properties: {
          category: { type: "string", minLength: 1, maxLength: 30 },
          name: { type: "string", minLength: 1, maxLength: 80 },
          amount: { type: "number", exclusiveMinimum: 0, maximum: 10000 },
          unit: { type: "string", minLength: 1, maxLength: 20 }
        }
      }
    },
    steps: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1, maxLength: 300 } },
    memo: { type: "string", maxLength: 500 },
    warnings: { type: "array", maxItems: 10, items: { type: "string", minLength: 1, maxLength: 200 } },
    confidence: { type: "integer", minimum: 0, maximum: 100 }
  }
};

export function isRecipeResult(value) {
  return value && typeof value.name === "string"
    && ["main", "side", "soup"].includes(value.category)
    && Number.isInteger(value.servings) && value.servings > 0
    && Number.isInteger(value.time) && value.time > 0
    && Number.isInteger(value.confidence) && value.confidence >= 0 && value.confidence <= 100
    && Array.isArray(value.ingredients) && value.ingredients.length > 0
    && Array.isArray(value.steps) && value.steps.length > 0;
}
