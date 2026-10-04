// Bộ phân tích lệnh gõ trong khung chat, dạng "/lenh tham_so...".
// File này CHỈ phân tích cú pháp (parse) — không tự ý thực thi quyền admin.
// Sau khi parse, client gọi API tương ứng trong /api/admin/*; API đó mới
// là nơi thật sự kiểm tra quyền (requireAdmin) và ghi log. Vì vậy dù người
// chơi thường gõ trúng lệnh, server vẫn từ chối nếu họ không phải admin.

export type ParsedCommand =
  | { cmd: 'give_gold'; target: string; amount: number }
  | { cmd: 'give_exp'; target: string; amount: number }
  | { cmd: 'set_level'; target: string; level: number }
  | { cmd: 'teleport'; target: string; mapId: string }
  | { cmd: 'kick'; target: string }
  | { cmd: 'freeze'; target: string }
  | { cmd: 'unfreeze'; target: string }
  | { cmd: 'spawn'; monsterType: string; count: number }
  | { cmd: 'broadcast'; message: string }
  | { cmd: 'ban'; target: string; reason: string }
  | { cmd: 'help' };

export function parseGmCommand(raw: string): ParsedCommand | { error: string } {
  const s = raw.trim();
  if (!s.startsWith('/')) return { error: 'Không phải lệnh (phải bắt đầu bằng /)' };
  const [head, ...rest] = s.slice(1).split(/\s+/);

  switch (head) {
    case 'give': { // /give <tenNV> gold 500   hoặc  /give <tenNV> exp 1000
      const [target, type, amt] = rest;
      const amount = Number(amt);
      if (!target || !amt || Number.isNaN(amount)) return { error: 'Cú pháp: /give <ten> gold|exp <so>' };
      return type === 'exp'
        ? { cmd: 'give_exp', target, amount }
        : { cmd: 'give_gold', target, amount };
    }
    case 'setlevel': {
      const [target, lvl] = rest;
      const level = Number(lvl);
      if (!target || Number.isNaN(level)) return { error: 'Cú pháp: /setlevel <ten> <cap>' };
      return { cmd: 'set_level', target, level };
    }
    case 'tp': { // /tp <tenNV> <mapId>
      const [target, mapId] = rest;
      if (!target || !mapId) return { error: 'Cú pháp: /tp <ten> <mapId>' };
      return { cmd: 'teleport', target, mapId };
    }
    case 'kick': {
      const [target] = rest;
      if (!target) return { error: 'Cú pháp: /kick <ten>' };
      return { cmd: 'kick', target };
    }
    case 'freeze': {
      const [target] = rest;
      if (!target) return { error: 'Cú pháp: /freeze <ten>' };
      return { cmd: 'freeze', target };
    }
    case 'unfreeze': {
      const [target] = rest;
      if (!target) return { error: 'Cú pháp: /unfreeze <ten>' };
      return { cmd: 'unfreeze', target };
    }
    case 'spawn': { // /spawn boss 1
      const [monsterType, cnt] = rest;
      if (!monsterType) return { error: 'Cú pháp: /spawn <loaiQuai> <soLuong?>' };
      return { cmd: 'spawn', monsterType, count: Number(cnt) || 1 };
    }
    case 'broadcast': {
      const message = rest.join(' ');
      if (!message) return { error: 'Cú pháp: /broadcast <noi dung>' };
      return { cmd: 'broadcast', message };
    }
    case 'ban': {
      const [target, ...reasonParts] = rest;
      if (!target) return { error: 'Cú pháp: /ban <ten> <ly do>' };
      return { cmd: 'ban', target, reason: reasonParts.join(' ') || 'Vi phạm nội quy' };
    }
    case 'help':
      return { cmd: 'help' };
    default:
      return { error: `Lệnh không tồn tại: /${head}. Gõ /help để xem danh sách.` };
  }
}

export const GM_HELP_TEXT = `Lệnh admin có sẵn:
/give <ten> gold|exp <so>   - cấp vàng/exp
/setlevel <ten> <cap>       - chỉnh cấp độ
/tp <ten> <mapId>           - dịch chuyển người chơi
/kick <ten>                 - đá khỏi phiên chơi
/freeze /unfreeze <ten>     - đóng băng / bỏ đóng băng
/spawn <loai> <soLuong>     - triệu hồi quái tại map hiện tại
/broadcast <noi dung>       - thông báo toàn server
/ban <ten> <ly do>          - cấm tài khoản`;
