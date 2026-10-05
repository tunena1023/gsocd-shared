/* node lib/submit-key.test.js -- SubmitKey (05/10/2026): servidor y navegador. */
const assert = require('assert');
const mk = require('./submit-key');
const rows = [];
let failNext = null; /* 'lost' = guarda y truena (respuesta cortada); 'fail' = truena sin guardar */
const g = {
  siteListPath: l => 'list:' + l,
  graphFetch: async url => {
    const m = /SubmitKey eq '((?:[^']|'')*)'/.exec(decodeURIComponent(url));
    if (!m) throw new Error('bad query');
    const k = m[1].replace(/''/g, "'");
    return { value: rows.filter(r => r.fields.SubmitKey === k) };
  },
  createListItem: async (l, f) => {
    const mode = failNext; failNext = null;
    const it = { id: String(rows.length + 1), fields: Object.assign({}, f) };
    if (mode !== 'fail') rows.push(it);
    if (mode) throw new Error('503 Service Unavailable');
    return it;
  }
};
(async () => {
  const sk = mk(g);
  assert.strictEqual(sk.read({ SubmitKey: '  abc ' }), 'abc');
  assert.strictEqual(sk.read({}), '');
  assert.strictEqual(sk.unitKey('abc', 2), 'abc#2');
  assert.strictEqual(sk.unitKey('', 2), '');
  assert.strictEqual(await sk.find(''), null);

  const a = await sk.createOrder({ OrderID: 'A' }, 'k1');
  assert.strictEqual(a.fields.SubmitKey, 'k1');
  assert.strictEqual((await sk.find('k1')).fields.OrderID, 'A');

  failNext = 'lost';
  const b = await sk.createOrder({ OrderID: 'B' }, "k'2");
  assert.strictEqual(b.fields.OrderID, 'B');
  assert.strictEqual(rows.filter(r => r.fields.OrderID === 'B').length, 1, 'respuesta cortada: no se crea dos veces');

  failNext = 'fail';
  await sk.createOrder({ OrderID: 'C' }, 'k3');
  assert.strictEqual(rows.filter(r => r.fields.OrderID === 'C').length, 1, 'falla sin guardar: se intenta una vez mas');

  failNext = 'fail';
  await assert.rejects(sk.createOrder({ OrderID: 'D' }), /503/, 'sin llave: el error sale como antes');
  assert.strictEqual(rows.filter(r => r.fields.OrderID === 'D').length, 0);

  await sk.createOrder({ OrderID: 'P1' }, sk.unitKey('lot', 0));
  const units = await sk.findUnits('lot', 3);
  assert.deepStrictEqual(units.map(u => u && u.fields.OrderID), ['P1', null, null]);
  assert.deepStrictEqual(await sk.findUnits('', 2), [null, null]);

  const broken = mk(Object.assign({}, g, { graphFetch: async () => { throw new Error('down'); } }));
  const err = console.error; console.error = () => {};
  assert.strictEqual(await broken.find('k1'), null, 'si la busqueda falla, se sigue como antes');
  console.error = err;

  /* Navegador (submit-key/submit-key.js) */
  const store = {};
  global.window = global;
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  require('../submit-key/submit-key.js');
  const K = global.GSSubmitKey;
  const body = { ClientID: 'GS-1', Units: [{ unitNumber: '1' }] };
  const k1 = K.key('create', body);
  assert.strictEqual(K.key('create', Object.assign({}, body)), k1, 'mismo contenido = misma llave');
  assert.strictEqual(K.key('create', Object.assign({ SubmitKey: k1, OrderID: 'GS-1-TEMP-9' }, body)), k1, 'la llave y el OrderID no cuentan');
  const k2 = K.key('create', { ClientID: 'GS-1', Units: [{ unitNumber: '2' }] });
  assert.notStrictEqual(k2, k1, 'contenido cambiado = otra llave');
  K.forget('create');
  assert.notStrictEqual(K.key('create', { ClientID: 'GS-1', Units: [{ unitNumber: '2' }] }), k2, 'forget = llave nueva');
  assert.notStrictEqual(K.key('other', body), k1, 'cada formulario su llave');
  let release;
  const first = K.sendOnce('x', () => new Promise(r => { release = r; }));
  await assert.rejects(K.sendOnce('x', async () => 1), /still being saved/);
  release(5);
  assert.strictEqual(await first, 5);
  assert.strictEqual(await K.sendOnce('x', async () => 6), 6, 'ya termino: se puede mandar otra vez');
  await assert.rejects(K.sendOnce('y', async () => { throw new Error('boom'); }), /boom/);
  assert.strictEqual(await K.sendOnce('y', async () => 7), 7, 'despues de un error tambien se libera');
  console.log('submit-key OK');
})().catch(e => { console.error(e); process.exit(1); });
