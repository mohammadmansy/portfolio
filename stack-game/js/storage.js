/* ============================================================
   Stack — persistent storage
   Wraps localStorage with graceful fallback (private mode,
   quota errors, SSR / file:// contexts).
   ============================================================ */

import { STORAGE_KEY } from './config.js';

const DEFAULTS = {
  best: 0,
  sound: true,
  haptics: true
};

let cache = null;

function readRaw() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeRaw(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    /* ignore quota / private-mode failures — game still plays */
  }
}

export function load() {
  if (cache) return cache;
  const stored = readRaw();
  cache = Object.assign({}, DEFAULTS, stored || {});
  return cache;
}

export function save(patch) {
  cache = Object.assign({}, load(), patch || {});
  writeRaw({
    best: cache.best,
    sound: cache.sound,
    haptics: cache.haptics
  });
  return cache;
}

export function getBest() {
  return load().best;
}

export function setBest(score) {
  const cur = load().best;
  if (score > cur) {
    save({ best: score });
    return true;
  }
  return false;
}

export function isSoundOn() {
  return load().sound;
}

export function setSoundOn(on) {
  save({ sound: !!on });
}

export function isHapticsOn() {
  return load().haptics;
}

export function setHapticsOn(on) {
  save({ haptics: !!on });
}
