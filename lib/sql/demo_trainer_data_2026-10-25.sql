-- スクリーンショット用のデモデータの作り方（2026-10-25 本番に適用済み）。テンプレートは「Auxlogで作成」と同じ
-- generateFromBaseTemplate で生成して create_generated_template に渡した（3種類: 筋肥大 中級者 週3日・ボディメイク 女性 週2日・はじめての筋トレ 週3日）。
-- その後、山本陽介（停滞のデモ）の記録を調整した。消す時は demo_trainer_delete.sql。
-- ── 2. クライアントのアカウント（架空。届かないアドレス @demo.auxlog.invalid、誰もログインできない） ──
-- 新規登録の通知メール（auth.users のトリガー）を送らないよう、この部分だけトリガーを止めて public.users も直接入れる
create temp table _cl (
  key text, name text, email text, tpl text, cw int, done_days int, k int, factor numeric,
  mode text, uid uuid, link uuid, plan uuid, code text, start_date date
);
insert into _cl (key, name, email, tpl, cw, done_days, k, factor, mode) values
  ('tanaka',    '田中 健太',   'tanaka.kenta@demo.auxlog.invalid',    'T1', 6, 2, 3, 1.00, 'growing'),
  ('takahashi', '高橋 大輔',   'takahashi.daisuke@demo.auxlog.invalid','T1', 9, 1, 1, 1.15, 'growing'),
  ('yamamoto',  '山本 陽介',   'yamamoto.yosuke@demo.auxlog.invalid', 'T1', 5, 1, 2, 0.95, 'stalled'),
  ('watanabe',  '渡辺 翔',     'watanabe.sho@demo.auxlog.invalid',    'T1', 4, 0, 6, 0.90, 'stopped'),
  ('suzuki',    '鈴木 美咲',   'suzuki.misaki@demo.auxlog.invalid',   'T2', 5, 1, 2, 0.55, 'growing'),
  ('ito',       '伊藤 優奈',   'ito.yuna@demo.auxlog.invalid',        'T3', 3, 2, 4, 0.50, 'growing'),
  ('nakamura',  '中村 さくら', null,                                  'T2', 0, 0, 0, 0.55, 'invited');
update _cl set uid = gen_random_uuid() where email is not null;
update _cl set start_date = (select today from _cfg) - (cw - 1) * 7 - k where mode <> 'invited';

set local session_replication_role = replica;
-- トークン類の列は空文字にする（NULL だと Supabase のログインが「Database error finding user」で失敗する）
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmation_token, recovery_token, email_change_token_new, email_change, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, '', '', '', '', '', now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('demo', true)
from _cl where uid is not null;
insert into public.users (id, email) select uid, email from _cl where uid is not null;
set local session_replication_role = origin;

-- ── 3. 招待コードの発行 → コードの入力（アプリと同じ DB 関数）。デモのトレーナーだけ無料枠（3名）を一時的に外す ──
create or replace function public.trainer_trainee_limit(p_trainer uuid)
returns int language sql stable security definer set search_path = public
as $$ select 100 $$;

do $$
declare c record; t record; v jsonb; one_rms jsonb;
begin
  for c in select * from _cl order by key loop
    perform set_config('request.jwt.claims', json_build_object('sub', (select trainer from _cfg), 'role', 'authenticated')::text, true);
    -- テンプレートの1RM管理種目に、クライアントの強さ（factor）に合わせた1RMを入れる
    select coalesce(jsonb_agg(jsonb_build_object('exercise_master_id', em.id, 'one_rm_kg', public.round_to_plate(
      (case em.code
        when 'barbell_bench_press' then 92.5 when 'incline_bench_press' then 75 when 'dumbbell_bench_press' then 34
        when 'dips' then 20 when 'incline_dumbbell_press' then 28 when 'narrow_bench_press' then 80 when 'deadlift' then 150
        when 'overhead_press' then 57.5 when 'dumbbell_shoulder_press' then 24 when 'viking_press' then 60
        when 'high_bar_squat' then 115 when 'low_bar_squat' then 125 when 'hack_squat' then 140 when 'leg_press' then 220 else 60 end) * c.factor))), '[]'::jsonb)
      into one_rms
    from (select distinct pe.exercise_master_id from plan_exercises pe join plan_days d on d.id = pe.plan_day_id
          where d.plan_id = (select id from _tpl where key = c.tpl) and pe.exercise_master_id is not null) x
    join exercise_master em on em.id = x.exercise_master_id and em.requires_one_rm;
    v := public.add_trainee_with_plan(c.name, (select id from _tpl where key = c.tpl), one_rms);
    update _cl set link = (v->>'link_id')::uuid, plan = (v->>'plan_id')::uuid, code = v->>'code' where key = c.key;
    if c.mode <> 'invited' then
      perform set_config('request.jwt.claims', json_build_object('sub', c.uid, 'role', 'authenticated')::text, true);
      perform public.redeem_trainer_invite(v->>'code', c.start_date);
    end if;
  end loop;
end $$;

-- 無料枠をもとに戻す（このトランザクションの外からは一時的な変更は見えない）
create or replace function public.trainer_trainee_limit(p_trainer uuid)
returns int language sql stable security definer set search_path = public
as $$ select 3 $$;
select set_config('request.jwt.claims', '', true);

-- ── 4. 記録（プランの各週・各 Day。週3日は月水金、週2日は月木） ──
-- 重量が空欄（自動）の種目の重さ: 部位ごとの基準 × 強さ、2週ごとに+2.5kg（自重・時間の種目は0kg）
create function pg_temp.auto_kg(muscle text, bodyweight boolean, factor numeric, week int) returns numeric language sql immutable as $$
  select case when bodyweight then 0 else public.round_to_plate(
    (case muscle when 'chest' then 22.5 when 'back' then 55 when 'shoulders' then 10 when 'arms' then 15 when 'legs' then 60 else 15 end) * factor
    + 2.5 * floor((week - 1) / 2)) end
$$;

do $$
declare
  c record; d record; pe record; ps record;
  v_sess uuid; v_ue uuid; v_day date; v_offsets int[]; v_kg numeric; v_reps int; v_n int;
  v_today date := (select today from _cfg);
  v_memos text[] := array['フォームを意識して丁寧にできた', '睡眠不足で少し重く感じた', 'ベンチの最後のセットがきつかった', '調子が良い。重量を上げたい', '脚が筋肉痛だったが完走'];
begin
  for c in select * from _cl where mode <> 'invited' loop
    v_offsets := case when c.tpl = 'T2' then array[0, 3] else array[0, 2, 4] end;
    for d in select * from plan_days where plan_id = c.plan and week_number <= c.cw order by week_number, day_number loop
      -- 今週は done_days 日分だけ。止まっている人（渡辺）は今週の記録なし
      continue when d.week_number = c.cw and d.day_number > c.done_days;
      v_day := c.start_date + (d.week_number - 1) * 7 + v_offsets[d.day_number];
      continue when v_day > v_today;
      v_n := v_n;
      insert into training_sessions (user_id, trained_at, fatigue_level, memo, created_at)
      values (c.uid, v_day, 2 + (d.week_number + d.day_number) % 3,
              case when (d.week_number * 3 + d.day_number) % 4 = 0 then v_memos[1 + (d.week_number + d.day_number) % 5] end,
              (v_day + time '19:30' + make_interval(mins => (d.day_number * 17) % 50)) at time zone 'Asia/Tokyo')
      returning id into v_sess;

      for pe in
        select x.*, em.target_muscle, em.is_bodyweight, em.requires_one_rm, em.name
        from plan_exercises x join exercise_master em on em.id = x.exercise_master_id
        where x.plan_day_id = d.id order by x.sort_order
      loop
        -- 山本さんは直近2週、同じ種目（その Day の最後の補助種目）をスキップ
        if c.mode = 'stalled' and d.week_number >= c.cw - 1 and pe.sort_order = (select max(sort_order) from plan_exercises where plan_day_id = d.id) then
          insert into plan_exercise_skips (plan_exercise_id, trainee_id, skipped_at) values (pe.id, c.uid, (v_day + time '20:30') at time zone 'Asia/Tokyo') on conflict do nothing;
          continue;
        end if;
        select id into v_ue from user_exercises where user_id = c.uid and exercise_master_id = pe.exercise_master_id;
        if v_ue is null then
          insert into user_exercises (user_id, exercise_master_id, is_bodyweight) values (c.uid, pe.exercise_master_id, pe.is_bodyweight) returning id into v_ue;
        end if;
        for ps in select * from plan_sets where plan_exercise_id = pe.id order by set_number loop
          v_kg := coalesce(ps.target_weight_kg, pg_temp.auto_kg(pe.target_muscle, pe.is_bodyweight, c.factor, d.week_number));
          v_reps := ps.target_reps;
          -- 伸びている人は後半の週で目標より1回多くできた／停滞している人は直近3週で重さを落とし回数も届かなかった
          if c.mode = 'growing' and pe.requires_one_rm and not ps.is_warmup and v_day >= v_today - 27 then v_reps := v_reps + 1; end if;
          if c.mode = 'stalled' and pe.requires_one_rm and not ps.is_warmup and v_day >= v_today - 20 then
            v_kg := public.round_to_plate(v_kg * 0.93); v_reps := greatest(1, v_reps - 1);
          end if;
          -- MaxOut 週の1セット目（できる限り多く）は実際の回数
          if ps.target_reps = 1 and not ps.is_warmup and ps.target_pct_1rm is not null then v_reps := 4 + (d.day_number % 3); end if;
          insert into training_sets (session_id, exercise_id, set_number, weight_kg, reps, rir, is_warmup, plan_exercise_id)
          values (v_sess, v_ue, ps.set_number, v_kg, v_reps, true, ps.is_warmup, pe.id);
        end loop;
        v_ue := null;
      end loop;
    end loop;
  end loop;
end $$;

-- 鈴木さんは今週、プラン外の種目（アブローラー）も記録した
do $$
declare c record; v_ue uuid; v_sess uuid; v_em uuid := (select id from exercise_master where name = 'アブローラー' limit 1);
begin
  select * into c from _cl where key = 'suzuki';
  if v_em is null then return; end if;
  insert into user_exercises (user_id, exercise_master_id, is_bodyweight) values (c.uid, v_em, true) returning id into v_ue;
  insert into training_sessions (user_id, trained_at, fatigue_level, memo, created_at)
  values (c.uid, (select today from _cfg) - 1, 2, '家で腹筋を追加', ((select today from _cfg) - 1 + time '21:10') at time zone 'Asia/Tokyo')
  returning id into v_sess;
  insert into training_sets (session_id, exercise_id, set_number, weight_kg, reps, rir, is_warmup) values
    (v_sess, v_ue, 1, 0, 12, true, false), (v_sess, v_ue, 2, 0, 10, true, false), (v_sess, v_ue, 3, 0, 10, true, false);
end $$;

-- ── 5. 日付を合わせる（コードの入力・プランの開始・今の週） ──
update trainer_trainee_links l set started_at = ((c.start_date - 2) + time '12:05') at time zone 'Asia/Tokyo'
from _cl c where l.id = c.link and c.mode <> 'invited';
update coaching_plans p set
  status = 'active', start_date = c.start_date, current_week = c.cw,
  started_at = (select min(s.created_at) from training_sessions s where s.user_id = c.uid),
  current_week_started_at = (c.start_date + (c.cw - 1) * 7) at time zone 'Asia/Tokyo', updated_at = now()
from _cl c where p.id = c.plan and c.mode <> 'invited';
-- 中村さんは今日招待した（コードは未入力）
update trainer_trainee_links l set created_at = now() - interval '3 hours' from _cl c where l.id = c.link and c.mode = 'invited';

-- ── 6. 自己ベストを記録から計算（保存時の計算と同じ） ──
insert into exercise_bests (user_id, exercise_id, best_weight_kg, best_reps, best_volume, best_total_reps, updated_at)
select t.user_id, t.exercise_id, t.weight_kg, t.reps, s.vol, s.tr, now()
from (select distinct on (se.user_id, ts.exercise_id) se.user_id, ts.exercise_id, ts.weight_kg, ts.reps
      from training_sets ts join training_sessions se on se.id = ts.session_id
      where not ts.is_warmup and se.user_id in (select uid from _cl) order by se.user_id, ts.exercise_id, ts.weight_kg desc, ts.reps desc) t
join (select user_id, exercise_id, max(vol) vol, max(tr) tr from (
        select se.user_id, ts.exercise_id, ts.session_id, sum(ts.weight_kg * ts.reps) vol, sum(ts.reps) tr
        from training_sets ts join training_sessions se on se.id = ts.session_id
        where not ts.is_warmup and se.user_id in (select uid from _cl) group by 1, 2, 3) x group by 1, 2) s using (user_id, exercise_id);
