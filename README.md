# マーダーミステリー 参加エントリー（Murder Mystery Entry）

仲間内でマーダーミステリー作品への**参加エントリーを募る**ための、軽量なWebアプリです。
参加者は作品カードから名前を入れてエントリー、主催者（管理者）は作品やエントリーを管理できます。
**Firebase Realtime Database** によって、複数人が同時に開いていても操作がリアルタイムで反映されます。

- 公開URL: GitHub Pages（このリポジトリの Pages 設定で `main` ブランチを公開）
- フレームワーク不使用（バニラ HTML / CSS / JavaScript）・ビルド不要

---

## 主な機能

### 公開ビュー（参加者向け）
- 作品カードの一覧表示（フラット表示）
- **タグ・作品名のテキスト検索**（スペース区切りでAND）
- **最大人数フィルター** / **開催確定・済みの表示トグル**
- 名前を入力して**エントリー** / 自分のエントリーを**取り消し**（× ボタン）
- **エントリー者名は非公開**（「名前は非公開です」と表示）。自分のエントリーだけは
  この端末のブラウザに記憶され（`localStorage`）、本人にだけ表示・取り消し可能
- 作品ごとの情報をピクトグラムで表示：**PLAYERS（人数）/ TIME（時間）/ TOTAL（料金・全員での総額）**

### 管理者ビュー（主催者向け）
- サイドバー（PC）／上部ヘッダー（SP）の「管理者ログイン」から、パスワードでログイン
- **新規作品の追加 / 編集**（共通のモーダル。画像・URL・状態・開催日時・場所まで設定可）
- 作品の**削除** / 開催済み作品の**再募集**
- **ドラッグ＆ドロップで並び替え**
- 状態タブ（**募集中 / 開催確定 / 開催済み**）で切り替え
- **作品名・タグ検索**（タブ件数も検索に連動）
- 全エントリー者名の表示と**個別削除**、**全エントリーのリセット**

### 画面構成
- **PC**: 左に固定サイドバー（タイトル・妖しく明滅する光の演出・管理者ログイン）＋右にメイン
- **スマホ**: サイドバーが上部ヘッダーに変わり、全幅で縦積み
- カードの並びは公開ビュー・管理ビューで統一（同一の描画関数 `renderWork` を使用）

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フロントエンド | バニラ HTML / CSS / JavaScript（ビルド工程なし） |
| データ同期 | Firebase Realtime Database（compat SDK / CDN 読み込み） |
| ホスティング | GitHub Pages |
| フォント | Google Fonts（Noto Sans JP） |

---

## ファイル構成

```
murder-mystery-entry/
├── index.html        … 画面の構造（HTML）。CSS/JS を外部参照
├── css/
│   └── style.css     … 見た目（CSS）すべて
├── js/
│   └── app.js        … 動き（JavaScript）すべて。Firebase連携・描画・管理機能
├── img/
│   └── search-icon.png … 検索バーのアイコン
└── README.md
```

---

## ローカルで動かす

`index.html` を直接ダブルクリックでも概ね動きますが、相対パスやブラウザ仕様の都合上、
**簡易サーバー経由**での起動を推奨します（Python が入っていれば追加インストール不要）。

```bash
# プロジェクトフォルダで実行
python -m http.server 3000
# ブラウザで http://localhost:3000 を開く
```

インターネット接続が必要です（Firebase / Google Fonts を読み込むため）。

---

## デプロイ（GitHub Pages）

`main` ブランチに push すると、GitHub Pages 経由で数十秒〜1分ほどで公開ページに反映されます。

```bash
git add .
git commit -m "変更内容"
git push origin main
```

### キャッシュ対策（重要）
ブラウザは CSS / JS を一定時間キャッシュするため、`index.html` では読み込みURLに
**バージョン番号**を付けています。

```html
<link rel="stylesheet" href="css/style.css?v=31" />
<script src="js/app.js?v=31"></script>
```

`css/style.css` や `js/app.js` を更新したら、この **`?v=` の数字を1つ増やして** push すると、
端末側で確実に最新が読み込まれます（数字を上げ忘れると古い表示が残ることがあります）。

---

## カスタマイズ

| やりたいこと | 変更箇所 |
|---|---|
| 管理者の追加・変更 | `js/app.js` の `ADMIN_PASS_HASHES` 配列にSHA-256ハッシュ値を追加（後述） |
| 初期作品（デフォルト）の編集 | `js/app.js` 冒頭の `WORKS` 配列 |
| 配色（テーマカラー） | `css/style.css` 先頭の `:root { --accent 等 }` |
| 検索アイコンの差し替え | `img/search-icon.png` を置き換え |
| Firebase 接続先 | `js/app.js` 冒頭の `firebaseConfig` |

---

## データ構造（Firebase Realtime Database）

ルート `mm/` 配下に保存します。

| パス | 内容 |
|---|---|
| `entries/{作品ID}` | エントリー者名の配列 |
| `workinfo/{作品ID}` | 作品ごとの上書き情報（タイトル・人数・定員・時間・作者・料金・タグ・状態・開催日時・場所・URL・画像） |
| `customWorks/{ID}` | 管理画面から追加した作品の基本情報 |
| `workOrder` | 表示順（ドラッグ並び替え結果。作品IDの配列） |
| `deleted` | 削除した作品IDの配列 |
| `meta/catMerged` | 旧カテゴリ→タグ統合の実行済みフラグ（一度きりの移行用） |
| `workcats` / `categories` | 旧カテゴリ機能の名残（現在は未使用・タグへ統合済み） |

- デフォルト作品（`w1`〜`w5`）は `js/app.js` の `WORKS` にハードコードされています。
- 各作品の表示値は「`workinfo` の上書き → なければ `WORKS`/`customWorks` の元値」の順に解決されます（`getInfo()`）。
- 作品の状態は `recruiting`（募集中）/ `confirmed`（開催確定）/ `done`（開催済み）の3つ。

---

## 管理者の追加・変更

管理者パスワード（社員番号）はソースに平文保存せず、**SHA-256ハッシュ値**のみ保持しています。
追加・変更時は以下のコマンドでハッシュを生成し、`js/app.js` の `ADMIN_PASS_HASHES` 配列に追記してください。

```bash
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('社員番号').digest('hex'))"
```

```js
// js/app.js
const ADMIN_PASS_HASHES = [
  '48681e0a...', // UC1022
  '141c68c3...', // UC1257
  '新しいハッシュ値',
];
```

---

## セキュリティ・仕様上の注意

- **管理者認証はクライアント側**で行っています。パスワードはSHA-256でハッシュ化してソースに保持しており、
  平文は記載されていませんが、短い社員番号は総当たりで解析できる可能性があります。
  「URLを知っている仲間内の簡易的な仕切り」として想定しており、厳密なアクセス制御には向きません。
- **Firebase の設定値（apiKey 等）は公開されます**。これは Web 版 Firebase の通常仕様で、
  本来の保護は **Realtime Database のセキュリティルール**で行います。用途に応じてルールの設定を推奨します。
- **エントリー者名の「非公開」は表示上の配慮**です。自分のエントリー判定は端末の `localStorage`
  （キー: `mm_my_entries`）で行うため、端末・ブラウザを変えると「自分のエントリー」は表示されません
  （その作品に同じ名前で入れ直そうとすると「すでにエントリー済み」で弾かれます）。

---

## 動作確認のヒント

- 表示が変わらないときは、ブラウザの**スーパーリロード**（Windows: `Ctrl + Shift + R`）を試してください。
- スマホとPCで見え方が異なる箇所は、`css/style.css` のメディアクエリ
  （`@media (max-width: 768px)` / `600px`）で切り替えています。

---

*This project was built collaboratively with the help of Claude (Anthropic).*
