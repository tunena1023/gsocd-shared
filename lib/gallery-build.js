/* ============================================================
   gsocd-shared/lib/gallery-build.js -- lo comun de las galerias de los 3
   portales (CFO 30/10/2026: "lo que se usa en mas de un portal va en shared").
   Antes estaba copiado ~150 renglones en Admin get-admin-gallery.js, Orders
   get-client-gallery.js y Tech get-my-gallery.js.

   No hay ninguna lista de SharePoint con las fotos: se lee la carpeta
     TechPhotos/<ClientID> - <BusinessName>/<OrderID>/Photos/*
   Las fotos por servicio llevan el servicio y la hora en el nombre
   ("svc-<Servicio>-<fecha>.jpg", photo-log SVC_PHOTO_NAME); la nota se lee
   siempre de OrderServices.NotCompletedReason, nunca se guarda aparte.

   Uso en un portal:
     const gb = require('gsocd-shared/lib/gallery-build')({
       graph: require('./graph'), lq: require('./list-query'),
       galleryScan: require('./gallery-scan'), photoLink: require('./photo-link') });
     const found = await gb.ordersWithPhotos(orders);          // [{ it, photos }] solo las que tienen fotos
     const svcRows = await gb.serviceRowsByOrder(found);       // { OrderID: [renglones de OrderServices] }
     const { captions, services } = gb.buildServiceCaptionsAndList(orderId, names, svcRows);
     photos.map(p => Object.assign({ name: ... }, gb.photoFields(p, captions[p.name], realAt), { ...lo del portal }))
   photoFields da la liga que no caduca (lib/photo-link) en downloadUrl, nunca la de SharePoint (caduca en ~1 h).
   photoMarker({ fresh }): la marca de "llego una foto nueva" (ultima modificacion de TechPhotoLog; toda subida escribe ahi).
============================================================ */
'use strict';

const photoLog = require('./photo-log');

const SVC_PHOTO_NAME = photoLog.SVC_PHOTO_NAME;
function safeName(s) { return String(s || '').replace(/[^a-z0-9]/gi, '_'); }

/* "Sep 17, 2026 · 2:30 PM" en hora de Iowa. */
function fmtChicago(d) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  }).formatToParts(d);
  const get = type => (parts.find(p => p.type === type) || {}).value || '';
  return get('month') + ' ' + get('day') + ', ' + get('year') + ' · ' + get('hour') + ':' + get('minute') + ' ' + get('dayPeriod');
}
/* El nombre del archivo guarda la hora del SERVIDOR (UTC): se enseña en hora de Iowa. */
function formatSvcPhotoDate(y, mo, d, h, mi) {
  return fmtChicago(new Date(Date.UTC(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), parseInt(h, 10), parseInt(mi, 10))));
}
/* Fotos sin hora en el nombre: la de Graph (createdDateTime) o la de TechPhotoLog.TakenAt. */
function formatIsoDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : fmtChicago(d);
}

function clientFolderName(f) {
  return (String(f.ClientID || '').trim() + ' - ' + String(f.BusinessName || '').trim())
    .replace(/[\\/:*?"<>|]/g, '').trim().replace(/[.\s]+$/, '');
}

/* El pie de cada foto svc-* (servicio, nivel, nota, hora) y la lista de TODOS los servicios de la orden. */
function buildServiceCaptionsAndList(orderId, photoNames, svcRowsByOrder) {
  const rows = (svcRowsByOrder && svcRowsByOrder[orderId]) || [];
  const bySafeName = {};
  const services = [];
  rows.forEach(it => {
    const f = it.fields || {};
    const name = f.ServiceName || '';
    if (!name) return;
    const level = f.Level || '';
    bySafeName[safeName(name)] = { name, level, reason: f.NotCompletedReason || '' };
    services.push({ name, level });
  });
  const captions = {};
  (photoNames || []).forEach(fileName => {
    const m = String(fileName).match(SVC_PHOTO_NAME);
    if (!m) return;
    const svc = bySafeName[m[1]];
    if (!svc) return;
    captions[fileName] = {
      serviceName: svc.name,
      level: svc.level || '',
      reason: svc.reason || '',
      caption: formatSvcPhotoDate(m[2], m[3], m[4], m[5], m[6]),
      /* ISO real (no el texto) para ordenar por fecha; m[7] son los segundos. */
      sortKey: new Date(Date.UTC(parseInt(m[2], 10), parseInt(m[3], 10) - 1, parseInt(m[4], 10),
        parseInt(m[5], 10), parseInt(m[6], 10), parseInt(m[7] || '0', 10))).toISOString()
    };
  });
  return { captions, services };
}

module.exports = function galleryBuild(deps) {
  const { graph, lq, galleryScan, photoLink } = deps;
  const photosFolder = deps.photosFolder || process.env.GRAPH_PHOTOS_FOLDER || 'TechPhotos';
  const servicesList = deps.servicesList || graph.ORDER_SERVICES_LIST || 'OrderServices';

  function photosPath(f) {
    return photosFolder + '/' + clientFolderName(f) + '/' + (f.OrderID || f.Title || '') + '/Photos';
  }

  /* Solo las ordenes con carpeta (una consulta por cliente, gallery-scan) y con al menos un archivo. */
  async function ordersWithPhotos(orders) {
    const withFolders = await galleryScan.ordersWithFolders(orders, clientFolderName, photosFolder);
    const listed = await Promise.all(withFolders.map(async it => {
      const kids = await graph.listChildren(photosPath(it.fields));
      const photos = kids.filter(k => k.isFile).sort((a, b) => a.name.localeCompare(b.name));
      return photos.length ? { it, photos } : null;
    }));
    return listed.filter(Boolean);
  }

  /* Los servicios de todas las ordenes de una vez (no uno por orden). */
  async function serviceRowsByOrder(found) {
    const out = {};
    const ids = found.map(x => x.it.fields.OrderID || x.it.fields.Title);
    (await lq.fetchByValues(servicesList, 'OrderID', ids)).forEach(r => {
      if (r.fields && r.fields.OrderID) (out[r.fields.OrderID] = out[r.fields.OrderID] || []).push(r);
    });
    return out;
  }

  /* Lo comun de cada foto. p = archivo de listChildren; info = captions[p.name]; realAt = TechPhotoLog.TakenAt. */
  function photoFields(p, info, realAt) {
    /* Video: se reproduce en el visor; en la cuadricula va su miniatura (la da SharePoint). */
    const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(String(p.name || ''));
    return {
      downloadUrl: photoLink.url(p),
      isVideo: isVideo || undefined,
      thumbUrl: isVideo ? photoLink.url(p, 'thumb') : undefined,
      serviceName: info ? info.serviceName : null,
      level: (info && info.level) || '',
      reason: (info && info.reason) || '',
      caption: (info && info.caption) || formatIsoDate(realAt || p.createdDateTime) || undefined,
      sortKey: (info && info.sortKey) || realAt || p.createdDateTime || ''
    };
  }

  /* Ultima modificacion de TechPhotoLog (toda foto que se sube escribe un renglon). '' si no se sabe. */
  let markerMemo = null;
  /* opts.fresh: sin la memoria de 15 s (la consulta chica de GSGalleryGroups.watch: si no, una foto subida justo
     despues de cargar no se veria hasta la siguiente vuelta). */
  async function photoMarker(opts) {
    if (!(opts && opts.fresh) && markerMemo && Date.now() - markerMemo.at < 15000) return markerMemo.v;
    let v = '';
    try {
      const d = await graph.graphFetch(graph.siteListPath(photoLog.LIST || 'TechPhotoLog').replace(/\/items$/, '') + '?$select=id,lastModifiedDateTime');
      v = (d && d.lastModifiedDateTime) || '';
    } catch (e) { v = ''; }
    markerMemo = { at: Date.now(), v };
    return v;
  }

  return { ordersWithPhotos, serviceRowsByOrder, photoFields, photoMarker, photosPath,
    buildServiceCaptionsAndList, formatSvcPhotoDate, formatIsoDate, clientFolderName, safeName };
};

Object.assign(module.exports, { buildServiceCaptionsAndList, formatSvcPhotoDate, formatIsoDate, clientFolderName, safeName });
