/* ============================================================
   gsocd-shared/lib/photo-link.js -- liga de foto que no caduca (CFO 30/10/2026).

   La liga que da SharePoint para cada archivo (@microsoft.graph.downloadUrl)
   caduca en ~1 h. Lo guardado en el telefono o la compu (GSLoad saved) y las
   pantallas que se quedan abiertas todo el dia enseñaban fotos rotas. Ahora
   las galerias regresan, en vez de esa liga, una del portal:

     /api/photo?i=<id del archivo>&e=<vence>&s=<firma>     (la foto)
     ...&k=t                                                (la miniatura)

   - La firma es un HMAC del id, el tipo y el vencimiento con un secreto del
     servidor (PHOTO_LINK_SECRET si existe; si no, una llave sacada de
     GRAPH_CLIENT_SECRET, que ya esta en los 3 portales). Sin firma buena o ya
     vencida: 403 y no se da nada. Deja ver lo mismo que el downloadUrl de hoy
     (ese archivo y nada mas), solo que por mas tiempo.
   - Vence entre 7 y 14 dias (lo que dura lo guardado): el vencimiento se
     redondea a la semana, asi la misma foto tiene la misma liga toda la semana
     (lo nuevo es igual a lo guardado y no se repinta de balde).
   - Sirve en <img src>, <video src>, el lightbox y la vista previa: el
     servidor contesta 302 a un downloadUrl fresco (el navegador recuerda el
     302 15 min). "Download all" (fetch + zip) pide &f=1: el servidor da los
     bytes desde el mismo dominio (sin depender del CORS de SharePoint); si el
     archivo pasa de 4.4 MB (limite de respuesta de Vercel), 302.
   - Costo: el downloadUrl se guarda 20 min en la memoria del servidor por id;
     las galerias ya lo traen al listar la carpeta (remember), asi que casi
     nunca se le pide a Graph uno por foto.

   Uso en un portal (lib/photo-link.js):
     module.exports = require('gsocd-shared/lib/photo-link')(require('./graph'));
   En las galerias:  photoLink.url(item)  /  photoLink.url(item, 'thumb')
   (item = lo que da listChildren: { id, downloadUrl, thumb }).
   En api/[...slug].js:  'photo': require('./lib/photo-link').handler  (publica: la firma es el permiso).
============================================================ */
'use strict';

const crypto = require('crypto');

const WEEK_S = 7 * 86400;
const KEEP_MS = 20 * 60000;          /* el downloadUrl de SharePoint dura ~60 min: se usa 20 */
const MAX_KEEP = 5000;
const MAX_INLINE = 4.4 * 1024 * 1024;
const REDIRECT_CACHE_S = 15 * 60;    /* 20 + 15 < 60: el navegador nunca sigue un 302 a una liga caducada */

let warnedNoSecret = false;
let devKey = null;
function key() {
  const s = process.env.PHOTO_LINK_SECRET || process.env.GRAPH_CLIENT_SECRET;
  if (s) return crypto.createHmac('sha256', String(s)).update('gsocd photo-link v1').digest();
  /* Sin secreto (pruebas locales): una llave de este proceso. En Vercel siempre esta GRAPH_CLIENT_SECRET. */
  if (!warnedNoSecret) { warnedNoSecret = true; console.warn('photo-link: no PHOTO_LINK_SECRET / GRAPH_CLIENT_SECRET, using a per-process key'); }
  if (!devKey) devKey = crypto.randomBytes(32);
  return devKey;
}

function sign(id, kind, exp) {
  return crypto.createHmac('sha256', key()).update(String(id) + '|' + (kind || '') + '|' + exp).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 22);
}

/* Vence al final de la semana que sigue: entre 7 y 14 dias desde ahora, igual toda la semana. */
function expiryFor(nowMs) {
  const s = Math.floor((nowMs == null ? Date.now() : nowMs) / 1000);
  return (Math.floor(s / WEEK_S) + 2) * WEEK_S;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* { id, kind } si la liga es buena; { error } si no. */
function verify(q, nowMs) {
  q = q || {};
  const id = String(q.i || ''), kind = q.k === 't' ? 't' : '', exp = parseInt(String(q.e || ''), 36), sig = String(q.s || '');
  if (!/^[A-Za-z0-9!._-]{1,200}$/.test(id) || !exp || !sig) return { error: 'bad' };
  if (!safeEqual(sign(id, kind, exp), sig)) return { error: 'bad' };
  if (exp * 1000 <= (nowMs == null ? Date.now() : nowMs)) return { error: 'expired' };
  return { id, kind };
}

module.exports = function photoLink(g, opts) {
  opts = opts || {};
  const route = opts.route || '/api/photo';
  const cache = new Map();   /* 'id|k' -> { url, at } */

  function keep(k, url) {
    if (!url) return;
    if (cache.size >= MAX_KEEP) cache.delete(cache.keys().next().value);
    cache.set(k, { url, at: Date.now() });
  }
  /* Lo que ya trajo el listado de la carpeta (downloadUrl / thumb recien dados por Graph). */
  function remember(item) {
    if (!item || !item.id) return;
    if (item.downloadUrl) keep(item.id + '|', item.downloadUrl);
    if (item.thumb) keep(item.id + '|t', item.thumb);
  }

  /* La liga del portal para un archivo (item de listChildren o su id). Sin id: lo que traiga (no se esconde nada). */
  function url(item, kind) {
    const id = typeof item === 'string' ? item : item && item.id;
    if (!id) return (item && (kind === 'thumb' ? item.thumb : item.downloadUrl)) || null;
    if (typeof item === 'object') remember(item);
    const k = kind === 'thumb' ? 't' : '', e = expiryFor();
    return route + '?i=' + encodeURIComponent(id) + (k ? '&k=t' : '') + '&e=' + e.toString(36) + '&s=' + sign(id, k, e);
  }

  /* downloadUrl (o miniatura) fresco de SharePoint; null si el archivo ya no existe. */
  async function fresh(id, kind) {
    const k = id + '|' + kind, hit = cache.get(k);
    if (hit && Date.now() - hit.at < KEEP_MS) return hit.url;
    const driveId = await g.getDriveId();
    const base = '/drives/' + driveId + '/items/' + encodeURIComponent(id);
    let link = null;
    try {
      if (kind === 't') {
        const d = await g.graphFetch(base + '/thumbnails');
        const t = d && d.value && d.value[0];
        link = t && ((t.medium || t.large || t.small || {}).url) || null;
        /* Sin miniatura (p. ej. un video recien subido): la foto completa. */
        if (!link) return fresh(id, '');
      } else {
        const d = await g.graphFetch(base);
        link = (d && d['@microsoft.graph.downloadUrl']) || null;
      }
    } catch (e) {
      if (/not ?found|could not be found|404|itemNotFound/i.test(String(e && e.message))) return null;
      throw e;
    }
    keep(k, link);
    return link;
  }

  function text(status, msg) {
    return { statusCode: status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: msg };
  }

  /* GET /api/photo?i=&e=&s=[&k=t][&f=1] */
  async function handler(event) {
    const q = (event && event.queryStringParameters) || {};
    const v = verify(q);
    if (v.error) return text(403, v.error === 'expired' ? 'This photo link expired. Reload the page.' : 'This photo link is not valid.');
    let link;
    try { link = await fresh(v.id, v.kind); }
    catch (e) { return text(503, 'Could not get the photo right now. Try again.'); }
    if (!link) return text(404, 'This photo is no longer there.');
    if (String(q.f || '') === '1') {
      /* Para "Download all": los bytes desde el mismo dominio. */
      try {
        const r = await fetch(link);
        if (r.ok) {
          const len = Number(r.headers.get('content-length') || 0);
          if (!len || len <= MAX_INLINE) {
            const buf = Buffer.from(await r.arrayBuffer());
            if (buf.length <= MAX_INLINE) {
              return { statusCode: 200, isBase64Encoded: true, body: buf.toString('base64'),
                headers: { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'private, max-age=600' } };
            }
          }
        } else if (r.status === 401 || r.status === 403 || r.status === 404) {
          cache.delete(v.id + '|' + v.kind);
        }
      } catch (e) { /* abajo: 302, como la foto normal */ }
    }
    return { statusCode: 302, headers: { Location: link, 'Cache-Control': 'private, max-age=' + REDIRECT_CACHE_S }, body: '' };
  }

  return { url, remember, handler, fresh, verify, _cache: cache };
};

module.exports.verify = verify;
module.exports.sign = sign;
module.exports.expiryFor = expiryFor;
module.exports.WEEK_S = WEEK_S;
