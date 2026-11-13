/* ============================================================
   gsocd-shared/lib/sql-journal.js -- el DIARIO de cuando la base (Neon) no
   contesta, con "guardar en SQL primero" (lib/sql-first). CFO 12/11/2026:
   "hibrido automatico", nadie escoge nada a mano.

   Mientras SQL no contesta, lo que se guarda va a SharePoint (todos lo ven
   al momento) y cada cambio queda en el diario: la lista de SharePoint
   SqlOutageLog (lib/sp-catalog, se crea sola). Un renglon por cambio: hora,
   lista, renglon y los campos EXACTOS que se mandaron (el PATCH, no el
   renglon). Por que SharePoint y no Vercel Blob / Runtime Cache: si
   SharePoint acepta el cambio, acepta su renglon del diario (mismo lugar, mismo
   momento); dura para siempre, no pide llaves nuevas, y Runtime Cache se
   puede borrar solo (no es para guardar).

   Estados: pending (anotado, el guardado en SharePoint va en camino), done
   (SharePoint lo guardo), deferred (renglon nacido en SQL que SharePoint no
   conoce: solo queda aqui), failed (SharePoint dijo que no; la persona vio el
   error), applied / skipped (ya se paso a SQL, o no aplica, con su porque).

   Cuando SQL vuelve (apply): en el orden en que se hicieron (id del diario),
   campo por campo. Cada cambio entra a SQL en el MISMO comando que su llave en
   _sql_journal: si se cae a la mitad, se reanuda sin duplicar. Un campo que
   SQL cambio DESPUES (fila _sp_outbox con hora mayor) no se pisa; los cambios
   de la fila de ANTES de la caida pierden los campos que el diario cambio
   despues (nunca pisan lo nuevo en SharePoint). Mientras haya diario sin
   pasar: _sql_journal_state.open = true, la fila no sale a SharePoint y cada
   servidor que lo sabe lee y guarda en SharePoint (con el diario).
   Lo que no se pudo pasar se anota (problem) y el cron de Admin manda el aviso
   de errores (app-error) una vez.
============================================================ */
'use strict';

const crypto = require('crypto');

const LIST = 'SqlOutageLog';
const OPEN = ['pending', 'done', 'deferred', 'failed'];
/* Un 'pending' mas nuevo que esto puede ir en camino (el guardado no ha terminado): se espera. */
const PENDING_GRACE_MS = process.env.SQL_JOURNAL_GRACE_MS !== undefined && process.env.SQL_JOURNAL_GRACE_MS !== '' ? Number(process.env.SQL_JOURNAL_GRACE_MS) : 2 * 60 * 1000;
const CHECK_TTL_MS = 10 * 1000;
const STATE_TTL_MS = 30 * 1000;
const APP = 'SharePoint App';
const ME = 'j-' + crypto.randomBytes(4).toString('hex');

const SF = () => require('./sql-first');
const M = () => require('./sql-mirror');
const R = () => require('./sql-read');
const q = s => '"' + String(s).replace(/"/g, '""') + '"';
const stats = { recorded: 0, deferred: 0, applied: 0, skipped: 0, problems: 0, runs: 0, lastError: '' };

/* ---- lo que sabe este servidor ---- */
let localOpen = false;
let lastSite = '';
let stateAt = 0;
let seq = 0;
function seeSite(site) { if (site) lastSite = site; }
function site() { return lastSite; }
function gateOpen() { return localOpen; }
function itemsPath(s) { return (s || lastSite) + '/lists/' + LIST + '/items'; }
const H = { 'Content-Type': 'application/json' };

/* ---- anotar ---- */
async function record(base, s, e) {
  const key = crypto.randomUUID();
  const at = new Date().toISOString();
  const fields = {
    Title: key, At: at, ListName: e.list, Op: e.op, RowId: e.id ? String(e.id) : '', SpId: e.spId ? String(e.spId) : '',
    Fields: e.fields === null || e.fields === undefined ? '' : JSON.stringify(e.fields), State: e.state,
    Extra: JSON.stringify({ site: s, wk: e.wk || null, n: ++seq, by: ME })
  };
  const r = await base(itemsPath(s), { method: 'POST', headers: H, body: JSON.stringify({ fields }) });
  localOpen = true;
  stats.recorded++;
  if (e.state === 'deferred') stats.deferred++;
  return { jid: String(r && r.id), key, at };
}
/* Cambia el estado de un renglon del diario. Nunca lanza (lo que no se marca lo resuelve apply). */
async function mark(base, s, jid, patch) {
  try { await base(itemsPath(s) + '/' + jid + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify(patch) }); return true; }
  catch (e) { stats.lastError = e.message; console.error('sql-journal: entry #' + jid + ' not marked ' + (patch.State || '') + ': ' + e.message); return false; }
}

/* ---- leer lo que falta pasar ---- */
const isOpen = it => OPEN.includes(String((it && it.fields && it.fields.State) || ''));
async function readOpen(base, path, top) {
  const filter = OPEN.map(x => "fields/State eq '" + x + "'").join(' or ');
  let url = path + '?$expand=fields&$top=' + (top || 500) + '&$filter=' + encodeURIComponent(filter);
  const out = [];
  for (let i = 0; url && i < 50; i++) {
    const r = await base(url, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
    ((r && r.value) || []).filter(isOpen).forEach(x => out.push(x));
    if (top && out.length >= top) break;
    url = (r && r['@odata.nextLink']) || null;
  }
  return out.sort((a, b) => Number(a.id) - Number(b.id));
}
/* Hay diario sin pasar en SharePoint? true / false / null (no se pudo saber). Memoria de 10 s por servidor. */
let chk = { at: 0, v: null };
async function openInSharePoint(base, s) {
  if (!s && !lastSite) return null;
  if (Date.now() - chk.at < CHECK_TTL_MS && chk.v !== null) return chk.v;
  try {
    const v = (await readOpen(base, itemsPath(s), 1)).length > 0;
    chk = { at: Date.now(), v };
    if (v) localOpen = true;
    return v;
  } catch (e) {
    /* La lista todavia no existe = nunca hubo caida. */
    if (e && e.status === 404) { chk = { at: Date.now(), v: false }; return false; }
    return null;
  }
}

/* ---- la marca compartida en SQL ---- */
async function setOpen(sql, open) {
  await sql('insert into "_sql_journal_state" ("id", "open", "since") values (1, $1, now()) on conflict ("id") do update set "open" = $1, ' +
    '"since" = case when "_sql_journal_state"."open" = $1 then "_sql_journal_state"."since" else now() end', [!!open]);
  stateAt = Date.now();
  if (open) localOpen = true;
}
/* Cada 30 s (con SQL bien): otro servidor anoto diario que falta pasar? */
async function refreshGate(sql) {
  if (localOpen || Date.now() - stateAt < STATE_TTL_MS) return localOpen;
  stateAt = Date.now();
  try {
    const r = await sql('select "open" from "_sql_journal_state" where "id" = 1');
    if (r && r[0] && r[0].open) localOpen = true;
  } catch (e) { /* la tabla todavia no existe: nunca hubo caida */ }
  return localOpen;
}

/* ---- pasar el diario a SQL ---- */
const userKeys = f => Object.keys(f || {}).filter(k => !k.includes('@odata') && !M().JUNK.test(k) && !M().SYS.includes(k) && k !== 'sp_id');
function userOnly(f) { const o = {}; userKeys(f).forEach(k => { o[k] = f[k]; }); return o; }
const SEARCH_PAGES = 40;
/* Un campo del diario contra el de SharePoint: fecha sin hora = la medianoche del sitio (como la guarda SharePoint). */
const sameField = (a, b) => same(a, b) || (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(String(a)) && typeof b === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(b) &&
  Date.parse(SF().midnightIn(String(a), process.env.SP_SITE_TZ || 'America/Los_Angeles')) === Date.parse(b));
const same = (a, b) => (a === null || a === undefined || a === '') ? (b === null || b === undefined || b === '')
  : String(a) === String(b) || (Number(a) === Number(b) && isFinite(Number(a)) && b !== '' && b !== null) ||
    (/^\d{4}-\d{2}-\d{2}T/.test(String(a)) && Date.parse(a) === Date.parse(b));

/* Columnas de texto con el id de otra lista: ids de SharePoint de renglones nacidos en SQL -> su id de SQL. Solo valores
   que son el id (con prefijo "tech:", "CT-" o en lista con comas) y los "CT-<id>"/"tech:<id>" de PeopleJSON; en
   llaves y titulos compuestos el numero no se toca (podria ser otra cosa: el numero del cliente). */
const SIMPLE = /^\s*(?:[A-Za-z]+[:-])?\d+(?:\s*,\s*(?:[A-Za-z]+[:-])?\d+)*\s*$/;
async function revTranslate(sql, list, fields, notes) {
  const refs = SF().REFS[list] || {};
  const out = Object.assign({}, fields);
  for (const col of Object.keys(refs)) {
    const v = out[col];
    if (v === null || v === undefined || v === '') continue;
    const s = typeof v === 'number' ? String(v) : (Array.isArray(v) ? v.join(',') : String(v));
    const json = /^\s*[[{]/.test(s);
    if (!json && !SIMPLE.test(s)) continue;
    const re = json ? /\b(?:CT-|tech:)(\d+)\b/g : /\d+/g;
    const nums = [...new Set([...s.matchAll(re)].map(m => m[json ? 1 : 0]).filter(x => Number(x) < SF().ID_MIN))];
    if (!nums.length) continue;
    let rows = [];
    try { rows = await sql('select "id", "sp_id" from ' + q(refs[col]) + ' where "sp_id" = any($1::bigint[]) and "id" >= ' + SF().ID_MIN, [nums.map(Number)]); }
    catch (e) { continue; }
    if (!rows.length) continue;
    const map = new Map(rows.map(r => [String(r.sp_id), String(r.id)]));
    const sub = t => t.replace(re, (m, g) => { const n = json ? g : m; return map.has(n) ? m.replace(n, map.get(n)) : m; });
    if (typeof v === 'number') out[col] = map.has(s) ? Number(map.get(s)) : v;
    else if (Array.isArray(v)) out[col] = v.map(x => map.has(String(x)) ? (typeof x === 'number' ? Number(map.get(String(x))) : map.get(String(x))) : x);
    else out[col] = sub(s);
    if (notes) notes.push(col + ': SharePoint ids changed to the SQL ids');
  }
  return out;
}
/* Algun campo con un id nacido en SQL (SharePoint lo guardo tal cual)? -> esos campos salen otra vez por la fila, traducidos. */
function sqlBornRefs(list, fields) {
  const refs = SF().REFS[list] || {};
  const o = {};
  Object.keys(refs).forEach(col => {
    const v = fields[col];
    if (v === null || v === undefined || v === '') return;
    if ((String(v).match(/\d+/g) || []).some(x => SF().isSqlBorn(x) && Number(x) < 1e9)) o[col] = v;
  });
  return Object.keys(o).length ? o : null;
}

async function targetRow(sql, list, id) {
  const T = q(list);
  if (SF().isSqlBorn(id)) return (await sql('select "id", "sp_id" from ' + T + ' where "id" = $1', [Number(id)]))[0] || null;
  return (await sql('select "id", "sp_id" from ' + T + ' where "id" = $1', [Number(id)]))[0] ||
    (await sql('select "id", "sp_id" from ' + T + ' where "sp_id" = $1 and "id" >= ' + SF().ID_MIN + ' limit 1', [Number(id)]))[0] || null;
}

/* Un renglon "pending" de hace mas de 2 min: no se sabe si SharePoint lo guardo. Se ve en SharePoint. */
async function resolvePending(sql, base, e, items) {
  try {
    if (e.op === 'update') {
      const it = await base(items + '/' + (e.spId || e.id) + '?$expand=fields');
      const f = (it && it.fields) || {};
      return userKeys(e.fields).every(k => same(e.fields[k], f[k])) ? { ok: true } : { ok: false, why: 'SharePoint does not have this change (the save did not go through)' };
    }
    if (e.op === 'delete') {
      try { await base(items + '/' + (e.spId || e.id)); return { ok: false, why: 'still in SharePoint (the delete did not go through)' }; }
      catch (err) { return err && err.status === 404 ? { ok: true } : { ok: null, why: err.message }; }
    }
    if (e.op === 'create') {
      /* Todo lo creado en esa lista desde 2 min antes, TODAS las paginas (una lista con mucho movimiento, p. ej.
         NotificationLog, pasa de 200 en un rato: antes solo se leia la primera y un create que si quedo se daba por perdido). */
      const since = new Date(Date.parse(e.at) - 120000).toISOString();
      let url = items + '?$expand=fields&$top=500&$filter=' + encodeURIComponent("fields/Created ge '" + since + "'");
      const found = [];
      let complete = false;
      for (let i = 0; i < SEARCH_PAGES; i++) {
        const r = await base(url, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
        found.push(...((r && r.value) || []));
        url = (r && r['@odata.nextLink']) || null;
        if (!url) { complete = true; break; }
      }
      const keys = userKeys(e.fields).filter(k => e.fields[k] !== null && e.fields[k] !== '' && e.fields[k] !== undefined && typeof e.fields[k] !== 'object');
      for (const it of found.sort((a, b) => Number(a.id) - Number(b.id))) {
        if (!keys.every(k => sameField(e.fields[k], (it.fields || {})[k]))) continue;
        const taken = (await sql('select 1 from ' + q(e.list) + ' t where "id" = $1 or (to_jsonb(t)->>\'sp_id\')::bigint = $1 limit 1', [Number(it.id)]))[0];
        if (!taken) return { ok: true, spId: Number(it.id) };
      }
      /* Busqueda incompleta: no se descarta, se vuelve a buscar despues. */
      if (!complete) return { ok: null, why: 'SharePoint search did not finish (more than ' + SEARCH_PAGES + ' pages)' };
      /* Respuesta cortada (504, tiempo agotado o sin respuesta) y no esta: se salta, pero con aviso (no en silencio). */
      return { ok: false, why: 'not found in SharePoint (the save did not go through)', lost: /did not answer \((0|504|408)\)/.test(String(e.note || '')) };
    }
  } catch (err) { return { ok: null, why: err.message }; }
  return { ok: false, why: 'unknown change' };
}

const setList = names => names.map(n => q(n) + ' = excluded.' + q(n)).join(', ');
/* El cambio a SQL, con su llave, en UN comando. Regresa la nota (que paso). */
async function applyEntry(sql, e, deps) {
  const SFI = SF()._internals;
  const T = q(e.list);
  const notes = [];
  await SFI.ensureSpId(sql, e.list);
  const P = [e.key, e.at, e.list, e.op];
  const J = 'j as (insert into "_sql_journal" ("k", "at", "list", "op", "row_id", "result") values ($1, $2::timestamptz, $3, $4, $5, $6) on conflict ("k") do nothing returning "k") ';
  /* Un cambio a la fila (hacia SharePoint) con la hora del cambio del diario: asi queda en su lugar contra los de antes. */
  const OB = (rowExpr, spExpr, fieldsExpr, opName, from, siteP) => 'ob as (insert into "_sp_outbox" ("at", "list", "row_id", "sp_id", "op", "fields", "site", "jk") select $2::timestamptz, $3, ' +
    rowExpr + ', ' + spExpr + ', \'' + opName + '\', ' + fieldsExpr + ', ' + siteP + ', $1 from ' + from + ' returning "n") ';
  if (e.op === 'create') {
    const raw = userOnly(e.fields || {});
    const cols = await SFI.columnsFor(sql, e.list, raw, deps, true);
    const F = await revTranslate(sql, e.list, raw, notes);
    /* Lo guardo SQL a la vez (la respuesta de SQL se perdio, wk): el mismo renglon, con el id de SharePoint en sp_id. */
    const twin = e.wk ? (await sql('select * from "_sp_outbox" where "wk" = $1 and "op" = \'create\' limit 1', [e.wk]))[0] : null;
    if (twin) {
      P.push(String(twin.row_id), 'applied: SQL had it too (#' + twin.row_id + '), linked to SharePoint #' + e.spId, e.spId, Number(twin.n), Number(twin.row_id));
      const dupSp = twin.done_at && twin.sp_id && Number(twin.sp_id) !== Number(e.spId) ? Number(twin.sp_id) : null;
      let text = 'with ' + J + ', u as (update ' + T + ' set "sp_id" = $7 where "id" = $9 and exists (select 1 from j) returning "id"), ' +
        'o as (update "_sp_outbox" set "done_at" = coalesce("done_at", now()), "sp_id" = $7, "note" = \'the same save reached SharePoint while the database was not answering\' where "n" = $8 and exists (select 1 from j) returning "n") ';
      if (dupSp) { P.push(e.site || '', dupSp); text += ', ob as (insert into "_sp_outbox" ("at", "list", "row_id", "sp_id", "op", "site", "jk", "note") select $2::timestamptz, $3, $9, $11, \'delete\', $10, $1, \'duplicate in SharePoint\' from j returning "n") '; notes.push('SharePoint had it twice (#' + dupSp + ' is deleted)'); }
      await sql(text + 'select (select count(*) from j) as n', P);
      return notes.concat(['SQL had it too (#' + twin.row_id + ')']).join('; ');
    }
    const names = Object.keys(F).filter(k => cols.has(k) && F[k] !== null && F[k] !== '' && F[k] !== undefined);
    P.push(String(e.spId), 'applied', Number(e.spId), APP, crypto.randomUUID());
    const fix = sqlBornRefs(e.list, raw);
    const vals = names.map(n => { P.push(SFI.sqlValue(F[n], cols.get(n))); return '$' + P.length + SFI.castOf(cols.get(n)); });
    let text = 'with ' + J + ', ins as (insert into ' + T + ' ("id", "sp_id", "created_at", "modified_at", "created_by", "modified_by", "etag"' + names.map(n => ', ' + q(n)).join('') + ') ' +
      'select $7, $7, $2::timestamptz, $2::timestamptz, $8, $8, \'"\' || $9 || \',1"\'' + vals.map(v => ', ' + v).join('') + ' from j ' +
      'on conflict ("id") do update set "sp_id" = excluded."sp_id"' + (names.length ? ', ' + setList(names) : '') + ' returning "id"), ' + SFI.MARK(3, 'ins');
    if (fix) { P.push(e.site || '', JSON.stringify(fix)); text += ', ' + OB('$7', '$7', '$' + P.length + '::jsonb', 'update', 'ins', '$' + (P.length - 1)); notes.push('ids born in SQL sent again to SharePoint'); }
    await sql(text + ' select (select count(*) from j) as n', P);
    return notes.join('; ') || 'created in SQL with the SharePoint id';
  }
  const row = await targetRow(sql, e.list, e.id);
  if (!row) {
    P.push(String(e.id), 'skipped: the row is not in SQL');
    await sql('with ' + J + ' select 1', P);
    const gone = (await sql('select 1 from "_sp_outbox" where "list" = $1 and "op" = \'delete\' and ("row_id" = $2 or "sp_id" = $2) limit 1', [e.list, Number(e.id)]))[0];
    return gone ? 'skipped: deleted in SQL' : { problem: 'the row #' + e.id + ' is not in SQL' };
  }
  const X = Number(row.id);
  if (e.op === 'delete') {
    /* Lo que esperaba para SharePoint de ese renglon ya no sale (se borro). */
    const pend = await sql('update "_sp_outbox" set "done_at" = now(), "note" = coalesce("note" || \'; \', \'\') || \'deleted while the database was not answering\' ' +
      'where "list" = $1 and "row_id" = $2 and "done_at" is null and ("jk" is null or "jk" <> $3) returning "op"', [e.list, X, e.key]);
    P.push(String(X), 'applied', X);
    let text = 'with ' + J + ', d as (delete from ' + T + ' where "id" = $7 and exists (select 1 from j) returning "id", "sp_id"), ' + SFI.MARK(3, 'd');
    if (e.deferred) { P.push(e.site || ''); text += ', ' + OB('d."id"', 'd."sp_id"', 'null', 'delete', 'd where d."sp_id" is not null', '$' + P.length); }
    await sql(text + ' select (select count(*) from j) as n', P);
    return 'deleted in SQL' + (pend.length ? '; ' + pend.length + ' change(s) waiting for SharePoint dropped' : '');
  }
  const raw = userOnly(e.fields || {});
  /* Campos que SQL cambio DESPUES (fila con hora mayor, que no salio de este diario): SQL ya tiene lo mas nuevo. */
  const newer = new Set();
  (await sql('select "fields" from "_sp_outbox" where "list" = $1 and "row_id" = $2 and "at" > $3::timestamptz and "op" in (\'update\', \'create\') and ("jk" is null or "jk" <> $4)',
    [e.list, X, e.at, e.key])).forEach(r => Object.keys(r.fields || {}).forEach(k => newer.add(k)));
  const use = {};
  Object.keys(raw).forEach(k => { if (!newer.has(k)) use[k] = raw[k]; });
  if (newer.size && Object.keys(use).length < Object.keys(raw).length) notes.push('SQL has newer ' + Object.keys(raw).filter(k => newer.has(k)).join(', '));
  const cols = await SFI.columnsFor(sql, e.list, use, deps, true);
  const F = await revTranslate(sql, e.list, use, notes);
  const names = Object.keys(F).filter(k => cols.has(k));
  P.push(String(X), 'applied', X, APP, crypto.randomUUID());
  const sets = names.map(n => { P.push(SFI.sqlValue(F[n], cols.get(n))); return q(n) + ' = $' + P.length + SFI.castOf(cols.get(n)); });
  let text = 'with ' + J;
  if (names.length) {
    text += ', u as (update ' + T + ' set ' + sets.concat(['"modified_at" = greatest(' + T + '."modified_at", $2::timestamptz)', '"modified_by" = $8', '"etag" = ' + SFI.NEXT_ETAG(T).replace(/\$3/g, '$9')]).join(', ') +
      ' where "id" = $7 and exists (select 1 from j) returning "id", "sp_id"), ' + SFI.MARK(3, 'u');
    /* Renglon nacido en SQL (SharePoint no lo tenia o no se sabia su id): sale a SharePoint por la fila. Y si los campos llevan
       ids nacidos en SQL que SharePoint guardo tal cual, esos salen otra vez, traducidos. */
    const send = e.deferred ? use : sqlBornRefs(e.list, use);
    if (send) { P.push(e.site || '', JSON.stringify(send)); text += ', ' + OB('u."id"', 'u."sp_id"', '$' + P.length + '::jsonb', 'update', 'u', '$' + (P.length - 1)); }
  }
  await sql(text + ' select (select count(*) from j) as n', P);
  /* Los cambios de la fila de ANTES (hora menor) ya no mandan esos campos: SharePoint tiene lo del diario, que es mas nuevo. */
  const keys = Object.keys(use);
  if (keys.length) {
    await sql('update "_sp_outbox" set "fields" = "fields" - $3::text[], "note" = coalesce("note" || \'; \', \'\') || \'newer value saved while the database was not answering\' ' +
      'where "list" = $1 and "row_id" = $2 and "done_at" is null and "op" = \'update\' and "at" < $4::timestamptz and ("jk" is null or "jk" <> $5) and "fields" ?| $3::text[]',
      [e.list, X, keys, e.at, e.key]);
    await sql('update "_sp_outbox" o set "done_at" = now() where "list" = $1 and "row_id" = $2 and "done_at" is null and "op" = \'update\' and ("jk" is null or "jk" <> $3) ' +
      'and not exists (select 1 from jsonb_object_keys(coalesce(o."fields", \'{}\'::jsonb)) k where k not like \'%@odata%\')', [e.list, X, e.key]);
  }
  return notes.join('; ') || (names.length ? 'applied' : 'nothing to change');
}

/* Pasa el diario a SQL. opts: { sql, graphFetch (SharePoint sin envolver), site o listPath, budgetMs, catalog }. Nunca lanza. */
async function apply(opts) {
  opts = opts || {};
  const sql = opts.sql || M().client();
  const base = opts.graphFetch;
  const out = { applied: 0, skipped: 0, problems: [], left: 0 };
  const path = opts.listPath || (opts.site || lastSite ? itemsPath(opts.site) : '');
  if (!sql || !base || !path) return Object.assign(out, { off: true });
  stats.runs++;
  const until = Date.now() + (opts.budgetMs || 20000);
  const me = opts.me || ME;
  try {
    await SF().ensureSchema(sql);
    const got = await sql('insert into "_sql_journal_state" ("id", "open", "locked_until", "locked_by") values (1, false, now() + interval \'2 minutes\', $1) ' +
      'on conflict ("id") do update set "locked_until" = excluded."locked_until", "locked_by" = $1 ' +
      'where "_sql_journal_state"."locked_until" is null or "_sql_journal_state"."locked_until" < now() or "_sql_journal_state"."locked_by" = $1 returning "id"', [me]);
    if (!got.length) return Object.assign(out, { busy: true });
  } catch (e) { R().trip(e); stats.lastError = e.message; return Object.assign(out, { error: e.message }); }
  try {
    for (let round = 0; round < 20 && Date.now() < until; round++) {
      let items;
      try { items = await readOpen(base, path); }
      catch (e) { if (e && e.status === 404) items = []; else { out.error = 'SharePoint: ' + e.message; return out; } }
      if (!items.length) { await setOpen(sql, false); localOpen = false; chk = { at: Date.now(), v: false }; return out; }
      await setOpen(sql, true);
      let stop = false;
      for (const it of items) {
        if (Date.now() >= until) { stop = true; break; }
        const r = await applyOne(sql, base, path, it, opts, out);
        if (r === 'wait' || r === 'down') { stop = true; out.waiting = r; break; }
      }
      if (stop) break;
    }
    out.left = -1;
  } catch (e) { stats.lastError = e.message; out.error = e.message; console.error('sql-journal: apply stopped: ' + e.message); }
  finally { await sql('update "_sql_journal_state" set "locked_until" = null where "id" = 1 and "locked_by" = $1', [me]).catch(() => {}); }
  return out;
}
async function applyOne(sql, base, path, it, opts, out) {
  const f = it.fields || {};
  let extra = {}; try { extra = JSON.parse(f.Extra || '{}') || {}; } catch (x) { extra = {}; }
  let fields = null; try { fields = f.Fields ? JSON.parse(f.Fields) : null; } catch (x) { fields = null; }
  const e = { jid: String(it.id), key: String(f.Title || ''), at: f.At, list: f.ListName, op: f.Op, id: f.RowId, spId: Number(f.SpId) || null,
    fields: fields || {}, state: f.State, note: f.Note || '', site: extra.site || '', wk: extra.wk || null, deferred: f.State === 'deferred' };
  const finish = (state, note) => markPath(base, path, e.jid, { State: state, Note: String(note || '').slice(0, 2000), AppliedAt: new Date().toISOString() });
  try {
    if (!e.key || !e.list || !e.op) { await finish('skipped', 'not a journal entry'); out.skipped++; return 'skipped'; }
    const had = (await sql('select "result" from "_sql_journal" where "k" = $1', [e.key]))[0];
    if (had) { await finish(/^skipped/.test(had.result) ? 'skipped' : 'applied', had.result); return 'applied'; }
    if (e.state === 'failed') {
      await sql('insert into "_sql_journal" ("k", "at", "list", "op", "row_id", "result") values ($1, $2::timestamptz, $3, $4, $5, $6) on conflict ("k") do nothing',
        [e.key, e.at, e.list, e.op, e.id || null, 'skipped: SharePoint did not take it (the person saw it was not saved)']);
      await finish('skipped', 'SharePoint did not take it (the person saw it was not saved)');
      out.skipped++; stats.skipped++; return 'skipped';
    }
    if (e.state === 'pending') {
      if (Date.now() - Date.parse(e.at) < PENDING_GRACE_MS) return 'wait';
      const items = path.replace('/lists/' + LIST + '/items', '/lists/' + encodeURIComponent(e.list) + '/items');
      const r = await resolvePending(sql, base, e, items);
      if (r.ok === null) return 'wait';
      if (!r.ok) {
        if (r.lost) { await recordProblem(sql, e, r.why + ' (Microsoft did not answer when it was saved)'); out.problems.push(e.list + ' ' + e.op + ': ' + r.why); stats.problems++; }
        else await sql('insert into "_sql_journal" ("k", "at", "list", "op", "row_id", "result") values ($1, $2::timestamptz, $3, $4, $5, $6) on conflict ("k") do nothing',
          [e.key, e.at, e.list, e.op, e.id || null, 'skipped: ' + r.why]);
        await finish('skipped', r.why); out.skipped++; stats.skipped++; return 'skipped';
      }
      if (r.spId) e.spId = r.spId;
    }
    if (e.op === 'create' && !e.spId) {
      await recordProblem(sql, e, 'create without a SharePoint id');
      await finish('skipped', 'create without a SharePoint id'); out.skipped++; out.problems.push(e.list + ' create'); return 'skipped';
    }
    const res = await applyEntry(sql, e, { catalog: opts.catalog });
    if (res && res.problem) {
      await recordProblem(sql, e, res.problem);
      await finish('skipped', res.problem); out.skipped++; stats.problems++; out.problems.push(e.list + ' #' + e.id + ': ' + res.problem); return 'skipped';
    }
    await finish(/^skipped/.test(res) ? 'skipped' : 'applied', res);
    out.applied++; stats.applied++;
    return 'applied';
  } catch (err) {
    if (isDown(err)) { R().trip(err); stats.lastError = err.message; return 'down'; }
    /* Un dato que SQL no acepta: se anota y se sigue con lo demas (nada se descarta en silencio: aviso del cron). */
    console.error('sql-journal: ' + e.list + ' ' + e.op + ' #' + (e.id || e.spId) + ' not applied: ' + err.message);
    try {
      await recordProblem(sql, e, err.message);
      await finish('skipped', 'not applied: ' + err.message);
    } catch (x) { return 'down'; }
    out.skipped++; stats.problems++; out.problems.push(e.list + ': ' + err.message);
    return 'skipped';
  }
}
async function markPath(base, path, jid, patch) {
  try { await base(path + '/' + jid + '/fields', { method: 'PATCH', headers: H, body: JSON.stringify(patch) }); }
  catch (e) { stats.lastError = e.message; }
}
async function recordProblem(sql, e, why) {
  await sql('insert into "_sql_journal" ("k", "at", "list", "op", "row_id", "result", "problem") values ($1, $2::timestamptz, $3, $4, $5, $6, $7) ' +
    'on conflict ("k") do update set "problem" = excluded."problem", "result" = excluded."result"',
    [e.key, e.at, e.list, e.op, e.id || (e.spId ? String(e.spId) : null), 'skipped: ' + String(why).slice(0, 500), String(why).slice(0, 500)]);
}
function isDown(e) {
  if (!e) return false;
  if (e.status && e.status < 500) return false;
  const code = typeof e.code === 'string' ? e.code : '';
  if (/^[0-9A-Z]{5}$/.test(code)) return /^(08|53|57)/.test(code);
  return true;
}

/* Lo que no se pudo pasar y no se ha avisado (para el cron). */
async function problems(sql) {
  try { return await sql('select "k", "at", "list", "op", "row_id", "problem" from "_sql_journal" where "problem" is not null and "alerted_at" is null order by "at"'); }
  catch (e) { return []; }
}
async function alerted(sql, keys) {
  if (keys.length) await sql('update "_sql_journal" set "alerted_at" = now() where "k" = any($1::text[])', [keys]);
}

/* Por detras, uno a la vez por servidor: con SQL de vuelta y diario sin pasar. */
let applying = null;
function kickApply(base, deps) {
  if (applying || !base || !lastSite) return applying;
  applying = R().background(async () => {
    try { await apply({ sql: deps && deps.sql, graphFetch: base, budgetMs: (deps && deps.applyBudgetMs) || 20000, catalog: deps && deps.catalog }); }
    finally { applying = null; }
  });
  return applying;
}
function idle() { return applying || Promise.resolve(); }

module.exports = { LIST, OPEN, record, mark, readOpen, openInSharePoint, setOpen, refreshGate, apply, kickApply, idle, problems, alerted, gateOpen, seeSite, site, itemsPath,
  revTranslate, isDown, stats, _me: ME, _reset: () => { localOpen = false; lastSite = ''; stateAt = 0; chk = { at: 0, v: null }; applying = null; } };
