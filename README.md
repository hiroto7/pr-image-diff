# PR Image Diff

GitHub の PR に含まれる画像差分（VRT スナップショットなど）を、スマホでも手早く確認するための静的 Web アプリ。

- サーバーなし。ブラウザから直接 GitHub REST API を呼ぶ
- 画像は画面に近づいたものだけ、同時 6 本までで読み込み、失敗時は自動リトライ + カード単位の再試行
- 表示モード: **2-up** / **Swipe** / **Onion** / **Diff**（ピクセル差分をマゼンタで強調し、変化量を表示）
- 画像をタップすると全画面ビューア（ピンチズーム、ドラッグで移動、ダブルタップで拡大）

## 使い方

1. PR の URL（または `owner/repo#123`）を貼って「開く」。`owner/repo` だけ入れるとそのリポジトリの PR 一覧（open / merged / closed）が開く
   - 一度開いたリポジトリはホームに残り、その新しい PR がホームの「新しい PR」に並ぶので、次からは URL を打たずに選べる
2. private リポジトリを見る場合は、ホームの「GitHub トークン」に Personal Access Token を保存する
   - fine-grained トークン: 対象リポジトリの **Contents: Read-only** と **Pull requests: Read-only**
   - classic トークン: `repo`
   - トークンはブラウザの localStorage にのみ保存され、`api.github.com` 以外には送信しない
   - トークンを設定すると、自分のリポジトリの PR と自分が関係する PR も「新しい PR」に並ぶ

URL は `…/#/owner/repo/pull/123` の形なので、GitHub の PR URL の `https://github.com/` 以降をそのまま `#/` の後ろに付ければ開ける。`?url=<PR の URL>` でも開ける。Android ではホーム画面に追加すると、共有メニューからこのアプリに PR の URL を渡せる。

## 開発

```bash
npm install
npm run dev     # 開発サーバー
npm run build   # 型チェック + dist/ へビルド
```

## デプロイ

`dist/` を任意の静的ホスティングに置けば動く。GitHub Pages を使う場合は、リポジトリの Settings → Pages → Source を **GitHub Actions** にすると、`main` への push で `.github/workflows/deploy.yml` がデプロイする。

## 制限

- Git LFS で管理された画像は未対応
- 変更ファイルが 3000 件を超える PR は、GitHub API の上限により先頭 3000 件までが対象
- 「変更前」は PR の merge base 時点のファイル（GitHub の差分表示と同じ）
- Diff モードは 800 万画素を超える画像を縮小して比較する
