export default [
  {
    ignores: ["cloudflare-worker/node_modules/**"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        atob: "readonly", btoa: "readonly", crypto: "readonly", fetch: "readonly",
        File: "readonly", FormData: "readonly", Response: "readonly", TextDecoder: "readonly",
        TextEncoder: "readonly", URL: "readonly", console: "readonly",
        AbortController: "readonly", Headers: "readonly", Image: "readonly",
        document: "readonly", window: "readonly", localStorage: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error"
    }
  }
];
