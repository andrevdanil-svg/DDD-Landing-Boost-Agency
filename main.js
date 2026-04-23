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
    initLangSwitcher();
    initLangBanner();
    initLeadPopup();
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
      // %% must be decoded AFTER numeric substitution so literal % renders correctly.
      const withNum = tpl.indexOf('%.1f') !== -1
        ? tpl.replace('%.1f', v.toFixed(1))
        : tpl.replace('%d', Math.round(v));
      return withNum.replace(/%%/g, '%');
    };

    const animate = (el) => {
      const target = parseFloat(el.dataset.target);
      if (isNaN(target)) return; // skip stats without data-target
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

  /* ---------- Language switcher ---------- */
  const LANG_LABELS = { ru: 'RU', en: 'EN', uz: 'UZ' };

  function initLangSwitcher() {
    const targets = document.querySelectorAll('#lang-switcher, #lang-switcher-mobile');
    if (!targets.length) return;
    const currentLang = document.documentElement.lang || 'ru';
    const alts = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'))
      .filter((l) => l.hreflang !== 'x-default');
    if (!alts.length) return;

    const html = alts.map((l) => {
      const isActive = l.hreflang === currentLang;
      const cls = 'lang-switcher__link' + (isActive ? ' is-active' : '');
      const label = LANG_LABELS[l.hreflang] || l.hreflang.toUpperCase();
      return `<a href="${l.href}" class="${cls}" lang="${l.hreflang}" hreflang="${l.hreflang}">${label}</a>`;
    }).join('');

    targets.forEach((t) => { t.innerHTML = html; });
  }

  /* ---------- Language detection banner ---------- */
  const LANG_BANNER_MSG = {
    ru: 'Переключиться на русскую версию?',
    en: 'Switch to the English version?',
    uz: "O'zbekcha versiyaga o'tishni xohlaysizmi?",
  };
  const LANG_BANNER_ACTION = { ru: 'На русский', en: 'Switch', uz: "O'tish" };

  function initLangBanner() {
    const banner = document.getElementById('lang-banner');
    if (!banner) return;
    if (localStorage.getItem('langBannerDismissed') === '1') return;

    const currentLang = document.documentElement.lang || 'ru';
    const userLang = (navigator.language || '').slice(0, 2).toLowerCase();
    if (!LANG_LABELS[userLang] || userLang === currentLang) return;

    const alt = document.querySelector(`link[rel="alternate"][hreflang="${userLang}"]`);
    if (!alt) return;

    const textEl = document.getElementById('lang-banner-text');
    const btnEl = document.getElementById('lang-banner-switch');
    const closeEl = document.getElementById('lang-banner-close');
    if (!textEl || !btnEl || !closeEl) return;

    textEl.textContent = LANG_BANNER_MSG[userLang] || '';
    btnEl.href = alt.href;
    btnEl.textContent = LANG_BANNER_ACTION[userLang] || 'Switch';
    btnEl.setAttribute('hreflang', userLang);

    closeEl.addEventListener('click', () => {
      banner.hidden = true;
      try { localStorage.setItem('langBannerDismissed', '1'); } catch (e) {}
    });

    banner.hidden = false;
  }

  /* ---------- Lead popup (60-second time trigger) ---------- */
  const POPUP_DELAY_MS = 60 * 1000;
  const POPUP_COPY = {
    ru: {
      title: 'Хотите медиаплан под ваш KPI?',
      desc: 'Пришлём за 48 часов. Оставьте контакты — менеджер напишет в течение рабочего дня.',
      name: 'Как к вам обращаться?',
      email: 'client@company.com',
      btn: 'Получить медиаплан',
      sending: 'Отправляем…',
      close: 'Закрыть',
      successTitle: 'Готово!',
      successDesc: 'Менеджер напишет в течение рабочего дня.',
      errorMsg: 'Не удалось отправить. Напишите нам на andrevdanil@gmail.com',
    },
    en: {
      title: 'Want a KPI-based media plan?',
      desc: "We'll send it within 48 hours. Leave your contacts — a manager will reply within one business day.",
      name: 'Your name',
      email: 'client@company.com',
      btn: 'Get the media plan',
      sending: 'Sending…',
      close: 'Close',
      successTitle: 'Done!',
      successDesc: 'A manager will reply within one business day.',
      errorMsg: "Couldn't send. Please email us at andrevdanil@gmail.com",
    },
    uz: {
      title: 'KPI asosida mediaplan olishni xohlaysizmi?',
      desc: '48 soat ichida yuboramiz. Kontaktlaringizni qoldiring — menejer ish kuni davomida javob beradi.',
      name: 'Ismingiz',
      email: 'client@company.com',
      btn: 'Mediaplan olish',
      sending: 'Yuborilmoqda…',
      close: 'Yopish',
      successTitle: 'Tayyor!',
      successDesc: 'Menejer ish kuni davomida javob beradi.',
      errorMsg: "Yuborib bo'lmadi. Bizga yozing: andrevdanil@gmail.com",
    },
  };

  function initLeadPopup() {
    // Suppress if user already dismissed/submitted earlier.
    try {
      if (sessionStorage.getItem('leadPopupShown') === '1') return;
      if (localStorage.getItem('leadSubmitted') === '1') return;
    } catch (e) { /* private mode — continue */ }

    const lang = (document.documentElement.lang || 'ru').slice(0, 2);
    const t = POPUP_COPY[lang] || POPUP_COPY.ru;

    const wrap = document.createElement('div');
    wrap.className = 'lead-popup';
    wrap.id = 'lead-popup';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'lead-popup-title');
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="lead-popup__backdrop" data-popup-close></div>' +
      '<div class="lead-popup__card">' +
        '<button class="lead-popup__close" type="button" data-popup-close aria-label="' + t.close + '">×</button>' +
        '<h3 class="lead-popup__title" id="lead-popup-title">' + t.title + '</h3>' +
        '<p class="lead-popup__desc">' + t.desc + '</p>' +
        '<form class="lead-popup__form" id="lead-popup-form" novalidate>' +
          '<input name="first_name" type="text" placeholder="' + t.name + '" required autocomplete="given-name">' +
          '<input name="email" type="email" placeholder="' + t.email + '" required autocomplete="email">' +
          '<div class="lead-popup__hp" aria-hidden="true">' +
            '<label for="pp-hp">Leave empty</label>' +
            '<input id="pp-hp" name="website_url" type="text" tabindex="-1" autocomplete="off">' +
          '</div>' +
          '<button type="submit" class="btn btn--primary btn--large">' + t.btn + '</button>' +
        '</form>' +
        '<div class="lead-popup__success" id="lead-popup-success" hidden>' +
          '<strong>' + t.successTitle + '</strong>' +
          '<p>' + t.successDesc + '</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    const form = wrap.querySelector('#lead-popup-form');
    const success = wrap.querySelector('#lead-popup-success');
    const submitBtn = form.querySelector('button[type="submit"]');

    const show = () => {
      wrap.hidden = false;
      document.body.classList.add('is-popup-open');
      try { sessionStorage.setItem('leadPopupShown', '1'); } catch (e) {}
      if (window.dataLayer) window.dataLayer.push({ event: 'lead_popup_shown' });
      // Focus first input for a11y
      requestAnimationFrame(() => form.querySelector('input').focus());
    };
    const hide = () => {
      wrap.hidden = true;
      document.body.classList.remove('is-popup-open');
    };

    const timer = setTimeout(show, POPUP_DELAY_MS);

    wrap.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-popup-close')) {
        clearTimeout(timer);
        hide();
        if (window.dataLayer) window.dataLayer.push({ event: 'lead_popup_dismissed' });
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !wrap.hidden) hide();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const fd = new FormData(form);
      // Honeypot — bots fill it; drop silently.
      if ((fd.get('website_url') || '').toString().trim() !== '') {
        success.hidden = false; form.style.display = 'none';
        return;
      }
      const original = submitBtn.textContent;
      submitBtn.disabled = true; submitBtn.textContent = t.sending;

      try {
        const res = await fetch(LEADS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: fd.get('first_name') || '',
            email: fd.get('email') || '',
            source: 'landing-popup',
          }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.style.display = 'none';
        success.hidden = false;
        try { localStorage.setItem('leadSubmitted', '1'); } catch (e) {}
        if (window.dataLayer) window.dataLayer.push({ event: 'lead_popup_submitted' });
        setTimeout(hide, 3500);
      } catch (err) {
        console.error('Popup lead submit failed:', err);
        submitBtn.disabled = false; submitBtn.textContent = original;
        alert(t.errorMsg);
      }
    });
  }

  /* ---------- Contact form ---------- */
  // LEADS_API: переопределить через <meta name="leads-api"> либо window.LEADS_API.
  const LEADS_API =
    (document.querySelector('meta[name="leads-api"]')?.content) ||
    window.LEADS_API ||
    'https://platform.boostagency.uz/api/leads';

  function bindContactForm() {
    const form = document.getElementById('contact-form');
    const success = document.getElementById('form-success');
    if (!form || !success) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    const errorEl = document.getElementById('form-error');

    const showError = () => { if (errorEl) errorEl.hidden = false; };
    const hideError = () => { if (errorEl) errorEl.hidden = true; };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const fd = new FormData(form);

      // Honeypot: hidden field that only bots auto-fill. If filled — drop silently.
      if ((fd.get('website_url') || '').toString().trim() !== '') {
        form.style.display = 'none';
        success.classList.add('is-visible');
        return;
      }

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
        showError();
        errorEl?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }
})();
