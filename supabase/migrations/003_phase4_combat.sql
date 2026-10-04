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
