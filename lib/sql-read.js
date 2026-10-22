/* ============================================================
   gsocd-shared/lib/sql-read.js -- leer las listas desde SQL (CFO 22/10/2026).

   Lo usa sql-mirror.wrap(): cada GET a /lists/{lista}/items (con $filter,
   $expand=fields, $select, $top, paginas) se puede contestar desde la tabla
   del mismo nombre en SQL, con la MISMA forma que contesta SharePoint, asi
   que ninguna pantalla cambia.

   El switch (Developer › SQL migration) vive en SharePoint, lista Settings,
   Key "SqlReadMode", Value {"preview":"...","production":"..."}:
     sharepoint  como siempre.
     compare     se contesta con SharePoint, pero cada lectura se hace tambien
                 en SQL y cualquier diferencia queda en la tabla _read_diffs.
     sql         se contesta desde SQL. Si SQL falla o tarda, SharePoint.
   Siempre desde SharePoint: los crons y procesos de fondo (context
   background), la copia y el Compare (context sharepoint), las listas que
   se guardan con candado If-Match (Settings, EquipmentPieces) y cualquier
   consulta que no se sepa traducir.
============================================================ */
'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();

const ALWAYS_SP = new Set(['Settings', 'EquipmentPieces']);
const MODE_KEY = 'SqlReadMode';
const MODE_TTL_MS = 30 * 1000;
const READ_TIMEOUT_MS = 4000;
/* Zona horaria del sitio de SharePoint (sus fechas sin hora quedan a la medianoche de ahi). */
const SP_TZ = process.env.SP_SITE_TZ || 'America/Los_Angeles';
const SYSCOL = { Created: 'created_at', Modified: 'modified_at', ID: 'id', id: 'id' };

const q = s => '"' + String(s).replace(/"/g, '""') + '"';
const stats = { sharepoint: 0, sql: 0, fallback: 0, compared: 0, diffs: 0, untranslatable: 0, lastError: '' };

/* ---- contexto de la peticion ---- */
function context(ctx, fn) { return als.run(Object.assign({}, als.getStore() || {}, ctx), fn); }
const current = () => als.getStore() || {};

/* ---- el switch ---- */
let modeCache = { at: 0, value: null };
function envName() { return process.env.VERCEL_ENV || 'development'; }
async function readMode(base, samplePath, deps) {
  if (deps && deps.mode) return deps.mode;
  /* Solo pruebas (tools/sql/e2e-read.js de Admin); en Vercel no existe. */
  if (/^(sharepoint|compare|sql)$/.test(process.env.SQL_READ_MODE || '')) return process.env.SQL_READ_MODE;
  if (modeCache.value && Date.now() - modeCache.at < MODE_TTL_MS) return modeCache.value[envName()] || 'sharepoint';
  try {
    const root = String(samplePath).replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '').replace(/\/lists\/[^/]+\/items.*$/, '/lists/Settings/items');
    const r = await base(root + '?$expand=fields&$top=5&$filter=' + encodeURIComponent("fields/Key eq '" + MODE_KEY + "'"),
      { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
    const row = (r && r.value || [])[0];
    let v = {};
    try { v = JSON.parse((row && row.fields && row.fields.Value) || '{}') || {}; } catch (e) { v = {}; }
    modeCache = { at: Date.now(), value: v };
  } catch (e) {
    modeCache = { at: Date.now(), value: {} };
  }
  return modeCache.value[envName()] || 'sharepoint';
}
function clearModeCache() { modeCache = { at: 0, value: null }; }

/* ---- la peticion ---- */
function parseRead(path) {
  const full = String(path || '').replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '');
  const [p, qs] = full.split('?');
  const m = /\/lists\/([^/]+)\/items(?:\/([^/]+))?(\/fields)?$/.exec(p);
  if (!m) return null;
  let list;
  try { list = decodeURIComponent(m[1]); } catch (e) { list = m[1]; }
  const params = new URLSearchParams(qs || '');
  const r = { list, id: m[2] || null, fieldsOnly: !!m[3], expandFields: false, fieldSelect: null, select: null, filter: null, top: null, skip: 0, other: [] };
  for (const [k, v] of params) {
    if (k === '$expand') {
      const e = /^fields(?:\(\$select=([^)]*)\))?$/.exec(v.trim());
      if (!e) return null;
      r.expandFields = true;
      if (e[1]) r.fieldSelect = e[1].split(',').map(s => s.trim()).filter(Boolean);
    } else if (k === '$select') r.select = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '$filter') r.filter = v;
    else if (k === '$top') r.top = Math.max(1, parseInt(v, 10) || 200);
    else if (k === '$skiptoken') { const s = /^sql:(\d+)$/.exec(v); if (!s) return null; r.skip = Number(s[1]); }
    else return null; /* $orderby, $search, ... : no se traduce, va a SharePoint */
  }
  if (r.id && !/^\d+$/.test(r.id)) return null;
  return r;
}

/* $filter: OR de AND de "fields/Col op valor" (el mismo subconjunto que usa la app). null = no se sabe traducir. */
function translateFilter(filter, cols, params) {
  if (!filter) return 'true';
  const orParts = String(filter).split(/\s+or\s+/i);
  const out = [];
  for (const part of orParts) {
    const ands = [];
    for (const raw of part.split(/\s+and\s+/i)) {
      const m = /^\(?\s*fields\/(\w+)\s+(eq|ne|ge|gt|le|lt)\s+(?:'((?:[^']|'')*)'|(\S+?))\s*\)?$/i.exec(raw.trim());
      if (!m) return null;
      const field = m[1], op = m[2].toLowerCase(), val = m[3] !== undefined ? m[3].replace(/''/g, "'") : m[4];
      const colName = SYSCOL[field] || field;
      const type = SYSCOL[field] ? (colName === 'id' ? 'bigint' : 'timestamp with time zone') : cols.get(field);
      const c = q(colName);
      if (!type) { ands.push(op === 'eq' ? (val === '' ? 'true' : 'false') : op === 'ne' ? (val === '' ? 'false' : 'true') : 'false'); continue; }
      const cmp = { ge: '>=', gt: '>', le: '<=', lt: '<' }[op];
      /* el valor va como parametro ($n), solo cuando se usa (un parametro sin usar truena en Postgres) */
      let pn = null;
      const P = () => { if (!pn) { params.push(val); pn = '$' + params.length; } return pn; };
      if (type === 'timestamp with time zone' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        /* Fecha sin hora ('2026-10-26'): SharePoint compara el DIA, en la zona del sitio (Pacifico: guarda las fechas
           a la medianoche de alla, 07:00Z / 08:00Z). Visto en Compare el 22/10: "le '2026-10-26'" incluye 2026-10-26T07:00Z. */
        const day = '(' + c + ' at time zone ' + "'" + SP_TZ + "'" + ')::date';
        const sym = { eq: '=', ne: '<>', ge: '>=', gt: '>', le: '<=', lt: '<' }[op];
        if (op === 'ne') ands.push('(' + c + ' is null or ' + day + ' <> ' + P() + '::date)');
        else ands.push('(' + c + ' is not null and ' + day + ' ' + sym + ' ' + P() + '::date)');
      } else if (type === 'timestamp with time zone') {
        if (op === 'eq') ands.push(val === '' ? c + ' is null' : c + ' = ' + P() + '::timestamptz');
        else if (op === 'ne') ands.push(val === '' ? c + ' is not null' : '(' + c + ' is null or ' + c + ' <> ' + P() + '::timestamptz)');
        else ands.push('(' + c + ' is not null and ' + c + ' ' + cmp + ' ' + P() + '::timestamptz)');
      } else if (type === 'numeric' || type === 'bigint' || type === 'integer' || type === 'double precision') {
        if (val !== '' && !isFinite(Number(val))) return null;
        if (op === 'eq') ands.push(val === '' ? c + ' is null' : c + ' = ' + P() + '::numeric');
        else if (op === 'ne') ands.push(val === '' ? c + ' is not null' : '(' + c + ' is null or ' + c + ' <> ' + P() + '::numeric)');
        else ands.push('(' + c + ' is not null and ' + c + ' ' + cmp + ' ' + P() + '::numeric)');
      } else if (type === 'boolean') {
        const b = /^(1|true|yes)$/i.test(val);
        if (op === 'eq') ands.push(val === '' ? c + ' is null' : 'coalesce(' + c + ', false) = ' + b);
        else if (op === 'ne') ands.push(val === '' ? c + ' is not null' : 'coalesce(' + c + ', false) <> ' + b);
        else return null;
      } else {
        /* texto: SharePoint compara sin mayusculas/minusculas; vacio = null. */
        if (op === 'eq') ands.push('lower(coalesce(' + c + ", '')) = lower(" + P() + ')');
        else if (op === 'ne') ands.push('lower(coalesce(' + c + ", '')) <> lower(" + P() + ')');
        else ands.push('(coalesce(' + c + ", '') <> '' and " + c + ' ' + cmp + ' ' + P() + ')');
      }
    }
    out.push('(' + ands.join(' and ') + ')');
  }
  return out.join(' or ');
}

/* ---- un renglon de SQL con la forma de SharePoint ---- */
const isoSP = d => { const s = (d instanceof Date ? d : new Date(d)).toISOString(); return s.endsWith('.000Z') ? s.slice(0, -5) + 'Z' : s; };
function fieldValue(v, type) {
  if (v === null || v === undefined) return undefined;
  if (type === 'numeric' || type === 'integer' || type === 'bigint' || type === 'double precision') { const n = Number(v); return isFinite(n) ? n : undefined; }
  if (type === 'boolean') return !!v;
  if (type === 'timestamp with time zone') return isoSP(v);
  if (v === '') return undefined;
  return String(v);
}
function fieldsOf(row, cols, only) {
  const f = { '@odata.etag': row.etag || undefined, id: String(row.id) };
  if (row.created_at) f.Created = isoSP(row.created_at);
  if (row.modified_at) f.Modified = isoSP(row.modified_at);
  for (const [c, type] of cols) {
    if (c === 'id' || c === 'created_at' || c === 'modified_at' || c === 'created_by' || c === 'modified_by' || c === 'etag') continue;
    if (only && !only.includes(c)) continue;
    const v = fieldValue(row[c], type);
    if (v !== undefined) f[c] = v;
  }
  if (!f['@odata.etag']) delete f['@odata.etag'];
  return f;
}
function itemOf(row, cols, r) {
  const it = { id: String(row.id) };
  if (r.select && !r.expandFields) { if (r.select.includes('lastModifiedDateTime') && row.modified_at) it.lastModifiedDateTime = isoSP(row.modified_at); return it; }
  if (row.etag) { it['@odata.etag'] = row.etag; it.eTag = row.etag; }
  if (row.created_at) it.createdDateTime = isoSP(row.created_at);
  if (row.modified_at) it.lastModifiedDateTime = isoSP(row.modified_at);
  if (row.created_by) it.createdBy = { user: { displayName: row.created_by } };
  if (row.modified_by) it.lastModifiedBy = { user: { displayName: row.modified_by } };
  if (r.expandFields) it.fields = fieldsOf(row, cols, r.fieldSelect);
  return it;
}

function notFound() { const e = new Error('Item not found (404) [sql]'); e.status = 404; return e; }

/* La respuesta que daria SharePoint, desde SQL. null = no se pudo (ir a SharePoint). */
async function answer(sql, path, columnsOf) {
  const r = parseRead(path);
  if (!r) return null;
  const cols = await columnsOf(sql, r.list);
  if (!cols || !cols.size) return null;
  if (r.id) {
    const row = (await sql('select * from ' + q(r.list) + ' where "id" = $1', [Number(r.id)]))[0];
    if (!row) throw notFound();
    if (r.fieldsOnly) return fieldsOf(row, cols, null);
    return itemOf(row, cols, r);
  }
  const params = [];
  const where = translateFilter(r.filter, cols, params);
  if (where === null) { stats.untranslatable++; return null; }
  const top = r.top || 200;
  params.push(top + 1, r.skip);
  const rows = await sql('select * from ' + q(r.list) + ' where ' + where + ' order by "id" limit $' + (params.length - 1) + ' offset $' + params.length, params);
  const out = { value: rows.slice(0, top).map(row => itemOf(row, cols, r)) };
  if (rows.length > top) {
    const base = String(path).split('?')[0];
    const qp = new URLSearchParams(String(path).split('?')[1] || '');
    qp.set('$skiptoken', 'sql:' + (r.skip + top));
    out['@odata.nextLink'] = (base.startsWith('http') ? base : 'https://graph.microsoft.com/v1.0' + base) + '?' + qp.toString();
  }
  return out;
}

/* ---- comparar SharePoint contra SQL (modo compare) ---- */
function sameValue(a, b, type) {
  if (a === b) return true;
  if (type === 'boolean') { const t = v => (v === undefined || v === null || v === '') ? null : (v === true || /^(true|yes|1)$/i.test(String(v))); return t(a) === t(b) || (t(a) === false && t(b) === null) || (t(a) === null && t(b) === false); }
  if (type === 'timestamp with time zone' && a && b && isFinite(Date.parse(a)) && isFinite(Date.parse(b))) return Date.parse(a) === Date.parse(b);
  if ((a === undefined || a === null || a === '') && (b === undefined || b === null || b === '')) return true;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  const ta = Date.parse(a), tb = Date.parse(b);
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(a)) && /^\d{4}-\d{2}-\d{2}T/.test(String(b)) && isFinite(ta) && isFinite(tb)) return ta === tb;
  return String(a) === String(b);
}
function diffItems(spItems, sqlItems, cols, complete, only) {
  const out = [];
  const byId = new Map(sqlItems.map(x => [String(x.id), x]));
  for (const s of spItems) {
    const o = byId.get(String(s.id));
    if (!o) { out.push({ id: String(s.id), kind: 'missing in SQL' }); continue; }
    const sf = s.fields || {}, of = o.fields || {};
    /* Con fields($select=...) solo cuentan esas columnas. */
    const bad = Object.keys(sf).filter(k => cols.has(k) && (!only || only.includes(k)) && !sameValue(sf[k], of[k], cols.get(k)));
    if (bad.length) out.push({ id: String(s.id), kind: 'different', columns: bad.slice(0, 5).map(k => ({ column: k, sharepoint: sf[k], sql: of[k] })) });
  }
  if (complete) {
    const have = new Set(spItems.map(s => String(s.id)));
    sqlItems.filter(x => !have.has(String(x.id))).forEach(x => out.push({ id: String(x.id), kind: 'only in SQL' }));
  }
  return out;
}
async function logDiffs(sql, list, path, diffs) {
  const rows = diffs.slice(0, 20);
  const ins = () => sql('insert into "_read_diffs" ("env", "list", "url", "diffs") values ($1, $2, $3, $4)', [envName(), list, String(path).slice(0, 800), JSON.stringify(rows)]);
  try { await ins(); }
  catch (e) {
    if (!/does not exist/i.test(e.message)) throw e;
    await sql('create table if not exists "_read_diffs" ("n" bigserial primary key, "at" timestamptz not null default now(), "env" text, "list" text, "url" text, "diffs" jsonb)');
    await ins();
  }
}

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('SQL read timed out after ' + ms + ' ms')), ms); })]).finally(() => clearTimeout(t));
}

/* GET a una lista, segun el switch. base = graphFetch de SharePoint. */
async function read(base, path, options, raw, deps) {
  const ctx = current();
  const r = parseRead(path);
  const viaSP = () => { stats.sharepoint++; return base(path, options, raw); };
  if (!r || raw || ctx.background || ctx.source === 'sharepoint' || ALWAYS_SP.has(r.list)) return viaSP();
  const sql = deps.sql || deps.client();
  if (!sql) return viaSP();
  const mode = await readMode(base, path, deps);
  if (mode === 'sql') {
    try {
      const res = await withTimeout(answer(sql, path, deps.columnsOf), deps.readTimeoutMs || READ_TIMEOUT_MS);
      if (res === null) return viaSP();
      stats.sql++;
      return res;
    } catch (e) {
      /* Un renglon que SQL no tiene (o SQL que falla o tarda): se contesta con SharePoint, nunca un "no existe" falso. */
      stats.fallback++; stats.lastError = e.message;
      console.error('sql-read: ' + r.list + ' read from SharePoint instead (' + e.message + ')');
      return viaSP();
    }
  }
  const spRes = await viaSP();
  if (mode !== 'compare') return spRes;
  try {
    await withTimeout((async () => {
      let sqlRes, notFoundInSql = false;
      try { sqlRes = await answer(sql, path, deps.columnsOf); } catch (e) { if (e.status === 404) notFoundInSql = true; else throw e; }
      if (sqlRes === null) return;
      stats.compared++;
      const cols = await deps.columnsOf(sql, r.list);
      let diffs;
      if (r.id) {
        if (notFoundInSql) diffs = [{ id: r.id, kind: 'missing in SQL' }];
        else if (r.fieldsOnly) diffs = diffItems([{ id: r.id, fields: spRes }], [{ id: r.id, fields: sqlRes }], cols, false);
        else diffs = diffItems([spRes], [sqlRes], cols, false, r.fieldSelect);
      } else {
        const complete = !r.skip && !(spRes && spRes['@odata.nextLink']) && !(sqlRes && sqlRes['@odata.nextLink']);
        diffs = diffItems((spRes && spRes.value) || [], (sqlRes && sqlRes.value) || [], cols, complete, r.fieldSelect);
      }
      if (diffs.length) { stats.diffs++; await logDiffs(sql, r.list, path, diffs); }
    })(), deps.readTimeoutMs || READ_TIMEOUT_MS);
  } catch (e) { stats.lastError = e.message; console.error('sql-read: compare ' + r.list + ' skipped (' + e.message + ')'); }
  return spRes;
}

module.exports = { read, context, current, parseRead, translateFilter, answer, readMode, clearModeCache, diffItems, sameValue, isoSP, stats, ALWAYS_SP, MODE_KEY };
