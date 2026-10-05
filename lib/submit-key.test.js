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

  const a = await sk.createOrder({ OrderID: 'A', ClientID: 'GS-1001' }, 'k1');
  assert.strictEqual((await sk.find('k1', ' gs-1001 ')).fields.OrderID, 'A', 'mismo cliente');
  assert.strictEqual(await sk.find('k1', 'GS-2002'), null, 'la orden de otro cliente nunca se regresa');
  assert.deepStrictEqual(await sk.findUnits('zz', 1, 'GS-2002'), [null]);
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
  /* Cola (navegador) */
  const Q = K.queue;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  global.document = { addEventListener() {}, visibilityState: 'visible' };
  global.addEventListener = () => {};
  Q._cfg({ budget: 60, waits: [30], stuck: 400 });
  const http = st => Object.assign(new Error('HTTP ' + st), { status: st });
  let plan = [], sent = [], done = [], stuck = [], changes = 0;
  const hooks = {
    send: async e => { sent.push(e.id); const step = plan.shift() || { ok: 1 }; if (step.wait) await sleep(step.wait); if (step.err) throw step.err; return { orderId: 'O-' + sent.length }; },
    onDone: (e, r) => done.push([e.id, r.orderId]), onStuck: (e, err) => stuck.push(err.message), onChange: () => changes++
  };
  const fresh = () => { Q._reset(); plan = []; sent = []; done = []; stuck = []; Q.init(hooks); };

  fresh();
  let out = await Q.start({ slot: 'q', path: '/x', body: { a: 1 }, meta: { m: 1 } });
  assert.ok(out.result && out.result.orderId === 'O-1', 'rapido: como siempre');
  assert.strictEqual(Q.list().length, 0);

  fresh(); plan = [{ err: http(400) }];
  await assert.rejects(Q.start({ slot: 'q', path: '/x', body: { a: 2 } }), /HTTP 400/, 'dato que corregir: lo ve el usuario');
  assert.strictEqual(Q.list().length, 0); assert.strictEqual(stuck.length, 0);

  fresh(); plan = [{ err: http(500) }];
  out = await Q.start({ slot: 'q', path: '/x', body: { a: 3 } });
  assert.ok(out.queued, 'falla del sistema: segundo plano');
  assert.strictEqual(Q.list().length, 1, 'queda guardado');
  await sleep(120);
  assert.strictEqual(done.length, 1, 'se reintento solo y llego'); assert.strictEqual(Q.list().length, 0);

  fresh(); plan = [{ wait: 150 }];
  out = await Q.start({ slot: 'q', path: '/x', body: { a: 4 } });
  assert.ok(out.queued, 'lento: segundo plano');
  await sleep(200);
  assert.strictEqual(done.length, 1, 'el mismo intento termino y avisa'); assert.strictEqual(sent.length, 1, 'sin mandar otro mientras');

  fresh(); plan = [{ err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }, { err: http(503) }];
  out = await Q.start({ slot: 'q', path: '/x', body: { a: 5 } });
  const again = await Q.start({ slot: 'q', path: '/x', body: { a: 5 } });
  assert.ok(again.queued && again.already, 'el mismo envio otra vez: no se manda doble');
  await sleep(600);
  assert.strictEqual(stuck.length, 1, 'atorado: se avisa una sola vez');
  assert.strictEqual(Q.list().length, 1, 'y se sigue intentando');
  plan = [];
  await sleep(100);
  assert.strictEqual(Q.list().length, 0, 'cuando el sistema regresa, sale');

  /* Se cerro la app con un envio pendiente: al abrir otra vez se retoma. */
  Q._reset(); plan = []; sent = []; done = [];
  store['gs_send_queue_v1'] = JSON.stringify([{ id: 'kk', slot: 'q', path: '/x', body: { SubmitKey: 'kk' }, meta: {}, at: Date.now(), tries: 1, nextAt: 0 }]);
  Q.init(hooks);
  await sleep(50);
  assert.deepStrictEqual(done.map(d => d[0]), ['kk'], 'se retoma al abrir el portal');

  /* Otra pestana lo esta mandando: esta no lo manda a la vez. */
  Q._reset(); sent = []; done = [];
  store['gs_send_queue_v1'] = JSON.stringify([{ id: 'll', slot: 'q', path: '/x', body: { SubmitKey: 'll' }, meta: {}, at: Date.now(), tries: 1, nextAt: 0, lockUntil: Date.now() + 100, lockBy: 'other-tab' }]);
  Q.init(hooks);
  await sleep(30);
  assert.strictEqual(sent.length, 0, 'candado de la otra pestana');
  await sleep(150);
  assert.strictEqual(sent.length, 1, 'si la otra pestana se cerro, al vencer el candado sale');
  Q._reset();

  console.log('submit-key OK');
})().catch(e => { console.error(e); process.exit(1); });
