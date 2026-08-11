# 妻用献立アプリ

起動方法

Live Serverで
index.htmlを開く

主なファイル

- `recipes.js`、`side-dishes.js`、`soups.js`: 料理データ
- `js/request-parser.js`: 希望文・曜日・食材の解析
- `js/shopping-list.js`: 買い物リスト集計と参考価格
- `js/app-config.js`: AI API URL、モデル、タイムアウト、画像圧縮設定
- `js/recipe-photo.js`: 料理写真の縮小、送信、フォームへの受け渡し
- `cloudflare-worker/`: OpenAI APIキーを安全に保持する画像解析API
- `script.js`: 画面表示、献立生成、イベント処理
- `style.css`: 画面デザイン

目的

妻の献立決めを補助する

写真からのレシピ入力

外部設定が完了するまでは `js/app-config.js` の `apiUrl` を空欄にしておきます。APIキーはフロントエンドへ記載せず、Cloudflare Workerの `OPENAI_API_KEY` Secretへ登録します。
