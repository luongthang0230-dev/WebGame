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
