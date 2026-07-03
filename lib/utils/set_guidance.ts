// 記録画面で「どんな基準で重量を決めればいいか」を平易な言葉で伝えるための変換ロジック。
// coaching_business_plan.md の「専門用語禁止」ルールにより、RPE/%RM等の用語はそのまま出さない。

export type ProgramSetMeta = {
  set_type: 'warmup' | 'top' | 'backoff' | 'working'
  target_rpe?: number
  target_reps?: number | 'amrap'
  rep_range_min?: number
  rep_range_max?: number
}

const GROUP_LABEL: Record<'top' | 'backoff' | 'working', string> = {
  top: 'メインセット',
  backoff: '追い込みセット',
  working: 'ワーキングセット',
}

function intensityText(targetRpe: number | undefined, isAmrap: boolean): string {
  if (isAmrap) return '限界までできるだけ多く'
  if (targetRpe == null) return ''
  if (targetRpe >= 9.5) return 'あと1回が限界、くらいの重さで'
  if (targetRpe >= 8.5) return 'あと1〜2回はできる、くらいの重さで'
  if (targetRpe >= 7.5) return 'あと2〜3回はできる、くらいの重さで'
  return '余裕を持ってできる重さで'
}

// プログラムのスロットデータ（1RM・レップ範囲・強度目標）から、種目単位のガイド文言を組み立てる
export function buildProgramGuidance(sets: ProgramSetMeta[]): string[] {
  const lines: string[] = []

  for (const type of ['top', 'backoff', 'working'] as const) {
    const group = sets.filter(s => s.set_type === type)
    if (group.length === 0) continue
    const s = group[0]
    const isAmrap = s.target_reps === 'amrap'
    const intensity = intensityText(s.target_rpe, isAmrap)
    const rangeText = !isAmrap && s.rep_range_min != null && s.rep_range_max != null
      ? `${s.rep_range_min}〜${s.rep_range_max}回の範囲で、`
      : ''
    const text = [rangeText, intensity].filter(Boolean).join('')
    if (text) lines.push(`${GROUP_LABEL[type]}: ${text}`)
  }

  return lines
}
