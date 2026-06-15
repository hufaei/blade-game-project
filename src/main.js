import { $ } from './core/dom.js';
import { TAU, angDiff, clamp, lerp, rnd } from './core/math.js';
import { initAudio, resumeAudio, setMuted, setMusicIntensity, sfx, startMusic, stopMusic } from './core/audio.js';
import { CHARS } from './content/characters.js';
import { ACHS } from './content/achievements.js';
import { META } from './content/meta-upgrades.js';
import { BOSS_ORDER } from './content/bosses.js';
import { createDefaultMutation, todayKey, todayMut, weekKey } from './content/mutations.js';
import { KNAMES } from './content/enemies.js';
import { RAR, createDefaultSkillState, createPerks } from './content/perks.js';
import { buildWavePlan } from './systems/wavePlanner.js';
import { createBoss, createEnemy, markHunter } from './systems/spawnFactory.js';
import { createStorageAdapter } from './systems/storage/storageAdapter.js';
import { DASH_STRIKES, createDashStrikeAttack, createWeaponAttack, findHitArc, scaledDamage } from './systems/combat/weaponRuntime.js';
import { applyMissionRewards, clearNightRaid, createDefaultProgression, createRunMissions, ensureDailyProgression, getUnlockedTechniques } from './systems/progression/missionSystem.js';
import { bossCodexSummary, recordBossEncounter } from './systems/progression/bossCodex.js';
import { createDossier } from './systems/progression/dossier.js';
import { completeRevenge, selectNemesis } from './systems/progression/revengeSystem.js';

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const storage = createStorageAdapter(window);
let W = 0, H = 0, VIEW_Z = 1;
function resize(){
  cv.width = innerWidth; cv.height = innerHeight;
  // 手机端略微广角；世界为视口的 1.9 倍，镜头跟随角色（角色始终居中）
  VIEW_Z = (innerWidth < 700 || matchMedia('(pointer: coarse)').matches) ? 0.88 : 1;
  W = Math.round(innerWidth / VIEW_Z * 1.9);
  H = Math.round(innerHeight / VIEW_Z * 1.9);
}
addEventListener('resize', resize); resize();
// 视口（世界单位）与镜头左上角
function viewW(){ return cv.width / VIEW_Z; }
function viewH(){ return cv.height / VIEW_Z; }
// 死区跟随镜头：角色在中央死区框内自由移动、镜头完全不动（完整位移感，等同居中改动之前的静态镜头）；
// 只有冲出死区时镜头才平滑追到框边缘，且停在边缘不回中 —— 既保住位移感又不会把角色跟丢出屏幕。
const CAM_DEAD = 0.3;       // 死区半径（占视野短边比例）：框内镜头静止，越大越接近老的静态镜头手感
const CAM_FOLLOW = 0.001;   // 出框后镜头追赶平滑度（越小追得越慢、瞬移甩得越远）
let camCX = null, camCY = null;   // 镜头中心（世界坐标，null=刚开局吸附到角色）
function updateCamera(dt){
  if (camCX === null){ camCX = P.x; camCY = P.y; return; }
  const ox = P.x - camCX, oy = P.y - camCY, dd = Math.hypot(ox, oy);
  const dead = Math.min(viewW(), viewH()) * CAM_DEAD;
  if (dd > dead){   // 仅当冲出死区，才把镜头朝角色追"超出的那部分"
    const pull = (dd - dead) * (1 - Math.pow(CAM_FOLLOW, dt));
    camCX += ox / dd * pull; camCY += oy / dd * pull;
  }
}
function camX(){ return (camCX === null ? P.x : camCX) - viewW() / 2; }
function camY(){ return (camCY === null ? P.y : camCY) - viewH() / 2; }

let charId = 'blade';
let PC = CHARS.blade;

// ---------- 每日变异 ----------
let MUT = {};
let dailyMode = false;
function resetMut(){ MUT = createDefaultMutation(); }

// ---------- 成就 ----------
function achEarned(id){
  if (stats.ach.includes(id)) return;
  stats.ach.push(id);
  saveStats();
  toast('🏆 成就达成 · ' + ACHS.find(a => a.id === id).nm);
  sfx('ach');
  renderAchs();
}
function toast(txt){
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = txt;
  $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 3900);
}

// ---------- 持久化 ----------
let stats = { hi:0, bestWave:0, totalKills:0, games:0, bestCombo:0, ach:[], sel:'blade', daily:{}, dev:false,
  shards:0, meta:{ hp:0, ult:0, range:0, card:0 }, streak:{ d:'', n:0 }, pname:'', avenged:0, progression:createDefaultProgression() };
let lbAll = [], lbWeek = [], curTab = 'week';
let gravesPool = [], gravesRun = [];
let worldKills = 0;
let lbSubmitted = false;
let runMissions = createRunMissions();
let lastMissionReward = { completed: [], shards: 0, mastery: null };
let raidMode = false;
let runNemesis = null;
let lastBossKind = null;
async function loadSaves(){
  try {
    const r = await storage.get('blade_stats');
    if (r && r.value){
      const s = JSON.parse(r.value);
      stats = Object.assign(stats, s);
      if (!Array.isArray(stats.ach)) stats.ach = [];
      if (!stats.daily) stats.daily = {};
      if (!stats.meta) stats.meta = { hp:0, ult:0, range:0, card:0 };
      if (!stats.streak) stats.streak = { d:'', n:0 };
      if (!stats.progression) stats.progression = createDefaultProgression();
    }
  } catch(e){}
  setMuted(!!stats.muted);
  ensureDailyProgression(stats, todayKey());
  try { const r = await storage.get('blade_lb', true); if (r && r.value) lbAll = JSON.parse(r.value); } catch(e){}
  try { const r = await storage.get('blade_lbw_' + weekKey(), true); if (r && r.value) lbWeek = JSON.parse(r.value); } catch(e){}
  try { const r = await storage.get('blade_graves', true); if (r && r.value) gravesPool = JSON.parse(r.value); } catch(e){}
  try { const r = await storage.get('blade_world', true); if (r && r.value) worldKills = JSON.parse(r.value).k || 0; } catch(e){}
  if (CHARS[stats.sel] && (stats.dev || !CHARS[stats.sel].unlock || CHARS[stats.sel].unlock.ok(stats))) charId = stats.sel;
  renderMenuMeta(); renderChars(); renderAchs(); renderMeta(); renderProgressionPanel(); renderMenuLb();
}
async function saveStats(){
  try { await storage.set('blade_stats', JSON.stringify(stats)); } catch(e){}
}
async function submitScore(name){
  let ok = false;
  try {
    let cur = [];
    try { const r = await storage.get('blade_lb', true); if (r && r.value) cur = JSON.parse(r.value); } catch(e){}
    cur.push({ n:name.slice(0,8), s:score, w:wave, c:PC.ic });
    cur.sort((a, b) => b.s - a.s);
    cur = cur.slice(0, 10).map(x => ({ n:x.n, s:x.s, w:x.w, c:x.c || '' }));
    await storage.set('blade_lb', JSON.stringify(cur), true);
    lbAll = cur;
    ok = true;
  } catch(e){}
  try {
    const wk = 'blade_lbw_' + weekKey();
    let cur = [];
    try { const r = await storage.get(wk, true); if (r && r.value) cur = JSON.parse(r.value); } catch(e){}
    cur.push({ n:name.slice(0,8), s:score, w:wave, c:PC.ic });
    cur.sort((a, b) => b.s - a.s);
    cur = cur.slice(0, 10).map(x => ({ n:x.n, s:x.s, w:x.w, c:x.c || '' }));
    await storage.set(wk, JSON.stringify(cur), true);
    lbWeek = cur;
    ok = true;
  } catch(e){}
  return ok;
}
const MILES = [10000, 50000, 100000, 500000, 1000000, 5000000, 10000000, 50000000];
function renderMenuMeta(){
  ensureDailyProgression(stats, todayKey());
  const dm = todayMut();
  $('dailyHint').textContent = `今日变异「${dm.nm}」· ${dm.ds}` + (stats.daily.d === todayKey() ? ` · 今日最佳 ${stats.daily.s}` : '');
  $('menuHi').textContent = stats.hi > 0
    ? `个人最佳 ${stats.hi} ｜ 最深波次 ${stats.bestWave} ｜ 总击杀 ${stats.totalKills} ｜ 场次 ${stats.games}`
    : '首次挑战 · 创造你的纪录';
  $('hiEl').textContent = stats.hi > 0 ? 'BEST ' + stats.hi : '';
  $('streakEl').textContent = stats.streak.n > 1 ? '🔥 连续征战 ' + stats.streak.n + ' 天' : (stats.streak.n === 1 ? '🔥 征战首日 · 明天回来续上火种' : '');
  const next = MILES.find(m => m > worldKills) || worldKills * 2;
  $('worldEl').textContent = `⚔ 本机刃客已累计斩杀 ${worldKills.toLocaleString()} 几何体 · 下一里程碑 ${next.toLocaleString()}`;
}
function renderProgressionPanel(){
  const missionEl = $('missionsEl');
  if (!missionEl) return;
  ensureDailyProgression(stats, todayKey());
  const nemesis = selectNemesis(gravesPool, KNAMES);
  const c = CHARS[charId];
  const dossier = createDossier({
    characterName: c.nm,
    weaponName: c.weapon?.name || c.nm,
    mutationName: todayMut().nm,
    nemesis,
    chainReady: !!stats.progression.chain?.nightRaidReady
  });
  const dossierEl = $('dossierEl');
  if (dossierEl) {
    dossierEl.innerHTML = `<div class="dossier-title">${dossier.title}</div>` +
      dossier.lines.map(line => `<div class="dossier-line">${line}</div>`).join('');
  }
  missionEl.innerHTML = runMissions.map(m => {
    const done = stats.progression.completedMissions.includes(m.id);
    return `<div class="mission-row${done ? ' done' : ''}"><span>${done ? '✓' : '·'} ${m.title}</span><b>✧${m.reward}</b></div>`;
  }).join('');

  const mastery = stats.progression.weaponMastery?.[charId] || { xp:0, lv:1 };
  const techs = getUnlockedTechniques(stats.progression, charId);
  $('masteryEl').innerHTML = `<div class="mastery-line">${c.weapon?.name || c.nm} 熟练度 LV ${mastery.lv || 1} · ${(mastery.xp || 0) % 3}/3 下级${techs.length ? ' · 已悟 ' + techs.join(' / ') : ''}</div>`;
  const codexEl = $('codexEl');
  if (codexEl) codexEl.textContent = bossCodexSummary(stats.progression.bossCodex);
  const chainEl = $('chainEl');
  if (chainEl) chainEl.textContent = stats.progression.chain?.nightRaidReady ? '夜袭许可：已开放 · 从第 5 波核心战开始' : '夜袭许可：完成三项今日修行后开放';
  const raidBtn = $('raidBtn');
  if (raidBtn) raidBtn.disabled = !stats.progression.chain?.nightRaidReady;
}
function renderChars(){
  const el = $('charsEl');
  el.innerHTML = '';
  for (const [id, c] of Object.entries(CHARS)){
    const locked = c.unlock && !c.unlock.ok(stats) && !stats.dev;
    const d = document.createElement('div');
    d.className = 'char-card' + (locked ? ' lock' : '') + (id === charId ? ' sel' : '');
    d.style.setProperty('--c', c.col);
    d.style.setProperty('--cs', c.col + '55');
    let lockHtml = '';
    if (locked){
      const p = c.unlock.prog(stats);
      lockHtml = `<div class="cl">🔒 ${c.unlock.txt}<br>进度 ${p[0]} / ${p[1]}</div><div class="prog"><i style="width:${p[0]/p[1]*100}%"></i></div>`;
    }
    d.innerHTML = `<div class="ci">${c.ic}</div><div class="cn">${c.nm}</div><div class="cd">${locked ? '？？？' : c.desc}</div>` +
      (locked ? lockHtml : `<div class="cstat">${c.weapon?.feel || c.stat}<br>${c.stat}</div>`);
    if (!locked) d.onclick = () => { charId = id; PC = c; stats.sel = id; saveStats(); sfx('pick'); renderChars(); renderProgressionPanel(); };
    el.appendChild(d);
  }
}
function renderAchs(){
  const el = $('achsEl');
  el.innerHTML = '';
  for (const a of ACHS){
    const d = document.createElement('div');
    const got = stats.ach.includes(a.id);
    d.className = 'ach' + (got ? ' on' : '');
    d.textContent = a.ic;
    let tip = a.nm + ' · ' + a.ds;
    if (!got && a.p){ const p = a.p(stats); tip += `（${p[0]}/${p[1]}）`; }
    d.title = tip;
    el.appendChild(d);
  }
}
function renderMeta(){
  $('shardsEl').textContent = stats.shards;
  const el = $('metaList');
  el.innerHTML = '';
  META.forEach(m => {
    const lv = stats.meta[m.id] || 0;
    const row = document.createElement('div');
    row.className = 'meta-row';
    row.innerHTML = `<span class="mn">${m.nm}</span><span class="md">${m.ds}</span><span class="lv">${'●'.repeat(lv)}${'○'.repeat(m.max - lv)}</span>`;
    const b = document.createElement('button');
    b.className = 'mbuy';
    if (lv >= m.max){ b.textContent = 'MAX'; b.disabled = true; }
    else {
      const cost = m.cost(lv);
      b.textContent = '✧' + cost;
      b.disabled = stats.shards < cost;
      b.onclick = () => {
        stats.shards -= cost;
        stats.meta[m.id] = lv + 1;
        saveStats(); sfx('pick'); renderMeta();
      };
    }
    row.appendChild(b);
    el.appendChild(row);
  });
}
function renderLb(el, arr, title, hlName){
  if (!arr.length){ el.innerHTML = `<div class="lb-title">— ${title} · 虚位以待 —</div><div class="lb-note">榜单为所有玩家共享，上榜名字公开可见</div>`; return; }
  let h = `<div class="lb-title">— ${title} —</div>`;
  arr.forEach((r, i) => {
    h += `<div class="lb-row${hlName && r.n === hlName ? ' me' : ''}"><span class="rk">${i+1}</span><span class="nm">${(r.c||'')+' '+r.n.replace(/</g,'&lt;')}</span><span>W${r.w}</span><span style="width:80px;text-align:right">${r.s}</span></div>`;
  });
  h += '<div class="lb-note">榜单为所有玩家共享，上榜名字公开可见 · 周榜每周一重置</div>';
  el.innerHTML = h;
}
function renderMenuLb(hl){
  $('tabW').classList.toggle('on', curTab === 'week');
  $('tabA').classList.toggle('on', curTab === 'all');
  if (curTab === 'week') renderLb($('menuLb'), lbWeek, '本周排行榜 TOP 10', hl);
  else renderLb($('menuLb'), lbAll, '历史总榜 TOP 10', hl);
}
$('tabW').onclick = () => { curTab = 'week'; renderMenuLb(); };
$('tabA').onclick = () => { curTab = 'all'; renderMenuLb(); };

function refreshMenuPanels(){
  renderMenuMeta();
  renderChars();
  renderAchs();
  renderMeta();
  renderProgressionPanel();
  renderMenuLb();
}

function unlockDebugProgression(){
  ensureDailyProgression(stats, todayKey());
  stats.dev = true;
  stats.totalKills = Math.max(stats.totalKills || 0, 120);
  stats.bestWave = Math.max(stats.bestWave || 0, 10);
  stats.shards = Math.max(stats.shards || 0, 9999);
  stats.meta = stats.meta || {};
  for (const m of META) stats.meta[m.id] = m.max;

  const missions = createRunMissions();
  const completed = new Set(stats.progression.completedMissions || []);
  for (const m of missions) completed.add(m.id);
  stats.progression.completedMissions = Array.from(completed);
  stats.progression.chain = {
    ...(stats.progression.chain || {}),
    nightRaidReady: true,
    clears: stats.progression.chain?.clears || 0
  };

  const devTechniques = {
    blade: ['刹那', '残心'],
    ember: ['回火', '双生残影'],
    frost: ['破冰', '雪崩']
  };
  stats.progression.weaponMastery = stats.progression.weaponMastery || {};
  stats.progression.unlockedTechniques = stats.progression.unlockedTechniques || {};
  for (const id of Object.keys(CHARS)){
    const cur = stats.progression.weaponMastery[id] || { xp:0, lv:1 };
    stats.progression.weaponMastery[id] = {
      xp: Math.max(cur.xp || 0, 9),
      lv: Math.max(cur.lv || 1, 4)
    };
    stats.progression.unlockedTechniques[id] = Array.from(new Set([
      ...(stats.progression.unlockedTechniques[id] || []),
      ...(devTechniques[id] || [])
    ]));
  }

  stats.progression.bossCodex = stats.progression.bossCodex || {};
  for (const kind of BOSS_ORDER){
    const cur = stats.progression.bossCodex[kind] || { seen:0, defeated:0, hintUnlocked:false };
    stats.progression.bossCodex[kind] = {
      seen: Math.max(cur.seen || 0, 3),
      defeated: Math.max(cur.defeated || 0, 1),
      hintUnlocked: true
    };
  }

  if (!Array.isArray(gravesPool)) gravesPool = [];
  if (!gravesPool.length) gravesPool.push({ n:'调试残影', w:6, k:'boss' });
  storage.set('blade_graves', JSON.stringify(gravesPool), true).catch(() => {});
  saveStats();
  if (state === 'play'){
    ult = 100;
    P.hp = P.maxHp;
    buildHearts();
  }
  refreshMenuPanels();
  toast('🔓 调试模式 · 全角色 / 满级武器 / 夜袭 / 图鉴已开放');
}

// ---------- 状态 ----------
const keys = {};
let state = 'menu';
let timeScale = 1, hitstop = 0, slowmo = 0, wt = 0;
let shake = 0, shakeX = 0, shakeY = 0, flashA = 0;
let score = 0, wave = 0, kills = 0, maxCombo = 0, perfects = 0, ults = 0, bossKills = 0;
let combo = 0, comboT = 0;
let ult = 0, ultFiring = 0, ultLines = [], ultEvents = [];
let lifestealCnt = 0;
let lastKiller = 'chaser';
let pdCD = 0, shieldT = 0;
let waveEndT = 0, stallT = 0, stallWarned = false;
let explosionsQ = [], pulses = [], healFx = [];
const BASE_COMBO_WIN = 2.4;

let ST = createDefaultSkillState();
function resetST(){
  for (const key of Object.keys(ST)) delete ST[key];
  Object.assign(ST, createDefaultSkillState());
}
let owned = [];

const P = {
  x:0, y:0, vx:0, vy:0, face:0, hp:6, maxHp:6, r:14, spd:320,
  atkStage:0, atkT:0, atkBuf:false, atkCool:0,
  dashT:0, dashCD:0, inv:0, dvx:0, dvy:0, trail:[], dashStrikeT:0
};
let dashStrikeActive = false, pdCritReady = false;
function aspdNow(){ return ST.aspd * (combo >= 20 ? 1.2 : combo >= 10 ? 1.1 : 1); }
const PERKS = createPerks({ ST, P, buildHearts });
let enemies = [], particles = [], slashes = [], floats = [], spawnQ = [], rings = [], blades = [], eshots = [];
let boss = null;
let waveSpawnT = 0, waveDone = false;
let curCards = [];
// 经验等级制
let level = 1, xp = 0, pendingLevels = 0, gems = [], gemStreak = 0, gemStreakT = 0;
function xpNeed(){ return 10 + (level - 1) * 8; }
// 自动武器 / Boss 危险区
let orbitA = 0, seekT = 0, darts = [], firetrails = [], impacts = [];
let icefields = [];   // 霜：冰封领域
let cutmarks = [];    // 斩：拔刀斩痕（路径命中的斩杀特效）

// ---------- 输入 ----------
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  const attackKey = k === 'j' || k === 'keyj' || k === ' ' || k === 'space' || e.code === 'KeyJ' || e.code === 'Space';
  keys[k] = true;
  if (attackKey || ['arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
  if (k === 'm' && state !== 'over' && document.activeElement !== $('nameIn')) toggleMute();
  if (state === 'play'){
    if (attackKey) P.atkBuf = true;
    if (k === 'k' || k === 'shift') tryDash();
    if (k === 'l') tryUlt();
    if (k === 'p'){ state = 'pause'; banner('PAUSED'); }
  } else if (state === 'pause'){
    if (k === 'p') state = 'play';
  } else if (state === 'upgrade'){
    const n = parseInt(k);
    if (n >= 1 && n <= curCards.length) pickCard(n - 1);
  } else if (state === 'over'){
    if (k === 'r' && document.activeElement !== $('nameIn')) startGame(dailyMode);
    if ((k === 'm' || k === 'keym' || e.code === 'KeyM') && document.activeElement !== $('nameIn')) returnToMenu();
  }
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// ---------- 触控 ----------
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || location.search.includes('touch=1');
let tvx = 0, tvy = 0, tAtkHeld = false;
if (IS_TOUCH){
  document.body.classList.add('touch');
  const zone = $('stickZone'), stick = $('stick'), knob = $('stickKnob');
  let stickId = null, sbx = 0, sby = 0;
  const R = 52;

  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (stickId !== null) return;
    const t = e.changedTouches[0];
    stickId = t.identifier; sbx = t.clientX; sby = t.clientY;
    stick.style.left = sbx + 'px'; stick.style.top = sby + 'px';
    stick.classList.add('on');
  }, { passive:false });

  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches){
      if (t.identifier !== stickId) continue;
      let dx = t.clientX - sbx, dy = t.clientY - sby;
      const l = Math.hypot(dx, dy);
      if (l > R){ dx = dx / l * R; dy = dy / l * R; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      const dead = 10;
      if (l < dead){ tvx = 0; tvy = 0; }
      else { tvx = dx / R; tvy = dy / R; const n = Math.hypot(tvx, tvy); if (n > 1){ tvx /= n; tvy /= n; } }
    }
  }, { passive:false });

  const stickEnd = e => {
    for (const t of e.changedTouches){
      if (t.identifier !== stickId) continue;
      stickId = null; tvx = 0; tvy = 0;
      knob.style.transform = '';
      stick.classList.remove('on');
    }
  };
  zone.addEventListener('touchend', stickEnd);
  zone.addEventListener('touchcancel', stickEnd);

  const bind = (id, down, up) => {
    const el = $(id);
    el.addEventListener('touchstart', e => { e.preventDefault(); down(); }, { passive:false });
    if (up){
      el.addEventListener('touchend', e => { e.preventDefault(); up(); }, { passive:false });
      el.addEventListener('touchcancel', up);
    }
  };
  bind('tAtk', () => { if (state === 'play'){ P.atkBuf = true; tAtkHeld = true; } }, () => tAtkHeld = false);
  bind('tDash', () => { if (state === 'play') tryDash(); });
  bind('tUlt', () => { if (state === 'play') tryUlt(); });
  bind('tPause', () => {
    if (state === 'play'){ state = 'pause'; banner('PAUSED'); }
    else if (state === 'pause') state = 'play';
  });
}

function toggleMute(){
  stats.muted = !stats.muted;
  setMuted(stats.muted);
  saveStats();
  toast(stats.muted ? '🔇 已静音 · 按 M 恢复' : '🔊 声音已开启');
}

// ---------- 流程 ----------
function updateStreak(){
  const t = todayKey();
  if (stats.streak.d === t) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yk = y.getFullYear() + '-' + (y.getMonth()+1) + '-' + y.getDate();
  stats.streak = { d:t, n: stats.streak.d === yk ? stats.streak.n + 1 : 1 };
  saveStats();
  if (stats.streak.n > 1) toast('🔥 连续征战 ' + stats.streak.n + ' 天');
}
async function enterLandscape(){
  if (!IS_TOUCH) return;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI:'hide' });
  } catch(e){}
  try { await screen.orientation.lock('landscape'); } catch(e){}
  if (matchMedia('(orientation: portrait)').matches) toast('↻ 横屏体验更佳 · 请旋转设备');
}

function startGame(daily, raid = false){
  initAudio(); resumeAudio();
  enterLandscape();
  ensureDailyProgression(stats, todayKey());
  runMissions = createRunMissions();
  lastMissionReward = { completed: [], shards: 0, mastery: null };
  raidMode = !!raid;
  dailyMode = !!daily;
  resetMut();
  if (dailyMode || raidMode){ todayMut().f(MUT); $('mutEl').textContent = '◆ ' + todayMut().nm + ' · ' + todayMut().ds + (raidMode ? ' · 夜袭核心' : ''); }
  else $('mutEl').textContent = '';
  updateStreak();
  state = 'play';
  PC = CHARS[charId];
  $('ultLabel').textContent = 'L · ' + (PC.weapon?.id === 'dual' ? '燎原乱舞' : PC.weapon?.id === 'odachi' ? '霜断领域' : '千刃一闪');
  score = 0; wave = raidMode ? 4 : 0; kills = 0; combo = 0; maxCombo = 0; perfects = 0; ults = 0; bossKills = 0;
  ult = 0; ultFiring = 0; lifestealCnt = 0; lbSubmitted = false; pdCD = 0; shieldT = 0;
  resetST(); owned = [];
  ST.range += (stats.meta.range || 0) * 0.05;
  ult = (stats.meta.ult || 0) * 25;
  if (stats.dev) ult = 100;
  P.x = W/2; P.y = H/2; P.vx = P.vy = 0;
  camCX = null; camCY = null;   // 重置镜头，下一帧吸附到角色，避免开局镜头从旧位置飞过来
  P.maxHp = (MUT.hp3 ? 3 : PC.hp) + (stats.meta.hp || 0);
  P.hp = P.maxHp; P.spd = PC.spd;
  P.atkStage = 0; P.atkT = 0; P.inv = 0; P.dashT = 0; P.dashCD = 0; P.trail = []; P.dashStrikeT = 0;
  dashStrikeActive = false; pdCritReady = false;
  enemies = []; particles = []; slashes = []; floats = []; spawnQ = []; rings = []; ultLines = []; ultEvents = []; blades = []; eshots = [];
  explosionsQ = []; pulses = []; healFx = [];
  level = 1; xp = 0; pendingLevels = 0; gems = []; gemStreak = 0; gemStreakT = 0;
  orbitA = 0; seekT = 0; darts = []; firetrails = []; impacts = []; icefields = []; cutmarks = [];
  startMusic(); setMusicIntensity(0);
  boss = null;
  $('menuScr').classList.add('hide');
  $('overScr').classList.add('hide');
  $('upgScr').classList.add('hide');
  $('perksEl').innerHTML = '';
  $('bossBar').classList.remove('on');
  buildHearts();
  if (stats.meta.card){
    const p = PERKS[Math.floor(Math.random() * PERKS.length)];
    p.f(); owned.push(p.id);
    renderOwnedPerks();
    toast('✧ 命运馈赠 · ' + p.nm);
  }
  gravesRun = [];
  const gp = gravesPool.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  runNemesis = selectNemesis(gravesPool, KNAMES);
  for (const g of gp){
    let gx, gy, tries = 0;
    do { gx = rnd(W*0.12, W*0.88); gy = rnd(H*0.15, H*0.85); tries++; }
    while (Math.hypot(gx - W/2, gy - H/2) < 170 && tries < 12);
    const isNemesis = runNemesis && (g.n || '无名刃客') === runNemesis.name && (g.w || 1) === runNemesis.wave;
    gravesRun.push({ n:(g.n || '无名刃客'), w:g.w || 1, kn:KNAMES[g.k] || '未知之物', x:gx, y:gy, broken:false, nemesis:isNemesis });
  }
  if (runNemesis && !gravesRun.some(g => g.nemesis)){
    gravesRun.push({ n:runNemesis.name, w:runNemesis.wave, kn:runNemesis.killer, x:rnd(W*0.18, W*0.82), y:rnd(H*0.2, H*0.8), broken:false, nemesis:true });
  }
  nextWave();
}
function returnToMenu(){
  state = 'menu';
  stopMusic();
  raidMode = false;
  dailyMode = false;
  boss = null;
  runNemesis = null;
  enemies = []; particles = []; slashes = []; floats = []; spawnQ = []; rings = []; ultLines = []; ultEvents = []; blades = []; eshots = [];
  explosionsQ = []; pulses = []; healFx = [];
  gems = []; darts = []; firetrails = []; impacts = []; icefields = []; cutmarks = [];
  combo = 0; comboT = 0; ultFiring = 0; hitstop = 0; slowmo = 0; wt = 0; shake = 0; flashA = 0;
  $('mutEl').textContent = '';
  $('hpEl').innerHTML = '';
  $('comboBox').classList.remove('on');
  $('bossBar').classList.remove('on');
  $('overScr').classList.add('hide');
  $('upgScr').classList.add('hide');
  $('menuScr').classList.remove('hide');
  refreshMenuPanels();
}
$('startBtn').onclick = () => startGame(false);
$('dailyBtn').onclick = () => startGame(true);
$('raidBtn').onclick = () => { if (stats.progression.chain?.nightRaidReady) startGame(true, true); };
$('retryBtn').onclick = () => startGame(dailyMode);
$('menuBtn').onclick = returnToMenu;

function nextWave(){
  wave++;
  waveDone = false;
  stallWarned = false; stallT = 0;
  $('waveEl').textContent = 'WAVE ' + wave;
  setMusicIntensity(Math.min(1, wave / 14));
  sfx('wave');
  banner(wave % 5 === 0 ? '⬢ BOSS WAVE ⬢' : 'WAVE ' + wave);
  if (wave >= 10) achEarned('w10');
  if (wave > 1 && wave % 2 === 1 && P.hp < P.maxHp){ P.hp++; buildHearts(); }
  const plan = buildWavePlan({ wave, more: MUT.more });
  spawnQ = plan.spawnQueue;
  waveEndT = plan.waveEndT;
  if (plan.bossWave){
    spawnBoss();
  }
  waveSpawnT = 0;
}

function showUpgrades(){
  state = 'upgrade';
  const pool = PERKS.filter(p => !(p.once && owned.includes(p.id)) && !(p.chars && !p.chars.includes(charId)));
  const picks = [];
  for (let i = 0; i < 3 && pool.length; i++){
    const roll = Math.random();
    const want = roll < 0.12 ? 2 : roll < 0.42 ? 1 : 0;
    let cand = pool.filter(p => p.r === want && !picks.includes(p));
    if (!cand.length) cand = pool.filter(p => !picks.includes(p));
    if (!cand.length) break;
    picks.push(cand[Math.floor(Math.random() * cand.length)]);
  }
  curCards = picks;
  const el = $('cardsEl');
  el.innerHTML = '';
  picks.forEach((p, i) => {
    const c = document.createElement('div');
    c.className = 'card r' + p.r;
    c.innerHTML = `<div class="num">${i+1}</div><div class="rar">${RAR[p.r]}</div><div class="ic">${p.ic}</div><div class="nm">${p.nm}</div><div class="ds">${p.ds.replace(/\n/g,'<br>')}</div>`;
    c.onclick = () => pickCard(i);
    el.appendChild(c);
  });
  $('upgScr').classList.remove('hide');
}
// 已选天赋：去重堆叠（×N），最多一行，超出折叠
function renderOwnedPerks(){
  const counts = new Map();
  for (const id of owned) counts.set(id, (counts.get(id) || 0) + 1);
  const el = $('perksEl');
  el.innerHTML = '';
  let shown = 0;
  const MAX_ICONS = 9;
  for (const [id, n] of counts){
    const p = PERKS.find(pp => pp.id === id);
    if (!p) continue;
    if (shown >= MAX_ICONS){
      const more = document.createElement('span');
      more.className = 'perk';
      more.textContent = '+' + (counts.size - shown);
      more.title = '更多天赋…';
      el.appendChild(more);
      break;
    }
    const sp = document.createElement('span');
    sp.className = 'perk r' + p.r;
    sp.textContent = p.ic + (n > 1 ? '×' + n : '');
    sp.title = p.nm + (n > 1 ? ' ×' + n : '');
    el.appendChild(sp);
    shown++;
  }
}

function pickCard(i){
  const p = curCards[i];
  p.f();
  owned.push(p.id);
  sfx('pick');
  renderOwnedPerks();
  floats.push({ x:P.x, y:P.y - 40, txt:'◆ ' + p.nm, t:0, col:p.r === 2 ? '#ffd23f' : '#7ee0ff', big:true });
  $('upgScr').classList.add('hide');
  if (pendingLevels > 0) pendingLevels--;
  if (pendingLevels > 0){ showUpgrades(); return; }   // 连升多级连续选卡
  state = 'play';
  nextWave();
}

function banner(txt){
  const b = $('bannerEl');
  b.textContent = txt;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}
function buildHearts(){
  const el = $('hpEl');
  el.innerHTML = '';
  for (let i = 0; i < P.maxHp; i++){
    const h = document.createElement('div');
    h.className = 'heart' + (i < P.hp ? '' : ' off');
    el.appendChild(h);
  }
}

// ---------- 敌人 ----------
// 在玩家视野边缘外一圈生成（镜头跟随后世界大于屏幕）
function viewEdgePos(margin = 44){
  const vw = viewW(), vh = viewH();
  const left = P.x - vw / 2, top = P.y - vh / 2;
  const s = Math.floor(Math.random() * 4);
  let x, y;
  if (s === 0){ x = rnd(left, left + vw); y = top - margin; }
  else if (s === 1){ x = left + vw + margin; y = rnd(top, top + vh); }
  else if (s === 2){ x = rnd(left, left + vw); y = top + vh + margin; }
  else { x = left - margin; y = rnd(top, top + vh); }
  return { x: clamp(x, -50, W + 50), y: clamp(y, -50, H + 50) };
}
function spawnEnemy(type, px, py, fastWarm){
  let fromEdge = false;
  if (px === undefined){
    const p = viewEdgePos();
    px = p.x; py = p.y;
    fromEdge = true;
  }
  const spawned = createEnemy({
    type,
    x:px,
    y:py,
    wave,
    mutation: MUT,
    width: W,
    height: H,
    fastWarm,
    fromEdge
  });
  enemies.push(spawned.enemy);
  rings.push(spawned.spawnRing);
}
function spawnHunter(){
  spawnEnemy('chaser', undefined, undefined, true);
  const h = enemies[enemies.length - 1];
  markHunter(h);
}
function spawnBoss(){
  const bp = viewEdgePos(70);
  const spawned = createBoss({ wave, width: W, height: H, x: bp.x, y: bp.y });
  boss = spawned.boss;
  lastBossKind = boss.kind;
  $('bossName').textContent = '◆ ' + spawned.name + ' ◆';
  $('bossBar').classList.add('on');
  $('bossFill').style.width = '100%';
}

// ---------- 攻击 ----------
function rollDmg(base){
  let dmg = base + MUT.dmg + (ST.rage && combo >= 20 ? 1 : 0);
  let crit = false;
  if (pdCritReady){ dmg *= 2; crit = true; pdCritReady = false; }
  else if (Math.random() < ST.crit){ dmg *= 2; crit = true; }
  return { dmg, crit };
}
function gainUlt(n){
  if (ultFiring > 0) return;
  ult = clamp(ult + n * ST.ultRate, 0, 100);
}
function applyStatus(e){
  if (PC.burn) e.burnT = 0.6;
  if (PC.slow) e.slowT = 1.4;
}
// 统一伤害入口：处理护盾 / 处决 / 击杀
function hitEnemy(i, dmg, ka, kbF, crit){
  const e = enemies[i];
  if (e.shieldHp > 0){
    e.shieldHp -= dmg;
    e.flash = 0.1;
    e.vx += Math.cos(ka) * kbF * 0.3; e.vy += Math.sin(ka) * kbF * 0.3;
    if (e.shieldHp <= 0){
      rings.push({ x:e.x, y:e.y, r:e.r, max:e.r + 40, a:1, col:'#5c7cfa' });
      burst(e.x, e.y, '#5c7cfa', 12, ka, true);
      sfx('shieldbrk');
      floats.push({ x:e.x, y:e.y - 24, txt:'破盾!', t:0, col:'#8da4ff' });
    } else sfx('hit');
    return false;
  }
  if (ST.shatter && e.slowT > 0){
    dmg += 1;
    floats.push({ x:e.x, y:e.y - 36, txt:'冰碎!', t:0, col:'#7ee0ff' });
  }
  e.hp -= dmg;
  e.flash = 0.12;
  floats.push({ x:e.x + rnd(-10, 10), y:e.y - 14, txt:String(dmg), t:0, col:crit ? '#ff5e3a' : '#cfd6e4', dmg:!crit });
  e.vx += Math.cos(ka) * kbF; e.vy += Math.sin(ka) * kbF;
  if (e.hp > 0 && ST.exec && e.maxHp >= 3 && e.hp <= e.maxHp / 3){
    e.hp = 0;
    floats.push({ x:e.x, y:e.y - 26, txt:'处决!', t:0, col:'#ffd23f' });
  }
  if (e.hp <= 0){ killEnemy(i, ka); return true; }
  sfx(crit ? 'crit' : 'hit');
  return false;
}
function doAttack(){
  const wid = PC.weapon?.id || 'iaido';
  const st = dashStrikeActive ? DASH_STRIKES[wid] : PC.slash[P.atkStage];
  const finalStage = !dashStrikeActive && P.atkStage === PC.slash.length - 1;
  const heavy = dashStrikeActive || finalStage;
  const range = st.range * ST.range;
  let best = null, bd = 1e9;
  const all = boss ? enemies.concat([boss]) : enemies;
  for (const e of all){
    if (e.warmup > 0 || e.phased) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy);
    if (d < range + e.r + 50 && d < bd){
      const da = Math.abs(angDiff(P.face, Math.atan2(dy, dx)));
      if (da < 1.5){ bd = d; best = Math.atan2(dy, dx); }
    }
  }
  if (best !== null) P.face += angDiff(P.face, best) * 0.65;

  const attack = dashStrikeActive
    ? createDashStrikeAttack(wid, P.face, range)
    : createWeaponAttack({ character: PC, stage: P.atkStage, baseSlash: st, face: P.face, range });
  sfx('swing');
  if (dashStrikeActive){
    floats.push({ x:P.x, y:P.y - 44, txt:st.nm + '!', t:0, col:PC.col, big:true });
    rings.push({ x:P.x, y:P.y, r:P.r, max:110, a:1, col:PC.col });
    flashA = Math.max(flashA, 0.14);
  }
  attack.hitArcs.forEach((arc, idx) => {
    slashes.push({
      x:P.x, y:P.y, a:arc.angle, t:0, dur:st.dur / aspdNow(),
      range:arc.range, half:arc.half, stage:P.atkStage, heavy,
      flip:(P.atkStage + idx) % 2 === 1, rgb:PC.rgb, weapon:attack.visual,
      sub:idx > 0 && attack.visual !== 'dual'   // 双刃两道弧同亮
    });
  });
  burst(P.x + Math.cos(P.face) * range * 0.7, P.y + Math.sin(P.face) * range * 0.7, PC.col, dashStrikeActive ? 8 : 3, P.face);
  if (attack.movementBoost){ P.vx += Math.cos(P.face) * attack.movementBoost; P.vy += Math.sin(P.face) * attack.movementBoost; }
  if (attack.invuln) P.inv = Math.max(P.inv, attack.invuln);
  if (ST.wave > 0){
    blades.push({ x:P.x + Math.cos(P.face) * 30, y:P.y + Math.sin(P.face) * 30, a:P.face, t:0, life:0.55, pierce:ST.wave, hitset:new Set() });
  }

  // 霜：终结全周斩落下冰封领域（全场仅存一个，新圈顶替旧圈）
  if (finalStage && wid === 'odachi'){
    icefields.length = 0;
    icefields.push({ x:P.x, y:P.y, r:155, t:0, life:2.6 });
    rings.push({ x:P.x, y:P.y, r:30, max:155, a:0.9, col:'#b9a8ff' });
  }
  // 燹：X 斩交点火星（不出波纹圈，保持收敛）
  if (finalStage && wid === 'dual'){
    const cxp = P.x + Math.cos(P.face) * range * 0.5;
    const cyp = P.y + Math.sin(P.face) * range * 0.5;
    burst(cxp, cyp, '#fff', 5, P.face);
  }

  let hitAny = false, killAny = false, critAny = false;
  const baseDmg = st.dmg + (dashStrikeActive ? ST.dashDmg : (finalStage ? ST.heavy : 0));
  const kbm = MUT.kb * ST.kbMul;

  // 斩：拔刀瞬移斩 —— 沿斜向路径瞬移，路径上的目标全部吃斩击
  let pathHit = null;
  if (attack.dash){
    // 位移：沿正前方直线瞬移
    const sx = P.x, sy = P.y;
    const ex = clamp(sx + Math.cos(P.face) * attack.dash.dist, 20, W - 20);
    const ey = clamp(sy + Math.sin(P.face) * attack.dash.dist, 20, H - 20);
    P.x = ex; P.y = ey;
    P.vx = Math.cos(P.face) * 140; P.vy = Math.sin(P.face) * 140;
    for (let i = 0; i <= 4; i++){ // 残影沿位移线
      P.trail.push({ x: sx + (ex - sx) * i / 4, y: sy + (ey - sy) * i / 4, a: P.face, t: 0.14 + i * 0.04 });
    }
    // 刀线：与位移不同线 —— 斜切横贯位移中点
    const moveA = Math.atan2(ey - sy, ex - sx);
    const ca = moveA + attack.dash.offset;
    const mx = (sx + ex) / 2, my = (sy + ey) / 2;
    const halfL = Math.hypot(ex - sx, ey - sy) * 0.5;
    const cx1 = mx - Math.cos(ca) * halfL, cy1 = my - Math.sin(ca) * halfL;
    const cx2 = mx + Math.cos(ca) * halfL, cy2 = my + Math.sin(ca) * halfL;
    slashes.push({
      weapon:'iaidash', x:cx1, y:cy1, x2:cx2, y2:cy2, a:ca, t:0,
      dur: Math.max(st.dur / aspdNow(), 0.18), rgb:PC.rgb, heavy,
      range:0, half:0, stage:P.atkStage, flip:false, sub:false
    });
    // 判定跟刀线走
    const a2 = ca;
    const dxs = cx2 - cx1, dys = cy2 - cy1;
    const len2 = dxs * dxs + dys * dys || 1;
    pathHit = (tx, ty, tr) => {
      const tt = clamp(((tx - cx1) * dxs + (ty - cy1) * dys) / len2, 0, 1);
      return Math.hypot(tx - (cx1 + dxs * tt), ty - (cy1 + dys * tt)) < tr + 26;
    };
    for (let i = enemies.length - 1; i >= 0; i--){
      const e = enemies[i];
      if (e.warmup > 0 || e.phased) continue;
      if (!pathHit(e.x, e.y, e.r)) continue;
      hitAny = true;
      const roll = rollDmg(baseDmg);
      if (roll.crit){ critAny = true; floats.push({ x:e.x, y:e.y - 26, txt:'暴击!', t:0, col:'#ff5e3a' }); }
      cutmarks.push({ x:e.x, y:e.y, a:a2, len:e.r * 2 + 26, t:0 });
      burst(e.x, e.y, e.col, roll.crit ? 12 : 7, a2);
      gainUlt(3);
      if (hitEnemy(i, roll.dmg, a2, st.kb * kbm, roll.crit)) killAny = true;
    }
    if (boss && boss.warmup <= 0 && pathHit(boss.x, boss.y, boss.r)){
      hitAny = true;
      const roll = rollDmg(baseDmg);
      if (roll.crit){ critAny = true; floats.push({ x:boss.x, y:boss.y - 50, txt:'暴击!', t:0, col:'#ff5e3a' }); }
      cutmarks.push({ x:boss.x, y:boss.y, a:a2, len:boss.r * 2 + 30, t:0 });
      dmgBoss(roll.dmg, a2, st.kb * 0.18);
    }
  } else {
    for (let i = enemies.length - 1; i >= 0; i--){
      const e = enemies[i];
      if (e.warmup > 0 || e.phased) continue;
      const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy);
      const arc = findHitArc(attack, P, e);
      if (arc){
        hitAny = true;
        const roll = rollDmg(scaledDamage(baseDmg, arc));
        if (roll.crit){ critAny = true; floats.push({ x:e.x, y:e.y - 26, txt:'暴击!', t:0, col:'#ff5e3a' }); }
        applyStatus(e);
        const ka = Math.atan2(dy, dx);
        burst(e.x, e.y, e.col, roll.crit ? 14 : 8, ka);
        gainUlt(3);
        if (hitEnemy(i, roll.dmg, ka, st.kb * kbm, roll.crit)) killAny = true;
      }
    }
    if (ST.parry){   // 弹反为「拨刀」天赋专属
      for (let i = eshots.length - 1; i >= 0; i--){
        const s2 = eshots[i];
        if (findHitArc(attack, P, { x:s2.x, y:s2.y, r:12 })){
          eshots.splice(i, 1);
          burst(s2.x, s2.y, '#e85d9e', 7, P.face);
          gainUlt(3);
          floats.push({ x:s2.x, y:s2.y - 14, txt:'弹反!', t:0, col:'#ff9ecb' });
          sfx('parry');
        }
      }
    }
    if (boss && boss.warmup <= 0){
      const dx = boss.x - P.x, dy = boss.y - P.y, d = Math.hypot(dx, dy);
      const arc = findHitArc(attack, P, boss);
      if (arc){
        hitAny = true;
        const roll = rollDmg(scaledDamage(baseDmg, arc));
        if (roll.crit){ critAny = true; floats.push({ x:boss.x, y:boss.y - 50, txt:'暴击!', t:0, col:'#ff5e3a' }); }
        dmgBoss(roll.dmg, Math.atan2(dy, dx), st.kb * 0.18);
      }
    }
  }
  for (const gv of gravesRun){
    if (gv.broken) continue;
    const dx = gv.x - P.x, dy = gv.y - P.y, d = Math.hypot(dx, dy);
    if (pathHit ? pathHit(gv.x, gv.y, 16) : findHitArc(attack, P, { x:gv.x, y:gv.y, r:16 })){
      gv.broken = true;
      burst(gv.x, gv.y, '#9aa3b8', 18, 0, true);
      rings.push({ x:gv.x, y:gv.y, r:10, max:80, a:1, col:'#9eeaff' });
      gainUlt(20);
      const pts = Math.floor(150 * MUT.sc);
      score += pts;
      floats.push({ x:gv.x, y:gv.y - 28, txt:'复仇 +' + pts, t:0, col:'#9eeaff', big:true });
      toast(`⚰ 你为「${gv.n}」复仇了 · TA 死于第${gv.w}波的${gv.kn}`);
      stats.avenged = (stats.avenged || 0) + 1;
      if (gv.nemesis){
        const reward = completeRevenge(stats, runNemesis);
        floats.push({ x:gv.x, y:gv.y - 50, txt:'宿敌清除 +✧' + reward.reward, t:0, col:'#ffd23f', big:true });
        toast('◆ 宿敌档案已结案 · 晶核 +' + reward.reward);
        saveStats();
        gv.nemesis = false;
      }
      if (stats.avenged >= 10) achEarned('avenge');
      sfx('grave');
    }
  }
  if (hitAny && attack.shockwave){
    const sr = attack.shockwave.radius;
    rings.push({ x:P.x, y:P.y, r:24, max:sr, a:1, col:PC.col });
    for (let i = enemies.length - 1; i >= 0; i--){
      const e = enemies[i];
      if (e.warmup > 0 || e.phased) continue;
      const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy);
      if (d < sr + e.r) hitEnemy(i, attack.shockwave.damage, Math.atan2(dy, dx), attack.shockwave.knockback, false);
    }
    if (boss && boss.warmup <= 0){
      const dx = boss.x - P.x, dy = boss.y - P.y;
      if (Math.hypot(dx, dy) < sr + boss.r) dmgBoss(attack.shockwave.damage, Math.atan2(dy, dx), attack.shockwave.knockback * 0.16);
    }
  }
  if (hitAny && finalStage && ST.shock > 0){
    const sr = 190 + ST.shock * 30;
    rings.push({ x:P.x, y:P.y, r:30, max:sr, a:1, col:'#ffd23f' });
    for (let i = enemies.length - 1; i >= 0; i--){
      const e = enemies[i];
      if (e.warmup > 0 || e.phased) continue;
      const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy);
      if (d < sr + e.r){
        hitEnemy(i, ST.shock, Math.atan2(dy, dx), 500, false);
      }
    }
  }
  if (hitAny){
    hitstop = Math.max(hitstop, killAny ? st.hs + 0.04 : st.hs);
    shake = Math.max(shake, killAny ? 13 : 8);
    if (critAny) shake = Math.max(shake, 15);
    if (finalStage){ flashA = Math.max(flashA, 0.18); shake = Math.max(shake, 16); }
  }
}
function dmgBoss(dmg, ka, kb){
  boss.hp -= dmg; boss.flash = 0.12;
  boss.vx += Math.cos(ka) * (kb || 80); boss.vy += Math.sin(ka) * (kb || 80);
  burst(boss.x - Math.cos(ka) * boss.r * 0.5, boss.y - Math.sin(ka) * boss.r * 0.5, boss.col, 10, ka);
  sfx('bossHit');
  addCombo();
  gainUlt(4);
  score += Math.floor(40 * multOf() * MUT.sc);
  $('bossFill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
  if (boss.hp <= 0) killBoss();
}
function killEnemy(i, ka){
  const e = enemies[i];
  enemies.splice(i, 1);
  kills++;
  stats.totalKills++;
  if (stats.totalKills >= 100) achEarned('k100');
  sfx('kill');
  burst(e.x, e.y, e.col, e.elite ? 32 : (combo >= 15 ? 28 : 20), ka, true);
  rings.push({ x:e.x, y:e.y, r:e.r, max:e.r + (e.elite ? 80 : combo >= 15 ? 66 : 50), a:1, col:e.col });
  if (ST.burnSpread && e.burnT > 0){
    for (const e2 of enemies){
      if (e2.warmup > 0) continue;
      if (Math.hypot(e2.x - e.x, e2.y - e.y) < 130 + e2.r){
        e2.burnT = Math.max(e2.burnT, 1.2);
        burst(e2.x, e2.y, '#ff7a3c', 4, 0);
      }
    }
    rings.push({ x:e.x, y:e.y, r:e.r, max:130, a:0.8, col:'#ff7a3c' });
  }
  addCombo();
  const pts = Math.floor(e.score * multOf() * MUT.sc);
  score += pts;
  floats.push({ x:e.x, y:e.y - 20, txt:'+' + pts, t:0, col: e.elite ? '#ffd23f' : '#fff', big:e.elite });
  gainUlt(2);
  gems.push({ x:e.x + rnd(-8, 8), y:e.y + rnd(-8, 8), v:clamp(Math.round(e.score / 100), 1, 5), vx:rnd(-100, 100), vy:rnd(-100, 100), t:0 });
  if (e.type === 'splitter'){
    for (let k = 0; k < 3; k++) spawnEnemy('swarm', e.x + rnd(-24, 24), e.y + rnd(-24, 24), true);
  }
  if (ST.explode && Math.random() < 0.35) explosionsQ.push({ x:e.x, y:e.y });
  if (ST.lifesteal > 0){
    lifestealCnt++;
    if (lifestealCnt >= ST.lifesteal){
      lifestealCnt = 0;
      if (P.hp < P.maxHp){
        P.hp++; buildHearts();
        floats.push({ x:P.x, y:P.y - 34, txt:'+1 HP', t:0, col:'#ff7a94' });
        burst(P.x, P.y, '#ff3b5c', 8, 0, true);
      }
    }
  }
}
function killBoss(){
  const defeatedKind = boss.kind;
  burst(boss.x, boss.y, boss.col, 60, 0, true);
  rings.push({ x:boss.x, y:boss.y, r:boss.r, max:boss.r + 160, a:1, col:boss.col });
  const pts = Math.floor(2000 * multOf() * MUT.sc);
  score += pts;
  floats.push({ x:boss.x, y:boss.y - 40, txt:'+' + pts, t:0, col:boss.col, big:true });
  kills++; bossKills++;
  stats.totalKills++;
  lastBossKind = defeatedKind;
  recordBossEncounter(stats.progression.bossCodex, { kind:defeatedKind, defeated:true });
  if (raidMode){
    const raidReward = clearNightRaid(stats);
    floats.push({ x:P.x, y:P.y - 70, txt:'夜袭清算 +✧' + raidReward.reward, t:0, col:'#ffd23f', big:true });
    toast('◆ 夜袭核心已清除 · 晶核 +' + raidReward.reward);
    saveStats();
    raidMode = false;
  }
  achEarned('boss');
  for (let i = 0; i < 8; i++){
    const a = i / 8 * TAU;
    gems.push({ x:boss.x + Math.cos(a) * 30, y:boss.y + Math.sin(a) * 30, v:3, vx:Math.cos(a) * 180, vy:Math.sin(a) * 180, t:0 });
  }
  hitstop = 0.18; shake = 26; flashA = 0.4; slowmo = 1.2;
  boss = null;
  pulses = [];
  firetrails = []; impacts = [];
  $('bossBar').classList.remove('on');
  gainUlt(30);
  sfx('kill'); setTimeout(() => sfx('wave'), 120);
}
function addCombo(){
  combo++; comboT = BASE_COMBO_WIN + ST.comboWin;
  if (combo > maxCombo) maxCombo = combo;
  if (maxCombo >= 30) achEarned('c30');
  if (combo % 10 === 0){
    sfx('comboUp');
    floats.push({ x:P.x, y:P.y - 46, txt:combo + ' COMBO!', t:0, col:'#ffd23f', big:true });
    shake = Math.max(shake, 10);
  }
}
function multOf(){ return 1 + Math.floor(combo / 5) * 0.5; }

function tryDash(){
  if ((P.dashCD > 0 && !MUT.nocd) || P.dashT > 0) return;
  let dx = (keys['d']||keys['arrowright']?1:0) - (keys['a']||keys['arrowleft']?1:0);
  let dy = (keys['s']||keys['arrowdown']?1:0) - (keys['w']||keys['arrowup']?1:0);
  if (!dx && !dy && (tvx || tvy)){ dx = tvx; dy = tvy; }
  if (!dx && !dy){ dx = Math.cos(P.face); dy = Math.sin(P.face); }
  const l = Math.hypot(dx, dy);
  P.dvx = dx/l; P.dvy = dy/l;
  P.dashT = 0.16; P.dashCD = 1.55 * ST.dashCD; P.inv = Math.max(P.inv, 0.24);
  P.atkT = 0; P.atkStage = 0; P.atkCool = 0;   // 闪避取消攻击后摇
  P.dashStrikeT = 0.38;                          // 冲刺斩窗口
  sfx('dash');
  burst(P.x, P.y, PC.col, 6, Math.atan2(-dy, -dx));
  if (pdCD <= 0){
    const all = boss && boss.warmup <= 0 ? enemies.concat([boss]) : enemies;
    for (const e of all){
      if (e.warmup > 0 || e.phased) continue;
      const d = Math.hypot(P.x - e.x, P.y - e.y);
      const danger = e === boss ? (boss.st === 'charge' ? 130 : 80) : (e.lungeState === 2 || e.type === 'bomber' ? 90 : 50);
      if (d < P.r + e.r + danger){ perfectDodge(); break; }
    }
  }
}
function perfectDodge(){
  wt = ST.wtPlus ? 1.9 : 1.3;
  pdCD = ST.wtPlus ? 1.5 : 3;
  if (ST.pdCrit){ pdCritReady = true; floats.push({ x:P.x, y:P.y - 64, txt:'残心', t:0, col:'#ffd23f' }); }
  P.dashCD = 0;
  perfects++;
  if (perfects >= 5) achEarned('p5');
  gainUlt(15);
  sfx('perfect');
  flashA = Math.max(flashA, 0.12);
  shake = Math.max(shake, 6);
  floats.push({ x:P.x, y:P.y - 48, txt:'完美闪避!', t:0, col:PC.col, big:true });
  rings.push({ x:P.x, y:P.y, r:P.r, max:90, a:1, col:PC.col });
  $('wtFx').style.opacity = 1;
}

function strikeEnemyWithUlt(i, amount, ka, opts = {}){
  const e = enemies[i];
  if (!e || e.warmup > 0) return false;
  e.shieldHp = 0;
  e.phased = false;
  if (opts.burn) e.burnT = Math.max(e.burnT || 0, opts.burn);
  if (opts.slow) e.slowT = Math.max(e.slowT || 0, opts.slow);
  e.hp -= amount;
  e.flash = opts.flash || 0.22;
  e.vx += Math.cos(ka) * (opts.knock || 260);
  e.vy += Math.sin(ka) * (opts.knock || 260);
  if (e.hp <= 0){
    killEnemy(i, ka);
    return true;
  }
  burst(e.x, e.y, opts.col || e.col, opts.particles || 12, ka, !!opts.deathBurst);
  return false;
}

function strikeBossWithUlt(amount, ka, opts = {}){
  if (!boss || boss.warmup > 0) return;
  boss.hp -= amount;
  boss.flash = opts.flash || 0.28;
  boss.vx += Math.cos(ka) * (opts.knock || 110);
  boss.vy += Math.sin(ka) * (opts.knock || 110);
  burst(boss.x, boss.y, opts.col || boss.col, opts.particles || 24, ka, !!opts.deathBurst);
  $('bossFill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
  sfx('bossHit');
  if (boss.hp <= 0) killBoss();
}

function tryUlt(){
  if (ult < 100 || ultFiring > 0) return;
  const wid = PC.weapon?.id || 'iaido';
  ult = 0;
  ultFiring = wid === 'odachi' ? 0.95 : wid === 'dual' ? 0.82 : 0.64;
  ults++;
  if (ults >= 3) achEarned('u3');
  hitstop = 0.12; flashA = wid === 'dual' ? 0.32 : 0.5; shake = wid === 'odachi' ? 34 : 30; slowmo = wid === 'dual' ? 0.65 : 0.9;
  sfx('ult');
  ultLines = [];
  eshots = [];

  if (wid === 'dual'){
    banner('燎 原 乱 舞');
    rings.push({ x:P.x, y:P.y, r:24, max:260, a:1, col:'#ff7a3c' });
    rings.push({ x:P.x, y:P.y, r:56, max:420, a:0.8, col:'#ffd23f' });
    for (let i = 0; i < 18; i++){
      const a = P.face + i / 18 * TAU + rnd(-0.12, 0.12);
      const inner = 24 + (i % 3) * 16;
      const outer = 230 + (i % 4) * 48;
      ultLines.push({
        x1:P.x + Math.cos(a) * inner,
        y1:P.y + Math.sin(a) * inner,
        x2:P.x + Math.cos(a) * outer,
        y2:P.y + Math.sin(a) * outer,
        t:i * 0.018,
        col:i % 2 ? '#ffd23f' : '#ff7a3c',
        glow:'#ff7a3c',
        w:2,
        grow:2
      });
    }
    const ox = P.x, oy = P.y;
    for (const [delay, radius] of [[0.09, 340], [0.26, 480]]){
      ultEvents.push({ t: delay, run: () => {
        for (let i = enemies.length - 1; i >= 0; i--){
          const e = enemies[i];
          if (Math.hypot(e.x - ox, e.y - oy) > radius + e.r) continue;
          const ka = Math.atan2(e.y - oy, e.x - ox);
          strikeEnemyWithUlt(i, 4, ka, { burn:1.8, knock:320, col:'#ff7a3c', particles:14 });
        }
        if (boss && boss.warmup <= 0 && Math.hypot(boss.x - ox, boss.y - oy) <= radius + boss.r)
          strikeBossWithUlt(5, Math.atan2(boss.y - oy, boss.x - ox), { col:'#ff7a3c', particles:26, knock:80 });
        shake = Math.max(shake, 18);
      } });
    }
    return;
  }

  if (wid === 'odachi'){
    banner('霜 断 领 域');
    rings.push({ x:P.x, y:P.y, r:36, max:320, a:1, col:'#b9a8ff' });
    rings.push({ x:P.x, y:P.y, r:80, max:520, a:0.75, col:'#7ee0ff' });
    for (let i = 0; i < 8; i++){
      const a = i / 8 * TAU + 0.1;
      ultLines.push({
        x1:P.x - Math.cos(a) * 900,
        y1:P.y - Math.sin(a) * 900,
        x2:P.x + Math.cos(a) * 900,
        y2:P.y + Math.sin(a) * 900,
        t:i * 0.035,
        col:i % 2 ? '#b9a8ff' : '#e8e8ff',
        glow:'#b9a8ff',
        w:4,
        grow:5
      });
    }
    const ox = P.x, oy = P.y;
    // 领域：全场减速；伤害只结算 8 条贯穿线附近的目标
    const nearLine = (x, y, r) => {
      const px = x - ox, py = y - oy;
      for (let i = 0; i < 8; i++){
        const a = i / 8 * TAU + 0.1;
        if (Math.abs(-Math.sin(a) * px + Math.cos(a) * py) < 40 + r) return true;
      }
      return false;
    };
    ultEvents.push({ t: 0.18, run: () => {
      for (let i = enemies.length - 1; i >= 0; i--){
        const e = enemies[i];
        if (e.warmup > 0) continue;
        e.slowT = Math.max(e.slowT || 0, 3.5);
        if (!nearLine(e.x, e.y, e.r)) continue;
        const ka = Math.atan2(e.y - oy, e.x - ox);
        strikeEnemyWithUlt(i, 9, ka, { slow:3.5, knock:560, col:'#b9a8ff', particles:18, deathBurst:true });
      }
      if (boss && boss.warmup <= 0){
        boss.slowT = Math.max(boss.slowT || 0, 3.5);
        if (nearLine(boss.x, boss.y, boss.r))
          strikeBossWithUlt(12, Math.atan2(boss.y - oy, boss.x - ox), { col:'#b9a8ff', particles:34, knock:180 });
      }
      wt = Math.max(wt, 0.75);
      shake = Math.max(shake, 24);
    } });
    return;
  }

  banner('千 刃 一 闪');
  rings.push({ x:P.x, y:P.y, r:18, max:180, a:0.9, col:'#7ee0ff' });
  for (let i = 0; i < 9; i++){
    const a = P.face + rnd(-0.42, 0.42) + (i - 4) * 0.035;
    const off = (i - 4) * 22;
    const side = a + Math.PI / 2;
    const cx = P.x + Math.cos(side) * off;
    const cy = P.y + Math.sin(side) * off;
    ultLines.push({
      x1:cx - Math.cos(a) * 180,
      y1:cy - Math.sin(a) * 180,
      x2:cx + Math.cos(a) * 1200,
      y2:cy + Math.sin(a) * 1200,
      t:i * 0.035,
      col:i === 4 ? '#ffffff' : '#9eeaff',
      glow:'#7ee0ff',
      w:i === 4 ? 5 : 2,
      grow:i === 4 ? 7 : 3
    });
  }
  const ox = P.x, oy = P.y, ua = P.face;
  // 方向技：只斩面朝扇形内的目标，纵深不限
  ultEvents.push({ t: 0.16, run: () => {
    for (let i = enemies.length - 1; i >= 0; i--){
      const e = enemies[i];
      const ka = Math.atan2(e.y - oy, e.x - ox);
      if (Math.abs(angDiff(ua, ka)) > 0.55) continue;
      strikeEnemyWithUlt(i, 12, ka, { knock:460, col:'#9eeaff', particles:16, deathBurst:true });
    }
    if (boss && boss.warmup <= 0){
      const ka = Math.atan2(boss.y - oy, boss.x - ox);
      if (Math.abs(angDiff(ua, ka)) <= 0.55)
        strikeBossWithUlt(14, ka, { col:'#9eeaff', particles:30, knock:130, deathBurst:true });
    }
    shake = Math.max(shake, 20);
  } });
}

// ---------- 粒子 ----------
function burst(x, y, col, n, ang = 0, death = false){
  for (let i = 0; i < n; i++){
    const a = death ? rnd(0, TAU) : ang + rnd(-0.9, 0.9);
    const sp = rnd(120, death ? 520 : 380);
    particles.push({
      x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
      life:rnd(0.25, death ? 0.7 : 0.45), t:0, col,
      sz:rnd(2, death ? 7 : 5), rot:rnd(0, TAU), vr:rnd(-12, 12)
    });
  }
}

// ---------- 伤害 / 结算 ----------
function hurtPlayer(kb, ka, srcType){
  if (P.inv > 0) return;
  if (ST.shieldOn && shieldT <= 0){
    shieldT = 18;
    P.inv = 0.6;
    rings.push({ x:P.x, y:P.y, r:P.r, max:70, a:1, col:'#8da4ff' });
    floats.push({ x:P.x, y:P.y - 40, txt:'护壁抵挡!', t:0, col:'#8da4ff' });
    sfx('shieldbrk');
    return;
  }
  lastKiller = srcType || 'chaser';
  P.hp--;
  if (P.hp <= 0 && ST.revive){
    ST.revive = false;
    P.hp = 3;
    P.inv = 2;
    buildHearts();
    banner('不 灭');
    flashA = 0.5; shake = 22;
    burst(P.x, P.y, '#ffd23f', 36, 0, true);
    rings.push({ x:P.x, y:P.y, r:P.r, max:200, a:1, col:'#ffd23f' });
    sfx('ult');
    return;
  }
  buildHearts();
  P.inv = 0.9;
  P.vx += Math.cos(ka)*kb; P.vy += Math.sin(ka)*kb;
  sfx('hurt');
  shake = 20; hitstop = 0.1;
  combo = 0; comboT = 0;
  const fx = $('hurtFx');
  fx.style.transition = 'none'; fx.style.opacity = 1;
  requestAnimationFrame(() => { fx.style.transition = 'opacity .5s'; fx.style.opacity = 0; });
  if (P.hp <= 0) gameOver();
}
function gradeOf(){
  const v = score + maxCombo * 200 + wave * 800;
  if (v >= 26000) return ['S','#ffd23f'];
  if (v >= 15000) return ['A','#ff8c42'];
  if (v >= 8000) return ['B','#7ee0ff'];
  if (v >= 3500) return ['C','#6ee07a'];
  return ['D','#888'];
}
async function syncWorldAndGrave(){
  try {
    let k = 0;
    try { const r = await storage.get('blade_world', true); if (r && r.value) k = JSON.parse(r.value).k || 0; } catch(e){}
    k += kills;
    await storage.set('blade_world', JSON.stringify({ k }), true);
    worldKills = k;
  } catch(e){}
  try {
    let cur = [];
    try { const r = await storage.get('blade_graves', true); if (r && r.value) cur = JSON.parse(r.value); } catch(e){}
    cur.push({ n:(stats.pname || '无名刃客'), w:wave, k:lastKiller });
    if (cur.length > 30) cur = cur.slice(-30);
    await storage.set('blade_graves', JSON.stringify(cur), true);
    gravesPool = cur;
  } catch(e){}
  renderMenuMeta();
  renderProgressionPanel();
}
function gameOver(){
  state = 'over';
  stopMusic();
  burst(P.x, P.y, PC.col, 40, 0, true);
  if (boss && boss.kind) recordBossEncounter(stats.progression.bossCodex, { kind:boss.kind, defeated:false });
  const isRec = !dailyMode && score > stats.hi;
  if (!dailyMode){
    stats.hi = Math.max(stats.hi, score);
  } else {
    if (stats.daily.d !== todayKey() || score > stats.daily.s) stats.daily = { d:todayKey(), s:score };
  }
  stats.bestWave = Math.max(stats.bestWave, wave);
  stats.bestCombo = Math.max(stats.bestCombo, maxCombo);
  stats.games++;
  const gain = Math.floor((Math.floor(score / 400) + wave * 2 + perfects * 3) * ST.shardMul);
  stats.shards += gain;
  lastMissionReward = applyMissionRewards({
    stats,
    missions: runMissions,
    run: { score, maxCombo, wave, perfects, characterId: charId }
  });
  const [g, gc] = gradeOf();
  if (g === 'S') achEarned('s');
  saveStats();
  syncWorldAndGrave();
  renderMenuMeta(); renderChars(); renderAchs(); renderMeta(); renderProgressionPanel();
  $('gradeEl').textContent = g;
  $('gradeEl').style.color = gc;
  $('finalScore').textContent = score;
  $('overShards').textContent = `✧ 获得晶核 +${gain + lastMissionReward.shards}（基础 ${gain}${lastMissionReward.shards ? ' · 修行 +' + lastMissionReward.shards : ''} · 当前 ${stats.shards}）`;
  $('statRow').textContent = (dailyMode ? `【今日挑战 · ${todayMut().nm}】\n` : '') +
    `${PC.nm} ｜ 波次 ${wave} ｜ 击杀 ${kills} ｜ 最高连击 ${maxCombo} ｜ 完美闪避 ${perfects}\n死于 ${KNAMES[lastKiller] || '未知之物'}`;
  const missionResult = $('missionResult');
  if (missionResult) {
    missionResult.innerHTML = lastMissionReward.completed.length
      ? lastMissionReward.completed.map(m => `<div class="mission-row done"><span>✓ ${m.title}</span><b>✧${m.reward}</b></div>`).join('')
      : '<div class="mission-empty">今日修行未完成 · 再来一局</div>';
  }
  $('newRec').classList.toggle('hide', !isRec);
  const gapEl = $('gapHint');
  if (!dailyMode && lbWeek.length >= 10 && score < lbWeek[lbWeek.length - 1].s){
    gapEl.textContent = `距离本周榜第 10 名还差 ${lbWeek[lbWeek.length - 1].s - score} 分`;
  } else if (!dailyMode && lbWeek.length && score > lbWeek[0].s){
    gapEl.textContent = '👑 这是本周榜第一的成绩！';
  } else gapEl.textContent = '';
  const qualifies = !dailyMode && score > 0 &&
    ((lbWeek.length < 10 || score > lbWeek[lbWeek.length - 1].s) || (lbAll.length < 10 || score > lbAll[lbAll.length - 1].s));
  $('nameBox').classList.toggle('hide', !qualifies);
  if (stats.pname) $('nameIn').value = stats.pname;
  $('submitBtn').textContent = '上 榜';
  renderLb($('overLb'), lbWeek, '本周排行榜 TOP 10');
  setTimeout(() => $('overScr').classList.remove('hide'), 600);
}
$('submitBtn').onclick = async () => {
  if (lbSubmitted) return;
  const name = $('nameIn').value.trim() || '无名刃客';
  stats.pname = name;
  saveStats();
  lbSubmitted = true;
  $('submitBtn').textContent = '...';
  const ok = await submitScore(name);
  $('submitBtn').textContent = ok ? '已上榜' : '失败';
  if (ok) achEarned('lb');
  renderLb($('overLb'), lbWeek, '本周排行榜 TOP 10', name);
  renderMenuLb(name);
  $('nameBox').classList.add('hide');
};

// ---------- 更新 ----------
function update(dt){
  if (hitstop > 0.3) hitstop = 0.3;
  if (hitstop > 0){ hitstop -= dt; timeScale = 0.02; }
  else if (wt > 0){ wt -= dt; timeScale = lerp(timeScale, 0.25, 0.3); if (wt <= 0) $('wtFx').style.opacity = 0; }
  else if (slowmo > 0){ slowmo -= dt; timeScale = lerp(timeScale, 0.35, 0.2); }
  else timeScale = lerp(timeScale, 1, 0.15);
  const d = dt * timeScale;
  const pd = (wt > 0 && hitstop <= 0) ? dt * 0.85 : d;

  ultFiring = Math.max(0, ultFiring - dt);
  for (let i = ultEvents.length - 1; i >= 0; i--){
    ultEvents[i].t -= dt;
    if (ultEvents[i].t <= 0) ultEvents.splice(i, 1)[0].run();
  }
  pdCD -= dt;
  shieldT -= dt;
  comboT -= d;
  if (comboT <= 0 && combo > 0) combo = 0;

  let mx = (keys['d']||keys['arrowright']?1:0) - (keys['a']||keys['arrowleft']?1:0);
  let my = (keys['s']||keys['arrowdown']?1:0) - (keys['w']||keys['arrowup']?1:0);
  const ml = Math.hypot(mx, my) || 1;
  mx /= ml; my /= ml;
  if (tvx || tvy){ mx = tvx; my = tvy; }
  if (tAtkHeld) P.atkBuf = true;
  if (P.dashT > 0){
    P.dashT -= pd;
    P.x += P.dvx * 950 * pd; P.y += P.dvy * 950 * pd;
    P.trail.push({ x:P.x, y:P.y, a:Math.atan2(P.dvy, P.dvx), t:0.3 });
  } else {
    // 攻击移速惩罚按武器分化：双刀走砍 / 居合标准 / 大太刀沉重
    const wid2 = PC.weapon?.id || 'iaido';
    const atkSlow = P.atkT > 0 ? (wid2 === 'dual' ? 0.85 : wid2 === 'odachi' ? 0.45 : 0.6) : 1;
    const sp = P.spd * ST.spd * atkSlow;
    P.vx = lerp(P.vx, mx * sp, 1 - Math.pow(0.0001, pd));
    P.vy = lerp(P.vy, my * sp, 1 - Math.pow(0.0001, pd));
    P.x += P.vx * pd; P.y += P.vy * pd;
    if (mx || my) P.face = lerp(P.face, P.face + angDiff(P.face, Math.atan2(my, mx)), 0.35);
  }
  P.dashCD -= pd; P.inv -= pd; P.dashStrikeT -= pd;
  P.x = clamp(P.x, 20, W - 20); P.y = clamp(P.y, 20, H - 20);
  for (let i = P.trail.length - 1; i >= 0; i--){ P.trail[i].t -= d; if (P.trail[i].t <= 0) P.trail.splice(i, 1); }

  if (P.atkT > 0){
    P.atkT -= pd;
    if (P.atkT <= 0){
      if (P.atkBuf && P.atkStage < PC.slash.length - 1){ P.atkStage++; P.atkBuf = false; P.atkT = PC.slash[P.atkStage].dur / aspdNow(); doAttack(); }
      else { P.atkStage = 0; P.atkCool = 0.12; }
    }
  } else {
    P.atkCool -= pd;
    if (P.atkBuf && P.atkCool <= 0){
      P.atkBuf = false; P.atkStage = 0;
      if (P.dashStrikeT > 0){
        P.dashStrikeT = 0;
        dashStrikeActive = true;
        const wid = PC.weapon?.id || 'iaido';
        P.atkT = DASH_STRIKES[wid].dur / aspdNow();
        doAttack();
        dashStrikeActive = false;
      } else {
        P.atkT = PC.slash[0].dur / aspdNow();
        doAttack();
      }
    } else if (P.atkBuf && P.atkCool > 0.2) P.atkBuf = false;
  }

  // 经验宝石：磁吸 → 拾取 → 升级
  gemStreakT -= dt;
  if (gemStreakT <= 0) gemStreak = 0;
  for (let i = gems.length - 1; i >= 0; i--){
    const g = gems[i];
    g.t += d;
    if (g.t > 26){ gems.splice(i, 1); continue; }
    g.x += g.vx * d; g.y += g.vy * d;
    g.vx *= Math.pow(0.01, d); g.vy *= Math.pow(0.01, d);
    const dx = P.x - g.x, dy = P.y - g.y, dist = Math.hypot(dx, dy) || 1;
    if (dist < 115 * ST.magnet){
      const pull = 560 * (1 - dist / (115 * ST.magnet)) + 160;
      g.x += dx / dist * pull * d; g.y += dy / dist * pull * d;
    }
    if (dist < P.r + 12){
      gems.splice(i, 1);
      xp += g.v;
      gemStreak++; gemStreakT = 0.9;
      sfx('gem', 1 + Math.min(gemStreak, 24) * 0.05);
      while (xp >= xpNeed()){
        xp -= xpNeed();
        level++;
        pendingLevels++;
        sfx('levelup');
        banner('LEVEL ' + level);
        floats.push({ x:P.x, y:P.y - 60, txt:'+1 强化 · 波末结算', t:0, col:'#6ee07a' });
        flashA = Math.max(flashA, 0.2);
        rings.push({ x:P.x, y:P.y, r:P.r, max:150, a:1, col:'#ffd23f' });
      }
    }
  }
  if (gems.length > 140){
    const old = gems.shift();
    if (gems.length) gems[gems.length - 1].v += old.v;
  }

  // 环刃
  if (ST.orbit > 0){
    orbitA += d * 4.4;
    for (let k = 0; k < ST.orbit; k++){
      const a = orbitA + k / ST.orbit * TAU;
      const bx = P.x + Math.cos(a) * 92, by = P.y + Math.sin(a) * 92;
      for (let i = enemies.length - 1; i >= 0; i--){
        const e = enemies[i];
        if (e.warmup > 0 || e.phased) continue;
        if (k === 0) e.orbCD = (e.orbCD || 0) - d;
        if (e.orbCD > 0) continue;
        if (Math.hypot(e.x - bx, e.y - by) < e.r + 15){
          e.orbCD = 0.45;
          burst(bx, by, PC.col, 5, a);
          hitEnemy(i, 1, Math.atan2(e.y - P.y, e.x - P.x), 300, false);
        }
      }
      if (boss && boss.warmup <= 0){
        boss.orbCD = (boss.orbCD || 0) - d / ST.orbit;
        if (boss.orbCD <= 0 && Math.hypot(boss.x - bx, boss.y - by) < boss.r + 15){
          boss.orbCD = 0.45;
          dmgBoss(1, Math.atan2(boss.y - P.y, boss.x - P.x), 30);
        }
      }
    }
  }

  // 追踪飞镖
  if (ST.seeker > 0){
    seekT -= d;
    if (seekT <= 0 && (enemies.length || boss)){
      seekT = 2.0;
      for (let k = 0; k < ST.seeker; k++){
        darts.push({ x:P.x, y:P.y, a:P.face + rnd(-0.6, 0.6) + k * 0.4, t:0, life:2.4 });
      }
      sfx('shoot');
    }
  }
  for (let i = darts.length - 1; i >= 0; i--){
    const dart = darts[i];
    dart.t += d;
    if (dart.t >= dart.life){ darts.splice(i, 1); continue; }
    // 追踪最近目标
    let tgt = null, td = 1e9;
    for (const e of enemies){
      if (e.warmup > 0 || e.phased) continue;
      const dd = Math.hypot(e.x - dart.x, e.y - dart.y);
      if (dd < td){ td = dd; tgt = e; }
    }
    if (boss && boss.warmup <= 0){
      const dd = Math.hypot(boss.x - dart.x, boss.y - dart.y);
      if (dd < td){ td = dd; tgt = boss; }
    }
    if (tgt){
      const wantA = Math.atan2(tgt.y - dart.y, tgt.x - dart.x);
      dart.a += angDiff(dart.a, wantA) * Math.min(1, 9 * d);
    }
    dart.x += Math.cos(dart.a) * 560 * d;
    dart.y += Math.sin(dart.a) * 560 * d;
    let hitDone = false;
    for (let j = enemies.length - 1; j >= 0; j--){
      const e = enemies[j];
      if (e.warmup > 0 || e.phased) continue;
      if (Math.hypot(e.x - dart.x, e.y - dart.y) < e.r + 10){
        burst(dart.x, dart.y, PC.col, 6, dart.a);
        hitEnemy(j, 2, dart.a, 260, false);
        hitDone = true;
        break;
      }
    }
    if (!hitDone && boss && boss.warmup <= 0 && Math.hypot(boss.x - dart.x, boss.y - dart.y) < boss.r + 10){
      dmgBoss(2, dart.a, 50);
      hitDone = true;
    }
    if (hitDone) darts.splice(i, 1);
  }

  // 冰封领域：范围内敌人持续减速
  for (let i = icefields.length - 1; i >= 0; i--){
    const ic = icefields[i];
    ic.t += d;
    if (ic.t >= ic.life){ icefields.splice(i, 1); continue; }
    for (const e of enemies){
      if (e.warmup > 0) continue;
      if (Math.hypot(e.x - ic.x, e.y - ic.y) < ic.r + e.r) e.slowT = Math.max(e.slowT || 0, 0.35);
    }
    if (boss && boss.warmup <= 0 && Math.hypot(boss.x - ic.x, boss.y - ic.y) < ic.r + boss.r)
      boss.slowT = Math.max(boss.slowT || 0, 0.3);
  }

  // 收割者焰痕
  for (let i = firetrails.length - 1; i >= 0; i--){
    const ft = firetrails[i];
    ft.t += d;
    if (ft.t >= ft.life){ firetrails.splice(i, 1); continue; }
    if (P.inv <= 0 && Math.hypot(P.x - ft.x, P.y - ft.y) < P.r + ft.r - 4)
      hurtPlayer(220, Math.atan2(P.y - ft.y, P.x - ft.x), 'boss');
  }

  // 轨道轰击落点
  for (let i = impacts.length - 1; i >= 0; i--){
    const im = impacts[i];
    im.t += d;
    if (im.t >= im.fuse){
      impacts.splice(i, 1);
      rings.push({ x:im.x, y:im.y, r:20, max:im.r + 30, a:1, col:'#ffd23f' });
      burst(im.x, im.y, '#ffd23f', 22, 0, true);
      sfx('impact');
      shake = Math.max(shake, 12);
      if (P.inv <= 0 && Math.hypot(P.x - im.x, P.y - im.y) < P.r + im.r)
        hurtPlayer(440, Math.atan2(P.y - im.y, P.x - im.x), 'boss');
      for (let j = enemies.length - 1; j >= 0; j--){
        const e = enemies[j];
        if (e.warmup > 0) continue;
        if (Math.hypot(e.x - im.x, e.y - im.y) < e.r + im.r){
          e.shieldHp = 0;
          e.hp -= 2; e.flash = 0.12;
          if (e.hp <= 0) killEnemy(j, rnd(0, TAU));
        }
      }
    }
  }

  // 灼烧
  for (let i = enemies.length - 1; i >= 0; i--){
    const e = enemies[i];
    if (e.burnT > 0){
      e.burnT -= d;
      if (e.burnT <= 0){
        e.hp -= 1; e.flash = 0.1;
        burst(e.x, e.y, '#ff7a3c', 6, rnd(0, TAU));
        sfx('burn');
        if (e.hp <= 0) killEnemy(i, rnd(0, TAU));
      }
    }
  }
  if (boss && boss.burnT > 0){
    boss.burnT -= d;
    if (boss.burnT <= 0){
      boss.hp -= 1; boss.flash = 0.1;
      burst(boss.x, boss.y, '#ff7a3c', 8, rnd(0, TAU));
      $('bossFill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
      if (boss.hp <= 0) killBoss();
    }
  }

  // 裂变连锁
  let exGuard = 0;
  while (explosionsQ.length && exGuard++ < 40){
    const ex = explosionsQ.shift();
    rings.push({ x:ex.x, y:ex.y, r:20, max:110, a:1, col:'#ffd23f' });
    burst(ex.x, ex.y, '#ffd23f', 14, 0, true);
    sfx('boom');
    shake = Math.max(shake, 8);
    for (let i = enemies.length - 1; i >= 0; i--){
      const e = enemies[i];
      if (e.warmup > 0 || e.phased) continue;
      if (Math.hypot(e.x - ex.x, e.y - ex.y) < 110 + e.r){
        e.shieldHp = 0;
        e.hp -= 1; e.flash = 0.12;
        if (e.hp <= 0) killEnemy(i, rnd(0, TAU));
      }
    }
  }

  // 飞刃
  for (let i = blades.length - 1; i >= 0; i--){
    const b = blades[i];
    b.t += d;
    if (b.t >= b.life || b.pierce <= 0){ blades.splice(i, 1); continue; }
    b.x += Math.cos(b.a) * 780 * d;
    b.y += Math.sin(b.a) * 780 * d;
    for (let j = enemies.length - 1; j >= 0; j--){
      const e = enemies[j];
      if (e.warmup > 0 || e.phased || b.hitset.has(e)) continue;
      if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + 12){
        b.hitset.add(e);
        b.pierce--;
        applyStatus(e);
        burst(e.x, e.y, e.col, 6, b.a);
        gainUlt(2);
        hitEnemy(j, 1, b.a, 260, false);
        if (b.pierce <= 0) break;
      }
    }
    if (boss && boss.warmup <= 0 && !b.hitset.has(boss) && Math.hypot(b.x - boss.x, b.y - boss.y) < boss.r + 12){
      b.hitset.add(boss);
      b.pierce--;
      dmgBoss(1, b.a, 40);
    }
  }

  // 敌方子弹
  for (let i = eshots.length - 1; i >= 0; i--){
    const s = eshots[i];
    s.t += d;
    if (s.t >= s.life){ eshots.splice(i, 1); continue; }
    s.x += s.vx * d; s.y += s.vy * d;
    if (Math.hypot(P.x - s.x, P.y - s.y) < P.r + 7){
      eshots.splice(i, 1);
      if (P.inv <= 0) hurtPlayer(380, Math.atan2(P.y - s.y, P.x - s.x), 'shooter');
      else burst(s.x, s.y, '#e85d9e', 5, 0);
    }
  }

  // 母巢脉冲环
  for (let i = pulses.length - 1; i >= 0; i--){
    const p = pulses[i];
    p.r += p.sp * d;
    if (p.r > 520){ pulses.splice(i, 1); continue; }
    const dist = Math.hypot(P.x - p.x, P.y - p.y);
    if (!p.hit && Math.abs(dist - p.r) < 16){
      p.hit = true;
      if (P.inv <= 0) hurtPlayer(420, Math.atan2(P.y - p.y, P.x - p.x), 'boss');
    }
  }

  waveSpawnT += d;
  for (let i = spawnQ.length - 1; i >= 0; i--){
    if (waveSpawnT >= spawnQ[i].t){ spawnEnemy(spawnQ[i].type); spawnQ.splice(i, 1); }
  }
  if (!spawnQ.length && (enemies.length || boss) && waveSpawnT > waveEndT + 9 && state === 'play'){
    if (!stallWarned){
      stallWarned = true; stallT = 0.5;
      for (const e of enemies) e.spd *= 1.5;   // 残敌暴走冲向玩家，波次不再拖尾
      toast('⚠ 歼灭催促 · 残敌暴走 · 猎杀者已被释放');
      banner('⚠ 猎 杀 者 ⚠');
    }
    stallT -= d;
    if (stallT <= 0){ stallT = 0.5; spawnHunter(); }   // 高频投放：要么速死要么速清，不拖泥带水
  }
  if (!spawnQ.length && !enemies.length && !boss && !waveDone && state === 'play'){
    waveDone = true; slowmo = 0.8;
    setTimeout(() => {
      if (state !== 'play') return;
      if (pendingLevels > 0) showUpgrades();   // 波末结算攒下的升级
      else nextWave();
    }, 1100);
  }

  // 敌人 AI
  for (let ei = enemies.length - 1; ei >= 0; ei--){
    const e = enemies[ei];
    if (e.warmup > 0){ e.warmup -= d; continue; }
    e.flash -= d; e.slowT -= d;
    e.rot += d * 2;
    const slowM = e.slowT > 0 ? 0.45 : 1;
    const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1;
    if (e.type === 'lunger'){
      e.lungeT -= d * slowM;
      if (e.lungeState === 0){
        e.x += dx/dist * e.spd * slowM * d; e.y += dy/dist * e.spd * slowM * d;
        if (dist < 240 && e.lungeT <= 0){ e.lungeState = 1; e.lungeT = 0.5; }
      } else if (e.lungeState === 1){
        if (e.lungeT <= 0){
          e.lungeState = 2; e.lungeT = 0.4;
          e.lvx = dx/dist * 620 * slowM; e.lvy = dy/dist * 620 * slowM;
          rings.push({ x:e.x, y:e.y, r:6, max:30, a:1, col:e.col });
        }
      } else {
        e.x += e.lvx * d; e.y += e.lvy * d;
        if (e.lungeT <= 0){ e.lungeState = 0; e.lungeT = 1; }
      }
    } else if (e.type === 'shooter'){
      e.lungeT -= d * slowM;
      if (dist > 400){ e.x += dx/dist * e.spd * slowM * d; e.y += dy/dist * e.spd * slowM * d; }
      else if (dist < 250){ e.x -= dx/dist * e.spd * 0.8 * slowM * d; e.y -= dy/dist * e.spd * 0.8 * slowM * d; }
      if (e.lungeT <= 0 && dist < 640){
        e.lungeT = rnd(1.7, 2.6) / MUT.espd;
        const sp2 = 320 + wave * 6;
        eshots.push({ x:e.x, y:e.y, vx:dx/dist*sp2, vy:dy/dist*sp2, t:0, life:3.2 });
        rings.push({ x:e.x, y:e.y, r:4, max:24, a:1, col:e.col });
        sfx('shoot');
      }
    } else if (e.type === 'bomber'){
      if (e.lungeState === 0){
        e.x += dx/dist * e.spd * slowM * d; e.y += dy/dist * e.spd * slowM * d;
        if (dist < 95){ e.lungeState = 1; e.lungeT = 0.65; }
      } else {
        e.lungeT -= d * slowM;
        e.x += dx/dist * e.spd * 0.25 * slowM * d; e.y += dy/dist * e.spd * 0.25 * slowM * d;
        if (e.lungeT <= 0){
          // 爆炸
          enemies.splice(ei, 1);
          rings.push({ x:e.x, y:e.y, r:30, max:130, a:1, col:'#ff4d6d' });
          burst(e.x, e.y, '#ff4d6d', 26, 0, true);
          sfx('boom');
          shake = Math.max(shake, 16);
          if (Math.hypot(P.x - e.x, P.y - e.y) < 125 + P.r && P.inv <= 0)
            hurtPlayer(460, Math.atan2(P.y - e.y, P.x - e.x), 'bomber');
          for (let j = enemies.length - 1; j >= 0; j--){
            const o = enemies[j];
            if (o.warmup > 0 || o.phased) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) < 125 + o.r){
              o.shieldHp = 0;
              o.hp -= 2; o.flash = 0.12;
              if (o.hp <= 0) killEnemy(j, rnd(0, TAU));
            }
          }
          continue;
        }
      }
    } else if (e.type === 'healer'){
      e.lungeT -= d * slowM;
      if (dist < 300){ e.x -= dx/dist * e.spd * slowM * d; e.y -= dy/dist * e.spd * slowM * d; }
      if (e.lungeT <= 0){
        e.lungeT = 3;
        let tgt = null, td = 1e9;
        for (const o of enemies){
          if (o === e || o.warmup > 0 || o.hp >= o.maxHp) continue;
          const dd = Math.hypot(o.x - e.x, o.y - e.y);
          if (dd < 320 && dd < td){ td = dd; tgt = o; }
        }
        if (tgt){
          tgt.hp = Math.min(tgt.maxHp, tgt.hp + 1);
          healFx.push({ x1:e.x, y1:e.y, x2:tgt.x, y2:tgt.y, t:0.4 });
          rings.push({ x:tgt.x, y:tgt.y, r:tgt.r, max:tgt.r + 26, a:1, col:'#7df0c0' });
          sfx('heal');
        }
      }
    } else if (e.type === 'phantom'){
      e.lungeT -= d;
      if (!e.phased && e.lungeT <= 0){ e.phased = true; e.lungeT = 1.1; }
      else if (e.phased && e.lungeT <= 0){ e.phased = false; e.lungeT = 1.7; rings.push({ x:e.x, y:e.y, r:4, max:30, a:1, col:e.col }); }
      const sp2 = e.spd * (e.phased ? 1.9 : 1) * slowM;
      const fl = (e.flank || 0) * clamp((dist - 110) / 420, 0, 1);
      const ca = Math.cos(fl), sa = Math.sin(fl);
      e.x += (dx * ca - dy * sa) / dist * sp2 * d; e.y += (dx * sa + dy * ca) / dist * sp2 * d;
    } else if (e.type === 'charger'){
      e.lungeT -= d * slowM;
      if (e.lungeState === 0){
        e.x += dx/dist * e.spd * slowM * d; e.y += dy/dist * e.spd * slowM * d;
        if (dist < 360 && e.lungeT <= 0){ e.lungeState = 1; e.lungeT = 0.6; e.cx = dx/dist; e.cy = dy/dist; sfx('warn'); }
      } else if (e.lungeState === 1){
        if (e.lungeT > 0.15){ e.cx = dx/dist; e.cy = dy/dist; }   // 锁定前持续瞄准
        if (e.lungeT <= 0){
          e.lungeState = 2; e.lungeT = 0.55;
          e.lvx = e.cx * 560 * slowM; e.lvy = e.cy * 560 * slowM;
          sfx('dash');
        }
      } else if (e.lungeState === 2){
        e.x += e.lvx * d; e.y += e.lvy * d;
        if (e.lungeT <= 0){ e.lungeState = 3; e.lungeT = 0.8; }
      } else {
        e.x += dx/dist * e.spd * 0.3 * slowM * d; e.y += dy/dist * e.spd * 0.3 * slowM * d;
        if (e.lungeT <= 0){ e.lungeState = 0; e.lungeT = rnd(1.2, 2.0); }
      }
    } else if (e.type === 'sniper'){
      e.lungeT -= d * slowM;
      if (e.lungeState === 0){
        // 保距按视野收缩，保证狙击手始终在可视范围边缘附近
        const keep = Math.min(420, Math.min(viewW(), viewH()) * 0.38);
        if (dist < keep){ e.x -= dx/dist * e.spd * slowM * d; e.y -= dy/dist * e.spd * slowM * d; }
        else if (dist > keep + 200){ e.x += dx/dist * e.spd * slowM * d; e.y += dy/dist * e.spd * slowM * d; }
        if (e.lungeT <= 0 && dist < 720){ e.lungeState = 1; e.lungeT = 0.9; e.aimA = Math.atan2(dy, dx); }
      } else {
        if (e.lungeT > 0.22) e.aimA = Math.atan2(dy, dx);   // 最后 0.22 秒锁定，给闪避窗口
        if (e.lungeT <= 0){
          e.lungeState = 0; e.lungeT = rnd(2.2, 3.2);
          const sp2 = 720;
          eshots.push({ x:e.x, y:e.y, vx:Math.cos(e.aimA)*sp2, vy:Math.sin(e.aimA)*sp2, t:0, life:2.2, col:'#ff8cf0' });
          sfx('snipe');
        }
      }
    } else if (e.type === 'brood'){
      e.lungeT -= d * slowM;
      if (dist < 280){ e.x -= dx/dist * e.spd * slowM * d; e.y -= dy/dist * e.spd * slowM * d; }
      else if (dist > 520){ e.x += dx/dist * e.spd * 0.6 * slowM * d; e.y += dy/dist * e.spd * 0.6 * slowM * d; }
      if (e.lungeT <= 0){
        e.lungeT = 4;
        if (enemies.length < 28){
          for (let k = 0; k < 2; k++) spawnEnemy('swarm', e.x + rnd(-30, 30), e.y + rnd(-30, 30), true);
          rings.push({ x:e.x, y:e.y, r:e.r * 0.5, max:e.r + 24, a:1, col:e.col });
          sfx('heal');
        }
      }
    } else if (e.type === 'vortex'){
      e.x += dx/dist * e.spd * slowM * d; e.y += dy/dist * e.spd * slowM * d;
      const pr = 270;
      if (dist < pr && P.dashT <= 0){
        const pull = 760 * (1 - dist / pr);
        P.vx -= dx/dist * pull * d; P.vy -= dy/dist * pull * d;
      }
    } else {
      const fl = (e.flank || 0) * clamp((dist - 110) / 420, 0, 1);
      const ca = Math.cos(fl), sa = Math.sin(fl);
      e.x += (dx * ca - dy * sa) / dist * e.spd * slowM * d;
      e.y += (dx * sa + dy * ca) / dist * e.spd * slowM * d;
    }
    e.x += e.vx * d; e.y += e.vy * d;
    e.vx *= Math.pow(0.001, d); e.vy *= Math.pow(0.001, d);
    // 出场后锁回屏幕内，杜绝远程怪蹲在视野外
    if (e.warmup <= 0){ e.x = clamp(e.x, 14, W - 14); e.y = clamp(e.y, 14, H - 14); }
    else { e.x = clamp(e.x, -60, W + 60); e.y = clamp(e.y, -60, H + 60); }
    if (!e.phased && e.type !== 'bomber' && Math.hypot(P.x - e.x, P.y - e.y) < P.r + e.r - 4 && P.inv <= 0)
      hurtPlayer(e.kb, Math.atan2(P.y - e.y, P.x - e.x), e.type);
  }

  // 分离力：相互推开，避免叠成一团
  for (let i = 0; i < enemies.length; i++){
    const a = enemies[i];
    if (a.warmup > 0 || a.phased) continue;
    for (let j = i + 1; j < enemies.length; j++){
      const b = enemies[j];
      if (b.warmup > 0 || b.phased) continue;
      let sx = b.x - a.x, sy = b.y - a.y;
      const sd = Math.hypot(sx, sy) || 0.01;
      const min = a.r + b.r - 2;
      if (sd < min){
        const push = (min - sd) / sd * 0.5;
        sx *= push; sy *= push;
        a.x -= sx; a.y -= sy;
        b.x += sx; b.y += sy;
      }
    }
  }

  // Boss AI
  if (boss){
    if (boss.warmup > 0) boss.warmup -= d;
    else {
      boss.flash -= d; boss.slowT -= d; boss.stT -= d;
      const slowM = boss.slowT > 0 ? 0.55 : 1;
      const enrage = boss.hp / boss.maxHp < 0.4;
      const mid = boss.hp / boss.maxHp < 0.7;
      const dx = P.x - boss.x, dy = P.y - boss.y, dist = Math.hypot(dx, dy) || 1;
      if (boss.kind === 'bulwark'){
        boss.rot += d * 0.7;
        if (boss.st === 'chase'){
          boss.x += dx/dist * (enrage ? 100 : 70) * slowM * d; boss.y += dy/dist * (enrage ? 100 : 70) * slowM * d;
          if (boss.stT <= 0){ boss.st = 'tele'; boss.stT = enrage ? 0.55 : 0.8; boss.cx = dx/dist; boss.cy = dy/dist; }
        } else if (boss.st === 'tele'){
          const a = Math.atan2(P.y - boss.y, P.x - boss.x);
          const cur = Math.atan2(boss.cy, boss.cx);
          const na = cur + angDiff(cur, a) * 0.06;
          boss.cx = Math.cos(na); boss.cy = Math.sin(na);
          if (boss.stT <= 0){ boss.st = 'charge'; boss.stT = 0.7; sfx('dash'); }
        } else if (boss.st === 'charge'){
          const chargeSp = mid ? 840 : 760;
          boss.x += boss.cx * chargeSp * slowM * d; boss.y += boss.cy * chargeSp * slowM * d;
          burst(boss.x, boss.y, boss.col, 1, Math.atan2(-boss.cy, -boss.cx));
          if (boss.x < boss.r || boss.x > W - boss.r || boss.y < boss.r || boss.y > H - boss.r || boss.stT <= 0){
            boss.x = clamp(boss.x, boss.r, W - boss.r); boss.y = clamp(boss.y, boss.r, H - boss.r);
            boss.st = 'stun'; boss.stT = enrage ? 1.0 : 1.3;
            shake = Math.max(shake, 14); sfx('bossHit');
            rings.push({ x:boss.x, y:boss.y, r:boss.r, max:boss.r + 70, a:1, col:'#fff' });
          }
        } else if (boss.st === 'stun'){
          if (boss.stT <= 0){ boss.st = 'chase'; boss.stT = enrage ? rnd(0.7, 1.3) : rnd(1.5, 2.6); }
        }
      } else if (boss.kind === 'prism'){
        boss.rot += d * 2.2;
        if (boss.st === 'chase'){ // 绕玩家漂移（镜头跟随后世界变大，不再绕世界中心）
          const tx = P.x + Math.cos(boss.rot * 0.3) * 320;
          const ty = P.y + Math.sin(boss.rot * 0.3) * 260;
          boss.x += (tx - boss.x) * 0.4 * d; boss.y += (ty - boss.y) * 0.4 * d;
          if (boss.stT <= 0){
            if (Math.random() < 0.6){
              boss.st = 'volley'; boss.stT = enrage ? 1.4 : 1.0; boss.fireT = 0;
              const n = 12 + Math.floor(wave/5) * 2 + (mid ? 4 : 0);
              for (let i = 0; i < n; i++){
                const a = i / n * TAU + boss.rot;
                const sp2 = 270 + wave * 5;
                eshots.push({ x:boss.x, y:boss.y, vx:Math.cos(a)*sp2, vy:Math.sin(a)*sp2, t:0, life:3.4 });
              }
              sfx('shoot');
              rings.push({ x:boss.x, y:boss.y, r:boss.r, max:boss.r + 50, a:1, col:boss.col });
            } else {
              boss.st = 'blink'; boss.stT = 0.6;
              const a = rnd(0, TAU);
              boss.tx = clamp(P.x + Math.cos(a) * 230, 80, W - 80);
              boss.ty = clamp(P.y + Math.sin(a) * 230, 80, H - 80);
              rings.push({ x:boss.tx, y:boss.ty, r:boss.r + 30, max:boss.r, a:1, col:'#ff3b5c' });
            }
          }
        } else if (boss.st === 'volley'){
          if (enrage){
            boss.fireT -= d;
            if (boss.fireT <= 0){
              boss.fireT = 0.13;
              const a = boss.rot * 3;
              const sp2 = 300 + wave * 5;
              eshots.push({ x:boss.x, y:boss.y, vx:Math.cos(a)*sp2, vy:Math.sin(a)*sp2, t:0, life:3 });
            }
          }
          if (boss.stT <= 0){ boss.st = 'chase'; boss.stT = enrage ? rnd(1.0, 1.6) : rnd(1.6, 2.4); }
        } else if (boss.st === 'blink'){
          if (boss.stT <= 0){
            burst(boss.x, boss.y, boss.col, 16, 0, true);
            boss.x = boss.tx; boss.y = boss.ty;
            burst(boss.x, boss.y, boss.col, 16, 0, true);
            sfx('dash');
            const n = 10;
            for (let i = 0; i < n; i++){
              const a = i / n * TAU;
              const sp2 = 250 + wave * 5;
              eshots.push({ x:boss.x, y:boss.y, vx:Math.cos(a)*sp2, vy:Math.sin(a)*sp2, t:0, life:3 });
            }
            boss.st = 'chase'; boss.stT = enrage ? rnd(0.9, 1.4) : rnd(1.5, 2.2);
          }
        }
      } else if (boss.kind === 'hive'){
        boss.rot += d * 0.5;
        boss.x += dx/dist * (enrage ? 68 : 46) * slowM * d; boss.y += dy/dist * (enrage ? 68 : 46) * slowM * d;
        boss.spawnT -= d;
        if (boss.spawnT <= 0){
          boss.spawnT = enrage ? 2.2 : mid ? 2.8 : 3.5;
          if (enemies.length < 24){
            for (let i = 0; i < 2; i++) spawnEnemy('swarm', boss.x + rnd(-40, 40), boss.y + rnd(-40, 40), true);
            rings.push({ x:boss.x, y:boss.y, r:boss.r * 0.5, max:boss.r + 20, a:1, col:boss.col });
          }
        }
        boss.pulseT -= d;
        if (boss.pulseT <= 0){
          boss.pulseT = enrage ? 4.5 : 6.5;
          pulses.push({ x:boss.x, y:boss.y, r:boss.r, sp:240 + wave * 3, hit:false });
          sfx('boom');
          shake = Math.max(shake, 8);
        }
      } else if (boss.kind === 'reaper'){
        boss.rot += d * 1.6;
        if (boss.st === 'chase'){
          boss.x += dx/dist * (enrage ? 150 : 110) * slowM * d; boss.y += dy/dist * (enrage ? 150 : 110) * slowM * d;
          if (boss.stT <= 0){
            if (Math.random() < 0.62){
              boss.st = 'aim'; boss.stT = 0.45;
              boss.cx = dx/dist; boss.cy = dy/dist;
              boss.dashes = 0;
              sfx('warn');
            } else {
              boss.st = 'btele'; boss.stT = 0.55;
              boss.tx = clamp(P.x - Math.cos(P.face) * 130, 70, W - 70);
              boss.ty = clamp(P.y - Math.sin(P.face) * 130, 70, H - 70);
            }
          }
        } else if (boss.st === 'aim'){
          if (boss.stT > 0.12){ boss.cx = dx/dist; boss.cy = dy/dist; }
          if (boss.stT <= 0){ boss.st = 'rdash'; boss.stT = 0.5; boss.fireT = 0; sfx('dash'); }
        } else if (boss.st === 'rdash'){
          boss.x += boss.cx * 880 * slowM * d; boss.y += boss.cy * 880 * slowM * d;
          boss.fireT -= d;
          if (boss.fireT <= 0){
            boss.fireT = 0.035;
            firetrails.push({ x:boss.x, y:boss.y, r:17, t:0, life: mid ? 1.6 : 1.2 });
          }
          if (boss.x < boss.r || boss.x > W - boss.r || boss.y < boss.r || boss.y > H - boss.r || boss.stT <= 0){
            boss.x = clamp(boss.x, boss.r, W - boss.r); boss.y = clamp(boss.y, boss.r, H - boss.r);
            boss.dashes = (boss.dashes || 0) + 1;
            if (enrage && boss.dashes < 2){
              boss.st = 'aim'; boss.stT = 0.32;
              boss.cx = dx/dist; boss.cy = dy/dist;
              sfx('warn');
            } else {
              boss.st = 'recover'; boss.stT = 0.7;
            }
          }
        } else if (boss.st === 'btele'){
          if (boss.stT <= 0){
            burst(boss.x, boss.y, boss.col, 16, 0, true);
            boss.x = boss.tx; boss.y = boss.ty;
            burst(boss.x, boss.y, boss.col, 16, 0, true);
            sfx('dash');
            const n = enrage ? 8 : 6;
            for (let i = 0; i < n; i++){
              const a = i / n * TAU + 0.3;
              const sp2 = 300 + wave * 4;
              eshots.push({ x:boss.x, y:boss.y, vx:Math.cos(a)*sp2, vy:Math.sin(a)*sp2, t:0, life:2.6, col:'#ff7a94' });
            }
            boss.st = 'recover'; boss.stT = 0.5;
          }
        } else if (boss.st === 'recover'){
          if (boss.stT <= 0){ boss.st = 'chase'; boss.stT = enrage ? rnd(0.8, 1.4) : rnd(1.3, 2.2); }
        }
      } else if (boss.kind === 'mortar'){
        boss.rot += d * 0.9;
        const keepM = Math.min(430, Math.min(viewW(), viewH()) * 0.4);
        if (dist < keepM){ boss.x -= dx/dist * 70 * slowM * d; boss.y -= dy/dist * 70 * slowM * d; }
        else if (dist > keepM + 220){ boss.x += dx/dist * 55 * slowM * d; boss.y += dy/dist * 55 * slowM * d; }
        if (boss.stT <= 0){
          boss.stT = enrage ? 2.3 : mid ? 2.8 : 3.4;
          const n = enrage ? 7 : mid ? 5 : 4;
          impacts.push({ x:P.x, y:P.y, r:74, t:0, fuse:1.15 });
          for (let i = 1; i < n; i++){
            const a = rnd(0, TAU), rr = rnd(70, 240);
            impacts.push({ x:clamp(P.x + Math.cos(a)*rr, 40, W-40), y:clamp(P.y + Math.sin(a)*rr, 40, H-40), r:74, t:0, fuse:1.15 + i * 0.07 });
          }
          sfx('warn');
          rings.push({ x:boss.x, y:boss.y, r:boss.r, max:boss.r + 40, a:1, col:boss.col });
        }
      }
      boss.x += boss.vx * d; boss.y += boss.vy * d;
      boss.vx *= Math.pow(0.001, d); boss.vy *= Math.pow(0.001, d);
      boss.x = clamp(boss.x, 30, W - 30); boss.y = clamp(boss.y, 30, H - 30);
      if (Math.hypot(P.x - boss.x, P.y - boss.y) < P.r + boss.r - 6 && P.inv <= 0)
        hurtPlayer(560, Math.atan2(P.y - boss.y, P.x - boss.x), 'boss');
    }
  }

  for (const s of slashes){
    if (s.weapon === 'dualx' || s.weapon === 'iaidash') continue;   // 直线轨迹类无扫弧粒子
    if (s.t < s.dur){
      const pr = s.t / s.dur;
      const ease = 1 - Math.pow(1 - pr, 3);
      const sweep = s.half * 2;
      const from = s.flip ? s.a + s.half : s.a - s.half;
      const dir = s.flip ? -1 : 1;
      const cur = from + dir * sweep * ease;
      const tipX = s.x + Math.cos(cur) * s.range * 0.95;
      const tipY = s.y + Math.sin(cur) * s.range * 0.95;
      for (let k = 0; k < 2; k++){
        particles.push({
          x:tipX, y:tipY,
          vx:Math.cos(cur + dir * 1.57) * rnd(80, 300) + rnd(-60, 60),
          vy:Math.sin(cur + dir * 1.57) * rnd(80, 300) + rnd(-60, 60),
          life:rnd(0.12, 0.3), t:0,
          col: s.heavy ? '#ffd23f' : '#' + (s.rgb === '126,224,255' ? '9eeaff' : s.rgb === '255,122,60' ? 'ffae6e' : 'd6c9ff'),
          sz:rnd(1.5, 3.5), rot:cur, vr:rnd(-20, 20)
        });
      }
    }
  }

  for (let i = particles.length - 1; i >= 0; i--){
    const p = particles[i];
    p.t += d;
    if (p.t >= p.life){ particles.splice(i, 1); continue; }
    p.x += p.vx * d; p.y += p.vy * d;
    p.vx *= Math.pow(0.01, d); p.vy *= Math.pow(0.01, d);
    p.rot += p.vr * d;
  }
  for (let i = slashes.length - 1; i >= 0; i--){
    slashes[i].t += pd;
    if (slashes[i].t >= slashes[i].dur + 0.14) slashes.splice(i, 1);
  }
  for (let i = floats.length - 1; i >= 0; i--){
    const f = floats[i];
    f.t += dt; f.y -= 50 * dt;
    if (f.t > 1) floats.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i--){
    const r = rings[i];
    r.r = lerp(r.r, r.max, 1 - Math.pow(0.001, d));
    r.a -= d * 2.4;
    if (r.a <= 0) rings.splice(i, 1);
  }
  for (let i = healFx.length - 1; i >= 0; i--){
    healFx[i].t -= d;
    if (healFx[i].t <= 0) healFx.splice(i, 1);
  }
  for (let i = cutmarks.length - 1; i >= 0; i--){
    cutmarks[i].t += d;
    if (cutmarks[i].t >= 0.32) cutmarks.splice(i, 1);
  }
  for (let i = ultLines.length - 1; i >= 0; i--){
    ultLines[i].t -= dt;
    if (ultLines[i].t < -0.35) ultLines.splice(i, 1);
  }

  if (shake > 0){
    shake = Math.max(0, shake - 60 * dt);
    shakeX = rnd(-shake, shake); shakeY = rnd(-shake, shake);
  } else shakeX = shakeY = 0;
  flashA = Math.max(0, flashA - dt * 2);

  $('scoreEl').textContent = score;
  const cb = $('comboBox');
  if (combo > 1){
    cb.classList.add('on');
    $('comboN').textContent = combo;
    $('comboFill').style.width = clamp(comboT / (BASE_COMBO_WIN + ST.comboWin) * 100, 0, 100) + '%';
    $('multEl2').textContent = '×' + multOf().toFixed(1);
  } else cb.classList.remove('on');
  $('ultFill').style.width = ult + '%';
  $('ultWrap').classList.toggle('ready', ult >= 100);
  $('xpFill').style.width = clamp(xp / xpNeed() * 100, 0, 100) + '%';
  $('lvlEl').textContent = 'LV ' + level;
  if (IS_TOUCH){
    // 闪避按钮的环形 CD 指示
    const el = $('tDash');
    const cd = clamp(P.dashCD / (1.55 * ST.dashCD), 0, 1);
    if (cd > 0){
      el.style.background = `conic-gradient(rgba(19,19,27,.85) ${cd * 360}deg, rgba(126,224,255,.22) 0deg)`;
      el.classList.remove('ready');
    } else {
      el.style.background = '';
      el.classList.add('ready');
    }
  }
}

// ---------- 绘制 ----------
function poly(x, y, r, n, rot){
  ctx.beginPath();
  for (let i = 0; i < n; i++){
    const a = rot + i/n * TAU;
    i ? ctx.lineTo(x + Math.cos(a)*r, y + Math.sin(a)*r) : ctx.moveTo(x + Math.cos(a)*r, y + Math.sin(a)*r);
  }
  ctx.closePath();
}
function crescent(x, y, r1, r0, a0, a1){
  ctx.beginPath();
  ctx.arc(x, y, r1, Math.min(a0, a1), Math.max(a0, a1));
  ctx.arc(x, y, r0, Math.max(a0, a1), Math.min(a0, a1), true);
  ctx.closePath();
}

function drawSlash(s){
  const pr = clamp(s.t / s.dur, 0, 1);
  const fade = 1 - pr * pr;
  if (s.weapon === 'iaidash'){
    // 拔刀瞬移斩轨迹：快速拉出的锥形剑光，终结段更粗更亮
    const lp = clamp(pr / 0.4, 0, 1);
    const x2 = s.x + (s.x2 - s.x) * lp, y2 = s.y + (s.y2 - s.y) * lp;
    const pxv = Math.cos(s.a + Math.PI / 2), pyv = Math.sin(s.a + Math.PI / 2);
    const mx2 = (s.x + x2) / 2, my2 = (s.y + y2) / 2;
    ctx.save();
    ctx.lineCap = 'round';
    // 底层淡residual光
    ctx.globalAlpha = fade * 0.3;
    ctx.strokeStyle = `rgba(${s.rgb},0.45)`;
    ctx.lineWidth = (s.heavy ? 9 : 6) * (1 - pr * 0.5);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(x2, y2); ctx.stroke();
    // 锥形白刃
    const w = (s.heavy ? 5 : 3.2) * (1 - pr * 0.4);
    ctx.globalAlpha = fade;
    ctx.shadowColor = `rgb(${s.rgb})`; ctx.shadowBlur = s.heavy ? 26 : 18;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(mx2 + pxv * w, my2 + pyv * w);
    ctx.lineTo(x2, y2);
    ctx.lineTo(mx2 - pxv * w, my2 - pyv * w);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // 拔刀瞬间的端点闪光
    if (pr < 0.35){
      ctx.globalAlpha = (1 - pr / 0.35) * 0.9;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = `rgb(${s.rgb})`; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(s.x, s.y, 4 + (s.heavy ? 3 : 0), 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  if (s.weapon === 'dualx'){
    // X 斩：两道锥形刀刃交叉于身前，带超调入场、交点闪光与霓虹残影
    const cx = s.x + Math.cos(s.a) * s.range * 0.5;
    const cy = s.y + Math.sin(s.a) * s.range * 0.5;
    const L = s.range * 0.78;
    ctx.save();
    ctx.lineCap = 'round';
    for (const [off, delay] of [[-0.55, 0], [0.55, 0.1]]){
      const lp = clamp((pr - delay) / 0.32, 0, 1);
      if (lp <= 0) continue;
      const a = s.a + off;
      const len = L * lp * (1 + 0.1 * Math.sin(lp * Math.PI));   // 轻微超调再回弹
      const x1 = cx - Math.cos(a) * len, y1 = cy - Math.sin(a) * len;
      const x2 = cx + Math.cos(a) * len, y2 = cy + Math.sin(a) * len;
      const pxv = Math.cos(a + Math.PI / 2), pyv = Math.sin(a + Math.PI / 2);
      // 底层残光（收敛：窄而淡）
      ctx.globalAlpha = fade * 0.3;
      ctx.strokeStyle = `rgba(${s.rgb},0.4)`;
      ctx.lineWidth = 8 * (1 - pr * 0.6);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      // 锥形白刃：两端尖、中间宽
      const w = 4.5 * (1 - pr * 0.5);
      ctx.globalAlpha = fade;
      ctx.shadowColor = `rgb(${s.rgb})`; ctx.shadowBlur = 26;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(cx + pxv * w, cy + pyv * w);
      ctx.lineTo(x2, y2);
      ctx.lineTo(cx - pxv * w, cy - pyv * w);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      // 霓虹错位残影
      if (pr > 0.45){
        ctx.globalAlpha = fade * 0.55;
        ctx.strokeStyle = `rgba(${s.rgb},0.85)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1 + pxv * 3, y1 + pyv * 3);
        ctx.lineTo(x2 + pxv * 3, y2 + pyv * 3);
        ctx.stroke();
      }
    }
    // 交点闪光：第二刀落下瞬间的旋转菱形光斑
    const fp = clamp((pr - 0.1) / 0.3, 0, 1);
    if (fp > 0 && fp < 1){
      ctx.globalAlpha = (1 - fp) * 0.9;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = `rgb(${s.rgb})`; ctx.shadowBlur = 30;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(s.a + fp * 1.2);
      const fs = 6 + fp * 26;
      ctx.beginPath();
      ctx.moveTo(fs, 0); ctx.lineTo(0, fs * 0.35); ctx.lineTo(-fs, 0); ctx.lineTo(0, -fs * 0.35);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  if (s.weapon === 'iaido' && s.heavy){
    // 突进一闪：直线剑光沿冲刺方向
    const x2 = s.x + Math.cos(s.a) * s.range, y2 = s.y + Math.sin(s.a) * s.range;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${s.rgb},0.4)`;
    ctx.lineWidth = 16 * (1 - pr);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.shadowColor = `rgb(${s.rgb})`; ctx.shadowBlur = 24;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 5 * (1 - pr * 0.5);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  const subDim = s.sub ? 0.6 : 1;
  const odachi = s.weapon === 'odachi';
  const ease = 1 - Math.pow(1 - pr, 3);
  const sweep = s.half * 2;
  const from = s.flip ? s.a + s.half : s.a - s.half;
  const dir = s.flip ? -1 : 1;
  const cur = from + dir * sweep * ease;
  const heavy = !!s.heavy;
  const rgb = heavy ? '255,210,63' : s.rgb;
  const R = s.range;
  const R0 = R * (heavy ? 0.38 : 0.5);
  const trailLen = dir * Math.min(sweep, heavy ? 2.2 : 1.5) * (0.55 + 0.45 * (1 - pr));
  const LAYERS = 5;
  for (let i = 0; i < LAYERS; i++){
    const f = i / LAYERS;
    const a1 = cur - trailLen * f;
    const a0 = cur - trailLen * (f + 1 / LAYERS) * 1.08;
    ctx.fillStyle = `rgba(${rgb},${(0.32 - f * 0.055) * fade * subDim})`;
    crescent(s.x, s.y, R * (1 - f * 0.04), R0 + (R - R0) * f * 0.35, a0, a1);
    ctx.fill();
  }
  ctx.fillStyle = `rgba(255,255,255,${0.1 * fade * subDim})`;
  crescent(s.x, s.y, R * 0.99, R * 0.86, cur - trailLen * 0.55, cur);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = `rgb(${rgb})`;
  ctx.shadowBlur = (heavy ? 22 : 16) + (odachi ? 6 : 0);
  ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade * subDim})`;
  ctx.lineWidth = (heavy ? 4 : 3) + (odachi ? 1 : 0) - (s.sub ? 1 : 0);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s.x + Math.cos(cur) * R0, s.y + Math.sin(cur) * R0);
  ctx.lineTo(s.x + Math.cos(cur) * R, s.y + Math.sin(cur) * R);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${fade})`;
  ctx.beginPath();
  ctx.arc(s.x + Math.cos(cur) * R * 0.97, s.y + Math.sin(cur) * R * 0.97, heavy ? 4 : 3, 0, TAU);
  ctx.fill();
  ctx.restore();
  if (heavy){
    ctx.fillStyle = `rgba(255,255,255,${0.18 * fade})`;
    crescent(s.x, s.y, R * 0.72, R * 0.52, cur - trailLen * 0.8, cur - trailLen * 0.15);
    ctx.fill();
  }
}

function drawPlayerAvatar(){
  if (ST.shieldOn && shieldT <= 0){
    ctx.strokeStyle = 'rgba(141,164,255,.55)';
    ctx.lineWidth = 1.5;
    poly(P.x, P.y, P.r + 10, 6, performance.now()/600);
    ctx.stroke();
  }

  const comboGlow = combo >= 20 ? 18 : combo >= 10 ? 9 : 0;
  if (combo >= 10){
    ctx.strokeStyle = combo >= 20 ? 'rgba(255,210,63,.5)' : `rgba(${PC.rgb},.4)`;
    ctx.lineWidth = 1.5;
    poly(P.x, P.y, P.r + 9 + Math.sin(performance.now()/120) * 2, 3, performance.now()/400);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(P.x, P.y);
  ctx.rotate(P.face);
  ctx.shadowColor = combo >= 20 ? '#ffd23f' : PC.col; ctx.shadowBlur = 18 + comboGlow;
  ctx.fillStyle = PC.col;
  poly(0, 0, P.r + 4, 3, 0);
  ctx.fill();
  ctx.fillStyle = '#0a0a0f';
  poly(0, 0, P.r - 3, 3, 0);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(4, 0, 3, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
}
function draw(){
  ctx.fillStyle = '#06060a';   // 世界边界之外的暗区
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.save();
  ctx.scale(VIEW_Z, VIEW_Z);
  const cx0 = camX(), cy0 = camY();
  ctx.translate(shakeX - cx0, shakeY - cy0);

  // 世界底色与边界（界外更暗）
  ctx.fillStyle = wt > 0 ? '#0b0b16' : '#0a0a0f';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(126,224,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // 网格：只绘制视野与世界的交集
  ctx.strokeStyle = wt > 0 ? 'rgba(126,224,255,0.09)' : 'rgba(126,224,255,0.045)';
  ctx.lineWidth = 1;
  const g = 56;
  const gx1 = Math.min(W, cx0 + viewW() + g), gy1 = Math.min(H, cy0 + viewH() + g);
  ctx.beginPath();
  for (let x = Math.max(0, Math.floor(cx0 / g) * g); x <= gx1; x += g){ ctx.moveTo(x, Math.max(0, cy0)); ctx.lineTo(x, gy1); }
  for (let y = Math.max(0, Math.floor(cy0 / g) * g); y <= gy1; y += g){ ctx.moveTo(Math.max(0, cx0), y); ctx.lineTo(gx1, y); }
  ctx.stroke();

  if (state === 'play' || state === 'pause'){
    for (const gv of gravesRun){
      if (gv.broken) continue;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#33334a';
      ctx.strokeStyle = '#5a5a78';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gv.x - 9, gv.y + 14);
      ctx.lineTo(gv.x - 7, gv.y - 10);
      ctx.lineTo(gv.x, gv.y - 18);
      ctx.lineTo(gv.x + 7, gv.y - 10);
      ctx.lineTo(gv.x + 9, gv.y + 14);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7a85a0';
      ctx.beginPath(); ctx.arc(gv.x, gv.y - 2, 2.5, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#9aa3b8';
      ctx.font = '10px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(gv.n, gv.x, gv.y + 28);
      ctx.fillText('W' + gv.w + ' · 斩碑复仇', gv.x, gv.y + 40);
      ctx.globalAlpha = 1;
    }
  }

  // 冰封领域
  for (const ic of icefields){
    const a = Math.min(1, (ic.life - ic.t) / 0.5);
    ctx.globalAlpha = 0.10 * a;
    ctx.fillStyle = '#b9a8ff';
    ctx.beginPath(); ctx.arc(ic.x, ic.y, ic.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.45 * a;
    ctx.strokeStyle = '#b9a8ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.arc(ic.x, ic.y, ic.r, performance.now()/1400, performance.now()/1400 + TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // 经验宝石
  for (const g of gems){
    const blink = g.t > 21 && Math.sin(g.t * 18) > 0;
    if (blink) continue;
    const col = g.v >= 4 ? '#ff8cf0' : g.v === 3 ? '#ffd23f' : g.v === 2 ? '#6ee07a' : '#7ee0ff';
    const sz = 4 + g.v;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(performance.now() / 400 + g.x);
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.fillStyle = col;
    ctx.fillRect(-sz/2, -sz/2, sz, sz);
    ctx.restore();
  }
  ctx.shadowBlur = 0;

  // 收割者焰痕
  for (const ft of firetrails){
    const a = 1 - ft.t / ft.life;
    ctx.globalAlpha = 0.5 * a;
    ctx.fillStyle = '#ff5e3a';
    ctx.shadowColor = '#ff3b5c'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(ft.x, ft.y, ft.r * (0.7 + 0.3 * a), 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.8 * a;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(ft.x, ft.y, ft.r * 0.35 * a, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // 轰击落点预警
  for (const im of impacts){
    const pr2 = im.t / im.fuse;
    ctx.globalAlpha = 0.35 + pr2 * 0.45;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2 + pr2 * 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.arc(im.x, im.y, im.r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(im.x, im.y, im.r * pr2, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 母巢脉冲环
  for (const p of pulses){
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = '#6ee07a';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#6ee07a'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // Boss 预警
  if (boss && boss.warmup <= 0 && boss.kind === 'bulwark' && boss.st === 'tele'){
    const urgency = 1 - clamp(boss.stT / 0.8, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.35 + urgency * 0.45;
    ctx.strokeStyle = boss.col;
    ctx.lineWidth = 3 + urgency * 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(boss.x, boss.y);
    ctx.lineTo(boss.x + boss.cx * 640, boss.y + boss.cy * 640);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  if (boss && boss.warmup <= 0 && boss.kind === 'prism' && boss.st === 'blink'){
    const urgency = 1 - clamp(boss.stT / 0.6, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.3 + urgency * 0.5;
    ctx.strokeStyle = '#ff3b5c';
    ctx.lineWidth = 2 + urgency * 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(boss.tx, boss.ty, boss.r + 26 - urgency * 14, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  for (const r of rings){
    ctx.globalAlpha = Math.max(0, r.a);
    ctx.strokeStyle = r.col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 治疗连线
  for (const h of healFx){
    ctx.globalAlpha = h.t * 2;
    ctx.strokeStyle = '#7df0c0';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(h.x1, h.y1); ctx.lineTo(h.x2, h.y2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  for (const t of P.trail){
    ctx.globalAlpha = t.t * 1.6;
    ctx.fillStyle = PC.col;
    const wid = PC.weapon?.id || 'iaido';
    poly(t.x, t.y, P.r + (wid === 'odachi' ? 3 : 0), wid === 'dual' ? 4 : wid === 'odachi' ? 5 : 3, t.a);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const e of enemies){
    if (e.warmup > 0){
      ctx.globalAlpha = 0.35 + Math.sin(e.warmup * 25) * 0.25;
      ctx.strokeStyle = e.hunter ? '#ff3b5c' : (e.elite ? '#fff' : e.col); ctx.lineWidth = 2;
      poly(e.x, e.y, e.r, e.sides, e.rot);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    if (e.phased) ctx.globalAlpha = 0.25;
    const flash = e.flash > 0;
    ctx.fillStyle = flash ? '#ffffff' : e.col;
    ctx.shadowColor = e.hunter ? '#ff3b5c' : e.col; ctx.shadowBlur = flash ? 24 : (e.elite || e.hunter ? 22 : 12);
    let rot = e.rot;
    if (e.type === 'chaser') rot = Math.atan2(P.y - e.y, P.x - e.x);
    else if (e.type === 'tank') rot = e.rot * 0.4;
    else if (e.type === 'shooter') rot = e.rot * 0.6;
    else if (e.type === 'bomber'){
      if (e.lungeState === 1) ctx.fillStyle = Math.sin(e.lungeT * 50) > 0 ? '#fff' : e.col;
    }
    else if (e.type === 'lunger'){
      rot = (e.lungeState === 2 ? Math.atan2(e.lvy, e.lvx) : Math.atan2(P.y - e.y, P.x - e.x)) + Math.PI/4;
      if (e.lungeState === 1) ctx.fillStyle = Math.sin(e.lungeT * 40) > 0 ? '#fff' : e.col;
    }
    poly(e.x, e.y, e.r, e.sides, rot);
    ctx.fill();
    // 战车蓄力冲撞预瞄线
    if (e.type === 'charger' && e.lungeState === 1){
      ctx.globalAlpha = 0.3 + (0.6 - e.lungeT) * 0.8;
      ctx.strokeStyle = e.col;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + e.cx * 480, e.y + e.cy * 480);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    // 狙击激光预瞄
    if (e.type === 'sniper' && e.lungeState === 1){
      const lock = e.lungeT <= 0.22;
      ctx.globalAlpha = lock ? 0.85 : 0.3 + Math.sin(performance.now()/60) * 0.1;
      ctx.strokeStyle = lock ? '#ff3b5c' : e.col;
      ctx.lineWidth = lock ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.aimA) * 900, e.y + Math.sin(e.aimA) * 900);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 引力井范围
    if (e.type === 'vortex'){
      ctx.globalAlpha = 0.18 + Math.sin(performance.now()/300) * 0.06;
      ctx.strokeStyle = e.col;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 10]);
      ctx.beginPath(); ctx.arc(e.x, e.y, 270, performance.now()/900, performance.now()/900 + TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.45;
      poly(e.x, e.y, e.r + 10 + Math.sin(performance.now()/200) * 4, e.sides, -e.rot * 1.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 自爆预警圈
    if (e.type === 'bomber' && e.lungeState === 1){
      ctx.globalAlpha = 0.25 + Math.sin(e.lungeT * 30) * 0.12;
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(e.x, e.y, 125, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = e.phased ? 0.25 : 1;
    }
    // 修复使十字
    if (e.type === 'healer'){
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(e.x - 2, e.y - 8, 4, 16);
      ctx.fillRect(e.x - 8, e.y - 2, 16, 4);
    }
    // 壁垒兵护盾
    if (e.shieldHp > 0){
      const fa = Math.atan2(P.y - e.y, P.x - e.x);
      ctx.strokeStyle = '#8da4ff';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#5c7cfa'; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 8, fa - 1.1, fa + 1.1);
      ctx.stroke();
    }
    if (e.elite || e.hunter){
      ctx.strokeStyle = e.hunter ? '#ff3b5c' : '#fff'; ctx.lineWidth = 2;
      ctx.globalAlpha = (e.phased ? 0.2 : 0.5) + Math.sin(performance.now()/120) * 0.3;
      poly(e.x, e.y, e.r + 6, e.sides, rot);
      ctx.stroke();
      ctx.globalAlpha = e.phased ? 0.25 : 1;
    }
    if (e.burnT > 0){
      ctx.fillStyle = '#ff7a3c';
      ctx.globalAlpha = 0.6 + Math.sin(performance.now()/60) * 0.3;
      ctx.beginPath(); ctx.arc(e.x, e.y - e.r - 8, 3, 0, TAU); ctx.fill();
      ctx.globalAlpha = e.phased ? 0.25 : 1;
    }
    if (e.slowT > 0){
      ctx.strokeStyle = 'rgba(185,168,255,.7)';
      ctx.lineWidth = 1.5;
      poly(e.x, e.y, e.r + 3, e.sides, rot);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  if (boss){
    if (boss.warmup > 0){
      ctx.globalAlpha = 0.4 + Math.sin(boss.warmup * 20) * 0.3;
      ctx.strokeStyle = boss.col; ctx.lineWidth = 3;
      poly(boss.x, boss.y, boss.r, boss.kind === 'prism' ? 4 : boss.kind === 'hive' ? 8 : boss.kind === 'reaper' ? 5 : boss.kind === 'mortar' ? 10 : 6, boss.rot); ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      const enr = boss.hp / boss.maxHp < 0.4;
      if (boss.kind === 'bulwark' && boss.st === 'tele'){
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 3;
        ctx.setLineDash([14, 10]);
        ctx.beginPath();
        ctx.moveTo(boss.x, boss.y);
        ctx.lineTo(boss.x + boss.cx * 900, boss.y + boss.cy * 900);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (boss.kind === 'prism' && boss.st === 'blink'){
        ctx.globalAlpha = 0.4 + Math.sin(performance.now()/70) * 0.2;
        ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(boss.tx, boss.ty, boss.r + 16, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (boss.kind === 'reaper' && boss.st === 'aim'){
        ctx.globalAlpha = 0.35 + (0.45 - boss.stT) * 1.2;
        ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.moveTo(boss.x, boss.y);
        ctx.lineTo(boss.x + boss.cx * 800, boss.y + boss.cy * 800);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (boss.kind === 'reaper' && boss.st === 'btele'){
        ctx.globalAlpha = 0.4 + Math.sin(performance.now()/60) * 0.2;
        ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(boss.tx, boss.ty, boss.r + 14, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      const sides = boss.kind === 'prism' ? 4 : boss.kind === 'hive' ? 8 : boss.kind === 'reaper' ? 5 : boss.kind === 'mortar' ? 10 : 6;
      let bodyR = boss.r;
      if (boss.kind === 'hive') bodyR = boss.r * (1 + Math.sin(performance.now()/300) * 0.05);
      ctx.fillStyle = boss.flash > 0 ? '#fff' : (enr ? (boss.kind === 'hive' ? '#a8f06e' : '#ff5e3a') : boss.col);
      ctx.shadowColor = boss.col; ctx.shadowBlur = 26;
      poly(boss.x, boss.y, bodyR, sides, boss.rot);
      ctx.fill();
      ctx.fillStyle = '#0a0a0f';
      poly(boss.x, boss.y, bodyR * 0.45, sides, -boss.rot * 1.5);
      ctx.fill();
      if (boss.kind === 'hive'){
        for (let i = 0; i < 3; i++){
          const a = boss.rot * 2 + i / 3 * TAU;
          ctx.fillStyle = '#6ee07a';
          ctx.beginPath();
          ctx.arc(boss.x + Math.cos(a) * bodyR * 0.28, boss.y + Math.sin(a) * bodyR * 0.28, 5 + Math.sin(performance.now()/200 + i) * 2, 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = boss.st === 'stun' ? '#ffd23f' : '#ff3b5c';
        ctx.beginPath(); ctx.arc(boss.x, boss.y, bodyR * 0.16, 0, TAU); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
  }

  for (const b of blades){
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a + Math.PI / 2);
    ctx.shadowColor = PC.col; ctx.shadowBlur = 12;
    ctx.fillStyle = `rgba(${PC.rgb},.85)`;
    crescent(0, 14, 18, 10, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.fill();
    ctx.restore();
  }
  ctx.shadowBlur = 0;

  // 环刃
  if (ST.orbit > 0 && (state === 'play' || state === 'pause')){
    for (let k = 0; k < ST.orbit; k++){
      const a = orbitA + k / ST.orbit * TAU;
      const bx = P.x + Math.cos(a) * 92, by = P.y + Math.sin(a) * 92;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(a + performance.now() / 90);
      ctx.shadowColor = PC.col; ctx.shadowBlur = 12;
      ctx.fillStyle = `rgba(${PC.rgb},.9)`;
      poly(0, 0, 10, 3, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = PC.col;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(P.x, P.y, 92, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  // 追踪飞镖
  for (const dart of darts){
    ctx.save();
    ctx.translate(dart.x, dart.y);
    ctx.rotate(dart.a);
    ctx.shadowColor = PC.col; ctx.shadowBlur = 10;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(-7, -4); ctx.lineTo(-4, 0); ctx.lineTo(-7, 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.shadowBlur = 0;

  for (const s of eshots){
    ctx.shadowColor = s.col || '#e85d9e'; ctx.shadowBlur = 12;
    ctx.fillStyle = s.col || '#ff9ecb';
    ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, TAU); ctx.fill();
  }
  ctx.shadowBlur = 0;

  for (const s of slashes) drawSlash(s);

  // 拔刀斩痕：被路径斩中的目标身上的白色刀痕
  for (const c of cutmarks){
    const cp = c.t / 0.32;
    const halfL = c.len * (0.55 + 0.45 * cp) * 0.5;
    const ca2 = Math.cos(c.a), sa2 = Math.sin(c.a);
    ctx.globalAlpha = (1 - cp) * 0.95;
    ctx.shadowColor = '#9eeaff'; ctx.shadowBlur = 14;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5 * (1 - cp * 0.5);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c.x - ca2 * halfL, c.y - sa2 * halfL);
    ctx.lineTo(c.x + ca2 * halfL, c.y + sa2 * halfL);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  for (const l of ultLines){
    if (l.t > 0) continue;
    const a = clamp(1 + l.t / 0.35, 0, 1);
    ctx.globalAlpha = a;
    ctx.strokeStyle = l.col || '#fff';
    ctx.lineWidth = (l.w || 3) + a * (l.grow || 4);
    ctx.shadowColor = l.glow || PC.col; ctx.shadowBlur = l.blur || 20;
    if (l.dash) ctx.setLineDash(l.dash);
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
    if (l.dash) ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  if (state !== 'over'){
    const blink = P.inv > 0 && Math.sin(P.inv * 30) > 0;
    ctx.globalAlpha = blink ? 0.35 : 1;
    drawPlayerAvatar();
    ctx.globalAlpha = 1;
  }

  for (const p of particles){
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = p.col;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillRect(-p.sz/2, -p.sz/2, p.sz, p.sz * 0.5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  for (const f of floats){
    ctx.globalAlpha = 1 - f.t;
    ctx.fillStyle = f.col;
    ctx.font = 'bold ' + Math.round((f.big ? 26 : f.dmg ? 12 : 15) / VIEW_Z) + 'px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // 屏幕外敌人指示箭头（屏幕空间）
  if (state === 'play' || state === 'pause'){
    const vw = cv.width, vh = cv.height;
    const cxs = vw / 2, cys = vh / 2;
    let shown = 0;
    const indicate = (wx, wy, col, size) => {
      const sxp = (wx - camX()) * VIEW_Z, syp = (wy - camY()) * VIEW_Z;
      if (sxp > -12 && sxp < vw + 12 && syp > -12 && syp < vh + 12) return;
      const dx = sxp - cxs, dy = syp - cys;
      const tx = dx !== 0 ? (dx > 0 ? (vw - 26 - cxs) / dx : (26 - cxs) / dx) : 1e9;
      const ty = dy !== 0 ? (dy > 0 ? (vh - 26 - cys) / dy : (26 - cys) / dy) : 1e9;
      const t = Math.min(tx, ty);
      ctx.save();
      ctx.translate(cxs + dx * t, cys + dy * t);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(size, 0); ctx.lineTo(-size * 0.6, -size * 0.6); ctx.lineTo(-size * 0.6, size * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    for (const e of enemies){
      if (e.warmup > 0) continue;
      if (shown >= 14) break;
      indicate(e.x, e.y, e.hunter ? '#ff3b5c' : e.col, e.elite ? 10 : 7);
      shown++;
    }
    if (boss && boss.warmup <= 0) indicate(boss.x, boss.y, boss.col, 13);
    ctx.globalAlpha = 1;
  }

  if (flashA > 0){
    ctx.fillStyle = `rgba(255,255,255,${flashA})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (state === 'pause'){
    ctx.fillStyle = 'rgba(10,10,15,.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8e8f0';
    ctx.font = 'bold 30px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('已 暂 停 · 按 P 继续', W/2, H/2);
  }
}

// ---------- 主循环 ----------
// 调试钩子：仅 ?debug=1 时暴露，便于跳波/升级测试
if (location.search.includes('debug=1')){
  window.__skipToWave = n => { wave = n - 1; enemies = []; spawnQ = []; eshots = []; impacts = []; firetrails = []; boss = null; waveDone = false; nextWave(); };
  window.__levelUp = () => { level++; pendingLevels++; };   // 波末结算
  window.__pstate = () => ({ st:state, stage:P.atkStage, atkT:+P.atkT.toFixed(3), buf:P.atkBuf, cool:+P.atkCool.toFixed(3), dst:+P.dashStrikeT.toFixed(2), sln:PC.slash.length, aspd:ST.aspd, x:Math.round(P.x), y:Math.round(P.y), inv:+P.inv.toFixed(2), slashW: slashes.map(s2 => s2.weapon).join(',') });
  window.__clearWave = () => {
    spawnQ = [];
    for (let i = enemies.length - 1; i >= 0; i--) killEnemy(i, 0);
    if (boss){ boss.hp = 0; killBoss(); }
  };
  window.__grantXp = n => { gems.push({ x:P.x + 30, y:P.y, v:n, vx:0, vy:0, t:0 }); };
}

let last = performance.now();
function loop(now){
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  try {
    if (state === 'play') update(dt);
    else if (state === 'over'){
      for (let i = particles.length - 1; i >= 0; i--){
        const p = particles[i];
        p.t += dt;
        if (p.t >= p.life){ particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= Math.pow(0.01, dt); p.vy *= Math.pow(0.01, dt);
      }
      shake = Math.max(0, shake - 60 * dt);
      shakeX = rnd(-shake, shake); shakeY = rnd(-shake, shake);
    }
    updateCamera(dt);
    draw();
  } catch(e){
    if (!window.__frameErrs || window.__frameErrs.length < 3){
      console.error('frame error:', e);
      window.__frameErrs = (window.__frameErrs || []).concat((e.message || '?'));
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
let titleClicks = 0, titleClickT = 0;
$('titleEl').addEventListener('click', () => {
  const now = Date.now();
  if (now - titleClickT > 2000) titleClicks = 0;
  titleClickT = now;
  if (++titleClicks >= 5){
    titleClicks = 0;
    unlockDebugProgression();
  }
});
loadSaves();
