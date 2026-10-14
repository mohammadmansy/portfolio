(() => {
  'use strict';

  /* ---------- Navbar: solid background on scroll ---------- */
  const navbar = document.getElementById('navbar');
  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 24);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Dark / light theme toggle ---------- */
  const themeToggle = document.getElementById('themeToggle');
  const rootEl = document.documentElement;

  const applyTheme = (theme) => {
    rootEl.setAttribute('data-theme', theme);
    const light = theme === 'light';
    themeToggle.setAttribute('aria-pressed', light);
    themeToggle.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    try { localStorage.setItem('theme', theme); } catch (e) {}
  };

  let savedTheme = null;
  try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
  if (!savedTheme) {
    savedTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  applyTheme(savedTheme);

  themeToggle.addEventListener('click', () => {
    applyTheme(rootEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  /* ---------- Mobile nav toggle ---------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', open);
  });

  navLinks.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- Active nav link on scroll ---------- */
  const sections = document.querySelectorAll('section[id]');
  const linkEls = document.querySelectorAll('.nav-link');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        linkEls.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { rootMargin: '-35% 0px -60% 0px', threshold: 0 });

  sections.forEach(section => sectionObserver.observe(section));

  /* ---------- Subtle reveal ---------- */
  const revealEls = document.querySelectorAll(
    '.project, .skill-group, .timeline-item, .contact-form, .contact-channel'
  );
  revealEls.forEach(el => el.classList.add('reveal'));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -48px 0px' });

  revealEls.forEach(el => revealObserver.observe(el));

  /* ---------- Contact form (Formspree) ---------- */
  const contactForm = document.getElementById('contactForm');
  const formStatus = document.getElementById('formStatus');

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const message = document.getElementById('message').value.trim();

    if (!name || !email || !message) {
      formStatus.textContent = 'Please fill in all fields.';
      formStatus.className = 'form-status error';
      return;
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      formStatus.textContent = 'Please enter a valid email address.';
      formStatus.className = 'form-status error';
      return;
    }

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending\u2026';

    try {
      const res = await fetch(contactForm.action, {
        method: 'POST',
        body: new FormData(contactForm),
        headers: { Accept: 'application/json' }
      });

      if (res.ok) {
        formStatus.textContent = 'Message sent — I\'ll get back to you soon.';
        formStatus.className = 'form-status success';
        contactForm.reset();
      } else {
        const data = await res.json();
        const firstError = data.errors && data.errors[0] ? data.errors[0].message : null;
        formStatus.textContent = firstError || 'Something went wrong — please try again.';
        formStatus.className = 'form-status error';
      }
    } catch (err) {
      formStatus.textContent = 'Network error — please check your connection and try again.';
      formStatus.className = 'form-status error';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });

  /* ---------- Smooth scroll fallback ---------- */
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
    });
  });
})();

/* ---------- Stack: hand-coded 3D tower game ----------
   A tiny software 3D renderer (isometric projection, painter's
   depth sorting, flat shading, glowing edges) plus simple physics.
   No engine, no libraries.                                          */
(() => {
  const canvas = document.getElementById('stackCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('stackOverlay');
  const startBtn = document.getElementById('stackStart');
  const scoreEl = document.getElementById('stackScore');
  const bestEl = document.getElementById('stackBest');

  const W = canvas.width;
  const H = canvas.height;
  const CX = W / 2;
  const CY = H * 0.60;
  const K = 84;
  const RANGE = 1.12;
  const HEIGHT = 1;
  const PERFECT = 0.1;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  const parseColor = (str) => {
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
    return { r: 56, g: 189, b: 248 };
  };

  const shade = (c, f, a) => {
    const r = clamp(Math.round(c.r * f), 0, 255);
    const g = clamp(Math.round(c.g * f), 0, 255);
    const b = clamp(Math.round(c.b * f), 0, 255);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (a === undefined ? 1 : a) + ')';
  };

  let COL;
  const refreshColors = () => {
    const cs = getComputedStyle(document.documentElement);
    COL = {
      accent: parseColor(cs.getPropertyValue('--accent')),
      strong: parseColor(cs.getPropertyValue('--accent-strong')),
      bg: cs.getPropertyValue('--surface-2').trim() || '#171B22'
    };
  };
  refreshColors();

  /* --- world state --- */
  let blocks, debris, particles;
  let moving, level, movePos, moveDir, moveSpeed;
  let focusY, focusTarget, combo, flash, perfMsg, score;
  let running = false, frozen = false, over = false, dead = false;
  let lastTs = 0;

  let best = 0;
  try { best = Number(localStorage.getItem('stack-best')) || 0; } catch (e) {}
  bestEl.textContent = best;

  /* --- isometric projection --- */
  const project = (x, y, z) => ({
    x: CX + (x - z) * K,
    y: CY + (focusY - y) * K + (x + z) * 0.5 * K
  });

  const depth = (b) => b.x + b.z + b.y;

  const topQuad = (b) => {
    const x0 = b.x - b.sx / 2, x1 = b.x + b.sx / 2;
    const z0 = b.z - b.sz / 2, z1 = b.z + b.sz / 2;
    const y1 = b.y + HEIGHT;
    return [
      project(x0, y1, z0),
      project(x1, y1, z0),
      project(x1, y1, z1),
      project(x0, y1, z1)
    ];
  };

  const trace = (pts) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i].x, pts[i].y);
      else ctx.moveTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  };

  const fillQuad = (pts, color) => {
    trace(pts);
    ctx.fillStyle = color;
    ctx.fill();
  };

  /* --- spawn --- */
  const spawnMoving = () => {
    const last = blocks[blocks.length - 1];
    const axis = level % 2 === 0 ? 'x' : 'z';
    moveSpeed = 1.35 + Math.min(1.15, level * 0.05);
    moveDir = 1;
    movePos = -RANGE;
    moving = {
      x: last.x, z: last.z, sx: last.sx, sz: last.sz,
      y: level, axis: axis, base: axis === 'x' ? last.x : last.z
    };
    if (axis === 'x') moving.x = movePos; else moving.z = movePos;
    focusTarget = level - 0.9;
  };

  /* --- perfect burst --- */
  const burst = (b) => {
    const top = b.y + HEIGHT;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.7 + Math.random() * 1.7;
      particles.push({
        x: b.x + (Math.random() - 0.5) * b.sx,
        y: top + 0.08,
        z: b.z + (Math.random() - 0.5) * b.sz,
        vx: Math.cos(a) * sp,
        vz: Math.sin(a) * sp,
        vy: 1.6 + Math.random() * 2.4,
        life: 1,
        max: 1
      });
    }
  };

  /* --- drop the active block --- */
  const drop = () => {
    if (!running || !moving || over) return;
    const last = blocks[blocks.length - 1];
    const axis = moving.axis;
    const mc = axis === 'x' ? moving.x : moving.z;
    const ms = axis === 'x' ? moving.sx : moving.sz;
    const pc = axis === 'x' ? last.x : last.z;
    const ps = axis === 'x' ? last.sx : last.sz;

    const lo = Math.max(pc - ps / 2, mc - ms / 2);
    const hi = Math.min(pc + ps / 2, mc + ms / 2);
    const ov = hi - lo;

    if (ov <= 0.001) { crash(); return; }

    const perfect = Math.abs(mc - pc) < PERFECT;
    const placed = { x: moving.x, z: moving.z, sx: moving.sx, sz: moving.sz, y: moving.y };

    if (perfect) {
      if (axis === 'x') placed.x = pc; else placed.z = pc;
      combo += 1;
      flash = 1;
      perfMsg = { t: 1, text: combo > 1 ? 'PERFECT \u00d7' + combo : 'PERFECT' };
      burst(placed);
    } else {
      const cutSize = ms - ov;
      const cutCenter = mc > pc
        ? (hi + (mc + ms / 2)) / 2
        : ((mc - ms / 2) + lo) / 2;
      const piece = {
        x: placed.x, z: placed.z, sx: placed.sx, sz: placed.sz,
        y: placed.y, vy: 0, life: 1
      };
      if (axis === 'x') { piece.x = cutCenter; piece.sx = cutSize; }
      else { piece.z = cutCenter; piece.sz = cutSize; }
      piece.vy = 0.4 + Math.random() * 0.4;
      debris.push(piece);

      if (axis === 'x') { placed.x = (lo + hi) / 2; placed.sx = ov; }
      else { placed.z = (lo + hi) / 2; placed.sz = ov; }
      combo = 0;
    }

    blocks.push(placed);
    level += 1;
    score = level - 1;
    scoreEl.textContent = score;
    moving = null;
    spawnMoving();
  };

  const crash = () => {
    const m = moving;
    debris.push({ x: m.x, z: m.z, sx: m.sx, sz: m.sz, y: m.y, vy: 0.6, life: 1 });
    moving = null;
    over = true;
    dead = true;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      try { localStorage.setItem('stack-best', best); } catch (e) {}
    }
    window.setTimeout(() => {
      if (dead) {
        running = false;
        showOverlay('Tower collapsed', 'You stacked ' + score + ' high', 'Build again');
      }
    }, 720);
  };

  /* --- simulation --- */
  const update = (dt) => {
    const s = dt / 1000;
    if (running && moving && !over) {
      movePos += moveDir * moveSpeed * s;
      if (movePos > RANGE) { movePos = RANGE; moveDir = -1; }
      if (movePos < -RANGE) { movePos = -RANGE; moveDir = 1; }
      if (moving.axis === 'x') moving.x = movePos; else moving.z = movePos;
    }

    focusY += (focusTarget - focusY) * Math.min(1, dt / 140);
    if (flash > 0) flash = Math.max(0, flash - s * 2.4);
    if (perfMsg) { perfMsg.t -= s * 1.6; if (perfMsg.t <= 0) perfMsg = null; }

    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.vy -= 20 * s;
      d.y += d.vy * s;
      d.life -= s * 0.42;
      if (d.y < focusY - 12 || d.life <= 0) debris.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy -= 8 * s;
      p.x += p.vx * s; p.y += p.vy * s; p.z += p.vz * s;
      p.life -= s * 1.1;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (particles.length > 120) particles.splice(0, particles.length - 120);
  };

  /* --- drawing --- */
  const drawFloor = () => {
    const R = 5;
    ctx.strokeStyle = shade(COL.accent, 0.75, 0.09);
    ctx.lineWidth = 1;
    for (let i = -R; i <= R; i++) {
      let a = project(i, 0, -R), b = project(i, 0, R);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      a = project(-R, 0, i); b = project(R, 0, i);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  };

  const drawBox = (b, alpha) => {
    const x0 = b.x - b.sx / 2, x1 = b.x + b.sx / 2;
    const z0 = b.z - b.sz / 2, z1 = b.z + b.sz / 2;
    const y0 = b.y, y1 = b.y + HEIGHT;

    const bright = 0.72 + 0.34 * Math.sin(b.y * 0.5 + 0.4);
    const c = COL.accent;

    fillQuad([
      project(x0, y1, z1), project(x1, y1, z1), project(x1, y0, z1), project(x0, y0, z1)
    ], shade(c, clamp(bright * 0.58, 0.22, 0.85), alpha));

    fillQuad([
      project(x1, y1, z0), project(x1, y1, z1), project(x1, y0, z1), project(x1, y0, z0)
    ], shade(c, clamp(bright * 0.86, 0.34, 1.05), alpha));

    fillQuad([
      project(x0, y1, z0), project(x1, y1, z0), project(x1, y1, z1), project(x0, y1, z1)
    ], shade(c, clamp(bright, 0.45, 1.2), alpha));

    ctx.save();
    ctx.shadowColor = shade(c, 1.4, 0.85 * alpha);
    ctx.shadowBlur = 11;
    ctx.strokeStyle = shade(c, 1.55, 0.9 * alpha);
    ctx.lineWidth = 1.5;
    trace(topQuad(b));
    ctx.stroke();
    ctx.restore();
  };

  const drawParticles = () => {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const s = project(p.x, p.y, p.z);
      const a = Math.max(0, p.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = shade(COL.accent, 1.7, 1);
      ctx.shadowColor = shade(COL.accent, 1.4, 0.9);
      ctx.shadowBlur = 9;
      const sz = 2.5 + 4 * a;
      ctx.fillRect(s.x - sz / 2, s.y - sz / 2, sz, sz);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  };

  const render = () => {
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, H);

    const g = ctx.createRadialGradient(CX, CY - 30, 8, CX, CY - 10, W * 0.62);
    g.addColorStop(0, shade(COL.accent, 1, 0.17));
    g.addColorStop(1, shade(COL.accent, 1, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    drawFloor();

    const items = [];
    for (const b of blocks) {
      const sc = project(b.x, b.y, b.z);
      if (sc.y - K * 1.6 > H || sc.y < -K * 6) continue;
      items.push({ b: b, a: 1 });
    }
    for (const d of debris) {
      const sc = project(d.x, d.y, d.z);
      if (sc.y - K * 1.6 > H || sc.y < -K * 8) continue;
      items.push({ b: d, a: clamp(d.life, 0, 1) });
    }
    items.sort((A, B) => depth(A.b) - depth(B.b));
    for (const it of items) drawBox(it.b, it.a);

    if (moving) drawBox(moving, 1);

    drawParticles();

    if (flash > 0 && blocks.length) {
      const b = blocks[blocks.length - 1];
      ctx.save();
      ctx.globalAlpha = clamp(flash, 0, 1) * 0.85;
      ctx.shadowColor = shade(COL.accent, 1.6, 1);
      ctx.shadowBlur = 26;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * clamp(flash, 0, 1)) + ')';
      ctx.lineWidth = 2.5;
      trace(topQuad(b));
      ctx.stroke();
      ctx.restore();
    }

    if (perfMsg) {
      const b = blocks[blocks.length - 1];
      const p = project(b.x, b.y + 1.1, b.z);
      ctx.save();
      ctx.globalAlpha = clamp(perfMsg.t, 0, 1);
      ctx.fillStyle = shade(COL.accent, 1.75, 1);
      ctx.font = '700 17px Inter, system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = shade(COL.accent, 1.4, 0.9);
      ctx.shadowBlur = 12;
      ctx.fillText(perfMsg.text, p.x, p.y - (1 - perfMsg.t) * 30);
      ctx.restore();
    }
  };

  /* --- loop --- */
  const loop = (ts) => {
    if (!running) return;
    let dt = ts - lastTs;
    lastTs = ts;
    if (dt < 0) dt = 0;
    if (dt > 60) dt = 60;
    if (!frozen) {
      update(dt);
      render();
    }
    if (running) requestAnimationFrame(loop);
  };

  /* --- ui --- */
  const showOverlay = (title, text, label) => {
    overlay.querySelector('.arcade-overlay-title').textContent = title;
    overlay.querySelector('.arcade-overlay-text').textContent = text;
    startBtn.textContent = label;
    overlay.classList.remove('hidden');
  };

  const reset = () => {
    blocks = [{ x: 0, z: 0, sx: 1, sz: 1, y: 0 }];
    debris = [];
    particles = [];
    level = 1;
    combo = 0;
    flash = 0;
    perfMsg = null;
    score = 0;
    over = false;
    dead = false;
    focusY = level - 0.9;
    focusTarget = level - 0.9;
    scoreEl.textContent = '0';
    refreshColors();
    spawnMoving();
    render();
  };

  const start = () => {
    startBtn.blur();
    overlay.classList.add('hidden');
    reset();
    frozen = false;
    running = true;
    lastTs = performance.now();
    requestAnimationFrame(loop);
  };

  startBtn.addEventListener('click', start);

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (running && moving && !over) { e.preventDefault(); drop(); }
  });

  window.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && running && moving && !over) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      drop();
    }
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => { frozen = running && !entry.isIntersecting; });
    }, { threshold: 0 }).observe(canvas);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) frozen = true;
    else frozen = false;
  });

  new MutationObserver(() => { refreshColors(); if (!running) render(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  reset();
  showOverlay('Stack', 'Drop each block on the one below.', 'Play');
})();
