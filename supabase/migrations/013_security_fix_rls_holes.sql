-- Migration 013 — VÁ LỖI BẢO MẬT NGHIÊM TRỌNG, CHẠY NGAY LẬP TỨC.
--
-- Phát hiện khi rà soát lại toàn bộ RLS trước khi deploy cho nhiều người chơi:
--
-- 1) profiles có policy UPDATE "auth.uid()=id" KHÔNG giới hạn cột nào được
--    sửa. RLS chỉ lọc THEO DÒNG, không lọc theo CỘT — nên bất kỳ người chơi
--    nào cũng tự chạy được:
--      supabase.from('profiles').update({ role: 'owner' }).eq('id', myId)
--    và biến mình thành admin ngay lập tức, vì toàn bộ hệ thống admin
--    (requireAdmin trong src/lib/supabase/admin.ts) tin tưởng cột này.
--    Không có chỗ nào trong code thật sự dùng policy này (đã rà soát) nên
--    gỡ bỏ hoàn toàn là an toàn.
--
-- 2) profiles THIẾU LUÔN policy INSERT — nghĩa là bước tạo hồ sơ lúc đăng ký
--    (src/app/login/page.tsx, client tự insert vào bảng profiles) đã BỊ RLS
--    CHẶN từ đầu, có thể gãy ngay từ Phase 1 mà build TypeScript không bắt
--    được lỗi này (build chỉ kiểm tra kiểu dữ liệu, không chạy thật DB).
--
-- 3) characters có policy INSERT chỉ kiểm tra "profile_id = auth.uid()",
--    KHÔNG giới hạn giá trị các cột khác — client có thể bỏ qua hẳn route
--    /api/character và tự gọi thẳng:
--      supabase.from('characters').insert({ profile_id, name, class,
--        gold: 999999999, level: 999, str: 999, ... })
--    để tạo nhân vật cấp độ/tiền/chỉ số tuỳ ý ngay từ đầu.
--
-- Sau migration này: tạo nhân vật BẮT BUỘC phải qua RPC create_character
-- (cùng mẫu với mọi thao tác nhạy cảm khác trong dự án — xem các RPC khác),
-- không còn INSERT trực tiếp từ client nữa.

-- ---- Fix (1) + (2): profiles ----
drop policy if exists "profiles: tự sửa vài trường" on profiles;
-- Không thêm lại policy UPDATE nào cho client. Nếu sau này cần cho người
-- chơi tự đổi 1 vài trường (vd avatar), làm qua RPC SECURITY DEFINER liệt
-- kê đúng cột được phép sửa — KHÔNG dùng policy UPDATE chung chung.

-- with check chặn CẢ việc tự đặt role/is_banned ngay lúc đăng ký — nếu chỉ
-- kiểm tra auth.uid()=id, client vẫn có thể insert kèm role:'owner' trong
-- CÙNG request đăng ký đầu tiên (chưa kịp bị chặn bởi việc "không có policy
-- UPDATE" vì đây là INSERT, không phải UPDATE).
create policy "profiles: tạo hồ sơ của chính mình (1 lần lúc đăng ký)" on profiles
  for insert with check (auth.uid() = id and role = 'player' and is_banned = false);

-- ---- Fix (3): characters ----
drop policy if exists "characters: tạo nhân vật của chính mình" on characters;
-- Không còn policy INSERT nào cho characters nữa — ép buộc đi qua RPC dưới đây.

create or replace function create_character(p_name text, p_class_id text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_count int; v_base_str int; v_base_dex int; v_base_int int; v_base_con int; v_char_id uuid;
  c_max_characters constant int := 3;
begin
  if length(trim(p_name)) < 2 then raise exception 'Tên nhân vật phải có ít nhất 2 ký tự'; end if;
  if p_class_id not in ('kiem','dao','cung','phap','quyen') then raise exception 'Môn phái không hợp lệ'; end if;

  select count(*) into v_count from characters where profile_id = auth.uid();
  if v_count >= c_max_characters then raise exception 'Mỗi tài khoản tối đa % nhân vật', c_max_characters; end if;

  -- Chỉ số gốc theo môn phái — PHẢI khớp CLASSES trong src/game/data/classes.ts
  case p_class_id
    when 'kiem'  then v_base_str := 7; v_base_dex := 6; v_base_int := 4; v_base_con := 6;
    when 'dao'   then v_base_str := 9; v_base_dex := 5; v_base_int := 3; v_base_con := 5;
    when 'cung'  then v_base_str := 4; v_base_dex := 9; v_base_int := 4; v_base_con := 5;
    when 'phap'  then v_base_str := 3; v_base_dex := 4; v_base_int := 10; v_base_con := 4;
    when 'quyen' then v_base_str := 6; v_base_dex := 7; v_base_int := 4; v_base_con := 7;
  end case;

  insert into characters (profile_id, name, class, str, dex, int_, con, map_id, pos_x, pos_y)
  values (auth.uid(), trim(p_name), p_class_id, v_base_str, v_base_dex, v_base_int, v_base_con, 'village', 640, 448)
  returning id into v_char_id;

  return json_build_object('success', true, 'character_id', v_char_id);
exception when unique_violation then
  raise exception 'Tên nhân vật đã có người dùng';
end; $$;
revoke all on function create_character from public;
grant execute on function create_character to authenticated;
