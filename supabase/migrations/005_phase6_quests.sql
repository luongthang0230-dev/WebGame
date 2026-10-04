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
