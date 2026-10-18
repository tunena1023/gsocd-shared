/* ============================================================
   gsocd-shared/lib/vercel-adapter.js -- convierte cada handler
   (event -> { statusCode, headers, body }) en una funcion de Vercel.
   Antes del 18/10/2026 era una copia igual en los 3 portales; ahora
   cada lib/vercel-adapter.js solo dice que portal es:
     module.exports = require('gsocd-shared/lib/vercel-adapter')('Admin', () => require('./graph'));

   - headers: la cookie de sesion (Orders/Tech) y el Bearer de los Cron
     Jobs de Vercel viajan aqui.
   - Toda respuesta 5xx queda en el log de Vercel con el endpoint y el
     mensaje (dueño 05/10/2026: "para que mas adelante sepamos que causo
     un error"), aunque la funcion no lo haya escrito.
   - Y si la misma falla se repite, correo a CFO@ (lib/error-alert.js,
     dueño 18/10/2026).
============================================================ */
'use strict';

const errorAlert = require('./error-alert');

function routeOf(req) { return String((req && req.url) || '').split('?')[0]; }

function messageOf(body) {
  try { return (JSON.parse(body || '{}') || {}).error || ''; } catch (e) { return String(body || ''); }
}

module.exports = function (portal, getGraph, opts) {
  const alert = errorAlert(portal, getGraph, opts);

  function toVercel(handler) {
    return async function (req, res) {
      const event = {
        httpMethod: req.method,
        queryStringParameters: req.query || {},
        headers: req.headers || {},
        body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
      };
      let result;
      try {
        result = await handler(event);
      } catch (e) {
        console.error('[500] ' + routeOf(req) + ' (crashed):', e && e.stack || e);
        await alert.failure(routeOf(req), 500, (e && e.message) || String(e));
        res.status(500).json({ error: e && e.message });
        return;
      }
      /* Lo que truene DESPUES del handler (sin respuesta, un header invalido, el aviso...) tambien contesta 500 con JSON
         y cuenta para el aviso (18/10/2026, revision: antes salia el 500 de Vercel, sin JSON ni aviso). */
      try {
        if (!result || typeof result !== 'object') throw new Error('The function gave no answer.');
        if ((result.statusCode || 200) >= 500 && !result.isBase64Encoded) {
          const msg = messageOf(result.body);
          console.error('[' + result.statusCode + '] ' + (req.method || '') + ' ' + routeOf(req) + ': ' + String(msg).slice(0, 500));
          await alert.failure(routeOf(req), result.statusCode, msg);
        }
        const headers = result.headers || {};
        Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
        res.status(result.statusCode || 200);
        if (result.isBase64Encoded) res.send(Buffer.from(result.body, 'base64'));
        else res.send(result.body);
      } catch (e) {
        console.error('[500] ' + routeOf(req) + ' (after the handler):', e && e.stack || e);
        try { await alert.failure(routeOf(req), 500, (e && e.message) || String(e)); } catch (e2) { /* el aviso no tumba la respuesta */ }
        if (!res.headersSent) res.status(500).json({ error: (e && e.message) || 'Server error' });
      }
    };
  }
  return { toVercel };
};
