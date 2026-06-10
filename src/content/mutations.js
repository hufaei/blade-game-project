export const MUTS = [
  { nm:'狂暴日', ds:'敌人速度 +30%', f:m=>m.espd=1.3 },
  { nm:'玻璃大炮', ds:'生命上限 3 · 全伤害 +1', f:m=>{m.hp3=true;m.dmg=1;} },
  { nm:'黄金潮', ds:'得分 ×2 · 敌人 +50%', f:m=>{m.sc=2;m.more=1.5;} },
  { nm:'迅影日', ds:'冲刺无冷却', f:m=>m.nocd=true },
  { nm:'飓风日', ds:'击退 ×2', f:m=>m.kb=2 },
  { nm:'精英横行', ds:'精英率 ×3 · 得分 ×1.5', f:m=>{m.elite=3;m.sc=1.5;} }
];

export function todayKey() {
  const n = new Date();
  return n.getFullYear() + '-' + (n.getMonth()+1) + '-' + n.getDate();
}

export function weekKey() {
  const n = new Date();
  const j1 = new Date(n.getFullYear(), 0, 1);
  const w = Math.ceil((((n - j1) / 86400000) + j1.getDay() + 1) / 7);
  return n.getFullYear() + 'w' + w;
}

export function todayMut() {
  const n = new Date();
  return MUTS[(n.getFullYear()*372 + n.getMonth()*31 + n.getDate()) % MUTS.length];
}

export function createDefaultMutation() {
  return { espd:1, dmg:0, sc:1, more:1, nocd:false, kb:1, elite:1, hp3:false };
}
