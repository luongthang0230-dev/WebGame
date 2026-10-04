import Phaser from 'phaser';
import { MAPS, DEFAULT_MAP } from '../data/maps';
import { PROP_GLYPH, NPC_GLYPH, PORTAL_GLYPH, PLAYER_GLYPH } from '../data/assets';
import { MONSTERS } from '../data/monsters';
import { getSkills, SkillDef, attackPowerFor } from '../data/skills';
import { ITEM_TEMPLATES } from '../data/items';
import { MonsterEntity } from '../entities/MonsterEntity';
import { inputBridge } from '../InputBridge';
import { MapDef } from '../types';
import { CHARACTER_GRID, MONSTER_FRAMES, BOSS_FRAMES, NPC_FRAMES, BUILDING_FRAMES, DECOR_FRAMES, FrameRect } from '../data/spriteManifest';
import { MONSTER_SPRITE, BOSS_SPRITE_KEYS, NPC_SPRITE, MAP_TILE_BY_KEY, PROP_SPRITE } from '../data/spriteMap';

export const TILE = 32;
export const PLAYER_SPEED = 170;

const ASSET_BASE = '/game-assets';
const CHAR_CLASSES = ['kiem_khach', 'dao_khach', 'cung_thu', 'phap_su', 'vo_tang'] as const;
const MONSTER_SCALE = 0.22, BOSS_SCALE = 0.3, NPC_SCALE = 0.17, BUILDING_SCALE = 0.4, DECOR_SCALE = 0.3, PLAYER_SCALE = 0.32;
const CLASS_TO_SPRITE: Record<string, string> = {
  kiem: 'kiem_khach', dao: 'dao_khach', cung: 'cung_thu', phap: 'phap_su', quyen: 'vo_tang'
};

/** Đăng ký sub-frame (x,y,w,h) vào 1 texture đã load — idempotent vì Scene bị restart liên tục khi đổi map. */
function registerFrames(scene: Phaser.Scene, textureKey: string, frames: Record<string, FrameRect>) {
  if (!scene.textures.exists(textureKey)) return;
  const tex = scene.textures.get(textureKey);
  for (const [name, f] of Object.entries(frames)) {
    if (!tex.has(name)) tex.add(name, 0, f.x, f.y, f.w, f.h);
  }
}

interface WorldSceneData {
  mapKey: string;
  spawnX: number;   // tile
  spawnY: number;   // tile
  characterName?: string;
  classId?: string;
  level?: number;
  hp?: number;
  mp?: number;
  hpMax?: number;
  mpMax?: number;
  str?: number;
  dex?: number;
  intStat?: number;
  con?: number;
  equippedAtk?: number;
  equippedDef?: number;
  skillRanks?: Record<string, number>;
  duelActive?: boolean;
  duelOpponentName?: string;
  duelOpponentClassId?: string;
  duelSideA?: boolean; // quyết định spawn bên trái/phải, đối xứng
}

// RNG xác định (không phải Math.random) để vị trí quái giống nhau mỗi lần
// vào lại map, tránh lệch giữa các lần load trước khi có multiplayer thật.
function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

export default class WorldScene extends Phaser.Scene {
  private mapDef!: MapDef;
  private player!: (Phaser.GameObjects.Sprite | Phaser.GameObjects.Text) & { body: Phaser.Physics.Arcade.Body };
  private playerSpriteKey: string | null = null; // null nếu đang fallback emoji (không có anim)
  private animLockUntil = 0; // trong lúc này không bị idle/walk ghi đè (để attack/hurt/death chạy trọn)
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private portalZones!: Phaser.Physics.Arcade.StaticGroup;
  private npcZones!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private portalCooldown = 0;
  private minimapCam?: Phaser.Cameras.Scene2D.Camera;
  private monsters: MonsterEntity[] = [];
  private monsterGroup!: Phaser.Physics.Arcade.Group;
  private sceneData!: WorldSceneData;
  private nameLabel!: Phaser.GameObjects.Text;
  private skills: SkillDef[] = [];
  private skillCooldowns: number[] = [];
  private isPlayerDead = false;
  private groundLoots: { token: string; sprite: Phaser.GameObjects.Text; requested: boolean }[] = [];
  private remoteOpponent: {
    sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Text;
    classKey: string | null;
    hpBarBg: Phaser.GameObjects.Rectangle; hpBar: Phaser.GameObjects.Rectangle; nameLabel: Phaser.GameObjects.Text;
    hp: number; hpMax: number; targetX: number; targetY: number; lastUpdate: number;
  } | null = null;
  private duelBroadcastTimer = 0;
  private duelEnded = false;

  constructor() {
    super('WorldScene');
  }

  preload() {
    // Loader tự bỏ qua nếu key đã có trong cache (scene bị restart liên tục khi đổi map/chết/vào dungeon).
    for (const cls of CHAR_CLASSES) {
      if (!this.textures.exists(cls)) {
        this.load.spritesheet(cls, `${ASSET_BASE}/characters/${cls}_x1.png`, { frameWidth: 120, frameHeight: 120 });
      }
    }
    const atlasFiles = ['monsters_x1', 'bosses_x1', 'npcs_x1', 'buildings_x1', 'decor_x1'];
    for (const a of atlasFiles) {
      if (!this.textures.exists(a)) this.load.image(a, `${ASSET_BASE}/atlases/${a}.png`);
    }
    const tileKey = MAP_TILE_BY_KEY[this.mapDef?.key ?? ''];
    if (tileKey && !this.textures.exists(tileKey)) {
      this.load.image(tileKey, `${ASSET_BASE}/tiles/${tileKey}.png`);
    }
  }

  init(data: Partial<WorldSceneData>) {
    const mapKey = data.mapKey ?? DEFAULT_MAP;
    this.mapDef = MAPS[mapKey] ?? MAPS[DEFAULT_MAP];
    this.sceneData = {
      mapKey,
      spawnX: data.spawnX ?? 20,
      spawnY: data.spawnY ?? 14,
      characterName: data.characterName ?? 'Hiệp Khách',
      classId: data.classId ?? 'kiem',
      level: data.level ?? 1,
      hp: data.hp ?? 100,
      mp: data.mp ?? 50,
      hpMax: data.hpMax ?? 120,
      mpMax: data.mpMax ?? 58,
      str: data.str ?? 5, dex: data.dex ?? 5, intStat: data.intStat ?? 5, con: data.con ?? 5,
      equippedAtk: data.equippedAtk ?? 0, equippedDef: data.equippedDef ?? 0,
      skillRanks: data.skillRanks ?? {}
    };
    this.skills = getSkills(this.sceneData.classId!);
    this.skillCooldowns = this.skills.map(() => 0);
  }

  create() {
    // QUAN TRỌNG: scene.restart() dùng LẠI cùng 1 Scene instance (không tạo
    // object mới) — field class KHÔNG tự reset. Phải tự tay reset mọi state
    // thuộc về "1 lần sống" của scene ở đây, nếu không: chết 1 lần sẽ bị
    // đứng hình vĩnh viễn (isPlayerDead không bao giờ về false), và quái/đồ
    // rơi của map cũ bị rò rỉ tham chiếu đã destroy sang map mới.
    this.monsters = [];
    this.groundLoots = [];
    this.isPlayerDead = false;
    this.duelEnded = false;
    this.remoteOpponent = null;

    const m = this.mapDef;
    const worldW = m.width * TILE;
    const worldH = m.height * TILE;

    registerFrames(this, 'monsters_x1', MONSTER_FRAMES);
    registerFrames(this, 'bosses_x1', BOSS_FRAMES);
    registerFrames(this, 'npcs_x1', NPC_FRAMES);
    registerFrames(this, 'buildings_x1', BUILDING_FRAMES);
    registerFrames(this, 'decor_x1', DECOR_FRAMES);

    for (const cls of CHAR_CLASSES) {
      if (!this.textures.exists(cls)) continue;
      const grid = CHARACTER_GRID[cls];
      for (const [animName, a] of Object.entries(grid.rows)) {
        const key = `${cls}_${animName}`;
        if (this.anims.exists(key)) continue;
        const start = a.row * grid.columns;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(cls, { start, end: start + a.frames - 1 }),
          frameRate: a.fps,
          repeat: animName === 'idle' || animName === 'walk' ? -1 : 0
        });
      }
    }

    // Nền: dùng texture tile thật nếu map có ánh xạ, không thì tô màu phẳng như cũ.
    const tileKey = MAP_TILE_BY_KEY[m.key];
    if (tileKey && this.textures.exists(tileKey)) {
      this.add.tileSprite(0, 0, worldW, worldH, tileKey).setOrigin(0, 0);
    } else {
      this.add.rectangle(0, 0, worldW, worldH, m.groundColor).setOrigin(0, 0);
    }
    // Đường mòn ngang giữa map cho dễ định hướng
    this.add.rectangle(0, Math.floor(m.height / 2) * TILE, worldW, TILE * 2, m.pathColor, 0.35).setOrigin(0, 0);

    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // Vật cản tĩnh (cây, nhà...) — dùng sprite thật nếu có, không thì emoji như cũ.
    this.solids = this.physics.add.staticGroup();
    for (const p of m.props) {
      const cx = p.x * TILE + TILE / 2, cy = p.y * TILE + TILE / 2;
      let go: any;
      const frameKey = PROP_SPRITE[p.kind];
      if (p.kind === 'building' && frameKey && this.textures.get('buildings_x1').has(frameKey)) {
        go = this.add.image(cx, cy, 'buildings_x1', frameKey).setScale(BUILDING_SCALE).setOrigin(0.5, 0.75);
      } else if (frameKey && this.textures.get('decor_x1').has(frameKey)) {
        go = this.add.image(cx, cy, 'decor_x1', frameKey).setScale(DECOR_SCALE).setOrigin(0.5, 0.75);
      } else {
        go = this.add.text(cx, cy, PROP_GLYPH[p.kind] ?? '❔', { fontSize: '28px' }).setOrigin(0.5);
      }
      if (p.solid) {
        this.physics.add.existing(go, true);
        (go.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE * 0.8, TILE * 0.8);
        this.solids.add(go);
      }
    }

    // Cổng dịch chuyển
    this.portalZones = this.physics.add.staticGroup();
    for (const p of m.portals) {
      const t = this.add.text(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2, PORTAL_GLYPH, { fontSize: '30px' }).setOrigin(0.5);
      this.add.text(p.x * TILE + TILE / 2, p.y * TILE - 8, p.label, { fontSize: '11px', color: '#fff' }).setOrigin(0.5);
      this.physics.add.existing(t, true);
      (t.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE, TILE);
      (t as any).portalDef = p;
      this.portalZones.add(t);
    }

    // NPC
    this.npcZones = this.physics.add.staticGroup();
    for (const n of m.npcs) {
      const cx = n.x * TILE + TILE / 2, cy = n.y * TILE + TILE / 2;
      const frameKey = NPC_SPRITE[n.sprite];
      let t: any;
      if (frameKey && this.textures.get('npcs_x1').has(frameKey)) {
        t = this.add.image(cx, cy, 'npcs_x1', frameKey).setScale(NPC_SCALE).setOrigin(0.5, 0.8);
      } else {
        t = this.add.text(cx, cy, NPC_GLYPH[n.sprite] ?? '👤', { fontSize: '28px' }).setOrigin(0.5);
      }
      this.add.text(cx, n.y * TILE - 10, n.name, { fontSize: '11px', color: '#ffe28a' }).setOrigin(0.5);
      this.physics.add.existing(t, true);
      (t.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE * 1.6, TILE * 1.6);
      (t as any).npcDef = n;
      this.npcZones.add(t);
    }

    // Người chơi — dùng sprite sheet thật theo môn phái nếu có, không thì emoji như cũ.
    const spawn = { x: this.sceneData.spawnX, y: this.sceneData.spawnY };
    const classKey = CLASS_TO_SPRITE[this.sceneData.classId ?? 'kiem'];
    let playerGo: any;
    if (classKey && this.textures.exists(classKey)) {
      const s = this.add.sprite(spawn.x * TILE, spawn.y * TILE, classKey, 0).setScale(PLAYER_SCALE).setOrigin(0.5, 0.8);
      s.play(`${classKey}_idle`);
      this.playerSpriteKey = classKey;
      playerGo = s;
    } else {
      playerGo = this.add.text(spawn.x * TILE, spawn.y * TILE, PLAYER_GLYPH, { fontSize: '32px' }).setOrigin(0.5);
    }
    this.physics.add.existing(playerGo);
    this.player = playerGo as any;
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(TILE * 0.6, TILE * 0.6).setCollideWorldBounds(true);
    this.nameLabel = this.add.text(this.player.x, this.player.y - 26,
      `${this.sceneData.characterName} Lv${this.sceneData.level}`,
      { fontSize: '11px', color: '#8fff8f' }).setOrigin(0.5);

    this.physics.add.collider(this.player, this.solids);
    this.physics.add.overlap(this.player, this.portalZones, (_p, zone) => this.handlePortal(zone as any));
    this.physics.add.overlap(this.player, this.npcZones, (_p, zone) => this.handleNpcNear(zone as any));

    // Quái + AI
    this.monsterGroup = this.physics.add.group();
    const rnd = seeded(m.key.length * 977 + m.width);
    for (const spawnDef of m.monsterSpawns) {
      const def = MONSTERS[spawnDef.monsterType];
      if (!def) continue;
      for (let i = 0; i < spawnDef.count; i++) {
        const tx = spawnDef.areaX[0] + rnd() * (spawnDef.areaX[1] - spawnDef.areaX[0]);
        const ty = spawnDef.areaY[0] + rnd() * (spawnDef.areaY[1] - spawnDef.areaY[0]);
        const mon = new MonsterEntity(this, def, tx * TILE, ty * TILE);
        this.monsters.push(mon);
        this.monsterGroup.add(mon.sprite);
      }
    }
    this.physics.add.collider(this.player, this.monsterGroup);
    this.physics.add.collider(this.monsterGroup, this.solids);

    // Chế độ PvP Duel: tạo đối thủ ảo, vị trí/hp được điều khiển bởi dữ liệu
    // nhận qua Supabase Realtime Broadcast (xem PhaserGame.tsx), không phải AI.
    if (this.sceneData.duelActive) {
      const oppClassKey = CLASS_TO_SPRITE[this.sceneData.duelOpponentClassId ?? 'kiem'];
      const ox = this.sceneData.duelSideA ? (m.width - 6) * TILE : 6 * TILE;
      const oy = Math.floor(m.height / 2) * TILE;
      let oppSprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Text;
      if (oppClassKey && this.textures.exists(oppClassKey)) {
        const s = this.add.sprite(ox, oy, oppClassKey, 0).setScale(PLAYER_SCALE).setOrigin(0.5, 0.8);
        s.play(`${oppClassKey}_idle`);
        if (!this.sceneData.duelSideA) s.setFlipX(true);
        oppSprite = s;
      } else {
        oppSprite = this.add.text(ox, oy, PLAYER_GLYPH, { fontSize: '32px' }).setOrigin(0.5);
      }
      const oppHpMax = this.sceneData.hpMax ?? 100;
      this.remoteOpponent = {
        sprite: oppSprite, classKey: (oppClassKey && this.textures.exists(oppClassKey)) ? oppClassKey : null,
        hpBarBg: this.add.rectangle(ox, oy - 44, 50, 6, 0x000000).setOrigin(0.5),
        hpBar: this.add.rectangle(ox, oy - 44, 50, 6, 0xd33333).setOrigin(0.5),
        nameLabel: this.add.text(ox, oy - 56, this.sceneData.duelOpponentName ?? '???', { fontSize: '11px', color: '#ff8f8f' }).setOrigin(0.5),
        hp: oppHpMax, hpMax: oppHpMax, targetX: ox, targetY: oy, lastUpdate: 0
      };
      // Đặt lại player ở phía đối xứng
      this.player.setPosition(this.sceneData.duelSideA ? 6 * TILE : (m.width - 6) * TILE, oy);
    }

    // Camera chính bám theo người chơi
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1);

    // Minimap (camera phụ, thu nhỏ, góc trên phải)
    const mmSize = 130;
    if (this.minimapCam) { this.cameras.remove(this.minimapCam); this.minimapCam = undefined; } // tránh cộng dồn camera qua mỗi lần restart
    this.minimapCam = this.cameras.add(0, 0, mmSize, Math.round(mmSize * (m.height / m.width)));
    this.minimapCam.setZoom(mmSize / worldW);
    this.minimapCam.setBounds(0, 0, worldW, worldH);
    this.minimapCam.setBackgroundColor(m.groundColor);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as any;

    this.resizeMinimapPosition();
    this.scale.off('resize', undefined, this); // tránh cộng dồn listener qua mỗi lần restart
    this.scale.on('resize', () => this.resizeMinimapPosition());
  }

  private resizeMinimapPosition() {
    if (!this.minimapCam) return;
    const pad = 8;
    // Khớp với khung viền CSS trong /play (chromePanel khung minimap bắt đầu ngay dưới top:8px).
    this.minimapCam.setPosition(this.scale.width - this.minimapCam.width - pad, pad);
  }

  private handlePortal(zone: Phaser.GameObjects.GameObject & { portalDef?: any }) {
    if (this.portalCooldown > 0 || !zone.portalDef) return;
    this.portalCooldown = 1000;
    const p = zone.portalDef;
    inputBridge.onMapChange?.(p.toMap);
    this.scene.restart({ mapKey: p.toMap, spawnX: p.toX, spawnY: p.toY });
  }

  private handleNpcNear(zone: Phaser.GameObjects.GameObject & { npcDef?: any }) {
    if (zone.npcDef) inputBridge.onNpcNear?.(zone.npcDef.id, zone.npcDef.name);
  }

  private aiRnd = seeded(1);

  update(_time: number, delta: number) {
    if (this.portalCooldown > 0) this.portalCooldown -= delta;
    for (let i = 0; i < this.skillCooldowns.length; i++) {
      if (this.skillCooldowns[i] > 0) this.skillCooldowns[i] -= delta;
    }
    if (this.sceneData.mp! < this.sceneData.mpMax!) {
      this.sceneData.mp = Math.min(this.sceneData.mpMax!, this.sceneData.mp! + delta * 0.006 * (1 + this.sceneData.level! * 0.1));
    }

    if (this.isPlayerDead || this.duelEnded) {
      this.publishCooldownState();
      return;
    }

    let dx = 0, dy = 0;
    if (this.cursors.left?.isDown || this.wasd.A.isDown) dx -= 1;
    if (this.cursors.right?.isDown || this.wasd.D.isDown) dx += 1;
    if (this.cursors.up?.isDown || this.wasd.W.isDown) dy -= 1;
    if (this.cursors.down?.isDown || this.wasd.S.isDown) dy += 1;

    // Joystick ảo (mobile) ghi đè nếu không có bàn phím đang nhấn
    if (dx === 0 && dy === 0) {
      dx = inputBridge.vector.x;
      dy = inputBridge.vector.y;
    }

    // Auto Train: nếu không có input thủ công, để AI tự di chuyển + đánh
    if (dx === 0 && dy === 0 && inputBridge.autoMode) {
      const auto = this.autoCombatTick();
      dx = auto.dx; dy = auto.dy;
    }

    const len = Math.hypot(dx, dy);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (len > 0.05) {
      body.setVelocity((dx / len) * PLAYER_SPEED, (dy / len) * PLAYER_SPEED);
      if (this.playerSpriteKey) {
        const s = this.player as Phaser.GameObjects.Sprite;
        if (dx < -0.05) s.setFlipX(true); else if (dx > 0.05) s.setFlipX(false);
      }
    } else {
      body.setVelocity(0, 0);
    }
    if (this.playerSpriteKey && this.time.now >= this.animLockUntil) {
      const anim = `${this.playerSpriteKey}_${len > 0.05 ? 'walk' : 'idle'}`;
      (this.player as Phaser.GameObjects.Sprite).play(anim, true);
    }

    // Nếu rời xa NPC, báo lại UI là không còn NPC nào gần
    const nearAny = this.npcZones.getChildren().some(z => {
      const zz = z as any;
      return Phaser.Math.Distance.Between(this.player.x, this.player.y, zz.x, zz.y) < 56;
    });
    if (!nearAny) inputBridge.onNpcNear?.(null);

    // Yêu cầu cast skill từ UI (nút bấm / phím số)
    if (inputBridge.castRequest !== null) {
      this.tryCastSkill(inputBridge.castRequest);
      inputBridge.castRequest = null;
    }

    // Đồ rơi trên đất: tới gần thì tự động yêu cầu nhặt (claim_loot ở PhaserGame.tsx)
    for (const g of this.groundLoots) {
      if (g.requested) continue;
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, g.sprite.x, g.sprite.y) < 34) {
        g.requested = true;
        inputBridge.onLootReached?.(g.token);
      }
    }

    // Chế độ Duel: phát vị trí của mình ~150ms/lần, nội suy vị trí đối thủ nhận được
    if (this.sceneData.duelActive && this.remoteOpponent) {
      this.duelBroadcastTimer -= delta;
      if (this.duelBroadcastTimer <= 0) {
        this.duelBroadcastTimer = 150;
        inputBridge.duelBroadcastPos?.(this.player.x, this.player.y);
      }
      const ro = this.remoteOpponent;
      ro.sprite.x = Phaser.Math.Linear(ro.sprite.x, ro.targetX, 0.25);
      ro.sprite.y = Phaser.Math.Linear(ro.sprite.y, ro.targetY, 0.25);
      ro.hpBarBg.setPosition(ro.sprite.x, ro.sprite.y - 44);
      ro.hpBar.setPosition(ro.sprite.x - 25 * (1 - ro.hp / ro.hpMax), ro.sprite.y - 44);
      ro.hpBar.scaleX = Math.max(0, ro.hp / ro.hpMax);
      ro.nameLabel.setPosition(ro.sprite.x, ro.sprite.y - 56);
      if (ro.classKey) {
        const anim = Phaser.Math.Distance.Between(ro.sprite.x, ro.sprite.y, ro.targetX, ro.targetY) > 2 ? 'walk' : 'idle';
        (ro.sprite as Phaser.GameObjects.Sprite).play(`${ro.classKey}_${anim}`, true);
      }
    }

    // AI quái + quái phản công khi cận chiến
    for (const mon of this.monsters) {
      mon.update(delta, this.player.x, this.player.y, this.aiRnd);
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, mon.x, mon.y);
      const dmg = mon.attemptAttack(delta, dist);
      if (dmg > 0) this.applyDamageToPlayer(dmg);
    }

    // Nhãn tên bám theo người chơi
    this.nameLabel.setPosition(this.player.x, this.player.y - 26);

    this.publishCooldownState();

    // Ghi runtime cho HUD React + đồng bộ Supabase định kỳ (đọc ở PhaserGame.tsx)
    inputBridge.playerRuntime = {
      mapKey: this.mapDef.key,
      x: this.player.x,
      y: this.player.y,
      hp: Math.round(this.sceneData.hp ?? 0),
      mp: Math.round(this.sceneData.mp ?? 0)
    };
  }

  private publishCooldownState() {
    inputBridge.cooldowns = {
      ratios: this.skills.map((s, i) => Math.max(0, Math.min(1, this.skillCooldowns[i] / s.cooldownMs))),
      mpCosts: this.skills.map(s => s.mpCost),
      locked: this.skills.map(s => (this.sceneData.level ?? 1) < s.levelReq)
    };
  }

  private floatingText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, { fontSize: '15px', color, fontStyle: 'bold' }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private mainStatFor(skill: SkillDef): number {
    // Pháp dùng INT làm chỉ số chính, các class còn lại dùng STR/DEX tuỳ vũ khí (đơn giản hoá: STR).
    if (this.sceneData.classId === 'phap') return this.sceneData.intStat!;
    if (this.sceneData.classId === 'cung') return this.sceneData.dex!;
    return this.sceneData.str!;
  }

  private tryCastSkill(index: number) {
    const skill = this.skills[index];
    if (!skill) return;
    if ((this.sceneData.level ?? 1) < skill.levelReq) return;
    if (this.skillCooldowns[index] > 0) return;
    if ((this.sceneData.mp ?? 0) < skill.mpCost) return;

    const rank = this.sceneData.skillRanks?.[skill.id] ?? 0;
    const rankMult = 1 + rank * 0.12;
    const atk = attackPowerFor(this.sceneData.level!, this.mainStatFor(skill)) + (this.sceneData.equippedAtk ?? 0);

    if (this.sceneData.duelActive) {
      // Chế độ Duel: MỌI loại chiêu (kể cả hồi máu) đều qua server —
      // không riêng gì sát thương. Nếu không, hồi máu có thể bị sửa client
      // để spam vô hạn/bỏ qua hồi chiêu, mất hết ý nghĩa chống gian lận.
      // Client chỉ phát hiện "có trúng tầm không" (để phản hồi nhanh) và
      // hiển thị số liệu SAU KHI server trả lời — không tự tính trước.
      if (skill.kind === 'support') {
        inputBridge.duelRequestHeal?.(skill.id);
      } else if (this.remoteOpponent) {
        const ro = this.remoteOpponent;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, ro.sprite.x, ro.sprite.y);
        const range = skill.kind === 'aoe' ? (skill.aoeRadius ?? 90) : skill.range;
        if (dist > range) {
          if (skill.kind === 'basic') return;
        } else {
          inputBridge.duelRequestHit?.(skill.id);
        }
        if (skill.kind === 'aoe') {
          const ring = this.add.circle(this.player.x, this.player.y, range, 0x88ccff, 0.15).setStrokeStyle(2, 0x88ccff).setDepth(5);
          this.tweens.add({ targets: ring, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
        }
      }
    } else if (skill.kind === 'support') {
      const heal = Math.round((this.sceneData.hpMax ?? 100) * (skill.healPercent ?? 0) * rankMult);
      this.sceneData.hp = Math.min(this.sceneData.hpMax!, (this.sceneData.hp ?? 0) + heal);
      this.floatingText(this.player.x, this.player.y - 30, `+${heal} HP`, '#4f4');
    } else if (skill.kind === 'aoe') {
      let hitAny = false;
      for (const mon of this.monsters) {
        if (mon.isDead) continue;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, mon.x, mon.y) <= (skill.aoeRadius ?? 90)) {
          this.dealDamage(mon, Math.round(atk * skill.dmgMultiplier * rankMult));
          hitAny = true;
        }
      }
      const ring = this.add.circle(this.player.x, this.player.y, skill.aoeRadius ?? 90, 0x88ccff, 0.15).setStrokeStyle(2, 0x88ccff).setDepth(5);
      this.tweens.add({ targets: ring, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
      if (!hitAny && skill.mpCost === 0) return; // đánh thường AoE trượt hoàn toàn thì thôi không trừ mp/cooldown
    } else {
      // basic / single: nhắm quái gần nhất trong tầm
      let target: MonsterEntity | null = null;
      let bestDist = skill.range;
      for (const mon of this.monsters) {
        if (mon.isDead) continue;
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, mon.x, mon.y);
        if (d <= bestDist) { bestDist = d; target = mon; }
      }
      if (!target) {
        if (skill.kind === 'basic') return; // đánh thường không trúng gì thì không tốn chiêu/mp
      } else {
        this.dealDamage(target, Math.round(atk * skill.dmgMultiplier * rankMult));
      }
    }

    this.sceneData.mp = Math.max(0, (this.sceneData.mp ?? 0) - skill.mpCost);
    this.skillCooldowns[this.skills.indexOf(skill)] = skill.cooldownMs;

    if (this.playerSpriteKey) {
      const animSuffix = (skill.kind === 'aoe' || skill.kind === 'support') ? 'skill' : 'attack';
      (this.player as Phaser.GameObjects.Sprite).play(`${this.playerSpriteKey}_${animSuffix}`, true);
      this.animLockUntil = this.time.now + 400;
    }
  }

  private dealDamage(mon: MonsterEntity, amount: number) {
    const crit = Math.random() < 0.15;
    const final = crit ? Math.round(amount * 1.6) : amount;
    const died = mon.takeDamage(final);
    this.floatingText(mon.x, mon.y - 26, (crit ? '💥' : '') + final, crit ? '#ffaa33' : '#ffffff');
    if (died) inputBridge.onMonsterKilled?.(mon.def.id, mon.x, mon.y);
  }

  private applyDamageToPlayer(dmg: number) {
    const reduced = Math.max(1, dmg - Math.round((this.sceneData.equippedDef ?? 0) * 0.6));
    this.sceneData.hp = Math.max(0, (this.sceneData.hp ?? 0) - reduced);
    this.floatingText(this.player.x, this.player.y - 30, `-${reduced}`, '#ff5555');
    if (this.playerSpriteKey) {
      (this.player as Phaser.GameObjects.Sprite).play(`${this.playerSpriteKey}_hurt`, true);
      this.animLockUntil = this.time.now + 300;
    } else {
      this.player.setAlpha(0.5);
      this.time.delayedCall(120, () => this.player.setAlpha(1));
    }
    if (this.sceneData.hp <= 0) this.handlePlayerDeath();
  }

  private handlePlayerDeath() {
    if (this.isPlayerDead) return;
    this.isPlayerDead = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    if (this.playerSpriteKey) (this.player as Phaser.GameObjects.Sprite).play(`${this.playerSpriteKey}_death`, true);
    inputBridge.onPlayerDown?.();
    this.floatingText(this.player.x, this.player.y - 10, 'Bạn đã bại trận...', '#ff4444');
    this.time.delayedCall(2500, () => {
      inputBridge.onMapChange?.('village');
      this.scene.restart({
        ...this.sceneData,
        mapKey: 'village', spawnX: 20, spawnY: 14,
        hp: Math.round((this.sceneData.hpMax ?? 100) * 0.5)
      });
    });
  }

  /** Gọi từ PhaserGame.tsx sau khi RPC grant_kill_reward trả về, để đồng bộ level/hp/mp mới nhất. */
  applyServerReward(r: { new_level: number; new_hp: number; new_mp: number; new_hp_max: number; new_mp_max: number }) {
    const leveledUp = r.new_level !== this.sceneData.level;
    this.sceneData.level = r.new_level;
    this.sceneData.hp = r.new_hp;
    this.sceneData.mp = r.new_mp;
    this.sceneData.hpMax = r.new_hp_max;
    this.sceneData.mpMax = r.new_mp_max;
    this.skills = getSkills(this.sceneData.classId!);
    this.nameLabel.setText(`${this.sceneData.characterName} Lv${this.sceneData.level}`);
    if (leveledUp) this.floatingText(this.player.x, this.player.y - 40, `★ Lên cấp ${r.new_level}!`, '#ffdd33');
  }

  /** Gọi từ PhaserGame.tsx khi nhận broadcast vị trí mới nhất của đối thủ (chỉ để hiển thị mượt, không liên quan HP/thắng-thua). */
  updateRemoteOpponent(x: number, y: number) {
    const ro = this.remoteOpponent;
    if (!ro || this.duelEnded) return;
    ro.targetX = x; ro.targetY = y; ro.lastUpdate = this.time.now;
  }

  /** Gọi ở phía NGƯỜI ĐÁNH, ngay sau khi report_duel_hit trả về — cập nhật
   *  thanh HP của đối thủ theo số liệu THẬT từ server (không phải mình tự đoán). */
  showHitResultOnOpponent(damage: number, crit: boolean, newHp: number, newHpMax: number) {
    const ro = this.remoteOpponent;
    if (!ro) return;
    ro.hp = newHp; ro.hpMax = newHpMax;
    this.floatingText(ro.sprite.x, ro.sprite.y - 26, (crit ? '💥' : '') + damage, crit ? '#ffaa33' : '#ffffff');
  }

  /** Gọi ở CHÍNH MÌNH ngay sau khi report_duel_heal trả về — áp hp thật. */
  applyAuthoritativeHeal(heal: number, newHp: number, newHpMax: number) {
    this.sceneData.hp = newHp;
    this.sceneData.hpMax = newHpMax;
    this.floatingText(this.player.x, this.player.y - 30, `+${heal} HP`, '#4f4');
  }

  /** Gọi khi nhận broadcast "đối thủ vừa hồi máu" — chỉ cập nhật thanh HP hiển thị của họ. */
  showHealOnOpponent(heal: number, newHp: number, newHpMax: number) {
    const ro = this.remoteOpponent;
    if (!ro) return;
    ro.hp = newHp; ro.hpMax = newHpMax;
    this.floatingText(ro.sprite.x, ro.sprite.y - 26, `+${heal} HP`, '#4f4');
  }

  /** Gọi ở phía NGƯỜI BỊ ĐÁNH, khi nhận broadcast "hit_result" — số liệu này
   *  đã được server tính và lưu, không phải client đối thủ tự xưng. */
  applyAuthoritativeHit(damage: number, crit: boolean, newHp: number, newHpMax: number) {
    if (this.duelEnded || this.isPlayerDead) return;
    this.sceneData.hp = newHp;
    this.sceneData.hpMax = newHpMax;
    this.floatingText(this.player.x, this.player.y - 30, (crit ? '💥' : '') + `-${damage}`, '#ff5555');
    if (this.playerSpriteKey) { (this.player as Phaser.GameObjects.Sprite).play(`${this.playerSpriteKey}_hurt`, true); this.animLockUntil = this.time.now + 300; }
    if (newHp <= 0) this.handleDuelLoss();
  }

  /** Gọi khi server xác nhận mình vừa hạ gục đối thủ (report_duel_hit trả duel_ended=true). */
  handleDuelWin() {
    if (this.duelEnded) return;
    this.duelEnded = true;
    this.floatingText(this.player.x, this.player.y - 40, '🏆 THẮNG!', '#ffdd33');
    inputBridge.onDuelEnd?.(true);
  }

  private handleDuelLoss() {
    if (this.duelEnded) return;
    this.duelEnded = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    if (this.playerSpriteKey) (this.player as Phaser.GameObjects.Sprite).play(`${this.playerSpriteKey}_death`, true);
    this.floatingText(this.player.x, this.player.y - 10, 'Bạn đã thua...', '#ff4444');
    inputBridge.onDuelEnd?.(false);
  }

  /** Vào phó bản: dịch chuyển thẳng tới map dungeon, giữ nguyên toàn bộ chỉ số hiện tại. */
  enterDungeon(mapKey: string, spawnX: number, spawnY: number) {
    this.scene.restart({ ...this.sceneData, mapKey, spawnX, spawnY });
  }

  /** Đặt món đồ rơi lên map tại vị trí quái vừa chết; người chơi đi ngang qua sẽ tự nhặt. */
  spawnGroundLoot(token: string, itemTemplateId: string, x: number, y: number) {
    const tpl = ITEM_TEMPLATES[itemTemplateId];
    const sprite = this.add.text(x, y, tpl?.icon ?? '📦', { fontSize: '22px' }).setOrigin(0.5).setDepth(4);
    this.tweens.add({ targets: sprite, y: y - 5, duration: 550, yoyo: true, repeat: -1 });
    this.groundLoots.push({ token, sprite, requested: false });
  }

  /** Gọi sau khi claim_loot thành công (xoá sprite khỏi map) hoặc thất bại (bỏ cờ requested để thử lại). */
  removeGroundLoot(token: string, success: boolean) {
    const idx = this.groundLoots.findIndex(g => g.token === token);
    if (idx < 0) return;
    if (success) {
      this.groundLoots[idx].sprite.destroy();
      this.groundLoots.splice(idx, 1);
    } else {
      this.groundLoots[idx].requested = false;
    }
  }

  /** React gọi sau khi trang bị/tháo đồ để chiến đấu dùng đúng chỉ số mới ngay lập tức. */
  setEquipmentBonus(atk: number, def: number) {
    this.sceneData.equippedAtk = atk;
    this.sceneData.equippedDef = def;
  }

  /** React gọi sau khi cộng điểm kỹ năng thành công. */
  setSkillRank(skillId: string, rank: number) {
    this.sceneData.skillRanks = { ...(this.sceneData.skillRanks ?? {}), [skillId]: rank };
  }

  /** Auto Train: tự tìm quái gần nhất, tiến lại, ưu tiên hồi máu > AoE > đơn > thường. */
  private autoCombatTick(): { dx: number; dy: number } {
    const alive = this.monsters.filter(m => !m.isDead);
    if (alive.length === 0) return { dx: 0, dy: 0 };

    let target = alive[0], bestDist = Infinity;
    for (const m of alive) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y);
      if (d < bestDist) { bestDist = d; target = m; }
    }

    const basicRange = this.skills[0]?.range ?? 70;
    let dx = 0, dy = 0;
    if (bestDist > basicRange * 0.85) {
      const a = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
      dx = Math.cos(a); dy = Math.sin(a);
    }

    const supportIdx = this.skills.findIndex(s => s.kind === 'support');
    if (supportIdx >= 0 && (this.sceneData.hp ?? 0) / (this.sceneData.hpMax ?? 1) < 0.4) {
      this.tryCastSkill(supportIdx);
    }
    const aoeIdx = this.skills.findIndex(s => s.kind === 'aoe');
    if (aoeIdx >= 0) {
      const radius = this.skills[aoeIdx].aoeRadius ?? 90;
      const nearCount = alive.filter(m => Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y) <= radius).length;
      if (nearCount >= 2) this.tryCastSkill(aoeIdx);
    }
    const singleIdx = this.skills.findIndex(s => s.kind === 'single');
    if (singleIdx >= 0 && bestDist <= this.skills[singleIdx].range) this.tryCastSkill(singleIdx);
    else if (bestDist <= basicRange) this.tryCastSkill(0);

    return { dx, dy };
  }
}
