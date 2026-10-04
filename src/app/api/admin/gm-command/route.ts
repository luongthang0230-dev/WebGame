// POST /api/admin/gm-command
// Body: { targetCharacterId, command, payload }
// command: 'teleport' | 'kick' | 'freeze' | 'unfreeze' | 'effect' | 'message'
//
// Đây là kênh admin can thiệp TỨC THỜI vào một người chơi đang online,
// khác với /api/admin/character (sửa dữ liệu lưu trữ). Client của
// người chơi mục tiêu subscribe bảng gm_commands qua Supabase Realtime
// (xem README) và áp dụng ngay khi có dòng mới khớp target_character_id.
import { NextResponse } from 'next/server';
import { requireAdmin, adminClient, logAdminAction } from '@/lib/supabase/admin';

const ALLOWED = new Set(['teleport', 'kick', 'freeze', 'unfreeze', 'effect', 'message']);

export async function POST(req: Request) {
  const actor = await requireAdmin('moderator');
  if (!actor) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

  const { targetCharacterId, command, payload } = await req.json();
  if (!targetCharacterId || !ALLOWED.has(command)) {
    return NextResponse.json({ error: 'command không hợp lệ' }, { status: 400 });
  }

  const db = adminClient();

  // Với freeze/teleport, đồng thời cập nhật luôn bảng characters để bền vững
  // qua reload, không chỉ là hiệu ứng tạm thời.
  if (command === 'freeze') await db.from('characters').update({ is_frozen: true }).eq('id', targetCharacterId);
  if (command === 'unfreeze') await db.from('characters').update({ is_frozen: false }).eq('id', targetCharacterId);
  if (command === 'teleport' && payload?.mapId) {
    await db.from('characters').update({
      map_id: payload.mapId, pos_x: payload.x ?? 640, pos_y: payload.y ?? 448
    }).eq('id', targetCharacterId);
  }

  const { data, error } = await db
    .from('gm_commands')
    .insert({ issued_by: actor.id, target_character_id: targetCharacterId, command, payload: payload ?? {} })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(actor, `gm_command:${command}`, payload ?? {}, targetCharacterId);
  return NextResponse.json({ command: data });
}
