# Kiếm Hiệp Online — Phase 1

Khung dự án Next.js + TypeScript + Supabase, và hệ thống Admin (panel web + lệnh trong game).
Game engine (Phaser, map, chiến đấu...) sẽ được thêm ở các phase sau, kế thừa trên nền này.

## 1. Tạo Supabase project
1. Vào https://supabase.com → New Project.
2. Vào SQL Editor → dán toàn bộ nội dung `supabase/schema.sql` → Run.
3. Vào Authentication → Providers → bật Email (hoặc provider bạn muốn).
4. Vào Project Settings → API → copy 3 giá trị: Project URL, anon public key, service_role key.

## 2. Cấu hình local
```bash
cp .env.example .env.local
# dán URL + anon key + service_role key vào .env.local
npm install
npm run dev
```
Mở http://localhost:3000

## 3. Tạo tài khoản admin đầu tiên
Chưa có UI đăng ký ở Phase 1. Cách nhanh nhất:
1. Vào Supabase → Authentication → Users → Add user (nhập email/password) → copy user id.
2. Vào SQL Editor, chạy:
```sql
insert into profiles (id, username, role)
values ('<user-id-vua-copy>', 'admin1', 'owner');
```
3. Đăng nhập bằng tài khoản đó ở app (trang /login sẽ có ở phase Auth) → vào `/admin`.

## 4. Deploy lên Vercel
1. Push repo này lên GitHub.
2. Vào https://vercel.com → New Project → chọn repo.
3. Thêm 3 Environment Variables giống `.env.local`.
4. Deploy. `npm run build` phải pass (đã kiểm tra ở Phase 1).

## Hệ thống Admin đã có trong Phase 1
- `supabase/schema.sql`: bảng `profiles.role` (player/moderator/admin/owner), `admin_logs` (ghi mọi hành động), `bans`, `announcements`, `gm_commands` (lệnh realtime).
- `src/lib/supabase/admin.ts`: `requireAdmin()` — chốt kiểm tra quyền duy nhất, mọi route admin đều phải gọi qua đây.
- API: `PATCH /api/admin/character` (sửa mọi chỉ số nhân vật), `POST /api/admin/ban`, `POST /api/admin/broadcast`, `POST /api/admin/gm-command` (teleport/kick/freeze/effect realtime tới người chơi cụ thể).
- `src/app/admin`: giao diện panel dùng các API trên.
- `src/lib/game/adminCommands.ts`: lệnh gõ trong chat (`/give`, `/tp`, `/ban`...) — parser thuần, quyền vẫn được xác thực lại ở server.

## Phase 2 — Game Engine (đã xong)
- `src/game/scenes/WorldScene.ts`: engine map tổng quát, đọc dữ liệu từ `src/game/data/maps.ts`.
- Di chuyển WASD/phím mũi tên + joystick cảm ứng, va chạm vật cản, camera bám nhân vật, minimap (camera phụ thật của Phaser).
- 3 map đã liên kết qua cổng dịch chuyển: Tân Thủ Thôn ↔ Đồng Ngoại ↔ Rừng Trúc.

## Phase 3 — Nhân vật, NPC, Quái, AI (đã xong)
- `/login`: đăng ký/đăng nhập bằng Supabase Auth, tự tạo `profiles`.
- `/character/create`: chọn tên + 1 trong 5 môn phái (`src/game/data/classes.ts`), tối đa 3 nhân vật/tài khoản, tên không trùng.
- `/play`: bắt buộc đăng nhập, nạp nhân vật thật từ Supabase, HUD hiển thị HP/MP/level/gold thật.
- `src/game/entities/MonsterEntity.ts`: AI quái 4 trạng thái (idle/wander/chase/return), rượt người chơi trong tầm ngắm, quay về tổ nếu đi quá xa (leash). Dữ liệu quái ở `src/game/data/monsters.ts`, gồm cả quái thường và boss (Sói Vương).
- Đồng bộ vị trí/HP/MP lên Supabase mỗi 4 giây qua RPC `update_character_runtime` (SQL trong `supabase/schema.sql` / `supabase/migrations/002_phase3_characters.sql`) — RPC chỉ cho sửa đúng các cột không nhạy cảm kinh tế; gold/exp/level vẫn chỉ admin hoặc server (Phase 4+) mới đổi được.
- Nếu bạn đã chạy `schema.sql` ở Phase 1, chạy thêm `supabase/migrations/002_phase3_characters.sql` trong SQL Editor để cập nhật (không cần chạy lại từ đầu).

## Phase 4 — Combat + Skill + EXP + Level (đã xong)
- `src/game/data/skills.ts`: mỗi class 4 skill (đánh thường/đơn/quần công/hỗ trợ), công thức ATK/HP/MP theo cấp + chỉ số.
- Chiến đấu chạy mượt ở client (Phaser): cast skill, sát thương bay số, quái chết/hồi sinh theo `respawnMs`, quái phản công khi cận chiến, người chơi bại trận → hồi sinh tại thôn với 50% HP.
- **Chống gian lận exp/gold**: hạ quái ở client chỉ là hoạt ảnh — phần thưởng thật (exp/gold/lên cấp) do hàm SQL `grant_kill_reward` (`supabase/migrations/003_phase4_combat.sql`) tính và ghi, có giới hạn tốc độ gọi theo từng loại quái (chống spam RPC để cày exp giả). Client không thể tự cộng exp/gold/level.
- HUD `/play` có thanh EXP thật, skill bar 4 nút với overlay hồi chiêu/khoá theo cấp, thông báo lên cấp, màn hình "bại trận" tạm thời.
- Nếu đã chạy Phase 1–3, chạy thêm `supabase/migrations/003_phase4_combat.sql` trong SQL Editor.

## Phase 5 — Item, Rơi đồ, Nhặt đồ, Điểm kỹ năng, Auto Train, Giao dịch (đã xong)
- **Đồ vật & trang bị**: `item_templates`/`monster_drops` trong Supabase, 8 slot trang bị (vũ khí/mũ/áo/quần/giày/găng/nhẫn/dây chuyền), phẩm chất có màu viền (Thường/Tốt/Hiếm/Sử Thi/Huyền Thoại). Panel "🎒 Túi" trong `/play` để xem, trang bị, tháo, huỷ đồ.
- **Rơi đồ & nhặt đồ**: khi hạ quái, server roll vật phẩm (mirror đúng tỉ lệ trong `monster_drops`), ghi vào `pending_loot` kèm token dùng 1 lần — KHÔNG cộng thẳng vào túi. Vật phẩm hiện trên map tại chỗ quái chết; người chơi đi ngang qua sẽ tự động gọi `claim_loot(token)` để nhận thật — chống việc client tự bịa vật phẩm.
- **Điểm kỹ năng**: mỗi lần lên cấp cộng điểm kỹ năng (`characters.skill_points`, tính trong `grant_kill_reward`). Panel "📖 Kỹ năng" cho cộng điểm vào từng chiêu (`allocate_skill_point`, tối đa rank 10), tăng sát thương/hồi máu theo rank ngay lập tức trong trận (không cần tải lại trang).
- **Auto Train**: nút "▶ Auto Train" trong `/play` — nhân vật tự tìm quái gần nhất, tự di chuyển vào tầm, tự ưu tiên hồi máu khi yếu > AoE khi nhiều quái > đơn mục tiêu > đánh thường, tự nhặt đồ rơi trên đường.
- **Giao dịch tự do giữa 2 tài khoản**: trang `/trade` — tạo giao dịch theo tên nhân vật, thêm vật phẩm/vàng vào bàn, mỗi lần đổi ý sẽ tự huỷ xác nhận của CẢ HAI bên, chỉ hoán đổi thật khi cả hai cùng bấm "Xác nhận" (kiểm tra lại điều kiện ngay tại thời điểm chốt để chống lừa đảo 2 giao dịch cùng lúc).
- Nếu đã chạy Phase 1–4, chạy thêm `supabase/migrations/004_phase5_items_trade.sql`.

## Giới hạn đã biết (sẽ cải thiện ở phase sau)
- Quái hiện mô phỏng cục bộ theo từng client (không đồng bộ HP quái giữa nhiều người chơi cùng lúc trên 1 map) — cần một tầng "world state" dùng Supabase Realtime nếu muốn nhiều người cùng đánh 1 con quái thấy đúng máu của nhau.
- Giao dịch dùng polling 3 giây thay vì Supabase Realtime đẩy trực tiếp — đủ dùng nhưng có độ trễ nhỏ.
- Vật phẩm dạng stack (thuốc) khi giao dịch chưa hỗ trợ tách số lượng lẻ.

## Phase 6 (lát cắt đầu) — Giao diện đúng bố cục tham khảo + Quest thật đầu tiên
- **Giao diện `/play` dựng lại toàn bộ** theo đúng bố cục ảnh tham khảo: khung nhân vật (chân dung tròn + HP/MP) góc trên trái, khung nhiệm vụ ngay dưới, minimap có viền khung góc trên phải kèm nhãn tên map, cột nút TÚI / NHÂN VẬT / KỸ NĂNG / AUTO / GIAO DỊCH bên phải, thanh skill với nút ĐÁNH to màu đỏ ở ngoài cùng góc dưới phải. Toàn bộ dùng gradient + viền vàng/đồng tự vẽ bằng CSS, không dùng ảnh/asset của bên thứ ba.
- **Quest thật đầu tiên** (không phải placeholder): `quests`/`character_quests` trong Supabase, chuỗi 3 bước "Gặp Trưởng Thôn → Diệt 5 Sói Hoang → Báo tin" — đúng câu chuyện đã thiết kế map từ Phase 2. NPC giờ có nút "💬 Nói chuyện" thật, gọi RPC `talk_to_npc`; tiến độ diệt quái tự cộng trong `grant_kill_reward`. Khung nhiệm vụ trong HUD đọc trạng thái thật qua `get_quest_status`.
- Đây là **lát cắt tối thiểu** của Quest Engine đầy đủ trong đặc tả gốc (chưa có side/daily/weekly/bounty/hidden/dungeon quest, chưa có nhiều quest chain song song) — sẽ mở rộng ở lượt hoàn thiện Phase 6 tiếp theo.
- Nếu đã chạy Phase 1–5, chạy thêm `supabase/migrations/005_phase6_quests.sql`.

## Phase 7 (lát cắt 1) — Mở rộng bản đồ: Khu vực Trung Cấp
- Thêm 3 map mới, nối liền vào thế giới: **Sơn Cốc** (Lv12-18, quái Nham Thạch Quái/Ảnh Lang, boss Sơn Vương) → **Thâm Lâm** (Lv17-22, quái U Ảnh Lang/Huyết Sí Bức, boss Lâm Vong Hồn) → **Trấn Biên** (Lv15+, thị trấn an toàn có thợ rèn/thương nhân/lính gác, chưa có quái — điểm dừng chân trước khi mở Cao Cấp).
- Thêm quái, trang bị (bao gồm item **Huyền Thoại** đầu tiên: Vong Y/Hồn Ngọc Bội từ boss Lâm Vong Hồn), drop table tương ứng.
- Thế giới hiện: **6/20 map** (Tân Thủ Thôn, Đồng Ngoại, Rừng Trúc, Sơn Cốc, Thâm Lâm, Trấn Biên). Còn lại: Hoang Mạc, Cổ Đạo (nốt Trung Cấp) + toàn bộ Cao Cấp/Boss/Endgame.
- Nếu đã chạy Phase 1–6, chạy thêm `supabase/migrations/006_phase7_maps_trungcap.sql`.

## Phase 7 (hoàn tất) — Đủ 20/20 map
Thêm 14 map còn lại, thế giới giờ liên kết liền mạch từ đầu đến cuối:

**Trung Cấp (nốt):** Hoang Mạc (Lv20-25) → Cổ Đạo (Lv23-28)
**Cao Cấp:** Thiên Sơn (28-35) → Huyết Ma Động (33-40) → U Minh Cốc (38-45) → Ma Vực (43-50) → Cấm Địa (48-55)
**Boss/Endgame:** Long Mạch (55-60) → Thiên Môn (58-65) → Vạn Ma Điện (63-70) → Chiến Trường Cổ (68-75) → Bí Cảnh (73-80) → **Tuyệt Mệnh Cốc** (80+, World Boss "Tuyệt Thế Chân Long")
**Event:** Huyễn Cảnh (nhánh riêng từ Tân Thủ Thôn, mở sớm Lv1+, nội dung sẽ đổi theo sự kiện)

Mỗi map: 2 loại quái thường + 1 elite + 1 boss (trừ Tuyệt Mệnh Cốc chỉ có world boss, và Huyễn Cảnh nhẹ nhàng hơn), trang bị + drop table riêng, phẩm chất tăng dần Hiếm → Sử Thi → Huyền Thoại theo độ khó. Đã kiểm tra bằng script: toàn bộ 48 loại quái khớp dữ liệu, toàn bộ cổng dịch chuyển hai chiều, không map nào bị cô lập.

**Giới hạn còn lại:** Tuyệt Mệnh Cốc là world boss về mặt lore nhưng cơ chế đấu vẫn mô phỏng cục bộ theo client (giống giới hạn đã ghi ở Phase 5) — nhiều người chơi cùng đánh 1 world boss thấy đúng máu của nhau cần tầng world-state riêng (Supabase Realtime), chưa làm.

Nếu đã chạy Phase 1–6, chạy thêm `supabase/migrations/006_phase7_maps_trungcap.sql` rồi `supabase/migrations/007_phase7_remaining_maps.sql` (đúng thứ tự).

## Phase 8 — Nối dài Quest Chain + Daily Quest
- **Main quest nối dài từ 3 → 8 bước**, xuyên qua các map mới: báo tin Trưởng Thôn → diệt Nham Thạch Quái (Sơn Cốc) → gặp Thợ Rèn Trấn Biên → săn Ảnh Lang tinh anh → trừ U Ảnh Lang (Thâm Lâm) → báo công Thương Nhân Biên Quan. Đúng tinh thần "đi theo câu chuyện, không farm vô nghĩa" đã đặt ra từ đầu.
- **Daily Quest thật**: diệt 15 quái bất kỳ trong ngày (reset theo ngày UTC), thưởng theo cấp độ hiện tại, tính trong cùng `grant_kill_reward` nên không tốn thêm round-trip. Khung "🌞 NHIỆM VỤ NGÀY" hiển thị tiến độ real-time trong HUD.
- Đây vẫn là **lát cắt** của hệ thống quest đầy đủ — side/weekly/bounty/hidden/dungeon quest và nhiều nhánh song song (không chỉ 1 chuỗi main tuyến tính) vẫn chưa làm.
- Nếu đã chạy Phase 1–7, chạy thêm `supabase/migrations/008_phase8_questchain_daily.sql`.

## Phase 9 — Dungeon (Phó bản)
- 2 phó bản mới: **Hang Quỷ** (Lv15+, boss Ma Quật Chi Chủ) và **Cổ Mộ** (Lv35+, boss Cổ Mộ Thủ Hộ Vương) — bản đồ nhỏ gọn, vào thẳng qua panel "PHÓ BẢN" (dịch chuyển tức thời, không cần đi bộ), không nối portal với thế giới mở.
- **Giới hạn 1 lượt nhận thưởng/ngày** (reset theo UTC) qua bảng `dungeon_clears` + RPC `complete_dungeon` — vào lại vẫn đánh được (luyện tập) nhưng không nhận thêm vàng/exp/vật phẩm đảm bảo sau khi đã clear trong ngày.
- Cơ chế thiết kế gọn: `complete_dungeon` được gọi **vô điều kiện sau mọi lần hạ quái**, server tự tra xem quái đó có phải boss phó bản không (`is_dungeon: false` nếu không) — client không cần biết trước map nào là dungeon.
- Vật phẩm thưởng phó bản là **đảm bảo rớt** (không phải theo tỉ lệ %) — dùng chung cơ chế rơi đồ/nhặt đồ (pending_loot + claim_loot) đã có từ Phase 5.
- Nếu đã chạy Phase 1–8, chạy thêm `supabase/migrations/009_phase9_dungeons.sql`.

## Nâng cấp hình ảnh — lắp sprite thật (thay emoji)
Bạn cung cấp bộ sprite PNG nền trong suốt + JSON toạ độ khung hình (tự tạo, không sao chép từ game khác). Đã lắp thật vào engine:
- **Nhân vật**: 5 môn phái (Kiếm/Đao/Cung/Pháp/Võ) có sprite sheet 120×120, 6 trạng thái animation thật (idle/walk/attack/skill/hurt/death) — nhân vật giờ đi lại, vung kiếm, trúng đòn, gục ngã bằng hoạt ảnh thật, không còn emoji đứng im.
- **Quái/Boss**: 10 quái thường + 4 boss có ảnh thật, dùng lại (mapping) cho 48 loại quái trong game — quái chưa có ảnh riêng tự rơi về emoji cũ, không lỗi.
- **NPC**: 4 loại NPC (Trưởng Thôn/Thợ Rèn/Thương Nhân/Lính Gác) có portrait thật.
- **Nền map**: 9 texture biome thật (Làng/Rừng/Núi/Sa Mạc/Hang Động/Đầm Lầy/Tuyết/Pháo Đài/Thành) áp cho cả 22 map theo khu vực.
- **Nhà cửa & cây cối**: dùng sprite thật thay emoji nếu có.
- `src/game/data/spriteManifest.ts`: sinh tự động từ JSON gốc (toạ độ khung hình).
- `src/game/data/spriteMap.ts`: bảng ánh xạ ID nội bộ ↔ tên khung hình thật — mọi ID không có trong bảng tự rơi về emoji, không crash.
- File asset đặt ở `public/game-assets/` (~4.4MB), không chép logic/engine từ bất kỳ game nào khác.

**Chưa làm** (vì bộ asset chưa có, không phải do engine): icon skill cast riêng biệt, hiệu ứng hạt (particle) khi dùng chiêu, icon vật phẩm theo asset mới (vẫn dùng emoji per-item vì chính xác hơn icon chung), sprite thú cưỡi/đồng hành (chưa tới Phase pet/mount).

## Phase 10 — PvP real-time (Đấu Trường)
- **`/pvp`**: thách đấu theo tên nhân vật, nhận/từ chối lời thách, bảng xếp hạng (rating/thắng/thua).
- **`/duel/[duelId]`**: trận đấu THẬT, real-time — vị trí và đòn đánh đồng bộ qua **Supabase Realtime Broadcast** (kênh riêng cho từng trận), không phải mô phỏng theo lượt. Cả 2 trình duyệt cùng chạy engine Phaser, điều khiển nhân vật mình, thấy đối thủ di chuyển/đánh gần như tức thời.
- Vào đấu trường luôn đầy máu (công bằng, không phụ thuộc trạng thái đang cày quái ngoài world).
## Phase 10b — PvP server-authoritative (sửa lỗ hổng gian lận)
Vì bạn xác nhận sẽ deploy thật cho nhiều người cùng chơi (không chỉ tự chơi), lỗ hổng "client tự tính sát thương" ở Phase 10 ban đầu không chấp nhận được — đã sửa lại đúng kiến trúc giống PvE:
- **`skills` table** trong Supabase mirror đúng dữ liệu `skills.ts` — server có đủ thông tin để tự tính.
- Client **không còn tự tính sát thương**. Khi chiêu trúng tầm, client chỉ gọi RPC `report_duel_hit(duel_id, attacker_id, skill_id)` — server tự tra cấp độ/trang bị/rank skill thật trong DB, tự tính sát thương, tự trừ HP (lưu trong bảng `duel_live_state`, tách khỏi HP ngoài world), tự enforce hồi chiêu (`duel_cast_cooldowns`, cùng cơ chế chống spam đã dùng cho PvE).
- **Thắng/thua do server tự quyết định** tại đúng thời điểm HP đối thủ chạm 0 (trong RPC, atomic) — không còn chuyện client tự báo "tôi thắng". Cập nhật bảng xếp hạng (`pvp_ranks`) xảy ra ngay trong cùng transaction đó.
- Vị trí nhân vật vẫn qua Realtime Broadcast (chỉ ảnh hưởng hình ảnh mượt mà, không ảnh hưởng kết quả nên không cần qua server).
- **Vẫn còn 1 giới hạn nhỏ, chấp nhận được**: việc "có đang trong tầm đánh hay không" vẫn do client tự xác định (giống việc client tự aim) — chỉ ảnh hưởng độ chính xác việc có trúng đòn hay không, KHÔNG ảnh hưởng số sát thương/HP/thắng-thua nếu đã trúng. Đây là đánh đổi hợp lý thường thấy ngay cả ở game thương mại.
- Nếu đã chạy Phase 1–10, chạy thêm `supabase/migrations/011_phase10b_pvp_authoritative.sql`.

## Phase 11 — Bang Hội
- **`/guild`**: tìm bang theo quỹ, lập bang (phí 1000 vàng), gia nhập tự do (chưa có duyệt đơn — mở sớm cho đơn giản, có thể thêm sau).
- **3 cấp vai trò**: Bang Chủ / Phó Bang Chủ / Thành viên — thăng/giáng chức, đuổi thành viên (Phó Bang Chủ đuổi được thành viên thường, chỉ Bang Chủ đuổi được Phó Bang Chủ, không ai đuổi được Bang Chủ).
- **Rời bang thông minh**: Bang Chủ rời đi tự động chuyển chức cho người lâu năm nhất (ưu tiên Phó Bang Chủ); bang trống tự giải tán.
- **Kho bang**: nộp/rút vàng, rút quỹ cần quyền Phó Bang Chủ trở lên — mọi thao tác qua RPC kiểm tra quyền, không phải client tự trừ/cộng.
- **Chat bang real-time thật**: dùng **Supabase Realtime Postgres Changes** (khác PvP dùng Broadcast — chat cần lưu lại, nên nghe trực tiếp sự kiện INSERT trên bảng, không phải kênh tạm). Phải chạy `alter publication supabase_realtime add table guild_chat_messages;` (đã có sẵn trong migration) thì tin nhắn mới tới real-time được — nếu quên dòng này, chat vẫn gửi được nhưng người khác phải tải lại trang mới thấy.
- **Lát cắt MVP** — chưa có: cấp bang/exp bang, nhiệm vụ bang, boss bang (đánh chung), mời/duyệt đơn gia nhập. Có thể bổ sung ở lượt sau theo đúng mẫu đã dùng cho dungeon (shared HP pool + RPC chống gian lận).
- Nếu đã chạy Phase 1–10, chạy thêm `supabase/migrations/012_phase11_guild.sql`.

## 🔒 Rà soát bảo mật — vá 3 lỗ hổng nghiêm trọng (chạy ngay trước khi cho người khác chơi)
Rà soát lại toàn bộ RLS trước khi bạn deploy cho nhiều người, phát hiện và vá:
1. **`profiles` có thể tự phong admin**: policy UPDATE cũ không giới hạn cột, bất kỳ ai cũng tự chạy `update({role:'owner'})` được. Đã gỡ bỏ hoàn toàn policy đó.
2. **Đăng ký tài khoản chưa từng chạy được thật**: `profiles` thiếu hẳn policy INSERT, bước tạo hồ sơ lúc `/login` bị RLS chặn âm thầm (TypeScript build không phát hiện được vì chỉ kiểm tra kiểu dữ liệu, không chạy DB thật). Đã thêm policy INSERT đúng, kèm khoá cứng `role='player'` để không ai tự phong admin ngay lúc đăng ký.
3. **Tạo nhân vật có thể tự đặt vàng/cấp độ tuỳ ý**: policy INSERT cũ của `characters` không giới hạn giá trị cột, bỏ qua được route `/api/character`. Đã chuyển tạo nhân vật sang RPC `create_character` (server tự đặt chỉ số gốc), gỡ bỏ hẳn quyền INSERT trực tiếp.
4. **Kỹ năng hồi máu trong PvP chưa qua server** (sót khi làm Phase 10b): đã thêm RPC `report_duel_heal` cùng mẫu với `report_duel_hit`.

**Cũng đã sửa 3 bug game-breaking** phát hiện cùng đợt rà soát (do Phaser dùng LẠI cùng 1 Scene instance mỗi lần `scene.restart()`, field class không tự reset):
- Chết 1 lần là đứng hình vĩnh viễn (`isPlayerDead` không bao giờ reset) — **đã sửa**.
- Quái/đồ rơi của map cũ rò rỉ tham chiếu đã destroy sang map mới — **đã sửa**.
- Camera minimap và resize-listener cộng dồn sau mỗi lần đổi map — **đã sửa**.

Nếu đã chạy Phase 1–10c, **bắt buộc chạy thêm** `supabase/migrations/013_security_fix_rls_holes.sql` rồi `014_phase10c_duel_heal.sql`.

## Các phase tiếp theo (chưa làm)
12. Side/weekly/bounty/hidden quest, nhiều nhánh song song.
13. Cấp bang/exp bang, nhiệm vụ bang, boss bang chung.
5. Quest engine.
6. Inventory + equipment + loot.
7. 15–20 map.
8. Dungeon + Boss + Event.
9. Pet + Mount + Guild + PvP.
10–14. UI hoàn chỉnh, responsive, bảo mật, build, deploy.
