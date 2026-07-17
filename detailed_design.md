# 詳細設計書 - Auxlog（9週間プログラム管理・コーチング可視化プラットフォーム）

## ⚡ 方向転換について（2026-07-03 doc sync）

2026-06-26〜28の開発でプロダクトの方向性が転換した。以下、齟齬防止のため現状を明記する（`requirements.md` と同内容）。

- **現在のAuxlogの定義**: 9週間プログラム（Volume→Intensity→Deload→MaxOut）管理・コーチング可視化プラットフォーム。詳細ロジック・データモデルは `program-based-logic-design.md` を参照（本ドキュメントには重複記載しない）。**ただし`program-based-logic-design.md`自体が説明する種目選定ロジック（スロット方式）は2026-07-08にさらに刷新されている（下記参照）。**
- **§5「メニュー提案ロジック詳細（engine.ts）」の扱い**: `program-based-logic-design.md` §13 では「`lib/engine.ts` を全面書き換え・旧ロジックは削除」と計画されていたが、**実装では旧ロジック（`lib/suggest/engine.ts`）は削除されず現存**しており、`/api/suggest`（記録画面の種目追加フロー）から呼ばれている。新ロジックは別ファイル `lib/suggest/program_engine.ts` に実装されている（設計書の想定とファイル構成が異なる点に注意）。旧来のスワイプ式ホーム画面提案UI（`HomeMenu.tsx`）は2026-07-09に削除済み（§6.1参照）。
- **種目選定ロジックの再刷新（2026-07-08）**: `program-based-logic-design.md`が説明する旧スロット方式（`program_slots.ts`、tier=スロット単位）はcanonical順位ベースのカテゴリ方式（`program_composition.ts`）へ全面置き換えされた。現在の一次情報源は`program-composition-redesign-brainstorm.md`。
- **%RM進行データの構造見直し（2026-07-15）**: 1RM管理要否（`exercise_master.requires_one_rm`）は種目単位の属性なのに対し、%RM進行データ（top_set_pct_rm等）はカテゴリ(slot_id)単位の`program_weekly_params`にしか持てなかった。このズレにより「カテゴリの既定は1RM非管理だが割り当てた種目は1RM管理」なケース（leg_hingeにデッドリフト、shoulder_press_2にダンベルショルダープレス等）で%RMデータが存在せず、暫定%RM(0.8/0.75)へのフォールバック（`buildCompoundSetsFromIsolationParams`）に頼っていた。%RM進行データを動きパターン(movement_pattern)単位の新テーブル`movement_pattern_weekly_params`に切り出し、フォールバックは廃止（該当movement_patternのデータが無ければスロットは提案に出ない）。詳細は§4.4、`requirements.md`§6（`movement_pattern_weekly_params`テーブル定義）、`lib/suggest/program_engine.ts`を参照。
- **背景**: `.company/coaching/coaching_business_plan.md` §0・§7、`.company/ceo/decisions/2026-07-01-business-plan-update-auxlog-coaching.md` を参照。

---

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
│   │   └── FatigueSelector.tsx   # 消耗度選択（セッション後に入力、1=楽勝〜5=ヘトヘト）
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

#### exercise_master（システム共通種目マスタ、⚡ 2026-07-10更新: プログラムカテゴリ関連カラムを追記）
```sql
CREATE TABLE exercise_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_muscle TEXT NOT NULL,
  -- chest / back / legs / shoulders / arms / core
  movement_pattern TEXT,
  -- horizontal_press / vertical_press / horizontal_pull / vertical_pull / squat /
  -- hip_hinge / elbow_flexion / elbow_extension 等。program_composition.tsの
  -- カテゴリ判定に使用（2026-07-08〜）
  tier INTEGER,
  -- 種目の推奨度（1が最もデフォルト推奨）。オンボーディングはtier<=2のみ表示
  requires_one_rm BOOLEAN DEFAULT false,
  -- 1RM管理(%RMベース重量算出)が必要かどうか。種目単位の属性（カテゴリ単位ではない）
  intensity_technique TEXT,
  -- 60分プログラムのアイソレーション最終セットに許可する強度テクニック
  -- (rest_pause / myo_reps / none)
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- 種目ピッカーの表示順。部位ブロック(1000刻み)→動きパターンのサブブロック(100刻み)
  -- →種目(5刻み)の階層的な番号体系（2026-07-10〜）
  is_bodyweight BOOLEAN DEFAULT false,  -- 自重種目フラグ
  is_compound BOOLEAN DEFAULT false,    -- コンパウンド種目フラグ（回復日数計算に使用）
  slot_type TEXT,
  -- 旧スロット方式(program_slots.ts)の名残。現在のロジックでは未使用
  -- （movement_pattern/target_muscleに置き換え済み。種目のアイデンティティ特定用に残置）
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
  is_improved: boolean;    // 最大重量 or 最大回数が前回最新セッション比で向上した場合 true
  is_volume_up: boolean;   // is_improved=false かつ 総負荷量が前回最新セッション比で増加した場合 true
}
```

#### 保存後の結果判定ロジック

保存完了後に `Record!` / `Volume Up!` / `Good Job!` のいずれかを表示するため、以下のロジックで判定する。

| フィールド | 表示 | 条件 |
|---|---|---|
| `is_improved=true` | Record! 🏆 | いずれかの種目で最大重量増 or 同重量で最多回数増 |
| `is_improved=false, is_volume_up=true` | Volume Up! 📈 | いずれかの種目で総負荷量（重量×回数の合計）増 |
| 両方 false | Good Job! 💪 | 上記いずれも該当しない |

**前回セッションの特定方法**：  
`training_sets` を種目IDで直接クエリし、`training_sessions!inner(trained_at)` で日付を取得。  
セッション数に制限を設けず、`trained_at` でDESCソートして種目ごとに最新セッションを特定する。  
（旧実装では直近10セッション制限があり、8日以上空いた種目で前回データが取得できないバグがあった）

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
      total_volume: number;  // ウォームアップセット(is_warmup=true)は除外して算出
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

**DELETE /api/exercises/[id]** - 種目自体は論理削除（`is_active=false`）だが、紐づく`training_sets`は物理削除される（過去記録が失われる。確認モーダルあり）

**GET /api/exercises/master** - システム種目マスタ一覧

### 4.4 9週間プログラムAPI（⚡ 2026-07-12新規追加: §4.1〜4.3に抜けていた現在の主力機能のAPI群）

**GET /api/suggest/program?day=1〜4** - 指定Dayの種目・重量・セット提案を返す（`buildProgramSuggestion`、`lib/suggest/program_engine.ts`）。スロット・週次パラメータ・movement_pattern週次パラメータ（2026-07-15〜、%RM進行データの出典）・種目・1RM・直近セッションを並列取得する。直近セッションは日付範囲（14日）でDB取得した上で、**種目ごとにtrained_atが最新の1セッションのみ**を採用する（2026-07-17〜。以前は14日分の複数トレーニング日をそのままプールしていたため、後述のセット単位重量提案が複数日の記録と混ざって破綻していた）

#### 4.4.1 アイソレーション(1RM非管理)種目の重量提案ロジック（`suggestIsolationWeight`→`adjustIsolationWeight`/`buildIsolationSets`、2026-07-17改修）

RM管理種目（`exercise.requires_one_rm: true`）は%RM進行（movement_pattern_weekly_params、top_set/backoff_sets）で重量を算出するのに対し、RM非管理(アイソレーション)種目は直近実績からのオートレギュレーションで重量を算出する。回数(`target_reps`)は常に現在週の`program_weekly_params.rep_range_min`を採用し、実績から計算しない。

**2026-07-17より前の実装**: 直近セッションの全ワーキングセットから単一の最大重量(`maxWeight`)を求め、「全セットがrep_range_maxを超えていたか」「いずれかのセットがrep_range_min未満だったか」を全セットまとめて判定し、結果(maxWeight±2.5kg)を**その種目の全ワーキングセットに同一値**として適用していた。ドロップセットのようにセットごとに重量が異なる構成では、この一律適用によりセットごとの重量差が提案時に失われる不具合があった（オーナー指摘により発覚）。

**現在の実装**: `TrainingSet.set_number`単位で前回の実績とマッチングし、セットごとに独立して判定する。
- 直近セッションの同じ`set_number`の実績がある場合: そのセットのreps単体で判定（`rep_range_max`超え→+2.5kg、`rep_range_min`未満→-2.5kg・0未満にはならない、レンジ内→据え置き）
- 対応する前回セットが無い場合（今回のセット数が前回より多い）: 前回セッションの最終セットの重量を初期値として使う（達成判定はしない）
- 直近実績が全く無い場合: 0（表示側で「—」扱い、既存方針を維持）

**GET /api/suggest/program/week-status** - 今週の完了種目ID一覧と全完了フラグを返す（ホーム画面の完了バッジ・「Week N 完了」ボタン判定用）

**POST /api/program/enroll**（zodバリデーションあり） - オンボーディング完了時にプログラムへ登録。`days_per_week`(2/3/4)・`session_duration_minutes`(60/75/90)・`priority_muscles`（最大2部位）・`slot_assignments`（スロットID×種目名）・`one_rms`を受け取り、`user_program_enrollments`・`user_slot_assignments`・`user_slot_one_rms`を作成する

**DELETE /api/program/reset** - 現在のエンロールメントを全削除し、オンボーディングをやり直せる状態に戻す（実データを削除する破壊的操作）

**POST /api/program/advance-week** - 現在の週を+1進める（週次進行の手動トリガー）

**GET /api/program/day-extras?day=1〜4** - 指定Dayに追加されたプログラム外種目一覧を返す

**POST /api/program/day-extras** - プログラム外種目をその日のメニューに追加する

**DELETE /api/program/day-extras/[id]** - 追加した種目をその日のメニューから削除する

**PATCH /api/program/slot-assignments/[slot_id]** - スロットの種目差し替え（`exercise_name`指定、`movement_pattern`一致で選択可能な種目かを検証）またはスロットの非表示切り替え（`is_hidden`）

---

## 5. メニュー提案ロジック詳細（`lib/suggest/engine.ts`）（⚡ 現在はプログラム外種目のみのフォールバックロジック。主力の9週間プログラムロジックは `program-composition-redesign-brainstorm.md` と `lib/suggest/program_engine.ts` / `lib/suggest/generate_program_composition.ts` を参照）

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
  RECOVERY_DAYS_COMPOUND_FAILURE: 3,          // コンパウンド + 限界セットあり → 3日
  RECOVERY_DAYS_ISOLATION_FAILURE: 3,         // アイソレーション + 限界セットあり → 3日
  RECOVERY_DAYS_ALL_ROOM: 2,                  // 全セット余裕あり → 2日
  RECOVERY_DAYS_HIGH_EXHAUSTION_BONUS: 1,     // 消耗度 >= 4 の場合の回復日数ボーナス
  WEEKLY_VOLUME_LOW: 12,                      // 週ボリューム最低ライン（セット数）
  WEEKLY_VOLUME_HIGH: 16,                     // 週ボリューム上限ライン（セット数）
  STAGNATION_SESSION_COUNT: 3,                // ストール判定に使う直近セッション数
  WARMUP_WEIGHT_RATIO: 0.8,                   // ウォームアップ判定閾値
  COMPOUND_WEIGHT_INCREMENT_KG: 5.0,          // コンパウンド種目のデフォルト重量増加量 (kg)
  ISOLATION_WEIGHT_INCREMENT_KG: 2.0,         // アイソレーション種目のデフォルト重量増加量 (kg)
  BODYWEIGHT_REPS_INCREMENT: 2,               // 自重種目の余裕あり時回数増加量
  MAX_REPS_OFFSET: 5,                         // 回数上限 = default_reps + この値。到達時に重量UPへ切り替え
}
```

### 5.3 判定フロー

```
入力: exercises, recentSessions, todayDate, trainingLevel

0. 種目ごとに回復日数チェック（calcMinRecoveryDays）→ 未満なら提案リストから除外
   ■ 回復軸（2軸設計）
   - RIR=false（限界セット）あり + コンパウンド → 3日
   - RIR=false（限界セット）あり + アイソレーション → 3日
   - 全ワーキングセット余裕あり → 2日
   - 前回記録なし（初回） → 常に提案
   - 消耗度 >= 4 → 上記に +1日ボーナス
   提案リストを経過日数の降順でソート

入力: lastSets（前回セット一覧）, exercise, isStagnant

1. lastSets が空 → 初回提案
   - コンパウンド種目: ウォームアップ1セット + default_sets × default_reps の直線セット（計 1+sets セット）
     ウォームアップセットを先頭に含めることで、ユーザーがウォームアップ機能を発見できるようにする
   - アイソレーション種目: default_sets × default_reps の直線セットのみ（ウォームアップなし）

2. ウォームアップ/ワーキング分離（is_warmup フラグで分類）
   effectiveSets = workingSets が存在する場合は workingSets、ない場合は全セット

3. 基礎値を算出
   topWeight        = max(effectiveSets の重量)
   topSets          = topWeight と同じ重量のセット
   bestTopReps      = max(topSets の回数)
   allTopSetsHadRoom = topSets.every(rir === true)
   reachedTarget    = bestTopReps >= default_reps

4. bestTopReps >= default_reps + MAX_REPS_OFFSET かつ is_bodyweight = false（回数上限到達）
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
| `calcMinRecoveryDays(exercise, lastWorkingSets, lastExhaustion?)` | 種目タイプ × 前回RIR × 消耗度から最低回復日数を算出 |
| `isHighExhaustion(exhaustion)` | セッション消耗度（事後）>= 4 の判定 |
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

### 6.1 ホーム画面（⚡ 2026-07-09更新: 旧HomeMenu構成は削除済み）

エンロールが必須のため、`app/(app)/page.tsx` は常にエンロール済み（`ProgramDayView`を返す）か`/onboarding`へリダイレクトのいずれかで、それ以外の分岐は無い。旧来の「未エンロール時に前回記録から提案するスワイプUI」（`HomeMenu.tsx`・`SwipeableExerciseCard.tsx`・`ExerciseCard.tsx`・`lib/constants/swipe.ts`）は、この分岐構造上絶対に到達しない死んだコードだったため2026-07-09に削除した。

**app/(app)/page.tsx**（サーバーコンポーネント）
- ユーザーの`users`（トライアル状態計算用）・`user_program_enrollments`を並列取得
- エンロールが無ければ `/onboarding` にリダイレクト
- `ProgramDayView` クライアントコンポーネントに`enrollment`と`trialDaysLeft`を渡す

**ProgramDayView.tsx**（クライアントコンポーネント、`components/home/`）
- Dayセレクター・「今週のフォーカス」（フェーズ説明）・プログラムスロットごとの種目カード・追加種目カードを表示
- 各カードは `SwipeableCard` でラップし、スワイプ左で `is_hidden` をDBに保存（非表示は永続、旧来のsessionStorage当日限定とは異なる）
- 週の全スロット完了で「Week N 完了 → Week N+1 へ」ボタンをコンテンツ最上部に表示（2026-07-09、下部で気付きにくいとのフィードバックで移動）
- 「+ 種目を追加」ボタンでプログラム外の追加種目を選択するモーダルを表示

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
- SSRでセッション365件・種目を並行取得
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
- 総挙上量はウォームアップセット(is_warmup=true)を除外して算出（記録画面・履歴一覧と同一基準）
- 自重種目は回数推移のみ表示（メトリクス切り替えUI非表示）
- 種目切り替えはカスタムアイコン（`ChevronsUpDown`）付き `select` で表示
- ダークモード対応: `matchMedia` で `isDark` を検知してグラフ色を切り替え

### 6.5 オンボーディング画面の種目自動割り当てロジック（lib/onboarding/exercise_matching.ts）

**app/onboarding/page.tsx**（サーバーコンポーネント）
- `exercise_master` を `.order('tier').order('sort_order')` で取得し、`OnboardingClient` に渡す（2026-07-10、`sort_order`単独ソートだと推奨度と無関係な順で自動選択されるバグを修正。`tier`が推奨度の一次基準）

**matchingExercises(category, exercises)**
- カテゴリの`movementPattern`が設定されていれば、種目の`movement_pattern`と一致するものだけを候補にする（部位が同じでも動きパターンが違う種目を混同しない。例: 二頭/三頭、肩プレス/側方/後部）
- `movementPattern`は単一値のほか配列も指定でき、配列の場合はいずれかに一致すればよい（例: `leg_2`はsquat or hip_hinge、`back_2`はhorizontal_pull or vertical_pull。design docの「or」指定カテゴリのみ。brainstorm #10参照）
- `movementPattern`が無いカテゴリのみ、部位（`target_muscle`）一致にフォールバックする

**buildSlotSelections(params)** — 各カテゴリへの種目自動割り当て
1. ユーザーが「今やっている種目」として明示チェックした種目があれば、それを優先的に割り当てる
2. 無ければ `CATEGORY_DEFAULT_OVERRIDES`（9週間プログラムシートで指定されたデフォルト種目。例: `leg_2`→ハイバースクワット）を試す
3. それも無ければ、`matchingExercises`の候補の中で**配列の先頭**（＝`tier`→`sort_order`順で最初に来る種目）を選ぶ
4. 同じ種目名を複数カテゴリで重複させない（一度使った種目名は候補から除外）

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
