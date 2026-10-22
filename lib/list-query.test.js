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
  console.warn = warn;
  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
