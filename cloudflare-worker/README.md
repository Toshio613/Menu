# 献立アプリ AI Worker

GitHub Pagesから画像を受け取り、OpenAI APIへ中継するCloudflare Workerです。画像はD1、KV、R2などへ保存しません。

## 構成

- `src/routes/`: OCR、料理写真、冷蔵庫認識など機能別の入口
- `src/services/`: OpenAIなど外部サービスとの通信
- `src/schemas/`: Structured OutputsのJSON Schema
- `src/lib/`: CORS、入力検証、HTTPレスポンス

## 設定

1. `wrangler.jsonc`の`ALLOWED_ORIGINS`を実際のGitHub Pages URLへ変更します。
2. `js/app-config.js`のモデルを変える場合、`ALLOWED_OPENAI_MODELS`にも同じモデルを追加します。
3. APIキーは`OPENAI_API_KEY` Secretとして登録します。コードや`vars`には書きません。

ローカル用Secretは`.dev.vars.example`を参考に`.dev.vars`へ置き、Gitへコミットしないでください。
