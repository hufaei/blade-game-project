export function createDefaultProgression() {
  return {
    day: '',
    completedMissions: [],
    weaponMastery: {},
    chain: { nightRaidReady: false, clears: 0 },
    unlockedTechniques: {},
    bossCodex: {},
    revengeClears: 0
  };
}

export function createRunMissions() {
  return [
    {
      id: 'score_8000',
      title: '斩获 8,000 分',
      reward: 20,
      done: run => run.score >= 8000
    },
    {
      id: 'combo_20',
      title: '达成 20 连击',
      reward: 25,
      done: run => run.maxCombo >= 20
    },
    {
      id: 'wave_5',
      title: '抵达第 5 波',
      reward: 35,
      done: run => run.wave >= 5
    }
  ];
}

export function ensureDailyProgression(stats, day) {
  if (!stats.progression) stats.progression = createDefaultProgression();
  if (!stats.progression.weaponMastery) stats.progression.weaponMastery = {};
  if (!stats.progression.chain) stats.progression.chain = { nightRaidReady: false, clears: 0 };
  if (!stats.progression.unlockedTechniques) stats.progression.unlockedTechniques = {};
  if (!stats.progression.bossCodex) stats.progression.bossCodex = {};
  if (!Array.isArray(stats.progression.completedMissions)) stats.progression.completedMissions = [];
  if (stats.progression.day !== day) {
    stats.progression.day = day;
    stats.progression.completedMissions = [];
  }
}

function ensureWeaponMastery(stats, characterId) {
  if (!stats.progression.weaponMastery[characterId]) {
    stats.progression.weaponMastery[characterId] = { xp: 0, lv: 1 };
  }
  return stats.progression.weaponMastery[characterId];
}

const TECHNIQUES = {
  blade: [
    { lv: 2, name: '刹那' },
    { lv: 4, name: '残心' }
  ],
  ember: [
    { lv: 2, name: '回火' },
    { lv: 4, name: '双生残影' }
  ],
  frost: [
    { lv: 2, name: '破冰' },
    { lv: 4, name: '雪崩' }
  ]
};

export function getUnlockedTechniques(progression, characterId) {
  return progression.unlockedTechniques?.[characterId] || [];
}

function refreshTechniques(stats, characterId, level) {
  if (!stats.progression.unlockedTechniques) stats.progression.unlockedTechniques = {};
  const current = new Set(stats.progression.unlockedTechniques[characterId] || []);
  for (const tech of TECHNIQUES[characterId] || []) {
    if (level >= tech.lv) current.add(tech.name);
  }
  stats.progression.unlockedTechniques[characterId] = Array.from(current);
}

export function applyMissionRewards({ stats, missions, run }) {
  if (!stats.progression) stats.progression = createDefaultProgression();
  if (!Array.isArray(stats.progression.completedMissions)) stats.progression.completedMissions = [];

  const completed = [];
  let shards = 0;
  for (const mission of missions) {
    if (stats.progression.completedMissions.includes(mission.id)) continue;
    if (!mission.done(run)) continue;
    stats.progression.completedMissions.push(mission.id);
    completed.push(mission);
    shards += mission.reward;
  }

  stats.shards += shards;
  const mastery = ensureWeaponMastery(stats, run.characterId);
  mastery.xp += completed.length;
  mastery.lv = 1 + Math.floor(mastery.xp / 3);
  refreshTechniques(stats, run.characterId, mastery.lv);

  if (!stats.progression.chain) stats.progression.chain = { nightRaidReady: false, clears: 0 };
  const allDailyDone = missions.every(m => stats.progression.completedMissions.includes(m.id));
  if (allDailyDone) stats.progression.chain.nightRaidReady = true;

  return { completed, shards, mastery };
}

export function clearNightRaid(stats) {
  if (!stats.progression) stats.progression = createDefaultProgression();
  if (!stats.progression.chain) stats.progression.chain = { nightRaidReady: false, clears: 0 };
  stats.progression.chain.nightRaidReady = false;
  stats.progression.chain.clears = (stats.progression.chain.clears || 0) + 1;
  stats.shards += 80;
  return { reward: 80, clears: stats.progression.chain.clears };
}
