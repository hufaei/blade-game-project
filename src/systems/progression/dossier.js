export function createDossier({ characterName, weaponName, mutationName, nemesis, chainReady }) {
  const title = `任务档案 · ${characterName}`;
  const lines = [
    `武器：${weaponName}`,
    `环境：${mutationName}`,
    chainReady ? '链式目标：夜袭许可已开放' : '链式目标：完成今日修行以开放夜袭',
  ];

  if (nemesis) {
    lines.push(`宿敌：${nemesis.name} 死于第 ${nemesis.wave} 波的 ${nemesis.killer}`);
  } else {
    lines.push('宿敌：暂无复仇目标');
  }

  return { title, lines };
}
