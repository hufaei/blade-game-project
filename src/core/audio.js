let AC = null;
let noiseBuf = null;
let muted = false;
let master = null;
let musGain = null;
let musTimer = null;
let nextStep = 0;
let stepIdx = 0;
let intensity = 0;

export function setMuted(m) {
  muted = !!m;
  if (musGain) musGain.gain.value = muted ? 0 : 0.5;
}

export function isMuted() {
  return muted;
}

export function initAudio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  const len = AC.sampleRate * 0.5;
  noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  // 主总线：压缩器防爆音
  master = AC.createGain();
  master.gain.value = 0.9;
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 5;
  master.connect(comp).connect(AC.destination);
  musGain = AC.createGain();
  musGain.gain.value = muted ? 0 : 0.5;
  musGain.connect(master);
}

export function resumeAudio() {
  if (AC && AC.state === 'suspended') AC.resume();
}

function env(g, t0, a, peak, dur) {
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
}

// ---------- 环境音乐：小调五声音阶程序化循环 ----------
const SCALE = [0, 3, 5, 7, 10, 12];
const ROOT = 110; // A2

function tone(freq, t, dur, peak, type = 'triangle') {
  const o = AC.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  const f = AC.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 700 + intensity * 2600;
  const g = AC.createGain();
  env(g, t, 0.02, peak, dur);
  o.connect(f).connect(g).connect(musGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function scheduleMusic() {
  if (!AC) return;
  const STEP = 0.24; // ~125bpm 八分音符
  if (nextStep < AC.currentTime) nextStep = AC.currentTime + 0.05;
  while (nextStep < AC.currentTime + 0.65) {
    const t = nextStep;
    const bar = Math.floor(stepIdx / 8) % 4;
    const beat = stepIdx % 8;
    // 低音脉冲：每小节 1、5 拍，后两小节降音制造行进感
    if (beat === 0 || beat === 4) {
      tone(ROOT / 2 * (bar === 2 ? 0.749 : bar === 3 ? 0.667 : 1), t, 0.42, 0.16, 'triangle');
    }
    // 琶音：密度随强度增长
    const density = intensity > 0.66 ? 1 : intensity > 0.33 ? 2 : 4;
    if (beat % density === 0 && stepIdx % 16 !== 15) {
      const deg = SCALE[(stepIdx * 7 + bar * 3) % SCALE.length];
      const oct = (stepIdx % 5 === 0 && intensity > 0.5) ? 4 : 2;
      tone(ROOT * oct * Math.pow(2, deg / 12), t, 0.22, 0.05 + intensity * 0.04, 'square');
    }
    // 高强度时的镲点
    if (intensity > 0.55 && beat % 2 === 1) {
      const s = AC.createBufferSource();
      s.buffer = noiseBuf;
      const f = AC.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6000;
      const g = AC.createGain();
      env(g, t, 0.001, 0.025, 0.06);
      s.connect(f).connect(g).connect(musGain);
      s.start(t);
      s.stop(t + 0.1);
    }
    stepIdx++;
    nextStep += STEP;
  }
}

export function startMusic() {
  if (!AC || musTimer) return;
  nextStep = AC.currentTime + 0.1;
  stepIdx = 0;
  musTimer = setInterval(scheduleMusic, 200);
}

export function stopMusic() {
  if (musTimer) {
    clearInterval(musTimer);
    musTimer = null;
  }
}

export function setMusicIntensity(v) {
  intensity = Math.max(0, Math.min(1, v));
}

// ---------- 音效 ----------
export function sfx(type, opt = 1) {
  if (!AC || muted) return;
  const t = AC.currentTime;
  const vr = 0.95 + Math.random() * 0.1; // 音高随机化，去除重复感
  const osc = (wave, f0, f1, dur, peak, atk = 0.002, dl = 0) => {
    const o = AC.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0 * vr, t + dl);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * vr), t + dl + dur * 0.8);
    const g = AC.createGain();
    env(g, t + dl, atk, peak, dur);
    o.connect(g).connect(master);
    o.start(t + dl);
    o.stop(t + dl + dur + 0.05);
  };
  const noise = (filt, f0, f1, dur, peak, q = 1) => {
    const s = AC.createBufferSource();
    s.buffer = noiseBuf;
    const f = AC.createBiquadFilter();
    f.type = filt;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0 * vr, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * vr), t + dur * 0.8);
    const g = AC.createGain();
    env(g, t, 0.005, peak, dur);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + dur + 0.05);
  };

  if (type === 'swing') noise('bandpass', 700, 2600, 0.13, 0.25, 1.5);
  else if (type === 'hit'){ osc('square', 190, 60, 0.1, 0.35); noise('highpass', 2500, 2500, 0.05, 0.2); }
  else if (type === 'kill'){ osc('sawtooth', 420, 90, 0.2, 0.4); osc('sine', 880, 1500, 0.09, 0.12, 0.001); }
  else if (type === 'crit'){ osc('square', 320, 70, 0.14, 0.45); osc('sine', 1200, 2200, 0.1, 0.15, 0.001); }
  else if (type === 'dash') noise('lowpass', 3000, 300, 0.18, 0.22);
  else if (type === 'hurt') osc('sawtooth', 140, 45, 0.3, 0.5);
  else if (type === 'comboUp'){ osc('sine', 660, 660, 0.15, 0.2, 0.005); osc('sine', 990, 990, 0.12, 0.15, 0.005, 0.07); }
  else if (type === 'bossHit') osc('square', 110, 40, 0.16, 0.45);
  else if (type === 'perfect'){ osc('sine', 1400, 700, 0.3, 0.22, 0.001); noise('bandpass', 1800, 400, 0.35, 0.15, 3); }
  else if (type === 'burn') noise('bandpass', 900, 300, 0.12, 0.12, 2);
  else if (type === 'parry'){ osc('sine', 1800, 900, 0.12, 0.2, 0.001); noise('highpass', 4000, 4000, 0.06, 0.15); }
  else if (type === 'shoot') osc('square', 480, 240, 0.08, 0.15, 0.001);
  else if (type === 'boom'){ osc('sawtooth', 90, 30, 0.35, 0.5); noise('lowpass', 2000, 200, 0.3, 0.35); }
  else if (type === 'heal') osc('sine', 520, 880, 0.25, 0.14, 0.01);
  else if (type === 'shieldbrk'){ osc('triangle', 900, 300, 0.18, 0.25, 0.001); noise('highpass', 3000, 3000, 0.1, 0.18); }
  else if (type === 'grave'){ osc('sine', 220, 440, 0.4, 0.18, 0.01); osc('sine', 330, 660, 0.5, 0.12, 0.01, 0.12); }
  else if (type === 'gem'){ const m = Math.min(2.2, opt); osc('sine', 760 * m, 1180 * m, 0.07, 0.1, 0.001); }
  else if (type === 'levelup'){
    [523, 659, 784, 1047].forEach((fq, i) => osc('triangle', fq, fq, 0.32, 0.18, 0.005, i * 0.07));
    noise('bandpass', 1200, 3500, 0.4, 0.1, 2);
  }
  else if (type === 'snipe'){ osc('sawtooth', 1500, 180, 0.2, 0.22, 0.001); noise('highpass', 5000, 2000, 0.12, 0.1); }
  else if (type === 'warn') osc('square', 880, 840, 0.08, 0.09, 0.001);
  else if (type === 'impact'){ osc('sawtooth', 120, 28, 0.4, 0.5); noise('lowpass', 1600, 120, 0.36, 0.4); noise('highpass', 3000, 3000, 0.06, 0.15); }
  else if (type === 'ult'){
    noise('bandpass', 200, 4500, 0.45, 0.4, 1);
    osc('sawtooth', 60, 30, 0.5, 0.45);
    [880, 1320, 1760].forEach((fq, i) => osc('sine', fq, fq, 0.3, 0.14, 0.005, 0.12 + i * 0.05));
  }
  else if (type === 'wave'){
    [523, 659, 784].forEach((fq, i) => osc('triangle', fq, fq, 0.35, 0.18, 0.01, i * 0.09));
  }
  else if (type === 'pick') osc('triangle', 520, 1040, 0.15, 0.2, 0.005);
  else if (type === 'ach'){ osc('sine', 784, 784, 0.2, 0.18, 0.005); osc('sine', 1175, 1175, 0.25, 0.16, 0.005, 0.1); }
}
