-- Migration 002: chạy file này nếu bạn ĐÃ chạy supabase/schema.sql ở Phase 1.
-- Nếu đây là setup mới, chỉ cần chạy schema.sql (đã gồm cả phần này).

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
