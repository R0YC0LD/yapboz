let ctx;
let master;
let noiseBuffer;
let enabled = true;

export function wakeSound() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function toggleSound() {
  enabled = !enabled;
  return enabled;
}

function noise({ freq, q = 1, gain, attack = 0.002, decay, when = 0, sweepTo }) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(freq, t);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  src.connect(filter).connect(env).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + decay + 0.02);
}

function tone({ freq, gain, decay, when = 0, type = 'triangle', to }) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + decay);
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(env).connect(master);
  osc.start(t);
  osc.stop(t + decay + 0.02);
}

export const sfx = {
  pick() {
    noise({ freq: 2600, q: 2, gain: 0.25, decay: 0.05 });
  },
  drop() {
    noise({ freq: 900, q: 1.2, gain: 0.25, decay: 0.07 });
  },
  snap(streak = 1) {
    noise({ freq: 1900, q: 1.4, gain: 0.6, decay: 0.05 });
    tone({ freq: 190, to: 90, gain: 0.5, decay: 0.09, type: 'sine' });
    if (streak > 1) tone({ freq: 440 * 2 ** (Math.min(streak, 12) / 12), gain: 0.09, decay: 0.22, when: 0.03 });
  },
  shake() {
    for (let i = 0; i < 9; i++) noise({ freq: 1100 + Math.random() * 1800, q: 1.4, gain: 0.3, decay: 0.07, when: i * 0.1 + Math.random() * 0.03 });
  },
  kiss() {
    noise({ freq: 1100, sweepTo: 3400, q: 3, gain: 0.5, attack: 0.03, decay: 0.09, when: 0.04 });
    tone({ freq: 520, to: 1250, gain: 0.1, decay: 0.1, when: 0.04, type: 'sine' });
  },
  lid() {
    noise({ freq: 320, sweepTo: 900, q: 0.8, gain: 0.5, attack: 0.08, decay: 0.34 });
  },
  rattle(level) {
    if (Math.random() < level) noise({ freq: 1400 + Math.random() * 2400, q: 2, gain: 0.06 + level * 0.16, decay: 0.03 });
  },
  sweep() {
    noise({ freq: 700, sweepTo: 2400, q: 0.6, gain: 0.2, attack: 0.2, decay: 0.5 });
  },
  win() {
    [523, 659, 784, 1047, 1319].forEach((freq, i) => tone({ freq, gain: 0.17, decay: 0.7, when: i * 0.11 }));
  },
};
