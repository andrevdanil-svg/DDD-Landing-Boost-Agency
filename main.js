/* ============================================================
   Boost! Agency — landing behavior
   ============================================================ */
(function () {
  'use strict';

  const prefersReduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', async () => {
    await loadPartials();
    init();
  });

  function init() {
    bindMobileMenu();
    bindNavDropdown();
    bindSmoothScroll();
    bindHeaderScrollState();
    bindSectionFadeIn();
    bindResultCounters();
    bindFaq();
    bindContactForm();
  }

  /* ---------- Nav dropdown (Услуги) ---------- */
  function bindNavDropdown() {
    const triggers = document.querySelectorAll('.header__nav-trigger');
    if (!triggers.length) return;

    const closeAll = () => {
      triggers.forEach((t) => t.setAttribute('aria-expanded', 'false'));
    };

    triggers.forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = trigger.getAttribute('aria-expanded') === 'true';
        closeAll();
        trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.header__nav-item--dropdown')) closeAll();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });
  }

  /* ---------- Partial includes ---------- */
  async function loadPartials() {
    const nodes = document.querySelectorAll('[data-include]');
    await Promise.all(Array.from(nodes).map(async (node) => {
      const url = node.getAttribute('data-include');
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        node.replaceWith(tpl.content);
      } catch (e) {
        console.error('Partial include failed:', url, e);
      }
    }));
  }

  /* ---------- Mobile menu ---------- */
  function bindMobileMenu() {
    const burger = document.querySelector('.header__burger');
    const menu = document.getElementById('mobile-menu');
    if (!burger || !menu) return;

    const close = () => {
      document.body.classList.remove('is-menu-open');
      menu.classList.remove('is-open');
      menu.setAttribute('aria-hidden', 'true');
      burger.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      document.body.classList.add('is-menu-open');
      menu.classList.add('is-open');
      menu.setAttribute('aria-hidden', 'false');
      burger.setAttribute('aria-expanded', 'true');
    };

    burger.addEventListener('click', () => {
      menu.classList.contains('is-open') ? close() : open();
    });
    menu.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  /* ---------- Smooth scroll ---------- */
  function bindSmoothScroll() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({
        behavior: prefersReduced ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  }

  /* ---------- Header scroll state ---------- */
  function bindHeaderScrollState() {
    const header = document.querySelector('.header');
    if (!header) return;
    const update = () => {
      if (window.scrollY > 8) header.classList.add('is-scrolled');
      else header.classList.remove('is-scrolled');
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  /* ---------- Section fade-in ---------- */
  function bindSectionFadeIn() {
    const sections = document.querySelectorAll('.section');
    if (!sections.length) return;
    if (prefersReduced || !('IntersectionObserver' in window)) {
      sections.forEach((s) => s.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    sections.forEach((s) => io.observe(s));
  }

  /* ---------- Result counters ---------- */
  function bindResultCounters() {
    const values = document.querySelectorAll('.result__value');
    if (!values.length) return;
    if (prefersReduced || !('IntersectionObserver' in window)) return;

    const format = (v, tpl) => {
      // simple printf-like: %d, %.1f, x%.1f, +%d%%, -%d%%, %d+
      if (tpl.indexOf('%.1f') !== -1) {
        return tpl.replace('%.1f', v.toFixed(1));
      }
      return tpl.replace('%d', Math.round(v));
    };

    const animate = (el) => {
      const target = parseFloat(el.dataset.target);
      const tpl = el.dataset.format || '%d';
      const start = performance.now();
      const dur = 1400;
      const from = 0;
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const v = from + (target - from) * ease(t);
        el.textContent = format(v, tpl);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animate(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    values.forEach((v) => io.observe(v));
  }

  /* ---------- FAQ accordion ---------- */
  function bindFaq() {
    document.querySelectorAll('.faq__item').forEach((item) => {
      const q = item.querySelector('.faq__q');
      if (!q) return;
      q.addEventListener('click', () => {
        const open = item.classList.toggle('is-open');
        q.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }

  /* ---------- Contact form ---------- */
  // LEADS_API: переопределить через <meta name="leads-api" content="https://api.example.com/leads"> либо window.LEADS_API.
  // Если лендинг раздаётся тем же сервером (FastAPI mount /landing) — используем относительный /leads.
  // Иначе можно переопределить через <meta name="leads-api" content="https://api.example.com/leads">.
  const LEADS_API =
    (document.querySelector('meta[name="leads-api"]')?.content) ||
    window.LEADS_API ||
    '/leads';

  function bindContactForm() {
    const form = document.getElementById('contact-form');
    const success = document.getElementById('form-success');
    if (!form || !success) return;
    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const fd = new FormData(form);
      const payload = {
        first_name: fd.get('first_name') || '',
        last_name: fd.get('last_name') || '',
        email: fd.get('email') || '',
        company: fd.get('company') || '',
        role: fd.get('role') || '',
        phone: fd.get('phone') || '',
        website: fd.get('website') || '',
        budget: fd.get('budget') || '',
        message: fd.get('message') || '',
        source: 'landing',
      };

      const originalText = submitBtn?.textContent;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправляем…';
      }

      try {
        const res = await fetch(LEADS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        form.style.display = 'none';
        success.classList.add('is-visible');
        success.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
      } catch (err) {
        console.error('Lead submit failed:', err);
        alert('Не удалось отправить заявку. Попробуйте ещё раз или напишите нам на hello@boost.agency');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }
})();
