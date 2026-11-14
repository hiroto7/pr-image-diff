# PR Image Diff

GitHub の PR に含まれる画像差分（VRT スナップショットなど）を、スマホでも手早く確認するための静的 Web アプリ。

- サーバーなし。ブラウザから直接 GitHub REST API を呼ぶ
- 画像は画面に近づいたものだけ、同時 6 本までで読み込み、失敗時は自動リトライ + カード単位の再試行
- 表示モード: **2-up** / **Swipe** / **Onion** / **Diff**（ピクセル差分をマゼンタで強調し、変化量を表示）
- 画像をタップすると全画面ビューア（ピンチズーム、ドラッグで移動、ダブルタップで拡大）

## 使い方

1. PR の URL（または `owner/repo#123`）を貼って「開く」。public リポジトリの PR ならトークンなしで見られる
2. ホームの「GitHub トークン」に Personal Access Token を保存すると、private リポジトリの PR と、PR の一覧が使える
   - fine-grained トークン: 対象リポジトリの **Contents: Read-only** と **Pull requests: Read-only**
   - classic トークン: `repo`
   - トークンはブラウザの localStorage にのみ保存され、`api.github.com` 以外には送信しない
3. トークンがあると、ホームの「新しい PR」に自分のリポジトリの PR・自分が関係する PR・最近見たリポジトリの PR（open / merged / closed）が新しい順に並ぶ
   - 各 PR に画像の変更数（「画像 12」）が付き、画像の変更がない PR はグレーアウトされる
   - `owner/repo` を入力するか、ホームのリポジトリ名をタップすると、そのリポジトリの PR 一覧が開く

### API の使い分け

- PR の一覧: GraphQL。検索と各 PR の変更ファイル一覧を 1 リクエストで取れるので、PR の数だけ API を呼ばずに済む。GraphQL は認証必須なので一覧にはトークンが要る
- PR 1 件の表示: REST。public リポジトリならトークンなしで動く（画像は `raw.githubusercontent.com` から取得）

URL は `…/#/owner/repo/pull/123` の形なので、GitHub の PR URL の `https://github.com/` 以降をそのまま `#/` の後ろに付ければ開ける。`?url=<PR の URL>` でも開ける。

### 共有メニューから開く（Android）

Android の Chrome でサイトを開き、メニューの「ホーム画面に追加」→「インストール」でアプリとして入れると、GitHub アプリやブラウザの共有メニューに「PR Image Diff」が出る。PR を共有するとその PR の画像差分が直接開く（Web Share Target）。iOS の Safari は Web Share Target に対応していないため使えない。

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
