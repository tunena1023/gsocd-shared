/* node lib/order-seq.test.js -- contador de numeros de orden (29/09/2026). */
const assert = require('assert');
const mk = require('./order-seq');
const lists = {
  Orders: ['GS-1001-1005', 'GS-1002-1009-PO5003', 'GS-1003-REC12', 'GS-1001-TEMP-99', 'GS-1004-1007'].map((id, i) => ({ id: String(i), fields: { OrderID: id } })),
  Settings: []
};
let scans = 0, now = Date.parse('2026-10-02T12:00:00Z');
const stamp = () => new Date(now += 60000).toISOString();
lists.Orders.forEach(r => { r.fields.Created = '2026-09-01T00:00:00Z'; });
const g = {
  siteListPath: l => 'list:' + l,
  graphFetch: async url => {
    const l = url.slice(5).split('?')[0];
    const m = /fields%2FCreated%20ge%20'([^']+)'/.exec(url) || /fields\/Created ge '([^']+)'/.exec(decodeURIComponent(url));
    if (l === 'Orders' && !m) scans++;
    const since = m ? decodeURIComponent(m[1]) : '';
    return { value: m ? lists[l].filter(r => r.fields.Created >= since) : lists[l] };
  },
  createListItem: async (l, f) => { lists[l].push({ id: 'n' + lists[l].length, fields: f, lastModifiedDateTime: stamp() }); },
  updateListItemByItemId: async (l, id, f) => { const r = lists[l].find(x => x.id === id); Object.assign(r.fields, f); r.lastModifiedDateTime = stamp(); }
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
  /* Contador atrasado (02/10/2026): una orden numerada SIN el contador
     (codigo viejo) despues de la ultima escritura -> el siguiente la salta. */
  const scansBefore = scans;
  lists.Orders.push({ id: 'x1', fields: { OrderID: 'GS-1009-1020', Created: new Date(now += 60000).toISOString() } });
  lists.Orders.push({ id: 'x2', fields: { OrderID: 'GS-1009-REC40', Created: new Date(now += 60000).toISOString() } });
  assert.strictEqual(await seq.reserve('suffix', 1), 1021);
  assert.strictEqual((await seq.open('rec')).next(), 41);
  assert.strictEqual(scans, scansBefore);                        /* sin volver a leer toda la lista */
  /* Una orden vieja (antes de la ultima escritura) no mueve nada. */
  lists.Orders.push({ id: 'x3', fields: { OrderID: 'GS-1009-1500', Created: '2026-09-02T00:00:00Z' } });
  assert.strictEqual(await seq.reserve('suffix', 1), 1022);
  console.log('order-seq: OK');
})().catch(e => { console.error(e); process.exit(1); });
