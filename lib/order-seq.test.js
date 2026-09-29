/* node lib/order-seq.test.js -- contador de numeros de orden (29/09/2026). */
const assert = require('assert');
const mk = require('./order-seq');
const lists = {
  Orders: ['GS-1001-1005', 'GS-1002-1009-PO5003', 'GS-1003-REC12', 'GS-1001-TEMP-99', 'GS-1004-1007'].map((id, i) => ({ id: String(i), fields: { OrderID: id } })),
  Settings: []
};
let scans = 0;
const g = {
  siteListPath: l => 'list:' + l,
  graphFetch: async url => { const l = url.slice(5).split('?')[0]; if (l === 'Orders') scans++; return { value: lists[l] }; },
  createListItem: async (l, f) => { lists[l].push({ id: 'n' + lists[l].length, fields: f }); },
  updateListItemByItemId: async (l, id, f) => { Object.assign(lists[l].find(r => r.id === id).fields, f); }
};
(async () => {
  const seq = mk(g);
  assert.deepStrictEqual(seq.nextFromIds(lists.Orders.map(r => r.fields.OrderID)), { suffix: 1010, po: 5004, rec: 13 });
  assert.deepStrictEqual(seq.nextFromIds([]), { suffix: 1001, po: 5000, rec: 1 });
  assert.strictEqual(await seq.reserve('suffix', 1), 1010);     /* primera vez: lee Orders una vez */
  assert.strictEqual(scans, 1);
  assert.strictEqual(await seq.reserve('suffix', 3), 1011);     /* ya del contador, sin leer Orders */
  assert.strictEqual(await seq.reserve('suffix', 1), 1014);
  assert.strictEqual(scans, 1);
  const rec = await seq.open('rec');
  assert.strictEqual(rec.next(), 13); assert.strictEqual(rec.next(), 14);
  await rec.commit();
  assert.strictEqual((await seq.open('rec')).next(), 15);
  assert.strictEqual(await seq.reserve('po', 1), 5004);
  assert.strictEqual(lists.Settings.find(r => r.fields.Key === 'seq_suffix').fields.Value, '1015');
  console.log('order-seq: OK');
})().catch(e => { console.error(e); process.exit(1); });
