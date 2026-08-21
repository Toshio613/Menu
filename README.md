# 妻用献立アプリ

妻が一週間の献立を考える負担を減らす、スマートフォン向けの家庭用Webアプリです。フロントは静的なHTML・CSS・JavaScript、APIはCloudflare Worker、共有レシピはCloudflare D1で管理します。

## 起動方法

Live Serverなどで`index.html`を開きます。localhost／127.0.0.1で開いた場合、フロントは既定で`http://localhost:8787`のWorkerへ接続します。Workerの準備は[Worker README](cloudflare-worker/README.md)を参照してください。

## システム構成

### フロント側の役割

- 一週間の献立生成、曜日ごとの再提案、季節・食材・希望条件の反映
- レシピの一覧・作成・編集・削除画面
- 料理写真の選択、プレビュー、縮小、解析結果の編集フォームへの反映
- 家族共有ログインと認証トークンの端末内保持
- ログイン済みの場合はD1 APIを優先し、未ログインの場合はlocalStorageを利用
- 週間献立、お気に入り、買い物設定など端末固有データのlocalStorage保存

### Cloudflare Workerの役割

- 許可Originの検証とCORSレスポンス
- APIルーティング
- 家族パスワードの検証と期限付きBearer tokenの発行・検証
- 写真・モデル・端末IDの入力検証とRate Limit
- OpenAI Responses APIへの料理写真解析リクエスト
- D1を利用した共有レシピの取得・作成・更新・削除・初回移行
- OpenAI APIキー、家族パスワード、トークン署名Secretの安全な保持

## 写真解析処理の流れ

```text
料理写真を選択
  → フロントで形式・容量を確認
  → Canvasで縮小しJPEGへ変換
  → POST /api/analyze-recipe（FormData）
  → WorkerでOrigin・画像・モデル・clientIdを検証
  → OpenAI Responses APIへ送信
  → Workerとフロントで解析結果を検証
  → レシピ編集フォームへ入力
  → ユーザーが内容を確認して保存
```

写真解析APIは家族ログイン不要です。ただし、許可Origin、端末ID、Rate Limit、画像サイズ、モデル許可リストの検証は適用されます。写真解析だけではD1へ保存されず、ユーザーが保存ボタンを押した後に保存処理へ進みます。

現在の本番解析APIは`https://menu-pic.l-18mg169henapp.workers.dev/api/analyze-recipe`です。OpenAI APIキーはフロントへ置かず、Workerの`OPENAI_API_KEY` Secretから参照します。

## D1保存処理の流れ

```text
レシピ保存ボタン
  ├─ 家族ログイン済み
  │    → POST /api/recipes または PUT /api/recipes/:id
  │    → WorkerでBearer tokenと入力値を検証
  │    → D1へ保存
  │    → GET /api/recipesで最新一覧を再取得
  │    → D1の一覧で画面を再描画
  └─ 未ログイン
       → localStorageへ保存
       → 端末内データで画面を再描画
```

D1 Binding名は`DB`、テーブル定義は`cloudflare-worker/migrations/0001_create_recipes.sql`です。D1を使うレシピAPIは家族認証必須です。週間献立やお気に入りなど端末固有情報は引き続きlocalStorageを使います。

## 家族共有ログインの流れ

```text
家族共有ボタン
  → POST /api/auth/login（password・clientId）
  → WorkerがFAMILY_PASSWORDを検証
  → TOKEN_SECRETで期限付きBearer tokenを発行
  → フロントがtokenを端末のlocalStorageへ保存
  → 初回だけ端末内レシピをD1へ移行
  → GET /api/recipesで共有レシピを取得
```

認証トークンは端末ごとに保存されるため、Macでログインしていてもスマートフォンでは別途ログインが必要です。401の場合だけトークンを削除し、一時的な通信失敗ではログイン状態を維持します。

## 主要ファイルの担当

| ファイル | 担当 |
|---|---|
| `index.html` | アプリ画面、レシピ編集、写真選択、家族ログインUI |
| `style.css` | レスポンシブ表示を含む画面デザイン |
| `script.js` | 献立生成、画面イベント、解析結果反映、レシピ保存分岐 |
| `recipes.js` | 主菜の初期データ |
| `side-dishes.js` | 副菜の初期データ |
| `soups.js` | 汁物の初期データ |
| `js/app-config.js` | Worker URL、AIモデル、タイムアウト、画像圧縮設定 |
| `js/api-client.js` | Worker通信、タイムアウト、Bearer token、共通エラー処理 |
| `js/recipe-photo.js` | 写真検証・圧縮・送信・解析状態表示 |
| `js/recipe-repository.js` | フロント形式とD1 API形式の変換、レシピAPI呼び出し |
| `js/family-sharing.js` | 家族ログイン、初回移行、起動時D1同期 |
| `js/request-parser.js` | 日本語の希望文、曜日、食材条件の解析 |
| `js/shopping-list.js` | 買い物リスト集計と参考価格計算 |
| `cloudflare-worker/src/index.js` | CORS、ルーティング、認証ミドルウェア適用 |
| `cloudflare-worker/src/routes/recipe-photo.js` | 写真解析APIの入力検証と応答制御 |
| `cloudflare-worker/src/services/openai-client.js` | OpenAI Responses API通信 |
| `cloudflare-worker/src/schemas/recipe.js` | AI解析結果のJSON Schema |
| `cloudflare-worker/src/routes/auth.js` | 家族ログインAPI |
| `cloudflare-worker/src/lib/auth.js` | Bearer tokenの発行・検証 |
| `cloudflare-worker/src/lib/cors.js` | 許可OriginとCORSヘッダー |
| `cloudflare-worker/src/routes/recipes.js` | 共有レシピAPI |
| `cloudflare-worker/src/lib/recipe-validation.js` | D1保存前のレシピ検証・正規化 |
| `cloudflare-worker/src/repositories/recipe-repository.js` | D1 SQL操作 |
| `cloudflare-worker/migrations/0001_create_recipes.sql` | recipes・app_metaテーブル定義 |
| `cloudflare-worker/wrangler.jsonc` | Worker変数、Secret宣言、Rate Limit、D1 Binding |

## 現在確認できている問題点

- 写真解析機能が失敗している。CORSのOPTIONSは成功しているため、POST以降のWorker処理、OpenAI設定、モデル、API応答を個別に確認する必要がある。
- ローカルWorkerは`.dev.vars`がない場合、`OPENAI_API_KEY`、`FAMILY_PASSWORD`、`TOKEN_SECRET`不足の警告を出す。写真解析に直接必要なのは`OPENAI_API_KEY`。
- フロントのAIモデルとWorkerの`DEFAULT_OPENAI_MODEL`・`ALLOWED_OPENAI_MODELS`は別ファイルに重複しており、変更時に不一致が起きる可能性がある。
- 写真解析の一般的な失敗はフロントで同じメッセージに集約される場合があり、WorkerログとHTTPエラーコードの併用が必要。
- `script.js`が献立生成、画面制御、保存処理を広く担当しており、今後の大きな変更では影響範囲を慎重に確認する必要がある。
- D1共有は端末ごとの家族ログインが必要。別端末のログイン状態は共有されない。

## 変更時に守る境界

- 写真解析の修正では、D1レシピAPIと家族認証ルートを変更しない。
- D1の修正では、`POST /api/analyze-recipe`とOpenAI通信を変更しない。
- APIキー、家族パスワード、トークンSecretをフロントへ記載しない。
- `ALLOWED_ORIGINS`を`*`にせず、必要なOriginだけを追加する。
- Worker側の入力検証、Rate Limit、認証処理を削除しない。
