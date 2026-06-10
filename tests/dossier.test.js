import test from 'node:test';
import assert from 'node:assert/strict';

import { createDossier } from '../src/systems/progression/dossier.js';

test('dossier creates a compact mission brief from character, mutation, and nemesis', () => {
  const dossier = createDossier({
    characterName: '斩 · BLADE',
    weaponName: '居合刀',
    mutationName: '狂暴日',
    nemesis: { name: '无名刃客', killer: '猎杀三角', wave: 4 },
    chainReady: true
  });

  assert.match(dossier.title, /任务档案/);
  assert.ok(dossier.lines.some(line => line.includes('居合刀')));
  assert.ok(dossier.lines.some(line => line.includes('宿敌')));
  assert.ok(dossier.lines.some(line => line.includes('夜袭')));
});
