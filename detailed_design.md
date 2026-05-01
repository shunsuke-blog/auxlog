# 詳細設計書 - 筋トレメニュー自動提案アプリ

## 1. システム構成

```
┌─────────────────────────────────────────┐
│             クライアント（ブラウザ）          │
│         Next.js 14 App Router            │
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
src/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx          # ログイン画面
│   ├── (app)/
│   │   ├── layout.tsx            # 認証済みレイアウト（BottomNav含む）
│   │   ├── page.tsx              # ホーム（メニュー提案画面）
│   │   ├── record/
│   │   │   └── page.tsx          # 記録入力画面
│   │   ├── history/
│   │   │   └── page.tsx          # 履歴画面
│   │   ├── exercises/
│   │   │   └── page.tsx          # 種目管理画面
│   │   └── settings/
│   │       └── page.tsx          # 設定画面
│   ├── api/
│   │   ├── suggest/
│   │   │   └── route.ts          # メニュー提案API
│   │   ├── sessions/
│   │   │   └── route.ts          # セッション記録API
│   │   └── exercises/
│   │       └── route.ts          # 種目管理API
│   └── layout.tsx                # ルートレイアウト
├── components/
│   ├── ui/                       # 汎用UIコンポーネント
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   └── BottomNav.tsx
│   ├── home/
│   │   ├── TodayMenu.tsx         # 今日のメニュー表示
│   │   └── ExerciseCard.tsx      # 種目カード
│   ├── record/
│   │   ├── RecordForm.tsx        # 記録入力フォーム
│   │   ├── SetRow.tsx            # セット行
│   │   └── FatigueSelector.tsx   # 疲労度選択
│   └── history/
│       ├── VolumeChart.tsx       # ボリューム推移グラフ
│       └── SessionList.tsx       # セッション一覧
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # クライアントサイドSupabase
│   │   └── server.ts             # サーバーサイドSupabase
│   ├── suggest/
│   │   └── engine.ts             # メニュー提案ロジック
│   └── utils.ts                  # 汎用ユーティリティ
├── hooks/
│   ├── useExercises.ts           # 種目データフック
│   ├── useSessions.ts            # セッションデータフック
│   └── useSuggest.ts             # 提案データフック
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
  -- trialing / active / canceled / past_due
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初期データ
INSERT INTO exercise_master (name, target_muscle, sort_order) VALUES
  ('ベンチプレス', 'chest', 1),
  ('インクラインベンチプレス', 'chest', 2),
  ('ダンベルフライ', 'chest', 3),
  ('スクワット', 'legs', 4),
  ('レッグプレス', 'legs', 5),
  ('ルーマニアンデッドリフト', 'legs', 6),
  ('デッドリフト', 'back', 7),
  ('チンアップ', 'back', 8),
  ('ラットプルダウン', 'back', 9),
  ('ベントオーバーロウ', 'back', 10),
  ('オーバーヘッドプレス', 'shoulders', 11),
  ('サイドレイズ', 'shoulders', 12),
  ('バーベルカール', 'arms', 13),
  ('トライセプスプレスダウン', 'arms', 14);
```

#### user_exercises（ユーザーが選んだ種目）
```sql
CREATE TABLE user_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_master_id UUID REFERENCES exercise_master(id),
  -- NULLの場合は独自種目
  custom_name TEXT,
  -- exercise_master_idがNULLの場合に使用
  custom_target_muscle TEXT,
  -- exercise_master_idがNULLの場合に使用
  default_sets INTEGER NOT NULL DEFAULT 3,
  default_reps INTEGER NOT NULL DEFAULT 8,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
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
  rir BOOLEAN NOT NULL DEFAULT true,
  -- true: 余裕あり（RIR2以上） / false: 限界（RIR0〜1）
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 RLSポリシー

```sql
-- exercise_master（全ユーザーが読み取り可能）
ALTER TABLE exercise_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exercise_master is readable by all"
  ON exercise_master FOR SELECT
  USING (true);

-- user_exercises
ALTER TABLE user_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can only access own exercises"
  ON user_exercises FOR ALL
  USING (auth.uid() = user_id);

-- training_sessions
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can only access own sessions"
  ON training_sessions FOR ALL
  USING (auth.uid() = user_id);

-- training_sets
ALTER TABLE training_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can only access own sets"
  ON training_sets FOR ALL
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE user_id = auth.uid()
    )
  );
```

### 3.3 インデックス

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
      exercise: {
        id: string;
        name: string;
        target_muscle: string;
      };
      proposed_sets: number;
      proposed_reps: number;
      proposed_weight_kg: number;
      reason: string; // 提案理由（例：「前回から5日経過」「前回全セットRIR4以上」）
      days_since_last: number;
      weekly_volume_sets: number; // 今週の当該筋群セット数
      volume_status: 'low' | 'optimal' | 'high'; // 週ボリューム状態
    }
  ];
  warnings: string[]; // オーバートレーニング警告など
}
```

### 4.2 セッション記録API

**POST /api/sessions**

リクエスト：
```typescript
{
  trained_at: string; // YYYY-MM-DD
  fatigue_level: number; // 1-5
  memo?: string;
  sets: [
    {
      exercise_id: string;
      set_number: number;
      weight_kg: number;
      reps: number;
      rir: boolean; // true: 余裕あり / false: 限界
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
- `limit`: 取得件数（デフォルト20）
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
      total_volume: number; // 重量×レップ×セットの合計
      sets: TrainingSet[];
    }
  ];
  total: number;
}
```

### 4.3 種目管理API

**GET /api/exercises** - 種目一覧取得

**POST /api/exercises** - 種目登録
```typescript
{
  name: string;
  target_muscle: string;
  default_sets: number;
  default_reps: number;
}
```

**PATCH /api/exercises/[id]** - 種目更新

**DELETE /api/exercises/[id]** - 種目削除（論理削除：is_active=false）

---

## 5. メニュー提案ロジック詳細（engine.ts）

```typescript
type SuggestInput = {
  exercises: Exercise[];
  recentSessions: SessionWithSets[]; // 直近4週間分
  todayDate: Date;
};

function suggestMenu(input: SuggestInput): Suggestion[] {
  const { exercises, recentSessions, todayDate } = input;

  return exercises
    .filter(e => e.is_active)
    .map(exercise => {
      const lastSession = getLastSession(exercise.id, recentSessions);
      const daysSinceLast = lastSession
        ? diffDays(todayDate, lastSession.trained_at)
        : 999;
      const weeklyVolumeSets = calcWeeklyVolumeSets(
        exercise.target_muscle,
        recentSessions,
        todayDate
      );
      const lastSets = lastSession?.sets.filter(
        s => s.exercise_id === exercise.id
      ) ?? [];

      // 重量・セット提案
      const { weight, sets, reps, reason } = proposeNextSet(
        lastSets,
        exercise,
        lastSession?.fatigue_level
      );

      return {
        exercise,
        proposed_weight_kg: weight,
        proposed_sets: sets,
        proposed_reps: reps,
        reason,
        days_since_last: daysSinceLast,
        weekly_volume_sets: weeklyVolumeSets,
        volume_status: getVolumeStatus(weeklyVolumeSets),
      };
    })
    // 経過日数が長い順に並べる
    .sort((a, b) => b.days_since_last - a.days_since_last);
}

function proposeNextSet(
  lastSets: TrainingSet[],
  exercise: Exercise,
  lastFatigue?: number
): { weight: number; sets: number; reps: number; reason: string } {
  if (lastSets.length === 0) {
    return {
      weight: 0,
      sets: exercise.default_sets,
      reps: exercise.default_reps,
      reason: '初回のため初期値を使用',
    };
  }

  const allSetsHadRoom = lastSets.every(s => s.rir === true);
  // 全セット余裕ありだったか
  const allSetsHitReps = lastSets.every(s => s.reps >= exercise.default_reps);
  const lastWeight = lastSets[0].weight_kg;
  const lastSetsCount = lastSets.length;

  // 疲労度が高い場合
  if (lastFatigue && lastFatigue >= 4) {
    return {
      weight: Math.round((lastWeight * 0.95) / 2.5) * 2.5,
      sets: lastSetsCount,
      reps: exercise.default_reps,
      reason: '前回の疲労度が高いため重量を5%減',
    };
  }

  // 3週間停滞チェックは別途呼び出し元で判定

  // 全セット余裕ありかつ全セットレップ達成 → 重量UP
  if (allSetsHadRoom && allSetsHitReps) {
    return {
      weight: lastWeight + 2.5,
      sets: lastSetsCount,
      reps: exercise.default_reps,
      reason: '前回余裕あり・全セット達成のため重量+2.5kg',
    };
  }

  // レップ未達 → 重量維持・レップ目標を1下げる
  if (!allSetsHitReps) {
    return {
      weight: lastWeight,
      sets: lastSetsCount,
      reps: exercise.default_reps - 1,
      reason: '前回レップ未達のため重量維持・目標レップ-1',
    };
  }

  // それ以外 → 維持
  return {
    weight: lastWeight,
    sets: lastSetsCount,
    reps: exercise.default_reps,
    reason: '前回ギリギリのため重量・レップ維持',
  };
}

function getVolumeStatus(weeklySets: number): 'low' | 'optimal' | 'high' {
  if (weeklySets < 10) return 'low';
  if (weeklySets <= 20) return 'optimal';
  return 'high';
}
```

---

## 6. 画面設計

### 6.1 ホーム画面（メニュー提案）

```
┌─────────────────────────────┐
│  今日のメニュー    2025/1/15  │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ ベンチプレス     5日ぶり  │ │
│ │ 80kg × 8rep × 3set     │ │
│ │ 理由：前回余裕あり+2.5kg │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ スクワット       3日ぶり  │ │
│ │ 100kg × 5rep × 3set    │ │
│ │ 理由：前回レップ未達維持  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ デッドリフト     7日ぶり  │ │
│ │ 120kg × 5rep × 3set    │ │
│ │ 理由：初回のため初期値    │ │
│ └─────────────────────────┘ │
│                              │
│ [  記録を入力する  ]          │
├─────────────────────────────┤
│ 🏠ホーム 📝記録 📊履歴 ⚙設定 │
└─────────────────────────────┘
```

**設計ポイント**
- 画面を開いた瞬間に提案が表示される（ローディング中はスケルトン表示）
- 種目カードは経過日数順に並ぶ
- 「理由」を表示することで根拠が見える
- ボタンは1つだけ

### 6.2 記録入力画面

```
┌─────────────────────────────┐
│ ← 記録入力        2025/1/15 │
├─────────────────────────────┤
│ 疲労度                       │
│ ① ② ③ ④ ⑤               │
│ 限界     普通    余裕         │
├─────────────────────────────┤
│ ベンチプレス                  │
│ セット  重量   回数   余裕度   │
│  1    [80]kg  [8]回  [🟢余裕] │
│  2    [80]kg  [8]回  [🟢余裕] │
│  3    [80]kg  [7]回  [🔴限界] │
│  [+ セット追加]               │
├─────────────────────────────┤
│ スクワット                    │
│ セット  重量   回数   余裕度   │
│  1   [100]kg  [5]回  [🟢余裕] │
│  ...                         │
├─────────────────────────────┤
│ メモ（任意）                  │
│ [                    ]       │
│                              │
│ [      保存する      ]       │
└─────────────────────────────┘
```

**設計ポイント**
- 提案値が初期値として入力済み → 変更なければタップ不要
- 余裕度はタップで即選択（数字入力不要）
- 重量・回数はテンキー入力

### 6.3 履歴画面

```
┌─────────────────────────────┐
│ 履歴                         │
├─────────────────────────────┤
│ 総ボリューム推移               │
│ ┌─────────────────────────┐ │
│ │     📈                  │ │
│ │   /                     │ │
│ │  /                      │ │
│ └─────────────────────────┘ │
│  [種目を選択 ▼]              │
├─────────────────────────────┤
│ 2025/1/15  疲労度:③          │
│ ベンチプレス 80kg×8×3        │
│ スクワット  100kg×5×3        │
│                              │
│ 2025/1/10  疲労度:②          │
│ ベンチプレス 77.5kg×8×3      │
│ ...                          │
└─────────────────────────────┘
```

### 6.4 種目管理画面

```
┌─────────────────────────────┐
│ 種目管理              [+ 追加] │
├─────────────────────────────┤
│ ≡ ベンチプレス    胸   [編集] │
│ ≡ スクワット      脚   [編集] │
│ ≡ デッドリフト    背中  [編集] │
│ ≡ オーバーヘッドプレス 肩 [編集]│
│ ≡ チンアップ      背中  [編集] │
└─────────────────────────────┘
```

**設計ポイント**
- ドラッグで並び替え可能（sort_order更新）
- 削除は論理削除（データは残す）

---

## 7. 型定義（types/index.ts）

```typescript
export type TargetMuscle =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms';

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
  created_at: string;
  // JOINして取得する表示用フィールド
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
  rir: number;
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

export type Suggestion = {
  exercise: Exercise;
  proposed_sets: number;
  proposed_reps: number;
  proposed_weight_kg: number;
  reason: string;
  days_since_last: number;
  weekly_volume_sets: number;
  volume_status: VolumeStatus;
};
```

---

## 8. 環境変数

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 9. Stripe連携設計

### 9.1 トライアル開始フロー
1. Google認証でサインアップ
2. `users`テーブルにレコード作成（`subscription_status: 'trialing'`）
3. Stripe Customerを作成、`stripe_customer_id`を保存
4. Stripe Subscriptionをトライアル付きで作成
5. トライアル期間中は全機能利用可能

### 9.2 トライアル終了後
- Stripeのwebhookで`customer.subscription.updated`を受信
- `subscription_status`を`active`または`canceled`に更新
- `canceled`の場合：記録閲覧のみ可能、新規記録・提案は停止

### 9.3 Webhookエンドポイント
**POST /api/webhooks/stripe**
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

---

## 10. エラーハンドリング方針

| エラー種別 | 対応 |
|-----------|------|
| 認証エラー | ログイン画面にリダイレクト |
| APIエラー（5xx） | トースト通知「保存に失敗しました。再試行してください」 |
| バリデーションエラー | フィールド下にインラインエラー表示 |
| 提案データなし | 「まずは種目を登録してください」の案内表示 |
| オフライン | 「インターネット接続を確認してください」のトースト |

---

## 11. パフォーマンス方針

- ホーム画面の提案データはサーバーコンポーネントでSSR（初回表示を高速化）
- 記録入力・履歴はクライアントコンポーネント
- グラフはrecharts使用
- 画像なし（アイコンはlucide-react）
