/* Prueba del aviso "Reconnecting…" y la cola del telefono (reconnecting.js). Correr: npm i --no-save jsdom && node reconnecting/reconnecting.test.js */
'use strict';
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('SKIP: npm i --no-save jsdom'); process.exit(0); }
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, 'reconnecting.js'), 'utf8');
let ok = 0, fail = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   - ' + n); } else { fail++; console.log('FAIL - ' + n, x === undefined ? '' : JSON.stringify(x)); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

function page(server, opts) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><header>GS</header></body></html>', { url: 'https://admin.gsocd.com/admin.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.Response = Response;
  const calls = [];
  w.fetch = async (url, init) => { calls.push({ url: String(url), init: init || {} }); return server(String(url), init || {}); };
  if (opts && opts.token) w.GSAdminAuth = { token: async () => opts.token };
  if (opts && opts.seed) w.localStorage.setItem('gs_reconnect_queue_v1', JSON.stringify(opts.seed));
  w.eval(SRC);
  w.GSReconnecting._cfg({ waits: [20, 20, 20], lockMs: 50 });
  return { w, calls, pill: () => w.document.getElementById('gs-reconnecting') };
}
const res = (status, data, body) => new Response(JSON.stringify(body || { ok: status < 300 }), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'X-GS-Data': data } : {}) });

(async () => {
  /* switch apagado: sin header nada cambia */
  let p = page(() => res(200));
  const r0 = await p.w.fetch('/api/admin-get-orders', { method: 'POST', body: '{}' });
  check('no X-GS-Data (switch off): the answer passes untouched, no warning', r0.status === 200 && !p.pill() && p.w.GSReconnecting.queue().length === 0);

  /* Neon caido: aviso; vuelve: se quita solo */
  let mode = 'sharepoint';
  p = page(() => res(200, mode));
  await p.w.fetch('/api/admin-get-orders', { method: 'POST', body: '{}' });
  check('answer from SharePoint: the small "Reconnecting…" shows', p.pill() && p.pill().className === 'on' && /Reconnecting…/.test(p.pill().textContent) && p.pill().getAttribute('role') === 'status');
  const css = p.w.document.getElementById('gs-reconnecting-css').textContent;
  check('discreet: fixed at the top, does not take clicks, only one short line', /position:fixed/.test(css) && /pointer-events:none/.test(css) && /white-space:nowrap/.test(css) && /font:600 12px/.test(css) && p.pill().textContent.trim() === 'Reconnecting…');
  await p.w.fetch('https://cdn.jsdelivr.net/x.js');
  check('other sites (CDN) do not move it', p.pill().className === 'on');
  mode = 'sql';
  await p.w.fetch('/api/admin-get-orders', { method: 'POST', body: '{}' });
  check('answer from SQL again: the warning goes away by itself', p.pill().className === '' && p.pill().style.display === 'none');

  /* los dos caidos: el guardado se queda en el telefono y sale cuando alguno vuelva */
  let state = 'down';
  const got = [];
  p = page((url, init) => {
    if (state === 'down') return new Response(JSON.stringify({ error: 'The database and Microsoft did not answer', code: 'bothDown' }), { status: 503, headers: { 'X-GS-Data': 'down', 'X-GS-Replay': init.method && init.method !== 'GET' ? '1' : '' } });
    got.push({ url, body: init.body, auth: init.headers && init.headers.Authorization, replayed: init.headers && init.headers['X-GS-Replayed'] });
    return res(200, state);
  }, { token: 'tok-NEW' });
  const s1 = await p.w.fetch('/api/admin-update-order', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-OLD' }, body: JSON.stringify({ orderId: 'GS-1', status: 'Scheduled' }) });
  const s2 = await p.w.fetch('/api/admin-update-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: 'GS-1', status: 'Completed' }) });
  const j1 = await s1.json();
  check('both down: the screen gets "saved" (202, queued) and the warning shows', s1.status === 202 && j1.ok && j1.queued && s2.status === 202 && p.pill().className === 'on', j1);
  const q = p.w.GSReconnecting.queue();
  check('kept on the device in order, without the old token', q.length === 2 && JSON.parse(q[0].body).status === 'Scheduled' && JSON.parse(q[1].body).status === 'Completed' && !q[0].headers.Authorization && q[0].headers['Content-Type'] === 'application/json', q);
  const rd = await p.w.fetch('/api/admin-get-orders', { method: 'GET' });
  check('a read with both down is not queued (the screen keeps what it had)', rd.status === 503 && p.w.GSReconnecting.queue().length === 2);
  await wait(80);
  check('while both are down it waits (nothing sent, still there)', got.length === 0 && p.w.GSReconnecting.queue().length === 2);
  state = 'sharepoint';
  await p.w.GSReconnecting.flush();
  check('when one is back: sent in the order they were made, with a fresh token and the time they were made', got.length === 2 && JSON.parse(got[0].body).status === 'Scheduled' && JSON.parse(got[1].body).status === 'Completed' &&
    got[0].auth === 'Bearer tok-NEW' && /Z$/.test(got[0].replayed) && p.w.GSReconnecting.queue().length === 0, got);
  check('still from SharePoint: the warning stays', p.pill().className === 'on');
  state = 'sql';
  await p.w.fetch('/api/admin-get-orders', { method: 'POST', body: '{}' });
  check('SQL back and nothing waiting: the warning goes away', p.pill().className === '');

  /* lo que el servidor no acepta despues: no se pierde en silencio */
  p = page(() => res(400, 'sql', { error: 'Add a note' }), { seed: [{ id: 'a', url: '/api/x', method: 'POST', headers: {}, body: '{}', at: Date.now() - 1000 }] });
  check('page opened with something waiting: the warning shows at once', p.pill() && p.pill().className === 'on');
  await p.w.GSReconnecting.flush();
  check('an answer that is not a system error: out of the queue, kept in the failed list (the server sends the error alert)', p.w.GSReconnecting.queue().length === 0 && p.w.GSReconnecting.failed().length === 1 && p.w.GSReconnecting.failed()[0].status === 400);

  /* algo que truena a la mitad (sin red) y doble clic: se reintenta, sin duplicar */
  let net = true; const sent = [];
  p = page((url, init) => { if (init.headers && init.headers['X-GS-Replayed']) { if (net) throw new TypeError('Failed to fetch'); sent.push(init.body); return res(200, 'sql'); } return new Response('{}', { status: 503, headers: { 'X-GS-Data': 'down', 'X-GS-Replay': '1' } }); });
  await Promise.all([p.w.fetch('/api/save', { method: 'POST', body: '{"a":1}' }), p.w.fetch('/api/save', { method: 'POST', body: '{"a":1}' })]);
  await Promise.all([p.w.GSReconnecting.flush(), p.w.GSReconnecting.flush()]);
  check('no network while sending: stays in the queue', sent.length === 0 && p.w.GSReconnecting.queue().length === 2);
  net = false;
  await wait(120);
  await p.w.GSReconnecting.flush();
  check('double click = two saves, each sent once (the server dedupes by its action key, as always)', sent.length === 2 && p.w.GSReconnecting.queue().length === 0, sent);
  /* FormData (fotos): no se guarda en el telefono aqui (la camara tiene su propia cola) */
  p = page(() => new Response('{}', { status: 503, headers: { 'X-GS-Data': 'down', 'X-GS-Replay': '1' } }));
  const fd = await p.w.fetch('/api/upload', { method: 'POST', body: new p.w.FormData() });
  check('a file upload is not queued here (the camera queue keeps photos)', fd.status === 503 && p.w.GSReconnecting.queue().length === 0);

  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
