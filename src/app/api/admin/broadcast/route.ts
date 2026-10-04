// POST /api/admin/broadcast { message, level } -> gửi thông báo toàn server.
// Client lắng nghe bảng `announcements` qua Supabase Realtime để hiện popup.
import { NextResponse } from 'next/server';
import { requireAdmin, adminClient, logAdminAction } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const actor = await requireAdmin('moderator');
  if (!actor) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

  const { message, level } = await req.json();
  if (!message) return NextResponse.json({ error: 'Thiếu message' }, { status: 400 });

  const db = adminClient();
  const { data, error } = await db
    .from('announcements')
    .insert({ sender_id: actor.id, message, level: level ?? 'info' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(actor, 'broadcast', { message, level });
  return NextResponse.json({ announcement: data });
}
