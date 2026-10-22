/* ============================================================
   Stack — isometric software renderer
   A tiny 3D renderer written from scratch: orthographic (2:1)
   projection, painter's depth sorting, flat shaded faces and a
   glowing top edge. No engine, no libraries, no WebGL — so it
   runs identically inside a browser tab or a Capacitor shell.

   Painter's algorithm: we sort convex faces by (x + z + y),
   which is stable for an axis-aligned tower where blocks never
   overlap in depth at equal coordinates.
   ============================================================ */

import { VIEW, CAMERA, BLOCK, RING, PARTICLE } from './config.js';

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
    b: Math.round(hue(p, q, h - 1 / 3) * 255)
  };
}

/* ============================================================
   Renderer
   ============================================================ */

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.CX = this.W * CAMERA.CX_MULT;
    this.CY = this.H * CAMERA.CY_MULT;
    this.K = CAMERA.K;
    this.focusY = 0;
    this.shake = 0;
    this.colors = { accent: { r: 88, g: 166, b: 255 }, bg: '#191E27' };
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
  }

  /** Project a world (x, y, z) point to screen space. */
  project(x, y, z) {
    return {
      x: this.CX + (x - z) * this.K,
      y: this.CY + (this.focusY - y) * this.K + (x + z) * 0.5 * this.K
    };
  }

  /* ---------- polygon helpers ---------- */

  trace(pts) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i].x, pts[i].y);
      else ctx.moveTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  }

  fillQuad(pts, color) {
    this.trace(pts);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  topQuad(b) {
    const x0 = b.x - b.sx / 2, x1 = b.x + b.sx / 2;
    const z0 = b.z - b.sz / 2, z1 = b.z + b.sz / 2;
    const y1 = b.y + BLOCK.HEIGHT;
    return [
      this.project(x0, y1, z0),
      this.project(x1, y1, z0),
      this.project(x1, y1, z1),
      this.project(x0, y1, z1)
    ];
  }

  /* ---------- world drawing ---------- */

  drawFloor() {
    const ctx = this.ctx;
    const R = 5;
    ctx.strokeStyle = shade(this.colors.accent, 0.75, 0.09);
    ctx.lineWidth = 1;
    for (let i = -R; i <= R; i++) {
      let a = this.project(i, 0, -R);
      let b = this.project(i, 0, R);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      a = this.project(-R, 0, i);
      b = this.project(R, 0, i);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  /**
   * Draw a single block. Three visible faces shaded by their
   * orientation, plus a glowing edge along the top face — the
   * signature look of the tower.
   *
   * @param {object} b     block { x, z, sx, sz, y }
   * @param {number} alpha overall opacity
   */
  drawBox(b, alpha) {
    const ctx = this.ctx;
    const x0 = b.x - b.sx / 2, x1 = b.x + b.sx / 2;
    const z0 = b.z - b.sz / 2, z1 = b.z + b.sz / 2;
    const y0 = b.y, y1 = b.y + BLOCK.HEIGHT;

    // gentle per-level colour drift so the tower reads as a gradient
    const c = this.rotateColor(this.colors.accent, Math.sin(b.y * 0.45) * 36);
    const bright = 0.72 + 0.34 * Math.sin(b.y * 0.5 + 0.4);

    // front-left face (+z)
    this.fillQuad(
      [this.project(x0, y1, z1), this.project(x1, y1, z1),
       this.project(x1, y0, z1), this.project(x0, y0, z1)],
      shade(c, clamp(bright * 0.58, 0.22, 0.85), alpha)
    );
    // front-right face (+x)
    this.fillQuad(
      [this.project(x1, y1, z0), this.project(x1, y1, z1),
       this.project(x1, y0, z1), this.project(x1, y0, z0)],
      shade(c, clamp(bright * 0.86, 0.34, 1.05), alpha)
    );
    // top face (+y)
    this.fillQuad(
      [this.project(x0, y1, z0), this.project(x1, y1, z0),
       this.project(x1, y1, z1), this.project(x0, y1, z1)],
      shade(c, clamp(bright, 0.45, 1.2), alpha)
    );

    // glowing top edge
    ctx.save();
    ctx.shadowColor = shade(c, 1.4, 0.85 * alpha);
    ctx.shadowBlur = 11;
    ctx.strokeStyle = shade(c, 1.55, 0.9 * alpha);
    ctx.lineWidth = 1.5;
    this.trace(this.topQuad(b));
    ctx.stroke();
    ctx.restore();
  }

  rotateColor(c, deg) {
    const hsl = rgbToHsl(c);
    return hslToRgb(hsl.h + deg, hsl.s, hsl.l);
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const s = this.project(p.x, p.y, p.z);
      const a = Math.max(0, p.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = shade(this.colors.accent, 1.7, 1);
      ctx.shadowColor = shade(this.colors.accent, 1.4, 0.9);
      ctx.shadowBlur = 9;
      const sz = 2.5 + 4 * a;
      ctx.fillRect(s.x - sz / 2, s.y - sz / 2, sz, sz);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  drawRings(rings) {
    const ctx = this.ctx;
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      const a = clamp(ring.life, 0, 1);
      const N = 40;
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
      ctx.strokeStyle = shade(this.colors.accent, 1.5, a * 0.8);
      ctx.lineWidth = 1.5 + a * 1.5;
      ctx.shadowColor = shade(this.colors.accent, 1.4, a * 0.8);
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  /**
   * Full frame. Everything is drawn inside a translate() so a
   * screen shake moves the whole scene uniformly.
   *
   * @param {object} state world snapshot from game.js
   */
  render(state) {
    const ctx = this.ctx;
    const { blocks, debris, particles, rings, moving, flash, perfMsg } = state;

    ctx.save();
    if (this.shake > 0) {
      const amp = this.shake * this.shake * 13;
      ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
    }

    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(-40, -40, this.W + 80, this.H + 80);

    // soft ambient glow behind the tower
    const g = ctx.createRadialGradient(
      this.CX, this.CY - 30, 8, this.CX, this.CY - 10, this.W * 0.62
    );
    g.addColorStop(0, shade(this.colors.accent, 1, 0.17));
    g.addColorStop(1, shade(this.colors.accent, 1, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, this.W + 80, this.H + 80);

    this.drawFloor();

    // collect everything that should be drawn, then depth-sort
    const items = [];
    for (const b of blocks) {
      const sc = this.project(b.x, b.y, b.z);
      if (sc.y - this.K * 1.6 > this.H || sc.y < -this.K * 6) continue;
      items.push({ b: b, a: 1 });
    }
    for (const d of debris) {
      const sc = this.project(d.x, d.y, d.z);
      if (sc.y - this.K * 1.6 > this.H || sc.y < -this.K * 8) continue;
      items.push({ b: d, a: clamp(d.life, 0, 1) });
    }
    items.sort((A, B) => depthOf(A.b) - depthOf(B.b));
    for (const it of items) this.drawBox(it.b, it.a);

    if (moving) this.drawBox(moving, 1);

    this.drawRings(rings);
    this.drawParticles(particles);

    // white flash on a perfect landing
    if (flash > 0 && blocks.length) {
      const b = blocks[blocks.length - 1];
      ctx.save();
      ctx.globalAlpha = clamp(flash, 0, 1) * 0.85;
      ctx.shadowColor = shade(this.colors.accent, 1.6, 1);
      ctx.shadowBlur = 26;
      ctx.strokeStyle = 'rgba(255,255,255,' + 0.85 * clamp(flash, 0, 1) + ')';
      ctx.lineWidth = 2.5;
      this.trace(this.topQuad(b));
      ctx.stroke();
      ctx.restore();
    }

    // floating "PERFECT x n" text
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

function depthOf(b) {
  return b.x + b.z + b.y;
}
