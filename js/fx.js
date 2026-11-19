/* OneOps FX — dependency-free motion primitives (vanilla JS). Loaded with defer after main.js on every page.
   Generic, opt-in by attribute; every module no-ops when its elements are absent.
   - One rAF-driven scroll loop with a "measure" phase (only after resize / layout change) and an "update"
     phase (pure math + transform/opacity/class writes) so scrolling never forces layout.
   - Passive listeners everywhere, transforms only, respects prefers-reduced-motion and coarse pointers.

   Shared contract (see .claude/REDESIGN_BRIEF.md):
     .scroll-progress (auto) · .cursor-glow (auto, fine pointer) · [data-magnetic] · [data-spotlight]
     [data-tilt] · [data-split] · [data-parallax="0.15"]  (positive = lags behind scroll, negative = leads)
   Homepage-only modules (activate only when present):
     [data-pause-offscreen] · [data-hero-stage] · [data-seq] · [data-highlight] · [data-story] · [data-draw]
*/
(function () {
  'use strict';

  var d = document, w = window, root = d.documentElement;
  if (!d.body) return;
  var mm = function (q) { return !!(w.matchMedia && w.matchMedia(q).matches); };
  var RM = mm('(prefers-reduced-motion: reduce)');
  var FINE = mm('(hover: hover) and (pointer: fine)');
  var hasIO = 'IntersectionObserver' in w;
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var raf = w.requestAnimationFrame ? w.requestAnimationFrame.bind(w) : function (f) { return setTimeout(f, 16); };

  root.classList.add('fx');
  if (RM) root.classList.add('fx-reduced');

  /* =====================================================================
     Core scroll loop
     ===================================================================== */
  var mods = [];
  var sy = 0, vh = 0, vw = 0, ticking = false, needMeasure = true;

  function frame() {
    ticking = false;
    sy = w.pageYOffset || root.scrollTop || 0;
    if (needMeasure) {
      needMeasure = false;
      vh = w.innerHeight;
      vw = root.clientWidth;
      for (var i = 0; i < mods.length; i++) if (mods[i].measure) mods[i].measure(sy, vh, vw);
    }
    for (var j = 0; j < mods.length; j++) if (mods[j].update) mods[j].update(sy, vh, vw);
  }
  function request() { if (!ticking) { ticking = true; raf(frame); } }
  function remeasure() { needMeasure = true; request(); }
  function addMod(m) { mods.push(m); remeasure(); }
  function absTop(el) { return el.getBoundingClientRect().top + (w.pageYOffset || 0); }

  w.addEventListener('scroll', request, { passive: true });
  w.addEventListener('resize', remeasure, { passive: true });
  w.addEventListener('load', remeasure);
  if ('ResizeObserver' in w) {
    var lastH = 0;
    new ResizeObserver(function () {
      var h = d.body.offsetHeight;
      if (h !== lastH) { lastH = h; remeasure(); }
    }).observe(d.body);
  }
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(remeasure);

  /* Small IO helper: fires fn once when el becomes visible */
  function onceVisible(el, fn, opts) {
    if (!hasIO) { fn(el); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); fn(e.target); } });
    }, opts || { threshold: 0.2 });
    io.observe(el);
  }

  /* =====================================================================
     1. Scroll progress bar
     ===================================================================== */
  (function () {
    if ($('.read-progress')) return; // articles have their own reading-progress bar
    var bar = $('.scroll-progress');
    if (!bar) {
      bar = d.createElement('div');
      bar.className = 'scroll-progress';
      bar.setAttribute('aria-hidden', 'true');
      d.body.insertBefore(bar, d.body.firstChild);
    }
    var max = 1, last = -1;
    addMod({
      measure: function (s, h) { max = Math.max(1, root.scrollHeight - h); },
      update: function (s) {
        var p = Math.round(clamp(s / max, 0, 1) * 1000) / 1000;
        if (p !== last) { last = p; bar.style.transform = 'scaleX(' + p + ')'; }
      }
    });
  })();

  /* =====================================================================
     2. Cursor glow (fine pointer, motion allowed)
     ===================================================================== */
  if (FINE && !RM) (function () {
    var g = d.createElement('div');
    g.className = 'cursor-glow';
    g.setAttribute('aria-hidden', 'true');
    g.style.left = '0'; g.style.top = '0';
    g.style.transform = 'translate3d(-9999px,-9999px,0)';
    d.body.appendChild(g);
    var tx = 0, ty = 0, x = 0, y = 0, running = false, shown = false;
    function step() {
      x += (tx - x) * 0.14; y += (ty - y) * 0.14;
      g.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.4) raf(step); else running = false;
    }
    w.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      if (!shown) { shown = true; x = tx; y = ty; g.style.opacity = ''; }
      if (!running) { running = true; raf(step); }
    }, { passive: true });
    d.addEventListener('mouseleave', function () { shown = false; g.style.opacity = '0'; });
  })();

  /* =====================================================================
     3. Pointer-driven primitives: magnetic, spotlight, tilt
     ===================================================================== */
  function pointerFx(el, onMove, onLeave) {
    var rect = null, ev = null, queued = false;
    var run = function () {
      queued = false;
      if (!ev) return;
      if (!rect) rect = el.getBoundingClientRect();
      onMove(ev, rect);
    };
    el.addEventListener('pointerenter', function () { rect = null; }, { passive: true });
    el.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      ev = e;
      if (!queued) { queued = true; raf(run); }
    }, { passive: true });
    el.addEventListener('pointerleave', function () { ev = null; rect = null; if (onLeave) onLeave(); }, { passive: true });
    w.addEventListener('scroll', function () { rect = null; }, { passive: true });
  }

  if (FINE && !RM) $$('[data-magnetic]').forEach(function (el) {
    var s = parseFloat(el.getAttribute('data-magnetic')) || 10;
    pointerFx(el, function (e, r) {
      // rect is measured untransformed on enter; keep pull subtle
      var dx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
      var dy = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
      el.style.transform = 'translate3d(' + (dx * s).toFixed(2) + 'px,' + (dy * s * 0.6).toFixed(2) + 'px,0)';
    }, function () { el.style.transform = ''; });
  });

  if (FINE) $$('[data-spotlight]').forEach(function (el) {
    pointerFx(el, function (e, r) {
      el.style.setProperty('--mx', (e.clientX - r.left).toFixed(1) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top).toFixed(1) + 'px');
    });
  });

  if (FINE && !RM) $$('[data-tilt]').forEach(function (el) {
    var max = parseFloat(el.getAttribute('data-tilt')) || 6;
    pointerFx(el, function (e, r) {
      var px = clamp((e.clientX - r.left) / r.width, 0, 1) - 0.5;
      var py = clamp((e.clientY - r.top) / r.height, 0, 1) - 0.5;
      el.style.setProperty('--rx', (-py * 2 * max).toFixed(2) + 'deg');
      el.style.setProperty('--ry', (px * 2 * max).toFixed(2) + 'deg');
    }, function () {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  });

  /* =====================================================================
     4. Word split headings  [data-split]
     Splits text nodes only; inner elements are preserved (recursed into).
     `.grad-text`, `[data-nosplit]`, svg, img are kept as one atomic word.
     ===================================================================== */
  (function () {
    var heads = $$('[data-split]:not(.is-split)');
    if (!heads.length) return;
    var ATOMIC = function (n) {
      return n.nodeType === 1 && (/^(SVG|IMG|BR)$/i.test(n.nodeName) ||
        (n.classList && (n.classList.contains('grad-text') || n.hasAttribute('data-nosplit'))));
    };
    heads.forEach(function (h) {
      var i = 0;
      var word = function (content) {
        var outer = d.createElement('span'); outer.className = 'w';
        var inner = d.createElement('span');
        inner.style.setProperty('--i', i++);
        if (typeof content === 'string') inner.textContent = content; else inner.appendChild(content);
        outer.appendChild(inner);
        return outer;
      };
      var walk = function (node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (n) {
          if (n.nodeType === 3) {
            var parts = n.nodeValue.split(/(\s+)/);
            if (parts.length === 1 && !parts[0]) return;
            var frag = d.createDocumentFragment();
            parts.forEach(function (p) {
              if (!p) return;
              if (/^\s+$/.test(p)) frag.appendChild(d.createTextNode(' '));
              else frag.appendChild(word(p));
            });
            node.replaceChild(frag, n);
          } else if (n.nodeType === 1) {
            if (n.nodeName === 'BR') return;
            if (ATOMIC(n)) { var ph = d.createTextNode(''); node.replaceChild(ph, n); node.replaceChild(word(n), ph); }
            else walk(n);
          }
        });
      };
      walk(h);
      h.classList.add('is-split');
      if (RM) h.classList.add('in');
      else onceVisible(h, function (t) { t.classList.add('in'); }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });
    });
  })();

  /* =====================================================================
     5. Parallax  [data-parallax="speed"]
     ===================================================================== */
  if (!RM) (function () {
    var items = $$('[data-parallax]').map(function (el) {
      return { el: el, s: parseFloat(el.getAttribute('data-parallax')) || 0.15, c: 0, y: 0, mq: el.getAttribute('data-parallax-min') };
    });
    if (!items.length) return;
    addMod({
      measure: function (s) {
        items.forEach(function (p) {
          var r = p.el.getBoundingClientRect();
          p.c = r.top + s - p.y + r.height / 2;
          p.off = p.mq ? vw < parseFloat(p.mq) : false;
          if (p.off && p.y) { p.y = 0; p.el.style.transform = ''; }
        });
      },
      update: function (s, h) {
        items.forEach(function (p) {
          if (p.off) return;
          var dist = p.c - (s + h / 2);
          if (Math.abs(dist) > h * 1.6) return;
          var y = Math.round(-dist * p.s * 10) / 10;
          if (y !== p.y) { p.y = y; p.el.style.transform = 'translate3d(0,' + y + 'px,0)'; }
        });
      }
    });
  })();

  /* =====================================================================
     6. Pause CSS animations while offscreen  [data-pause-offscreen]
     ===================================================================== */
  if (hasIO) (function () {
    var els = $$('[data-pause-offscreen]');
    if (!els.length) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.target.classList.toggle('is-offscreen', !e.isIntersecting); });
    }, { rootMargin: '100px 0px' });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* =====================================================================
     HOMEPAGE MODULES
     ===================================================================== */

  /* ---- 7. Hero stage: 3D dashboard flattens + scales as you scroll ---- */
  (function () {
    var stage = $('[data-hero-stage]');
    if (!stage || RM) return;
    var tilt = $('.hero-tilt', stage) || stage.firstElementChild;
    if (!tilt) return;
    var top = 0, end = 1, on = false, last = -1;
    stage.classList.add('is-live');
    addMod({
      measure: function (s, h, vwid) {
        on = vwid >= 768;
        top = absTop(stage);
        end = Math.max(240, top - h * 0.12);
        if (!on) { tilt.style.transform = ''; last = -1; stage.style.removeProperty('--hp'); }
      },
      update: function (s) {
        if (!on) return;
        if (s > top + stage.offsetHeight + 200 && last === 1) return;
        var p = clamp(s / end, 0, 1);
        p = Math.round(p * 1000) / 1000;
        if (p === last) return;
        last = p;
        var e = 1 - Math.pow(1 - p, 2);
        tilt.style.transform = 'perspective(1800px) translate3d(0,' + ((1 - e) * -24).toFixed(1) + 'px,0) rotateX(' + ((1 - e) * 26).toFixed(2) + 'deg) scale(' + (0.84 + 0.16 * e).toFixed(4) + ')';
        stage.style.setProperty('--hp', e.toFixed(3));
      }
    });
  })();

  /* ---- 8. Scroll-scrubbed image sequence  [data-seq="path/"] ---- */
  (function () {
    var sec = $('[data-seq]');
    if (!sec) return;
    var canvas = $('canvas', sec);
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return;
    var path = sec.getAttribute('data-seq') || 'assets/seq/';
    var count = parseInt(sec.getAttribute('data-seq-count'), 10) || 60;
    var ext = sec.getAttribute('data-seq-ext') || '.webp';
    var zoom = parseFloat(sec.getAttribute('data-seq-zoom')) || 1;
    var imgs = new Array(count), ready = new Array(count);
    var lines = $$('.seq-line', sec);
    var bar = $('.seq-progress i', sec);
    var ticks = $$('.seq-ticks span', sec);
    var cw = 0, ch = 0, drawn = -1, want = 0, top = 0, len = 1, secH = 0;
    var staticMode = RM;

    var src = function (i) { return path + ('00' + (i + 1)).slice(-3) + ext; };
    var nearest = function (i) {
      for (var k = 0; k < count; k++) {
        if (i - k >= 0 && ready[i - k]) return i - k;
        if (i + k < count && ready[i + k]) return i + k;
      }
      return -1;
    };
    var draw = function (i, force) {
      var j = ready[i] ? i : nearest(i);
      if (j < 0 || (j === drawn && !force) || !cw) return;
      var im = imgs[j];
      var iw = im.naturalWidth || 1920, ih = im.naturalHeight || 1080;
      // cover-fit, slightly over-scanned (data-seq-zoom) to keep frame-edge artefacts out of view
      var sc = Math.max(cw / iw, ch / ih) * zoom;
      var dw = iw * sc, dh = ih * sc;
      ctx.drawImage(im, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      drawn = j;
    };
    var size = function () {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(w.devicePixelRatio || 1, 2);
      var nw = Math.max(1, Math.round(r.width * dpr)), nh = Math.max(1, Math.round(r.height * dpr));
      if (nw !== cw || nh !== ch) {
        cw = canvas.width = nw; ch = canvas.height = nh;
        ctx.imageSmoothingQuality = 'high';
        draw(want, true);
      }
    };
    var load = function (i, done) {
      if (imgs[i]) { if (done) done(); return; }
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () {
        ready[i] = true;
        // redraw if this frame is closer to the wanted one than what is on screen
        if (drawn < 0 || Math.abs(i - want) < Math.abs(drawn - want)) draw(want, true);
        if (done) done();
      };
      im.onerror = function () { if (done) done(); };
      im.src = src(i);
      imgs[i] = im;
    };

    if (staticMode) {
      sec.classList.add('is-static');
      want = Math.round(count * 0.75);
      load(want);
      w.addEventListener('resize', function () { raf(size); }, { passive: true });
      raf(size);
      return;
    }

    sec.classList.add('is-live');

    // Progressive preload: coarse frames first (every 8th, 4th, 2nd), then the rest. Max 6 in flight.
    var order = [], seen = {};
    [8, 4, 2, 1].forEach(function (step) {
      for (var i = 0; i < count; i += step) if (!seen[i]) { seen[i] = 1; order.push(i); }
    });
    var started = false;
    var startLoading = function () {
      if (started) return;
      started = true;
      var q = order.slice(), inFlight = 0;
      var pump = function () {
        while (inFlight < 6 && q.length) {
          inFlight++;
          load(q.shift(), function () { inFlight--; pump(); });
        }
      };
      pump();
    };
    load(0);
    if (hasIO) {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { startLoading(); io.disconnect(); }
      }, { rootMargin: '150% 0px' });
      io.observe(sec);
    } else startLoading();

    var lastLine = [];
    var setLine = function (i, o, y) {
      var key = o.toFixed(3) + '|' + y.toFixed(1);
      if (lastLine[i] === key) return;
      lastLine[i] = key;
      lines[i].style.opacity = o.toFixed(3);
      lines[i].style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)';
      lines[i].classList.toggle('on', o > 0.5);
    };
    var lastTick = -1, lastBar = -1;

    addMod({
      measure: function (s, h) {
        top = absTop(sec);
        secH = sec.offsetHeight;
        len = Math.max(1, secH - h);
        size();
      },
      update: function (s, h) {
        if (s + h < top - 50 || s > top + secH + 50) return;
        var p = clamp((s - top) / len, 0, 1);
        want = Math.round(p * (count - 1));
        draw(want);
        // statements: N lines, the last one stays
        var N = lines.length, seg = 0.84 / N, fade = 0.055;
        for (var i = 0; i < N; i++) {
          var a = 0.04 + i * seg, b = a + seg, last = i === N - 1;
          var fin = i === 0 ? 1 : clamp((p - a) / fade, 0, 1);
          var fout = last ? 0 : clamp((p - (b - fade)) / fade, 0, 1);
          var o = Math.min(fin, 1 - fout);
          var y = (1 - fin) * 40 - fout * 40;
          setLine(i, o, y);
        }
        if (bar) {
          var bp = Math.round(p * 500) / 500;
          if (bp !== lastBar) { lastBar = bp; bar.style.transform = 'scaleX(' + bp + ')'; }
        }
        if (ticks.length) {
          var t = clamp(Math.floor((p - 0.04) / seg), 0, ticks.length - 1);
          if (t !== lastTick) { lastTick = t; ticks.forEach(function (el, k) { el.classList.toggle('on', k <= t); }); }
        }
      }
    });
  })();

  /* ---- 9. Scroll-linked text highlight  [data-highlight] ---- */
  (function () {
    var els = $$('[data-highlight]');
    if (!els.length || RM) return;
    els.forEach(function (el) {
      var words = [];
      var walk = function (node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (n) {
          if (n.nodeType === 3) {
            var frag = d.createDocumentFragment();
            n.nodeValue.split(/(\s+)/).forEach(function (p) {
              if (!p) return;
              if (/^\s+$/.test(p)) { frag.appendChild(d.createTextNode(' ')); return; }
              var s = d.createElement('span'); s.className = 'hl-w'; s.textContent = p;
              words.push(s); frag.appendChild(s);
            });
            node.replaceChild(frag, n);
          } else if (n.nodeType === 1) walk(n);
        });
      };
      walk(el);
      el.classList.add('is-live');
      var top = 0, h = 1, lastN = -1;
      addMod({
        measure: function (s) { top = absTop(el); h = el.offsetHeight; },
        update: function (s, vh2) {
          var p = clamp((s + vh2 * 0.82 - top) / (h + vh2 * 0.32), 0, 1);
          var n = Math.round(p * words.length);
          if (n === lastN) return;
          var lo = Math.min(n, lastN < 0 ? 0 : lastN), hi = Math.max(n, lastN < 0 ? words.length : lastN);
          for (var i = lo; i < hi; i++) words[i].classList.toggle('on', i < n);
          lastN = n;
        }
      });
    });
  })();

  /* ---- 10. Sticky feature storytelling  [data-story] ----
     Desktop (>=1024px): each step's .feature-visual is moved into a pinned stage slot; the active
     step drives the crossfade, progress rail and counter. Below 1024px the visuals go back in place. */
  (function () {
    var story = $('[data-story]');
    if (!story) return;
    var steps = $$('[data-step]', story);
    var stage = $('.story-stage', story);
    var slots = $$('.story-slot', story);
    if (!steps.length || !stage || slots.length < steps.length) return;
    var fill = $('.story-rail i', story);
    var countEl = $('.story-count b', story);
    var labelEl = $('.story-label', story);
    var mq = w.matchMedia ? w.matchMedia('(min-width: 1024px)') : null;
    var on = false, active = -1, tops = [], lastFill = -1, endY = 1;

    var visuals = steps.map(function (s) { return $('.feature-visual', s); });
    var labels = steps.map(function (s) {
      var t = $('.tagline', s);
      if (!t) return '';
      var c = t.cloneNode(true); var b = $('b', c); if (b) b.parentNode.removeChild(b);
      return c.textContent.trim();
    });

    var setActive = function (i) {
      if (i === active) return;
      active = i;
      steps.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      slots.forEach(function (s, k) {
        s.classList.toggle('is-active', k === i);
        s.classList.toggle('is-past', k < i);
        if (k === i) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
      });
      if (countEl) countEl.textContent = ('0' + (i + 1)).slice(-2);
      if (labelEl) labelEl.textContent = labels[i] || '';
    };
    var enable = function () {
      if (on) return;
      on = true;
      visuals.forEach(function (v, i) { if (v) slots[i].appendChild(v); });
      story.classList.add('is-story');
      active = -1; setActive(0);
      remeasure();
    };
    var disable = function () {
      if (!on) return;
      on = false;
      visuals.forEach(function (v, i) { if (v) steps[i].appendChild(v); });
      story.classList.remove('is-story');
      steps.forEach(function (s) { s.classList.remove('is-active'); });
      remeasure();
    };
    var sync = function () { if (!mq || mq.matches) enable(); else disable(); };
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', sync); else if (mq.addListener) mq.addListener(sync);
    }
    sync();

    addMod({
      measure: function (s) {
        if (!on) return;
        tops = steps.map(absTop);
        var lastStep = steps[steps.length - 1];
        endY = tops[tops.length - 1] + lastStep.offsetHeight;
      },
      update: function (s, h) {
        if (!on) return;
        var probe = s + h * 0.5, i = 0;
        for (var k = 0; k < tops.length; k++) if (tops[k] <= probe) i = k;
        setActive(i);
        if (fill) {
          var p = clamp((probe - tops[0]) / Math.max(1, endY - tops[0]), 0, 1);
          p = Math.round(p * 500) / 500;
          if (p !== lastFill) { lastFill = p; fill.style.transform = 'scaleY(' + p + ')'; }
        }
      }
    });
  })();

  /* ---- 11. Self-drawing SVG path  [data-draw] (path needs pathLength="1") ---- */
  (function () {
    $$('[data-draw]').forEach(function (wrap) {
      var paths = $$('[data-draw-path]', wrap);
      var lit = $$('[data-draw-step]', wrap);
      if (!paths.length) return;
      if (RM) { paths.forEach(function (p) { p.style.strokeDashoffset = '0'; }); lit.forEach(function (s) { s.classList.add('lit'); }); return; }
      wrap.classList.add('is-live');
      var top = 0, h = 1, last = -1;
      addMod({
        measure: function () { top = absTop(wrap); h = wrap.offsetHeight; },
        update: function (s, vh2) {
          var p = clamp((s + vh2 * 0.8 - top) / (h * 0.6 + vh2 * 0.25), 0, 1);
          p = Math.round(p * 1000) / 1000;
          if (p === last) return;
          last = p;
          paths.forEach(function (el) { el.style.strokeDashoffset = (1 - p).toFixed(3); });
          lit.forEach(function (el, i) {
            var at = parseFloat(el.getAttribute('data-draw-step'));
            if (isNaN(at)) at = lit.length > 1 ? i / (lit.length - 1) : 0;
            el.classList.toggle('lit', p >= at * 0.98);
          });
        }
      });
    });
  })();

  request();
})();
