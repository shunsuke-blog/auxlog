# 実装状況まとめ - Auxlog（9週間プログラム管理・コーチング可視化プラットフォーム）

## ⚡ 方向転換について（2026-07-03 doc sync）

2026-06-26〜28の開発でプロダクトの方向性が転換した。現在のAuxlogは「前回記録から自動提案するアプリ」ではなく、9週間プログラム（Volume→Intensity→Deload→MaxOut）を軸にしたコーチング可視化プラットフォーム。詳細は `requirements.md` 冒頭の同名セクション、および `program-based-logic-design.md` を参照。旧の適応型提案ロジック（`lib/suggest/engine.ts`）は`/api/suggest`（記録画面の種目追加フロー）向けに現存しているが、旧来のホーム画面スワイプUI（`HomeMenu.tsx`）は2026-07-09に削除済み（詳細は`requirements.md`参照）。

**種目選定ロジックの再刷新（2026-07-08）**: `program-based-logic-design.md`が説明する旧スロット方式はさらにcanonical順位ベースのカテゴリ方式（`program_composition.ts`）へ全面置き換えされた。現在の一次情報源は`program-composition-redesign-brainstorm.md`。

## このドキュメントの位置づけ
フェーズ1（MVP）の実装が完了した状態を記録したドキュメント。
次フェーズの開発者（または Claude Code）が現状を正確に把握できるよう、
実装済みの仕様と今後の課題を整理している。
（2026-06-28以降に実装された9週間プログラム機能の詳細は本ドキュメントには含まれていない。`program-based-logic-design.md` を参照）

---

## 前提条件・技術スタック

- **フレームワーク**: Next.js 16（App Router）
- **DB・認証**: Supabase（PostgreSQL + Auth）
- **ホスティング**: Vercel
- **決済**: Stripe（コード実装済み、本番設定は手動作業待ち）
- **言語**: TypeScript（strictモード）
- **スタイリング**: Tailwind CSS（`darkMode: 'media'`）
- **アイコン**: lucide-react
- **グラフ**: recharts
- **DnD**: @dnd-kit/core, @dnd-kit/sortable（⚡ 2026-07-12確認: package.jsonには残っているが、現在コード内で使用箇所なし。未使用依存の可能性）
- **バリデーション**: zod
- **実装禁止事項**:
  - HTMLのformタグを使わない（Reactのイベントハンドラで処理）
  - localStorageを使わない（状態管理はReact StateとSupabase）
  - any型を極力使わない
  - インラインスタイルを使わない（例外: `env(safe-area-inset-bottom)` の動的計算）
  - コメントは日本語で書く

---

## フェーズ1 実装済み機能一覧

### STEP 1〜2: プロジェクト初期設定・Supabase

**完了**
- [x] Next.js 16 App Router プロジェクト
- [x] Supabase クライアント（`lib/supabase/client.ts`, `lib/supabase/server.ts`）
- [x] 全テーブル作成（users, exercise_master, user_exercises, training_sessions, training_sets）
- [x] `exercise_master` に `is_bodyweight` カラム追加（マスタ種目の自重フラグ）
- [x] `user_exercises` に `is_bodyweight` カラム追加（独自種目の自重フラグ）
- [x] `training_sets` に `is_warmup` カラム追加（ウォームアップフラグ）
- [x] RLSポリシー設定
- [x] インデックス作成
- [x] `update_session_with_sets` RPC関数（`lib/sql/update_session_with_sets.sql`）

**DB変更点（原設計からの差分）**
```sql
-- exercise_masterに追加
ALTER TABLE exercise_master ADD COLUMN is_bodyweight BOOLEAN DEFAULT false;

-- user_exercisesに追加
ALTER TABLE user_exercises ADD COLUMN is_bodyweight BOOLEAN DEFAULT false;

-- training_setsに追加
ALTER TABLE training_sets ADD COLUMN is_warmup BOOLEAN NOT NULL DEFAULT false;
-- rir のデフォルトを false（限界）に変更
ALTER TABLE training_sets ALTER COLUMN rir SET DEFAULT false;
```

### STEP 3〜4: 認証・レイアウト

**完了**
- [x] ログイン画面（`app/(auth)/login/page.tsx`）
- [x] 認証コールバック（`app/auth/callback/route.ts`）
- [x] 認証済みレイアウト（`app/(app)/layout.tsx`）
- [x] BottomNav（⚡ 現在は4タブ: ホーム/履歴/設定/コーチング。「記録」タブは2026-06-29に削除され「ホームから記録する設計」に統一、代わりに2026-06-29以降「コーチング」タブが追加された。`components/ui/BottomNav.tsx` の git log 参照）

**注意**: middleware.ts は削除済み。認証チェックは各サーバーコンポーネントとAPIルートで行う。

**【重要】認証コールバックの Cookie 設定パターン（2026-07-01修正）**
`app/auth/callback/route.ts` は `Request` ではなく `NextRequest` を使用すること。
また、`NextResponse.redirect()` を先に作成し、Supabase の `setAll` コールバック内でそのオブジェクトの `.cookies.set()` に直接セットすること。
`cookies()` (next/headers) 経由で `cookieStore.set()` しても `NextResponse.redirect()` に Cookie が乗らないケースがある。

```typescript
// ✅ 正しいパターン
const successResponse = NextResponse.redirect(url)
const supabase = createServerClient(url, key, {
  cookies: {
    getAll() { return request.cookies.getAll() },           // requestから読む
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) =>
        successResponse.cookies.set(name, value, options)  // responseに直接セット
      )
    },
  },
})
const { error } = await supabase.auth.exchangeCodeForSession(code)
if (!error) return successResponse  // Cookie が乗ったレスポンスを返す
```

### STEP 5: 種目管理機能

**完了**
- [x] 種目管理API（`app/api/exercises/route.ts`, `app/api/exercises/[id]/route.ts`）
- [x] 種目マスタAPI（`app/api/exercises/master/route.ts`）
- [x] 種目管理画面（`app/(app)/exercises/page.tsx`）
  - マスタ種目選択モーダル（部位グループ化）
  - カスタム種目追加タブ
  - 削除（確認モーダルあり。種目自体は`is_active=false`の論理削除だが、紐づく`training_sets`は物理削除される点に注意）
  - ⚡ 2026-07-12確認: ドラッグ&ドロップ並び替えは現在のコードには無い（@dnd-kit未使用、上記「前提条件」参照）。標準セット数・標準レップ数の編集UIも無い
- [x] オンボーディング画面（`app/onboarding/page.tsx`）
  - 種目0件のユーザーをリダイレクト
  - 複数種目の一括選択・登録

### STEP 6: メニュー提案ロジック

**完了**
- [x] 提案エンジン（`lib/suggest/engine.ts`）
- [x] トレーニング定数（`lib/constants/training.ts`）
- [x] 提案API（`app/api/suggest/route.ts`）

**実装仕様（原設計からの変更点）**

| 項目 | 原設計 | 現在の実装 |
|---|---|---|
| 基準重量 | 先頭セット | 最大重量（ウォームアップ除外） |
| セット数カウント | 全セット | 最大重量の80%以上のセット |
| RIR・レップ判定 | 全セット | トップセット（最大重量）のみ |
| 提案回数基準 | default_reps | bestTopReps（前回実績最高） |
| ストール判定 | 常時 | レップ達成時のみ |
| セット重量パターン | 直線セット | 前回パターン引き継ぎ（ピラミッド対応） |
| 48時間制限 | - | MIN_DAYS_BETWEEN_SESSIONS = 2 で除外 |
| SetTarget | proposed_sets/reps のみ | proposed_set_targets: SetTarget[] を追加 |

**ヘルパー関数**
- `isHighFatigue()` - 疲労度 >= 4 の判定
- `separateSets()` - ウォームアップ/ワーキング分離
- `getTopSetMetrics()` - トップセットのメトリクス算出
- `generateWorkingSetTargets()` - ワーキングセット目標生成（疲労モデル付き）
- `buildWarmupTargets()` - ウォームアップセット目標生成

### STEP 7: ホーム画面（フェーズ1 MVP時点の記録。⚡ 2026-07-09に`HomeMenu`系は全て削除され`ProgramDayView`に置き換え済み。現在の実装は`detailed_design.md` §6.1参照）

**完了（当時）**
- [x] ホームページ（`app/(app)/page.tsx`）- サーバーコンポーネント
- [x] ~~`HomeMenu` クライアントコンポーネント（スワイプ・追加モーダル）~~（2026-07-09削除）
- [x] ~~`SwipeableExerciseCard` - スワイプ削除対応カード~~（2026-07-09削除）
- [x] ~~スワイプ定数（`lib/constants/swipe.ts`）~~（2026-07-09削除）
- [x] ~~非表示状態の sessionStorage 管理（当日のみ有効）~~（`is_hidden`のDB永続化に置き換え済み）
- [x] ~~7日以上経過の種目: アンバーボーダーで強調表示~~（表示していた`SwipeableExerciseCard`が2026-07-09削除済み。`days_since_last`はエンジン内で今も計算されるが、表示するUIが無い。2026-07-12確認）

**原設計からの追加機能（当時）**
- スワイプ削除（今日はやらない）
- 種目の手動追加モーダル
- 全種目完了時のメッセージ表示

### STEP 8: 記録入力画面

**完了**
- [x] 記録入力画面（`app/(app)/record/page.tsx`）
- [x] SetRow コンポーネント（`done`, `is_warmup`, 自重対応）
- [x] RirToggle コンポーネント（デフォルトは「限界」= false）
- [x] FatigueSelector コンポーネント
- [x] CircleCheck コンポーネント（記録タブ用・全種目表示時の有効化チェック）
- [x] Toast / useToast（`components/ui/Toast.tsx`, `hooks/useToast.ts`）
- [x] セッションAPI（`app/api/sessions/route.ts`）- zodバリデーション付き
- [x] 日付変更 UI（`todayLocalDate()` でローカル日付初期化）
- [x] PWA safe-area 対応（固定ボタンが iOSノッチに隠れない）

**原設計からの変更点**
- `SetData` に `done: boolean`、`is_warmup: boolean` 追加
- `done === true` のセットのみ保存（実施済みフラグ）
- RIRのデフォルトを `false`（限界）に変更（原設計は `true`）
- 自重種目は加重入力をオプション表示（`isBodyweight` フラグで切替）
- ウォームアップ（W）フラグ付きセットはRIRトグルを非表示
- 記録タブからの全種目表示時は CircleCheck で有効/無効を切替可能

**limit 上限の強制（GET /api/sessions）**
```typescript
const limit = Math.min(Math.max(1, rawLimit), 100)  // サーバー側で最大100件に強制
```

### STEP 9: 履歴画面

**完了**
- [x] 履歴画面（`app/(app)/history/page.tsx`）- サーバーコンポーネント
- [x] HistoryClient クライアントコンポーネント
- [x] WeekCalendar - 週次カレンダー（常時表示）
- [x] MonthCalendar - 月次カレンダーモーダル（カレンダーアイコンで開く）
- [x] SessionList - 展開/折り畳み付きセッション一覧
- [x] VolumeChart - recharts での重量推移グラフ（動的ロード）
- [x] 記録編集画面（`app/(app)/record/edit/[sessionId]/page.tsx`）
- [x] 個別セッションAPI（`app/api/sessions/[sessionId]/route.ts`）- GET/PATCH/DELETE

**原設計からの変更点**
- グラフ上部に週次カレンダーを配置（日付選択でセッションを絞り込み）
- 月次カレンダーモーダルで遠い日付に移動可能
- 種目ごとの編集ボタン（`?exerciseId=[id]` クエリで特定種目のみ編集）
- セッション削除機能
- 自重種目のボリュームは回数表示、有酸素種目はkg表示

### STEP 10: Stripe連携（⚡ 2026-07-12更新: 本番稼働済み。「設定待ち」項目を実態に修正）

**コード実装済み・本番稼働中**
- [x] `app/api/stripe/create-subscription/route.ts`
- [x] `app/api/stripe/cancel-subscription/route.ts`
- [x] `app/api/stripe/create-portal-session/route.ts`
- [x] `app/api/stripe/reactivate-subscription/route.ts`
- [x] `app/api/stripe/resume-subscription/route.ts`
- [x] `app/api/webhooks/stripe/route.ts`
- [x] `lib/subscription.ts` - サブスクリプション状態チェック
- [x] 設定画面（`app/(app)/settings/page.tsx`）

**設定画面のプログラム情報（2026-07-01 変更）**
設定画面のプログラム概要・最高重量一覧はコーチングページに統合済み。
設定画面のプログラム関連表示は「リセットボタン」のみ。

| 表示項目 | 設定画面 | コーチングページ |
|---------|---------|--------------|
| Week数・頻度・開始日 | ❌ 削除 | ✅ |
| セッション時間 | ❌ 削除 | ✅（2026-07-01追加）|
| 最高重量一覧（1RM） | ❌ 削除 | ✅ |
| プログラムリセット | ✅ | ❌ |

- [x] Google OAuth 本番設定（Supabase + Google Cloud Console）
- [x] Stripe 本番商品・価格の設定
- [x] 課金状態によるアクセス制御の有効化（`canUseApp()`、`app/(app)/layout.tsx`）

### セキュリティ・品質改善（フェーズ1追加実装）

- [x] zod による全API入力バリデーション（`lib/validation/schemas.ts`）
- [x] APIエラーメッセージの汎用化（内部情報漏洩防止）
- [x] 種目正規化の一元化（`lib/normalize/exercises.ts`）
  - 4箇所に散在していたロジックを1モジュールに集約
  - 不正な筋群値のフォールバック処理

---

## 次フェーズで実装する機能

### フェーズ2: 精度・UX向上
（⚡ 2026-07-12更新: Google OAuth本番設定・Stripe本番設定は完了済みのため項目を削除。STEP10参照）

1. **AIメニュー提案**
   - `lib/suggest/engine.ts` の `suggestMenu` を Anthropic API に切り替え
   - ルールベースはフォールバックとして維持

2. **onboarding の改善**
   - 初回ユーザーへの使い方ガイダンス追加

### フェーズ3: 拡張
- 英語対応
- ネイティブアプリ化
- プッシュ通知

---

## 注意事項・実装上の禁止事項

- **機能を追加しない**: 指示書に記載されていない機能はMVPに含めない
- **HTMLのformタグを使わない**: フォームはReactのイベントハンドラで処理する
- **localStorageを使わない**: 状態管理はReact StateとSupabaseで行う（sessionStorageは短命なキャッシュ・UI状態の受け渡し用途のみ許容。例: `auxlog_program_slot_*`のスロット重量受け渡し、`auxlog_suggest_v1`の提案キャッシュ、`auxlog_hidden_today`のプログラム外種目の当日非表示。永続化が必要なものは`is_hidden`等DBカラムを使う、2026-07-12更新）
- **any型を極力使わない**: TypeScriptのstrictモードに従う
- **インラインスタイルを使わない**: Tailwind CSSクラスのみ使用する（例外: `env(safe-area-inset-bottom)` の動的計算）
- **コメントは日本語で書く**
- **Next.jsのバージョンに注意**: Next.js 16 は `params` が `Promise<...>` 型。`await params` で取得する
- **middleware.ts は使用しない**: 認証チェックはサーバーコンポーネントとAPIルートで実施

---

## ファイル別実装メモ

### lib/suggest/engine.ts
- `TRAINING` 定数は `lib/constants/training.ts` から import
- `suggestMenu` の戻り値は `Suggestion[]`（`proposed_set_targets: SetTarget[]` を含む）
- 提案から除外する条件: `days_since_last < TRAINING.MIN_DAYS_BETWEEN_SESSIONS`
- 7日以上経過のカード強調（`days_since_last >= 7`）を表示していた`SwipeableExerciseCard`は2026-07-09削除済み。`days_since_last`自体は今も計算されるが、表示するUIは現在無い（2026-07-12確認）

### lib/normalize/exercises.ts
- `RawUserExercise` 型（Supabase JOIN 結果）を `UserExercise` 型に変換
- 呼び出し箇所: `app/(app)/page.tsx`, `app/(app)/history/page.tsx`, `app/api/suggest/route.ts`, `app/api/exercises/route.ts`

### app/(app)/record/page.tsx
- `sessionStorage` の `auxlog_hidden_today` キーで非表示種目IDを管理
- `exerciseId` クエリなし（記録タブから遷移）の場合のみ非表示フィルタを適用
- `done === false` のセットは POST 時に除外される

### app/api/sessions/[sessionId]/route.ts
- PATCH は `update_session_with_sets` RPC を試みて、失敗時は3ステップ更新にフォールバック
- RPC 関数の SQL は `lib/sql/update_session_with_sets.sql` に保存

### components/history/HistoryClient.tsx
- `selectedDate` の初期値は `todayLocalDate()` （今日）
- `MonthCalendar` でより古い日付を選択すると `focusDate` が更新され `WeekCalendar` がその週にスクロール
