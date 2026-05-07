# 詳細設計書 - 筋トレメニュー自動提案アプリ

## 1. システム構成

```
┌─────────────────────────────────────────┐
│             クライアント（ブラウザ）          │
│         Next.js 16 App Router            │
└───────────────┬─────────────────────────┘
                │ HTTPS
┌───────────────▼─────────────────────────┐
│           Next.js API Routes             │
│         （サーバーサイド処理）               │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│              Supabase                    │
│  ┌──────────┐  ┌──────────┐             │
│  │PostgreSQL│  │   Auth   │             │
│  └──────────┘  └──────────┘             │
└─────────────────────────────────────────┘
```

---

## 2. ディレクトリ構成

```
/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx          # ログイン画面
│   ├── (app)/
│   │   ├── layout.tsx            # 認証済みレイアウト（BottomNav含む）
│   │   ├── page.tsx              # ホーム（メニュー提案画面）サーバーコンポーネント
│   │   ├── loading.tsx           # ホームスケルトン
│   │   ├── record/
│   │   │   ├── page.tsx          # 記録入力画面（クライアントコンポーネント）
│   │   │   └── edit/
│   │   │       └── [sessionId]/
│   │   │           └── page.tsx  # 記録編集画面（クライアントコンポーネント）
│   │   ├── history/
│   │   │   └── page.tsx          # 履歴画面（サーバーコンポーネント → HistoryClient）
│   │   ├── exercises/
│   │   │   └── page.tsx          # 種目管理画面
│   │   └── settings/
│   │       ├── page.tsx                    # 設定画面
│   │       ├── LogoutButton.tsx            # ログアウトボタン（確認モーダル付き）
│   │       ├── CancelButton.tsx            # サブスク解約ボタン
│   │       └── subscription/
│   │           ├── page.tsx                # サブスクリプション管理画面
│   │           ├── ResumeButton.tsx        # 解約取り消しボタン
│   │           └── ChangeCardButton.tsx    # カード変更ボタン（Portal遷移）
│   ├── api/
│   │   ├── suggest/
│   │   │   └── route.ts          # メニュー提案API（GET）
│   │   ├── sessions/
│   │   │   ├── route.ts          # セッション記録API（GET/POST）
│   │   │   └── [sessionId]/
│   │   │       └── route.ts      # セッション個別API（GET/PATCH/DELETE）
│   │   ├── exercises/
│   │   │   ├── route.ts          # 種目管理API（GET/POST）
│   │   │   ├── [id]/
│   │   │   │   └── route.ts      # 種目個別API（PATCH/DELETE）
│   │   │   └── master/
│   │   │       └── route.ts      # 種目マスタ一覧API（GET）
│   │   ├── stripe/
│   │   │   ├── create-subscription/
│   │   │   │   └── route.ts      # トライアルサブスク作成API
│   │   │   ├── cancel-subscription/
│   │   │   │   └── route.ts      # サブスク解約API（period_end時に解約）
│   │   │   ├── resume-subscription/
│   │   │   │   └── route.ts      # 解約取り消しAPI
│   │   │   ├── reactivate-subscription/
│   │   │   │   └── route.ts      # 解約済みユーザーの再契約API
│   │   │   └── create-portal-session/
│   │   │       └── route.ts      # Stripe Customer Portal セッション作成API
│   │   ├── webhooks/
│   │   │   └── stripe/
│   │   │       └── route.ts      # Stripe Webhookエンドポイント
│   │   └── contact/
│   │       └── route.ts          # お問い合わせメール送信API（POST、Resend使用）
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts          # OAuth認証コールバック
│   ├── onboarding/
│   │   └── page.tsx              # 初回種目選択画面
│   ├── subscribe/
│   │   └── page.tsx              # ペイウォール・再契約ページ
│   ├── (app)/
│   │   └── contact/
│   │       └── page.tsx          # お問い合わせフォーム（カテゴリ・件名・本文）
│   └── layout.tsx                # ルートレイアウト
├── components/
│   ├── ui/                       # 汎用UIコンポーネント
│   │   ├── BottomNav.tsx         # ボトムナビゲーション
│   │   ├── CircleCheck.tsx       # 円形チェックボックス
│   │   └── Toast.tsx             # トースト通知
│   ├── home/
│   │   ├── HomeMenu.tsx          # ホーム画面クライアントコンポーネント（スワイプ・追加モーダル）
│   │   ├── ExerciseCard.tsx      # 種目提案カード
│   │   └── SwipeableExerciseCard.tsx  # スワイプ削除対応カード
│   ├── record/
│   │   ├── SetRow.tsx            # セット行（done/is_warmup/RIRトグル含む）
│   │   ├── RirToggle.tsx         # RIRトグル
│   │   └── FatigueSelector.tsx   # 疲労度選択
│   └── history/
│       ├── HistoryClient.tsx     # 履歴クライアントコンポーネント
│       ├── WeekCalendar.tsx      # 週次カレンダー
│       ├── MonthCalendar.tsx     # 月次カレンダーモーダル
│       ├── SessionList.tsx       # セッション一覧
│       └── VolumeChart.tsx       # 重量推移グラフ
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # クライアントサイドSupabase
│   │   └── server.ts             # サーバーサイドSupabase
│   ├── suggest/
│   │   └── engine.ts             # メニュー提案ロジック
│   ├── normalize/
│   │   └── exercises.ts          # 種目データ正規化ユーティリティ
│   ├── validation/
│   │   └── schemas.ts            # zodバリデーションスキーマ
│   ├── constants/
│   │   ├── training.ts           # トレーニング定数
│   │   └── swipe.ts              # スワイプUI定数
│   ├── utils/
│   │   └── date.ts               # ローカル日付ユーティリティ
│   ├── subscription.ts           # サブスクリプション状態チェック
│   └── sql/
│       ├── update_session_with_sets.sql  # セッション更新RPC関数
│       └── verify_rls.sql               # RLS検証クエリ
├── hooks/
│   └── useToast.ts               # Toastフック
├── middleware.ts                  # www.auxlog.com → auxlog.app リダイレクト
└── types/
    └── index.ts                  # 型定義
```

---

## 3. データベース詳細設計

### 3.1 テーブル定義

#### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'trialing',
  -- trialing / active / canceling / canceled / past_due
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  is_admin BOOLEAN DEFAULT false,   -- 管理者フラグ（請求スキップ、常にactive扱い）
  is_free BOOLEAN DEFAULT false,    -- 無料ユーザーフラグ（ベータ・招待ユーザー）
  free_until TIMESTAMPTZ DEFAULT NULL,  -- 無料期限（NULLは永久無料）
  training_level TEXT DEFAULT 'intermediate' CHECK (training_level IN ('beginner', 'intermediate', 'advanced')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### exercise_master（システム共通種目マスタ）
```sql
CREATE TABLE exercise_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_muscle TEXT NOT NULL,
  -- chest / back / legs / shoulders / arms
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_bodyweight BOOLEAN DEFAULT false,  -- 自重種目フラグ
  is_compound BOOLEAN DEFAULT false,    -- コンパウンド種目フラグ（回復日数計算に使用）
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### user_exercises（ユーザーが選んだ種目）
```sql
CREATE TABLE user_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_master_id UUID REFERENCES exercise_master(id),
  -- NULLの場合は独自種目
  custom_name TEXT,
  custom_target_muscle TEXT,
  default_sets INTEGER NOT NULL DEFAULT 3,
  default_reps INTEGER NOT NULL DEFAULT 8,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_bodyweight BOOLEAN DEFAULT false,  -- 独自種目の自重フラグ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT exercise_name_check CHECK (
    exercise_master_id IS NOT NULL OR custom_name IS NOT NULL
  )
);
```

#### training_sessions（セッション）
```sql
CREATE TABLE training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trained_at DATE NOT NULL,
  fatigue_level INTEGER NOT NULL CHECK (fatigue_level BETWEEN 1 AND 5),
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### training_sets（セット記録）
```sql
CREATE TABLE training_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES user_exercises(id),
  set_number INTEGER NOT NULL,
  weight_kg DECIMAL(5,2) NOT NULL,
  reps INTEGER NOT NULL,
  rir BOOLEAN NOT NULL DEFAULT false,
  -- true: 余裕あり（RIR2以上） / false: 限界（RIR0〜1）
  is_warmup BOOLEAN NOT NULL DEFAULT false,
  -- true: ウォームアップセット / false: ワーキングセット
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 RPC関数

#### update_session_with_sets（セッションとセットのアトミック更新）
```sql
CREATE OR REPLACE FUNCTION update_session_with_sets(
  p_session_id UUID,
  p_user_id UUID,
  p_trained_at DATE,
  p_fatigue_level INTEGER,
  p_memo TEXT,
  p_sets JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 所有権確認（RLSのバックアップ）
  IF NOT EXISTS (
    SELECT 1 FROM training_sessions WHERE id = p_session_id AND user_id = p_user_id
  ) THEN RETURN FALSE; END IF;

  UPDATE training_sessions
  SET trained_at = p_trained_at, fatigue_level = p_fatigue_level, memo = p_memo
  WHERE id = p_session_id AND user_id = p_user_id;

  DELETE FROM training_sets WHERE session_id = p_session_id;

  INSERT INTO training_sets (session_id, exercise_id, set_number, weight_kg, reps, rir, is_warmup)
  SELECT
    p_session_id,
    (s->>'exercise_id')::UUID,
    (s->>'set_number')::INTEGER,
    (s->>'weight_kg')::DECIMAL,
    (s->>'reps')::INTEGER,
    (s->>'rir')::BOOLEAN,
    COALESCE((s->>'is_warmup')::BOOLEAN, FALSE)
  FROM jsonb_array_elements(p_sets) s;

  RETURN TRUE;
END; $$;
```

APIはRPCを優先し、未設定の場合は3ステップ更新にフォールバックする。

### 3.3 RLSポリシー

```sql
-- exercise_master（全ユーザーが読み取り可能）
ALTER TABLE exercise_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exercise_master is readable by all"
  ON exercise_master FOR SELECT USING (true);

-- user_exercises
ALTER TABLE user_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can only access own exercises"
  ON user_exercises FOR ALL USING (auth.uid() = user_id);

-- training_sessions
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can only access own sessions"
  ON training_sessions FOR ALL USING (auth.uid() = user_id);

-- training_sets
ALTER TABLE training_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can only access own sets"
  ON training_sets FOR ALL USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE user_id = auth.uid()
    )
  );
```

### 3.4 インデックス

```sql
CREATE INDEX idx_training_sessions_user_trained
  ON training_sessions(user_id, trained_at DESC);
CREATE INDEX idx_training_sets_session
  ON training_sets(session_id);
CREATE INDEX idx_training_sets_exercise
  ON training_sets(exercise_id);
CREATE INDEX idx_user_exercises_user
  ON user_exercises(user_id, sort_order);
```

---

## 4. API設計

### 4.1 メニュー提案API

**GET /api/suggest**

リクエスト：なし（認証済みユーザーのIDから自動取得）

レスポンス：
```typescript
{
  suggestions: [
    {
      exercise: UserExercise;
      proposed_sets: number;
      proposed_reps: number;
      proposed_weight_kg: number;
      proposed_set_targets: SetTarget[];  // セットごとの詳細目標
      reason: string;
      days_since_last: number;
      weekly_volume_sets: number;
      volume_status: 'low' | 'optimal' | 'high';
    }
  ];
  warnings: string[];
}
```

### 4.2 セッション記録API

**POST /api/sessions**（zodバリデーションあり）

リクエスト：
```typescript
{
  trained_at: string;       // YYYY-MM-DD
  fatigue_level: number;    // 1-5
  memo?: string | null;
  sets: [
    {
      exercise_id: string;
      set_number: number;
      weight_kg: number;
      reps: number;
      rir: boolean;         // true: 余裕あり / false: 限界
      is_warmup?: boolean;  // デフォルトfalse
    }
  ];
}
```

レスポンス：
```typescript
{
  session_id: string;
  created_at: string;
}
```

**GET /api/sessions**

クエリパラメータ：
- `limit`: 取得件数（デフォルト20、サーバー側で最大100に強制）
- `offset`: オフセット

レスポンス：
```typescript
{
  sessions: [
    {
      id: string;
      trained_at: string;
      fatigue_level: number;
      memo: string | null;
      total_volume: number;
      sets: TrainingSet[];  // is_warmupフィールド含む
    }
  ];
  total: number;
}
```

**GET /api/sessions/[sessionId]**

レスポンス：
```typescript
{
  session: {
    ...TrainingSession,
    training_sets: (TrainingSet & {
      user_exercises: {
        id: string;
        custom_name: string | null;
        is_bodyweight: boolean;
        exercise_master: { name: string; is_bodyweight: boolean } | null;
      }
    })[]
  }
}
```

**PATCH /api/sessions/[sessionId]**（zodバリデーションあり）

リクエスト：POST /api/sessions と同形式

**DELETE /api/sessions/[sessionId]**

レスポンス：`{ success: true }`

### 4.3 種目管理API

**GET /api/exercises** - 種目一覧取得

**POST /api/exercises**（zodバリデーションあり）
```typescript
{
  exercise_master_id?: string | null;
  custom_name?: string | null;
  custom_target_muscle?: TargetMuscle | null;
  default_sets?: number;
  default_reps?: number;
}
```

**PATCH /api/exercises/[id]**（zodバリデーションあり）
```typescript
{
  default_sets?: number;
  default_reps?: number;
  sort_order?: number;
}
```

**DELETE /api/exercises/[id]** - 論理削除（`is_active=false`）

**GET /api/exercises/master** - システム種目マスタ一覧

---

## 5. メニュー提案ロジック詳細（engine.ts）

### 5.1 設計方針

| 項目 | 方針 |
|---|---|
| 基準重量 | 全ワーキングセット中の最大重量（ウォームアップを除外） |
| セット数カウント | 最大重量の80%以上のセット（`TRAINING.WARMUP_WEIGHT_RATIO = 0.8`） |
| RIR・レップ判定 | トップセット（最大重量のセット）のみ |
| 提案回数の基準 | 前回実績の最高回数（`bestTopReps`） |
| ストール判定 | レップ達成済みの場合のみ適用 |
| 回復日数 | 種目タイプ×前回RIRで算出（`calcMinRecoveryDays`） |
| セット重量パターン | 前回のパターンを引き継ぐ（ピラミッド対応） |
| 疲労モデル | セット数が変わる場合: 1セットごとに1回減少 |

### 5.2 定数（lib/constants/training.ts）

```typescript
export const VOLUME_TARGETS = {
  beginner:     { min: 8,  max: 12 },
  intermediate: { min: 12, max: 16 },
  advanced:     { min: 16, max: 20 },
} as const

export const TRAINING = {
  DAYS_SINCE_LAST_NEVER: 999,              // 記録なし時の経過日数（初回扱い）
  MIN_DAYS_BETWEEN_SESSIONS: 2,            // デフォルト最低回復日数
  RECOVERY_DAYS_COMPOUND_FAILURE: 3,       // コンパウンド + 限界セットあり → 3日
  RECOVERY_DAYS_ISOLATION_FAILURE: 2,      // アイソレーション + 限界セットあり → 2日
  RECOVERY_DAYS_ALL_ROOM: 2,               // 全セット余裕あり → 2日
  WEEKLY_VOLUME_LOW: 12,                   // 週ボリューム最低ライン（セット数）
  WEEKLY_VOLUME_HIGH: 16,                  // 週ボリューム上限ライン（セット数）
  STAGNATION_SESSION_COUNT: 3,             // ストール判定に使う直近セッション数
  WARMUP_WEIGHT_RATIO: 0.8,                // ウォームアップ判定閾値
  FATIGUE_WEIGHT_REDUCTION: 0.95,          // 疲労時の重量削減率
  FATIGUE_REPS_REDUCTION: 0.8,             // 自重・疲労時の回数削減率
  COMPOUND_WEIGHT_INCREMENT_KG: 5.0,       // コンパウンド種目のデフォルト重量増加量 (kg)
  ISOLATION_WEIGHT_INCREMENT_KG: 2.0,      // アイソレーション種目のデフォルト重量増加量 (kg)
  BODYWEIGHT_REPS_INCREMENT: 2,            // 自重種目の余裕あり時回数増加量
  MAX_REPS_OFFSET: 5,                      // 回数上限 = default_reps + この値。到達時に重量UPへ切り替え
}
```

### 5.3 判定フロー

```
入力: exercises, recentSessions, todayDate, trainingLevel

0. 種目ごとに回復日数チェック（calcMinRecoveryDays）→ 未満なら提案リストから除外
   - コンパウンド + 限界セットあり → 3日
   - アイソレーション + 限界セットあり → 2日
   - 全ワーキングセット余裕あり → 2日
   - 前回記録なし（初回） → 常に提案
   提案リストを経過日数の降順でソート

入力: lastSets（前回セット一覧）, exercise, lastFatigue, isStagnant

1. lastSets が空 → 初回提案（ウォームアップ1セット + default_sets × default_reps の直線セット）
   ウォームアップセットを先頭に含めることで、ユーザーがウォームアップ機能を発見できるようにする

2. ウォームアップ/ワーキング分離（is_warmup フラグで分類）
   effectiveSets = workingSets が存在する場合は workingSets、ない場合は全セット

3. 基礎値を算出
   topWeight        = max(effectiveSets の重量)
   topSets          = topWeight と同じ重量のセット
   bestTopReps      = max(topSets の回数)
   allTopSetsHadRoom = topSets.every(rir === true)
   reachedTarget    = bestTopReps >= default_reps

4. 疲労度 >= 4（isHighFatigue）
   → 自重: reps = bestTopReps × 0.8（20%減）
   → 有酸素: weight = topWeight × 0.95（weight_increment_kgで丸め）, reps = bestTopReps

5. bestTopReps >= default_reps + MAX_REPS_OFFSET かつ is_bodyweight = false（回数上限到達）
   → 推定1RM = topWeight × (1 + 0.025 × bestTopReps)（Epley式）
   → newWeight = topWeight + weight_increment_kg
   → targetReps = max(floor((estimated1RM / newWeight - 1) / 0.025), default_reps)
   ※ 1RMから次重量での達成可能回数を逆算して回数リセット

6. reachedTarget = false（レップ未達）
   → weight 維持, reps = min(bestTopReps + 1, default_reps)
   ※ ストール判定は適用しない

7. allTopSetsHadRoom = true（全トップセット余裕あり）かつ reachedTarget
   → 自重: reps = bestTopReps + BODYWEIGHT_REPS_INCREMENT（+2）
   → 有酸素: weight + weight_increment_kg, reps = default_reps（新重量でリセット）

8. isStagnant = true（直近3セッション重量・回数ともに同一・レップ達成時のみ）
   → weight 維持, reps = bestTopReps + 1

9. ギリギリ達成（余裕なし・レップ達成）
   → weight 維持, sets 維持, reps = bestTopReps
```

### 5.4 ヘルパー関数

| 関数 | 役割 |
|---|---|
| `calcMinRecoveryDays(exercise, lastWorkingSets)` | 種目タイプ × 前回RIRから最低回復日数を算出 |
| `isHighFatigue(fatigue)` | 疲労度 >= 4 の判定 |
| `separateSets(sets)` | ウォームアップとワーキングセットを分離 |
| `getTopSetMetrics(workingSets)` | トップセットの重量・回数・RIRを算出 |
| `generateWorkingSetTargets(...)` | ワーキングセットの目標を生成（前回パターン引き継ぎ or 疲労モデル） |
| `buildWarmupTargets(warmupSets)` | ウォームアップセットは前回の重量・回数を維持 |
| `calcWeeklyVolumeSets(exercise, sessions, today)` | 過去7日間のワーキングセット数を集計 |
| `checkStagnation(exerciseId, sessions)` | 直近3セッションの最大重量が同一か判定 |
| `getVolumeStatus(weeklySets, level)` | 週セット数とレベルから low/optimal/high を返す |

### 5.5 SetTarget 型（提案セット詳細）

```typescript
export type SetTarget = {
  set_number: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
}
```

### 5.6 ストール（停滞）判定

直近3セッションのトップセット最大重量 **および** 最高回数がすべて同一の場合に `isStagnant = true` とする。
重量のみ同一・回数が伸びている場合はストールとみなさない（漸進継続中のため）。
また `proposeNextSet` 内でレップ未達の場合は適用しない（未達は漸進中のため）。

### 5.7 週ボリューム状態

| 状態 | 条件 | 表示 |
|---|---|---|
| `low` | 週セット数 < 10 | ボリューム不足インジケーター |
| `optimal` | 10 ≤ 週セット数 ≤ 20 | 表示なし |
| `high` | 週セット数 > 20 | オーバートレーニング注意インジケーター |

ウォームアップセットは週ボリューム集計から除外する。

---

## 6. コンポーネント設計

### 6.1 ホーム画面

**app/(app)/page.tsx**（サーバーコンポーネント）
- SSRで提案データを取得
- `normalizeExercises` で種目データを正規化
- 種目未登録時は `/onboarding` にリダイレクト
- `HomeMenu` クライアントコンポーネントに渡す

**HomeMenu.tsx**（クライアントコンポーネント）
- スワイプ削除状態を sessionStorage で管理（当日のみ有効）
- 「+」ボタンで非表示種目や全種目から追加モーダルを表示
- `SwipeableExerciseCard` を種目ごとにレンダリング

**SwipeableExerciseCard.tsx**
- スワイプ左で削除ボタンを表示（`SWIPE.REVEAL_WIDTH = 72px`）
- `SWIPE.DELETE_THRESHOLD = 140px` 以上で即時削除
- `SWIPE.SNAP_THRESHOLD = 36px` 以上でスナップ表示

### 6.2 記録入力画面（app/(app)/record/page.tsx）

- クライアントコンポーネント（`Suspense` ラップ）
- URLパラメータ `?exerciseId=[id]` で特定種目のみ表示
- `todayLocalDate()` でローカル日付を初期値とした日付変更UI
- `done: boolean` フラグで実施済みセットのみ保存
- 自重種目は `isBodyweight` フラグで加重をオプション表示

**SetRow の SetData 型**
```typescript
export type SetData = {
  set_number: number;
  weight_kg: string;     // 文字列（入力フォーム用）
  reps: string;          // 文字列（入力フォーム用）
  rir: boolean;          // true: 余裕あり / false: 限界
  is_warmup: boolean;    // ウォームアップフラグ
  done: boolean;         // 実施フラグ（ONのセットのみ保存）
}
```

### 6.3 記録編集画面（app/(app)/record/edit/[sessionId]/page.tsx）

- `?exerciseId=[id]` クエリで種目を絞り込み表示（個別編集モード）
- 全体編集モードでは CircleCheck で各種目の有効/無効を切り替え可能
- 全体編集モードでは「種目を追加」モーダルを表示可能
- `?merge=id1,id2` クエリで複数セッションを統合編集（保存時に余分なセッションを削除）
- 個別編集モードでは対象外種目のセットを `preservedSets` に保持し保存時に再結合
- セッション削除ボタン（Trash2アイコン、確認なし）
- `PATCH /api/sessions/[sessionId]` で保存（RPC優先）
- `DELETE /api/sessions/[sessionId]` で削除

### 6.4 履歴画面

**app/(app)/history/page.tsx**（サーバーコンポーネント）
- SSRでセッション60件・種目を並行取得
- `normalizeExercises` で正規化後に `HistoryClient` に渡す

**HistoryClient.tsx**（クライアントコンポーネント）
- `selectedDate` で表示セッションを絞り込み（初期値: 今日）
- `WeekCalendar` で週内の日付を選択
- `MonthCalendar` モーダルで遠い日付に移動
- `VolumeChart` は `dynamic` で遅延ロード（SSR無効）

**SessionList.tsx**
- 種目ごとに展開/折り畳み（`ChevronDown` トグル）
- 同一日に複数セッションがある場合は `allIds` で管理し `?merge=id1,id2` クエリで全体編集へ遷移
- 編集ボタン（Pencil）→ セッション全体編集
- 種目ごとの編集ボタン（PenLine）→ `?exerciseId=[id]` クエリ付きで遷移
- ウォームアップセットのRIR表示は `—`（ダッシュ）で非表示
- 自重種目の表示: ウォームアップ除外の合計回数
- 有酸素種目: ボリューム（重量×回数）を kg で表示

**VolumeChart.tsx**
- メトリクス切り替え: 最大重量 / 総挙上量 / 推定1RM（Epley式: `weight × (1 + reps / 30)`）
- 自重種目は回数推移のみ表示（メトリクス切り替えUI非表示）
- 種目切り替えはカスタムアイコン（`ChevronsUpDown`）付き `select` で表示
- ダークモード対応: `matchMedia` で `isDark` を検知してグラフ色を切り替え

---

## 7. 型定義（types/index.ts）

```typescript
export type TargetMuscle = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms';

export const TARGET_MUSCLE_LABELS: Record<TargetMuscle, string> = {
  chest: '胸', back: '背中', legs: '脚', shoulders: '肩', arms: '腕',
};

export type SubscriptionStatus = 'trialing' | 'active' | 'canceled' | 'past_due';
export type VolumeStatus = 'low' | 'optimal' | 'high';

export type ExerciseMaster = {
  id: string;
  name: string;
  target_muscle: TargetMuscle;
  sort_order: number;
  is_bodyweight: boolean;
  is_compound: boolean;    // コンパウンド種目フラグ
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
  is_compound: boolean;    // exercise_master から正規化
  created_at: string;
  name: string;            // JOINして正規化
  target_muscle: TargetMuscle;  // JOINして正規化
};

export type TrainingSet = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  rir: boolean;            // true: 余裕あり / false: 限界
  is_warmup: boolean;      // true: ウォームアップ
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
  proposed_reps: number;          // トップセット（1セット目）の目標回数
  proposed_weight_kg: number;
  proposed_set_targets: SetTarget[];  // セットごとの目標（疲労考慮済み）
  reason: string;
  days_since_last: number;
  weekly_volume_sets: number;
  volume_status: VolumeStatus;
};
```

---

## 8. バリデーション設計（lib/validation/schemas.ts）

zod を使用して全APIのリクエストボディを検証する。

```typescript
// セット共通スキーマ
SetSchema = {
  exercise_id: uuid,
  set_number: int(1-50),
  weight_kg: number(0-999),
  reps: int(0-999),
  rir: boolean,
  is_warmup: boolean (デフォルトfalse),
}

CreateSessionSchema = {
  trained_at: "YYYY-MM-DD" 形式,
  fatigue_level: int(1-5),
  memo: string(max500) | null | optional,
  sets: SetSchema[] (min1),
}

UpdateSessionSchema = CreateSessionSchema と同形式

CreateExerciseSchema = {
  exercise_master_id: uuid | null | optional,
  custom_name: string(1-100) | null | optional,
  custom_target_muscle: TargetMuscle | null | optional,
  default_sets: int(1-20) | optional,
  default_reps: int(1-100) | optional,
  // refinement: exercise_master_id OR custom_name が必須
}

UpdateExerciseSchema = {
  default_sets: int(1-20) | optional,
  default_reps: int(1-100) | optional,
  sort_order: int(0+) | optional,
}
```

---

## 9. 種目正規化（lib/normalize/exercises.ts）

Supabase の JOIN クエリ結果を `UserExercise` 型に変換する処理を一元化。
4箇所に散在していた正規化ロジックをこのモジュールに集約。

```typescript
export function normalizeExercise(e: RawUserExercise): UserExercise
export function normalizeExercises(rows: RawUserExercise[]): UserExercise[]
```

- `custom_name` があればカスタム種目、なければ `exercise_master` から取得
- `is_bodyweight` はカスタム種目なら `user_exercises` から、マスタ種目なら `exercise_master` から取得
- `is_compound` は `exercise_master.is_compound` から取得（カスタム種目はデフォルト `false`）
- 不正な筋群値は `'chest'` にフォールバック（DB不整合対策）

---

## 10. 環境変数

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
RESEND_API_KEY=          # お問い合わせメール送信（Resend）
```

---

## 11. Stripe連携設計

### 11.1 トライアル開始フロー
1. Google認証でサインアップ
2. `users` テーブルにレコード作成（`subscription_status: null`）
3. `POST /api/stripe/create-subscription` を呼び出し
   - Stripe Customerを作成（`stripe_customer_id` を保存）
   - `trial_period_days: 30`、`payment_behavior: 'default_incomplete'` でサブスク作成
   - `subscription_status: 'trialing'`、`trial_ends_at` を保存
4. トライアル期間中（30日）は全機能利用可能・カード登録不要

### 11.2 解約フロー
- `POST /api/stripe/cancel-subscription` → `cancel_at_period_end: true` に設定
- `subscription_status: 'canceling'`、`trial_ends_at: current_period_end` に更新
- `canceling` 中は `trial_ends_at` まで全機能利用可能

### 11.3 解約取り消しフロー
- `POST /api/stripe/resume-subscription` → `cancel_at_period_end: false` に戻す
- `subscription_status: 'trialing'` に更新（または `'active'`）

### 11.4 再契約フロー（canceled ユーザー）
1. `/subscribe?reason=canceled` ページを表示
2. 「カードを登録して再開する」→ `POST /api/stripe/create-portal-session?returnPath=/subscribe?step=activate`
3. Stripe Customer Portalでカード登録
4. Portal完了後 `/subscribe?step=activate` にリダイレクト
5. `POST /api/stripe/reactivate-subscription` → トライアルなし新規サブスク作成
6. `subscription_status: 'active'` に更新 → ホームへリダイレクト

### 11.5 カード変更フロー
- `POST /api/stripe/create-portal-session` → Stripe Customer Portalへリダイレクト
- Portalでカード情報変更、`returnPath` に指定したパスへ戻る

### 11.6 Webhookエンドポイント
**POST /api/webhooks/stripe**（署名検証あり）

| イベント | 処理 |
|---------|------|
| `customer.subscription.created` | status/trial_ends_at を同期 |
| `customer.subscription.updated` | status/trial_ends_at を同期 |
| `customer.subscription.deleted` | `status: 'canceled'` に更新 |
| `customer.subscription.trial_will_end` | （通知のみ、Stripeが自動でメール送信） |
| `invoice.payment_failed` | `status: 'past_due'` に更新 |

### 11.7 アクセス制御（app/(app)/layout.tsx）
- `is_admin = true` → チェックスキップ、常にアクセス許可
- `is_free = true` かつ `free_until = NULL または未来` → チェックスキップ、全機能許可
- `is_free = true` かつ `free_until` が過去 → 通常のサブスクチェックへ
- `status = null` → 新規ユーザー、`create-subscription` を呼んでトライアル開始
- `status = 'trialing' | 'canceling'` → `trial_ends_at` が未来なら許可
- `status = 'active'` → 許可
- `status = 'canceled' | 'past_due'` → `/subscribe?reason=...` にリダイレクト
- トライアル期限切れ → `/subscribe?reason=trial_ended` にリダイレクト

### 11.8 サブスクリプション状態の表示（settings/subscription/page.tsx）
- Stripe API（サーバーサイド）からカード情報・次回請求日を取得
- `active` 状態のみ次回更新日を表示
- `is_admin` の場合はステータスに「（管理者）」を付記、課金操作ボタンを非表示

---

## 12. デザインシステム

### 12.1 カラー（globals.css）

```css
:root {
  --background: #ffffff;
  --foreground: #000000;
  --my-accent: #B8CC00;   /* ライトモードアクセント */
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0A0A0A;
    --foreground: #ffffff;
    --my-accent: #E8FF00;           /* ダークモードアクセント */
    --color-zinc-950: #141414;      /* カード背景 */
    --color-zinc-900: #1A1A1A;      /* セカンダリ背景 */
    --color-zinc-800: #222222;      /* ボーダー */
  }
}
```

### 12.2 共通スタイルパターン

| 要素 | クラス |
|------|--------|
| ページ背景 | `bg-white dark:bg-black` |
| カード | `bg-white dark:bg-zinc-950 rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)]` |
| 固定ヘッダー | `sticky top-0 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b ... py-5` |
| プライマリボタン | `bg-black dark:bg-white text-white dark:text-black rounded-xl py-4 font-semibold` |
| アクセントバッジ | `text-accent bg-accent/10 rounded-full` |
| アクセントボーダー | `border-accent` |

### 12.3 ルーティング

| ミドルウェア | 処理 |
|------------|------|
| `www.auxlog.com/*` → `auxlog.app/*` | 308 Permanent Redirect（middleware.ts） |
| `NEXT_PUBLIC_APP_URL=https://auxlog.app` | OAuth コールバックURLに使用 |

---

## 13. エラーハンドリング方針

| エラー種別 | 対応 |
|-----------|------|
| 認証エラー | ログイン画面にリダイレクト |
| APIエラー（5xx） | Toastで「保存に失敗しました。再試行してください」|
| zodバリデーションエラー | 400を返し、最初のエラーメッセージを `{ error: string }` で返却 |
| 種目未登録 | 「まずは種目を登録してください」の案内表示 |
| セッション保存: 実施セット0件 | 「実施済みのセットがありません」をインラインで表示 |

APIのエラーメッセージは汎用化し、内部情報（DBエラー詳細等）を漏洩しない。

---

## 14. パフォーマンス方針

- ホーム画面の提案データはサーバーコンポーネントでSSR（初回表示を高速化）
- 履歴画面もサーバーコンポーネントで初期データ取得、インタラクションはクライアント
- `VolumeChart` は `dynamic` で遅延ロード（グラフライブラリのバンドルサイズ対策）
- グラフはrecharts使用
- 画像なし（アイコンはlucide-react）
- PWA対応: `viewport-fit: cover`、`env(safe-area-inset-bottom)` でiOSノッチ対応
