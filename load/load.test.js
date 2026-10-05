/* Prueba de load.js sin navegador: node load/load.test.js */
'use strict';
const listeners = {};
global.window = { addEventListener: (t, f) => { listeners[t] = f; } };
global.document = { visibilityState: 'visible', addEventListener() {} };
require('./load.js');
const L = window.GSLoad;
L._cfg({ waits: [20, 20, 20], stuck: 50 });

let ok = 0, fail = 0;
const assert = (name, c, ev) => { if (c) { ok++; console.log('OK   - ' + name); } else { fail++; console.log('FAIL - ' + name, ev === undefined ? '' : JSON.stringify(ev)); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const err = (st, m) => Object.assign(new Error(m || 'boom'), { status: st });

(async () => {
  const stuck = [];
  L.init({ onStuck: (info, e) => stuck.push([info.key, info.label, e.message]) });

  let r = await L.get('a', async () => ({ v: 1 }));
  assert('si carga a la primera, regresa los datos', r && r.v === 1, r);

  /* eTag mismatch (500), 504 de Vercel, sin señal: no rechaza, reintenta y llega */
  for (const [name, e] of [['500 eTag mismatch', err(500, 'eTag mismatch')], ['504 de Vercel', err(504)], ['sin señal (sin status)', new TypeError('Failed to fetch')], ['401', err(401)], ['429', err(429)]]) {
    let n = 0, settled = false;
    const p = L.get('b-' + name, async () => { n++; if (n < 3) throw e; return { ok: n }; });
    p.then(() => { settled = true; }, () => { settled = true; });
    await wait(5);
    assert(name + ': mientras falla no hay error (la pantalla sigue en Loading)', !settled && n === 1, { settled, n });
    r = await p;
    assert(name + ': se reintenta solo y llega', r.ok === 3 && n === 3, { r, n });
  }

  /* Error de dato: se dice (no se reintenta) */
  for (const st of [400, 403, 404, 409]) {
    let n = 0, got = null;
    try { await L.get('c' + st, async () => { n++; throw err(st, 'QuickBooks is not connected yet.'); }); } catch (e) { got = e; }
    assert(st + ': error de dato se rechaza una vez, con su mensaje', got && got.status === st && /not connected/.test(got.message) && n === 1, { n, got: got && got.message });
  }

  /* Dos cargas de lo mismo a la vez: una sola, con la ultima fn */
  let calls = [];
  const p1 = L.get('same', async () => { calls.push(1); throw err(500); });
  await wait(5);
  const p2 = L.get('same', async () => { calls.push(2); return 'second'; });
  assert('la misma key a la vez es la misma carga', p1 === p2);
  r = await p2;
  assert('la segunda llamada reintenta ya, con la fn nueva', r === 'second' && calls.join(',') === '1,2', calls);

  /* Filtro: cambiar de mes mientras el mes viejo sigue reintentando */
  let oldDone = false, oldTries = 0;
  const pOld = L.get('month-09', async () => { oldTries++; throw err(500); }, { slot: 'qb-month' });
  pOld.then(() => { oldDone = true; }, () => { oldDone = true; });
  await wait(5);
  r = await L.get('month-10', async () => 'october', { slot: 'qb-month' });
  const triesAtSwitch = oldTries;
  await wait(80);
  assert('slot: la carga nueva llega', r === 'october', r);
  assert('slot: la vieja se cancela (no se cumple ni sigue reintentando)', !oldDone && oldTries === triesAtSwitch && !L.pending().some(x => x.key === 'month-09'), { oldDone, oldTries, triesAtSwitch });
  r = await L.get('order-A', async () => 'A', { slot: null });
  assert('sin slot no se cancela nada', r === 'A', r);

  /* Volver la señal: reintenta de inmediato */
  L._cfg({ waits: [100000], stuck: 1e9 });
  let m = 0;
  const p3 = L.get('online', async () => { m++; if (m === 1) throw err(503); return 'back'; });
  await wait(10);
  assert('esperando el siguiente intento largo', m === 1 && L.pending().some(x => x.key === 'online'), L.pending());
  listeners.online();
  r = await Promise.race([p3, wait(200).then(() => 'timeout')]);
  assert('al volver la señal se reintenta de inmediato', r === 'back' && m === 2, { r, m });

  /* 15 min sin cargar: aviso una vez, y sigue intentando */
  L._cfg({ waits: [15], stuck: 40 });
  let k = 0;
  const p4 = L.get('slow', async () => { k++; if (k < 8) throw err(500, 'eTag mismatch'); return 'finally'; }, { label: 'Missing in QB' });
  r = await p4;
  const s = stuck.filter(x => x[0] === 'slow');
  assert('onStuck una sola vez, con su label y el error', s.length === 1 && s[0][1] === 'Missing in QB' && /eTag/.test(s[0][2]), stuck);
  assert('y aun asi sigue intentando hasta que llega', r === 'finally', r);
  assert('al terminar no queda nada pendiente', !L.pending().length, L.pending());

  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
