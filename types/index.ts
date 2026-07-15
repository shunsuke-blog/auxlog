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

export const MUSCLE_ORDER: TargetMuscle[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];

/**
 * priority_musclesとして選択可能な部位。TargetMuscleと違い二頭・三頭を別に選べる
 * （program_composition.ts参照、program-composition-redesign-brainstorm.md #10）。
 */
export type PriorityMuscleOption = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'core';

export const PRIORITY_MUSCLE_OPTION_LABELS: Record<PriorityMuscleOption, string> = {
  chest: '胸',
  back: '背中',
  shoulders: '肩',
  biceps: '二頭',
  triceps: '三頭',
  legs: '脚',
  core: '体幹',
};

export const PRIORITY_MUSCLE_OPTION_ORDER: PriorityMuscleOption[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'];

/** priority枠は2つまで（program_composition.ts、canonical順位10・11）。 */
export const MAX_PRIORITY_MUSCLES = 2;

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'canceled'
  | 'past_due';

export type VolumeStatus = 'low' | 'optimal' | 'high';

export type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';

// アイソレーション／マシン種目の最終セットで使える強度テクニック。
// ~60tier（エフォート型漸進）でのみ発動候補になる。重いコンパウンド種目には付けない。
export type IntensityTechnique = 'rest_pause' | 'myo_reps' | 'none';

export const INTENSITY_TECHNIQUE_LABELS: Record<IntensityTechnique, string> = {
  rest_pause: 'レストポーズ',
  myo_reps: 'ミオレップ',
  none: '',
};

export type ExerciseMaster = {
  id: string;
  name: string;
  target_muscle: TargetMuscle;
  sort_order: number;
  is_bodyweight: boolean;
  is_compound: boolean;
  intensity_technique: IntensityTechnique;
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
  intensity_technique: IntensityTechnique;
  created_at: string;
  name: string;
  target_muscle: TargetMuscle;
  recent_session_ids: string[];
  /** この種目が1RM管理（%RMベースの重量計算）の対象かどうか。カテゴリ単位ではなく
   *  種目ごとの属性（例: 同じスクワットパターンでもハイバースクワットはtrue、
   *  ブルガリアンスクワットはfalse）。program_engine.tsのhasOneRm判定はこれが正。 */
  requires_one_rm: boolean;
  /** exercise_master.movement_pattern。requires_one_rm:trueの種目をmovement_pattern_weekly_params
   *  から引く際のキー。独自種目（custom_name）はmovement_patternの概念が無いためnull
   *  （その場合requires_one_rmも常にfalseなので、hasOneRm判定でこのフィールドが
   *  参照されることはない）。 */
  movement_pattern: string | null;
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

export type MovementPatternWeeklyParams = {
  id: string;
  program_id: string;
  movement_pattern: string;
  week_number: number;
  top_set_pct_rm: number | null;
  top_set_reps: number | null;
  top_set_is_amrap: boolean;
  top_set_rpe: number | null;
  backoff_sets: number | null;
  backoff_pct_rm: number | null;
  backoff_reps: number | null;
  phase: ProgramPhase;
};

export type UserProgramEnrollment = {
  id: string;
  user_id: string;
  program_id: string;
  current_week: number;
  days_per_week: 2 | 3 | 4;
  session_duration_minutes: 60 | 75 | 90;
  // ボリューム漸進の優先部位、かつ新方式(program_composition.ts)の種目選定でも使う。
  // 空配列 = 未選択（全身くまなく）。フォールバックは廃止済み（2026-07-08）。
  priority_muscles: PriorityMuscleOption[];
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
