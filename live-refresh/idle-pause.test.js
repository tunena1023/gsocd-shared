'use strict';
/* node live-refresh/idle-pause.test.js -- necesita jsdom. Las piezas con reloj propio respetan la pantalla en negro de
   live-refresh (CFO 12/11/2026: "si esta en negro, NADA pregunta"): app-update y GSGalleryGroups.watch.
   Caminos: activo pregunta; en negro no pregunta ni recarga; al despertar una sola vez; doble despertar; sin
   live-refresh en la pagina, como antes. */
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('SKIP: npm i --no-save jsdom'); process.exit(0); }
const fs = require('fs');
const path = require('path');
const LR = fs.readFileSync(path.join(__dirname, 'live-refresh.js'), 'utf8');
const AU = fs.readFileSync(path.join(__dirname, '..', 'app-update', 'app-update.js'), 'utf8');
const GG = fs.readFileSync(path.join(__dirname, '..', 'gallery-groups', 'gallery-groups.js'), 'utf8');

let ok = 0, bad = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { bad++; console.log('FAIL - ' + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 400) : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const move = w => w.document.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true }));
const dimmed = w => { const o = w.document.querySelector('.gs-live-refresh-idle'); return !!o && o.classList.contains('gs-live-refresh-idle-on'); };

function page(withLR) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><input id="t" type="text"></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://admin.example/admin.html' });
  const w = dom.window;
  w.__fetches = 0; w.__version = 'v1';
  w.fetch = () => { w.__fetches++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: w.__version }) }); };
  if (withLR) {
    w.eval(LR);
    /* Para la prueba: 10 min = 200 ms (lo demas del reloj, igual). */
    const every = w.GSLiveRefresh.every;
    w.GSLiveRefresh.every = (ms, fn, opts) => every(ms, fn, Object.assign({ idleMs: 200 }, opts || {}));
  }
  return w;
}

(async () => {
  {
    const w = page(true);
    w.eval(AU);
    let reloads = 0;
    w.GSAppUpdate.init({ intervalMs: 40, beforeReload: () => { reloads++; throw new Error('stop'); } });
    await wait(120);
    check('app-update activo: pregunta la version en cada intervalo', w.__fetches >= 2, w.__fetches);
    await wait(200);
    check('app-update sin otro reloj en la pagina: a los 10 min (aqui 200 ms) la pantalla se pone en negro', dimmed(w));
    const f0 = w.__fetches;
    w.__version = 'v2';
    await wait(200);
    check('app-update en negro: NO pregunta', w.__fetches === f0, { f0, now: w.__fetches });
    check('app-update en negro: no recarga', reloads === 0);
    move(w); move(w);
    await wait(10);
    check('app-update al despertar: una sola pregunta (aunque se mueva dos veces)', w.__fetches === f0 + 1, { f0, now: w.__fetches });
  }

  {
    const w = page(false);
    w.eval(AU);
    w.GSAppUpdate.init({ intervalMs: 40 });
    await wait(300);
    check('app-update sin live-refresh en la pagina: como antes (pregunta siempre, sin capa)', w.__fetches >= 5 && !w.document.querySelector('.gs-live-refresh-idle'), w.__fetches);
  }

  {
    const w = page(true);
    w.eval(GG);
    let checks = 0, changes = 0;
    const gw = w.GSGalleryGroups.watch({ everyMs: 40, check: () => { checks++; return 'm' + checks; }, onChange: () => { changes++; } });
    await wait(150);
    check('galeria activa: pregunta la marca de fotos', checks >= 2, checks);
    await wait(200);
    const c0 = checks;
    await wait(200);
    check('galeria en negro: NO pregunta', dimmed(w) && checks === c0, { c0, checks });
    move(w); move(w); move(w);
    await wait(10);
    check('galeria al despertar: una sola revision', checks === c0 + 1, { c0, checks });
    gw.stop();
    const c1 = checks;
    await wait(150);
    check('galeria stop: ya no pregunta', checks === c1);
  }

  console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
