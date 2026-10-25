begin;
-- 契約者の名前をトレーナーが後から変えられるようにする（2026-10-25 オーナー決定「案A」）。
-- 名前（trainer_trainee_links.trainee_display_name）はトレーナーだけが見る呼び名で、トレーニー側には出ない。
-- 契約の状態（招待中・契約中・一時停止・終了）に関係なく、自分の契約なら変えられる。自分自身の行は対象外。


create or replace function public.rename_trainee_link(p_link_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.assert_trainer();
  v_name text := btrim(p_display_name);
begin
  if v_name is null or char_length(v_name) = 0 or char_length(v_name) > 40 then
    raise exception 'display name must be 1-40 characters' using errcode = '22023';
  end if;
  update trainer_trainee_links
  set trainee_display_name = v_name
  where id = p_link_id and trainer_id = v_uid and trainee_id is distinct from trainer_id;
  if not found then
    raise exception 'link not found' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.rename_trainee_link(uuid, text) from public, anon;
grant execute on function public.rename_trainee_link(uuid, text) to authenticated;

create temp table _r (test text, ok boolean) on commit drop;
grant insert, select on _r to authenticated;
set local role authenticated;
-- トレーナー本人
select set_config('request.jwt.claims', json_build_object('sub','1764eb2d-ab8e-4508-86e4-0e1fd4d64cf7','role','authenticated')::text, true);
select public.rename_trainee_link('7d112af4-8af1-4159-8aae-e53e9b85e8b2', '  新しい名前  ');
insert into _r select 'T1 自分の契約者は前後の空白を除いて変えられる', (select trainee_display_name = '新しい名前' from trainer_trainee_links where id = '7d112af4-8af1-4159-8aae-e53e9b85e8b2');
do $$ begin perform public.rename_trainee_link('7d112af4-8af1-4159-8aae-e53e9b85e8b2', '   '); insert into _r values ('T2 空の名前は拒否', false);
exception when others then insert into _r values ('T2 空の名前は拒否', sqlstate = '22023'); end $$;
do $$ begin perform public.rename_trainee_link('7d112af4-8af1-4159-8aae-e53e9b85e8b2', repeat('あ', 41)); insert into _r values ('T3 41文字は拒否', false);
exception when others then insert into _r values ('T3 41文字は拒否', sqlstate = '22023'); end $$;
-- 他人（トレーニー本人）は変えられない
select set_config('request.jwt.claims', json_build_object('sub','db84c635-57c3-4a28-af44-914909b74277','role','authenticated')::text, true);
do $$ begin perform public.rename_trainee_link('7d112af4-8af1-4159-8aae-e53e9b85e8b2', '乗っ取り'); insert into _r values ('T4 トレーナー以外は変えられない', false);
exception when others then insert into _r values ('T4 トレーナー以外は変えられない', sqlstate = '42501'); end $$;
reset role;
select test, ok from _r order by test;
rollback;
