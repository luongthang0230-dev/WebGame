'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { inputBridge, PlayerRuntime, CooldownState } from '@/game/InputBridge';
import { MAPS } from '@/game/data/maps';
import { getClass } from '@/game/data/classes';
import { getSkills, expNeeded } from '@/game/data/skills';
import { ITEM_TEMPLATES, EQUIP_SLOTS, QUALITY_COLOR, SLOT_LABEL, ItemSlot } from '@/game/data/items';
import { DUNGEONS } from '@/game/data/dungeons';
import type { RewardUpdate, LootPicked, PhaserGameHandle, DungeonResult } from '@/game/PhaserGame';

const PhaserGame = dynamic(() => import('@/game/PhaserGame'), { ssr: false });

interface CharRow {
  id: string; name: string; class: string; level: number; exp: number;
  hp: number; hp_max: number; mp: number; mp_max: number; gold: number;
  str: number; dex: number; int_: number; con: number; skill_points: number;
  map_id: string; pos_x: number; pos_y: number;
}
interface InvRow {
  id: string; item_template_id: string; quantity: number;
  rolled_atk: number; rolled_def: number; equipped_slot: ItemSlot | null; locked_in_trade: boolean;
}
interface QuestStatus {
  quest_id: string | null; title?: string; description?: string; type?: 'talk' | 'kill';
  giver_npc_id?: string; target_monster_id?: string; target_count?: number; progress?: number;
}

export default function PlayPage() {
  const router = useRouter();
  const supabase = createClient();
  const phaserRef = useRef<PhaserGameHandle>(null);

  const [char, setChar] = useState<CharRow | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [mapKey, setMapKey] = useState('village');
  const [npc, setNpc] = useState<{ id: string; name: string } | null>(null);
  const [runtime, setRuntime] = useState<PlayerRuntime | null>(null);
  const [cooldowns, setCooldowns] = useState<CooldownState | null>(null);
  const [downed, setDowned] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InvRow[]>([]);
  const [skillRanks, setSkillRanks] = useState<Record<string, number>>({});
  const [quest, setQuest] = useState<QuestStatus>({ quest_id: null });
  const [daily, setDaily] = useState<{ progress: number; target_count: number; completed: boolean }>({ progress: 0, target_count: 15, completed: false });
  const [panel, setPanel] = useState<'none' | 'bag' | 'skills' | 'char' | 'dungeon'>('none');
  const [dungeonStatus, setDungeonStatus] = useState<Record<string, { clears_today: number; daily_limit: number }>>({});
  const [autoOn, setAutoOn] = useState(false);

  const joyRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<number | null>(null);

  const equippedTotals = useCallback((rows: InvRow[]) => {
    let atk = 0, def = 0;
    for (const r of rows) if (r.equipped_slot) { atk += r.rolled_atk; def += r.rolled_def; }
    return { atk, def };
  }, []);

  const refreshInventory = useCallback(async (characterId: string) => {
    const { data } = await supabase.from('inventory').select('*').eq('character_id', characterId);
    const rows = (data ?? []) as InvRow[];
    setInventory(rows);
    return equippedTotals(rows);
  }, [equippedTotals, supabase]);

  const refreshSkillRanks = useCallback(async (characterId: string) => {
    const { data } = await supabase.from('character_skill_ranks').select('*').eq('character_id', characterId);
    const map: Record<string, number> = {};
    for (const row of data ?? []) map[row.skill_id] = row.rank;
    setSkillRanks(map);
  }, [supabase]);

  const refreshQuest = useCallback(async (characterId: string) => {
    const { data } = await supabase.rpc('get_quest_status', { p_character_id: characterId });
    setQuest((data as QuestStatus) ?? { quest_id: null });
  }, [supabase]);

  const refreshDungeonStatus = useCallback(async (characterId: string) => {
    const { data } = await supabase.rpc('get_dungeon_status', { p_character_id: characterId });
    const map: Record<string, { clears_today: number; daily_limit: number }> = {};
    for (const row of (data ?? []) as any[]) map[row.dungeon_id] = { clears_today: row.clears_today, daily_limit: row.daily_limit };
    setDungeonStatus(map);
  }, [supabase]);

  const refreshDaily = useCallback(async (characterId: string) => {
    const { data } = await supabase.rpc('get_daily_status', { p_character_id: characterId });
    if (data) setDaily(data as { progress: number; target_count: number; completed: boolean });
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.push('/login'); return; }
      const r = await fetch('/api/character');
      const j = await r.json();
      if (j.error) { setLoadErr(j.error); return; }
      if (!j.characters?.length) { router.push('/character/create'); return; }
      const c = j.characters[0] as CharRow;
      setChar(c);
      await refreshInventory(c.id);
      await refreshSkillRanks(c.id);
      await refreshQuest(c.id);
      await refreshDaily(c.id);
      await refreshDungeonStatus(c.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

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
  function onJoyDown(e: React.PointerEvent) {
    dragId.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);
    onJoyMove(e);
  }
  function onJoyUp() {
    dragId.current = null;
    inputBridge.setVector(0, 0);
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px,0px)';
  }

  function applyCurrencyReward(r: { new_level: number; new_exp: number; new_gold: number; new_hp_max: number; new_mp_max: number; new_skill_points: number; leveled_up: boolean; levels_gained: number }) {
    setChar(c => c ? { ...c, level: r.new_level, exp: r.new_exp, gold: r.new_gold, hp_max: r.new_hp_max, mp_max: r.new_mp_max, skill_points: r.new_skill_points } : c);
    if (r.leveled_up) { setToast(`★ Lên cấp ${r.new_level}! (+${r.levels_gained} điểm kỹ năng)`); setTimeout(() => setToast(null), 2800); }
  }

  function handleReward(r: RewardUpdate) {
    applyCurrencyReward(r);
    if (r.quest_event?.quest_completed) {
      setToast(t => t ?? `✔ Hoàn thành: ${r.quest_event!.quest_completed}`);
      setTimeout(() => setToast(null), 2800);
      if (char) refreshQuest(char.id);
    }
    if (r.daily_event?.daily_completed) {
      setToast(t => t ?? '🌞 Hoàn thành Nhiệm Vụ Ngày! Nhận thưởng.');
      setTimeout(() => setToast(null), 2800);
      if (char) refreshDaily(char.id);
    } else {
      setDaily(d => d.completed ? d : { ...d, progress: Math.min(d.target_count, d.progress + 1) });
    }
  }

  async function handleLootPicked(item: LootPicked) {
    setToast(`🎁 Nhặt được: ${item.icon} ${item.name}`);
    setTimeout(() => setToast(null), 2200);
    if (char) await refreshInventory(char.id);
  }

  function handleDungeonCleared(dg: DungeonResult) {
    if (dg.error === 'chua_du_cap') {
      setToast('Chưa đủ cấp cho phó bản này'); setTimeout(() => setToast(null), 2500); return;
    }
    if (dg.already_cleared_today) {
      setToast(`Đã hết lượt nhận thưởng phó bản "${dg.dungeon_name}" hôm nay`);
      setTimeout(() => setToast(null), 2500);
      return;
    }
    if (dg.reward) applyCurrencyReward({ ...dg.reward } as any);
    setToast(`🏆 Hoàn thành phó bản: ${dg.dungeon_name}! Nhận thưởng.`);
    setTimeout(() => setToast(null), 3000);
    if (char) refreshDungeonStatus(char.id);
  }

  function enterDungeon(d: typeof DUNGEONS[number]) {
    if (!char || char.level < d.levelReq) return;
    const st = dungeonStatus[d.id];
    if (st && st.clears_today >= st.daily_limit) {
      setToast('Đã hết lượt nhận thưởng hôm nay — vẫn có thể vào luyện tập, không nhận thêm thưởng.');
      setTimeout(() => setToast(null), 3000);
    }
    phaserRef.current?.enterDungeon(d.mapKey, d.spawnX, d.spawnY);
    setPanel('none');
  }

  function handlePlayerDown() {
    setDowned(true);
    setTimeout(() => setDowned(false), 2500);
  }

  async function talkToNpc() {
    if (!char || !npc) return;
    const { data, error } = await supabase.rpc('talk_to_npc', { p_character_id: char.id, p_npc_id: npc.id });
    if (error) { setDialogue('(' + error.message + ')'); return; }
    const res = data as { dialogue: string; quest_completed?: string; reward?: any };
    setDialogue(res.dialogue);
    if (res.quest_completed && res.reward) {
      applyCurrencyReward(res.reward);
      setToast(`✔ Hoàn thành: ${res.quest_completed}`);
      setTimeout(() => setToast(null), 2800);
    }
    await refreshQuest(char.id);
  }

  async function equip(invId: string) {
    if (!char) return;
    const { error } = await supabase.rpc('equip_item', { p_character_id: char.id, p_inventory_id: invId });
    if (error) { setToast('Lỗi: ' + error.message); setTimeout(() => setToast(null), 2500); return; }
    const totals = await refreshInventory(char.id);
    phaserRef.current?.applyEquipmentBonus(totals.atk, totals.def);
  }
  async function unequip(invId: string) {
    if (!char) return;
    await supabase.rpc('unequip_item', { p_character_id: char.id, p_inventory_id: invId });
    const totals = await refreshInventory(char.id);
    phaserRef.current?.applyEquipmentBonus(totals.atk, totals.def);
  }
  async function destroyItem(invId: string) {
    if (!char || !confirm('Huỷ vật phẩm này?')) return;
    await supabase.from('inventory').delete().eq('id', invId);
    await refreshInventory(char.id);
  }
  async function allocateSkill(skillId: string) {
    if (!char) return;
    const { data, error } = await supabase.rpc('allocate_skill_point', { p_character_id: char.id, p_skill_id: skillId });
    if (error) { setToast('Lỗi: ' + error.message); setTimeout(() => setToast(null), 2500); return; }
    const res = data as { rank: number; remaining_points: number };
    setSkillRanks(s => ({ ...s, [skillId]: res.rank }));
    setChar(c => c ? { ...c, skill_points: res.remaining_points } : c);
    phaserRef.current?.applySkillRank(skillId, res.rank);
  }

  function toggleAuto() {
    const next = !autoOn;
    setAutoOn(next);
    inputBridge.setAutoMode(next);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ') inputBridge.requestCast(0);
      else if (e.key >= '1' && e.key <= '4') inputBridge.requestCast(Number(e.key) - 1);
      else if (e.key.toLowerCase() === 'e' && npc) talkToNpc();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npc]);

  if (loadErr) return <main style={{ padding: 40, color: '#f66' }}>{loadErr}</main>;
  if (!char) return <main style={{ padding: 40, color: '#999' }}>Đang tải nhân vật...</main>;

  const map = MAPS[mapKey];
  const cls = getClass(char.class);
  const skills = getSkills(char.class);
  const hp = runtime?.hp ?? char.hp;
  const mp = runtime?.mp ?? char.mp;
  const needed = expNeeded(char.level);
  const totals = equippedTotals(inventory);
  const equippedBySlot: Partial<Record<ItemSlot, InvRow>> = {};
  for (const row of inventory) if (row.equipped_slot) equippedBySlot[row.equipped_slot] = row;
  const bagItems = inventory.filter(r => !r.equipped_slot);
  // Thứ tự hiển thị skill bar giống ảnh mẫu: chiêu phụ bên trái, ĐÁNH to màu đỏ ở ngoài cùng bên phải.
  const skillOrder = [3, 2, 1, 0].filter(i => skills[i]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', touchAction: 'none', fontFamily: 'sans-serif' }}>
      <PhaserGame
        ref={phaserRef}
        character={{
          id: char.id, name: char.name, classId: char.class, level: char.level,
          hp: char.hp, mp: char.mp, hpMax: char.hp_max, mpMax: char.mp_max,
          str: char.str, dex: char.dex, intStat: char.int_, con: char.con,
          mapId: char.map_id, posX: char.pos_x, posY: char.pos_y,
          equippedAtk: totals.atk, equippedDef: totals.def, skillRanks
        }}
        onMapChange={setMapKey}
        onNpcNear={(id, name) => setNpc(id && name ? { id, name } : null)}
        onRuntimeUpdate={setRuntime}
        onCooldownUpdate={setCooldowns}
        onReward={handleReward}
        onLootPicked={handleLootPicked}
        onPlayerDown={handlePlayerDown}
        onDungeonCleared={handleDungeonCleared}
      />

      {/* ===== Góc trên trái: khung nhân vật + khung nhiệm vụ ===== */}
      <div style={{ position: 'absolute', left: 8, top: 'calc(8px + env(safe-area-inset-top,0px))', width: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={chromePanel}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={portraitStyle}>{cls.weaponGlyph}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}><b>{char.name}</b> <span style={{ color: '#8fd48f' }}>- {cls.name} Lv{char.level}</span></div>
              <Bar label="HP" val={hp} max={char.hp_max} color="#d33" />
              <Bar label="MP" val={mp} max={char.mp_max} color="#3d8bfd" />
            </div>
          </div>
          <div style={{ fontSize: 11, marginTop: 4, color: '#ffdd66' }}>💰 {char.gold} &nbsp; ⚔{totals.atk} 🛡{totals.def}</div>
        </div>

        {quest.quest_id && (
          <div style={chromePanel}>
            <div style={{ fontSize: 10, color: '#ffdd66', fontWeight: 'bold' }}>NHIỆM VỤ CHÍNH</div>
            <div style={{ fontSize: 13, color: '#7fc7ff', textDecoration: 'underline', margin: '2px 0' }}>{quest.title}</div>
            <div style={{ fontSize: 11, color: '#eee' }}>
              {quest.description}
              {quest.type === 'kill' && <div style={{ marginTop: 2, color: '#ffb020' }}>Tiến độ: {quest.progress}/{quest.target_count}</div>}
            </div>
          </div>
        )}

        <div style={chromePanel}>
          <div style={{ fontSize: 10, color: '#ffdd66', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
            <span>🌞 NHIỆM VỤ NGÀY</span>
            {daily.completed && <span style={{ color: '#4f4' }}>✔ Xong</span>}
          </div>
          <div style={{ fontSize: 11, marginTop: 2 }}>Diệt quái: {daily.progress}/{daily.target_count}</div>
          <Bar label="" val={daily.progress} max={daily.target_count} color={daily.completed ? '#4f4' : '#ffb020'} />
        </div>
      </div>

      {/* ===== Góc trên phải: khung minimap (viền trang trí đè lên camera phụ của Phaser) + nhãn map + cột nút ===== */}
      <div style={{ position: 'absolute', right: 8, top: 'calc(8px + env(safe-area-inset-top,0px))', width: 130 }}>
        <div style={{ height: 91, border: '2px solid #d4a94a', borderRadius: 4, pointerEvents: 'none' }} />
        <div style={{ ...chromePanel, marginTop: 4, textAlign: 'center', padding: '4px 6px' }}>
          <div style={{ fontSize: 12, color: '#d4a94a', fontWeight: 'bold' }}>{map?.name}</div>
          <div style={{ fontSize: 10, opacity: 0.8 }}>Cấp {map?.recommendedLevel}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
          <SideBtn active={panel === 'bag'} onClick={() => setPanel(p => p === 'bag' ? 'none' : 'bag')}>TÚI</SideBtn>
          <SideBtn active={panel === 'char'} onClick={() => setPanel(p => p === 'char' ? 'none' : 'char')}>NHÂN VẬT</SideBtn>
          <SideBtn active={panel === 'skills'} onClick={() => setPanel(p => p === 'skills' ? 'none' : 'skills')}>
            KỸ NĂNG{char.skill_points > 0 && <span style={{ color: '#ff5' }}> ({char.skill_points})</span>}
          </SideBtn>
          <SideBtn active={panel === 'dungeon'} onClick={() => setPanel(p => p === 'dungeon' ? 'none' : 'dungeon')}>PHÓ BẢN</SideBtn>
          <SideBtn active={autoOn} onClick={toggleAuto}>{autoOn ? '⏹ AUTO' : 'AUTO'}</SideBtn>
          <a href="/trade" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <SideBtn active={false} onClick={() => {}}>GIAO DỊCH</SideBtn>
          </a>
          <a href="/pvp" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <SideBtn active={false} onClick={() => {}}>⚔ PK</SideBtn>
          </a>
          <a href="/guild" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <SideBtn active={false} onClick={() => {}}>🏯 BANG HỘI</SideBtn>
          </a>
        </div>
      </div>

      {toast && (
        <div style={{ position: 'absolute', top: '26%', left: '50%', transform: 'translateX(-50%)', ...chromePanel, fontSize: 15, color: '#ffdd33', border: '2px solid #ffdd33', zIndex: 25 }}>
          {toast}
        </div>
      )}
      {downed && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(120,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...chromePanel, fontSize: 18 }}>Bạn đã bại trận... đang hồi sinh tại thôn</div>
        </div>
      )}

      {/* Hội thoại NPC */}
      {npc && !downed && (
        <div style={{ position: 'absolute', bottom: 150, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 20 }}>
          {dialogue && (
            <div style={{ ...chromePanel, maxWidth: 340, whiteSpace: 'normal', fontSize: 13 }}>
              <b style={{ color: '#d4a94a' }}>{npc.name}:</b> {dialogue}
              <div><button onClick={() => setDialogue(null)} style={{ ...tinyBtn, marginTop: 6 }}>Đóng</button></div>
            </div>
          )}
          {!dialogue && (
            <button onClick={talkToNpc} style={{ ...chromePanel, cursor: 'pointer' }}>💬 Nói chuyện với <b>{npc.name}</b> (E)</button>
          )}
        </div>
      )}

      {/* Panel Túi đồ & Trang bị */}
      {panel === 'bag' && (
        <div style={overlayPanelStyle}>
          <h3 style={{ margin: '0 0 10px', color: '#d4a94a' }}>Trang bị & Túi đồ</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 14 }}>
            {EQUIP_SLOTS.map(slot => {
              const row = equippedBySlot[slot];
              const tpl = row ? ITEM_TEMPLATES[row.item_template_id] : null;
              return (
                <div key={slot} onClick={() => row && unequip(row.id)}
                  title={tpl ? `${tpl.name} — bấm để tháo` : SLOT_LABEL[slot]}
                  style={{ ...slotBoxStyle, borderColor: tpl ? QUALITY_COLOR[tpl.quality] : '#444', cursor: row ? 'pointer' : 'default' }}>
                  <div style={{ fontSize: 22 }}>{tpl?.icon ?? '·'}</div>
                  <div style={{ fontSize: 9, opacity: 0.7 }}>{SLOT_LABEL[slot]}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Túi đồ ({bagItems.length}) — bấm để trang bị / chuột phải để huỷ</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {bagItems.map(row => {
              const tpl = ITEM_TEMPLATES[row.item_template_id];
              if (!tpl) return null;
              return (
                <div key={row.id} onClick={() => equip(row.id)}
                  onContextMenu={e => { e.preventDefault(); destroyItem(row.id); }}
                  title={`${tpl.name} — ATK+${row.rolled_atk} DEF+${row.rolled_def}`}
                  style={{ ...slotBoxStyle, borderColor: QUALITY_COLOR[tpl.quality], cursor: row.locked_in_trade ? 'not-allowed' : 'pointer', opacity: row.locked_in_trade ? 0.4 : 1 }}>
                  <div style={{ fontSize: 20 }}>{tpl.icon}</div>
                  {row.quantity > 1 && <div style={{ fontSize: 9 }}>x{row.quantity}</div>}
                </div>
              );
            })}
            {bagItems.length === 0 && <div style={{ fontSize: 11, opacity: 0.5, gridColumn: '1/-1' }}>Chưa có vật phẩm nào. Đi đánh quái để nhặt đồ!</div>}
          </div>
          <button onClick={() => setPanel('none')} style={closeBtnStyle}>Đóng</button>
        </div>
      )}

      {/* Panel Nhân vật */}
      {panel === 'char' && (
        <div style={overlayPanelStyle}>
          <h3 style={{ margin: '0 0 10px', color: '#d4a94a' }}>{char.name} — {cls.name}</h3>
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            Cấp: <b>{char.level}</b><br />
            EXP: {char.exp}/{needed}<br />
            STR {char.str} · DEX {char.dex} · INT {char.int_} · CON {char.con}<br />
            Tấn công: <b>{totals.atk}</b> (trang bị) · Phòng thủ: <b>{totals.def}</b> (trang bị)<br />
            HP tối đa: {char.hp_max} · MP tối đa: {char.mp_max}<br />
            💰 {char.gold} vàng
          </div>
          <button onClick={() => setPanel('none')} style={closeBtnStyle}>Đóng</button>
        </div>
      )}

      {/* Panel Kỹ năng */}
      {panel === 'skills' && (
        <div style={overlayPanelStyle}>
          <h3 style={{ margin: '0 0 4px', color: '#d4a94a' }}>Kỹ năng — {cls.name}</h3>
          <div style={{ fontSize: 12, marginBottom: 10 }}>Điểm còn lại: <b style={{ color: '#ffdd33' }}>{char.skill_points}</b></div>
          {skills.map(s => {
            const rank = skillRanks[s.id] ?? 0;
            const locked = char.level < s.levelReq;
            return (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #333' }}>
                <div>
                  <div style={{ fontSize: 13 }}>{s.name} {locked && <span style={{ color: '#888', fontSize: 10 }}>(cần cấp {s.levelReq})</span>}</div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>Rank {rank}/10 · MP {s.mpCost} · Hồi {(s.cooldownMs / 1000).toFixed(1)}s</div>
                </div>
                <button disabled={locked || char.skill_points <= 0 || rank >= 10} onClick={() => allocateSkill(s.id)}
                  style={{ ...closeBtnStyle, margin: 0, padding: '4px 10px', opacity: (locked || char.skill_points <= 0 || rank >= 10) ? 0.35 : 1 }}>+1</button>
              </div>
            );
          })}
          <button onClick={() => setPanel('none')} style={closeBtnStyle}>Đóng</button>
        </div>
      )}

      {/* Panel Phó Bản */}
      {panel === 'dungeon' && (
        <div style={overlayPanelStyle}>
          <h3 style={{ margin: '0 0 10px', color: '#d4a94a' }}>Phó Bản</h3>
          {DUNGEONS.map(d => {
            const st = dungeonStatus[d.id];
            const cleared = st ? st.clears_today >= st.daily_limit : false;
            const locked = char.level < d.levelReq;
            return (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #333' }}>
                <div>
                  <div style={{ fontSize: 14 }}>{d.name} {locked && <span style={{ color: '#888', fontSize: 10 }}>(cần cấp {d.levelReq})</span>}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>Boss: {d.bossName} · Lượt hôm nay: {st?.clears_today ?? 0}/{d.dailyLimit}</div>
                </div>
                <button disabled={locked} onClick={() => enterDungeon(d)}
                  style={{ ...closeBtnStyle, margin: 0, padding: '6px 14px', width: 'auto', opacity: locked ? 0.35 : 1, background: cleared ? '#5a4520' : '#d4a94a' }}>
                  {cleared ? 'Vào luyện' : 'Vào'}
                </button>
              </div>
            );
          })}
          <p style={{ fontSize: 11, opacity: 0.6, marginTop: 10 }}>Mỗi phó bản chỉ nhận thưởng {DUNGEONS[0].dailyLimit} lần/ngày (reset theo giờ UTC). Sau khi hết lượt vẫn có thể vào luyện tập, không nhận thêm thưởng.</p>
          <button onClick={() => setPanel('none')} style={closeBtnStyle}>Đóng</button>
        </div>
      )}

      {/* ===== Góc dưới phải: thanh skill, ĐÁNH to màu đỏ ngoài cùng ===== */}
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
                opacity: locked ? 0.35 : 1, cursor: locked ? 'default' : 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.5)'
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
    </div>
  );
}

function Bar({ label, val, max, color }: { label: string; val: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (val / Math.max(1, max)) * 100));
  return (
    <div style={{ fontSize: 9, marginTop: 2 }}>
      <div style={{ height: 7, background: '#000', borderRadius: 3, overflow: 'hidden', border: '1px solid #000' }}>
        <div style={{ width: pct + '%', height: '100%', background: color }} />
      </div>
    </div>
  );
}

function SideBtn({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} style={{
      ...chromePanel, cursor: 'pointer', fontSize: 11, fontWeight: 'bold', padding: '7px 6px', textAlign: 'center',
      background: active ? 'linear-gradient(160deg,#5a4520,#3a2a10)' : chromePanel.background, letterSpacing: 0.5
    }}>{children}</button>
  );
}

const chromePanel: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(48,34,16,.94), rgba(20,14,6,.94))',
  border: '2px solid #d4a94a', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: '#fff',
  boxShadow: '0 2px 8px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,220,140,.15)'
};
const overlayPanelStyle: React.CSSProperties = { position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: 'min(420px,92vw)', maxHeight: '78vh', overflowY: 'auto', ...chromePanel, whiteSpace: 'normal', zIndex: 30 };
const slotBoxStyle: React.CSSProperties = { border: '2px solid #444', borderRadius: 8, background: '#1a120a', aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' };
const closeBtnStyle: React.CSSProperties = { marginTop: 12, width: '100%', padding: 8, borderRadius: 6, border: 'none', background: '#d4a94a', color: '#000', fontWeight: 'bold', cursor: 'pointer' };
const tinyBtn: React.CSSProperties = { padding: '3px 10px', borderRadius: 4, border: 'none', background: '#d4a94a', color: '#000', fontSize: 11, cursor: 'pointer' };
const portraitStyle: React.CSSProperties = { width: 40, height: 40, borderRadius: '50%', border: '2px solid #d4a94a', background: '#1a120a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 };
