'use strict';
/* node live-refresh/live-refresh.test.js -- necesita jsdom: npm i --no-save jsdom */
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('SKIP: npm i --no-save jsdom'); process.exit(0); }
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, 'live-refresh.js'), 'utf8');

let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 400) : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

function page() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><input id="t" type="text"><button id="b">B</button></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.eval(SRC);
  return dom.window;
}
function watcher(w, opts) {
  const calls = { n: 0 };
  const h = w.GSLiveRefresh.watch(Object.assign({
    intervalMs: 50,
    idleMs: 200,
    checkFn: () => { calls.n++; return calls.n; },
    hasChanged: () => false,
    onChange: () => {}
  }, opts || {}));
  return { h, calls };
}
const overlays = w => w.document.querySelectorAll('.gs-live-refresh-idle');
const dimmed = w => { const o = overlays(w)[0]; return !!o && o.classList.contains('gs-live-refresh-idle-on'); };
const move = w => w.document.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true }));

(async () => {
  {
    const w = page();
    const { h, calls } = watcher(w);
    await wait(150);
    check('activo: checkFn se llama en cada intervalo', calls.n >= 3, calls.n);
    check('activo: sin capa antes del idle', overlays(w).length === 0);
    await wait(150);
    check('idle: sale la capa despues de idleMs', dimmed(w));
    const css = w.document.getElementById('gs-live-refresh-idle-css');
    check('idle: CSS inyectado una vez', !!css && w.document.querySelectorAll('#gs-live-refresh-idle-css').length === 1);
    const cs = w.getComputedStyle(overlays(w)[0]);
    check('idle: capa con pointer-events none', cs.pointerEvents === 'none', cs.pointerEvents);
    check('idle: capa fija, negra, opacidad .28', cs.position === 'fixed' && /^(#000|rgb\(0, 0, 0\)|black)/.test(cs.backgroundColor || cs.background) && /\.28/.test(css.textContent), { pos: cs.position, bg: cs.backgroundColor });
    check('idle: capa con z-index muy alto', Number(cs.zIndex) >= 2147483000, cs.zIndex);
    check('idle: capa dentro de body', overlays(w)[0].parentNode === w.document.body);
    check('idle: capa sin texto ni hijos', overlays(w)[0].childNodes.length === 0);
    const atIdle = calls.n;
    await wait(250);
    check('idle: checkFn NO se llama mientras esta idle', calls.n === atIdle, { atIdle, now: calls.n });
    let clicked = false;
    w.document.getElementById('b').addEventListener('click', () => { clicked = true; });
    w.document.getElementById('b').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('idle: el clic llega al boton de abajo', clicked);
    move(w);
    check('despierta: un mousemove quita la capa', !dimmed(w));
    check('despierta: revisa al momento', calls.n === atIdle + 1, { atIdle, now: calls.n });
    await wait(120);
    check('despierta: sigue con su intervalo normal', calls.n >= atIdle + 3, { atIdle, now: calls.n });
    move(w);
    const before = calls.n;
    move(w);
    check('activo: moverse sin estar idle no dispara revision extra', calls.n === before);
    h.stop();
    check('stop del ultimo watcher: quita la capa', overlays(w).length === 0);
    const afterStop = calls.n;
    await wait(300);
    check('stop: ya no revisa', calls.n === afterStop);
    check('stop: no vuelve a salir la capa', overlays(w).length === 0);
    move(w);
    check('stop: listeners quitados (mousemove no revisa)', calls.n === afterStop);
  }

  {
    const w = page();
    const a = watcher(w);
    const b = watcher(w, { idleMs: 300 });
    await wait(400);
    check('2 watchers: una sola capa', overlays(w).length === 1 && dimmed(w), overlays(w).length);
    const na = a.calls.n, nb = b.calls.n;
    await wait(150);
    check('2 watchers: ninguno revisa idle', a.calls.n === na && b.calls.n === nb);
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    check('2 watchers: keydown despierta a los 2', a.calls.n === na + 1 && b.calls.n === nb + 1 && !dimmed(w));
    check('2 watchers: sigue una sola capa', overlays(w).length === 1);
    a.h.stop();
    check('2 watchers: stop de uno deja la capa del otro', overlays(w).length === 1);
    b.h.stop();
    check('2 watchers: stop del ultimo quita la capa', overlays(w).length === 0);
  }

  {
    const w = page();
    const z = watcher(w, { idleMs: 0 });
    const f = watcher(w, { idle: false });
    await wait(400);
    check('idleMs:0 / idle:false: nunca oscurece', overlays(w).length === 0);
    check('idleMs:0 / idle:false: sigue revisando', z.calls.n >= 6 && f.calls.n >= 6, [z.calls.n, f.calls.n]);
    z.h.stop(); f.h.stop();
  }

  {
    const w = page();
    const off = watcher(w, { idleMs: 0 });
    const on = watcher(w);
    await wait(300);
    const nOff = off.calls.n;
    check('mixto: sale la capa (hay uno con idle)', dimmed(w));
    await wait(100);
    check('mixto: el de idleMs:0 sigue revisando con la capa puesta', off.calls.n > nOff, [nOff, off.calls.n]);
    on.h.stop();
    check('mixto: stop del unico con idle quita la capa', overlays(w).length === 0);
    off.h.stop();
  }

  {
    const w = page();
    const { h, calls } = watcher(w);
    await wait(300);
    check('escribiendo: idle antes de enfocar', dimmed(w));
    const n = calls.n;
    w.document.getElementById('t').focus();
    w.document.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
    check('escribiendo: la capa se quita', !dimmed(w));
    check('escribiendo: NO revisa al despertar (regla de siempre)', calls.n === n, [n, calls.n]);
    await wait(150);
    check('escribiendo: tampoco en el intervalo', calls.n === n, [n, calls.n]);
    w.document.getElementById('t').blur();
    await wait(80);
    check('escribiendo: al salir del campo vuelve a revisar', calls.n > n, [n, calls.n]);
    h.stop();
  }

  {
    const w = page();
    let vis = 'visible';
    Object.defineProperty(w.document, 'visibilityState', { configurable: true, get: () => vis });
    const { h, calls } = watcher(w);
    await wait(300);
    vis = 'hidden';
    const n = calls.n;
    w.document.dispatchEvent(new w.Event('scroll'));
    check('pestana oculta: la capa se quita con actividad', !dimmed(w));
    check('pestana oculta: NO revisa al despertar', calls.n === n, [n, calls.n]);
    await wait(150);
    check('pestana oculta: tampoco en el intervalo', calls.n === n, [n, calls.n]);
    vis = 'visible';
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    check('pestana visible otra vez: revisa', calls.n === n + 1, [n, calls.n]);
    h.stop();
  }

  {
    const w = page();
    const { h, calls } = watcher(w);
    await wait(300);
    const n = calls.n;
    w.document.dispatchEvent(new w.Event('touchstart'));
    check('touchstart despierta y revisa', !dimmed(w) && calls.n === n + 1);
    await wait(300);
    const m = calls.n;
    w.document.dispatchEvent(new w.WheelEvent('wheel', { bubbles: true }));
    check('wheel despierta y revisa', !dimmed(w) && calls.n === m + 1);
    await wait(0);
    const k = calls.n;
    h.checkNow();
    check('checkNow sigue igual cuando hay actividad', calls.n === k + 1, [k, calls.n]);
    h.stop();
  }

  console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
  process.exitCode = bad ? 1 : 0;
})();
