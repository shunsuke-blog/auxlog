export type TargetMuscle =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms';

export const TARGET_MUSCLE_LABELS: Record<TargetMuscle, string> = {
  chest: '胸',
  back: '背中',
  legs: '脚',
  shoulders: '肩',
  arms: '腕',
};

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'canceled'
  | 'past_due';

export type VolumeStatus = 'low' | 'optimal' | 'high';

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
  sort_order: number;
  is_active: boolean;
  is_bodyweight: boolean;
  is_compound: boolean;
  created_at: string;
  name: string;
  target_muscle: TargetMuscle;
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

export type SetTarget = {
  set_number: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
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
};
