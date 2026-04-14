export interface TestProcedure {
  no: number
  proc_id: string
  name: string
  format: 'standard' | 'individual'
  expected_state: string
  expected_status: string
  note: string
  /** 署名要否: true = 署名あり手続（署名を付与すべき） */
  signatureRequired?: boolean
}

export const TEST_PROCEDURES: TestProcedure[] = [
  // 標準形式 (22件)
  { no: 1, proc_id: '950A010002010000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（通）１００７／ＡＰＩテスト用手続（社会保険関係手続）（通）１００７', format: 'standard', expected_state: '公文書の取得が可能な状態', expected_status: '審査終了', note: '公文書（署名あり）1件' },
  { no: 2, proc_id: '950A010002011000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（通）１００８／ＡＰＩテスト用手続（社会保険関係手続）（通）１００８', format: 'standard', expected_state: '公文書の取得が可能な状態', expected_status: '審査終了', note: '公文書（署名なし）1件' },
  { no: 3, proc_id: '950A010002012000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（通）１００４／ＡＰＩテスト用手続（労働保険関係手続）（通）１００４', format: 'standard', expected_state: 'コメントの取得が可能な状態', expected_status: '審査終了', note: 'コメント（メッセージ）1件' },
  { no: 4, proc_id: '950A010002013000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（通）１００５／ＡＰＩテスト用手続（労働保険関係手続）（通）１００５', format: 'standard', expected_state: 'コメントの取得が可能な状態', expected_status: '審査終了', note: 'コメント（ファイル）1件' },
  { no: 5, proc_id: '950A010002014000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（通）１００６／ＡＰＩテスト用手続（労働保険関係手続）（通）１００６', format: 'standard', expected_state: 'コメントの取得が可能な状態', expected_status: '審査終了', note: 'コメント（ファイル）1件' },
  { no: 6, proc_id: '950A010002015000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（通）１００７／ＡＰＩテスト用手続（労働保険関係手続）（通）１００７', format: 'standard', expected_state: 'コメントの取得が可能な状態', expected_status: '審査終了', note: 'コメント（メッセージ）1件' },
  { no: 7, proc_id: '950A010002016000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（通）１００８／ＡＰＩテスト用手続（労働保険関係手続）（通）１００８', format: 'standard', expected_state: '公文書の取得が可能な状態', expected_status: '審査終了', note: 'コメント（公文書）1件' },
  { no: 8, proc_id: '950A010002017000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（通）１００９／ＡＰＩテスト用手続（労働保険関係手続）（通）１００９', format: 'standard', expected_state: '公文書の取得が可能な状態', expected_status: '審査終了', note: 'コメント（公文書）1件' },
  { no: 9, proc_id: '950A010002018000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（通）１０１０／ＡＰＩテスト用手続（労働保険関係手続）（通）１０１０', format: 'standard', expected_state: '手数料納付が可能な状態', expected_status: '手続終了', note: '納付ステータス：納付待ち' },
  { no: 10, proc_id: '950A010002019000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（通）１０１１／ＡＰＩテスト用手続（労働保険関係手続）（通）１０１１', format: 'standard', expected_state: '手数料納付が可能な状態', expected_status: '手続終了', note: '納付ステータス：納付済み' },
  { no: 11, proc_id: '950A010002020000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（通）１０１２／ＡＰＩテスト用手続（労働保険関係手続）（通）１０１２', format: 'standard', expected_state: '手数料納付が可能な状態', expected_status: '手続終了', note: '納付ステータス：納付期限切れ' },
  { no: 12, proc_id: '950A010200003000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（通）１００１／ＡＰＩテスト用手続（労働保険関係手続）（通）１００１', format: 'standard', expected_state: '手続が終了した状態', expected_status: '手続終了', note: '' },
  { no: 13, proc_id: '950A010200004000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（通）１００２／ＡＰＩテスト用手続（労働保険関係手続）（通）１００２', format: 'standard', expected_state: '手続が終了した状態', expected_status: '手続終了', note: '' },
  { no: 14, proc_id: '950A010700000000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（通）１０００／ＡＰＩテスト用手続（社会保険関係手続）（通）１０００', format: 'standard', expected_state: '手数料納付が可能な状態', expected_status: '手続終了', note: '納付ステータス：取消' },
  { no: 15, proc_id: '950A010700001000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（通）１００１／ＡＰＩテスト用手続（社会保険関係手続）（通）１００１', format: 'standard', expected_state: '手続が終了した状態', expected_status: '手続終了', note: '' },
  { no: 16, proc_id: '950A010700002000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（通）１００２／ＡＰＩテスト用手続（社会保険関係手続）（通）１００２', format: 'standard', expected_state: '手続が終了した状態', expected_status: '手続終了', note: '' },
  { no: 17, proc_id: '950A010700005000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（通）１００３／ＡＰＩテスト用手続（社会保険関係手続）（通）１００３', format: 'standard', expected_state: '取下げ申請が可能な状態', expected_status: '審査中', note: '取下げが承認される' },
  { no: 18, proc_id: '950A010700006000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（通）１００４／ＡＰＩテスト用手続（社会保険関係手続）（通）１００４', format: 'standard', expected_state: '取下げ申請が可能な状態', expected_status: '審査中', note: '取下げが却下される' },
  { no: 19, proc_id: '950A010700007000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（通）１００５／ＡＰＩテスト用手続（社会保険関係手続）（通）１００５', format: 'standard', expected_state: '取下げ申請が可能な状態', expected_status: '審査中', note: '取下げが承認される' },
  { no: 20, proc_id: '950A010700008000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（通）１００６／ＡＰＩテスト用手続（社会保険関係手続）（通）１００６', format: 'standard', expected_state: '取下げ申請が可能な状態', expected_status: '審査中', note: '取下げが却下される' },
  { no: 21, proc_id: '900A020700013000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（通）０００３／ＡＰＩテスト用手続（労働保険適用徴収関係手続）（通）０００３', format: 'standard', expected_state: '補正申請が可能な状態', expected_status: '審査中（補正待ち）', note: '部分補正が可能な手続', signatureRequired: true },
  { no: 22, proc_id: '900A013800001000', name: 'ＡＰＩテスト用手続（電子送達関係手続）（通）０００１／ＡＰＩテスト用手続（電子送達関係手続）（通）０００１', format: 'standard', expected_state: '電子送達の取得が可能な状態', expected_status: '到達', note: '電子送達1件' },

  // 個別署名形式 (27件)
  { no: 23, proc_id: '950A101220029000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（個）１００１／ＡＰＩテスト用手続（社会保険関係手続）（個）１００１', format: 'individual', expected_state: '手続が終了した状態', expected_status: '手続終了', note: '' },
  { no: 24, proc_id: '950A101810021000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００１／ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００１', format: 'individual', expected_state: '手続が終了した状態', expected_status: '手続終了', note: '' },
  { no: 25, proc_id: '950A101810022000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００２／ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００２', format: 'individual', expected_state: '手続が終了した状態', expected_status: '手続終了', note: '' },
  { no: 26, proc_id: '950A101810023000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００３／ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００３', format: 'individual', expected_state: '再提出が可能な状態', expected_status: '審査中（補正待ち）', note: '再提出→手続終了' },
  { no: 27, proc_id: '950A101810024000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（個）１００１／ＡＰＩテスト用手続（労働保険関係手続）（個）１００１', format: 'individual', expected_state: '手続が終了した状態', expected_status: '手続終了', note: '' },
  { no: 28, proc_id: '950A101810025000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（個）１００２／ＡＰＩテスト用手続（労働保険関係手続）（個）１００２', format: 'individual', expected_state: '取下げ申請が可能な状態', expected_status: '審査中', note: '取下げが承認される' },
  { no: 29, proc_id: '950A101810026000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（個）１００３／ＡＰＩテスト用手続（労働保険関係手続）（個）１００３', format: 'individual', expected_state: '取下げ申請が可能な状態', expected_status: '審査中', note: '取下げが却下される' },
  { no: 30, proc_id: '950A101810027000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（個）１００４／ＡＰＩテスト用手続（労働保険関係手続）（個）１００４', format: 'individual', expected_state: '取下げ申請が可能な状態', expected_status: '審査中', note: '取下げが承認される' },
  { no: 31, proc_id: '950A101810028000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（個）１００５／ＡＰＩテスト用手続（労働保険関係手続）（個）１００５', format: 'individual', expected_state: '取下げ申請が可能な状態', expected_status: '審査中', note: '取下げが却下される' },
  { no: 32, proc_id: '950A102200038000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（個）１００５／ＡＰＩテスト用手続（社会保険関係手続）（個）１００５', format: 'individual', expected_state: 'コメントの取得が可能な状態', expected_status: '審査終了', note: 'コメント（メッセージ）1件' },
  { no: 33, proc_id: '950A102200039000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（個）１００６／ＡＰＩテスト用手続（社会保険関係手続）（個）１００６', format: 'individual', expected_state: '公文書の取得が可能な状態', expected_status: '審査終了', note: '公文書（署名あり）1件' },
  { no: 34, proc_id: '950A102200044000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（個）１００７／ＡＰＩテスト用手続（社会保険関係手続）（個）１００７', format: 'individual', expected_state: '公文書の取得が可能な状態', expected_status: '審査終了', note: 'コメント（公文書）1件' },
  { no: 35, proc_id: '950A102200045000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（個）１００８／ＡＰＩテスト用手続（社会保険関係手続）（個）１００８', format: 'individual', expected_state: '公文書の取得が可能な状態', expected_status: '審査終了', note: 'コメント（公文書）1件' },
  { no: 36, proc_id: '950A102200046000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（個）１００９／ＡＰＩテスト用手続（社会保険関係手続）（個）１００９', format: 'individual', expected_state: '手数料納付が可能な状態', expected_status: '手続終了', note: '納付ステータス：納付済み' },
  { no: 37, proc_id: '950A102200047000', name: 'ＡＰＩテスト用手続（社会保険関係手続）（個）１０１０／ＡＰＩテスト用手続（社会保険関係手続）（個）１０１０', format: 'individual', expected_state: '手数料納付が可能な状態', expected_status: '手続終了', note: '納付ステータス：納付期限切れ' },
  { no: 38, proc_id: '950A102210041000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００６／ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００６', format: 'individual', expected_state: 'コメントの取得が可能な状態', expected_status: '審査終了', note: 'コメント（ファイル）1件' },
  { no: 39, proc_id: '950A102210042000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００７／ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００７', format: 'individual', expected_state: 'コメントの取得が可能な状態', expected_status: '審査終了', note: 'コメント（ファイル）1件' },
  { no: 40, proc_id: '950A102210043000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００８／ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００８', format: 'individual', expected_state: 'コメントの取得が可能な状態', expected_status: '審査終了', note: 'コメント（メッセージ）1件' },
  { no: 41, proc_id: '950A102800050000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００９／ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１００９', format: 'individual', expected_state: '公文書の取得が可能な状態', expected_status: '審査終了', note: '公文書（署名なし）1件' },
  { no: 42, proc_id: '950A102810037000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（個）１００８／ＡＰＩテスト用手続（労働保険関係手続）（個）１００８', format: 'individual', expected_state: '再提出が可能な状態', expected_status: '審査中（補正待ち）', note: '再提出→コメント（ファイル）1件' },
  { no: 43, proc_id: '950A102810040000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（個）１００９／ＡＰＩテスト用手続（労働保険関係手続）（個）１００９', format: 'individual', expected_state: '手数料納付が可能な状態', expected_status: '手続終了', note: '納付ステータス：納付待ち' },
  { no: 44, proc_id: '950A102810048000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（個）１０１０／ＡＰＩテスト用手続（労働保険関係手続）（個）１０１０', format: 'individual', expected_state: '再提出が可能な状態', expected_status: '審査中（補正待ち）', note: '再提出→コメント（メッセージ）1件' },
  { no: 45, proc_id: '950A102810049000', name: 'ＡＰＩテスト用手続（労働保険関係手続）（個）１０１１／ＡＰＩテスト用手続（労働保険関係手続）（個）１０１１', format: 'individual', expected_state: '再提出が可能な状態', expected_status: '審査中（補正待ち）', note: '再提出→コメント（公文書）1件' },
  { no: 46, proc_id: '950A102810051000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１０１０／ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１０１０', format: 'individual', expected_state: '再提出が可能な状態', expected_status: '審査中（補正待ち）', note: '再提出→コメント（公文書）1件' },
  { no: 47, proc_id: '950A102810052000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１０１１／ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１０１１', format: 'individual', expected_state: '再提出が可能な状態', expected_status: '審査中（補正待ち）', note: '再提出→公文書1件' },
  { no: 48, proc_id: '950A102810053000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１０１２／ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）１０１２', format: 'individual', expected_state: '手数料納付が可能な状態', expected_status: '手続終了', note: '納付ステータス：取消' },
  { no: 49, proc_id: '900A102800072000', name: 'ＡＰＩテスト用手続（労働保険適用徴収関係手続）（個）００１４／電子申請', format: 'individual', expected_state: 'プレ印字データが取得可能な状態', expected_status: '到達', note: 'プレ印字データ取得' },
]
