/* Prueba de admin-auth.js sin navegador: node admin-auth/admin-auth.test.js
   MSAL y fetch falsos: token vigente, token vencido (se renueva), 401 una vez (token nuevo y reintento),
   401 doble (UNA vuelta al login), 401 doble otra vez (aviso, sin rebotar), sin cuenta, MSAL que falla. */
'use strict';
let ok = 0, fail = 0;
const assert = (name, c, ev) => { if (c) { ok++; console.log('OK   - ' + name); } else { fail++; console.log('FAIL - ' + name, ev === undefined ? '' : JSON.stringify(ev)); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

const store = {};
const toasts = [], unauth = [];
const M = { accounts: [{ username: 'dana@gsocd.com' }], calls: [], n: 0, exp: () => Math.floor(Date.now() / 1000) + 3600, throwNext: false };
global.window = {
  location: { origin: 'https://test-admin.gsocd.com', href: 'admin.html' },
  sessionStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  showToast: m => toasts.push(m),
  msal: { PublicClientApplication: function (conf) {
    this.conf = conf;
    this.initialize = async () => {};
    this.getAllAccounts = () => M.accounts;
    this.acquireTokenSilent = async (req) => {
      M.calls.push(req);
      if (M.throwNext) { M.throwNext = false; throw new Error('interaction_required'); }
      M.n++;
      return { idToken: 'tok' + M.n, idTokenClaims: { exp: M.exp() } };
    };
  } }
};
const server = { good: new Set(), seen: [] };
window.fetch = async (url, init) => {
  const auth = (init.headers || {}).Authorization || '';
  server.seen.push(auth); server.lastCT = (init.headers || {})['Content-Type'];
  const t = auth.replace('Bearer ', '');
  return { status: server.good.has(t) ? 200 : 401, ok: server.good.has(t), url };
};
require('./admin-auth.js');
const A = window.GSAdminAuth;
A.configure({ onUnauthorized: i => unauth.push(i) });

(async () => {
  assert('usa el mismo login de Microsoft de Admin', A.msal().conf.auth.clientId === '18dfcf2e-0059-40f5-831c-69d13b9091fc' && A.msal().conf.auth.redirectUri === 'https://test-admin.gsocd.com/index.html');
  let t = await A.token();
  assert('primer token', t === 'tok1' && store.admin_token === 'tok1', { t, store });
  t = await A.token();
  assert('token vigente: no se vuelve a pedir', t === 'tok1' && M.calls.length === 1);
  assert('query() para links', A.query() === 't=tok1');

  /* token por vencer (menos de 2 min): se renueva forzado */
  A._reset(); M.exp = () => Math.floor(Date.now() / 1000) + 60;
  await A.token(); M.exp = () => Math.floor(Date.now() / 1000) + 3600;
  t = await A.token();
  assert('token vencido: se renueva con forceRefresh', t === 'tok3' && M.calls[M.calls.length - 1].forceRefresh === true, M.calls[M.calls.length - 1]);

  /* 401 una vez: token nuevo y reintento, sin aviso */
  server.good = new Set(['tok4']);
  let r = await A.fetch('/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  assert('401 una vez: pide token nuevo y reintenta', r.status === 200 && server.seen.slice(-2).join() === 'Bearer tok3,Bearer tok4', server.seen.slice(-2));
  assert('401 una vez: sin aviso ni rebote', toasts.length === 0 && window.location.href === 'admin.html' && unauth.length === 0);
  assert('conserva los headers de la pagina', server.lastCT === 'application/json');

  /* 401 doble: UNA vuelta al login */
  server.good = new Set();
  r = await A.fetch('/api/x', {});
  assert('401 doble: regresa la respuesta 401 a la pagina', r.status === 401);
  assert('401 doble: marca gs_auth_bounced y avisa', store.gs_auth_bounced === '1' && /expired/.test(toasts[0] || ''), { store, toasts });
  assert('401 doble: onUnauthorized (para registrar quien)', unauth.length === 1 && unauth[0].bounced === true && unauth[0].url === '/api/x', unauth);
  await wait(1300);
  assert('401 doble: va al login', window.location.href === 'index.html');

  /* regreso del login y sigue fallando: aviso, NO rebota otra vez */
  window.location.href = 'admin.html';
  r = await A.fetch('/api/x', {});
  await wait(1300);
  assert('401 doble otra vez: no rebota sin fin', window.location.href === 'admin.html', window.location.href);
  assert('401 doble otra vez: aviso para salir y entrar', /Sign-in check failed/.test(toasts[1] || ''), toasts);
  assert('onUnauthorized con bounced=false', unauth[1] && unauth[1].bounced === false, unauth);

  /* ya entra: se borra la marca */
  server.good = new Set(['tok' + (M.n + 1), 'tok' + M.n]);
  r = await A.fetch('/api/x', {});
  assert('respuesta buena: se borra gs_auth_bounced', r.ok && !('gs_auth_bounced' in store), store);

  /* MSAL falla: usa lo que ya tenia, no truena */
  A._reset(); M.throwNext = true; store.admin_token = 'saved-tok';
  const origErr = console.error; console.error = () => {};
  t = await A.token();
  console.error = origErr;
  assert('MSAL falla: usa el token guardado y no truena', t === 'saved-tok', t);

  /* sin cuenta (otra pestaña, MSAL vacio): el guardado de admin.html */
  A._reset(); M.accounts = [];
  t = await A.token();
  assert('sin cuenta: el token guardado', t === 'saved-tok');

  /* doble clic: dos peticiones a la vez, las dos con token */
  A._reset(); M.accounts = [{ username: 'dana@gsocd.com' }];
  const n0 = M.n;
  const [a, b] = await Promise.all([A.token(), A.token()]);
  assert('dos a la vez: las dos con token', !!a && !!b && M.n - n0 <= 2, { a, b });

  console.log(`\n${ok} OK, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
