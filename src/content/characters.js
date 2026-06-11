export const CHARS = {
  blade: { nm:'斩 · BLADE', ic:'△', col:'#7ee0ff', rgb:'126,224,255', hp:6, spd:320,
    weapon:{ id:'iaido', name:'居合刀', feel:'锁定破绽 · 第三段突进一闪' },
    desc:'居合刀\n精准突进斩', unlock:null, stat:'HP 6 · 速度 ●●●',
    slash:[{dur:.18,range:118,half:1.25,dmg:1,kb:460,hs:.045},{dur:.18,range:124,half:1.35,dmg:1,kb:520,hs:.05},{dur:.3,range:150,half:Math.PI,dmg:3,kb:760,hs:.09}] },
  ember: { nm:'燹 · EMBER', ic:'▲', col:'#ff7a3c', rgb:'255,122,60', hp:5, spd:348, burn:true,
    weapon:{ id:'dual', name:'双短刃', feel:'双弧连斩 · 高速压制' },
    desc:'双短刃\n双弧连斩 点燃敌人', unlock:{ txt:'累计击杀 120 解锁', ok:s=>s.totalKills>=120, prog:s=>[Math.min(s.totalKills,120),120] }, stat:'HP 5 · 速度 ●●●●',
    slash:[{dur:.13,range:102,half:1.2,dmg:1,kb:380,hs:.04},{dur:.13,range:108,half:1.3,dmg:1,kb:420,hs:.04},{dur:.22,range:130,half:Math.PI,dmg:2,kb:640,hs:.08}] },
  frost: { nm:'霜 · FROST', ic:'◇', col:'#b9a8ff', rgb:'185,168,255', hp:7, spd:288, slow:true,
    weapon:{ id:'odachi', name:'大太刀', feel:'宽刃压制 · 重斩震波' },
    desc:'大太刀\n重斩震波 减速敌人', unlock:{ txt:'最深波次 6 解锁', ok:s=>s.bestWave>=6, prog:s=>[Math.min(s.bestWave,6),6] }, stat:'HP 7 · 速度 ●●',
    slash:[{dur:.24,range:144,half:1.35,dmg:1,kb:560,hs:.055},{dur:.24,range:150,half:1.45,dmg:1,kb:620,hs:.06},{dur:.4,range:184,half:Math.PI,dmg:3,kb:880,hs:.11}] }
};
