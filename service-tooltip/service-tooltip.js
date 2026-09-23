/* ============================================================
   gsocd-shared / service-tooltip  (v1.50.0, 23/09/2026)
   Descripcion de un servicio (la "Sales Description" de QuickBooks,
   que la app guarda en ServicesCatalog.Description) SIN campo visible:
   aparece en una burbuja al pasar el mouse (350 ms) o al dejar el dedo
   presionado en celular (450 ms). Aprobado con mini interactivo por el
   dueño ("por temas de espacio y estetica, nomas en un tooltip").

   Uso:
     GSServiceTooltip.register(catalog)   // [{ sku, serviceName, description }]
     GSServiceTooltip.nameHtml(sku, text) // <span data-svc-desc> si hay descripcion
   GSServicePicker (v1.50.0+) ya registra su catalogo y marca sus
   nombres solo; cualquier otra lista de servicios usa nameHtml().
   El subrayado punteado tenue (.gs-svc-has-desc) es la unica pista
   visible de que hay mas info.
============================================================ */
(function () {
  'use strict';
  if (window.GSServiceTooltip) return;

  var bySku = {};
  var STYLE_ID = 'gs-svc-tip-style';
  var tipEl = null, tipTimer = null, tipFor = null, pressTimer = null, pressMoved = false, suppressClickUntil = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function styleTag() {
    if (document.getElementById(STYLE_ID)) return;
    var tag = document.createElement('style');
    tag.id = STYLE_ID;
    tag.textContent =
      '.gs-svc-has-desc{cursor:help;text-decoration:underline dotted rgba(140,111,42,.45);text-underline-offset:3px;-webkit-touch-callout:none}' +
      '.gs-svc-tip{position:fixed;z-index:10050;max-width:300px;background:#171310;color:#fff;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.5;' +
      'padding:10px 12px;border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .12s ease,transform .12s ease}' +
      '.gs-svc-tip.on{opacity:1;transform:translateY(0)}' +
      '.gs-svc-tip b{display:block;color:#E8CE85;font-weight:600;margin-bottom:3px}' +
      '.gs-svc-tip i{font-style:normal;color:#bdb3a0}' +
      '.gs-svc-tip:after{content:"";position:absolute;left:var(--ax,50%);bottom:-6px;width:12px;height:12px;background:#171310;transform:translateX(-50%) rotate(45deg)}' +
      '.gs-svc-tip.below:after{bottom:auto;top:-6px}' +
      '@media (prefers-reduced-motion:reduce){.gs-svc-tip{transition:none}}';
    document.head.appendChild(tag);
  }

  function register(items) {
    (items || []).forEach(function (s) {
      if (!s || !s.sku) return;
      var d = String(s.description || '').trim();
      if (!d) return;
      bySku[String(s.sku).trim()] = { name: s.serviceName || '', description: d };
    });
  }
  function has(sku) { return !!bySku[String(sku || '').trim()]; }
  /* Nombre de servicio con su descripcion enganchada (si la hay). */
  function nameHtml(sku, textHtml) {
    var k = String(sku || '').trim();
    if (!bySku[k]) return textHtml;
    return '<span class="gs-svc-has-desc" data-svc-desc="' + esc(k) + '">' + textHtml + '</span>';
  }
  function splitTag(d) {
    var m = String(d || '').match(/^([\s\S]*?)\s*\((Regular|Per Request|Extra Charge|Package|Service)\)\s*$/);
    return m ? { text: m[1], tag: m[2] } : { text: String(d || ''), tag: '' };
  }

  function ensureEl() {
    if (tipEl) return tipEl;
    styleTag();
    tipEl = document.createElement('div');
    tipEl.className = 'gs-svc-tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function show(el) {
    var s = bySku[el.getAttribute('data-svc-desc')];
    if (!s) return;
    var t = ensureEl(), parts = splitTag(s.description);
    t.innerHTML = '<b>' + esc(s.name) + '</b>' + esc(parts.text) + (parts.tag ? '<br><i>' + esc(parts.tag) + '</i>' : '');
    t.hidden = false; t.classList.remove('on'); t.classList.remove('below');
    var r = el.getBoundingClientRect(), tw = t.offsetWidth, th = t.offsetHeight, m = 8;
    var left = Math.max(m, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - m));
    var top = r.top - th - 10, below = false;
    if (top < m) { top = r.bottom + 10; below = true; }
    t.style.left = left + 'px'; t.style.top = top + 'px';
    t.style.setProperty('--ax', Math.max(12, Math.min(tw - 12, r.left + r.width / 2 - left)) + 'px');
    if (below) t.classList.add('below');
    (window.requestAnimationFrame || setTimeout)(function () { t.classList.add('on'); });
    tipFor = el;
  }
  function hide() { clearTimeout(tipTimer); if (tipEl) { tipEl.classList.remove('on'); tipEl.hidden = true; } tipFor = null; }
  function target(e) { return e.target && e.target.closest ? e.target.closest('[data-svc-desc]') : null; }

  function init() {
    styleTag();
    document.addEventListener('mouseover', function (e) {
      var el = target(e); if (!el || el === tipFor) return;
      clearTimeout(tipTimer); tipTimer = setTimeout(function () { show(el); }, 350);
    });
    document.addEventListener('mouseout', function (e) {
      var el = target(e); if (el && !el.contains(e.relatedTarget)) hide();
    });
    document.addEventListener('touchstart', function (e) {
      var el = target(e); hide(); if (!el) return;
      pressMoved = false; clearTimeout(pressTimer);
      pressTimer = setTimeout(function () {
        if (pressMoved) return;
        show(el);
        /* El dedo presionado sobre un boton (chip del picker) no debe
           ademas seleccionarlo al soltar. */
        suppressClickUntil = Date.now() + 800;
      }, 450);
    }, { passive: true });
    document.addEventListener('touchmove', function () { pressMoved = true; clearTimeout(pressTimer); }, { passive: true });
    document.addEventListener('touchend', function () { clearTimeout(pressTimer); }, { passive: true });
    document.addEventListener('click', function (e) {
      if (Date.now() < suppressClickUntil && target(e)) { e.preventDefault(); e.stopPropagation(); suppressClickUntil = 0; }
    }, true);
    document.addEventListener('contextmenu', function (e) { if (target(e)) e.preventDefault(); });
    window.addEventListener('scroll', hide, { passive: true, capture: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.GSServiceTooltip = { register: register, has: has, nameHtml: nameHtml, hide: hide };
})();
