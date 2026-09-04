import { apiRequest, getAuthToken, getClientId, setAuthToken } from "./api-client.js";
import { recipeRepository } from "./recipe-repository.js";

function elements() {
  return {
    button: document.querySelector("#family-share-button"),
    dialog: document.querySelector("#family-login-dialog"),
    form: document.querySelector("#family-login-form"),
    password: document.querySelector("#family-password"),
    status: document.querySelector("#family-login-status")
  };
}

function setStatus(message = "", state = "") {
  const { status } = elements();
  status.textContent = message;
  status.dataset.state = state;
  status.hidden = !message;
}

function displayError(error) {
  const messages = {
    INVALID_PASSWORD: "家族パスワードが違います。",
    AUTH_NOT_CONFIGURED: "Workerに家族パスワードとトークンSecretを設定してください。",
    D1_NOT_CONFIGURED: "WorkerにD1のDB Bindingを設定してください。",
    RATE_LIMITED: "試行回数が多すぎます。少し待ってください。",
    TIMEOUT: "通信がタイムアウトしました。",
    NETWORK_ERROR: "共有サーバーへ接続できませんでした。"
  };
  return messages[error.code] || error.message || "家族共有の処理に失敗しました。";
}

export function initializeFamilySharing({ getLocalRecipes, applySharedRecipes, onReady }) {
  const { button, dialog, form, password } = elements();

  async function synchronize() {
    button.disabled = true;
    button.textContent = "同期中…";
    try {
      await recipeRepository.importOnce(getLocalRecipes());
      const recipes = await recipeRepository.list();
      applySharedRecipes(recipes);
      localStorage.removeItem("menuRecipeEdits");
      localStorage.removeItem("deletedRecipeIds");
      localStorage.setItem("d1RecipeMigrationComplete", "true");
      button.textContent = "家族共有中";
      button.dataset.connected = "true";
      await onReady?.();
    } catch (error) {
      if (error.status === 401) setAuthToken("");
      button.textContent = "家族共有";
      delete button.dataset.connected;
      throw error;
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener("click", () => {
    if (getAuthToken()) {
      synchronize().catch(error => {
        setStatus(displayError(error), "error");
        dialog.showModal();
      });
      return;
    }
    setStatus();
    dialog.showModal();
    password.focus();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    setStatus("ログインしています…", "loading");
    try {
      const payload = await apiRequest("/api/auth/login", {
        method: "POST", auth: false, body: { password: password.value, clientId: getClientId() }
      });
      setAuthToken(payload.token);
      await synchronize();
      password.value = "";
      dialog.close();
    } catch (error) {
      setStatus(displayError(error), "error");
    } finally {
      submit.disabled = false;
    }
  });

  if (getAuthToken()) synchronize().catch(() => {
    // 401の場合だけsynchronize内でトークンを破棄する。一時的な通信失敗ではログイン状態を維持する。
  });
}
