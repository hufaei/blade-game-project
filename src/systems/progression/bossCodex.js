const BOSS_INFO = {
  bulwark: {
    name: 'BULWARK',
    hint: '冲锋后硬直，是最安全的斩击窗口。'
  },
  prism: {
    name: 'PRISM',
    hint: '瞬移前会留下红色落点，提前脱离中心线。'
  },
  hive: {
    name: 'HIVE',
    hint: '召唤间隙会放慢，优先清掉蜂群。'
  },
  reaper: {
    name: 'REAPER',
    hint: '冲斩留下的焰痕会灼烧，背刺瞬移前盯紧红圈。'
  },
  mortar: {
    name: 'MORTAR',
    hint: '炮击落点提前一秒标记，持续移动别停脚。'
  },
  wraith: {
    name: 'WRAITH',
    hint: '影分身只是幻影，盯住带脉冲光环的真身；闪现后会放射影刃，别站在放射线上。'
  }
};

export function createDefaultBossCodex() {
  return {};
}

export function recordBossEncounter(codex, { kind, defeated }) {
  const key = kind || 'unknown';
  if (!codex[key]) codex[key] = { seen: 0, defeated: 0, hintUnlocked: false };
  codex[key].seen += 1;
  if (defeated) codex[key].defeated += 1;
  if (defeated || codex[key].seen >= 2) codex[key].hintUnlocked = true;
  return codex[key];
}

export function bossCodexSummary(codex) {
  const known = Object.entries(codex || {}).filter(([, v]) => v.seen > 0);
  if (!known.length) return 'Boss 图鉴：未接触核心体';
  return known.map(([kind, row]) => {
    const info = BOSS_INFO[kind] || { name: kind.toUpperCase(), hint: '情报不足。' };
    const hint = row.hintUnlocked ? info.hint : '弱点未解析';
    return `${info.name} ${row.defeated}/${row.seen} · ${hint}`;
  }).join(' ｜ ');
}
