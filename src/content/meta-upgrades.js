export const META = [
  { id:'hp', nm:'强化核心', ds:'初始生命上限 +1', max:2, cost:l=>[60,180][l] },
  { id:'ult', nm:'预充能', ds:'开局必杀能量 +25%', max:2, cost:l=>[50,150][l] },
  { id:'range', nm:'锻刃', ds:'攻击范围永久 +5%', max:2, cost:l=>[80,200][l] },
  { id:'card', nm:'命运馈赠', ds:'每局开局自带一张随机强化', max:1, cost:l=>250 }
];
