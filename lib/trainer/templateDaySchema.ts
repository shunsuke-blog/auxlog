import { z } from 'zod'

// テンプレートの1日分の種目・セットの入力チェック（1日分の保存と、取り込んだメニューからの作成で共通）
const SetSchema = z.object({
  // 1RMに対する割合（0.75 = 75%）。kg指定・自動提案（両方null）と排他
  target_pct_1rm: z.number().gt(0).max(1.2).nullable(),
  target_weight_kg: z.number().min(0).max(999).nullable(),
  target_reps: z.number().int().min(1).max(100),
  target_rir: z.number().int().min(0).max(10).nullable(),
  is_warmup: z.boolean(),
}).refine(s => s.target_pct_1rm == null || s.target_weight_kg == null, '%とkgは同時に指定できません')

export const TemplateExerciseSchema = z.object({
  exercise_master_id: z.string().uuid().nullable(),
  trainer_exercise_id: z.string().uuid().nullable(),
  // 有酸素の一覧の種目（2026-10-26）。有酸素はセットの代わりに目標の時間（必須）・距離（任意）を持つ
  cardio_master_id: z.string().uuid().nullable().optional(),
  note: z.string().max(200).nullable(),
  target_duration_seconds: z.number().int().min(60).max(86400).nullable().optional(),
  target_distance_km: z.number().gt(0).max(1000).nullable().optional(),
  sets: z.array(SetSchema).max(20),
})
  .refine(e => [e.exercise_master_id, e.trainer_exercise_id, e.cardio_master_id].filter(v => v != null).length === 1, '種目を1つ指定してください')
  .refine(e => e.cardio_master_id == null || e.target_duration_seconds != null, '有酸素の種目には目標の時間を入れてください')
  .refine(e => e.target_duration_seconds == null || e.sets.length === 0, '有酸素の種目にはセットを入れられません')
  .refine(e => e.target_distance_km == null || e.target_duration_seconds != null, '距離は時間と一緒に入れてください')
