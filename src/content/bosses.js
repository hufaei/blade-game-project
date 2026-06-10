export const BOSSES = {
  bulwark: { nm:'核心壁垒 BULWARK', col:'#ff8c42', r:52, hp:w=>26+w*4 },
  prism:   { nm:'虚空棱镜 PRISM',   col:'#e85d9e', r:44, hp:w=>22+w*3.5 },
  hive:    { nm:'增殖母巢 HIVE',    col:'#6ee07a', r:58, hp:w=>30+w*4.5 }
};

export const BOSS_ORDER = ['bulwark','prism','hive'];

export function selectBoss(wave) {
  const kind = BOSS_ORDER[(Math.floor(wave/5) - 1) % BOSS_ORDER.length];
  return { kind, def: BOSSES[kind] };
}
