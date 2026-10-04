-- Migration 006 — Nội dung cho khu vực Trung Cấp (Sơn Cốc, Thâm Lâm).
-- Chạy sau 001–005. Chỉ thêm dữ liệu (quái/đồ/rơi đồ), không đổi cấu trúc bảng.

insert into monster_defs (id, name, tier, level, exp_reward, gold_min, gold_max, min_kill_interval_ms) values
  ('rock_golem', 'Nham Thạch Quái', 'normal', 12, 55, 15, 30, 1200),
  ('shadow_wolf', 'Ảnh Lang', 'elite', 15, 90, 25, 45, 1500),
  ('mountain_king', 'Sơn Vương', 'boss', 18, 650, 300, 450, 25000),
  ('phantom_wolf', 'U Ảnh Lang', 'normal', 17, 70, 20, 35, 1200),
  ('blood_bat', 'Huyết Sí Bức', 'elite', 19, 110, 35, 55, 1500),
  ('forest_wraith', 'Lâm Vong Hồn', 'boss', 22, 850, 400, 600, 30000)
on conflict (id) do update set
  name = excluded.name, tier = excluded.tier, level = excluded.level,
  exp_reward = excluded.exp_reward, gold_min = excluded.gold_min,
  gold_max = excluded.gold_max, min_kill_interval_ms = excluded.min_kill_interval_ms;

insert into item_templates (id, name, slot, quality, icon, base_atk, base_def, level_req, stackable, max_stack) values
  ('rock_plate_armor', 'Giáp Nham Thạch', 'body', 'tot', '🛡️', 0, 14, 12, false, 1),
  ('rock_fist_gauntlet', 'Găng Thạch Quyền', 'hands', 'tot', '🥊', 6, 3, 12, false, 1),
  ('shadow_wolf_claw', 'Móng Ảnh Lang', 'weapon', 'hiem', '🗡️', 16, 0, 15, false, 1),
  ('sonvuong_greatmace', 'Trọng Chuỳ Sơn Vương', 'weapon', 'suthi', '🔨', 32, 4, 18, false, 1),
  ('sonvuong_helm', 'Đầu Khôi Sơn Vương', 'head', 'suthi', '⛑️', 0, 20, 18, false, 1),
  ('phantom_leather_boots', 'Ủng Ảnh Bộ', 'feet', 'tot', '👢', 4, 6, 17, false, 1),
  ('blood_bat_wing_cloak', 'Áo Cánh Huyết Sí', 'body', 'hiem', '🧥', 10, 12, 19, false, 1),
  ('lamvonghon_robe', 'Vong Y Lâm Vong Hồn', 'body', 'huyenthoai', '👘', 20, 30, 22, false, 1),
  ('lamvonghon_pendant', 'Hồn Ngọc Bội', 'neck', 'huyenthoai', '📿', 18, 10, 22, false, 1)
on conflict (id) do update set
  name = excluded.name, slot = excluded.slot, quality = excluded.quality, icon = excluded.icon,
  base_atk = excluded.base_atk, base_def = excluded.base_def, level_req = excluded.level_req,
  stackable = excluded.stackable, max_stack = excluded.max_stack;

insert into monster_drops (monster_id, item_template_id, drop_chance) values
  ('rock_golem', 'rock_plate_armor', 0.10),
  ('rock_golem', 'rock_fist_gauntlet', 0.12),
  ('shadow_wolf', 'shadow_wolf_claw', 0.18),
  ('mountain_king', 'sonvuong_greatmace', 0.4),
  ('mountain_king', 'sonvuong_helm', 0.4),
  ('phantom_wolf', 'phantom_leather_boots', 0.12),
  ('blood_bat', 'blood_bat_wing_cloak', 0.16),
  ('forest_wraith', 'lamvonghon_robe', 0.35),
  ('forest_wraith', 'lamvonghon_pendant', 0.35)
on conflict (monster_id, item_template_id) do update set drop_chance = excluded.drop_chance;
