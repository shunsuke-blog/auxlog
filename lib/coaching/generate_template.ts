// 「Auxlog で作成」：既存の9週間エンジンの考え方で、任意の週数・週2〜7日のテンプレートを作る。
// 重量は 1RM に対する割合（target_pct_1rm）で持ち、トレーニー追加時に1RMから kg を計算する。
// アイソレーション種目は重量を空欄（前回記録から自動提案）にする。
//
// 拡張ルールと根拠は要件定義ドキュメントの「Auxlog生成の拡張ルール」タブ（2026-10-19 決定）:
//   - 週5〜7日は週4日と同じ種目構成を、より多くの日に分ける（総ボリュームが同じなら頻度の差は小さい）
//   - 週7日の7日目は体幹・ふくらはぎだけを低めの努力度で行い、腕は入れない
//   - 頻度による強度補正は週4日と同じ（±0）。週1日は作らない
//   - N週（1〜16）は最終週を MaxOut、負荷の高い週の連続は最大7週になるよう回復週を入れる。
//     ボリューム期：強度期 ≒ 4：3 で、元の W1〜4／W5〜7 のパラメータを均等に割り当てる
//
// セルフモードの提案エンジン（program_engine.ts）の計算をそのまま使い、DBの週次パラメータ
// （program_weekly_params / movement_pattern_weekly_params）を読むだけで、エンジン自体は変えない。

import type { MovementPatternWeeklyParams, ProgramPhase, ProgramWeeklyParams } from '@/types'
import type { CompositionCategory, PriorityMuscleOption } from '@/lib/constants/program_composition'
import {
  buildExerciseCategories,
  distributeToDays,
  isOneRmDemotedAtDays,
  musclesNeedingSixPatternDurationBonus,
  setsForNonPatternCategory,
  sixPatternDurationBonusSets,
  type DaysPerWeek,
  type SessionDurationMinutes,
} from '@/lib/suggest/generate_program_composition'
import { buildSlotSelections, type ExerciseMasterRow } from '@/lib/onboarding/exercise_matching'
import {
  COMPOUND_VOLUME_PHASE_RPE_CEILING,
  effortRampTargetRpe,
  frequencyPctRmOffset,
  slotNotes,
  volumeRampsForCategory,
} from '@/lib/suggest/program_engine'

export const MAX_TEMPLATE_WEEKS = 16
export const MIN_GENERATED_DAYS = 2
export const MAX_GENERATED_DAYS = 7
/** 回復週を挟まずに続ける負荷の高い週（ボリューム期・強度期）の上限（2026-10-19 決定: 7週） */
export const MAX_CONSECUTIVE_HARD_WEEKS = 7

export type WeekPlan = {
  week: number
  /** 割り当てる元の9週間プログラムの週（1〜9） */
  sourceWeek: number
  phase: ProgramPhase
}

/** N週のプログラムの各週に、元の9週間プログラムのどの週のパラメータを使うかを決める。 */
export function planWeeks(totalWeeks: number): WeekPlan[] {
  if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > MAX_TEMPLATE_WEEKS) {
    throw new Error(`totalWeeks must be 1-${MAX_TEMPLATE_WEEKS}`)
  }
  const hasMaxout = totalWeeks >= 4
  const hasFinalDeload = totalWeeks >= 6
  const beforeFinal = totalWeeks - Number(hasMaxout) - Number(hasFinalDeload)

  // 途中に入れる回復週の数 m: 負荷の高い週 (beforeFinal - m) を m+1 個の区間に分けて、
  // どの区間も上限以下になる最小の m
  let midDeloads = 0
  while (beforeFinal - midDeloads > MAX_CONSECUTIVE_HARD_WEEKS * (midDeloads + 1)) midDeloads++
  const hardWeeks = beforeFinal - midDeloads

  // 区間の長さはできるだけ均等に（前の区間を長めに）
  const runs = Array.from({ length: midDeloads + 1 }, (_, i) =>
    Math.floor(hardWeeks / (midDeloads + 1)) + (i < hardWeeks % (midDeloads + 1) ? 1 : 0),
  )

  // 負荷の高い週の前半をボリューム期、後半を強度期にする（≒4:3）
  let volumeWeeks = Math.max(1, Math.round((hardWeeks * 4) / 7))
  if (hardWeeks >= 2) volumeWeeks = Math.min(volumeWeeks, hardWeeks - 1)
  const intensityWeeks = hardWeeks - volumeWeeks
  const sourceFor = (hardIndex: number): Pick<WeekPlan, 'sourceWeek' | 'phase'> => {
    if (hardIndex < volumeWeeks) {
      const k = hardIndex
      const sourceWeek = volumeWeeks === 1 ? 1 : 1 + Math.round((k * 3) / (volumeWeeks - 1))
      return { sourceWeek, phase: 'volume' }
    }
    const j = hardIndex - volumeWeeks
    const sourceWeek = intensityWeeks === 1 ? 5 : 5 + Math.round((j * 2) / (intensityWeeks - 1))
    return { sourceWeek, phase: 'intensity' }
  }

  const plan: WeekPlan[] = []
  let hardIndex = 0
  runs.forEach((len, runIdx) => {
    for (let i = 0; i < len; i++) {
      plan.push({ week: plan.length + 1, ...sourceFor(hardIndex) })
      hardIndex++
    }
    if (runIdx < runs.length - 1) plan.push({ week: plan.length + 1, sourceWeek: 8, phase: 'deload' })
  })
  if (hasFinalDeload) plan.push({ week: plan.length + 1, sourceWeek: 8, phase: 'deload' })
  if (hasMaxout) plan.push({ week: plan.length + 1, sourceWeek: 9, phase: 'maxout' })
  return plan
}

/** 種目構成・強度補正の基準にする日数。週5〜7日は週4日と同じ構成を使う。 */
export function compositionDays(daysPerWeek: number): DaysPerWeek {
  if (daysPerWeek >= 4) return 4
  return daysPerWeek as DaysPerWeek
}

type MovementGroup = 'push' | 'pull' | 'legs' | 'calves' | 'core'

/** 改定ルール①（2026-10-22 オーナー決定）: 部位ごとの Day 割り振りを固定する。
 *  三頭は押す日（胸・肩）、二頭は引く日（背中）、体幹は脚の日にだけ置く（「どの日でもよい」を廃止）。 */
function movementGroup(category: CompositionCategory): MovementGroup {
  if (category.id === 'calves') return 'calves'
  if (category.muscle === 'legs') return 'legs'
  if (category.muscle === 'core') return 'core'
  if (category.muscle === 'back') return 'pull'
  if (category.muscle === 'arms') return category.id.startsWith('biceps') ? 'pull' : 'push'
  return 'push' // chest, shoulders
}

// 週5〜7日の配置候補。同じ部位の高強度セッションの間隔を48時間以上空ける
// （5日: 上半身/下半身/プッシュ/プル/脚、6日: プッシュ/プル/脚 ×2、7日: 6日＋体幹・カーフの日）。
// 週4日は上半身（胸・肩・背中・二頭・三頭）＝Day1・3、下半身（脚・体幹）＝Day2・4（改定ルール①）。
const EXTENDED_ELIGIBLE_DAYS: Record<4 | 5 | 6 | 7, Record<MovementGroup, number[]>> = {
  4: { push: [1, 3], pull: [1, 3], legs: [2, 4], calves: [2, 4], core: [2, 4] },
  5: { push: [1, 3], pull: [1, 4], legs: [2, 5], calves: [2, 5], core: [2, 5] },
  6: { push: [1, 4], pull: [2, 5], legs: [3, 6], calves: [3, 6], core: [3, 6] },
  7: { push: [1, 4], pull: [2, 5], legs: [3, 6], calves: [7], core: [7] },
}

/** 種目カテゴリを各 Day に配置する。週2〜3日は既存エンジンと同じ配置、週4〜7日は改定ルール①の固定。
 *  セルフモードの提案エンジン（distributeToDays）の週4日の配置は変えていない。 */
export function distributeTemplateDays(
  daysPerWeek: number,
  categories: readonly CompositionCategory[],
): Map<number, CompositionCategory[]> {
  if (daysPerWeek <= 3) return distributeToDays(daysPerWeek as DaysPerWeek, categories)

  const eligible = EXTENDED_ELIGIBLE_DAYS[daysPerWeek as 4 | 5 | 6 | 7]
  const counts = new Map<number, number>()
  const result = new Map<number, CompositionCategory[]>()
  for (let d = 1; d <= daysPerWeek; d++) {
    counts.set(d, 0)
    result.set(d, [])
  }
  // 既存の distributeToDays と同じ貪欲法（候補日のうち、その時点で種目数が一番少ない日）
  for (const category of categories) {
    const day = [...eligible[movementGroup(category)]].sort((a, b) => counts.get(a)! - counts.get(b)!)[0]
    counts.set(day, counts.get(day)! + 1)
    result.get(day)!.push(category)
  }
  return result
}

/**
 * 途中の回復週（MaxOut の直前ではない回復週、10週以上のプランで入る）の負荷（2026-10-22 オーナー決定 b）。
 * 元の9週間の W8 は「セット数だけを減らし、重量は保つ」週（直後の MaxOut に向けた調整）なので、
 * MaxOut の直前の回復週はそのまま W8 を使う。途中の回復週は直後に測定が無いため、
 * 直前の週より重量を約1割下げ、セット数を減らし、努力度も下げて疲れを抜く。
 */
export const MID_DELOAD = {
  /** 重いメイン種目の%1RM: 直前の週のトップセットに掛ける割合 */
  pctFactor: 0.9,
  /** 全セットのRIR（重いメイン種目・補助種目とも） */
  rir: 3,
  /** 補助種目・6パターン以外の枠のセット数: 通常のセット数に掛ける割合（切り上げ、最低1セット） */
  setsFactor: 0.6,
  note: '回復週 — 直前の週より重量を約1割下げ、セット数を減らして疲れを抜く',
} as const

/** 改定ルール②（2026-10-22 オーナー決定）: 1日の種目数の上限。90分〜は9種目まで。 */
export const MAX_EXERCISES_PER_DAY: Record<SessionDurationMinutes, number> = { 60: 5, 75: 7, 90: 9 }

/**
 * Day への割り振りの後に、1日の種目数を時間の上限に収め、体幹をその日の最後に並べる。
 * - 上限を超えた日は、枠の優先順位が低い（categories の後ろにある）種目から外す。
 * - 重いメイン種目（6パターン、順位1〜6）は外さない。それだけで上限を超える場合はそのまま残す。
 * - 体幹はスクワット等の前に疲れさせないよう、その日の一番最後にする（改定ルール①）。
 */
export function fitDaysToSession(
  dayCategories: Map<number, CompositionCategory[]>,
  categories: readonly CompositionCategory[],
  minutes: SessionDurationMinutes,
): Map<number, CompositionCategory[]> {
  const limit = MAX_EXERCISES_PER_DAY[minutes]
  const rank = new Map(categories.map((c, i) => [c.id, i]))
  const result = new Map<number, CompositionCategory[]>()
  for (const [day, list] of dayCategories) {
    const kept = [...list]
    while (kept.length > limit) {
      let drop = -1
      kept.forEach((c, i) => {
        if (c.isSixPattern) return
        if (drop < 0 || rank.get(c.id)! > rank.get(kept[drop].id)!) drop = i
      })
      if (drop < 0) break
      kept.splice(drop, 1)
    }
    result.set(day, [...kept.filter(c => c.muscle !== 'core'), ...kept.filter(c => c.muscle === 'core')])
  }
  return result
}

export type GeneratedSet = {
  target_pct_1rm: number | null
  target_weight_kg: null
  target_reps: number
  target_rir: number | null
  is_warmup: boolean
}

export type GeneratedExercise = {
  exercise_master_id: string
  trainer_exercise_id: null
  note: string | null
  sets: GeneratedSet[]
}

export type GeneratedDay = { week: number; day: number; exercises: GeneratedExercise[] }

export type GenerateTemplateInput = {
  totalWeeks: number
  daysPerWeek: number
  sessionMinutes: SessionDurationMinutes
  priorities: PriorityMuscleOption[]
  exercises: (ExerciseMasterRow & { id: string })[]
  weeklyParams: Pick<ProgramWeeklyParams, 'slot_id' | 'week_number' | 'working_sets' | 'rep_range_min' | 'rep_range_max' | 'rpe' | 'phase' | 'top_set_is_amrap'>[]
  movementParams: MovementPatternWeeklyParams[]
}

const rpeToRir = (rpe: number) => Math.max(0, Math.round(10 - rpe))
const roundPct = (pct: number) => Math.round(pct * 1000) / 1000

export function generateTemplate(input: GenerateTemplateInput): GeneratedDay[] {
  const { totalWeeks, daysPerWeek, sessionMinutes: minutes, priorities, exercises, weeklyParams, movementParams } = input
  if (!Number.isInteger(daysPerWeek) || daysPerWeek < MIN_GENERATED_DAYS || daysPerWeek > MAX_GENERATED_DAYS) {
    throw new Error(`daysPerWeek must be ${MIN_GENERATED_DAYS}-${MAX_GENERATED_DAYS}`)
  }

  const baseDays = compositionDays(daysPerWeek)
  const categories = buildExerciseCategories(baseDays, priorities)
  const dayCategories = fitDaysToSession(distributeTemplateDays(daysPerWeek, categories), categories, minutes)
  const { names } = buildSlotSelections({ daysPerWeek: baseDays, priorityMuscles: priorities, exercises, selectedExercises: new Set() })
  const exerciseByName = new Map(exercises.map(e => [e.name, e]))
  const bonusMuscles = musclesNeedingSixPatternDurationBonus(baseDays, priorities)
  const weeklyBy = new Map(weeklyParams.map(p => [`${p.week_number}:${p.slot_id}`, p]))
  const movementBy = new Map(movementParams.map(p => [`${p.week_number}:${p.movement_pattern}`, p]))
  const weeks = planWeeks(totalWeeks)

  const out: GeneratedDay[] = []
  let lastHardSourceWeek = 1
  for (const [weekIndex, { week, sourceWeek, phase }] of weeks.entries()) {
    const isMidDeload = phase === 'deload' && weeks[weekIndex + 1]?.phase !== 'maxout'
    if (phase === 'volume' || phase === 'intensity') lastHardSourceWeek = sourceWeek
    const midSets = (normal: number) => Math.max(1, Math.ceil(normal * MID_DELOAD.setsFactor))
    for (let day = 1; day <= daysPerWeek; day++) {
      // 週7日の7日目（体幹・カーフの日）は低めの努力度で行う（RIR +1）
      const rirBonus = daysPerWeek === 7 && day === 7 ? 1 : 0
      const generated: GeneratedExercise[] = []

      for (const category of dayCategories.get(day) ?? []) {
        const exercise = exerciseByName.get(names[category.id] ?? '')
        if (!exercise) continue
        const hasOneRm = exercise.requires_one_rm && !isOneRmDemotedAtDays(category, baseDays)
        // MaxOut週はメインリフトの実力測定週なので、1RM管理種目以外は外す（エンジンと同じ）
        if (phase === 'maxout' && !hasOneRm) continue

        const sets: GeneratedSet[] = []
        const notes: string[] = []

        if (hasOneRm && isMidDeload) {
          // 途中の回復週: 直前の週の重量・回数を基準に約1割軽く、バックオフは W8 と同じセット数
          const prev = movementBy.get(`${lastHardSourceWeek}:${exercise.movement_pattern}`)
          const w8 = movementBy.get(`8:${exercise.movement_pattern}`)
          if (!prev || prev.top_set_pct_rm == null || prev.top_set_reps == null) continue
          const topPct = Math.min(prev.top_set_pct_rm + frequencyPctRmOffset(baseDays), 1) * MID_DELOAD.pctFactor
          sets.push({ target_pct_1rm: roundPct(topPct), target_weight_kg: null, target_reps: prev.top_set_reps, target_rir: MID_DELOAD.rir + rirBonus, is_warmup: false })
          const backoffCount = category.isSixPattern
            ? (w8?.backoff_sets ?? 2) + (bonusMuscles.has(category.muscle) ? sixPatternDurationBonusSets(minutes) : 0)
            : Math.max(0, midSets(setsForNonPatternCategory(minutes)) - 1)
          if (prev.backoff_pct_of_top != null && prev.backoff_reps) {
            for (let i = 0; i < backoffCount; i++) {
              sets.push({ target_pct_1rm: roundPct(topPct * prev.backoff_pct_of_top), target_weight_kg: null, target_reps: prev.backoff_reps, target_rir: MID_DELOAD.rir + rirBonus, is_warmup: false })
            }
          }
          notes.push(MID_DELOAD.note)
        } else if (hasOneRm) {
          const mp = movementBy.get(`${sourceWeek}:${exercise.movement_pattern}`)
          if (!mp || mp.top_set_pct_rm == null || (mp.top_set_reps == null && !mp.top_set_is_amrap)) continue
          const topPct = Math.min(mp.top_set_pct_rm + frequencyPctRmOffset(baseDays), 1)
          const rawRpe = mp.top_set_rpe ?? 9
          const topRpe = mp.phase === 'volume' ? Math.min(rawRpe, COMPOUND_VOLUME_PHASE_RPE_CEILING) : rawRpe
          sets.push({ target_pct_1rm: roundPct(topPct), target_weight_kg: null, target_reps: mp.top_set_reps ?? 1, target_rir: rpeToRir(topRpe) + rirBonus, is_warmup: false })

          const backoffCount = category.isSixPattern
            ? (mp.backoff_sets ?? 0) + (bonusMuscles.has(category.muscle) ? sixPatternDurationBonusSets(minutes) : 0)
            : setsForNonPatternCategory(minutes) - 1
          if (mp.backoff_pct_of_top != null && mp.backoff_reps) {
            for (let i = 0; i < backoffCount; i++) {
              sets.push({ target_pct_1rm: roundPct(topPct * mp.backoff_pct_of_top), target_weight_kg: null, target_reps: mp.backoff_reps, target_rir: rpeToRir(8) + rirBonus, is_warmup: false })
            }
          }
          const phaseNote = slotNotes(mp)
          if (phaseNote) notes.push(phaseNote)
          if (mp.top_set_is_amrap) notes.push('1セット目はできる限り多くの回数に挑戦')
        } else {
          const params = weeklyBy.get(`${sourceWeek}:${category.id}`)
          if (!params) continue
          const ramps = volumeRampsForCategory(category, minutes, priorities)
          const normalCount = ramps ? (params.working_sets ?? 0) : setsForNonPatternCategory(minutes)
          // 途中の回復週は、通常のセット数の約6割・RIR3（直前の週の回数の範囲を使う）
          const prevParams = isMidDeload ? weeklyBy.get(`${lastHardSourceWeek}:${category.id}`) ?? params : params
          const count = isMidDeload ? midSets(ramps ? (prevParams.working_sets ?? 0) : normalCount) : normalCount
          const rir = isMidDeload ? MID_DELOAD.rir : rpeToRir(ramps ? (params.rpe ?? 8) : effortRampTargetRpe(sourceWeek, phase, baseDays))
          const reps = (isMidDeload ? prevParams.rep_range_min : params.rep_range_min) ?? 10
          for (let i = 0; i < count; i++) {
            sets.push({ target_pct_1rm: null, target_weight_kg: null, target_reps: reps, target_rir: rir + rirBonus, is_warmup: false })
          }
          const phaseNote = isMidDeload ? MID_DELOAD.note : slotNotes(params)
          if (phaseNote) notes.push(phaseNote)
          const range = isMidDeload ? prevParams : params
          if (range.rep_range_min != null && range.rep_range_max != null) notes.push(`${range.rep_range_min}〜${range.rep_range_max}回の範囲で`)
        }

        if (sets.length === 0) continue
        generated.push({ exercise_master_id: exercise.id, trainer_exercise_id: null, note: notes.length > 0 ? notes.join(' ／ ') : null, sets })
      }
      out.push({ week, day, exercises: generated })
    }
  }
  return out
}
