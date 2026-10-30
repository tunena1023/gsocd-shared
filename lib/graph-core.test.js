/* lib/graph-core.js: node lib/graph-core.test.js -- el cliente de Graph de los 3 portales contra un SharePoint falso. */
'use strict';
delete process.env.SQL_MIRROR_URL; delete process.env.SQL_READ_URL;
let ok = 0, fail = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const res = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => (headers || {})[k.toLowerCase()] || null }, text: async () => (body === undefined ? '' : JSON.stringify(body)), json: async () => body, arrayBuffer: async () => Buffer.from('bin') });

function fakeSP() {
  const sp = { tokens: 0, calls: [], cols: { Orders: new Set(['Title', 'OrderID']) }, items: { Orders: [] }, throttle: 0 };
  sp.fetch = async (url, o) => {
    o = o || {};
    const method = o.method || 'GET';
    if (/login\.microsoftonline\.com/.test(url)) { sp.tokens++; return res(200, { access_token: 'tok' + sp.tokens, expires_in: 3600 }); }
    const path = url.replace('https://graph.microsoft.com/v1.0', '');
    sp.calls.push({ method, path, auth: o.headers && o.headers.Authorization, body: o.body });
    if (sp.throttle > 0) { sp.throttle--; return res(429, { error: { message: 'throttled' } }, { 'retry-after': '0' }); }
    if (/^\/sites\/[^/]+:\/sites\/Onlineorders$/.test(path)) return res(200, { id: 'site-1' });
    let m;
    if ((m = /^\/sites\/site-1\/lists\/([^/]+)\/columns/.exec(path))) {
      const l = decodeURIComponent(m[1]);
      if (method === 'POST') { const b = JSON.parse(o.body); sp.cols[l].add(b.name); return res(201, b); }
      return res(200, { value: [...sp.cols[l]].map(n => ({ name: n })) });
    }
    if ((m = /:\/lists\/([^/]+)\/items(\/[^?]*)?/.exec(path))) {
      const l = decodeURIComponent(m[1]);
      if (!sp.items[l]) return res(404, { error: { message: "List 'x' does not exist at site" } });
      if (method === 'POST') {
        const f = JSON.parse(o.body).fields; const bad = Object.keys(f).find(k => !sp.cols[l].has(k));
        if (bad) return res(400, { error: { message: "Field '" + bad + "' is not recognized" } });
        const it = { id: String(sp.items[l].length + 1), fields: f }; sp.items[l].push(it); return res(201, it);
      }
      return res(200, { value: sp.items[l] });
    }
    if (/\/drives$/.test(path)) return res(200, { value: [{ id: 'drv', name: 'Documents' }] });
    if ((m = /^\/drives\/drv\/root:\/([^:]*):\/children(\?.*)?$/.exec(path))) {
      if (/page2/.test(path)) return res(200, { value: [{ name: 'b.jpg', id: '2', file: {} }] });
      return res(200, { value: [{ name: 'a.jpg', id: '1', file: {}, size: 5, '@microsoft.graph.downloadUrl': 'dl', webUrl: 'w', thumbnails: m[2] ? [{ medium: { url: 'th' } }] : undefined }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/drives/drv/root:/X:/children?page2' });
    }
    return res(404, { error: { message: 'not found ' + path } });
  };
  return sp;
}
const env = { GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's' };
const CATALOG = [{ list: 'Orders', columns: [{ name: 'KitStatus', type: 'text' }] }];
(async () => {
  const errs = []; const oe = console.error; console.error = (...a) => errs.push(a.join(' '));
  let sp = fakeSP(); global.fetch = sp.fetch;
  const core = require('./graph-core');
  const admin = core({ portal: 'Admin', env, catalog: () => CATALOG });
  const orders = core({ portal: 'Orders', env });
  const tech = core({ portal: 'Tech', env, catalog: () => CATALOG });
  check('the 3 portals get the same API (lists, helpers, jsonResponse)', JSON.stringify(Object.keys(admin).sort()) === JSON.stringify(Object.keys(orders).sort()) && Object.keys(admin).length > 55);
  check('lists: union of the 3 (PromoCodes from Orders, Suggestions from Admin, TechDeviceTokens from Tech)', orders.SUGGESTIONS_LIST === 'Suggestions' && admin.PROMO_CODES_LIST === 'PromoCodes' && orders.TECHS_LIST === 'Techs' && admin.TECH_DEVICE_TOKENS_LIST === 'TechDeviceTokens');
  check('sp-heal only where there is a catalog (Orders: none)', !!admin.healer && !!tech.healer && orders.healer === null);
  await admin.queryList('Orders'); await admin.queryList('Orders');
  check('token: one per instance, reused (cache ~55 min)', sp.tokens === 1 && sp.calls.every(c => c.auth === 'Bearer tok1'));
  sp.throttle = 2;
  const r = await admin.queryList('Orders');
  check('429 is retried with what SharePoint asks (graph-retry)', Array.isArray(r) && sp.throttle === 0);
  let e = null; try { await orders.graphFetch('/nope'); } catch (x) { e = x; }
  check('errors carry their status (Orders too now)', e && e.status === 404, e && e.message);
  e = null; try { await orders.createListItem('Orders', { Title: 'A', KitStatus: 'x' }); } catch (x) { e = x; }
  check('Orders: a missing column is NOT created (no sp-heal), the error goes up', e && /not recognized/.test(e.message) && !sp.cols.Orders.has('KitStatus'));
  const it = await admin.createListItem('Orders', { Title: 'A', KitStatus: 'x' });
  check('Admin: a missing catalog column is created and the save is retried', it && it.fields.KitStatus === 'x' && sp.cols.Orders.has('KitStatus'));
  e = null; try { await tech.createListItem('Orders', { Title: 'B', Bogus: 1 }); } catch (x) { e = x; }
  check('Tech: a column not in the catalog is not created (error + log)', e && !sp.cols.Orders.has('Bogus') && errs.some(s => /Tech/.test(s)), errs);
  const kids = await admin.listChildren('X', { thumbs: true });
  check('listChildren: all pages, downloadUrl, thumb, webUrl', kids.length === 2 && kids[0].downloadUrl === 'dl' && kids[0].thumb === 'th' && kids[0].webUrl === 'w' && kids[1].name === 'b.jpg', kids);
  check('jsonResponse', orders.jsonResponse(201, { a: 1 }).statusCode === 201 && JSON.parse(orders.jsonResponse(200, { a: 1 }).body).a === 1);
  const g2 = core({ portal: 'Orders', env: Object.assign({ GRAPH_ORDERS_FOLDER: 'Test' }, env) });
  check('ORDERS_FOLDER from env', g2.ORDERS_FOLDER === 'Test' && admin.ORDERS_FOLDER === 'Orders');
  console.error = oe;
  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
