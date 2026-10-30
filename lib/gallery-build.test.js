/* node lib/gallery-build.test.js -- lo comun de las galerias (CFO 30/10/2026). */
process.env.GRAPH_CLIENT_SECRET = 'test-secret';
const galleryBuild = require('./gallery-build');
const photoLink = require('./photo-link');
let ok = 0, bad = 0;
function assert(name, cond, info) { if (cond) { ok++; console.log('OK   - ' + name); } else { bad++; console.log('FAIL - ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); } }

(async () => {
  assert('formatSvcPhotoDate: UTC -> hora de Iowa', galleryBuild.formatSvcPhotoDate('2026', '09', '18', '02', '57') === 'Sep 17, 2026 · 9:57 PM');
  assert('formatIsoDate', galleryBuild.formatIsoDate('2026-10-20T15:00:00Z') === 'Oct 20, 2026 · 10:00 AM' && galleryBuild.formatIsoDate('') === '' && galleryBuild.formatIsoDate('x') === '');
  assert('clientFolderName: sin caracteres prohibidos ni punto al final', galleryBuild.clientFolderName({ ClientID: 'GS-1021', BusinessName: 'INDIGO-Hunters Run Apts.' }) === 'GS-1021 - INDIGO-Hunters Run Apts');
  const svc = { 'GS-1': [{ fields: { OrderID: 'GS-1', ServiceName: 'Kitchen Deep Clean', Level: 'Heavy', NotCompletedReason: 'No power' } }, { fields: { OrderID: 'GS-1', ServiceName: 'Paint' } }] };
  const names = ['svc-Kitchen_Deep_Clean-2026-10-20_150000-ab12.jpg', 'svc-Unknown-2026-10-20_150000-ab12.jpg', '2026-10-20_150000-ab12.jpg'];
  const { captions, services } = galleryBuild.buildServiceCaptionsAndList('GS-1', names, svc);
  assert('servicios de la orden (tengan foto o no)', services.length === 2 && services[0].level === 'Heavy');
  const c = captions[names[0]];
  assert('pie de la foto por servicio', c && c.serviceName === 'Kitchen Deep Clean' && c.reason === 'No power' && c.caption === 'Oct 20, 2026 · 10:00 AM' && c.sortKey === '2026-10-20T15:00:00.000Z', c);
  assert('servicio que ya no esta / foto normal: sin pie', !captions[names[1]] && !captions[names[2]]);

  /* Con un drive falso. */
  const drive = {
    'TechPhotos/GS-1 - Acme/GS-1/Photos': [
      { name: 'b.jpg', id: 'I2', isFile: true, downloadUrl: 'https://sp/b', createdDateTime: '2026-10-21T15:00:00Z' },
      { name: 'a.jpg', id: 'I1', isFile: true, downloadUrl: 'https://sp/a', createdDateTime: '2026-10-20T15:00:00Z' },
      { name: 'sub', id: 'F', isFolder: true }],
    'TechPhotos/GS-1 - Acme/GS-2/Photos': []
  };
  let markerCalls = 0;
  const graph = {
    ORDER_SERVICES_LIST: 'OrderServices',
    listChildren: async p => drive[p] || [],
    siteListPath: n => '/sites/s/lists/' + n + '/items',
    graphFetch: async p => { markerCalls++; if (/TechPhotoLog\?/.test(p)) return { lastModifiedDateTime: '2026-10-30T10:00:00Z' }; throw new Error('?' + p); },
    getDriveId: async () => 'd'
  };
  const lq = { fetchByValues: async (list, field, ids) => list === 'OrderServices' ? [].concat(...ids.map(id => svc[id] || [])) : [] };
  const galleryScan = { ordersWithFolders: async orders => orders };
  const link = photoLink(graph);
  const gb = galleryBuild({ graph, lq, galleryScan, photoLink: link });
  const orders = [{ fields: { OrderID: 'GS-1', ClientID: 'GS-1', BusinessName: 'Acme' } }, { fields: { OrderID: 'GS-2', ClientID: 'GS-1', BusinessName: 'Acme' } }];
  const found = await gb.ordersWithPhotos(orders);
  assert('solo las ordenes con fotos, archivos en orden de nombre', found.length === 1 && found[0].photos.map(p => p.name).join() === 'a.jpg,b.jpg');
  const rows = await gb.serviceRowsByOrder(found);
  assert('servicios por orden', rows['GS-1'] && rows['GS-1'].length === 2);
  const pf = gb.photoFields(found[0].photos[0], null, '');
  assert('photoFields: liga que no caduca (no la de SharePoint)', /^\/api\/photo\?i=I1&/.test(pf.downloadUrl) && pf.downloadUrl.indexOf('sp/a') === -1, pf.downloadUrl);
  assert('photoFields: sin pie usa la hora del archivo', pf.caption === 'Oct 20, 2026 · 10:00 AM' && pf.sortKey === '2026-10-20T15:00:00Z' && pf.serviceName === null);
  const pf2 = gb.photoFields(found[0].photos[0], null, '2026-10-19T15:00:00Z');
  assert('photoFields: TakenAt manda', pf2.caption === 'Oct 19, 2026 · 10:00 AM' && pf2.sortKey === '2026-10-19T15:00:00Z');
  assert('photoFields: una foto no lleva isVideo ni thumbUrl', pf.isVideo === undefined && pf.thumbUrl === undefined);
  const pv = gb.photoFields({ id: 'V1', name: 'clip-2026.mp4', downloadUrl: 'https://sp/v', createdDateTime: '2026-10-20T15:00:00Z' }, null, '');
  assert('photoFields: video con su miniatura (k=t)', pv.isVideo === true && /i=V1&k=t&/.test(pv.thumbUrl) && /i=V1&e=/.test(pv.downloadUrl), pv);
  const r = await link.handler({ queryStringParameters: Object.fromEntries(new URL(pf.downloadUrl, 'http://x').searchParams) });
  assert('la liga da la foto con lo que trajo el listado (sin otra llamada)', r.statusCode === 302 && r.headers.Location === 'https://sp/a' && markerCalls === 0);
  const m1 = await gb.photoMarker(), m2 = await gb.photoMarker();
  assert('photoMarker: ultima modificacion de TechPhotoLog, en memoria 15 s', m1 === '2026-10-30T10:00:00Z' && m2 === m1 && markerCalls === 1);
  await gb.photoMarker({ fresh: true });
  assert('photoMarker({ fresh }): sin la memoria (la consulta chica de watch)', markerCalls === 2);
  const gbBad = galleryBuild({ graph: Object.assign({}, graph, { graphFetch: async () => { throw new Error('down'); } }), lq, galleryScan, photoLink: link });
  assert('photoMarker: si falla, vacio (se recarga todo)', (await gbBad.photoMarker()) === '');

  console.log('\n' + ok + ' OK, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
