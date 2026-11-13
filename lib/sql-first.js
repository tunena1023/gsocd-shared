/* ============================================================
   gsocd-shared/lib/sql-first.js -- guardar PRIMERO en SQL y mandar a
   SharePoint por detras, de respaldo (CFO 12/11/2026: si Microsoft se cae,
   la gente sigue trabajando).

   Switch por lista y por ambiente: Settings Key "SqlWriteMode",
   Value {"preview": {"Orders": "sql-first", ...}, "production": {...}}.
   Lista que no esta = "sharepoint" (como siempre: SharePoint y copia a SQL).
   Sin el renglon, todo apagado.

   Lista en "sql-first" (lo usa sql-mirror.wrap; ninguna pantalla cambia):
   - create / update / delete van a SQL y contestan con la MISMA forma que
     SharePoint (id, fields, eTag '"<guid>,<version>"', fechas, createdBy).
     En el MISMO comando se forma el renglon en _sp_outbox (fila al respaldo).
   - id nuevo: _sp_seq por tabla, desde el maximo id + ID_MIN. Todo id >= ID_MIN
     nacio en SQL (los de SharePoint van en miles); su id de SharePoint va en sp_id.
   - update con If-Match: contra la version de SQL; si no es la misma, 412 como
     SharePoint. Cada cambio sube la version.
   - Lecturas: siempre de SQL; si SQL falla, error (la pantalla se queda con lo
     ultimo que vio). Nunca SharePoint, que puede ir atrasado.
   - Un renglon nacido en SQL (id >= ID_MIN) siempre se guarda y se lee asi,
     aunque su lista ya no este en sql-first.
   Fila al respaldo (drain): al final de cada guardado (por detras) y con el cron
   cron-sp-outbox (Admin, cada 5 min). Orden estricto por renglon; un servidor a
   la vez por renglon (locked_until). Si Microsoft falla, reintenta con espera
   creciente. SQL gana: 404 en un cambio = se crea otra vez con lo de SQL; columna
   que SharePoint no tiene = se manda sin ella; todo se anota en "note" y el log.
   Lo que no sale en STUCK_HOURS queda con stuck_at y el cron manda el aviso de
   errores (app-error) una vez.
============================================================ */
'use strict';

const crypto = require('crypto');

const ID_MIN = 1000000;
const MODE_KEY = 'SqlWriteMode';
const MODE_TTL_MS = 30 * 1000;
const WRITE_TIMEOUT_MS = 10000;
const READ_TIMEOUT_MS = 8000;
const LOCK_MIN = 5;
const MAX_BACKOFF_S = 3600;
const STUCK_HOURS = Number(process.env.SQL_OUTBOX_STUCK_HOURS) || 6;
const APP = 'SharePoint App';
/* Columnas de texto que guardan ids de renglones de otra lista (se traducen a sp_id antes de mandar a SharePoint). */
const REFS = {
  ClientAddresses: { ContactId: 'ClientContacts' },
  ClientContacts: { BuildingIds: 'ClientAddresses' },
  ClientHolidays: { BuildingId: 'ClientAddresses' },
  Orders: { OrderContactId: 'ClientContacts', BuildingId: 'ClientAddresses', RecurringServiceID: 'RecurringServices', InspectionContractID: 'RecurringServices' },
  RecurringAssignments: { RecurringServiceID: 'RecurringServices', PayrollNumber: 'Techs', Title: 'RecurringServices' },
  RecurringLog: { RecurringServiceID: 'RecurringServices', PeopleJSON: 'Techs' },
  Scheduling: { PayrollNumber: 'Techs' },
  RecurringImportMatrix: { LinkedRecurringServiceID: 'RecurringServices' },
  SupplyItemHistory: { ItemID: 'SupplyItems', Key: 'SupplyItems' },
  EquipmentPieces: { ItemID: 'SupplyItems' },
  Kits: { BuildingKey: 'ClientAddresses' },
  PushSubscriptions: { ContactId: 'ClientContacts', Title: 'ClientContacts' },
  /* Llaves y titulos con el id adentro (e2e con ids distintos en el respaldo, 12/11): "<ClientID> <ContactId>",
     "<contrato>-<PayrollID>", "<ItemID>|<hora>|<que>", "task:<id>", "RC-<contrato>". */
  TasksActivity: { Key: 'Tasks', Title: 'Tasks' },
  NotificationLog: { Title: 'RecurringServices', OrderID: 'RecurringServices' },
  TechLocations: { TechId: 'Techs', Title: 'Techs' },
  TechPhotoLog: { TechId: 'Techs' },
  TechDeviceTokens: { Title: 'Techs' },
  OrderAssignments: { TechID: 'Techs' }
};

const q = s => '"' + String(s).replace(/"/g, '""') + '"';
const M = () => require('./sql-mirror');
const R = () => require('./sql-read');
const ME = 'w-' + crypto.randomBytes(4).toString('hex');
const stats = { writes: 0, reads: 0, sent: 0, failed: 0, deferred: 0, notes: 0, lastError: '' };

function httpError(status, msg, code) { const e = new Error(msg); e.status = status; if (code) e.code = code; return e; }
function withTimeout(p, ms, what) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(what + ' timed out after ' + ms + ' ms')), ms); })]).finally(() => clearTimeout(t));
}
const isSqlBorn = id => /^\d+$/.test(String(id)) && Number(id) >= ID_MIN;
const envName = () => process.env.VERCEL_ENV || 'development';

/* ---- el switch ---- */
let cache = { at: 0, value: null };
let lastGood = null;
function clearModeCache() { cache = { at: 0, value: null }; }
function parseEnvOverride() {
  /* Solo pruebas locales (sims con el modo prendido): '*' o {"Orders":"sql-first"}. En Vercel no cuenta. */
  const v = process.env.SQL_WRITE_MODE || '';
  if (!v || process.env.VERCEL) return null;
  if (v === '*') return { '*': 'sql-first' };
  try { return JSON.parse(v) || {}; } catch (e) { return null; }
}
async function modes(deps, base, samplePath) {
  if (deps && deps.writeMode) return deps.writeMode;
  const env = parseEnvOverride();
  if (env) return env;
  if (cache.value && Date.now() - cache.at < MODE_TTL_MS) return cache.value[envName()] || {};
  const parse = s => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
  const sql = (deps && deps.sql) || M().client(process.env.SQL_READ_URL || '');
  if (sql && R().sqlOk()) {
    try {
      const rows = await withTimeout(sql('select "Value" from "Settings" where "Key" = $1 order by "id" limit 1', [MODE_KEY]), 3000, 'SQL switch');
      cache = { at: Date.now(), value: parse(rows && rows[0] && rows[0].Value) };
      lastGood = cache.value;
      return cache.value[envName()] || {};
    } catch (e) { R().trip(e); }
  }
  /* SQL no contesta: lo ultimo que se supo; si nunca se supo, el renglon de SharePoint. */
  if (lastGood) return lastGood[envName()] || {};
  if (base && samplePath) {
    try {
      const root = String(samplePath).replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '').replace(/\/lists\/[^/]+\/items.*$/, '/lists/Settings/items');
      const r = await base(root + '?$expand=fields&$top=5&$filter=' + encodeURIComponent("fields/Key eq '" + MODE_KEY + "'"), { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
      const row = (r && r.value || [])[0];
      cache = { at: Date.now(), value: parse(row && row.fields && row.fields.Value) };
      return cache.value[envName()] || {};
    } catch (e) { /* abajo */ }
  }
  cache = { at: Date.now(), value: {} };
  return {};
}
async function modeFor(list, deps, base, samplePath) {
  const m = await modes(deps, base, samplePath);
  return (m[list] || m['*']) === 'sql-first' ? 'sql-first' : 'sharepoint';
}

/* ---- tablas de la app (vacias; las crea el codigo la primera vez que se prende algo) ---- */
const ready = new WeakMap();
function ensureSchema(sql) {
  if (!ready.has(sql)) {
    const p = (async () => {
      await sql('create table if not exists "_sp_outbox" ("n" bigserial primary key, "at" timestamptz not null default now(), "list" text not null, ' +
        '"row_id" bigint not null, "sp_id" bigint, "op" text not null, "fields" jsonb, "site" text, "tries" int not null default 0, ' +
        '"next_at" timestamptz not null default now(), "locked_until" timestamptz, "locked_by" text, "done_at" timestamptz, "last_error" text, ' +
        '"note" text, "stuck_at" timestamptz, "alerted_at" timestamptz)');
      await sql('create index if not exists "ix__sp_outbox_open" on "_sp_outbox" ("list", "row_id", "n") where "done_at" is null');
      await sql('create table if not exists "_sp_seq" ("list" text primary key, "last" bigint not null)');
      await sql('create table if not exists "_sp_list_mod" ("list" text primary key, "at" timestamptz not null)');
      await sql('create table if not exists "_sp_columns" ("list" text not null, "name" text not null, "kind" text, "max_len" int, "choices" jsonb, ' +
        '"fill_in" boolean, "read_only" boolean, "at" timestamptz not null default now(), primary key ("list", "name"))');
    })();
    ready.set(sql, p);
    p.catch(() => ready.delete(sql));
  }
  return ready.get(sql);
}
let spReady = new WeakMap();
async function ensureSpId(sql, table) {
  if (!spReady.has(sql)) spReady.set(sql, new Map());
  const m = spReady.get(sql);
  if (!m.has(table)) {
    const p = M().columnsOf(sql, table, true).then(c => (!c.size || c.has('sp_id')) ? c
      : sql('alter table ' + q(table) + ' add column if not exists "sp_id" bigint').then(() => M().columnsOf(sql, table, true)));
    m.set(table, p);
    p.catch(() => m.delete(table));
  }
  return m.get(table);
}

/* ---- valores ---- */
const CAST = { numeric: 'numeric', integer: 'numeric', bigint: 'numeric', 'double precision': 'numeric', boolean: 'boolean', 'timestamp with time zone': 'timestamptz' };
const castOf = type => '::' + (CAST[type] || 'text');
/* Fecha sin hora ('2026-11-20'): SharePoint la guarda a la medianoche de la zona del sitio (SP_SITE_TZ); igual aqui. */
const SP_TZ = process.env.SP_SITE_TZ || 'America/Los_Angeles';
/* Fecha con hora sin zona ('2026-10-02T07:00'): SharePoint tambien la toma en la zona del sitio (visto en produccion:
   RecurringServices.Time 07:00 -> ServiceAssignments.ScheduledDate 14:00Z en octubre). */
function midnightIn(ymd, tz) {
  const [, y, m, d, hh, mm, ss] = (/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(ymd) || []).map(Number);
  const utc = Date.UTC(y, m - 1, d, hh || 0, mm || 0, ss || 0);
  const off = t => {
    const p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(t)).forEach(x => { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  };
  let t = utc - off(utc);
  t = utc - off(t);
  return new Date(t).toISOString();
}
function sqlValue(v, type) {
  if (type === 'timestamp with time zone' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(String(v))) return midnightIn(String(v), SP_TZ);
  const x = M().toSql(v, type);
  return x === '' ? null : x;
}
/* Los campos que son columnas (sin @odata, sin los de sistema de SharePoint). */
function userFields(f) {
  const out = {};
  Object.keys(f || {}).forEach(k => { if (!k.includes('@odata') && !M().JUNK.test(k) && !M().SYS.includes(k) && k !== 'sp_id') out[k] = f[k]; });
  return out;
}
const catalogType = { text: 'text', note: 'text', number: 'numeric', boolean: 'boolean' };
/* ---- lo que SharePoint rechazaria se rechaza ANTES de guardar en SQL (si no, el respaldo se traba) ---- */
/* Las columnas de cada lista como SharePoint las define (_sp_columns: una linea / varias, maximo, opciones de una
   choice, solo lectura). Las llena refreshColumns (el cron una vez al dia por lista en sql-first, y al prender una). */
const SP_KIND = c => c.calculated ? 'calculated' : c.text ? (c.text.allowMultipleLines ? 'note' : 'text') : c.choice ? 'choice' : c.number || c.currency ? 'number'
  : c.boolean ? 'boolean' : c.dateTime ? 'dateTime' : c.lookup || c.personOrGroup ? 'lookup' : 'other';
async function refreshColumns(opts) {
  const sql = opts.sql || M().client();
  await ensureSchema(sql);
  const r = await opts.graphFetch(String(opts.listPath).replace(/\/items$/, '') + '/columns?$top=500');
  const cols = ((r && r.value) || []).filter(c => c && c.name);
  if (!cols.length) return 0;
  const rows = cols.map(c => [c.name, SP_KIND(c), (c.text && !c.text.allowMultipleLines) ? (c.text.maxLength || 255) : null,
    c.choice ? JSON.stringify(c.choice.choices || []) : null, !!(c.choice && c.choice.allowTextEntry), !!c.readOnly]);
  await sql('delete from "_sp_columns" where "list" = $1', [opts.list]);
  await sql('insert into "_sp_columns" ("list", "name", "kind", "max_len", "choices", "fill_in", "read_only") select $1, x->>0, x->>1, (x->>2)::int, (x->3), (x->>4)::boolean, (x->>5)::boolean from jsonb_array_elements($2::jsonb) x',
    [opts.list, JSON.stringify(rows)]);
  rulesCache.delete(opts.list);
  return rows.length;
}
const rulesCache = new Map();
async function rulesFor(sql, list) {
  const c = rulesCache.get(list);
  if (c && Date.now() - c.at < 10 * 60 * 1000) return c.rules;
  let rows = [];
  try { rows = await sql('select "name", "kind", "max_len", "choices", "fill_in", "read_only" from "_sp_columns" where "list" = $1', [list]); }
  catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  const rules = new Map(rows.map(r => [r.name, r]));
  rulesCache.set(list, { at: Date.now(), rules });
  return rules;
}
const bad = msg => httpError(400, msg + ' [sql]', 'invalidRequest');
const empty = v => v === null || v === undefined || v === '';
function validate(table, fields, rules, cols, spec) {
  for (const k of Object.keys(fields)) {
    const v = fields[k];
    const rule = rules.get(k) || rules.get(k.replace(/LookupId$/, ''));
    const typed = spec && (spec.columns || []).find(x => x.name === k && x.type);
    if (!rule && !cols.has(k) && !typed) {
      if (empty(v)) { delete fields[k]; continue; }
      throw bad("Field '" + k + "' is not recognized");
    }
    if (!rule || empty(v)) continue;
    if (rule.read_only || rule.kind === 'calculated') throw bad("Field '" + k + "' is read only");
    if (rule.kind === 'text' && typeof v === 'string' && v.length > (rule.max_len || 255)) throw bad("The value of field '" + k + "' is longer than " + (rule.max_len || 255) + ' characters');
    if (rule.kind === 'choice' && !rule.fill_in) {
      const ch = Array.isArray(rule.choices) ? rule.choices : (() => { try { return JSON.parse(rule.choices || '[]'); } catch (e) { return []; } })();
      if (ch.length && !ch.includes(String(v))) throw bad("'" + v + "' is not one of the choices of field '" + k + "'");
    }
    if (rule.kind === 'number' && !isFinite(Number(v))) throw bad("Field '" + k + "' needs a number");
  }
}
const SQL_TYPE = { text: 'text', note: 'text', choice: 'text', number: 'numeric', boolean: 'boolean', dateTime: 'timestamptz' };
async function columnsFor(sql, table, fields, deps) {
  const cols = await ensureSpId(sql, table);
  if (!cols || !cols.size) throw httpError(404, "List '" + table + "' does not exist. [sql]", 'itemNotFound');
  const spec = deps && deps.catalog ? ((() => { try { return deps.catalog() || []; } catch (e) { return []; } })().find(L => L.list === table) || null) : null;
  const rules = await rulesFor(sql, table);
  validate(table, fields, rules, cols, spec);
  const missing = Object.keys(fields).filter(k => !cols.has(k) && !empty(fields[k]));
  Object.keys(fields).forEach(k => { if (!cols.has(k) && empty(fields[k])) delete fields[k]; });
  if (!missing.length) return cols;
  for (const n of missing) {
    const c = spec && (spec.columns || []).find(x => x.name === n);
    const r = rules.get(n);
    const type = (c && catalogType[c.type]) || (r && SQL_TYPE[r.kind]) || ({ boolean: 'boolean', number: 'numeric' }[typeof fields[n]] || 'text');
    console.error('sql-first: new column ' + table + '.' + n + ' added to SQL as ' + type);
    await sql('alter table ' + q(table) + ' add column if not exists ' + q(n) + ' ' + type);
  }
  return M().columnsOf(sql, table, true);
}

function sitePrefix(path) {
  const p = String(path || '').replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '').split('?')[0];
  const i = p.indexOf('/lists/');
  return i > 0 ? p.slice(0, i) : '';
}
function bodyOf(options) {
  let b = options && options.body;
  if (typeof b === 'string') { try { b = JSON.parse(b || '{}'); } catch (e) { throw httpError(400, 'Invalid JSON body. [sql]', 'invalidRequest'); } }
  return b && typeof b === 'object' ? b : {};
}
function ifMatchOf(options) {
  const h = (options && options.headers) || {};
  let v = null;
  if (typeof h.get === 'function') v = h.get('If-Match');
  else Object.keys(h).forEach(k => { if (k.toLowerCase() === 'if-match') v = h[k]; });
  if (v === null || v === undefined || v === '') return null;
  v = String(v).trim().replace(/^W\//, '');
  if (v === '*') return '*';
  return v.startsWith('"') ? v : '"' + v + '"';
}

/* ---- guardar (lista en sql-first, o renglon nacido en SQL) ---- */
async function write(w, path, options, deps) {
  const sql = deps.sql || M().client();
  if (!sql) throw httpError(503, 'The database is not connected. Nothing was saved. [sql]');
  const site = sitePrefix(path);
  stats.writes++;
  try {
    return await withTimeout((async () => {
      await ensureSchema(sql);
      const table = w.list;
      if (w.op === 'delete') return del(sql, table, w.id, site);
      const body = bodyOf(options);
      const raw = w.op === 'create' || w.op === 'update' ? (body.fields && typeof body.fields === 'object' ? body.fields : (w.op === 'create' ? {} : body)) : body;
      const fields = userFields(raw);
      const cols = await columnsFor(sql, table, fields, deps);
      if (w.op === 'create') return create(sql, table, fields, raw, cols, site);
      return update(sql, table, w, fields, raw, cols, site, ifMatchOf(options));
    })(), deps.writeTimeoutMs || WRITE_TIMEOUT_MS, 'SQL save');
  } catch (e) {
    if (e.status && e.status < 500) throw e;
    stats.lastError = e.message;
    R().trip(e, deps.breakerMs);
    console.error('sql-first: ' + w.op + ' ' + w.list + (w.id ? ' #' + w.id : '') + ' not saved: ' + e.message);
    throw httpError(503, 'The database did not answer, so this was not saved. Try again. (' + e.message + ')', 'sqlUnavailable');
  }
}

/* Lo que se manda a SharePoint despues: lo mismo que mando la app (las llaves @odata incluidas). */
/* (SharePoint no acepta '' en numero, fecha ni Si/No: se manda vacio como null.) */
const forSp = (raw, cols) => {
  const o = {};
  Object.keys(raw || {}).forEach(k => {
    if (k === 'id' || k === 'ID') return;
    const t = cols && cols.get(k);
    o[k] = raw[k] === '' && t && t !== 'text' ? null : raw[k];
  });
  return o;
};

async function create(sql, table, fields, raw, cols, site) {
  const names = Object.keys(fields).filter(k => fields[k] !== null && fields[k] !== '' && fields[k] !== undefined);
  const params = [table, APP, crypto.randomUUID(), JSON.stringify(forSp(raw, cols)), site];
  const vals = names.map(n => { params.push(sqlValue(fields[n], cols.get(n))); return '$' + params.length + castOf(cols.get(n)); });
  const T = q(table);
  const text =
    'with seq as (insert into "_sp_seq" ("list", "last") values ($1, (select coalesce(max("id"), 0) + ' + ID_MIN + ' from ' + T + ')) ' +
    'on conflict ("list") do update set "last" = greatest("_sp_seq"."last" + 1, (select coalesce(max("id"), 0) + 1 from ' + T + ')) returning "last"), ' +
    'ins as (insert into ' + T + ' ("id", "created_at", "modified_at", "created_by", "modified_by", "etag"' + names.map(n => ', ' + q(n)).join('') + ') ' +
    'select seq."last", date_trunc(\'second\', now()), date_trunc(\'second\', now()), $2, $2, \'"\' || $3 || \',1"\'' + vals.map(v => ', ' + v).join('') + ' from seq returning *), ' +
    'ob as (insert into "_sp_outbox" ("list", "row_id", "op", "fields", "site") select $1, ins."id", \'create\', $4::jsonb, $5 from ins returning "n"), ' +
    MARK(1, 'ins') +
    'select ins.*, (select "n" from ob) as "_outbox", (select "at" from mk) as "_mark" from ins';
  const row = (await sql(text, params))[0];
  return R().itemOf(row, cols, { expandFields: true });
}

/* La marca "cambio algo?" de la lista (lo que SharePoint da en /lists/X lastModifiedDateTime): sube con cada
   guardado, tambien al borrar, en el mismo comando. */
const MARK = (p, from) => 'mk as (insert into "_sp_list_mod" ("list", "at") select $' + p + ', clock_timestamp() from ' + from + ' limit 1 ' +
  'on conflict ("list") do update set "at" = greatest(excluded."at", "_sp_list_mod"."at" + interval \'1 millisecond\') returning "at") ';
const NEXT_ETAG = T => '\'"\' || coalesce(substring(' + T + '."etag" from \'^"?([^,"]+)\'), $3) || \',\' || (coalesce(substring(' + T + '."etag" from \',(\\d+)"?$\')::int, 0) + 1) || \'"\'';
const SP_OF = 'coalesce(u."sp_id", case when u."id" < ' + ID_MIN + ' then u."id" end)';

async function update(sql, table, w, fields, raw, cols, site, ifMatch) {
  if (!/^\d+$/.test(String(w.id))) throw httpError(404, 'Item not found. [sql]', 'itemNotFound');
  const id = Number(w.id);
  const T = q(table);
  const params = [id, APP, crypto.randomUUID(), ifMatch, table, JSON.stringify(forSp(raw, cols)), site];
  const sets = Object.keys(fields).map(n => { params.push(sqlValue(fields[n], cols.get(n))); return q(n) + ' = $' + params.length + castOf(cols.get(n)); });
  const text =
    'with u as (update ' + T + ' set ' + sets.concat(['"modified_at" = date_trunc(\'second\', now())', '"modified_by" = $2', '"etag" = ' + NEXT_ETAG(T)]).join(', ') +
    ' where "id" = $1 and ($4::text is null or $4::text = \'*\' or ' + T + '."etag" = $4::text) returning *), ' +
    'ob as (insert into "_sp_outbox" ("list", "row_id", "sp_id", "op", "fields", "site") select $5, u."id", ' + SP_OF + ', \'update\', $6::jsonb, $7 from u returning "n"), ' +
    MARK(5, 'u') +
    'select u.*, (select "n" from ob) as "_outbox", (select "at" from mk) as "_mark" from u';
  const row = (await sql(text, params))[0];
  if (!row) {
    const cur = (await sql('select "etag" from ' + T + ' where "id" = $1', [id]))[0];
    if (!cur) throw httpError(404, 'Item not found. [sql]', 'itemNotFound');
    throw httpError(412, "Precondition Failed (412): The request ETag value '" + ifMatch + "' does not match the object's ETag value '" + cur.etag + "'. [sql]", 'resourceModified');
  }
  if (w.op === 'update') return R().itemOf(row, cols, { expandFields: true });
  return R().fieldsOf(row, cols, null);
}

async function del(sql, table, idStr, site) {
  if (!/^\d+$/.test(String(idStr))) throw httpError(404, 'Item not found. [sql]', 'itemNotFound');
  await ensureSpId(sql, table);
  const T = q(table);
  const text = 'with u as (delete from ' + T + ' where "id" = $1 returning "id", "sp_id"), ' +
    'ob as (insert into "_sp_outbox" ("list", "row_id", "sp_id", "op", "site") select $2, u."id", ' + SP_OF + ', \'delete\', $3 from u returning "n"), ' +
    MARK(2, 'u') +
    'select u."id", (select "n" from ob) as "_outbox", (select "at" from mk) as "_mark" from u';
  const row = (await sql(text, [Number(idStr), table, site]))[0];
  if (!row) throw httpError(404, 'Item not found. [sql]', 'itemNotFound');
  return null;
}

/* GET /lists/X?$select=...lastModifiedDateTime de una lista en sql-first: la marca de SQL. null = no hay marca
   todavia (nada se ha guardado en SQL primero): la de SharePoint sirve. */
async function listMarker(list, deps) {
  const sql = deps.sql || M().client();
  if (!sql) return null;
  let r;
  try { r = await withTimeout(sql('select "at" from "_sp_list_mod" where "list" = $1', [list]), deps.sqlFirstReadTimeoutMs || READ_TIMEOUT_MS, 'SQL marker'); }
  catch (e) {
    if (/does not exist/i.test(e.message)) return null;
    R().trip(e, deps.breakerMs);
    throw httpError(503, 'The database did not answer. (' + e.message + ')', 'sqlUnavailable');
  }
  if (!r || !r[0]) return null;
  const at = new Date(r[0].at).toISOString();
  return { id: list, name: list, displayName: list, lastModifiedDateTime: at };
}

/* ---- leer (lista en sql-first): siempre SQL, nunca SharePoint ---- */
async function read(path, raw, deps) {
  const sql = deps.sql || (deps.client ? deps.client() : M().client());
  stats.reads++;
  const r = R().parseRead(path);
  if (!sql) throw httpError(503, 'The database is not connected. [sql]');
  if (raw) throw httpError(400, 'This list is read from SQL only; a raw read is not supported. [sql]');
  let res;
  try { res = await withTimeout(R().answer(sql, path, deps.columnsOf || M().columnsOf), deps.sqlFirstReadTimeoutMs || READ_TIMEOUT_MS, 'SQL read'); }
  catch (e) {
    if (e.status === 404) throw e;
    stats.lastError = e.message;
    R().trip(e, deps.breakerMs);
    console.error('sql-first: ' + (r && r.list) + ' could not be read from SQL: ' + e.message);
    throw httpError(503, 'The database did not answer. Showing what was loaded before. (' + e.message + ')', 'sqlUnavailable');
  }
  if (res === null) {
    console.error('sql-first: ' + (r && r.list) + ': query SQL cannot answer: ' + String(path).slice(0, 300));
    throw httpError(501, 'This query cannot be answered from SQL. [sql]', 'notSupported');
  }
  return res;
}

/* ---- la fila al respaldo ---- */
function backoff(tries) { return Math.min(MAX_BACKOFF_S, 30 * Math.pow(2, Math.max(0, tries))); }
async function exists(sql) {
  const r = await sql("select to_regclass('public._sp_outbox') is not null as ok");
  return !!(r && r[0] && r[0].ok);
}
async function claim(sql, me, k) {
  return sql('update "_sp_outbox" o set "locked_until" = now() + interval \'' + LOCK_MIN + ' minutes\', "locked_by" = $1 where o."n" in (' +
    'select a."n" from "_sp_outbox" a where a."done_at" is null and a."next_at" <= now() and (a."locked_until" is null or a."locked_until" < now()) ' +
    'and not exists (select 1 from "_sp_outbox" b where b."list" = a."list" and b."row_id" = a."row_id" and b."done_at" is null and b."n" < a."n") ' +
    'order by a."n" limit $2 for update skip locked) returning o.*', [me, k]);
}
async function rowOf(sql, table, id) {
  try { return (await sql('select * from ' + q(table) + ' where "id" = $1', [Number(id)]))[0] || null; } catch (e) { return null; }
}
/* El id de SharePoint de un renglon: el de la fila, el del renglon, el del create ya hecho, o el mismo id si nacio en SharePoint. */
async function spIdFor(sql, e) {
  if (e.sp_id) return Number(e.sp_id);
  const row = await rowOf(sql, e.list, e.row_id);
  if (row && row.sp_id) return Number(row.sp_id);
  const c = (await sql('select "sp_id" from "_sp_outbox" where "list" = $1 and "row_id" = $2 and "op" = \'create\' and "sp_id" is not null order by "n" desc limit 1', [e.list, e.row_id]))[0];
  if (c && c.sp_id) return Number(c.sp_id);
  if (Number(e.row_id) < ID_MIN) return Number(e.row_id);
  return null;
}
/* El id de SharePoint de un renglon nacido en SQL (null si todavia no llega). */
async function spIdOf(list, id, sql) {
  sql = sql || M().client();
  if (!sql || !list) return null;
  const r = (await sql('select to_jsonb(t)->>\'sp_id\' as sp from ' + q(list) + ' t where "id" = $1', [Number(id)]).catch(() => []))[0];
  return r && r.sp ? Number(r.sp) : null;
}
/* ids nacidos en SQL dentro de columnas que apuntan a otra lista -> su id de SharePoint. */
async function translate(sql, list, fields) {
  const refs = Object.assign({}, REFS[list] || {});
  Object.keys(fields).forEach(k => { if (/LookupId$/.test(k) && !refs[k]) { const t = (REFS[list] || {})[k.replace(/LookupId$/, '')]; if (t) refs[k] = t; } });
  const out = Object.assign({}, fields);
  for (const col of Object.keys(refs)) {
    const v = out[col];
    if (v === null || v === undefined || v === '') continue;
    const target = refs[col];
    /* Solo numeros con forma de id nacido en SQL ("tech:1000123", "CT-1000123", "12,1000456"); uno que no es renglon de esa
       lista se deja como esta (no era un id). */
    const ids = [...new Set((Array.isArray(v) ? v : String(v).match(/\d+/g) || []).map(String).filter(x => isSqlBorn(x) && Number(x) < 1e9))];
    if (!ids.length) continue;
    const rows = await sql('select "id", to_jsonb(t)->>\'sp_id\' as sp from ' + q(target) + ' t where "id" = any($1::bigint[])', [ids.map(Number)]);
    const map = new Map(rows.filter(r => r.sp).map(r => [String(r.id), String(r.sp)]));
    const missing = rows.filter(r => !r.sp).map(r => String(r.id));
    if (missing.length) throw Object.assign(new Error(col + ' points to ' + target + ' #' + missing.join(',') + ', not in SharePoint yet'), { defer: true });
    if (Array.isArray(v)) out[col] = v.map(x => map.has(String(x)) ? (typeof x === 'number' ? Number(map.get(String(x))) : map.get(String(x))) : x);
    else if (typeof v === 'number') out[col] = map.has(String(v)) ? Number(map.get(String(v))) : v;
    else out[col] = String(v).replace(/\d+/g, m => map.has(m) ? map.get(m) : m);
  }
  return out;
}
const COL_MISSING_RE = /\b(?:field|column)\b\s*'([^']*)'?[^.]*?\b(?:is not recognized|not recognized|does not exist)\b/i;
const statusOf = e => (e && e.status) ? Number(e.status) : (/\b(4\d\d|5\d\d)\b/.exec(String(e && e.message || '')) || [])[1] * 1 || 0;
/* Manda a SharePoint; una columna que SharePoint no tiene (y sp-heal no pudo crear) se quita y se anota: SQL la conserva. */
async function send(base, path, method, fields, notes, headers) {
  const f = Object.assign({}, fields);
  for (let i = 0; i < 6; i++) {
    try {
      return await base(path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: method === 'DELETE' ? undefined : JSON.stringify(method === 'POST' ? { fields: f } : f) });
    } catch (e) {
      const msg = String(e && e.message || '');
      const m = COL_MISSING_RE.exec(msg);
      const k = m && Object.keys(f).find(x => x === m[1] || x === m[1] + 'LookupId');
      if (k) { delete f[k]; notes.push("SharePoint has no column '" + k + "': kept only in SQL"); continue; }
      /* Texto de una linea de mas de 255 (SharePoint dice que no): al respaldo va cortado, SQL tiene todo. */
      const named = (/'([^']+)'/.exec(msg) || [])[1];
      const long = Object.keys(f).filter(x => typeof f[x] === 'string' && f[x].length > 255 && (!named || named === x));
      if (statusOf(e) === 400 && /length|too long|exceed|255/i.test(msg) && long.length) {
        long.forEach(x => { f[x] = f[x].slice(0, 255); });
        notes.push('SharePoint takes 255 characters in ' + long.join(', ') + ': the backup has the first 255, SQL has it all');
        continue;
      }
      throw e;
    }
  }
  throw new Error('too many missing columns');
}
function spFieldsFromRow(row, cols) {
  const f = R().fieldsOf(row, cols, null);
  ['@odata.etag', 'id', 'Created', 'Modified'].forEach(k => { delete f[k]; });
  return f;
}
/* Renglon de SharePoint creado desde que el cambio entro a la fila (menos 2 min), con los mismos campos, que ningun
   renglon de SQL tiene como suyo. Si no se puede buscar, null (se crea y se anota). Se leen todas las paginas (hasta
   ALREADY_PAGES; con SharePoint caido un rato hay mas de 200) y se revisa del mas nuevo al mas viejo. */
const ALREADY_PAGES = 25;
async function alreadyThere(sql, base, items, e, fields) {
  const since = new Date(new Date(e.at).getTime() - 120000).toISOString();
  const found = [];
  try {
    let url = items + '?$expand=fields&$top=200&$filter=' + encodeURIComponent("fields/Created ge '" + since + "'");
    for (let i = 0; url && i < ALREADY_PAGES; i++) {
      const r = await base(url, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
      found.push(...((r && r.value) || []));
      url = (r && r['@odata.nextLink']) || null;
    }
  } catch (err) { if (!found.length) return null; }
  found.sort((a, b) => Number(b.id) - Number(a.id));
  const r = { value: found };
  const same = (a, b) => (a === null || a === undefined || a === '') ? (b === null || b === undefined || b === '') : String(a) === String(b) || Number(a) === Number(b) && a !== '' && b !== '';
  const keys = Object.keys(fields).filter(k => !k.includes('@odata') && fields[k] !== null && fields[k] !== '' && typeof fields[k] !== 'object');
  for (const it of (r && r.value) || []) {
    const f = it.fields || {};
    if (!keys.length || !keys.every(k => same(fields[k], f[k]) || (typeof f[k] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(f[k]) && Date.parse(f[k]) === Date.parse(sqlValue(fields[k], 'timestamp with time zone'))))) continue;
    const id = Number(it.id);
    const taken = (await sql('select 1 from ' + q(e.list) + ' t where (to_jsonb(t)->>\'sp_id\')::bigint = $1 or ("id" = $1 and "id" < ' + ID_MIN + ') limit 1', [id]))[0];
    if (!taken) return id;
  }
  return null;
}
async function processOne(sql, base, e, me) {
  const notes = [];
  const items = (e.site || '') + '/lists/' + encodeURIComponent(e.list) + '/items';
  const done = async (spId) => {
    if (notes.length) { stats.notes++; console.error('sql-first: backup ' + e.list + ' #' + e.row_id + ' (' + e.op + '): ' + notes.join('; ')); }
    await sql('update "_sp_outbox" set "done_at" = now(), "locked_until" = null, "sp_id" = coalesce($3, "sp_id"), "note" = $4, "stuck_at" = null where "n" = $1 and "locked_by" = $2',
      [e.n, me, spId || null, notes.length ? notes.join('; ').slice(0, 1000) : null]);
    stats.sent++;
  };
  const setSpId = async spId => {
    await sql('update ' + q(e.list) + ' set "sp_id" = $2 where "id" = $1', [e.row_id, spId]).catch(() => {});
    await sql('update "_sp_outbox" set "sp_id" = $3 where "list" = $1 and "row_id" = $2 and "done_at" is null and "sp_id" is null', [e.list, e.row_id, spId]);
  };
  const recreate = async why => {
    const row = await rowOf(sql, e.list, e.row_id);
    if (!row) { notes.push(why + '; the row is gone in SQL too'); return null; }
    const cols = await M().columnsOf(sql, e.list, true);
    const res = await send(base, items, 'POST', await translate(sql, e.list, spFieldsFromRow(row, cols)), notes);
    notes.push(why + ': created again in SharePoint from SQL as #' + res.id);
    await setSpId(Number(res.id));
    return Number(res.id);
  };
  try {
    if (e.op === 'create') {
      const fields = await translate(sql, e.list, e.fields || {});
      /* Un intento anterior que fallo pudo haber quedado guardado en SharePoint (la respuesta se perdio): antes de crear
         otra vez se busca entre lo creado desde que entro a la fila uno igual que ningun renglon de SQL tenga ya. */
      if (e.tries > 0 && !/not in SharePoint yet/.test(String(e.last_error || ''))) {
        const found = await alreadyThere(sql, base, items, e, fields);
        if (found) { notes.push('SharePoint already had it (#' + found + ', an earlier answer was lost): not created twice'); await setSpId(found); return done(found); }
      }
      const res = await send(base, items, 'POST', fields, notes);
      await setSpId(Number(res.id));
      return done(Number(res.id));
    }
    const sp = await spIdFor(sql, e);
    if (!sp) throw Object.assign(new Error('waiting for its create to reach SharePoint'), { defer: true });
    if (e.op === 'delete') {
      try { await send(base, items + '/' + sp, 'DELETE', {}, notes); }
      catch (err) { if (statusOf(err) !== 404) throw err; notes.push('already gone in SharePoint'); }
      return done(sp);
    }
    const fields = await translate(sql, e.list, e.fields || {});
    try { await send(base, items + '/' + sp + '/fields', 'PATCH', fields, notes); return done(sp); }
    catch (err) {
      const s = statusOf(err);
      if (s === 404) return done(await recreate('not found in SharePoint (#' + sp + ')') || sp);
      if (s === 412) { await send(base, items + '/' + sp + '/fields', 'PATCH', fields, notes, { 'If-Match': '*' }); notes.push('SharePoint said 412: SQL won'); return done(sp); }
      throw err;
    }
  } catch (err) {
    const defer = !!err.defer;
    if (defer) stats.deferred++; else stats.failed++;
    stats.lastError = err.message;
    if (!defer) console.error('sql-first: backup ' + e.list + ' #' + e.row_id + ' (' + e.op + ') to SharePoint failed (try ' + (e.tries + 1) + '): ' + err.message);
    const wait = defer ? 30 : backoff(e.tries);
    await sql('update "_sp_outbox" set "tries" = "tries" + 1, "next_at" = now() + ($3 || \' seconds\')::interval, "last_error" = $4, "locked_until" = null, "note" = $5 where "n" = $1 and "locked_by" = $2',
      [e.n, me, String(wait), ((statusOf(err) ? '[' + statusOf(err) + '] ' : '') + String(err.message || err)).slice(0, 500), notes.length ? notes.join('; ').slice(0, 1000) : e.note || null]);
  }
}
async function markStuck(sql) {
  return sql('update "_sp_outbox" set "stuck_at" = now() where "done_at" is null and "stuck_at" is null and "at" < now() - ($1 || \' hours\')::interval returning "n"', [String(STUCK_HOURS)]);
}
/* Vacia la fila. opts: { sql, graphFetch (SharePoint sin envolver), budgetMs, batch, me }. Nunca lanza. */
async function drain(opts) {
  opts = opts || {};
  const sql = opts.sql || M().client();
  const base = opts.graphFetch;
  const out = { sent: 0, failed: 0, left: 0 };
  if (!sql || !base) return out;
  const me = opts.me || ME;
  const until = Date.now() + (opts.budgetMs || 20000);
  const s0 = stats.sent, f0 = stats.failed + stats.deferred;
  try {
    if (!opts.light && !(await exists(sql))) return out;
    if (!opts.light) await markStuck(sql);
    while (Date.now() < until) {
      const batch = (await claim(sql, me, opts.batch || 10)).sort((a, b) => Number(a.n) - Number(b.n));
      if (!batch.length) break;
      for (let i = 0; i < batch.length; i++) {
        if (Date.now() >= until) {
          await sql('update "_sp_outbox" set "locked_until" = null where "n" = any($1::bigint[]) and "locked_by" = $2', [batch.slice(i).map(x => Number(x.n)), me]);
          break;
        }
        await processOne(sql, base, batch[i], me);
      }
    }
    if (!opts.light) {
      if (Math.random() < 0.05) await sql('delete from "_sp_outbox" where "done_at" < now() - interval \'14 days\'');
      out.left = Number((await sql('select count(*)::int as n from "_sp_outbox" where "done_at" is null'))[0].n);
    }
  } catch (e) {
    stats.lastError = e.message;
    console.error('sql-first: backup to SharePoint stopped: ' + e.message);
    out.error = e.message;
  }
  out.sent = stats.sent - s0;
  out.failed = stats.failed + stats.deferred - f0;
  return out;
}
/* Al final de cada guardado: vaciar la fila por detras (uno a la vez por servidor). */
let running = null, again = false;
function kick(base, deps) {
  if (!base) return;
  if (running) { again = true; return; }
  running = R().background(async () => {
    /* light: despues de un guardado solo se manda lo pendiente (lo atorado y la limpieza los ve el cron). */
    try { do { again = false; await drain({ sql: deps.sql, graphFetch: base, budgetMs: deps.drainBudgetMs || 15000, light: true }); } while (again); }
    finally { running = null; }
  });
}
function idle() { return running || Promise.resolve(); }

/* Cron (Admin cada 5 min): vacia la fila y avisa una vez de lo atorado. opts.alert(info) manda el correo. */
async function cron(opts) {
  opts = opts || {};
  const sql = opts.sql || M().client();
  if (!sql) return { off: true };
  if (!(await exists(sql))) return { off: true };
  const out = await drain(Object.assign({ budgetMs: 50000 }, opts, { sql }));
  /* Las columnas de SharePoint de cada lista en sql-first, una vez al dia (para rechazar antes lo que SharePoint no acepta). */
  if (opts.listPath) {
    try {
      const m = await modes({ sql });
      const lists = Object.keys(m).filter(l => l !== '*' && m[l] === 'sql-first');
      const fresh = new Set((await sql('select distinct "list" from "_sp_columns" where "at" > now() - interval \'24 hours\'').catch(() => [])).map(r => r.list));
      for (const l of lists.filter(x => !fresh.has(x))) {
        try { out.columns = (out.columns || 0) + await refreshColumns({ sql, graphFetch: opts.graphFetch, list: l, listPath: opts.listPath(l) }); }
        catch (e) { console.error('sql-first: columns of ' + l + ' not read from SharePoint: ' + e.message); }
      }
    } catch (e) { out.columnsError = e.message; }
  }
  try {
    const stuck = await sql('select "list", count(*)::int as n, min("at") as since, max("last_error") as err from "_sp_outbox" ' +
      'where "stuck_at" is not null and "alerted_at" is null and "done_at" is null group by "list" order by "list"');
    out.stuck = stuck.map(r => ({ list: r.list, n: r.n }));
    if (stuck.length && opts.alert) {
      const n = stuck.reduce((s, r) => s + r.n, 0);
      await opts.alert({ count: n, since: new Date(Math.min(...stuck.map(r => Date.parse(r.since)))).toISOString(),
        error: n + ' change(s) saved in SQL have not reached the SharePoint backup in ' + STUCK_HOURS + ' h: ' +
          stuck.map(r => r.list + ' (' + r.n + ')').join(', ') + '. Last error: ' + String(stuck[0].err || '').slice(0, 200) });
      await sql('update "_sp_outbox" set "alerted_at" = now() where "stuck_at" is not null and "alerted_at" is null and "done_at" is null');
      out.alerted = n;
    }
  } catch (e) { out.alertError = e.message; console.error('sql-first: stuck check failed: ' + e.message); }
  return out;
}
/* Lo que falta mandar, por lista (Developer › SQL write mode). */
async function status(sql) {
  sql = sql || M().client();
  if (!sql || !(await exists(sql))) return { pending: [], total: 0 };
  const rows = await sql('select "list", count(*)::int as n, min("at") as oldest, count("stuck_at")::int as stuck, max("last_error") as err from "_sp_outbox" where "done_at" is null group by "list" order by "list"');
  const notes = await sql('select "list", "row_id", "op", "note", "done_at" from "_sp_outbox" where "note" is not null order by "n" desc limit 20');
  return { pending: rows, total: rows.reduce((s, r) => s + r.n, 0), notes };
}

module.exports = { refreshColumns, rulesFor, listMarker, spIdOf, midnightIn, ID_MIN, MODE_KEY, REFS, STUCK_HOURS, isSqlBorn, modes, modeFor, clearModeCache, write, read, drain, kick, idle, cron, status,
  ensureSchema, sitePrefix, ifMatchOf, stats, _me: ME, _reset: () => { spReady = new WeakMap(); clearModeCache(); lastGood = null; } };
