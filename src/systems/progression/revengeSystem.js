export function selectNemesis(graves, names = {}) {
  if (!Array.isArray(graves) || !graves.length) return null;
  const grave = graves[graves.length - 1];
  return {
    name: grave.n || '无名刃客',
    wave: grave.w || 1,
    killerType: grave.k || 'chaser',
    killer: names[grave.k] || grave.k || '未知之物'
  };
}

export function completeRevenge(stats, nemesis) {
  if (!nemesis) return { reward: 0 };
  if (!stats.progression) stats.progression = {};
  stats.progression.revengeClears = (stats.progression.revengeClears || 0) + 1;
  const reward = 40;
  stats.shards += reward;
  return { reward, clears: stats.progression.revengeClears };
}
