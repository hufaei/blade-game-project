import test from 'node:test';
import assert from 'node:assert/strict';

import { selectNemesis, completeRevenge } from '../src/systems/progression/revengeSystem.js';

test('revenge system selects the latest grave and rewards a clear once', () => {
  const graves = [
    { n: 'A', w: 2, k: 'swarm' },
    { n: 'B', w: 6, k: 'boss' }
  ];
  const nemesis = selectNemesis(graves, { boss: '巨型核心' });

  assert.deepEqual(nemesis, { name: 'B', wave: 6, killerType: 'boss', killer: '巨型核心' });

  const stats = { shards: 0, progression: { revengeClears: 0 } };
  const result = completeRevenge(stats, nemesis);

  assert.equal(result.reward, 40);
  assert.equal(stats.shards, 40);
  assert.equal(stats.progression.revengeClears, 1);
});
