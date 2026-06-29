export type TargetMuscle =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'core';

export const TARGET_MUSCLE_LABELS: Record<TargetMuscle, string> = {
  chest: '胸',
  back: '背中',
  legs: '脚',
  shoulders: '肩',
  arms: '腕',
  core: '体幹',
};

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'canceled'
  | 'past_due';

export type VolumeStatus = 'low' | 'optimal' | 'high';

export type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';

export const TRAINING_LEVEL_LABELS: Record<TrainingLevel, string> = {
  beginner: '初級者',
  intermediate: '中級者',
  advanced: '上級者',
};

export type ExerciseMaster = {
  id: string;
  name: string;
  target_muscle: TargetMuscle;
  sort_order: number;
  is_bodyweight: boolean;
  is_compound: boolean;
  created_at: string;
};

export type UserExercise = {
  id: string;
  user_id: string;
  exercise_master_id: string | null;
  custom_name: string | null;
  custom_target_muscle: TargetMuscle | null;
  default_sets: number;
  default_reps: number;
  weight_increment_kg: number;
  sort_order: number;
  is_active: boolean;
  is_bodyweight: boolean;
  is_compound: boolean;
  created_at: string;
  name: string;
  target_muscle: TargetMuscle;
  recent_session_ids: string[];
};

export type TrainingSet = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  rir: boolean;
  is_warmup: boolean;
  created_at: string;
};

export type TrainingSession = {
  id: string;
  user_id: string;
  trained_at: string;
  fatigue_level: number;
  memo: string | null;
  created_at: string;
};

export type SessionWithSets = TrainingSession & {
  sets: TrainingSet[];
};

export type HistorySession = TrainingSession & {
  allIds: string[];
  sets: TrainingSet[];
  total_volume: number;
};

export type SetTarget = {
  set_number: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
};

// =====================================================================
// プログラムベース提案ロジック 型定義
// =====================================================================

export type ProgramPhase = 'volume' | 'intensity' | 'deload' | 'maxout';

export type OneRmSource = 'manual_input' | 'epley_estimated' | 'w9_amrap_estimation';

export type Program = {
  id: string;
  name: string;
  total_weeks: number;
  days_per_week: number;
  created_at: string;
};

export type ProgramSlot = {
  id: string;
  program_id: string;
  slot_id: string;
  day_number: number;
  muscle_group: string;
  is_compound: boolean;
  has_one_rm: boolean;
  priority: 1 | 2 | 3;
  sort_order: number;
};

export type ProgramWeeklyParams = {
  id: string;
  program_id: string;
  slot_id: string;
  week_number: number;
  // コンパウンド (%RM管理あり)
  top_set_pct_rm: number | null;
  top_set_reps: number | null;
  top_set_is_amrap: boolean;
  top_set_rpe: number | null;
  backoff_sets: number | null;
  backoff_pct_rm: number | null;
  backoff_reps: number | null;
  // アイソレーション / RPE管理
  working_sets: number | null;
  rep_range_min: number | null;
  rep_range_max: number | null;
  rpe: number | null;
  phase: ProgramPhase;
  is_excluded: boolean;
};

export type UserProgramEnrollment = {
  id: string;
  user_id: string;
  program_id: string;
  current_week: number;
  days_per_week: 2 | 3 | 4;
  session_duration_minutes: 60 | 75 | 90;
  started_at: string;
  completed_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type UserSlotAssignment = {
  id: string;
  user_id: string;
  enrollment_id: string;
  slot_id: string;
  exercise_id: string;
  created_at: string;
};

export type UserSlotOneRm = {
  id: string;
  user_id: string;
  slot_id: string;
  one_rm_kg: number;
  recorded_at: string;
  source: OneRmSource;
  created_at: string;
};

// 新エンジン出力型
export type SetSuggestion = {
  set_type: 'warmup' | 'top' | 'backoff' | 'working';
  suggested_weight_kg: number;
  target_reps: number | 'amrap';
  rep_range_min?: number;
  rep_range_max?: number;
  target_rpe: number;
};

export type SlotSuggestion = {
  slot_id: string;
  slot: ProgramSlot;
  exercise: UserExercise;
  sets: SetSuggestion[];
  notes?: string;
};

export type ProgramSuggestion = {
  week_number: number;
  phase: ProgramPhase;
  day_number: number;
  day_label: string;
  slots: SlotSuggestion[];
};

export type Suggestion = {
  exercise: UserExercise;
  proposed_sets: number;
  proposed_reps: number;        // トップセット（1セット目）の目標回数
  proposed_weight_kg: number;
  proposed_set_targets: SetTarget[]; // セットごとの目標回数（疲労考慮済み）
  reason: string;
  days_since_last: number;
  weekly_volume_sets: number;
  volume_status: VolumeStatus;
  prev_best_weight_kg: number;  // 前回ワーキングセット最大重量（初回は0）
  prev_best_reps: number;       // 前回最大重量での最高回数（初回は0）
  prev_volume: number;          // 前回ワーキングセット総負荷量（初回は0）
  prev_total_reps: number;      // 前回ワーキングセット総回数（自重種目の表示用、初回は0）
};
