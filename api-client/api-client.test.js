/* Prueba de api-client.js sin navegador: node api-client/api-client.test.js
   Llaves de sin señal iguales a las de antes (Orders y Tech), sin red con y sin lo guardado, 401 de sesion,
   errores con .status/.field/.debug, signal, y opts.load por GSLoad (load/ de verdad). */
'use strict';
let ok = 0, fail = 0;
const assert = (name, c, ev) => { if (c) { ok++; console.log('OK   - ' + name); } else { fail++; console.log('FAIL - ' + name, ev === undefined ? '' : JSON.stringify(ev)); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

const ls = {}; ['getItem', 'setItem', 'removeItem'].forEach((m, i) => Object.defineProperty(ls, m, { enumerable: false, value: [k => (Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null), (k, v) => { ls[k] = String(v); }, k => { delete ls[k]; }][i] }));
const savedStore = {}, bar = [];
global.document = { visibilityState: 'visible', addEventListener() {} };
global.window = {
  addEventListener() {},
  location: { pathname: '/customer.html', replace(u) { this.replaced = u; } },
  localStorage: ls,
  GSSaved: {
    save: async (k, d) => { savedStore[k] = { data: d, at: Date.now() }; return true; },
    read: async k => savedStore[k] || null,
    clear: async p => { Object.keys(savedStore).filter(k => k.startsWith(p)).forEach(k => delete savedStore[k]); },
    bar: { show: m => bar.push(m), hide: () => bar.push('hide') }
  }
};
let net = 'ok', reply = { status: 200, body: { ok: 1 } };
const calls = [];
window.fetch = async (url, init) => {
  calls.push({ url, init });
  if (net === 'down') throw new TypeError('Failed to fetch');
  return { status: reply.status, ok: reply.status >= 200 && reply.status < 300, json: async () => { if (reply.body === 'nojson') throw new Error('x'); return reply.body; } };
};
require('../load/load.js');
window.GSLoad._cfg({ waits: [10, 10, 10], stuck: 1000 });
window.GSLoad.init({});
require('./api-client.js');

const session = { cleared: 0, get: () => ({ clientId: 'GS-1042', isMaster: true }), clear() { this.cleared++; } };
const orders = window.GSApiClient.create({
  session, reads: ['/get-orders', '/get-services'],
  headers: () => ({ 'X-GS-Property': 'GS-1042-B' }),
  scope: h => 'GS-1042:' + (h['X-GS-Property'] || '') + ':',
  offlineMessage: when => 'Offline orders ' + when
});
const tech = window.GSApiClient.create({ session, reads: ['/get-my-orders'], offlineMessage: when => 'Offline tech ' + when });

(async () => {
  /* las llaves son las mismas de antes: lo que ya esta guardado en los telefonos se sigue leyendo */
  assert('llave de Orders igual a la de antes', orders.offline.key('/get-orders', { a: 1 }, { 'X-GS-Property': 'GS-1042-B' }) === 'gs_off:GS-1042:GS-1042-B:/get-orders:{"a":1}');
  assert('llave de Tech igual a la de antes', tech.offline.key('/get-my-orders', { techId: 'T1' }) === 'gs_off:/get-my-orders:{"techId":"T1"}');

  let r = await orders.api('/get-orders', { body: { a: 1 } });
  const c0 = calls[calls.length - 1];
  assert('POST a /api con JSON y headers del portal', c0.url === '/api/get-orders' && c0.init.method === 'POST' && c0.init.headers['X-GS-Property'] === 'GS-1042-B' && c0.init.body === '{"a":1}', c0);
  await wait(5);
  assert('lectura de READS se guarda en el telefono', savedStore['gs_off:GS-1042:GS-1042-B:/get-orders:{"a":1}'] && savedStore['gs_off:GS-1042:GS-1042-B:/get-orders:{"a":1}'].data.ok === 1);

  /* sin red: lo guardado, con la barra */
  net = 'down';
  r = await orders.api('/get-orders', { body: { a: 1 } });
  assert('sin red: regresa lo guardado con __offline', r.ok === 1 && r.__offline === true && !!r.__savedAt, r);
  assert('sin red: barra con el texto del portal', /^Offline orders /.test(bar[bar.length - 1]), bar);
  let threw = null;
  try { await orders.api('/save-order', { body: {} }); } catch (e) { threw = e; }
  assert('sin red y no es lectura guardada: truena sin status (se reintenta)', threw && !threw.status, threw && threw.message);
  /* lo de antes del 17/10 en localStorage */
  ls['gs_off:/get-my-orders:{"techId":"T9"}'] = JSON.stringify({ data: { orders: [1] }, at: Date.now() - 1000 });
  r = await tech.api('/get-my-orders', { body: { techId: 'T9' } });
  assert('sin red: lee lo viejo de localStorage', r.orders && r.orders[0] === 1 && r.__offline, r);
  /* cancelado a proposito: no regresa lo guardado */
  threw = null;
  try { await orders.api('/get-orders', { body: { a: 1 }, signal: { aborted: true } }); } catch (e) { threw = e; }
  assert('cancelado (signal): no regresa lo guardado', !!threw);
  net = 'ok';

  /* errores */
  reply = { status: 400, body: { error: 'Missing unit', field: 'unit' } };
  threw = null; try { await orders.api('/save-order', { body: {} }); } catch (e) { threw = e; }
  assert('400: mensaje, .status y .field', threw && threw.message === 'Missing unit' && threw.status === 400 && threw.field === 'unit', threw);
  reply = { status: 500, body: { error: 'boom', debug: 'stack' } };
  threw = null; try { await tech.api('/x', {}); } catch (e) { threw = e; }
  assert('500: .status y .debug', threw && threw.status === 500 && threw.debug === 'stack');
  reply = { status: 502, body: 'nojson' };
  threw = null; try { await tech.api('/x', {}); } catch (e) { threw = e; }
  assert('respuesta que no es JSON: no truena raro', threw && threw.message === 'Request failed (502)' && threw.status === 502);
  reply = { status: 500, body: { error: 'x' } };
  const before = JSON.stringify(savedStore);
  try { await tech.api('/get-my-orders', { body: { techId: 'T2' } }); } catch (e) {}
  assert('un error NO se guarda como lo ultimo que se vio', JSON.stringify(savedStore) === before);

  /* 401 de sesion: borra y regresa al login (una vez, sin loop: index.html no se redirige) */
  reply = { status: 401, body: { error: 'Please sign in again.', signin: true } };
  threw = null; try { await orders.api('/get-orders', { body: { a: 2 } }); } catch (e) { threw = e; }
  assert('401 signin: borra la sesion y va a index.html', session.cleared === 1 && window.location.replaced === 'index.html' && threw.status === 401, { c: session.cleared, r: window.location.replaced });
  window.location.pathname = '/index.html'; window.location.replaced = null;
  try { await orders.api('/x', {}); } catch (e) {}
  assert('401 en index.html: no rebota', window.location.replaced === null);
  window.location.pathname = '/customer.html';
  reply = { status: 401, body: { error: 'nope' } };
  const cl = session.cleared;
  try { await orders.api('/x', {}); } catch (e) {}
  assert('401 sin signin (permiso): no borra la sesion', session.cleared === cl);

  /* opts.load: pasa por GSLoad (Loading… y reintento solo) */
  let n = 0;
  window.fetch = async () => { n++; if (n < 3) throw new TypeError('Failed to fetch'); return { status: 200, ok: true, json: async () => ({ list: [n] }) }; };
  r = await tech.api('/get-catalog', { body: {}, load: 'Catalog' });
  assert('opts.load: con fallas de red se reintenta solo y llega', r.list[0] === 3 && n === 3, { r, n });
  n = 0;
  window.fetch = async () => { n++; return { status: 404, ok: false, json: async () => ({ error: 'Not found' }) }; };
  threw = null; try { await tech.api('/get-x', { body: {}, load: 'X' }); } catch (e) { threw = e; }
  assert('opts.load: un error de dato (404) llega al catch', threw && threw.status === 404 && n === 1);

  /* clear borra lo guardado de los dos lados */
  ls['gs_off:zzz'] = '1'; ls.other = '1';
  orders.offline.clear(); await wait(5);
  assert('clear: borra gs_off: y deja lo demas', !('gs_off:zzz' in ls) && ls.other === '1' && !Object.keys(savedStore).some(k => k.startsWith('gs_off:')), { ls, s: Object.keys(savedStore) });

  console.log(`\n${ok} OK, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
