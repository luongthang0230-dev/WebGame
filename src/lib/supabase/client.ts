// Dùng trong Client Components (trình duyệt). Chỉ có quyền anon,
// bị giới hạn bởi RLS trong supabase/schema.sql.
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
