/* ============================================================
   gsocd-shared/lib/mail-outbox.js -- correos que no se pierden cuando Microsoft no contesta (CFO 12/11/2026: con la
   caida de Outlook TM1550488 se perdieron los "completed"/"changed" del dia, porque nadie los reintentaba).

   SWITCH: variable MAIL_OUTBOX=on en el proyecto de Vercel (cada portal la suya; cambiarla = redesplegar). Sin ella
   (APAGADO, el default) todo queda exactamente como antes: no se toca SQL, no se marca nada, nada se reintenta.

   Prendido:
   - Un correo automatico que ya esta armado y Microsoft no lo acepta por algo suyo (5xx, 429, 408, red, timeout) entra a
     la tabla _mail_outbox de SQL (SQL_MIRROR_URL; la crea el codigo) con el mensaje completo, y la llamada contesta como
     si hubiera salido (queued). Un 4xx (datos malos) NO entra: falla como hoy.
   - Llave por correo (dedupe_key): quien manda + a quien + asunto + texto (sin horas) + adjunto + dia de Iowa. El mismo
     correo dos veces (doble clic, reintento de la pagina) es un solo renglon.
   - Cada correo lleva una marca escondida con su llave (GSOutboxKey). Antes de reintentar se busca en Enviados: si ya
     esta (Microsoft lo acepto aunque contesto 504, o el doble clic ya salio), no se manda otra vez.
   - Reintento: kick() al final de cada peticion (por detras, maximo una vez por minuto por instancia) y el cron de Admin
     cron-mail-outbox cada 5 min. Un renglon a la vez con candado (lease de 2 min, FOR UPDATE SKIP LOCKED): dos
     instancias nunca mandan el mismo. Espera 1, 2, 5, 10, 15, 30 min y luego cada hora.
   - Correo al cliente de una orden: antes de reintentar se revisa la orden en SQL. Borrada o Cancelled = no se manda
     (status skipped y el porque en note); el aviso de que su cancelacion se aprobo si sale.
   - 24 h sin salir: status gave_up y un correo de aviso a NOTIFY_ALERT_TO (el aviso de errores de siempre, app-error).
   - Solo se reintenta lo del mismo ambiente (production / preview): test y produccion comparten la base.
   - Con DB_WAKE=on (lib/db-wake): al encolar se deja la marca "mail-<ambiente>" fuera de la base; el cron y el kick solo
     tocan SQL si hay marca nueva, si ya vence un reintento (nextAt) o en la revision de seguridad.
   Nunca truena hacia afuera: si SQL falla, el correo falla como hoy.
============================================================ */
'use strict';
const crypto = require('crypto');

const TABLE = '_mail_outbox';
const GIVE_UP_MS = 24 * 36e5;
const LEASE_S = 120;
const BACKOFF_MIN = [1, 2, 5, 10, 15, 30, 60];
const KICK_EVERY_MS = 60e3;
/* Propiedad escondida del mensaje con la llave (MAPI string con nombre, GUID propio de la app). */
const PROP = 'String {7b3c9a52-4e1d-4f6a-9d2e-5c8b1a0f3e67} Name GSOutboxKey';
/* Correos al cliente que dependen de que la orden siga viva. */
const ORDER_EVENTS = new Set(['received', 'scheduled', 'completed', 'changed', 'request-decision', 'confirm', 'reactivation-confirm', 'visit-check']);

const str = v => String(v == null ? '' : v).trim();
function on() { return /^(on|1|true|yes)$/i.test(str(process.env.MAIL_OUTBOX)); }
function envName() { return process.env.VERCEL_ENV || 'development'; }
function iowaDay(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date());
}

/* ---- ¿falla de Microsoft (se reintenta) o de los datos (no)? ---- */
function transient(e) {
  if (!e) return false;
  const s = Number(e.status) || 0;
  const m = str(e.message || e);
  const tok = /Token request failed: (\d{3})/.exec(m);
  const code = s || (tok ? Number(tok[1]) : 0);
  if (code) return code >= 500 || code === 429 || code === 408;
  const c = str(e.code || (e.cause && e.cause.code));
  return e.name === 'AbortError' || e.name === 'TimeoutError' || /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR)/.test(c) ||
    /fetch failed|network|socket hang up|timed? ?out/i.test(m);
}

/* ---- llave ---- */
function textOf(html) {
  return str(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, '')
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*([AaPp]\.?[Mm]\.?)?/g, '')
    .replace(/\s+/g, ' ').trim();
}
function keyOf(from, message, day) {
  const addr = l => (l || []).map(r => str(r && r.emailAddress && r.emailAddress.address).toLowerCase()).sort().join(',');
  const att = (message.attachments || []).map(a => str(a.name)).join(',');
  const h = crypto.createHash('sha256').update([envName(), str(from).toLowerCase(), addr(message.toRecipients), addr(message.bccRecipients),
    str(message.subject), textOf(message.body && message.body.content), att].join('\n')).digest('hex').slice(0, 40);
  return h + ':' + (day || iowaDay());
}
function mark(message, key) {
  message.singleValueExtendedProperties = (message.singleValueExtendedProperties || []).filter(p => p.id !== PROP).concat([{ id: PROP, value: key }]);
  return message;
}

/* ---- SQL ---- */
let sqlOverride = null;
function db() { return sqlOverride || require('./sql-mirror').client(); }
let ensured = null;
function ensure(sql) {
  if (!ensured) {
    ensured = (async () => {
      await sql('create table if not exists ' + TABLE + ' (id bigserial primary key, dedupe_key text not null unique, env text not null, kind text not null default \'mail\', ' +
        'audience text, event text, order_id text, meta jsonb, sender text not null, recipients text, subject text, payload jsonb, ' +
        'status text not null default \'pending\', attempts integer not null default 0, last_error text, note text, ' +
        'created_at timestamptz not null default now(), next_at timestamptz not null default now(), lease_until timestamptz, ' +
        'sent_at timestamptz, done_at timestamptz, alerted_at timestamptz)');
      await sql('create index if not exists ' + TABLE + '_due on ' + TABLE + ' (env, status, next_at)');
    })().catch(e => { ensured = null; throw e; });
  }
  return ensured;
}

/* Entra a la fila (o ya estaba): -> { queued: true, id, duplicate } */
async function enqueue(o) {
  const sql = db();
  if (!sql) throw new Error('no SQL for the mail outbox');
  await ensure(sql);
  const m = o.message, meta = o.meta || {};
  const to = (m.toRecipients || []).map(r => r.emailAddress.address).join(', ');
  const rows = await sql('insert into ' + TABLE + ' (dedupe_key, env, kind, audience, event, order_id, meta, sender, recipients, subject, payload, attempts, last_error, next_at) ' +
    'values ($1, $2, \'mail\', $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, now() + interval \'1 minute\') on conflict (dedupe_key) do nothing returning id',
  [o.key, envName(), meta.audience || '', meta.event || '', meta.orderId || '', JSON.stringify(meta), o.from, to, str(m.subject).slice(0, 400),
    JSON.stringify({ message: m, saveToSentItems: true }), str(o.error && o.error.message).slice(0, 500)]);
  /* La marca fuera de la base (lib/db-wake): el cron solo despierta la base si hay algo en la fila. */
  if (rows && rows[0]) await require('./db-wake').touch(o.g, wakeFlag(), { force: true });
  if (rows && rows[0]) return { queued: true, id: Number(rows[0].id), duplicate: false };
  const had = await sql('select id from ' + TABLE + ' where dedupe_key = $1', [o.key]);
  return { queued: true, id: had[0] ? Number(had[0].id) : 0, duplicate: true };
}

/* Manda un mensaje armado para Graph. Prendido: con su marca y, si Microsoft no contesta, a la fila.
   -> undefined (salio) | { queued, id, duplicate } ; un error de datos (4xx) o SQL caido -> truena como siempre. */
async function send(g, from, message, meta) {
  const path = '/users/' + encodeURIComponent(from) + '/sendMail';
  const post = () => g.graphFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, saveToSentItems: true }) });
  if (!on() || !meta) { await post(); return undefined; }
  const key = keyOf(from, message);
  mark(message, key);
  try { await post(); return undefined; }
  catch (e) {
    if (!transient(e)) throw e;
    let q;
    try { q = await enqueue({ g, from, message, key, meta, error: e }); }
    catch (e2) { console.error('mail-outbox: could not queue (' + e2.message + '); the email is lost like before'); throw e; }
    console.error('mail-outbox: queued #' + q.id + (q.duplicate ? ' (already there)' : '') + ' ' + (meta.event || '') + ' ' + (meta.orderId || '') + ': ' + e.message);
    return q;
  }
}

/* ---- reintento ---- */
const backoffMin = attempts => BACKOFF_MIN[Math.min(Math.max(attempts, 1), BACKOFF_MIN.length) - 1];

/* ¿Ya esta en Enviados? true / false / null (no se pudo ver: sin permiso de leer el buzon) ; Microsoft caido truena. */
let sentCheck = true;
async function alreadySent(g, row) {
  if (!sentCheck) return null;
  const f = "singleValueExtendedProperties/any(ep: ep/id eq '" + PROP + "' and ep/value eq '" + row.dedupe_key + "')";
  try {
    const r = await g.graphFetch('/users/' + encodeURIComponent(row.sender) + "/mailFolders('sentitems')/messages?$select=id&$top=1&$filter=" + encodeURIComponent(f));
    return !!(r && r.value && r.value.length);
  } catch (e) {
    if (transient(e)) throw e;
    if (e.status === 401 || e.status === 403) { sentCheck = false; console.error('mail-outbox: cannot read Sent Items (' + e.status + '); retries go without that check'); }
    return null;
  }
}

/* Correo al cliente: ¿sigue teniendo sentido? -> '' (si) | el porque no. Truena si no se pudo saber. */
async function orderReason(sql, row) {
  if (row.audience !== 'client' || !row.order_id || !ORDER_EVENTS.has(row.event)) return '';
  let rows;
  try { rows = await sql('select "Status" from "Orders" where "OrderID" = $1 order by "id" desc limit 1', [row.order_id]); }
  catch (e) { if (e && e.code === '42P01') return ''; throw e; }
  if (!rows.length) return 'Order ' + row.order_id + ' was deleted';
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const aboutCancel = row.event === 'request-decision' && meta.kind === 'cancel';
  if (str(rows[0].Status) === 'Cancelled' && !aboutCancel) return 'Order ' + row.order_id + ' was cancelled';
  return '';
}

async function claim(sql) {
  const rows = await sql('update ' + TABLE + ' set lease_until = now() + interval \'' + LEASE_S + ' seconds\', attempts = attempts + 1 where id = (' +
    'select id from ' + TABLE + ' where env = $1 and status = \'pending\' and next_at <= now() and (lease_until is null or lease_until < now()) ' +
    'order by created_at, id limit 1 for update skip locked) returning *', [envName()]);
  return rows[0] || null;
}
const finish = (sql, id, status, note, extra) => sql('update ' + TABLE + ' set status = $2, note = $3, lease_until = null, done_at = now()' +
  (status === 'sent' || status === 'skipped' ? ', payload = null' : '') + (extra || '') + ' where id = $1', [id, status, str(note).slice(0, 500)]);
const later = (sql, row, e) => sql('update ' + TABLE + ' set lease_until = null, last_error = $2, next_at = now() + ($3::text || \' minutes\')::interval where id = $1',
  [row.id, str(e && e.message || e).slice(0, 500), String(backoffMin(row.attempts))]);

/* Una vuelta: -> { sent, skipped, failed, gaveUp, waiting, left } */
async function drain(g, opts) {
  opts = opts || {};
  const out = { sent: 0, skipped: 0, failed: 0, gaveUp: 0, waiting: 0 };
  if (!on()) return Object.assign(out, { off: true });
  const sql = db();
  if (!sql) return Object.assign(out, { off: true, why: 'no SQL' });
  await ensure(sql);
  const until = Date.now() + (opts.budgetMs || 20000);
  const max = opts.max || 25;
  let n = 0;
  while (n < max && Date.now() < until) {
    const row = await claim(sql);
    if (!row) break;
    n++;
    try {
      if (Date.now() - new Date(row.created_at).getTime() > GIVE_UP_MS) {
        await finish(sql, row.id, 'gave_up', 'Not sent after 24 hours: ' + str(row.last_error));
        out.gaveUp++; continue;
      }
      const why = await orderReason(sql, row);
      if (why) { await finish(sql, row.id, 'skipped', why + '; not sent'); out.skipped++; continue; }
      const seen = await alreadySent(g, row);
      if (seen) { await finish(sql, row.id, 'sent', 'Already in Sent Items', ', sent_at = now()'); out.sent++; continue; }
      const body = typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload);
      await g.graphFetch('/users/' + encodeURIComponent(row.sender) + '/sendMail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      await finish(sql, row.id, 'sent', 'Sent on try ' + row.attempts, ', sent_at = now()');
      out.sent++;
      console.log('mail-outbox: sent #' + row.id + ' ' + row.event + ' ' + row.order_id + ' on try ' + row.attempts);
    } catch (e) {
      /* 401/403: otro portal sin permiso para ese buzon; lo reintenta otro. Otro 4xx: el mensaje esta mal, no se repite. */
      if (transient(e) || e.status === 401 || e.status === 403) { await later(sql, row, e).catch(() => {}); out.waiting++; }
      else { await finish(sql, row.id, 'failed', 'Microsoft did not accept it: ' + str(e.message)).catch(() => {}); out.failed++; console.error('mail-outbox: #' + row.id + ' failed:', e.message); }
    }
  }
  await alertGaveUp(g, sql).catch(e => console.error('mail-outbox: alert:', e.message));
  /* Cuando vence el siguiente reintento (lib/db-wake: hasta entonces el cron no despierta la base). */
  try {
    const nx = await sql('select min(next_at) as next, count(*)::int as n from ' + TABLE + ' where env = $1 and status = \'pending\'', [envName()]);
    out.left = nx[0] ? Number(nx[0].n) : 0;
    out.nextAt = nx[0] && nx[0].next ? new Date(nx[0].next).toISOString() : null;
  } catch (e) { out.nextError = e.message; }
  return out;
}
/* La marca de "hay correos esperando" es por ambiente (la fila de cada ambiente solo la vacia ese ambiente). */
function wakeFlag() { return 'mail-' + envName(); }

/* Aviso de 24 h: un correo (app-error, el de siempre) con los que no salieron; se marca alerted_at para no repetirlo. */
async function alertGaveUp(g, sql) {
  const rows = await sql('select id, event, order_id, recipients, subject, last_error, created_at from ' + TABLE +
    ' where env = $1 and status = \'gave_up\' and alerted_at is null and audience <> \'alert\' order by id limit 50', [envName()]);
  if (!rows.length) return 0;
  const notify = require('./notify');
  const list = rows.map(r => [r.event, r.order_id].filter(Boolean).join(' ') + ' → ' + r.recipients);
  const r = await notify.notifyAlert(g, {
    event: 'app-error', queue: true, portal: 'All', count: rows.length, since: new Date(rows[0].created_at).toISOString(),
    route: 'Emails', status: '', error: str(rows[rows.length - 1].last_error).slice(0, 300),
    title: rows.length + (rows.length === 1 ? ' email was' : ' emails were') + ' not sent in 24 hours',
    lines: list, note: 'Microsoft did not take them for a whole day, so the app stopped trying. They were not sent. Nothing goes out unless you decide.'
  });
  if (!r || (!r.sent && !r.queued)) return 0;
  await sql('update ' + TABLE + ' set alerted_at = now() where id = any($1::bigint[])', [rows.map(x => Number(x.id))]);
  return rows.length;
}

/* Al final de cada peticion (vercel-adapter): por detras, maximo una vez por minuto en esta instancia. */
let lastKick = 0, kicking = null;
function kick(getGraph) {
  try {
    if (!on() || kicking || Date.now() - lastKick < KICK_EVERY_MS) return null;
    if (!sqlOverride && !process.env.SQL_MIRROR_URL) return null;
    lastKick = Date.now();
    /* Con DB_WAKE (lib/db-wake): primero la marca; sin correos esperando no se toca la base. */
    kicking = Promise.resolve().then(async () => {
      const g = getGraph();
      const d = await require('./db-wake').due(g, 'mail', { flags: [wakeFlag()] });
      if (!d.run) return { skipped: d.why };
      return drain(g, { budgetMs: 15000, max: 10 });
    })
      .catch(e => console.error('mail-outbox: kick:', e.message)).finally(() => { kicking = null; });
    keepAlive(kicking);
    return kicking;
  } catch (e) { return null; }
}
function keepAlive(p) {
  try {
    const rc = globalThis[Symbol.for('@vercel/request-context')];
    const c = rc && typeof rc.get === 'function' ? rc.get() : null;
    if (c && typeof c.waitUntil === 'function') c.waitUntil(p);
  } catch (e) { /* fuera de Vercel sigue igual */ }
}

module.exports = {
  on, send, drain, kick, enqueue, transient, wakeFlag, keyOf, textOf, mark, PROP, TABLE, ORDER_EVENTS, GIVE_UP_MS,
  /* pruebas */
  _setSql(s) { sqlOverride = s; ensured = null; }, _reset() { lastKick = 0; kicking = null; sentCheck = true; ensured = null; }, _backoffMin: backoffMin
};
