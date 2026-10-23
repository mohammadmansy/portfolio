/* ============================================================
   Stack — isometric software renderer
   A tiny 3D renderer written from scratch: orthographic (2:1)
   projection, flat shaded faces and a glowing top edge. No engine,
   no libraries, no WebGL — so it runs identically inside a browser
   tab or a Capacitor shell.

   Performance notes (this is the hot path on phones):
     • per-level colours are computed once and cached, not every frame
     • no object allocation in the render loop — scratch arrays reused
     • painter's order comes from array order, so nothing is sorted
     • the floor is one batched path, not 22 strokes
     • shadowBlur (the most expensive canvas op) runs only for the
       top few blocks and the moving block, in a single save/restore
     • particles are drawn from a pre-rendered sprite, not with blur
   ============================================================ */

import { VIEW, CAMERA, BLOCK, GLOW_TOP_BLOCKS } from './config.js';

/* ---------- colour utilities ---------- */

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function parseColor(str) {
  str = (str || '').trim();
  if (str[0] === '#') {
    let h = str.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((s) => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2] };
  }
  return { r: 88, g: 166, b: 255 };
}

function shade(c, f, a) {
  const r = clamp(Math.round(c.r * f), 0, 255);
  const g = clamp(Math.round(c.g * f), 0, 255);
  const b = clamp(Math.round(c.b * f), 0, 255);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + (a === undefined ? 1 : a) + ')';
}

function rgbToHsl(c) {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s: s, l: l };
}

function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (!s) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue(p, q, h + 1 / 3) * 255),
    g: Math.round(hue(p, q, h) * 255),
    b: Math.round(hue(p, q, h - 2 / 3) * 255)
  };
}

/* ============================================================
   Renderer
   ============================================================ */

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.W = canvas.width;
    this.H = canvas.height;
    this.CX = this.W * CAMERA.CX_MULT;
    this.CY = this.H * CAMERA.CY_MULT;
    this.K = CAMERA.K;
    this.focusY = 0;
    this.shake = 0;
    this.colors = { accent: { r: 88, g: 166, b: 255 }, bg: '#191E27' };

    // scratch storage — reused every frame so the loop never allocates
    this._pts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    this._palette = new Map();   // level → cached face colours
    this._bgGradient = null;
    this._particleSprite = null;

    this.refreshColors();
  }

  /**
   * Re-read theme colours from CSS variables. Called on start and
   * whenever the light/dark theme changes, so the game tracks the
   * site (or its own) theme.
   */
  refreshColors() {
    const cs = getComputedStyle(document.documentElement);
    this.colors.accent = parseColor(cs.getPropertyValue('--accent') || '#58A6FF');
    this.colors.bg = cs.getPropertyValue('--surface-2').trim() || '#191E27';
    this._palette.clear();
    this._bgGradient = null;
    this._particleSprite = null;
  }

  /**
   * Face + edge colours for one tower level. Blocks only ever move
   * by being placed, and their colour depends solely on height, so
   * this is computed once per level and reused for every frame —
   * it used to be a full HSL round-trip per block per frame.
   */
  blockPalette(level) {
    let p = this._palette.get(level);
    if (p) return p;
    const c = this.rotateColor(this.colors.accent, Math.sin(level * 0.45) * 36);
    const bright = 0.72 + 0.34 * Math.sin(level * 0.5 + 0.4);
    p = {
      c: c,
      left: shade(c, clamp(bright * 0.58, 0.22, 0.85), 1),
      right: shade(c, clamp(bright * 0.86, 0.34, 1.05), 1),
      top: shade(c, clamp(bright, 0.45, 1.2), 1),
      edge: shade(c, 1.55, 0.9),
      glow: shade(c, 1.4, 0.85)
    };
    this._palette.set(level, p);
    return p;
  }

  /** Project a world (x, y, z) point to screen space. */
  project(x, y, z) {
    return {
      x: this.CX + (x - z) * this.K,
      y: this.CY + (this.focusY - y) * this.K + (x + z) * 0.5 * this.K
    };
  }

  /** In-place projection into a reusable point. */
  projectInto(x, y, z, out) {
    out.x = this.CX + (x - z) * this.K;
    out.y = this.CY + (this.focusY - y) * this.K + (x + z) * 0.5 * this.K;
    return out;
  }

  /* ---------- polygon helpers ---------- */

  /**
   * Fill one face of a block from the shared 4-point scratch array.
   * Pass the full set of bounds; `face` picks which corners to use.
   */
  fillQuadScratch(x0, x1, y0, y1, z0, z1, style, face) {
    const P = this._pts;
    if (face === 'top') {
      this.projectInto(x0, y1, z0, P[0]);
      this.projectInto(x1, y1, z0, P[1]);
      this.projectInto(x1, y1, z1, P[2]);
      this.projectInto(x0, y1, z1, P[3]);
    } else if (face === 'left') {
      this.projectInto(x0, y1, z1, P[0]);
      this.projectInto(x1, y1, z1, P[1]);
      this.projectInto(x1, y0, z1, P[2]);
      this.projectInto(x0, y0, z1, P[3]);
    } else { // right
      this.projectInto(x1, y1, z0, P[0]);
      this.projectInto(x1, y1, z1, P[1]);
      this.projectInto(x1, y0, z1, P[2]);
      this.projectInto(x1, y0, z0, P[3]);
    }
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    ctx.lineTo(P[1].x, P[1].y);
    ctx.lineTo(P[2].x, P[2].y);
    ctx.lineTo(P[3].x, P[3].y);
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  }

  /** Stroke the top face outline (recomputing its 4 corners). */
  strokeTop(b, style, width) {
    const x0 = b.x - b.sx / 2, x1 = b.x + b.sx / 2;
    const z0 = b.z - b.sz / 2, z1 = b.z + b.sz / 2;
    const y1 = b.y + BLOCK.HEIGHT;
    const P = this._pts;
    this.projectInto(x0, y1, z0, P[0]);
    this.projectInto(x1, y1, z0, P[1]);
    this.projectInto(x1, y1, z1, P[2]);
    this.projectInto(x0, y1, z1, P[3]);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    ctx.lineTo(P[1].x, P[1].y);
    ctx.lineTo(P[2].x, P[2].y);
    ctx.lineTo(P[3].x, P[3].y);
    ctx.closePath();
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /** True when the block is on screen (cheap culling). */
  visible(b) {
    const y = this.CY + (this.focusY - b.y) * this.K + (b.x + b.z) * 0.5 * this.K;
    return !(y - this.K * 1.6 > this.H || y < -this.K * 6);
  }

  /* ---------- world drawing ---------- */

  drawFloor() {
    const ctx = this.ctx;
    const R = 5;
    // one batched path instead of 22 individual strokes
    ctx.strokeStyle = shade(this.colors.accent, 0.75, 0.09);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -R; i <= R; i++) {
      let a = this.project(i, 0, -R);
      let b = this.project(i, 0, R);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      a = this.project(-R, 0, i);
      b = this.project(R, 0, i);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  /**
   * The three visible faces of a block. No shadow state is touched
   * here — the glow is drawn in a separate pass.
   *
   * @param {object} b     block { x, z, sx, sz, y }
   * @param {number} alpha overall opacity (debris fade)
   * @param {object} pal   cached palette for this level
   */
  drawBoxFaces(b, alpha, pal) {
    const ctx = this.ctx;
    const x0 = b.x - b.sx / 2, x1 = b.x + b.sx / 2;
    const z0 = b.z - b.sz / 2, z1 = b.z + b.sz / 2;
    const y0 = b.y, y1 = b.y + BLOCK.HEIGHT;

    const restore = alpha !== 1;
    if (restore) {
      ctx.save();
      ctx.globalAlpha = alpha;
    }

    // front-left (+z), front-right (+x), top (+y)
    this.fillQuadScratch(x0, x1, y0, y1, z0, z1, pal.left, 'left');
    this.fillQuadScratch(x0, x1, y0, y1, z0, z1, pal.right, 'right');
    this.fillQuadScratch(x0, x1, y0, y1, z0, z1, pal.top, 'top');

    if (restore) ctx.restore();
  }

  rotateColor(c, deg) {
    const hsl = rgbToHsl(c);
    return hslToRgb(hsl.h + deg, hsl.s, hsl.l);
  }

  /** Soft glowing dot, pre-rendered once and blitted per particle. */
  particleSprite() {
    if (this._particleSprite) return this._particleSprite;
    const size = 16;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const col = this.colors.accent;
    const rgb = col.r + ',' + col.g + ',' + col.b;
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(' + rgb + ',1)');
    grd.addColorStop(0.35, 'rgba(' + rgb + ',0.75)');
    grd.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    this._particleSprite = c;
    return c;
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    if (!particles.length) return;
    const sprite = this.particleSprite();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const a = p.life;
      if (a <= 0) continue;
      const s = this.project(p.x, p.y, p.z);
      const sz = 4 + 8 * a;
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, s.x - sz / 2, s.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  drawRings(rings) {
    const ctx = this.ctx;
    if (!rings.length) return;
    const accent = this.colors.accent;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.shadowColor = shade(accent, 1.4, 0.8);
    ctx.shadowBlur = 10;
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      const a = clamp(ring.life, 0, 1);
      const N = 28;
      ctx.beginPath();
      for (let j = 0; j <= N; j++) {
        const ang = (j / N) * Math.PI * 2;
        const s = this.project(
          ring.x + Math.cos(ang) * ring.r,
          ring.y,
          ring.z + Math.sin(ang) * ring.r
        );
        if (j) ctx.lineTo(s.x, s.y);
        else ctx.moveTo(s.x, s.y);
      }
      ctx.strokeStyle = shade(accent, 1.5, a * 0.8);
      ctx.lineWidth = 1.5 + a * 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  backgroundGradient() {
    if (this._bgGradient) return this._bgGradient;
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(
      this.CX, this.CY - 30, 8, this.CX, this.CY - 10, this.W * 0.62
    );
    g.addColorStop(0, shade(this.colors.accent, 1, 0.17));
    g.addColorStop(1, shade(this.colors.accent, 1, 0));
    this._bgGradient = g;
    return g;
  }

  /**
   * Full frame. Everything is drawn inside a translate() so a
   * screen shake moves the whole scene uniformly.
   *
   * @param {object} state world snapshot from game.js
   */
  render(state) {
    const ctx = this.ctx;
    const blocks = state.blocks;
    const debris = state.debris;
    const moving = state.moving;

    ctx.save();
    if (this.shake > 0) {
      const amp = this.shake * this.shake * 13;
      ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
    }

    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(-40, -40, this.W + 80, this.H + 80);
    ctx.fillStyle = this.backgroundGradient();
    ctx.fillRect(-40, -40, this.W + 80, this.H + 80);

    this.drawFloor();

    // ---- faces -------------------------------------------------
    // Blocks are pushed in increasing height order, and this
    // projection makes higher blocks draw later, so a plain forward
    // pass is already correct painter's order — no sort needed.
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!this.visible(b)) continue;
      this.drawBoxFaces(b, 1, this.blockPalette(b.y));
    }
    for (let i = 0; i < debris.length; i++) {
      const d = debris[i];
      const a = clamp(d.life, 0, 1);
      if (a <= 0 || !this.visible(d)) continue;
      this.drawBoxFaces(d, a, this.blockPalette(d.y));
    }
    if (moving) this.drawBoxFaces(moving, 1, this.blockPalette(moving.y));

    // ---- top edges ---------------------------------------------
    // shadowBlur is by far the most expensive thing here, so it runs
    // once for a handful of blocks in a single save/restore. The
    // rest get a cheap crisp rim that reads the same at this scale.
    const glowFrom = Math.max(0, blocks.length - GLOW_TOP_BLOCKS);
    ctx.save();
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!this.visible(b)) continue;
      const pal = this.blockPalette(b.y);
      if (i >= glowFrom) {
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 11;
        ctx.strokeStyle = pal.edge;
        ctx.lineWidth = 1.5;
      } else {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = pal.edge;
        ctx.lineWidth = 1;
      }
      this.strokeTop(b, ctx.strokeStyle, ctx.lineWidth);
    }
    if (moving) {
      const pal = this.blockPalette(moving.y);
      ctx.shadowColor = pal.glow;
      ctx.shadowBlur = 13;
      this.strokeTop(moving, pal.edge, 1.75);
    }
    ctx.restore();

    this.drawRings(state.rings);
    this.drawParticles(state.particles);

    // white flash on a perfect landing
    if (state.flash > 0 && blocks.length) {
      const b = blocks[blocks.length - 1];
      ctx.save();
      ctx.globalAlpha = clamp(state.flash, 0, 1) * 0.85;
      ctx.shadowColor = shade(this.colors.accent, 1.6, 1);
      ctx.shadowBlur = 26;
      ctx.strokeStyle = 'rgba(255,255,255,' + 0.85 * clamp(state.flash, 0, 1) + ')';
      ctx.lineWidth = 2.5;
      this.strokeTop(b, ctx.strokeStyle, 2.5);
      ctx.restore();
    }

    // floating "PERFECT x n" text
    const perfMsg = state.perfMsg;
    if (perfMsg && blocks.length) {
      const b = blocks[blocks.length - 1];
      const p = this.project(b.x, b.y + 1.1, b.z);
      ctx.save();
      ctx.globalAlpha = clamp(perfMsg.t, 0, 1);
      ctx.fillStyle = shade(this.colors.accent, 1.75, 1);
      ctx.font = '700 17px Inter, system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = shade(this.colors.accent, 1.4, 0.9);
      ctx.shadowBlur = 12;
      ctx.fillText(perfMsg.text, p.x, p.y - (1 - perfMsg.t) * 30);
      ctx.restore();
    }

    ctx.restore();
  }

  /** Decay the screen shake once per frame. */
  tickShake(dtMs) {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - (dtMs / 1000) * 3.4);
    }
  }

  triggerShake() {
    this.shake = 1;
  }
}
