/* Prueba de load.js sin navegador: node load/load.test.js */
'use strict';
const listeners = {};
global.window = { addEventListener: (t, f) => { listeners[t] = f; } };
const docListeners = {};
global.document = { visibilityState: 'visible', hidden: false, addEventListener: (t, f) => { docListeners[t] = f; } };
/* Reloj de mentiras para simular una pestaña que se durmio 71 min */
const realNow = Date.now; let clockSkew = 0; Date.now = () => realNow() + clockSkew;
const setHidden = h => { document.hidden = h; document.visibilityState = h ? 'hidden' : 'visible'; docListeners.visibilitychange(); };
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

  /* ---- Arreglo 30/10/2026: alerta de 15 min solo con la pantalla a la vista y despierta ---- */
  L._reset(); const stuck2 = [];
  L.init({ onStuck: (info, e) => stuck2.push([info.key, info.kind, info.tries, e.message]) });
  L._cfg({ waits: [15], stuck: 120, beat: 10, sleepGap: 1e9, wakeGrace: 0, timeout: 0 });
  let hOk = false;
  const pH = L.get('hidden', async () => { if (hOk) return 'h'; throw err(503); }, { label: 'QuickBooks Clients' });
  await wait(20);
  setHidden(true);
  await wait(300);
  assert('escondida: el tiempo con la pestaña escondida no cuenta (sin alerta)', !stuck2.length, stuck2);
  setHidden(false);
  await wait(250);
  assert('a la vista: a los 15 min de verdad si avisa, una vez, con kind=load', stuck2.length === 1 && stuck2[0][0] === 'hidden' && stuck2[0][1] === 'load', stuck2);
  hOk = true; L.wake();
  r = await pH;
  assert('y la carga sigue hasta que llega', r === 'h', r);

  /* El caso del 30/10: Safari congela la carga en segundo plano; al volver (71 min despues) el fetch truena con
     "Load failed" justo al despertar. Se reintenta al momento sin contarlo y no hay alerta. */
  L._reset(); const stuck3 = [];
  L.init({ onStuck: (info, e) => stuck3.push([info.key, info.tries, e.message]) });
  L._cfg({ waits: [100000], stuck: 15 * 60000, beat: 10, sleepGap: 1e9, wakeGrace: 30000, timeout: 0 });
  let rejectFrozen = null, nW = 0;
  const pW = L.get('qb-clients', () => { nW++; if (nW === 1) return new Promise((_, rej) => { rejectFrozen = rej; }); return Promise.resolve({ clients: [1] }); }, { label: 'QuickBooks Clients' });
  await wait(10);
  setHidden(true);
  clockSkew += 71 * 60000;      /* 71 min con la pestaña escondida/congelada */
  setHidden(false);
  rejectFrozen(new TypeError('Load failed'));
  const tW = Date.now();
  r = await Promise.race([pW, wait(2000).then(() => 'timeout')]);
  assert('al despertar: la falla del fetch congelado se reintenta ya (no espera el siguiente intento largo)', r && r.clients && nW === 2 && Date.now() - tW < 1500, { r, nW });
  assert('al despertar: sin alerta (no conto los 71 min ni la falla)', !stuck3.length, stuck3);

  /* Dormida sin evento de visibilidad (la compu se durmio): el latido llega tarde y no cuenta */
  L._reset(); const stuck4 = [];
  L.init({ onStuck: (info, e) => stuck4.push(info.key) });
  L._cfg({ waits: [15], stuck: 200, beat: 10, sleepGap: 60000, wakeGrace: 0, timeout: 0 });
  let sOk = false;
  const pS = L.get('sleep', async () => { if (sOk) return 's'; throw err(500); });
  await wait(30);
  clockSkew += 40 * 60000;     /* 40 min dormida */
  await wait(80);
  assert('dormida: el hueco del latido no cuenta como tiempo esperando', !stuck4.length, stuck4);
  sOk = true; L.wake(); await pS;

  /* Si la persona ya ve algo de esto, nadie esta esperando: no hay alerta */
  L._reset(); const stuck5 = [];
  L.init({ onStuck: (info) => stuck5.push(info.key) });
  L._cfg({ waits: [15], stuck: 60, beat: 10, sleepGap: 1e9, wakeGrace: 0, timeout: 0 });
  await L.get('seen', async () => 'v1');
  let bOk = false;
  const pB = L.get('seen', async () => { if (bOk) return 'v2'; throw err(500); });
  await wait(200);
  assert('ya cargo antes en esta pagina (la pantalla tiene datos): sin alerta', !stuck5.length, stuck5);
  bOk = true; L.wake(); await pB;

  /* ---- Tiempo limite en las lecturas (Arreglo 30/10/2026) ---- */
  L._reset(); L.init({});
  L._cfg({ waits: [10], stuck: 1e9, timeout: 50, wakeGrace: 0 });
  let nT = 0, sig1 = null;
  r = await L.get('hang', (ctx) => { nT++; if (nT === 1) { sig1 = ctx && ctx.signal; return new Promise(() => {}); } return Promise.resolve('ok'); });
  assert('tiempo limite: una lectura que no contesta se corta y se reintenta sola', r === 'ok' && nT === 2, { r, nT });
  assert('tiempo limite: se le avisa al fetch con su AbortSignal', !sig1 || sig1.aborted === true, sig1 && sig1.aborted);
  let nL = 0;
  r = await L.get('late', () => { nL++; return wait(nL === 1 ? 100 : 30).then(() => 'answer-' + nL); });
  await wait(120);
  assert('tiempo limite: la respuesta tardia del intento cortado se ignora (gana el reintento)', r === 'answer-2' && nL === 2, { r, nL });
  let nS = 0;
  r = await L.get('slow-qb', () => { nS++; return wait(120).then(() => 'qb'); }, { timeoutMs: 400 });
  assert('tiempo limite por carga (opts.timeoutMs): QuickBooks lento llega sin cortarse', r === 'qb' && nS === 1, { r, nS });
  nS = 0;
  r = await L.get('no-limit', () => { nS++; return wait(120).then(() => 'nl'); }, { timeoutMs: 0 });
  assert('opts.timeoutMs = 0: sin limite', r === 'nl' && nS === 1, { r, nS });
  L._cfg({ timeout: 60000 });

  /* Los guardados (GSBackground) nunca se cortan, aunque tarden mas que el limite de lecturas */
  {
    const lsStore = {};
    global.localStorage = { getItem: k => (k in lsStore ? lsStore[k] : null), setItem: (k, v) => { lsStore[k] = String(v); } };
    Object.assign(document, { head: { appendChild() {} }, getElementById: () => null, createElement: () => ({}), querySelectorAll: () => [] });
    window.crypto = require('crypto').webcrypto;
    require('../background/background.js');
    const B = window.GSBackground;
    B._cfg({ waits: [20], stuck: 1e9 });
    L._cfg({ timeout: 40 });
    const sends = [], doneB = [];
    B.init({ send: async e => { sends.push(e.id); await wait(200); return { ok: true }; }, onDone: e => doneB.push(e.id), onFail: () => {} });
    const job = B.run({ group: 'G-1', kind: 'save', label: 'Save', path: '/x', body: { v: 1 } });
    await wait(350);
    assert('guardado: tarda 200 ms (mas que el limite de 40 ms de lecturas) y sale una sola vez, sin cortarse', sends.length === 1 && doneB.includes(job.id), { sends, doneB });
    L._cfg({ timeout: 60000 });
  }

  /* ---- Lo ultimo que se vio (CFO 22/10/2026) ---- */
  L._reset(); L._cfg({ waits: [20, 20, 20], stuck: 1e9, beat: 10000, sleepGap: 60000, wakeGrace: 30000 });
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

  L._reset(); L.init({ saved: { prefix: 'gs-admin-load|cfo@x|', fastMs: 20 } }); L.init({ onStuck: () => {} });
  await L.get('p2', async () => 'v2');
  assert('init dos veces (saved primero, onStuck despues): se juntan, saved sigue', store['gs-admin-load|cfo@x|p2'], Object.keys(store));

  /* Lo nuevo igual a lo guardado: no se repinta */
  L._reset(); L._cfg({ typingRetry: 20 }); const fresh3 = []; L.init({ saved: { prefix: 'gs-admin-load|cfo@x|', fastMs: 20, onFresh: i => fresh3.push(i.key) } });
  r = await L.get('p', () => wait(60).then(() => 'v'));
  await wait(120);
  assert('saved: lo nuevo igual a lo guardado -> no se llama onFresh', r === 'v' && !fresh3.length, fresh3);

  /* Escribiendo: el repintado espera a que deje el campo */
  L._reset(); L._cfg({ typingRetry: 20 }); const fresh4 = [];
  L.init({ saved: { prefix: 'gs-admin-load|cfo@x|' } }); L.init({ saved: { fastMs: 20, onFresh: i => fresh4.push(i.key) } });
  document.activeElement = { tagName: 'INPUT' };
  r = await L.get('p', () => wait(40).then(() => 'v-new'));
  await wait(150);
  assert('saved: init dos veces con saved -> se juntan (prefix + onFresh)', r === 'v', r);
  assert('saved: escribiendo en un campo -> onFresh espera', !fresh4.length, fresh4);
  document.activeElement = null;
  await wait(80);
  assert('saved: al dejar el campo -> onFresh una vez', fresh4.length === 1 && fresh4[0] === 'p', fresh4);
  r = await L.get('p', async () => { throw new Error('no deberia llamarse'); });
  assert('saved: y la pantalla recibe lo nuevo de memoria', r === 'v-new', r);

  /* prefix con getter (quien entro se sabe despues): al juntar init no se congela */
  L._reset(); let who = null;
  L.init({ saved: { get prefix() { return who ? 'gs-admin-load|' + who + '|' : null; } } }); L.init({ saved: { fastMs: 20 } });
  who = 'tarde@x';
  await L.get('g', async () => 'gv');
  assert('saved: un prefix con getter sigue vivo despues de juntar init', store['gs-admin-load|tarde@x|g'] && store['gs-admin-load|tarde@x|g'].data === 'gv', Object.keys(store));

  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
