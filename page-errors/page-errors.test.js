/* Prueba de page-errors.js sin navegador: node page-errors/page-errors.test.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, 'page-errors.js'), 'utf8');

let ok = 0, fail = 0;
const assert = (name, c, ev) => { if (c) { ok++; console.log('OK   - ' + name); } else { fail++; console.log('FAIL - ' + name, ev === undefined ? '' : JSON.stringify(ev)); } };

function boot(opts) {
  opts = opts || {};
  const listeners = {}, beacons = [], fetches = [], bars = [];
  const store = opts.store || {};
  const win = {
    addEventListener: (t, f) => { listeners[t] = f; },
    location: { pathname: '/employee.html', hash: '#active' },
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone)',
      sendBeacon: opts.noBeacon ? undefined : (url, blob) => { if (opts.beaconFails) return false; beacons.push({ url, body: blob._t }); return true; }
    },
    Blob: function (parts, o) { this._t = parts.join(''); this.type = o && o.type; },
    fetch: (url, init) => { if (opts.fetchThrows) throw new Error('no fetch'); fetches.push({ url, init }); return Promise.resolve({}); },
    localStorage: opts.noStorage ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
      : { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { createElement: () => ({ style: {}, remove() {} }), body: { appendChild: el => bars.push(el) } }
  };
  win.window = win;
  vm.runInContext(SRC, vm.createContext(Object.assign(win, { JSON, Date, Object, String, Number, Math, Array, Promise, console })));
  const fire = (msg, file, line, col, stack) => listeners.error({ message: msg, filename: file, lineno: line, colno: col, error: stack ? { stack } : null });
  const reject = reason => listeners.unhandledrejection({ reason });
  const sent = () => beacons.map(b => Object.assign({ via: 'beacon', url: b.url }, JSON.parse(b.body)))
    .concat(fetches.map(f => Object.assign({ via: 'fetch', url: f.url, init: f.init }, JSON.parse(f.init.body))));
  return { win, G: win.GSPageErrors, fire, reject, sent, beacons, fetches, bars, store };
}
const CFG = { endpoint: 'https://admin.gsocd.com/api/client-error', portal: 'Tech', who: () => 'Ana Lopez (T-12)' };

(async () => {
  /* 1) Antes de init no manda nada; al init manda lo que se guardo */
  let b = boot();
  b.fire('x is not defined', 'https://tech.gsocd.com/employee.html', 900, 12, 'ReferenceError: x is not defined\n at y');
  assert('sin init: no manda nada (inofensiva)', b.sent().length === 0, b.sent());
  b.G.init(CFG);
  let s = b.sent();
  assert('al init manda lo de antes, por sendBeacon al endpoint', s.length === 1 && s[0].via === 'beacon' && s[0].url === CFG.endpoint, s);
  assert('lleva portal, quien, pantalla, archivo:linea:col, stack y el telefono', s[0].portal === 'Tech' && s[0].who === 'Ana Lopez (T-12)' &&
    s[0].screen === '/employee.html#active' && s[0].file === 'https://tech.gsocd.com/employee.html' && s[0].line === 900 && s[0].col === 12 &&
    /ReferenceError/.test(s[0].stack) && /iPhone/.test(s[0].ua) && s[0].kind === 'error', s[0]);
  assert('el usuario no ve nada (sin barra por default)', b.bars.length === 0, b.bars.length);

  /* 2) El mismo error 50 veces: uno solo */
  for (let i = 0; i < 50; i++) b.fire('x is not defined', 'https://tech.gsocd.com/employee.html', 900, 12);
  assert('el mismo error repetido: se manda una sola vez', b.sent().length === 1, b.sent().length);
  /* numeros distintos en el mensaje = mismo error */
  b.fire('Cannot read properties of undefined (reading 3)', 'a.js', 1, 1);
  b.fire('Cannot read properties of undefined (reading 4)', 'a.js', 1, 1);
  assert('mismo mensaje con otro numero cuenta como el mismo', b.sent().length === 2, b.sent().length);

  /* 3) Promesas sin catch; AbortError no */
  b.reject(new Error('Upload failed (500)'));
  b.reject(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }));
  s = b.sent();
  assert('promesa sin catch: al log como "promise"; un fetch cancelado no', s.length === 3 && s[2].kind === 'promise' && /Unhandled promise: Upload failed/.test(s[2].message), s.map(x => x.message));

  /* 4) report() de la pagina (cola de fotos, camara) */
  b.G.report('queue', 'Photo upload gave up: Order not found.');
  b.G.report('video', new Error('Video upload failed (413)'));
  s = b.sent();
  assert('report(): errores que la pagina ya atrapo, con su tipo', s.length === 5 && s[3].kind === 'queue' && s[4].kind === 'video' && s[4].message === 'Video upload failed (413)', s.slice(3));

  /* 5) "Script error." sin archivo y ResizeObserver: no gastan */
  b.fire('Script error.', '', 0, 0);
  b.fire('ResizeObserver loop limit exceeded', 'x.js', 1, 1);
  assert('"Script error." y ResizeObserver no se mandan', b.sent().length === 5, b.sent().length);

  /* 6) Tope por pagina: 20 distintos */
  b = boot(); b.G.init(CFG);
  for (let i = 0; i < 40; i++) b.fire('err ' + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN'[i], 'f.js', 1, 1);
  assert('tope de 20 errores distintos por carga de pagina', b.sent().length === 20, b.sent().length);

  /* 7) Otra carga de la pagina (mismo telefono): el mismo error no se repite en 6 h; el tope por hora */
  const store = {};
  b = boot({ store }); b.G.init(CFG); b.fire('boom', 'f.js', 1, 1);
  b = boot({ store }); b.G.init(CFG); b.fire('boom', 'f.js', 1, 1);
  assert('recargar la pagina: el mismo error no se vuelve a mandar (6 h)', b.sent().length === 0, b.sent());
  const saved = JSON.parse(store.gs_page_errors_sent);
  Object.keys(saved.keys).forEach(k => { saved.keys[k] -= 7 * 36e5; });
  saved.hour = [];
  store.gs_page_errors_sent = JSON.stringify(saved);
  b = boot({ store }); b.G.init(CFG); b.fire('boom', 'f.js', 1, 1);
  assert('pasadas 6 h: el mismo error se manda otra vez', b.sent().length === 1, b.sent().length);
  const st2 = {};
  for (let pg = 0; pg < 3; pg++) { b = boot({ store: st2 }); b.G.init(Object.assign({}, CFG, { maxPerHour: 20 })); for (let i = 0; i < 10; i++) b.fire('e' + 'xyz'[pg] + '-' + 'abcdefghij'[i], 'f.js', 1, 1); }
  assert('tope por telefono: 20 por hora entre varias cargas', JSON.parse(st2.gs_page_errors_sent).hour.length === 20, JSON.parse(st2.gs_page_errors_sent).hour.length);

  /* 8) Sin sendBeacon (o lo rechaza): fetch no-cors, texto plano, keepalive, sin cookies */
  b = boot({ noBeacon: true }); b.G.init(CFG); b.fire('boom', 'f.js', 1, 1);
  s = b.sent();
  assert('sin sendBeacon: fetch no-cors con texto plano y keepalive', s.length === 1 && s[0].via === 'fetch' && s[0].init.mode === 'no-cors' &&
    s[0].init.headers['Content-Type'] === 'text/plain' && s[0].init.keepalive === true && s[0].init.credentials === 'omit', s[0] && s[0].init);
  b = boot({ beaconFails: true }); b.G.init(CFG); b.fire('boom', 'f.js', 1, 1);
  assert('sendBeacon dice que no: va por fetch', b.sent().length === 1 && b.sent()[0].via === 'fetch', b.sent());

  /* 9) Nada truena: sin almacenamiento, sin fetch, who que truena, sin endpoint */
  let threw = false;
  try {
    b = boot({ noStorage: true, noBeacon: true, fetchThrows: true });
    b.G.init(Object.assign({}, CFG, { who: () => { throw new Error('x'); } }));
    b.fire('boom', 'f.js', 1, 1); b.fire('boom', 'f.js', 1, 1); b.G.report('queue', null);
  } catch (e) { threw = e; }
  assert('sin almacenamiento, sin red y who que truena: no truena', !threw, threw && threw.message);
  b = boot({ noStorage: true }); b.G.init(CFG); b.fire('boom', 'f.js', 1, 1); b.fire('boom', 'f.js', 1, 1);
  assert('sin almacenamiento: igual uno por pagina', b.sent().length === 1, b.sent().length);
  b = boot(); b.G.init({ portal: 'Tech' }); b.fire('boom', 'f.js', 1, 1);
  assert('sin endpoint: no manda nada', b.sent().length === 0, b.sent());

  /* 10) bar: true (solo pruebas) pinta la barra roja de Admin */
  b = boot(); b.G.init(Object.assign({}, CFG, { bar: true })); b.fire('boom', 'f.js', 1, 1); b.reject(new Error('p'));
  assert('bar:true: barra solo para errores (no para promesas)', b.bars.length === 1 && /JS error: boom/.test(b.bars[0].textContent), b.bars.length);

  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
