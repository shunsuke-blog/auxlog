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
  /** 週ボリュームの最低ライン（セット数） */
  WEEKLY_VOLUME_LOW: 10,
  /** 週ボリュームの上限ライン（セット数） */
  WEEKLY_VOLUME_HIGH: 20,
  /** ストール判定に使う直近セッション数 */
  STAGNATION_SESSION_COUNT: 3,
  /** ウォームアップ判定の閾値（最大重量に対する割合） */
  WARMUP_WEIGHT_RATIO: 0.8,
  /** 疲労度高の場合の重量削減率 */
  FATIGUE_WEIGHT_REDUCTION: 0.95,
  /** 自重種目で疲労度高の場合の回数削減率 */
  FATIGUE_REPS_REDUCTION: 0.8,
  /** 有酸素種目のプログレッシブオーバーロード重量増加量 (kg) */
  WEIGHT_INCREMENT_KG: 2.5,
  /** 自重種目で余裕ありの場合の回数増加量 */
  BODYWEIGHT_REPS_INCREMENT: 2,
} as const
