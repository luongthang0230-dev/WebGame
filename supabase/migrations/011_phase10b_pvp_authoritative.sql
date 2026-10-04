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
