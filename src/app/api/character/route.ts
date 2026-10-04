// GET  /api/character         -> danh sách nhân vật của TÀI KHOẢN ĐANG ĐĂNG NHẬP
// POST /api/character { name, classId } -> tạo nhân vật mới
//
// Khác với /api/admin/*, route này dùng server client theo cookie phiên
// đăng nhập (không phải service role), nên bị RLS giới hạn đúng theo
// supabase/schema.sql: chỉ đọc/ghi được nhân vật có profile_id = chính mình.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CLASSES } from '@/game/data/classes';

const MAX_CHARACTERS_PER_ACCOUNT = 3;

export async function GET() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('profile_id', auth.user.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ characters: data });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const { name, classId } = await req.json();
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return NextResponse.json({ error: 'Tên nhân vật phải có ít nhất 2 ký tự' }, { status: 400 });
  }
  if (!CLASSES.some(c => c.id === classId)) {
    return NextResponse.json({ error: 'Môn phái không hợp lệ' }, { status: 400 });
  }

  // Tạo nhân vật qua RPC (không còn INSERT trực tiếp từ client — xem
  // migration 013): server tự đặt chỉ số gốc theo môn phái, client không
  // thể tự truyền gold/level/stats tuỳ ý.
  const { data, error } = await supabase.rpc('create_character', { p_name: name.trim(), p_class_id: classId });
  if (error) {
    const msg = error.message?.includes('đã có người dùng') ? 'Tên nhân vật đã có người dùng' : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { data: char } = await supabase.from('characters').select('*').eq('id', (data as any).character_id).single();
  return NextResponse.json({ character: char });
}
