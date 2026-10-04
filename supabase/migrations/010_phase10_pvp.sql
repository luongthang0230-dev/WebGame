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
