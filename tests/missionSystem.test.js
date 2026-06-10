import test from 'node:test';
import assert from 'node:assert/strict';

import { createRunMissions, applyMissionRewards, createDefaultProgression, getUnlockedTechniques } from '../src/systems/progression/missionSystem.js';

test('run missions expose short-term goals for score, combo, and survival', () => {
  const missions = createRunMissions();

  assert.equal(missions.length, 3);
  assert.deepEqual(missions.map(m => m.id), ['score_8000', 'combo_20', 'wave_5']);
});

test('mission rewards persist completion and increase local progression', () => {
  const stats = {
    shards: 0,
    progression: createDefaultProgression()
  };
  const missions = createRunMissions();

  const result = applyMissionRewards({
    stats,
    missions,
    run: { score: 9000, maxCombo: 24, wave: 4, perfects: 1, characterId: 'ember' }
  });

  assert.deepEqual(result.completed.map(m => m.id), ['score_8000', 'combo_20']);
  assert.equal(stats.shards, 45);
  assert.equal(stats.progression.weaponMastery.ember.xp, 2);
  assert.ok(stats.progression.completedMissions.includes('score_8000'));
});

test('finishing all daily missions opens the night raid chain and unlocks a technique', () => {
  const stats = {
    shards: 0,
    progression: createDefaultProgression()
  };

  const result = applyMissionRewards({
    stats,
    missions: createRunMissions(),
    run: { score: 12000, maxCombo: 28, wave: 5, perfects: 2, characterId: 'blade' }
  });

  assert.equal(result.completed.length, 3);
  assert.equal(stats.progression.chain.nightRaidReady, true);
  assert.deepEqual(getUnlockedTechniques(stats.progression, 'blade'), ['刹那']);
});
