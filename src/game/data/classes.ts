// 5 môn phái khởi điểm (mở rộng lên 8 ở phase sau). Mỗi class có chỉ số
// gốc + vũ khí đại diện; skill riêng từng class sẽ vào ở Phase 4.
export interface ClassDef {
  id: string;
  name: string;
  description: string;
  weaponGlyph: string;
  baseStr: number;
  baseDex: number;
  baseInt: number;
  baseCon: number;
}

export const CLASSES: ClassDef[] = [
  { id: 'kiem', name: 'Kiếm Khách', description: 'Cận chiến cân bằng, sát thương ổn định.', weaponGlyph: '⚔️', baseStr: 7, baseDex: 6, baseInt: 4, baseCon: 6 },
  { id: 'dao', name: 'Đao Phủ', description: 'Sát thương cận chiến cực cao, phòng thủ thấp.', weaponGlyph: '🔪', baseStr: 9, baseDex: 5, baseInt: 3, baseCon: 5 },
  { id: 'cung', name: 'Xạ Thủ', description: 'Tấn công tầm xa, né tránh tốt.', weaponGlyph: '🏹', baseStr: 4, baseDex: 9, baseInt: 4, baseCon: 5 },
  { id: 'phap', name: 'Pháp Sư', description: 'Phép thuật quần công, MP cao, máu mỏng.', weaponGlyph: '📜', baseStr: 3, baseDex: 4, baseInt: 10, baseCon: 4 },
  { id: 'quyen', name: 'Quyền Sư', description: 'Đánh tay không tốc độ cao, hồi phục tốt.', weaponGlyph: '👊', baseStr: 6, baseDex: 7, baseInt: 4, baseCon: 7 }
];

export function getClass(id: string): ClassDef {
  return CLASSES.find(c => c.id === id) ?? CLASSES[0];
}
