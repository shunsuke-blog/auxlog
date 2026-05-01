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

### 5.1 設計方針（実装を通じて確立）

初期設計から実際の使用を経て以下の問題が判明し、ロジックを修正した。

**修正の背景**
- ピラミッド・逆ピラミッドセット：先頭セットの重量を基準にすると、ウォームアップ重量が提案に反映されてしまう
- バックオフセット：高重量のトップセット後に軽い重量で行うセットが判定を汚染する
- 自重種目（チンアップ等）：0kg×18回実績に対し「8回」を提案するなど、default_repsを基準にすると実態と乖離する

**確立した方針**
| 項目 | 方針 |
|---|---|
| 基準重量 | 全セット中の最大重量（ウォームアップを除外） |
| セット数カウント | 最大重量の80%以上のセットのみ（ウォームアップ除外） |
| RIR・レップ判定 | トップセット（最大重量のセット）のみ |
| 提案回数の基準 | `exercise.default_reps` ではなく前回実績（`bestTopReps`） |
| ストール判定 | レップ達成済みの場合のみ適用 |

### 5.2 判定フロー

```
入力: lastSets（前回セット一覧）, exercise, lastFatigue, isStagnant

1. lastSets が空 → 初回提案（default_sets × default_reps）

2. 基礎値を算出
   lastWeight    = max(全セットの重量)
   workingSets   = lastWeight × 80%以上のセット
   lastSetsCount = workingSets.length
   topSets       = lastWeight と同じ重量のセット
   bestTopReps   = max(topSetsの回数)
   reachedTarget = bestTopReps >= default_reps

3. 疲労度 >= 4
   → 有酸素: weight × 0.95（2.5kg丸め）, reps = bestTopReps
   → 自重:   reps = bestTopReps × 0.8（20%減）

4. reachedTarget = false（レップ未達）
   → weight 維持, reps = min(bestTopReps + 1, default_reps)
   ※ ストール判定は適用しない

5. allTopSetsHadRoom = true（全トップセット余裕あり）
   → 有酸素: weight + 2.5kg, reps = default_reps（新重量でリセット）
   → 自重:   reps = bestTopReps + 2

6. isStagnant = true（3セッション重量変化なし）
   → weight 維持, sets + 1, reps = bestTopReps

7. ギリギリ達成（余裕なし・レップ達成）
   → weight 維持, sets 維持, reps = bestTopReps
```

### 5.3 ストール（停滞）判定

直近3セッションのトップセット最大重量がすべて同一の場合に `isStagnant = true` とする。
ただし `proposeNextSet` 内でレップ未達の場合は適用しない（未達は停滞ではなく漸進中）。

### 5.4 週ボリューム状態

| 状態 | 条件 | 表示 |
|---|---|---|
| `low` | 週セット数 < 10 | ボリューム不足インジケーター |
| `optimal` | 10 ≤ 週セット数 ≤ 20 | 表示なし |
| `high` | 週セット数 > 20 | オーバートレーニング注意インジケーター |

### 5.5 直線セット提案について

現在の実装は**直線セット（Straight Sets）**を提案する。すなわち「Xkg × Y回 × Zセット」はすべてのセットで同一の重量・回数を指定する。

**根拠**
- 直線セットはプログレッシブオーバーロードの基本形であり、多くのエビデンスベースプログラムで採用されている
- 筋肥大においてはセット間で多少回数が減っても総ボリュームが担保されれば効果的（Schoenfeld et al. 2021）

**限界**
- 実際には疲労によりセットを重ねるごとに回数は自然に減少する
- ユーザーは記録入力時にセットごとの実績値（重量・回数・RIR）を個別入力することで乖離を吸収する設計としている

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
