/* ============================================================
   Stack — persistent storage
   Wraps localStorage with graceful fallback (private mode,
   quota errors, SSR / file:// contexts).
   ============================================================ */

import { STORAGE_KEY } from './config.js';

const DEFAULTS = {
  best: 0,
  bestStreak: 0,
  sound: true,
  haptics: true,
  lang: '',        // '' = auto-detect from the browser
  seenHowTo: false
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
    bestStreak: cache.bestStreak,
    sound: cache.sound,
    haptics: cache.haptics,
    lang: cache.lang,
    seenHowTo: cache.seenHowTo
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

export function getBestStreak() {
  return load().bestStreak;
}

export function setBestStreak(n) {
  const cur = load().bestStreak;
  if (n > cur) {
    save({ bestStreak: n });
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

export function getLangPref() {
  return load().lang;
}

export function setLangPref(code) {
  save({ lang: code || '' });
}

export function hasSeenHowTo() {
  return load().seenHowTo;
}

export function markSeenHowTo() {
  save({ seenHowTo: true });
}

export function resetProgress() {
  save({ best: 0, bestStreak: 0 });
}
