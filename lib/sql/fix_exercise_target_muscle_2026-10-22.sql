-- 種目の部位（target_muscle）を、プログラムの中での役割（movement_pattern）に合わせる（2026-10-22 オーナー決定 a）
--
-- テンプレート編集の部位別の一覧で、デッドリフトやフェイスプルが「背中」に並び、週3日のプログラムで
-- 背中が5種目に見えていた。実際の枠はデッドリフト＝脚（ヒップヒンジ）、フェイスプル＝肩（後部）。
-- 種目の割り当ては movement_pattern で決まるので、この変更でプログラムの中身は変わらない
-- （変わるのは部位の表示と、部位ごとの集計）。
-- クローズグリップベンチプレス（arms / horizontal_press）は三頭狙いの種目として腕のまま残す。

begin;

update public.exercise_master set target_muscle = 'legs'
where name in ('デッドリフト', 'デッドリフト（スモウ）') and movement_pattern = 'hip_hinge' and target_muscle = 'back';

update public.exercise_master set target_muscle = 'shoulders'
where name = 'フェイスプル' and movement_pattern = 'shoulder_horizontal_abduction' and target_muscle = 'back';

commit;
