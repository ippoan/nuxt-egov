# Plan: logout で OP session も消す (silent SSO を防ぐ)

Refs #146

## 背景

現状の `app/composables/useEgovAuth.ts` の `logout()`:

```typescript
function logout() {
  accessToken.value = null
  refreshToken.value = null
  tokenExpiresAt.value = 0
  if (import.meta.client) {
    localStorage.removeItem('egov_tokens')
  }
}
```

はローカル state をクリアするだけで、以下の 2 つの処理が抜けている:

1. **backchannel refresh_token 失効**: `server/api/egov/logout.post.ts` は用意されているが frontend から呼ばれていない
2. **frontchannel OP session cookie 消去**: `${authBase}/logout` へ redirect して e-Gov OP のブラウザ session cookie を消す処理が無い

結果、次回の authorize リクエストで e-Gov が **silent SSO** で自動再認証し、ログイン画面や同意画面が出ずに一瞬で final-test に戻ってしまう。ユーザは「ログアウトが効いていない」と感じる。

さらに、最終確認試験 No.01-1 の再エビデンス取得フロー (「ログアウト → 再ログイン」で画面ハードコピーを取得) で、e-Gov のログイン画面 (`e-Govアカウントログイン`) や同意画面のスクショが撮れない (画面が出ないので撮れない)。

## 設計

```typescript
async function logout() {
  const rt = refreshToken.value

  // 1. Backchannel: /api/egov/logout で refresh_token を e-Gov OP 側で失効
  //    (Keycloak-style POST /logout, client_secret 必要なので server proxy 経由)
  //    ネットワーク失敗しても local 状態は必ずクリアするため best-effort。
  if (rt) {
    try {
      await $fetch('/api/egov/logout', {
        method: 'POST',
        body: { refresh_token: rt },
      })
    } catch { /* best-effort — 続行 */ }
  }

  // 2. Local state をクリア
  accessToken.value = null
  refreshToken.value = null
  tokenExpiresAt.value = 0
  if (import.meta.client) {
    localStorage.removeItem('egov_tokens')
  }

  // 3. Frontchannel: OP session cookie を消すため e-Gov の logout URL に redirect
  //    ${authBase}/logout?post_logout_redirect_uri=<origin>/&client_id=<clientId>
  //    これをしないと OP に cookie が残り silent SSO で次回 authorize がスキップされる。
  if (import.meta.client) {
    const url = new URL(`${authBase}/logout`)
    url.searchParams.set('post_logout_redirect_uri', `${window.location.origin}/`)
    url.searchParams.set('client_id', clientId)
    window.location.href = url.toString()
  }
}
```

### `post_logout_redirect_uri` の登録

e-Gov OP 側で `post_logout_redirect_uri` に許可された URI が予め登録されている必要が
ある可能性がある (Keycloak ではクライアント設定に `Valid Post Logout Redirect URIs`)。
未登録の場合は e-Gov 側で redirect が拒否されて logout ページに留まる。その場合は
ユーザが手動で戻る必要があるが、少なくとも OP session cookie は消える (silent SSO 回避
の目的は達成)。

将来的に e-Gov Developer Portal で `${window.location.origin}/` を post_logout_redirect_uri
として登録する運用も検討する (`https://egov-check-staging.ippoan.org/` /
`https://egov-check.ippoan.org/`)。

### async 化に伴う callsite への影響

`logout()` を async 化するが、Vue の click イベントハンドラは async function を許容
するので `<button @click="logout">` は変更不要。

## 代替案 (採用しない理由)

### 案 A: id_token_hint を渡す

OIDC 標準では frontchannel logout で id_token_hint を渡すのが推奨。しかし現状
`useEgovAuth.ts` が id_token を保存していない (openid scope で発行されているが token
response の `id_token` フィールドを捨てている)。まず `setTokens` に id_token 保存を
追加してから使う必要があり、変更範囲が広がる。当面は client_id + post_logout_redirect_uri
で試みて、e-Gov 側が id_token_hint 必須と分かればその時点で追加する。

### 案 B: 別ウィンドウで logout URL を開く

`window.open(logoutUrl, '_blank')` でユーザ操作なしで OP logout を実行する案。しかし
ポップアップブロッカーに引っかかるリスクと、ユーザが元のタブに戻る手間があるため、
同一ウィンドウ redirect の方が UX が良い。

### 案 C: 何もしない (現状維持)

silent SSO は「ログアウトが効いていない」ように見えるだけで、実際は認可済みで
ログイン状態としては同じなので実害は無い、という判断もあり得る。しかし最終確認試験
の再エビデンス取得フローがブロックされる問題があるため対応する。

## リスク / gotcha

- **`post_logout_redirect_uri` 未登録**: e-Gov 側が拒否すると redirect されないが、OP
  cookie 消去は行われる (silent SSO 回避の主目的は達成)。ユーザは手動で app に戻る。
- **e-Gov 側の logout endpoint が id_token_hint 必須**: その場合は redirect が拒否
  されるので、id_token 保存も併せて実装が必要 (別 PR)。まず本 PR の実装で挙動を見る。
- **既存 login フローの退行**: 論理的には影響なし (setTokens / handleCallback / startLogin
  に変更なし)。staging で通常のログインが動くことを確認する。

## 検証手順 (staging)

1. `/final-test` にログインしている状態で「ログアウト」ボタンを押す
2. e-Gov の `${authBase}/logout` へ redirect されることを確認
3. 上位でアプリのホーム (`/`) に戻る (or e-Gov logout page に留まる)
4. 手動で `/final-test` に戻り「e-Govでログイン」を押す
5. 今度は e-Gov のログイン画面 (`e-Govアカウントログイン`) が出ることを確認
6. ログイン完了 → 同意画面 (出れば) → final-test に戻る
7. 全体を通して 01-1 の再エビデンス取得と画面ハードコピー取得ができる

## 完了条件

本 issue #146 の「完了条件」チェックボックスを参照。
