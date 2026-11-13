/* lib/sql-first.js (guardar en SQL primero, SharePoint de respaldo; CFO 12/11/2026) contra un Postgres en memoria
   y un SharePoint falso. Correr: npm i --no-save @electric-sql/pglite && node lib/sql-first.test.js */
'use strict';
let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch (e) { console.log('SKIP: npm i --no-save @electric-sql/pglite'); process.exit(0); }
const M = require('./sql-mirror');
const R = require('./sql-read');
const SF = require('./sql-first');
let ok = 0, fail = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } };
const quiet = console.error;
const hush = () => { console.error = () => {}; };
const loud = () => { console.error = quiet; };

/* SharePoint falso: sus propios ids, eTag, columnas conocidas; down = Microsoft caido. */
function fakeSP() {
  const sp = { lists: {}, next: {}, calls: [], down: false, slow: 0, known: null, failList: null };
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  sp.fetch = async (path, opts, raw) => {
    const method = String((opts && opts.method) || 'GET').toUpperCase();
    sp.calls.push(method + ' ' + path);
    if (sp.slow) await new Promise(r => setTimeout(r, sp.slow));
    const m = /\/lists\/([^/?]+)\/items(?:\/(\d+))?(\/fields)?/.exec(path);
    const list = m ? decodeURIComponent(m[1]) : null;
    if (sp.down || (sp.failList && sp.failList === list)) throw err(503, 'Service Unavailable');
    if (!m) return { value: [] };
    const L = sp.lists[list] = sp.lists[list] || {};
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    const checkCols = f => { Object.keys(f).forEach(k => { if (sp.known && !k.includes('@odata') && !sp.known.includes(k)) throw err(400, "Field '" + k + "' is not recognized"); }); };
    if (method === 'GET') {
      if (m[2]) { const it = L[m[2]]; if (!it) throw err(404, 'Item not found'); return it; }
      return { value: Object.values(L) };
    }
    if (method === 'POST') {
      checkCols(body.fields || {});
      const id = sp.next[list] = (sp.next[list] || 100) + 1;
      L[id] = { id: String(id), '@odata.etag': '"sp' + id + ',1"', fields: Object.assign({ id: String(id) }, body.fields) };
      return L[id];
    }
    const it = L[m[2]];
    if (!it) throw err(404, 'Item not found');
    if (method === 'DELETE') { delete L[m[2]]; return null; }
    checkCols(body);
    Object.assign(it.fields, body);
    const v = Number(/,(\d+)"/.exec(it['@odata.etag'])[1]) + 1;
    it['@odata.etag'] = '"sp' + it.id + ',' + v + '"';
    return Object.assign({}, it.fields);
  };
  return sp;
}

(async () => {
  const db = new PGlite();
  const sql = (t, p) => db.query(t, p || []).then(r => r.rows);
  await sql('create table "_sp_base" ("id" bigint primary key, "created_at" timestamptz not null default now(), "modified_at" timestamptz not null default now(), "created_by" text, "modified_by" text, "etag" text)');
  await sql('create table "Orders" (like "_sp_base" including all, "Title" text, "OrderID" text, "Status" text, "Bedrooms" numeric, "Archived" boolean, "DueDate" timestamptz, "Notes" text, "OrderContactId" text)');
  await sql('create table "Clients" (like "_sp_base" including all, "Title" text, "ClientID" text)');
  await sql('create table "ClientContacts" (like "_sp_base" including all, "Title" text, "ClientID" text, "Name" text)');
  await sql('create table "ClientAddresses" (like "_sp_base" including all, "Title" text, "ClientID" text, "ContactId" text)');
  await sql('create table "Settings" (like "_sp_base" including all, "Title" text, "Key" text, "Value" text)');
  /* renglones viejos (nacidos en SharePoint) */
  await M.upsertItems(sql, 'Orders', [{ id: '41', '@odata.etag': '"e41,3"', createdDateTime: '2026-10-20T10:00:00Z', lastModifiedDateTime: '2026-10-21T10:00:00Z',
    createdBy: { user: { displayName: 'SharePoint App' } }, fields: { Title: 'GS-1-1', OrderID: 'GS-1-1', Status: 'Submitted', Bedrooms: 2, Notes: 'Gate code' } }], { force: true });
  await M.upsertItems(sql, 'Orders', [{ id: '2077', '@odata.etag': '"e2077,1"', fields: { OrderID: 'GS-1-2' } }], { force: true });

  const sp = fakeSP();
  sp.lists.Orders = { 41: { id: '41', '@odata.etag': '"e41,3"', fields: { id: '41', OrderID: 'GS-1-1', Status: 'Submitted', Bedrooms: 2, Notes: 'Gate code' } } };
  sp.next.Orders = 2077;
  const P = (l, rest) => '/sites/h:/s:/lists/' + l + '/items' + (rest || '');
  const writeMode = { Orders: 'sql-first', ClientContacts: 'sql-first', ClientAddresses: 'sql-first' };
  const deps = { sql, writeMode, mode: 'sql', drainBudgetMs: 3000 };
  const g = M.wrap(sp.fetch, deps);
  const drain = (o) => SF.drain(Object.assign({ sql, graphFetch: sp.fetch, budgetMs: 3000 }, o || {}));
  const due = () => sql('update "_sp_outbox" set "next_at" = now() where "done_at" is null');
  const settle = async () => { await SF.idle(); await R.idle(); };

  /* ---- el switch ---- */
  SF.clearModeCache();
  check('switch: no row in Settings = everything sharepoint', await SF.modeFor('Orders', { sql }) === 'sharepoint');
  await M.upsertItems(sql, 'Settings', [{ id: '7', '@odata.etag': '"s7,1"', fields: { Key: 'SqlWriteMode', Value: JSON.stringify({ preview: { Orders: 'sql-first' }, production: {} }) } }], { force: true });
  process.env.VERCEL_ENV = 'preview'; SF.clearModeCache();
  const mp = await SF.modeFor('Orders', { sql }), mc = await SF.modeFor('Clients', { sql });
  process.env.VERCEL_ENV = 'production'; SF.clearModeCache();
  const mprod = await SF.modeFor('Orders', { sql });
  delete process.env.VERCEL_ENV; SF.clearModeCache();
  check('switch: per list and per environment, read from SQL', mp === 'sql-first' && mc === 'sharepoint' && mprod === 'sharepoint', { mp, mc, mprod });
  let swAsked = 0;
  await SF.modeFor('Orders', { sql: (t, p) => { swAsked++; return sql(t, p); } });
  await SF.modeFor('Orders', { sql: (t, p) => { swAsked++; return sql(t, p); } });
  check('switch: kept 30 s in memory', swAsked <= 1, swAsked);
  await sql('delete from "Settings"'); SF.clearModeCache();

  /* ---- lista en "sharepoint": igual que hoy ---- */
  sp.calls = [];
  const c1 = await M.wrap(sp.fetch, { sql, writeMode, mode: 'sharepoint' })(P('Clients'), { method: 'POST', body: JSON.stringify({ fields: { Title: 'Acme', ClientID: 'GS-9' } }) });
  await R.idle();
  check('sharepoint list: saved in SharePoint first, then copied to SQL with the same id',
    sp.calls.join() === 'POST ' + P('Clients') && (await sql('select "ClientID" from "Clients" where id = $1', [Number(c1.id)]))[0].ClientID === 'GS-9' && Number(c1.id) < SF.ID_MIN, sp.calls);
  check('sharepoint list: no outbox table created', !(await sql("select to_regclass('public._sp_outbox') as t"))[0].t);

  /* ---- crear con SharePoint caido ---- */
  sp.down = true; sp.calls = [];
  const t0 = Date.now();
  const created = await g(P('Orders'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { Title: 'GS-5-1', OrderID: 'GS-5-1', Status: 'Submitted', Bedrooms: 3, Archived: false, DueDate: '2026-11-20T23:59:59Z', Notes: '' } }) });
  await settle();
  const id1 = Number(created.id);
  check('create with SharePoint down: answered from SQL right away', id1 >= SF.ID_MIN + 2077 && Date.now() - t0 < 2000, created);
  check('create: same shape as SharePoint (id string, eTag guid,1, dates, createdBy, fields)',
    typeof created.id === 'string' && /^"[0-9a-f-]{36},1"$/.test(created['@odata.etag']) && created.eTag === created['@odata.etag'] && /Z$/.test(created.createdDateTime) &&
    created.createdBy.user.displayName === 'SharePoint App' && created.fields.OrderID === 'GS-5-1' && created.fields.Bedrooms === 3 && created.fields.Archived === false &&
    created.fields.DueDate === '2026-11-20T23:59:59Z' && created.fields.id === created.id && !('Notes' in created.fields) && !('sp_id' in created.fields), created);
  let ob = await sql('select * from "_sp_outbox" order by n');
  check('create: one row in the outbox, in the same save', ob.length === 1 && ob[0].op === 'create' && Number(ob[0].row_id) === id1 && ob[0].site === '/sites/h:/s:' && ob[0].done_at === null, ob);
  check('create: SharePoint was tried by the background worker and failed (retry later)', ob[0].tries === 1 && /503|Unavailable/.test(ob[0].last_error) && new Date(ob[0].next_at) > new Date(), ob[0]);
  /* leer: siempre de SQL */
  sp.calls = [];
  const back = await g(P('Orders', '/' + id1) + '?$expand=fields', {});
  const list = await g(P('Orders') + '?$expand=fields&$filter=' + encodeURIComponent("fields/OrderID eq 'GS-5-1'"), {});
  check('read back from SQL (one item and a filter), SharePoint not asked', back.fields.OrderID === 'GS-5-1' && list.value.length === 1 && list.value[0].id === created.id && sp.calls.length === 0, sp.calls);

  /* ---- cambiar: If-Match contra SQL ---- */
  const upd = await g(P('Orders', '/' + id1 + '/fields'), { method: 'PATCH', headers: { 'If-Match': created['@odata.etag'] }, body: JSON.stringify({ Status: 'Assigned', Bedrooms: '' }) });
  check('update with the right eTag: version 2, only what was sent changes, empty clears', /,2"$/.test(upd['@odata.etag']) && upd.Status === 'Assigned' && upd.OrderID === 'GS-5-1' && !('Bedrooms' in upd), upd);
  let e412 = null;
  try { await g(P('Orders', '/' + id1 + '/fields'), { method: 'PATCH', headers: { 'If-Match': created['@odata.etag'] }, body: JSON.stringify({ Status: 'Cancelled' }) }); } catch (e) { e412 = e; }
  check('update with an old eTag: 412 like SharePoint (the portals see a conflict), nothing changed',
    e412 && e412.status === 412 && /etag|412|precondition/i.test(e412.message) && (await sql('select "Status" from "Orders" where id = $1', [id1]))[0].Status === 'Assigned', e412 && e412.message);
  await g(P('Orders', '/' + id1 + '/fields'), { method: 'PATCH', headers: { 'If-Match': '*' }, body: JSON.stringify({ Notes: 'Call first' }) });
  let e404 = null; try { await g(P('Orders', '/99999999/fields'), { method: 'PATCH', body: '{"Status":"x"}' }); } catch (e) { e404 = e; }
  check('If-Match * always saves; a row that does not exist is a 404', (await sql('select "Notes" from "Orders" where id = $1', [id1]))[0].Notes === 'Call first' && e404 && e404.status === 404);
  /* doble clic: dos cambios con el mismo eTag a la vez -> uno gana, el otro 412 */
  const cur = (await g(P('Orders', '/' + id1) + '?$expand=fields', {}))['@odata.etag'];
  const both = await Promise.allSettled([1, 2].map(n => g(P('Orders', '/' + id1 + '/fields'), { method: 'PATCH', headers: { 'If-Match': cur }, body: JSON.stringify({ Notes: 'click ' + n }) })));
  check('double click with the same eTag: one saves, the other gets 412', both.filter(x => x.status === 'fulfilled').length === 1 && both.filter(x => x.status === 'rejected' && x.reason.status === 412).length === 1, both.map(x => x.status));
  const twoCreates = await Promise.all([1, 2].map(n => g(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-DC-' + n } }) })));
  check('two creates at once: two different ids', twoCreates[0].id !== twoCreates[1].id && twoCreates.every(x => Number(x.id) > id1), twoCreates.map(x => x.id));
  /* renglon viejo (id = id de SharePoint) */
  const old = await g(P('Orders', '/41/fields'), { method: 'PATCH', headers: { 'If-Match': '"e41,3"' }, body: JSON.stringify({ Status: 'Completed', Notes: null }) });
  check('old row (id from SharePoint) changed in sql-first: its eTag goes on (e41,4), empty clears', old['@odata.etag'] === '"e41,4"' && old.Status === 'Completed' && !('Notes' in old), old);
  /* borrar */
  await g('/sites/S1/lists/Orders/items/' + twoCreates[1].id, { method: 'DELETE' });
  let gone = null; try { await g(P('Orders', '/' + twoCreates[1].id) + '?$expand=fields', {}); } catch (e) { gone = e; }
  check('delete: gone from SQL (404 like SharePoint)', gone && gone.status === 404);
  await settle();

  /* ---- SharePoint vuelve: todo sale en orden ---- */
  ob = await sql('select * from "_sp_outbox" where done_at is null order by n');
  check('while SharePoint is down nothing is lost: every change waits in the outbox', ob.length === 8 && ob.every(x => !x.done_at), ob.length);
  sp.down = false; sp.calls = [];
  await due();
  let d = await drain();
  await due(); d = await drain();
  ob = await sql('select * from "_sp_outbox" order by n');
  check('SharePoint back: every row of the outbox went out', ob.every(x => x.done_at), ob.filter(x => !x.done_at).map(x => [x.n, x.op, x.last_error]));
  const row1 = (await sql('select * from "Orders" where id = $1', [id1]))[0];
  const spRow = sp.lists.Orders[row1.sp_id];
  check('create reached SharePoint and its SharePoint id is kept in sp_id', row1.sp_id && Number(row1.sp_id) < SF.ID_MIN && spRow && spRow.fields.OrderID === 'GS-5-1', row1.sp_id);
  check('changes reached SharePoint in order (last one wins, cleared field cleared)', spRow.fields.Status === 'Assigned' && /^click /.test(spRow.fields.Notes) && spRow.fields.Notes === row1.Notes && spRow.fields.Bedrooms === null, spRow.fields);
  const mine = sp.calls.filter(c => c.includes('/' + row1.sp_id) || c === 'POST ' + P('Orders'));
  check('order for one row: create first, then each change', /^POST/.test(sp.calls.filter(c => !/^GET/.test(c))[0]) && mine.filter(c => /^PATCH/.test(c)).length === 3, sp.calls);
  check('old row: the change went to its SharePoint id (41)', sp.lists.Orders[41].fields.Status === 'Completed' && sp.lists.Orders[41].fields.Notes === null);
  const delSp = (await sql("select sp_id from \"_sp_outbox\" where op = 'delete'"))[0].sp_id;
  check('delete went to the SharePoint id of a row born in SQL (DELETE by site id)', delSp && !sp.lists.Orders[delSp] && sp.calls.some(c => c === 'DELETE /sites/S1/lists/Orders/items/' + delSp), { delSp, calls: sp.calls });

  /* ---- se cayo a la mitad ---- */
  /* SQL guardo y el request murio antes de mandar a SharePoint: el cron lo manda */
  sp.calls = [];
  const lost = await SF.write({ op: 'create', list: 'Orders' }, P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-LOST' } }) }, deps);
  const before = sp.calls.length;
  let alerts = [];
  const cr = await SF.cron({ sql, graphFetch: sp.fetch, alert: a => { alerts.push(a); } });
  check('saved in SQL but the request died: the cron sends it later', before === 0 && cr.sent === 1 && Object.values(sp.lists.Orders).some(x => x.fields.OrderID === 'GS-LOST'), cr);
  /* SQL falla antes de guardar (sin el hibrido, SQL_FIRST_HYBRID=off; con el hibrido: lib/sql-hybrid.test.js) */
  sp.calls = [];
  hush();
  let sqlErr = null;
  try { await M.wrap(sp.fetch, { sql: async () => { throw Object.assign(new Error('connection refused'), { code: '08006' }); }, writeMode, hybrid: false })(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-X' } }) }); } catch (e) { sqlErr = e; }
  loud(); R._resetBreaker();
  check('SQL fails before saving: error to the screen (503), nothing to SharePoint, nothing in the outbox',
    sqlErr && sqlErr.status === 503 && /not saved/i.test(sqlErr.message) && sp.calls.length === 0 && !(await sql("select count(*)::int n from \"Orders\" where \"OrderID\" = 'GS-X'"))[0].n, sqlErr && sqlErr.message);
  /* SQL que no contesta: error, sin esperar de mas */
  hush();
  let hangErr = null; const th = Date.now();
  try { await M.wrap(sp.fetch, { sql: () => new Promise(() => {}), writeMode, writeTimeoutMs: 80, hybrid: false })(P('Orders', '/41/fields'), { method: 'PATCH', body: '{"Status":"x"}' }); } catch (e) { hangErr = e; }
  loud(); R._resetBreaker();
  check('SQL hanging: the save gives up with an error after the timeout', hangErr && hangErr.status === 503 && Date.now() - th < 1500);

  /* ---- lecturas en sql-first: nunca SharePoint (sin el hibrido) ---- */
  sp.calls = [];
  hush();
  let rErr = null;
  try { await M.wrap(sp.fetch, { sql: async (t) => { if (/SqlWriteMode/.test(t)) return []; throw Object.assign(new Error('SQL down'), { code: '57P01' }); }, writeMode, mode: 'sql', hybrid: false })(P('Orders') + '?$expand=fields', {}); } catch (e) { rErr = e; }
  loud(); R._resetBreaker();
  check('SQL down: a sql-first list answers with an error (the screen keeps what it had), never SharePoint', rErr && rErr.status === 503 && sp.calls.length === 0, sp.calls);
  let uErr = null;
  hush(); try { await g(P('Orders') + '?$expand=fields&$orderby=id desc', {}); } catch (e) { uErr = e; } loud();
  check('a query SQL cannot answer: error, not SharePoint', uErr && uErr.status === 501 && sp.calls.length === 0);
  await R.context({ source: 'sharepoint' }, async () => { await g(P('Orders', '/41') + '?$expand=fields', {}); });
  await R.context({ background: true }, async () => { await g(P('Orders', '/41') + '?$expand=fields', {}); });
  check('after a 412 (source sharepoint) and in background processes: still SQL', sp.calls.length === 0);
  await R.context({ backup: true }, async () => { await g(P('Orders', '/41') + '?$expand=fields', {}); });
  check('Compare / Copy all (backup): read the real SharePoint', sp.calls.length === 1);

  /* ---- renglon nacido en SQL con su lista ya en "sharepoint" (regreso) ---- */
  sp.calls = [];
  const gBack = M.wrap(sp.fetch, { sql, writeMode: {}, mode: 'sql' });
  const r2 = await gBack(P('Orders', '/' + id1 + '/fields'), { method: 'PATCH', body: JSON.stringify({ Status: 'Completed' }) });
  check('row born in SQL, list back in sharepoint: still saved in SQL first (no 404 in SharePoint)', r2.Status === 'Completed' && sp.calls.length === 0, sp.calls);
  await settle();
  check('...and its change reaches SharePoint by its sp_id', sp.lists.Orders[row1.sp_id].fields.Status === 'Completed');

  /* ---- ids de otra lista (LookupId / columnas que apuntan a otra lista) ---- */
  sp.failList = 'ClientContacts'; sp.calls = [];
  const contact = await g(P('ClientContacts'), { method: 'POST', body: JSON.stringify({ fields: { Name: 'Dana', ClientID: 'GS-9' } }) });
  const addr = await g(P('ClientAddresses'), { method: 'POST', body: JSON.stringify({ fields: { ClientID: 'GS-9', ContactId: '12,' + contact.id } }) });
  await settle();
  let a1 = (await sql("select * from \"_sp_outbox\" where list = 'ClientAddresses'"))[0];
  check('a reference to a row not in SharePoint yet: waits (does not send a SQL id)', !a1.done_at && /not in SharePoint yet/.test(a1.last_error) && !Object.keys(sp.lists.ClientAddresses || {}).length, a1);
  sp.failList = null; await due(); await drain(); await due(); await drain();
  const cSp = (await sql('select sp_id from "ClientContacts" where id = $1', [Number(contact.id)]))[0].sp_id;
  const aSp = Object.values(sp.lists.ClientAddresses)[0];
  check('LookupId translated: the address in SharePoint points to the contact\'s SharePoint id', aSp.fields.ContactId === '12,' + cSp && Number(cSp) < SF.ID_MIN, aSp.fields);
  const addr2 = await g(P('ClientAddresses'), { method: 'POST', body: JSON.stringify({ fields: { ClientID: 'GS-9', ContactId: '7654321' } }) });
  await settle();
  const a2 = Object.values(sp.lists.ClientAddresses).find(x => x.fields.ClientID === 'GS-9' && x.fields.ContactId === '7654321');
  check('a number that is not a row of the other list is sent as it is (never waits forever)', !!a2, Object.values(sp.lists.ClientAddresses).map(x => x.fields));
  check('in SQL the address keeps the SQL id', (await sql('select "ContactId" from "ClientAddresses" where id = $1', [Number(addr.id)]))[0].ContactId === '12,' + contact.id);

  /* ---- un id dentro de un texto (titulo o llave: "GS-9 <ContactId>") tambien se traduce ---- */
  await sql('create table if not exists "PushSubscriptions" (like "_sp_base" including all, "Title" text, "ClientID" text, "ContactId" text)');
  const gp = M.wrap(sp.fetch, Object.assign({}, deps, { writeMode: Object.assign({ PushSubscriptions: 'sql-first' }, writeMode) }));
  const sub = await gp(P('PushSubscriptions'), { method: 'POST', body: JSON.stringify({ fields: { Title: 'GS-9 ' + contact.id, ClientID: 'GS-9', ContactId: String(contact.id) } }) });
  await settle(); await due(); await drain();
  const subSp = Object.values(sp.lists.PushSubscriptions || {})[0] || { fields: {} };
  check('an id inside a title/key ("GS-9 <ContactId>") goes to SharePoint as the SharePoint id; SQL keeps its own',
    subSp.fields.Title === 'GS-9 ' + cSp && subSp.fields.ContactId === String(cSp) &&
    (await sql('select "Title" from "PushSubscriptions" where id = $1', [Number(sub.id)]))[0].Title === 'GS-9 ' + contact.id, subSp.fields);

  /* ---- SharePoint no cuadra: gana SQL ---- */
  delete sp.lists.Orders[41];
  await g(P('Orders', '/41/fields'), { method: 'PATCH', body: JSON.stringify({ Status: 'On Hold' }) });
  await settle();
  const n41 = (await sql('select * from "_sp_outbox" where row_id = 41 order by n desc limit 1'))[0];
  const new41 = (await sql('select sp_id from "Orders" where id = 41'))[0].sp_id;
  check('404 in SharePoint on a change: created again from SQL, noted', n41.done_at && /created again/.test(n41.note) && sp.lists.Orders[new41].fields.Status === 'On Hold' && sp.lists.Orders[new41].fields.OrderID === 'GS-1-1', n41);
  let unk = null;
  try { await g(P('Orders', '/' + id1 + '/fields'), { method: 'PATCH', body: JSON.stringify({ KitStatuz: 'Packed' }) }); } catch (e) { unk = e; }
  check('a field neither SQL, SharePoint nor the catalog knows: 400 like SharePoint, nothing saved', unk && unk.status === 400 && /not recognized/.test(unk.message) &&
    !(await sql("select count(*)::int n from information_schema.columns where table_name = 'Orders' and column_name = 'KitStatuz'"))[0].n);
  await sql('alter table "Orders" add column "KitStatus" text'); M._clearCache(); SF._reset();
  sp.known = ['Title', 'OrderID', 'Status', 'Bedrooms', 'Archived', 'DueDate', 'Notes', 'OrderContactId'];
  hush();
  await g(P('Orders', '/' + id1 + '/fields'), { method: 'PATCH', body: JSON.stringify({ KitStatus: 'Packed', Status: 'Assigned' }) });
  await settle(); loud();
  const nk = (await sql('select * from "_sp_outbox" order by n desc limit 1'))[0];
  check('a column SharePoint does not have: saved in SQL, sent without it, noted', nk.done_at && /no column 'KitStatus'/.test(nk.note) && sp.lists.Orders[row1.sp_id].fields.Status === 'Assigned' &&
    (await sql('select "KitStatus" from "Orders" where id = $1', [id1]))[0].KitStatus === 'Packed', nk);
  sp.known = null;

  /* ---- dos servidores vaciando la fila a la vez: nada sale doble ---- */
  sp.down = true;
  for (let i = 0; i < 6; i++) await g(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-PAR-' + i } }) });
  const rowPar = (await sql("select id from \"Orders\" where \"OrderID\" = 'GS-PAR-0'"))[0].id;
  for (let i = 0; i < 3; i++) await g(P('Orders', '/' + rowPar + '/fields'), { method: 'PATCH', body: JSON.stringify({ Notes: 'n' + i }) });
  await settle();
  sp.down = false; sp.slow = 15; sp.calls = []; await due();
  await Promise.all([drain({ me: 'server-A', batch: 3 }), drain({ me: 'server-B', batch: 3 }), drain({ me: 'server-C', batch: 3 })]);
  sp.slow = 0;
  await due(); await drain();
  const posts = sp.calls.filter(c => /^POST/.test(c)).length;
  const parSp = (await sql('select sp_id from "Orders" where id = $1', [rowPar]))[0].sp_id;
  check('three servers at once: each create sent once, changes of one row in order', posts === 6 && Object.values(sp.lists.Orders).filter(x => /^GS-PAR-/.test(x.fields.OrderID)).length === 6 &&
    sp.lists.Orders[parSp].fields.Notes === 'n2', { posts, notes: sp.lists.Orders[parSp] && sp.lists.Orders[parSp].fields.Notes });

  /* ---- lo que no sale en N horas: se marca y se avisa una vez ---- */
  sp.down = true;
  await g(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-STUCK' } }) });
  await settle();
  await sql("update \"_sp_outbox\" set \"at\" = now() - interval '7 hours', next_at = now() where done_at is null");
  alerts = [];
  hush();
  const c2 = await SF.cron({ sql, graphFetch: sp.fetch, alert: a => { alerts.push(a); } });
  const c3 = await SF.cron({ sql, graphFetch: sp.fetch, alert: a => { alerts.push(a); } });
  loud();
  check('stuck for more than ' + SF.STUCK_HOURS + ' h: marked and the error alert is sent once', alerts.length === 1 && /Orders \(1\)/.test(alerts[0].error) && c2.alerted === 1 && !c3.alerted &&
    (await sql("select stuck_at from \"_sp_outbox\" where done_at is null"))[0].stuck_at, alerts);
  const st = await SF.status(sql);
  check('status: what is still pending, by list', st.total === 1 && st.pending[0].list === 'Orders' && st.pending[0].stuck === 1, st.pending);
  sp.down = false; await due(); await drain();
  check('it still goes out when SharePoint comes back', (await SF.status(sql)).total === 0);

  /* ---- la marca "cambio algo?" de la lista ---- */
  sp.calls = [];
  const LM = '/sites/h:/s:/lists/Orders?$select=id,lastModifiedDateTime';
  const m1 = await g(LM, {});
  await g(P('Orders', '/' + id1 + '/fields'), { method: 'PATCH', body: JSON.stringify({ Notes: 'marker 1' }) });
  const m2 = await g(LM, {});
  const tmp = await g(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-MK' } }) });
  const m3 = await g(LM, {});
  await g('/sites/S1/lists/Orders/items/' + tmp.id, { method: 'DELETE' });
  const m4 = await g(LM, {});
  await settle();
  check('list marker (lastModifiedDateTime) comes from SQL and moves on change, create and delete; SharePoint not asked',
    m1.lastModifiedDateTime && m2.lastModifiedDateTime > m1.lastModifiedDateTime && m3.lastModifiedDateTime > m2.lastModifiedDateTime && m4.lastModifiedDateTime > m3.lastModifiedDateTime &&
    !sp.calls.some(c => /^GET .*lists\/Orders\?/.test(c)), { m1, m2, m3, m4, calls: sp.calls });
  sp.calls = [];
  await g('/sites/h:/s:/lists/Clients?$select=id,lastModifiedDateTime', {});
  check('list marker of a list in sharepoint: from SharePoint as always', sp.calls.length === 1 && /lists\/Clients\?/.test(sp.calls[0]));
  /* texto de mas de 255 que SharePoint no acepta */
  const longSp = async (path, opts) => {
    const b = opts && opts.body ? JSON.parse(opts.body) : {};
    const f = b.fields || b;
    if (Object.values(f).some(v => typeof v === 'string' && v.length > 255)) throw Object.assign(new Error("The length of the field 'Title' exceeds 255"), { status: 400 });
    return sp.fetch(path, opts);
  };
  const lt = await SF.write({ op: 'create', list: 'Orders' }, P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-LONG', Title: 'x'.repeat(300) } }) }, deps);
  await SF.drain({ sql, graphFetch: longSp, budgetMs: 3000 });
  const ltOb = (await sql('select * from "_sp_outbox" where row_id = $1', [Number(lt.id)]))[0];
  const ltSp = (await sql('select sp_id, "Title" from "Orders" where id = $1', [Number(lt.id)]))[0];
  check('single-line text over 255: SQL keeps it all, the backup gets the first 255, noted', ltOb.done_at && /255/.test(ltOb.note) && ltSp.Title.length === 300 &&
    sp.lists.Orders[ltSp.sp_id].fields.Title.length === 255, ltOb);

  /* ---- lo que SharePoint rechazaria, rechazado antes de guardar (las columnas de SharePoint en _sp_columns) ---- */
  const colsSp = async p => ({ value: [{ name: 'Title', text: { allowMultipleLines: false, maxLength: 255 } }, { name: 'Notes', text: { allowMultipleLines: true } },
    { name: 'Status', choice: { choices: ['Submitted', 'Assigned', 'Completed', 'On Hold', 'Cancelled'] } }, { name: 'Bedrooms', number: {} },
    { name: 'OrderID', text: { allowMultipleLines: false, maxLength: 255 } }, { name: 'Total', calculated: { formula: '=1' }, readOnly: true }] });
  const nCols = await SF.refreshColumns({ sql, graphFetch: colsSp, list: 'Orders', listPath: '/sites/h:/s:/lists/Orders' });
  const rej = async fields => { try { await g(P('Orders', '/' + id1 + '/fields'), { method: 'PATCH', body: JSON.stringify(fields) }); return null; } catch (e) { return e; } };
  const v1 = await rej({ Title: 'y'.repeat(256) }), v2 = await rej({ Status: "Lost" }), v3 = await rej({ Bedrooms: "two" }), v4 = await rej({ Total: 5 });
  const okNote = await rej({ Notes: 'z'.repeat(600), Status: 'Completed' });
  check('SharePoint columns read (refreshColumns); one-line text > 255, a value outside a choice, a word in a number, a read-only column: 400 before saving',
    nCols === 6 && [v1, v2, v3, v4].every(e => e && e.status === 400) && /longer than 255/.test(v1.message) && /choices/.test(v2.message) && !okNote &&
    (await sql('select "Status" from "Orders" where id = $1', [id1]))[0].Status === 'Completed', [v1, v2, v3, v4, okNote].map(e => e && e.message));
  await sql('delete from "_sp_columns"'); SF._reset();
  await settle();

  /* ---- SharePoint guardo pero la respuesta se perdio: el reintento no lo crea dos veces ---- */
  let lost1 = true;
  const lostSp = async (path, opts) => {
    const r = await sp.fetch(path, opts);
    if (lost1 && opts && opts.method === 'POST') { lost1 = false; throw Object.assign(new Error('Gateway Timeout'), { status: 504 }); }
    return r;
  };
  const created2 = await SF.write({ op: 'create', list: 'Orders' }, P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-LOST-ANSWER', Status: 'Submitted', DueDate: '2026-12-01' } }) }, deps);
  await SF.drain({ sql, graphFetch: lostSp, budgetMs: 3000 });
  await due(); await SF.drain({ sql, graphFetch: lostSp, budgetMs: 3000 });
  const inSp = Object.values(sp.lists.Orders).filter(x => x.fields.OrderID === 'GS-LOST-ANSWER');
  const la = (await sql('select o.note, t.sp_id from "_sp_outbox" o join "Orders" t on t.id = o.row_id where o.row_id = $1', [Number(created2.id)]))[0];
  check('SharePoint saved it but the answer was lost: the retry finds it and does not create it twice (one order in SQL, one in the backup)',
    inSp.length === 1 && Number(la.sp_id) === Number(inSp[0].id) && /not created twice/.test(la.note) &&
    (await sql("select count(*)::int n from \"Orders\" where \"OrderID\" = 'GS-LOST-ANSWER'"))[0].n === 1, { inSp: inSp.map(x => x.id), la });

  /* ---- igual, pero con mas de 200 renglones creados en el rato (SharePoint caido un tiempo): se leen todas las paginas ---- */
  for (let i = 0; i < 450; i++) { const id = sp.next.Orders = (sp.next.Orders || 100) + 1; sp.lists.Orders[id] = { id: String(id), '@odata.etag': '"sp' + id + ',1"', fields: { id: String(id), OrderID: 'GS-OTHER-' + i, Status: 'Submitted' } }; }
  let lost2 = true, pages = 0;
  const pagedSp = async (path, opts) => {
    const method = String((opts && opts.method) || 'GET').toUpperCase();
    if (method === 'GET' && /\$filter=|\$skiptoken=/.test(path)) {
      /* Como Graph: 200 por pagina, del id mas viejo al mas nuevo, con @odata.nextLink. */
      pages++;
      const skip = Number((/[?&]\$skiptoken=(\d+)/.exec(path) || [])[1] || 0);
      const all = Object.values(sp.lists.Orders).sort((a, b) => Number(a.id) - Number(b.id));
      const out = { value: all.slice(skip, skip + 200) };
      if (skip + 200 < all.length) out['@odata.nextLink'] = 'https://graph.microsoft.com/v1.0' + path.split('?')[0] + '?$skiptoken=' + (skip + 200);
      return out;
    }
    const r = await sp.fetch(path, opts);
    if (lost2 && method === 'POST') { lost2 = false; throw Object.assign(new Error('Gateway Timeout'), { status: 504 }); }
    return r;
  };
  const created3 = await SF.write({ op: 'create', list: 'Orders' }, P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-LOST-PAGE3', Status: 'Submitted' } }) }, deps);
  await SF.drain({ sql, graphFetch: pagedSp, budgetMs: 3000 });
  await due(); await SF.drain({ sql, graphFetch: pagedSp, budgetMs: 3000 });
  const inSp3 = Object.values(sp.lists.Orders).filter(x => x.fields.OrderID === 'GS-LOST-PAGE3');
  const la3 = (await sql('select o.note, t.sp_id from "_sp_outbox" o join "Orders" t on t.id = o.row_id where o.row_id = $1', [Number(created3.id)]))[0];
  check('Lost answer with more than 200 rows created meanwhile (the one we want is on page 3): found, not created twice in the backup',
    inSp3.length === 1 && Number(la3.sp_id) === Number(inSp3[0].id) && /not created twice/.test(la3.note) && pages >= 3, { inSp: inSp3.map(x => x.id), la3, pages });
  for (const k of Object.keys(sp.lists.Orders)) if (/^GS-OTHER-/.test(sp.lists.Orders[k].fields.OrderID)) delete sp.lists.Orders[k];

  /* ---- velocidad: lo que espera la persona ---- */
  let nq = 0; const seen = [];
  const counted = (t, p) => { if (!/^(update "_sp_outbox"|select to_regclass|select count\(\*\)::int as n from "_sp_outbox"|delete from "_sp_outbox")/.test(t)) { nq++; seen.push(t.slice(0, 40)); } return sql(t, p); };
  const gc = M.wrap(async () => { throw new Error('SharePoint must not be waited for'); }, { sql: counted, writeMode, mode: 'sql' });
  await gc(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-WARM' } }) });
  await settle(); nq = 0; seen.length = 0;
  const tq = Date.now();
  await gc(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-FAST' } }) });
  const createQ = nq; nq = 0;
  await gc(P('Orders', '/' + id1 + '/fields'), { method: 'PATCH', body: JSON.stringify({ Notes: 'fast' }) });
  const updQ = nq; nq = 0;
  await gc(P('Orders') + '?$expand=fields&$filter=' + encodeURIComponent("fields/OrderID eq 'GS-FAST'"), {});
  const readQ = nq;
  const ms = Date.now() - tq;
  hush(); await settle(); loud();
  check('speed: a save in SQL first is ONE SQL statement (switch, columns and rules stay in memory), a read one; the backup runs after the answer',
    createQ === 1 && updQ === 1 && readQ === 1, { createQ, updQ, readQ, ms, seen });

  /* ---- historial de versiones: solo en SharePoint, por sp_id ---- */
  sp.calls = [];
  await g(P('Orders', '/' + id1 + '/versions') + '?$expand=fields&$top=50', {}).catch(() => {});
  await g(P('Orders', '/41/versions') + '?$expand=fields&$top=50', {}).catch(() => {});
  check('version history (only SharePoint has it): asked to SharePoint by the SharePoint id', sp.calls[0] === 'GET ' + P('Orders', '/' + row1.sp_id + '/versions') + '?$expand=fields&$top=50' &&
    sp.calls[1] === 'GET ' + P('Orders', '/41/versions') + '?$expand=fields&$top=50', sp.calls);

  /* ---- fechas sin hora y vacios, como SharePoint ---- */
  const dd = await g(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-DATE', DueDate: '2026-11-20', Bedrooms: '' } }) });
  const dd2 = await g(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-DATE2', DueDate: '2026-07-04' } }) });
  const dd3 = await g(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-DATE3', DueDate: '2026-10-02T07:00' } }) });
  check('a local time without zone (ServiceAssignments.ScheduledDate "2026-10-02T07:00") is the site time zone, like production (14:00Z)', dd3.fields.DueDate === '2026-10-02T14:00:00Z', dd3.fields.DueDate);
  const byDay = await g(P('Orders') + '?$expand=fields&$filter=' + encodeURIComponent("fields/DueDate eq '2026-11-20'"), {});
  check('a date without time is midnight of the SharePoint site (like SharePoint), and filters by that day work',
    dd.fields.DueDate === '2026-11-20T08:00:00Z' && dd2.fields.DueDate === '2026-07-04T07:00:00Z' && byDay.value.some(x => x.fields.OrderID === 'GS-DATE') && !byDay.value.some(x => x.fields.OrderID === 'GS-DATE2'), [dd.fields.DueDate, dd2.fields.DueDate]);
  const ddOb = (await sql('select fields from "_sp_outbox" where row_id = $1', [Number(dd.id)]))[0].fields;
  check('empty number goes to SharePoint as null (SharePoint refuses \'\' there)', ddOb.Bedrooms === null && ddOb.DueDate === '2026-11-20', ddOb);
  await settle();

  /* ---- raw (Response) ---- */
  const rr = await g(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-RAW' } }) }, true);
  const rj = await rr.json();
  const rb = await g(P('Orders', '/99999998/fields'), { method: 'PATCH', body: '{}' }, true);
  check('raw: a Response like fetch (200 with the item, 404 with an error)', rr.ok && rj.fields.OrderID === 'GS-RAW' && rb.status === 404);
  await settle();

  /* ---- DB_WAKE (lib/db-wake): marcas fuera de la base al guardar, y cuando vence lo siguiente de la fila ---- */
  {
    const W = require('./db-wake');
    const files = {};
    const resp = (status, text) => ({ status, ok: status >= 200 && status < 300, text: async () => text || '' });
    const wake = { getDriveId: async () => 'drv', rawGraphFetch: async (url, opts) => {
      const p = decodeURIComponent(url.split('root:/')[1].replace(/:\/content$/, ''));
      if (opts && opts.method === 'PUT') { files[p] = String(opts.body); return resp(200, '{}'); }
      return files[p] === undefined ? resp(404) : resp(200, files[p]);
    } };
    const flag = n => files['App Data/DB wake/flag-' + n + '.json'];
    const gw = M.wrap(sp.fetch, Object.assign({}, deps, { wake }));
    await gw(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-WAKE-OFF' } }) });
    await new Promise(r => setTimeout(r, 30));
    check('DB_WAKE apagado: guardar no escribe marcas', !Object.keys(files).length, Object.keys(files));
    await settle();
    process.env.DB_WAKE = 'on'; W._reset();
    await gw(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-WAKE-1' } }) });
    await new Promise(r => setTimeout(r, 30));
    check('DB_WAKE: guardar en SQL primero deja las marcas sp-outbox (respaldo pendiente) y saves (algo cambio)', flag('sp-outbox') && flag('saves'), Object.keys(files));
    await settle();
    delete files['App Data/DB wake/flag-saves.json']; W._reset();
    const gs = M.wrap(sp.fetch, { sql, writeMode: {}, mode: 'sharepoint', wake });
    await gs(P('Clients'), { method: 'POST', body: JSON.stringify({ fields: { Title: 'Wake Co', ClientID: 'GS-W' } }) });
    await new Promise(r => setTimeout(r, 30));
    check('DB_WAKE: un guardado normal (a SharePoint) deja la marca saves', !!flag('saves'));
    await settle();
    delete files['App Data/DB wake/flag-saves.json']; W._reset();
    await W.quiet(['saves'], () => gs(P('Clients'), { method: 'POST', body: JSON.stringify({ fields: { Title: 'Quiet Co', ClientID: 'GS-Q' } }) }));
    await new Promise(r => setTimeout(r, 30));
    check('DB_WAKE: lo que guarda un cron dentro de quiet(saves) no deja la marca', !flag('saves'));
    await settle();
    const cw = await SF.cron({ sql, graphFetch: sp.fetch, alert: () => {} });
    const mn = (await sql('select min("next_at") as m from "_sp_outbox" where "done_at" is null'))[0].m;
    check('cron: dice cuando vence lo siguiente de la fila (la espera mas proxima; nada pendiente = null)',
      cw.left === 0 ? cw.nextAt === null : Date.parse(cw.nextAt) === new Date(mn).getTime(), { cw, mn });
    await sql('update "_sp_outbox" set "next_at" = now() where "done_at" is null');
    const cw0 = await SF.cron({ sql, graphFetch: sp.fetch, alert: () => {} });
    check('cron: con todo enviado, nextAt null (el cron se duerme hasta la siguiente marca)', cw0.left === 0 && cw0.nextAt === null, cw0);
    sp.down = true;
    await g(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-WAKE-2' } }) });
    await settle();
    const cw2 = await SF.cron({ sql, graphFetch: sp.fetch, alert: () => {} });
    sp.down = false;
    check('cron con SharePoint caido: queda pendiente y nextAt dice cuando reintenta', cw2.left >= 1 && Date.parse(cw2.nextAt) > Date.now() - 1000, cw2);
    await sql('update "_sp_outbox" set "next_at" = now() where "done_at" is null');
    await SF.cron({ sql, graphFetch: sp.fetch, alert: () => {} });
    delete process.env.DB_WAKE;
  }

  /* ---- SQL apagado (sin SQL_MIRROR_URL): nada cambia ---- */
  delete process.env.SQL_MIRROR_URL;
  sp.calls = [];
  const plain = M.wrap(sp.fetch);
  await plain(P('Orders'), { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-PLAIN' } }) });
  check('without SQL connected: straight to SharePoint as always', sp.calls.length === 1 && /^POST/.test(sp.calls[0]));

  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
