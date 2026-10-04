'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CLASSES } from '@/game/data/classes';

export default function CreateCharacterPage() {
  const [name, setName] = useState('');
  const [classId, setClassId] = useState(CLASSES[0].id);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  // Nếu đã có nhân vật rồi, vào thẳng /play thay vì bắt tạo lại.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.push('/login'); return; }
      const r = await fetch('/api/character');
      const j = await r.json();
      if (j.characters?.length > 0) { router.push('/play'); return; }
      setChecking(false);
    })();
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const r = await fetch('/api/character', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, classId })
    });
    const j = await r.json();
    if (j.error) { setError(j.error); setLoading(false); return; }
    router.push('/play');
  }

  if (checking) return <main style={{ padding: 40, color: '#999' }}>Đang kiểm tra tài khoản...</main>;

  return (
    <main style={{ maxWidth: 520, margin: '40px auto', padding: 20 }}>
      <h1 style={{ color: '#d4a94a' }}>Tạo Nhân Vật</h1>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input placeholder="Tên nhân vật" value={name} onChange={e => setName(e.target.value)}
          style={{ padding: 10, borderRadius: 6, border: '1px solid #444', background: '#1a1a1a', color: '#fff' }} required />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {CLASSES.map(c => (
            <button type="button" key={c.id} onClick={() => setClassId(c.id)}
              style={{
                textAlign: 'left', padding: 12, borderRadius: 8, cursor: 'pointer',
                border: classId === c.id ? '2px solid #d4a94a' : '1px solid #444',
                background: classId === c.id ? 'rgba(212,169,74,.15)' : '#1a1a1a', color: '#fff'
              }}>
              <div style={{ fontSize: 20 }}>{c.weaponGlyph} <b>{c.name}</b></div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>{c.description}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                STR {c.baseStr} · DEX {c.baseDex} · INT {c.baseInt} · CON {c.baseCon}
              </div>
            </button>
          ))}
        </div>

        {error && <div style={{ color: '#f66', fontSize: 13 }}>{error}</div>}
        <button disabled={loading} style={{ padding: 12, borderRadius: 6, border: 'none', background: '#d4a94a', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>
          {loading ? 'Đang tạo...' : 'Bắt đầu hành trình'}
        </button>
      </form>
    </main>
  );
}
