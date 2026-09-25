/* ============================================================
   gsocd-shared / gallery-groups
   Formato OFICIAL para mostrar fotos/videos agrupados por orden --
   cada orden es una tarjeta desplegable (mismo lenguaje visual que
   las categorias de servicio: beige F7F6F3 cerrada, EDE7D8 abierta,
   flechita que gira), con su contenido adentro.

   Reemplaza el HTML de galeria que se repetia por separado en
   Tech (employee.html/supervisor.html) y ahora tambien en Admin.

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
         onPhotoClick: function(groupIndex, photoIndex, group) {
           GSLightbox.open(group.photos, photoIndex);
         }
       });
     </script>

   "groups" es un arreglo de:
     { orderId, clientLabel, date (string ya formateada),
       bedrooms, bathrooms, division, supervisor, unitNumber,
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
      '\n\n  .gs-gal-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }' +
      '\n  @media (max-width: 560px) { .gs-gal-2col { grid-template-columns: 1fr; } }' +
      '\n  .gs-gal-col-label { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #6B6B6B; margin-bottom: 10px; }' +
      '\n\n  .gs-gal-hero { position: relative; width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden; cursor: pointer; background: #eee; }' +
      '\n  .gs-gal-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }' +
      '\n  .gs-gal-hero.video::after { content: "\\25B6"; position: absolute; top: 8px; right: 9px; color: #FFF3D6; font-size: 13px; background: rgba(17,17,17,.6); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }' +
      '\n  .gs-gal-hero-cap { font-size: 11.5px; color: #111; margin: 6px 0 10px; min-height: 14px; }' +
      '\n  .gs-gal-hero-cap b { font-weight: 700; }' +
      '\n  .gs-gal-cap-level { color: #6B6B6B; font-weight: 400; }' +
      '\n  .gs-gal-cap-reason { display: block; color: #8C6F2A; font-style: italic; font-size: 10.5px; margin-top: 1px; }' +
      '\n  .gs-gal-cap-date { display: block; color: #6B6B6B; font-size: 10.5px; margin-top: 1px; }' +
      '\n\n  .gs-gal-stages { display: inline-flex; gap: 4px; background: #F2EEE4; border-radius: 99px; padding: 3px; margin-bottom: 10px; }' +
      '\n  .gs-gal-stage { all: unset; cursor: pointer; font-size: 11.5px; font-weight: 600; padding: 5px 12px; border-radius: 99px; color: #6B6B6B; }' +
      '\n  .gs-gal-stage b { font-weight: 700; margin-left: 4px; color: #8C6F2A; }' +
      '\n  .gs-gal-stage.on { background: #fff; color: #111; box-shadow: 0 1px 2px rgba(0,0,0,.08); }' +
      '\n  .gs-gal-stage:focus-visible { outline: 2px solid #C9A227; outline-offset: 1px; }' +
      '\n\n  .gs-gal-thumb-strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }' +
      '\n  .gs-gal-thumb-wrap { flex: 0 0 auto; width: 56px; }' +
      '\n  .gs-gal-thumb { position: relative; width: 56px; height: 56px; border-radius: 6px; overflow: hidden; cursor: pointer; background: #eee; }' +
      '\n  .gs-gal-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }' +
      '\n  .gs-gal-thumb.video::after { content: "\\25B6"; position: absolute; bottom: 3px; right: 3px; color: #FFF3D6; font-size: 8px; background: rgba(17,17,17,.6); width: 13px; height: 13px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }' +
      '\n  .gs-gal-thumb-cap { font-size: 9px; color: #6B6B6B; text-align: center; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
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

  function photoCapHtml(p) {
    if (!p || !p.serviceName) return '';
    return '<b>' + esc(p.serviceName) + '</b>' +
      (p.level ? ' <span class="gs-gal-cap-level">— ' + esc(p.level) + '</span>' : '') +
      (p.reason ? '<span class="gs-gal-cap-reason">' + esc(p.reason) + '</span>' : '') +
      (p.caption ? '<span class="gs-gal-cap-date">' + esc(p.caption) + '</span>' : '');
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

    /* photoOrderState: por-grupo, el orden ROTADO de las fotos (el
       indice 0 es la que esta de "hero"/grande en este momento).
       Arranca ordenado por fecha (mas reciente primero) la primera
       vez que se pinta cada grupo. Vive en closure de render(); se
       reinicia si se vuelve a llamar render() con datos nuevos. */
    var photoOrderState = {};
    /* Antes / despues (v1.69.0): fotos de inspeccion (stage
       'inspection') y de trabajo (el resto). Si una orden trae de los
       dos, cada grupo recuerda que pestaña esta viendo; arranca en
       Work (el resultado), o en Inspection si todavia no hay de
       trabajo. */
    var stageState = {};
    function stageOf(p) { return p && p.stage === 'inspection' ? 'inspection' : 'work'; }
    function stageCounts(gi) {
      var c = { inspection: 0, work: 0 };
      (groups[gi].photos || []).forEach(function (p) { c[stageOf(p)]++; });
      return c;
    }
    function currentStage(gi) {
      if (!stageState[gi]) stageState[gi] = stageCounts(gi).work ? 'work' : 'inspection';
      return stageState[gi];
    }

    function currentOrder(gi) {
      var key = gi + ':' + currentStage(gi);
      if (!photoOrderState[key]) {
        var photos = groups[gi].photos || [];
        var st = currentStage(gi);
        var idxs = photos.map(function (_, i) { return i; }).filter(function (i) { return stageOf(photos[i]) === st; });
        idxs.sort(function (a, b) { return dateSortKey(photos[b]).localeCompare(dateSortKey(photos[a])); });
        photoOrderState[key] = idxs;
      }
      return photoOrderState[key];
    }

    function bodyHtml(gi) {
      var g = groups[gi];
      var photos = g.photos || [];
      var ord = currentOrder(gi);
      var heroIdx = ord[0];
      var hero = photos[heroIdx];

      var heroHtml = !hero ? '<p class="gs-gal-empty">No photos yet.</p>' : (
        '<div class="gs-gal-hero' + (hero.isVideo ? ' video' : '') + ' gs-gal-ph" data-pi="' + heroIdx + '">' +
          '<img src="' + escAttr(hero.downloadUrl) + '" loading="lazy" alt="">' +
        '</div>' +
        '<div class="gs-gal-hero-cap">' + photoCapHtml(hero) + '</div>'
      );

      var thumbsHtml = ord.slice(1).map(function (pi) {
        var p = photos[pi];
        return '<div class="gs-gal-thumb-wrap">' +
          '<div class="gs-gal-thumb' + (p.isVideo ? ' video' : '') + ' gs-gal-ph" data-pi="' + pi + '">' +
            '<img src="' + escAttr(p.downloadUrl) + '" loading="lazy" alt="">' +
          '</div>' +
          (p.serviceName ? '<div class="gs-gal-thumb-cap">' + esc(p.serviceName) + '</div>' : '') +
        '</div>';
      }).join('');

      var counts = stageCounts(gi);
      var st = currentStage(gi);
      var stageBar = (counts.inspection && counts.work)
        ? '<div class="gs-gal-stages" role="tablist">' +
            '<button type="button" role="tab" class="gs-gal-stage' + (st === 'inspection' ? ' on' : '') + '" aria-selected="' + (st === 'inspection') + '" data-stage="inspection">Inspection · before<b>' + counts.inspection + '</b></button>' +
            '<button type="button" role="tab" class="gs-gal-stage' + (st === 'work' ? ' on' : '') + '" aria-selected="' + (st === 'work') + '" data-stage="work">Work · after<b>' + counts.work + '</b></button>' +
          '</div>'
        : '';
      var label = stageBar ? '' : '<div class="gs-gal-col-label">' + (counts.inspection && !counts.work ? 'Inspection photos · before' : 'Photos') + '</div>';
      var photosCol = label + stageBar + heroHtml +
        (thumbsHtml ? '<div class="gs-gal-thumb-strip">' + thumbsHtml + '</div>' : '');

      var svcHtml = servicesListHtml(g.services);

      return '<div class="gs-gal-2col">' +
        '<div>' + photosCol + '</div>' +
        (svcHtml ? '<div>' + svcHtml + '</div>' : '') +
      '</div>';
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
      var trailing = '<span class="gs-gal-grp-count">' + count + '</span>' +
        '<span class="gs-gal-grp-arrow">\u25B8</span>';
      var headerInner = window.GSOrderCardHeader
        ? window.GSOrderCardHeader.html({
            name: g.clientLabel || g.orderId,
            orderId: g.orderId,
            division: g.division,
            unitNumber: g.unitNumber,
            bedrooms: g.bedrooms,
            bathrooms: g.bathrooms,
            supervisor: g.supervisor,
            completedDateText: g.completedDate ? fmtGroupDate(g.completedDate) : ''
          }, { trailingHtml: trailing })
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

      var heroEl = body.querySelector('.gs-gal-hero');
      if (heroEl) {
        heroEl.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var pi = parseInt(heroEl.dataset.pi, 10);
          var group = groups[gi];
          if (opts.onPhotoClick) {
            opts.onPhotoClick(gi, pi, group);
          } else if (window.GSLightbox) {
            window.GSLightbox.open(group.photos, pi);
          }
        });
      }

      body.querySelectorAll('.gs-gal-stage').forEach(function (el) {
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          stageState[gi] = el.dataset.stage;
          body.innerHTML = bodyHtml(gi);
          wireBody(gi);
        });
      });

      body.querySelectorAll('.gs-gal-thumb').forEach(function (el) {
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var pi = parseInt(el.dataset.pi, 10);
          var ord = currentOrder(gi);
          var pos = ord.indexOf(pi);
          if (pos > 0) {
            /* ROTACION real: la miniatura que se pica se va al frente,
               y todas las demas se recorren en el mismo orden circular
               -- NO es un intercambio de solo 2 lugares. */
            photoOrderState[gi + ':' + currentStage(gi)] = ord.slice(pos).concat(ord.slice(0, pos));
          }
          body.innerHTML = bodyHtml(gi);
          wireBody(gi);
        });
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
