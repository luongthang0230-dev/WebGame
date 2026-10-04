// Mirror hiển thị của bảng `dungeons` trong Supabase. Server (bảng dungeons +
// RPC complete_dungeon) là nguồn sự thật cho giới hạn lượt/phần thưởng;
// file này chỉ phục vụ UI (tên, map đích, yêu cầu cấp) để mở panel nhanh
// mà không cần round-trip DB trước khi hiển thị danh sách.
export interface DungeonDef {
  id: string;
  name: string;
  mapKey: string;
  spawnX: number;
  spawnY: number;
  levelReq: number;
  dailyLimit: number;
  bossName: string;
}

export const DUNGEONS: DungeonDef[] = [
  { id: 'hang_quy', name: 'Hang Quỷ', mapKey: 'hang_quy', spawnX: 3, spawnY: 9, levelReq: 15, dailyLimit: 1, bossName: 'Ma Quật Chi Chủ' },
  { id: 'co_mo', name: 'Cổ Mộ', mapKey: 'co_mo', spawnX: 3, spawnY: 9, levelReq: 35, dailyLimit: 1, bossName: 'Cổ Mộ Thủ Hộ Vương' }
];
