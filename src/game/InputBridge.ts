// Cầu nối input: UI React (joystick ảo, nút bấm) ghi vào đây, Phaser Scene
// đọc mỗi frame. Tránh việc Scene phải import React và ngược lại.
export interface PlayerRuntime {
  mapKey: string;
  x: number;
  y: number;
  hp: number;
  mp: number;
}

export interface CooldownState {
  ratios: number[]; // 0..1 mỗi skill, dùng để UI vẽ overlay hồi chiêu
  mpCosts: number[];
  locked: boolean[]; // do chưa đủ cấp
}

class InputBridge {
  vector = { x: 0, y: 0 }; // joystick ảo, -1..1
  castRequest: number | null = null; // UI ghi index skill muốn cast, scene đọc rồi xoá
  autoMode = false; // Auto Train: tự tìm quái, tự đánh, tự nhặt đồ
  onMapChange: ((mapKey: string, npc?: string) => void) | null = null;
  onNpcNear: ((npcId: string | null, npcName?: string) => void) | null = null;
  /** Scene gọi khi hạ gục quái, kèm toạ độ để spawn đồ rơi tại đó. */
  onMonsterKilled: ((monsterDefId: string, x: number, y: number) => void) | null = null;
  /** Scene gọi khi người chơi đi tới gần đồ rơi trên đất (auto nhặt). */
  onLootReached: ((token: string) => void) | null = null;
  /** Scene gọi khi người chơi bị hạ (hp về 0). */
  onPlayerDown: (() => void) | null = null;
  /** Scene ghi trạng thái hồi chiêu mỗi frame để UI vẽ nút skill. */
  cooldowns: CooldownState = { ratios: [0, 0, 0, 0], mpCosts: [0, 0, 0, 0], locked: [false, false, false, false] };

  /** WorldScene ghi vào đây mỗi frame; React (HUD + Supabase sync) đọc định kỳ. */
  playerRuntime: PlayerRuntime = { mapKey: 'village', x: 0, y: 0, hp: 0, mp: 0 };

  // ===== Chế độ PvP Duel (vị trí qua Realtime Broadcast — chỉ hình ảnh;
  // sát thương/HP/thắng-thua qua RPC server-authoritative, xem PhaserGame.tsx) =====
  /** WorldScene gọi ~mỗi 150ms khi đang đấu để gửi vị trí của mình cho đối thủ (chỉ để hiển thị mượt). */
  duelBroadcastPos: ((x: number, y: number) => void) | null = null;
  /** WorldScene gọi khi phát hiện chiêu của mình trong tầm đối thủ — KHÔNG tự tính sát thương,
   *  chỉ "xin" server (report_duel_hit) tính thật rồi trả kết quả. */
  duelRequestHit: ((skillId: string) => void) | null = null;
  /** Tương tự duelRequestHit nhưng cho chiêu hồi máu — cũng không tự tính ở client. */
  duelRequestHeal: ((skillId: string) => void) | null = null;
  /** WorldScene gọi khi trận đấu kết thúc (true = mình thắng). */
  onDuelEnd: ((won: boolean) => void) | null = null;

  setVector(x: number, y: number) {
    this.vector.x = x;
    this.vector.y = y;
  }

  requestCast(index: number) {
    this.castRequest = index;
  }

  setAutoMode(on: boolean) {
    this.autoMode = on;
  }
}

export const inputBridge = new InputBridge();
