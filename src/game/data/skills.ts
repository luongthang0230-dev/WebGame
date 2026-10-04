// Mỗi class có 4 skill theo đúng yêu cầu "skill đánh thường / đơn mục tiêu /
// quần công / buff-debuff". Skill tree đầy đủ (nhánh, điểm kỹ năng riêng)
// sẽ mở rộng ở phase sau; Phase 4 làm đúng phần lõi: sát thương, mana, hồi chiêu.
export type SkillKind = 'basic' | 'single' | 'aoe' | 'support';

export interface SkillDef {
  id: string;
  name: string;
  kind: SkillKind;
  levelReq: number;
  mpCost: number;
  cooldownMs: number;
  range: number;       // px
  aoeRadius?: number;  // chỉ dùng cho kind 'aoe'
  dmgMultiplier: number; // hệ số nhân vào ATK
  healPercent?: number;  // chỉ dùng cho support hồi máu
}

export const SKILLS_BY_CLASS: Record<string, SkillDef[]> = {
  kiem: [
    { id: 'kiem_basic', name: 'Kiếm Chém', kind: 'basic', levelReq: 1, mpCost: 0, cooldownMs: 500, range: 70, dmgMultiplier: 1.0 },
    { id: 'kiem_single', name: 'Phá Kiếm', kind: 'single', levelReq: 4, mpCost: 12, cooldownMs: 2500, range: 80, dmgMultiplier: 2.1 },
    { id: 'kiem_aoe', name: 'Kiếm Vũ', kind: 'aoe', levelReq: 10, mpCost: 20, cooldownMs: 6000, range: 0, aoeRadius: 95, dmgMultiplier: 1.5 },
    { id: 'kiem_support', name: 'Vận Khí', kind: 'support', levelReq: 15, mpCost: 25, cooldownMs: 15000, range: 0, dmgMultiplier: 0, healPercent: 0.35 }
  ],
  dao: [
    { id: 'dao_basic', name: 'Đao Chém', kind: 'basic', levelReq: 1, mpCost: 0, cooldownMs: 550, range: 65, dmgMultiplier: 1.15 },
    { id: 'dao_single', name: 'Cuồng Đao', kind: 'single', levelReq: 4, mpCost: 14, cooldownMs: 2800, range: 75, dmgMultiplier: 2.5 },
    { id: 'dao_aoe', name: 'Toàn Phong Trảm', kind: 'aoe', levelReq: 10, mpCost: 24, cooldownMs: 6500, range: 0, aoeRadius: 90, dmgMultiplier: 1.7 },
    { id: 'dao_support', name: 'Huyết Chiến', kind: 'support', levelReq: 15, mpCost: 20, cooldownMs: 14000, range: 0, dmgMultiplier: 0, healPercent: 0.25 }
  ],
  cung: [
    { id: 'cung_basic', name: 'Bắn Tên', kind: 'basic', levelReq: 1, mpCost: 0, cooldownMs: 450, range: 260, dmgMultiplier: 0.95 },
    { id: 'cung_single', name: 'Xuyên Tâm', kind: 'single', levelReq: 4, mpCost: 10, cooldownMs: 2200, range: 320, dmgMultiplier: 2.0 },
    { id: 'cung_aoe', name: 'Mưa Tên', kind: 'aoe', levelReq: 10, mpCost: 22, cooldownMs: 6000, range: 0, aoeRadius: 110, dmgMultiplier: 1.4 },
    { id: 'cung_support', name: 'Khinh Thân', kind: 'support', levelReq: 15, mpCost: 15, cooldownMs: 12000, range: 0, dmgMultiplier: 0, healPercent: 0.15 }
  ],
  phap: [
    { id: 'phap_basic', name: 'Hỏa Cầu', kind: 'basic', levelReq: 1, mpCost: 4, cooldownMs: 600, range: 240, dmgMultiplier: 1.1 },
    { id: 'phap_single', name: 'Lôi Kiếp', kind: 'single', levelReq: 4, mpCost: 16, cooldownMs: 2600, range: 300, dmgMultiplier: 2.4 },
    { id: 'phap_aoe', name: 'Băng Phong Trận', kind: 'aoe', levelReq: 10, mpCost: 28, cooldownMs: 6000, range: 0, aoeRadius: 100, dmgMultiplier: 1.8 },
    { id: 'phap_support', name: 'Hồi Xuân Thuật', kind: 'support', levelReq: 15, mpCost: 30, cooldownMs: 13000, range: 0, dmgMultiplier: 0, healPercent: 0.45 }
  ],
  quyen: [
    { id: 'quyen_basic', name: 'Song Quyền', kind: 'basic', levelReq: 1, mpCost: 0, cooldownMs: 400, range: 60, dmgMultiplier: 0.9 },
    { id: 'quyen_single', name: 'Cuồng Long Cước', kind: 'single', levelReq: 4, mpCost: 11, cooldownMs: 2000, range: 70, dmgMultiplier: 1.9 },
    { id: 'quyen_aoe', name: 'Toàn Lực Nhất Kích', kind: 'aoe', levelReq: 10, mpCost: 18, cooldownMs: 5500, range: 0, aoeRadius: 85, dmgMultiplier: 1.4 },
    { id: 'quyen_support', name: 'Điều Tức', kind: 'support', levelReq: 15, mpCost: 20, cooldownMs: 11000, range: 0, dmgMultiplier: 0, healPercent: 0.3 }
  ]
};

export function getSkills(classId: string): SkillDef[] {
  return SKILLS_BY_CLASS[classId] ?? SKILLS_BY_CLASS.kiem;
}

/** EXP cần để lên level tiếp theo — dùng chung cả client (hiển thị) và SQL function (phải khớp công thức). */
export function expNeeded(level: number): number {
  return 50 * level * level + 50;
}

export function maxHpFor(level: number, con: number): number {
  return 100 + level * 20 + con * 6;
}
export function maxMpFor(level: number, int_: number): number {
  return 50 + level * 8 + int_ * 5;
}
export function attackPowerFor(level: number, mainStat: number): number {
  return 8 + level * 3 + Math.round(mainStat * 1.5);
}
