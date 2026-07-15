# nuxt-egov

e-Gov 電子申請サービスのチェックツール。Nuxt 4 + Cloudflare Workers。

## 構成

- `app/pages/index.vue` — 申請一覧（状況確認）
- `app/pages/final-test.vue` — 最終確認試験（申請送信・結果記録）
- `app/pages/documents.vue` — 公文書ビューア
- `app/composables/useEgovAuth.ts` — OAuth2 認証（`@ippoan/egov-shinsei-sdk` 使用）
- `server/api/egov/` — e-Gov API プロキシ（CORS回避）

## SDK

`@ippoan/egov-shinsei-sdk` (GitHub Packages) を使用。
- リポジトリ: https://github.com/ippoan/egov-shinsei-sdk
- npm install 時に `.npmrc` で `@ippoan:registry=https://npm.pkg.github.com` が必要

## デプロイ

- staging: https://egov-check-staging.ippoan.org（PR時に自動デプロイ。**唯一の稼働環境**）
- tagless（マージ/PR 駆動）: `v*` タグは切らない。Release Wave 非参加（Refs #151）
- CI: `ippoan/ci-workflows` reusable workflow
- 未使用: 本番 `egov-check.ippoan.org`（旧 tag 駆動 root config は残置だがデプロイされない）

## 環境変数

`wrangler.jsonc` の `vars` に設定済み。`NUXT_EGOV_CLIENT_SECRET` のみ `wrangler secret` で管理。

## e-Gov 検証環境

- API: `https://api2.sbx.e-gov.go.jp/shinsei/v2`
- 認証: `https://account2.sbx.e-gov.go.jp/auth`
- Developer Portal BASIC認証: `apivendor:ivgeZP0wEu`

## 必ず守ること

- 郵便番号・電話番号は半角のまま（全角変換するとe-Govのマスタチェックでエラー）
- 個別署名形式（No.23〜49）は様式IDスワップ（WriteAppli 001→009, SignAttach 009→001）必須。片方だけだと「不正」エラー
- 個別署名形式のzipはフォルダ階層必須（`{proc_id}` フォルダで括る）。フォルダ無し直置きは不可
- メインワークツリーでは build しない（hook でソースファイル編集が禁止されているため worktree を使う）

詳細（アーキテクチャ・経緯・gotcha）は `nuxt-egov-map` skill を参照。
