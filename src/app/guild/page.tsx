'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface CharRow { id: string; name: string; gold: number; }
interface Member { character_id: string; name: string; level: number; role: 'leader' | 'officer' | 'member'; joined_at: string; }
interface GuildInfo {
  in_guild: boolean; guild_id?: string; name?: string; gold?: number; announcement?: string;
  leader_character_id?: string; my_role?: 'leader' | 'officer' | 'member'; members?: Member[];
}
interface ChatMsg { id: number; character_name: string; message: string; created_at: string; }
interface GuildListRow { id: string; name: string; gold: number; }

const ROLE_LABEL: Record<string, string> = { leader: '👑 Bang Chủ', officer: '🛡 Phó Bang Chủ', member: 'Thành viên' };

export default function GuildPage() {
  const router = useRouter();
  const supabase = createClient();
  const [char, setChar] = useState<CharRow | null>(null);
  const [guild, setGuild] = useState<GuildInfo | null>(null);
  const [guildList, setGuildList] = useState<GuildListRow[]>([]);
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState('');
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [goldInput, setGoldInput] = useState('');
  const [announceInput, setAnnounceInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadChar = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) { router.push('/login'); return null; }
    const r = await fetch('/api/character');
    const j = await r.json();
    if (!j.characters?.length) { router.push('/character/create'); return null; }
    setChar({ id: j.characters[0].id, name: j.characters[0].name, gold: j.characters[0].gold });
    return j.characters[0].id as string;
  }, [router, supabase]);

  const loadGuild = useCallback(async (characterId: string) => {
    const { data } = await supabase.rpc('get_my_guild', { p_character_id: characterId });
    const g = data as GuildInfo;
    setGuild(g);
    if (g.in_guild) setAnnounceInput(g.announcement ?? '');
    return g;
  }, [supabase]);

  const loadGuildList = useCallback(async () => {
    const { data } = await supabase.from('guilds').select('id,name,gold').order('gold', { ascending: false }).limit(30);
    setGuildList((data ?? []) as GuildListRow[]);
  }, [supabase]);

  const loadChatHistory = useCallback(async (guildId: string) => {
    const { data } = await supabase.from('guild_chat_messages').select('*').eq('guild_id', guildId).order('created_at', { ascending: false }).limit(50);
    setChat(((data ?? []) as ChatMsg[]).reverse());
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const id = await loadChar();
      if (!id) return;
      const g = await loadGuild(id);
      if (!g.in_guild) await loadGuildList();
      else await loadChatHistory(g.guild_id!);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chat real-time: lắng nghe INSERT mới trên bảng guild_chat_messages của đúng bang mình.
  useEffect(() => {
    if (!guild?.in_guild || !guild.guild_id) return;
    const channel = supabase
      .channel(`guild_chat:${guild.guild_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guild_chat_messages', filter: `guild_id=eq.${guild.guild_id}` },
        (payload) => setChat(c => [...c, payload.new as ChatMsg])
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [guild?.in_guild, guild?.guild_id, supabase]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  // Poll nhẹ thông tin bang (vàng/thành viên) mỗi 5s — chat thì real-time riêng ở trên.
  useEffect(() => {
    if (!char || !guild?.in_guild) return;
    const t = setInterval(() => loadGuild(char.id), 5000);
    return () => clearInterval(t);
  }, [char, guild?.in_guild, loadGuild]);

  async function createGuild() {
    if (!char) return;
    const { error } = await supabase.rpc('create_guild', { p_character_id: char.id, p_name: newName });
    if (error) { setMsg(error.message); return; }
    setNewName('');
    await loadGuild(char.id);
  }
  async function joinGuild(guildId: string) {
    if (!char) return;
    const { error } = await supabase.rpc('join_guild', { p_character_id: char.id, p_guild_id: guildId });
    if (error) { setMsg(error.message); return; }
    const g = await loadGuild(char.id);
    if (g.in_guild) await loadChatHistory(g.guild_id!);
  }
  async function leaveGuild() {
    if (!char || !confirm('Rời bang? Nếu bạn là Bang Chủ, chức vụ sẽ tự chuyển cho người lâu năm nhất.')) return;
    const { error } = await supabase.rpc('leave_guild', { p_character_id: char.id });
    if (error) { setMsg(error.message); return; }
    setGuild({ in_guild: false });
    await loadGuildList();
  }
  async function kick(targetId: string) {
    if (!char) return;
    const { error } = await supabase.rpc('kick_member', { p_character_id: char.id, p_target_character_id: targetId });
    if (error) { setMsg(error.message); return; }
    loadGuild(char.id);
  }
  async function setRole(targetId: string, role: 'officer' | 'member') {
    if (!char) return;
    const { error } = await supabase.rpc('set_member_role', { p_character_id: char.id, p_target_character_id: targetId, p_role: role });
    if (error) { setMsg(error.message); return; }
    loadGuild(char.id);
  }
  async function deposit() {
    if (!char) return;
    const { error } = await supabase.rpc('deposit_guild_gold', { p_character_id: char.id, p_amount: Number(goldInput) || 0 });
    if (error) { setMsg(error.message); return; }
    setGoldInput('');
    loadGuild(char.id);
  }
  async function withdraw() {
    if (!char) return;
    const { error } = await supabase.rpc('withdraw_guild_gold', { p_character_id: char.id, p_amount: Number(goldInput) || 0 });
    if (error) { setMsg(error.message); return; }
    setGoldInput('');
    loadGuild(char.id);
  }
  async function saveAnnouncement() {
    if (!char) return;
    const { error } = await supabase.rpc('set_guild_announcement', { p_character_id: char.id, p_text: announceInput });
    if (error) { setMsg(error.message); return; }
    loadGuild(char.id);
  }
  async function sendChat() {
    if (!char || !chatInput.trim()) return;
    const text = chatInput;
    setChatInput('');
    const { error } = await supabase.rpc('send_guild_chat', { p_character_id: char.id, p_message: text });
    if (error) setMsg(error.message);
  }

  if (!char) return <main style={{ padding: 40, color: '#999' }}>Đang tải...</main>;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 20, color: '#fff', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#d4a94a' }}>🏯 Bang Hội</h1>
      <p style={{ fontSize: 13, opacity: 0.8 }}>{char.name} · 💰 {char.gold} vàng</p>
      {msg && <div style={{ color: '#f88', fontSize: 13, margin: '8px 0' }}>{msg}</div>}

      {!guild?.in_guild ? (
        <>
          <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tên bang mới (phí 1000 vàng)"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background: '#1a1a1a', color: '#fff', flex: 1 }} />
            <button onClick={createGuild} style={btnStyle}>Lập Bang</button>
          </div>
          <h3 style={{ fontSize: 14, color: '#d4a94a' }}>Danh sách bang (xếp theo quỹ)</h3>
          {guildList.map(g => (
            <Row key={g.id}>
              <span>{g.name} <span style={{ opacity: 0.6, fontSize: 12 }}>· 💰{g.gold}</span></span>
              <button onClick={() => joinGuild(g.id)} style={btnStyle}>Gia nhập</button>
            </Row>
          ))}
          {guildList.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Chưa có bang nào. Hãy là người lập bang đầu tiên!</p>}
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <h2 style={{ color: '#d4a94a', margin: '0 0 4px' }}>{guild.name}</h2>
            <p style={{ fontSize: 12, opacity: 0.7 }}>{ROLE_LABEL[guild.my_role!]} · 💰 Quỹ bang: {guild.gold}</p>

            {(guild.my_role === 'leader' || guild.my_role === 'officer') && (
              <div style={{ margin: '10px 0' }}>
                <textarea value={announceInput} onChange={e => setAnnounceInput(e.target.value)} rows={2}
                  placeholder="Thông báo bang..." style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #444', background: '#1a1a1a', color: '#fff', fontSize: 12 }} />
                <button onClick={saveAnnouncement} style={{ ...btnStyle, marginTop: 4, fontSize: 11, padding: '4px 10px' }}>Lưu thông báo</button>
              </div>
            )}
            {guild.my_role === 'member' && guild.announcement && (
              <div style={{ fontSize: 12, background: '#1a1a1a', padding: 8, borderRadius: 6, marginBottom: 10 }}>{guild.announcement}</div>
            )}

            <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
              <input type="number" value={goldInput} onChange={e => setGoldInput(e.target.value)} placeholder="Số vàng"
                style={{ padding: 6, width: 100, borderRadius: 6, border: '1px solid #444', background: '#1a1a1a', color: '#fff' }} />
              <button onClick={deposit} style={{ ...btnStyle, fontSize: 12 }}>Nộp quỹ</button>
              {(guild.my_role === 'leader' || guild.my_role === 'officer') && (
                <button onClick={withdraw} style={{ ...btnStyle, fontSize: 12, background: '#7a5a2a' }}>Rút quỹ</button>
              )}
            </div>

            <h4 style={{ fontSize: 13, color: '#d4a94a', marginTop: 16 }}>Thành viên ({guild.members?.length})</h4>
            {guild.members?.map(m => (
              <Row key={m.character_id}>
                <span>{m.name} <span style={{ opacity: 0.6, fontSize: 11 }}>Lv{m.level} · {ROLE_LABEL[m.role]}</span></span>
                {guild.my_role === 'leader' && m.character_id !== char.id && (
                  <span style={{ display: 'flex', gap: 4 }}>
                    {m.role === 'member'
                      ? <button onClick={() => setRole(m.character_id, 'officer')} style={tinyBtn}>Thăng Phó Bang</button>
                      : <button onClick={() => setRole(m.character_id, 'member')} style={tinyBtn}>Giáng chức</button>}
                    <button onClick={() => kick(m.character_id)} style={{ ...tinyBtn, background: '#7a2a2a' }}>Đuổi</button>
                  </span>
                )}
                {guild.my_role === 'officer' && m.role === 'member' && m.character_id !== char.id && (
                  <button onClick={() => kick(m.character_id)} style={{ ...tinyBtn, background: '#7a2a2a' }}>Đuổi</button>
                )}
              </Row>
            ))}

            <button onClick={leaveGuild} style={{ ...btnStyle, marginTop: 16, background: '#7a2a2a' }}>Rời Bang</button>
          </div>

          <div>
            <h4 style={{ fontSize: 13, color: '#d4a94a' }}>💬 Chat Bang (real-time)</h4>
            <div style={{ height: 320, overflowY: 'auto', background: '#111', borderRadius: 8, padding: 10, border: '1px solid #333' }}>
              {chat.map(m => (
                <div key={m.id} style={{ fontSize: 12, marginBottom: 4 }}>
                  <b style={{ color: '#d4a94a' }}>{m.character_name}:</b> {m.message}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder="Nhắn gì đó..." style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #444', background: '#1a1a1a', color: '#fff' }} />
              <button onClick={sendChat} style={btnStyle}>Gửi</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #333', fontSize: 13 }}>{children}</div>;
}
const btnStyle: React.CSSProperties = { padding: '7px 12px', borderRadius: 6, border: 'none', background: '#d4a94a', color: '#000', fontWeight: 'bold', cursor: 'pointer', fontSize: 12 };
const tinyBtn: React.CSSProperties = { padding: '3px 8px', borderRadius: 4, border: 'none', background: '#3a5a8a', color: '#fff', fontSize: 10, cursor: 'pointer' };
