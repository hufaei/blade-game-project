import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARS } from '../src/content/characters.js';
import { createWeaponAttack } from '../src/systems/combat/weaponRuntime.js';

test('blade combo is four arc slashes capped by a teleport draw-cut', () => {
  const finisher = createWeaponAttack({
    character: CHARS.blade,
    stage: CHARS.blade.slash.length - 1,
    baseSlash: CHARS.blade.slash[CHARS.blade.slash.length - 1],
    face: 0,
    range: 150
  });

  assert.equal(finisher.weaponId, 'iaido');
  assert.equal(finisher.visual, 'iaidash');
  assert.ok(finisher.dash && finisher.dash.dist > 200);
  assert.ok(Math.abs(finisher.dash.offset) > 0.3); // 终结拔刀斜斩（随机左/右）
  assert.ok(finisher.invuln > 0.1);

  const opener = createWeaponAttack({
    character: CHARS.blade,
    stage: 0,
    baseSlash: CHARS.blade.slash[0],
    face: 0,
    range: 118
  });
  assert.equal(opener.visual, 'iaido');           // 普通段为常规弧斩
  assert.equal(opener.dash, undefined);
  assert.equal(opener.hitArcs.length, 1);
});

test('ember attacks with twin blade arcs instead of one shared slash', () => {
  const attack = createWeaponAttack({
    character: CHARS.ember,
    stage: 1,
    baseSlash: CHARS.ember.slash[1],
    face: Math.PI / 2,
    range: 110
  });

  assert.equal(attack.weaponId, 'dual');
  assert.equal(attack.hitArcs.length, 2);
  assert.notEqual(attack.hitArcs[0].angle, attack.hitArcs[1].angle);
  assert.equal(attack.visual, 'dual');
});

test('frost heavy attack emits a built-in odachi shockwave', () => {
  const attack = createWeaponAttack({
    character: CHARS.frost,
    stage: 2,
    baseSlash: CHARS.frost.slash[2],
    face: 0,
    range: 184
  });

  assert.equal(attack.weaponId, 'odachi');
  assert.equal(attack.visual, 'odachi');
  assert.deepEqual(attack.shockwave, { radius: 170, damage: 1, knockback: 460 });
});
