# Claude Code 実装指示書 - 筋トレメニュー自動提案アプリ

## この指示書の使い方
この指示書はClaude Codeに渡すための実装指示書だ。
上から順番に実装していくこと。各STEPが完了したら次のSTEPに進む。
各STEPの最後に動作確認を行い、問題がなければ次に進むこと。

---

## 前提条件・制約

- **フレームワーク**: Next.js 14（App Router）
- **DB・認証**: Supabase
- **ホスティング**: Vercel
- **決済**: Stripe
- **言語**: TypeScript（strictモード）
- **スタイリング**: Tailwind CSS（`darkMode: 'media'`でシステム設定に従う）
- **アイコン**: lucide-react で統一
- **グラフ**: recharts
- **UIの世界観**: シンプル・スタイリッシュ・洗練。余白を広く取り、情報密度を下げる。「Appleの純正アプリと並べて恥ずかしくないか」を基準にする
- **カラーパレット**: 3色以内（メイン・背景・アクセント）
- **フォント**: 1〜2種類まで
- **アニメーション**: 最小限（画面遷移・保存完了フィードバックのみ）

---

## STEP 1: プロジェクト初期設定

### 1-1. Next.jsプロジェクト作成
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

### 1-2. 必要パッケージのインストール
```bash
npm install @supabase/supabase-js @supabase/ssr
npm install stripe @stripe/stripe-js
npm install lucide-react
npm install recharts
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 1-3. tailwind.config.tsの設定
```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'media', // システム設定に従う
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
export default config
```

### 1-4. 環境変数ファイルの作成
`.env.local` を作成し、以下の変数を定義する（値は後で入力）:
```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 1-5. ディレクトリ構造の作成
以下のディレクトリを作成する:
```
src/
├── app/
│   ├── (auth)/login/
│   ├── (app)/record/
│   ├── (app)/history/
│   ├── (app)/exercises/
│   ├── (app)/settings/
│   └── api/suggest/
│   └── api/sessions/
│   └── api/exercises/
│   └── api/webhooks/stripe/
├── components/ui/
├── components/home/
├── components/record/
├── components/history/
├── lib/supabase/
├── lib/suggest/
├── hooks/
└── types/
```

### 1-6. 型定義ファイルの作成
`src/types/index.ts` を以下の内容で作成する:

```typescript
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
  rir: boolean; // true: 余裕あり / false: 限界
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
  exercise: UserExercise;
  proposed_sets: number;
  proposed_reps: number;
  proposed_weight_kg: number;
  reason: string;
  days_since_last: number;
  weekly_volume_sets: number;
  volume_status: VolumeStatus;
};
```

**✅ STEP 1 完了確認**: `npm run dev` でエラーなく起動することを確認する。

---

## STEP 2: Supabaseセットアップ

### 2-1. Supabaseプロジェクト作成
Supabase（https://supabase.com）でプロジェクトを作成し、URLとAPIキーを `.env.local` に設定する。

### 2-2. Supabaseクライアントの作成

`src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

`src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Componentから呼ばれた場合は無視
          }
        },
      },
    }
  )
}
```

### 2-3. データベーステーブルの作成
Supabaseのダッシュボード → SQL Editorで以下を実行する:

```sql
-- usersテーブル
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- exercise_masterテーブル（システム共通）
CREATE TABLE exercise_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_muscle TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 種目マスタ初期データ
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

-- user_exercisesテーブル
CREATE TABLE user_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_master_id UUID REFERENCES exercise_master(id),
  custom_name TEXT,
  custom_target_muscle TEXT,
  default_sets INTEGER NOT NULL DEFAULT 3,
  default_reps INTEGER NOT NULL DEFAULT 8,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT exercise_name_check CHECK (
    exercise_master_id IS NOT NULL OR custom_name IS NOT NULL
  )
);

-- training_sessionsテーブル
CREATE TABLE training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trained_at DATE NOT NULL,
  fatigue_level INTEGER NOT NULL CHECK (fatigue_level BETWEEN 1 AND 5),
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- training_setsテーブル
CREATE TABLE training_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES user_exercises(id),
  set_number INTEGER NOT NULL,
  weight_kg DECIMAL(5,2) NOT NULL,
  reps INTEGER NOT NULL,
  rir BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLSポリシー
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can only access own data" ON users FOR ALL USING (auth.uid() = id);

ALTER TABLE exercise_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exercise_master is readable by all" ON exercise_master FOR SELECT USING (true);

ALTER TABLE user_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can only access own exercises" ON user_exercises FOR ALL USING (auth.uid() = user_id);

ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can only access own sessions" ON training_sessions FOR ALL USING (auth.uid() = user_id);

ALTER TABLE training_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can only access own sets" ON training_sets FOR ALL
  USING (session_id IN (SELECT id FROM training_sessions WHERE user_id = auth.uid()));

-- インデックス
CREATE INDEX idx_training_sessions_user_trained ON training_sessions(user_id, trained_at DESC);
CREATE INDEX idx_training_sets_session ON training_sets(session_id);
CREATE INDEX idx_training_sets_exercise ON training_sets(exercise_id);
CREATE INDEX idx_user_exercises_user ON user_exercises(user_id, sort_order);

-- 新規ユーザー登録時にusersテーブルにレコードを自動作成するトリガー
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

### 2-4. Google認証の設定
1. Supabase ダッシュボード → Authentication → Providers → Google を有効化
2. Google Cloud Console でOAuthクライアントIDを作成
3. 承認済みリダイレクトURIに以下を追加:
   - `http://localhost:3000/auth/callback`
   - `https://[本番ドメイン]/auth/callback`
4. クライアントIDとシークレットをSupabaseに設定

### 2-5. 認証コールバックルートの作成
`src/app/auth/callback/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
```

**✅ STEP 2 完了確認**: Supabaseダッシュボードでテーブルが作成されていることを確認する。

---

## STEP 3: 認証画面の実装

### 3-1. ミドルウェアの作成
`src/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 未認証ユーザーをログイン画面にリダイレクト
  if (!user && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 認証済みユーザーがログイン画面にアクセスしたらホームにリダイレクト
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)'],
}
```

### 3-2. ログイン画面の作成
`src/app/(auth)/login/page.tsx`:

以下の仕様でログイン画面を実装する:
- 中央寄せのカードレイアウト
- アプリ名（未定のため「Calcul」）とキャッチコピー「今日のメニューを、30秒で。」を表示
- 「Googleでログイン」ボタン（lucide-reactのLogoは使わず、Googleのロゴテキストのみでよい）
- ダーク/ライトモード両対応
- シンプル・洗練されたデザイン

Googleログインの処理:
```typescript
const supabase = createClient()
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
})
```

**✅ STEP 3 完了確認**: ブラウザでログイン画面が表示され、Googleログインが動作することを確認する。

---

## STEP 4: 認証済みレイアウトとボトムナビの実装

### 4-1. BottomNavコンポーネントの作成
`src/components/ui/BottomNav.tsx`:

以下の仕様で実装する:
- 4タブ構成: ホーム（Home）、記録（PenLine）、履歴（BarChart2）、設定（Settings）
- アイコンはlucide-reactを使用
- 現在のパスに応じてアクティブタブを強調表示
- スマートフォンの下部に固定表示
- ダーク/ライトモード両対応
- シンプルで洗練されたデザイン

### 4-2. 認証済みレイアウトの作成
`src/app/(app)/layout.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/ui/BottomNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen pb-16">
      <main>{children}</main>
      <BottomNav />
    </div>
  )
}
```

**✅ STEP 4 完了確認**: ログイン後にボトムナビが表示されることを確認する。

---

## STEP 5: 種目管理機能の実装

### 5-1. 種目管理APIの作成

`src/app/api/exercises/route.ts`:
- **GET**: ユーザーの種目一覧を取得（`user_exercises` と `exercise_master` をJOIN）
- **POST**: 種目を追加（マスタ選択 or カスタム）

`src/app/api/exercises/[id]/route.ts`:
- **PATCH**: 種目のdefault_sets、default_reps、sort_orderを更新
- **DELETE**: 論理削除（`is_active = false`）

`src/app/api/exercises/master/route.ts`:
- **GET**: `exercise_master` の全件を取得（種目選択画面用）

### 5-2. 種目管理画面の実装
`src/app/(app)/exercises/page.tsx`:

以下の仕様で実装する:

**画面構成**
1. ヘッダー: 「種目管理」タイトル + 「+ 追加」ボタン
2. 種目リスト: 登録済み種目をドラッグで並び替え可能
   - 各行: ハンドルアイコン（GripVertical）、種目名、部位バッジ、編集ボタン
3. 種目追加モーダル:
   - システムマスタから選択するタブ（部位ごとにグループ化）
   - カスタム種目を追加するタブ（名前・部位を入力）

**実装仕様**
- ドラッグ&ドロップは `@dnd-kit` を使用
- 並び替え後に `sort_order` をAPIで更新
- 削除は確認なしで即時論理削除（誤操作防止のためUndoトーストを表示）
- 部位の表示名は `TARGET_MUSCLE_LABELS` を使用

### 5-3. 初回ログイン時の種目選択画面
初回ログイン時（`user_exercises` が0件の場合）、種目選択の案内画面を表示する。

`src/app/(app)/onboarding/page.tsx`:
- 「まず、あなたがやる種目を選んでください」というメッセージ
- `exercise_master` の種目を部位ごとにグループ表示
- 各種目をタップで選択/解除（チェックマーク表示）
- 「完了」ボタンで選択した種目を `user_exercises` に一括登録
- 最低1種目を選択しないと完了できない

ミドルウェアで `user_exercises` が0件の場合は `/onboarding` にリダイレクトする処理を追加。

**✅ STEP 5 完了確認**: 種目の追加・編集・削除・並び替えが動作することを確認する。

---

## STEP 6: メニュー提案ロジックの実装

### 6-1. 提案エンジンの作成
`src/lib/suggest/engine.ts`:

```typescript
import { UserExercise, TrainingSet, SessionWithSets, Suggestion, VolumeStatus } from '@/types'

type SuggestInput = {
  exercises: UserExercise[]
  recentSessions: SessionWithSets[] // 直近4週間分
  todayDate: Date
}

export function suggestMenu(input: SuggestInput): Suggestion[] {
  const { exercises, recentSessions, todayDate } = input

  const suggestions = exercises
    .filter(e => e.is_active)
    .map(exercise => {
      const lastSession = getLastSessionForExercise(exercise.id, recentSessions)
      const daysSinceLast = lastSession
        ? diffDays(todayDate, new Date(lastSession.trained_at))
        : 999
      const weeklyVolumeSets = calcWeeklyVolumeSets(exercise.target_muscle, recentSessions, todayDate)
      const lastSets = lastSession?.sets.filter(s => s.exercise_id === exercise.id) ?? []
      const isStagnant = checkStagnation(exercise.id, recentSessions)

      const { weight, sets, reps, reason } = proposeNextSet(
        lastSets,
        exercise,
        lastSession?.fatigue_level,
        isStagnant
      )

      return {
        exercise,
        proposed_weight_kg: weight,
        proposed_sets: sets,
        proposed_reps: reps,
        reason,
        days_since_last: daysSinceLast,
        weekly_volume_sets: weeklyVolumeSets,
        volume_status: getVolumeStatus(weeklyVolumeSets),
      }
    })
    .sort((a, b) => b.days_since_last - a.days_since_last)

  return suggestions
}

function proposeNextSet(
  lastSets: TrainingSet[],
  exercise: UserExercise,
  lastFatigue?: number,
  isStagnant?: boolean
): { weight: number; sets: number; reps: number; reason: string } {
  // 初回
  if (lastSets.length === 0) {
    return { weight: 0, sets: exercise.default_sets, reps: exercise.default_reps, reason: '初回のため初期値を使用' }
  }

  const allSetsHadRoom = lastSets.every(s => s.rir === true)
  const allSetsHitReps = lastSets.every(s => s.reps >= exercise.default_reps)
  const lastWeight = lastSets[0].weight_kg
  const lastSetsCount = lastSets.length

  // 疲労度が高い場合
  if (lastFatigue && lastFatigue >= 4) {
    return {
      weight: Math.round((lastWeight * 0.95) / 2.5) * 2.5,
      sets: lastSetsCount,
      reps: exercise.default_reps,
      reason: '前回の疲労度が高いため重量を5%減',
    }
  }

  // 3週間停滞 → セット数+1
  if (isStagnant) {
    return {
      weight: lastWeight,
      sets: lastSetsCount + 1,
      reps: exercise.default_reps,
      reason: '3週間停滞のためセット数+1',
    }
  }

  // 全セット余裕あり・レップ達成 → 重量+2.5kg
  if (allSetsHadRoom && allSetsHitReps) {
    return {
      weight: lastWeight + 2.5,
      sets: lastSetsCount,
      reps: exercise.default_reps,
      reason: '前回余裕あり・全セット達成のため重量+2.5kg',
    }
  }

  // レップ未達 → 維持・レップ目標-1
  if (!allSetsHitReps) {
    return {
      weight: lastWeight,
      sets: lastSetsCount,
      reps: Math.max(1, exercise.default_reps - 1),
      reason: '前回レップ未達のため重量維持・目標レップ-1',
    }
  }

  // それ以外（ギリギリ達成）→ 維持
  return {
    weight: lastWeight,
    sets: lastSetsCount,
    reps: exercise.default_reps,
    reason: '前回ギリギリのため重量・レップ維持',
  }
}

function getLastSessionForExercise(exerciseId: string, sessions: SessionWithSets[]) {
  return sessions.find(s => s.sets.some(set => set.exercise_id === exerciseId)) ?? null
}

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

function calcWeeklyVolumeSets(muscle: string, sessions: SessionWithSets[], today: Date): number {
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  return sessions
    .filter(s => new Date(s.trained_at) >= weekAgo)
    .flatMap(s => s.sets)
    .filter(set => {
      // exercise_idから筋群を特定する処理（呼び出し元でexercise情報を渡す形に修正可）
      return true // 暫定：呼び出し元でフィルタリング
    }).length
}

function checkStagnation(exerciseId: string, sessions: SessionWithSets[]): boolean {
  const exerciseSessions = sessions
    .filter(s => s.sets.some(set => set.exercise_id === exerciseId))
    .slice(0, 3) // 直近3セッション

  if (exerciseSessions.length < 3) return false

  const weights = exerciseSessions.map(s =>
    s.sets.filter(set => set.exercise_id === exerciseId)[0]?.weight_kg ?? 0
  )

  return weights.every(w => w === weights[0])
}

function getVolumeStatus(weeklySets: number): VolumeStatus {
  if (weeklySets < 10) return 'low'
  if (weeklySets <= 20) return 'optimal'
  return 'high'
}
```

### 6-2. 提案APIの作成
`src/app/api/suggest/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { suggestMenu } from '@/lib/suggest/engine'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ユーザーの種目を取得
  const { data: exercises } = await supabase
    .from('user_exercises')
    .select(`
      *,
      exercise_master(name, target_muscle)
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('sort_order')

  // 直近4週間のセッションを取得
  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

  const { data: sessions } = await supabase
    .from('training_sessions')
    .select(`
      *,
      training_sets(*)
    `)
    .eq('user_id', user.id)
    .gte('trained_at', fourWeeksAgo.toISOString().split('T')[0])
    .order('trained_at', { ascending: false })

  if (!exercises || !sessions) {
    return NextResponse.json({ suggestions: [], warnings: [] })
  }

  // UserExercise型に変換（JOINデータを展開）
  const normalizedExercises = exercises.map((e: any) => ({
    ...e,
    name: e.custom_name ?? e.exercise_master?.name ?? '',
    target_muscle: e.custom_target_muscle ?? e.exercise_master?.target_muscle ?? '',
  }))

  const normalizedSessions = sessions.map((s: any) => ({
    ...s,
    sets: s.training_sets ?? [],
  }))

  const suggestions = suggestMenu({
    exercises: normalizedExercises,
    recentSessions: normalizedSessions,
    todayDate: new Date(),
  })

  // 週ボリューム警告の生成
  const warnings: string[] = []
  const muscleVolumes = new Map<string, number>()
  suggestions.forEach(s => {
    const current = muscleVolumes.get(s.exercise.target_muscle) ?? 0
    muscleVolumes.set(s.exercise.target_muscle, current + s.weekly_volume_sets)
  })
  muscleVolumes.forEach((sets, muscle) => {
    if (sets > 20) warnings.push(`${muscle}のセット数が週${sets}セットを超えています`)
  })

  return NextResponse.json({ suggestions, warnings })
}
```

**✅ STEP 6 完了確認**: `/api/suggest` にGETリクエストを送りレスポンスが返ることを確認する。

---

## STEP 7: ホーム画面の実装

### 7-1. 種目カードコンポーネントの作成
`src/components/home/ExerciseCard.tsx`:

以下の仕様で実装する:
- 種目名（大きめのフォント）
- 経過日数バッジ（例：「5日ぶり」）
- 提案内容（例：「80kg × 8回 × 3セット」）
- 提案理由（小さめのテキスト、例：「前回余裕あり・全セット達成のため重量+2.5kg」）
- 週ボリュームが `low` の場合はさりげなく「ボリューム不足」インジケーター表示
- 週ボリュームが `high` の場合は「オーバートレーニング注意」インジケーター表示
- シンプルで余白のあるカードデザイン

### 7-2. ホーム画面の作成
`src/app/(app)/page.tsx`:

以下の仕様で実装する:
- サーバーコンポーネントとして実装（SSRで初回表示を高速化）
- ページ上部に今日の日付を表示
- `suggestMenu` の結果を元に `ExerciseCard` を並べる
- 種目が未登録の場合は「種目を登録してください」の案内 + 種目管理画面へのリンクを表示
- ページ下部に「記録を入力する」ボタンを固定表示（BottomNavの上）
- ローディング中はスケルトン表示（`loading.tsx` を作成）

**✅ STEP 7 完了確認**: ホーム画面に今日のメニューが表示されることを確認する。

---

## STEP 8: 記録入力画面の実装

### 8-1. RIRトグルコンポーネントの作成
`src/components/record/RirToggle.tsx`:

以下の仕様で実装する:
- `true`（余裕あり）/ `false`（限界）の2択トグル
- デフォルトは `true`（余裕あり）
- タップ1回で切り替え
- 余裕あり: 緑系の色 + 「余裕」テキスト
- 限界: 赤系の色 + 「限界」テキスト
- シンプルなピル型デザイン

### 8-2. セット行コンポーネントの作成
`src/components/record/SetRow.tsx`:

以下の仕様で実装する:
- セット番号（表示のみ）
- 重量入力（テンキー、小数点対応、kg単位）
- 回数入力（テンキー、整数のみ）
- RIRトグル
- 削除ボタン（セットが2以上の場合のみ表示）

### 8-3. 疲労度選択コンポーネントの作成
`src/components/record/FatigueSelector.tsx`:

以下の仕様で実装する:
- 1〜5の5段階
- タップで選択
- 数字と簡単なラベル（1:最悪、3:普通、5:最高）
- シンプルなセグメントコントロール風デザイン

### 8-4. セッション記録APIの作成
`src/app/api/sessions/route.ts`:

- **POST**: セッションとセット記録を一括保存（トランザクション処理）
- **GET**: セッション一覧を取得（直近20件、セット情報を含む）

### 8-5. 記録入力画面の作成
`src/app/(app)/record/page.tsx`:

以下の仕様で実装する:
- ヘッダー: 「記録入力」+ 今日の日付
- 疲労度選択（ページ上部）
- ホーム画面の提案内容を初期値として自動入力
  - URLパラメータ（`?from=home`）でホームからの遷移を検知
  - 提案値が初期値として入力済み → 変更なければそのまま保存可能
- 種目ごとにセクション分け
  - 種目名
  - セット行（SetRow）のリスト
  - 「+ セット追加」ボタン
- メモ入力（任意、テキストエリア）
- 「保存する」ボタン（ページ下部に固定）
  - 保存完了後はホーム画面にリダイレクト
  - 保存完了のトースト通知を表示

**✅ STEP 8 完了確認**: 記録入力→保存→ホーム画面への遷移が正常に動作することを確認する。

---

## STEP 9: 履歴画面の実装

### 9-1. ボリュームチャートコンポーネントの作成
`src/components/history/VolumeChart.tsx`:

以下の仕様で実装する:
- rechartsの `LineChart` を使用
- 横軸: 日付
- 縦軸: 選択した種目の重量（kg）
- 種目をドロップダウンで選択できる
- シンプルで余白のあるグラフデザイン

### 9-2. セッション一覧コンポーネントの作成
`src/components/history/SessionList.tsx`:

以下の仕様で実装する:
- セッション日付（大きめ）、疲労度
- 各種目の記録（種目名、重量×回数×セット数）
- 総ボリューム（重量×レップ×セット数の合計）を表示

### 9-3. 履歴画面の作成
`src/app/(app)/history/page.tsx`:

以下の仕様で実装する:
- ページ上部にボリュームチャート
- その下にセッション一覧（新しい順）
- スクロールで過去のセッションを閲覧可能

**✅ STEP 9 完了確認**: 履歴画面にグラフとセッション一覧が表示されることを確認する。

---

## STEP 10: Stripe連携の実装

### 10-1. Stripeの設定
1. Stripe（https://stripe.com）でアカウント作成
2. 商品と価格を作成（¥480/月、30日間トライアル付き）
3. APIキーを `.env.local` に設定

### 10-2. トライアル開始処理
`src/app/api/stripe/create-subscription/route.ts`:

サインアップ後に自動実行される処理:
1. Stripe Customerを作成
2. 30日間トライアル付きSubscriptionを作成
3. `users` テーブルに `stripe_customer_id` と `stripe_subscription_id` を保存

この処理は認証コールバック (`/auth/callback`) 後に呼び出す。

### 10-3. Webhookの実装
`src/app/api/webhooks/stripe/route.ts`:

以下のイベントを処理する:
- `customer.subscription.updated`: `subscription_status` を更新
- `customer.subscription.deleted`: `subscription_status` を `canceled` に更新
- `invoice.payment_failed`: `subscription_status` を `past_due` に更新

### 10-4. 課金状態によるアクセス制御
`src/lib/subscription.ts`:

```typescript
export function canUseApp(status: string, trialEndsAt: string): boolean {
  if (status === 'active') return true
  if (status === 'trialing') {
    return new Date(trialEndsAt) > new Date()
  }
  return false
}
```

ミドルウェアに追加: `canceled` かつトライアル終了の場合は `/settings` のみアクセス可能にする。

### 10-5. 設定画面の作成
`src/app/(app)/settings/page.tsx`:

以下の仕様で実装する:
- 現在のサブスクリプション状態表示
- トライアル残り日数表示
- 支払い管理（Stripe Customer Portalへのリンク）
- ログアウトボタン

**✅ STEP 10 完了確認**: トライアル開始・Webhookの受信が正常に動作することを確認する。

---

## STEP 11: 仕上げとデプロイ

### 11-1. エラーハンドリングの確認
以下のエラーケースが適切に処理されていることを確認する:
- 認証エラー → ログイン画面にリダイレクト
- APIエラー（5xx） → トースト通知「保存に失敗しました。再試行してください」
- バリデーションエラー → フィールド下にインラインエラー表示
- 種目未登録 → 「まずは種目を登録してください」の案内表示
- オフライン → 「インターネット接続を確認してください」のトースト

### 11-2. レスポンシブ対応の確認
- スマートフォン（375px〜）で全画面が正常に表示されることを確認
- PC（1280px）でも問題なく使えることを確認

### 11-3. Vercelデプロイ
1. GitHubにプッシュ
2. Vercelでプロジェクトを作成
3. 環境変数を設定
4. デプロイ
5. SupabaseのリダイレクトURIに本番URLを追加

### 11-4. 最終確認チェックリスト
- [ ] Google認証でサインアップ・ログインできる
- [ ] 初回ログイン時に種目選択画面が表示される
- [ ] ホーム画面を開いた瞬間にメニューが表示される
- [ ] 記録入力が30秒以内に完了できる
- [ ] 余裕度トグルが正常に動作する
- [ ] 履歴画面にグラフが表示される
- [ ] 種目の追加・並び替え・削除ができる
- [ ] Stripeのトライアルが開始される
- [ ] ダーク/ライトモードが正常に切り替わる
- [ ] スマートフォンで違和感なく使える

---

## 注意事項・実装上の禁止事項

- **機能を追加しない**: 指示書に記載されていない機能はMVPに含めない
- **HTMLのformタグを使わない**: フォームはReactのイベントハンドラで処理する
- **localStorageを使わない**: 状態管理はReact StateとSupabaseで行う
- **any型を極力使わない**: TypeScriptのstrictモードに従う
- **インラインスタイルを使わない**: Tailwind CSSクラスのみ使用する
- **コメントは日本語で書く**
