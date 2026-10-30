(function (root) {
  'use strict';
  if (root.GSApiClient) return;
  /* ================================================================
     GSApiClient -- GS.api + GS.offline de Orders y Tech, UNA vez. Antes
     cada portal tenia en su shared.js casi lo mismo (~95 renglones) y se
     iban separando (uno mandaba signal, el otro no; uno guardaba lo de sin
     señal aunque la respuesta fuera un error...).

       const c = GSApiClient.create({
         session,                 // GS.session del portal (clear() al 401 de sesion)
         reads: ['/get-…'],       // lecturas que se guardan en el telefono (sin señal)
         scope(headers) -> '',    // opcional: parte de la llave guardada (Orders: cliente y propiedad)
         headers() -> {},         // opcional: headers de mas (Orders: X-GS-Property del maestro)
         offlineMessage(when)     // texto de la barra sin señal ('3:05 PM')
       });
       GS.api = c.api; GS.offline = c.offline;

     c.api(path, opts) -> Promise<data>
       opts.body, opts.method ('POST'), opts.signal (cancelar)
       opts.load = nombre de la pantalla: pasa por GSLoad (gsocd-shared load/)
         con la misma llave de siempre: si falla por la señal o el sistema la
         pantalla sigue en "Loading…" y se reintenta sola. opts.slot, opts.saved
         igual que GSLoad.get.
       Sin red y es de `reads`: regresa lo guardado con __offline/__savedAt y
       enseña la barra. 401 con { signin } del servidor (cookie vencida):
       borra la sesion y regresa a index.html. Un error trae .status (y
       .field / .debug si el servidor los manda) para que GSLoad, la cola de
       envios (submit-key) y GSBackground sepan si se reintenta.
     c.offline: READS, PREFIX, MAX_AGE, key(), save(), read(), clear(), show(), hide()
       (lo guardado vive en gsocd-shared saved-data; lo de antes del 17/10 en
       localStorage se lee mientras no haya copia nueva).
     Prueba: node api-client/api-client.test.js
  ================================================================ */
  function create(o) {
    o = o || {};
    var offline = {
      READS: (o.reads || []).slice(),
      PREFIX: 'gs_off:',
      MAX_AGE: 30 * 864e5,
      key: function (path, body, headers) {
        var scope = '';
        try { scope = o.scope ? String(o.scope(headers || {}) || '') : ''; } catch (e) { scope = ''; }
        return this.PREFIX + scope + path + ':' + JSON.stringify(body === undefined ? null : body);
      },
      save: function (k, data) {
        if (!root.GSSaved) return;
        /* La copia de antes (localStorage) se borra SOLO cuando la nueva quedo guardada (si IndexedDB falla, no se
           queda sin copia). */
        root.GSSaved.save(k, data).then(function (ok) { if (ok) { try { root.localStorage.removeItem(k); } catch (e) {} } }).catch(function () {});
      },
      read: async function (k) {
        var v = root.GSSaved ? await root.GSSaved.read(k, this.MAX_AGE) : null;
        if (v) return v;
        try { var x = JSON.parse(root.localStorage.getItem(k) || 'null'); return x && x.data && Date.now() - x.at < this.MAX_AGE ? x : null; } catch (e) { return null; }
      },
      clear: function () {
        var p = this.PREFIX;
        try { Object.keys(root.localStorage).filter(function (k) { return k.indexOf(p) === 0; }).forEach(function (k) { root.localStorage.removeItem(k); }); } catch (e) {}
        if (root.GSSaved) root.GSSaved.clear(p);
      },
      show: function (at) {
        if (!root.GSSaved) return;
        var when = new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        root.GSSaved.bar.show(o.offlineMessage ? o.offlineMessage(when) : 'Offline. Showing what was saved at ' + when + '.');
      },
      hide: function () { if (root.GSSaved) root.GSSaved.bar.hide(); }
    };

    async function api(path, opts) {
      opts = opts || {};
      if (opts.load && root.GSLoad) {
        var once = Object.assign({}, opts); delete once.load; delete once.slot;
        return root.GSLoad.get(path + ' ' + JSON.stringify(once.body === undefined ? null : once.body) + ' ' + (once.method || ''),
          function () { return api(path, once); }, { label: opts.load, slot: opts.slot, saved: opts.saved });
      }
      var headers = { 'Content-Type': 'application/json' };
      try { Object.assign(headers, o.headers ? o.headers() || {} : {}); } catch (e) { /* sin headers de mas */ }
      var offKey = offline.READS.indexOf(String(path).split('?')[0]) >= 0 ? offline.key(path, opts.body, headers) : null;
      var res;
      try {
        res = await root.fetch('/api' + path, {
          method: opts.method || 'POST',
          headers: headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: opts.signal
        });
      } catch (netErr) {
        var saved = offKey && !(opts.signal && opts.signal.aborted) && await offline.read(offKey);
        if (saved) { offline.show(saved.at); return Object.assign({}, saved.data, { __offline: true, __savedAt: saved.at }); }
        throw netErr;
      }
      var data = {};
      try { data = await res.json(); } catch (e) { /* body no-JSON */ }
      if (res.status === 401 && data && data.signin) {
        try { if (o.session) o.session.clear(); } catch (e) {}
        if (!/index\.html$|\/$/.test(root.location.pathname)) root.location.replace('index.html');
      }
      if (!res.ok) {
        var err = new Error((data && data.error) || (res.status === 401 && data && data.signin ? 'Please sign in again.' : 'Request failed (' + res.status + ')'));
        err.status = res.status;
        if (data && data.field) err.field = data.field;
        if (data && data.debug) err.debug = data.debug;
        throw err;
      }
      if (offKey) { offline.save(offKey, data); offline.hide(); }
      return data;
    }

    return { api: api, offline: offline };
  }
  root.GSApiClient = { create: create };
})(typeof window !== 'undefined' ? window : this);
