export const APP_CONFIG = Object.freeze({
  recipePhoto: Object.freeze({
    apiUrl: "https://menu-pic.l-18mg169henapp.workers.dev/api/analyze-recipe",
    model: "gpt-5.6-luna",
    timeoutMs: 45_000,
    maxSourceBytes: 15 * 1024 * 1024,
    maxOutputBytes: 1.5 * 1024 * 1024,
    maxImageDimension: 1280,
    jpegQuality: 0.82,
    defaultServings: 2
  })
});
