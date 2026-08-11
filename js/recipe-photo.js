import { APP_CONFIG } from "./app-config.js";
import { apiRequest, getClientId } from "./api-client.js";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
let selectedFile = null;
let previewUrl = null;
let analyzing = false;

function photoElements() {
  return {
    panel: document.querySelector("#recipe-photo-panel"),
    input: document.querySelector("#recipe-photo-input"),
    chooseButton: document.querySelector("#choose-recipe-photo"),
    analyzeButton: document.querySelector("#analyze-recipe-photo"),
    preview: document.querySelector("#recipe-photo-preview"),
    previewImage: document.querySelector("#recipe-photo-preview-image"),
    status: document.querySelector("#recipe-photo-status")
  };
}

function setStatus(message = "", state = "") {
  const { status } = photoElements();
  status.textContent = message;
  status.dataset.state = state;
  status.hidden = !message;
}

function setBusy(busy) {
  analyzing = busy;
  const { input, chooseButton, analyzeButton } = photoElements();
  input.disabled = busy;
  chooseButton.disabled = busy;
  analyzeButton.disabled = busy || !selectedFile;
  analyzeButton.textContent = busy ? "写真を解析しています…" : "AIで読み取る";
}

function releasePreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}

export function resetRecipePhotoUI(enabled = true) {
  analyzing = false;
  selectedFile = null;
  releasePreview();
  const { panel, input, preview, previewImage } = photoElements();
  panel.hidden = !enabled;
  input.value = "";
  preview.hidden = true;
  previewImage.removeAttribute("src");
  setStatus();
  setBusy(false);
}

function loadImage(file) {
  if ("createImageBitmap" in window) return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_DECODE_FAILED"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("IMAGE_COMPRESS_FAILED")),
    "image/jpeg",
    quality
  ));
}

export async function compressRecipePhoto(file, config = APP_CONFIG.recipePhoto) {
  if (!file) throw new Error("NO_IMAGE");
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) throw new Error("UNSUPPORTED_IMAGE");
  if (file.size > config.maxSourceBytes) throw new Error("SOURCE_TOO_LARGE");
  const image = await loadImage(file);
  const width = image.width;
  const height = image.height;
  const scale = Math.min(1, config.maxImageDimension / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("IMAGE_COMPRESS_FAILED");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  let quality = config.jpegQuality;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > config.maxOutputBytes && quality > 0.55) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }
  if (blob.size > config.maxOutputBytes) throw new Error("COMPRESSED_TOO_LARGE");
  return blob;
}

function errorMessage(error) {
  const messages = {
    NO_IMAGE: "写真を選択してください。",
    UNSUPPORTED_IMAGE: "JPEG、PNG、WebP形式の写真を選択してください。HEICの場合はスクリーンショットをお試しください。",
    SOURCE_TOO_LARGE: "元の写真が大きすぎます。15MB以下の写真を選択してください。",
    COMPRESSED_TOO_LARGE: "写真を十分に縮小できませんでした。別の写真を選択してください。",
    IMAGE_DECODE_FAILED: "写真を読み込めませんでした。別の形式の写真をお試しください。",
    IMAGE_COMPRESS_FAILED: "写真の縮小に失敗しました。",
    API_URL_MISSING: "写真解析APIのURLが未設定です。",
    TIMEOUT: "解析に時間がかかっています。通信環境を確認して、もう一度お試しください。",
    RATE_LIMITED: "短時間の利用回数が上限に達しました。少し待ってからお試しください。",
    INVALID_RESPONSE: "AIの解析結果を読み取れませんでした。もう一度お試しください。",
    NOT_A_RECIPE: "料理を判別できませんでした。料理全体が写った明るい写真をお試しください。"
  };
  return messages[error.message] || "写真の解析に失敗しました。通信環境を確認して、もう一度お試しください。";
}

export function validateRecipeResult(value) {
  if (!value || typeof value !== "object") return false;
  if (typeof value.name !== "string" || !value.name.trim()) return false;
  if (!["main", "side", "soup"].includes(value.category)) return false;
  if (!Number.isFinite(value.time) || value.time < 1) return false;
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 100) return false;
  if (!Array.isArray(value.ingredients) || !value.ingredients.length) return false;
  if (!value.ingredients.every(item => typeof item?.name === "string" && item.name.trim()
    && Number.isFinite(item.amount) && item.amount > 0 && typeof item.unit === "string" && item.unit.trim())) return false;
  return Array.isArray(value.steps) && value.steps.length > 0 && value.steps.every(step => typeof step === "string");
}

async function requestAnalysis(blob, config) {
  const body = new FormData();
  body.append("image", blob, "recipe.jpg");
  body.append("model", config.model);
  body.append("clientId", getClientId());
  try {
    const payload = await apiRequest("/api/analyze-recipe", { method: "POST", body, auth: false, timeoutMs: config.timeoutMs });
    if (!validateRecipeResult(payload.recipe)) throw new Error("INVALID_RESPONSE");
    return payload.recipe;
  } catch (error) {
    if (error.status === 429) throw new Error("RATE_LIMITED");
    if (error.status === 422) throw new Error("NOT_A_RECIPE");
    throw new Error(error.code || error.message);
  }
}

export function initializeRecipePhoto({ onAnalyzed }) {
  const config = APP_CONFIG.recipePhoto;
  const { input, chooseButton, analyzeButton, preview, previewImage } = photoElements();
  chooseButton.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files?.[0] || null;
    if (!file) {
      resetRecipePhotoUI(true);
      setStatus("写真が選択されていません。", "error");
      return;
    }
    if (!SUPPORTED_IMAGE_TYPES.has(file.type) || file.size > config.maxSourceBytes) {
      selectedFile = null;
      setStatus(errorMessage(new Error(!SUPPORTED_IMAGE_TYPES.has(file.type) ? "UNSUPPORTED_IMAGE" : "SOURCE_TOO_LARGE")), "error");
      setBusy(false);
      return;
    }
    selectedFile = file;
    releasePreview();
    previewUrl = URL.createObjectURL(file);
    previewImage.src = previewUrl;
    preview.hidden = false;
    setStatus("写真を確認して「AIで読み取る」を押してください。", "ready");
    setBusy(false);
  });
  analyzeButton.addEventListener("click", async () => {
    if (analyzing) return;
    if (!selectedFile) {
      setStatus("写真を選択してください。", "error");
      return;
    }
    setBusy(true);
    setStatus("写真を解析しています…", "loading");
    try {
      const blob = await compressRecipePhoto(selectedFile, config);
      const recipe = await requestAnalysis(blob, config);
      onAnalyzed(recipe);
      setStatus(`AIの推定結果を入力しました（確信度 ${Math.round(recipe.confidence)}%）。内容を確認して保存してください。`, "success");
    } catch (error) {
      setStatus(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  });
  resetRecipePhotoUI(false);
}
