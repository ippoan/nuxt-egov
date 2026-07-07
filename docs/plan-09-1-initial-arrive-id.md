# Plan: No.09-1 再提出の `<初回受付番号>` を「原申請の到達番号」用フィールドで受ける

Refs #144, #141

## 背景と問題

e-Gov からの仕様回答 (2026-07-07) で判明した確定事実:

- No.09-1 (再提出) の `kousei.xml` `<初回受付番号>` に入れる値は **「原申請の到達番号」** である。
  補正待ち案件そのものの到達番号ではない。
- 例: 補正待ち案件 `9002026000006413` は、原申請 `9002026000002796` に対する再提出の
  払い出し番号。この `6413` に対して再々提出をかけるとき、`<初回受付番号>` に入れるべきは
  親の `2796` (祖父ではなく親)。

現状の `app/pages/final-test.vue` は「`<初回受付番号>` = 補正待ち案件の到達番号」を前提に
書かれており、以下の 3 か所が絡んで手入力を無視する:

1. **L1615-1633 自動検出**: 09-1/10-1 実行前に `client.listNotices({type:'補正'})` から
   `補正待ち` の arrive_id 集合を fetch → `inquiryState.arriveId_09_base` がその集合に
   無ければ第一候補で強制上書き。原申請は補正待ちではないので必ず上書き対象になる。
2. **case '09-1' (L1917, L1932)**: `aid09 = inquiryState.arriveId_09_base` を status
   check と `<初回受付番号>` の両方に使う。
3. **UI (L2905-2906)**: 単一フィールド「再提出/補正 到達番号」で `resubmitBaseArriveId` を
   受け、`savePreparedIds` で `arriveId_09_base` に落とす。

結果、原申請の到達番号を入れても実行時に補正待ち case で上書きされる。7/7 の実 payload
検証 (Refs #141) で 3 度の実行がすべて `<初回受付番号>=6413` で送信されていたことを確認済。

## 目標

- 09-1 の `<初回受付番号>` を独立フィールドから受け取り、手入力を無視しないようにする。
- 10-1 (部分補正) の挙動は退行させない (現行の `<初回受付番号>` = 補正待ち case = amend
  target が正しい)。
- 過去に保存された `arriveId_09_base` 値の移行は不要 (staging のみ、記録用途)。

## 設計

### state (SDK inquiryState) — 追加

- `arriveId_09_initial: string | null` を新設。
  09-1 の `<初回受付番号>` = 原申請の到達番号。手入力のみ (自動検出しない)。
- 既存 `arriveId_09_base: string | null` は「補正待ち案件の到達番号」の意味を維持
  (10-1 amend target + 09-1 status check target)。
- localStorage の永続化 key は既存 `egov_inquiry_state` にそのまま追加 (schema
  migration 不要)。

### 自動検出 (L1615-1633) — 縮小

`item.test_no === '09-1' || item.test_no === '10-1'` の条件を
`item.test_no === '10-1'` のみに絞る。09-1 では手動入力の `arriveId_09_initial` を
そのまま尊重する。

代替案として「09-1 でも自動で `arriveId_09_initial` を推定 (通知の親を遡る)」を検討したが、
e-Gov API に「補正待ち案件から親を辿る」明示の endpoint 情報が現時点で無く、確実性が
不明。手動入力で確定させ、必要になれば別 issue で自動化する。

### case '09-1' (L1911-1938) — 分離

```ts
const aid09Hosei = inquiryState.arriveId_09_base       // 補正待ち case (status check 用)
const aid09Initial = inquiryState.arriveId_09_initial  // 原申請 (<初回受付番号>)
if (!aid09Hosei) throw new Error('...')
if (!aid09Initial) throw new Error('09-1 初回受付番号 (原申請の到達番号) が未設定')

// status check は補正待ち case で
const detail09 = await client.getApplication(aid09Hosei)
if (!detail09.results.status.includes('補正待ち')) { r.status = 'skip'; ... }

// <初回受付番号> は原申請で
await buildStandardResubmit(zip09r, proc09, sk09r, '再提出', aid09Initial)
```

### case '10-1' — 変更なし

`aid10 = inquiryState.arriveId_09_base` のまま。10-1 は amend target と `<初回受付番号>`
がどちらも補正待ち case そのもので、この点は e-Gov 挙動と整合している (6/30 に pass 済)。

### UI (L2892 前後) — 入力欄追加

「再提出/補正 到達番号」の下に「**09-1 初回受付番号 (原申請)**」欄を追加:

```html
<label>09-1 初回受付番号 (原申請):</label>
<input v-model="resubmit09InitialArriveId"
       @change="savePreparedIds"
       placeholder="09-1 用 (原申請の到達番号、補正待ち case の親)"
       style="..." />
```

`resubmit09InitialArriveId = ref('')` を追加、`savePreparedIds` で
`inquiryState.arriveId_09_initial = resubmit09InitialArriveId.value` に反映。
`onMounted` の localStorage 復元パスにも追加。

### prepReady gate (L1710-1712)

`'09-1': !!inquiryState.arriveId_09_base && !!inquiryState.arriveId_09_initial`
に更新。両方揃わないと skip される (現在は base のみで gate)。

## 代替案 (採用しない理由)

### 案 A: 既存フィールドを rename して use-case 混在を解消

`arriveId_09_base` → `arriveId_09_hosei` / `arriveId_09_amend` などに rename。
→ 影響範囲が大きく、localStorage schema migration が要る。今回は追加だけで済む案を採る。

### 案 B: 自動検出で「原申請」を推定して 09-1 も自動化

`client.listNotices({type:'補正'})` の各 arrive_id から `getApplication` で親を辿る?
→ 現時点で e-Gov API の親遡り endpoint 情報が不明。手動確定で先に unblock、必要になれば
別 issue で追加する。

### 案 C: browser-side workaround (fetch hook で kousei.xml を書き換え)

一時しのぎとしては可能だが本番 code に残さない。今回の PR で code fix する。

## リスク / gotcha

- **10-1 pass 動作の退行**: `arriveId_09_base` の意味 (補正待ち case) は不変・
  自動検出も 10-1 では継続するため退行しない想定。staging 上で 10-1 だけ個別実行して
  現状の pass が再現されることを確認する。
- **prepReady gate 変更で 09-1 の run 条件が厳しくなる**: 既存の localStorage に
  `arriveId_09_initial` は無いので、初回は必ず「テストデータ設定」でフィールド入力が
  必要になる。これは仕様通り。placeholder / label で誘導する。
- **原申請の到達番号は user が把握している必要がある**: 通知取得 API で親を辿らない
  以上、user が「この補正待ち case の原申請はどれか」を把握して入力する。回答受領時に
  e-Gov が明示した対応表 (`6413` の親は `2796`) をそのまま入れる、というワークフロー。

## 検証手順 (staging)

1. `9002026000002796` を「09-1 初回受付番号 (原申請)」欄に入力
2. `9002026000006413` は既存の「再提出/補正 到達番号」欄に残す (status check 用)
3. 「申請データ設定」→ 09-1「実行」
4. Network タブで POST /apply の body を復号し、送信された kousei.xml の
   `<初回受付番号>` が `9002026000002796` になっていることを確認
   - pass → No.09-1 の再提出試験が成立、以後 #141 残タスクへ
   - 400 (`構成管理XML.初回受付番号に誤りがあります`) → e-Gov 回答 Q3 分岐: 手続
     `900A020700013000` で新規到達番号を取得、e-Gov に「この新規到達番号を再提出用
     補正待ちに整備してほしい」と連絡

## 完了条件

本 issue #144 の「完了条件」チェックボックスを参照。
