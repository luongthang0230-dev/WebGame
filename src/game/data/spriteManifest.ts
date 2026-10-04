// File này được sinh tự động từ JSON gốc trong gói asset đã upload — không sửa tay.
// Mô tả toạ độ khung hình (frame) trong từng sprite sheet để WorldScene đăng ký texture.

export interface FrameRect { x: number; y: number; w: number; h: number; }

export const CHARACTER_GRID = {
  kiem_khach: { cellW: 120, cellH: 120, columns: 4, rows: {
    idle: { row: 0, frames: 4, fps: 8 },
    walk: { row: 1, frames: 4, fps: 8 },
    attack: { row: 2, frames: 4, fps: 8 },
    skill: { row: 3, frames: 4, fps: 8 },
    hurt: { row: 4, frames: 4, fps: 8 },
    death: { row: 5, frames: 4, fps: 8 },
  } },
  dao_khach: { cellW: 120, cellH: 120, columns: 4, rows: {
    idle: { row: 0, frames: 4, fps: 8 },
    walk: { row: 1, frames: 4, fps: 8 },
    attack: { row: 2, frames: 4, fps: 8 },
    skill: { row: 3, frames: 4, fps: 8 },
    hurt: { row: 4, frames: 4, fps: 8 },
    death: { row: 5, frames: 4, fps: 8 },
  } },
  cung_thu: { cellW: 120, cellH: 120, columns: 4, rows: {
    idle: { row: 0, frames: 4, fps: 8 },
    walk: { row: 1, frames: 4, fps: 8 },
    attack: { row: 2, frames: 4, fps: 8 },
    skill: { row: 3, frames: 4, fps: 8 },
    hurt: { row: 4, frames: 4, fps: 8 },
    death: { row: 5, frames: 4, fps: 8 },
  } },
  phap_su: { cellW: 120, cellH: 120, columns: 4, rows: {
    idle: { row: 0, frames: 4, fps: 8 },
    walk: { row: 1, frames: 4, fps: 8 },
    attack: { row: 2, frames: 4, fps: 8 },
    skill: { row: 3, frames: 4, fps: 8 },
    hurt: { row: 4, frames: 4, fps: 8 },
    death: { row: 5, frames: 4, fps: 8 },
  } },
  vo_tang: { cellW: 120, cellH: 120, columns: 4, rows: {
    idle: { row: 0, frames: 4, fps: 8 },
    walk: { row: 1, frames: 4, fps: 8 },
    attack: { row: 2, frames: 4, fps: 8 },
    skill: { row: 3, frames: 4, fps: 8 },
    hurt: { row: 4, frames: 4, fps: 8 },
    death: { row: 5, frames: 4, fps: 8 },
  } },
} as const;

export const MONSTER_FRAMES: Record<string, FrameRect> = {
  'coc_doc': { x: 0, y: 0, w: 196, h: 152 },
  'cu_nhan': { x: 200, y: 0, w: 184, h: 196 },
  'hac_lang': { x: 400, y: 0, w: 184, h: 168 },
  'linh_hon': { x: 600, y: 0, w: 164, h: 184 },
  'ma_dau': { x: 800, y: 0, w: 196, h: 184 },
  'rong_con': { x: 1000, y: 0, w: 200, h: 172 },
  'soi_hoang': { x: 1200, y: 0, w: 192, h: 128 },
  'ta_linh': { x: 1400, y: 0, w: 176, h: 188 },
  'tho_quy': { x: 0, y: 200, w: 176, h: 188 },
  'yeu_ho': { x: 200, y: 200, w: 164, h: 164 },
};

export const BOSS_FRAMES: Record<string, FrameRect> = {
  'boss_ma_nu': { x: 0, y: 0, w: 208, h: 268 },
  'boss_quy_vuong': { x: 272, y: 0, w: 244, h: 268 },
  'boss_rong': { x: 544, y: 0, w: 256, h: 272 },
  'boss_thu_linh_soi': { x: 816, y: 0, w: 272, h: 268 },
};

export const NPC_FRAMES: Record<string, FrameRect> = {
  'npc_bang_hoi': { x: 0, y: 0, w: 164, h: 212 },
  'npc_duoc_su': { x: 168, y: 0, w: 120, h: 208 },
  'npc_kho_do': { x: 336, y: 0, w: 132, h: 204 },
  'npc_npc_ky_nang': { x: 504, y: 0, w: 120, h: 204 },
  'npc_npc_nhiem_vu': { x: 672, y: 0, w: 136, h: 204 },
  'npc_su_gia': { x: 840, y: 0, w: 112, h: 204 },
  'npc_su_kien': { x: 1008, y: 0, w: 120, h: 204 },
  'npc_tho_ren': { x: 1176, y: 0, w: 120, h: 200 },
  'npc_thuong_nhan': { x: 0, y: 216, w: 148, h: 212 },
  'npc_truong_lang': { x: 168, y: 216, w: 120, h: 204 },
};

export const BUILDING_FRAMES: Record<string, FrameRect> = {
  'cau': { x: 0, y: 0, w: 252, h: 172 },
  'chua': { x: 264, y: 0, w: 240, h: 248 },
  'cong': { x: 528, y: 0, w: 216, h: 176 },
  'cung_dien': { x: 792, y: 0, w: 244, h: 240 },
  'den': { x: 1056, y: 0, w: 104, h: 160 },
  'nha_dan': { x: 0, y: 248, w: 260, h: 244 },
  'quan_tro': { x: 264, y: 248, w: 248, h: 240 },
  'rao': { x: 528, y: 248, w: 164, h: 164 },
  'tiem': { x: 792, y: 248, w: 196, h: 232 },
  'tuong': { x: 1056, y: 248, w: 256, h: 156 },
};

export const DECOR_FRAMES: Record<string, FrameRect> = {
  'deco_bui_01': { x: 0, y: 0, w: 56, h: 52 },
  'deco_bui_02': { x: 208, y: 0, w: 48, h: 80 },
  'deco_bui_03': { x: 416, y: 0, w: 60, h: 56 },
  'deco_bui_04': { x: 624, y: 0, w: 76, h: 80 },
  'deco_bui_05': { x: 832, y: 0, w: 76, h: 68 },
  'deco_bui_06': { x: 1040, y: 0, w: 72, h: 56 },
  'deco_bui_07': { x: 1248, y: 0, w: 68, h: 80 },
  'deco_cau_go': { x: 1456, y: 0, w: 204, h: 128 },
  'deco_cay_01': { x: 0, y: 176, w: 112, h: 132 },
  'deco_cay_02': { x: 208, y: 176, w: 84, h: 116 },
  'deco_cay_03': { x: 416, y: 176, w: 84, h: 112 },
  'deco_cay_04': { x: 624, y: 176, w: 104, h: 132 },
  'deco_cay_co_dai_01': { x: 832, y: 176, w: 120, h: 124 },
  'deco_co_01': { x: 1040, y: 176, w: 52, h: 72 },
  'deco_cong_go': { x: 1248, y: 176, w: 96, h: 104 },
  'deco_da_01': { x: 1456, y: 176, w: 100, h: 88 },
  'deco_da_02': { x: 0, y: 352, w: 116, h: 104 },
  'deco_da_03': { x: 208, y: 352, w: 120, h: 104 },
  'deco_da_nho_01': { x: 416, y: 352, w: 92, h: 68 },
  'deco_da_nho_02': { x: 624, y: 352, w: 80, h: 72 },
  'deco_da_nho_03': { x: 832, y: 352, w: 76, h: 60 },
  'deco_hoa_01': { x: 1040, y: 352, w: 64, h: 64 },
  'deco_hoa_02': { x: 1248, y: 352, w: 68, h: 64 },
  'deco_hoa_03': { x: 1456, y: 352, w: 84, h: 60 },
  'deco_hoa_04': { x: 0, y: 528, w: 64, h: 68 },
  'deco_hoa_05': { x: 208, y: 528, w: 60, h: 68 },
  'deco_rao_go_01': { x: 416, y: 528, w: 116, h: 76 },
  'deco_thap_den': { x: 624, y: 528, w: 100, h: 172 },
  'deco_tinh_the_01': { x: 832, y: 528, w: 64, h: 88 },
};
