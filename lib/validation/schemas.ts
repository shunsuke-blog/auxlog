import { z } from 'zod'
import { TARGET_MUSCLE_LABELS, CARDIO_MUSCLE } from '@/types'

const SetSchema = z.object({
  exercise_id: z.string().uuid(),
  set_number: z.number().int().min(1).max(50),
  // DB の制約（training_sets_weight_range / reps_range、2026-10-25）と同じ範囲
  weight_kg: z.number().min(0).max(500),
  reps: z.number().int().min(0).max(200),
  rir: z.boolean(),
  is_warmup: z.boolean().optional().default(false),
  // コーチングモードの記録だけ。プランの種目と紐付ける（契約中のトレーニー本人かはDBのトリガーで検証）
  plan_exercise_id: z.string().uuid().nullable().optional(),
  // 有酸素運動の記録（2026-10-26）。時間は必須、距離・消費カロリーは任意。重量・回数は 0 で送る
  // （DB の制約 training_sets_cardio_shape・*_range と同じ）
  duration_seconds: z.number().int().min(1).max(86400).nullable().optional(),
  distance_km: z.number().gt(0).max(1000).nullable().optional(),
  calories_kcal: z.number().int().min(1).max(20000).nullable().optional(),
}).refine(
  s => s.duration_seconds != null
    ? s.weight_kg === 0 && s.reps === 0
    : s.distance_km == null && s.calories_kcal == null,
  { message: '有酸素運動の記録の形が正しくありません' }
)

export const CreateSessionSchema = z.object({
  trained_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付形式が不正です'),
  fatigue_level: z.number().int().min(1).max(5),
  memo: z.string().max(500).nullable().optional(),
  sets: z.array(SetSchema).min(1, 'セットが1つ以上必要です'),
  // クライアント側で「本来のweekStartより前」と判定してオーバーワーク警告を出した上で
  // 保存されたセッションかどうかのフラグ（UI表示用、集計ロジックには影響しない）
  is_early: z.boolean().optional().default(false),
  // 画面で作った記録のID（二重送信の防止、2026-10-25 レビュー対応 M2）。同じIDの再送は保存済みとして扱う
  client_id: z.string().uuid().optional(),
})

export const UpdateSessionSchema = z.object({
  trained_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付形式が不正です'),
  fatigue_level: z.number().int().min(1).max(5),
  memo: z.string().max(500).nullable().optional(),
  sets: z.array(SetSchema).min(1, 'セットが1つ以上必要です'),
})

// 自分で名前をつけた種目は、有酸素（cardio）も選べる
const TARGET_MUSCLES: [string, ...string[]] = [CARDIO_MUSCLE, ...Object.keys(TARGET_MUSCLE_LABELS)]

export const CreateExerciseSchema = z.object({
  exercise_master_id: z.string().uuid().nullable().optional(),
  // 有酸素の一覧（cardio_master）から追加する時
  cardio_master_id: z.string().uuid().nullable().optional(),
  custom_name: z.string().min(1).max(100).nullable().optional(),
  custom_target_muscle: z.enum(TARGET_MUSCLES).nullable().optional(),
  default_sets: z.number().int().min(1).max(20).optional(),
  default_reps: z.number().int().min(1).max(100).optional(),
  is_compound: z.boolean().optional().default(false),
}).refine(
  d => d.exercise_master_id != null || d.cardio_master_id != null || (d.custom_name != null && d.custom_name.length > 0),
  { message: 'exercise_master_id またはカスタム種目名が必要です' }
)

export const UpdateExerciseSchema = z.object({
  default_sets: z.number().int().min(1).max(20).optional(),
  default_reps: z.number().int().min(1).max(100).optional(),
  weight_increment_kg: z.number().min(0.5).max(50).optional(),
  sort_order: z.number().int().min(0).optional(),
})
