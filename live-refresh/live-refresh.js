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

   Uso:
     const watcher = GSLiveRefresh.watch({
       intervalMs: 30000,                    // default 30000
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
============================================================ */
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

  window.GSLiveRefresh = {
    watch: function (config) {
      var cfg = Object.assign({ intervalMs: 30000 }, config);
      if (!cfg.checkFn) throw new Error('GSLiveRefresh.watch needs checkFn');
      if (!cfg.hasChanged) throw new Error('GSLiveRefresh.watch needs hasChanged');
      if (!cfg.onChange) throw new Error('GSLiveRefresh.watch needs onChange');

      var lastSnapshot = null;
      var timer = null;
      var stopped = false;
      var checking = false; // evita 2 revisiones encimadas si una tarda

      function check() {
        if (stopped || checking) return;
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
        },
        checkNow: check
      };
    }
  };
})();
