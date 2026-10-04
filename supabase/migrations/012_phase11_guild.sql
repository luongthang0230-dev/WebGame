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

-- QUAN TRỌNG: Supabase không tự bật Realtime cho bảng mới — phải thêm vào
-- publication thì client mới nhận được sự kiện INSERT real-time (chat).
alter publication supabase_realtime add table guild_chat_messages;

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
