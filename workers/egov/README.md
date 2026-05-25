# egov-staging worker

`@ippoan/egov-shinsei-sdk` を server-side で握る薄い proxy worker。
`egov-staging.ippoan.org` で公開し、Nuxt app (`egov-check-staging.ippoan.org`)
から共有 API key 経由で呼ぶ。

## なぜ別 worker か

Nuxt nitro worker (`server/api/egov/*`) でも proxy はできるが、

- `EGOV_REFRESH_TOKEN` を client-side バンドルに乗せたくない
- access_token を全 Nuxt isolate / 全ユーザー横断で 1 つ cache したい
  (毎リクエスト OAuth token endpoint を叩かない)
- 認証経路と SDK ロジックの所有を Nuxt app から分離したい

を満たすため独立 worker にする。

## エンドポイント

| Path        | 認証                          | 動作                                                   |
| ----------- | ----------------------------- | ------------------------------------------------------ |
| `GET /health` | なし                          | `{ ok: true }` を返す                                  |
| `* /api/**` | `Authorization: Bearer <key>` | KV cache 済 access_token を付けて e-Gov v2 に proxy    |

`api/` 以降の path / query / body / `X-eGovAPI-Trial` ヘッダはそのまま透過する。

## デプロイ前準備

```sh
cd workers/egov
npm install

# KV 名前空間を作る (1 度きり)。出力された id を wrangler.toml の
# PLACEHOLDER_REPLACE_WITH_KV_ID に書き戻す。
npx wrangler kv:namespace create EGOV_TOKEN_CACHE

# Secrets Store entry を作成 (secrets-inventory の secret-rotate-pipe skill を使うと
# 値が LLM context に乗らない)。
#   - EGOV_CLIENT_SECRET (`NUXT_EGOV_CLIENT_SECRET` と同値)
#   - EGOV_REFRESH_TOKEN (e-Gov OAuth で発行した refresh_token)
#   - EGOV_WORKER_API_KEY (Nuxt app との共有 secret; ランダム生成)
```

## ローカル動作確認

```sh
npm run dev
# 別 shell で
curl http://127.0.0.1:8787/health
```

## デプロイ

CI (`.github/workflows/egov-worker-ci.yml`) が PR で staging deploy、tag push
で release deploy を走らせる。ローカルから手で出す場合:

```sh
npm run deploy
```
