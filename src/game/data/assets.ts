// Asset Manager tạm thời: dùng emoji thay sprite thật. Toàn bộ engine chỉ
// tham chiếu qua các map này, nên sau này thay bằng sprite sheet thật chỉ
// cần sửa file này (đúng yêu cầu "không hard-code asset vào logic").
export const PROP_GLYPH: Record<string, string> = {
  tree: '🌲',
  bamboo: '🎋',
  rock: '🪨',
  building: '🏯'
};

export const NPC_GLYPH: Record<string, string> = {
  elder: '👴',
  blacksmith: '🔨',
  merchant: '💰',
  guard: '🛡️'
};

export const PORTAL_GLYPH = '🌀';
export const PLAYER_GLYPH = '🥷';
