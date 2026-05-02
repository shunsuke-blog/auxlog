import { z } from 'zod'

const SetSchema = z.object({
  exercise_id: z.string().uuid(),
  set_number: z.number().int().min(1).max(50),
  weight_kg: z.number().min(0).max(999),
  reps: z.number().int().min(0).max(999),
  rir: z.boolean(),
  is_warmup: z.boolean().optional().default(false),
})

export const CreateSessionSchema = z.object({
  trained_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付形式が不正です'),
  fatigue_level: z.number().int().min(1).max(5),
  memo: z.string().max(500).nullable().optional(),
  sets: z.array(SetSchema).min(1, 'セットが1つ以上必要です'),
})

export const UpdateSessionSchema = z.object({
  trained_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付形式が不正です'),
  fatigue_level: z.number().int().min(1).max(5),
  memo: z.string().max(500).nullable().optional(),
  sets: z.array(SetSchema).min(1, 'セットが1つ以上必要です'),
})

const TARGET_MUSCLES = ['chest', 'back', 'legs', 'shoulders', 'arms'] as const

export const CreateExerciseSchema = z.object({
  exercise_master_id: z.string().uuid().nullable().optional(),
  custom_name: z.string().min(1).max(100).nullable().optional(),
  custom_target_muscle: z.enum(TARGET_MUSCLES).nullable().optional(),
  default_sets: z.number().int().min(1).max(20).optional(),
  default_reps: z.number().int().min(1).max(100).optional(),
}).refine(
  d => d.exercise_master_id != null || (d.custom_name != null && d.custom_name.length > 0),
  { message: 'exercise_master_id またはカスタム種目名が必要です' }
)

export const UpdateExerciseSchema = z.object({
  default_sets: z.number().int().min(1).max(20).optional(),
  default_reps: z.number().int().min(1).max(100).optional(),
  sort_order: z.number().int().min(0).optional(),
})
