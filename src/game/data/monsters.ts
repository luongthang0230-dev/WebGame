// Định nghĩa quái. Khớp key với monsterType dùng trong data/maps.ts.
// Phase 8 sẽ nâng cấp: bảng monsters/monster_drops thật trong Supabase
// thay vì hard-code, nhưng cấu trúc field giữ nguyên để migrate dễ dàng.
export type MonsterTier = 'normal' | 'elite' | 'boss';

export interface MonsterDef {
  id: string;
  name: string;
  glyph: string;
  tier: MonsterTier;
  level: number;
  hp: number;
  atk: number;
  moveSpeed: number;
  aggroRange: number;   // bán kính phát hiện người chơi (px)
  leashRange: number;   // đi quá xa tổ sẽ quay về
  respawnMs: number;
  expReward: number;
  goldMin: number;
  goldMax: number;
}

export const MONSTERS: Record<string, MonsterDef> = {
  wolf: {
    id: 'wolf', name: 'Sói Hoang', glyph: '🐺', tier: 'normal', level: 1,
    hp: 40, atk: 5, moveSpeed: 70, aggroRange: 150, leashRange: 260,
    respawnMs: 8000, expReward: 14, goldMin: 3, goldMax: 8
  },
  bamboo_demon: {
    id: 'bamboo_demon', name: 'Trúc Yêu', glyph: '🐼', tier: 'normal', level: 6,
    hp: 120, atk: 11, moveSpeed: 75, aggroRange: 160, leashRange: 280,
    respawnMs: 9000, expReward: 34, goldMin: 8, goldMax: 18
  },
  wolf_king: {
    id: 'wolf_king', name: 'Sói Vương', glyph: '🐲', tier: 'boss', level: 10,
    hp: 900, atk: 26, moveSpeed: 85, aggroRange: 220, leashRange: 400,
    respawnMs: 60000, expReward: 420, goldMin: 150, goldMax: 250
  },

  // ===== Khu vực Trung Cấp: Sơn Cốc =====
  rock_golem: {
    id: 'rock_golem', name: 'Nham Thạch Quái', glyph: '🗿', tier: 'normal', level: 12,
    hp: 180, atk: 16, moveSpeed: 60, aggroRange: 150, leashRange: 260,
    respawnMs: 9000, expReward: 55, goldMin: 15, goldMax: 30
  },
  shadow_wolf: {
    id: 'shadow_wolf', name: 'Ảnh Lang', glyph: '🐺', tier: 'elite', level: 15,
    hp: 260, atk: 20, moveSpeed: 90, aggroRange: 180, leashRange: 300,
    respawnMs: 12000, expReward: 90, goldMin: 25, goldMax: 45
  },
  mountain_king: {
    id: 'mountain_king', name: 'Sơn Vương', glyph: '👹', tier: 'boss', level: 18,
    hp: 1400, atk: 34, moveSpeed: 80, aggroRange: 230, leashRange: 420,
    respawnMs: 90000, expReward: 650, goldMin: 300, goldMax: 450
  },

  // ===== Khu vực Trung Cấp: Thâm Lâm =====
  phantom_wolf: {
    id: 'phantom_wolf', name: 'U Ảnh Lang', glyph: '🐾', tier: 'normal', level: 17,
    hp: 220, atk: 22, moveSpeed: 95, aggroRange: 170, leashRange: 290,
    respawnMs: 9500, expReward: 70, goldMin: 20, goldMax: 35
  },
  blood_bat: {
    id: 'blood_bat', name: 'Huyết Sí Bức', glyph: '🦇', tier: 'elite', level: 19,
    hp: 320, atk: 26, moveSpeed: 110, aggroRange: 190, leashRange: 320,
    respawnMs: 13000, expReward: 110, goldMin: 35, goldMax: 55
  },
  forest_wraith: {
    id: 'forest_wraith', name: 'Lâm Vong Hồn', glyph: '👻', tier: 'boss', level: 22,
    hp: 1800, atk: 40, moveSpeed: 85, aggroRange: 240, leashRange: 440,
    respawnMs: 120000, expReward: 850, goldMin: 400, goldMax: 600
  },

  // ===== Hoang Mạc (nốt Trung Cấp) =====
  sand_scorpion: { id: 'sand_scorpion', name: 'Sa Yêu Hạt', glyph: '🦂', tier: 'normal', level: 23, hp: 345, atk: 37, moveSpeed: 80, aggroRange: 160, leashRange: 280, respawnMs: 9500, expReward: 97, goldMin: 25, goldMax: 46 },
  sand_reaver: { id: 'sand_reaver', name: 'Sa Tặc', glyph: '🏹', tier: 'elite', level: 23, hp: 621, atk: 46, moveSpeed: 100, aggroRange: 190, leashRange: 320, respawnMs: 14000, expReward: 161, goldMin: 41, goldMax: 74 },
  desert_tyrant: { id: 'desert_tyrant', name: 'Sa Mạc Bạo Long', glyph: '🦎', tier: 'boss', level: 23, hp: 3220, atk: 66, moveSpeed: 80, aggroRange: 230, leashRange: 420, respawnMs: 40000, expReward: 1288, goldMin: 552, goldMax: 828 },

  // ===== Cổ Đạo =====
  bandit_swordsman: { id: 'bandit_swordsman', name: 'Đạo Tặc Kiếm', glyph: '🗡️', tier: 'normal', level: 26, hp: 390, atk: 42, moveSpeed: 85, aggroRange: 160, leashRange: 280, respawnMs: 9500, expReward: 109, goldMin: 29, goldMax: 52 },
  bandit_captain: { id: 'bandit_captain', name: 'Đạo Tặc Đầu Lĩnh', glyph: '🛡️', tier: 'elite', level: 26, hp: 702, atk: 52, moveSpeed: 95, aggroRange: 190, leashRange: 320, respawnMs: 14000, expReward: 182, goldMin: 47, goldMax: 83 },
  ancient_guardian: { id: 'ancient_guardian', name: 'Cổ Đạo Thạch Thần', glyph: '🗿', tier: 'boss', level: 26, hp: 3640, atk: 75, moveSpeed: 75, aggroRange: 230, leashRange: 420, respawnMs: 45000, expReward: 1456, goldMin: 624, goldMax: 936 },

  // ===== Thiên Sơn (Cao Cấp) =====
  cloud_leopard: { id: 'cloud_leopard', name: 'Vân Báo', glyph: '🐆', tier: 'normal', level: 31, hp: 465, atk: 50, moveSpeed: 110, aggroRange: 170, leashRange: 290, respawnMs: 10000, expReward: 130, goldMin: 34, goldMax: 62 },
  storm_eagle: { id: 'storm_eagle', name: 'Bạo Phong Ưng', glyph: '🦅', tier: 'elite', level: 31, hp: 837, atk: 62, moveSpeed: 130, aggroRange: 200, leashRange: 340, respawnMs: 15000, expReward: 217, goldMin: 56, goldMax: 99 },
  thien_son_sage: { id: 'thien_son_sage', name: 'Thiên Sơn Quái Nhân', glyph: '🧙', tier: 'boss', level: 31, hp: 4030, atk: 93, moveSpeed: 80, aggroRange: 240, leashRange: 440, respawnMs: 50000, expReward: 1705, goldMin: 744, goldMax: 1116 },

  // ===== Huyết Ma Động =====
  blood_imp: { id: 'blood_imp', name: 'Huyết Tiểu Quỷ', glyph: '👹', tier: 'normal', level: 36, hp: 540, atk: 58, moveSpeed: 90, aggroRange: 170, leashRange: 290, respawnMs: 10000, expReward: 151, goldMin: 40, goldMax: 72 },
  blood_priest: { id: 'blood_priest', name: 'Huyết Giáo Sĩ', glyph: '🧛', tier: 'elite', level: 36, hp: 972, atk: 72, moveSpeed: 95, aggroRange: 200, leashRange: 340, respawnMs: 15000, expReward: 252, goldMin: 65, goldMax: 115 },
  blood_demon_lord: { id: 'blood_demon_lord', name: 'Huyết Ma Tôn', glyph: '😈', tier: 'boss', level: 36, hp: 4680, atk: 108, moveSpeed: 85, aggroRange: 250, leashRange: 460, respawnMs: 55000, expReward: 1980, goldMin: 864, goldMax: 1296 },

  // ===== U Minh Cốc =====
  ghost_soldier: { id: 'ghost_soldier', name: 'U Binh', glyph: '💀', tier: 'normal', level: 41, hp: 615, atk: 66, moveSpeed: 85, aggroRange: 175, leashRange: 300, respawnMs: 10000, expReward: 172, goldMin: 45, goldMax: 82 },
  soul_reaper: { id: 'soul_reaper', name: 'Đoạt Hồn Sứ', glyph: '🔪', tier: 'elite', level: 41, hp: 1107, atk: 82, moveSpeed: 100, aggroRange: 205, leashRange: 350, respawnMs: 15500, expReward: 287, goldMin: 74, goldMax: 131 },
  underworld_king: { id: 'underworld_king', name: 'U Minh Vương', glyph: '👑', tier: 'boss', level: 41, hp: 5330, atk: 123, moveSpeed: 85, aggroRange: 250, leashRange: 460, respawnMs: 60000, expReward: 2255, goldMin: 984, goldMax: 1476 },

  // ===== Ma Vực =====
  abyss_fiend: { id: 'abyss_fiend', name: 'Vực Ma', glyph: '👿', tier: 'normal', level: 46, hp: 690, atk: 74, moveSpeed: 90, aggroRange: 180, leashRange: 300, respawnMs: 10500, expReward: 193, goldMin: 51, goldMax: 92 },
  chaos_hound: { id: 'chaos_hound', name: 'Hỗn Độn Khuyển', glyph: '🐺', tier: 'elite', level: 46, hp: 1242, atk: 92, moveSpeed: 120, aggroRange: 210, leashRange: 360, respawnMs: 16000, expReward: 322, goldMin: 83, goldMax: 147 },
  abyss_overlord: { id: 'abyss_overlord', name: 'Ma Vực Bá Chủ', glyph: '🐙', tier: 'boss', level: 46, hp: 5980, atk: 138, moveSpeed: 85, aggroRange: 260, leashRange: 480, respawnMs: 65000, expReward: 2530, goldMin: 1104, goldMax: 1656 },

  // ===== Cấm Địa =====
  forbidden_guard: { id: 'forbidden_guard', name: 'Cấm Vệ', glyph: '🛡️', tier: 'normal', level: 51, hp: 765, atk: 82, moveSpeed: 90, aggroRange: 180, leashRange: 300, respawnMs: 10500, expReward: 214, goldMin: 56, goldMax: 102 },
  seal_breaker: { id: 'seal_breaker', name: 'Phá Ấn Nhân', glyph: '🔓', tier: 'elite', level: 51, hp: 1377, atk: 102, moveSpeed: 100, aggroRange: 210, leashRange: 360, respawnMs: 16500, expReward: 357, goldMin: 92, goldMax: 163 },
  forbidden_emperor: { id: 'forbidden_emperor', name: 'Cấm Địa Đế Quân', glyph: '👑', tier: 'boss', level: 51, hp: 6630, atk: 153, moveSpeed: 85, aggroRange: 260, leashRange: 480, respawnMs: 70000, expReward: 2805, goldMin: 1224, goldMax: 1836 },

  // ===== Long Mạch (Boss/Endgame) =====
  dragon_whelp: { id: 'dragon_whelp', name: 'Long Duệ', glyph: '🐉', tier: 'normal', level: 57, hp: 855, atk: 91, moveSpeed: 95, aggroRange: 185, leashRange: 310, respawnMs: 11000, expReward: 239, goldMin: 63, goldMax: 114 },
  dragon_knight: { id: 'dragon_knight', name: 'Long Kỵ Sĩ', glyph: '⚔️', tier: 'elite', level: 57, hp: 1539, atk: 114, moveSpeed: 105, aggroRange: 215, leashRange: 370, respawnMs: 17000, expReward: 399, goldMin: 103, goldMax: 182 },
  long_mach_dragon: { id: 'long_mach_dragon', name: 'Long Mạch Chân Long', glyph: '🐲', tier: 'boss', level: 57, hp: 7410, atk: 171, moveSpeed: 90, aggroRange: 270, leashRange: 500, respawnMs: 80000, expReward: 3135, goldMin: 1368, goldMax: 2052 },

  // ===== Thiên Môn =====
  heaven_sentinel: { id: 'heaven_sentinel', name: 'Thiên Môn Vệ', glyph: '😇', tier: 'normal', level: 61, hp: 915, atk: 98, moveSpeed: 95, aggroRange: 185, leashRange: 310, respawnMs: 11000, expReward: 256, goldMin: 67, goldMax: 122 },
  thunder_general: { id: 'thunder_general', name: 'Lôi Đình Tướng Quân', glyph: '⚡', tier: 'elite', level: 61, hp: 1647, atk: 122, moveSpeed: 110, aggroRange: 220, leashRange: 380, respawnMs: 17500, expReward: 427, goldMin: 110, goldMax: 195 },
  heaven_gate_lord: { id: 'heaven_gate_lord', name: 'Thiên Môn Chi Chủ', glyph: '🌩️', tier: 'boss', level: 61, hp: 7930, atk: 183, moveSpeed: 90, aggroRange: 270, leashRange: 500, respawnMs: 85000, expReward: 3355, goldMin: 1464, goldMax: 2196 },

  // ===== Vạn Ma Điện =====
  demon_soldier: { id: 'demon_soldier', name: 'Ma Binh', glyph: '👹', tier: 'normal', level: 66, hp: 990, atk: 106, moveSpeed: 95, aggroRange: 190, leashRange: 320, respawnMs: 11500, expReward: 277, goldMin: 73, goldMax: 132 },
  demon_general: { id: 'demon_general', name: 'Ma Tướng', glyph: '😈', tier: 'elite', level: 66, hp: 1782, atk: 132, moveSpeed: 110, aggroRange: 220, leashRange: 380, respawnMs: 18000, expReward: 462, goldMin: 119, goldMax: 211 },
  van_ma_emperor: { id: 'van_ma_emperor', name: 'Vạn Ma Điện Chủ', glyph: '👑', tier: 'boss', level: 66, hp: 8580, atk: 198, moveSpeed: 90, aggroRange: 280, leashRange: 520, respawnMs: 90000, expReward: 3630, goldMin: 1584, goldMax: 2376 },

  // ===== Chiến Trường Cổ =====
  fallen_warrior: { id: 'fallen_warrior', name: 'Chiến Tử Vong Linh', glyph: '💀', tier: 'normal', level: 71, hp: 1065, atk: 114, moveSpeed: 95, aggroRange: 190, leashRange: 320, respawnMs: 11500, expReward: 298, goldMin: 78, goldMax: 142 },
  war_spirit: { id: 'war_spirit', name: 'Chiến Hồn', glyph: '👻', tier: 'elite', level: 71, hp: 1917, atk: 142, moveSpeed: 105, aggroRange: 225, leashRange: 390, respawnMs: 18500, expReward: 497, goldMin: 128, goldMax: 227 },
  ancient_warlord: { id: 'ancient_warlord', name: 'Cổ Chiến Bá Vương', glyph: '🗿', tier: 'boss', level: 71, hp: 9230, atk: 213, moveSpeed: 90, aggroRange: 280, leashRange: 520, respawnMs: 95000, expReward: 3905, goldMin: 1704, goldMax: 2556 },

  // ===== Bí Cảnh =====
  mystic_beast: { id: 'mystic_beast', name: 'Huyễn Thú', glyph: '🦄', tier: 'normal', level: 76, hp: 1140, atk: 122, moveSpeed: 100, aggroRange: 195, leashRange: 330, respawnMs: 12000, expReward: 319, goldMin: 84, goldMax: 152 },
  mystic_guardian: { id: 'mystic_guardian', name: 'Bí Cảnh Hộ Pháp', glyph: '🐉', tier: 'elite', level: 76, hp: 2052, atk: 152, moveSpeed: 110, aggroRange: 230, leashRange: 400, respawnMs: 19000, expReward: 532, goldMin: 137, goldMax: 243 },
  bi_canh_immortal: { id: 'bi_canh_immortal', name: 'Bí Cảnh Tiên Nhân', glyph: '🧚', tier: 'boss', level: 76, hp: 9880, atk: 228, moveSpeed: 90, aggroRange: 290, leashRange: 540, respawnMs: 100000, expReward: 4180, goldMin: 1824, goldMax: 2736 },

  // ===== Tuyệt Mệnh Cốc — World Boss (endgame) =====
  the_final_dragon: { id: 'the_final_dragon', name: 'Tuyệt Thế Chân Long', glyph: '🐲', tier: 'boss', level: 85, hp: 20000, atk: 300, moveSpeed: 95, aggroRange: 320, leashRange: 600, respawnMs: 21600000, expReward: 10000, goldMin: 5000, goldMax: 8000 },

  // ===== Boss phó bản (Dungeon) — chỉ xuất hiện trong Hang Quỷ / Cổ Mộ =====
  devil_cave_lord: {
    id: 'devil_cave_lord', name: 'Ma Quật Chi Chủ', glyph: '👹', tier: 'boss', level: 15,
    hp: 1950, atk: 45, moveSpeed: 85, aggroRange: 240, leashRange: 440,
    respawnMs: 999999999, expReward: 900, goldMin: 300, goldMax: 450
  },
  tomb_guardian_king: {
    id: 'tomb_guardian_king', name: 'Cổ Mộ Thủ Hộ Vương', glyph: '🧟', tier: 'boss', level: 35,
    hp: 4550, atk: 105, moveSpeed: 80, aggroRange: 260, leashRange: 480,
    respawnMs: 999999999, expReward: 1925, goldMin: 700, goldMax: 1050
  },

  // ===== Huyễn Cảnh — khu Event (mở sớm, độ khó nhẹ) =====
  mischief_spirit: { id: 'mischief_spirit', name: 'Tinh Linh Nghịch Ngợm', glyph: '🎭', tier: 'normal', level: 5, hp: 75, atk: 8, moveSpeed: 90, aggroRange: 140, leashRange: 240, respawnMs: 7000, expReward: 21, goldMin: 5, goldMax: 10 },
  carnival_king: { id: 'carnival_king', name: 'Vua Hội Hoa Đăng', glyph: '🎪', tier: 'boss', level: 8, hp: 1040, atk: 24, moveSpeed: 80, aggroRange: 200, leashRange: 360, respawnMs: 45000, expReward: 440, goldMin: 192, goldMax: 288 }
};
