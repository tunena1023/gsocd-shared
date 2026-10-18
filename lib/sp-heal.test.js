'use strict';
/* node lib/sp-heal.test.js -- la prueba completa (lib/graph.js real de Admin y Tech) es Admin tests/sp-heal.sim.js. */
const assert = require('assert');
const { createHealer, columnBody } = require('./sp-heal');
const SPEC = [
  { list: 'NewList', createList: true, columns: [{ name: 'A', type: 'text', indexed: true }, { name: 'B', type: 'note' }] },
  { list: 'Old', columns: [{ name: 'X', type: 'number' }, { name: 'Y' }] }
];
const fail = (status, message) => { const e = new Error(message); e.status = status; return e; };

function world(o) {
  o = o || {};
  const lists = Object.assign({ Old: ['Title'] }, o.lists || {});
  const calls = [];
  const rawFetch = async (path, opt) => {
    opt = opt || {}; const method = opt.method || 'GET';
    calls.push(method + ' ' + path);
    let m;
    if ((m = /\/lists\/([^/?]+)\/items/.exec(path)) && !/^\/sites\/S\//.test(path)) {
      const L = lists[decodeURIComponent(m[1])];
      if (!L) throw fail(404, 'The specified list was not found');
      if (opt.body) { const f = JSON.parse(opt.body); const k = Object.keys(f.fields || f).find(n => !L.includes(n)); if (k) throw fail(400, "Field '" + k + "' is not recognized"); }
      return { value: [] };
    }
    if (path === '/sites/S/lists') { if (o.deny) throw fail(403, 'Access denied'); const b = JSON.parse(opt.body); lists[b.displayName] = ['Title'].concat(b.columns.map(c => c.name)); return {}; }
    if ((m = /^\/sites\/S\/lists\/([^/?]+)\/columns/.exec(path))) {
      if (method === 'GET') return { value: lists[m[1]].map(n => ({ id: n, name: n, displayName: n })) };
      lists[m[1]].push(JSON.parse(opt.body).name); return {};
    }
    if ((m = /^\/sites\/S\/lists\/([^/?]+)/.exec(path))) { if (!lists[m[1]]) throw fail(404, "List '" + m[1] + "' does not exist"); return {}; }
    throw new Error('unknown ' + path);
  };
  const errors = [];
  const h = createHealer({ portal: 'T', rawFetch, getSiteId: async () => 'S', catalog: () => SPEC, log: { log() {}, error: s => errors.push(s) } });
  return { h, lists, calls, errors };
}
const items = l => '/sites/h:/sites/x:/lists/' + l + '/items';
const post = f => ({ method: 'POST', body: JSON.stringify({ fields: f }) });

(async () => {
  let w = world();
  await w.h.graphFetch(items('NewList'), post({ Title: 'a', A: '1' }));
  assert.deepStrictEqual(w.lists.NewList, ['Title', 'A', 'B']);
  assert.strictEqual(w.calls.filter(c => c === 'POST /sites/S/lists').length, 1);

  w = world();
  await w.h.graphFetch(items('Old'), post({ Title: 'a', X: 2 }));
  assert.ok(w.lists.Old.includes('X'));
  await assert.rejects(w.h.graphFetch(items('Old'), post({ Y: 'no type' })), /not recognized/);
  await assert.rejects(w.h.graphFetch(items('Nope'), post({ Title: 'a' })), /specified list was not found/);
  assert.ok(w.errors.some(s => /Nope does not exist and it is not in lib\/sp-columns\.js/.test(s)));

  w = world({ deny: true });
  await assert.rejects(w.h.graphFetch(items('NewList'), post({ Title: 'a' })), /not found/);
  await assert.rejects(w.h.graphFetch(items('NewList'), post({ Title: 'a' })), /not found/);
  assert.strictEqual(w.calls.filter(c => c === 'POST /sites/S/lists').length, 1); /* sin ciclo */
  assert.deepStrictEqual(await w.h.graphFetch(items('NewList') + '?$expand=fields'), { value: [] });

  assert.strictEqual(columnBody({ name: 'n', type: 'number' }).number !== undefined, true);
  assert.strictEqual(columnBody({ name: 'n', type: 'note', indexed: true }).text.allowMultipleLines, true);
  console.log('sp-heal ok');
})().catch(e => { console.error(e); process.exit(1); });
