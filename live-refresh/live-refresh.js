/* ============================================================
   gsocd-shared / live-refresh
   Revisa en el fondo si hay datos nuevos en SharePoint (via el
   endpoint que cada app ya tiene para listar sus ordenes) y, si
   los hay, actualiza la pantalla sola -- sin boton, sin pedir
   permiso -- y avisa con un toast pequeno.

   A peticion del dueno (19/09/2026), reemplaza el patron anterior
   de "barra + boton Update" que ya existia en Admin (nunca
   refrescaba solo, por miedo a borrar una edicion en curso a medio
   llenar). Ahora SI refresca solo, pero con una sola proteccion
   interna: si el usuario tiene el cursor metido en un campo de
   texto (escribiendo algo) justo en el momento de revisar, ese
   ciclo se salta -- se vuelve a intentar en el siguiente tick, casi
   siempre unos segundos despues. No pregunta nada, no bloquea nada
   mas.

   No sabe nada de endpoints ni de la forma de los datos -- cada app
   le pasa su propia funcion para revisar (checkFn), su propia forma
   de comparar si algo cambio (hasChanged), y su propia funcion para
   aplicar el cambio de verdad (onChange, normalmente: recargar todo
   y pintar un toast).

   Modo "idle" (22/10/2026). CFO: "despues de 10 minutos sin mover
   nada, la pantalla se oscurece un poco y deja de actualizarse; al
   moverse se aclara y se actualiza". Si nadie mueve el mouse, toca,
   teclea, usa la rueda o hace scroll en idleMs, las revisiones se
   detienen (checkFn no se llama) y una sola capa negra al ~28% cubre
   la pagina (se ve todo detras, sin texto ni boton). Con cualquier
   movimiento la capa se quita y se revisa al momento (mismas reglas:
   no si esta escribiendo, no si la pestana esta oculta). La capa
   tiene pointer-events:none: el primer clic/toque llega a lo que esta
   debajo. Una sola capa y un solo juego de listeners para toda la
   pagina, compartidos por todos los watchers; se quitan cuando se
   detiene el ultimo watcher con idle.

   Uso:
     const watcher = GSLiveRefresh.watch({
       intervalMs: 30000,                    // default 30000
       idleMs: 600000,                       // default 600000 (10 min); 0 o idle:false = sin idle
       checkFn: async () => {                // trae un "estado" comparable
         const res = await api('/get-orders', { body: {...} });
         return buildSignature(res.orders);
       },
       hasChanged: (oldSig, newSig) => {...}, // true si de verdad cambio algo
       onChange: async (newSig, prevSig) => {  // aplicar el cambio de verdad
         await reloadEverything();
         showToast('Updated with the latest info.');
       }         // prevSig es el snapshot de ANTES del cambio -- util para
                  // saber cuales IDs son nuevos de verdad (prevSig.has(id))
     });

     watcher.stop();       // dejar de revisar (ej. al salir de la pagina)
     watcher.checkNow();   // forzar una revision inmediata

   GSLiveRefresh.flashElement(el):
     Le pone un destello dorado breve (~900ms) a un elemento del DOM --
     pensado para usarse dentro de onChange, justo despues de repintar
     SOLO la tarjeta/renglon que de verdad cambio (no toda la lista),
     para que el usuario note cual fue. No hace nada mas -- onChange
     sigue siendo responsabilidad de cada app: decidir si repinta todo
     o solo el elemento afectado. Requiere el CSS de mas abajo
     (inyectado solo, una vez, la primera vez que se usa). */
(function () {
  'use strict';
  if (window.GSLiveRefresh) return;

  /* Campos de texto activos -- si el usuario esta escribiendo justo
     ahorita, no lo interrumpimos con un redibujo. Cubre <textarea>,
     <input> de texto (no checkboxes/radios/etc, esos no se "escriben"
     letra por letra) y cualquier elemento contentEditable. */
  function isUserTyping() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      var type = (el.type || 'text').toLowerCase();
      return ['text', 'search', 'email', 'tel', 'url', 'number'].indexOf(type) !== -1;
    }
    if (el.isContentEditable) return true;
    return false;
  }

  /* Inyecta el CSS del destello una sola vez por pagina, sin importar
     cuantos watchers o llamadas a flashElement haya. */
  function ensureFlashCSS() {
    if (document.getElementById('gs-live-refresh-flash-css')) return;
    var style = document.createElement('style');
    style.id = 'gs-live-refresh-flash-css';
    style.textContent =
      '@keyframes gsLiveRefreshFlash {' +
      '0%{background-color:rgba(201,168,76,.35);box-shadow:0 0 0 2px rgba(201,168,76,.55)}' +
      '100%{background-color:transparent;box-shadow:0 0 0 2px rgba(201,168,76,0)}}' +
      '.gs-live-refresh-flash{animation:gsLiveRefreshFlash .9s ease-out}';
    document.head.appendChild(style);
  }

  /* Idle: una sola capa y un solo juego de listeners para toda la
     pagina. Cada watcher con idle se anota en idleWatchers; la capa
     sale cuando pasa el idleMs mas corto sin actividad, y cada watcher
     deja de revisar cuando pasa su propio idleMs. */
  var IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'];
  var idleWatchers = [];
  var lastActivity = 0;
  var idleTimer = null;
  var idleOverlay = null;
  var pageIdle = false;

  function ensureIdleCSS() {
    if (document.getElementById('gs-live-refresh-idle-css')) return;
    var style = document.createElement('style');
    style.id = 'gs-live-refresh-idle-css';
    style.textContent =
      '.gs-live-refresh-idle{position:fixed;top:0;left:0;right:0;bottom:0;background:#000;' +
      'opacity:0;pointer-events:none;z-index:2147483647;transition:opacity .6s ease}' +
      '.gs-live-refresh-idle.gs-live-refresh-idle-on{opacity:.28}';
    document.head.appendChild(style);
  }

  function minIdleMs() {
    var m = Infinity;
    for (var i = 0; i < idleWatchers.length; i++) m = Math.min(m, idleWatchers[i].idleMs);
    return m;
  }

  function idleFor(ms) { return Date.now() - lastActivity >= ms; }

  function showIdleOverlay() {
    if (!document.body) return;
    ensureIdleCSS();
    if (!idleOverlay) {
      idleOverlay = document.createElement('div');
      idleOverlay.className = 'gs-live-refresh-idle';
      idleOverlay.setAttribute('aria-hidden', 'true');
    }
    if (!idleOverlay.parentNode) {
      document.body.appendChild(idleOverlay);
      void idleOverlay.offsetWidth; // reflow -- sin esto no se ve el fade de entrada
    }
    idleOverlay.classList.add('gs-live-refresh-idle-on');
  }

  function hideIdleOverlay() {
    if (idleOverlay) idleOverlay.classList.remove('gs-live-refresh-idle-on');
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (!idleWatchers.length || pageIdle) return;
    var wait = lastActivity + minIdleMs() - Date.now();
    if (wait <= 0) {
      pageIdle = true;
      showIdleOverlay();
      return;
    }
    idleTimer = setTimeout(scheduleIdle, wait);
  }

  function onActivity() {
    var toWake = [];
    for (var i = 0; i < idleWatchers.length; i++) {
      if (idleFor(idleWatchers[i].idleMs)) toWake.push(idleWatchers[i]);
    }
    lastActivity = Date.now();
    if (pageIdle) {
      pageIdle = false;
      hideIdleOverlay();
    }
    if (!idleTimer) scheduleIdle();
    for (var j = 0; j < toWake.length; j++) toWake[j].wake();
  }

  function addIdleWatcher(entry) {
    if (!idleWatchers.length) {
      lastActivity = Date.now();
      for (var i = 0; i < IDLE_EVENTS.length; i++) {
        document.addEventListener(IDLE_EVENTS[i], onActivity, { capture: true, passive: true });
      }
    }
    idleWatchers.push(entry);
    scheduleIdle();
  }

  function removeIdleWatcher(entry) {
    var idx = idleWatchers.indexOf(entry);
    if (idx === -1) return;
    idleWatchers.splice(idx, 1);
    if (idleWatchers.length) {
      if (pageIdle && !idleFor(minIdleMs())) {
        pageIdle = false;
        hideIdleOverlay();
      }
      scheduleIdle();
      return;
    }
    clearTimeout(idleTimer);
    idleTimer = null;
    pageIdle = false;
    for (var i = 0; i < IDLE_EVENTS.length; i++) {
      document.removeEventListener(IDLE_EVENTS[i], onActivity, { capture: true, passive: true });
    }
    if (idleOverlay && idleOverlay.parentNode) idleOverlay.parentNode.removeChild(idleOverlay);
    idleOverlay = null;
  }

  window.GSLiveRefresh = {
    flashElement: function (el) {
      if (!el) return;
      ensureFlashCSS();
      /* Si ya estaba destellando (2 cambios muy seguidos), se reinicia
         la animacion en vez de que se corten una a la otra. */
      el.classList.remove('gs-live-refresh-flash');
      void el.offsetWidth; // fuerza reflow -- sin esto el navegador no reinicia la animacion
      el.classList.add('gs-live-refresh-flash');
    },
    watch: function (config) {
      ensureFlashCSS();
      var cfg = Object.assign({ intervalMs: 30000 }, config);
      if (!cfg.checkFn) throw new Error('GSLiveRefresh.watch needs checkFn');
      if (!cfg.hasChanged) throw new Error('GSLiveRefresh.watch needs hasChanged');
      if (!cfg.onChange) throw new Error('GSLiveRefresh.watch needs onChange');

      var lastSnapshot = null;
      var timer = null;
      var stopped = false;
      var checking = false; // evita 2 revisiones encimadas si una tarda
      var idleMs = cfg.idle === false ? 0 : (cfg.idleMs == null ? 600000 : Number(cfg.idleMs) || 0);
      var idleEntry = idleMs > 0 ? { idleMs: idleMs, wake: function () { check(); } } : null;

      function check() {
        if (stopped || checking) return;
        if (idleEntry && idleFor(idleMs)) return; // idle: no se revisa hasta que haya actividad
        if (document.visibilityState !== 'visible') return;
        if (isUserTyping()) return; // se reintenta solo el siguiente tick
        checking = true;
        Promise.resolve(cfg.checkFn()).then(function (snap) {
          checking = false;
          if (stopped) return;
          if (lastSnapshot !== null && cfg.hasChanged(lastSnapshot, snap)) {
            var prevSnapshot = lastSnapshot;
            lastSnapshot = snap;
            Promise.resolve(cfg.onChange(snap, prevSnapshot)).catch(function () {});
          } else {
            lastSnapshot = snap;
          }
        }).catch(function () {
          checking = false;
          /* Silencioso a proposito -- es una revision de fondo, no
             debe molestar con un error cada vez que la red falla un
             segundo. */
        });
      }

      function onVisible() { if (document.visibilityState === 'visible') check(); }
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', check);
      timer = setInterval(check, cfg.intervalMs);
      if (idleEntry) addIdleWatcher(idleEntry);

      /* Primera revision: solo establece la base para comparar --
         nunca dispara onChange en el arranque (no hay nada previo
         con que comparar todavia). */
      Promise.resolve(cfg.checkFn()).then(function (snap) { lastSnapshot = snap; }).catch(function () {});

      return {
        stop: function () {
          stopped = true;
          clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
          window.removeEventListener('online', check);
          if (idleEntry) removeIdleWatcher(idleEntry);
        },
        checkNow: check
      };
    }
  };
})();
