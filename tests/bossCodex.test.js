import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultBossCodex, recordBossEncounter, bossCodexSummary } from '../src/systems/progression/bossCodex.js';

test('boss codex records encounters, victories, and weakness hints', () => {
  const codex = createDefaultBossCodex();

  recordBossEncounter(codex, { kind: 'bulwark', defeated: false });
  recordBossEncounter(codex, { kind: 'bulwark', defeated: true });

  assert.equal(codex.bulwark.seen, 2);
  assert.equal(codex.bulwark.defeated, 1);
  assert.match(bossCodexSummary(codex), /BULWARK/);
  assert.match(bossCodexSummary(codex), /冲锋后硬直/);
});
