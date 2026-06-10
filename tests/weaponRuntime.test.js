import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARS } from '../src/content/characters.js';
import { createWeaponAttack } from '../src/systems/combat/weaponRuntime.js';

test('blade stage three is a decisive iaido strike with forward commitment', () => {
  const attack = createWeaponAttack({
    character: CHARS.blade,
    stage: 2,
    baseSlash: CHARS.blade.slash[2],
    face: 0,
    range: 150
  });

  assert.equal(attack.weaponId, 'iaido');
  assert.equal(attack.visual, 'iaido');
  assert.equal(attack.hitArcs.length, 1);
  assert.ok(attack.movementBoost > 220);
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
