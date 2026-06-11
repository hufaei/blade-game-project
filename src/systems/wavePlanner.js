import { rnd } from '../core/math.js';

export function buildWavePlan({ wave, more }) {
  if (wave % 5 === 0) {
    const minions = 2 + Math.floor(wave/5);
    const spawnQueue = [];
    for (let i = 0; i < minions; i++) spawnQueue.push({ t: 2 + i * 1.6, type: 'swarm' });

    return {
      bossWave: true,
      spawnQueue,
      waveEndT: 2 + minions * 1.6
    };
  }

  let budget = (6 + wave * 3.0) * more;
  let t = 0.6;
  const pool = [['chaser',2],['swarm',1]];
  if (wave >= 2) pool.push(['tank',4]);
  if (wave >= 3) pool.push(['lunger',3]);
  if (wave >= 4) pool.push(['splitter',4]);
  if (wave >= 5) pool.push(['shooter',4]);
  if (wave >= 6) pool.push(['bomber',2]);
  if (wave >= 7) pool.push(['healer',5]);
  if (wave >= 8) pool.push(['shielder',4]);
  if (wave >= 9) pool.push(['phantom',3]);
  if (wave >= 11) pool.push(['charger',5]);
  if (wave >= 12) pool.push(['sniper',5]);
  if (wave >= 13) pool.push(['brood',6]);
  if (wave >= 14) pool.push(['vortex',6]);

  const spawnQueue = [];
  while (budget > 0) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick[0] === 'swarm') {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) spawnQueue.push({ t: t + i * 0.2, type: 'swarm' });
      budget -= n;
    } else {
      spawnQueue.push({ t, type: pick[0] });
      budget -= pick[1];
    }
    t += rnd(0.8, 1.9) * Math.max(0.45, 1 - wave * 0.05);
  }

  return {
    bossWave: false,
    spawnQueue,
    waveEndT: t
  };
}
