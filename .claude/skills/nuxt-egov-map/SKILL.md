---
name: nuxt-egov-map
generated-from: nuxt-egov:75a08bcf44f01e77dc3147f401bb06fe3c7731f7
paths: [app/, server/, workers/]
description: ippoan/nuxt-egov (e-Gov 電子申請 検証ツール、Nuxt 4 + Cloudflare Workers) の構造ナビゲーション。OAuth2 認証 / 申請送信 / kousei.xml 構築 / XML 署名 (xmldsig) / e-Gov API プロキシの配置を 1 枚にまとめる。トリガー:「nuxt-egov」「egov-check」「e-Gov 電子申請」「最終確認試験」「kousei.xml」「xmldsig」「egov-shinsei-sdk」「final-test」「個別署名形式」「egov-check.ippoan.org」等。
---

# nuxt-egov-map — ippoan/nuxt-egov 構造ナビゲーション

e-Gov 電子申請 API のチェックツール。Nuxt 4 + Nitro `cloudflare_module`。
`@ippoan/egov-shinsei-sdk` (GitHub Packages) で OAuth2 + 申請を扱い、CORS 回避のため
e-Gov API は `server/api/egov/` プロキシ経由で叩く。e-Gov は **検証環境 (sbx)** を使用。

> 細部は repo 側が正。ここは索引。`generated-from` が現在の tree-sha とズレたら
> session-start-skill-coverage hook が再生成を促す。

## 区画

| 区画 | 主要ファイル | 役割 |
|---|---|---|
| **pages** | `app/pages/{index,final-test,documents,callback}.vue` | 申請一覧(状況確認) / 最終確認試験(送信・記録) / 公文書ビューア / OAuth callback |
| **composables** | `app/composables/{useEgovAuth,useDocumentViewer,useXmlSign}.ts` | OAuth2 認証 (SDK 使用) / 公文書表示 / XML 署名 |
| **utils (XML 署名)** | `app/utils/xmldsig/{c14n,pfx,sign,types}.ts` | C14N 正規化 / PFX(PKCS12) 読込 / xmldsig 署名生成 |
| **utils (手続定義)** | `app/utils/finalTestProcedures.ts` | 最終確認試験の手続リスト・テスト値構築 |
| **server/api (e-Gov proxy)** | `server/api/egov/{[...path],token.post,introspect.post,logout.post}.ts` | e-Gov API 透過プロキシ / token / introspect / logout |
| **server/api (spec/sdk)** | `server/api/{sdk-state.get,spec-test-data.{get,post}}.ts` | SDK 状態 / spec テストデータ |
| **workers/egov** | `workers/egov/src/index.ts` | client_secret を持つ別 Worker (`egov-staging`)。`EGOV_CLIENT_SECRET` binding |

## entrypoint

- nuxt.config: `nitro.preset = cloudflare_module`。
- wrangler.jsonc: top-level=prod (`egov-check`, egov-check.ippoan.org) / `[env.staging]`=staging (egov-check-staging)。`compatibility_flags=["nodejs_compat"]`。
- vars: `NUXT_PUBLIC_EGOV_{CLIENT_ID,REDIRECT_URI,AUTH_BASE,API_BASE}`。secret は `NUXT_EGOV_CLIENT_SECRET` のみ (`wrangler secret`)。
- e-Gov 検証環境: API `api2.sbx.e-gov.go.jp/shinsei/v2`、auth `account2.sbx.e-gov.go.jp/auth`。

## gotcha (CLAUDE.md 由来)

- **kousei.xml**: 全 49 手続で同一構造 (空タグ 30 個)。`kouseiTestValues` で必須を埋める。郵便番号/電話は半角のまま (全角化すると e-Gov マスタチェックで弾かれる)、住所は全角。
- **個別署名形式 (No.23〜49)**: 構成管理 XML に署名値が無いのが標準形式との最大の違い。様式 ID スワップ (WriteAppli 001↔009, SignAttach 009↔001) が必須 — 片方だけだと「不正」エラー。
- **構成情報ファイルの `<手続ID>` (6/18 e-Gov 回答)**: `proc_id` そのままは不可。末尾 `000` を WriteAppli=`F01` / SignAttach=`T01` に置換 (例 `950A101220029000`→`F01`/`T01`)。構成情報の `申請者情報`/`連絡先情報` は空タグ (個人情報は kousei.xml のみ)。`final-test.vue` の `emptyApplicantTags()` 参照。
- No.22 (電子送達) は `/post-apply`、それ以外は `/apply`。必須添付の手続は `dummy.txt` を添付。
- spec は `spec/` (`.gitignore` 対象)、`egov-spec` skill で取得。
- ローカル確認は worktree で build → `wrangler dev` → Cloudflare Tunnel `test-nuxt.ippoan.org`。メイン wt では build しない (hook がソース編集禁止)。CDP debug は `window._egovToken` でトークン取得可。
- README.md は Nuxt の boilerplate (実態は CLAUDE.md が正)。

## CCoW / CI から見た立ち位置

- consumer 側。**`@ippoan/auth-client` は使わない** (認証は e-Gov OAuth2 を SDK 経由で直接扱う)。`.npmrc` で `@ippoan:registry=https://npm.pkg.github.com` 必須。
- CI: ci-workflows reusable workflow。PR で staging 自動デプロイ、tag push で prod。

## 関連 skill

- `egov-api` — e-Gov 電子申請 API の動作確認・デバッグ
- `egov-spec` — e-Gov Developer Portal から仕様書/スキーマ取得
- `nuxt-vitest` `worker-vitest` — Nuxt / workers/egov のテスト
- `cross-repo-symbol-index` `ippoan-infra-map` — 横断 symbol / 基盤地図

## CLAUDE.md から移設 (2026-07-06)

### 最終確認試験の申請データ構築

#### kousei.xml（構成管理情報）
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

#### 個別署名形式の構成（No.23〜49）
- ファイル構成: 構成管理XML + 申請書XML + WriteAppli構成情報XML + 添付書類 + SignAttach構成情報XML
- **構成管理XMLに署名値が存在しない**（標準形式との最大の違い）
- 構成情報XMLファイル名: `kousei` + `yyyyMMddHHmmssSSS`（APIから取得時に自動生成）
- スケルトンの様式ID: WriteAppli=`999000000000000001`, SignAttach=`999000000000000009`
- 様式IDスワップ: WriteAppli 001→009, SignAttach 009→001（必須、片方だけだと「不正」エラー）
- 参考: SmartHR kiji（旧API OSS）https://github.com/kufu/kiji — 標準形式のみ実装、個別署名は未実装
- 参考: Qiita https://qiita.com/itaruMatumoto/items/a4a4d74b5a1ff9ea0b8b

##### 構成情報ファイルの `<手続ID>` と個人情報（6/18 e-Gov 回答で確定）

個別署名形式の構成情報ファイル（WriteAppli / SignAttach）の `<手続ID>` は、構成管理情報
（kousei.xml）の手続識別子 `proc_id`（末尾 `000`）**そのままではエラー**になる。末尾 `000` を
以下に置換した値を使う:

| 構成情報 | 申請種別 | `<手続ID>` 末尾 | 例（proc_id=`950A101220029000`） |
|---|---|---|---|
| WriteAppli | 申請書作成 | `F01` | `950A101220029F01` |
| SignAttach | 添付書類署名 | `T01` | `950A101220029T01` |

- 全個別署名手続（No.23〜49）は `proc_id` が `000` 終わりで共通 → `proc_id.slice(0, -3)` + `F01/T01`
- 構成情報ファイルの `<申請者情報>` / `<連絡先情報>`（氏名〜電子メールアドレス）は**空タグにする**
  （個人情報は構成管理情報 kousei.xml 側にのみ設定）。`final-test.vue` の `emptyApplicantTags()` で除去。
- 構成管理情報（kousei.xml）側の `<手続ID>` は `proc_id` のまま（置換しない）。
- **zip はフォルダ階層必須**: `xxxxx.zip / {proc_id}（フォルダ）/ 各ファイル`。アプリの API 送信は
  スケルトン zip のフォルダ構造をそのまま引き継ぐので OK。e-Gov へ手動でメール添付する際は
  フォルダで括ること（フォルダ無し直置きは不可）。

#### 申請書XML
- スケルトンZIP内の `{form_id}check.xml` から必須フィールド・型を解析
- `buildTestValuesFromCheck()` でタグ名パターンマッチにより自動テスト値生成
- 手続ごとにフィールドが異なるが、check解析で汎用対応

#### ローカル動作確認（Cloudflare Tunnel 経由）
- worktree でビルド＆起動: `cd .claude/worktrees/<name> && npm install && npx nuxi build && npx wrangler dev .output/server/index.mjs --assets .output/public --port 3000`
- Cloudflare Tunnel `test-nuxt.ippoan.org` が `localhost:3000` に接続済み
- `.env` の `NUXT_PUBLIC_EGOV_REDIRECT_URI` を `https://test-nuxt.ippoan.org/callback` に設定（e-Gov Developer Portal にも登録済み）
- メインワークツリーでは build しない（hook でソースファイル編集が禁止されているため worktree を使う）

#### CDPデバッグ
- `window._egovToken` でアクセストークン取得可能
- CDPから直接APIを叩いてテスト可能（CI不要）

#### 仕様書
- `spec/` ディレクトリに格納（`.gitignore` 対象）
- `egov-spec` スキルでダウンロード: `bash ~/.claude/skills/egov-spec/scripts/fetch-spec.sh . --all`
