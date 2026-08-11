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

1. D1 Databaseを`menu-pic-recipes`などの名前で作成する。
2. Worker `menu-pic`の Settings > Bindings で、D1 Database Bindingを追加する。Variable nameは必ず`DB`にする。
3. D1のMigrationを実行する。

   ```sh
   cd cloudflare-worker
   npx wrangler d1 migrations apply menu-pic-recipes --remote
   ```

4. Workerの Settings > Variables and Secrets で次のSecretを追加する。

   - `OPENAI_API_KEY`: 現在のOpenAI APIキー
   - `FAMILY_PASSWORD`: 家族が画面で入力する共通パスワード
   - `TOKEN_SECRET`: 32バイト以上の予測困難なランダム文字列（家族パスワードとは別）

5. Workerを再デプロイし、`menu-pic`にD1 BindingとSecretが反映されたことを確認する。
6. GitHub Pagesで右上の「家族共有」からログインする。最初の成功時に、既存localStorage編集を含むレシピが一括移行される。

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

ローカル用Secretは`.dev.vars.example`をコピーした`.dev.vars`へ置き、コミットしません。ローカルD1 migrationは`npx wrangler d1 migrations apply menu-pic-recipes --local`で実行します。

## 検証

```sh
npm install
npm run lint
npm test
npm run check
```

`ALLOWED_ORIGINS`には公開GitHub Pagesとローカル開発URLだけを指定します。モデルを変更する場合は、`DEFAULT_OPENAI_MODEL`、`ALLOWED_OPENAI_MODELS`、フロントの`js/app-config.js`を同時に更新します。
