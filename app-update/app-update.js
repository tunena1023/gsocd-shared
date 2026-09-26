/* ============================================================
   gsocd-shared / app-update
   Que la app se ponga al dia sola cuando sale una version nueva
   (26/09/2026, pedido del dueño: "tenemos un icono que ponemos en el
   telefono de la gente, pero las actualizaciones no llegan ahi").

   Por que no llegaban: los 3 sitios ya piden "revisa si hay version
   nueva cada vez que cargues" (Cache-Control: max-age=0,
   must-revalidate), pero el telefono casi nunca VUELVE A CARGAR la app:
   al abrirla desde el icono solo la despierta con la pagina que tenia
   en memoria, a veces de dias.

   Como funciona: la pagina le pregunta al servidor que version esta
   publicada (/api/app-version = el commit de ese deploy en Vercel) al
   cargar, cada vez que se regresa a la app, y cada 10 minutos.
   - Version nueva y la persona NO esta escribiendo nada:
       * si acaba de regresar a la app -> se recarga sola;
       * si la tiene enfrente -> se recarga sola despues de 2 minutos
         sin tocar nada (no a media lectura).
   - Si esta a media captura (un campo con cambios sin guardar, o el
     cursor en un campo): NO se recarga -- sale una barrita abajo
     "A new version is available · Update" y se recarga al tocarla.
   Antes de recargar se llama beforeReload() (Tech: guardar donde
   estaba el tecnico para dejarlo igual al volver).

   Uso:
     GSAppUpdate.init({
       url: '/api/app-version',          // default
       isBusy: function () { ... },      // opcional: true = no recargar sola
       beforeReload: function () { ... } // opcional
     });
============================================================ */
(function () {
  'use strict';
  if (window.GSAppUpdate) return;

  var cfg = { url: '/api/app-version', intervalMs: 10 * 60000, idleMs: 2 * 60000 };
  var current = null;      // version con la que se cargo esta pagina
  var pendingNew = null;   // version nueva detectada, sin recargar todavia
  var lastActivity = Date.now();
  var checking = false;
  var bar = null;

  function styleTag() {
    if (document.getElementById('gs-app-update-style')) return;
    var s = document.createElement('style');
    s.id = 'gs-app-update-style';
    s.textContent =
      '.gs-app-update{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:100000;' +
      'display:flex;align-items:center;justify-content:space-between;gap:12px;background:#111;color:#fff;border-radius:8px;' +
      'padding:12px 14px;font:13px/1.4 Inter,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);max-width:520px;margin:0 auto}' +
      '.gs-app-update button{flex-shrink:0;background:#C9A84C;color:#111;border:none;border-radius:4px;padding:8px 14px;' +
      'font:700 12px/1 Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;cursor:pointer}';
    document.head.appendChild(s);
  }

  /* Algo a medio escribir: un campo con cambios sin guardar, o el
     cursor dentro de un campo. Los de busqueda no cuentan. */
  function isSearch(el) {
    return el.type === 'search' || /search/i.test(el.id || '') || /search/i.test(el.className || '') ||
      /^search/i.test(el.getAttribute('placeholder') || '');
  }
  function formIsDirty() {
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !isSearch(a) && a.type !== 'button' && a.type !== 'checkbox' && a.type !== 'radio') return true;
    if (a && a.isContentEditable) return true;
    var els = document.querySelectorAll('input, textarea, select');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.disabled || el.readOnly || isSearch(el) || el.closest('[data-app-update-ignore]')) continue;
      if (!el.offsetParent && el.type !== 'hidden') continue; /* escondido: no lo esta llenando */
      if (el.tagName === 'SELECT') {
        for (var j = 0; j < el.options.length; j++) if (el.options[j].selected !== el.options[j].defaultSelected) return true;
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked !== el.defaultChecked) return true;
      } else if (el.type !== 'hidden' && el.type !== 'file' && el.value !== el.defaultValue) {
        return true;
      }
    }
    return false;
  }
  function busy() {
    try { if (typeof cfg.isBusy === 'function' && cfg.isBusy()) return true; } catch (e) { return true; }
    return formIsDirty();
  }

  function reload() {
    try { if (typeof cfg.beforeReload === 'function') cfg.beforeReload(); } catch (e) { /* recarga igual */ }
    location.reload();
  }

  function showBar() {
    if (bar) return;
    styleTag();
    bar = document.createElement('div');
    bar.className = 'gs-app-update';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>A new version is available</span><button type="button">Update</button>';
    bar.querySelector('button').addEventListener('click', reload);
    document.body.appendChild(bar);
  }

  /* resumed = la persona acaba de regresar a la app. */
  function decide(resumed) {
    if (!pendingNew) return;
    if (busy()) { showBar(); return; }
    if (resumed || Date.now() - lastActivity >= cfg.idleMs || document.visibilityState !== 'visible') { reload(); return; }
    showBar();
  }

  function check(resumed) {
    if (checking) return;
    checking = true;
    fetch(cfg.url + (cfg.url.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var v = d && d.version ? String(d.version) : '';
        if (!v) return;
        if (!current) { current = v; return; }
        if (v !== current) pendingNew = v;
      })
      .catch(function () { /* sin señal: se vuelve a intentar despues */ })
      .then(function () { checking = false; decide(resumed); });
  }

  function init(opts) {
    for (var k in (opts || {})) cfg[k] = opts[k];
    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) {
      window.addEventListener(ev, function () { lastActivity = Date.now(); }, { passive: true, capture: true });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') check(true);
    });
    window.addEventListener('pageshow', function (e) { if (e.persisted) check(true); });
    window.addEventListener('focus', function () { check(true); });
    setInterval(function () { check(false); }, cfg.intervalMs);
    /* Una barrita que ya salio: si despues deja de estar ocupado y se
       queda quieto, se actualiza solo. */
    setInterval(function () { if (pendingNew) decide(false); }, 30000);
    check(false);
  }

  window.GSAppUpdate = { init: init, check: check, _isBusy: busy };
})();
