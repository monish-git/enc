// Retro sound effects synthesised with the Web Audio API (no audio files needed).
let enabled = false;
let ctx = null;

export const setSoundEnabled = (v) => {
  enabled = !!v;
};
export const isSoundEnabled = () => enabled;

const SOUNDS = {
  click: [[880, 0.025, 'square', 0.04]],
  send: [[660, 0.05, 'square', 0.06], [990, 0.07, 'square', 0.06]],
  receive: [[784, 0.07, 'triangle', 0.09], [1175, 0.1, 'triangle', 0.09], [1568, 0.12, 'triangle', 0.08]],
  decrypt: [[440, 0.04, 'sawtooth', 0.05], [554, 0.04, 'sawtooth', 0.05], [659, 0.04, 'sawtooth', 0.05], [880, 0.09, 'sawtooth', 0.05]],
  unlock: [[523, 0.06, 'square', 0.06], [784, 0.1, 'square', 0.06]],
  lock: [[784, 0.06, 'square', 0.06], [392, 0.1, 'square', 0.06]],
  error: [[220, 0.12, 'sawtooth', 0.08], [165, 0.2, 'sawtooth', 0.08]],
  boot: [[440, 0.1, 'square', 0.05], [660, 0.1, 'square', 0.05], [880, 0.18, 'square', 0.05]],
};

export function playSound(name) {
  if (!enabled) return;
  const seq = SOUNDS[name];
  if (!seq) return;
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx ||= new AC();
    if (ctx.state === 'suspended') ctx.resume();
    let t = ctx.currentTime;
    for (const [freq, dur, type, vol] of seq) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur;
    }
  } catch {
    /* audio is best-effort */
  }
}
