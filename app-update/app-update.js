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
   cargar, cada vez que se regresa a la app, y cada 5 minutos. Si hay
   version nueva, se recarga SOLA, sin boton (26/09/2026, dueño: "eso
   de tener que picar un boton para actualizar no me gusta"):
   - al instante, si la persona no esta escribiendo nada;
   - si esta escribiendo (el cursor en un campo), en cuanto termine --
     la misma regla que ya usa Admin para refrescarse solo cada 30 s
     (gsocd-shared/live-refresh).
   Al recargar regresa a la misma altura de la pagina; beforeReload()
   deja que cada pagina guarde lo demas (Tech: pestaña, tarjetas
   abiertas, panel de cambios).

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

  var cfg = { url: '/api/app-version', intervalMs: 5 * 60000 };
  var current = null;      // version con la que se cargo esta pagina
  var pendingNew = null;   // version nueva detectada, sin recargar todavia
  var checking = false;
  var SCROLL_KEY = 'gs_app_update_scroll';

  function isSearch(el) {
    return el.type === 'search' || /search/i.test(el.id || '') || /search/i.test(el.className || '') ||
      /^search/i.test(el.getAttribute('placeholder') || '');
  }
  function isTextField(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && ['text', 'email', 'tel', 'url', 'number', 'password', 'date', 'time'].indexOf((el.type || 'text').toLowerCase()) !== -1;
  }
  /* La misma regla que Admin (gsocd-shared/live-refresh): solo se
     espera si la persona tiene el cursor en un campo escribiendo. */
  function typing() {
    var a = document.activeElement;
    return !!(a && isTextField(a) && !isSearch(a));
  }
  function busy() {
    try { if (typeof cfg.isBusy === 'function' && cfg.isBusy()) return true; } catch (e) { return true; }
    return typing();
  }

  function reload() {
    try { if (typeof cfg.beforeReload === 'function') cfg.beforeReload(); } catch (e) { /* recarga igual */ }
    try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ path: location.pathname + location.search, y: window.scrollY || 0, at: Date.now() })); } catch (e) {}
    location.reload();
  }
  /* Despues de recargar por version nueva: la misma altura (dos veces,
     porque cada pagina termina de pintar sus listas un poco despues). */
  function restoreScroll() {
    var st = null;
    try { st = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null'); sessionStorage.removeItem(SCROLL_KEY); } catch (e) { st = null; }
    if (!st || st.path !== location.pathname + location.search || Date.now() - (st.at || 0) > 60000) return;
    [800, 2000].forEach(function (ms) { setTimeout(function () { if (st.y > (window.scrollY || 0)) window.scrollTo(0, st.y); }, ms); });
  }

  function decide() {
    if (!pendingNew) return;
    if (busy()) return; /* se vuelve a revisar cada 2 s hasta que termine */
    reload();
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
      .then(function () { checking = false; decide(); });
  }

  function init(opts) {
    for (var k in (opts || {})) cfg[k] = opts[k];
    restoreScroll();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') check(true);
    });
    window.addEventListener('pageshow', function (e) { if (e.persisted) check(true); });
    window.addEventListener('focus', function () { check(true); });
    setInterval(function () { check(false); }, cfg.intervalMs);
    /* Version nueva pendiente porque estaba escribiendo: en cuanto termine. */
    setInterval(function () { if (pendingNew) decide(); }, 2000);
    check(false);
  }

  window.GSAppUpdate = { init: init, check: check, _isBusy: busy };
})();
