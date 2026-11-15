/* ============================================================
   gsocd-shared/lib/site-visits.js -- llegada y salida por orden (CFO 14/11/2026, "drive mode" del mapa del lugar).

   Tech (site-visit.js) las escribe; Admin (vista de la orden y Calendar) y Tech (tarjeta) las leen. Nada de rastreo:
   solo se guarda, por orden y por dia de Iowa, cuando llego, quien, como (drive mode / map), cuando se fue y la ultima
   vez que la app lo vio en el lugar.
     Orders.SiteVisits  JSON [{ day, arrivedAt, arrivedBy, source, leftAt, leftSource, seenAt }] (todos los dias)
     Orders.ArrivedAt / ArrivedBy / ArrivalSource / LeftAt / LeftSource / SiteSeenAt = el dia mas reciente
   Reglas:
     - La llegada se marca UNA vez por dia (la primera); un reintento o doble toque regresa la misma.
     - Salida: Done (si varias partes, la ultima); si no, 10 min fuera del lugar con la app abierta ('left');
       si no, la ultima vez que se vio en el lugar ('last seen', solo cuando el dia ya paso).
     - Si ya se habia ido ('left') y la app lo ve otra vez en el lugar, regreso: la salida se borra.
     - Done despues de un 'left' no la mueve (ya se habia ido).
   Puro: sin red ni SharePoint. Pruebas: lib/site-visits.test.js
============================================================ */
'use strict';

const TZ = 'America/Chicago';
const KEEP = 60;                       /* dias guardados en SiteVisits */
const SEEN_MIN = 4;                    /* "lo vi en el lugar" se guarda como mucho cada 4 min */
const SOURCES = ['drive', 'map', 'photo', 'punch', 'app'];
const LABEL = { drive: 'drive mode', map: 'map', photo: 'photo', punch: 'punch', app: 'app open' };

const str = v => String(v == null ? '' : v).trim();
const ms = v => { const t = Date.parse(v || ''); return isFinite(t) ? t : NaN; };
const iso = v => { const t = ms(v); return isFinite(t) ? new Date(t).toISOString() : ''; };
function iowaDay(v) { const d = v instanceof Date ? v : new Date(v == null ? Date.now() : v); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: TZ }); }

function clean(v) {
  if (!v || typeof v !== 'object') return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(str(v.day)) ? str(v.day) : iowaDay(v.arrivedAt || v.leftAt);
  if (!day) return null;
  return {
    day, arrivedAt: iso(v.arrivedAt), arrivedBy: str(v.arrivedBy).slice(0, 80), source: SOURCES.includes(v.source) ? v.source : (v.arrivedAt ? 'drive' : ''),
    leftAt: iso(v.leftAt), leftSource: ['done', 'left'].includes(v.leftSource) ? v.leftSource : '', seenAt: iso(v.seenAt)
  };
}
/* fields de la orden -> lista por dia (vieja primero) */
function parse(fields) {
  const f = fields || {};
  let list = [];
  try { const x = typeof f.SiteVisits === 'string' ? JSON.parse(f.SiteVisits || '[]') : f.SiteVisits; if (Array.isArray(x)) list = x; } catch (e) { list = []; }
  list = list.map(clean).filter(Boolean);
  if (!list.length && (f.ArrivedAt || f.LeftAt)) {
    const one = clean({ arrivedAt: f.ArrivedAt, arrivedBy: f.ArrivedBy, source: f.ArrivalSource, leftAt: f.LeftAt, leftSource: f.LeftSource, seenAt: f.SiteSeenAt });
    if (one) list = [one];
  }
  const byDay = {};
  list.forEach(v => { byDay[v.day] = v; });
  return Object.keys(byDay).sort().map(d => byDay[d]);
}
const find = (list, day) => list.find(v => v.day === day) || null;
const copy = list => list.map(v => Object.assign({}, v));

/* -> { visits, changed, visit } */
function arrive(visits, a) {
  const list = copy(visits || []);
  const at = iso(a && a.at);
  if (!at) return { visits: list, changed: false, visit: null };
  const day = iowaDay(at);
  let v = find(list, day);
  if (v && v.arrivedAt) return { visits: list, changed: false, visit: v };
  if (!v) { v = { day, arrivedAt: '', arrivedBy: '', source: '', leftAt: '', leftSource: '', seenAt: '' }; list.push(v); list.sort((x, y) => x.day.localeCompare(y.day)); }
  v.arrivedAt = at; v.arrivedBy = str(a.by).slice(0, 80); v.source = SOURCES.includes(a.source) ? a.source : 'drive';
  if (!v.seenAt || ms(v.seenAt) < ms(at)) v.seenAt = at;
  /* un Done de antes de la llegada no es salida de esta visita */
  if (v.leftAt && ms(v.leftAt) < ms(at)) { v.leftAt = ''; v.leftSource = ''; }
  return { visits: list, changed: true, visit: v };
}
function seen(visits, a) {
  const list = copy(visits || []);
  const at = iso(a && a.at);
  const v = at ? find(list, iowaDay(at)) : null;
  if (!v || !v.arrivedAt || ms(at) < ms(v.arrivedAt)) return { visits: list, changed: false, visit: v };
  let changed = false;
  if (v.leftSource === 'left' && ms(at) > ms(v.leftAt)) { v.leftAt = ''; v.leftSource = ''; changed = true; }
  if (!v.seenAt || ms(at) - ms(v.seenAt) >= SEEN_MIN * 60000 || (changed && ms(at) > ms(v.seenAt))) { v.seenAt = at; changed = true; }
  return { visits: list, changed, visit: v };
}
function leave(visits, a) {
  const list = copy(visits || []);
  const at = iso(a && a.at), source = a && a.source === 'left' ? 'left' : 'done';
  if (!at) return { visits: list, changed: false, visit: null };
  const day = iowaDay(at);
  let v = find(list, day);
  if (!v) {
    if (source === 'left') return { visits: list, changed: false, visit: null };
    v = { day, arrivedAt: '', arrivedBy: '', source: '', leftAt: at, leftSource: 'done', seenAt: '' };
    list.push(v); list.sort((x, y) => x.day.localeCompare(y.day));
    return { visits: list, changed: true, visit: v };
  }
  if (v.arrivedAt && ms(at) < ms(v.arrivedAt)) return { visits: list, changed: false, visit: v };
  if (!v.leftAt) { v.leftAt = at; v.leftSource = source; return { visits: list, changed: true, visit: v }; }
  if (source === 'done' && v.leftSource === 'done' && ms(at) > ms(v.leftAt)) { v.leftAt = at; return { visits: list, changed: true, visit: v }; }
  return { visits: list, changed: false, visit: v };
}
/* lo que se escribe en la orden */
function columns(visits) {
  const list = (visits || []).slice(-KEEP);
  const v = list[list.length - 1] || {};
  return {
    SiteVisits: JSON.stringify(list), ArrivedAt: v.arrivedAt || '', ArrivedBy: v.arrivedBy || '', ArrivalSource: v.source || '',
    LeftAt: v.leftAt || '', LeftSource: v.leftSource || '', SiteSeenAt: v.seenAt || ''
  };
}

function hm(v) { const t = ms(v); return isFinite(t) ? new Date(t).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : ''; }
function dur(min) { min = Math.max(0, Math.round(min)); const h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'; }
/* Una visita lista para pintar. now: para la de hoy (sigue en el lugar). */
function view(v, now) {
  if (!v) return null;
  const nowMs = now == null ? Date.now() : ms(now) || +now;
  const today = iowaDay(nowMs);
  const out = { day: v.day, arrivedAt: v.arrivedAt, arrivedBy: v.arrivedBy, source: v.source, leftAt: v.leftAt, leftSource: v.leftSource, seenAt: v.seenAt, minutes: null, onSite: false };
  if (!v.leftAt && v.arrivedAt && v.seenAt && v.day < today && ms(v.seenAt) > ms(v.arrivedAt)) { out.leftAt = v.seenAt; out.leftSource = 'last seen'; }
  if (v.arrivedAt && out.leftAt) out.minutes = (ms(out.leftAt) - ms(v.arrivedAt)) / 60000;
  else if (v.arrivedAt && v.day === today) {
    const last = Math.max(ms(v.seenAt) || 0, ms(v.arrivedAt));
    out.onSite = nowMs - last < 15 * 60000;
    out.minutes = ((out.onSite ? nowMs : last) - ms(v.arrivedAt)) / 60000;
    if (!out.onSite && last > ms(v.arrivedAt)) out.lastSeen = new Date(last).toISOString();
  }
  if (out.minutes != null) out.minutes = Math.max(0, Math.round(out.minutes));
  return out;
}
/* "Arrived 8:42 AM · Left 10:17 AM · 1 h 35 min · by drive mode" */
function line(v, now) {
  const x = v && v.minutes !== undefined ? v : view(v, now);
  if (!x) return '';
  const parts = [];
  if (x.arrivedAt) parts.push('Arrived ' + hm(x.arrivedAt));
  if (x.leftAt) parts.push((x.leftSource === 'last seen' ? 'Last seen ' : 'Left ') + hm(x.leftAt));
  else if (x.lastSeen) parts.push('Last seen ' + hm(x.lastSeen));
  else if (x.onSite) parts.push('On site');
  if (x.arrivedAt && x.minutes != null && (x.leftAt || x.lastSeen || x.onSite)) parts.push(dur(x.minutes));
  if (x.arrivedAt && x.source) parts.push('by ' + (LABEL[x.source] || x.source));
  return parts.join(' · ');
}
/* Todas las visitas de la orden en renglones; dias de antes con su fecha. */
function lines(fields, now) {
  const list = parse(fields);
  const today = iowaDay(now == null ? Date.now() : now);
  return list.filter(v => v.arrivedAt || v.leftAt).map(v => {
    const t = line(v, now);
    if (!t) return '';
    const d = new Date(v.day + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return (list.length > 1 || v.day !== today ? d + ': ' : '') + t;
  }).filter(Boolean);
}

module.exports = { parse, arrive, seen, leave, columns, view, line, lines, iowaDay, hm, dur, LABEL, SEEN_MIN, KEEP };
