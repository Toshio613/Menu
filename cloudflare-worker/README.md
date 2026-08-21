# menu-pic Worker

GitHub Pagesの献立アプリに、料理写真解析とD1家族共有APIを提供するCloudflare Workerです。画像はD1・KV・R2へ保存せず、OpenAI APIへの解析リクエストが終わると破棄されます。

## 責務と構成

- `src/index.js`: CORS、ルーティング、認証ミドルウェア
- `src/routes/`: 認証、レシピCRUD、写真解析のHTTP処理
- `src/repositories/`: D1のSQL処理
- `src/services/`: OpenAIなど外部サービスとの通信
- `src/schemas/`: OpenAI Structured OutputsのSchema
- `src/lib/`: 共通HTTP、認証、入力検証
- `migrations/`: D1 Schema migration

この分離により、将来のOCR、冷蔵庫認識、買い物リストはそれぞれroute/serviceを追加でき、レシピCRUDとは独立して拡張できます。

## API

写真解析は従来どおり認証不要ですが端末単位でRate Limitされます。

- `POST /api/analyze-recipe`
- `POST /api/auth/login`
- `GET /api/recipes`
- `GET /api/recipes/:id`
- `POST /api/recipes`
- `PUT /api/recipes/:id`
- `DELETE /api/recipes/:id`
- `POST /api/recipes/import`（初回移行専用・D1側で一度だけ実行）

レシピAPIは`Authorization: Bearer <token>`が必須です。家族共通パスワードそのものはトークンに含めません。

## Cloudflareで行う初期設定

以下はリポジトリへ実値を保存せず、Cloudflare DashboardまたはWranglerで設定します。

1. Wranglerへログインし、D1 Databaseを`menu-pic-recipes`の名前で作成して設定へ反映する。

   ```sh
   npx wrangler login
   npx wrangler d1 create menu-pic-recipes --binding DB --location apac --update-config
   ```

   `wrangler.jsonc`にはローカル開発用の`DB` Bindingが定義済みです。作成コマンドにより、同じBindingへ本番D1の`database_id`が追加されます。

2. D1のMigrationを実行する。

   ```sh
   cd cloudflare-worker
   npm run db:migrate:remote
   ```

3. Workerの Settings > Variables and Secrets で次のSecretを追加する。

   - `OPENAI_API_KEY`: 現在のOpenAI APIキー
   - `FAMILY_PASSWORD`: 家族が画面で入力する共通パスワード
   - `TOKEN_SECRET`: 32バイト以上の予測困難なランダム文字列（家族パスワードとは別）

4. Workerを再デプロイし、`menu-pic`にD1 BindingとSecretが反映されたことを確認する。
5. GitHub Pagesで右上の「家族共有」からログインする。最初の成功時に、既存localStorage編集を含むレシピが一括移行される。

Dashboardを使わず設定ファイルでBindingを管理する場合は、D1作成時に表示されたIDを使い、`wrangler.jsonc`のトップレベルへ次を追加します。実際のIDをGit管理する方針の場合だけ行ってください。

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "menu-pic-recipes",
    "database_id": "Cloudflareで発行されたID",
    "migrations_dir": "migrations"
  }
]
```

ローカル用Secretは`.dev.vars.example`をコピーした`.dev.vars`へ置き、コミットしません。ローカルD1は次の手順で準備します。

```sh
cd cloudflare-worker
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev -- --port 8787
```

ローカルD1のデータは既定で`cloudflare-worker/.wrangler/state`以下に保存されます。フロントを許可済みOriginで開き、「家族共有」へログインすると、起動時に`GET /api/recipes`、新規レシピ保存時に`POST /api/recipes`が使用されます。未ログイン時や同期失敗時は既存の端末内レシピを引き続き利用できます。

## 検証

```sh
npm install
npm run lint
npm test
npm run check
```

`ALLOWED_ORIGINS`には公開GitHub Pagesとローカル開発URLだけを指定します。モデルを変更する場合は、`DEFAULT_OPENAI_MODEL`、`ALLOWED_OPENAI_MODELS`、フロントの`js/app-config.js`を同時に更新します。
