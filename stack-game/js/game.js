/* ============================================================
   Stack — core game logic
   Pure simulation: no DOM, no rendering, no audio. This file
   owns the world state, the state machine and the rules. It is
   driven from main.js, which handles timing and the frame loop,
   so the whole simulation can be tested headlessly.

   Loop structure:
     Menu → Playing → Paused (resume) → Game Over → Menu
                          ↓ (visibility loss)
                       Paused (auto)
   ============================================================ */

import {
  BLOCK, DEBRIS, PARTICLE, RING, CAMERA, DIFFICULTY,
  moveSpeedForLevel
} from './config.js';
import { setBest, getBest } from './storage.js';

export const STATE = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  OVER: 'over'
};

export class Game {
  constructor(renderer) {
    this.renderer = renderer;
    this.state = STATE.MENU;
    this.best = getBest();

    // world — filled by reset()
    this.blocks = [];
    this.debris = [];
    this.particles = [];
    this.rings = [];
    this.moving = null;

    this.level = 1;
    this.combo = 0;
    this.score = 0;
    this.flash = 0;
    this.perfMsg = null;
    this.movePos = 0;
    this.moveDir = 1;
    this.moveSpeed = 0;

    this.focusY = 0;
    this.focusTarget = 0;

    // tier milestone bookkeeping (drives the Level Up celebration)
    this.lastTier = 0;
    this.tierFlash = 0;

    // callbacks wired by ui.js
    this.onScoreChange = null;
    this.onBestChange = null;
    this.onLevelUp = null;
    this.onGameOver = null;
  }

  /* ---------- lifecycle ---------- */

  reset() {
    this.blocks = [{ x: 0, z: 0, sx: BLOCK.SIZE, sz: BLOCK.SIZE, y: 0 }];
    this.debris = [];
    this.particles = [];
    this.rings = [];
    this.level = 1;
    this.combo = 0;
    this.score = 0;
    this.flash = 0;
    this.perfMsg = null;
    this.tierFlash = 0;
    this.lastTier = 0;
    this.focusY = this.level - 0.9;
    this.focusTarget = this.level - 0.9;
    this.renderer.focusY = this.focusY;
    this.renderer.shake = 0;
    this.renderer.refreshColors();
    this.spawnMoving();
    if (this.onScoreChange) this.onScoreChange(0);
  }

  start() {
    this.reset();
    this.state = STATE.PLAYING;
  }

  pause() {
    if (this.state === STATE.PLAYING) this.state = STATE.PAUSED;
  }

  resume() {
    if (this.state === STATE.PAUSED) this.state = STATE.PLAYING;
  }

  toMenu() {
    this.state = STATE.MENU;
  }

  isPlaying() {
    return this.state === STATE.PLAYING;
  }

  /* ---------- spawning ---------- */

  spawnMoving() {
    const last = this.blocks[this.blocks.length - 1];
    // alternate the approach axis so the tower builds in a spiral
    const axis = this.level % 2 === 0 ? 'x' : 'z';
    this.moveSpeed = moveSpeedForLevel(this.level);
    this.moveDir = 1;
    this.movePos = -BLOCK.RANGE;

    this.moving = {
      x: last.x, z: last.z,
      sx: last.sx, sz: last.sz,
      y: this.level,
      axis: axis,
      base: axis === 'x' ? last.x : last.z
    };
    // the sweep is relative to the block below, so the moving block
    // always tracks the tower even after it drifts off-centre
    this.placeMoving();

    this.focusTarget = this.level - 0.9;
  }

  /** Write the swept position onto the moving block from (base + offset). */
  placeMoving() {
    if (!this.moving) return;
    if (this.moving.axis === 'x') {
      this.moving.x = this.moving.base + this.movePos;
    } else {
      this.moving.z = this.moving.base + this.movePos;
    }
  }

  /* ---------- particles ---------- */

  burst(b) {
    const top = b.y + BLOCK.HEIGHT;
    for (let i = 0; i < PARTICLE.PERFECT_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = PARTICLE.PERFECT_SPEED[0] + Math.random() * PARTICLE.PERFECT_SPEED[1];
      this.particles.push({
        x: b.x + (Math.random() - 0.5) * b.sx,
        y: top + 0.08,
        z: b.z + (Math.random() - 0.5) * b.sz,
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: PARTICLE.PERFECT_LIFT[0] + Math.random() * PARTICLE.PERFECT_LIFT[1],
        life: 1
      });
    }
  }

  puff(b) {
    const top = b.y + BLOCK.HEIGHT;
    for (let i = 0; i < PARTICLE.DUST_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.25 + Math.random() * 1.2;
      this.particles.push({
        x: b.x + (Math.random() - 0.5) * b.sx,
        y: top + 0.04,
        z: b.z + (Math.random() - 0.5) * b.sz,
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: PARTICLE.DUST_LIFT[0] + Math.random() * PARTICLE.DUST_LIFT[1],
        life: 0.7
      });
    }
  }

  /* ---------- rules ---------- */

  /**
   * Drop the active block. Returns an outcome string so the
   * caller can trigger sound / haptics / UI:
   *   'perfect' | 'placed' | 'crash' | null (no block to drop)
   */
  drop() {
    if (this.state !== STATE.PLAYING || !this.moving) return null;

    const last = this.blocks[this.blocks.length - 1];
    const axis = this.moving.axis;
    const mc = axis === 'x' ? this.moving.x : this.moving.z;
    const ms = axis === 'x' ? this.moving.sx : this.moving.sz;
    const pc = axis === 'x' ? last.x : last.z;
    const ps = axis === 'x' ? last.sx : last.sz;

    // how much of the moving block actually rests on the stack
    const lo = Math.max(pc - ps / 2, mc - ms / 2);
    const hi = Math.min(pc + ps / 2, mc + ms / 2);
    const overlap = hi - lo;

    if (overlap <= 0.001) {
      this.crash();
      return 'crash';
    }

    const perfect = Math.abs(mc - pc) < BLOCK.PERFECT;
    const placed = {
      x: this.moving.x, z: this.moving.z,
      sx: this.moving.sx, sz: this.moving.sz,
      y: this.moving.y
    };

    if (perfect) {
      // snap exactly onto the block below and keep full size
      if (axis === 'x') placed.x = pc; else placed.z = pc;
      this.combo += 1;
      this.flash = 1;
      this.perfMsg = {
        t: 1,
        text: this.combo > 1 ? 'PERFECT \u00d7' + this.combo : 'PERFECT'
      };
      this.burst(placed);
      this.puff(placed);
      this.rings.push({
        x: placed.x, z: placed.z,
        y: placed.y + BLOCK.HEIGHT,
        r: 0.32, life: 1
      });
    } else {
      // shear off the overhang — the piece falls away as debris
      const cutSize = ms - overlap;
      const cutCenter = mc > pc
        ? (hi + (mc + ms / 2)) / 2
        : ((mc - ms / 2) + lo) / 2;

      const piece = {
        x: placed.x, z: placed.z,
        sx: placed.sx, sz: placed.sz,
        y: placed.y, vy: 0, life: 1
      };
      if (axis === 'x') { piece.x = cutCenter; piece.sx = cutSize; }
      else { piece.z = cutCenter; piece.sz = cutSize; }
      piece.vy = DEBRIS.LIFT_MIN + Math.random() * (DEBRIS.LIFT_MAX - DEBRIS.LIFT_MIN);
      this.debris.push(piece);

      if (axis === 'x') { placed.x = (lo + hi) / 2; placed.sx = overlap; }
      else { placed.z = (lo + hi) / 2; placed.sz = overlap; }

      this.combo = 0;
      this.puff(placed);
    }

    this.blocks.push(placed);
    this.level += 1;
    this.score = this.level - 1;
    this.moving = null;
    this.spawnMoving();
    this.checkTier();

    if (this.onScoreChange) this.onScoreChange(this.score);

    return perfect ? 'perfect' : 'placed';
  }

  crash() {
    const m = this.moving;
    if (m) {
      this.debris.push({
        x: m.x, z: m.z, sx: m.sx, sz: m.sz,
        y: m.y, vy: DEBRIS.LIFT_MIN + 0.2, life: 1
      });
    }
    this.moving = null;
    this.state = STATE.OVER;
    this.renderer.triggerShake();

    if (this.score > this.best) {
      this.best = this.score;
      setBest(this.best);
      if (this.onBestChange) this.onBestChange(this.best);
    }

    if (this.onGameOver) this.onGameOver(this.score, this.best);
  }

  /** Fire a celebration every DIFFICULTY.tierEvery levels. */
  checkTier() {
    const tier = Math.floor(this.score / DIFFICULTY.tierEvery);
    if (tier > this.lastTier) {
      this.lastTier = tier;
      this.tierFlash = 1;
      if (this.onLevelUp) this.onLevelUp(tier * DIFFICULTY.tierEvery);
    }
  }

  /* ---------- simulation ---------- */

  /**
   * Advance the world by dt milliseconds. Safe to call from a
   * fixed-timestep loop, so physics stays deterministic.
   */
  update(dtMs) {
    const s = dtMs / 1000;

    if (this.state === STATE.PLAYING && this.moving) {
      this.movePos += this.moveDir * this.moveSpeed * s;
      if (this.movePos > BLOCK.RANGE) { this.movePos = BLOCK.RANGE; this.moveDir = -1; }
      if (this.movePos < -BLOCK.RANGE) { this.movePos = -BLOCK.RANGE; this.moveDir = 1; }
      this.placeMoving();
    }

    // camera follow (frame-rate independent smoothing)
    this.focusY += (this.focusTarget - this.focusY) * Math.min(1, dtMs / 140);
    this.renderer.focusY = this.focusY;

    if (this.flash > 0) this.flash = Math.max(0, this.flash - s * 2.4);
    if (this.tierFlash > 0) this.tierFlash = Math.max(0, this.tierFlash - s * 1.2);
    this.renderer.tickShake(dtMs);

    if (this.perfMsg) {
      this.perfMsg.t -= s * 1.6;
      if (this.perfMsg.t <= 0) this.perfMsg = null;
    }

    // debris physics
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vy -= DEBRIS.GRAVITY * s;
      d.y += d.vy * s;
      d.life -= s * DEBRIS.FADE;
      if (d.y < this.focusY - 12 || d.life <= 0) this.debris.splice(i, 1);
    }

    // particle physics
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy -= PARTICLE.GRAVITY * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.z += p.vz * s;
      p.life -= s * PARTICLE.FADE;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    if (this.particles.length > PARTICLE.MAX) {
      this.particles.splice(0, this.particles.length - PARTICLE.MAX);
    }

    // shockwave rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r += s * RING.GROWTH;
      r.life -= s * RING.FADE;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
  }

  /* ---------- render bridge ---------- */

  snapshot() {
    return {
      blocks: this.blocks,
      debris: this.debris,
      particles: this.particles,
      rings: this.rings,
      moving: this.moving,
      flash: this.flash,
      perfMsg: this.perfMsg
    };
  }

  render() {
    this.renderer.render(this.snapshot());
  }
}
