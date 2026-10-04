'use client';
import { useState } from 'react';
import { parseGmCommand, GM_HELP_TEXT } from '@/lib/game/adminCommands';

// Lưu ý: trang này giả định người dùng đã đăng nhập (Phase auth sẽ thêm
// trang /login). Nếu chưa đăng nhập hoặc role không đủ, mọi API bên dưới
// sẽ trả 403 vì requireAdmin() kiểm tra ở server, không tin tưởng client.

type Char = { id: string; name: string; level: number; gold: number; exp: number; map_id: string; is_frozen: boolean; profiles?: { username: string; role: string; is_banned: boolean; }};

export default function AdminPanel() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Char[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [console_, setConsole] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');

  const push = (m: string) => setLog(l => [m, ...l].slice(0, 30));

  async function doSearch() {
    const r = await fetch(`/api/admin/character?name=${encodeURIComponent(search)}`);
    const j = await r.json();
    if (j.error) return push('Lỗi: ' + j.error);
    setResults(j.characters ?? []);
  }

  async function edit(id: string, changes: Record<string, unknown>) {
    const r = await fetch('/api/admin/character', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: id, changes })
    });
    const j = await r.json();
    push(j.error ? 'Lỗi: ' + j.error : `Đã sửa nhân vật: ${JSON.stringify(changes)}`);
    if (!j.error) doSearch();
  }

  async function ban(profileId: string) {
    const reason = prompt('Lý do cấm:') ?? 'Vi phạm nội quy';
    const r = await fetch('/api/admin/ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, reason })
    });
    const j = await r.json();
    push(j.error ? 'Lỗi: ' + j.error : 'Đã cấm tài khoản.');
  }

  async function broadcast() {
    if (!broadcastMsg) return;
    const r = await fetch('/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: broadcastMsg, level: 'event' })
    });
    const j = await r.json();
    push(j.error ? 'Lỗi: ' + j.error : 'Đã gửi thông báo toàn server.');
    setBroadcastMsg('');
  }

  async function runConsole() {
    const parsed = parseGmCommand(console_);
    if ('error' in parsed) { push('Lỗi cú pháp: ' + parsed.error); return; }
    if (parsed.cmd === 'help') { push(GM_HELP_TEXT); return; }
    // Demo: map lệnh console sang API tương ứng dựa trên tên nhân vật (target).
    // Cần tra id nhân vật trước vì API dùng characterId, không dùng tên trực tiếp.
    if ('target' in parsed) {
      const r = await fetch(`/api/admin/character?name=${encodeURIComponent(parsed.target)}`);
      const j = await r.json();
      const ch = j.characters?.[0];
      if (!ch) { push('Không tìm thấy nhân vật: ' + parsed.target); return; }
      if (parsed.cmd === 'give_gold') await edit(ch.id, { gold: ch.gold + parsed.amount });
      else if (parsed.cmd === 'give_exp') await edit(ch.id, { exp: ch.exp + parsed.amount });
      else if (parsed.cmd === 'set_level') await edit(ch.id, { level: parsed.level });
      else if (parsed.cmd === 'freeze') await edit(ch.id, { is_frozen: true });
      else if (parsed.cmd === 'unfreeze') await edit(ch.id, { is_frozen: false });
      else if (parsed.cmd === 'teleport') await edit(ch.id, { map_id: parsed.mapId });
      else if (parsed.cmd === 'ban') await ban(ch.profiles?.username ? ch.id : ch.id);
      else push(`Lệnh "${parsed.cmd}" cần API gm-command realtime (đã có sẵn ở /api/admin/gm-command).`);
    } else if (parsed.cmd === 'broadcast') {
      setBroadcastMsg(parsed.message); await broadcast();
    } else {
      push(`Lệnh "${parsed.cmd}" chưa nối UI, dùng API /api/admin/${parsed.cmd} trực tiếp.`);
    }
    setConsole('');
  }

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ color: '#d4a94a' }}>⚙ Admin Panel</h1>

      <section style={{ marginBottom: 24 }}>
        <h3>Tra cứu / chỉnh nhân vật</h3>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên nhân vật"
          style={{ padding: 6, marginRight: 6 }} />
        <button onClick={doSearch}>Tìm</button>
        {results.map(c => (
          <div key={c.id} style={{ border: '1px solid #444', borderRadius: 6, padding: 10, marginTop: 8 }}>
            <b>{c.name}</b> — Lv{c.level} — {c.gold} vàng — map: {c.map_id}
            {c.is_frozen && <span style={{ color: '#f66' }}> [ĐÓNG BĂNG]</span>}
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => edit(c.id, { gold: c.gold + 500 })}>+500 vàng</button>
              <button onClick={() => edit(c.id, { exp: c.exp + 1000 })}>+1000 exp</button>
              <button onClick={() => edit(c.id, { level: c.level + 1 })}>+1 cấp</button>
              <button onClick={() => edit(c.id, { is_frozen: !c.is_frozen })}>{c.is_frozen ? 'Bỏ đóng băng' : 'Đóng băng'}</button>
              <button onClick={() => edit(c.id, { map_id: 'village', pos_x: 640, pos_y: 448 })}>TP về thôn</button>
              <button style={{ color: '#f66' }} onClick={() => ban(c.id)}>Cấm tài khoản</button>
            </div>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>Thông báo toàn server</h3>
        <input value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
          placeholder="Nội dung thông báo" style={{ padding: 6, width: 400, marginRight: 6 }} />
        <button onClick={broadcast}>Gửi</button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3>GM Console</h3>
        <input value={console_} onChange={e => setConsole(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runConsole()}
          placeholder="/give TenNV gold 500" style={{ padding: 6, width: 400, marginRight: 6 }} />
        <button onClick={runConsole}>Chạy</button>
        <pre style={{ fontSize: 12, color: '#999', whiteSpace: 'pre-wrap' }}>{GM_HELP_TEXT}</pre>
      </section>

      <section>
        <h3>Nhật ký</h3>
        {log.map((l, i) => <div key={i} style={{ fontSize: 13, color: '#ccc' }}>{l}</div>)}
      </section>
    </main>
  );
}
