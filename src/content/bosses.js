export const BOSSES = {
  bulwark: { nm:'核心壁垒 BULWARK', col:'#ff8c42', r:52, hp:w=>26+w*4 },
  prism:   { nm:'虚空棱镜 PRISM',   col:'#e85d9e', r:44, hp:w=>22+w*3.5 },
  reaper:  { nm:'蚀界收割者 REAPER', col:'#ff3b5c', r:46, hp:w=>24+w*4 },
  hive:    { nm:'增殖母巢 HIVE',    col:'#6ee07a', r:58, hp:w=>30+w*4.5 },
  mortar:  { nm:'轨道轰击者 MORTAR', col:'#ffd23f', r:50, hp:w=>30+w*4.2 },
  wraith:  { nm:'影主 WRAITH',       col:'#a45cff', r:46, hp:w=>26+w*4 }
};

export const BOSS_ORDER = ['bulwark','prism','reaper','hive','mortar','wraith'];

export function selectBoss(wave) {
  const kind = BOSS_ORDER[(Math.floor(wave/5) - 1) % BOSS_ORDER.length];
  return { kind, def: BOSSES[kind] };
}
