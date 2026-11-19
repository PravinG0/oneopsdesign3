/* OneOps — shared site script (vanilla JS, no dependencies). Loaded with defer. */
(function () {
  'use strict';

  var doc = document;
  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var hasIO = 'IntersectionObserver' in window;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  /* ---------- Shared visibility helper: fires fn(el) once ---------- */
  function onVisible(el, fn, threshold) {
    if (!el) return;
    if (!hasIO) { fn(el); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.unobserve(e.target); fn(e.target); }
      });
    }, { threshold: threshold == null ? 0.12 : threshold });
    io.observe(el);
  }

  /* ---------- Year ---------- */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Nav ---------- */
  var nav = $('#nav');
  if (nav) {
    var toggle = $('.nav-toggle', nav);
    var setNav = function (open) {
      nav.classList.toggle('open', open);
      if (toggle) {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      }
    };
    if (toggle) toggle.addEventListener('click', function () { setNav(!nav.classList.contains('open')); });
    $$('.nav-links a, .nav-cta a, .nav-cta button', nav).forEach(function (a) {
      a.addEventListener('click', function () { setNav(false); });
    });
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Reveal ---------- */
  $$('.reveal').forEach(function (el) {
    if (reduceMotion || !hasIO) el.classList.add('in');
    else onVisible(el, function (t) { t.classList.add('in'); });
  });

  /* ---------- Meters / bars ---------- */
  function setFill(i) {
    if (i.hasAttribute('data-w')) i.style.width = i.getAttribute('data-w') + '%';
    if (i.hasAttribute('data-h')) i.style.height = i.getAttribute('data-h') + '%';
  }
  var FILL_SEL = '.meter i[data-w], .hbars .track i[data-w], .bars .bar i[data-h]';
  $$(FILL_SEL).forEach(function (i) { onVisible(i, setFill, 0); });

  // Reset fills inside a container to 0 and animate back to target next frame
  function replayFills(ctx) {
    var items = $$(FILL_SEL, ctx);
    if (!items.length) return;
    items.forEach(function (i) {
      if (i.hasAttribute('data-w')) i.style.width = '0';
      if (i.hasAttribute('data-h')) i.style.height = '0';
    });
    void ctx.offsetWidth; // force reflow
    requestAnimationFrame(function () { items.forEach(setFill); });
  }

  /* ---------- Count-up ---------- */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    var dec = parseInt(el.getAttribute('data-decimals'), 10) || 0;
    var fmt = function (v) {
      return prefix + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix;
    };
    if (reduceMotion || !window.requestAnimationFrame) { el.textContent = fmt(target); return; }
    var dur = 1400, start = null;
    var step = function (ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  $$('[data-count]').forEach(function (el) { onVisible(el, countUp, 0.3); });

  /* ---------- Demo modal ---------- */
  var modal = $('#demo-modal');
  if (modal) {
    var dialog = $('.modal-dialog', modal);
    var demoForm = $('#demo-form');
    var opener = null;
    var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    var focusables = function () {
      return $$(FOCUSABLE, dialog).filter(function (el) { return el.offsetParent !== null; });
    };
    var openModal = function (trigger) {
      opener = trigger || doc.activeElement;
      if (demoForm) {
        demoForm.reset();
        $$('.field.invalid', demoForm).forEach(function (f) { f.classList.remove('invalid'); });
        var mf = demoForm.closest('.modal-form');
        if (mf) mf.classList.remove('done');
      }
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      doc.body.style.overflow = 'hidden';
      var first = $('input', modal) || focusables()[0];
      if (first) setTimeout(function () { first.focus(); }, 30);
    };
    var closeModal = function () {
      if (!modal.classList.contains('open')) return;
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      doc.body.style.overflow = '';
      if (opener && typeof opener.focus === 'function') opener.focus();
      opener = null;
    };

    doc.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-open-demo]') : null;
      if (t) { e.preventDefault(); openModal(t); return; }
      var c = e.target.closest ? e.target.closest('[data-close-modal]') : null;
      if (c && modal.contains(c)) { e.preventDefault(); closeModal(); }
    });
    doc.addEventListener('keydown', function (e) {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape' || e.key === 'Esc') { closeModal(); return; }
      if (e.key === 'Tab' && dialog) {
        var f = focusables();
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (doc.activeElement === first || !dialog.contains(doc.activeElement))) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (doc.activeElement === last || !dialog.contains(doc.activeElement))) {
          e.preventDefault(); first.focus();
        }
      }
    });
  }

  /* ---------- Demo form validation ---------- */
  var demoFormEl = $('#demo-form');
  if (demoFormEl) {
    var fieldValid = function (input) {
      var v = input.value.trim();
      if (input.required && !v) return false;
      if (input.type === 'email' && v && !EMAIL_RE.test(v)) return false;
      return true;
    };
    demoFormEl.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstBad = null;
      $$('.field input, .field select, .field textarea', demoFormEl).forEach(function (input) {
        var field = input.closest('.field');
        var ok = fieldValid(input);
        if (field) field.classList.toggle('invalid', !ok);
        if (!ok && !firstBad) firstBad = input;
      });
      if (firstBad) { firstBad.focus(); return; }
      var mf = demoFormEl.closest('.modal-form');
      if (mf) mf.classList.add('done');
    });
    demoFormEl.addEventListener('input', function (e) {
      var field = e.target.closest ? e.target.closest('.field') : null;
      if (field) field.classList.remove('invalid');
    });
  }

  /* ---------- Newsletter ---------- */
  $$('form.nl').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('input[type=email]', form) || $('input', form);
      var msg = form.nextElementSibling;
      var ok = input && EMAIL_RE.test(input.value.trim());
      if (msg && msg.classList.contains('msg')) {
        msg.textContent = ok ? 'Thanks — you’re subscribed.' : 'Please enter a valid email.';
        msg.style.color = ok ? '' : 'var(--red)';
      }
      if (ok) form.reset();
      else if (input) input.focus();
    });
  });

  /* ---------- App mockup tabs ---------- */
  $$('.app-frame').forEach(function (frame) {
    var tabs = $$('.app-tab[data-view]', frame);
    var views = $$('.app-view[data-view]', frame);
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var key = tab.getAttribute('data-view');
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        views.forEach(function (v) {
          var on = v.getAttribute('data-view') === key;
          v.classList.toggle('active', on);
          if (on) replayFills(v);
        });
      });
    });
  });

  /* ---------- Feature tabs (auto-advance) ---------- */
  $$('[data-tabs]').forEach(function (wrap) {
    var btns = $$('.tab-btn[data-tab]', wrap);
    var panels = $$('.tab-panel[data-tab]', wrap);
    if (!btns.length) return;
    var timer = null, stopped = false, inView = false;

    var activate = function (key) {
      btns.forEach(function (b) {
        var on = b.getAttribute('data-tab') === key;
        b.classList.remove('active');
        if (on) { void b.offsetWidth; b.classList.add('active'); } // restart .prog i animation
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      panels.forEach(function (p) {
        var on = p.getAttribute('data-tab') === key;
        p.classList.toggle('active', on);
        if (on) replayFills(p);
      });
    };
    var current = function () {
      for (var i = 0; i < btns.length; i++) if (btns[i].classList.contains('active')) return i;
      return 0;
    };
    var stopTimer = function () { if (timer) { clearInterval(timer); timer = null; } };
    var startTimer = function () {
      if (stopped || timer || !inView) return;
      timer = setInterval(function () {
        var next = btns[(current() + 1) % btns.length];
        activate(next.getAttribute('data-tab'));
      }, 7000);
    };

    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        stopped = true; stopTimer();
        activate(b.getAttribute('data-tab'));
      });
    });

    if (hasIO) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          inView = e.isIntersecting;
          if (inView) {
            if (!stopped && !timer) activate(btns[current()].getAttribute('data-tab')); // restart progress bar
            startTimer();
          } else stopTimer();
        });
      }, { threshold: 0.25 }).observe(wrap);
    } else { inView = true; startTimer(); }
  });

  /* ---------- Usage dimensions demo ---------- */
  var DIM_DATA = {
    team: [['Development', 8240], ['Marketing', 4310], ['Sales', 2980], ['Operations', 1640]],
    user: [['Priya S.', 1920], ['Daniel K.', 1475], ['Amara O.', 1130], ['Leo M.', 760]],
    application: [['Support bot', 5120], ['Code assistant', 4680], ['Content studio', 2390], ['Sales copilot', 1210]],
    key: [['sk-ant-…4f2a', 3860], ['sk-proj-…9c71', 3140], ['sk-ant-…b03e', 1980], ['sk-goog-…7d18', 940]],
    provider: [['OpenAI', 7420], ['Anthropic', 6180], ['Google', 2350], ['Bedrock', 1270]],
    model: [['GPT-4o', 5960], ['Claude Sonnet 4', 5210], ['Gemini 1.5 Pro', 1880], ['Claude Haiku', 920]],
    project: [['Atlas migration', 4470], ['Helpdesk 2.0', 3320], ['Q4 campaign', 2160], ['Data pipeline', 1390]]
  };
  var dimOut = $('#dim-out');
  var dimBtns = $$('.dims button[data-dim]');
  if (dimOut && dimBtns.length) {
    var renderDim = function (key) {
      var rows = DIM_DATA[key];
      if (!rows) return;
      var max = rows.reduce(function (m, r) { return Math.max(m, r[1]); }, 0) || 1;
      var ul = doc.createElement('ul');
      ul.className = 'hbars';
      rows.forEach(function (r) {
        var li = doc.createElement('li');
        var span = doc.createElement('span'); span.textContent = r[0];
        var track = doc.createElement('div'); track.className = 'track';
        var i = doc.createElement('i'); i.setAttribute('data-w', Math.round(r[1] / max * 100));
        var b = doc.createElement('b'); b.textContent = fmtMoney(r[1]);
        track.appendChild(i); li.appendChild(span); li.appendChild(track); li.appendChild(b);
        ul.appendChild(li);
      });
      dimOut.innerHTML = '';
      dimOut.appendChild(ul);
      replayFills(dimOut);
    };
    dimBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        dimBtns.forEach(function (b) {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        renderDim(btn.getAttribute('data-dim'));
      });
    });
    var initial = $('.dims button.active[data-dim]') || dimBtns[0];
    if (!$('.hbars', dimOut)) {
      initial.classList.add('active');
      onVisible(dimOut, function () { renderDim(initial.getAttribute('data-dim')); }, 0);
    }
  }

  /* ---------- ROI calculator ---------- */
  var roi = $('#roi');
  if (roi) {
    var RATES = {
      light: { ctx: 0.06, right: 0.05, idle: 0.03 },
      balanced: { ctx: 0.08, right: 0.07, idle: 0.05 },
      heavy: { ctx: 0.10, right: 0.09, idle: 0.06 }
    };
    var usersIn = $('#roi-users', roi), spendIn = $('#roi-spend', roi);
    var segBtns = $$('.seg button[data-mix]', roi);
    var mix = 'balanced';
    var activeSeg = $('.seg button.active[data-mix]', roi);
    if (activeSeg && RATES[activeSeg.getAttribute('data-mix')]) mix = activeSeg.getAttribute('data-mix');

    var setText = function (id, text) { var el = $('#' + id); if (el) el.textContent = text; };
    var setFillVar = function (input) {
      if (!input) return;
      var min = parseFloat(input.min) || 0, max = parseFloat(input.max) || 100;
      var pct = ((parseFloat(input.value) - min) / (max - min)) * 100;
      input.style.setProperty('--p', Math.max(0, Math.min(100, pct)) + '%');
    };
    var calc = function () {
      var users = usersIn ? parseFloat(usersIn.value) || 0 : 150;
      var spend = spendIn ? parseFloat(spendIn.value) || 0 : 60;
      var r = RATES[mix];
      var monthly = users * spend;
      var b1 = monthly * r.ctx, b2 = monthly * r.right, b3 = monthly * r.idle;
      var save = b1 + b2 + b3;
      setText('roi-users-out', users.toLocaleString('en-US') + ' people');
      setText('roi-spend-out', '$' + spend.toLocaleString('en-US') + ' / person');
      setText('roi-monthly', fmtMoney(monthly));
      setText('roi-b1', fmtMoney(b1));
      setText('roi-b2', fmtMoney(b2));
      setText('roi-b3', fmtMoney(b3));
      setText('roi-save', fmtMoney(save));
      setText('roi-annual', fmtMoney(save * 12));
      setFillVar(usersIn); setFillVar(spendIn);
    };
    [usersIn, spendIn].forEach(function (inp) { if (inp) inp.addEventListener('input', calc); });
    segBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var m = btn.getAttribute('data-mix');
        if (!RATES[m]) return;
        mix = m;
        segBtns.forEach(function (b) {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        calc();
      });
    });
    calc();
  }

  /* ---------- DLP redaction demo ---------- */
  var dlp = $('#dlp-demo');
  if (dlp) {
    var piis = $$('.pii', dlp);
    var status = $('#dlp-status');
    var redacted = false;
    var showState = function (red) {
      piis.forEach(function (p) {
        var raw = p.getAttribute('data-raw'), tok = p.getAttribute('data-token');
        p.textContent = red ? (tok || p.textContent) : (raw || p.textContent);
        p.classList.toggle('red', red);
        p.classList.toggle('raw', !red);
      });
      if (status) status.textContent = red ? '4 entities redacted' : 'Scanning…';
    };
    showState(false);
    if (!reduceMotion && piis.length) {
      onVisible(dlp, function () {
        setInterval(function () { redacted = !redacted; showState(redacted); }, 2600);
      }, 0.2);
    }
  }

  /* ---------- Sophia chat ---------- */
  var chat = $('#sophia-chat');
  if (chat) {
    onVisible(chat, function () {
      var typing = $('.typing', chat);
      if (!typing) return;
      var msg = typing.closest('.msg') || typing;
      setTimeout(function () {
        msg.innerHTML = 'Top driver: <b>3 members</b> running long-context drafts on Claude Sonnet 4. Want me to set a soft cap at 90%?';
      }, 1600);
    }, 0.3);
  }

  /* ---------- FAQ accordion ---------- */
  $$('.faq-item').forEach(function (item) {
    var q = $('.faq-q', item);
    if (!q) return;
    q.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');
    q.addEventListener('click', function () {
      var willOpen = !item.classList.contains('open');
      if (item.parentNode) {
        Array.prototype.forEach.call(item.parentNode.children, function (sib) {
          if (sib !== item && sib.classList.contains('faq-item')) {
            sib.classList.remove('open');
            var sq = $('.faq-q', sib);
            if (sq) sq.setAttribute('aria-expanded', 'false');
          }
        });
      }
      item.classList.toggle('open', willOpen);
      q.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
  });

  /* ---------- Blog search ---------- */
  var search = $('#blog-search');
  if (search) {
    var cards = $$('.post-card[data-title]');
    var noRes = $('.no-results');
    var featured = $('.featured-post');
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      var shown = 0;
      cards.forEach(function (c) {
        var match = !q || (c.getAttribute('data-title') || '').toLowerCase().indexOf(q) !== -1;
        c.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      if (featured) featured.style.display = q ? 'none' : '';
      if (noRes) noRes.style.display = (q && shown === 0) ? 'block' : 'none';
    });
  }

  /* ---------- Article: TOC scroll-spy + read progress ---------- */
  var tocLinks = $$('.toc a[href^="#"]');
  var heads = $$('.prose h2[id]');
  var prose = $('.prose');
  var progress = $('.read-progress');
  if ((tocLinks.length && heads.length) || (progress && prose)) {
    var ticking = false;
    var update = function () {
      ticking = false;
      if (tocLinks.length && heads.length) {
        var currentId = null;
        heads.forEach(function (h) { if (h.getBoundingClientRect().top - 120 <= 0) currentId = h.id; });
        tocLinks.forEach(function (a) {
          a.classList.toggle('active', !!currentId && a.getAttribute('href') === '#' + currentId);
        });
      }
      if (progress && prose) {
        var rect = prose.getBoundingClientRect();
        var total = prose.offsetHeight - window.innerHeight;
        var pct = total > 0 ? (-rect.top / total) * 100 : (rect.top < 0 ? 100 : 0);
        progress.style.width = Math.max(0, Math.min(100, pct)) + '%';
      }
    };
    var req = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    update();
  }

  /* ---------- Copy link ---------- */
  $$('[data-copy-link]').forEach(function (btn) {
    var original = null, resetT = null;
    var flash = function () {
      if (original === null) original = btn.innerHTML;
      btn.textContent = 'Copied!';
      clearTimeout(resetT);
      resetT = setTimeout(function () { btn.innerHTML = original; original = null; }, 1500);
    };
    var fallback = function (text) {
      var ta = doc.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand('copy'); } catch (err) { /* ignore */ }
      doc.body.removeChild(ta);
      flash();
    };
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var url = window.location.href;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(flash, function () { fallback(url); });
      } else fallback(url);
    });
  });

  /* ---------- Theme toggle (Ember Night / Ember Dawn) ---------- */
  function initTheme() {
    var metaScheme = $('meta[name="color-scheme"]');
    var metaThemeColor = $('meta[name="theme-color"]');
    var toggles = $$('[data-theme-toggle]');

    function getSystemTheme() {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }

    function getStoredTheme() {
      try {
        return localStorage.getItem('color-scheme') || localStorage.getItem('theme');
      } catch (e) {
        return null;
      }
    }

    function applyTheme(target, isExplicit) {
      var system = getSystemTheme();

      if (isExplicit) {
        if (target === system) {
          try {
            localStorage.removeItem('color-scheme');
            localStorage.removeItem('theme');
          } catch (e) {}
          if (metaScheme) metaScheme.content = 'light dark';
          if (system === 'light') {
            doc.documentElement.setAttribute('data-theme', 'light');
          } else {
            doc.documentElement.removeAttribute('data-theme');
          }
        } else {
          try {
            localStorage.setItem('color-scheme', target);
            localStorage.setItem('theme', target);
          } catch (e) {}
          if (metaScheme) metaScheme.content = target;
          doc.documentElement.setAttribute('data-theme', target);
        }
      } else {
        var stored = getStoredTheme();
        if (stored === 'light' || stored === 'dark') {
          doc.documentElement.setAttribute('data-theme', stored);
          if (metaScheme) metaScheme.content = stored;
        } else {
          if (metaScheme) metaScheme.content = 'light dark';
          if (system === 'light') {
            doc.documentElement.setAttribute('data-theme', 'light');
          } else {
            doc.documentElement.removeAttribute('data-theme');
          }
        }
      }

      var active = doc.documentElement.getAttribute('data-theme') || system;
      if (metaThemeColor) {
        metaThemeColor.content = active === 'light' ? '#FDFBFC' : '#0B0809';
      }

      toggles.forEach(function (btn) {
        var nextTheme = active === 'light' ? 'dark' : 'light';
        btn.setAttribute('aria-label', 'Switch to ' + nextTheme + ' theme');
        btn.setAttribute('title', 'Switch to ' + nextTheme + ' theme');
        var label = $('.theme-toggle-text', btn);
        if (label) label.textContent = 'Switch to ' + nextTheme + ' theme';
      });
    }

    toggles.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var current = doc.documentElement.getAttribute('data-theme') || getSystemTheme();
        var target = current === 'dark' ? 'light' : 'dark';
        applyTheme(target, true);
      });
    });

    if (window.matchMedia) {
      var mql = window.matchMedia('(prefers-color-scheme: dark)');
      var handler = function () {
        if (!getStoredTheme()) {
          applyTheme(null, false);
        }
      };
      if (mql.addEventListener) mql.addEventListener('change', handler);
      else if (mql.addListener) mql.addListener(handler);
    }

    window.addEventListener('storage', function (e) {
      if (e.key === 'color-scheme' || e.key === 'theme') {
        applyTheme(null, false);
      }
    });

    applyTheme(null, false);
  }
  initTheme();
})();
