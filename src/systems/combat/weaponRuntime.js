import { angDiff } from '../../core/math.js';

const WEAPON_BY_CHARACTER = {
  '斩 · BLADE': 'iaido',
  '燹 · EMBER': 'dual',
  '霜 · FROST': 'odachi'
};

function weaponIdFor(character) {
  return character.weapon?.id || WEAPON_BY_CHARACTER[character.nm] || 'iaido';
}

export function createWeaponAttack({ character, stage, baseSlash, face, range }) {
  const weaponId = weaponIdFor(character);
  // 终结段由角色连段数据长度决定（连段长度可按角色不同）
  const final = stage === ((character.slash ? character.slash.length : 3) - 1);

  if (weaponId === 'iaido') {
    // 居合刀：终结段是突进一闪 —— 窄长判定 + 前冲 + 短无敌帧
    if (final) {
      return {
        weaponId,
        visual: 'iaido',
        movementBoost: 620,
        invuln: 0.15,
        hitArcs: [{ angle: face, half: 0.55, range: range * 1.6, damageMul: 1 }]
      };
    }
    return {
      weaponId,
      visual: 'iaido',
      movementBoost: 0,
      hitArcs: [{ angle: face, half: baseSlash.half, range, damageMul: 1 }]
    };
  }

  if (weaponId === 'dual') {
    // 双短刃：左右双刃同时前斩（交错弧）；终结段 X 斩 + 后撤步闪避
    if (final) {
      // 无敌帧收紧到 0.18s：避免高频连段把闪避 CD 削弱架空
      return {
        weaponId,
        visual: 'dualx',
        movementBoost: -420,
        invuln: 0.18,
        hitArcs: [{ angle: face, half: 1.5, range: range * 1.15, damageMul: 1 }]
      };
    }
    return {
      weaponId,
      visual: 'dual',
      movementBoost: 0,
      hitArcs: [
        { angle: face - 0.22, half: baseSlash.half * 0.9, range, damageMul: 1 },
        { angle: face + 0.22, half: baseSlash.half * 0.9, range: range * 0.94, damageMul: 1 }
      ]
    };
  }

  if (weaponId === 'odachi') {
    // 大太刀：宽弧重斩，终结段保留全周斩并附带震波
    const attack = {
      weaponId,
      visual: 'odachi',
      movementBoost: 0,
      hitArcs: [{ angle: face, half: baseSlash.half, range, damageMul: 1 }]
    };
    if (final) {
      attack.shockwave = { radius: 170, damage: 1, knockback: 460 };
    }
    return attack;
  }

  return {
    weaponId,
    visual: 'base',
    movementBoost: 0,
    hitArcs: [{ angle: face, half: baseSlash.half, range, damageMul: 1 }]
  };
}

// 冲刺斩：闪避后短窗口内攻击触发的角色专属突袭
export const DASH_STRIKES = {
  iaido:  { dur:.22, range:175, half:.5,      dmg:3, kb:620, hs:.08, nm:'瞬步斩' },
  dual:   { dur:.2,  range:125, half:Math.PI, dmg:2, kb:520, hs:.06, nm:'焰轮回旋' },
  odachi: { dur:.3,  range:150, half:Math.PI, dmg:2, kb:780, hs:.1,  nm:'碎地重斩' }
};

export function createDashStrikeAttack(weaponId, face, range) {
  if (weaponId === 'dual') {
    return {
      weaponId,
      visual: 'dual',
      movementBoost: 0,
      hitArcs: [
        { angle: face, half: 1.6, range, damageMul: 1 },
        { angle: face + Math.PI, half: 1.6, range, damageMul: 1 }
      ]
    };
  }
  if (weaponId === 'odachi') {
    return {
      weaponId,
      visual: 'odachi',
      movementBoost: 0,
      hitArcs: [{ angle: face, half: Math.PI, range, damageMul: 1 }],
      shockwave: { radius: 180, damage: 1, knockback: 540 }
    };
  }
  return {
    weaponId: 'iaido',
    visual: 'iaido',
    movementBoost: 560,
    invuln: 0.12,
    hitArcs: [{ angle: face, half: 0.5, range: range * 1.5, damageMul: 1 }]
  };
}

export function findHitArc(attack, origin, target) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const distance = Math.hypot(dx, dy);
  const angleToTarget = Math.atan2(dy, dx);

  return attack.hitArcs.find(arc =>
    distance < arc.range + target.r &&
    Math.abs(angDiff(arc.angle, angleToTarget)) < arc.half
  ) || null;
}

export function scaledDamage(baseDamage, arc) {
  return Math.max(1, Math.round(baseDamage * (arc?.damageMul || 1)));
}
