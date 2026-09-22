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
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
})();