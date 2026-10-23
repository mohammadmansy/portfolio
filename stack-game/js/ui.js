/* ============================================================
   Stack — UI layer
   Owns the screen system (title / how-to / settings / pause /
   game over) and mirrors game state into the DOM. Contains no
   gameplay — it only shows state and forwards button clicks.

   Screens are shown by toggling the `hidden` attribute on a
   single container each, so exactly one is ever on screen.
   ============================================================ */

import { STATE } from './game.js';
import {
  isSoundOn, setSoundOn, isHapticsOn, setHapticsOn,
  getBest, getBestStreak, resetProgress
} from './storage.js';
import { t, getLanguage, setLanguage, applyDocumentLanguage, LANGS } from './i18n.js';

const $ = (sel) => document.querySelector(sel);

const SCREEN = {
  NONE: null,
  TITLE: 'title',
  HOWTO: 'howto',
  SETTINGS: 'settings',
  PAUSE: 'pause',
  OVER: 'over'
};

const SCREEN_IDS = {
  title: 'screen-title',
  howto: 'screen-howto',
  settings: 'screen-settings',
  pause: 'screen-pause',
  over: 'screen-over'
};

export class UI {
  constructor(game, actions) {
    this.game = game;
    this.actions = actions;
    this.current = null;
    this.settingsFrom = SCREEN.TITLE;
    this.toastTimer = 0;

    this.stage = $('.stage');
    this.screens = {};
    for (const key in SCREEN_IDS) {
      this.screens[key] = document.getElementById(SCREEN_IDS[key]);
    }

    this.scoreEl = $('#score');
    this.bestEl = $('#best');
    this.streakEl = $('#streak');
    this.streakStat = $('#streakStat');
    this.titleBestEl = $('#titleBest');
    this.hintEl = $('#hint');
    this.levelUpEl = $('#levelUp');

    this.soundBtn = $('#soundBtn');
    this.hapticsBtn = $('#hapticsBtn');
    this.settingsBtn = $('#settingsBtn');

    this.setSound = $('#setSound');
    this.setHaptics = $('#setHaptics');
    this.langEn = $('#langEn');
    this.langAr = $('#langAr');
    this.settingsToast = $('#settingsToast');

    this.recordBadge = $('#recordBadge');
    this.overScore = $('#overScore');
    this.overBest = $('#overBest');
    this.overStreak = $('#overStreak');

    this.bind();
    this.syncToggles();

    // game → UI reactions
    game.onScoreChange = (n) => this.setScore(n);
    game.onBestChange = (n) => this.setBest(n);
  }

  /* ---------- wiring ---------- */

  bind() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', () => {
        el.blur();
        fn();
      });
    };

    // title
    on('playBtn', () => this.actions.start());
    on('howToBtn', () => this.showHowTo());
    on('titleSettingsBtn', () => this.openSettings(SCREEN.TITLE));

    // how to play
    on('howToDone', () => {
      this.actions.markSeenHowTo();
      if (this.settingsFrom === SCREEN.TITLE || !this.game.isPlaying()) {
        this.showTitle();
      } else {
        this.showPause();
      }
    });

    // settings
    on('settingsBack', () => this.closeSettings());
    on('settingsBtn', () => {
      if (this.game.state === STATE.PLAYING) {
        this.actions.pauseForSettings();
      } else {
        this.openSettings(this.current === SCREEN.PAUSE ? SCREEN.PAUSE : SCREEN.TITLE);
      }
    });
    on('resetBestBtn', () => {
      resetProgress();
      this.game.best = 0;
      this.setBest(0);
      this.game.bestStreak = 0;
      this.toast(t('resetDone'));
    });
    on('langEn', () => this.setLang('en'));
    on('langAr', () => this.setLang('ar'));

    if (this.setSound) {
      this.setSound.addEventListener('change', () => {
        setSoundOn(this.setSound.checked);
        this.syncToggles();
      });
    }
    if (this.setHaptics) {
      this.setHaptics.addEventListener('change', () => {
        setHapticsOn(this.setHaptics.checked);
        this.syncToggles();
      });
    }

    // pause
    on('resumeBtn', () => this.actions.resume());
    on('pauseRestartBtn', () => this.actions.restart());
    on('pauseMenuBtn', () => this.actions.menu());

    // game over
    on('againBtn', () => this.actions.restart());
    on('overMenuBtn', () => this.actions.menu());

    // top-bar toggles
    if (this.soundBtn) {
      this.soundBtn.addEventListener('click', () => {
        this.soundBtn.blur();
        const onNow = this.actions.toggleSound();
        this.syncToggles();
        this.toast(t('sound') + (onNow ? ' ✓' : ' ✕'));
      });
    }
    if (this.hapticsBtn) {
      this.hapticsBtn.addEventListener('click', () => {
        this.hapticsBtn.blur();
        const onNow = this.actions.toggleHaptics();
        this.syncToggles();
      });
    }
  }

  /* ---------- screens ---------- */

  showScreen(name) {
    this.current = name;
    for (const key in this.screens) {
      const el = this.screens[key];
      if (!el) continue;
      if (key === name) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    }
    // the stage backdrop only appears while a screen is up
    if (this.stage) {
      this.stage.classList.toggle('has-screen', !!name);
    }
  }

  hideAll() {
    this.showScreen(SCREEN.NONE);
  }

  showTitle() {
    this.titleBestEl.textContent = this.game.best;
    this.showScreen(SCREEN.TITLE);
  }

  showHowTo(from) {
    this.settingsFrom = from || this.settingsFrom;
    this.showScreen(SCREEN.HOWTO);
  }

  openSettings(from) {
    this.settingsFrom = from || SCREEN.TITLE;
    this.syncToggles();
    this.showScreen(SCREEN.SETTINGS);
  }

  closeSettings() {
    if (this.settingsFrom === SCREEN.PAUSE) this.showPause();
    else this.showTitle();
  }

  showPause() {
    this.showScreen(SCREEN.PAUSE);
  }

  /**
   * Game-over panel. Called from main.js AFTER the crash has had a
   * beat to settle, so the player sees the tower break first.
   */
  showGameOver(data) {
    const record = data && data.record;
    this.overScore.textContent = this.game.score;
    this.overBest.textContent = this.game.best;
    this.overStreak.textContent = (data && data.streak) || 0;
    if (this.recordBadge) {
      if (record) this.recordBadge.removeAttribute('hidden');
      else this.recordBadge.setAttribute('hidden', '');
    }
    this.showScreen(SCREEN.OVER);
  }

  /** Mirror the current state onto the screen set. */
  refresh() {
    const st = this.game.state;
    if (st === STATE.MENU) this.showTitle();
    else if (st === STATE.PAUSED) this.showPause();
    else this.hideAll();
  }

  /* ---------- HUD ---------- */

  setScore(n) {
    this.scoreEl.textContent = n;
    // small pop so the number feels alive
    this.scoreEl.classList.remove('pop');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('pop');

    // streak counter only earns its place once there is one
    const combo = this.game.combo;
    if (this.streakStat) {
      if (combo > 0) {
        this.streakStat.removeAttribute('hidden');
        this.streakEl.textContent = combo;
      } else {
        this.streakStat.setAttribute('hidden', '');
      }
    }
  }

  setBest(n) {
    this.bestEl.textContent = n;
    if (this.titleBestEl) this.titleBestEl.textContent = n;
  }

  setHint(msg) {
    if (this.hintEl) this.hintEl.textContent = msg;
  }

  setLevelUp(msg) {
    if (!this.levelUpEl) return;
    this.levelUpEl.textContent = msg;
    this.levelUpEl.classList.remove('show');
    void this.levelUpEl.offsetWidth;
    this.levelUpEl.classList.add('show');
  }

  /* ---------- toggles / language ---------- */

  syncToggles() {
    const sound = isSoundOn();
    const haptics = isHapticsOn();

    if (this.soundBtn) {
      this.soundBtn.setAttribute('aria-pressed', sound ? 'true' : 'false');
    }
    if (this.hapticsBtn) {
      this.hapticsBtn.setAttribute('aria-pressed', haptics ? 'true' : 'false');
    }
    if (this.setSound) this.setSound.checked = sound;
    if (this.setHaptics) this.setHaptics.checked = haptics;

    const lang = getLanguage();
    if (this.langEn) this.langEn.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
    if (this.langAr) this.langAr.setAttribute('aria-pressed', lang === 'ar' ? 'true' : 'false');
  }

  setLang(code) {
    if (!LANGS.includes(code)) return;
    setLanguage(code);
    applyDocumentLanguage();
    this.syncToggles();
  }

  toast(msg) {
    if (!this.settingsToast) return;
    this.settingsToast.textContent = msg;
    this.settingsToast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.settingsToast.classList.remove('show');
    }, 1600);
  }
}
