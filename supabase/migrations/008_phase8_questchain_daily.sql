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
