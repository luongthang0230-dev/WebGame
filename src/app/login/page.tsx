'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();

    if (mode === 'signup') {
      if (username.trim().length < 3) { setError('Tên tài khoản tối thiểu 3 ký tự'); setLoading(false); return; }
      const { data, error: signErr } = await supabase.auth.signUp({ email, password });
      if (signErr || !data.user) { setError(signErr?.message ?? 'Đăng ký thất bại'); setLoading(false); return; }
      // Tạo hồ sơ profiles tương ứng (role mặc định 'player' theo schema).
      const { error: profErr } = await supabase.from('profiles').insert({ id: data.user.id, username: username.trim() });
      if (profErr) { setError('Tạo hồ sơ thất bại: ' + profErr.message); setLoading(false); return; }
    } else {
      const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
      if (loginErr) { setError(loginErr.message); setLoading(false); return; }
    }

    router.push('/character/create');
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 380, margin: '60px auto', padding: 20 }}>
      <h1 style={{ color: '#d4a94a' }}>Kiếm Hiệp Online</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setMode('login')} style={tabStyle(mode === 'login')}>Đăng nhập</button>
        <button onClick={() => setMode('signup')} style={tabStyle(mode === 'signup')}>Đăng ký</button>
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mode === 'signup' && (
          <input placeholder="Tên tài khoản" value={username} onChange={e => setUsername(e.target.value)} style={inputStyle} />
        )}
        <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} required />
        <input placeholder="Mật khẩu" type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} required minLength={6} />
        {error && <div style={{ color: '#f66', fontSize: 13 }}>{error}</div>}
        <button disabled={loading} style={submitStyle}>{loading ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = { padding: 10, borderRadius: 6, border: '1px solid #444', background: '#1a1a1a', color: '#fff' };
const submitStyle: React.CSSProperties = { padding: 10, borderRadius: 6, border: 'none', background: '#d4a94a', color: '#000', fontWeight: 'bold', cursor: 'pointer' };
function tabStyle(active: boolean): React.CSSProperties {
  return { flex: 1, padding: 8, borderRadius: 6, border: '1px solid #444', background: active ? '#d4a94a' : 'transparent', color: active ? '#000' : '#fff', cursor: 'pointer' };
}
