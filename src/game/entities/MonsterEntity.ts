import Phaser from 'phaser';
import { MonsterDef } from '../data/monsters';
import { MONSTER_SPRITE, BOSS_SPRITE_KEYS } from '../data/spriteMap';

type AIState = 'idle' | 'wander' | 'chase' | 'return';
const MONSTER_SCALE = 0.22, BOSS_SCALE = 0.3;

/** Một con quái sống trên map: sprite (ảnh thật nếu có, emoji dự phòng) +
 *  physics body + AI state machine. */
export class MonsterEntity {
  def: MonsterDef;
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  nameLabel: Phaser.GameObjects.Text;
  homeX: number;
  homeY: number;
  hp: number;
  state: AIState = 'idle';
  isDead = false;
  private respawnTimer = 0;
  private wanderTarget = { x: 0, y: 0 };
  private wanderTimer = 0;
  private hitFlash = 0;
  private attackCooldownTimer = 0;

  constructor(scene: Phaser.Scene, def: MonsterDef, x: number, y: number) {
    this.def = def;
    this.homeX = x;
    this.homeY = y;
    this.hp = def.hp;

    const isBoss = def.tier === 'boss';
    const frameKey = MONSTER_SPRITE[def.id];
    const textureKey = frameKey && BOSS_SPRITE_KEYS.has(frameKey) ? 'bosses_x1' : 'monsters_x1';
    const hasSprite = !!frameKey && scene.textures.exists(textureKey) && scene.textures.get(textureKey).has(frameKey);

    if (hasSprite) {
      this.sprite = scene.add.image(x, y, textureKey, frameKey).setScale(isBoss ? BOSS_SCALE : MONSTER_SCALE).setOrigin(0.5, 0.75);
    } else {
      this.sprite = scene.add.text(x, y, def.glyph, { fontSize: isBoss ? '52px' : '30px' }).setOrigin(0.5);
    }
    scene.physics.add.existing(this.sprite);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(isBoss ? 44 : 26, isBoss ? 44 : 26);
    body.setCollideWorldBounds(true);

    const barW = isBoss ? 70 : 36;
    this.hpBarBg = scene.add.rectangle(x, y - (isBoss ? 40 : 24), barW, 5, 0x000000).setOrigin(0.5);
    this.hpBar = scene.add.rectangle(x, y - (isBoss ? 40 : 24), barW, 5, def.tier === 'boss' ? 0xff8800 : 0xe33333).setOrigin(0.5);
    this.nameLabel = scene.add.text(x, y - (isBoss ? 52 : 34), `${def.name} Lv${def.level}`, {
      fontSize: '10px', color: def.tier === 'boss' ? '#ff8800' : '#ffffff'
    }).setOrigin(0.5);
  }

  get body() { return this.sprite.body as Phaser.Physics.Arcade.Body; }
  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  private pickWanderTarget(rnd: () => number) {
    this.wanderTarget = {
      x: this.homeX + (rnd() - 0.5) * 200,
      y: this.homeY + (rnd() - 0.5) * 200
    };
    this.wanderTimer = 2000 + rnd() * 2000;
  }

  update(delta: number, playerX: number, playerY: number, rnd: () => number) {
    if (this.isDead) {
      this.respawnTimer -= delta;
      if (this.respawnTimer <= 0) this.revive();
      return;
    }
    const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);
    const distToHome = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY);

    // Chuyển state
    if (this.state !== 'return' && distToHome > this.def.leashRange) {
      this.state = 'return';
    } else if (this.state !== 'return' && distToPlayer < this.def.aggroRange) {
      this.state = 'chase';
    } else if (this.state === 'chase' && distToPlayer > this.def.aggroRange * 1.4) {
      this.state = 'return';
    }

    let vx = 0, vy = 0;
    if (this.state === 'chase') {
      const a = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
      vx = Math.cos(a) * this.def.moveSpeed;
      vy = Math.sin(a) * this.def.moveSpeed;
    } else if (this.state === 'return') {
      const a = Phaser.Math.Angle.Between(this.x, this.y, this.homeX, this.homeY);
      vx = Math.cos(a) * this.def.moveSpeed;
      vy = Math.sin(a) * this.def.moveSpeed;
      if (distToHome < 10) this.state = 'idle';
    } else {
      // idle/wander: đi loanh quanh tổ
      this.wanderTimer -= delta;
      if (this.wanderTimer <= 0) {
        if (rnd() < 0.4) this.pickWanderTarget(rnd);
        else { this.state = 'idle'; this.wanderTimer = 1500 + rnd() * 1500; }
      }
      if (this.state === 'wander' || (this.wanderTimer > 0 && this.wanderTarget.x)) {
        const d = Phaser.Math.Distance.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y);
        if (d > 8) {
          this.state = 'wander';
          const a = Phaser.Math.Angle.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y);
          vx = Math.cos(a) * this.def.moveSpeed * 0.4;
          vy = Math.sin(a) * this.def.moveSpeed * 0.4;
        }
      }
    }

    this.body.setVelocity(vx, vy);

    // Cập nhật vị trí UI phụ (thanh máu, tên) theo sprite
    const isBoss = this.def.tier === 'boss';
    this.hpBarBg.setPosition(this.x, this.y - (isBoss ? 40 : 24));
    this.hpBar.setPosition(this.x - this.hpBar.width * (1 - this.hp / this.def.hp) / 2, this.y - (isBoss ? 40 : 24));
    this.hpBar.scaleX = Math.max(0, this.hp / this.def.hp);
    this.nameLabel.setPosition(this.x, this.y - (isBoss ? 52 : 34));

    if (this.hitFlash > 0) {
      this.hitFlash -= delta;
      this.sprite.setAlpha(this.hitFlash % 100 < 50 ? 0.4 : 1);
      if (this.hitFlash <= 0) this.sprite.setAlpha(1);
    }
  }

  flashHit() { this.hitFlash = 300; }

  /** Gọi mỗi frame; trả về sát thương nếu quái vừa đánh trúng người chơi (0 nếu chưa tới lượt/ngoài tầm). */
  attemptAttack(delta: number, distToPlayer: number): number {
    this.attackCooldownTimer -= delta;
    if (this.isDead) return 0;
    const range = this.def.tier === 'boss' ? 58 : 34;
    if (distToPlayer > range || this.attackCooldownTimer > 0) return 0;
    this.attackCooldownTimer = 1100;
    return Math.round(this.def.atk * (0.85 + Math.random() * 0.35));
  }

  /** Trả về true nếu cú đánh này hạ gục quái. */
  takeDamage(amount: number): boolean {
    if (this.isDead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.flashHit();
    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  private die() {
    this.isDead = true;
    this.respawnTimer = this.def.respawnMs;
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.sprite.setVisible(false);
    this.hpBarBg.setVisible(false);
    this.hpBar.setVisible(false);
    this.nameLabel.setVisible(false);
  }

  private revive() {
    this.isDead = false;
    this.hp = this.def.hp;
    this.state = 'idle';
    this.sprite.setPosition(this.homeX, this.homeY);
    this.body.enable = true;
    this.sprite.setVisible(true).setAlpha(1);
    this.hpBarBg.setVisible(true);
    this.hpBar.setVisible(true);
    this.nameLabel.setVisible(true);
  }

  destroy() {
    this.sprite.destroy();
    this.hpBarBg.destroy();
    this.hpBar.destroy();
    this.nameLabel.destroy();
  }
}
