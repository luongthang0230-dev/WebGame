'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface CharRow { id: string; name: string; }
interface DuelRow {
  id: string; challenger_id: string; opponent_id: string;
  status: string; winner_id: string | null; created_at: string;
}
interface RankRow { character_id: string; rating: number; wins: number; losses: number; characters?: { name: string } }

export default function PvpPage() {
  const router = useRouter();
  const supabase = createClient();
  const [char, setChar] = useState<CharRow | null>(null);
  const [targetName, setTargetName] = useState('');
  const [msg, setMsg] = useState('');
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [leaderboard, setLeaderboard] = useState<RankRow[]>([]);

  const loadChar = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) { router.push('/login'); return null; }
    const r = await fetch('/api/character');
    const j = await r.json();
    if (!j.characters?.length) { router.push('/character/create'); return null; }
    setChar({ id: j.characters[0].id, name: j.characters[0].name });
    return j.characters[0].id as string;
  }, [router, supabase]);

  const loadDuels = useCallback(async (myId: string) => {
    const { data } = await supabase.from('pvp_duels').select('*')
      .or(`challenger_id.eq.${myId},opponent_id.eq.${myId}`)
      .order('created_at', { ascending: false }).limit(20);
    const rows = (data ?? []) as DuelRow[];
    setDuels(rows);
    const ids = Array.from(new Set(rows.flatMap(d => [d.challenger_id, d.opponent_id])));
    if (ids.length) {
      const { data: chars } = await supabase.from('characters').select('id,name').in('id', ids);
      const map: Record<string, string> = {};
      for (const c of chars ?? []) map[c.id] = c.name;
      setNames(map);
    }
  }, [supabase]);

  const loadLeaderboard = useCallback(async () => {
    const { data } = await supabase.from('pvp_ranks')
      .select('character_id,rating,wins,losses,characters(name)')
      .order('rating', { ascending: false }).limit(20);
    setLeaderboard((data ?? []) as any);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const id = await loadChar();
      if (id) { await loadDuels(id); await loadLeaderboard(); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!char) return;
    const t = setInterval(() => { loadDuels(char.id); loadLeaderboard(); }, 4000);
    return () => clearInterval(t);
  }, [char, loadDuels, loadLeaderboard]);

  async function sendChallenge() {
    if (!char || !targetName.trim()) return;
    const { error } = await supabase.rpc('create_duel_challenge', { p_challenger_id: char.id, p_opponent_name: targetName.trim() });
    if (error) { setMsg(error.message); return; }
    setMsg('Đã gửi lời thách đấu!');
    setTargetName('');
    loadDuels(char.id);
  }

  async function respond(duelId: string, accept: boolean) {
    if (!char) return;
    const { error } = await supabase.rpc('respond_duel', { p_duel_id: duelId, p_character_id: char.id, p_accept: accept });
    if (error) { setMsg(error.message); return; }
    loadDuels(char.id);
  }

  function enterArena(duelId: string) {
    router.push(`/duel/${duelId}`);
  }

  if (!char) return <main style={{ padding: 40, color: '#999' }}>Đang tải...</main>;

  const incoming = duels.filter(d => d.status === 'pending' && d.opponent_id === char.id);
  const outgoing = duels.filter(d => d.status === 'pending' && d.challenger_id === char.id);
  const ready = duels.filter(d => d.status === 'accepted');
  const history = duels.filter(d => d.status === 'completed' || d.status === 'declined');

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 20, color: '#fff', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#d4a94a' }}>⚔ Đấu Trường PK</h1>
      <p style={{ fontSize: 13, opacity: 0.8 }}>{char.name}</p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input value={targetName} onChange={e => setTargetName(e.target.value)} placeholder="Tên nhân vật muốn thách đấu"
          style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#1a1a1a', color: '#fff', flex: 1 }} />
        <button onClick={sendChallenge} style={btnStyle}>Thách đấu</button>
      </div>
      {msg && <div style={{ color: '#ffb020', fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          {ready.length > 0 && (
            <Section title="⚔ Sẵn sàng vào trận">
              {ready.map(d => {
                const other = d.challenger_id === char.id ? d.opponent_id : d.challenger_id;
                return (
                  <Row key={d.id}>
                    <span>vs <b>{names[other]}</b></span>
                    <button onClick={() => enterArena(d.id)} style={{ ...btnStyle, background: '#2a7a2a' }}>Vào trận</button>
                  </Row>
                );
              })}
            </Section>
          )}

          {incoming.length > 0 && (
            <Section title="📩 Lời thách đấu gửi tới">
              {incoming.map(d => (
                <Row key={d.id}>
                  <span><b>{names[d.challenger_id]}</b> thách đấu bạn</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => respond(d.id, true)} style={{ ...btnStyle, background: '#2a7a2a' }}>Nhận</button>
                    <button onClick={() => respond(d.id, false)} style={{ ...btnStyle, background: '#7a2a2a' }}>Từ chối</button>
                  </span>
                </Row>
              ))}
            </Section>
          )}

          {outgoing.length > 0 && (
            <Section title="⏳ Đang chờ phản hồi">
              {outgoing.map(d => <Row key={d.id}><span>Đã thách đấu <b>{names[d.opponent_id]}</b></span></Row>)}
            </Section>
          )}

          {history.length > 0 && (
            <Section title="📜 Lịch sử gần đây">
              {history.slice(0, 8).map(d => {
                const other = d.challenger_id === char.id ? d.opponent_id : d.challenger_id;
                const result = d.status === 'declined' ? 'Bị từ chối' : d.winner_id === char.id ? '🏆 Thắng' : 'Thua';
                return <Row key={d.id}><span>vs {names[other]}</span><span style={{ fontSize: 12, opacity: 0.8 }}>{result}</span></Row>;
              })}
            </Section>
          )}

          {duels.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Chưa có trận đấu nào. Nhập tên đối thủ để bắt đầu!</p>}
        </div>

        <div>
          <Section title="🏆 Bảng Xếp Hạng">
            {leaderboard.map((r, i) => (
              <Row key={r.character_id}>
                <span>#{i + 1} {(r as any).characters?.name ?? '???'}</span>
                <span style={{ fontSize: 12, opacity: 0.8 }}>{r.rating} điểm · {r.wins}W/{r.losses}L</span>
              </Row>
            ))}
            {leaderboard.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Chưa có ai thi đấu.</p>}
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, color: '#d4a94a', marginBottom: 6 }}>{title}</h3>
      {children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #333', fontSize: 13 }}>{children}</div>;
}
const btnStyle: React.CSSProperties = { padding: '7px 12px', borderRadius: 6, border: 'none', background: '#d4a94a', color: '#000', fontWeight: 'bold', cursor: 'pointer', fontSize: 12 };
