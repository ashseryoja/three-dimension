/* =====================================================================
   THREE DIMENSION — интерфейс: лоадер, меню, курсор, параллакс, reveal,
   процесс, слайдер «сетка/рендер», конфигуратор. 3D живёт в scene.js
   и общается с этим файлом через window.TD.
   ===================================================================== */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = t => t * t * (3 - 2 * t);

  const TD = window.TD = {
    pointer: { x: 0, y: 0, tx: 0, ty: 0 },          // -1..1, сглаженные (x,y) и целевые (tx,ty)
    drag: { active: false, delta: 0 },              // перетаскивание кресла в hero
    state: { split: 0.5, splitEff: 0, fabric: 'cognac', legs: 'walnut', process: 0 },
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    fine: matchMedia('(hover: hover) and (pointer: fine)').matches,
    sceneFrame: null,
    sceneReady: false,
    onReady() {},
    onFail() {}
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ?og=1 — статичный кадр для превью ссылки (без лоадера, курсора и анимаций)
  const OG = /[?&]og=1/.test(location.search);
  if (OG) document.documentElement.classList.add('is-og');

  /* ---------- прелоадер ---------- */
  const loader = $('#loader');
  const loaderBar = $('#loaderBar');
  const fallback = $('#sceneFallback');
  const hero = $('#hero');
  const heroTitle = $('.hero__title');
  const t0 = performance.now();
  let loaderDone = false;
  let fakeProgress = 0;

  document.body.classList.add('is-locked');

  let realProgress = 0;
  TD.onProgress = p => { realProgress = p; };
  (function tickLoader() {
    if (loaderDone) return;
    fakeProgress += (0.84 - fakeProgress) * 0.04;
    loaderBar.style.width = (Math.max(fakeProgress, realProgress * 0.96) * 100).toFixed(1) + '%';
    requestAnimationFrame(tickLoader);
  })();

  function finishLoader() {
    if (loaderDone) return;
    loaderDone = true;
    loaderBar.style.width = '100%';
    const wait = OG ? 0 : Math.max(0, 1150 - (performance.now() - t0));
    setTimeout(() => {
      loader.classList.add('is-done');
      document.body.classList.remove('is-locked');
      hero.classList.add('is-in');
      heroTitle.classList.add('is-in');
      setTimeout(() => loader.remove(), 1500);
    }, wait + 200);
  }

  TD.onReady = () => {
    TD.sceneReady = true;
    fallback.classList.remove('is-visible');
    finishLoader();
  };
  TD.onFail = () => {
    fallback.classList.add('is-visible');
    finishLoader();
  };
  // страховка: если 3D не поднялось за 8 с — показываем страницу с SVG-заглушкой
  setTimeout(() => { if (!TD.sceneReady) TD.onFail(); }, 8000);

  /* ---------- разбивка заголовков на слова ---------- */
  $$('[data-split]').forEach(el => {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === 3) {
          if (!child.textContent.trim()) return;
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(w => {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(' ')); return; }
            const outer = document.createElement('span');
            outer.className = 'w';
            const inner = document.createElement('span');
            inner.textContent = w;
            inner.style.setProperty('--i', i++);
            outer.appendChild(inner);
            frag.appendChild(outer);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(el);
  });

  /* ---------- появление при скролле ---------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach(el => io.observe(el));
  // лёгкий каскад внутри групп
  ['.cards .card', '.rows .row', '.stats .stat', '.versus__row'].forEach(sel => {
    $$(sel).forEach((el, i) => { el.style.transitionDelay = (i * 70) + 'ms'; });
  });

  /* ---------- шапка ---------- */
  const header = $('#header');
  let lastY = scrollY;
  function updateHeader() {
    const y = scrollY;
    header.classList.toggle('is-scrolled', y > 24);
    if (y > lastY + 8 && y > 260 && !menuOpen) header.classList.add('is-hidden');
    else if (y < lastY - 8 || y < 260) header.classList.remove('is-hidden');
    lastY = y;
  }

  /* ---------- мобильное меню ---------- */
  const burger = $('#burger');
  const menu = $('#menu');
  let menuOpen = false;
  function toggleMenu(open) {
    menuOpen = open;
    menu.classList.toggle('is-open', open);
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    menu.setAttribute('aria-hidden', String(!open));
    if (loaderDone) document.body.classList.toggle('is-locked', open);
    if (open) header.classList.remove('is-hidden');
  }
  burger.addEventListener('click', () => toggleMenu(!menuOpen));
  $$('a', menu).forEach(a => a.addEventListener('click', () => toggleMenu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) toggleMenu(false); });

  /* ---------- указатель: мышь → параллакс; на телефоне — гироскоп (Android) ---------- */
  let cx = innerWidth / 2, cy = innerHeight / 2;
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    cx = e.clientX; cy = e.clientY;
    TD.pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    TD.pointer.ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  if (!TD.fine && 'DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission !== 'function') {
    let baseBeta = null;
    addEventListener('deviceorientation', e => {
      if (e.gamma == null || e.beta == null) return;
      if (baseBeta === null) baseBeta = e.beta;
      TD.pointer.tx = clamp(e.gamma / 28, -1, 1);
      TD.pointer.ty = clamp((e.beta - baseBeta) / 28, -1, 1);
    }, { passive: true });
  }

  /* ---------- перетаскивание кресла в hero ---------- */
  const dragEl = $('#heroDrag');
  let dragging = false, dragLastX = 0;
  dragEl.addEventListener('pointerdown', e => {
    dragging = true; dragLastX = e.clientX; TD.drag.active = true;
    try { dragEl.setPointerCapture(e.pointerId); } catch (_) {}
  });
  dragEl.addEventListener('pointermove', e => {
    if (!dragging) return;
    TD.drag.delta += e.clientX - dragLastX;
    dragLastX = e.clientX;
  });
  const dragEnd = () => { dragging = false; TD.drag.active = false; };
  dragEl.addEventListener('pointerup', dragEnd);
  dragEl.addEventListener('pointercancel', dragEnd);
  dragEl.addEventListener('lostpointercapture', dragEnd);

  /* ---------- кастомный курсор ---------- */
  const cursor = $('#cursor');
  const cursorDot = $('.cursor__dot', cursor);
  const cursorRing = $('.cursor__ring', cursor);
  let rx = cx, ry = cy;
  if (TD.fine) {
    document.body.classList.add('has-cursor');
    document.addEventListener('pointerover', e => {
      const t = e.target.closest('[data-cursor], a, button, .swatch');
      cursor.classList.toggle('is-drag', !!t && t.dataset.cursor === 'drag');
      cursor.classList.toggle('is-link', !!t && t.dataset.cursor !== 'drag');
    });
    document.documentElement.addEventListener('mouseleave', () => cursor.classList.add('is-hidden'));
    document.documentElement.addEventListener('mouseenter', () => cursor.classList.remove('is-hidden'));
  }
  function updateCursor(dt) {
    if (!TD.fine) return;
    rx += (cx - rx) * Math.min(1, dt * 14);
    ry += (cy - ry) * Math.min(1, dt * 14);
    cursorDot.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    cursorRing.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
  }

  /* ---------- магнитные кнопки и 3D-наклон карточек (мышь) ---------- */
  if (TD.fine) {
    $$('[data-magnet]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${(x * 0.22).toFixed(1)}px, ${(y * 0.32).toFixed(1)}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
    $$('[data-tilt]').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        card.style.transition = 'transform .15s, box-shadow .4s';
        card.style.transform = `rotateX(${((0.5 - py) * 9).toFixed(2)}deg) rotateY(${((px - 0.5) * 11).toFixed(2)}deg) translateZ(4px)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; card.style.transition = ''; });
    });
  }

  /* ---------- параллакс декоративных слоёв ---------- */
  const plx = $$('[data-parallax]').map(el => ({
    el, f: parseFloat(el.dataset.parallax) || 0,
    parent: el.closest('section') || el.parentElement
  }));
  function updateParallax() {
    if (TD.reduced) return;
    const vh = innerHeight;
    plx.forEach(p => {
      const r = p.parent.getBoundingClientRect();
      if (r.bottom < -300 || r.top > vh + 300) return;
      const center = r.top + r.height / 2 - vh / 2;
      p.el.style.transform = `translate3d(0, ${(-center * p.f).toFixed(1)}px, 0)`;
    });
  }

  /* ---------- процесс: шаги по прогрессу sticky-секции ---------- */
  const process = $('#process');
  const steps = $$('.step');
  const processBar = $('#processBar');
  let stepIdx = 0;
  function updateProcess() {
    const r = process.getBoundingClientRect();
    const range = Math.max(1, r.height - innerHeight);
    const p = clamp(-r.top / range, 0, 1);
    TD.state.process = p;
    const idx = p < 0.24 ? 0 : p < 0.5 ? 1 : p < 0.8 ? 2 : 3;
    if (idx !== stepIdx) {
      stepIdx = idx;
      steps.forEach((s, i) => s.classList.toggle('is-active', i === idx));
    }
    processBar.style.width = (p * 100).toFixed(1) + '%';
  }

  /* ---------- слайдер «сетка / рендер» ---------- */
  const stage = $('#compareStage');
  const divider = $('#compareDivider');
  let cDrag = false;
  const setSplit = x => {
    const r = stage.getBoundingClientRect();
    TD.state.split = clamp((x - r.left) / r.width, 0.05, 0.95);
  };
  stage.addEventListener('pointerdown', e => {
    cDrag = true; stage.classList.add('is-dragging');
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    setSplit(e.clientX);
  });
  stage.addEventListener('pointermove', e => { if (cDrag) setSplit(e.clientX); });
  const cEnd = () => { cDrag = false; stage.classList.remove('is-dragging'); };
  stage.addEventListener('pointerup', cEnd);
  stage.addEventListener('pointercancel', cEnd);
  stage.addEventListener('lostpointercapture', cEnd);
  $('#compareHandle').addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') TD.state.split = clamp(TD.state.split - 0.05, 0.05, 0.95);
    if (e.key === 'ArrowRight') TD.state.split = clamp(TD.state.split + 0.05, 0.05, 0.95);
  });
  function updateCompare() {
    const r = stage.getBoundingClientRect();
    const vh = innerHeight;
    const vis = clamp((vh - r.top) / (vh * 0.55), 0, 1) * clamp(r.bottom / (vh * 0.4), 0, 1);
    const target = TD.state.split * ease(vis);
    TD.state.splitEff += (target - TD.state.splitEff) * 0.18;
    divider.style.left = (TD.state.splitEff * 100).toFixed(2) + '%';
  }

  /* ---------- конфигуратор ---------- */
  $$('.swatches').forEach(group => {
    const key = group.dataset.group;
    const nameEl = $(key === 'fabric' ? '#fabricName' : '#legsName');
    $$('.swatch', group).forEach(btn => btn.addEventListener('click', () => {
      $$('.swatch', group).forEach(b => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-checked', String(on));
      });
      TD.state[key] = btn.dataset.value;
      if (nameEl) nameEl.textContent = (btn.getAttribute('aria-label') || '').replace(', ', ' · ');
    }));
  });

  /* ---------- SVG-заглушка, если 3D не поднялось ---------- */
  function updateFallback() {
    if (!fallback.classList.contains('is-visible')) return;
    fallback.style.opacity = clamp(1 - scrollY / (innerHeight * 0.7), 0, 1).toFixed(2);
  }

  /* ---------- главный цикл ---------- */
  $('#year').textContent = new Date().getFullYear();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const k = Math.min(1, dt * 5);
    TD.pointer.x += (TD.pointer.tx - TD.pointer.x) * k;
    TD.pointer.y += (TD.pointer.ty - TD.pointer.y) * k;
    updateHeader();
    updateParallax();
    updateProcess();
    updateCompare();
    updateCursor(dt);
    updateFallback();
    if (TD.sceneFrame) TD.sceneFrame(now / 1000, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
