import { TAU, rnd } from '../core/math.js';
import { ETYPES } from '../content/enemies.js';
import { selectBoss } from '../content/bosses.js';

export function edgePos({ width, height, margin = 40 }) {
  const s = Math.floor(Math.random() * 4);
  if (s === 0) return { x: rnd(0, width), y: -margin };
  if (s === 1) return { x: width + margin, y: rnd(0, height) };
  if (s === 2) return { x: rnd(0, width), y: height + margin };
  return { x: -margin, y: rnd(0, height) };
}

export function createEnemy({ type, x, y, wave, mutation, width, height, fastWarm = false, fromEdge = false }) {
  const t = ETYPES[type];
  if (!t) throw new Error(`Unknown enemy type: ${type}`);

  const p = x !== undefined ? { x, y } : edgePos({ width, height });
  const sc = 1 + wave * 0.055;
  const canElite = wave >= 3 && type !== 'swarm' && type !== 'bomber' && (x === undefined || fromEdge);
  const elite = canElite && Math.random() < Math.min((0.06 + wave * 0.018) * mutation.elite, 0.5);
  // 血量随波次加厚，16 波封顶（之后靠数量压制）
  const hpMul = 1 + Math.min(wave, 16) * 0.09;
  const hpv = Math.max(1, Math.round(t.hp * hpMul)) * (elite ? 3 : 1);

  const enemy = {
    type,
    x:p.x,
    y:p.y,
    vx:0,
    vy:0,
    hp: hpv,
    maxHp: hpv,
    r: t.r * (elite ? 1.45 : 1),
    spd: t.spd * sc * (elite ? 0.9 : 1) * mutation.espd,
    col: t.col,
    score: t.score * (elite ? 3 : 1),
    kb: t.kb,
    sides: t.sides,
    elite,
    hunter:false,
    flash:0,
    warmup: fastWarm ? 0.25 : 0.7,
    rot: rnd(0, TAU),
    flank: rnd(-0.85, 0.85),
    lungeT: (type === 'shooter' ? rnd(0.8, 1.6) : type === 'healer' ? rnd(1.5, 2.5) : type === 'phantom' ? rnd(1.2, 1.8)
      : type === 'sniper' ? rnd(1.0, 2.0) : type === 'brood' ? rnd(2.0, 3.0) : type === 'charger' ? rnd(0.8, 1.6) : 0),
    lungeState:0,
    lvx:0,
    lvy:0,
    burnT:0,
    slowT:0,
    shieldHp: type === 'shielder' ? (elite ? 4 : 2) : 0,
    phased:false
  };

  return {
    enemy,
    spawnRing: { x:p.x, y:p.y, r:4, max: elite ? 60 : 44, a:1, col: elite ? '#fff' : t.col }
  };
}

export function markHunter(enemy) {
  enemy.spd *= 1.75;
  enemy.hunter = true;
  enemy.elite = false;
  enemy.hp = 2;
  enemy.maxHp = 2;
  enemy.score = 150;
  return enemy;
}

export function createBoss({ wave, width, height, x, y }) {
  const { kind, def } = selectBoss(wave);
  const p = x !== undefined ? { x, y } : edgePos({ width, height });
  const hpv = Math.floor(def.hp(Math.min(wave, 30)));   // Boss 血量 30 波封顶

  return {
    name: def.nm,
    boss: {
      kind,
      x:p.x,
      y:p.y,
      vx:0,
      vy:0,
      hp:hpv,
      maxHp:hpv,
      r:def.r,
      col:def.col,
      flash:0,
      rot:0,
      st:'chase',
      stT:1.5,
      cx:0,
      cy:0,
      tx:0,
      ty:0,
      fireT:0,
      spawnT:3,
      pulseT:5,
      warmup:1,
      burnT:0,
      slowT:0
    }
  };
}
