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

/* ---------- Playable Snake (arcade demo) ---------- */
(() => {
  const canvas = document.getElementById('snakeCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('arcadeOverlay');
  const startBtn = document.getElementById('arcadeStart');
  const scoreEl = document.getElementById('arcadeScore');
  const bestEl = document.getElementById('arcadeBest');

  const COLS = 20;
  const ROWS = 20;
  const CELL = canvas.width / COLS;

  let snake, dir, nextDir, food, score, speed, running = false, paused = false;

  let best = 0;
  try { best = Number(localStorage.getItem('snake-best')) || 0; } catch (e) {}
  bestEl.textContent = best;

  const readVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const palette = () => ({
    bg: readVar('--surface-2'),
    grid: readVar('--border'),
    snake: readVar('--accent'),
    head: readVar('--accent-strong'),
    food: readVar('--text')
  });

  function reset() {
    snake = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = dir;
    score = 0;
    speed = 140;
    paused = false;
    placeFood();
    scoreEl.textContent = score;
    draw();
  }

  function placeFood() {
    let p;
    do {
      p = { x: (Math.random() * COLS) | 0, y: (Math.random() * ROWS) | 0 };
    } while (snake.some((s) => s.x === p.x && s.y === p.y));
    food = p;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    const c = palette();
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(canvas.width, i * CELL); ctx.stroke();
    }

    ctx.fillStyle = c.food;
    roundRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6, 3);

    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? c.head : c.snake;
      roundRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4, i === 0 ? 6 : 4);
    });
  }

  function schedule() {
    clearTimeout(schedule.id);
    schedule.id = setTimeout(step, speed);
  }

  function step() {
    if (!running || paused) return;
    dir = nextDir;

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const hitWall = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
    const hitSelf = snake.some((s) => s.x === head.x && s.y === head.y);
    if (hitWall || hitSelf) return gameOver();

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 1;
      scoreEl.textContent = score;
      if (score % 5 === 0 && speed > 70) speed -= 12;
      placeFood();
    } else {
      snake.pop();
    }
    draw();
    schedule();
  }

  function showOverlay(title, text, label) {
    overlay.querySelector('.arcade-overlay-title').textContent = title;
    overlay.querySelector('.arcade-overlay-text').textContent = text;
    startBtn.textContent = label;
    overlay.classList.remove('hidden');
  }

  function gameOver() {
    running = false;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      try { localStorage.setItem('snake-best', best); } catch (e) {}
    }
    showOverlay('Game over', 'Score ' + score, 'Play again');
  }

  function start() {
    overlay.classList.add('hidden');
    reset();
    running = true;
    schedule();
  }

  function setDir(x, y) {
    if (x === -dir.x && y === -dir.y) return;
    nextDir = { x, y };
  }

  const KEYS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0]
  };

  window.addEventListener('keydown', (e) => {
    if (!running) return;
    const move = KEYS[e.key] || KEYS[e.key.toLowerCase()];
    if (move) {
      e.preventDefault();
      setDir(move[0], move[1]);
    } else if (e.key === ' ') {
      e.preventDefault();
      paused = !paused;
      if (!paused) schedule();
    }
  });

  startBtn.addEventListener('click', start);

  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (!touchStart || !running) return;
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
    touchStart = null;
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) paused = true;
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting && running) paused = true;
      });
    }, { threshold: 0 }).observe(canvas);
  }

  new MutationObserver(() => { if (!running) draw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  reset();
  showOverlay('Snake', 'Arrow keys or WASD to play', 'Play');
})();

/* ---------- "It's not a bug, it's a feature" (arcade demo) ---------- */
(() => {
  const canvas = document.getElementById('bugCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('bugOverlay');
  const startBtn = document.getElementById('bugStart');
  const scoreEl = document.getElementById('bugScore');
  const livesEl = document.getElementById('bugLives');
  const bestEl = document.getElementById('bugBest');
  const quipEl = document.getElementById('bugQuip');

  const W = canvas.width;
  const H = canvas.height;
  const FEATURE_COLOR = '#F59E0B';
  const MAX_LIVES = 3;

  const QUIPS = [
    'Works on my machine.',
    'Have you tried turning it off and on again?',
    'git commit -m "fixed the bug"',
    'Shipping it anyway.'
  ];

  let PAL;
  const refreshPal = () => {
    const cs = getComputedStyle(document.documentElement);
    PAL = {
      bg: cs.getPropertyValue('--surface-2').trim(),
      grid: cs.getPropertyValue('--border').trim(),
      bug: cs.getPropertyValue('--accent').trim(),
      body: cs.getPropertyValue('--accent-strong').trim(),
      text: cs.getPropertyValue('--text').trim()
    };
  };
  refreshPal();

  let items = [];
  let splats = [];
  let score = 0;
  let lives = MAX_LIVES;
  let clock = 0;
  let nextSpawn = 0;
  let lastTs = 0;
  let running = false;
  let frozen = false;

  let best = 0;
  try { best = Number(localStorage.getItem('bug-best')) || 0; } catch (e) {}
  bestEl.textContent = best;

  const pickQuip = () => QUIPS[(Math.random() * QUIPS.length) | 0];

  function spawn() {
    const isFeature = Math.random() < 0.22;
    const r = 20;
    const m = r + 20;
    items.push({
      x: m + Math.random() * (W - m * 2),
      y: m + Math.random() * (H - m * 2),
      type: isFeature ? 'feature' : 'bug',
      born: clock,
      life: (isFeature ? 2300 : 1550) * (1 - 0.35 * Math.min(1, clock / 45000)),
      r,
      angle: Math.random() * Math.PI * 2
    });
  }

  function loseLife(reason) {
    lives -= 1;
    livesEl.textContent = Math.max(0, lives);
    quipEl.textContent = reason === 'feature'
      ? "It's not a bug, it's a feature!"
      : 'A bug slipped through the build...';
    if (lives <= 0) gameOver();
  }

  function gameOver() {
    running = false;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      try { localStorage.setItem('bug-best', best); } catch (e) {}
    }
    showOverlay('Build failed', 'Squashed ' + score + ' \u00b7 ' + pickQuip(), 'Rebuild');
  }

  function squash(x, y) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (Math.hypot(it.x - x, it.y - y) > it.r * 1.25) continue;
      items.splice(i, 1);
      if (it.type === 'bug') {
        score += 1;
        scoreEl.textContent = score;
        splats.push({ x: it.x, y: it.y, t: clock, color: PAL.bug });
      } else {
        splats.push({ x: it.x, y: it.y, t: clock, color: FEATURE_COLOR });
        loseLife('feature');
      }
      return;
    }
  }

  function drawBug(x, y, r, angle, c) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = c.body;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (const off of [-0.55, 0, 0.55]) {
        ctx.beginPath();
        ctx.moveTo(0, off * r * 0.7);
        ctx.lineTo(side * r * 1.3, off * r * 1.05 + Math.sin(angle * 6 + off) * 1.5);
        ctx.stroke();
      }
    }
    ctx.fillStyle = c.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.72, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.bug;
    ctx.beginPath();
    ctx.arc(0, -r * 0.85, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.bug;
    ctx.beginPath();
    ctx.moveTo(-r * 0.28, -r * 1.12); ctx.lineTo(-r * 0.6, -r * 1.5);
    ctx.moveTo(r * 0.28, -r * 1.12); ctx.lineTo(r * 0.6, -r * 1.5);
    ctx.stroke();
    ctx.fillStyle = c.bg;
    ctx.beginPath(); ctx.arc(-r * 0.16, -r * 0.92, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.16, -r * 0.92, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawStar(cx, cy, r, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    const spikes = 5;
    const outer = r * 1.05;
    const inner = r * 0.46;
    for (let i = 0; i < spikes * 2; i++) {
      const rad = i % 2 ? inner : outer;
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = PAL.grid;
    ctx.lineWidth = 1;
    const cols = 16;
    const step = W / cols;
    for (let i = 1; i < cols; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(W, i * step); ctx.stroke();
    }

    splats.forEach((s) => {
      const k = (clock - s.t) / 350;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 12 + k * 26, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    items.forEach((it) => {
      const remain = 1 - (clock - it.born) / it.life;
      ctx.strokeStyle = it.type === 'feature' ? FEATURE_COLOR : PAL.bug;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(it.x, it.y, it.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, remain));
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (it.type === 'feature') drawStar(it.x, it.y, it.r, FEATURE_COLOR);
      else drawBug(it.x, it.y, it.r, it.angle, PAL);
    });
  }

  function update(dt) {
    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      spawn();
      const difficulty = Math.min(1, clock / 45000);
      nextSpawn = (820 - 380 * difficulty) + Math.random() * 260;
    }

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (clock - it.born >= it.life) {
        items.splice(i, 1);
        if (it.type === 'bug') {
          loseLife('escape');
          if (!running) return;
        }
      } else {
        it.angle += dt * 0.0016;
      }
    }

    splats = splats.filter((s) => clock - s.t < 350);
  }

  function loop(ts) {
    if (!running) return;
    const dt = Math.min(48, ts - lastTs);
    lastTs = ts;
    if (frozen) {
      requestAnimationFrame(loop);
      return;
    }
    clock += dt;
    update(dt);
    render();
    if (running) requestAnimationFrame(loop);
  }

  function showOverlay(title, text, label) {
    overlay.querySelector('.arcade-overlay-title').textContent = title;
    overlay.querySelector('.arcade-overlay-text').textContent = text;
    startBtn.textContent = label;
    overlay.classList.remove('hidden');
  }

  function reset() {
    items = [];
    splats = [];
    score = 0;
    lives = MAX_LIVES;
    clock = 0;
    nextSpawn = 500;
    frozen = false;
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    quipEl.textContent = 'Bugs: click to fix \u00b7 Features: hands off';
    refreshPal();
    render();
  }

  function start() {
    overlay.classList.add('hidden');
    reset();
    running = true;
    lastTs = performance.now();
    requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', start);

  canvas.addEventListener('pointerdown', (e) => {
    if (!running) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);
    squash(x, y);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => { frozen = running && !entry.isIntersecting; });
    }, { threshold: 0 }).observe(canvas);
  }

  new MutationObserver(() => { refreshPal(); if (!running) render(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  reset();
  showOverlay('Squash the Bugs', 'Fix the bugs. Never touch a feature.', 'Play');
})();