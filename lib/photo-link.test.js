/* node lib/photo-link.test.js -- liga de foto que no caduca (CFO 30/10/2026). */
process.env.GRAPH_CLIENT_SECRET = 'test-secret';
const photoLink = require('./photo-link');
let ok = 0, bad = 0;
function assert(name, cond, info) { if (cond) { ok++; console.log('OK   - ' + name); } else { bad++; console.log('FAIL - ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); } }
const qs = u => Object.fromEntries(new URL(u, 'http://x').searchParams);

(async () => {
  const calls = [];
  let missing = new Set(), failNext = 0;
  const g = {
    getDriveId: async () => 'drive-1',
    graphFetch: async p => {
      calls.push(p);
      if (failNext) { failNext--; throw new Error('Graph 503: busy'); }
      const id = decodeURIComponent((/\/items\/([^/]+)/.exec(p) || [])[1] || '');
      if (missing.has(id)) throw new Error('Graph 404: The resource could not be found.');
      if (/\/thumbnails$/.test(p)) return id === 'VID' ? { value: [] } : { value: [{ medium: { url: 'https://sp/thumb/' + id + '?t=' + calls.length } }] };
      return { id, '@microsoft.graph.downloadUrl': 'https://sp/dl/' + id + '?t=' + calls.length };
    }
  };
  const L = photoLink(g);
  const item = { id: 'ABC123', name: 'x.jpg', downloadUrl: 'https://sp/dl/ABC123?listed', thumb: 'https://sp/thumb/ABC123?listed' };

  const u = L.url(item), t = L.url(item, 'thumb');
  assert('la liga es del portal y lleva id, vencimiento y firma', /^\/api\/photo\?i=ABC123&e=[0-9a-z]+&s=[\w-]{22}$/.test(u), u);
  assert('miniatura: misma liga con k=t', /&k=t&/.test(t) && qs(t).s !== qs(u).s, t);
  assert('misma foto, misma liga (no cambia en la semana)', L.url(item) === u);
  const exp = parseInt(qs(u).e, 36) * 1000, days = (exp - Date.now()) / 864e5;
  assert('vence entre 7 y 14 dias', days >= 7 && days <= 14, days);
  assert('sin id: lo que traiga el item', L.url({ downloadUrl: 'https://sp/x' }) === 'https://sp/x' && L.url(null) === null);

  /* La primera vez usa lo que trajo el listado: sin llamar a Graph. */
  let r = await L.handler({ queryStringParameters: qs(u) });
  assert('foto: 302 al downloadUrl del listado, sin pedirle a Graph', r.statusCode === 302 && r.headers.Location === item.downloadUrl && calls.length === 0, r);
  assert('302 con cache corto del navegador', /private, max-age=900/.test(r.headers['Cache-Control']));
  r = await L.handler({ queryStringParameters: qs(t) });
  assert('miniatura: 302 a la miniatura del listado', r.statusCode === 302 && r.headers.Location === item.thumb);

  /* Firma mala, otro id con la firma de este, k cambiado, vencida. */
  const q = qs(u);
  r = await L.handler({ queryStringParameters: Object.assign({}, q, { s: q.s.slice(0, -1) + (q.s.slice(-1) === 'A' ? 'B' : 'A') }) });
  assert('firma mala: 403 y no da la foto', r.statusCode === 403 && !r.headers.Location, r.statusCode);
  r = await L.handler({ queryStringParameters: Object.assign({}, q, { i: 'OTHER' }) });
  assert('otro archivo con esta firma: 403', r.statusCode === 403);
  r = await L.handler({ queryStringParameters: Object.assign({}, q, { k: 't' }) });
  assert('pedir la miniatura con la firma de la foto: 403', r.statusCode === 403);
  const oldE = Math.floor(Date.now() / 1000) - 60;
  r = await L.handler({ queryStringParameters: { i: 'ABC123', e: oldE.toString(36), s: photoLink.sign('ABC123', '', oldE) } });
  assert('vencida (firma buena): 403 "expired"', r.statusCode === 403 && /expired/.test(r.body));
  r = await L.handler({ queryStringParameters: {} });
  assert('sin datos: 403', r.statusCode === 403);
  r = await L.handler({ queryStringParameters: { i: '../../etc', e: q.e, s: q.s } });
  assert('id raro: 403', r.statusCode === 403);
  /* Otro secreto (otro portal / secreto rotado): la liga no sirve. */
  process.env.PHOTO_LINK_SECRET = 'other';
  r = await L.handler({ queryStringParameters: q });
  assert('con otro secreto la liga no sirve', r.statusCode === 403);
  delete process.env.PHOTO_LINK_SECRET;

  /* Sin lo del listado (otra instancia del servidor): una llamada a Graph y luego memoria. */
  const L2 = photoLink(g);
  calls.length = 0;
  r = await L2.handler({ queryStringParameters: q });
  assert('sin memoria: pide a Graph el downloadUrl fresco', r.statusCode === 302 && /^https:\/\/sp\/dl\/ABC123\?t=/.test(r.headers.Location) && calls.length === 1, calls);
  await L2.handler({ queryStringParameters: q });
  await L2.handler({ queryStringParameters: q });
  assert('la misma foto otra vez: de memoria (1 sola llamada)', calls.length === 1, calls.length);
  /* A los 21 min: se vuelve a pedir (la de SharePoint caduca en ~1 h). */
  const k = L2._cache.get('ABC123|'); k.at -= 21 * 60000;
  await L2.handler({ queryStringParameters: q });
  assert('a los 21 min se pide otra fresca', calls.length === 2, calls.length);
  calls.length = 0;
  r = await L2.handler({ queryStringParameters: qs(L2.url('ABC123', 'thumb')) });
  assert('miniatura sin memoria: /thumbnails', r.statusCode === 302 && /thumb\/ABC123/.test(r.headers.Location) && /\/thumbnails$/.test(calls[0]), calls);
  r = await L2.handler({ queryStringParameters: qs(L2.url('VID', 'thumb')) });
  assert('sin miniatura (video): la foto completa', r.statusCode === 302 && /dl\/VID/.test(r.headers.Location), r.headers);

  /* Archivo borrado, Graph caido. */
  missing.add('GONE');
  r = await L2.handler({ queryStringParameters: qs(L2.url('GONE')) });
  assert('archivo que ya no existe: 404', r.statusCode === 404);
  failNext = 1;
  r = await L2.handler({ queryStringParameters: qs(L2.url('BUSY')) });
  assert('Graph falla: 503 (la imagen se puede reintentar)', r.statusCode === 503);
  r = await L2.handler({ queryStringParameters: qs(L2.url('BUSY')) });
  assert('reintento despues de la falla: 302', r.statusCode === 302);

  /* f=1 (Download all): los bytes desde el mismo dominio; grande -> 302. */
  const realFetch = global.fetch;
  let size = 1000, fetchStatus = 200;
  global.fetch = async () => ({ ok: fetchStatus === 200, status: fetchStatus, headers: { get: h => (/length/i.test(h) ? String(size) : 'image/jpeg') }, arrayBuffer: async () => new Uint8Array(size).buffer });
  r = await L.handler({ queryStringParameters: Object.assign({}, q, { f: '1' }) });
  assert('f=1: 200 con los bytes (base64) y su tipo', r.statusCode === 200 && r.isBase64Encoded && Buffer.from(r.body, 'base64').length === 1000 && r.headers['Content-Type'] === 'image/jpeg');
  size = 6 * 1024 * 1024;
  r = await L.handler({ queryStringParameters: Object.assign({}, q, { f: '1' }) });
  assert('f=1 con archivo de mas de 4.4 MB: 302', r.statusCode === 302);
  size = 10; fetchStatus = 403;
  r = await L.handler({ queryStringParameters: Object.assign({}, q, { f: '1' }) });
  assert('f=1 y SharePoint dice 403: 302 y se olvida la liga guardada', r.statusCode === 302 && !L._cache.has('ABC123|'));
  global.fetch = realFetch;

  /* Sin ningun secreto: llave del proceso (pruebas locales), sigue firmando y verificando. */
  delete process.env.GRAPH_CLIENT_SECRET;
  const L3 = photoLink(g, { route: '/x/photo' });
  const u3 = L3.url({ id: 'Z1', downloadUrl: 'https://sp/z' });
  r = await L3.handler({ queryStringParameters: qs(u3) });
  assert('sin secreto: funciona en el mismo proceso, ruta propia', /^\/x\/photo\?/.test(u3) && r.statusCode === 302);

  console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
