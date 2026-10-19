-- update_recent_session_ids を本人の種目だけ更新するよう制限する（2026-10-19）
--
-- 背景: SECURITY DEFINER でRLSをバイパスするのに所有者チェックがなく、他人の
-- user_exercises.id を指定すると recent_session_ids を書き換えられた。
-- 呼び出し元は app/api/sessions/route.ts の1か所のみで、ユーザーのJWTで呼んでいるため
-- auth.uid() は常に本人になる。あわせて SECURITY DEFINER 関数の定石として search_path を固定する。

CREATE OR REPLACE FUNCTION public.update_recent_session_ids(p_exercise_ids uuid[], p_session_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  update user_exercises
  set recent_session_ids = (
    array_prepend(p_session_id, coalesce(recent_session_ids, '{}'))
  )[1:3]
  where id = any(p_exercise_ids)
    and user_id = auth.uid();
$function$;
