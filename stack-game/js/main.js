/* ============================================================
   Stack — bootstrap & frame loop
   Wires renderer, simulation, input, audio and UI together and
   drives them with a fixed-timestep loop:

     accumulator += frameTime
     while (accumulator >= FIXED_DT) { simulate(FIXED_DT) }

   Physics then advances in the same steps on every device
   (30 / 60 / 90 / 120 Hz), which keeps the game feeling
   identical on a cheap phone and a 144 Hz monitor.
   ============================================================ */

import { VIEW, CAMERA, BLOCK, STORAGE_KEY } from './config.js';
import { Renderer } from './renderer.js';
import { Game, STATE } from './game.js';
import { createInput } from './input.js';
import { UI } from './ui.js';
import {
  unlock, isEnabled, toggle as toggleSound, playDrop, playPerfect, playCrash, playLevelUp
} from './audio.js';
import { isHapticsOn, setHapticsOn, setBest } from './storage.js';

const FIXED_DT = 1000 / 120; // 120 Hz simulation
const MAX_FRAME = 250;       // clamp long stalls (tab switch etc.)

/* ---------- canvas: crisp on any pixel density ---------- */

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(VIEW.WIDTH * dpr);
  canvas.height = Math.round(VIEW.HEIGHT * dpr);
  canvas.style.width = '100%';
  canvas.style.height = 'auto';

  const ctx = canvas.getContext('2d');
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
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;

  const renderer = setupCanvas(canvas);
  const game = new Game(renderer);

  const actions = {
    start() { startRun(); },
    resume() { game.resume(); ui.refresh(); },
    restart() { startRun(); },
    menu() { game.toMenu(); ui.refresh(); },
    toggleSound() { const on = toggleSound(); return on; },
    toggleHaptics() {
      const on = !isHapticsOn();
      setHapticsOn(on);
      return on;
    }
  };

  const ui = new UI(game, actions);

  function startRun() {
    unlock(); // must happen inside a user gesture for iOS
    game.start();
    ui.hide();
    acc = 0;
    last = performance.now();
  }

  /* ---------- input ---------- */
  createInput(
    canvas,
    () => {
      if (game.state === STATE.MENU) { startRun(); return; }
      if (game.state === STATE.PAUSED) { game.resume(); ui.refresh(); return; }
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
    },
    () => {
      // pause / resume only makes sense while a run is live
      if (game.state === STATE.PLAYING) {
        game.pause();
        ui.refresh();
      } else if (game.state === STATE.PAUSED) {
        game.resume();
        ui.refresh();
      }
    }
  );

  // level-up celebration (visual + audio) driven by game callback
  game.onLevelUp = (level) => {
    ui.setLevelUp('Level ' + level + '!');
    playLevelUp();
    buzz(20);
  };

  /* ---------- auto-pause when the app / tab is backgrounded ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === STATE.PLAYING) {
      game.pause();
      ui.refresh();
    }
  });
  window.addEventListener('blur', () => {
    if (game.state === STATE.PLAYING) {
      game.pause();
      ui.refresh();
    }
  });

  // theme changes (if embedded in a themed page) → refresh colours
  const mo = new MutationObserver(() => {
    renderer.refreshColors();
    if (game.state !== STATE.PLAYING) game.render();
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
    }

    game.render();
    requestAnimationFrame(frame);
  }

  /* ---------- initial paint ---------- */
  game.reset();
  game.toMenu();
  ui.showMenu();
  ui.setHint('Tap or press Space to drop');
  setBest(game.best); // re-write so the key exists
  requestAnimationFrame(frame);

  // PWA shortcut deep link: index.html?play=1 skips the menu
  if (new URLSearchParams(window.location.search).get('play') === '1') {
    startRun();
  }

  // expose a tiny hook so tests / tools can drive the game
  window.__stackGame = { game, ui, renderer };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export {};
