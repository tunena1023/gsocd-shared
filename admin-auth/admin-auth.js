(function (root) {
  'use strict';
  if (root.GSAdminAuth) return;
  /* ================================================================
     GSAdminAuth -- el login de Admin en cada peticion, UNA sola vez para
     todas las paginas (admin, calendar, relations, warehouse,
     camera-capture, dashboard). Antes cada pagina tenia su copia de
     gsToken/gsAuthFetch y admin.html otra (getIdToken/authFetch) que
     hacia mas: guardaba el token, lo renovaba cada 4 min y no rebotaba
     al login sin fin. Esta es la de admin.html.

     El servidor no se fia del correo que manda la pagina: cada llamada a
     /api lleva el ID token de Microsoft (MSAL, el mismo login de siempre) y
     el servidor lo valida (lib/auth.js de Admin). Se guarda en memoria y en
     sessionStorage 'admin_token', y se renueva solo antes de vencer (y cada
     4 min por si la pestaña se queda abierta).

     Necesita msal-browser cargado antes.
       GSAdminAuth.msal()            -> la instancia de MSAL (una por pagina)
       GSAdminAuth.ready()           -> Promise: MSAL listo (initialize)
       GSAdminAuth.token(force)      -> Promise<idToken> ('' sin sesion)
       GSAdminAuth.current()         -> el token en memoria, sin esperar
       GSAdminAuth.query()           -> 't=<token>' para links que abren otra
                                        pestaña (PDF, conectar QuickBooks)
       GSAdminAuth.fetch(url, init)  -> fetch con Authorization: Bearer.
           Si el servidor dice 401 se pide un token nuevo UNA vez y se
           reintenta; si tampoco, UNA vuelta al login por sesion
           ('gs_auth_bounced'); si al regresar sigue fallando, se avisa en
           pantalla en vez de rebotar sin fin.
       GSAdminAuth.configure({ toast(msg), loginUrl, onUnauthorized(info) })
           toast: como avisa la pagina (por defecto window.showToast o
           window.toast si existen). onUnauthorized({ url, status, bounced }):
           cuando el reintento tambien da 401.
     Prueba: npm i --no-save jsdom && node admin-auth/admin-auth.test.js
  ================================================================ */
  var MSAL_CONFIG = {
    auth: {
      clientId: '18dfcf2e-0059-40f5-831c-69d13b9091fc',
      authority: 'https://login.microsoftonline.com/d18a66ea-5185-4a02-99cc-46b6578ff498',
      redirectUri: root.location.origin + '/index.html'
    },
    cache: { cacheLocation: 'sessionStorage' }
  };
  var SCOPES = ['openid', 'profile', 'User.Read'];
  var cfg = { loginUrl: 'index.html', toast: null, onUnauthorized: null };
  var inst = null, readyP = null, tok = '', tokExp = 0, timer = null;

  function ss(k, v) {
    try { if (v === undefined) return root.sessionStorage.getItem(k); if (v === null) root.sessionStorage.removeItem(k); else root.sessionStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  }
  function msal() {
    if (!inst && root.msal) inst = new root.msal.PublicClientApplication(MSAL_CONFIG);
    return inst;
  }
  function ready() {
    if (!readyP) {
      var m = msal();
      readyP = m ? Promise.resolve(m.initialize()).catch(function () {}) : Promise.resolve();
      if (!timer) timer = setInterval(function () { if (inst) token(); }, 4 * 60 * 1000);
    }
    return readyP;
  }
  async function token(force) {
    await ready();
    var now = Date.now() / 1000;
    if (!force && tok && tokExp - now > 120) return tok;
    var m = msal();
    var account = m && m.getAllAccounts()[0];
    if (!account) return tok || ss('admin_token') || '';
    try {
      var r = await m.acquireTokenSilent({ scopes: SCOPES, account: account, forceRefresh: !!force || !!(tok && tokExp - now <= 120) });
      tok = r.idToken || tok;
      tokExp = (r.idTokenClaims && r.idTokenClaims.exp) || (now + 300);
      if (tok) ss('admin_token', tok);
    } catch (e) {
      if (root.console) console.error('Sign-in token:', e && e.message);
      return tok || ss('admin_token') || '';
    }
    return tok;
  }
  function current() { return tok || ss('admin_token') || ''; }
  function query() { return 't=' + encodeURIComponent(current()); }
  function say(msg) {
    var f = cfg.toast || (typeof root.showToast === 'function' && root.showToast) || (typeof root.toast === 'function' && root.toast);
    try { if (f) f(msg); } catch (e) { /* sin aviso */ }
  }
  async function authFetch(url, init) {
    var go = async function (force) {
      var t = await token(force);
      var headers = Object.assign({}, (init && init.headers) || {}, t ? { Authorization: 'Bearer ' + t } : {});
      return root.fetch(url, Object.assign({}, init || {}, { headers: headers }));
    };
    var res = await go(false);
    if (res.status === 401) {
      res = await go(true);
      if (res.status === 401) {
        var bounced = !ss('gs_auth_bounced');
        try { if (cfg.onUnauthorized) cfg.onUnauthorized({ url: String(url), status: 401, bounced: bounced }); } catch (e) { /* solo aviso */ }
        if (bounced) {
          ss('gs_auth_bounced', '1');
          say('Your session expired, signing you in again…');
          setTimeout(function () { root.location.href = cfg.loginUrl; }, 1200);
        } else {
          say('Sign-in check failed. Sign out and sign in again, or call the office.');
        }
      }
    }
    if (res.ok) ss('gs_auth_bounced', null);
    return res;
  }
  function configure(o) { Object.keys(o || {}).forEach(function (k) { cfg[k] = o[k]; }); return api; }
  /* Solo pruebas: olvidar el token en memoria. */
  function _reset() { tok = ''; tokExp = 0; inst = null; readyP = null; if (timer) clearInterval(timer); timer = null; }

  var api = { MSAL_CONFIG: MSAL_CONFIG, msal: msal, ready: ready, token: token, current: current, query: query, fetch: authFetch, configure: configure, _reset: _reset };
  root.GSAdminAuth = api;
})(window);
