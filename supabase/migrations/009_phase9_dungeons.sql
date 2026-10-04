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
