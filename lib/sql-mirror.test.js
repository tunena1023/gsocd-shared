/* lib/sql-mirror.js contra un Postgres de verdad en memoria (PGlite, solo para la prueba:
   npm i --no-save @electric-sql/pglite). Correr: node lib/sql-mirror.test.js */
'use strict';
const M = require('./sql-mirror');
let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch (e) { console.log('SKIP: npm i --no-save @electric-sql/pglite'); process.exit(0); }

let ok = 0, fail = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } };

(async () => {
  const db = new PGlite();
  const sql = (t, p) => db.query(t, p || []).then(r => r.rows);
  await sql('create table "_sp_base" ("id" bigint primary key, "created_at" timestamptz not null default now(), "modified_at" timestamptz not null default now(), "created_by" text, "modified_by" text, "etag" text)');
  await sql('create table "Orders" (like "_sp_base" including all, "Title" text, "OrderID" text, "Status" text, "Bedrooms" numeric, "Archived" boolean, "DueDate" timestamptz, "Notes" text)');
  await sql('create table "Order History" (like "_sp_base" including all, "Title" text, "OrderID" text)');

  /* parseListWrite */
  const P = M.parseListWrite;
  check('create by site path', JSON.stringify(P('/sites/h.sharepoint.com:/sites/x:/lists/Orders/items', 'POST')) === '{"op":"create","list":"Orders"}');
  check('update fields', JSON.stringify(P('/sites/h:/s:/lists/Orders/items/12/fields', 'PATCH')) === '{"op":"update-fields","list":"Orders","id":"12"}');
  check('delete by site id, encoded name', JSON.stringify(P('/sites/S1/lists/Order%20History/items/7', 'DELETE')) === '{"op":"delete","list":"Order History","id":"7"}');
  check('absolute URL and query string', P('https://graph.microsoft.com/v1.0/sites/S1/lists/Orders/items?$expand=fields', 'POST').op === 'create');
  check('reads and other writes are ignored', P('/sites/S1/lists/Orders/items?$filter=x', 'GET') === null && P('/sites/S1/lists/Orders/columns', 'POST') === null &&
    P('/drives/D/root:/a.jpg:/content', 'PUT') === null && P('/users/a/sendMail', 'POST') === null && P('/sites/S1/lists/Orders/items/3/fields', 'DELETE') === null);

  /* wrap: create */
  const calls = [];
  const base = async (path, opts, raw) => {
    calls.push([path, opts && opts.method]);
    if (path === 'BOOM') throw new Error('SharePoint said no');
    const w = M.parseListWrite(path, opts && opts.method);
    if (w && w.op === 'create') return { id: '41', '@odata.etag': '"e1,1"', createdDateTime: '2026-10-20T10:00:00Z', lastModifiedDateTime: '2026-10-20T10:00:00Z',
      createdBy: { user: { displayName: 'Dana Office', email: 'dana@gsocd.com' } }, lastModifiedBy: { user: { email: 'dana@gsocd.com' } },
      fields: Object.assign({ '@odata.etag': '"e1,1"', id: '41', ContentType: 'Item', Created: '2026-10-20T10:00:00Z', Modified: '2026-10-20T10:00:00Z', AuthorLookupId: '9', _UIVersionString: '1.0', Attachments: false, LinkTitle: 'x' }, JSON.parse(opts.body).fields) };
    if (w && w.op === 'update-fields') return Object.assign({ '@odata.etag': '"e1,2"', id: w.id, Created: '2026-10-20T10:00:00Z', Modified: opts.modified || '2026-10-21T09:00:00Z', EditorLookupId: '9' }, JSON.parse(opts.body));
    if (w && w.op === 'delete') return null;
    return { value: [] };
  };
  const g = M.wrap(base, { sql });
  const created = await g('/sites/h:/s:/lists/Orders/items', { method: 'POST', body: JSON.stringify({ fields: { Title: 'GS-1-1', OrderID: 'GS-1-1', Status: 'Submitted', Bedrooms: 2, Archived: false, DueDate: '2026-10-25T23:59:59Z', Notes: 'Gate code at office' } }) });
  check('wrap returns exactly what SharePoint returned', created.id === '41' && created.fields.OrderID === 'GS-1-1');
  let r = (await sql('select * from "Orders" where id = 41'))[0];
  check('create copied with same id and types', r && r.OrderID === 'GS-1-1' && Number(r.Bedrooms) === 2 && r.Archived === false && r.DueDate.toISOString() === '2026-10-25T23:59:59.000Z', r);
  check('system columns: created/modified/by/etag', r.created_at.toISOString() === '2026-10-20T10:00:00.000Z' && r.created_by === 'dana@gsocd.com' && r.etag === '"e1,1"', r);
  check('SharePoint system fields are not columns', (await sql("select count(*)::int n from information_schema.columns where table_name = 'Orders' and column_name in ('ContentType','AuthorLookupId','_UIVersionString','Attachments','LinkTitle','Created','Modified')"))[0].n === 0);

  /* update: only the fields sent change */
  await g('/sites/h:/s:/lists/Orders/items/41/fields', { method: 'PATCH', body: JSON.stringify({ Status: 'Assigned' }) });
  r = (await sql('select * from "Orders" where id = 41'))[0];
  check('update changes only what was sent', r.Status === 'Assigned' && r.Notes === 'Gate code at office' && r.OrderID === 'GS-1-1' && r.modified_at.toISOString() === '2026-10-21T09:00:00.000Z', r);
  check('update keeps who created it', r.created_by === 'dana@gsocd.com' && r.etag === '"e1,2"', r);

  /* an older change arriving late does not overwrite a newer one */
  await g('/sites/h:/s:/lists/Orders/items/41/fields', { method: 'PATCH', modified: '2026-10-21T08:00:00Z', body: JSON.stringify({ Status: 'Submitted' }) });
  r = (await sql('select * from "Orders" where id = 41'))[0];
  check('older change does not overwrite newer', r.Status === 'Assigned', r.Status);

  /* new column in SharePoint shows up in SQL by itself */
  await g('/sites/h:/s:/lists/Orders/items/41/fields', { method: 'PATCH', modified: '2026-10-21T10:00:00Z', body: JSON.stringify({ KitStatus: 'Packed', TechMarkedComplete: true, HoursSigned: 12.5 }) });
  M._clearCache();
  const cols = await M.columnsOf(sql, 'Orders', true);
  r = (await sql('select * from "Orders" where id = 41'))[0];
  check('new columns are added with a type from the value', cols.get('KitStatus') === 'text' && cols.get('TechMarkedComplete') === 'boolean' && cols.get('HoursSigned') === 'numeric' && r.KitStatus === 'Packed' && r.TechMarkedComplete === true, [...cols]);

  /* empty values */
  await g('/sites/h:/s:/lists/Orders/items/41/fields', { method: 'PATCH', modified: '2026-10-21T11:00:00Z', body: JSON.stringify({ Bedrooms: '', DueDate: '', Notes: null }) });
  r = (await sql('select * from "Orders" where id = 41'))[0];
  check('empty number/date and null text become NULL', r.Bedrooms === null && r.DueDate === null && r.Notes === null, r);

  /* update of a row that was never copied: it is created */
  await g('/sites/h:/s:/lists/Orders/items/77/fields', { method: 'PATCH', body: JSON.stringify({ OrderID: 'GS-9-9', Status: 'Completed' }) });
  r = (await sql('select * from "Orders" where id = 77'))[0];
  check('update of a row not in SQL yet creates it', r && r.OrderID === 'GS-9-9' && r.Status === 'Completed', r);

  /* list name with a space; delete */
  await g('/sites/h:/s:/lists/Order%20History/items', { method: 'POST', body: JSON.stringify({ fields: { Title: 'h', OrderID: 'GS-1-1' } }) });
  check('list with a space in its name', (await sql('select count(*)::int n from "Order History"'))[0].n === 1);
  await g('/sites/S1/lists/Orders/items/77', { method: 'DELETE' });
  check('delete removes the row', (await sql('select count(*)::int n from "Orders" where id = 77'))[0].n === 0);

  /* SharePoint fails: nothing copied, same error to the caller */
  let err = null; try { await g('BOOM', { method: 'POST' }); } catch (e) { err = e; }
  check('a SharePoint error is passed through untouched', err && err.message === 'SharePoint said no');

  /* SQL fails: the caller never notices */
  const before = M.stats.failed;
  const broken = M.wrap(base, { sql: async () => { throw new Error('SQL is down'); } });
  const quiet = console.error; console.error = () => {};
  const res2 = await broken('/sites/h:/s:/lists/Orders/items', { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-2-2' } }) });
  const failedAfterDown = M.stats.failed;
  const slow = M.wrap(base, { sql: () => new Promise(() => {}), timeoutMs: 50 });
  const t0 = Date.now(); const res3 = await slow('/sites/h:/s:/lists/Orders/items', { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-3-3' } }) });
  console.error = quiet;
  check('SQL down: the save still returns normally', res2 && res2.id === '41' && failedAfterDown === before + 1, M.stats);
  check('SQL hanging: gives up after the timeout', res3 && res3.id === '41' && Date.now() - t0 < 1000 && M.stats.failed === before + 2);

  /* no table for that list: logged, never thrown */
  console.error = () => {};
  const res4 = await g('/sites/h:/s:/lists/NoSuchList/items', { method: 'POST', body: JSON.stringify({ fields: { Title: 'x' } }) });
  console.error = quiet;
  check('list without a table: save still fine', res4 && res4.id === '41');

  /* without SQL_MIRROR_URL and without deps.sql: does nothing */
  delete process.env.SQL_MIRROR_URL;
  const off = M.wrap(base); calls.length = 0;
  await off('/sites/h:/s:/lists/Orders/items', { method: 'POST', body: JSON.stringify({ fields: { OrderID: 'GS-4-4' } }) });
  check('mirror off: no SQL, same SharePoint call', calls.length === 1 && (await sql("select count(*)::int n from \"Orders\" where \"OrderID\" = 'GS-4-4'"))[0].n === 0);

  /* raw responses (Response objects) */
  const rawBase = async () => ({ clone: () => ({ json: async () => ({ id: '90', fields: { OrderID: 'GS-RAW' }, createdDateTime: '2026-10-22T00:00:00Z', lastModifiedDateTime: '2026-10-22T00:00:00Z' }) }), ok: true });
  const rr = await M.wrap(rawBase, { sql })('/sites/h:/s:/lists/Orders/items', { method: 'POST' }, true);
  check('raw response: copied and returned as is', typeof rr.clone === 'function' && (await sql('select "OrderID" from "Orders" where id = 90'))[0].OrderID === 'GS-RAW');

  const failedRaw = async () => ({ ok: false, clone: () => ({ json: async () => ({ error: { message: 'Item not found' } }) }) });
  const rf = await M.wrap(failedRaw, { sql })('/sites/h:/s:/lists/Orders/items/5/fields', { method: 'PATCH' }, true);
  M._clearCache();
  check('raw error response: nothing copied, no stray column', rf.ok === false && !(await M.columnsOf(sql, 'Orders', true)).has('error'));

  /* bulk copy + normalize */
  const many = Array.from({ length: 2500 }, (_, i) => ({ id: String(1000 + i), createdDateTime: '2026-10-01T00:00:00Z', lastModifiedDateTime: '2026-10-02T00:00:00Z', fields: { OrderID: 'B-' + i, Bedrooms: i % 3, Archived: i % 2 === 0 } }));
  const n = await M.upsertItems(sql, 'Orders', many, { force: true });
  check('bulk copy of 2,500 rows', n === 2500 && (await sql('select count(*)::int n from "Orders" where id >= 1000'))[0].n === 2500);
  await M.deleteIds(sql, 'Orders', ['1000', '1001']);
  check('delete many', (await sql('select count(*)::int n from "Orders" where id >= 1000'))[0].n === 2498);
  const N = M.normalize;
  check('normalize makes SharePoint and SQL values comparable',
    N('2', 'numeric') === N(2, 'numeric') && N('2026-10-25T23:59:59Z', 'timestamp with time zone') === N(new Date('2026-10-25T23:59:59Z'), 'timestamp with time zone') &&
    N('', 'text') === N(null, 'text') && N('Yes', 'boolean') === N(true, 'boolean') && N({ a: 1 }, 'text') === '{"a":1}');

  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
