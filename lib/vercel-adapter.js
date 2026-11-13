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
   - Al final, los correos que esperan a Microsoft (lib/mail-outbox).
   - Guardar en SQL primero, hibrido (lib/sql-first, CFO 12/11/2026): la
     respuesta lleva X-GS-Data = sql / sharepoint (la base no contesto, salio
     de SharePoint) / down (tampoco Microsoft); con down y nada guardado
     antes en la peticion, X-GS-Replay: 1 (la pantalla la guarda en el
     telefono y la manda despues: gsocd-shared reconnecting/). Sin listas
     en sql-first no se pone nada.
============================================================ */
'use strict';

const errorAlert = require('./error-alert');

function routeOf(req) { return String((req && req.url) || '').split('?')[0]; }

function messageOf(body) {
  try { return (JSON.parse(body || '{}') || {}).error || ''; } catch (e) { return String(body || ''); }
}

/* De donde salieron los datos de esta peticion (lib/sql-read reqInfo). Y un guardado que se mando despues desde el
   telefono (X-GS-Replayed) y no entro: al log y, en produccion, el aviso de errores (nada se descarta en silencio). */
function dataHeaders(req, res, status) {
  let info = null;
  try { info = require('./sql-read').reqInfo(); } catch (e) { info = null; }
  if (info && info.data) {
    res.setHeader('X-GS-Data', info.data);
    if (info.data === 'down' && info.replay && String(req.method || 'GET').toUpperCase() !== 'GET') res.setHeader('X-GS-Replay', '1');
  }
  return info;
}
function replayFailed(portal, getGraph, req, status, body) {
  const h = (req && req.headers) || {};
  const at = h['x-gs-replayed'] || h['X-GS-Replayed'];
  if (!at || status < 400 || (status >= 500 && /bothDown/.test(String(body || '')))) return null;
  const msg = 'A save kept on a phone or computer while the database and Microsoft were down (' + String(at).slice(0, 40) + ') was not accepted: ' + String(messageOf(body)).slice(0, 300);
  console.error('[replay ' + status + '] ' + (req.method || '') + ' ' + routeOf(req) + ': ' + msg);
  if (process.env.VERCEL_ENV !== 'production') return null;
  return Promise.race([Promise.resolve().then(() => require('./notify').notifyAlert(getGraph(), { event: 'app-error', portal, route: routeOf(req).replace(/^\/api\//, ''), status, error: msg }))
    .catch(e => console.error('replay alert:', e && e.message)), new Promise(r => setTimeout(r, 3000))]);
}

module.exports = function (portal, getGraph, opts) {
  const alert = errorAlert(portal, getGraph, opts);

  /* Correos que esperan porque Microsoft no contesto (lib/mail-outbox, CFO 12/11/2026): despues de contestar, por
     detras; con MAIL_OUTBOX apagado no hace nada. */
  const outboxKick = () => { try { require('./mail-outbox').kick(getGraph); } catch (e) { /* nunca tumba la respuesta */ } };
  function toVercel(handler) {
    const run = answer(handler);
    return async function (req, res) {
      try { return await run(req, res); } finally { outboxKick(); }
    };
  }
  function answer(handler) {
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
        try { dataHeaders(req, res, 500); } catch (e2) { /* sin header */ }
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
        dataHeaders(req, res, result.statusCode || 200);
        await replayFailed(portal, getGraph, req, result.statusCode || 200, result.body);
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
