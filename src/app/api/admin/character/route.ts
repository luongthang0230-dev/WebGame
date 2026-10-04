// PATCH /api/admin/character
// Body: { characterId: string, changes: Partial<CharacterEditableFields> }
// Cho phép admin sửa TRỰC TIẾP mọi chỉ số của một nhân vật: gold, exp,
// level, hp/mp, map_id + pos (teleport), is_frozen, is_invisible, v.v.
// Đây chính là "toàn quyền can thiệp" mà admin panel gọi tới.
import { NextResponse } from 'next/server';
import { requireAdmin, adminClient, logAdminAction } from '@/lib/supabase/admin';

const EDITABLE_FIELDS = new Set([
  'level', 'exp', 'gold', 'hp', 'hp_max', 'mp', 'mp_max',
  'str', 'dex', 'int_', 'con',
  'map_id', 'pos_x', 'pos_y',
  'is_frozen', 'is_invisible', 'is_banned_char'
]);

export async function PATCH(req: Request) {
  const actor = await requireAdmin('moderator');
  if (!actor) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

  const body = await req.json();
  const { characterId, changes } = body as { characterId: string; changes: Record<string, unknown> };
  if (!characterId || !changes) {
    return NextResponse.json({ error: 'Thiếu characterId hoặc changes' }, { status: 400 });
  }

  // Lọc field: chỉ cho sửa những gì nằm trong whitelist -> tránh admin panel bug
  // ghi đè nhầm cột nhạy cảm (vd profile_id, id).
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (EDITABLE_FIELDS.has(k)) safe[k] = v;
  }
  if (Object.keys(safe).length === 0) {
    return NextResponse.json({ error: 'Không có field hợp lệ để sửa' }, { status: 400 });
  }
  safe.updated_at = new Date().toISOString();

  const db = adminClient();
  const { data, error } = await db
    .from('characters')
    .update(safe)
    .eq('id', characterId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(actor, 'edit_character', safe, characterId);
  return NextResponse.json({ character: data });
}

// GET /api/admin/character?name=... hoặc ?id=... — tra cứu nhân vật để sửa
export async function GET(req: Request) {
  const actor = await requireAdmin('moderator');
  if (!actor) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');
  const id = searchParams.get('id');

  const db = adminClient();
  let query = db.from('characters').select('*, profiles!inner(username, role, is_banned)');
  if (id) query = query.eq('id', id);
  else if (name) query = query.ilike('name', `%${name}%`);
  else return NextResponse.json({ error: 'Cần name hoặc id' }, { status: 400 });

  const { data, error } = await query.limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ characters: data });
}
