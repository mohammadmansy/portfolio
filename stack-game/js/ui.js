/* ============================================================
   Stack — UI layer
   Binds the DOM overlays (menu / pause / game over) and the
   HUD counters to the Game instance. Contains no gameplay — it
   only mirrors state and forwards button clicks.
   ============================================================ */

import { STATE } from './game.js';
import { isSoundOn, isHapticsOn } from './storage.js';

const $ = (sel) => document.querySelector(sel);

export class UI {
  constructor(game, actions) {
    this.game = game;
    this.actions = actions; // { start, resume, restart, menu, toggleSound, toggleHaptics }

    this.overlay = $('#overlay');
    this.overlayTitle = $('#overlayTitle');
    this.overlayText = $('#overlayText');
    this.overlaySub = $('#overlaySub');
    this.primaryBtn = $('#primaryBtn');
    this.menuBtn = $('#menuBtn');

    this.scoreEl = $('#score');
    this.bestEl = $('#best');
    this.soundBtn = $('#soundBtn');
    this.hapticsBtn = $('#hapticsBtn');

    this.bestEl.textContent = game.best;
    this.syncButtons();

    this.primaryBtn.addEventListener('click', () => {
      this.primaryBtn.blur();
      const st = this.game.state;
      if (st === STATE.MENU) this.actions.start();
      else if (st === STATE.OVER) this.actions.restart();
      else if (st === STATE.PAUSED) this.actions.resume();
    });

    if (this.menuBtn) {
      this.menuBtn.addEventListener('click', () => {
        this.menuBtn.blur();
        this.actions.menu();
      });
    }

    if (this.soundBtn) {
      this.soundBtn.addEventListener('click', () => {
        const on = this.actions.toggleSound();
        this.syncButtons();
        this.soundBtn.blur();
        this.setHint('Sound ' + (on ? 'on' : 'off'));
      });
    }

    if (this.hapticsBtn) {
      this.hapticsBtn.addEventListener('click', () => {
        const on = this.actions.toggleHaptics();
        this.syncButtons();
        this.hapticsBtn.blur();
        this.setHint('Haptics ' + (on ? 'on' : 'off'));
      });
    }

    // game → UI reactions
    game.onScoreChange = (n) => this.setScore(n);
    game.onBestChange = (n) => { this.bestEl.textContent = n; };
    game.onLevelUp = (level) => this.setLevelUp(level);
    game.onGameOver = (score, best) => this.showGameOver(score, best);
  }

  /* ---------- HUD ---------- */

  setScore(n) {
    this.scoreEl.textContent = n;
    // small pop so the number feels alive
    this.scoreEl.classList.remove('pop');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('pop');
  }

  /* ---------- overlay ---------- */

  show(title, text, sub, primaryLabel, showMenu) {
    this.overlayTitle.textContent = title;
    this.overlayText.textContent = text;
    if (this.overlaySub) this.overlaySub.textContent = sub || '';
    this.primaryBtn.textContent = primaryLabel;
    if (this.menuBtn) this.menuBtn.style.display = showMenu ? '' : 'none';
    this.overlay.classList.remove('hidden');
  }

  hide() {
    this.overlay.classList.add('hidden');
  }

  showMenu() {
    this.show(
      'Stack',
      'Build the tower as high as you can.',
      'Tap or press Space to drop.',
      'Play',
      false
    );
  }

  showPause() {
    this.show('Paused', 'Take a breath.', 'Ready when you are.', 'Resume', true);
  }

  showGameOver(score, best) {
    const isRecord = score > 0 && score >= best;
    this.show(
      'Tower collapsed',
      'You stacked ' + score + ' high' + (isRecord ? ' \u2014 new best!' : ''),
      best > 0 ? 'Best: ' + best : '',
      'Build again',
      true
    );
  }

  showLevelFlash(level) {
    const el = $('#levelFlash');
    if (!el) return;
    el.textContent = 'Level ' + level;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  setHint(msg) {
    const el = $('#hint');
    if (el) el.textContent = msg;
  }

  setLevelUp(msg) {
    const el = $('#levelUp');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  syncButtons() {
    if (this.soundBtn) {
      const on = isSoundOn();
      this.soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      this.soundBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
    }
    if (this.hapticsBtn) {
      const on = isHapticsOn();
      this.hapticsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      this.hapticsBtn.setAttribute('aria-label', on ? 'Disable haptics' : 'Enable haptics');
    }
  }

  /** Mirror the current state onto the overlay (after pause / resume). */
  refresh() {
    const st = this.game.state;
    if (st === STATE.MENU) this.showMenu();
    else if (st === STATE.PAUSED) this.showPause();
    else this.hide();
  }
}
