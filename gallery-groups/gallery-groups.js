/* ============================================================
   gsocd-shared / gallery-groups
   Formato OFICIAL para mostrar fotos/videos agrupados por orden --
   cada orden es una tarjeta desplegable (mismo lenguaje visual que
   las categorias de servicio: beige F7F6F3 cerrada, EDE7D8 abierta,
   flechita que gira), con su contenido adentro.

   Reemplaza el HTML de galeria que se repetia por separado en
   Tech (employee.html/supervisor.html) y ahora tambien en Admin.

   21/10/2026 (CFO: "arregla la galeria"; antes salian en miniatura y en
   el visor se revolvian las de antes y las de despues):
     - Pastilla Before | After | Both (si la orden trae de los dos); la
       tarjeta abre en Both: las de antes arriba y las de despues abajo,
       cada grupo con su titulo. Con un solo tipo no hay pastilla.
     - Cuadricula de fotos medianas (3 por renglon; 2 en celular), cada
       foto COMPLETA (sin recortar, object-fit: contain) en un cuadro de
       4:3. Abajo de cada una: servicio, fecha y quien la tomo. Ya no hay
       foto grande + tira de miniaturas, ni desplegables por persona.
     - Picar una foto abre el visor (GSLightbox) SOLO con las fotos de lo
       que se ve, en el mismo orden; con Both, primero las de antes y luego
       las de despues, y el contador dice "Before 2 / 4" / "After 1 / 3".
       Nunca brinca de Before a After estando en Before.
     - La lista "Scheduled Services" va abajo de las fotos.
   Lo de abajo (hero, rotacion, desplegables por persona) es historia.

   v1.31.0 (19/09/2026): rediseño del cuerpo de la tarjeta abierta,
   aprobado con varias iteraciones de mini interactivo -- ya NO es
   "Fotos del departamento" + "Por servicio" en 2 secciones separadas.
   Ahora son 2 COLUMNAS:
     - Izquierda ("Photos"): una foto GRANDE (hero) + una tira de
       miniaturas chiquitas abajo. Si la foto (grande o chiquita) fue
       tomada desde un servicio especifico, su nombre (+ nivel, +
       nota si la hay, + fecha) sale pegado justo abajo de ESA foto --
       si es una foto general del departamento, no trae nada abajo.
       Al picarle a una miniatura, esta ROTA al frente (se vuelve la
       grande) y el resto de las fotos se recorren en el mismo orden
       circular -- NO es un intercambio de solo 2 lugares. El orden
       inicial es por fecha, mas reciente primero. Las miniaturas
       (grandes y chicas) conservan la clase "gs-gal-ph" para que el
       hover-preview compartido siga funcionando en ambas.
     - Derecha ("Scheduled Services"): lista de TODOS los servicios
       programados en la orden (nombre + nivel si aplica), sin
       fotos -- es independiente de cuales servicios ya tienen foto o
       no. Requiere que el group traiga "services" (arreglo nuevo,
       ver mas abajo) -- si no viene o esta vacio, esta columna
       simplemente no se pinta.
   Se quita el boton "Ordenar" (Por fecha/Por servicio) de v1.29.x --
   ya no aplica a este diseño (el orden inicial ya es por fecha, y
   rotar una miniatura a la posicion grande reemplaza la necesidad de
   reordenar la cuadricula).

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
       services (opcional -- arreglo de { name, level } con TODOS los
         servicios programados en la orden, tengan foto o no; si se
         omite o viene vacio, la columna "Scheduled Services" no se
         pinta),
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

   Si se omite onPhotoClick, se usa GSLightbox.open(<las fotos que se
   ven, en su orden>, i, { sections }) si GSLightbox esta en la pagina
   (21/10/2026: antes se le pasaba group.photos entero y el visor
   mezclaba antes y despues). onPhotoClick sigue recibiendo el indice
   DENTRO de group.photos.

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
      '\n\n  .gs-gal-col-label { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #6B6B6B; margin-bottom: 10px; }' +
      '\n  .gs-gal-section + .gs-gal-section { margin-top: 18px; }' +
      '\n  .gs-gal-section-title { font-size: 12px; font-weight: 700; color: #111; margin-bottom: 8px; }' +
      '\n  .gs-gal-section-title b { font-weight: 700; color: #8C6F2A; margin-left: 4px; }' +
      /* Fotos medianas, completas (CFO 21/10/2026): 3 por renglon, 2 en celular; el cuadro es 4:3 por padding
         (Safari en iPhone no respeta bien aspect-ratio con la imagen adentro, ver 12/10/2026) y la imagen va
         con contain, asi se ve entera aunque sea vertical u horizontal. */
      '\n  .gs-gal-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }' +
      '\n  @media (max-width: 560px) { .gs-gal-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }' +
      '\n  .gs-gal-cell { min-width: 0; }' +
      '\n  .gs-gal-photo { position: relative; width: 100%; height: 0; padding-bottom: 75%; border-radius: 6px; overflow: hidden; cursor: pointer; background: #F2EEE4; }' +
      '\n  .gs-gal-photo img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: block; }' +
      '\n  .gs-gal-photo.video::after { content: "\\25B6"; position: absolute; top: 6px; right: 6px; color: #FFF3D6; font-size: 11px; background: rgba(17,17,17,.6); width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }' +
      '\n  .gs-gal-photo:focus-visible { outline: 2px solid #C9A227; outline-offset: 2px; }' +
      '\n  .gs-gal-cap { font-size: 11px; color: #111; margin-top: 5px; line-height: 1.35; overflow-wrap: anywhere; }' +
      '\n  .gs-gal-cap b { font-weight: 700; }' +
      '\n  .gs-gal-cap-level { color: #6B6B6B; font-weight: 400; }' +
      '\n  .gs-gal-cap-reason { display: block; color: #8C6F2A; font-style: italic; font-size: 10.5px; margin-top: 1px; }' +
      '\n  .gs-gal-cap-date { display: block; color: #6B6B6B; font-size: 10.5px; margin-top: 1px; }' +
      '\n  .gs-gal-cap-by { display: block; color: #6B6B6B; font-size: 10.5px; margin-top: 1px; }' +
      '\n  .gs-gal-cap-from { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 3px; background: rgba(201,168,76,.18); color: #8C6F2A; font-weight: 600; }' +
      '\n  .gs-gal-cap-by .gs-gal-cap-from:first-child { margin-left: 0; }' +
      '\n\n  .gs-gal-stages { display: inline-flex; gap: 4px; background: #F2EEE4; border-radius: 99px; padding: 3px; margin-bottom: 12px; }' +
      '\n  .gs-gal-stage { all: unset; cursor: pointer; font-size: 11.5px; font-weight: 600; padding: 5px 12px; border-radius: 99px; color: #6B6B6B; }' +
      '\n  .gs-gal-stage b { font-weight: 700; margin-left: 4px; color: #8C6F2A; }' +
      '\n  .gs-gal-stage.on { background: #fff; color: #111; box-shadow: 0 1px 2px rgba(0,0,0,.08); }' +
      '\n  .gs-gal-stage:focus-visible { outline: 2px solid #C9A227; outline-offset: 1px; }' +
      '\n\n  .gs-gal-svc { margin-top: 20px; padding-top: 14px; border-top: 1px solid #F0EBDD; }' +
      '\n\n  .gs-gal-svclist { list-style: none; margin: 0; padding: 0; }' +
      '\n  .gs-gal-svclist li { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #F0EBDD; font-size: 13px; }' +
      '\n  .gs-gal-svclist li:last-child { border-bottom: none; }' +
      '\n  .gs-gal-svcdot { width: 6px; height: 6px; border-radius: 50%; background: #C9A227; flex-shrink: 0; }' +
      '\n  .gs-gal-svclevel { color: #6B6B6B; font-weight: 400; }' +
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
  /* "From gallery" (17/10/2026, dueño): la foto se subio de la galeria del telefono o de la PC, no se tomo
     con la camara de la app (el nombre del archivo termina en "-gal", ver gsocd-shared/camera-capture). */
  function fromGallery(p) { return /-gal\.[a-z0-9]+$/i.test(String((p && p.name) || '')); }
  function byLineHtml(p) {
    /* p.dateUnknown (solo Admin, 18/10/2026): de la galeria y el telefono no trajo cuando se tomo. */
    var gal = fromGallery(p) ? '<span class="gs-gal-cap-from">From gallery' + (p.dateUnknown ? ' · date unknown' : '') + '</span>' : '';
    return p && p.takenBy ? '<span class="gs-gal-cap-by">📷 ' + esc(p.takenBy) + gal + '</span>' : (gal ? '<span class="gs-gal-cap-by">' + gal + '</span>' : '');
  }
  function photoCapHtml(p) {
    if (!p) return '';
    /* Foto general (sin servicio): fecha y quien la tomo (21/10/2026: cada foto de la cuadricula lleva su renglon). */
    if (!p.serviceName) return (p.caption ? '<span class="gs-gal-cap-date">' + esc(p.caption) + '</span>' : '') + byLineHtml(p);
    return '<b>' + esc(p.serviceName) + '</b>' +
      (p.level ? ' <span class="gs-gal-cap-level">— ' + esc(p.level) + '</span>' : '') +
      (p.reason ? '<span class="gs-gal-cap-reason">' + esc(p.reason) + '</span>' : '') +
      (p.caption ? '<span class="gs-gal-cap-date">' + esc(p.caption) + '</span>' : '') +
      byLineHtml(p);
  }

  function servicesListHtml(services) {
    if (!services || !services.length) return '';
    var items = services.map(function (s) {
      return '<li><span class="gs-gal-svcdot"></span>' + esc(s.name) +
        (s.level ? ' <span class="gs-gal-svclevel">— ' + esc(s.level) + '</span>' : '') +
        '</li>';
    }).join('');
    return '<div class="gs-gal-col-label">Scheduled Services</div><ul class="gs-gal-svclist">' + items + '</ul>';
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

    /* Antes / despues (v1.69.0; 21/10/2026): fotos de inspeccion (stage
       'inspection') y de trabajo (el resto). Si una orden trae de los dos,
       cada grupo recuerda que esta viendo: 'both' (como abre), 'inspection'
       o 'work'. Vive en closure de render(); se reinicia al volver a llamar
       render() con datos nuevos. */
    var stageState = {};
    var STAGE_LABEL = { inspection: 'Before', work: 'After' };
    function stageOf(p) { return p && p.stage === 'inspection' ? 'inspection' : 'work'; }
    function stageCounts(gi) {
      var c = { inspection: 0, work: 0 };
      (groups[gi].photos || []).forEach(function (p) { c[stageOf(p)]++; });
      return c;
    }
    function hasBoth(gi) { var c = stageCounts(gi); return !!(c.inspection && c.work); }
    function currentStage(gi) {
      if (!hasBoth(gi)) return 'both';
      return stageState[gi] || 'both';
    }
    /* Las secciones que se ven, en orden: [{ stage, idxs }] con los indices
       DENTRO de group.photos, cada seccion de la mas reciente a la mas vieja
       (igual que antes). Con 'both': antes arriba, despues abajo. */
    function sectionsOf(gi) {
      var photos = groups[gi].photos || [];
      var st = currentStage(gi);
      return ['inspection', 'work'].filter(function (k) { return st === 'both' || st === k; }).map(function (k) {
        var idxs = photos.map(function (_, i) { return i; }).filter(function (i) { return stageOf(photos[i]) === k; });
        idxs.sort(function (x, y) { return dateSortKey(photos[y]).localeCompare(dateSortKey(photos[x])); });
        return { stage: k, idxs: idxs };
      }).filter(function (sec) { return sec.idxs.length; });
    }

    function cellHtml(photos, pi) {
      var p = photos[pi];
      return '<div class="gs-gal-cell">' +
        '<div class="gs-gal-photo' + (p.isVideo ? ' video' : '') + ' gs-gal-ph" data-pi="' + pi + '" role="button" tabindex="0">' +
          '<img src="' + escAttr(p.downloadUrl) + '" loading="lazy" alt="">' +
        '</div>' +
        '<div class="gs-gal-cap">' + photoCapHtml(p) + '</div>' +
      '</div>';
    }

    function bodyHtml(gi) {
      var g = groups[gi];
      var photos = g.photos || [];
      var counts = stageCounts(gi);
      var st = currentStage(gi);
      var both = counts.inspection && counts.work;
      var secs = sectionsOf(gi);

      var stageBar = both
        ? '<div class="gs-gal-stages" role="tablist">' +
            [['inspection', 'Before', counts.inspection], ['work', 'After', counts.work], ['both', 'Both', counts.inspection + counts.work]].map(function (t) {
              return '<button type="button" role="tab" class="gs-gal-stage' + (st === t[0] ? ' on' : '') + '" aria-selected="' + (st === t[0]) + '" data-stage="' + t[0] + '">' + t[1] + '<b>' + t[2] + '</b></button>';
            }).join('') +
          '</div>'
        : '';
      var label = both ? '' : '<div class="gs-gal-col-label">' + (counts.inspection && !counts.work ? 'Photos · before' : 'Photos') + '</div>';
      var sectionsHtml = !secs.length ? '<p class="gs-gal-empty">No photos yet.</p>' : secs.map(function (sec) {
        /* El titulo solo cuando se ven las dos (con Before o After ya lo dice la pastilla). */
        var title = (both && st === 'both')
          ? '<div class="gs-gal-section-title">' + STAGE_LABEL[sec.stage] + '<b>' + sec.idxs.length + '</b></div>'
          : '';
        return '<div class="gs-gal-section" data-stage-section="' + sec.stage + '">' + title +
          '<div class="gs-gal-grid">' + sec.idxs.map(function (pi) { return cellHtml(photos, pi); }).join('') + '</div>' +
        '</div>';
      }).join('');

      var svcHtml = servicesListHtml(g.services);
      return label + stageBar + sectionsHtml + (svcHtml ? '<div class="gs-gal-svc">' + svcHtml + '</div>' : '');
    }

    container.innerHTML = groups.map(function (g, gi) {
      var count = (g.photos || []).length;
      var isOpen = opts.openOrderId && g.orderId === opts.openOrderId;

      /* El bloque de nombre + renglones de detalle vive en
         gsocd-shared/order-card-header -- se comparte con
         Approvals/Review/Active/History/Schedule/Processing y demas
         listas de orden en los 3 portales, no solo Gallery. El
         contador de fotos y la flechita son especificos de Gallery,
         asi que van como trailingHtml. */
      var trailing = (opts.statusHtml ? (opts.statusHtml(g) || '') : '') +
        '<span class="gs-gal-grp-count">' + count + '</span>' +
        '<span class="gs-gal-grp-arrow">\u25B8</span>';
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

    /* Abre el visor con las fotos que se ven, en el mismo orden (21/10/2026). Con las dos a la vista, el
       contador dice en cual va ("Before 2 / 4", "After 1 / 3"); sin antes, el contador de siempre. */
    function openViewer(gi, pi) {
      var group = groups[gi];
      if (opts.onPhotoClick) { opts.onPhotoClick(gi, pi, group); return; }
      if (!window.GSLightbox) return;
      var photos = group.photos || [];
      var list = [], sections = [], idx = 0;
      var labeled = hasBoth(gi) || stageCounts(gi).inspection > 0;
      sectionsOf(gi).forEach(function (sec) {
        if (labeled) sections.push({ label: STAGE_LABEL[sec.stage], start: list.length, count: sec.idxs.length });
        sec.idxs.forEach(function (i) { if (i === pi) idx = list.length; list.push(photos[i]); });
      });
      window.GSLightbox.open(list, idx, sections.length ? { sections: sections } : undefined);
    }

    function wireBody(gi) {
      var body = container.querySelector('[data-grp-body="' + gi + '"]');
      if (!body) return;

      body.querySelectorAll('.gs-gal-stage').forEach(function (el) {
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          stageState[gi] = el.dataset.stage;
          body.innerHTML = bodyHtml(gi);
          wireBody(gi);
        });
      });

      body.querySelectorAll('.gs-gal-photo').forEach(function (el) {
        var go = function (ev) {
          ev.stopPropagation();
          openViewer(gi, parseInt(el.dataset.pi, 10));
        };
        el.addEventListener('click', go);
        el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(ev); } });
      });
    }

    container.querySelectorAll('[data-grp-header]').forEach(function (header) {
      header.addEventListener('click', function () {
        header.parentElement.classList.toggle('open');
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

  window.GSGalleryGroups = { render: render, searchHtml: searchHtml };
})();
