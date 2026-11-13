/* ============================================================
   gsocd-shared/lib/db-wake.js -- que la base (Neon) solo se prenda cuando hay trabajo (CFO 12/11/2026: "esa madre
   debe haber quedado asi desde un principio"). No se quita ningun registro ni nada de lo que se guarda.

   Neon cobra cada hora que esta prendida y se apaga sola a los 5 min sin consultas. Los crons la despertaban cada
   1-5 min aunque no hubiera nada que hacer. Con esto cada cron revisa primero una MARCA fuera de la base (archivo
   chico en el drive de SharePoint, App Data/DB wake/) y solo toca SQL si la marca dice que hay trabajo.
   Por que el drive: ya lo usan los 3 portales con sus credenciales (nada nuevo que pegar en Vercel), es el mismo para
   los 3 proyectos (Runtime Cache de Vercel es por proyecto y por region), no cobra por lectura y Edge Config solo deja
   pocas escrituras al mes.

   SWITCH: DB_WAKE=on en el proyecto de Vercel (los 3 portales a la vez). Apagado (default): touch() no hace nada y
   due() siempre dice "corre": todo igual que antes.

   Marcas:
     flag-<nombre>.json   { at }  "hay trabajo" (touch). Quien encola o guarda; maximo una escritura por minuto por
                                  instancia (DEBOUNCE_MS), lo de ese minuto lo cubre el margen de due().
     done-<cron>.json     { at, until, info }  el cron al terminar bien una vuelta (done): "revise todo lo de antes
                                  de at"; until = cuando algo vence aunque nadie marque (reintentos, la llave a los 10 min).
   due(): corre si una marca es de despues de (at - DEBOUNCE_MS), si ya paso until, si toca la revision de seguridad,
   si nunca ha corrido, o si no se pudo leer algo (camino seguro: revisar la base, como antes).
============================================================ */
'use strict';

const DEBOUNCE_MS = 60 * 1000;
const READ_TIMEOUT_MS = 8000;
const FOLDER = 'App Data/DB wake';
const TZ = 'America/Chicago';

const on = () => /^(on|1|true|yes)$/i.test(String(process.env.DB_WAKE || '').trim());
const envName = () => process.env.VERCEL_ENV || 'development';
const iso = t => new Date(t).toISOString();

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('DB wake flag timed out after ' + ms + ' ms')), ms); })]).finally(() => clearTimeout(t));
}
/* En Vercel: dejar terminar la escritura despues de contestar. */
function keepAlive(p) {
  try {
    const rc = globalThis[Symbol.for('@vercel/request-context')];
    const c = rc && typeof rc.get === 'function' ? rc.get() : null;
    if (c && typeof c.waitUntil === 'function') c.waitUntil(p);
  } catch (e) { /* fuera de Vercel sigue igual */ }
  return p;
}

const safeName = n => String(n || '').replace(/[^A-Za-z0-9._-]/g, '_');
const fileOf = (kind, name) => kind + '-' + safeName(name) + '.json';
const encodePath = p => p.split('/').map(encodeURIComponent).join('/');

/* g = el graph del portal (gsocd-shared lib/graph-core): rawGraphFetch, getDriveId, uploadFile. */
async function readFile(g, file) {
  const driveId = await g.getDriveId();
  const res = await g.rawGraphFetch('/drives/' + driveId + '/root:/' + encodePath(FOLDER + '/' + file) + ':/content', {}, true);
  if (res.status === 404) return null;
  if (!res.ok) { const e = new Error('DB wake flag ' + file + ' not read (' + res.status + ')'); e.status = res.status; throw e; }
  const v = JSON.parse(await res.text());
  if (!v || typeof v !== 'object') throw new Error('DB wake flag ' + file + ' is not JSON');
  return v;
}
async function writeFile(g, file, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  const driveId = await g.getDriveId();
  const res = await g.rawGraphFetch('/drives/' + driveId + '/root:/' + encodePath(FOLDER + '/' + file) + ':/content',
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body }, true);
  if (res.ok) return;
  /* La carpeta todavia no existe: uploadFile la crea. */
  if ((res.status === 404 || res.status === 409) && typeof g.uploadFile === 'function') { await g.uploadFile(FOLDER, file, body, 'application/json'); return; }
  const e = new Error('DB wake flag ' + file + ' not saved (' + res.status + ')'); e.status = res.status; throw e;
}

/* ---- "hay trabajo" ---- */
const lastTouch = new Map();
/* Nunca truena. opts.force: sin el minuto de espera (algo raro, como una llave). Dentro de quiet(nombres): no marca. */
function touch(g, name, opts) {
  try {
    if (!on() || !g) return Promise.resolve(false);
    const quiet = require('./sql-read').current().wakeQuiet;
    if (Array.isArray(quiet) && quiet.includes(name)) return Promise.resolve(false);
    const now = Date.now();
    if (!(opts && opts.force) && now - (lastTouch.get(name) || 0) < DEBOUNCE_MS) return Promise.resolve(false);
    lastTouch.set(name, now);
    return keepAlive(withTimeout(writeFile(g, fileOf('flag', name), { at: iso(now), env: envName() }), READ_TIMEOUT_MS)
      .then(() => true)
      .catch(e => { lastTouch.delete(name); console.error('db-wake: flag ' + name + ' not saved (the next save tries again): ' + e.message); return false; }));
  } catch (e) { return Promise.resolve(false); }
}
/* Lo que se guarde dentro de fn no marca esas banderas (el cron que las consume no se despierta solo). */
function quiet(names, fn) { return require('./sql-read').context({ wakeQuiet: [].concat(names || []) }, fn); }

/* ---- ¿hay trabajo? ----
   opts: { flags: [nombres], safety: fn(Date) -> bool, now }
   -> { run, why, startedAt, done } (done = lo que dejo la ultima vuelta, con su info). Nunca truena. */
async function due(g, consumer, opts) {
  opts = opts || {};
  const now = opts.now || Date.now();
  const out = { run: true, why: '', startedAt: now, done: null };
  if (!on()) return Object.assign(out, { why: 'DB_WAKE off' });
  let done = null, flags = [];
  try {
    [done, ...flags] = await withTimeout(Promise.all([readFile(g, fileOf('done', consumer))].concat((opts.flags || []).map(f => readFile(g, fileOf('flag', f))))), READ_TIMEOUT_MS);
  } catch (e) {
    console.error('db-wake: ' + consumer + ' checks the database (flag not readable: ' + e.message + ')');
    return Object.assign(out, { why: 'flag not readable' });
  }
  out.done = done;
  if (!done || !isFinite(Date.parse(done.at))) return Object.assign(out, { why: 'first run' });
  const seen = Date.parse(done.at);
  const hit = (opts.flags || []).find((f, i) => flags[i] && Date.parse(flags[i].at) > seen - DEBOUNCE_MS);
  if (hit) return Object.assign(out, { why: 'new work (' + hit + ')' });
  if (done.until && Date.parse(done.until) <= now) return Object.assign(out, { why: 'something is due' });
  if (typeof opts.safety === 'function' && opts.safety(new Date(now))) return Object.assign(out, { why: 'safety check' });
  return Object.assign(out, { run: false, why: 'nothing to do' });
}

/* Vuelta terminada bien. seenUpTo: hasta cuando vio todo (startedAt menos lo viejo que puede venir de un cache).
   opts: { until: ms|Date|null, info: {} }. Si no se guarda, la siguiente vuelta corre (camino seguro). */
async function done(g, consumer, seenUpTo, opts) {
  opts = opts || {};
  if (!on() || !g) return false;
  const until = opts.until == null || !isFinite(new Date(opts.until).getTime()) ? null : iso(opts.until);
  try {
    await withTimeout(writeFile(g, fileOf('done', consumer), { at: iso(seenUpTo), until, info: opts.info || null, env: envName() }), READ_TIMEOUT_MS);
    return true;
  } catch (e) { console.error('db-wake: ' + consumer + ' not marked done (it runs again next time): ' + e.message); return false; }
}

/* ---- revision de seguridad: la primera vuelta de cada hora de trabajo (7 a 19 h de Iowa) y a las 5:00 ----
   windowMin: lo que dura "la primera vuelta" (5 para un cron de cada 5 min, 1 para el de cada minuto). */
function iowaHM(d) {
  const [h, m] = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
  return { h: h % 24, m };
}
function safetyHourly(windowMin, hours) {
  const hs = hours || [5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  return d => { const t = iowaHM(d); return t.m < (windowMin || 5) && hs.includes(t.h); };
}

module.exports = { on, touch, quiet, due, done, safetyHourly, iowaHM, DEBOUNCE_MS, FOLDER, fileOf,
  _reset: () => lastTouch.clear() };
