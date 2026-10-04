// Dữ liệu hiển thị phía client, phải khớp id với supabase/migrations/004_*.sql
// (item_templates). Server luôn là nguồn sự thật cho stat thật; file này
// chỉ phục vụ hiển thị tức thời không cần chờ round-trip DB.
export type ItemSlot = 'weapon' | 'head' | 'body' | 'legs' | 'feet' | 'hands' | 'ring' | 'neck';
export type ItemQuality = 'thuong' | 'tot' | 'hiem' | 'suthi' | 'huyenthoai';

export interface ItemTemplate {
  id: string;
  name: string;
  slot: ItemSlot;
  quality: ItemQuality;
  icon: string;
  baseAtk: number;
  baseDef: number;
  levelReq: number;
}

export const QUALITY_COLOR: Record<ItemQuality, string> = {
  thuong: '#aaaaaa',
  tot: '#4caf50',
  hiem: '#3d8bfd',
  suthi: '#c05fff',
  huyenthoai: '#ffb020'
};

export const QUALITY_LABEL: Record<ItemQuality, string> = {
  thuong: 'Thường', tot: 'Tốt', hiem: 'Hiếm', suthi: 'Sử Thi', huyenthoai: 'Huyền Thoại'
};

export const SLOT_LABEL: Record<ItemSlot, string> = {
  weapon: 'Vũ khí', head: 'Mũ', body: 'Áo', legs: 'Quần', feet: 'Giày', hands: 'Găng', ring: 'Nhẫn', neck: 'Dây chuyền'
};

export const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
  wolf_fang_dagger: { id: 'wolf_fang_dagger', name: 'Nanh Sói', slot: 'weapon', quality: 'thuong', icon: '🗡️', baseAtk: 4, baseDef: 0, levelReq: 1 },
  wolf_leather_boots: { id: 'wolf_leather_boots', name: 'Giày Da Sói', slot: 'feet', quality: 'thuong', icon: '👢', baseAtk: 0, baseDef: 3, levelReq: 1 },
  wolf_leather_gloves: { id: 'wolf_leather_gloves', name: 'Găng Da Sói', slot: 'hands', quality: 'thuong', icon: '🧤', baseAtk: 1, baseDef: 1, levelReq: 1 },
  bamboo_robe: { id: 'bamboo_robe', name: 'Trúc Y', slot: 'body', quality: 'tot', icon: '🥋', baseAtk: 0, baseDef: 8, levelReq: 5 },
  jade_ring: { id: 'jade_ring', name: 'Nhẫn Ngọc Bích', slot: 'ring', quality: 'tot', icon: '💍', baseAtk: 3, baseDef: 2, levelReq: 5 },
  bamboo_hat: { id: 'bamboo_hat', name: 'Nón Lá Trúc', slot: 'head', quality: 'tot', icon: '🎋', baseAtk: 0, baseDef: 5, levelReq: 5 },
  spirit_necklace: { id: 'spirit_necklace', name: 'Dây Chuyền Linh Khí', slot: 'neck', quality: 'hiem', icon: '📿', baseAtk: 5, baseDef: 4, levelReq: 8 },
  wolfking_fang_sword: { id: 'wolfking_fang_sword', name: 'Kiếm Nanh Sói Vương', slot: 'weapon', quality: 'suthi', icon: '⚔️', baseAtk: 22, baseDef: 0, levelReq: 10 },
  wolfking_mane_cloak: { id: 'wolfking_mane_cloak', name: 'Áo Choàng Bờm Sói Vương', slot: 'body', quality: 'suthi', icon: '🧥', baseAtk: 6, baseDef: 16, levelReq: 10 },

  // Sơn Cốc
  rock_plate_armor: { id: 'rock_plate_armor', name: 'Giáp Nham Thạch', slot: 'body', quality: 'tot', icon: '🛡️', baseAtk: 0, baseDef: 14, levelReq: 12 },
  rock_fist_gauntlet: { id: 'rock_fist_gauntlet', name: 'Găng Thạch Quyền', slot: 'hands', quality: 'tot', icon: '🥊', baseAtk: 6, baseDef: 3, levelReq: 12 },
  shadow_wolf_claw: { id: 'shadow_wolf_claw', name: 'Móng Ảnh Lang', slot: 'weapon', quality: 'hiem', icon: '🗡️', baseAtk: 16, baseDef: 0, levelReq: 15 },
  sonvuong_greatmace: { id: 'sonvuong_greatmace', name: 'Trọng Chuỳ Sơn Vương', slot: 'weapon', quality: 'suthi', icon: '🔨', baseAtk: 32, baseDef: 4, levelReq: 18 },
  sonvuong_helm: { id: 'sonvuong_helm', name: 'Đầu Khôi Sơn Vương', slot: 'head', quality: 'suthi', icon: '⛑️', baseAtk: 0, baseDef: 20, levelReq: 18 },

  // Thâm Lâm
  phantom_leather_boots: { id: 'phantom_leather_boots', name: 'Ủng Ảnh Bộ', slot: 'feet', quality: 'tot', icon: '👢', baseAtk: 4, baseDef: 6, levelReq: 17 },
  blood_bat_wing_cloak: { id: 'blood_bat_wing_cloak', name: 'Áo Cánh Huyết Sí', slot: 'body', quality: 'hiem', icon: '🧥', baseAtk: 10, baseDef: 12, levelReq: 19 },
  lamvonghon_robe: { id: 'lamvonghon_robe', name: 'Vong Y Lâm Vong Hồn', slot: 'body', quality: 'huyenthoai', icon: '👘', baseAtk: 20, baseDef: 30, levelReq: 22 },
  lamvonghon_pendant: { id: 'lamvonghon_pendant', name: 'Hồn Ngọc Bội', slot: 'neck', quality: 'huyenthoai', icon: '📿', baseAtk: 18, baseDef: 10, levelReq: 22 },

  // Hoang Mạc (Lv23)
  sanreaver_boots: { id: 'sanreaver_boots', name: 'Ủng Sa Tặc', slot: 'feet', quality: 'hiem', icon: '👢', baseAtk: 14, baseDef: 14, levelReq: 23 },
  desert_fang_blade: { id: 'desert_fang_blade', name: 'Nanh Kiếm Sa Mạc', slot: 'weapon', quality: 'suthi', icon: '🗡️', baseAtk: 30, baseDef: 0, levelReq: 23 },
  desert_scale_helm: { id: 'desert_scale_helm', name: 'Long Giáp Đầu Sa Mạc', slot: 'head', quality: 'suthi', icon: '⛑️', baseAtk: 7, baseDef: 23, levelReq: 23 },

  // Cổ Đạo (Lv26)
  bandit_gauntlet: { id: 'bandit_gauntlet', name: 'Găng Đạo Tặc', slot: 'hands', quality: 'hiem', icon: '🧤', baseAtk: 16, baseDef: 16, levelReq: 26 },
  ancient_stone_blade: { id: 'ancient_stone_blade', name: 'Cổ Thạch Kiếm', slot: 'weapon', quality: 'suthi', icon: '⚔️', baseAtk: 34, baseDef: 0, levelReq: 26 },
  ancient_stone_armor: { id: 'ancient_stone_armor', name: 'Cổ Thạch Giáp', slot: 'body', quality: 'suthi', icon: '🛡️', baseAtk: 8, baseDef: 26, levelReq: 26 },

  // Thiên Sơn (Lv31)
  storm_ring: { id: 'storm_ring', name: 'Nhẫn Bạo Phong', slot: 'ring', quality: 'suthi', icon: '💍', baseAtk: 19, baseDef: 19, levelReq: 31 },
  thienson_staff: { id: 'thienson_staff', name: 'Thiên Sơn Trượng', slot: 'weapon', quality: 'huyenthoai', icon: '🪄', baseAtk: 40, baseDef: 0, levelReq: 31 },
  thienson_legguard: { id: 'thienson_legguard', name: 'Vân Giáp Quần', slot: 'legs', quality: 'huyenthoai', icon: '👖', baseAtk: 9, baseDef: 31, levelReq: 31 },

  // Huyết Ma Động (Lv36)
  bloodpriest_necklace: { id: 'bloodpriest_necklace', name: 'Dây Chuyền Huyết Giáo', slot: 'neck', quality: 'suthi', icon: '📿', baseAtk: 22, baseDef: 22, levelReq: 36 },
  blooddemon_scythe: { id: 'blooddemon_scythe', name: 'Huyết Ma Trảm Đao', slot: 'weapon', quality: 'huyenthoai', icon: '🔪', baseAtk: 47, baseDef: 0, levelReq: 36 },
  blooddemon_boots: { id: 'blooddemon_boots', name: 'Ủng Huyết Ma', slot: 'feet', quality: 'huyenthoai', icon: '👢', baseAtk: 11, baseDef: 36, levelReq: 36 },

  // U Minh Cốc (Lv41)
  soulreaper_helm: { id: 'soulreaper_helm', name: 'Mũ Đoạt Hồn', slot: 'head', quality: 'suthi', icon: '⛑️', baseAtk: 25, baseDef: 25, levelReq: 41 },
  underworld_blade: { id: 'underworld_blade', name: 'U Minh Đao', slot: 'weapon', quality: 'huyenthoai', icon: '🗡️', baseAtk: 53, baseDef: 0, levelReq: 41 },
  underworld_gauntlet: { id: 'underworld_gauntlet', name: 'Găng U Minh Vương', slot: 'hands', quality: 'huyenthoai', icon: '🧤', baseAtk: 12, baseDef: 41, levelReq: 41 },

  // Ma Vực (Lv46)
  chaoshound_armor: { id: 'chaoshound_armor', name: 'Giáp Hỗn Độn', slot: 'body', quality: 'suthi', icon: '🥋', baseAtk: 28, baseDef: 28, levelReq: 46 },
  abyss_trident: { id: 'abyss_trident', name: 'Ma Vực Đinh Ba', slot: 'weapon', quality: 'huyenthoai', icon: '🔱', baseAtk: 60, baseDef: 0, levelReq: 46 },
  abyss_ring: { id: 'abyss_ring', name: 'Nhẫn Bá Chủ Vực Sâu', slot: 'ring', quality: 'huyenthoai', icon: '💍', baseAtk: 14, baseDef: 46, levelReq: 46 },

  // Cấm Địa (Lv51)
  sealbreaker_legguard: { id: 'sealbreaker_legguard', name: 'Quần Phá Ấn', slot: 'legs', quality: 'suthi', icon: '👖', baseAtk: 31, baseDef: 31, levelReq: 51 },
  forbidden_glaive: { id: 'forbidden_glaive', name: 'Cấm Địa Trường Thương', slot: 'weapon', quality: 'huyenthoai', icon: '🔱', baseAtk: 66, baseDef: 0, levelReq: 51 },
  forbidden_necklace: { id: 'forbidden_necklace', name: 'Dây Chuyền Đế Quân', slot: 'neck', quality: 'huyenthoai', icon: '📿', baseAtk: 15, baseDef: 51, levelReq: 51 },

  // Long Mạch (Lv57)
  dragonknight_boots: { id: 'dragonknight_boots', name: 'Ủng Long Kỵ', slot: 'feet', quality: 'suthi', icon: '👢', baseAtk: 34, baseDef: 34, levelReq: 57 },
  longmach_sword: { id: 'longmach_sword', name: 'Chân Long Kiếm', slot: 'weapon', quality: 'huyenthoai', icon: '⚔️', baseAtk: 74, baseDef: 0, levelReq: 57 },
  longmach_helm: { id: 'longmach_helm', name: 'Long Giáp Đầu', slot: 'head', quality: 'huyenthoai', icon: '⛑️', baseAtk: 17, baseDef: 57, levelReq: 57 },

  // Thiên Môn (Lv61)
  thundergeneral_gauntlet: { id: 'thundergeneral_gauntlet', name: 'Găng Lôi Đình', slot: 'hands', quality: 'suthi', icon: '🧤', baseAtk: 37, baseDef: 37, levelReq: 61 },
  heavengate_blade: { id: 'heavengate_blade', name: 'Thiên Môn Kiếm', slot: 'weapon', quality: 'huyenthoai', icon: '⚔️', baseAtk: 79, baseDef: 0, levelReq: 61 },
  heavengate_armor: { id: 'heavengate_armor', name: 'Thiên Giáp', slot: 'body', quality: 'huyenthoai', icon: '👘', baseAtk: 18, baseDef: 61, levelReq: 61 },

  // Vạn Ma Điện (Lv66)
  demongeneral_ring: { id: 'demongeneral_ring', name: 'Nhẫn Ma Tướng', slot: 'ring', quality: 'suthi', icon: '💍', baseAtk: 40, baseDef: 40, levelReq: 66 },
  vanma_greatsword: { id: 'vanma_greatsword', name: 'Vạn Ma Cự Kiếm', slot: 'weapon', quality: 'huyenthoai', icon: '⚔️', baseAtk: 86, baseDef: 0, levelReq: 66 },
  vanma_legguard: { id: 'vanma_legguard', name: 'Ma Điện Quần', slot: 'legs', quality: 'huyenthoai', icon: '👖', baseAtk: 20, baseDef: 66, levelReq: 66 },

  // Chiến Trường Cổ (Lv71)
  warspirit_necklace: { id: 'warspirit_necklace', name: 'Dây Chuyền Chiến Hồn', slot: 'neck', quality: 'suthi', icon: '📿', baseAtk: 43, baseDef: 43, levelReq: 71 },
  warlord_blade: { id: 'warlord_blade', name: 'Bá Vương Kiếm', slot: 'weapon', quality: 'huyenthoai', icon: '⚔️', baseAtk: 92, baseDef: 0, levelReq: 71 },
  warlord_boots: { id: 'warlord_boots', name: 'Ủng Bá Vương', slot: 'feet', quality: 'huyenthoai', icon: '👢', baseAtk: 21, baseDef: 71, levelReq: 71 },

  // Bí Cảnh (Lv76)
  mysticguardian_helm: { id: 'mysticguardian_helm', name: 'Mũ Hộ Pháp Bí Cảnh', slot: 'head', quality: 'suthi', icon: '⛑️', baseAtk: 46, baseDef: 46, levelReq: 76 },
  bicanh_fan: { id: 'bicanh_fan', name: 'Tiên Phong Phiến', slot: 'weapon', quality: 'huyenthoai', icon: '🪭', baseAtk: 99, baseDef: 0, levelReq: 76 },
  bicanh_gauntlet: { id: 'bicanh_gauntlet', name: 'Găng Bí Cảnh Tiên Nhân', slot: 'hands', quality: 'huyenthoai', icon: '🧤', baseAtk: 23, baseDef: 76, levelReq: 76 },

  // Tuyệt Mệnh Cốc — World Boss (Lv85)
  final_dragon_blade: { id: 'final_dragon_blade', name: 'Tuyệt Thế Long Kiếm', slot: 'weapon', quality: 'huyenthoai', icon: '⚔️', baseAtk: 150, baseDef: 10, levelReq: 85 },
  final_dragon_armor: { id: 'final_dragon_armor', name: 'Tuyệt Thế Long Giáp', slot: 'body', quality: 'huyenthoai', icon: '👘', baseAtk: 40, baseDef: 90, levelReq: 85 },

  // Phó bản (đảm bảo rớt khi lần đầu clear trong ngày)
  devilcave_amulet: { id: 'devilcave_amulet', name: 'Ma Quật Hộ Phù', slot: 'neck', quality: 'hiem', icon: '🧿', baseAtk: 12, baseDef: 15, levelReq: 15 },
  tombking_crown: { id: 'tombking_crown', name: 'Cổ Mộ Vương Miện', slot: 'head', quality: 'suthi', icon: '👑', baseAtk: 20, baseDef: 30, levelReq: 35 },

  // Huyễn Cảnh — Event (vui, nhẹ, mở sớm)
  carnival_hat: { id: 'carnival_hat', name: 'Nón Hội Hoa Đăng', slot: 'head', quality: 'tot', icon: '🎩', baseAtk: 3, baseDef: 6, levelReq: 8 }
};

export const EQUIP_SLOTS: ItemSlot[] = ['weapon', 'head', 'body', 'legs', 'feet', 'hands', 'ring', 'neck'];
