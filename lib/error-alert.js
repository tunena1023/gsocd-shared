/* ============================================================
   gsocd-shared/lib/error-alert.js -- avisar cuando algo truena en
   produccion (dueño 18/10/2026: nadie se enteraba; lo de las fotos de
   GS-1015 se supo porque lo dijo un cliente).

   Lo usa lib/vercel-adapter.js con cada respuesta 5xx o funcion que
   truena. Si la MISMA falla (misma ruta y mismo mensaje, sin numeros)
   pasa 3 veces en 10 minutos, manda un correo a NOTIFY_ALERT_TO
   (CFO@gsocd.com, lib/notify.js 'app-error'). De la misma falla, otro
   correo hasta 2 horas despues, y nunca mas de 4 correos por hora.
   Solo en produccion (VERCEL_ENV=production): test-admin y los
   previews no mandan nada. Cada instancia de Vercel cuenta lo suyo
   (no hay memoria compartida): es para rachas, no un conteo exacto.
   Una funcion que se pasa de 60 s no llega aqui (Vercel la corta).
   Nunca truena: si el correo no sale, la respuesta sigue igual.
============================================================ */
'use strict';

const WINDOW_MS = 10 * 60e3, BURST = 3, QUIET_MS = 2 * 36e5, MAX_PER_HOUR = 4, SEND_WAIT_MS = 3000;

function keyOf(route, msg) {
  return String(route || '') + '|' + String(msg || '').replace(/\d+/g, '#').slice(0, 160);
}

/* portal: 'Admin' | 'Orders' | 'Tech'. getGraph: () => lib/graph del portal.
   opts (pruebas): { now, send, always } */
function errorAlert(portal, getGraph, opts) {
  opts = opts || {};
  const now = opts.now || Date.now;
  const send = opts.send || ((g, o) => require('./notify').notifyAlert(g, o));
  const seen = new Map();
  let sent = [];

  /* Regresa una promesa que espera el correo (maximo 3 s) o null si no toca mandar. */
  function failure(route, status, msg) {
    try {
      if (!opts.always && process.env.VERCEL_ENV !== 'production') return null;
      const t = now(), k = keyOf(route, msg);
      const s = seen.get(k) || { times: [], lastSent: -Infinity };
      s.times = s.times.filter(x => t - x < WINDOW_MS);
      s.times.push(t);
      seen.set(k, s);
      if (seen.size > 200) seen.delete(seen.keys().next().value);
      if (s.times.length < BURST || t - s.lastSent < QUIET_MS) return null;
      sent = sent.filter(x => t - x < 36e5);
      if (sent.length >= MAX_PER_HOUR) return null;
      s.lastSent = t;
      sent.push(t);
      const mail = Promise.resolve().then(() => send(getGraph(), {
        event: 'app-error', portal, route: String(route || '').replace(/^\/api\//, ''), status,
        error: String(msg || '').slice(0, 500), count: s.times.length, since: new Date(s.times[0]).toISOString()
      })).catch(e => console.error('error-alert:', e && e.message));
      return Promise.race([mail, new Promise(r => setTimeout(r, SEND_WAIT_MS))]);
    } catch (e) { return null; }
  }
  return { failure };
}

module.exports = errorAlert;
module.exports.keyOf = keyOf;
