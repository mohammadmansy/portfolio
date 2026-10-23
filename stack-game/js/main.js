/* ============================================================
   Stack — bootstrap & frame loop
   Wires renderer, simulation, input, audio and UI together and
   drives them with a fixed-timestep loop:

     accumulator += frameTime
     while (accumulator >= FIXED_DT) { simulate(FIXED_DT) }

   Physics then advances in the same steps on every device
   (30 / 60 / 90 / 120 Hz), which keeps the game feeling
   identical on a cheap phone and a 144 Hz monitor.

   Rendering is on demand: a frame is only painted while something
   is actually moving, so static screens sit at ~0% CPU instead of
   burning a full repaint every vsync.
   ============================================================ */

import { VIEW, CAMERA, STORAGE_KEY, GAME_OVER_DELAY_MS } from './config.js';
import { Renderer } from './renderer.js';
import { Game, STATE } from './game.js';
import { createInput } from './input.js';
import { UI } from './ui.js';
import {
  unlock, toggle as toggleSound, playDrop, playPerfect, playCrash, playLevelUp
} from './audio.js';
import { isHapticsOn, setHapticsOn, setBest, hasSeenHowTo, markSeenHowTo } from './storage.js';
import { initLanguage, applyDocumentLanguage, t } from './i18n.js';

const FIXED_DT = 1000 / 120; // 120 Hz simulation
const MAX_FRAME = 250;       // clamp long stalls (tab switch etc.)

/* ---------- canvas: crisp on any pixel density ---------- */

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(VIEW.WIDTH * dpr);
  canvas.height = Math.round(VIEW.HEIGHT * dpr);
  canvas.style.width = '100%';
  canvas.style.height = 'auto';

  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.scale(dpr, dpr);

  // the renderer works in CSS pixels
  const renderer = new Renderer(canvas);
  renderer.W = VIEW.WIDTH;
  renderer.H = VIEW.HEIGHT;
  renderer.CX = VIEW.WIDTH * CAMERA.CX_MULT;
  renderer.CY = VIEW.HEIGHT * CAMERA.CY_MULT;
  return renderer;
}

/* ---------- haptics ---------- */

function buzz(pattern) {
  if (!isHapticsOn()) return;
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* unsupported — ignore */ }
}

/* ---------- boot ---------- */

function boot() {
  initLanguage();

  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;

  const renderer = setupCanvas(canvas);
  const game = new Game(renderer);

  let overTimer = 0;
  // force a paint after any state change; the loop then goes idle
  let needsRender = true;

  function paint() { needsRender = true; }

  const actions = {
    start() { startRun(); },
    resume() { game.resume(); ui.refresh(); paint(); },
    restart() { startRun(); },
    menu() {
      clearTimeout(overTimer);
      game.toMenu();
      ui.refresh();
      paint();
    },
    toggleSound() { return toggleSound(); },
    toggleHaptics() {
      const on = !isHapticsOn();
      setHapticsOn(on);
      return on;
    },
    pauseForSettings() {
      game.pause();
      ui.openSettings('pause');
      paint();
    },
    markSeenHowTo() { markSeenHowTo(); }
  };

  const ui = new UI(game, actions);

  function startRun() {
    clearTimeout(overTimer);
    unlock(); // must happen inside a user gesture for iOS
    game.start();
    ui.hideAll();
    ui.setHint(t('hint'));
    acc = 0;
    last = performance.now();
    paint();
  }

  // The crash beat: the world settles for SETTLE_MS, then freezes.
  // The panel waits until just after that so nothing moves behind it.
  game.onGameOver = (score, best, data) => {
    clearTimeout(overTimer);
    overTimer = setTimeout(() => {
      if (game.state === STATE.OVER) ui.showGameOver(data);
    }, GAME_OVER_DELAY_MS);
    paint();
  };

  // level-up celebration (visual + audio) driven by game callback
  game.onLevelUp = (level) => {
    ui.setLevelUp(t('levelReached', { n: level }));
    playLevelUp();
    buzz(20);
    paint();
  };

  /* ---------- input ---------- */
  createInput(
    canvas,
    () => {
      if (game.state === STATE.MENU) { startRun(); return; }
      if (game.state === STATE.PAUSED) { game.resume(); ui.refresh(); paint(); return; }
      if (game.state !== STATE.PLAYING) return;

      const outcome = game.drop();
      if (outcome === 'crash') {
        playCrash();
        buzz([14, 36, 26]);
      } else if (outcome === 'perfect') {
        playPerfect(game.combo);
        buzz(10);
      } else if (outcome === 'placed') {
        playDrop();
        buzz(6);
      }
      paint();
    },
    () => {
      // Escape / P: pause while live, back out of a screen otherwise
      if (game.state === STATE.PLAYING) {
        game.pause();
        ui.refresh();
      } else if (game.state === STATE.PAUSED) {
        game.resume();
        ui.refresh();
      } else if (game.state === STATE.OVER) {
        actions.menu();
        return;
      } else {
        return;
      }
      paint();
    }
  );

  /* ---------- auto-pause when the app / tab is backgrounded ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === STATE.PLAYING) {
      game.pause();
      ui.refresh();
      paint();
    }
  });
  window.addEventListener('blur', () => {
    if (game.state === STATE.PLAYING) {
      game.pause();
      ui.refresh();
      paint();
    }
  });

  // theme changes (if embedded in a themed page) → refresh colours
  const mo = new MutationObserver(() => {
    renderer.refreshColors();
    paint();
  });
  mo.observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme']
  });

  /* ---------- frame loop ---------- */
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    let dt = now - last;
    last = now;
    if (dt < 0) dt = 0;
    if (dt > MAX_FRAME) dt = MAX_FRAME;

    if (game.state === STATE.PLAYING) {
      acc += dt;
      // run whole fixed steps; leftover fraction stays in acc
      while (acc >= FIXED_DT) {
        game.update(FIXED_DT);
        acc -= FIXED_DT;
        if (game.state !== STATE.PLAYING) { acc = 0; break; }
      }
    } else if (game.isAnimating()) {
      // settling after a crash — let the debris finish, then freeze
      game.update(dt);
    }

    // paint only while something is actually moving, or when a state
    // change asked for a fresh frame
    if (needsRender || game.isAnimating()) {
      game.render();
      needsRender = false;
    }
    requestAnimationFrame(frame);
  }

  /* ---------- initial paint ---------- */
  applyDocumentLanguage();
  game.reset();
  game.toMenu();
  ui.setBest(game.best);
  setBest(game.best); // re-write so the key exists

  // first run: teach the rule before the menu
  if (!hasSeenHowTo()) ui.showHowTo('title');
  else ui.showTitle();

  ui.setHint(t('hint'));
  requestAnimationFrame(frame);

  // PWA shortcut deep link: index.html?play=1 skips the menu
  if (new URLSearchParams(window.location.search).get('play') === '1') {
    startRun();
  }

  // expose a tiny hook so tests / tools can drive the game
  window.__stackGame = { game, ui, renderer, t };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export {};
