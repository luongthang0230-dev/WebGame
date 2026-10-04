// Kiểu dữ liệu dùng chung cho hệ thống map. Mọi map mới (Phase 7 sẽ có
// 15–20 map) chỉ cần thêm một object MapDef vào src/game/data/maps.ts,
// không cần sửa engine trong scenes/WorldScene.ts.

export type TileType = 'ground' | 'wall' | 'water' | 'path';

export interface PortalDef {
  x: number;        // toạ độ tile
  y: number;
  toMap: string;     // key của map đích, khớp với key trong MAPS
  toX: number;       // toạ độ tile xuất hiện ở map đích
  toY: number;
  label: string;     // tên hiển thị phía trên cổng
}

export interface StaticPropDef {
  x: number;
  y: number;
  kind: 'tree' | 'bamboo' | 'rock' | 'building';
  solid: boolean;
}

export interface NpcMarkerDef {
  id: string;
  x: number;
  y: number;
  name: string;
  sprite: 'elder' | 'blacksmith' | 'merchant' | 'guard';
}

export interface MonsterSpawnDef {
  monsterType: string;
  count: number;
  areaX: [number, number]; // vùng spawn theo tile, [min,max]
  areaY: [number, number];
}

export interface MapDef {
  key: string;
  name: string;
  region: 'tan_thu' | 'trung_cap' | 'cao_cap' | 'boss';
  recommendedLevel: string;
  width: number;   // số tile ngang
  height: number;  // số tile dọc
  groundColor: number;  // màu nền hex (Phaser dùng number 0xRRGGBB)
  pathColor: number;
  props: StaticPropDef[];
  portals: PortalDef[];
  npcs: NpcMarkerDef[];
  monsterSpawns: MonsterSpawnDef[];
  ambientNote?: string; // mô tả nhạc/không khí, dùng ở Phase sau khi có audio thật
}
