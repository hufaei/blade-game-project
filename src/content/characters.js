export const CHARS = {
  blade: { nm:'斩 · BLADE', ic:'△', col:'#7ee0ff', rgb:'126,224,255', hp:6, spd:320,
    weapon:{ id:'iaido', name:'居合刀', feel:'四连刀光 · 终结拔刀瞬斩' },
    desc:'居合刀\n四连斩 + 拔刀瞬斩', unlock:null, stat:'HP 6 · 速度 ●●●',
    slash:[{dur:.15,range:118,half:1.25,dmg:1,kb:420,hs:.045},{dur:.15,range:122,half:1.3,dmg:1,kb:440,hs:.045},{dur:.16,range:126,half:1.3,dmg:1,kb:460,hs:.05},{dur:.16,range:130,half:1.35,dmg:1,kb:480,hs:.05},{dur:.24,range:150,half:Math.PI,dmg:3,kb:560,hs:.09}] },
  ember: { nm:'燹 · EMBER', ic:'▲', col:'#ff7a3c', rgb:'255,122,60', hp:5, spd:348, burn:true,
    weapon:{ id:'dual', name:'双短刃', feel:'双刃交错 · X斩后撤闪避' },
    desc:'双短刃\n交错连斩 X斩后撤', unlock:{ txt:'累计击杀 120 解锁', ok:s=>s.totalKills>=120, prog:s=>[Math.min(s.totalKills,120),120] }, stat:'HP 5 · 速度 ●●●●',
    slash:[{dur:.11,range:102,half:1.15,dmg:1,kb:340,hs:.035},{dur:.11,range:106,half:1.2,dmg:1,kb:360,hs:.035},{dur:.11,range:110,half:1.2,dmg:1,kb:380,hs:.04},{dur:.11,range:114,half:1.25,dmg:1,kb:400,hs:.04},{dur:.22,range:138,half:1.5,dmg:2,kb:520,hs:.07}] },
  frost: { nm:'霜 · FROST', ic:'◇', col:'#b9a8ff', rgb:'185,168,255', hp:7, spd:288, slow:true,
    weapon:{ id:'odachi', name:'大太刀', feel:'宽刃压制 · 全周斩冰封领域' },
    desc:'大太刀\n重斩震波 冰封领域', unlock:{ txt:'最深波次 6 解锁', ok:s=>s.bestWave>=6, prog:s=>[Math.min(s.bestWave,6),6] }, stat:'HP 7 · 速度 ●●',
    slash:[{dur:.3,range:144,half:1.35,dmg:1,kb:560,hs:.055},{dur:.3,range:150,half:1.45,dmg:1,kb:620,hs:.06},{dur:.5,range:184,half:Math.PI,dmg:3,kb:880,hs:.11}] },
  shade: { nm:'影 · SHADE', ic:'✶', col:'#a45cff', rgb:'164,92,255', hp:4, spd:362,
    weapon:{ id:'kunai', name:'苦无', feel:'苦无飞掷 · 标记瞬影斩' },
    desc:'苦无\n远程飞掷 + 标记瞬影', unlock:{ txt:'最深波次 10 解锁', ok:s=>s.bestWave>=10, prog:s=>[Math.min(s.bestWave,10),10] }, stat:'HP 4 · 速度 ●●●●●',
    slash:[{dur:.13,range:120,half:.4,dmg:1,kb:200,hs:.03},{dur:.13,range:122,half:.4,dmg:1,kb:210,hs:.03},{dur:.13,range:124,half:.4,dmg:1,kb:220,hs:.035},{dur:.2,range:130,half:.4,dmg:1,kb:260,hs:.05}] }
};
