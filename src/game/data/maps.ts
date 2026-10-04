import { MapDef, StaticPropDef } from '../types';

// Seeded RNG đơn giản để map sinh cây cối/vật cản giống nhau mỗi lần load
// (không random thật, tránh server/client lệch nhau khi thêm multiplayer).
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Sinh viền tường quanh map + rải cây ngẫu nhiên (né hành lang ngang giữa map). */
function generateBorderAndTrees(
  width: number, height: number, seed: number,
  kind: StaticPropDef['kind'], density: number,
  corridorY = Math.floor(height / 2)
): StaticPropDef[] {
  const rnd = seeded(seed);
  const props: StaticPropDef[] = [];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const inCorridor = Math.abs(y - corridorY) <= 1;
      if (inCorridor) continue;
      if (edge || rnd() < density) props.push({ x, y, kind, solid: true });
    }
  }
  return props;
}

const village: MapDef = {
  key: 'village',
  name: 'Tân Thủ Thôn',
  region: 'tan_thu',
  recommendedLevel: '1',
  width: 40,
  height: 28,
  groundColor: 0x4f7a3a,
  pathColor: 0xa3844f,
  props: [
    { x: 8, y: 8, kind: 'building', solid: true },
    { x: 13, y: 7, kind: 'building', solid: true },
    { x: 27, y: 8, kind: 'building', solid: true },
    { x: 31, y: 19, kind: 'building', solid: true },
    { x: 10, y: 20, kind: 'building', solid: true }
  ],
  portals: [
    { x: 38, y: 14, toMap: 'field', toX: 3, toY: 14, label: 'Đồng Ngoại' },
    { x: 20, y: 24, toMap: 'huyen_canh', toX: 20, toY: 24, label: 'Huyễn Cảnh (Sự kiện)' }
  ],
  npcs: [
    { id: 'elder_1', x: 20, y: 14, name: 'Trưởng Thôn', sprite: 'elder' },
    { id: 'smith_1', x: 14, y: 8, name: 'Thợ Rèn Lý', sprite: 'blacksmith' },
    { id: 'merchant_1', x: 26, y: 9, name: 'Thương Nhân Vương', sprite: 'merchant' }
  ],
  monsterSpawns: [],
  ambientNote: 'Nhạc làng quê yên bình (chưa có audio thật)'
};

const field: MapDef = {
  key: 'field',
  name: 'Đồng Ngoại',
  region: 'tan_thu',
  recommendedLevel: '1-5',
  width: 40,
  height: 28,
  groundColor: 0x6f9a3a,
  pathColor: 0x9aa64a,
  props: generateBorderAndTrees(40, 28, 42, 'tree', 0.08),
  portals: [
    { x: 1, y: 14, toMap: 'village', toX: 36, toY: 14, label: 'Tân Thủ Thôn' },
    { x: 38, y: 14, toMap: 'bamboo_forest', toX: 3, toY: 14, label: 'Rừng Trúc' }
  ],
  npcs: [],
  monsterSpawns: [{ monsterType: 'wolf', count: 14, areaX: [3, 36], areaY: [3, 24] }],
  ambientNote: 'Gió thổi qua đồng cỏ'
};

const bambooForest: MapDef = {
  key: 'bamboo_forest',
  name: 'Rừng Trúc',
  region: 'tan_thu',
  recommendedLevel: '5-10',
  width: 40,
  height: 28,
  groundColor: 0x2f5f3f,
  pathColor: 0x4a7a5a,
  props: generateBorderAndTrees(40, 28, 99, 'bamboo', 0.11),
  portals: [
    { x: 1, y: 14, toMap: 'field', toX: 36, toY: 14, label: 'Đồng Ngoại' },
    { x: 38, y: 14, toMap: 'son_coc', toX: 3, toY: 14, label: 'Sơn Cốc' }
  ],
  npcs: [],
  monsterSpawns: [
    { monsterType: 'bamboo_demon', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'wolf_king', count: 1, areaX: [30, 34], areaY: [12, 16] } // mini-boss
  ],
  ambientNote: 'Tiếng trúc va vào nhau trong gió'
};

// ===== KHU VỰC TRUNG CẤP =====
const sonCoc: MapDef = {
  key: 'son_coc',
  name: 'Sơn Cốc',
  region: 'trung_cap',
  recommendedLevel: '12-18',
  width: 40,
  height: 28,
  groundColor: 0x6a6a5a,
  pathColor: 0x8a8060,
  props: generateBorderAndTrees(40, 28, 555, 'rock', 0.13),
  portals: [
    { x: 1, y: 14, toMap: 'bamboo_forest', toX: 36, toY: 14, label: 'Rừng Trúc' },
    { x: 38, y: 14, toMap: 'tham_lam', toX: 3, toY: 14, label: 'Thâm Lâm' }
  ],
  npcs: [],
  monsterSpawns: [
    { monsterType: 'rock_golem', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'shadow_wolf', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'mountain_king', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ],
  ambientNote: 'Gió núi rít qua vách đá'
};

const thamLam: MapDef = {
  key: 'tham_lam',
  name: 'Thâm Lâm',
  region: 'trung_cap',
  recommendedLevel: '17-22',
  width: 40,
  height: 28,
  groundColor: 0x1e3320,
  pathColor: 0x33502f,
  props: generateBorderAndTrees(40, 28, 777, 'tree', 0.14),
  portals: [
    { x: 1, y: 14, toMap: 'son_coc', toX: 36, toY: 14, label: 'Sơn Cốc' },
    { x: 38, y: 14, toMap: 'tran_bien', toX: 3, toY: 14, label: 'Trấn Biên' }
  ],
  npcs: [],
  monsterSpawns: [
    { monsterType: 'phantom_wolf', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'blood_bat', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'forest_wraith', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ],
  ambientNote: 'Rừng sâu tối tăm, tiếng cú kêu xa xa'
};

const tranBien: MapDef = {
  key: 'tran_bien',
  name: 'Trấn Biên',
  region: 'trung_cap',
  recommendedLevel: '15+',
  width: 40,
  height: 28,
  groundColor: 0x4f7a3a,
  pathColor: 0xa3844f,
  props: [
    { x: 9, y: 8, kind: 'building', solid: true },
    { x: 14, y: 7, kind: 'building', solid: true },
    { x: 28, y: 9, kind: 'building', solid: true },
    { x: 11, y: 20, kind: 'building', solid: true }
  ],
  portals: [
    { x: 1, y: 14, toMap: 'tham_lam', toX: 36, toY: 14, label: 'Thâm Lâm' },
    { x: 38, y: 14, toMap: 'hoang_mac', toX: 3, toY: 14, label: 'Hoang Mạc' }
  ],
  npcs: [
    { id: 'smith_2', x: 15, y: 8, name: 'Thợ Rèn Trấn Biên', sprite: 'blacksmith' },
    { id: 'merchant_2', x: 29, y: 10, name: 'Thương Nhân Biên Quan', sprite: 'merchant' },
    { id: 'guard_1', x: 20, y: 14, name: 'Lính Gác Trấn Biên', sprite: 'guard' }
  ],
  monsterSpawns: [],
  ambientNote: 'Thị trấn biên giới sầm uất, tiếng rao hàng vang khắp phố'
};

// ===== Hoang Mạc, Cổ Đạo (nốt Trung Cấp) =====
const hoangMac: MapDef = {
  key: 'hoang_mac', name: 'Hoang Mạc', region: 'trung_cap', recommendedLevel: '20-25',
  width: 40, height: 28, groundColor: 0xc9a86a, pathColor: 0xd8c088,
  props: generateBorderAndTrees(40, 28, 1010, 'rock', 0.1),
  portals: [
    { x: 1, y: 14, toMap: 'tran_bien', toX: 36, toY: 14, label: 'Trấn Biên' },
    { x: 38, y: 14, toMap: 'co_dao', toX: 3, toY: 14, label: 'Cổ Đạo' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'sand_scorpion', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'sand_reaver', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'desert_tyrant', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Gió cát mịt mù, nắng gắt trên hoang mạc mênh mông'
};
const coDao: MapDef = {
  key: 'co_dao', name: 'Cổ Đạo', region: 'trung_cap', recommendedLevel: '23-28',
  width: 40, height: 28, groundColor: 0x8a7a5a, pathColor: 0xa89868,
  props: generateBorderAndTrees(40, 28, 1111, 'rock', 0.12),
  portals: [
    { x: 1, y: 14, toMap: 'hoang_mac', toX: 36, toY: 14, label: 'Hoang Mạc' },
    { x: 38, y: 14, toMap: 'thien_son', toX: 3, toY: 14, label: 'Thiên Sơn' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'bandit_swordsman', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'bandit_captain', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'ancient_guardian', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Con đường cổ xưa vắng vẻ, dấu tích thời chiến loạn'
};

// ===== KHU VỰC CAO CẤP =====
const thienSon: MapDef = {
  key: 'thien_son', name: 'Thiên Sơn', region: 'cao_cap', recommendedLevel: '28-35',
  width: 40, height: 28, groundColor: 0x5a7a8a, pathColor: 0x7a98a8,
  props: generateBorderAndTrees(40, 28, 1212, 'rock', 0.13),
  portals: [
    { x: 1, y: 14, toMap: 'co_dao', toX: 36, toY: 14, label: 'Cổ Đạo' },
    { x: 38, y: 14, toMap: 'huyet_ma_dong', toX: 3, toY: 14, label: 'Huyết Ma Động' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'cloud_leopard', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'storm_eagle', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'thien_son_sage', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Đỉnh núi quanh năm mây phủ, khí lạnh thấu xương'
};
const huyetMaDong: MapDef = {
  key: 'huyet_ma_dong', name: 'Huyết Ma Động', region: 'cao_cap', recommendedLevel: '33-40',
  width: 40, height: 28, groundColor: 0x5a1818, pathColor: 0x7a2a2a,
  props: generateBorderAndTrees(40, 28, 1313, 'rock', 0.14),
  portals: [
    { x: 1, y: 14, toMap: 'thien_son', toX: 36, toY: 14, label: 'Thiên Sơn' },
    { x: 38, y: 14, toMap: 'u_minh_coc', toX: 3, toY: 14, label: 'U Minh Cốc' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'blood_imp', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'blood_priest', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'blood_demon_lord', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Hang động ngập mùi tanh của máu, tiếng gào rú xa xăm'
};
const uMinhCoc: MapDef = {
  key: 'u_minh_coc', name: 'U Minh Cốc', region: 'cao_cap', recommendedLevel: '38-45',
  width: 40, height: 28, groundColor: 0x1a1a2a, pathColor: 0x2a2a3a,
  props: generateBorderAndTrees(40, 28, 1414, 'tree', 0.13),
  portals: [
    { x: 1, y: 14, toMap: 'huyet_ma_dong', toX: 36, toY: 14, label: 'Huyết Ma Động' },
    { x: 38, y: 14, toMap: 'ma_vuc', toX: 3, toY: 14, label: 'Ma Vực' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'ghost_soldier', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'soul_reaper', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'underworld_king', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Sương mù âm u, tiếng gió rít như tiếng khóc oan hồn'
};
const maVuc: MapDef = {
  key: 'ma_vuc', name: 'Ma Vực', region: 'cao_cap', recommendedLevel: '43-50',
  width: 40, height: 28, groundColor: 0x2a0a2a, pathColor: 0x3a1a3a,
  props: generateBorderAndTrees(40, 28, 1515, 'rock', 0.15),
  portals: [
    { x: 1, y: 14, toMap: 'u_minh_coc', toX: 36, toY: 14, label: 'U Minh Cốc' },
    { x: 38, y: 14, toMap: 'cam_dia', toX: 3, toY: 14, label: 'Cấm Địa' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'abyss_fiend', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'chaos_hound', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'abyss_overlord', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Không gian méo mó, thực tại và hư ảo hoà lẫn'
};
const camDia: MapDef = {
  key: 'cam_dia', name: 'Cấm Địa', region: 'cao_cap', recommendedLevel: '48-55',
  width: 40, height: 28, groundColor: 0x3a2a1a, pathColor: 0x5a4a2a,
  props: generateBorderAndTrees(40, 28, 1616, 'building', 0.09),
  portals: [
    { x: 1, y: 14, toMap: 'ma_vuc', toX: 36, toY: 14, label: 'Ma Vực' },
    { x: 38, y: 14, toMap: 'long_mach', toX: 3, toY: 14, label: 'Long Mạch' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'forbidden_guard', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'seal_breaker', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'forbidden_emperor', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Vùng đất bị phong ấn ngàn năm, cấm kỵ với người thường'
};

// ===== KHU VỰC BOSS / ENDGAME =====
const longMach: MapDef = {
  key: 'long_mach', name: 'Long Mạch', region: 'boss', recommendedLevel: '55-60',
  width: 40, height: 28, groundColor: 0x1a3a4a, pathColor: 0x2a5a6a,
  props: generateBorderAndTrees(40, 28, 1717, 'rock', 0.1),
  portals: [
    { x: 1, y: 14, toMap: 'cam_dia', toX: 36, toY: 14, label: 'Cấm Địa' },
    { x: 38, y: 14, toMap: 'thien_mon', toX: 3, toY: 14, label: 'Thiên Môn' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'dragon_whelp', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'dragon_knight', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'long_mach_dragon', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Long khí cuộn trào dưới lòng đất, ánh sáng huyền bí'
};
const thienMon: MapDef = {
  key: 'thien_mon', name: 'Thiên Môn', region: 'boss', recommendedLevel: '58-65',
  width: 40, height: 28, groundColor: 0x8a8ac0, pathColor: 0xa8a8d8,
  props: generateBorderAndTrees(40, 28, 1818, 'building', 0.08),
  portals: [
    { x: 1, y: 14, toMap: 'long_mach', toX: 36, toY: 14, label: 'Long Mạch' },
    { x: 38, y: 14, toMap: 'van_ma_dien', toX: 3, toY: 14, label: 'Vạn Ma Điện' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'heaven_sentinel', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'thunder_general', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'heaven_gate_lord', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Cổng trời sừng sững giữa mây, sấm chớp không ngừng'
};
const vanMaDien: MapDef = {
  key: 'van_ma_dien', name: 'Vạn Ma Điện', region: 'boss', recommendedLevel: '63-70',
  width: 40, height: 28, groundColor: 0x2a0a0a, pathColor: 0x4a1a1a,
  props: generateBorderAndTrees(40, 28, 1919, 'building', 0.09),
  portals: [
    { x: 1, y: 14, toMap: 'thien_mon', toX: 36, toY: 14, label: 'Thiên Môn' },
    { x: 38, y: 14, toMap: 'chien_truong_co', toX: 3, toY: 14, label: 'Chiến Trường Cổ' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'demon_soldier', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'demon_general', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'van_ma_emperor', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Điện thờ ma giáo nguy nga, khói hương đen nghi ngút'
};
const chienTruongCo: MapDef = {
  key: 'chien_truong_co', name: 'Chiến Trường Cổ', region: 'boss', recommendedLevel: '68-75',
  width: 40, height: 28, groundColor: 0x4a3a2a, pathColor: 0x6a5a3a,
  props: generateBorderAndTrees(40, 28, 2020, 'rock', 0.08),
  portals: [
    { x: 1, y: 14, toMap: 'van_ma_dien', toX: 36, toY: 14, label: 'Vạn Ma Điện' },
    { x: 38, y: 14, toMap: 'bi_canh', toX: 3, toY: 14, label: 'Bí Cảnh' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'fallen_warrior', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'war_spirit', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'ancient_warlord', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Chiến trường xưa cũ, vũ khí gãy vụn phủ đầy cát bụi'
};
const biCanh: MapDef = {
  key: 'bi_canh', name: 'Bí Cảnh', region: 'boss', recommendedLevel: '73-80',
  width: 40, height: 28, groundColor: 0x3a1a4a, pathColor: 0x5a2a6a,
  props: generateBorderAndTrees(40, 28, 2121, 'bamboo', 0.11),
  portals: [
    { x: 1, y: 14, toMap: 'chien_truong_co', toX: 36, toY: 14, label: 'Chiến Trường Cổ' },
    { x: 38, y: 14, toMap: 'tuyet_menh_coc', toX: 3, toY: 14, label: 'Tuyệt Mệnh Cốc' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'mystic_beast', count: 12, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'mystic_guardian', count: 3, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'bi_canh_immortal', count: 1, areaX: [30, 34], areaY: [12, 16] }
  ], ambientNote: 'Không gian huyễn ảo, hoa lạ nở quanh năm giữa sương khói'
};
const tuyetMenhCoc: MapDef = {
  key: 'tuyet_menh_coc', name: 'Tuyệt Mệnh Cốc', region: 'boss', recommendedLevel: '80+',
  width: 40, height: 28, groundColor: 0x0a0a0a, pathColor: 0x2a1a1a,
  props: generateBorderAndTrees(40, 28, 2222, 'rock', 0.1),
  portals: [
    { x: 1, y: 14, toMap: 'bi_canh', toX: 36, toY: 14, label: 'Bí Cảnh' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'the_final_dragon', count: 1, areaX: [18, 22], areaY: [12, 16] }
  ], ambientNote: 'World Boss cuối cùng — thử thách tối thượng cho cao thủ đỉnh cấp'
};

// ===== Khu vực Event =====
const huyenCanh: MapDef = {
  key: 'huyen_canh', name: 'Huyễn Cảnh', region: 'tan_thu', recommendedLevel: '1+',
  width: 40, height: 28, groundColor: 0x7a5aa0, pathColor: 0x9a7ac0,
  props: generateBorderAndTrees(40, 28, 2323, 'bamboo', 0.06),
  portals: [
    { x: 20, y: 3, toMap: 'village', toX: 20, toY: 12, label: 'Tân Thủ Thôn' }
  ],
  npcs: [], monsterSpawns: [
    { monsterType: 'mischief_spirit', count: 10, areaX: [3, 36], areaY: [3, 24] },
    { monsterType: 'carnival_king', count: 1, areaX: [18, 22], areaY: [8, 12] }
  ], ambientNote: 'Khu vực sự kiện xoay vòng — quái/hoạt động sẽ đổi theo mùa event'
};

// ===== DUNGEON (Phó bản) — bản đồ nhỏ gọn, vào qua menu "PHÓ BẢN", không nối
// portal đi bộ với thế giới mở. Ra ngoài bằng cổng về Tân Thủ Thôn. =====
const hangQuy: MapDef = {
  key: 'hang_quy', name: 'Hang Quỷ', region: 'trung_cap', recommendedLevel: '15+',
  width: 24, height: 18, groundColor: 0x2a1a1a, pathColor: 0x4a2a2a,
  props: generateBorderAndTrees(24, 18, 3001, 'rock', 0.1, 9),
  portals: [{ x: 1, y: 9, toMap: 'village', toX: 20, toY: 16, label: 'Rời phó bản (Tân Thủ Thôn)' }],
  npcs: [], monsterSpawns: [
    { monsterType: 'devil_cave_lord', count: 1, areaX: [16, 20], areaY: [7, 11] }
  ], ambientNote: 'Phó bản: giới hạn lượt nhận thưởng mỗi ngày'
};
const coMo: MapDef = {
  key: 'co_mo', name: 'Cổ Mộ', region: 'cao_cap', recommendedLevel: '35+',
  width: 24, height: 18, groundColor: 0x1a1a1a, pathColor: 0x3a3a2a,
  props: generateBorderAndTrees(24, 18, 3002, 'building', 0.08, 9),
  portals: [{ x: 1, y: 9, toMap: 'village', toX: 20, toY: 16, label: 'Rời phó bản (Tân Thủ Thôn)' }],
  npcs: [], monsterSpawns: [
    { monsterType: 'tomb_guardian_king', count: 1, areaX: [16, 20], areaY: [7, 11] }
  ], ambientNote: 'Phó bản: giới hạn lượt nhận thưởng mỗi ngày'
};

const pvpArena: MapDef = {
  key: 'pvp_arena', name: 'Đấu Trường', region: 'tan_thu', recommendedLevel: '1+',
  width: 24, height: 16, groundColor: 0x3a3a3a, pathColor: 0x5a5a5a,
  props: generateBorderAndTrees(24, 16, 4001, 'rock', 0.04, 8),
  portals: [],
  npcs: [], monsterSpawns: [],
  ambientNote: 'Đấu trường PK — vị trí/đòn đánh đồng bộ real-time qua Supabase Realtime'
};

export const MAPS: Record<string, MapDef> = {
  village, field, bamboo_forest: bambooForest,
  pvp_arena: pvpArena,
  son_coc: sonCoc, tham_lam: thamLam, tran_bien: tranBien,
  hoang_mac: hoangMac, co_dao: coDao,
  thien_son: thienSon, huyet_ma_dong: huyetMaDong, u_minh_coc: uMinhCoc, ma_vuc: maVuc, cam_dia: camDia,
  long_mach: longMach, thien_mon: thienMon, van_ma_dien: vanMaDien, chien_truong_co: chienTruongCo,
  bi_canh: biCanh, tuyet_menh_coc: tuyetMenhCoc,
  huyen_canh: huyenCanh,
  hang_quy: hangQuy, co_mo: coMo
};
// Đủ 20/20 map theo đặc tả gốc, liên kết thành 1 thế giới liền mạch qua cổng dịch chuyển.

export const DEFAULT_MAP = 'village';
