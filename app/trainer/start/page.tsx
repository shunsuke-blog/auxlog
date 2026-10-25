import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrainerProfile } from '@/lib/trainer/session'
import TrainerStartForm from './TrainerStartForm'

// トレーナーの入口（LPの「トレーナーとして始める」から来る）。未ログインならログイン後にここへ戻し、
// 登録済みならトレーナー画面へ。トレーニー向けのオンボーディング（BIG3入力・プログラム生成）は通らない。
export default async function TrainerStartPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/trainer/start')

  if (await getTrainerProfile(supabase, user.id)) redirect('/trainer/dashboard')

  const { data: userRow } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
  const isGymOwner = userRow?.account_type === 'gym_owner'

  return (
    <div className="light-only min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-white">トレーナーとして始める</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            クライアントに表示される名前を入力してください。
            <br />
            クライアント3人までは無料で使えます。
          </p>
        </div>
        {isGymOwner ? (
          <p className="text-sm text-red-500 text-center">ジム経営者のアカウントではトレーナー登録できません。</p>
        ) : (
          <TrainerStartForm email={user.email ?? null} />
        )}
      </div>
    </div>
  )
}
