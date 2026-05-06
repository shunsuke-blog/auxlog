/** トレーニング提案ロジックの定数 */
export const TRAINING = {
  /** 記録なし時の経過日数（初回扱い） */
  DAYS_SINCE_LAST_NEVER: 999,
  /** デフォルトの最低回復日数 */
  MIN_DAYS_BETWEEN_SESSIONS: 2,
  /** コンパウンド種目を限界まで行った場合の回復日数 */
  RECOVERY_DAYS_COMPOUND_FAILURE: 3,
  /** アイソレーション種目を限界まで行った場合の回復日数 */
  RECOVERY_DAYS_ISOLATION_FAILURE: 2,
  /** セット全体を通して余裕ありの場合の回復日数 */
  RECOVERY_DAYS_ALL_ROOM: 2,
  /** 週ボリュームの最低ライン（セット数）※固定値フォールバック用 */
  WEEKLY_VOLUME_LOW: 12,
  /** 週ボリュームの上限ライン（セット数）※固定値フォールバック用 */
  WEEKLY_VOLUME_HIGH: 16,
  /** ストール判定に使う直近セッション数 */
  STAGNATION_SESSION_COUNT: 3,
  /** ウォームアップ判定の閾値（最大重量に対する割合） */
  WARMUP_WEIGHT_RATIO: 0.8,
  /** 疲労度高の場合の重量削減率 */
  FATIGUE_WEIGHT_REDUCTION: 0.95,
  /** 自重種目で疲労度高の場合の回数削減率 */
  FATIGUE_REPS_REDUCTION: 0.8,
  /** コンパウンド種目のデフォルト重量増加量 (kg) */
  COMPOUND_WEIGHT_INCREMENT_KG: 5.0,
  /** アイソレーション種目のデフォルト重量増加量 (kg) */
  ISOLATION_WEIGHT_INCREMENT_KG: 2.0,
  /** 自重種目で余裕ありの場合の回数増加量 */
  BODYWEIGHT_REPS_INCREMENT: 2,
  /** 回数上限 = default_reps + このオフセット。到達時に重量UPへ切り替え */
  MAX_REPS_OFFSET: 5,
} as const

import type { TrainingLevel } from '@/types'

export const VOLUME_TARGETS: Record<TrainingLevel, { min: number; max: number }> = {
  beginner:     { min: 8,  max: 12 },
  intermediate: { min: 12, max: 16 },
  advanced:     { min: 16, max: 20 },
} as const
