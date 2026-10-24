-- 種目マスタに人が読める一意のキー（code）を追加する（2026-10-24 オーナー承認: 種目の指定は一意の識別子で）。
-- 「Auxlogで作成」のベーステンプレート（固定テンプレート方式）は、種目をこの code で指定する。
-- 名前を直してもテンプレートが壊れないよう、名前ではなく code を使う。小文字英数字とアンダースコアのみ。

begin;

alter table public.exercise_master add column code text;

update public.exercise_master m set code = v.code
from (values
  ('バーベルベンチプレス', 'barbell_bench_press'),
  ('インクラインベンチプレス', 'incline_bench_press'),
  ('ダンベルベンチプレス', 'dumbbell_bench_press'),
  ('ディップス', 'dips'),
  ('インクラインダンベルプレス', 'incline_dumbbell_press'),
  ('チェストプレス', 'chest_press_machine'),
  ('プッシュアップ', 'push_up'),
  ('デクラインベンチプレス', 'decline_bench_press'),
  ('ナローベンチプレス', 'narrow_bench_press'),
  ('ワンハンドケーブルフライ', 'one_hand_cable_fly'),
  ('ダンベルフライ', 'dumbbell_fly'),
  ('ケーブルフライ', 'cable_fly'),
  ('ペックデックフライ', 'pec_deck_fly'),
  ('ケーブルクロスオーバー', 'cable_crossover'),
  ('ケーブルフライ（上部）', 'cable_fly_upper'),
  ('ケーブルフライ（下部）', 'cable_fly_lower'),
  ('ケーブルフライ（中部）', 'cable_fly_middle'),
  ('デッドリフト', 'deadlift'),
  ('デッドリフト（スモウ）', 'sumo_deadlift'),
  ('ベントオーバーロウ', 'bent_over_row'),
  ('シーテッドケーブルロウ', 'seated_cable_row'),
  ('チェストサポーテッドロウ', 'chest_supported_row'),
  ('ワンハンドロウ', 'one_hand_row'),
  ('ダンベルロウ', 'dumbbell_row'),
  ('Tバーロウ', 't_bar_row'),
  ('フェイスプル', 'face_pull'),
  ('懸垂', 'pull_up'),
  ('ラットプルダウン', 'lat_pulldown'),
  ('ストレートアームプルダウン', 'straight_arm_pulldown'),
  ('ケーブルサイドレイズ', 'cable_side_raise'),
  ('インクラインサイドレイズ', 'incline_side_raise'),
  ('サイドレイズ', 'side_raise'),
  ('アップライトロウ', 'upright_row'),
  ('フロントレイズ', 'front_raise'),
  ('リバースペックフライ', 'reverse_pec_fly'),
  ('リアデルトフライ', 'rear_delt_fly'),
  ('オーバーヘッドプレス', 'overhead_press'),
  ('ダンベルショルダープレス', 'dumbbell_shoulder_press'),
  ('バイキングプレス', 'viking_press'),
  ('シーテッドバーベルショルダープレス', 'seated_barbell_shoulder_press'),
  ('マシンショルダープレス', 'machine_shoulder_press'),
  ('アーノルドプレス', 'arnold_press'),
  ('スタンディングカーフレイズ', 'standing_calf_raise'),
  ('シーテッドカーフレイズ', 'seated_calf_raise'),
  ('カーフレイズ', 'calf_raise'),
  ('ヒップアブダクション', 'hip_abduction'),
  ('ヒップアダクション', 'hip_adduction'),
  ('ルーマニアンデッドリフト', 'romanian_deadlift'),
  ('ヒップスラスト', 'hip_thrust'),
  ('レッグエクステンション', 'leg_extension'),
  ('レッグカール', 'leg_curl'),
  ('シーテッドレッグカール', 'seated_leg_curl'),
  ('ハイバースクワット', 'high_bar_squat'),
  ('ローバースクワット', 'low_bar_squat'),
  ('ブルガリアンスクワット', 'bulgarian_split_squat'),
  ('ハックスクワット', 'hack_squat'),
  ('レッグプレス', 'leg_press'),
  ('ランジ', 'lunge'),
  ('レッグプレス（ナロウ）', 'leg_press_narrow'),
  ('トライセプスプレスダウン', 'triceps_pushdown'),
  ('ライイングトライセプスEX', 'lying_triceps_extension'),
  ('ケーブルオーバーヘッドEX', 'cable_overhead_extension'),
  ('ケーブルニーリングオーバーEX', 'cable_kneeling_overhead_extension'),
  ('スカルクラッシャー', 'skull_crusher'),
  ('トライセプスオーバーヘッドエクステンション', 'triceps_overhead_extension'),
  ('ケーブルトライセプスエクステンション', 'cable_triceps_extension'),
  ('バーベルカール', 'barbell_curl'),
  ('インクラインダンベルカール', 'incline_dumbbell_curl'),
  ('EZバーカール', 'ez_bar_curl'),
  ('プリチャーハンマーカール', 'preacher_hammer_curl'),
  ('膝ケーブルプリチャーカール', 'kneeling_cable_preacher_curl'),
  ('ダンベルカール', 'dumbbell_curl'),
  ('ハンマーカール', 'hammer_curl'),
  ('プリーチャーカール', 'preacher_curl'),
  ('ケーブルカール', 'cable_curl'),
  ('ベイジアンカール', 'bayesian_curl'),
  ('クローズグリップベンチプレス', 'close_grip_bench_press'),
  ('アブローラー', 'ab_roller'),
  ('ケーブルクランチ', 'cable_crunch'),
  ('レッグレイズ', 'leg_raise'),
  ('クランチ', 'crunch'),
  ('ハンギングニーレイズ', 'hanging_knee_raise')
) as v(name, code)
where m.name = v.name;

-- 全種目に code が付いたことを確認してから、必須・一意にする
do $$
begin
  if exists (select 1 from public.exercise_master where code is null) then
    raise exception 'exercise_master.code が付いていない種目があります';
  end if;
end $$;

alter table public.exercise_master alter column code set not null;
alter table public.exercise_master add constraint exercise_master_code_format check (code ~ '^[a-z0-9_]+$');
create unique index exercise_master_code_key on public.exercise_master (code);

commit;
