/* ============================================================
   gsocd-shared/lib/sql-mirror.js -- copia a SQL (Postgres, Neon) de todo lo
   que la app guarda en SharePoint (CFO 22/10/2026).

   SharePoint sigue siendo lo que se usa y de donde se lee. Cada guardado en
   una lista (crear, cambiar, borrar) se copia tambien a la tabla del mismo
   nombre en SQL, con el mismo id de renglon. Si la copia falla, el usuario no
   se entera (lo suyo ya quedo en SharePoint). Mientras se lee de SharePoint
   (switch en sharepoint o compare) la copia va POR DETRAS, en orden, y el
   guardado no la espera; con el switch en sql se espera (para leer lo que se
   acaba de guardar). Con el freno de sql-read puesto (SQL fallo o tardo hace
   menos de 1 min) la copia se salta. Lo que no se copio: se escribe en el log y la
   revision de los fines de semana (Developer › SQL migration › Compare) lo
   encuentra y lo arregla.

   Uso en cada portal (lib/graph.js):
     const graphFetch = require('gsocd-shared/lib/sql-mirror').wrap(baseGraphFetch, { getItem })
   wrap() no cambia lo que regresa graphFetch ni sus errores.
   Sin SQL_MIRROR_URL no hace nada.

   Tambien: upsertItems / deleteMissing / readTable / normalize (copia completa
   y comparacion de Developer › SQL migration).
============================================================ */
'use strict';

const TIMEOUT_MS = 3000;
const SYS = ['id', 'created_at', 'modified_at', 'created_by', 'modified_by', 'etag'];
/* Campos que SharePoint manda pero no son columnas del usuario (van en las columnas de sistema o no se guardan). */
const JUNK = /^(@odata\.|_|id$|ID$|ContentType|Modified$|Created$|Author|Editor|AppAuthor|AppEditor|Attachments$|Edit$|LinkTitle|ItemChildCount$|FolderChildCount$|DocIcon$)/;

const q = s => '"' + String(s).replace(/"/g, '""') + '"';

const clients = new Map();
function client(url) {
  url = url || process.env.SQL_MIRROR_URL || '';
  if (!url) return null;
  if (!clients.has(url)) {
    const { neon } = require('@neondatabase/serverless');
    const s = neon(url);
    clients.set(url, (text, params) => s.query(text, params || []));
  }
  return clients.get(url);
}
/* Lecturas: SQL_READ_URL si existe (p. ej. una copia de solo lectura para test, asi test no le quita fuerza a
   produccion); si no, la misma base de la copia. */
function readClient() { return client(process.env.SQL_READ_URL || ''); }

/* ---- columnas de cada tabla (una vez por proceso) ---- */
const colCache = new Map();
async function columnsOf(sql, table, fresh) {
  if (!fresh && colCache.has(table)) return colCache.get(table);
  const rows = await sql("select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1", [table]);
  const map = new Map(rows.map(r => [r.column_name, r.data_type]));
  if (map.size) colCache.set(table, map);
  return map;
}

/* Columna nueva en SharePoint (sp-heal la crea sola): se agrega aqui igual, con el tipo que se ve en el valor. */
function typeForValue(v) {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'numeric';
  return 'text';
}
async function ensureColumns(sql, table, names, sample) {
  let cols = await columnsOf(sql, table);
  if (!cols.size) return null;
  const missing = names.filter(n => !cols.has(n));
  if (!missing.length) return cols;
  for (const n of missing) await sql('alter table ' + q(table) + ' add column if not exists ' + q(n) + ' ' + typeForValue(sample[n]));
  return columnsOf(sql, table, true);
}

/* ---- valores: lo de SharePoint al tipo de la columna ---- */
function toSql(v, type) {
  if (v === undefined || v === null) return null;
  if (type === 'numeric' || type === 'integer' || type === 'bigint' || type === 'double precision') {
    if (v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  }
  if (type === 'boolean') {
    if (v === '') return null;
    return v === true || v === 1 || /^(true|yes|1)$/i.test(String(v));
  }
  if (type === 'timestamp with time zone') {
    if (v === '') return null;
    const t = Date.parse(v);
    return isFinite(t) ? new Date(t).toISOString() : null;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* Una forma comparable de cualquier valor (SharePoint o SQL) segun el tipo de la columna. */
function normalize(v, type) {
  const s = toSql(v instanceof Date ? v.toISOString() : v, type);
  if (s === null) return null;
  if (type === 'timestamp with time zone') return Date.parse(s);
  if (type === 'text' && s === '') return null;
  return s;
}

const who = x => (x && x.user && (x.user.email || x.user.displayName)) || null;

/* Un renglon de Graph (item con fields, o solo fields) -> { id, sys, fields }. */
function rowOf(item, idHint) {
  const f = (item && item.fields) || item || {};
  const id = Number(item && item.id !== undefined ? item.id : (f.id !== undefined ? f.id : idHint));
  return {
    id,
    created_at: (item && item.createdDateTime) || f.Created || null,
    modified_at: (item && item.lastModifiedDateTime) || f.Modified || null,
    created_by: who(item && item.createdBy),
    modified_by: who(item && item.lastModifiedBy),
    etag: (item && (item['@odata.etag'] || item.eTag)) || f['@odata.etag'] || null,
    fields: f
  };
}

/* Guarda renglones (crear o reemplazar por id). Si el renglon en SQL es mas nuevo, no lo pisa. */
async function upsertItems(sql, table, items, opts) {
  opts = opts || {};
  if (!items.length) return 0;
  const rows = items.map(it => rowOf(it, opts.idHint));
  const names = [...new Set(rows.flatMap(r => Object.keys(r.fields).filter(k => !JUNK.test(k))))];
  const sample = {};
  rows.forEach(r => names.forEach(n => { if (sample[n] === undefined && r.fields[n] !== undefined && r.fields[n] !== null) sample[n] = r.fields[n]; }));
  const cols = await ensureColumns(sql, table, names, sample);
  if (!cols) throw Object.assign(new Error('No SQL table for list ' + table), { code: '42P01' });
  const userCols = names.filter(n => cols.has(n));
  const per = Math.max(1, Math.floor(30000 / (SYS.length + userCols.length)));
  let done = 0;
  for (let i = 0; i < rows.length; i += per) {
    const part = rows.slice(i, i + per);
    const params = [];
    const values = part.map(r => {
      const sys = [r.id, toSql(r.created_at, 'timestamp with time zone'), toSql(r.modified_at, 'timestamp with time zone'), r.created_by, r.modified_by, r.etag];
      const vals = sys.concat(userCols.map(n => toSql(r.fields[n], cols.get(n))));
      return '(' + vals.map((v, j) => {
        params.push(v);
        const p = '$' + params.length;
        if (j === 1 || j === 2) return 'coalesce(' + p + '::timestamptz, now())';
        return p;
      }).join(', ') + ')';
    });
    /* Un PATCH solo cambia las columnas que vienen; las demas se quedan como estaban. */
    const all = SYS.concat(userCols);
    const keep = new Set(['created_by', 'modified_by', 'etag']);
    const set = all.filter(c => c !== 'id' && c !== 'created_at')
      .map(c => q(c) + ' = ' + (keep.has(c) ? 'coalesce(excluded.' + q(c) + ', ' + q(table) + '.' + q(c) + ')' : 'excluded.' + q(c)));
    const text = 'insert into ' + q(table) + ' (' + all.map(q).join(', ') + ') values ' + values.join(', ') +
      ' on conflict ("id") do update set ' + set.join(', ') +
      /* El orden lo da la version del renglon en SharePoint (el numero al final del eTag, sube en cada cambio):
         una copia que llega tarde con una version mas vieja no pisa la nueva. Sin eTag en la respuesta, se aplica. */
      (opts.force ? '' : ' where coalesce(substring(excluded."etag" from \',(\\d+)"?$\')::int, 2147483647) >= coalesce(substring(' + q(table) + '."etag" from \',(\\d+)"?$\')::int, 0)');
    await sql(text, params);
    done += part.length;
  }
  return done;
}

async function deleteIds(sql, table, ids) {
  if (!ids.length) return 0;
  await sql('delete from ' + q(table) + ' where "id" = any($1::bigint[])', [ids.map(Number)]);
  return ids.length;
}

async function readTable(sql, table) {
  return sql('select * from ' + q(table) + ' order by "id"');
}

/* ---- reconocer un guardado en una lista por su URL de Graph ---- */
function parseListWrite(path, method) {
  method = String(method || 'GET').toUpperCase();
  if (method === 'GET') return null;
  const p = String(path || '').replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '').split('?')[0];
  const m = /\/lists\/([^/]+)\/items(?:\/([^/]+))?(\/fields)?$/.exec(p);
  if (!m) return null;
  let list;
  try { list = decodeURIComponent(m[1]); } catch (e) { list = m[1]; }
  const id = m[2] || null;
  if (method === 'POST' && !id) return { op: 'create', list };
  if ((method === 'PATCH' || method === 'PUT') && id) return { op: m[3] ? 'update-fields' : 'update', list, id };
  if (method === 'DELETE' && id && !m[3]) return { op: 'delete', list, id };
  return null;
}

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('SQL mirror timed out after ' + ms + ' ms')), ms); })]).finally(() => clearTimeout(t));
}

const stats = { mirrored: 0, failed: 0, skipped: 0, lastError: '' };
let chain = Promise.resolve();

/* Copia un guardado ya hecho en SharePoint. Nunca lanza. */
async function mirror(w, result, deps) {
  const sql = deps.sql || client();
  if (!sql) return;
  /* Los ids de SharePoint siempre son numeros; otra cosa no es un renglon de lista. */
  if (w.id && !/^\d+$/.test(String(w.id))) { stats.skipped++; return; }
  try {
    await withTimeout((async () => {
      if (w.op === 'delete') { await deleteIds(sql, w.list, [w.id]); return; }
      if (w.op === 'update-fields') {
        /* La respuesta trae todos los campos del renglon (Created/Modified incluidos). */
        if (!result || typeof result !== 'object' || result.error) return;
        await upsertItems(sql, w.list, [result], { idHint: w.id, partial: true });
        return;
      }
      if (!result || !result.id) return;
      await upsertItems(sql, w.list, [result]);
    })(), deps.timeoutMs || TIMEOUT_MS);
    stats.mirrored++;
  } catch (e) {
    stats.failed++;
    stats.lastError = e.message;
    require('./sql-read').trip(e, deps.breakerMs);
    console.error('sql-mirror: ' + w.op + ' ' + w.list + (w.id ? ' #' + w.id : '') + ' not copied to SQL: ' + e.message);
  }
}

/* graphFetch con copia a SQL (y, segun el switch, lecturas desde SQL: lib/sql-read). Misma firma y mismo resultado. */
function wrap(graphFetch, deps) {
  deps = deps || {};
  const wrapped = async function (path, options, raw) {
    const method = String((options && options.method) || 'GET').toUpperCase();
    if (method === 'GET' && (deps.sql || process.env.SQL_MIRROR_URL) && /\/lists\/[^/]+\/items/.test(String(path))) {
      return require('./sql-read').read(graphFetch, path, options, raw, Object.assign({ client: readClient, columnsOf }, deps));
    }
    const result = await graphFetch(path, options, raw);
    const w = parseListWrite(path, options && options.method);
    if (!w || !(deps.sql || process.env.SQL_MIRROR_URL)) return result;
    /* raw: la Response se regresa tal cual aunque SharePoint haya dicho que no; eso no se copia. */
    if (raw && result && result.ok === false) return result;
    /* Se forma en la fila AL MOMENTO (sin esperar nada antes): asi las copias quedan en el orden en que SharePoint
       contesto, y un cambio viejo nunca le gana a uno nuevo del mismo renglon. */
    let bodyP = Promise.resolve(result);
    if (raw && result && typeof result.clone === 'function') {
      let c = null;
      try { c = w.op === 'delete' ? null : result.clone(); } catch (e) { c = null; }
      bodyP = c ? c.json().catch(() => null) : Promise.resolve(null);
    }
    const R = require('./sql-read');
    const modeP = deps.mode ? Promise.resolve(deps.mode) : R.readMode(graphFetch, path, deps).catch(() => 'sharepoint');
    const job = chain.then(async () => {
      const mode = await modeP;
      /* Con el freno puesto (y leyendo de SharePoint) se salta: Copy all lo arregla. En modo sql se intenta siempre. */
      if (mode !== 'sql' && !R.sqlOk()) { stats.skipped++; stats.lastError = 'SQL paused (needs Copy all)'; return; }
      await mirror(w, await bodyP, deps);
    });
    chain = job.catch(() => {});
    /* Switch en sql: el guardado espera la copia (para leer luego lo que se guardo). Si no, por detras. */
    if ((await modeP) === 'sql') { await chain; return result; }
    R.background(() => job);
    return result;
  };
  wrapped.unwrapped = graphFetch;
  return wrapped;
}

/* Para el ruteador de cada portal: los crons y procesos de fondo siempre leen de SharePoint. */
function context(ctx, fn) { return require('./sql-read').context(ctx, fn); }

module.exports = { wrap, context, client, upsertItems, deleteIds, readTable, columnsOf, normalize, toSql, rowOf, parseListWrite, JUNK, SYS, stats, _clearCache: () => colCache.clear() };
