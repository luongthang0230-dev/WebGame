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
