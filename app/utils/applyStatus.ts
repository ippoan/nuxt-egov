// 申請ステータスの表示色 (一覧と詳細で共用)。
export function statusClass(status: string): string {
  if (status.includes('到達')) return 'status-arrived'
  if (status.includes('審査中')) return 'status-reviewing'
  if (status.includes('手続終了')) return 'status-completed'
  if (status.includes('取下げ')) return 'status-withdrawn'
  return ''
}
