/* ============================================================
   lib/auth-401-log.js -- a quien le toca un 401 y por que (Arreglo 30/10/2026).
   En 2.5 dias hubo unos 470 401 en rafagas y el log no decia de quien.
   Solo DIAGNOSTICO: no cambia como funciona la autenticacion.

   Del token se lee el payload SIN confiar en el (no se valida la firma: esto
   es solo para el log, nunca para dar acceso):
     - Admin: ID token de Microsoft (JWT header.payload.firma) -> correo.
     - Orders / Tech: cookie firmada payload.firma -> cid / tid y nombre.
   Nunca se escribe el token.

   Uso (en el router, justo antes de contestar 401):
     log401({ portal: 'Admin', slug, req, token, why: e.message })
     log401({ portal: 'Tech', slug, req, cookie: COOKIE, why: 'no session' })
   Una linea "auth-401: {...}" (JSON) en los logs de Vercel.
============================================================ */
'use strict';

function b64json(part) {
  try {
    const s = String(part || '').replace(/-/g, '+').replace(/_/g, '/');
    const v = JSON.parse(Buffer.from(s + '==='.slice((s.length + 3) % 4), 'base64').toString('utf8'));
    return v && typeof v === 'object' ? v : null;
  } catch (e) { return null; }
}

/* El payload sin validar: JWT (3 partes) o cookie firmada (2 partes). */
function peekToken(token) {
  const parts = String(token || '').split('.');
  const p = parts.length >= 3 ? b64json(parts[1]) : parts.length === 2 ? b64json(parts[0]) : null;
  if (!p) return null;
  const who = p.email || p.preferred_username || p.upn || p.unique_name || p.cid || p.tid || '';
  return { who: String(who).slice(0, 120), name: p.name ? String(p.name).slice(0, 80) : '', exp: Number(p.exp) || 0 };
}

function cookieValue(headers, name) {
  const raw = String((headers && (headers.cookie || headers.Cookie)) || '');
  for (const kv of raw.split(';')) {
    const i = kv.indexOf('=');
    if (i > 0 && kv.slice(0, i).trim() === name) { try { return decodeURIComponent(kv.slice(i + 1).trim()); } catch (e) { return kv.slice(i + 1).trim(); } }
  }
  return '';
}

/* Arma la linea (se exporta para la prueba). */
function describe401(o) {
  o = o || {};
  const h = (o.req && o.req.headers) || o.headers || {};
  const token = o.token != null ? String(o.token) : (o.cookie ? cookieValue(h, o.cookie) : '');
  const peek = token ? peekToken(token) : null;
  const now = o.now || Date.now();
  let token_state = !token ? 'none' : !peek ? 'unreadable' : 'present';
  if (peek && peek.exp) {
    const secs = Math.round(now / 1000 - peek.exp);
    if (secs > 0) token_state = 'expired ' + (secs < 120 ? secs + ' s' : secs < 7200 ? Math.round(secs / 60) + ' min' : Math.round(secs / 3600) + ' h') + ' ago';
  }
  const ua = String(h['user-agent'] || '');
  const browser = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ua ? 'other' : '';
  return {
    portal: o.portal || '', slug: String(o.slug || '').slice(0, 60), method: String((o.req && o.req.method) || '').slice(0, 8),
    who: (peek && peek.who) || '(unknown)', name: (peek && peek.name) || undefined,
    token: token_state, from: o.from || undefined, why: String(o.why || '').replace(/\s+/g, ' ').slice(0, 200), browser
  };
}

function log401(o) {
  try { console.warn('auth-401: ' + JSON.stringify(describe401(o))); } catch (e) { /* el log nunca tumba la peticion */ }
}

module.exports = { log401, describe401, peekToken, cookieValue };
