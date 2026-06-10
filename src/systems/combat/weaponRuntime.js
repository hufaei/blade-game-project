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
  const baseArc = { angle: face, half: baseSlash.half, range, damageMul: 1 };
  return {
    weaponId,
    visual: 'base',
    movementBoost: 0,
    hitArcs: [baseArc]
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
