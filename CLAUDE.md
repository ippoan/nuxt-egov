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
- 提出先情報: テスト手続専用の提出先識別子を使用（本番の提出先一覧D〜Nとは別）
  - `950A...` 系手続: `950API00000000001001001` / `総務省,行政管理局,API`
  - `900A...` 系手続: `900API00000000001001001` / `総務省,行政管理局,API`
  - 提出先が不要な手続（`-`）はkouseiTestValuesで空タグが埋まっても無視される
  - Excel参照: `/tmp/kensho-test/egov_applapi_testproclist.xlsx`（[検証環境テスト用手続ZIP](https://developer.e-gov.go.jp/contents/specification/document-api/specification.html) 内に同梱）
- 添付書類: 必須の手続（No.12,13等）は `dummy.txt` を添付し添付書類属性情報を `</提出先情報>` の後に挿入
- No.22（電子送達）: `/apply` ではなく `/post-apply` エンドポイントを使用
- 申請書属性情報: `file_info` から自動生成
- 郵便番号・電話番号は半角のまま（全角変換するとe-Govのマスタチェックでエラー）
- 住所は全角で記載（`東京都千代田区永田町１丁目７番１号`）

### 個別署名形式の構成（No.23〜49）
- ファイル構成: 構成管理XML + 申請書XML + WriteAppli構成情報XML + 添付書類 + SignAttach構成情報XML
- **構成管理XMLに署名値が存在しない**（標準形式との最大の違い）
- 構成情報XMLファイル名: `kousei` + `yyyyMMddHHmmssSSS`（APIから取得時に自動生成）
- スケルトンの様式ID: WriteAppli=`999000000000000001`, SignAttach=`999000000000000009`
- 様式IDスワップ: WriteAppli 001→009, SignAttach 009→001（必須、片方だけだと「不正」エラー）
- 参考: SmartHR kiji（旧API OSS）https://github.com/kufu/kiji — 標準形式のみ実装、個別署名は未実装
- 参考: Qiita https://qiita.com/itaruMatumoto/items/a4a4d74b5a1ff9ea0b8b

### 申請書XML
- スケルトンZIP内の `{form_id}check.xml` から必須フィールド・型を解析
- `buildTestValuesFromCheck()` でタグ名パターンマッチにより自動テスト値生成
- 手続ごとにフィールドが異なるが、check解析で汎用対応

### ローカル動作確認（Cloudflare Tunnel 経由）
- worktree でビルド＆起動: `cd .claude/worktrees/<name> && npm install && npx nuxi build && npx wrangler dev .output/server/index.mjs --assets .output/public --port 3000`
- Cloudflare Tunnel `test-nuxt.ippoan.org` が `localhost:3000` に接続済み
- `.env` の `NUXT_PUBLIC_EGOV_REDIRECT_URI` を `https://test-nuxt.ippoan.org/callback` に設定（e-Gov Developer Portal にも登録済み）
- メインワークツリーでは build しない（hook でソースファイル編集が禁止されているため worktree を使う）

### CDPデバッグ
- `window._egovToken` でアクセストークン取得可能
- CDPから直接APIを叩いてテスト可能（CI不要）

### 仕様書
- `spec/` ディレクトリに格納（`.gitignore` 対象）
- `egov-spec` スキルでダウンロード: `bash ~/.claude/skills/egov-spec/scripts/fetch-spec.sh . --all`
<!-- trigger staging deploy 2026-04-14 -->
