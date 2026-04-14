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

- staging: https://egov-check-staging.ippoan.org（PR時に自動デプロイ）
- production: https://egov-check.ippoan.org（tag push時）
- CI: `ippoan/ci-workflows` reusable workflow

## 環境変数

`wrangler.jsonc` の `vars` に設定済み。`NUXT_EGOV_CLIENT_SECRET` のみ `wrangler secret` で管理。

## e-Gov 検証環境

- API: `https://api2.sbx.e-gov.go.jp/shinsei/v2`
- 認証: `https://account2.sbx.e-gov.go.jp/auth`
- Developer Portal BASIC認証: `apivendor:ivgeZP0wEu`

## 最終確認試験の申請データ構築

### kousei.xml（構成管理情報）
- 全49手続で同一構造（空タグ30個）
- `kouseiTestValues` で必須フィールドを埋める（氏名/住所/郵便番号等）
- 提出先情報: **空タグのまま残す**（手続により不要）
- 添付書類: スケルトンに既にある場合のみ処理
- 申請書属性情報: `file_info` から自動生成
- 住所・郵便番号・電話番号は `toFullWidth()` で全角変換

### 申請書XML
- スケルトンZIP内の `{form_id}check.xml` から必須フィールド・型を解析
- `buildTestValuesFromCheck()` でタグ名パターンマッチにより自動テスト値生成
- 手続ごとにフィールドが異なるが、check解析で汎用対応

### CDPデバッグ
- `window._egovToken` でアクセストークン取得可能
- CDPから直接APIを叩いてテスト可能（CI不要）

### 仕様書
- `spec/` ディレクトリに格納（`.gitignore` 対象）
- `egov-spec` スキルでダウンロード: `bash ~/.claude/skills/egov-spec/scripts/fetch-spec.sh . --all`
