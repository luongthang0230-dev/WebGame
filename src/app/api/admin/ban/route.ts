// POST /api/admin/ban  { profileId, reason, expiresAt?  }  -> cấm
// DELETE /api/admin/ban { profileId }                       -> gỡ cấm
// Chỉ 'admin' trở lên mới được ban (moderator không đủ quyền).
import { NextResponse } from 'next/server';
import { requireAdmin, adminClient, logAdminAction } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const actor = await requireAdmin('admin');
  if (!actor) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

  const { profileId, reason, expiresAt } = await req.json();
  if (!profileId) return NextResponse.json({ error: 'Thiếu profileId' }, { status: 400 });

  const db = adminClient();
  await db.from('profiles').update({ is_banned: true, ban_reason: reason ?? null }).eq('id', profileId);
  await db.from('bans').insert({
    profile_id: profileId,
    banned_by: actor.id,
    reason: reason ?? null,
    expires_at: expiresAt ?? null
  });

  await logAdminAction(actor, 'ban_account', { reason, expiresAt }, undefined);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const actor = await requireAdmin('admin');
  if (!actor) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

  const { profileId } = await req.json();
  if (!profileId) return NextResponse.json({ error: 'Thiếu profileId' }, { status: 400 });

  const db = adminClient();
  await db.from('profiles').update({ is_banned: false, ban_reason: null }).eq('id', profileId);
  await db.from('bans')
    .update({ revoked_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .is('revoked_at', null);

  await logAdminAction(actor, 'unban_account', {}, undefined);
  return NextResponse.json({ ok: true });
}
