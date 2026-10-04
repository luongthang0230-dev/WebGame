'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { inputBridge, PlayerRuntime, CooldownState } from '@/game/InputBridge';
import { getClass } from '@/game/data/classes';
import { getSkills } from '@/game/data/skills';
import type { PhaserGameHandle } from '@/game/PhaserGame';

const PhaserGame = dynamic(() => import('@/game/PhaserGame'), { ssr: false });

interface CharRow {
  id: string; name: string; class: string; level: number;
  hp: number; hp_max: number; mp: number; mp_max: number;
  str: number; dex: number; int_: number; con: number;
}
interface InvRow { equipped_slot: string | null; rolled_atk: number; rolled_def: number; }

export default function DuelArenaPage() {
  const router = useRouter();
  const params = useParams();
  const duelId = params.duelId as string;
  const supabase = createClient();
  const phaserRef = useRef<PhaserGameHandle>(null);

  const [char, setChar] = useState<CharRow | null>(null);
  const [equip, setEquip] = useState({ atk: 0, def: 0 });
  const [skillRanks, setSkillRanks] = useState<Record<string, number>>({});
  const [opponent, setOpponent] = useState<{ id: string; name: string; classId: string } | null>(null);
  const [sideA, setSideA] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [runtime, setRuntime] = useState<PlayerRuntime | null>(null);
  const [cooldowns, setCooldowns] = useState<CooldownState | null>(null);
  const [result, setResult] = useState<'win' | 'lose' | null>(null);

  const joyRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.push('/login'); return; }
      const r = await fetch('/api/character');
      const j = await r.json();
      if (!j.characters?.length) { router.push('/character/create'); return; }
      const c = j.characters[0] as CharRow;
      setChar(c);

      const { data: inv } = await supabase.from('inventory').select('equipped_slot,rolled_atk,rolled_def').eq('character_id', c.id);
      let atk = 0, def = 0;
      for (const row of (inv ?? []) as InvRow[]) if (row.equipped_slot) { atk += row.rolled_atk; def += row.rolled_def; }
      setEquip({ atk, def });

      const { data: ranks } = await supabase.from('character_skill_ranks').select('skill_id,rank').eq('character_id', c.id);
      const rmap: Record<string, number> = {};
      for (const row of ranks ?? []) rmap[row.skill_id] = row.rank;
      setSkillRanks(rmap);

      const { data: duel, error: duelErr } = await supabase.from('pvp_duels').select('*').eq('id', duelId).single();
      if (duelErr || !duel) { setLoadErr('Không tìm thấy trận đấu'); return; }
      if (duel.status !== 'accepted') { setLoadErr('Trận đấu chưa sẵn sàng (chưa được chấp nhận hoặc đã kết thúc)'); return; }
      if (duel.challenger_id !== c.id && duel.opponent_id !== c.id) { setLoadErr('Bạn không thuộc trận đấu này'); return; }

      const amChallenger = duel.challenger_id === c.id;
      setSideA(amChallenger);
      const oppId = amChallenger ? duel.opponent_id : duel.challenger_id;
      const { data: oppChar } = await supabase.from('characters').select('id,name,class').eq('id', oppId).single();
      if (!oppChar) { setLoadErr('Không tìm thấy đối thủ'); return; }
      setOpponent({ id: oppChar.id, name: oppChar.name, classId: oppChar.class });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId]);

  async function handleDuelEnd(won: boolean) {
    setResult(won ? 'win' : 'lose');
    if (!char || !opponent) return;
    await supabase.rpc('report_duel_result', {
      p_duel_id: duelId, p_character_id: char.id,
      p_winner_id: won ? char.id : opponent.id
    });
  }

  function onJoyMove(e: React.PointerEvent) {
    const el = joyRef.current, knob = knobRef.current;
    if (!el || !knob) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    const max = r.width / 2 - 20;
    const len = Math.min(1, Math.hypot(x, y) / max);
    const ang = Math.atan2(y, x);
    const vx = Math.cos(ang) * len, vy = Math.sin(ang) * len;
    inputBridge.setVector(vx, vy);
    knob.style.transform = `translate(${vx * max}px, ${vy * max}px)`;
  }
  function onJoyDown(e: React.PointerEvent) { dragId.current = e.pointerId; (e.target as Element).setPointerCapture(e.pointerId); onJoyMove(e); }
  function onJoyUp() { dragId.current = null; inputBridge.setVector(0, 0); if (knobRef.current) knobRef.current.style.transform = 'translate(0px,0px)'; }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ') inputBridge.requestCast(0);
      else if (e.key >= '1' && e.key <= '4') inputBridge.requestCast(Number(e.key) - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loadErr) return (
    <main style={{ padding: 40, color: '#f66' }}>
      {loadErr}<br /><a href="/pvp" style={{ color: '#d4a94a' }}>← Quay lại Đấu Trường</a>
    </main>
  );
  if (!char || !opponent) return <main style={{ padding: 40, color: '#999' }}>Đang vào đấu trường...</main>;

  const cls = getClass(char.class);
  const skills = getSkills(char.class);
  const hp = runtime?.hp ?? char.hp;
  const mp = runtime?.mp ?? char.mp;
  const skillOrder = [3, 2, 1, 0].filter(i => skills[i]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', touchAction: 'none', fontFamily: 'sans-serif' }}>
      <PhaserGame
        ref={phaserRef}
        character={{
          id: char.id, name: char.name, classId: char.class, level: char.level,
          hp: char.hp_max, mp: char.mp_max, hpMax: char.hp_max, mpMax: char.mp_max, // vào đấu trường luôn đầy máu, công bằng
          str: char.str, dex: char.dex, intStat: char.int_, con: char.con,
          mapId: 'pvp_arena', posX: 0, posY: 0,
          equippedAtk: equip.atk, equippedDef: equip.def, skillRanks,
          duel: { duelId, channelId: duelId, opponentName: opponent.name, opponentClassId: opponent.classId, sideA }
        }}
        onRuntimeUpdate={setRuntime}
        onCooldownUpdate={setCooldowns}
        onDuelEnd={handleDuelEnd}
      />

      <div style={panelStyle}>
        <b>{cls.weaponGlyph} {char.name}</b> <span style={{ color: '#d4a94a' }}>Lv{char.level}</span>
        <Bar val={hp} max={char.hp_max} color="#d33" />
        <Bar val={mp} max={char.mp_max} color="#3d8bfd" />
      </div>
      <div style={{ ...panelStyle, left: 'auto', right: 8 }}>
        <b>⚔ vs {opponent.name}</b>
      </div>

      {result && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, zIndex: 30 }}>
          <div style={{ fontSize: 36, fontWeight: 'bold', color: result === 'win' ? '#ffdd33' : '#ff5555' }}>
            {result === 'win' ? '🏆 CHIẾN THẮNG!' : 'BẠN ĐÃ THUA'}
          </div>
          <button onClick={() => router.push('/pvp')} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#d4a94a', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>
            Về Đấu Trường
          </button>
        </div>
      )}

      {!result && (
        <>
          <div style={{ position: 'absolute', bottom: 24, right: 24, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {skillOrder.map(i => {
              const s = skills[i];
              const cd = cooldowns?.ratios[i] ?? 0;
              const locked = cooldowns?.locked[i] ?? char.level < s.levelReq;
              const big = i === 0;
              return (
                <button key={s.id} disabled={locked} onClick={() => inputBridge.requestCast(i)}
                  style={{
                    width: big ? 68 : 52, height: big ? 68 : 52, borderRadius: '50%',
                    border: '2px solid #d4a94a', background: big ? 'radial-gradient(circle at 35% 30%, #d33, #7a1414)' : 'linear-gradient(160deg,#3a2a16,#1c130a)',
                    color: '#fff', fontSize: big ? 13 : 10, fontWeight: 'bold', position: 'relative', overflow: 'hidden',
                    opacity: locked ? 0.35 : 1, cursor: locked ? 'default' : 'pointer'
                  }}>
                  {locked ? '🔒' : s.name}
                  {cd > 0 && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${cd * 100}%`, background: 'rgba(0,0,0,.65)' }} />}
                </button>
              );
            })}
          </div>

          <div ref={joyRef} onPointerDown={onJoyDown}
            onPointerMove={e => dragId.current === e.pointerId && onJoyMove(e)}
            onPointerUp={onJoyUp} onPointerCancel={onJoyUp}
            style={{ position: 'absolute', left: 24, bottom: 24, width: 120, height: 120, borderRadius: '50%', border: '2px solid rgba(212,169,74,.6)', background: 'rgba(0,0,0,.3)' }}>
            <div ref={knobRef} style={{ position: 'absolute', left: '50%', top: '50%', width: 44, height: 44, marginLeft: -22, marginTop: -22, borderRadius: '50%', background: 'rgba(212,169,74,.75)', transition: 'transform .05s linear' }} />
          </div>
        </>
      )}
    </div>
  );
}

function Bar({ val, max, color }: { val: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (val / Math.max(1, max)) * 100));
  return (
    <div style={{ height: 7, background: '#000', borderRadius: 3, overflow: 'hidden', marginTop: 3, width: 160 }}>
      <div style={{ width: pct + '%', height: '100%', background: color }} />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute', left: 8, top: 'calc(8px + env(safe-area-inset-top,0px))',
  background: 'linear-gradient(160deg, rgba(48,34,16,.94), rgba(20,14,6,.94))',
  border: '2px solid #d4a94a', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#fff'
};
