'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { inputBridge, PlayerRuntime, CooldownState } from './InputBridge';
import { createClient } from '@/lib/supabase/client';

export interface CharacterRuntime {
  id: string;
  name: string;
  classId: string;
  level: number;
  hp: number; mp: number; hpMax: number; mpMax: number;
  str: number; dex: number; intStat: number; con: number;
  mapId: string;
  posX: number; posY: number;
  equippedAtk: number;
  equippedDef: number;
  skillRanks: Record<string, number>;
  duel?: {
    duelId: string;
    channelId: string;
    opponentName: string;
    opponentClassId: string;
    sideA: boolean; // true = trái, false = phải (quyết định ai spawn bên nào)
  };
}

export interface QuestEvent {
  quest_completed?: string;
  next_quest_id?: string | null;
  quest_progress?: number;
  quest_target?: number;
  quest_title?: string;
}

export interface RewardUpdate {
  new_level: number; new_exp: number; new_gold: number;
  new_hp: number; new_mp: number; new_hp_max: number; new_mp_max: number;
  leveled_up: boolean; levels_gained: number; exp_gained: number; gold_gained: number;
  new_skill_points: number; loot_token: string | null; loot_item_id: string | null;
  quest_event: QuestEvent | null;
  daily_event: { daily_completed: boolean } | null;
}

export interface LootPicked {
  item_template_id: string; name: string; icon: string; rolled_atk: number; rolled_def: number;
}

export interface DungeonResult {
  is_dungeon: boolean;
  dungeon_name?: string;
  already_cleared_today?: boolean;
  error?: string;
  reward?: { new_level: number; new_exp: number; new_gold: number; new_hp_max: number; new_mp_max: number; new_skill_points: number; leveled_up: boolean; levels_gained: number };
  loot_token?: string | null;
  loot_item_id?: string | null;
}

export interface PhaserGameHandle {
  /** Gọi ngay sau khi trang bị/tháo đồ thành công, để combat dùng chỉ số mới không cần tải lại trang. */
  applyEquipmentBonus: (atk: number, def: number) => void;
  /** Gọi ngay sau khi cộng điểm kỹ năng thành công. */
  applySkillRank: (skillId: string, rank: number) => void;
  /** Dịch chuyển thẳng vào phó bản (không cần đi bộ), giữ nguyên chỉ số hiện tại. */
  enterDungeon: (mapKey: string, spawnX: number, spawnY: number) => void;
}

interface Props {
  character: CharacterRuntime;
  onMapChange?: (mapKey: string) => void;
  onNpcNear?: (npcId: string | null, npcName?: string) => void;
  onRuntimeUpdate?: (r: PlayerRuntime) => void;
  onCooldownUpdate?: (c: CooldownState) => void;
  onReward?: (r: RewardUpdate) => void;
  onLootPicked?: (item: LootPicked) => void;
  onPlayerDown?: () => void;
  onDungeonCleared?: (r: DungeonResult) => void;
  onDuelEnd?: (won: boolean) => void;
}

const TILE = 32;
const SYNC_INTERVAL_MS = 4000;

const PhaserGame = forwardRef<PhaserGameHandle, Props>(function PhaserGame(
  { character, onMapChange, onNpcNear, onRuntimeUpdate, onCooldownUpdate, onReward, onLootPicked, onPlayerDown, onDungeonCleared, onDuelEnd },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const duelChannelRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    applyEquipmentBonus: (atk, def) => sceneRef.current?.setEquipmentBonus(atk, def),
    applySkillRank: (skillId, rank) => sceneRef.current?.setSkillRank(skillId, rank),
    enterDungeon: (mapKey, spawnX, spawnY) => sceneRef.current?.enterDungeon(mapKey, spawnX, spawnY)
  }));

  useEffect(() => {
    let destroyed = false;
    let syncTimer: ReturnType<typeof setInterval> | undefined;
    let hudTimer: ReturnType<typeof setInterval> | undefined;
    const supabase = createClient();

    (async () => {
      const Phaser = (await import('phaser')).default;
      const WorldScene = (await import('./scenes/WorldScene')).default;
      if (destroyed || !containerRef.current) return;

      inputBridge.onMapChange = (mapKey: string) => onMapChange?.(mapKey);
      inputBridge.onNpcNear = (id, name) => onNpcNear?.(id, name);
      inputBridge.onPlayerDown = () => onPlayerDown?.();

      // Hạ quái ở client chỉ là hoạt ảnh; phần thưởng (exp/gold/lên cấp/điểm kỹ
      // năng/rơi đồ) do server tính qua RPC grant_kill_reward.
      inputBridge.onMonsterKilled = async (monsterDefId: string, x: number, y: number) => {
        const { data, error } = await supabase.rpc('grant_kill_reward', {
          p_character_id: character.id,
          p_monster_id: monsterDefId
        });
        if (error) { console.warn('grant_kill_reward lỗi:', error.message); return; }
        const r = data as RewardUpdate;
        sceneRef.current?.applyServerReward(r);
        onReward?.(r);
        if (r.loot_token && r.loot_item_id) {
          sceneRef.current?.spawnGroundLoot(r.loot_token, r.loot_item_id, x, y);
        }

        // An toàn gọi vô điều kiện sau MỌI lần hạ quái: server tự tra xem
        // monster_id này có phải boss phó bản không, trả is_dungeon=false nếu không.
        const { data: dgData, error: dgError } = await supabase.rpc('complete_dungeon', {
          p_character_id: character.id, p_boss_monster_id: monsterDefId
        });
        if (!dgError) {
          const dg = dgData as DungeonResult;
          if (dg.is_dungeon) {
            onDungeonCleared?.(dg);
            if (dg.loot_token && dg.loot_item_id) {
              sceneRef.current?.spawnGroundLoot(dg.loot_token, dg.loot_item_id, x, y);
            }
          }
        }
      };

      // Người chơi đi ngang qua đồ rơi -> tự động thử nhặt (server xác nhận qua token 1 lần).
      inputBridge.onLootReached = async (token: string) => {
        const { data, error } = await supabase.rpc('claim_loot', { p_token: token });
        if (error) { sceneRef.current?.removeGroundLoot(token, false); return; }
        const res = data as { success: boolean } & LootPicked;
        sceneRef.current?.removeGroundLoot(token, !!res.success);
        if (res.success) onLootPicked?.(res);
      };

      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        backgroundColor: '#111111',
        physics: { default: 'arcade', arcade: { debug: false } },
        scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
        scene: [WorldScene]
      });

      const duel = character.duel;
      gameRef.current.scene.start('WorldScene', {
        mapKey: duel ? 'pvp_arena' : character.mapId,
        spawnX: Math.round(character.posX / TILE),
        spawnY: Math.round(character.posY / TILE),
        characterName: character.name,
        classId: character.classId,
        level: character.level,
        hp: character.hp, mp: character.mp,
        hpMax: character.hpMax, mpMax: character.mpMax,
        str: character.str, dex: character.dex, intStat: character.intStat, con: character.con,
        equippedAtk: character.equippedAtk, equippedDef: character.equippedDef,
        skillRanks: character.skillRanks,
        duelActive: !!duel,
        duelOpponentName: duel?.opponentName,
        duelOpponentClassId: duel?.opponentClassId,
        duelSideA: duel?.sideA
      });
      sceneRef.current = gameRef.current.scene.getScene('WorldScene');
      onMapChange?.(duel ? 'pvp_arena' : character.mapId);

      if (duel) {
        // Khởi tạo HP trong trận (server lưu, không phải client) — idempotent.
        await supabase.rpc('init_duel_combat', { p_character_id: character.id, p_duel_id: duel.duelId });

        // Vị trí: đồng bộ real-time qua Broadcast (chỉ ảnh hưởng hình ảnh).
        // Đòn đánh: KHÔNG qua Broadcast trực tiếp nữa — gọi RPC report_duel_hit
        // để server tự tính sát thương thật rồi mới báo cho đối thủ qua Broadcast,
        // nên không bên nào có thể tự xưng sát thương giả hay tự báo thắng giả.
        const channel = supabase.channel(`pvp:${duel.channelId}`, { config: { broadcast: { self: false } } });
        duelChannelRef.current = channel;
        channel
          .on('broadcast', { event: 'pos' }, ({ payload }) => {
            sceneRef.current?.updateRemoteOpponent(payload.x, payload.y);
          })
          .on('broadcast', { event: 'heal_result' }, ({ payload }) => {
            sceneRef.current?.showHealOnOpponent(payload.heal, payload.newHp, payload.newHpMax);
          })
          .on('broadcast', { event: 'hit_result' }, ({ payload }) => {
            // Chỉ bên bị nhắm mới áp dụng — payload đến từ bên tấn công nhưng
            // số liệu (damage/newHp) đã được SERVER tính và lưu từ trước, bên
            // tấn công chỉ đang "chuyển tiếp" kết quả server đã chốt.
            if (payload.defenderId !== character.id) return;
            sceneRef.current?.applyAuthoritativeHit(payload.damage, payload.crit, payload.newHp, payload.newHpMax);
            if (payload.newHp <= 0) onDuelEnd?.(false);
          })
          .subscribe();

        inputBridge.duelBroadcastPos = (x, y) => channel.send({ type: 'broadcast', event: 'pos', payload: { x, y } });
        inputBridge.duelRequestHeal = async (skillId: string) => {
          const { data, error } = await supabase.rpc('report_duel_heal', {
            p_duel_id: duel.duelId, p_character_id: character.id, p_skill_id: skillId
          });
          if (error) { console.warn('report_duel_heal lỗi:', error.message); return; }
          const res = data as { success: boolean; heal: number; new_hp: number; hp_max: number };
          if (!res.success) return;
          sceneRef.current?.applyAuthoritativeHeal(res.heal, res.new_hp, res.hp_max);
          channel.send({ type: 'broadcast', event: 'heal_result', payload: { heal: res.heal, newHp: res.new_hp, newHpMax: res.hp_max } });
        };
        inputBridge.duelRequestHit = async (skillId: string) => {
          const { data, error } = await supabase.rpc('report_duel_hit', {
            p_duel_id: duel.duelId, p_attacker_id: character.id, p_skill_id: skillId
          });
          if (error) { console.warn('report_duel_hit lỗi:', error.message); return; }
          const res = data as {
            success: boolean; damage: number; crit: boolean; defender_id: string;
            defender_new_hp: number; defender_hp_max: number; duel_ended: boolean;
          };
          if (!res.success) return;
          sceneRef.current?.showHitResultOnOpponent(res.damage, res.crit, res.defender_new_hp, res.defender_hp_max);
          channel.send({
            type: 'broadcast', event: 'hit_result',
            payload: { defenderId: res.defender_id, damage: res.damage, crit: res.crit, newHp: res.defender_new_hp, newHpMax: res.defender_hp_max }
          });
          if (res.duel_ended) {
            sceneRef.current?.handleDuelWin();
            onDuelEnd?.(true);
          }
        };
      } else {
        // Thế giới mở bình thường: đồng bộ vị trí/hp lên Supabase định kỳ.
        syncTimer = setInterval(async () => {
          const r = inputBridge.playerRuntime;
          if (!r.mapKey) return;
          await supabase.rpc('update_character_runtime', {
            p_character_id: character.id,
            p_map_id: r.mapKey,
            p_pos_x: r.x,
            p_pos_y: r.y,
            p_hp: r.hp,
            p_mp: r.mp
          });
        }, SYNC_INTERVAL_MS);
      }

      hudTimer = setInterval(() => {
        onRuntimeUpdate?.(inputBridge.playerRuntime);
        onCooldownUpdate?.(inputBridge.cooldowns);
      }, 200);
    })();

    return () => {
      destroyed = true;
      if (syncTimer) clearInterval(syncTimer);
      if (hudTimer) clearInterval(hudTimer);
      if (duelChannelRef.current) { supabase.removeChannel(duelChannelRef.current); duelChannelRef.current = null; }
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
});

export default PhaserGame;
