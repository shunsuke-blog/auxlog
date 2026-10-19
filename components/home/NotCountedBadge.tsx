import { TriangleAlert } from 'lucide-react'

// ProgramSlotCard / 追加種目カードで共通の「今週未カウント」表示。
// 週を早送りした直後など、本来のweekStartより前に記録したため今週の達成としては
// カウントされていない種目に出す（モバイル版 not-counted-badge.tsx と同じ）。
export default function NotCountedBadge() {
  return (
    <p className="flex items-center gap-1 mb-3 text-[12px] text-red-500">
      <TriangleAlert className="w-3 h-3 shrink-0" />
      記録済み・今週はカウント対象外
    </p>
  )
}
