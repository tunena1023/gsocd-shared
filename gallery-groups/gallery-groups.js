/* ============================================================
   gsocd-shared / gallery-groups
   Formato OFICIAL para mostrar fotos/videos agrupados por orden --
   cada orden es una tarjeta desplegable (mismo lenguaje visual que
   las categorias de servicio: beige F7F6F3 cerrada, EDE7D8 abierta,
   flechita que gira), con su contenido adentro.

   Reemplaza el HTML de galeria que se repetia por separado en
   Tech (employee.html/supervisor.html) y ahora tambien en Admin.

   Tarjeta abierta (CFO 22/10/2026, imagen aprobada en Admin tools/gallery-review/open-card/simple/):
     - Arriba, Before / After (solo si la orden tiene fotos de antes) y a la derecha "↓ Download all" (zip).
     - La foto grande en 3 zonas: izquierda = la anterior, en medio = el visor (GSLightbox), derecha = la que sigue.
     - Abajo, todas las miniaturas en una tira que se recorre de lado, cada una con su servicio; la que esta en
       grande va marcada. Picar una la pone en grande.
     - Abajo, quien tomo las fotos y cuantas (solo si fue mas de una persona).
     - Before/After y las personas son filtros que se prenden y se apagan: sin ninguno salen todas, de la mas
       nueva a la mas vieja; se pueden combinar. La foto grande, la tira y el visor recorren lo filtrado.
     - Ya no va la lista de servicios (group.services se acepta y no se pinta).

   v1.30.0 (19/09/2026): el bloque de nombre + renglones de detalle se
   movio a gsocd-shared/order-card-header -- a peticion del dueño, ese
   mismo formato ahora es la pieza compartida para CUALQUIER tarjeta
   de orden cerrada en los 3 portales (Approvals, Review, Active,
   History, Schedule, Processing, etc.), no solo Gallery. Este
   archivo ya no arma ese bloque a mano -- llama a
   GSOrderCardHeader.html() y le pasa el contador de fotos + la
   flechita como trailingHtml (esos 2 SI son especificos de Gallery).
   Requiere que order-card-header.js se cargue ANTES que este script
   en el HTML.

   v1.29.8 (19/09/2026): reacomodo del header a peticion del dueño --
   el nombre del cliente pasa al lugar/tamaño que antes tenia el
   numero de orden (arriba, en negritas). Debajo, 3 renglones nuevos,
   cada uno se arma solo con lo que este disponible:
     1) Order # · Division
     2) Unit # · Bathrooms · Bedrooms  (unitNumber es campo nuevo)
     3) Assigned · Completed date       (completedDate es campo nuevo)
   Si no hay clientLabel (portal de clientes -- cada quien ve solo sus
   propias ordenes, no aplica mostrar "cliente"), el nombre cae de
   vuelta al numero de orden.

   Requiere que cada foto traiga serviceName (string o null/undefined),
   level (string o ''), reason (string o '') y sortKey (ISO string,
   para poder ordenar de verdad por fecha -- el caption ya viene
   formateado como texto para mostrar, no sirve para ordenar). Si una
   foto no trae sortKey, se cae a caption como ordenar-por-texto
   (mejor que nada, pero avisado: no es cronologicamente exacto entre
   meses/años distintos). Compatibilidad: una foto sin serviceName no
   trae nombre pegado abajo -- no truena con datos viejos que no lo
   manden.

   Uso:
     <div id="myGallery"></div>
     <script>
       GSGalleryGroups.render('myGallery', groups, {
         emptyMessage: 'No photos yet.',
         openOrderId: 'GS-1001-1013', // opcional: esa orden llega ya
                                       // abierta y con scroll automatico;
                                       // las demas quedan cerradas
         statusHtml: function(group) { ... }, // opcional (02/10/2026): burbuja
                                       // del estatus a la derecha, la pinta
                                       // cada portal con sus colores
         onPhotoClick: function(groupIndex, photoIndex, group) {
           GSLightbox.open(group.photos, photoIndex);
         }
       });
     </script>

   "groups" es un arreglo de:
     { orderId, clientLabel, date (string ya formateada),
       bedrooms, bathrooms, division, supervisor, unitNumber,
       crew (opcional, 02/10/2026 -- arreglo de nombres de la gente
         asignada; si viene, el encabezado dice "Supervisor: <supervisor>"
         y abajo "Assigned: <crew>" en vez de "Assigned: <supervisor>"),
       completedDate (todos opcionales -- string, se muestran en los
         renglones de detalle debajo del encabezado cuando la tarjeta
         esta cerrada; cualquiera ausente simplemente no aparece),
       services (opcional; ya no se pinta),
       photos: [
         { downloadUrl, isVideo (opcional, bool),
           serviceName (string o null -- null/ausente = foto general
             del departamento, no ligada a ningun servicio),
           level (string o ''), reason (string o ''),
           caption (texto ya formateado para mostrar, ej. la fecha),
           sortKey (opcional, string ISO -- para ordenar de verdad
             por fecha; si falta, se ordena por caption como texto),
           stage (opcional, 'inspection' | 'work' -- v1.69.0: si la
             orden trae fotos de los dos, arriba de las fotos salen 2
             pestañas "Inspection · before" / "Work · after"; sin stage
             cuenta como 'work', igual que antes) }
     ] }

   Si se omite onPhotoClick, se usa GSLightbox.open(group.photos, i)
   automaticamente si GSLightbox esta disponible en la pagina. El
   indice "i" que se manda es siempre el indice DENTRO de
   group.photos (el arreglo completo, orden original del backend),
   sin importar en que posicion este rotada esa foto en ese momento --
   asi el lightbox puede navegar prev/next sobre la lista completa real.

   Todas las clases llevan el prefijo "gs-gal-" a proposito, para no
   chocar con CSS que ya exista en cada pagina.
============================================================ */
(function () {
  'use strict';
  if (window.GSGalleryGroups) return;

  var STYLE_ID = 'gs-gallery-groups-style';
  function styleTag() {
    if (document.getElementById(STYLE_ID)) return;
    var tag = document.createElement('style');
    tag.id = STYLE_ID;
    tag.textContent =
      '\n  .gs-gal-search { display: flex; align-items: center; gap: 10px; border: 1px solid #E0D9CC; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; }' +
      '\n  .gs-gal-search svg { width: 15px; height: 15px; color: #8C6F2A; flex-shrink: 0; }' +
      '\n  .gs-gal-search input { border: none; outline: none; font-size: 13px; font-family: inherit; color: #111; width: 100%; background: none; }' +
      '\n  .gs-gal-search input::placeholder { color: #999; }' +
      '\n\n  .gs-gal-grp { border: 1px solid #F0EBDD; border-radius: 6px; margin-bottom: 10px; overflow: hidden; }' +
      '\n  .gs-gal-grp-header { display: block; padding: 14px 16px; background: #F7F6F3; cursor: pointer; }' +
      '\n  .gs-gal-grp.open > .gs-gal-grp-header { background: #EDE7D8; }' +
      '\n  .gs-gal-grp-count { background: #E9DDBB; color: #6B5A22; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px; flex-shrink: 0; }' +
      '\n  .gs-gal-grp-arrow { color: #999; font-size: 11px; transition: transform .2s; flex-shrink: 0; }' +
      '\n  .gs-gal-grp.open > .gs-gal-grp-header .gs-gal-grp-arrow { transform: rotate(90deg); }' +
      '\n\n  .gs-gal-grp-body { display: none; padding: 16px; background: #fff; }' +
      '\n  .gs-gal-grp.open > .gs-gal-grp-body { display: block; }' +
      '\n\n  .gs-gal-empty { font-size: 13px; color: #999; text-align: center; padding: 40px 0; }' +
      '\n  .gs-gal-col-label { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #6B6B6B; margin-bottom: 10px; }' +
      '\n\n  .gs-gal-hero { position: relative; width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden; cursor: pointer; background: #eee; }' +
      '\n  /* 12/10/2026: en iPhone la foto grande salia de varias pantallas de alto (Safari no' +
      '\n     limita bien el alto de la imagen dentro de aspect-ratio). Ahora la imagen va' +
      '\n     encima del cuadro y el cuadro tiene su alto fijo por padding. */' +
      '\n  .gs-gal-hero { height: 0; padding-bottom: 100%; aspect-ratio: auto; min-height: 0; }' +
      /* Sin la lista de servicios la foto ocupa todo el ancho de la tarjeta (CFO 22/10): en compu mas ancha que alta,
         para que no crezca de mas; en el celular cuadrada, como siempre. */
      '\n  @media (min-width: 561px) { .gs-gal-hero { padding-bottom: 62%; } }' +
      '\n  .gs-gal-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; border-radius: 50%; background: rgba(17,17,17,.45); color: #fff; font-size: 20px; line-height: 28px; text-align: center; pointer-events: none; z-index: 1; }' +
      '\n  .gs-gal-nav.prev { left: 10px; } .gs-gal-nav.next { right: 10px; }' +
      '\n  .gs-gal-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; min-height: 30px; }' +
      '\n  .gs-gal-top .gs-gal-stages, .gs-gal-top .gs-gal-col-label { margin-bottom: 0; }' +
      '\n  .gs-gal-dl { all: unset; cursor: pointer; font-size: 12px; color: #8C6F2A; white-space: nowrap; }' +
      '\n  .gs-gal-dl:hover { text-decoration: underline; }' +
      '\n  .gs-gal-people { margin-top: 10px; }' +
      '\n  .gs-gal-people .gs-gal-stages { display: flex; width: max-content; max-width: 100%; overflow-x: auto; margin-bottom: 0; box-sizing: border-box; }' +
      '\n  .gs-gal-people .gs-gal-stage { white-space: nowrap; }' +
      '\n  .gs-gal-hero img, .gs-gal-hero video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; display: block; }' +
      '\n  .gs-gal-hero.video::after { content: "\\25B6"; position: absolute; top: 8px; right: 9px; color: #FFF3D6; font-size: 13px; background: rgba(17,17,17,.6); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }' +
      '\n  .gs-gal-hero-cap { font-size: 11.5px; color: #111; margin: 6px 0 10px; min-height: 14px; }' +
      '\n  .gs-gal-hero-cap b { font-weight: 700; }' +
      '\n  .gs-gal-cap-level { color: #6B6B6B; font-weight: 400; }' +
      '\n  .gs-gal-cap-reason { display: block; color: #8C6F2A; font-style: italic; font-size: 10.5px; margin-top: 1px; }' +
      '\n  .gs-gal-cap-date { display: block; color: #6B6B6B; font-size: 10.5px; margin-top: 1px; }' +
      '\n  .gs-gal-cap-by { display: block; color: #6B6B6B; font-size: 10.5px; margin-top: 1px; }' +
      '\n  .gs-gal-cap-from { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 3px; background: rgba(201,168,76,.18); color: #8C6F2A; font-weight: 600; }' +
      '\n  .gs-gal-cap-by .gs-gal-cap-from:first-child { margin-left: 0; }' +
      '\n\n  .gs-gal-stages { display: inline-flex; gap: 4px; background: #F2EEE4; border-radius: 99px; padding: 3px; margin-bottom: 10px; }' +
      '\n  .gs-gal-stage { all: unset; cursor: pointer; font-size: 11.5px; font-weight: 600; padding: 5px 12px; border-radius: 99px; color: #6B6B6B; }' +
      '\n  .gs-gal-stage b { font-weight: 700; margin-left: 4px; color: #8C6F2A; }' +
      '\n  .gs-gal-stage.on { background: #fff; color: #111; box-shadow: 0 1px 2px rgba(0,0,0,.08); }' +
      '\n  .gs-gal-stage:focus-visible { outline: 2px solid #C9A227; outline-offset: 1px; }' +
      '\n\n  .gs-gal-thumb-strip { display: flex; gap: 8px; overflow-x: auto; padding: 3px 3px 2px; }' +
      '\n  .gs-gal-thumb-wrap { flex: 0 0 auto; width: 56px; }' +
      '\n  .gs-gal-thumb { position: relative; width: 56px; height: 56px; border-radius: 6px; overflow: hidden; cursor: pointer; background: #eee; }' +
      '\n  .gs-gal-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }' +
      '\n  .gs-gal-thumb.cur { outline: 2px solid #C9A84C; outline-offset: 1px; }' +
      '\n  .gs-gal-thumb.video::after { content: "\\25B6"; position: absolute; bottom: 3px; right: 3px; color: #FFF3D6; font-size: 8px; background: rgba(17,17,17,.6); width: 13px; height: 13px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }' +
      '\n  .gs-gal-thumb-cap { font-size: 9px; color: #6B6B6B; text-align: center; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
      '\n\n  /* Tarjetas de ORDEN en 2 columnas (no las fotos de adentro). En' +
      '\n     mobile 1 sola columna: 2 tarjetas abiertas, cada una con su' +
      '\n     propio contenido de 2 columnas adentro, no caben lado a lado' +
      '\n     en un telefono sin verse aplastadas. */' +
      '\n  .gs-gal-cards-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }' +
      '\n  @media (max-width: 700px) { .gs-gal-cards-2col { grid-template-columns: 1fr; } }';
    document.head.appendChild(tag);
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  /* BUG REAL encontrado y arreglado (18/09/2026, reportado por el
     dueño): g.date llega como timestamp ISO crudo del backend
     ('2026-09-19T13:00:00.000Z') -- Admin y Orders lo mandaban tal
     cual a este componente, sin formatear. Se arregla aqui adentro --
     asi ningun llamador tiene que acordarse. */
  function fmtGroupDate(v) {
    if (!v) return '';
    if (!/^\d{4}-\d{2}-\d{2}T/.test(String(v))) return String(v);
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /* Clave de ordenar por fecha: usa sortKey (ISO) si la foto lo trae
     -- compara bien como texto porque ISO ya viene año-mes-dia. Si
     falta, se cae al caption tal cual (mejor que nada). Solo se usa
     para el orden INICIAL de las fotos (mas reciente primero) --
     despues de eso, rotar una miniatura es lo que decide el orden. */
  function dateSortKey(p) {
    return (p && (p.sortKey || p.caption)) || '';
  }

  /* Quien tomo la foto (26/09/2026, pedido de los supervisores): viene
     en p.takenBy (cada portal la manda desde lib/photo-log.js). */
  /* De donde vino (solo Admin manda el nombre con "-gal"): "From phone" si se subio del rollo del telefono,
     "From computer" si de la computadora (p.source = 'computer'). */
  function fromGallery(p) { return /-gal\.[a-z0-9]+$/i.test(String((p && p.name) || '')); }
  function byLineHtml(p) {
    /* p.dateUnknown (solo Admin): de la galeria y el telefono no trajo cuando se tomo. */
    var gal = fromGallery(p) ? '<span class="gs-gal-cap-from">From ' + (p.source === 'computer' ? 'computer' : 'phone') + (p.dateUnknown ? ' · date unknown' : '') + '</span>' : '';
    return p && p.takenBy ? '<span class="gs-gal-cap-by">📷 ' + esc(p.takenBy) + gal + '</span>' : (gal ? '<span class="gs-gal-cap-by">' + gal + '</span>' : '');
  }
  function photoCapHtml(p) {
    if (!p) return '';
    return (p.serviceName ? '<b>' + esc(p.serviceName) + '</b>' +
      (p.level ? ' <span class="gs-gal-cap-level">— ' + esc(p.level) + '</span>' : '') +
      (p.reason ? '<span class="gs-gal-cap-reason">' + esc(p.reason) + '</span>' : '') : '') +
      (p.caption ? '<span class="gs-gal-cap-date">' + esc(p.caption) + '</span>' : '') +
      byLineHtml(p);
  }

  /* "↓ Download all" (CFO 22/10): todas las fotos de la orden en un zip, en el navegador (las ligas de descarga de
     SharePoint ya traen permiso y aceptan fetch). Carpetas Before/After si la orden tiene fotos de antes; cada archivo
     con fecha, hora y servicio o quien la tomo. Si alguna no se pudo bajar, el zip sale con las demas y lo dice. */
  var JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = JSZIP_URL;
      s.onload = function () { window.JSZip ? res(window.JSZip) : rej(new Error('zip')); };
      s.onerror = function () { rej(new Error('zip')); };
      document.head.appendChild(s);
    });
  }
  function fileNameOf(p, used) {
    var t = String(p.sortKey || '').replace(/\.\d+Z?$|Z$/, '').replace('T', '_').replace(/:/g, '');
    var what = String(p.serviceName || p.takenBy || 'photo').replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    var ext = (/\.([a-z0-9]{2,4})$/i.exec(String(p.name || '')) || [])[1] || (p.isVideo ? 'mp4' : 'jpg');
    var base = ((t ? t + ' ' : '') + what).trim() || 'photo', n = base, k = 2;
    while (used[n.toLowerCase()]) n = base + ' (' + (k++) + ')';
    used[n.toLowerCase()] = true;
    return n + '.' + ext.toLowerCase();
  }
  /* Un video se enseña con su miniatura (thumbUrl); una foto, la foto. */
  function imgSrc(p) { return (p.isVideo && p.thumbUrl) || p.downloadUrl; }
  /* Para el zip: la liga del portal (gsocd-shared lib/photo-link) da los bytes desde el mismo dominio con &f=1
     (la de SharePoint depende de su CORS). */
  function fileUrl(p) { var u = String(p.downloadUrl || ''); return /\/api\/photo\?/.test(u) ? u + '&f=1' : u; }
  function downloadAll(group, btn) {
    if (btn.dataset.busy) return;   // doble clic: una sola descarga
    var photos = (group.photos || []).filter(function (p) { return p && p.downloadUrl; });
    if (!photos.length) return;
    var label = btn.textContent;
    btn.dataset.busy = '1';
    var both = photos.some(function (p) { return p.stage === 'inspection'; });
    var used = {}, done = 0, failed = 0;
    btn.textContent = 'Preparing… 0/' + photos.length;
    loadZip().then(function (JSZip) {
      var zip = new JSZip();
      return Promise.all(photos.map(function (p) {
        var folder = both ? (p.stage === 'inspection' ? 'Before/' : 'After/') : '';
        var name = folder + fileNameOf(p, used);
        return fetch(fileUrl(p)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
          .then(function (b) { zip.file(name, b); }, function () { failed++; })
          .then(function () { done++; btn.textContent = 'Preparing… ' + done + '/' + photos.length; });
      })).then(function () {
        if (failed === photos.length) throw new Error('none');
        return zip.generateAsync({ type: 'blob' });
      });
    }).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = String(group.orderId || 'photos').replace(/[^A-Za-z0-9-]+/g, '_') + '-photos.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
      btn.textContent = failed ? '↓ Download all · ' + failed + ' not included, retry' : label;
    }, function () {
      btn.textContent = '↓ Download all · failed, retry';
    }).then(function () { delete btn.dataset.busy; });
  }

  function render(containerId, groups, opts) {
    styleTag();
    opts = opts || {};
    var container = document.getElementById(containerId);
    if (!container) return;
    container.classList.add('gs-gal-cards-2col');

    if (!groups || !groups.length) {
      container.innerHTML = '<p class="gs-gal-empty">' + esc(opts.emptyMessage || 'No photos yet.') + '</p>';
      return;
    }

    /* Por grupo (CFO 22/10): filtros que se prenden y se apagan. stageState = Before/After ('inspection' | 'work' |
       nada = todas), whoState = la persona (nada = todas), posState = cual de las filtradas esta en grande. Sin
       ningun filtro salen todas, de la mas nueva a la mas vieja. Vive en closure de render(). */
    /* Por orden (no por posicion) y guardado en el contenedor: al repintar con datos nuevos (llego una foto, lo
       guardado se cambio por lo fresco) la tarjeta abierta, sus filtros y la foto en grande se quedan igual. */
    var keep = container.__gsGalKeep || (container.__gsGalKeep = { open: {}, stage: {}, who: {}, pos: {} });
    var stageState = keep.stage, whoState = keep.who, posState = keep.pos;
    function K(gi) { return String((groups[gi] && groups[gi].orderId) || ('#' + gi)); }
    function stageOf(p) { return p && p.stage === 'inspection' ? 'inspection' : 'work'; }
    function whoOf(p) { return (p && p.takenBy) || 'Not recorded'; }
    function sortedIdx(gi) {
      var photos = groups[gi].photos || [];
      return photos.map(function (_, i) { return i; }).sort(function (a, b) { return dateSortKey(photos[b]).localeCompare(dateSortKey(photos[a])); });
    }
    function filtered(gi) {
      var photos = groups[gi].photos || [], st = stageState[K(gi)], who = whoState[K(gi)];
      return sortedIdx(gi).filter(function (i) { return (!st || stageOf(photos[i]) === st) && (!who || whoOf(photos[i]) === who); });
    }
    function curPos(gi, list) {
      var p = posState[K(gi)] || 0;
      return list.length ? ((p % list.length) + list.length) % list.length : 0;
    }

    function bodyHtml(gi) {
      var g = groups[gi];
      var photos = g.photos || [];
      var list = filtered(gi);
      var pos = curPos(gi, list);
      var heroIdx = list[pos];
      var hero = photos[heroIdx];
      var st = stageState[K(gi)], who = whoState[K(gi)];

      /* Before/After solo si la orden tiene fotos de antes (la mayoria no tiene inspeccion). Los numeros respetan
         el filtro de persona, y los de las personas el de Before/After. */
      var all = sortedIdx(gi);
      var count = function (f) { return all.filter(function (i) { return f(photos[i]); }).length; };
      var hasBefore = all.some(function (i) { return stageOf(photos[i]) === 'inspection'; });
      var stageBar = hasBefore
        ? '<div class="gs-gal-stages">' +
            ['inspection', 'work'].map(function (s) {
              return '<button type="button" class="gs-gal-stage' + (st === s ? ' on' : '') + '" aria-pressed="' + (st === s) + '" data-stage="' + s + '">' +
                (s === 'inspection' ? 'Before' : 'After') + '<b>' + count(function (p) { return stageOf(p) === s && (!who || whoOf(p) === who); }) + '</b></button>';
            }).join('') +
          '</div>'
        : '<div class="gs-gal-col-label">Photos</div>';
      var dl = opts.download === false ? '' : '<button type="button" class="gs-gal-dl">↓ Download all</button>';

      var knowsWho = all.some(function (i) { return photos[i] && photos[i].takenBy !== undefined; });
      var people = [];
      if (knowsWho) all.forEach(function (i) { var w = whoOf(photos[i]); if (people.indexOf(w) < 0) people.push(w); });
      var peopleBar = people.length > 1
        ? '<div class="gs-gal-people"><div class="gs-gal-stages">' + people.map(function (w) {
            return '<button type="button" class="gs-gal-stage' + (who === w ? ' on' : '') + '" aria-pressed="' + (who === w) + '" data-who="' + escAttr(w) + '">📷 ' + esc(w) +
              '<b>' + count(function (p) { return whoOf(p) === w && (!st || stageOf(p) === st); }) + '</b></button>';
          }).join('') + '</div></div>'
        : '';

      /* La foto grande en 3 zonas: izquierda = la anterior, en medio = el visor, derecha = la que sigue. */
      var heroHtml = !hero ? '<p class="gs-gal-empty">No photos.</p>' : (
        '<div class="gs-gal-hero' + (hero.isVideo ? ' video' : '') + ' gs-gal-ph" data-pi="' + heroIdx + '">' +
          '<img src="' + escAttr(imgSrc(hero)) + '" loading="lazy" alt="">' +
          (list.length > 1 ? '<span class="gs-gal-nav prev" aria-hidden="true">‹</span><span class="gs-gal-nav next" aria-hidden="true">›</span>' : '') +
        '</div>' +
        '<div class="gs-gal-hero-cap">' + photoCapHtml(hero) + '</div>'
      );
      var thumbs = list.length > 1 ? '<div class="gs-gal-thumb-strip">' + list.map(function (pi, k) {
        var p = photos[pi];
        return '<div class="gs-gal-thumb-wrap">' +
          '<div class="gs-gal-thumb' + (p.isVideo ? ' video' : '') + (k === pos ? ' cur' : '') + ' gs-gal-ph" data-pi="' + pi + '" data-pos="' + k + '">' +
            '<img src="' + escAttr(imgSrc(p)) + '" loading="lazy" alt="">' +
          '</div>' +
          (p.serviceName ? '<div class="gs-gal-thumb-cap">' + esc(p.serviceName) + '</div>' : '') +
        '</div>';
      }).join('') + '</div>' : '';

      return '<div class="gs-gal-top">' + stageBar + dl + '</div>' + heroHtml + thumbs + peopleBar;
    }

    container.innerHTML = groups.map(function (g, gi) {
      var count = (g.photos || []).length;
      var isOpen = (opts.openOrderId && g.orderId === opts.openOrderId) || !!keep.open[K(gi)];

      /* El bloque de nombre + renglones de detalle vive en
         gsocd-shared/order-card-header -- se comparte con
         Approvals/Review/Active/History/Schedule/Processing y demas
         listas de orden en los 3 portales, no solo Gallery. El
         contador de fotos y la flechita son especificos de Gallery,
         asi que van como trailingHtml. */
      var trailing = (opts.statusHtml ? (opts.statusHtml(g) || '') : '') +
        '<span class="gs-gal-grp-count">' + count + '</span>' +
        '<span class="gs-gal-grp-arrow">▸</span>';
      var headerInner = window.GSOrderCardHeader
        ? window.GSOrderCardHeader.html({
            name: g.clientLabel || g.orderId,
            orderId: g.orderId,
            division: g.division,
            unitNumber: g.unitNumber,
            bedrooms: g.bedrooms,
            bathrooms: g.bathrooms,
            supervisor: g.crew ? '' : g.supervisor,
            completedDateText: g.completedDate ? fmtGroupDate(g.completedDate) : ''
          }, { trailingHtml: trailing }) + (g.crew
            ? (g.supervisor ? '<div class="gs-ordhdr-sub">Supervisor: ' + esc(g.supervisor) + '</div>' : '') +
              (g.crew.length ? '<div class="gs-ordhdr-sub">Assigned: ' + esc(g.crew.join(', ')) + '</div>' : '')
            : '')
        /* Respaldo si por alguna razon order-card-header.js no cargo
           antes que este script. */
        : '<div class="gs-ordhdr-top"><span class="gs-ordhdr-name">' + esc(g.clientLabel || g.orderId) + '</span>' +
          '<span class="gs-ordhdr-trailing">' + trailing + '</span></div>';

      return '' +
        '<div class="gs-gal-grp' + (isOpen ? ' open' : '') + '"' + (isOpen ? ' id="gs-gal-open-target"' : '') + '>' +
          '<div class="gs-gal-grp-header" data-grp-header="' + gi + '">' + headerInner + '</div>' +
          '<div class="gs-gal-grp-body" data-grp-body="' + gi + '">' + bodyHtml(gi) + '</div>' +
        '</div>';
    }).join('');

    if (opts.openOrderId) {
      var target = document.getElementById('gs-gal-open-target');
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function wireBody(gi) {
      var body = container.querySelector('[data-grp-body="' + gi + '"]');
      if (!body) return;
      var repaint = function () {
        body.innerHTML = bodyHtml(gi);
        wireBody(gi);
        var cur = body.querySelector('.gs-gal-thumb.cur'), strip = body.querySelector('.gs-gal-thumb-strip');
        if (cur && strip) {   // la miniatura de la foto en grande queda a la vista en la tira
          var w = cur.parentElement;
          if (w.offsetLeft < strip.scrollLeft || w.offsetLeft + w.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = w.offsetLeft - 8;
        }
      };

      var heroEl = body.querySelector('.gs-gal-hero');
      if (heroEl) {
        heroEl.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var list = filtered(gi);
          var r = heroEl.getBoundingClientRect(), x = r.width ? (ev.clientX - r.left) / r.width : 0.5;
          if (list.length > 1 && x < 1 / 3) { posState[K(gi)] = curPos(gi, list) - 1; repaint(); return; }
          if (list.length > 1 && x > 2 / 3) { posState[K(gi)] = curPos(gi, list) + 1; repaint(); return; }
          var pi = parseInt(heroEl.dataset.pi, 10);
          var group = groups[gi];
          if (opts.onPhotoClick) {
            opts.onPhotoClick(gi, pi, group);
          } else if (window.GSLightbox) {
            /* El visor recorre lo mismo que se ve (con los filtros), en el mismo orden. Si se ven antes y despues
               juntos, el contador dice "After 2 / 6" / "Before 1 / 4" por tramo. */
            var photos = group.photos || [];
            var sections = [], prev = null;
            list.forEach(function (i, k) {
              var s = stageOf(photos[i]);
              if (s !== prev) { sections.push({ label: s === 'inspection' ? 'Before' : 'After', start: k, count: 0 }); prev = s; }
              sections[sections.length - 1].count++;
            });
            var hasBefore = photos.some(function (p) { return stageOf(p) === 'inspection'; });
            window.GSLightbox.open(list.map(function (i) { return photos[i]; }), Math.max(0, list.indexOf(pi)),
              hasBefore && sections.length <= 2 ? { sections: sections } : undefined);
          }
        });
      }

      body.querySelectorAll('.gs-gal-stage[data-stage]').forEach(function (el) {
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          stageState[K(gi)] = stageState[K(gi)] === el.dataset.stage ? null : el.dataset.stage;
          posState[K(gi)] = 0;
          repaint();
        });
      });
      body.querySelectorAll('.gs-gal-stage[data-who]').forEach(function (el) {
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          whoState[K(gi)] = whoState[K(gi)] === el.dataset.who ? null : el.dataset.who;
          posState[K(gi)] = 0;
          repaint();
        });
      });
      body.querySelectorAll('.gs-gal-thumb').forEach(function (el) {
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          posState[K(gi)] = parseInt(el.dataset.pos, 10) || 0;
          repaint();
        });
      });
      var dlEl = body.querySelector('.gs-gal-dl');
      if (dlEl) dlEl.addEventListener('click', function (ev) { ev.stopPropagation(); downloadAll(groups[gi], dlEl); });
    }

    container.querySelectorAll('[data-grp-header]').forEach(function (header) {
      header.addEventListener('click', function () {
        var open = header.parentElement.classList.toggle('open');
        keep.open[K(parseInt(header.dataset.grpHeader, 10))] = open;
      });
    });

    groups.forEach(function (g, gi) { wireBody(gi); });
  }

  function searchHtml(inputId, placeholder) {
    return '<div class="gs-gal-search">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '<input type="text" id="' + escAttr(inputId) + '" placeholder="' + escAttr(placeholder || 'Search by order number or client...') + '">' +
      '</div>';
  }

  /* Una foto subida mientras la galeria esta abierta aparece sola (CFO 30/10/2026). Cada everyMs (3 min) con la
     pantalla a la vista, al volver a ella y al volver la señal, check() pregunta la marca de fotos del servidor (una
     llamada chica: el endpoint de la galeria con onlyMarker, gsocd-shared lib/gallery-build photoMarker). Si cambio
     contra la de lo que se ve, onChange() vuelve a cargar y repinta. Si check falla, la siguiente vuelta.
       var w = GSGalleryGroups.watch({ check: () => api(...onlyMarker...).then(r => r.photoMarker), onChange: reload });
       w.seen(marker)   -- la marca de lo que se acaba de pintar
       w.stop()                                                                                                  */
  function watch(o) {
    var seen = '', busy = false, stopped = false, last = Date.now();
    var every = o.everyMs || 180000;
    function tick(force) {
      if (stopped || busy || (typeof document !== 'undefined' && document.hidden)) return;
      if (!force && Date.now() - last < every) return;
      if (o.active && !o.active()) return;
      busy = true; last = Date.now();
      Promise.resolve().then(function () { return o.check(); }).then(function (m) {
        m = m == null ? '' : String(m);
        if (m && seen && m !== seen) { seen = m; return o.onChange(m); }
        if (m && !seen) seen = m;
      }).catch(function () { /* la siguiente vuelta */ }).then(function () { busy = false; });
    }
    var timer = setInterval(function () { tick(false); }, Math.min(every, 60000));
    function onVis() { if (!document.hidden) tick(true); }
    function onOnline() { tick(true); }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    return {
      seen: function (m) { if (m) seen = String(m); },
      check: function () { tick(true); },
      stop: function () { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onOnline); }
    };
  }

  window.GSGalleryGroups = { render: render, searchHtml: searchHtml, watch: watch };
})();
