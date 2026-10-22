/* lib/sql-read.js (lecturas desde SQL, CFO 22/10/2026) contra un Postgres en memoria.
   Correr: npm i --no-save @electric-sql/pglite && node lib/sql-read.test.js */
'use strict';
let PGlite;
try { ({ PGlite } = require('@electric-sql/pglite')); } catch (e) { console.log('SKIP: npm i --no-save @electric-sql/pglite'); process.exit(0); }
const M = require('./sql-mirror');
const R = require('./sql-read');
let ok = 0, fail = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } };

(async () => {
  const db = new PGlite();
  const sql = (t, p) => db.query(t, p || []).then(r => r.rows);
  await sql('create table "_sp_base" ("id" bigint primary key, "created_at" timestamptz not null default now(), "modified_at" timestamptz not null default now(), "created_by" text, "modified_by" text, "etag" text)');
  await sql('create table "Orders" (like "_sp_base" including all, "Title" text, "OrderID" text, "ClientID" text, "Status" text, "Bedrooms" numeric, "Archived" boolean, "DueDate" timestamptz, "Notes" text)');
  await sql('create table "Settings" (like "_sp_base" including all, "Title" text, "Key" text, "Value" text)');

  /* SharePoint falso con los mismos renglones */
  const SP = [];
  for (let i = 1; i <= 7; i++) SP.push({ id: String(i), '@odata.etag': '"g' + i + ',1"', createdDateTime: '2026-10-0' + i + 'T10:00:00Z', lastModifiedDateTime: '2026-10-0' + i + 'T11:00:00Z',
    fields: { '@odata.etag': '"g' + i + ',1"', id: String(i), Title: 'T' + i, OrderID: 'GS-1-' + i, ClientID: i <= 4 ? 'GS-1' : 'GS-2', Status: i % 2 ? 'Assigned' : 'Completed',
      Bedrooms: i % 3, Archived: i === 5, DueDate: '2026-10-' + (10 + i) + 'T23:59:59Z', Created: '2026-10-0' + i + 'T10:00:00Z', Modified: '2026-10-0' + i + 'T11:00:00Z' } });
  SP[2].fields.Notes = "O'Brien gate";
  await M.upsertItems(sql, 'Orders', SP, { force: true });
  let spCalls = [];
  const P = s => '/sites/h:/s:/lists/' + s;
  const base = async (path, opts) => {
    spCalls.push(path);
    if (/\/lists\/Settings\/items/.test(path)) return { value: [{ id: '1', fields: { Key: 'SqlReadMode', Value: JSON.stringify(base.mode || {}) } }] };
    const r = R.parseRead(path);
    if (r && r.list === 'Orders') {
      if (r.id) { const it = SP.find(x => x.id === r.id); if (!it) { const e = new Error('Item not found'); e.status = 404; throw e; } return r.fieldsOnly ? it.fields : it; }
      const cf = /fields\/ClientID eq '([^']+)'/.exec(r.filter || '');
      return { value: SP.filter(x => !cf || x.fields.ClientID === cf[1]) };
    }
    if (/orderby/.test(path)) return { value: [{ id: 'sp-order' }] };
    return { value: [] };
  };

  /* parseRead */
  check('parse: list, expand, filter, top', JSON.stringify(R.parseRead(P('Orders/items') + '?$expand=fields&$top=500&$filter=' + encodeURIComponent("fields/Status eq 'Assigned'"))) ===
    JSON.stringify({ list: 'Orders', id: null, fieldsOnly: false, expandFields: true, fieldSelect: null, select: null, filter: "fields/Status eq 'Assigned'", top: 500, skip: 0, other: [] }));
  check('parse: fields($select=...) and single item', JSON.stringify(R.parseRead(P('Orders/items') + '?$expand=fields($select=OrderID,Title)').fieldSelect) === '["OrderID","Title"]' && R.parseRead(P('Orders/items/12') + '?$expand=fields').id === '12');
  check('parse: $orderby or a SharePoint skiptoken are not translated', R.parseRead(P('Orders/items') + '?$orderby=id') === null && R.parseRead(P('Orders/items') + '?$skiptoken=Paged%3DTRUE') === null);

  const deps = mode => ({ sql, mode });
  const run = (mode, path) => M.wrap(base, deps(mode))(path, {});

  /* modo sql: las mismas respuestas que SharePoint */
  spCalls = [];
  let r = await run('sql', P('Orders/items') + '?$expand=fields&$top=500&$filter=' + encodeURIComponent("fields/ClientID eq 'GS-1' and fields/Status ne 'Completed'"));
  check('sql: filter and/ne', r.value.map(x => x.id).join() === '1,3', r.value.map(x => x.id));
  check('sql: never asked SharePoint for the data', !spCalls.some(p => /lists\/Orders/.test(p)), spCalls);
  const it3 = r.value[1];
  check('sql: same shape as SharePoint (id string, etag, dates without ms, numbers, booleans)',
    it3.id === '3' && it3['@odata.etag'] === '"g3,1"' && it3.createdDateTime === '2026-10-03T10:00:00Z' && it3.fields.Bedrooms === 0 && it3.fields.Archived === false &&
    it3.fields.DueDate === '2026-10-13T23:59:59Z' && it3.fields.Notes === "O'Brien gate" && it3.fields.Created === '2026-10-03T10:00:00Z' && it3.fields.id === '3', it3);
  r = await run('sql', P('Orders/items') + '?$expand=fields&$filter=' + encodeURIComponent("fields/OrderID eq 'GS-1-2' or fields/OrderID eq 'gs-1-6'"));
  check('sql: or, and text compare without upper/lower case (like SharePoint)', r.value.map(x => x.id).join() === '2,6', r.value.map(x => x.id));
  r = await run('sql', P('Orders/items') + '?$expand=fields&$filter=' + encodeURIComponent("fields/DueDate ge '2026-10-15T00:00:00Z' and fields/Created lt '2026-10-07T00:00:00Z'"));
  check('sql: dates ge/lt, Created as a column', r.value.map(x => x.id).join() === '5,6', r.value.map(x => x.id));
  r = await run('sql', P('Orders/items') + '?$expand=fields&$filter=' + encodeURIComponent("fields/Notes eq ''"));
  check('sql: empty text = no value', r.value.length === 6, r.value.length);
  r = await run('sql', P('Orders/items') + '?$expand=fields&$filter=' + encodeURIComponent("fields/Notes eq 'O''Brien gate'"));
  check('sql: quotes inside a value', r.value.length === 1 && r.value[0].id === '3');
  r = await run('sql', P('Orders/items') + '?$expand=fields&$filter=' + encodeURIComponent("fields/Nope eq 'x'"));
  check('sql: a column that does not exist matches nothing', r.value.length === 0);
  r = await run('sql', P('Orders/items') + '?$expand=fields($select=OrderID)&$top=3');
  check('sql: fields($select) and $top with a next page', r.value.length === 3 && Object.keys(r.value[0].fields).sort().join() === '@odata.etag,Created,Modified,OrderID,id' && /(\$|%24)skiptoken=sql%3A3/.test(r['@odata.nextLink']), r);
  const all = [];
  let url = P('Orders/items') + '?$expand=fields&$top=3';
  const g = M.wrap(base, deps('sql'));
  while (url) { const page = await g(url, {}); all.push(...page.value); url = page['@odata.nextLink'] || null; }
  check('sql: following nextLink gives every row once', all.map(x => x.id).join() === '1,2,3,4,5,6,7');
  r = await run('sql', P('Orders/items') + '?$select=id&$top=500');
  check('sql: $select=id gives only ids', r.value.length === 7 && Object.keys(r.value[0]).join() === 'id');
  r = await run('sql', P('Orders/items/4') + '?$expand=fields');
  check('sql: one item', r.id === '4' && r.fields.OrderID === 'GS-1-4');
  r = await run('sql', P('Orders/items/4/fields'));
  check('sql: /fields of one item', r.OrderID === 'GS-1-4' && r.id === '4');

  /* nunca un "no existe" falso: si SQL no lo tiene, SharePoint */
  SP.push({ id: '8', fields: { id: '8', OrderID: 'GS-NEW' } });
  spCalls = [];
  const quiet = console.error; console.error = () => {};
  r = await run('sql', P('Orders/items/8') + '?$expand=fields');
  console.error = quiet;
  check('sql: a row SQL does not have yet comes from SharePoint', r.id === '8' && spCalls.some(p => /items\/8/.test(p)));

  /* lo que no se traduce va a SharePoint */
  spCalls = [];
  r = await run('sql', P('Orders/items') + '?$expand=fields&$orderby=id desc');
  check('sql: $orderby goes to SharePoint', r.value[0].id === 'sp-order');
  r = await run('sql', P('Orders/items') + '?$expand=fields&$filter=' + encodeURIComponent("startswith(fields/OrderID,'GS')"));
  check('sql: a filter it cannot translate goes to SharePoint', r.value.length === 8);

  /* listas con candado If-Match: siempre SharePoint */
  spCalls = [];
  await run('sql', P('Settings/items') + '?$expand=fields&$filter=' + encodeURIComponent("fields/Key eq 'OrderCounter'"));
  check('sql: Settings always from SharePoint', spCalls.some(p => /Settings/.test(p)));

  /* crons / procesos de fondo / copia: siempre SharePoint */
  spCalls = [];
  await M.context({ background: true }, () => run('sql', P('Orders/items') + '?$expand=fields'));
  check('background (crons): SharePoint', spCalls.some(p => /lists\/Orders/.test(p)));
  spCalls = [];
  await M.context({ source: 'sharepoint' }, () => run('sql', P('Orders/items') + '?$expand=fields'));
  check('copy and Compare: SharePoint', spCalls.some(p => /lists\/Orders/.test(p)));

  /* SQL caido o lento: SharePoint */
  console.error = () => {};
  spCalls = [];
  r = await M.wrap(base, { sql: async () => { throw new Error('SQL down'); }, mode: 'sql' })(P('Orders/items') + '?$expand=fields', {});
  const slow = await M.wrap(base, { sql: () => new Promise(() => {}), mode: 'sql', readTimeoutMs: 50 })(P('Orders/items') + '?$expand=fields', {});
  console.error = quiet;
  check('sql down or slow: answered by SharePoint', r.value.length === 8 && slow.value.length === 8);

  /* modo sharepoint: ni toca SQL */
  let touched = 0;
  await M.wrap(base, { sql: (t, p) => { touched++; return sql(t, p); }, mode: 'sharepoint' })(P('Orders/items') + '?$expand=fields', {});
  check('sharepoint mode: SQL not touched', touched === 0);

  /* modo compare: contesta SharePoint y anota diferencias */
  SP[0].fields.Status = 'Cancelled';
  r = await run('compare', P('Orders/items') + '?$expand=fields&$top=500');
  check('compare: the answer is SharePoint\'s', r.value.length === 8 && r.value[0].fields.Status === 'Cancelled');
  const d = await sql('select * from "_read_diffs" order by n');
  const kinds = d.flatMap(x => x.diffs).map(x => x.kind + ':' + x.id).sort().join();
  check('compare: logs a different value and a row missing in SQL', d.length === 1 && kinds === 'different:1,missing in SQL:8' && d[0].diffs.find(x => x.id === '1').columns[0].column === 'Status', d);
  await sql('delete from "_read_diffs"');
  SP[0].fields.Status = 'Assigned'; SP.pop();
  await run('compare', P('Orders/items') + '?$expand=fields&$top=500');
  await run('compare', P('Orders/items') + '?$expand=fields&$filter=' + encodeURIComponent("fields/ClientID eq 'GS-2'"));
  check('compare: same data, nothing logged', (await sql('select count(*)::int n from "_read_diffs"'))[0].n === 0);

  /* el switch se lee de SharePoint (Settings) por ambiente, 30 s en memoria */
  process.env.VERCEL_ENV = 'preview';
  base.mode = { preview: 'sql', production: 'sharepoint' };
  R.clearModeCache();
  check('switch: preview reads its own value', await R.readMode(base, P('Orders/items'), {}) === 'sql');
  process.env.VERCEL_ENV = 'production'; R.clearModeCache();
  check('switch: production its own', await R.readMode(base, P('Orders/items'), {}) === 'sharepoint');
  base.mode = {}; R.clearModeCache();
  check('switch: nothing saved = sharepoint', await R.readMode(base, P('Orders/items'), {}) === 'sharepoint');

  /* las escrituras siguen igual */
  const w = await M.wrap(async () => ({ id: '20', fields: { OrderID: 'GS-W' }, createdDateTime: '2026-10-22T00:00:00Z', lastModifiedDateTime: '2026-10-22T00:00:00Z' }), { sql, mode: 'sql' })
    (P('Orders/items'), { method: 'POST', body: '{}' });
  check('writes: still go to SharePoint and are copied', w.id === '20' && (await sql('select "OrderID" from "Orders" where id = 20'))[0].OrderID === 'GS-W');

  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
