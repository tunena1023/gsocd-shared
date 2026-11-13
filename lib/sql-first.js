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
   - Lecturas: de SQL; si SQL no contesta, el HIBRIDO de abajo (con
     SQL_FIRST_HYBRID=off: error y la pantalla se queda con lo ultimo que vio).
   - Un renglon nacido en SQL (id >= ID_MIN) siempre se guarda y se lee asi,
     aunque su lista ya no este en sql-first.
   Fila al respaldo (drain): al final de cada guardado (por detras) y con el cron
   cron-sp-outbox (Admin, cada 5 min). Orden estricto por renglon; un servidor a
   la vez por renglon (locked_until). Si Microsoft falla, reintenta con espera
   creciente. SQL gana: 404 en un cambio = se crea otra vez con lo de SQL; columna
   que SharePoint no tiene = se manda sin ella; todo se anota en "note" y el log.
   Lo que no sale en STUCK_HOURS queda con stuck_at y el cron manda el aviso de
   errores (app-error) una vez.

   HIBRIDO (CFO 12/11/2026: si Neon no contesta). Cada peticion sabe si SQL
   contesto: si SQL no contesta en 2 s (HYBRID_MS), esa lectura sale de
   SharePoint en ese momento; 3 fallas seguidas = el freno de sql-read (1 min
   todo de SharePoint; cada minuto un intento). Guardar mientras tanto: a
   SharePoint, con su renglon en el diario (lib/sql-journal) ANTES del guardado;
   un renglon nacido en SQL (SharePoint no lo conoce) solo va al diario y la
   persona ve "Saved". Cuando SQL vuelve, el diario se pasa a SQL en orden y
   hasta entonces este servidor sigue en SharePoint y la fila no sale. La
   peticion lleva X-GS-Data (sql / sharepoint / down) para el aviso
   "Reconnecting…" (gsocd-shared reconnecting/). SQL_FIRST_HYBRID=off = como antes.
============================================================ */
'use strict';

const crypto = require('crypto');

const ID_MIN = 1000000;
const MODE_KEY = 'SqlWriteMode';
const MODE_TTL_MS = 30 * 1000;
const WRITE_TIMEOUT_MS = 10000;
const READ_TIMEOUT_MS = 8000;
const HYBRID_MS = Number(process.env.SQL_FIRST_HYBRID_MS) || 2000;
const JOURNAL_CHECK_MS = Number(process.env.SQL_JOURNAL_CHECK_MS) || 1500;
/* Un guardado despues de un rato sin hablar con SQL primero pregunta "estas?" (2 s): asi una base dormida o caida no deja
   un guardado a medias (y un guardado que SQL tarda en contestar no se manda tambien a SharePoint). */
const PROBE_AFTER_MS = 30 * 1000;
const hybridOn = deps => process.env.SQL_FIRST_HYBRID !== 'off' && !(deps && deps.hybrid === false);
const J = () => require('./sql-journal');
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
/* ---- ids: renglon nacido en SQL <-> su id de SharePoint, los que este servidor ya vio (para leer y guardar el mismo
   renglon en SharePoint mientras SQL no contesta). Maximo MAP_MAX por servidor. ---- */
const MAP_MAX = 50000;
const idMap = new Map();
let mapSize = 0;
function mapOf(list) { let m = idMap.get(list); if (!m) { m = { toSp: new Map(), toSql: new Map() }; idMap.set(list, m); } return m; }
function remember(list, rows) {
  if (!list || !rows) return;
  for (const r of rows) {
    if (!r || r.sp_id === null || r.sp_id === undefined || !isSqlBorn(r.id)) continue;
    const m = mapOf(list), x = String(r.id), sp = String(r.sp_id);
    if (m.toSp.get(x) === sp) continue;
    if (mapSize >= MAP_MAX) { idMap.clear(); mapSize = 0; }
    m.toSp.set(x, sp); m.toSql.set(sp, x); mapSize++;
  }
}
const spOfKnown = (list, id) => { const m = idMap.get(list); return m ? m.toSp.get(String(id)) || null : null; };
const sqlOfKnown = (list, id) => { const m = idMap.get(list); return m ? m.toSql.get(String(id)) || null : null; };
/* Lo que SharePoint contesto, con los ids de SQL que ya se conocen (id del renglon y columnas que apuntan a otra lista):
   la pantalla sigue viendo los mismos ids que antes de la caida. */
const SIMPLE_REF = /^\s*(?:[A-Za-z]+[:-])?\d+(?:\s*,\s*(?:[A-Za-z]+[:-])?\d+)*\s*$/;
function toSqlIds(list, res) {
  if (!res || typeof res !== 'object' || !idMap.size) return res;
  const refs = REFS[list] || {};
  const fixItem = it => {
    if (!it || typeof it !== 'object') return it;
    const x = sqlOfKnown(list, it.id);
    if (x && !isSqlBorn(it.id)) { it.id = x; if (it.fields && it.fields.id) it.fields.id = x; }
    const f = it.fields || (it.value ? null : it);
    if (f && typeof f === 'object') {
      if (f === it && x) f.id = x;
      Object.keys(refs).forEach(col => {
        const v = f[col];
        if (v === null || v === undefined || v === '' || typeof v === 'object' || !SIMPLE_REF.test(String(v))) return;
        const out = String(v).replace(/\d+/g, n => sqlOfKnown(refs[col], n) || n);
        if (out !== String(v)) f[col] = typeof v === 'number' ? Number(out) : out;
      });
    }
    return it;
  };
  if (Array.isArray(res.value)) res.value.forEach(fixItem); else fixItem(res);
  return res;
}
/* Al reves, para mandar a SharePoint: ids nacidos en SQL que ya se conocen -> su id de SharePoint. */
function toSpRefs(list, fields) {
  const refs = REFS[list] || {};
  if (!fields || typeof fields !== 'object' || !idMap.size) return fields;
  const out = Object.assign({}, fields);
  Object.keys(refs).forEach(col => {
    const v = out[col];
    if (v === null || v === undefined || v === '' || typeof v === 'object' || !SIMPLE_REF.test(String(v))) return;
    const t = String(v).replace(/\d+/g, n => (isSqlBorn(n) && spOfKnown(refs[col], n)) || n);
    if (t !== String(v)) out[col] = typeof v === 'number' ? Number(t) : t;
  });
  return out;
}
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
  if (list === J().LIST) return 'sharepoint';
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
      /* Hibrido: wk = llave del guardado (si SQL contesto tarde y tambien fue a SharePoint, el diario lo encuentra); jk = salio del diario. */
      await sql('alter table "_sp_outbox" add column if not exists "wk" text');
      await sql('alter table "_sp_outbox" add column if not exists "jk" text');
      await sql('create index if not exists "ix__sp_outbox_wk" on "_sp_outbox" ("wk") where "wk" is not null');
      await sql('create table if not exists "_sql_journal" ("k" text primary key, "at" timestamptz, "list" text, "op" text, "row_id" text, "result" text, ' +
        '"problem" text, "alerted_at" timestamptz, "applied_at" timestamptz not null default now())');
      await sql('create table if not exists "_sql_journal_state" ("id" int primary key, "open" boolean not null default false, "since" timestamptz, ' +
        '"locked_until" timestamptz, "locked_by" text)');
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
async function columnsFor(sql, table, fields, deps, noValidate) {
  let cols = await ensureSpId(sql, table);
  if (!cols || !cols.size) throw httpError(404, "List '" + table + "' does not exist. [sql]", 'itemNotFound');
  /* Una columna que este servidor no conoce pudo crearla otro hace poco (sp-heal / SPEC): se vuelven a leer las columnas
     antes de decidir. Si no, vaciar una columna recien creada se perdia (el campo vacio se quitaba). Aviso del agente tony, 12/11. */
  if (Object.keys(fields).some(k => !cols.has(k))) {
    cols = await M().columnsOf(sql, table, true);
    if (spReady.has(sql)) spReady.get(sql).set(table, Promise.resolve(cols));
  }
  const spec = deps && deps.catalog ? ((() => { try { return deps.catalog() || []; } catch (e) { return []; } })().find(L => L.list === table) || null) : null;
  const rules = await rulesFor(sql, table);
  /* noValidate: lo del diario (SharePoint ya lo acepto). */
  if (!noValidate) validate(table, fields, rules, cols, spec);
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
async function write(w, path, options, deps, wk) {
  const sql = deps.sql || M().client();
  if (!sql) throw httpError(503, 'The database is not connected. Nothing was saved. [sql]');
  const site = sitePrefix(path);
  stats.writes++;
  try {
    return await withTimeout((async () => {
      await ensureSchema(sql);
      const table = w.list;
      if (w.op === 'delete') return del(sql, table, w.id, site, wk);
      const raw = fieldsOfBody(w, bodyOf(options));
      const fields = userFields(raw);
      const cols = await columnsFor(sql, table, fields, deps);
      if (w.op === 'create') return create(sql, table, fields, raw, cols, site, wk);
      return update(sql, table, w, fields, raw, cols, site, ifMatchOf(options), wk);
    })(), deps.writeTimeoutMs || WRITE_TIMEOUT_MS, 'SQL save');
  } catch (e) {
    if (e.status && e.status < 500) throw e;
    stats.lastError = e.message;
    if (hybridOn(deps)) R().strike(e, deps.breakerMs); else R().trip(e, deps.breakerMs);
    console.error('sql-first: ' + w.op + ' ' + w.list + (w.id ? ' #' + w.id : '') + ' not saved: ' + e.message);
    throw Object.assign(httpError(503, 'The database did not answer, so this was not saved. Try again. (' + e.message + ')', 'sqlUnavailable'), { sqlDown: true });
  }
}
const fieldsOfBody = (w, body) => w.op === 'create' || w.op === 'update' ? (body.fields && typeof body.fields === 'object' ? body.fields : (w.op === 'create' ? {} : body)) : body;

/* Un servidor que no vio la caida no sabe del diario hasta que el que la vio vuelve a hablar con SQL (o el cron). Para que
   en ese rato no lea SQL viejo ni guarde sobre un renglon que SQL todavia no tiene, cada 10 s pregunta a SharePoint si hay
   diario sin pasar (una lectura de 1 renglon; si Microsoft no contesta, no detiene nada). */
async function journalPending(base, deps) {
  if (typeof base !== 'function') return false;
  try { return (await withTimeout(J().openInSharePoint(base), deps.journalCheckMs || JOURNAL_CHECK_MS, 'journal check')) === true; }
  catch (e) { return false; }
}

/* ---- guardar, hibrido (lo usa sql-mirror.wrap) ---- */
/* Regresa { via: 'sql' | 'sharepoint' | 'down', out, err, rawRes }. */
async function save(w, path, options, deps, base, raw) {
  if (!hybridOn(deps) || typeof base !== 'function') {
    try { return { via: 'sql', out: await write(w, path, options, deps) }; } catch (e) { return { via: 'sql', err: e }; }
  }
  const sql = deps.sql || M().client();
  J().seeSite(sitePrefix(path));
  const wk = crypto.randomUUID();
  let why = !sql ? 'no SQL' : !R().sqlOk() ? 'SQL paused' : J().gateOpen() ? 'journal not applied yet' : '';
  if (!why && Date.now() - R().lastOkAt() > (deps.probeAfterMs || PROBE_AFTER_MS)) {
    try { await withTimeout(sql('select 1 as ok'), deps.hybridMs || HYBRID_MS, 'SQL check'); R().fine(); }
    catch (e) { R().strike(e, deps.breakerMs); why = 'SQL did not answer (' + e.message + ')'; }
  }
  if (!why) { await J().refreshGate(sql); if (J().gateOpen() || await journalPending(base, deps)) why = 'journal not applied yet'; }
  if (!why) {
    try {
      const out = await write(w, path, options, deps, wk);
      R().fine(); R().note('sql'); R().noteWrite();
      return { via: 'sql', out };
    } catch (e) {
      if (!e.sqlDown) { R().note('sql'); return { via: 'sql', err: e }; }
      why = e.message;
    }
  }
  if (sql && R().sqlOk() && J().gateOpen()) J().kickApply(base, deps);
  return outageWrite(w, path, options, base, raw, wk, why);
}
const both = msg => httpError(503, 'The database and Microsoft did not answer, so this was not saved. Try again. (' + msg + ')', 'bothDown');
/* SQL no contesto: SharePoint + diario (antes del guardado). */
async function outageWrite(w, path, options, base, raw, wk, why) {
  const site = sitePrefix(path);
  const op = w.op === 'create' ? 'create' : w.op === 'delete' ? 'delete' : 'update';
  let body = {};
  try { body = w.op === 'delete' ? {} : bodyOf(options); } catch (e) { return { via: 'sharepoint', err: e }; }
  const sent = w.op === 'delete' ? null : fieldsOfBody(w, body);
  const answer = (err, out) => raw ? { via: err && err.code === 'bothDown' ? 'down' : 'sharepoint', rawRes: M().rawResponse ? M().rawResponse(err, out) : null, err, out } : { via: err && err.code === 'bothDown' ? 'down' : 'sharepoint', err, out };
  stats.outage = (stats.outage || 0) + 1;
  /* Renglon nacido en SQL cuyo id de SharePoint ya se conoce: se guarda en ese renglon de SharePoint (con el diario). */
  const known = w.id && isSqlBorn(w.id) ? spOfKnown(w.list, w.id) : null;
  /* Renglon nacido en SQL: SharePoint no lo conoce (o no se sabe su id sin SQL). Solo el diario; se aplica cuando SQL vuelva. */
  if (w.id && isSqlBorn(w.id) && !known) {
    const im = ifMatchOf(options);
    if (im && im !== '*') { R().note('sharepoint'); return answer(httpError(503, 'The database did not answer, so this was not saved. Try again. [sql]', 'sqlUnavailable')); }
    let j;
    try { j = await J().record(base, site, { op, list: w.list, id: w.id, fields: sent, state: 'deferred', wk }); }
    catch (e) { R().note('down'); console.error('sql-first: ' + op + ' ' + w.list + ' #' + w.id + ' not saved (database and SharePoint down): ' + e.message); return answer(both(e.message)); }
    R().note('sharepoint'); R().noteWrite();
    console.error('sql-first: ' + op + ' ' + w.list + ' #' + w.id + ' kept in the journal until the database answers (' + why + ')');
    const etag = '"' + j.key + ',0"';
    const f = Object.assign({ id: String(w.id) }, userFields(sent || {}));
    const out = op === 'delete' ? null : w.op === 'update-fields' ? Object.assign({ '@odata.etag': etag }, f) : { id: String(w.id), '@odata.etag': etag, eTag: etag, fields: f };
    return answer(null, out);
  }
  let j;
  try { j = await J().record(base, site, { op, list: w.list, id: w.id || '', spId: known, fields: sent, state: 'pending', wk }); }
  catch (e) { R().note('down'); console.error('sql-first: ' + op + ' ' + w.list + ' not saved (database and SharePoint down): ' + e.message); return answer(both(e.message)); }
  let res, err = null;
  /* A SharePoint: su id del renglon y sus ids en las columnas que apuntan a otra lista (los que ya se conocen). */
  let spPath = known ? String(path).replace('/items/' + w.id, '/items/' + known) : path;
  let spOpts = options;
  if (sent && w.op !== 'delete') {
    const tf = toSpRefs(w.list, sent);
    if (tf !== sent) spOpts = Object.assign({}, options, { body: JSON.stringify(w.op === 'update-fields' ? tf : (body.fields && typeof body.fields === 'object' ? Object.assign({}, body, { fields: tf }) : tf)) });
  }
  try { res = await base(spPath, spOpts, raw); } catch (e) { err = e; }
  if (!raw && res && !err) res = toSqlIds(w.list, res);
  const status = err ? (err.status || 0) : (raw && res && res.ok === false ? res.status : 200);
  if (status >= 200 && status < 300) {
    let spId = known ? Number(known) : w.id ? Number(w.id) : null;
    if (op === 'create') {
      try { spId = Number((raw && res && typeof res.clone === 'function' ? await res.clone().json() : res).id); } catch (e) { spId = null; }
    }
    /* Un create espera su marca "done" con el id de SharePoint (si no, el diario tendria que buscarlo); lo demas, por detras. */
    if (op === 'create') { if (!(await J().mark(base, site, j.jid, { State: 'done', SpId: spId ? String(spId) : '' }))) await J().mark(base, site, j.jid, { State: 'done', SpId: spId ? String(spId) : '' }); }
    else R().background(() => J().mark(base, site, j.jid, { State: 'done', SpId: spId ? String(spId) : '' }));
    R().note('sharepoint'); R().noteWrite();
    return raw ? { via: 'sharepoint', rawRes: res } : { via: 'sharepoint', out: res };
  }
  if (!status || status >= 500 || status === 429) {
    /* Microsoft no contesto: pudo haberlo guardado (respuesta perdida). Se queda "pending": el diario lo revisa en SharePoint
       antes de pasarlo (lo que si guardo se pasa; lo que no, se salta con su porque). */
    R().background(() => J().mark(base, site, j.jid, { Note: ('SharePoint did not answer (' + (status || 0) + '): ' + String((err && err.message) || status)).slice(0, 500) }));
    R().note('down');
    const e2 = both((err && err.message) || ('SharePoint ' + status));
    return raw ? { via: 'down', rawRes: M().rawResponse(e2, null), err: e2 } : { via: 'down', err: e2 };
  }
  /* SharePoint dijo que no por el dato (400, 404, 409, 412): su respuesta, como siempre. */
  R().background(() => J().mark(base, site, j.jid, { State: 'failed', Note: String((err && err.message) || ('SharePoint ' + status)).slice(0, 500) }));
  R().note('sharepoint');
  return raw ? { via: 'sharepoint', rawRes: res } : { via: 'sharepoint', err };
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

async function create(sql, table, fields, raw, cols, site, wk) {
  const names = Object.keys(fields).filter(k => fields[k] !== null && fields[k] !== '' && fields[k] !== undefined);
  const params = [table, APP, crypto.randomUUID(), JSON.stringify(forSp(raw, cols)), site, wk || null];
  const vals = names.map(n => { params.push(sqlValue(fields[n], cols.get(n))); return '$' + params.length + castOf(cols.get(n)); });
  const T = q(table);
  const text =
    'with seq as (insert into "_sp_seq" ("list", "last") values ($1, (select coalesce(max("id"), 0) + ' + ID_MIN + ' from ' + T + ')) ' +
    'on conflict ("list") do update set "last" = greatest("_sp_seq"."last" + 1, (select coalesce(max("id"), 0) + 1 from ' + T + ')) returning "last"), ' +
    'ins as (insert into ' + T + ' ("id", "created_at", "modified_at", "created_by", "modified_by", "etag"' + names.map(n => ', ' + q(n)).join('') + ') ' +
    'select seq."last", date_trunc(\'second\', now()), date_trunc(\'second\', now()), $2, $2, \'"\' || $3 || \',1"\'' + vals.map(v => ', ' + v).join('') + ' from seq returning *), ' +
    'ob as (insert into "_sp_outbox" ("list", "row_id", "op", "fields", "site", "wk") select $1, ins."id", \'create\', $4::jsonb, $5, $6 from ins returning "n"), ' +
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

/* Un id de SharePoint de un renglon nacido en SQL (la pantalla lo leyo de SharePoint mientras SQL no contestaba): su id de SQL. */
async function bySpId(sql, table, id) {
  if (isSqlBorn(id)) return null;
  const r = (await sql('select "id" from ' + q(table) + ' where "sp_id" = $1 and "id" >= ' + ID_MIN + ' limit 1', [Number(id)]).catch(() => []))[0];
  return r ? Number(r.id) : null;
}
async function update(sql, table, w, fields, raw, cols, site, ifMatch, wk) {
  if (!/^\d+$/.test(String(w.id))) throw httpError(404, 'Item not found. [sql]', 'itemNotFound');
  const id = Number(w.id);
  const T = q(table);
  const params = [id, APP, crypto.randomUUID(), ifMatch, table, JSON.stringify(forSp(raw, cols)), site, wk || null];
  const sets = Object.keys(fields).map(n => { params.push(sqlValue(fields[n], cols.get(n))); return q(n) + ' = $' + params.length + castOf(cols.get(n)); });
  const text =
    'with u as (update ' + T + ' set ' + sets.concat(['"modified_at" = date_trunc(\'second\', now())', '"modified_by" = $2', '"etag" = ' + NEXT_ETAG(T)]).join(', ') +
    ' where "id" = $1 and ($4::text is null or $4::text = \'*\' or ' + T + '."etag" = $4::text) returning *), ' +
    'ob as (insert into "_sp_outbox" ("list", "row_id", "sp_id", "op", "fields", "site", "wk") select $5, u."id", ' + SP_OF + ', \'update\', $6::jsonb, $7, $8 from u returning "n"), ' +
    MARK(5, 'u') +
    'select u.*, (select "n" from ob) as "_outbox", (select "at" from mk) as "_mark" from u';
  const row = (await sql(text, params))[0];
  if (!row) {
    const cur = (await sql('select "etag" from ' + T + ' where "id" = $1', [id]))[0];
    if (!cur) {
      const x = await bySpId(sql, table, id);
      if (x) return update(sql, table, Object.assign({}, w, { id: String(x) }), fields, raw, cols, site, ifMatch, wk);
      throw httpError(404, 'Item not found. [sql]', 'itemNotFound');
    }
    throw httpError(412, "Precondition Failed (412): The request ETag value '" + ifMatch + "' does not match the object's ETag value '" + cur.etag + "'. [sql]", 'resourceModified');
  }
  remember(table, [row]);
  if (w.op === 'update') return R().itemOf(row, cols, { expandFields: true });
  return R().fieldsOf(row, cols, null);
}

async function del(sql, table, idStr, site, wk) {
  if (!/^\d+$/.test(String(idStr))) throw httpError(404, 'Item not found. [sql]', 'itemNotFound');
  await ensureSpId(sql, table);
  const T = q(table);
  const text = 'with u as (delete from ' + T + ' where "id" = $1 returning "id", "sp_id"), ' +
    'ob as (insert into "_sp_outbox" ("list", "row_id", "sp_id", "op", "site", "wk") select $2, u."id", ' + SP_OF + ', \'delete\', $3, $4 from u returning "n"), ' +
    MARK(2, 'u') +
    'select u."id", (select "n" from ob) as "_outbox", (select "at" from mk) as "_mark" from u';
  const row = (await sql(text, [Number(idStr), table, site, wk || null]))[0];
  if (!row) {
    const x = await bySpId(sql, table, idStr);
    if (x) return del(sql, table, String(x), site, wk);
    throw httpError(404, 'Item not found. [sql]', 'itemNotFound');
  }
  return null;
}

/* GET /lists/X?$select=...lastModifiedDateTime de una lista en sql-first: la marca de SQL. null = no hay marca
   todavia (nada se ha guardado en SQL primero): la de SharePoint sirve. */
async function listMarker(list, deps) {
  const sql = deps.sql || M().client();
  if (!sql) return null;
  const hy = hybridOn(deps);
  /* Hibrido: SQL en pausa o diario sin pasar = la marca de SharePoint (null: la contesta SharePoint). */
  if (hy && (!R().sqlOk() || J().gateOpen())) { R().note('sharepoint'); return null; }
  let r;
  try { r = await withTimeout(sql('select "at" from "_sp_list_mod" where "list" = $1', [list]), hy ? (deps.hybridMs || HYBRID_MS) : (deps.sqlFirstReadTimeoutMs || READ_TIMEOUT_MS), 'SQL marker'); }
  catch (e) {
    if (/does not exist/i.test(e.message)) return null;
    if (hy) { R().strike(e, deps.breakerMs); R().note('sharepoint'); return null; }
    R().trip(e, deps.breakerMs);
    throw httpError(503, 'The database did not answer. (' + e.message + ')', 'sqlUnavailable');
  }
  if (hy) { R().fine(); R().note('sql'); }
  if (!r || !r[0]) return null;
  const at = new Date(r[0].at).toISOString();
  return { id: list, name: list, displayName: list, lastModifiedDateTime: at };
}

/* ---- leer (lista en sql-first): siempre SQL, nunca SharePoint ---- */
/* Hibrido: la lectura desde SharePoint (SQL no contesto). Un renglon nacido en SQL no esta ahi (o tiene otro id): error. */
async function readSP(path, raw, base, options) {
  const lm = /\/lists\/([^/?]+)\/items\/(\d+)/.exec(String(path || '').split('?')[0]);
  let list = null;
  try { list = decodeURIComponent((/\/lists\/([^/?]+)\/items/.exec(String(path || '')) || [])[1] || ''); } catch (e) { list = null; }
  if (lm && isSqlBorn(lm[2])) {
    const sp = spOfKnown(list, lm[2]);
    if (!sp) { R().note('sharepoint'); throw httpError(503, 'The database did not answer. Showing what was loaded before. [sql]', 'sqlUnavailable'); }
    path = String(path).replace('/items/' + lm[2], '/items/' + sp);
  }
  stats.spReads = (stats.spReads || 0) + 1;
  try {
    const res = await base(path, options, raw);
    R().note(raw && res && res.ok === false && res.status >= 500 ? 'down' : 'sharepoint');
    return raw ? res : toSqlIds(list, res);
  } catch (e) { R().note(!e.status || e.status >= 500 || e.status === 429 ? 'down' : 'sharepoint'); throw e; }
}
async function read(path, raw, deps, base, options) {
  const sql = deps.sql || (deps.client ? deps.client() : M().client());
  stats.reads++;
  const r = R().parseRead(path);
  const hy = hybridOn(deps) && typeof base === 'function';
  if (hy) {
    J().seeSite(sitePrefix(path));
    if (!sql || !R().sqlOk() || J().gateOpen() || await journalPending(base, deps)) {
      if (sql && R().sqlOk()) J().kickApply(base, deps);
      return readSP(path, raw, base, options);
    }
  }
  if (!sql) throw httpError(503, 'The database is not connected. [sql]');
  if (raw) throw httpError(400, 'This list is read from SQL only; a raw read is not supported. [sql]');
  let res;
  try {
    try { res = await withTimeout(R().answer(sql, path, deps.columnsOf || M().columnsOf), hy ? (deps.hybridMs || HYBRID_MS) : (deps.sqlFirstReadTimeoutMs || READ_TIMEOUT_MS), 'SQL read'); }
    catch (e) {
      /* El id de SharePoint de un renglon nacido en SQL (lo que la pantalla leyo de SharePoint): el renglon de SQL. */
      const x = e.status === 404 && r && r.id ? await bySpId(sql, r.list, r.id) : null;
      if (!x) throw e;
      res = await withTimeout(R().answer(sql, String(path).replace('/items/' + r.id, '/items/' + x), deps.columnsOf || M().columnsOf), hy ? (deps.hybridMs || HYBRID_MS) : READ_TIMEOUT_MS, 'SQL read');
    }
  } catch (e) {
    if (e.status === 404) { if (hy) { R().fine(); R().note('sql'); } throw e; }
    stats.lastError = e.message;
    if (hy) {
      R().strike(e, deps.breakerMs);
      console.error('sql-first: ' + (r && r.list) + ' read from SharePoint (SQL did not answer: ' + e.message + ')');
      return readSP(path, raw, base, options);
    }
    R().trip(e, deps.breakerMs);
    console.error('sql-first: ' + (r && r.list) + ' could not be read from SQL: ' + e.message);
    throw httpError(503, 'The database did not answer. Showing what was loaded before. (' + e.message + ')', 'sqlUnavailable');
  }
  if (hy) { R().fine(); R().note('sql'); R().background(() => J().refreshGate(sql)); }
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
    /* Diario de una caida sin pasar a SQL: la fila espera (sus cambios viejos no pisan en SharePoint lo nuevo del diario). */
    'and not exists (select 1 from "_sql_journal_state" s where s."open") ' +
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
  /* Lo que este servidor ya sabe (sirve tambien si SQL no contesta). */
  const known = spOfKnown(list, id);
  if (known) return Number(known);
  sql = sql || M().client();
  if (!sql || !list || (hybridOn() && !R().sqlOk())) return null;
  const r = (await withTimeout(sql('select to_jsonb(t)->>\'sp_id\' as sp from ' + q(list) + ' t where "id" = $1', [Number(id)]), HYBRID_MS * 2, 'SQL id').catch(() => []))[0];
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
    await sql('update "_sp_outbox" set "done_at" = now(), "locked_until" = null, "sp_id" = coalesce($3, "sp_id"), "note" = coalesce($4, "note"), "stuck_at" = null where "n" = $1 and "locked_by" = $2',
      [e.n, me, spId || null, notes.length ? notes.join('; ').slice(0, 1000) : null]);
    stats.sent++;
  };
  const setSpId = async spId => {
    remember(e.list, [{ id: e.row_id, sp_id: spId }]);
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
    await ensureSchema(sql);
    if (!opts.light) await markStuck(sql);
    let checked = !hybridOn(opts) || !!opts.noJournalCheck;
    while (Date.now() < until) {
      const batch = (await claim(sql, me, opts.batch || 10)).sort((a, b) => Number(a.n) - Number(b.n));
      if (!batch.length) break;
      if (!checked) {
        checked = true;
        /* Hay diario de una caida en SharePoint que todavia no pasa a SQL? Entonces la fila espera (10 s de memoria). */
        J().seeSite(batch[0].site);
        if (await J().openInSharePoint(base, batch[0].site)) {
          await sql('update "_sp_outbox" set "locked_until" = null where "n" = any($1::bigint[]) and "locked_by" = $2', [batch.map(x => Number(x.n)), me]);
          await J().setOpen(sql, true);
          J().kickApply(base, { sql });
          out.journal = 'open';
          break;
        }
      }
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
  /* Primero el diario de una caida (si hay): en orden, y despues la fila. */
  let jr = null;
  if (hybridOn(opts) && opts.listPath) {
    jr = await J().apply({ sql, graphFetch: opts.graphFetch, listPath: opts.listPath(J().LIST), budgetMs: opts.journalBudgetMs || 20000, catalog: opts.catalog });
  }
  const out = await drain(Object.assign({ budgetMs: 30000 }, opts, { sql }));
  if (jr && (jr.applied || jr.skipped || jr.error || jr.waiting || jr.busy)) out.journal = jr;
  /* Cuando vence lo siguiente de la fila (lib/db-wake: hasta entonces el cron no despierta la base). Diario sin terminar: ya. */
  try {
    const nx = await sql('select min("next_at") as next from "_sp_outbox" where "done_at" is null');
    out.nextAt = nx[0] && nx[0].next ? new Date(nx[0].next).toISOString() : null;
    if (jr && (jr.waiting || jr.error || jr.busy)) out.nextAt = new Date().toISOString();
  } catch (e) { out.nextError = e.message; }
  try {
    const bad = await J().problems(sql);
    if (bad.length && opts.alert) {
      await opts.alert({ count: bad.length, since: new Date(Math.min(...bad.map(r => Date.parse(r.at) || Date.now()))).toISOString(),
        error: bad.length + ' change(s) saved while the database was not answering could not be applied to SQL: ' +
          bad.slice(0, 5).map(r => r.list + ' ' + r.op + ' #' + (r.row_id || '?') + ' (' + String(r.problem).slice(0, 80) + ')').join(', ') });
      await J().alerted(sql, bad.map(r => r.k));
      out.journalAlerted = bad.length;
    }
  } catch (e) { out.journalAlertError = e.message; }
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

module.exports = { refreshColumns, rulesFor, listMarker, spIdOf, midnightIn, ID_MIN, MODE_KEY, REFS, STUCK_HOURS, HYBRID_MS, isSqlBorn, modes, modeFor, clearModeCache, write, save, read, drain, kick, idle, cron, status,
  ensureSchema, sitePrefix, ifMatchOf, stats, remember, _me: ME, _reset: () => { spReady = new WeakMap(); clearModeCache(); lastGood = null; idMap.clear(); mapSize = 0; },
  _internals: { ensureSpId, columnsFor, sqlValue, castOf, MARK, NEXT_ETAG, userFields } };
