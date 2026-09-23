/* ============================================================
   gsocd-shared / multi-select  (v1.53.0, 23/09/2026)
   Dropdown de varias opciones con estilo de la app (pedido del dueño:
   "un drop down menu, pero bonito", para las Areas de cada servicio en
   Developer; sirve para cualquier lista corta de opciones).

   GSMultiSelect.mount(container, {
     options: ['A', 'B', ...], selected: ['A'], placeholder: 'Choose…',
     onChange: function (values) { ... }   // al cerrar, solo si cambio
   }) -> { get(), set(values), open(), close(), destroy() }

   Boton con las opciones elegidas como chips doradas; panel con
   casillas propias, "Clear" y "Done". Cierra con Done, clic afuera o
   Escape; flechas para moverse, Espacio/Enter para marcar. Abre hacia
   arriba si no cabe abajo.
============================================================ */
(function () {
  'use strict';
  if (window.GSMultiSelect) return;
  var STYLE_ID = 'gs-ms-style', openInst = null, seq = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function styleTag() {
    if (document.getElementById(STYLE_ID)) return;
    var t = document.createElement('style');
    t.id = STYLE_ID;
    t.textContent =
      '.gs-ms{position:relative;min-width:180px;font-family:inherit}' +
      '.gs-ms-btn{width:100%;display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:36px;padding:6px 30px 6px 10px;border:1px solid var(--border,#E0D9CC);background:var(--white,#fff);' +
      'border-radius:4px;cursor:pointer;text-align:left;font:inherit;font-size:12px;color:var(--black,#111);position:relative;transition:border-color .15s ease,box-shadow .15s ease}' +
      '.gs-ms-btn:hover{border-color:#D8CBA6}' +
      '.gs-ms-btn:focus-visible,.gs-ms.open .gs-ms-btn{outline:none;border-color:var(--gold,#C9A84C);box-shadow:0 0 0 3px rgba(201,168,76,.18)}' +
      '.gs-ms-btn:after{content:"";position:absolute;right:11px;top:50%;width:7px;height:7px;border-right:1.5px solid var(--gray,#6B6B6B);border-bottom:1.5px solid var(--gray,#6B6B6B);transform:translateY(-70%) rotate(45deg);transition:transform .15s ease}' +
      '.gs-ms.open .gs-ms-btn:after{transform:translateY(-30%) rotate(-135deg)}' +
      '.gs-ms-ph{color:var(--gray,#6B6B6B)}' +
      '.gs-ms-chip{display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;background:rgba(201,168,76,.16);color:var(--gold-dk,#8C6F2A);font-size:11px;font-weight:600;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}' +
      '.gs-ms-more{font-size:11px;color:var(--gray,#6B6B6B);font-weight:600}' +
      '.gs-ms-panel{position:fixed;z-index:10040;width:max-content;max-width:320px;background:var(--white,#fff);border:1px solid var(--border,#E0D9CC);' +
      'border-radius:6px;box-shadow:0 10px 28px rgba(0,0,0,.14);overflow:hidden;opacity:0;transform:translateY(-4px);transition:opacity .12s ease,transform .12s ease}' +
      '.gs-ms.up .gs-ms-panel{transform:translateY(4px)}' +
      '.gs-ms.open .gs-ms-panel{opacity:1;transform:translateY(0)}' +
      '.gs-ms-list{max-height:260px;overflow-y:auto;padding:6px 0}' +
      '.gs-ms-opt{display:flex;align-items:center;gap:10px;padding:8px 14px;font-size:13px;cursor:pointer;outline:none}' +
      '.gs-ms-opt:hover,.gs-ms-opt:focus{background:#FBF7EC}' +
      '.gs-ms-box{flex-shrink:0;width:16px;height:16px;border:1.5px solid #CFC6B2;border-radius:3px;display:flex;align-items:center;justify-content:center;background:var(--white,#fff);transition:background .12s ease,border-color .12s ease}' +
      '.gs-ms-opt[aria-selected="true"] .gs-ms-box{background:var(--gold,#C9A84C);border-color:var(--gold,#C9A84C)}' +
      '.gs-ms-opt[aria-selected="true"] .gs-ms-box:after{content:"";width:4px;height:8px;border-right:2px solid #171310;border-bottom:2px solid #171310;transform:translateY(-1px) rotate(45deg)}' +
      '.gs-ms-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-top:1px solid var(--border,#E0D9CC);background:#FCFBF8}' +
      '.gs-ms-clear{border:none;background:none;font:inherit;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--gray,#6B6B6B);cursor:pointer;padding:4px 6px}' +
      '.gs-ms-done{border:1px solid var(--gold,#C9A84C);background:var(--gold,#C9A84C);color:#171310;font:inherit;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:6px 14px;border-radius:3px;cursor:pointer}' +
      '@media (prefers-reduced-motion:reduce){.gs-ms-panel,.gs-ms-btn:after{transition:none}}';
    document.head.appendChild(t);
  }

  function mount(container, opts) {
    styleTag();
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) return null;
    var id = 'gs-ms-' + (++seq);
    var options = (opts && opts.options) || [];
    var sel = ((opts && opts.selected) || []).filter(function (v) { return options.indexOf(v) !== -1; });
    var before = null;
    var root = document.createElement('div');
    root.className = 'gs-ms';
    root.innerHTML = '<button type="button" class="gs-ms-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + id + '"></button>' +
      '<div class="gs-ms-panel" hidden><div class="gs-ms-list" role="listbox" aria-multiselectable="true" id="' + id + '"></div>' +
      '<div class="gs-ms-foot"><button type="button" class="gs-ms-clear">Clear</button><button type="button" class="gs-ms-done">Done</button></div></div>';
    container.innerHTML = '';
    container.appendChild(root);
    var btn = root.querySelector('.gs-ms-btn'), panel = root.querySelector('.gs-ms-panel'), list = root.querySelector('.gs-ms-list');

    function drawBtn() {
      if (!sel.length) { btn.innerHTML = '<span class="gs-ms-ph">' + esc((opts && opts.placeholder) || 'Choose\u2026') + '</span>'; return; }
      var shown = sel.slice(0, 2).map(function (v) { return '<span class="gs-ms-chip">' + esc(v) + '</span>'; }).join('');
      btn.innerHTML = shown + (sel.length > 2 ? '<span class="gs-ms-more">+' + (sel.length - 2) + '</span>' : '');
      btn.setAttribute('aria-label', sel.join(', '));
    }
    function drawList() {
      list.innerHTML = options.map(function (v, i) {
        return '<div class="gs-ms-opt" role="option" tabindex="-1" data-i="' + i + '" aria-selected="' + (sel.indexOf(v) !== -1) + '"><span class="gs-ms-box"></span>' + esc(v) + '</div>';
      }).join('');
    }
    function toggle(i) {
      var v = options[i], k = sel.indexOf(v);
      if (k === -1) sel.push(v); else sel.splice(k, 1);
      sel = options.filter(function (o) { return sel.indexOf(o) !== -1; });
      var el = list.querySelector('[data-i="' + i + '"]');
      if (el) el.setAttribute('aria-selected', String(k === -1));
      drawBtn();
    }
    function open() {
      if (openInst && openInst !== api) openInst.close();
      before = sel.slice();
      drawList();
      panel.hidden = false;
      root.classList.remove('up');
      /* position:fixed junto al boton -- asi una tabla con scroll (como
         la del catalogo) nunca lo recorta. */
      var r = btn.getBoundingClientRect();
      panel.style.minWidth = r.width + 'px';
      var ph = panel.offsetHeight, pw = panel.offsetWidth;
      var up = window.innerHeight - r.bottom < ph + 12 && r.top > ph + 12;
      if (up) root.classList.add('up');
      panel.style.top = (up ? r.top - ph - 6 : r.bottom + 6) + 'px';
      panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8)) + 'px';
      requestAnimationFrame(function () { root.classList.add('open'); });
      btn.setAttribute('aria-expanded', 'true');
      openInst = api;
      var first = list.querySelector('.gs-ms-opt');
      if (first) first.focus({ preventScroll: true });
    }
    function close(focusBtn) {
      if (panel.hidden) return;
      root.classList.remove('open');
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (openInst === api) openInst = null;
      if (focusBtn) btn.focus();
      var changed = !before || before.join('|') !== sel.join('|');
      before = null;
      if (changed && opts && typeof opts.onChange === 'function') opts.onChange(sel.slice());
    }
    btn.addEventListener('click', function () { if (panel.hidden) open(); else close(); });
    list.addEventListener('click', function (e) { var o = e.target.closest('.gs-ms-opt'); if (o) toggle(+o.dataset.i); });
    list.addEventListener('keydown', function (e) {
      var o = e.target.closest('.gs-ms-opt'); if (!o) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var n = e.key === 'ArrowDown' ? o.nextElementSibling : o.previousElementSibling;
        if (n) n.focus();
      } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(+o.dataset.i); }
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(true); } });
    root.querySelector('.gs-ms-clear').addEventListener('click', function () { sel = []; drawList(); drawBtn(); });
    root.querySelector('.gs-ms-done').addEventListener('click', function () { close(true); });

    var api = {
      get: function () { return sel.slice(); },
      set: function (values) { sel = options.filter(function (o) { return (values || []).indexOf(o) !== -1; }); drawBtn(); if (!panel.hidden) drawList(); },
      open: open, close: close, root: root,
      destroy: function () { if (openInst === api) openInst = null; container.innerHTML = ''; }
    };
    drawBtn();
    return api;
  }

  document.addEventListener('mousedown', function (e) { if (openInst && !openInst.root.contains(e.target)) openInst.close(); });
  /* Con position:fixed, si la pagina se mueve se cierra (guardando). */
  window.addEventListener('scroll', function (e) { if (openInst && !openInst.root.contains(e.target)) openInst.close(); }, true);
  window.addEventListener('resize', function () { if (openInst) openInst.close(); });
  document.addEventListener('touchstart', function (e) { if (openInst && !openInst.root.contains(e.target)) openInst.close(); }, { passive: true });

  window.GSMultiSelect = { mount: mount };
})();
