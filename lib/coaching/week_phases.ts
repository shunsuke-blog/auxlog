import { planWeeks } from './generate_template'

// 週ごとのフェーズと、トレーニーのホームに出す「今週の目的」（2026-10-25、オーナー作成のメッセージ案）。
// フェーズは生成時にプランの generation_inputs.week_phases（例: ["V","V","I","D","M"]）として保存する。

export type WeekPhaseCode = 'V' | 'I' | 'D' | 'M'

const CODE: Record<string, WeekPhaseCode> = { volume: 'V', intensity: 'I', deload: 'D', maxout: 'M' }

/** N週のプランの各週のフェーズ（生成と同じ規則 planWeeks） */
export function weekPhaseCodes(totalWeeks: number): WeekPhaseCode[] {
  return planWeeks(totalWeeks).map(w => CODE[w.phase])
}

export const WEEK_PHASE_MESSAGES: Record<WeekPhaseCode, { label: string; message: string }> = {
  V: { label: '🧱 筋肉の土台を作る期間', message: '重さよりも正しいフォームを意識し、しっかり回数をこなして筋肉に効かせましょう。' },
  I: { label: '🔥 筋力を引き上げる期間', message: '限界の重さに挑戦します。回数が減る分、1セットごとに全力を出し切りましょう。' },
  D: { label: '🔋 疲労を抜くための回復週', message: '「少し物足りない」程度に負荷を下げて体を休ませることが、次の成長に直結します。' },
  M: { label: '🏆 自己ベスト挑戦週！', message: 'プログラムの集大成です。今の限界に挑戦し、メイン種目で記録更新を狙いましょう！' },
}

/** プランの week_phases から、その週の目的を返す（白紙から作成したプランなど、無ければ null） */
export function weekPurpose(weekPhases: unknown, week: number): { label: string; message: string } | null {
  if (!Array.isArray(weekPhases)) return null
  const code = weekPhases[week - 1]
  return typeof code === 'string' && code in WEEK_PHASE_MESSAGES ? WEEK_PHASE_MESSAGES[code as WeekPhaseCode] : null
}

/** 努力度（RIR）を、アプリと同じ平易な言葉にする（「あと◯回はできる、くらいの重さ」）。
 *  トレーナーからのメモの「重量：」の行に使う（2026-10-25 オーナー指定の書き方） */
export function effortText(rir: number): string {
  if (rir <= 0) return 'あと1回が限界、くらいの重さ'
  if (rir === 1) return 'あと1〜2回はできる、くらいの重さ'
  if (rir === 2) return 'あと2〜3回はできる、くらいの重さ'
  if (rir === 3) return 'あと3〜4回はできる、くらいの重さ'
  return '余裕を持ってできる重さ'
}
