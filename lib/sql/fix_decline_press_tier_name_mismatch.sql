-- program-slots-tier-matrix.tsvの「デクラインプレス」(tier3)は、実DBの
-- 「デクラインベンチプレス」と名前が一致しておらず、正式なUPDATEが空振りしていた
-- （2026-07-10、tier3以上の名前ズレ全件監査で発見）。
-- 現状は catch-all(tier=3)によって偶然結果が一致しており実害は無いが、
-- 将来TSVの値が変わった場合に静かに反映されなくなるのを防ぐため、
-- 明示的なUPDATEとして記録しておく。

UPDATE exercise_master SET tier = 3 WHERE name = 'デクラインベンチプレス';
