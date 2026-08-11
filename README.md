# 妻用献立アプリ

起動方法

Live Serverで
index.htmlを開く

主なファイル

- `recipes.js`、`side-dishes.js`、`soups.js`: 料理データ
- `js/request-parser.js`: 希望文・曜日・食材の解析
- `js/shopping-list.js`: 買い物リスト集計と参考価格
- `js/app-config.js`: Worker API URL、AIモデル、タイムアウト、画像圧縮設定
- `js/api-client.js`: Worker API通信、タイムアウト、認証トークン管理
- `js/recipe-repository.js`: フロントのレシピとD1 API形式の変換・CRUD
- `js/family-sharing.js`: 家族ログイン、初回移行、共有レシピ同期
- `js/recipe-photo.js`: 料理写真の縮小、送信、フォームへの受け渡し
- `cloudflare-worker/`: OpenAI APIキーを安全に保持する画像解析API
- `script.js`: 画面表示、献立生成、イベント処理
- `style.css`: 画面デザイン

目的

妻の献立決めを補助する

写真からのレシピ入力

`js/app-config.js` の `api.baseUrl` にはCloudflare WorkerのベースURLを設定します。APIキーや家族パスワードはフロントエンドへ記載せず、Cloudflare WorkerのSecretへ登録します。

現在の解析API: `https://menu-pic.l-18mg169henapp.workers.dev/api/analyze-recipe`

家族共有

画面右上の「家族共有」からログインすると、レシピはCloudflare D1で共有されます。最初にログインした端末だけが、既存のレシピとlocalStorage上の編集内容をD1へ一括移行します。移行後、localStorageには献立・お気に入り・画面設定など端末固有の情報と、期限付き認証トークンだけが残ります。

D1とSecretの準備は [Worker README](cloudflare-worker/README.md) を参照してください。D1未設定でも既存の写真解析と端末内レシピ管理は利用できます。
