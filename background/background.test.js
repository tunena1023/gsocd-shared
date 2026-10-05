/* Prueba de background.js sin navegador: node background/background.test.js */
'use strict';
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const els = {};
global.document = {
  visibilityState: 'visible', head: { appendChild() {} }, getElementById: () => null, createElement: () => ({}),
  addEventListener() {}, querySelectorAll: () => Object.values(els)
};
global.window = { addEventListener() {}, crypto: require('crypto').webcrypto };
require('./background.js');
const B = window.GSBackground;
B._cfg({ waits: [20, 20, 20], stuck: 100000 });

let ok = 0, fail = 0;
const assert = (name, c, ev) => { if (c) { ok++; console.log('OK   - ' + name); } else { fail++; console.log('FAIL - ' + name, ev === undefined ? '' : JSON.stringify(ev)); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const el = g => { const e = { innerHTML: '', getAttribute: () => g }; els[g] = e; return e; };

(async () => {
  const sent = [], done = [], failed = [];
  let mode = 'ok';
  const active = {}, maxActive = {};
  const err = (st, m) => Object.assign(new Error(m || 'boom'), { status: st });
  B.init({
    send: async e => { sent.push(e); active[e.group] = (active[e.group] || 0) + 1; maxActive[e.group] = Math.max(maxActive[e.group] || 0, active[e.group]);
      try { await wait(5); } finally { active[e.group]--; } if (mode === 'net') throw err(0, 'Failed to fetch'); if (mode === 'bad' && e.kind === 'bad') throw err(400, 'Add a note'); return { ok: true, id: e.id }; },
    onDone: (e, r) => done.push(e.id), onFail: e => failed.push(e.id)
  });

  const pill = el('ORD-1');
  const t0 = Date.now();
  const a = B.run({ group: 'ORD-1', kind: 'update', label: 'Update', path: '/x', body: { v: 1 } });
  assert('run regresa al instante (no espera la respuesta)', Date.now() - t0 < 5 && a.id && a.body.actionKey === a.id, Date.now() - t0);
  assert('la accion se guarda en el navegador antes de mandarse', JSON.parse(store.gs_background_v1).some(x => x.id === a.id));
  assert('aviso "Saving…" en el elemento data-gs-bg', /Saving/.test(pill.innerHTML), pill.innerHTML);
  await wait(30);
  assert('sale sola y se quita de la lista', done.includes(a.id) && !B.list().length && pill.innerHTML === '', B.list());

  // en orden dentro de la misma orden
  sent.length = 0;
  const b1 = B.run({ group: 'ORD-2', kind: 'k1', path: '/1', body: {} });
  const b2 = B.run({ group: 'ORD-2', kind: 'k2', path: '/2', body: {} });
  const c1 = B.run({ group: 'ORD-3', kind: 'k1', path: '/3', body: {} });
  await wait(40);
  assert('de una misma orden nunca salen dos a la vez; otra orden no espera', maxActive['ORD-2'] === 1 && sent[0].path === '/1' && sent[1].path === '/3', { maxActive, p: sent.map(x => x.path) });
  assert('y salen en el orden en que se hicieron', sent.map(x => x.path).filter(p => p !== '/3').join() === '/1,/2', sent.map(x => x.path));

  // sin señal: reintenta y avisa
  mode = 'net'; sent.length = 0;
  const p2 = el('ORD-4');
  const d = B.run({ group: 'ORD-4', kind: 'done', label: 'Done', path: '/d', body: {} });
  await wait(15);
  assert('sin señal: se queda guardada y solo dice "Saving…" (sin explicaciones)', B.list('ORD-4').length === 1 && /Saving/.test(p2.innerHTML) && !/signal/i.test(p2.innerHTML), p2.innerHTML);
  await wait(60);
  assert('se reintenta solo', sent.filter(x => x.id === d.id).length >= 2, sent.length);
  mode = 'ok';
  await wait(60);
  assert('regresa la señal: sale y se quita', done.includes(d.id) && !B.list('ORD-4').length, B.list());
  assert('la misma llave en todos los intentos', sent.filter(x => x.id === d.id).every(x => x.body.actionKey === d.id));

  // error de dato: no se reintenta, se queda como Not saved
  mode = 'bad'; sent.length = 0;
  const p5 = el('ORD-5');
  const e = B.run({ group: 'ORD-5', kind: 'bad', label: 'Unit not ready', path: '/b', body: {} });
  const e2 = B.run({ group: 'ORD-5', kind: 'after', path: '/after', body: {} });
  await wait(60);
  assert('error de dato: "Not saved" con el mensaje y Retry, sin reintentar solo', failed.includes(e.id) && sent.filter(x => x.id === e.id).length === 1 &&
    /Not saved: Unit not ready/.test(p5.innerHTML) && /Add a note/.test(p5.innerHTML) && /Retry/.test(p5.innerHTML), p5.innerHTML);
  assert('lo fallido no detiene lo que sigue de esa orden', done.includes(e2.id), done);
  mode = 'ok';
  B.retry(e.id);
  await wait(30);
  assert('Retry la vuelve a mandar', done.includes(e.id) && !B.list('ORD-5').length);

  // replace: un switch que se prende y apaga sin señal -> vale el ultimo
  mode = 'net'; sent.length = 0;
  const r1 = B.run({ group: 'ORD-6', kind: 'unit-ready', path: '/r', body: { on: true }, replace: true });
  await wait(10);
  const r2 = B.run({ group: 'ORD-6', kind: 'unit-ready', path: '/r', body: { on: false }, replace: true });
  const r3 = B.run({ group: 'ORD-6', kind: 'unit-ready', path: '/r', body: { on: true }, replace: true });
  assert('replace: lo que no ha salido se reemplaza (solo queda el que va en camino y el ultimo)', !B.list('ORD-6').some(x => x.id === r1.id) && B.list('ORD-6').some(x => x.id === r3.id), B.list('ORD-6').map(x => x.body));
  await wait(40);
  assert('el que iba en camino y fallo se tira: ya hay uno mas nuevo', B.list('ORD-6').length === 1 && B.list('ORD-6')[0].id === r3.id, B.list('ORD-6').map(x => x.body));
  mode = 'ok';
  await wait(80);
  assert('...y sale el ultimo valor', done.includes(r3.id) && !done.includes(r1.id) && !done.includes(r2.id));

  // discard
  mode = 'bad';
  const x = B.run({ group: 'ORD-7', kind: 'bad', path: '/b', body: {} });
  await wait(30);
  B.discard(x.id);
  assert('Dismiss la quita', !B.list('ORD-7').length);

  // sobrevive a cerrar la app: otra "pagina" con el mismo localStorage la retoma
  mode = 'net';
  const s = B.run({ group: 'ORD-8', kind: 'done', path: '/s', body: {} });
  await wait(10);
  B._reset(); // la pagina se cerro (sin borrar lo guardado)
  store.gs_background_v1 = JSON.stringify([Object.assign({}, s, { lockUntil: 0, tries: 1 })]);
  const done2 = [];
  B.init({ send: async e => ({ ok: true }), onDone: e => done2.push(e.id) });
  await wait(30);
  assert('al volver a abrir el portal, lo que quedo guardado sale solo', done2.includes(s.id) && !B.list().length, B.list());

  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
