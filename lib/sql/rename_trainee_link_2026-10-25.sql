-- 契約者の名前をトレーナーが後から変えられるようにする（2026-10-25 オーナー決定「案A」）。
-- 名前（trainer_trainee_links.trainee_display_name）はトレーナーだけが見る呼び名で、トレーニー側には出ない。
-- 契約の状態（招待中・契約中・一時停止・終了）に関係なく、自分の契約なら変えられる。自分自身の行は対象外。

begin;

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

commit;
