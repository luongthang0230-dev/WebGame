'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ITEM_TEMPLATES, QUALITY_COLOR } from '@/game/data/items';

interface CharRow { id: string; name: string; gold: number; }
interface OfferRow {
  id: string; from_character_id: string; to_character_id: string;
  from_gold: number; to_gold: number; from_confirmed: boolean; to_confirmed: boolean;
  status: string; created_at: string;
}
interface OfferItemRow { id: string; trade_offer_id: string; character_id: string; inventory_id: string; item_template_id: string; rolled_atk: number; rolled_def: number; }
interface InvRow { id: string; item_template_id: string; quantity: number; rolled_atk: number; rolled_def: number; }

export default function TradePage() {
  const router = useRouter();
  const supabase = createClient();
  const [char, setChar] = useState<CharRow | null>(null);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<OfferItemRow[]>([]);
  const [myInventory, setMyInventory] = useState<InvRow[]>([]);
  const [targetName, setTargetName] = useState('');
  const [goldInput, setGoldInput] = useState('0');
  const [msg, setMsg] = useState('');

  const loadChar = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) { router.push('/login'); return null; }
    const r = await fetch('/api/character');
    const j = await r.json();
    if (!j.characters?.length) { router.push('/character/create'); return null; }
    const c = j.characters[0];
    setChar({ id: c.id, name: c.name, gold: c.gold });
    return c.id as string;
  }, [router, supabase]);

  const loadOffers = useCallback(async (myId: string) => {
    const { data } = await supabase
      .from('trade_offers')
      .select('*')
      .or(`from_character_id.eq.${myId},to_character_id.eq.${myId}`)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as OfferRow[];
    setOffers(rows);
    const otherIds = Array.from(new Set(rows.flatMap(o => [o.from_character_id, o.to_character_id]).filter(id => id !== myId)));
    if (otherIds.length) {
      const { data: chars } = await supabase.from('characters').select('id,name').in('id', otherIds);
      const map: Record<string, string> = {};
      for (const c of chars ?? []) map[c.id] = c.name;
      setNames(map);
    }
  }, [supabase]);

  const loadDetail = useCallback(async (offerId: string) => {
    const { data } = await supabase.from('trade_offer_items').select('*').eq('trade_offer_id', offerId);
    setItems((data ?? []) as OfferItemRow[]);
  }, [supabase]);

  const loadMyInventory = useCallback(async (myId: string) => {
    const { data } = await supabase.from('inventory').select('*')
      .eq('character_id', myId).is('equipped_slot', null).eq('locked_in_trade', false);
    setMyInventory((data ?? []) as InvRow[]);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const id = await loadChar();
      if (id) { await loadOffers(id); await loadMyInventory(id); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling nhẹ để thấy thay đổi từ phía đối phương gần như tức thời.
  useEffect(() => {
    if (!char) return;
    const t = setInterval(async () => {
      await loadOffers(char.id);
      if (selectedId) await loadDetail(selectedId);
    }, 3000);
    return () => clearInterval(t);
  }, [char, selectedId, loadOffers, loadDetail]);

  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  async function createOffer() {
    if (!char || !targetName.trim()) return;
    const { data, error } = await supabase.rpc('create_trade_offer', { p_from_character_id: char.id, p_to_character_name: targetName.trim() });
    if (error) { setMsg(error.message); return; }
    setTargetName('');
    await loadOffers(char.id);
    setSelectedId((data as any).offer_id);
  }

  async function addItem(invId: string) {
    if (!char || !selectedId) return;
    const { error } = await supabase.rpc('add_trade_item', { p_offer_id: selectedId, p_character_id: char.id, p_inventory_id: invId });
    if (error) { setMsg(error.message); return; }
    await loadDetail(selectedId);
    await loadMyInventory(char.id);
  }
  async function removeItem(tradeItemId: string) {
    if (!char) return;
    await supabase.rpc('remove_trade_item', { p_trade_item_id: tradeItemId, p_character_id: char.id });
    if (selectedId) await loadDetail(selectedId);
    await loadMyInventory(char.id);
  }
  async function setGold() {
    if (!char || !selectedId) return;
    const { error } = await supabase.rpc('set_trade_gold', { p_offer_id: selectedId, p_character_id: char.id, p_gold: Number(goldInput) || 0 });
    if (error) { setMsg(error.message); return; }
    await loadOffers(char.id);
  }
  async function confirm() {
    if (!char || !selectedId) return;
    const { data, error } = await supabase.rpc('confirm_trade_offer', { p_offer_id: selectedId, p_character_id: char.id });
    if (error) { setMsg(error.message); await loadOffers(char.id); return; }
    const res = data as { completed?: boolean };
    if (res.completed) { setMsg('✅ Giao dịch thành công!'); await loadChar(); }
    await loadOffers(char.id);
  }
  async function cancel() {
    if (!char || !selectedId) return;
    await supabase.rpc('cancel_trade_offer', { p_offer_id: selectedId, p_character_id: char.id });
    await loadOffers(char.id);
    await loadMyInventory(char.id);
    setSelectedId(null);
  }

  if (!char) return <main style={{ padding: 40, color: '#999' }}>Đang tải...</main>;

  const selected = offers.find(o => o.id === selectedId);
  const isFrom = selected?.from_character_id === char.id;
  const myItems = items.filter(i => i.character_id === char.id);
  const theirItems = items.filter(i => i.character_id !== char.id);
  const myGold = selected ? (isFrom ? selected.from_gold : selected.to_gold) : 0;
  const theirGold = selected ? (isFrom ? selected.to_gold : selected.from_gold) : 0;
  const myConfirmed = selected ? (isFrom ? selected.from_confirmed : selected.to_confirmed) : false;
  const theirConfirmed = selected ? (isFrom ? selected.to_confirmed : selected.from_confirmed) : false;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 20, color: '#fff', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#d4a94a' }}>🤝 Giao dịch tự do</h1>
      <p style={{ fontSize: 13, opacity: 0.8 }}>{char.name} · 💰 {char.gold} vàng</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={targetName} onChange={e => setTargetName(e.target.value)} placeholder="Tên nhân vật muốn giao dịch"
          style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#1a1a1a', color: '#fff', flex: 1 }} />
        <button onClick={createOffer} style={btnStyle}>Tạo giao dịch</button>
      </div>
      {msg && <div style={{ color: '#f88', marginBottom: 12, fontSize: 13 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ width: 220 }}>
          <h4>Giao dịch đang mở</h4>
          {offers.filter(o => o.status === 'pending').map(o => {
            const other = o.from_character_id === char.id ? o.to_character_id : o.from_character_id;
            return (
              <div key={o.id} onClick={() => setSelectedId(o.id)}
                style={{ padding: 8, borderRadius: 6, border: selectedId === o.id ? '2px solid #d4a94a' : '1px solid #444', marginBottom: 6, cursor: 'pointer', fontSize: 13 }}>
                với <b>{names[other] ?? '...'}</b>
              </div>
            );
          })}
          {offers.filter(o => o.status === 'pending').length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>Chưa có giao dịch nào.</div>}
        </div>

        {selected && (
          <div style={{ flex: 1, border: '1px solid #444', borderRadius: 8, padding: 16 }}>
            <h4>Giao dịch với {names[isFrom ? selected.to_character_id : selected.from_character_id]}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <b>Bên bạn</b> {myConfirmed && <span style={{ color: '#4f4' }}>✔ đã xác nhận</span>}
                <ItemGrid rows={myItems} onRemove={removeItem} />
                <div style={{ marginTop: 6, fontSize: 13 }}>💰 {myGold} vàng</div>
              </div>
              <div>
                <b>Bên đối phương</b> {theirConfirmed && <span style={{ color: '#4f4' }}>✔ đã xác nhận</span>}
                <ItemGrid rows={theirItems} />
                <div style={{ marginTop: 6, fontSize: 13 }}>💰 {theirGold} vàng</div>
              </div>
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #444' }}>
              <div style={{ fontSize: 12, marginBottom: 6 }}>Thêm vật phẩm của bạn:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {myInventory.map(row => {
                  const tpl = ITEM_TEMPLATES[row.item_template_id];
                  if (!tpl) return null;
                  return (
                    <button key={row.id} onClick={() => addItem(row.id)} title={tpl.name}
                      style={{ width: 40, height: 40, border: `2px solid ${QUALITY_COLOR[tpl.quality]}`, borderRadius: 6, background: '#1a120a', fontSize: 18, cursor: 'pointer' }}>
                      {tpl.icon}
                    </button>
                  );
                })}
                {myInventory.length === 0 && <span style={{ fontSize: 11, opacity: 0.6 }}>Không còn vật phẩm rảnh để thêm.</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input type="number" value={goldInput} onChange={e => setGoldInput(e.target.value)} placeholder="Số vàng"
                  style={{ padding: 6, width: 120, borderRadius: 6, border: '1px solid #444', background: '#1a1a1a', color: '#fff' }} />
                <button onClick={setGold} style={btnStyle}>Đặt vàng</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={confirm} style={{ ...btnStyle, background: '#2a7a2a' }}>Xác nhận giao dịch</button>
                <button onClick={cancel} style={{ ...btnStyle, background: '#7a2a2a' }}>Huỷ giao dịch</button>
              </div>
              <p style={{ fontSize: 11, opacity: 0.6, marginTop: 10 }}>
                Cả hai bên phải bấm "Xác nhận" thì giao dịch mới thực hiện. Thêm/bớt vật phẩm hoặc vàng sẽ tự huỷ xác nhận đã đặt trước đó của cả hai bên.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function ItemGrid({ rows, onRemove }: { rows: OfferItemRow[]; onRemove?: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, minHeight: 44 }}>
      {rows.map(r => {
        const tpl = ITEM_TEMPLATES[r.item_template_id];
        return (
          <div key={r.id} onClick={() => onRemove?.(r.id)} title={tpl?.name}
            style={{ width: 40, height: 40, border: `2px solid ${tpl ? QUALITY_COLOR[tpl.quality] : '#444'}`, borderRadius: 6, background: '#1a120a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: onRemove ? 'pointer' : 'default' }}>
            {tpl?.icon ?? '❔'}
          </div>
        );
      })}
    </div>
  );
}

const btnStyle: React.CSSProperties = { padding: '8px 14px', borderRadius: 6, border: 'none', background: '#d4a94a', color: '#000', fontWeight: 'bold', cursor: 'pointer' };
