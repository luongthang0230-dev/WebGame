// LỚP LÕI CỦA QUYỀN ADMIN.
// - adminClient dùng SERVICE ROLE KEY: bỏ qua RLS, có thể sửa MỌI bảng.
// - Không bao giờ import file này trong Client Component (nó sẽ crash vì
//   thiếu SUPABASE_SERVICE_ROLE_KEY ở trình duyệt — đó là chủ đích).
// - requireAdmin() là chốt chặn DUY NHẤT: mọi API route admin phải gọi
//   hàm này trước, nếu không sẽ có lỗ hổng leo thang quyền.
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from './server';

export function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type AdminRole = 'moderator' | 'admin' | 'owner';

/**
 * Xác định người gọi API hiện tại có phải admin/mod không.
 * Trả về profile nếu hợp lệ, hoặc null nếu không.
 * minRole cho phép phân cấp: owner > admin > moderator.
 */
export async function requireAdmin(minRole: AdminRole = 'moderator') {
  const userClient = createServerClient();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return null;

  const admin = adminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, username, role, is_banned')
    .eq('id', auth.user.id)
    .single();

  if (!profile || profile.is_banned) return null;

  const rank: Record<string, number> = { player: 0, moderator: 1, admin: 2, owner: 3 };
  if (rank[profile.role] < rank[minRole]) return null;

  return profile;
}

/** Ghi log mọi hành động admin — bắt buộc gọi sau mỗi thao tác thành công. */
export async function logAdminAction(
  actor: { id: string; username: string },
  action: string,
  payload: Record<string, unknown>,
  targetCharacterId?: string
) {
  const admin = adminClient();
  await admin.from('admin_logs').insert({
    actor_id: actor.id,
    actor_name: actor.username,
    action,
    target_character_id: targetCharacterId ?? null,
    payload
  });
}
