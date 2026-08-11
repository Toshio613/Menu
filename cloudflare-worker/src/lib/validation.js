const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateImage(image, env) {
  if (!(image instanceof File)) return { code: "NO_IMAGE", message: "画像が選択されていません。", status: 400 };
  if (!IMAGE_TYPES.has(image.type)) return { code: "UNSUPPORTED_IMAGE", message: "対応していない画像形式です。", status: 415 };
  const maxBytes = Math.max(1, Number(env.MAX_IMAGE_BYTES) || 1_572_864);
  if (image.size > maxBytes) return { code: "IMAGE_TOO_LARGE", message: "画像サイズが上限を超えています。", status: 413 };
  return null;
}

export function selectedModel(requested, env) {
  const fallback = String(env.DEFAULT_OPENAI_MODEL || "").trim();
  const allowed = new Set(String(env.ALLOWED_OPENAI_MODELS || "").split(",").map(value => value.trim()).filter(Boolean));
  const model = String(requested || fallback).trim();
  return model && allowed.has(model) ? model : null;
}

export function validClientId(value) {
  const id = String(value || "");
  return /^[a-zA-Z0-9-]{12,100}$/.test(id) ? id : null;
}
