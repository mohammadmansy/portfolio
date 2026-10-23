/* ============================================================
   Stack — strings & language
   English + Arabic (RTL). `t()` is deliberately pure — it reads
   a plain table and never touches the DOM — so the simulation in
   game.js can call it and still be tested headlessly.
   ============================================================ */

import { getLangPref, setLangPref } from './storage.js';

export const LANGS = ['en', 'ar'];

const STRINGS = {
  en: {
    brand: 'Stack',
    tagline: 'Build higher. One tap at a time.',
    hint: 'Tap to drop',

    height: 'Height',
    best: 'Best',
    streak: 'Streak',
    bestStreak: 'Best streak',
    level: 'Level',

    play: 'Play',
    resume: 'Resume',
    restart: 'Restart',
    playAgain: 'Play again',
    menu: 'Menu',
    back: 'Back',
    gotIt: 'Got it',

    howTo: 'How to play',
    howToTitle: 'How to play',
    howTo1: 'Tap anywhere — or press Space — to drop the block.',
    howTo2: 'It sweeps in beside the tower. Land it on the block below.',
    howTo3: 'Dead centre is PERFECT: the block keeps its full width and your streak grows. Miss, and the overhang is sliced off forever.',

    settings: 'Settings',
    sound: 'Sound',
    haptics: 'Haptics',
    language: 'Language',
    resetBest: 'Reset best score',
    resetDone: 'Best score cleared',
    credits: 'Made by Mohamed Mansy',

    paused: 'Paused',
    pausedSub: 'Take a breath. Ready when you are.',

    gameOverTitle: 'Tower collapsed',
    newBest: 'NEW BEST!',
    perfect: 'PERFECT',
    perfectCombo: 'PERFECT ×{n}',
    levelReached: 'LEVEL {n}!'
  },

  ar: {
    brand: 'Stack',
    tagline: 'ابني أعلى. ضغطة واحدة في كل مرة.',
    hint: 'اضغط للإسقاط',

    height: 'الارتفاع',
    best: 'الأفضل',
    streak: 'التتابع',
    bestStreak: 'أفضل تتابع',
    level: 'المستوى',

    play: 'العب',
    resume: 'كمّل',
    restart: 'ابدأ من جديد',
    playAgain: 'العب تاني',
    menu: 'القائمة',
    back: 'رجوع',
    gotIt: 'تمام',

    howTo: 'طريقة اللعب',
    howToTitle: 'طريقة اللعب',
    howTo1: 'اضغط في أي مكان — أو اضغط Space — عشان تسقط القطعة.',
    howTo2: 'القطعة بتيجي جنب البرج. أسقطها فوق القطعة اللي تحتها.',
    howTo3: 'لو وصلت للنص بالظبط تبقى «مثالي»: القطعة بتعمل بالعرض كامل وتزيد تتابعك. لو غلطت، الجزء الزايد بيتشال نهائيًا.',

    settings: 'الإعدادات',
    sound: 'الصوت',
    haptics: 'الاهتزاز',
    language: 'اللغة',
    resetBest: 'مسح أفضل نتيجة',
    resetDone: 'اتمسحت أفضل نتيجة',
    credits: 'صنعها محمد منسي',

    paused: 'متوقف مؤقتًا',
    pausedSub: 'خد نفسك، وإنت جاهز.',

    gameOverTitle: 'البرج وقع',
    newBest: 'رقم قياسي جديد!',
    perfect: 'مثالي',
    perfectCombo: 'مثالي ×{n}',
    levelReached: 'المرحلة {n}!'
  }
};

let current = 'en';

/** Pick a language: stored choice first, then the browser's. */
export function detectLanguage() {
  const stored = getLangPref();
  if (stored && STRINGS[stored]) return stored;
  try {
    const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (nav.indexOf('ar') === 0) return 'ar';
  } catch (e) { /* no navigator (SSR / tests) */ }
  return 'en';
}

export function initLanguage() {
  current = detectLanguage();
  return current;
}

export function getLanguage() {
  return current;
}

export function setLanguage(code) {
  if (!STRINGS[code] || code === current) return current;
  current = code;
  setLangPref(code);
  applyDocumentLanguage();
  return current;
}

/** Reset the stored choice so the browser decides again. */
export function useAutoLanguage() {
  setLangPref('');
  return setLanguage(detectLanguage());
}

/** Translate a key, optionally substituting {placeholders}. */
export function t(key, vars) {
  const table = STRINGS[current] || STRINGS.en;
  let s = table[key];
  if (s === undefined) s = STRINGS.en[key];
  if (s === undefined) return key;
  if (vars) {
    for (const k in vars) {
      s = s.split('{' + k + '}').join(String(vars[k]));
    }
  }
  return s;
}

/**
 * Push the current language into the document: <html lang/dir> and
 * every element carrying a data-i18n key. Called on boot and whenever
 * the user switches language.
 */
export function applyDocumentLanguage() {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.lang = current;
  el.dir = current === 'ar' ? 'rtl' : 'ltr';
  el.classList.toggle('lang-ar', current === 'ar');

  const nodes = document.querySelectorAll('[data-i18n]');
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    node.textContent = t(node.getAttribute('data-i18n'));
  }

  const aria = document.querySelectorAll('[data-i18n-aria]');
  for (let i = 0; i < aria.length; i++) {
    const node = aria[i];
    node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria')));
  }
}
