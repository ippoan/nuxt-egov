# egov-staging worker

`egov-staging.ippoan.org` で公開する e-Gov 試験 API への薄い proxy。
Nuxt app (`egov-check-staging.ippoan.org`) や browser から共有 API key 経由で呼ぶ。

## 設計方針

- **refresh_token を worker に保持しない**。caller (Nuxt app / browser) が自分の
  refresh_token を持ち、`POST /token` の `grant_type=refresh_token` で送って
  くる pattern。worker は `client_secret` を inject して e-Gov に転送するだけ。
  1 token 漏洩 = 全ユーザーなりすまし、を起こさない。
- access_token cache も worker 側に持たない。caller がそれぞれ自分の token を
  管理する (= per-user 帰属が明示的)。
- 認証 / API ロジックを Nuxt app から分離し、`client_secret` が client bundle に
  混入する経路を物理的に断つ。

## エンドポイント

| Path | 認証 | 動作 |
| ---- | ---- | ---- |
| `GET /health` | なし | `{ ok: true }` を返す |
| `POST /token` | なし (redirect_uri で e-Gov 側 validate) | `grant_type=authorization_code` / `refresh_token` を `client_secret` 付きで `e-Gov /auth/token` に転送 |
| `* /api/**` | caller 提供の `Authorization: Bearer <access_token>` (e-Gov 側 validate) | caller の Bearer を `e-Gov /shinsei/v2` に透過 |

worker 自前の gate は無し。不正 token / 不正 redirect_uri は upstream e-Gov が
401 を返すので worker 層で二重に弾く必要がない (= 抱える secret が減る)。

## 必要な Secrets Store entry

| binding | secret_name (CF Secrets Store) |
| ------- | ------------------------------ |
| `EGOV_CLIENT_SECRET` | `NUXT_EGOV_CLIENT_SECRET` |

Nuxt app と共用既存 entry を再利用。

## ローカル動作確認

```sh
cd workers/egov
npm install
npm run dev
curl http://127.0.0.1:8787/health
```

## デプロイ

CI (`.github/workflows/egov-worker-ci.yml`) が PR で staging deploy、tag push
で release deploy を走らせる。手動の場合 `npm run deploy`。
