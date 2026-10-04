// Ánh xạ từ ID nội bộ của game (monster/NPC/map) sang tên frame thật trong
// gói asset đã nhận. Asset pack có 10 quái thường + 4 boss + 10 NPC + 9 nền
// map — ít hơn số lượng nội dung game (48 quái, 20 map), nên nhiều ID dùng
// chung 1 texture (giống việc game thật dùng lại/tô màu lại model). Bất kỳ
// ID nào KHÔNG có trong map này sẽ tự rơi về emoji cũ (xem assets.ts).

export const MONSTER_SPRITE: Record<string, string> = {
  wolf: 'soi_hoang',
  bamboo_demon: 'tho_quy',
  wolf_king: 'boss_thu_linh_soi',
  rock_golem: 'cu_nhan',
  shadow_wolf: 'hac_lang',
  mountain_king: 'boss_quy_vuong',
  phantom_wolf: 'ta_linh',
  blood_bat: 'ma_dau',
  forest_wraith: 'boss_ma_nu',
  sand_scorpion: 'coc_doc',
  sand_reaver: 'cu_nhan',
  desert_tyrant: 'boss_quy_vuong',
  bandit_swordsman: 'cu_nhan',
  bandit_captain: 'cu_nhan',
  ancient_guardian: 'boss_quy_vuong',
  cloud_leopard: 'yeu_ho',
  storm_eagle: 'rong_con',
  thien_son_sage: 'boss_ma_nu',
  blood_imp: 'ma_dau',
  blood_priest: 'ta_linh',
  blood_demon_lord: 'boss_quy_vuong',
  ghost_soldier: 'linh_hon',
  soul_reaper: 'ta_linh',
  underworld_king: 'boss_ma_nu',
  abyss_fiend: 'ma_dau',
  chaos_hound: 'hac_lang',
  abyss_overlord: 'boss_quy_vuong',
  forbidden_guard: 'cu_nhan',
  seal_breaker: 'ta_linh',
  forbidden_emperor: 'boss_quy_vuong',
  dragon_whelp: 'rong_con',
  dragon_knight: 'cu_nhan',
  long_mach_dragon: 'boss_rong',
  heaven_sentinel: 'cu_nhan',
  thunder_general: 'cu_nhan',
  heaven_gate_lord: 'boss_quy_vuong',
  demon_soldier: 'ma_dau',
  demon_general: 'ta_linh',
  van_ma_emperor: 'boss_quy_vuong',
  fallen_warrior: 'linh_hon',
  war_spirit: 'linh_hon',
  ancient_warlord: 'boss_ma_nu',
  mystic_beast: 'yeu_ho',
  mystic_guardian: 'rong_con',
  bi_canh_immortal: 'boss_ma_nu',
  the_final_dragon: 'boss_rong',
  mischief_spirit: 'ta_linh',
  carnival_king: 'boss_quy_vuong',
  devil_cave_lord: 'boss_quy_vuong',
  tomb_guardian_king: 'boss_ma_nu'
};

/** true nếu key thuộc BOSS_FRAMES (ảnh lớn hơn, dùng atlas khác với quái thường). */
export const BOSS_SPRITE_KEYS = new Set([
  'boss_thu_linh_soi', 'boss_quy_vuong', 'boss_ma_nu', 'boss_rong'
]);

export const NPC_SPRITE: Record<string, string> = {
  elder: 'npc_truong_lang',
  blacksmith: 'npc_tho_ren',
  merchant: 'npc_thuong_nhan',
  guard: 'npc_su_gia'
};

/** Nền map theo region (ưu tiên) hoặc theo key cụ thể khi cần khác biệt trong cùng region. */
export const MAP_TILE_BY_KEY: Record<string, string> = {
  village: 'tile_lang',
  field: 'tile_lang',
  bamboo_forest: 'tile_rung',
  son_coc: 'tile_nui',
  tham_lam: 'tile_rung',
  tran_bien: 'tile_lang',
  hoang_mac: 'tile_sa_mac',
  co_dao: 'tile_phao_dai',
  thien_son: 'tile_nui',
  huyet_ma_dong: 'tile_hang_dong',
  u_minh_coc: 'tile_hang_dong',
  ma_vuc: 'tile_hang_dong',
  cam_dia: 'tile_phao_dai',
  long_mach: 'tile_nui',
  thien_mon: 'tile_thanh',
  van_ma_dien: 'tile_phao_dai',
  chien_truong_co: 'tile_sa_mac',
  bi_canh: 'tile_rung',
  tuyet_menh_coc: 'tile_tuyet',
  huyen_canh: 'tile_dam_lay',
  hang_quy: 'tile_hang_dong',
  co_mo: 'tile_phao_dai'
};

export const PROP_SPRITE: Record<string, string> = {
  tree: 'deco_cay_01',
  bamboo: 'deco_cay_co_dai_01',
  rock: 'deco_da_01',
  building: 'nha_dan' // nằm trong BUILDING_FRAMES, không phải DECOR_FRAMES — xử lý riêng
};
