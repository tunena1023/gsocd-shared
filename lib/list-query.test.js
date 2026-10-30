/* lib/list-query.js: node lib/list-query.test.js */
'use strict';
let ok = 0, fail = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
(async () => {
  const ALL = [{ id: '1', fields: { OrderID: 'A' } }, { id: '2', fields: { OrderID: 'B' } }, { id: '3', fields: { OrderID: 'C' } }];
  let calls = [], failFilter = false;
  const g = {
    siteListPath: l => '/sites/s/lists/' + l + '/items',
    graphFetch: async url => { calls.push(url); if (failFilter && /filter/.test(url)) throw new Error('429 Too Many Requests'); return { value: /filter/.test(url) ? ALL.filter(x => decodeURIComponent(url).includes("'" + x.fields.OrderID + "'")) : ALL }; }
  };
  const lq = require('./list-query')(g);
  const warn = console.warn; console.warn = () => {};
  let r = await lq.fetchByValues('OrderHistory', 'OrderID', ['A', 'C']);
  check('by values: only those rows', r.map(x => x.id).join() === '1,3', r);
  failFilter = true; calls = [];
  r = await lq.fetchByValues('OrderHistory', 'OrderID', ['A']);
  check('filter fails: falls back to the whole list (as always)', r.length === 1 && calls.some(u => !/filter/.test(u)), calls);
  calls = []; let err = null;
  try { await lq.fetchByValues('OrderHistory', 'OrderID', ['A'], { noFallback: true }); } catch (e) { err = e; }
  check('noFallback: throws and never reads the whole list', err && /429/.test(err.message) && !calls.some(u => !/filter/.test(u)), calls);

  /* fetchByField (30/10/2026): un apostrofo no rompe ni cambia la consulta. Un SharePoint falso que entiende
     OData de verdad: '' dentro de las comillas es un apostrofo; si la cadena se rompe, contesta 400. */
  const PEOPLE = [{ id: 'p1', fields: { Name: "O'Brien" } }, { id: 'p2', fields: { Name: 'OBrien' } }, { id: 'p3', fields: { Name: 'x' } }];
  const seen = [];
  const odata = {
    siteListPath: l => '/lists/' + l + '/items',
    graphFetch: async (url, o) => {
      seen.push({ url, prefer: o && o.headers && o.headers.Prefer });
      const f = decodeURIComponent((/\$filter=([^&]+)/.exec(url) || [])[1] || '');
      if (!f) return { value: PEOPLE };
      const m = /^fields\/(\w+) eq '((?:[^']|'')*)'$/.exec(f);
      if (!m) { const e = new Error('400 Syntax error in filter: ' + f); e.status = 400; throw e; }
      const v = m[2].replace(/''/g, "'");
      return { value: PEOPLE.filter(p => p.fields[m[1]] === v) };
    }
  };
  const lq2 = require('./list-query')(odata);
  r = await lq2.fetchByField('People', 'Name', "O'Brien");
  check("by field: O'Brien finds exactly O'Brien", r.length === 1 && r[0].id === 'p1', r);
  r = await lq2.fetchByField('People', 'Name', "x' or fields/Name ne 'zzz");
  check('by field: an injected "or" is just text (no extra rows)', r.length === 0, r);
  r = await lq2.fetchByField('People', 'Name', "''");
  check('by field: a value made of apostrophes is fine', Array.isArray(r) && r.length === 0);
  check('by field: always sends the Prefer header', seen.every(s => /HonorNonIndexed/.test(s.prefer || '')));
  r = await lq2.fetchByField('People', 'Name', 'x', { fields: true });
  check('by field: fields option returns fields', r.length === 1 && r[0].Name === 'x', r);
  let pagesSeen = 0;
  const paged = { siteListPath: l => '/l/' + l, graphFetch: async url => (++pagesSeen === 1 ? { value: [{ id: 'a', fields: {} }], '@odata.nextLink': url + '&page=2' } : { value: [{ id: 'b', fields: {} }] }) };
  r = await require('./list-query')(paged).fetchByField('L', 'F', 'v');
  check('by field: follows every page', r.map(x => x.id).join() === 'a,b', r);
  err = null; calls = []; failFilter = true;
  try { await lq.fetchByField('OrderHistory', 'OrderID', 'A'); } catch (e) { err = e; }
  check('by field: a failed query throws (no silent full read)', err && /429/.test(err.message) && !calls.some(u => !/filter/.test(u)), calls);
  r = await lq.fetchByField('OrderHistory', 'OrderID', 'A', { fallback: true });
  check('by field: fallback option reads the list and filters here', r.length === 1 && r[0].id === '1', r);
  err = null;
  try { await lq.fetchByField('OrderHistory', "OrderID eq 'A' or Title", 'x'); } catch (e) { err = e; }
  check('by field: a bad field name is refused', err && /bad field/.test(err.message));
  check('quote: doubles apostrophes', lq.quote("a'b''c") === "a''b''''c");
  console.warn = warn;
  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
