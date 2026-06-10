let AC = null;
let noiseBuf = null;

export function initAudio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  const len = AC.sampleRate * 0.5;
  noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

export function resumeAudio() {
  if (AC && AC.state === 'suspended') AC.resume();
}

function env(g, t0, a, peak, dur) {
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
}

export function sfx(type) {
  if (!AC) return;
  const t = AC.currentTime;
  const osc = (wave, f0, f1, dur, peak, atk = 0.002, dl = 0) => {
    const o = AC.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0, t + dl);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dl + dur * 0.8);
    const g = AC.createGain();
    env(g, t + dl, atk, peak, dur);
    o.connect(g).connect(AC.destination);
    o.start(t + dl);
    o.stop(t + dl + dur + 0.05);
  };
  const noise = (filt, f0, f1, dur, peak, q = 1) => {
    const s = AC.createBufferSource();
    s.buffer = noiseBuf;
    const f = AC.createBiquadFilter();
    f.type = filt;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur * 0.8);
    const g = AC.createGain();
    env(g, t, 0.005, peak, dur);
    s.connect(f).connect(g).connect(AC.destination);
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
