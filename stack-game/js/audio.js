/* ============================================================
   Stack — procedural audio
   Every sound is synthesised with the Web Audio API, so the
   whole game ships with zero audio assets (small download,
   instant load, no licensing). Audio is lazily created on the
   first user gesture to satisfy mobile autoplay policies.
   ============================================================ */

import { isSoundOn, setSoundOn } from './storage.js';

let ctx = null;
let enabled = isSoundOn();

function ensureContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/**
 * Play a single shaped tone.
 * @param {number} freq   start frequency (Hz)
 * @param {number} dur    length (seconds)
 * @param {string} type   oscillator type
 * @param {number} gain   peak gain (0..1)
 * @param {number} delay  start offset (seconds)
 */
function tone(freq, dur, type, gain, delay) {
  if (!enabled || !ctx) return;
  const t0 = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();

  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);

  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain || 0.05, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.14));

  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + (dur || 0.14) + 0.03);
}

/* ---------- public sound cues ---------- */

export function unlock() {
  ensureContext();
}

export function setEnabled(on) {
  enabled = !!on;
  setSoundOn(on);
  if (enabled) ensureContext();
}

export function isEnabled() {
  return enabled;
}

export function toggle() {
  setEnabled(!enabled);
  return enabled;
}

export function playDrop() {
  tone(150 + Math.random() * 40, 0.09, 'triangle', 0.045);
}

export function playPerfect(combo) {
  const base = 480 + Math.min(11, (combo || 1)) * 55;
  tone(base, 0.14, 'sine', 0.06);
  tone(base * 1.5, 0.18, 'sine', 0.03, 0.04);
}

export function playCrash() {
  tone(92, 0.4, 'sawtooth', 0.07);
  tone(58, 0.5, 'sine', 0.05, 0.02);
}

export function playLevelUp() {
  const notes = [523, 659, 784]; // C5, E5, G5
  notes.forEach((f, i) => tone(f, 0.16, 'sine', 0.05, i * 0.09));
}
