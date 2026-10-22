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

  /* ---- Lo ultimo que se vio (CFO 22/10/2026) ---- */
  const store = {};
  window.GSSaved = {
    save: async (k, d) => { store[k] = { at: Date.now(), data: JSON.parse(JSON.stringify(d)) }; return true; },
    read: async k => store[k] || null,
    clear: async pre => { Object.keys(store).forEach(k => { if (k.startsWith(pre)) delete store[k]; }); }
  };
  L._reset();
  L._cfg({ waits: [20, 20, 20, 20, 20], stuck: 1e9, memo: 1000 });
  const fresh = [], shown = [];
  let allFresh = 0;
  L.init({ saved: { scope: 'cfo@x', fastMs: 30, onShowSaved: i => shown.push(i.key), onFresh: i => fresh.push([i.key, i.data]), onAllFresh: () => allFresh++ } });

  r = await L.get('w', async () => ({ list: [1, 2] }), { label: 'Warehouse' });
  assert('saved: rapida -> lo nuevo, y queda guardado por persona', r.list.length === 2 && store['gs-load|cfo@x|w'] && !L.isSaved(r), Object.keys(store));

  /* Pagina nueva (otra pestaña): el servidor tarda -> lo guardado al momento, lo nuevo despues sin aviso a la pantalla */
  L._reset(); L.init({ saved: { scope: 'cfo@x', fastMs: 30, onShowSaved: i => shown.push(i.key), onFresh: i => fresh.push([i.key, i.data]), onAllFresh: () => allFresh++ } });
  let t0 = Date.now();
  r = await L.get('w', () => wait(150).then(() => ({ list: [1, 2, 3] })), { label: 'Warehouse' });
  assert('saved: servidor lento -> se enseña lo ultimo visto en ~fastMs', r.list.length === 2 && L.isSaved(r) && Date.now() - t0 < 120 && shown.includes('w'), { r, ms: Date.now() - t0 });
  await wait(200);
  assert('saved: cuando llega lo nuevo -> onFresh con los datos, y se guarda', fresh.length === 1 && fresh[0][1].list.length === 3 && store['gs-load|cfo@x|w'].data.list.length === 3 && allFresh === 1, { fresh, allFresh });
  r = await L.get('w', async () => { throw new Error('no deberia llamarse'); });
  assert('saved: repintar despues de onFresh da lo nuevo al momento (sin ir al servidor)', r.list.length === 3 && !L.isSaved(r), r);

  /* Ya llego fresca en esta pagina (p. ej. despues de guardar): espera al servidor, nunca lo viejo */
  t0 = Date.now();
  r = await L.get('w', () => wait(100).then(() => ({ list: [9] })));
  assert('saved: una carga ya fresca en esta pagina espera al servidor', r.list[0] === 9 && Date.now() - t0 >= 90 && !L.isSaved(r), { r, ms: Date.now() - t0 });

  /* El servidor falla (504) -> lo guardado de inmediato, sin esperar fastMs; luego llega lo nuevo */
  L._reset(); L.init({ saved: { scope: 'cfo@x', fastMs: 5000, onFresh: i => fresh.push([i.key, i.data]) } });
  let n504 = 0; t0 = Date.now();
  r = await L.get('w', async () => { n504++; if (n504 < 3) throw err(504); return { list: ['new'] }; });
  assert('saved: si el servidor falla se enseña lo guardado sin esperar', r.list[0] === 9 && Date.now() - t0 < 60, { r, ms: Date.now() - t0 });
  await wait(100);
  assert('saved: y lo nuevo llega por detras', fresh.some(f => f[0] === 'w' && f[1].list[0] === 'new'), fresh);

  /* onUpdate de la pantalla manda sobre onFresh del portal */
  L._reset(); const fresh2 = []; L.init({ saved: { scope: 'cfo@x', fastMs: 20, onFresh: i => fresh2.push(i.key) } });
  let upd = null;
  r = await L.get('w', () => wait(80).then(() => ({ list: ['u'] })), { onUpdate: d => { upd = d; } });
  await wait(120);
  assert('saved: con onUpdate se repinta esa pantalla y no se llama onFresh', upd && upd.list[0] === 'u' && !fresh2.length, { upd, fresh2 });

  /* Sin copia guardada: igual que antes (Loading hasta que llega) */
  t0 = Date.now();
  r = await L.get('nueva', () => wait(80).then(() => 'x'));
  assert('saved: sin copia, espera al servidor como siempre', r === 'x' && Date.now() - t0 >= 70, Date.now() - t0);

  /* saved:false y error de dato */
  let n2 = 0;
  r = await L.get('w2', () => { n2++; return wait(50).then(() => 'srv'); }, { saved: false });
  assert('saved:false nunca usa lo guardado', r === 'srv', r);
  L._reset(); L.init({ saved: { scope: 'cfo@x', fastMs: 1000 } });
  let got403 = null;
  try { await L.get('w', async () => { throw err(403, 'Developer only.'); }); } catch (e) { got403 = e; }
  assert('saved: un error de dato se sigue diciendo (no se tapa con lo guardado)', got403 && got403.status === 403, got403 && got403.message);

  /* Otra persona en el mismo navegador no ve lo de la otra; Sign out lo borra */
  L._reset(); L.init({ saved: { scope: 'otra@x', fastMs: 20 } });
  r = await L.get('w', () => wait(60).then(() => 'de otra'));
  assert('saved: por persona (scope): otra persona no ve lo guardado de la primera', r === 'de otra', r);
  L._reset(); L.init({ saved: { scope: 'cfo@x', fastMs: 20 } });
  await L.clearSaved();
  assert('saved: clearSaved borra lo de esa persona y deja lo de otra', !Object.keys(store).some(k => k.startsWith('gs-load|cfo@x|')) && Object.keys(store).some(k => k.startsWith('gs-load|otra@x|')), Object.keys(store));

  /* Sin GSSaved o sin scope: como siempre */
  L._reset(); L.init({});
  t0 = Date.now(); r = await L.get('w', () => wait(60).then(() => 'srv2'));
  assert('sin saved en init: como siempre', r === 'srv2' && Date.now() - t0 >= 50, r);

  L._reset(); L.init({ saved: { prefix: 'gs-admin-load|cfo@x|', fastMs: 20 } });
  await L.get('p', async () => 'v');
  assert('saved.prefix: se guarda con el prefijo del portal (lo borra su Sign out)', store['gs-admin-load|cfo@x|p'] && store['gs-admin-load|cfo@x|p'].data === 'v', Object.keys(store));

  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
