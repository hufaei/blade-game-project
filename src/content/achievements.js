export const ACHS = [
  { id:'k100', ic:'⚔', nm:'初露锋芒', ds:'累计击杀100', p:s=>[Math.min(s.totalKills,100),100] },
  { id:'boss', ic:'⬢', nm:'弑核者', ds:'击败Boss' },
  { id:'c30', ic:'✦', nm:'行云流水', ds:'单局30连击', p:s=>[Math.min(s.bestCombo,30),30] },
  { id:'w10', ic:'♦', nm:'深渊行者', ds:'到达第10波', p:s=>[Math.min(s.bestWave,10),10] },
  { id:'p5', ic:'◎', nm:'见切', ds:'单局5次完美闪避' },
  { id:'u3', ic:'⚡', nm:'居合宗师', ds:'单局3次必杀' },
  { id:'s', ic:'★', nm:'S级刃客', ds:'获得S评价' },
  { id:'lb', ic:'♛', nm:'榜上有名', ds:'登上公开排行榜' },
  { id:'avenge', ic:'⚰', nm:'渡魂人', ds:'为10位倒下的刃客复仇', p:s=>[Math.min(s.avenged||0,10),10] }
];
