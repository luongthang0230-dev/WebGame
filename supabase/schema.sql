-- ============================================================
-- PHASE 1 SCHEMA — Tài khoản, Nhân vật, Hệ thống Admin
-- Chạy trong Supabase SQL Editor. Các bảng gameplay (quests,
-- items, maps...) sẽ được thêm ở các phase sau, không phá vỡ
-- các bảng này.
-- ============================================================

-- 1) PROFILES — mở rộng auth.users, chứa vai trò (role)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null default 'player' check (role in ('player','moderator','admin','owner')),
  is_banned boolean not null default false,
  ban_reason text,
  created_at timestamptz not null default now()
);

-- 2) CHARACTERS — mỗi account có thể có nhiều nhân vật (giới hạn ở API)
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text unique not null,
  class text not null default 'kiem',
  level int not null default 1,
  exp bigint not null default 0,
  hp int not null default 120,
  hp_max int not null default 120,
  mp int not null default 50,
  mp_max int not null default 50,
  gold bigint not null default 0,
  str int not null default 5,
  dex int not null default 5,
  int_ int not null default 5,
  con int not null default 5,
  map_id text not null default 'village',
  pos_x real not null default 640,
  pos_y real not null default 448,
  is_online boolean not null default false,
  is_frozen boolean not null default false,   -- admin có thể đóng băng nhân vật
  is_invisible boolean not null default false, -- admin ẩn thân để kiểm tra
  gm_mode boolean not null default false,      -- bật chế độ admin trong game
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) ADMIN ACTION LOGS — mọi hành động admin đều bị ghi lại, không thể tắt
create table if not exists admin_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles(id),
  actor_name text not null,
  action text not null,           -- ví dụ: 'give_gold', 'teleport', 'ban', 'spawn_monster'
  target_character_id uuid references characters(id),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 4) BANS — lịch sử ban/unban tách riêng khỏi profiles để audit
create table if not exists bans (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id),
  banned_by uuid references profiles(id),
  reason text,
  expires_at timestamptz, -- null = vĩnh viễn
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- 5) ANNOUNCEMENTS — admin gửi thông báo toàn server
create table if not exists announcements (
  id bigint generated always as identity primary key,
  sender_id uuid references profiles(id),
  message text not null,
  level text not null default 'info' check (level in ('info','event','warning')),
  created_at timestamptz not null default now()
);

-- 6) GM COMMAND QUEUE — lệnh gõ trong game (vd /give, /tp) được ghi vào đây,
--    client của người chơi mục tiêu lắng nghe qua Supabase Realtime để áp dụng
--    hiệu ứng tức thời (teleport, hiệu ứng, kick khỏi map...)
create table if not exists gm_commands (
  id bigint generated always as identity primary key,
  issued_by uuid references profiles(id),
  target_character_id uuid references characters(id),
  command text not null,       -- 'teleport' | 'kick' | 'freeze' | 'effect' | 'message'
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_characters_profile on characters(profile_id);
create index if not exists idx_gm_commands_target on gm_commands(target_character_id, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- Nguyên tắc: client (anon key) chỉ được đọc/ghi DỮ LIỆU CỦA CHÍNH MÌNH.
-- Mọi thao tác admin (give gold, ban, spawn...) đi qua API route dùng
-- SERVICE ROLE KEY ở server, route đó tự kiểm tra role trước khi chạy,
-- nên RLS ở đây không cần "cho phép admin" — admin không dùng anon key.
-- ============================================================
alter table profiles enable row level security;
alter table characters enable row level security;
alter table admin_logs enable row level security;
alter table bans enable row level security;
alter table announcements enable row level security;
alter table gm_commands enable row level security;

create policy "profiles: xem chính mình" on profiles
  for select using (auth.uid() = id);
create policy "profiles: tự sửa vài trường" on profiles
  for update using (auth.uid() = id);

create policy "characters: xem nhân vật của mình" on characters
  for select using (auth.uid() = profile_id);
create policy "characters: xem người chơi khác trong map (public info)" on characters
  for select using (true); -- cần thấy người khác trên map; dữ liệu nhạy cảm (gold...) nên lọc ở tầng API/view sau
create policy "characters: tạo nhân vật của chính mình" on characters
  for insert with check (auth.uid() = profile_id);

-- ============================================================
-- PHASE 3 — RPC đồng bộ vị trí/HP/MP do CLIENT gọi trực tiếp.
-- Không cho phép UPDATE cột tuỳ ý qua RLS (sẽ hở gold/exp/level),
-- nên client chỉ được gọi qua function này, function chỉ đụng tới
-- đúng các cột không quan trọng về kinh tế (vị trí, hp/mp hiện tại).
-- Muốn đổi gold/exp/level bắt buộc phải qua API admin hoặc, ở các
-- phase sau, qua API combat/quest chạy trên server.
-- ============================================================
create or replace function update_character_runtime(
  p_character_id uuid,
  p_map_id text,
  p_pos_x real,
  p_pos_y real,
  p_hp int,
  p_mp int
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update characters
  set map_id = p_map_id,
      pos_x = p_pos_x,
      pos_y = p_pos_y,
      hp = greatest(0, least(p_hp, hp_max)),
      mp = greatest(0, least(p_mp, mp_max)),
      updated_at = now()
  where id = p_character_id
    and profile_id = auth.uid(); -- chặn sửa nhân vật của người khác
end;
$$;

revoke all on function update_character_runtime from public;
grant execute on function update_character_runtime to authenticated;

create policy "announcements: ai cũng đọc được" on announcements
  for select using (true);

create policy "gm_commands: chỉ đọc lệnh nhắm vào mình" on gm_commands
  for select using (
    target_character_id in (select id from characters where profile_id = auth.uid())
  );

-- admin_logs và bans: KHÔNG có policy select cho client -> mặc định chặn hết,
-- chỉ server (service role, bỏ qua RLS) mới đọc/ghi được.

-- ==== PHASE 4 additions (combat rewards) — xem chi tiết trong supabase/migrations/003_phase4_combat.sql ====
-- Migration 003 — Combat rewards (server-authoritative).
-- Chạy file này trong SQL Editor. Nếu là setup mới, chạy sau schema.sql +
-- 002_phase3_characters.sql theo đúng thứ tự.
--
-- Vì sao cần bảng/():
-- Chiến đấu (va chạm, hoạt ảnh, sát thương lên quái) chạy ở client (Phaser)
-- cho mượt, NHƯNG phần thưởng (exp/gold/lên cấp) phải do SERVER tính và ghi,
-- nếu không người chơi có thể sửa client để tự cộng exp vô hạn. Client chỉ
-- được gọi RPC "tôi vừa hạ con quái loại X", server tự tra bảng thưởng,
-- kiểm tra tốc độ gọi (chống spam) rồi mới cộng.

create table if not exists monster_defs (
  id text primary key,
  name text not null,
  tier text not null default 'normal' check (tier in ('normal','elite','boss')),
  level int not null default 1,
  exp_reward int not null,
  gold_min int not null,
  gold_max int not null,
  min_kill_interval_ms int not null default 1200 -- chống spam gọi RPC nhanh hơn thời gian hạ gục hợp lý
);

insert into monster_defs (id, name, tier, level, exp_reward, gold_min, gold_max, min_kill_interval_ms) values
  ('wolf', 'Sói Hoang', 'normal', 1, 14, 3, 8, 1200),
  ('bamboo_demon', 'Trúc Yêu', 'normal', 6, 34, 8, 18, 1500),
  ('wolf_king', 'Sói Vương', 'boss', 10, 420, 150, 250, 20000)
on conflict (id) do update set
  name = excluded.name, tier = excluded.tier, level = excluded.level,
  exp_reward = excluded.exp_reward, gold_min = excluded.gold_min,
  gold_max = excluded.gold_max, min_kill_interval_ms = excluded.min_kill_interval_ms;

create table if not exists kill_cooldowns (
  character_id uuid not null references characters(id) on delete cascade,
  monster_id text not null references monster_defs(id),
  last_at timestamptz not null default now(),
  primary key (character_id, monster_id)
);
alter table kill_cooldowns enable row level security;
-- Không có policy select/insert cho client -> chỉ function SECURITY DEFINER bên dưới đụng được.

create or replace function grant_kill_reward(p_character_id uuid, p_monster_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_def record;
  v_last timestamptz;
  v_level int; v_exp bigint; v_gold bigint; v_con int; v_int int; v_hp int; v_mp int;
  v_needed bigint;
  v_leveled boolean := false;
  v_gold_gained int;
  v_hp_max int; v_mp_max int;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Không có quyền trên nhân vật này';
  end if;

  select * into v_def from monster_defs where id = p_monster_id;
  if not found then
    raise exception 'Loại quái không hợp lệ: %', p_monster_id;
  end if;

  select last_at into v_last from kill_cooldowns where character_id = p_character_id and monster_id = p_monster_id;
  if v_last is not null and now() - v_last < make_interval(secs => v_def.min_kill_interval_ms / 1000.0) then
    raise exception 'Thao tác quá nhanh, thử lại sau';
  end if;
  insert into kill_cooldowns (character_id, monster_id, last_at) values (p_character_id, p_monster_id, now())
    on conflict (character_id, monster_id) do update set last_at = now();

  v_gold_gained := v_def.gold_min + floor(random() * (v_def.gold_max - v_def.gold_min + 1));

  select level, exp, con, int_, gold into v_level, v_exp, v_con, v_int, v_gold
  from characters where id = p_character_id for update;

  v_exp := v_exp + v_def.exp_reward;
  loop
    v_needed := 50 * v_level * v_level + 50; -- PHẢI khớp expNeeded() trong src/game/data/skills.ts
    exit when v_exp < v_needed;
    v_exp := v_exp - v_needed;
    v_level := v_level + 1;
    v_leveled := true;
  end loop;

  v_hp_max := 100 + v_level * 20 + v_con * 6;
  v_mp_max := 50 + v_level * 8 + v_int * 5;

  update characters set
    level = v_level,
    exp = v_exp,
    gold = gold + v_gold_gained,
    hp_max = v_hp_max,
    mp_max = v_mp_max,
    hp = case when v_leveled then v_hp_max else least(hp, v_hp_max) end,
    mp = case when v_leveled then v_mp_max else least(mp, v_mp_max) end,
    updated_at = now()
  where id = p_character_id
  returning hp, mp into v_hp, v_mp;

  return json_build_object(
    'exp_gained', v_def.exp_reward,
    'gold_gained', v_gold_gained,
    'leveled_up', v_leveled,
    'new_level', v_level,
    'new_exp', v_exp,
    'new_gold', (select gold from characters where id = p_character_id),
    'new_hp', v_hp, 'new_mp', v_mp,
    'new_hp_max', v_hp_max, 'new_mp_max', v_mp_max
  );
end;
$$;

revoke all on function grant_kill_reward from public;
grant execute on function grant_kill_reward to authenticated;

-- ==== PHASE 5 additions (items/loot/equipment/skill points/trade) — xem chi tiết trong supabase/migrations/004_phase5_items_trade.sql ====
-- Migration 004 — Item/Loot/Equipment/Skill Points/Trade.
-- Chạy sau 001(schema.sql)+002+003. Toàn bộ thao tác làm THAY ĐỔI TÀI SẢN
-- (nhặt đồ, trang bị, cộng điểm kỹ năng, giao dịch) đều đi qua RPC
-- SECURITY DEFINER bên dưới — client không có quyền UPDATE trực tiếp các
-- cột tài sản, chỉ có thể "xin" server thực hiện rồi server tự kiểm tra.

alter table characters add column if not exists skill_points int not null default 0;

-- ============================================================
-- 1) ITEM TEMPLATES + DROP TABLE
-- ============================================================
create table if not exists item_templates (
  id text primary key,
  name text not null,
  slot text not null check (slot in ('weapon','head','body','legs','feet','hands','ring','neck')),
  quality text not null check (quality in ('thuong','tot','hiem','suthi','huyenthoai')),
  icon text not null default '❔',
  base_atk int not null default 0,
  base_def int not null default 0,
  level_req int not null default 1,
  stackable boolean not null default false,
  max_stack int not null default 1
);

insert into item_templates (id, name, slot, quality, icon, base_atk, base_def, level_req, stackable, max_stack) values
  ('wolf_fang_dagger', 'Nanh Sói', 'weapon', 'thuong', '🗡️', 4, 0, 1, false, 1),
  ('wolf_leather_boots', 'Giày Da Sói', 'feet', 'thuong', '👢', 0, 3, 1, false, 1),
  ('wolf_leather_gloves', 'Găng Da Sói', 'hands', 'thuong', '🧤', 1, 1, 1, false, 1),
  ('bamboo_robe', 'Trúc Y', 'body', 'tot', '🥋', 0, 8, 5, false, 1),
  ('jade_ring', 'Nhẫn Ngọc Bích', 'ring', 'tot', '💍', 3, 2, 5, false, 1),
  ('bamboo_hat', 'Nón Lá Trúc', 'head', 'tot', '🎋', 0, 5, 5, false, 1),
  ('spirit_necklace', 'Dây Chuyền Linh Khí', 'neck', 'hiem', '📿', 5, 4, 8, false, 1),
  ('wolfking_fang_sword', 'Kiếm Nanh Sói Vương', 'weapon', 'suthi', '⚔️', 22, 0, 10, false, 1),
  ('wolfking_mane_cloak', 'Áo Choàng Bờm Sói Vương', 'body', 'suthi', '🧥', 6, 16, 10, false, 1),
  ('minor_healing_pill', 'Tiểu Hồi Xuân Đan', 'weapon', 'thuong', '🧪', 0, 0, 1, true, 99)
on conflict (id) do update set
  name = excluded.name, slot = excluded.slot, quality = excluded.quality, icon = excluded.icon,
  base_atk = excluded.base_atk, base_def = excluded.base_def, level_req = excluded.level_req,
  stackable = excluded.stackable, max_stack = excluded.max_stack;
-- Ghi chú: minor_healing_pill dùng slot 'weapon' chỉ để thoả constraint hiện tại
-- (đây là item tiêu hao, chưa có hệ thống dùng thuốc — sẽ tách bảng item_type ở Phase 6).

create table if not exists monster_drops (
  monster_id text not null references monster_defs(id) on delete cascade,
  item_template_id text not null references item_templates(id) on delete cascade,
  drop_chance numeric not null check (drop_chance > 0 and drop_chance <= 1),
  primary key (monster_id, item_template_id)
);

insert into monster_drops (monster_id, item_template_id, drop_chance) values
  ('wolf', 'wolf_fang_dagger', 0.12),
  ('wolf', 'wolf_leather_boots', 0.10),
  ('wolf', 'wolf_leather_gloves', 0.10),
  ('bamboo_demon', 'bamboo_robe', 0.14),
  ('bamboo_demon', 'jade_ring', 0.10),
  ('bamboo_demon', 'bamboo_hat', 0.12),
  ('wolf_king', 'wolfking_fang_sword', 0.35),
  ('wolf_king', 'wolfking_mane_cloak', 0.35),
  ('wolf_king', 'spirit_necklace', 0.5)
on conflict (monster_id, item_template_id) do update set drop_chance = excluded.drop_chance;

-- ============================================================
-- 2) INVENTORY / EQUIPMENT
-- ============================================================
create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  item_template_id text not null references item_templates(id),
  quantity int not null default 1,
  rolled_atk int not null default 0,
  rolled_def int not null default 0,
  equipped_slot text,
  locked_in_trade boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_inventory_equipped_slot on inventory(character_id, equipped_slot) where equipped_slot is not null;
create index if not exists idx_inventory_character on inventory(character_id);

alter table inventory enable row level security;
create policy "inventory: xem đồ của mình" on inventory
  for select using (character_id in (select id from characters where profile_id = auth.uid()));
create policy "inventory: huỷ đồ của mình (không áp dụng cho đồ đang trang bị/đang giao dịch)" on inventory
  for delete using (
    character_id in (select id from characters where profile_id = auth.uid())
    and equipped_slot is null and locked_in_trade = false
  );

-- ============================================================
-- 3) LOOT RƠI XUỐNG ĐẤT (pending_loot) — token 1 lần, sinh ra khi hạ quái
-- ============================================================
create table if not exists pending_loot (
  token uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  item_template_id text not null references item_templates(id),
  rolled_atk int not null default 0,
  rolled_def int not null default 0,
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table pending_loot enable row level security;
-- Không có policy select/insert cho client -> chỉ RPC SECURITY DEFINER đụng được.

-- ============================================================
-- 4) grant_kill_reward — MỞ RỘNG: cộng skill_points theo số cấp lên được,
--    và roll rơi đồ (ghi vào pending_loot, KHÔNG cộng thẳng vào túi đồ —
--    người chơi phải "nhặt" bằng claim_loot khi client báo đã tới gần).
-- ============================================================
create or replace function grant_kill_reward(p_character_id uuid, p_monster_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_def record;
  v_last timestamptz;
  v_level_before int; v_level int; v_exp bigint; v_con int; v_int int;
  v_needed bigint;
  v_leveled boolean := false;
  v_levels_gained int := 0;
  v_gold_gained int;
  v_hp_max int; v_mp_max int; v_hp int; v_mp int; v_gold bigint; v_skill_points int;
  v_drop record;
  v_roll numeric;
  v_loot_token uuid;
  v_loot_item text;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Không có quyền trên nhân vật này';
  end if;

  select * into v_def from monster_defs where id = p_monster_id;
  if not found then raise exception 'Loại quái không hợp lệ: %', p_monster_id; end if;

  select last_at into v_last from kill_cooldowns where character_id = p_character_id and monster_id = p_monster_id;
  if v_last is not null and now() - v_last < make_interval(secs => v_def.min_kill_interval_ms / 1000.0) then
    raise exception 'Thao tác quá nhanh, thử lại sau';
  end if;
  insert into kill_cooldowns (character_id, monster_id, last_at) values (p_character_id, p_monster_id, now())
    on conflict (character_id, monster_id) do update set last_at = now();

  v_gold_gained := v_def.gold_min + floor(random() * (v_def.gold_max - v_def.gold_min + 1));

  select level, exp, con, int_ into v_level_before, v_exp, v_con, v_int
  from characters where id = p_character_id for update;
  v_level := v_level_before;
  v_exp := v_exp + v_def.exp_reward;
  loop
    v_needed := 50 * v_level * v_level + 50;
    exit when v_exp < v_needed;
    v_exp := v_exp - v_needed;
    v_level := v_level + 1;
    v_leveled := true;
  end loop;
  v_levels_gained := v_level - v_level_before;

  v_hp_max := 100 + v_level * 20 + v_con * 6;
  v_mp_max := 50 + v_level * 8 + v_int * 5;

  update characters set
    level = v_level, exp = v_exp, gold = gold + v_gold_gained,
    hp_max = v_hp_max, mp_max = v_mp_max,
    hp = case when v_leveled then v_hp_max else least(hp, v_hp_max) end,
    mp = case when v_leveled then v_mp_max else least(mp, v_mp_max) end,
    skill_points = skill_points + v_levels_gained,
    updated_at = now()
  where id = p_character_id
  returning hp, mp, gold, skill_points into v_hp, v_mp, v_gold, v_skill_points;

  -- Roll rơi đồ: duyệt drop table theo thứ tự, item đầu tiên trúng thì dừng.
  for v_drop in select * from monster_drops where monster_id = p_monster_id order by drop_chance asc loop
    v_roll := random();
    if v_roll <= v_drop.drop_chance then
      select id into v_loot_item from item_templates where id = v_drop.item_template_id;
      insert into pending_loot (character_id, item_template_id, rolled_atk, rolled_def)
      select p_character_id, it.id,
        greatest(0, round(it.base_atk * (0.85 + random() * 0.3))),
        greatest(0, round(it.base_def * (0.85 + random() * 0.3)))
      from item_templates it where it.id = v_drop.item_template_id
      returning token into v_loot_token;
      exit;
    end if;
  end loop;

  return json_build_object(
    'exp_gained', v_def.exp_reward, 'gold_gained', v_gold_gained,
    'leveled_up', v_leveled, 'levels_gained', v_levels_gained,
    'new_level', v_level, 'new_exp', v_exp, 'new_gold', v_gold,
    'new_hp', v_hp, 'new_mp', v_mp, 'new_hp_max', v_hp_max, 'new_mp_max', v_mp_max,
    'new_skill_points', v_skill_points,
    'loot_token', v_loot_token, 'loot_item_id', v_loot_item
  );
end;
$$;
revoke all on function grant_kill_reward from public;
grant execute on function grant_kill_reward to authenticated;

-- claim_loot: người chơi đi tới chỗ đồ rơi, client gọi hàm này bằng token
-- nhận được từ grant_kill_reward để thực sự nhận vật phẩm vào túi.
create or replace function claim_loot(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loot record;
  v_owner uuid;
  v_tpl record;
  v_inv_id uuid;
  v_qty int;
begin
  select * into v_loot from pending_loot where token = p_token and claimed = false for update;
  if not found then return json_build_object('success', false, 'reason', 'het_han_hoac_da_nhat'); end if;

  select profile_id into v_owner from characters where id = v_loot.character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền nhặt vật phẩm này'; end if;

  update pending_loot set claimed = true where token = p_token;

  select * into v_tpl from item_templates where id = v_loot.item_template_id;

  if v_tpl.stackable then
    select id, quantity into v_inv_id, v_qty from inventory
      where character_id = v_loot.character_id and item_template_id = v_loot.item_template_id
        and equipped_slot is null and quantity < v_tpl.max_stack
      limit 1;
    if v_inv_id is not null then
      update inventory set quantity = quantity + 1 where id = v_inv_id;
    else
      insert into inventory (character_id, item_template_id, quantity, rolled_atk, rolled_def)
      values (v_loot.character_id, v_loot.item_template_id, 1, v_loot.rolled_atk, v_loot.rolled_def)
      returning id into v_inv_id;
    end if;
  else
    insert into inventory (character_id, item_template_id, quantity, rolled_atk, rolled_def)
    values (v_loot.character_id, v_loot.item_template_id, 1, v_loot.rolled_atk, v_loot.rolled_def)
    returning id into v_inv_id;
  end if;

  return json_build_object(
    'success', true, 'inventory_id', v_inv_id,
    'item_template_id', v_loot.item_template_id, 'name', v_tpl.name, 'icon', v_tpl.icon,
    'rolled_atk', v_loot.rolled_atk, 'rolled_def', v_loot.rolled_def
  );
end;
$$;
revoke all on function claim_loot from public;
grant execute on function claim_loot to authenticated;

-- equip_item / unequip_item
create or replace function equip_item(p_character_id uuid, p_inventory_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_item record; v_tpl record; v_level int;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  select * into v_item from inventory where id = p_inventory_id and character_id = p_character_id;
  if not found then raise exception 'Không tìm thấy vật phẩm'; end if;
  if v_item.locked_in_trade then raise exception 'Vật phẩm đang trong giao dịch'; end if;

  select * into v_tpl from item_templates where id = v_item.item_template_id;
  select level into v_level from characters where id = p_character_id;
  if v_level < v_tpl.level_req then raise exception 'Chưa đủ cấp để trang bị (cần cấp %)', v_tpl.level_req; end if;

  update inventory set equipped_slot = null where character_id = p_character_id and equipped_slot = v_tpl.slot;
  update inventory set equipped_slot = v_tpl.slot where id = p_inventory_id;

  return json_build_object('success', true, 'slot', v_tpl.slot);
end; $$;
revoke all on function equip_item from public;
grant execute on function equip_item to authenticated;

create or replace function unequip_item(p_character_id uuid, p_inventory_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  update inventory set equipped_slot = null where id = p_inventory_id and character_id = p_character_id;
  return json_build_object('success', true);
end; $$;
revoke all on function unequip_item from public;
grant execute on function unequip_item to authenticated;

-- ============================================================
-- 5) SKILL POINTS
-- ============================================================
create table if not exists character_skill_ranks (
  character_id uuid not null references characters(id) on delete cascade,
  skill_id text not null,
  rank int not null default 0,
  primary key (character_id, skill_id)
);
alter table character_skill_ranks enable row level security;
create policy "skill ranks: xem của mình" on character_skill_ranks
  for select using (character_id in (select id from characters where profile_id = auth.uid()));

create or replace function allocate_skill_point(p_character_id uuid, p_skill_id text)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_points int; v_class text; v_rank int;
begin
  select profile_id, skill_points, class into v_owner, v_points, v_class from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  if v_points <= 0 then raise exception 'Không còn điểm kỹ năng'; end if;
  if p_skill_id not like (v_class || '\_%') escape '\' then raise exception 'Skill không thuộc môn phái này'; end if;

  insert into character_skill_ranks (character_id, skill_id, rank) values (p_character_id, p_skill_id, 0)
    on conflict (character_id, skill_id) do nothing;
  select rank into v_rank from character_skill_ranks where character_id = p_character_id and skill_id = p_skill_id;
  if v_rank >= 10 then raise exception 'Skill đã đạt rank tối đa'; end if;

  update character_skill_ranks set rank = rank + 1 where character_id = p_character_id and skill_id = p_skill_id;
  update characters set skill_points = skill_points - 1 where id = p_character_id;

  return json_build_object('success', true, 'skill_id', p_skill_id, 'rank', v_rank + 1, 'remaining_points', v_points - 1);
end; $$;
revoke all on function allocate_skill_point from public;
grant execute on function allocate_skill_point to authenticated;

-- ============================================================
-- 6) GIAO DỊCH TỰ DO GIỮA 2 NGƯỜI CHƠI (trade)
-- ============================================================
create table if not exists trade_offers (
  id uuid primary key default gen_random_uuid(),
  from_character_id uuid not null references characters(id),
  to_character_id uuid not null references characters(id),
  from_gold bigint not null default 0,
  to_gold bigint not null default 0,
  from_confirmed boolean not null default false,
  to_confirmed boolean not null default false,
  status text not null default 'pending' check (status in ('pending','completed','cancelled','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists trade_offer_items (
  id uuid primary key default gen_random_uuid(),
  trade_offer_id uuid not null references trade_offers(id) on delete cascade,
  character_id uuid not null references characters(id), -- bên đang chào món này
  inventory_id uuid not null references inventory(id),
  item_template_id text not null,
  rolled_atk int not null default 0,
  rolled_def int not null default 0
);
alter table trade_offers enable row level security;
alter table trade_offer_items enable row level security;
create policy "trade_offers: xem giao dịch liên quan tới mình" on trade_offers
  for select using (
    from_character_id in (select id from characters where profile_id = auth.uid())
    or to_character_id in (select id from characters where profile_id = auth.uid())
  );
create policy "trade_offer_items: xem item của giao dịch liên quan" on trade_offer_items
  for select using (
    trade_offer_id in (
      select id from trade_offers
      where from_character_id in (select id from characters where profile_id = auth.uid())
         or to_character_id in (select id from characters where profile_id = auth.uid())
    )
  );

create or replace function create_trade_offer(p_from_character_id uuid, p_to_character_name text)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_to_id uuid; v_offer_id uuid;
begin
  select profile_id into v_owner from characters where id = p_from_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  select id into v_to_id from characters where lower(name) = lower(p_to_character_name);
  if v_to_id is null then raise exception 'Không tìm thấy nhân vật "%"', p_to_character_name; end if;
  if v_to_id = p_from_character_id then raise exception 'Không thể giao dịch với chính mình'; end if;

  insert into trade_offers (from_character_id, to_character_id) values (p_from_character_id, v_to_id)
  returning id into v_offer_id;
  return json_build_object('offer_id', v_offer_id);
end; $$;
revoke all on function create_trade_offer from public;
grant execute on function create_trade_offer to authenticated;

create or replace function set_trade_gold(p_offer_id uuid, p_character_id uuid, p_gold bigint)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_offer record; v_my_gold bigint;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  select * into v_offer from trade_offers where id = p_offer_id and status = 'pending';
  if not found then raise exception 'Giao dịch không tồn tại hoặc đã đóng'; end if;
  if p_gold < 0 then raise exception 'Số vàng không hợp lệ'; end if;
  select gold into v_my_gold from characters where id = p_character_id;
  if p_gold > v_my_gold then raise exception 'Không đủ vàng'; end if;

  if p_character_id = v_offer.from_character_id then
    update trade_offers set from_gold = p_gold, from_confirmed = false, to_confirmed = false, updated_at = now() where id = p_offer_id;
  elsif p_character_id = v_offer.to_character_id then
    update trade_offers set to_gold = p_gold, from_confirmed = false, to_confirmed = false, updated_at = now() where id = p_offer_id;
  else
    raise exception 'Bạn không thuộc giao dịch này';
  end if;
  return json_build_object('success', true);
end; $$;
revoke all on function set_trade_gold from public;
grant execute on function set_trade_gold to authenticated;

create or replace function add_trade_item(p_offer_id uuid, p_character_id uuid, p_inventory_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_offer record; v_item record;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  select * into v_offer from trade_offers where id = p_offer_id and status = 'pending';
  if not found then raise exception 'Giao dịch không tồn tại hoặc đã đóng'; end if;
  if p_character_id not in (v_offer.from_character_id, v_offer.to_character_id) then
    raise exception 'Bạn không thuộc giao dịch này';
  end if;

  select * into v_item from inventory where id = p_inventory_id and character_id = p_character_id;
  if not found then raise exception 'Không tìm thấy vật phẩm'; end if;
  if v_item.equipped_slot is not null then raise exception 'Không thể giao dịch đồ đang trang bị'; end if;
  if v_item.locked_in_trade then raise exception 'Vật phẩm đã ở trong 1 giao dịch khác'; end if;

  update inventory set locked_in_trade = true where id = p_inventory_id;
  insert into trade_offer_items (trade_offer_id, character_id, inventory_id, item_template_id, rolled_atk, rolled_def)
  values (p_offer_id, p_character_id, p_inventory_id, v_item.item_template_id, v_item.rolled_atk, v_item.rolled_def);

  update trade_offers set from_confirmed = false, to_confirmed = false, updated_at = now() where id = p_offer_id;
  return json_build_object('success', true);
end; $$;
revoke all on function add_trade_item from public;
grant execute on function add_trade_item to authenticated;

create or replace function remove_trade_item(p_trade_item_id uuid, p_character_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_row record;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  select * into v_row from trade_offer_items where id = p_trade_item_id and character_id = p_character_id;
  if not found then raise exception 'Không tìm thấy mục này'; end if;

  update inventory set locked_in_trade = false where id = v_row.inventory_id;
  delete from trade_offer_items where id = p_trade_item_id;
  update trade_offers set from_confirmed = false, to_confirmed = false, updated_at = now() where id = v_row.trade_offer_id;
  return json_build_object('success', true);
end; $$;
revoke all on function remove_trade_item from public;
grant execute on function remove_trade_item to authenticated;

create or replace function cancel_trade_offer(p_offer_id uuid, p_character_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_offer record;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  select * into v_offer from trade_offers where id = p_offer_id;
  if not found or p_character_id not in (v_offer.from_character_id, v_offer.to_character_id) then
    raise exception 'Không thuộc giao dịch này';
  end if;
  update inventory set locked_in_trade = false
    where id in (select inventory_id from trade_offer_items where trade_offer_id = p_offer_id);
  update trade_offers set status = 'cancelled', updated_at = now() where id = p_offer_id and status = 'pending';
  return json_build_object('success', true);
end; $$;
revoke all on function cancel_trade_offer from public;
grant execute on function cancel_trade_offer to authenticated;

-- confirm_trade_offer: khi CẢ HAI đã confirm, thực hiện hoán đổi thật sự,
-- kiểm tra lại toàn bộ điều kiện ngay tại thời điểm chốt (double-check
-- chống trường hợp 1 bên đã tiêu vàng/mất item ở giao dịch khác trước đó).
create or replace function confirm_trade_offer(p_offer_id uuid, p_character_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_offer record;
  v_from_gold bigint; v_to_gold bigint;
  v_item record;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  select * into v_offer from trade_offers where id = p_offer_id and status = 'pending' for update;
  if not found then raise exception 'Giao dịch không tồn tại hoặc đã đóng'; end if;

  if p_character_id = v_offer.from_character_id then
    update trade_offers set from_confirmed = true, updated_at = now() where id = p_offer_id;
  elsif p_character_id = v_offer.to_character_id then
    update trade_offers set to_confirmed = true, updated_at = now() where id = p_offer_id;
  else
    raise exception 'Bạn không thuộc giao dịch này';
  end if;

  select * into v_offer from trade_offers where id = p_offer_id;
  if not (v_offer.from_confirmed and v_offer.to_confirmed) then
    return json_build_object('success', true, 'waiting_other_side', true);
  end if;

  -- Cả hai đã xác nhận -> kiểm tra lại lần cuối rồi hoán đổi thật.
  select gold into v_from_gold from characters where id = v_offer.from_character_id;
  select gold into v_to_gold from characters where id = v_offer.to_character_id;
  if v_from_gold < v_offer.from_gold or v_to_gold < v_offer.to_gold then
    update trade_offers set status = 'failed', updated_at = now() where id = p_offer_id;
    update inventory set locked_in_trade = false
      where id in (select inventory_id from trade_offer_items where trade_offer_id = p_offer_id);
    raise exception 'Giao dịch thất bại: một bên không đủ vàng như đã chào';
  end if;

  for v_item in select * from trade_offer_items where trade_offer_id = p_offer_id loop
    if (select equipped_slot from inventory where id = v_item.inventory_id) is not null
       or (select locked_in_trade from inventory where id = v_item.inventory_id) = false then
      update trade_offers set status = 'failed', updated_at = now() where id = p_offer_id;
      raise exception 'Giao dịch thất bại: một vật phẩm không còn hợp lệ';
    end if;
    update inventory set
      character_id = case when character_id = v_offer.from_character_id then v_offer.to_character_id else v_offer.from_character_id end,
      locked_in_trade = false
    where id = v_item.inventory_id;
  end loop;

  update characters set gold = gold - v_offer.from_gold + v_offer.to_gold where id = v_offer.from_character_id;
  update characters set gold = gold - v_offer.to_gold + v_offer.from_gold where id = v_offer.to_character_id;
  update trade_offers set status = 'completed', updated_at = now() where id = p_offer_id;

  return json_build_object('success', true, 'completed', true);
end; $$;
revoke all on function confirm_trade_offer from public;
grant execute on function confirm_trade_offer to authenticated;

-- ==== PHASE 6 additions (minimal quest slice) — xem chi tiết trong supabase/migrations/005_phase6_quests.sql ====
-- Migration 005 — Quest tối thiểu thật (không phải UI giả).
-- Đây là LÁT CẮT ĐẦU TIÊN của hệ thống quest đầy đủ trong đặc tả gốc
-- (main/side/daily/weekly/bounty/hidden/dungeon...): 1 chuỗi main quest
-- 3 bước để khung nhiệm vụ trong UI có nội dung thật. Các loại quest còn
-- lại sẽ thêm ở lượt hoàn thiện Phase 6 sau.

create table if not exists quests (
  id text primary key,
  title text not null,
  description text not null,
  type text not null check (type in ('talk','kill')),
  giver_npc_id text,          -- dùng khi type='talk'
  target_monster_id text references monster_defs(id), -- dùng khi type='kill'
  target_count int not null default 0,
  reward_gold int not null default 0,
  reward_exp int not null default 0,
  next_quest_id text references quests(id),
  level_req int not null default 1
);
alter table quests enable row level security;
create policy "quests: ai cũng đọc được (nội dung tĩnh)" on quests for select using (true);

create table if not exists character_quests (
  character_id uuid not null references characters(id) on delete cascade,
  quest_id text not null references quests(id),
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  progress int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (character_id, quest_id)
);
alter table character_quests enable row level security;
create policy "character_quests: xem tiến độ của mình" on character_quests
  for select using (character_id in (select id from characters where profile_id = auth.uid()));

insert into quests (id, title, description, type, giver_npc_id, target_monster_id, target_count, reward_gold, reward_exp, next_quest_id, level_req) values
  ('main_01_talk_elder', 'Gặp Trưởng Thôn Lý Trấn', 'Trưởng thôn muốn gặp bạn để bàn việc bầy sói hoang đang quấy phá Đồng Ngoại.', 'talk', 'elder_1', null, 0, 20, 20, 'main_02_kill_wolves', 1),
  ('main_02_kill_wolves', 'Sói Hoang Quấy Phá', 'Tiêu diệt 5 con Sói Hoang ở Đồng Ngoại để bảo vệ dân làng.', 'kill', null, 'wolf', 5, 40, 80, 'main_03_return_elder', 1),
  ('main_03_return_elder', 'Báo Tin Cho Trưởng Thôn', 'Quay lại Tân Thủ Thôn báo tin cho Trưởng Thôn Lý Trấn.', 'talk', 'elder_1', null, 0, 60, 200, null, 1)
on conflict (id) do update set
  title = excluded.title, description = excluded.description, type = excluded.type,
  giver_npc_id = excluded.giver_npc_id, target_monster_id = excluded.target_monster_id,
  target_count = excluded.target_count, reward_gold = excluded.reward_gold,
  reward_exp = excluded.reward_exp, next_quest_id = excluded.next_quest_id, level_req = excluded.level_req;

-- ============================================================
-- Tách phần "cộng exp/gold + lên cấp + skill point" ra hàm dùng chung,
-- để grant_kill_reward VÀ phần thưởng quest dùng chung 1 công thức,
-- tránh lệch số liệu giữa 2 nơi.
-- ============================================================
create or replace function apply_currency_reward(p_character_id uuid, p_gold int, p_exp int)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_level int; v_exp bigint; v_con int; v_int int; v_needed bigint;
  v_leveled boolean := false; v_levels_gained int := 0;
  v_hp_max int; v_mp_max int; v_hp int; v_mp int; v_gold bigint; v_skill_points int;
  v_level_before int;
begin
  select level, exp, con, int_ into v_level_before, v_exp, v_con, v_int
  from characters where id = p_character_id for update;
  v_level := v_level_before;
  v_exp := v_exp + p_exp;
  loop
    v_needed := 50 * v_level * v_level + 50;
    exit when v_exp < v_needed;
    v_exp := v_exp - v_needed;
    v_level := v_level + 1;
    v_leveled := true;
  end loop;
  v_levels_gained := v_level - v_level_before;
  v_hp_max := 100 + v_level * 20 + v_con * 6;
  v_mp_max := 50 + v_level * 8 + v_int * 5;

  update characters set
    level = v_level, exp = v_exp, gold = gold + p_gold,
    hp_max = v_hp_max, mp_max = v_mp_max,
    hp = case when v_leveled then v_hp_max else least(hp, v_hp_max) end,
    mp = case when v_leveled then v_mp_max else least(mp, v_mp_max) end,
    skill_points = skill_points + v_levels_gained,
    updated_at = now()
  where id = p_character_id
  returning hp, mp, gold, skill_points into v_hp, v_mp, v_gold, v_skill_points;

  return json_build_object(
    'leveled_up', v_leveled, 'levels_gained', v_levels_gained,
    'new_level', v_level, 'new_exp', v_exp, 'new_gold', v_gold,
    'new_hp', v_hp, 'new_mp', v_mp, 'new_hp_max', v_hp_max, 'new_mp_max', v_mp_max,
    'new_skill_points', v_skill_points
  );
end; $$;
revoke all on function apply_currency_reward from public;
grant execute on function apply_currency_reward to authenticated;

-- Quest hiện tại của nhân vật = quest đầu tiên trong chuỗi (theo next_quest_id)
-- mà nhân vật CHƯA hoàn thành. Trả về null nếu đã xong hết chuỗi.
create or replace function get_current_quest(p_character_id uuid) returns text
language sql stable as $$
  with recursive chain as (
    select id, next_quest_id, 1 as depth from quests where id = 'main_01_talk_elder'
    union all
    select q.id, q.next_quest_id, c.depth + 1
    from quests q join chain c on q.id = c.next_quest_id
  )
  select chain.id from chain
  left join character_quests cq
    on cq.character_id = p_character_id and cq.quest_id = chain.id and cq.status = 'completed'
  where cq.quest_id is null
  order by chain.depth asc
  limit 1;
$$;

-- Panel nhiệm vụ đọc từ đây: trả về quest hiện tại + tiến độ.
create or replace function get_quest_status(p_character_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_qid text; v_q record; v_progress int;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  v_qid := get_current_quest(p_character_id);
  if v_qid is null then
    return json_build_object('quest_id', null);
  end if;
  select * into v_q from quests where id = v_qid;
  select coalesce(progress, 0) into v_progress from character_quests
    where character_id = p_character_id and quest_id = v_qid;

  return json_build_object(
    'quest_id', v_q.id, 'title', v_q.title, 'description', v_q.description,
    'type', v_q.type, 'giver_npc_id', v_q.giver_npc_id,
    'target_monster_id', v_q.target_monster_id, 'target_count', v_q.target_count,
    'progress', coalesce(v_progress, 0)
  );
end; $$;
revoke all on function get_quest_status from public;
grant execute on function get_quest_status to authenticated;

-- Nói chuyện với NPC: hoàn thành bước 'talk' của quest hiện tại nếu khớp NPC.
create or replace function talk_to_npc(p_character_id uuid, p_npc_id text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_qid text; v_q record; v_reward json; v_has_row boolean;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  v_qid := get_current_quest(p_character_id);
  if v_qid is null then
    return json_build_object('dialogue', 'Đa tạ thiếu hiệp đã giúp thôn ta. Hiện ta chưa có việc gì khác.', 'quest_id', null);
  end if;

  select * into v_q from quests where id = v_qid;
  if v_q.type <> 'talk' or v_q.giver_npc_id <> p_npc_id then
    return json_build_object('dialogue', 'Ngươi hãy tiếp tục nhiệm vụ hiện tại đã, rồi quay lại đây.', 'quest_id', v_qid, 'quest_title', v_q.title);
  end if;

  select exists(select 1 from character_quests where character_id = p_character_id and quest_id = v_qid) into v_has_row;
  if v_has_row then
    return json_build_object('dialogue', '(Nhiệm vụ này đã hoàn thành trước đó)', 'quest_id', v_qid);
  end if;

  insert into character_quests (character_id, quest_id, status, progress) values (p_character_id, v_qid, 'completed', 0);
  select apply_currency_reward(p_character_id, v_q.reward_gold, v_q.reward_exp) into v_reward;

  return json_build_object(
    'dialogue', v_q.description, 'quest_completed', v_q.title,
    'reward', v_reward, 'next_quest_id', v_q.next_quest_id
  );
end; $$;
revoke all on function talk_to_npc from public;
grant execute on function talk_to_npc to authenticated;

-- ============================================================
-- grant_kill_reward — VIẾT LẠI để dùng apply_currency_reward() dùng chung,
-- và cộng tiến độ quest 'kill' đang làm dở nếu loại quái khớp.
-- ============================================================
create or replace function grant_kill_reward(p_character_id uuid, p_monster_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_def record;
  v_last timestamptz;
  v_gold_gained int;
  v_reward json;
  v_drop record;
  v_roll numeric;
  v_loot_token uuid;
  v_loot_item text;
  v_qid text; v_q record; v_progress int; v_quest_event json := null;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Không có quyền trên nhân vật này';
  end if;

  select * into v_def from monster_defs where id = p_monster_id;
  if not found then raise exception 'Loại quái không hợp lệ: %', p_monster_id; end if;

  select last_at into v_last from kill_cooldowns where character_id = p_character_id and monster_id = p_monster_id;
  if v_last is not null and now() - v_last < make_interval(secs => v_def.min_kill_interval_ms / 1000.0) then
    raise exception 'Thao tác quá nhanh, thử lại sau';
  end if;
  insert into kill_cooldowns (character_id, monster_id, last_at) values (p_character_id, p_monster_id, now())
    on conflict (character_id, monster_id) do update set last_at = now();

  v_gold_gained := v_def.gold_min + floor(random() * (v_def.gold_max - v_def.gold_min + 1));
  select apply_currency_reward(p_character_id, v_gold_gained, v_def.exp_reward) into v_reward;

  -- Rơi đồ (như migration 004)
  for v_drop in select * from monster_drops where monster_id = p_monster_id order by drop_chance asc loop
    v_roll := random();
    if v_roll <= v_drop.drop_chance then
      insert into pending_loot (character_id, item_template_id, rolled_atk, rolled_def)
      select p_character_id, it.id,
        greatest(0, round(it.base_atk * (0.85 + random() * 0.3))),
        greatest(0, round(it.base_def * (0.85 + random() * 0.3)))
      from item_templates it where it.id = v_drop.item_template_id
      returning token into v_loot_token;
      v_loot_item := v_drop.item_template_id;
      exit;
    end if;
  end loop;

  -- Tiến độ quest kill
  v_qid := get_current_quest(p_character_id);
  if v_qid is not null then
    select * into v_q from quests where id = v_qid;
    if v_q.type = 'kill' and v_q.target_monster_id = p_monster_id then
      insert into character_quests (character_id, quest_id, status, progress)
        values (p_character_id, v_qid, 'in_progress', 1)
        on conflict (character_id, quest_id) do update set progress = character_quests.progress + 1, updated_at = now();
      select progress into v_progress from character_quests where character_id = p_character_id and quest_id = v_qid;
      if v_progress >= v_q.target_count then
        update character_quests set status = 'completed' where character_id = p_character_id and quest_id = v_qid;
        select apply_currency_reward(p_character_id, v_q.reward_gold, v_q.reward_exp) into v_reward; -- ghi đè bằng số liệu mới nhất
        v_quest_event := json_build_object('quest_completed', v_q.title, 'next_quest_id', v_q.next_quest_id);
      else
        v_quest_event := json_build_object('quest_progress', v_progress, 'quest_target', v_q.target_count, 'quest_title', v_q.title);
      end if;
    end if;
  end if;

  return json_build_object(
    'exp_gained', v_def.exp_reward, 'gold_gained', v_gold_gained,
    'leveled_up', v_reward->>'leveled_up' = 'true', 'levels_gained', (v_reward->>'levels_gained')::int,
    'new_level', (v_reward->>'new_level')::int, 'new_exp', (v_reward->>'new_exp')::bigint,
    'new_gold', (v_reward->>'new_gold')::bigint,
    'new_hp', (v_reward->>'new_hp')::int, 'new_mp', (v_reward->>'new_mp')::int,
    'new_hp_max', (v_reward->>'new_hp_max')::int, 'new_mp_max', (v_reward->>'new_mp_max')::int,
    'new_skill_points', (v_reward->>'new_skill_points')::int,
    'loot_token', v_loot_token, 'loot_item_id', v_loot_item,
    'quest_event', v_quest_event
  );
end;
$$;
revoke all on function grant_kill_reward from public;
grant execute on function grant_kill_reward to authenticated;

-- ==== PHASE 7 additions (Sơn Cốc + Thâm Lâm content) — xem chi tiết trong supabase/migrations/006_phase7_maps_trungcap.sql ====
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

-- ==== PHASE 7 (nốt) — 14 map còn lại, đủ 20/20 — xem chi tiết trong supabase/migrations/007_phase7_remaining_maps.sql ====
-- Migration 007 — Nội dung cho 14 map còn lại: nốt Trung Cấp (Hoang Mạc, Cổ Đạo),
-- toàn bộ Cao Cấp (Thiên Sơn, Huyết Ma Động, U Minh Cốc, Ma Vực, Cấm Địa),
-- toàn bộ Boss/Endgame (Long Mạch, Thiên Môn, Vạn Ma Điện, Chiến Trường Cổ,
-- Bí Cảnh, Tuyệt Mệnh Cốc) và khu Event (Huyễn Cảnh). Đủ 20/20 map.
-- Chạy sau 001–006.

insert into monster_defs (id, name, tier, level, exp_reward, gold_min, gold_max, min_kill_interval_ms) values
  ('sand_scorpion','Sa Yêu Hạt','normal',23,97,25,46,1200),
  ('sand_reaver','Sa Tặc','elite',23,161,41,74,1500),
  ('desert_tyrant','Sa Mạc Bạo Long','boss',23,1288,552,828,25000),
  ('bandit_swordsman','Đạo Tặc Kiếm','normal',26,109,29,52,1200),
  ('bandit_captain','Đạo Tặc Đầu Lĩnh','elite',26,182,47,83,1500),
  ('ancient_guardian','Cổ Đạo Thạch Thần','boss',26,1456,624,936,28000),
  ('cloud_leopard','Vân Báo','normal',31,130,34,62,1200),
  ('storm_eagle','Bạo Phong Ưng','elite',31,217,56,99,1500),
  ('thien_son_sage','Thiên Sơn Quái Nhân','boss',31,1705,744,1116,30000),
  ('blood_imp','Huyết Tiểu Quỷ','normal',36,151,40,72,1200),
  ('blood_priest','Huyết Giáo Sĩ','elite',36,252,65,115,1500),
  ('blood_demon_lord','Huyết Ma Tôn','boss',36,1980,864,1296,32000),
  ('ghost_soldier','U Binh','normal',41,172,45,82,1200),
  ('soul_reaper','Đoạt Hồn Sứ','elite',41,287,74,131,1500),
  ('underworld_king','U Minh Vương','boss',41,2255,984,1476,35000),
  ('abyss_fiend','Vực Ma','normal',46,193,51,92,1200),
  ('chaos_hound','Hỗn Độn Khuyển','elite',46,322,83,147,1500),
  ('abyss_overlord','Ma Vực Bá Chủ','boss',46,2530,1104,1656,38000),
  ('forbidden_guard','Cấm Vệ','normal',51,214,56,102,1200),
  ('seal_breaker','Phá Ấn Nhân','elite',51,357,92,163,1500),
  ('forbidden_emperor','Cấm Địa Đế Quân','boss',51,2805,1224,1836,40000),
  ('dragon_whelp','Long Duệ','normal',57,239,63,114,1200),
  ('dragon_knight','Long Kỵ Sĩ','elite',57,399,103,182,1500),
  ('long_mach_dragon','Long Mạch Chân Long','boss',57,3135,1368,2052,42000),
  ('heaven_sentinel','Thiên Môn Vệ','normal',61,256,67,122,1200),
  ('thunder_general','Lôi Đình Tướng Quân','elite',61,427,110,195,1500),
  ('heaven_gate_lord','Thiên Môn Chi Chủ','boss',61,3355,1464,2196,45000),
  ('demon_soldier','Ma Binh','normal',66,277,73,132,1200),
  ('demon_general','Ma Tướng','elite',66,462,119,211,1500),
  ('van_ma_emperor','Vạn Ma Điện Chủ','boss',66,3630,1584,2376,48000),
  ('fallen_warrior','Chiến Tử Vong Linh','normal',71,298,78,142,1200),
  ('war_spirit','Chiến Hồn','elite',71,497,128,227,1500),
  ('ancient_warlord','Cổ Chiến Bá Vương','boss',71,3905,1704,2556,50000),
  ('mystic_beast','Huyễn Thú','normal',76,319,84,152,1200),
  ('mystic_guardian','Bí Cảnh Hộ Pháp','elite',76,532,137,243,1500),
  ('bi_canh_immortal','Bí Cảnh Tiên Nhân','boss',76,4180,1824,2736,52000),
  ('the_final_dragon','Tuyệt Thế Chân Long','boss',85,10000,5000,8000,120000),
  ('mischief_spirit','Tinh Linh Nghịch Ngợm','normal',5,21,5,10,1000),
  ('carnival_king','Vua Hội Hoa Đăng','boss',8,440,192,288,20000)
on conflict (id) do update set
  name = excluded.name, tier = excluded.tier, level = excluded.level,
  exp_reward = excluded.exp_reward, gold_min = excluded.gold_min,
  gold_max = excluded.gold_max, min_kill_interval_ms = excluded.min_kill_interval_ms;

insert into item_templates (id, name, slot, quality, icon, base_atk, base_def, level_req, stackable, max_stack) values
  ('sanreaver_boots','Ủng Sa Tặc','feet','hiem','👢',14,14,23,false,1),
  ('desert_fang_blade','Nanh Kiếm Sa Mạc','weapon','suthi','🗡️',30,0,23,false,1),
  ('desert_scale_helm','Long Giáp Đầu Sa Mạc','head','suthi','⛑️',7,23,23,false,1),
  ('bandit_gauntlet','Găng Đạo Tặc','hands','hiem','🧤',16,16,26,false,1),
  ('ancient_stone_blade','Cổ Thạch Kiếm','weapon','suthi','⚔️',34,0,26,false,1),
  ('ancient_stone_armor','Cổ Thạch Giáp','body','suthi','🛡️',8,26,26,false,1),
  ('storm_ring','Nhẫn Bạo Phong','ring','suthi','💍',19,19,31,false,1),
  ('thienson_staff','Thiên Sơn Trượng','weapon','huyenthoai','🪄',40,0,31,false,1),
  ('thienson_legguard','Vân Giáp Quần','legs','huyenthoai','👖',9,31,31,false,1),
  ('bloodpriest_necklace','Dây Chuyền Huyết Giáo','neck','suthi','📿',22,22,36,false,1),
  ('blooddemon_scythe','Huyết Ma Trảm Đao','weapon','huyenthoai','🔪',47,0,36,false,1),
  ('blooddemon_boots','Ủng Huyết Ma','feet','huyenthoai','👢',11,36,36,false,1),
  ('soulreaper_helm','Mũ Đoạt Hồn','head','suthi','⛑️',25,25,41,false,1),
  ('underworld_blade','U Minh Đao','weapon','huyenthoai','🗡️',53,0,41,false,1),
  ('underworld_gauntlet','Găng U Minh Vương','hands','huyenthoai','🧤',12,41,41,false,1),
  ('chaoshound_armor','Giáp Hỗn Độn','body','suthi','🥋',28,28,46,false,1),
  ('abyss_trident','Ma Vực Đinh Ba','weapon','huyenthoai','🔱',60,0,46,false,1),
  ('abyss_ring','Nhẫn Bá Chủ Vực Sâu','ring','huyenthoai','💍',14,46,46,false,1),
  ('sealbreaker_legguard','Quần Phá Ấn','legs','suthi','👖',31,31,51,false,1),
  ('forbidden_glaive','Cấm Địa Trường Thương','weapon','huyenthoai','🔱',66,0,51,false,1),
  ('forbidden_necklace','Dây Chuyền Đế Quân','neck','huyenthoai','📿',15,51,51,false,1),
  ('dragonknight_boots','Ủng Long Kỵ','feet','suthi','👢',34,34,57,false,1),
  ('longmach_sword','Chân Long Kiếm','weapon','huyenthoai','⚔️',74,0,57,false,1),
  ('longmach_helm','Long Giáp Đầu','head','huyenthoai','⛑️',17,57,57,false,1),
  ('thundergeneral_gauntlet','Găng Lôi Đình','hands','suthi','🧤',37,37,61,false,1),
  ('heavengate_blade','Thiên Môn Kiếm','weapon','huyenthoai','⚔️',79,0,61,false,1),
  ('heavengate_armor','Thiên Giáp','body','huyenthoai','👘',18,61,61,false,1),
  ('demongeneral_ring','Nhẫn Ma Tướng','ring','suthi','💍',40,40,66,false,1),
  ('vanma_greatsword','Vạn Ma Cự Kiếm','weapon','huyenthoai','⚔️',86,0,66,false,1),
  ('vanma_legguard','Ma Điện Quần','legs','huyenthoai','👖',20,66,66,false,1),
  ('warspirit_necklace','Dây Chuyền Chiến Hồn','neck','suthi','📿',43,43,71,false,1),
  ('warlord_blade','Bá Vương Kiếm','weapon','huyenthoai','⚔️',92,0,71,false,1),
  ('warlord_boots','Ủng Bá Vương','feet','huyenthoai','👢',21,71,71,false,1),
  ('mysticguardian_helm','Mũ Hộ Pháp Bí Cảnh','head','suthi','⛑️',46,46,76,false,1),
  ('bicanh_fan','Tiên Phong Phiến','weapon','huyenthoai','🪭',99,0,76,false,1),
  ('bicanh_gauntlet','Găng Bí Cảnh Tiên Nhân','hands','huyenthoai','🧤',23,76,76,false,1),
  ('final_dragon_blade','Tuyệt Thế Long Kiếm','weapon','huyenthoai','⚔️',150,10,85,false,1),
  ('final_dragon_armor','Tuyệt Thế Long Giáp','body','huyenthoai','👘',40,90,85,false,1),
  ('carnival_hat','Nón Hội Hoa Đăng','head','tot','🎩',3,6,8,false,1)
on conflict (id) do update set
  name = excluded.name, slot = excluded.slot, quality = excluded.quality, icon = excluded.icon,
  base_atk = excluded.base_atk, base_def = excluded.base_def, level_req = excluded.level_req,
  stackable = excluded.stackable, max_stack = excluded.max_stack;

insert into monster_drops (monster_id, item_template_id, drop_chance) values
  ('sand_reaver','sanreaver_boots',0.16),
  ('desert_tyrant','desert_fang_blade',0.35),('desert_tyrant','desert_scale_helm',0.35),
  ('bandit_captain','bandit_gauntlet',0.16),
  ('ancient_guardian','ancient_stone_blade',0.35),('ancient_guardian','ancient_stone_armor',0.35),
  ('storm_eagle','storm_ring',0.16),
  ('thien_son_sage','thienson_staff',0.35),('thien_son_sage','thienson_legguard',0.35),
  ('blood_priest','bloodpriest_necklace',0.17),
  ('blood_demon_lord','blooddemon_scythe',0.35),('blood_demon_lord','blooddemon_boots',0.35),
  ('soul_reaper','soulreaper_helm',0.17),
  ('underworld_king','underworld_blade',0.35),('underworld_king','underworld_gauntlet',0.35),
  ('chaos_hound','chaoshound_armor',0.17),
  ('abyss_overlord','abyss_trident',0.35),('abyss_overlord','abyss_ring',0.35),
  ('seal_breaker','sealbreaker_legguard',0.17),
  ('forbidden_emperor','forbidden_glaive',0.35),('forbidden_emperor','forbidden_necklace',0.35),
  ('dragon_knight','dragonknight_boots',0.18),
  ('long_mach_dragon','longmach_sword',0.35),('long_mach_dragon','longmach_helm',0.35),
  ('thunder_general','thundergeneral_gauntlet',0.18),
  ('heaven_gate_lord','heavengate_blade',0.35),('heaven_gate_lord','heavengate_armor',0.35),
  ('demon_general','demongeneral_ring',0.18),
  ('van_ma_emperor','vanma_greatsword',0.35),('van_ma_emperor','vanma_legguard',0.35),
  ('war_spirit','warspirit_necklace',0.18),
  ('ancient_warlord','warlord_blade',0.35),('ancient_warlord','warlord_boots',0.35),
  ('mystic_guardian','mysticguardian_helm',0.18),
  ('bi_canh_immortal','bicanh_fan',0.4),('bi_canh_immortal','bicanh_gauntlet',0.4),
  ('the_final_dragon','final_dragon_blade',0.5),('the_final_dragon','final_dragon_armor',0.5),
  ('carnival_king','carnival_hat',0.5)
on conflict (monster_id, item_template_id) do update set drop_chance = excluded.drop_chance;

-- ==== PHASE 8 additions (quest chain nối dài + daily quest) — xem chi tiết trong supabase/migrations/008_phase8_questchain_daily.sql ====
-- Migration 008 — Nối dài chuỗi main quest xuyên qua Sơn Cốc/Trấn Biên/Thâm Lâm,
-- và thêm Daily Quest (nhiệm vụ ngày, reset theo ngày UTC).
-- Chạy sau 001–007.

-- Nối main_03 (trước đây là chốt cuối, next_quest_id=null) sang chuỗi mới.
update quests set next_quest_id = 'main_04_kill_rockgolem' where id = 'main_03_return_elder';

insert into quests (id, title, description, type, giver_npc_id, target_monster_id, target_count, reward_gold, reward_exp, next_quest_id, level_req) values
  ('main_04_kill_rockgolem', 'Trấn Áp Nham Thạch Quái', 'Sơn Cốc đang bị Nham Thạch Quái quấy nhiễu, tiêu diệt 6 con để mở đường thông thương.', 'kill', null, 'rock_golem', 6, 60, 150, 'main_05_talk_smith2', 10),
  ('main_05_talk_smith2', 'Ghé Thăm Lò Rèn Trấn Biên', 'Thợ Rèn Trấn Biên nghe danh bạn, muốn nhờ tìm nguyên liệu quý.', 'talk', 'smith_2', null, 0, 40, 100, 'main_06_kill_shadowwolf', 12),
  ('main_06_kill_shadowwolf', 'Săn Ảnh Lang', 'Thợ rèn cần móng vuốt Ảnh Lang để rèn vũ khí. Diệt 3 con Ảnh Lang tinh anh.', 'kill', null, 'shadow_wolf', 3, 120, 300, 'main_07_kill_phantomwolf', 15),
  ('main_07_kill_phantomwolf', 'Trừ Khử U Ảnh Lang', 'Thâm Lâm đầy rẫy U Ảnh Lang. Tiêu diệt 6 con để dân biên ải an tâm.', 'kill', null, 'phantom_wolf', 6, 150, 380, 'main_08_talk_merchant2', 17),
  ('main_08_talk_merchant2', 'Báo Công Với Thương Nhân Biên Quan', 'Quay lại Trấn Biên báo công với Thương Nhân Biên Quan để nhận trọng thưởng.', 'talk', 'merchant_2', null, 0, 300, 800, null, 18)
on conflict (id) do update set
  title = excluded.title, description = excluded.description, type = excluded.type,
  giver_npc_id = excluded.giver_npc_id, target_monster_id = excluded.target_monster_id,
  target_count = excluded.target_count, reward_gold = excluded.reward_gold,
  reward_exp = excluded.reward_exp, next_quest_id = excluded.next_quest_id, level_req = excluded.level_req;

-- ============================================================
-- DAILY QUEST — reset theo ngày UTC. Thiết kế tối giản: diệt 15 quái bất kỳ
-- trong ngày, phần thưởng theo cấp độ hiện tại. Mở rộng loại nhiệm vụ ngày
-- đa dạng hơn (theo khu vực, theo loại quái...) để ở lượt hoàn thiện sau.
-- ============================================================
create table if not exists daily_quests (
  character_id uuid not null references characters(id) on delete cascade,
  quest_date date not null default (now() at time zone 'utc')::date,
  progress int not null default 0,
  target_count int not null default 15,
  completed boolean not null default false,
  primary key (character_id, quest_date)
);
alter table daily_quests enable row level security;
create policy "daily_quests: xem của mình" on daily_quests
  for select using (character_id in (select id from characters where profile_id = auth.uid()));

create or replace function get_daily_status(p_character_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_row record; v_today date := (now() at time zone 'utc')::date;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  select * into v_row from daily_quests where character_id = p_character_id and quest_date = v_today;
  if not found then
    return json_build_object('progress', 0, 'target_count', 15, 'completed', false);
  end if;
  return json_build_object('progress', v_row.progress, 'target_count', v_row.target_count, 'completed', v_row.completed);
end; $$;
revoke all on function get_daily_status from public;
grant execute on function get_daily_status to authenticated;

-- ============================================================
-- grant_kill_reward — VIẾT LẠI thêm phần cộng tiến độ Daily Quest.
-- (Phần main-quest 'kill' và rơi đồ giữ nguyên logic như migration 005.)
-- ============================================================
create or replace function grant_kill_reward(p_character_id uuid, p_monster_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_def record;
  v_last timestamptz;
  v_gold_gained int;
  v_reward json;
  v_drop record;
  v_roll numeric;
  v_loot_token uuid;
  v_loot_item text;
  v_qid text; v_q record; v_progress int; v_quest_event json := null;
  v_today date := (now() at time zone 'utc')::date;
  v_daily record; v_daily_event json := null; v_char_level int;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Không có quyền trên nhân vật này';
  end if;

  select * into v_def from monster_defs where id = p_monster_id;
  if not found then raise exception 'Loại quái không hợp lệ: %', p_monster_id; end if;

  select last_at into v_last from kill_cooldowns where character_id = p_character_id and monster_id = p_monster_id;
  if v_last is not null and now() - v_last < make_interval(secs => v_def.min_kill_interval_ms / 1000.0) then
    raise exception 'Thao tác quá nhanh, thử lại sau';
  end if;
  insert into kill_cooldowns (character_id, monster_id, last_at) values (p_character_id, p_monster_id, now())
    on conflict (character_id, monster_id) do update set last_at = now();

  v_gold_gained := v_def.gold_min + floor(random() * (v_def.gold_max - v_def.gold_min + 1));
  select apply_currency_reward(p_character_id, v_gold_gained, v_def.exp_reward) into v_reward;

  for v_drop in select * from monster_drops where monster_id = p_monster_id order by drop_chance asc loop
    v_roll := random();
    if v_roll <= v_drop.drop_chance then
      insert into pending_loot (character_id, item_template_id, rolled_atk, rolled_def)
      select p_character_id, it.id,
        greatest(0, round(it.base_atk * (0.85 + random() * 0.3))),
        greatest(0, round(it.base_def * (0.85 + random() * 0.3)))
      from item_templates it where it.id = v_drop.item_template_id
      returning token into v_loot_token;
      v_loot_item := v_drop.item_template_id;
      exit;
    end if;
  end loop;

  -- Tiến độ main quest (kill)
  v_qid := get_current_quest(p_character_id);
  if v_qid is not null then
    select * into v_q from quests where id = v_qid;
    if v_q.type = 'kill' and v_q.target_monster_id = p_monster_id then
      insert into character_quests (character_id, quest_id, status, progress)
        values (p_character_id, v_qid, 'in_progress', 1)
        on conflict (character_id, quest_id) do update set progress = character_quests.progress + 1, updated_at = now();
      select progress into v_progress from character_quests where character_id = p_character_id and quest_id = v_qid;
      if v_progress >= v_q.target_count then
        update character_quests set status = 'completed' where character_id = p_character_id and quest_id = v_qid;
        select apply_currency_reward(p_character_id, v_q.reward_gold, v_q.reward_exp) into v_reward;
        v_quest_event := json_build_object('quest_completed', v_q.title, 'next_quest_id', v_q.next_quest_id);
      else
        v_quest_event := json_build_object('quest_progress', v_progress, 'quest_target', v_q.target_count, 'quest_title', v_q.title);
      end if;
    end if;
  end if;

  -- Tiến độ Daily Quest (diệt bất kỳ quái nào, reset theo ngày UTC)
  insert into daily_quests (character_id, quest_date, progress) values (p_character_id, v_today, 1)
    on conflict (character_id, quest_date) do update set progress = daily_quests.progress + 1
    where daily_quests.completed = false;
  select * into v_daily from daily_quests where character_id = p_character_id and quest_date = v_today;
  if v_daily.progress >= v_daily.target_count and not v_daily.completed then
    update daily_quests set completed = true where character_id = p_character_id and quest_date = v_today;
    select level into v_char_level from characters where id = p_character_id;
    select apply_currency_reward(p_character_id, v_char_level * 5, v_char_level * 20) into v_reward; -- ghi đè số liệu mới nhất
    v_daily_event := json_build_object('daily_completed', true);
  end if;

  return json_build_object(
    'exp_gained', v_def.exp_reward, 'gold_gained', v_gold_gained,
    'leveled_up', v_reward->>'leveled_up' = 'true', 'levels_gained', (v_reward->>'levels_gained')::int,
    'new_level', (v_reward->>'new_level')::int, 'new_exp', (v_reward->>'new_exp')::bigint,
    'new_gold', (v_reward->>'new_gold')::bigint,
    'new_hp', (v_reward->>'new_hp')::int, 'new_mp', (v_reward->>'new_mp')::int,
    'new_hp_max', (v_reward->>'new_hp_max')::int, 'new_mp_max', (v_reward->>'new_mp_max')::int,
    'new_skill_points', (v_reward->>'new_skill_points')::int,
    'loot_token', v_loot_token, 'loot_item_id', v_loot_item,
    'quest_event', v_quest_event, 'daily_event', v_daily_event
  );
end;
$$;
revoke all on function grant_kill_reward from public;
grant execute on function grant_kill_reward to authenticated;

-- ==== PHASE 9 additions (Dungeon: Hang Quỷ, Cổ Mộ) — xem chi tiết trong supabase/migrations/009_phase9_dungeons.sql ====
-- Migration 009 — Dungeon (Phó bản): entry requirement, giới hạn lượt/ngày,
-- boss riêng, phần thưởng đảm bảo. Chạy sau 001–008.

insert into monster_defs (id, name, tier, level, exp_reward, gold_min, gold_max, min_kill_interval_ms) values
  ('devil_cave_lord', 'Ma Quật Chi Chủ', 'boss', 15, 900, 300, 450, 30000),
  ('tomb_guardian_king', 'Cổ Mộ Thủ Hộ Vương', 'boss', 35, 1925, 700, 1050, 60000)
on conflict (id) do update set
  name = excluded.name, tier = excluded.tier, level = excluded.level,
  exp_reward = excluded.exp_reward, gold_min = excluded.gold_min,
  gold_max = excluded.gold_max, min_kill_interval_ms = excluded.min_kill_interval_ms;

insert into item_templates (id, name, slot, quality, icon, base_atk, base_def, level_req, stackable, max_stack) values
  ('devilcave_amulet', 'Ma Quật Hộ Phù', 'neck', 'hiem', '🧿', 12, 15, 15, false, 1),
  ('tombking_crown', 'Cổ Mộ Vương Miện', 'head', 'suthi', '👑', 20, 30, 35, false, 1)
on conflict (id) do update set
  name = excluded.name, slot = excluded.slot, quality = excluded.quality, icon = excluded.icon,
  base_atk = excluded.base_atk, base_def = excluded.base_def, level_req = excluded.level_req,
  stackable = excluded.stackable, max_stack = excluded.max_stack;

create table if not exists dungeons (
  id text primary key,
  name text not null,
  level_req int not null,
  daily_limit int not null default 1,
  boss_monster_id text not null references monster_defs(id),
  reward_gold_bonus int not null default 0,
  reward_exp_bonus int not null default 0,
  guaranteed_item_template_id text references item_templates(id)
);
alter table dungeons enable row level security;
create policy "dungeons: ai cũng đọc được (nội dung tĩnh)" on dungeons for select using (true);

insert into dungeons (id, name, level_req, daily_limit, boss_monster_id, reward_gold_bonus, reward_exp_bonus, guaranteed_item_template_id) values
  ('hang_quy', 'Hang Quỷ', 15, 1, 'devil_cave_lord', 200, 500, 'devilcave_amulet'),
  ('co_mo', 'Cổ Mộ', 35, 1, 'tomb_guardian_king', 500, 1200, 'tombking_crown')
on conflict (id) do update set
  name = excluded.name, level_req = excluded.level_req, daily_limit = excluded.daily_limit,
  boss_monster_id = excluded.boss_monster_id, reward_gold_bonus = excluded.reward_gold_bonus,
  reward_exp_bonus = excluded.reward_exp_bonus, guaranteed_item_template_id = excluded.guaranteed_item_template_id;

create table if not exists dungeon_clears (
  character_id uuid not null references characters(id) on delete cascade,
  dungeon_id text not null references dungeons(id),
  clear_date date not null default (now() at time zone 'utc')::date,
  clears_count int not null default 0,
  primary key (character_id, dungeon_id, clear_date)
);
alter table dungeon_clears enable row level security;
create policy "dungeon_clears: xem của mình" on dungeon_clears
  for select using (character_id in (select id from characters where profile_id = auth.uid()));

-- Trả về danh sách lượt đã đánh hôm nay cho từng dungeon, để UI hiện
-- "còn X/limit lượt" trước khi người chơi bấm vào.
create or replace function get_dungeon_status(p_character_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_today date := (now() at time zone 'utc')::date; v_result json;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  select json_agg(json_build_object(
    'dungeon_id', d.id,
    'clears_today', coalesce(dc.clears_count, 0),
    'daily_limit', d.daily_limit
  )) into v_result
  from dungeons d
  left join dungeon_clears dc on dc.dungeon_id = d.id and dc.character_id = p_character_id and dc.clear_date = v_today;

  return coalesce(v_result, '[]'::json);
end; $$;
revoke all on function get_dungeon_status from public;
grant execute on function get_dungeon_status to authenticated;

-- Gọi mỗi khi hạ 1 con boss bất kỳ (client không cần biết boss nào thuộc
-- dungeon nào — hàm tự tra bảng dungeons theo boss_monster_id; nếu không
-- khớp dungeon nào thì trả về is_dungeon=false, an toàn để gọi vô điều kiện).
create or replace function complete_dungeon(p_character_id uuid, p_boss_monster_id text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_d record; v_char_level int; v_today date := (now() at time zone 'utc')::date;
  v_clear record; v_reward json; v_loot_token uuid;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  select * into v_d from dungeons where boss_monster_id = p_boss_monster_id;
  if not found then
    return json_build_object('is_dungeon', false);
  end if;

  select level into v_char_level from characters where id = p_character_id;
  if v_char_level < v_d.level_req then
    return json_build_object('is_dungeon', true, 'error', 'chua_du_cap');
  end if;

  insert into dungeon_clears (character_id, dungeon_id, clear_date, clears_count)
    values (p_character_id, v_d.id, v_today, 0)
    on conflict (character_id, dungeon_id, clear_date) do nothing;
  select * into v_clear from dungeon_clears where character_id = p_character_id and dungeon_id = v_d.id and clear_date = v_today for update;

  if v_clear.clears_count >= v_d.daily_limit then
    return json_build_object('is_dungeon', true, 'dungeon_name', v_d.name, 'already_cleared_today', true);
  end if;

  update dungeon_clears set clears_count = clears_count + 1
    where character_id = p_character_id and dungeon_id = v_d.id and clear_date = v_today;

  select apply_currency_reward(p_character_id, v_d.reward_gold_bonus, v_d.reward_exp_bonus) into v_reward;

  if v_d.guaranteed_item_template_id is not null then
    insert into pending_loot (character_id, item_template_id, rolled_atk, rolled_def)
    select p_character_id, it.id, it.base_atk, it.base_def
    from item_templates it where it.id = v_d.guaranteed_item_template_id
    returning token into v_loot_token;
  end if;

  return json_build_object(
    'is_dungeon', true, 'dungeon_name', v_d.name, 'already_cleared_today', false,
    'reward', v_reward, 'loot_token', v_loot_token, 'loot_item_id', v_d.guaranteed_item_template_id
  );
end; $$;
revoke all on function complete_dungeon from public;
grant execute on function complete_dungeon to authenticated;

-- ==== PHASE 10 additions (PvP: thách đấu + xếp hạng) — xem chi tiết trong supabase/migrations/010_phase10_pvp.sql ====
-- Migration 010 — PvP: thách đấu + bảng xếp hạng.
-- QUAN TRỌNG VỀ KIẾN TRÚC: trận đấu THẬT SỰ (vị trí, đòn đánh, HP trong lúc
-- đánh) chạy real-time qua Supabase Realtime Broadcast giữa 2 trình duyệt
-- (xem src/app/duel/[duelId]/page.tsx) — KHÔNG đi qua bảng này từng frame.
-- Bảng/RPC ở đây chỉ lo 2 việc: (1) quy trình thách đấu — chấp nhận/từ chối,
-- (2) ghi nhận KẾT QUẢ cuối cùng sau khi 2 client tự phân định thắng thua.
-- Giới hạn trung thực: vì combat chạy client-client (không có server trọng
-- tài), người chơi có thể sửa client để gian lận kết quả. Chấp nhận được
-- cho mục đích cá nhân/thử nghiệm; muốn chống gian lận thật cần 1 server
-- mô phỏng trận đấu độc lập (ngoài phạm vi kiến trúc serverless hiện tại).

create table if not exists pvp_ranks (
  character_id uuid primary key references characters(id) on delete cascade,
  rating int not null default 1000,
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now()
);
alter table pvp_ranks enable row level security;
create policy "pvp_ranks: ai cũng xem được (bảng xếp hạng công khai)" on pvp_ranks for select using (true);

create table if not exists pvp_duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references characters(id),
  opponent_id uuid not null references characters(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','completed')),
  winner_id uuid references characters(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table pvp_duels enable row level security;
create policy "pvp_duels: xem thách đấu liên quan tới mình" on pvp_duels
  for select using (
    challenger_id in (select id from characters where profile_id = auth.uid())
    or opponent_id in (select id from characters where profile_id = auth.uid())
  );

create or replace function create_duel_challenge(p_challenger_id uuid, p_opponent_name text) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_opponent_id uuid; v_duel_id uuid;
begin
  select profile_id into v_owner from characters where id = p_challenger_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  select id into v_opponent_id from characters where lower(name) = lower(p_opponent_name);
  if v_opponent_id is null then raise exception 'Không tìm thấy nhân vật "%"', p_opponent_name; end if;
  if v_opponent_id = p_challenger_id then raise exception 'Không thể thách đấu chính mình'; end if;

  insert into pvp_duels (challenger_id, opponent_id) values (p_challenger_id, v_opponent_id)
  returning id into v_duel_id;
  return json_build_object('duel_id', v_duel_id);
end; $$;
revoke all on function create_duel_challenge from public;
grant execute on function create_duel_challenge to authenticated;

create or replace function respond_duel(p_duel_id uuid, p_character_id uuid, p_accept boolean) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_duel record;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  select * into v_duel from pvp_duels where id = p_duel_id and status = 'pending';
  if not found then raise exception 'Lời thách đấu không tồn tại hoặc đã xử lý'; end if;
  if v_duel.opponent_id <> p_character_id then raise exception 'Chỉ người bị thách đấu mới phản hồi được'; end if;

  update pvp_duels set status = case when p_accept then 'accepted' else 'declined' end, updated_at = now()
    where id = p_duel_id;
  return json_build_object('success', true, 'accepted', p_accept);
end; $$;
revoke all on function respond_duel from public;
grant execute on function respond_duel to authenticated;

-- Gọi bởi client sau khi 2 bên tự phân định thắng thua qua Realtime Broadcast.
-- Idempotent: gọi 2 lần (cả 2 bên cùng báo) chỉ tính điểm 1 lần.
create or replace function report_duel_result(p_duel_id uuid, p_character_id uuid, p_winner_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_duel record; v_loser_id uuid;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  select * into v_duel from pvp_duels where id = p_duel_id for update;
  if not found then raise exception 'Trận đấu không tồn tại'; end if;
  if p_character_id not in (v_duel.challenger_id, v_duel.opponent_id) then raise exception 'Không thuộc trận đấu này'; end if;

  if v_duel.status = 'completed' then
    return json_build_object('success', true, 'already_recorded', true, 'winner_id', v_duel.winner_id);
  end if;
  if v_duel.status <> 'accepted' then raise exception 'Trận đấu chưa ở trạng thái thi đấu'; end if;

  v_loser_id := case when p_winner_id = v_duel.challenger_id then v_duel.opponent_id else v_duel.challenger_id end;

  insert into pvp_ranks (character_id) values (v_duel.challenger_id) on conflict do nothing;
  insert into pvp_ranks (character_id) values (v_duel.opponent_id) on conflict do nothing;

  update pvp_ranks set rating = rating + 16, wins = wins + 1, updated_at = now() where character_id = p_winner_id;
  update pvp_ranks set rating = greatest(0, rating - 16), losses = losses + 1, updated_at = now() where character_id = v_loser_id;

  update pvp_duels set status = 'completed', winner_id = p_winner_id, updated_at = now() where id = p_duel_id;

  return json_build_object('success', true, 'already_recorded', false, 'winner_id', p_winner_id);
end; $$;
revoke all on function report_duel_result from public;
grant execute on function report_duel_result to authenticated;

-- ==== PHASE 10b additions (PvP server-authoritative combat) — xem chi tiết trong supabase/migrations/011_phase10b_pvp_authoritative.sql ====
-- Migration 011 — PvP server-authoritative combat.
-- Sửa lỗ hổng của migration 010: trước đây client tự tính sát thương rồi
-- "thông báo" cho đối thủ qua Broadcast — đối thủ buộc phải tin. Từ giờ:
-- client chỉ gửi "tôi vừa dùng chiêu X nhắm vào đối thủ", SERVER tự tra
-- chỉ số thật (cấp độ, trang bị, rank skill) trong DB để tính sát thương,
-- tự theo dõi HP trong trận, và tự quyết định ai thắng — khớp đúng mô hình
-- đã dùng cho PvE (grant_kill_reward). Vị trí/di chuyển vẫn qua Broadcast
-- (chỉ ảnh hưởng hình ảnh, không ảnh hưởng kết quả nên không cần server).

create table if not exists skills (
  id text primary key,
  class text not null,
  kind text not null check (kind in ('basic','single','aoe','support')),
  level_req int not null,
  mp_cost int not null,
  cooldown_ms int not null,
  range int not null,
  aoe_radius int,
  dmg_multiplier numeric not null,
  heal_percent numeric
);
alter table skills enable row level security;
create policy "skills: ai cũng đọc được (nội dung tĩnh)" on skills for select using (true);

insert into skills (id, class, kind, level_req, mp_cost, cooldown_ms, range, aoe_radius, dmg_multiplier, heal_percent) values
  ('kiem_basic','kiem','basic',1,0,500,70,null,1.0,null),
  ('kiem_single','kiem','single',4,12,2500,80,null,2.1,null),
  ('kiem_aoe','kiem','aoe',10,20,6000,0,95,1.5,null),
  ('kiem_support','kiem','support',15,25,15000,0,null,0,0.35),
  ('dao_basic','dao','basic',1,0,550,65,null,1.15,null),
  ('dao_single','dao','single',4,14,2800,75,null,2.5,null),
  ('dao_aoe','dao','aoe',10,24,6500,0,90,1.7,null),
  ('dao_support','dao','support',15,20,14000,0,null,0,0.25),
  ('cung_basic','cung','basic',1,0,450,260,null,0.95,null),
  ('cung_single','cung','single',4,10,2200,320,null,2.0,null),
  ('cung_aoe','cung','aoe',10,22,6000,0,110,1.4,null),
  ('cung_support','cung','support',15,15,12000,0,null,0,0.15),
  ('phap_basic','phap','basic',1,4,600,240,null,1.1,null),
  ('phap_single','phap','single',4,16,2600,300,null,2.4,null),
  ('phap_aoe','phap','aoe',10,28,6000,0,100,1.8,null),
  ('phap_support','phap','support',15,30,13000,0,null,0,0.45),
  ('quyen_basic','quyen','basic',1,0,400,60,null,0.9,null),
  ('quyen_single','quyen','single',4,11,2000,70,null,1.9,null),
  ('quyen_aoe','quyen','aoe',10,18,5500,0,85,1.4,null),
  ('quyen_support','quyen','support',15,20,11000,0,null,0,0.3)
on conflict (id) do update set
  class = excluded.class, kind = excluded.kind, level_req = excluded.level_req,
  mp_cost = excluded.mp_cost, cooldown_ms = excluded.cooldown_ms, range = excluded.range,
  aoe_radius = excluded.aoe_radius, dmg_multiplier = excluded.dmg_multiplier, heal_percent = excluded.heal_percent;

-- HP sống của từng bên TRONG trận đấu hiện tại (tách khỏi hp ngoài world,
-- vào đấu trường luôn đầy máu). Server là nơi DUY NHẤT sửa bảng này.
create table if not exists duel_live_state (
  duel_id uuid not null references pvp_duels(id) on delete cascade,
  character_id uuid not null references characters(id),
  hp int not null,
  hp_max int not null,
  primary key (duel_id, character_id)
);
alter table duel_live_state enable row level security;
create policy "duel_live_state: xem nếu thuộc trận đấu của mình" on duel_live_state
  for select using (character_id in (select id from characters where profile_id = auth.uid()));

create table if not exists duel_cast_cooldowns (
  duel_id uuid not null references pvp_duels(id) on delete cascade,
  character_id uuid not null,
  skill_id text not null,
  last_at timestamptz not null default now(),
  primary key (duel_id, character_id, skill_id)
);
alter table duel_cast_cooldowns enable row level security;
-- Không có policy select cho client -> chỉ RPC SECURITY DEFINER đụng được.

/** ATK hiệu dụng của 1 nhân vật = công thức giống client (skills.ts attackPowerFor)
 *  + tổng ATK trang bị đang mặc. */
create or replace function duel_character_atk(p_character_id uuid, p_skill_id text) returns int
language plpgsql stable as $$
declare
  v_level int; v_str int; v_dex int; v_int int; v_class text;
  v_main_stat int; v_equip_atk int; v_rank int;
begin
  select level, str, dex, int_, class into v_level, v_str, v_dex, v_int, v_class from characters where id = p_character_id;
  v_main_stat := case v_class when 'phap' then v_int when 'cung' then v_dex else v_str end;
  select coalesce(sum(rolled_atk), 0) into v_equip_atk from inventory where character_id = p_character_id and equipped_slot is not null;
  select coalesce(rank, 0) into v_rank from character_skill_ranks where character_id = p_character_id and skill_id = p_skill_id;
  return round((8 + v_level * 3 + round(v_main_stat * 1.5) + v_equip_atk) * (1 + v_rank * 0.12));
end; $$;

create or replace function duel_character_def(p_character_id uuid) returns int
language sql stable as $$
  select coalesce(sum(rolled_def), 0) from inventory where character_id = p_character_id and equipped_slot is not null;
$$;

create or replace function init_duel_combat(p_duel_id uuid, p_character_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_duel record; v_hp_max int; v_con int; v_level int;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  select * into v_duel from pvp_duels where id = p_duel_id and status = 'accepted';
  if not found then raise exception 'Trận đấu không hợp lệ'; end if;
  if p_character_id not in (v_duel.challenger_id, v_duel.opponent_id) then raise exception 'Không thuộc trận đấu này'; end if;

  select level, con into v_level, v_con from characters where id = p_character_id;
  v_hp_max := 100 + v_level * 20 + v_con * 6;

  insert into duel_live_state (duel_id, character_id, hp, hp_max) values (p_duel_id, p_character_id, v_hp_max, v_hp_max)
    on conflict (duel_id, character_id) do nothing;

  return json_build_object('hp', v_hp_max, 'hp_max', v_hp_max);
end; $$;
revoke all on function init_duel_combat from public;
grant execute on function init_duel_combat to authenticated;

-- Hàm chính: attacker báo "vừa dùng skill X trúng đối thủ". Server tự tính
-- sát thương thật, enforce cooldown, cập nhật HP, và TỰ kết thúc trận nếu
-- HP đối thủ về 0 (không cần client tự báo thắng/thua nữa).
create or replace function report_duel_hit(p_duel_id uuid, p_attacker_id uuid, p_skill_id text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_duel record; v_defender_id uuid; v_skill record;
  v_last timestamptz; v_atk int; v_def int; v_crit boolean; v_dmg int;
  v_defender_hp int; v_defender_hp_max int; v_duel_ended boolean := false;
begin
  select profile_id into v_owner from characters where id = p_attacker_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  select * into v_duel from pvp_duels where id = p_duel_id and status = 'accepted' for update;
  if not found then raise exception 'Trận đấu không hợp lệ hoặc đã kết thúc'; end if;
  if p_attacker_id not in (v_duel.challenger_id, v_duel.opponent_id) then raise exception 'Không thuộc trận đấu này'; end if;
  v_defender_id := case when p_attacker_id = v_duel.challenger_id then v_duel.opponent_id else v_duel.challenger_id end;

  select * into v_skill from skills where id = p_skill_id;
  if not found then raise exception 'Skill không hợp lệ'; end if;

  select last_at into v_last from duel_cast_cooldowns where duel_id = p_duel_id and character_id = p_attacker_id and skill_id = p_skill_id;
  if v_last is not null and now() - v_last < make_interval(secs => v_skill.cooldown_ms / 1000.0) then
    raise exception 'Chiêu chưa hồi';
  end if;
  insert into duel_cast_cooldowns (duel_id, character_id, skill_id, last_at) values (p_duel_id, p_attacker_id, p_skill_id, now())
    on conflict (duel_id, character_id, skill_id) do update set last_at = now();

  v_atk := duel_character_atk(p_attacker_id, p_skill_id);
  v_def := duel_character_def(v_defender_id);
  v_crit := random() < 0.15;
  v_dmg := greatest(1, round(v_atk * v_skill.dmg_multiplier * (case when v_crit then 1.6 else 1 end)) - round(v_def * 0.6));

  select hp, hp_max into v_defender_hp, v_defender_hp_max from duel_live_state where duel_id = p_duel_id and character_id = v_defender_id for update;
  if not found then raise exception 'Chưa khởi tạo trạng thái trận đấu cho đối thủ'; end if;

  v_defender_hp := greatest(0, v_defender_hp - v_dmg);
  update duel_live_state set hp = v_defender_hp where duel_id = p_duel_id and character_id = v_defender_id;

  if v_defender_hp <= 0 then
    v_duel_ended := true;
    update pvp_duels set status = 'completed', winner_id = p_attacker_id, updated_at = now() where id = p_duel_id;
    insert into pvp_ranks (character_id) values (p_attacker_id) on conflict do nothing;
    insert into pvp_ranks (character_id) values (v_defender_id) on conflict do nothing;
    update pvp_ranks set rating = rating + 16, wins = wins + 1, updated_at = now() where character_id = p_attacker_id;
    update pvp_ranks set rating = greatest(0, rating - 16), losses = losses + 1, updated_at = now() where character_id = v_defender_id;
  end if;

  return json_build_object(
    'success', true, 'damage', v_dmg, 'crit', v_crit,
    'defender_id', v_defender_id, 'defender_new_hp', v_defender_hp, 'defender_hp_max', v_defender_hp_max,
    'duel_ended', v_duel_ended, 'winner_id', case when v_duel_ended then p_attacker_id else null end
  );
end; $$;
revoke all on function report_duel_hit from public;
grant execute on function report_duel_hit to authenticated;

-- ==== PHASE 11 additions (Bang Hội) — xem chi tiết trong supabase/migrations/012_phase11_guild.sql ====
-- Migration 012 — Bang Hội (Guild): tạo/gia nhập/rời bang, vai trò, kho bang,
-- chat bang real-time qua Supabase Realtime (Postgres Changes trên bảng
-- guild_chat_messages — khác với PvP dùng Broadcast vì chat cần lưu lại,
-- combat thì không). Lát cắt MVP: chưa có cấp bang/exp bang/nhiệm vụ bang/
-- boss bang — ghi rõ trong README, làm ở lượt sau.

create table if not exists guilds (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  leader_character_id uuid not null references characters(id),
  gold bigint not null default 0,
  announcement text not null default '',
  created_at timestamptz not null default now()
);
alter table guilds enable row level security;
create policy "guilds: ai cũng xem được (để tìm bang gia nhập)" on guilds for select using (true);

create table if not exists guild_members (
  guild_id uuid not null references guilds(id) on delete cascade,
  character_id uuid not null references characters(id) unique, -- 1 nhân vật chỉ ở 1 bang
  role text not null default 'member' check (role in ('leader','officer','member')),
  joined_at timestamptz not null default now(),
  primary key (guild_id, character_id)
);
alter table guild_members enable row level security;
create policy "guild_members: ai cũng xem được (danh sách thành viên công khai)" on guild_members for select using (true);

create table if not exists guild_chat_messages (
  id bigint generated always as identity primary key,
  guild_id uuid not null references guilds(id) on delete cascade,
  character_id uuid not null references characters(id),
  character_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);
alter table guild_chat_messages enable row level security;
create policy "guild_chat: chỉ thành viên trong bang mới đọc được" on guild_chat_messages
  for select using (
    guild_id in (select guild_id from guild_members where character_id in (select id from characters where profile_id = auth.uid()))
  );

create or replace function get_my_guild(p_character_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_guild_id uuid; v_guild record; v_members json;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  select guild_id into v_guild_id from guild_members where character_id = p_character_id;
  if v_guild_id is null then return json_build_object('in_guild', false); end if;

  select * into v_guild from guilds where id = v_guild_id;
  select json_agg(json_build_object(
    'character_id', gm.character_id, 'name', c.name, 'level', c.level,
    'role', gm.role, 'joined_at', gm.joined_at
  ) order by case gm.role when 'leader' then 0 when 'officer' then 1 else 2 end, gm.joined_at)
  into v_members
  from guild_members gm join characters c on c.id = gm.character_id
  where gm.guild_id = v_guild_id;

  return json_build_object(
    'in_guild', true, 'guild_id', v_guild.id, 'name', v_guild.name,
    'gold', v_guild.gold, 'announcement', v_guild.announcement,
    'leader_character_id', v_guild.leader_character_id,
    'my_role', (select role from guild_members where guild_id = v_guild_id and character_id = p_character_id),
    'members', coalesce(v_members, '[]'::json)
  );
end; $$;
revoke all on function get_my_guild from public;
grant execute on function get_my_guild to authenticated;

create or replace function create_guild(p_character_id uuid, p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_existing uuid; v_gold bigint; v_guild_id uuid;
declare c_cost constant int := 1000;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  if length(trim(p_name)) < 3 then raise exception 'Tên bang phải từ 3 ký tự'; end if;

  select guild_id into v_existing from guild_members where character_id = p_character_id;
  if v_existing is not null then raise exception 'Bạn đã ở trong 1 bang rồi'; end if;

  select gold into v_gold from characters where id = p_character_id;
  if v_gold < c_cost then raise exception 'Cần % vàng để lập bang (hiện có %)', c_cost, v_gold; end if;

  insert into guilds (name, leader_character_id) values (trim(p_name), p_character_id)
  returning id into v_guild_id;
  insert into guild_members (guild_id, character_id, role) values (v_guild_id, p_character_id, 'leader');
  update characters set gold = gold - c_cost where id = p_character_id;

  return json_build_object('success', true, 'guild_id', v_guild_id);
exception when unique_violation then
  raise exception 'Tên bang đã có người dùng';
end; $$;
revoke all on function create_guild from public;
grant execute on function create_guild to authenticated;

create or replace function join_guild(p_character_id uuid, p_guild_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_existing uuid;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  select guild_id into v_existing from guild_members where character_id = p_character_id;
  if v_existing is not null then raise exception 'Bạn đã ở trong 1 bang rồi'; end if;

  insert into guild_members (guild_id, character_id, role) values (p_guild_id, p_character_id, 'member');
  return json_build_object('success', true);
end; $$;
revoke all on function join_guild from public;
grant execute on function join_guild to authenticated;

create or replace function leave_guild(p_character_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_guild_id uuid; v_role text; v_next_leader uuid; v_remaining int;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  select guild_id, role into v_guild_id, v_role from guild_members where character_id = p_character_id;
  if v_guild_id is null then raise exception 'Bạn không ở trong bang nào'; end if;

  if v_role = 'leader' then
    select count(*) into v_remaining from guild_members where guild_id = v_guild_id and character_id <> p_character_id;
    if v_remaining = 0 then
      delete from guilds where id = v_guild_id; -- bang trống -> giải tán luôn
      return json_build_object('success', true, 'guild_disbanded', true);
    end if;
    -- Tự động chuyển chức cho người lâu năm nhất (ưu tiên officer trước)
    select character_id into v_next_leader from guild_members
      where guild_id = v_guild_id and character_id <> p_character_id
      order by case role when 'officer' then 0 else 1 end, joined_at asc limit 1;
    update guild_members set role = 'leader' where guild_id = v_guild_id and character_id = v_next_leader;
    update guilds set leader_character_id = v_next_leader where id = v_guild_id;
  end if;

  delete from guild_members where character_id = p_character_id;
  return json_build_object('success', true, 'guild_disbanded', false);
end; $$;
revoke all on function leave_guild from public;
grant execute on function leave_guild to authenticated;

create or replace function kick_member(p_character_id uuid, p_target_character_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_guild_id uuid; v_my_role text; v_target_role text; v_target_guild uuid;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  select guild_id, role into v_guild_id, v_my_role from guild_members where character_id = p_character_id;
  if v_guild_id is null or v_my_role = 'member' then raise exception 'Bạn không có quyền đuổi thành viên'; end if;

  select guild_id, role into v_target_guild, v_target_role from guild_members where character_id = p_target_character_id;
  if v_target_guild <> v_guild_id then raise exception 'Người này không ở cùng bang'; end if;
  if v_target_role = 'leader' then raise exception 'Không thể đuổi Bang Chủ'; end if;
  if v_target_role = 'officer' and v_my_role <> 'leader' then raise exception 'Chỉ Bang Chủ mới đuổi được Phó Bang Chủ'; end if;

  delete from guild_members where character_id = p_target_character_id;
  return json_build_object('success', true);
end; $$;
revoke all on function kick_member from public;
grant execute on function kick_member to authenticated;

create or replace function set_member_role(p_character_id uuid, p_target_character_id uuid, p_role text) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_guild_id uuid; v_my_role text; v_target_guild uuid;
begin
  if p_role not in ('officer','member') then raise exception 'Vai trò không hợp lệ'; end if;
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  select guild_id, role into v_guild_id, v_my_role from guild_members where character_id = p_character_id;
  if v_my_role <> 'leader' then raise exception 'Chỉ Bang Chủ mới đổi được chức vụ'; end if;

  select guild_id into v_target_guild from guild_members where character_id = p_target_character_id;
  if v_target_guild <> v_guild_id then raise exception 'Người này không ở cùng bang'; end if;

  update guild_members set role = p_role where character_id = p_target_character_id;
  return json_build_object('success', true);
end; $$;
revoke all on function set_member_role from public;
grant execute on function set_member_role to authenticated;

create or replace function set_guild_announcement(p_character_id uuid, p_text text) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_guild_id uuid; v_role text;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  select guild_id, role into v_guild_id, v_role from guild_members where character_id = p_character_id;
  if v_role not in ('leader','officer') then raise exception 'Không có quyền sửa thông báo bang'; end if;
  update guilds set announcement = left(p_text, 500) where id = v_guild_id;
  return json_build_object('success', true);
end; $$;
revoke all on function set_guild_announcement from public;
grant execute on function set_guild_announcement to authenticated;

create or replace function deposit_guild_gold(p_character_id uuid, p_amount bigint) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_guild_id uuid; v_gold bigint;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  if p_amount <= 0 then raise exception 'Số vàng không hợp lệ'; end if;

  select guild_id into v_guild_id from guild_members where character_id = p_character_id;
  if v_guild_id is null then raise exception 'Bạn không ở trong bang nào'; end if;
  select gold into v_gold from characters where id = p_character_id;
  if v_gold < p_amount then raise exception 'Không đủ vàng'; end if;

  update characters set gold = gold - p_amount where id = p_character_id;
  update guilds set gold = gold + p_amount where id = v_guild_id;
  return json_build_object('success', true);
end; $$;
revoke all on function deposit_guild_gold from public;
grant execute on function deposit_guild_gold to authenticated;

create or replace function withdraw_guild_gold(p_character_id uuid, p_amount bigint) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_guild_id uuid; v_role text; v_guild_gold bigint;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  if p_amount <= 0 then raise exception 'Số vàng không hợp lệ'; end if;

  select guild_id, role into v_guild_id, v_role from guild_members where character_id = p_character_id;
  if v_role not in ('leader','officer') then raise exception 'Chỉ Bang Chủ/Phó Bang Chủ mới rút được quỹ bang'; end if;
  select gold into v_guild_gold from guilds where id = v_guild_id;
  if v_guild_gold < p_amount then raise exception 'Quỹ bang không đủ'; end if;

  update guilds set gold = gold - p_amount where id = v_guild_id;
  update characters set gold = gold + p_amount where id = p_character_id;
  return json_build_object('success', true);
end; $$;
revoke all on function withdraw_guild_gold from public;
grant execute on function withdraw_guild_gold to authenticated;

create or replace function send_guild_chat(p_character_id uuid, p_message text) returns json
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_guild_id uuid; v_name text; v_last timestamptz;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;
  if length(trim(p_message)) = 0 then raise exception 'Tin nhắn trống'; end if;

  select gm.guild_id, c.name into v_guild_id, v_name from guild_members gm join characters c on c.id = gm.character_id
    where gm.character_id = p_character_id;
  if v_guild_id is null then raise exception 'Bạn không ở trong bang nào'; end if;

  select max(created_at) into v_last from guild_chat_messages where character_id = p_character_id;
  if v_last is not null and now() - v_last < interval '1 second' then
    raise exception 'Gửi chậm lại';
  end if;

  insert into guild_chat_messages (guild_id, character_id, character_name, message)
  values (v_guild_id, p_character_id, v_name, left(trim(p_message), 300));
  return json_build_object('success', true);
end; $$;
revoke all on function send_guild_chat from public;
grant execute on function send_guild_chat to authenticated;

-- (bổ sung) bật Realtime cho guild_chat_messages
alter publication supabase_realtime add table guild_chat_messages;

-- ==== SECURITY FIX (chạy sau cùng, vá lỗ hổng RLS) — xem chi tiết trong supabase/migrations/013_security_fix_rls_holes.sql ====
-- Migration 013 — VÁ LỖI BẢO MẬT NGHIÊM TRỌNG, CHẠY NGAY LẬP TỨC.
--
-- Phát hiện khi rà soát lại toàn bộ RLS trước khi deploy cho nhiều người chơi:
--
-- 1) profiles có policy UPDATE "auth.uid()=id" KHÔNG giới hạn cột nào được
--    sửa. RLS chỉ lọc THEO DÒNG, không lọc theo CỘT — nên bất kỳ người chơi
--    nào cũng tự chạy được:
--      supabase.from('profiles').update({ role: 'owner' }).eq('id', myId)
--    và biến mình thành admin ngay lập tức, vì toàn bộ hệ thống admin
--    (requireAdmin trong src/lib/supabase/admin.ts) tin tưởng cột này.
--    Không có chỗ nào trong code thật sự dùng policy này (đã rà soát) nên
--    gỡ bỏ hoàn toàn là an toàn.
--
-- 2) profiles THIẾU LUÔN policy INSERT — nghĩa là bước tạo hồ sơ lúc đăng ký
--    (src/app/login/page.tsx, client tự insert vào bảng profiles) đã BỊ RLS
--    CHẶN từ đầu, có thể gãy ngay từ Phase 1 mà build TypeScript không bắt
--    được lỗi này (build chỉ kiểm tra kiểu dữ liệu, không chạy thật DB).
--
-- 3) characters có policy INSERT chỉ kiểm tra "profile_id = auth.uid()",
--    KHÔNG giới hạn giá trị các cột khác — client có thể bỏ qua hẳn route
--    /api/character và tự gọi thẳng:
--      supabase.from('characters').insert({ profile_id, name, class,
--        gold: 999999999, level: 999, str: 999, ... })
--    để tạo nhân vật cấp độ/tiền/chỉ số tuỳ ý ngay từ đầu.
--
-- Sau migration này: tạo nhân vật BẮT BUỘC phải qua RPC create_character
-- (cùng mẫu với mọi thao tác nhạy cảm khác trong dự án — xem các RPC khác),
-- không còn INSERT trực tiếp từ client nữa.

-- ---- Fix (1) + (2): profiles ----
drop policy if exists "profiles: tự sửa vài trường" on profiles;
-- Không thêm lại policy UPDATE nào cho client. Nếu sau này cần cho người
-- chơi tự đổi 1 vài trường (vd avatar), làm qua RPC SECURITY DEFINER liệt
-- kê đúng cột được phép sửa — KHÔNG dùng policy UPDATE chung chung.

create policy "profiles: tạo hồ sơ của chính mình (1 lần lúc đăng ký)" on profiles
  for insert with check (auth.uid() = id and role = 'player' and is_banned = false);

-- ---- Fix (3): characters ----
drop policy if exists "characters: tạo nhân vật của chính mình" on characters;
-- Không còn policy INSERT nào cho characters nữa — ép buộc đi qua RPC dưới đây.

create or replace function create_character(p_name text, p_class_id text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_count int; v_base_str int; v_base_dex int; v_base_int int; v_base_con int; v_char_id uuid;
  c_max_characters constant int := 3;
begin
  if length(trim(p_name)) < 2 then raise exception 'Tên nhân vật phải có ít nhất 2 ký tự'; end if;
  if p_class_id not in ('kiem','dao','cung','phap','quyen') then raise exception 'Môn phái không hợp lệ'; end if;

  select count(*) into v_count from characters where profile_id = auth.uid();
  if v_count >= c_max_characters then raise exception 'Mỗi tài khoản tối đa % nhân vật', c_max_characters; end if;

  -- Chỉ số gốc theo môn phái — PHẢI khớp CLASSES trong src/game/data/classes.ts
  case p_class_id
    when 'kiem'  then v_base_str := 7; v_base_dex := 6; v_base_int := 4; v_base_con := 6;
    when 'dao'   then v_base_str := 9; v_base_dex := 5; v_base_int := 3; v_base_con := 5;
    when 'cung'  then v_base_str := 4; v_base_dex := 9; v_base_int := 4; v_base_con := 5;
    when 'phap'  then v_base_str := 3; v_base_dex := 4; v_base_int := 10; v_base_con := 4;
    when 'quyen' then v_base_str := 6; v_base_dex := 7; v_base_int := 4; v_base_con := 7;
  end case;

  insert into characters (profile_id, name, class, str, dex, int_, con, map_id, pos_x, pos_y)
  values (auth.uid(), trim(p_name), p_class_id, v_base_str, v_base_dex, v_base_int, v_base_con, 'village', 640, 448)
  returning id into v_char_id;

  return json_build_object('success', true, 'character_id', v_char_id);
exception when unique_violation then
  raise exception 'Tên nhân vật đã có người dùng';
end; $$;
revoke all on function create_character from public;
grant execute on function create_character to authenticated;

-- ==== PHASE 10c additions (duel heal server-authoritative) — xem chi tiết trong supabase/migrations/014_phase10c_duel_heal.sql ====
-- Migration 014 — Server-authoritative duel healing.
-- Rà soát phát hiện: report_duel_hit (migration 011) chỉ xử lý sát thương,
-- còn kỹ năng hồi máu (support) trong đấu trường vẫn do CLIENT tự cộng HP —
-- có thể bị sửa code để hồi máu vô hạn/bỏ qua hồi chiêu. Thêm RPC tương tự
-- report_duel_hit nhưng cho chiều hồi máu, dùng chung bảng duel_cast_cooldowns.

create or replace function report_duel_heal(p_duel_id uuid, p_character_id uuid, p_skill_id text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_duel record; v_skill record;
  v_last timestamptz; v_rank int; v_heal int;
  v_hp int; v_hp_max int;
begin
  select profile_id into v_owner from characters where id = p_character_id;
  if v_owner <> auth.uid() then raise exception 'Không có quyền'; end if;

  select * into v_duel from pvp_duels where id = p_duel_id and status = 'accepted';
  if not found then raise exception 'Trận đấu không hợp lệ hoặc đã kết thúc'; end if;
  if p_character_id not in (v_duel.challenger_id, v_duel.opponent_id) then raise exception 'Không thuộc trận đấu này'; end if;

  select * into v_skill from skills where id = p_skill_id and kind = 'support';
  if not found then raise exception 'Skill hồi máu không hợp lệ'; end if;

  select last_at into v_last from duel_cast_cooldowns where duel_id = p_duel_id and character_id = p_character_id and skill_id = p_skill_id;
  if v_last is not null and now() - v_last < make_interval(secs => v_skill.cooldown_ms / 1000.0) then
    raise exception 'Chiêu chưa hồi';
  end if;
  insert into duel_cast_cooldowns (duel_id, character_id, skill_id, last_at) values (p_duel_id, p_character_id, p_skill_id, now())
    on conflict (duel_id, character_id, skill_id) do update set last_at = now();

  select coalesce(rank, 0) into v_rank from character_skill_ranks where character_id = p_character_id and skill_id = p_skill_id;

  select hp, hp_max into v_hp, v_hp_max from duel_live_state where duel_id = p_duel_id and character_id = p_character_id for update;
  if not found then raise exception 'Chưa khởi tạo trạng thái trận đấu'; end if;

  v_heal := round(v_hp_max * v_skill.heal_percent * (1 + v_rank * 0.12));
  v_hp := least(v_hp_max, v_hp + v_heal);
  update duel_live_state set hp = v_hp where duel_id = p_duel_id and character_id = p_character_id;

  return json_build_object('success', true, 'heal', v_heal, 'new_hp', v_hp, 'hp_max', v_hp_max);
end; $$;
revoke all on function report_duel_heal from public;
grant execute on function report_duel_heal to authenticated;
