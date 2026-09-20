/* ============================================================
   gsocd-shared / gallery-groups
   Formato OFICIAL para mostrar fotos/videos agrupados por orden --
   cada orden es una tarjeta desplegable (mismo lenguaje visual que
   las categorias de servicio: beige F7F6F3 cerrada, EDE7D8 abierta,
   flechita que gira), con su cuadricula de miniaturas adentro.

   Reemplaza el HTML de galeria que se repetia por separado en
   Tech (employee.html/supervisor.html) y ahora tambien en Admin.

   v1.29.0 (19/09/2026): rediseño aprobado con mini interactivo --
   dentro de cada orden, las fotos ya NO son una cuadricula pareja.
   Se separan en 2 secciones:
     - "Fotos del departamento" (photo.serviceName vacio/null) --
       arriba, en 2 columnas, tamaño grande (~3x el de una foto de
       servicio), siempre ordenadas por fecha (mas reciente primero).
     - "Por servicio" (photo.serviceName presente) -- abajo, en
       filas chiquitas de 2 columnas (thumb + nombre del servicio +
       fecha), con un boton "Ordenar" (chip compacto, arriba a la
       derecha de la cuadricula) que despliega un popover angosto
       para elegir Por fecha / Por servicio -- no ocupa espacio
       permanente, se cierra solo al hacer clic fuera. El "Ordenar"
       es POR ORDEN (independiente) -- a peticion explicita del
       dueño, no es un control global para toda la galeria.
   v1.29.5 (19/09/2026): CORRECCION -- v1.29.4 forzo 2 columnas en las
   FOTOS de adentro de cada orden por un malentendido ("dos columnas"
   se referia a las TARJETAS de orden en la lista de Galeria, no a las
   fotos). Se revierte el forzado de columnas en las fotos (vuelven a
   auto-fill/auto-fit, como en v1.29.3 -- se acomodan solas, sin
   encogerse para caber exactamente 2) y se agrega lo que si se pidio:
   las tarjetas de orden (.gs-gal-grp) se muestran en 2 columnas via
   una clase nueva en el contenedor (.gs-gal-cards-2col), 1 sola
   columna en pantallas angostas (<=700px) porque 2 tarjetas abiertas
   con su propia cuadricula de fotos adentro no caben lado a lado en
   un telefono sin verse aplastadas.

   v1.29.4 (19/09/2026): ajuste tras feedback real del dueño sobre
   v1.29.2/v1.29.3 --
     - Las 2 secciones son SIEMPRE 2 columnas (antes "Fotos del
       departamento" usaba auto-fill de 3in exactas, que en un
       telefono angosto colapsaba a 1 sola columna y se veia
       inconsistente contra "Por servicio" que si tenia 2). El 3in/
       1.5in de v1.29.3 ahora es un TOPE maximo, no un tamaño fijo --
       la foto se encoge para caber en su columna (min-width:0 en el
       grid item + max-width en la foto) en vez de desbordar.
     - "Por servicio" ahora muestra nombre + nivel (L1/L2/L3, si el
       servicio es Janitorial) + la nota/razon (NotCompletedReason,
       si la hay) -- mismo patron que las tarjetas .svc-row del resto
       de la app (Active > Update Services, Approvals, etc.), a
       peticion explicita del dueño ("que salgan los detalles del
       servicio como en las otras tarjetas"). Requiere que cada foto
       traiga level (string o '') y reason (string o '') por separado
       -- antes iban mezclados dentro de caption como texto.

   Requiere que cada foto traiga serviceName (string o null/undefined)
   y sortKey (ISO string, para poder ordenar de verdad por fecha --
   el caption ya viene formateado como texto para mostrar, no sirve
   para ordenar). Si una foto no trae sortKey, se cae a caption como
   ordenar-por-texto (mejor que nada, pero avisado: no es
   cronologicamente exacto entre meses/años distintos).
   Compatibilidad: una foto sin serviceName cae en "Fotos del
   departamento" -- no truena con datos viejos que no lo manden.

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
     { orderId, clientLabel, date (string ya formateada), photos: [
         { downloadUrl, isVideo (opcional, bool),
           serviceName (string o null -- null/ausente = foto del
             departamento, no ligada a ningun servicio),
           caption (texto ya formateado para mostrar, ej. fecha +
             nota opcional),
           sortKey (opcional, string ISO -- para ordenar de verdad
             por fecha; si falta, se ordena por caption como texto) }
     ] }

   Si se omite onPhotoClick, se usa GSLightbox.open(group.photos, i)
   automaticamente si GSLightbox esta disponible en la pagina. El
   indice "i" que se manda es siempre el indice DENTRO de
   group.photos (el arreglo completo, orden original del backend),
   sin importar en que seccion (departamento/servicio) ni en que
   orden de "Ordenar" se este mostrando en ese momento -- asi el
   lightbox puede navegar prev/next sobre la lista completa real.

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
    tag.textContent = "\n  .gs-gal-search { display: flex; align-items: center; gap: 10px; border: 1px solid #E0D9CC; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; }\n  .gs-gal-search svg { width: 15px; height: 15px; color: #8C6F2A; flex-shrink: 0; }\n  .gs-gal-search input { border: none; outline: none; font-size: 13px; font-family: inherit; color: #111; width: 100%; background: none; }\n  .gs-gal-search input::placeholder { color: #999; }\n\n  .gs-gal-grp { border: 1px solid #F0EBDD; border-radius: 6px; margin-bottom: 10px; overflow: hidden; }\n  .gs-gal-grp-header { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #F7F6F3; cursor: pointer; }\n  .gs-gal-grp.open > .gs-gal-grp-header { background: #EDE7D8; }\n  .gs-gal-grp-order { font-weight: 700; font-size: 14px; color: #111; white-space: nowrap; }\n  .gs-gal-grp-count { background: #E9DDBB; color: #6B5A22; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px; }\n  .gs-gal-grp-meta { font-size: 12px; color: #8C6F2A; margin-left: auto; text-align: right; }\n  .gs-gal-grp-meta .gs-gal-client { display: block; color: #6B6B6B; font-weight: 400; }\n  .gs-gal-grp-arrow { color: #999; font-size: 11px; transition: transform .2s; flex-shrink: 0; }\n  .gs-gal-grp.open > .gs-gal-grp-header .gs-gal-grp-arrow { transform: rotate(90deg); }\n\n  .gs-gal-grp-body { display: none; padding: 16px; background: #fff; }\n  .gs-gal-grp.open > .gs-gal-grp-body { display: block; }\n\n  .gs-gal-empty { font-size: 13px; color: #999; text-align: center; padding: 40px 0; }\n\n  .gs-gal-tools { display: flex; justify-content: flex-end; margin-bottom: 10px; position: relative; }\n  .gs-gal-sort-btn { display: flex; align-items: center; gap: 5px; background: #fff; border: 1px solid #E0D9CC; border-radius: 20px; padding: 5px 10px; font-size: 11px; font-weight: 600; color: #6B6B6B; cursor: pointer; user-select: none; transition: border-color .15s, color .15s; }\n  .gs-gal-sort-btn:hover, .gs-gal-sort-btn.open { border-color: #C9A227; color: #8C6F2A; }\n  .gs-gal-sort-btn svg { width: 12px; height: 12px; flex-shrink: 0; }\n  .gs-gal-sort-pop { display: none; position: absolute; top: calc(100% + 6px); right: 0; background: #fff; border: 1px solid #E0D9CC; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,.09); padding: 4px; z-index: 5; min-width: 150px; }\n  .gs-gal-sort-pop.open { display: block; }\n  .gs-gal-sort-opt { display: flex; align-items: center; gap: 7px; padding: 8px 10px; font-size: 12.5px; border-radius: 6px; cursor: pointer; color: #111; }\n  .gs-gal-sort-opt:hover { background: #F7F6F3; }\n  .gs-gal-sort-opt.active { color: #8C6F2A; font-weight: 700; }\n  .gs-gal-sort-opt .gs-gal-sort-dot { width: 5px; height: 5px; border-radius: 50%; background: #C9A227; opacity: 0; }\n  .gs-gal-sort-opt.active .gs-gal-sort-dot { opacity: 1; }\n\n  .gs-gal-section-label { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #6B6B6B; margin: 2px 0 8px; }\n  .gs-gal-section-label:not(:first-child) { margin-top: 6px; }\n\n  .gs-gal-dept-grid { display: grid; grid-template-columns: repeat(auto-fill, 3in); gap: 10px; margin-bottom: 18px; }\n  .gs-gal-dept-ph { position: relative; width: 3in; height: 3in; border-radius: 8px; overflow: hidden; cursor: pointer; background: #eee; box-shadow: 0 1px 3px rgba(0,0,0,.08); }\n  .gs-gal-dept-ph img { width: 100%; height: 100%; object-fit: cover; display: block; }\n  .gs-gal-dept-ph.video::after { content: \"\\25B6\"; position: absolute; top: 6px; right: 7px; color: #FFF3D6; font-size: 11px; background: rgba(17,17,17,.6); width: 19px; height: 19px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }\n  .gs-gal-dept-cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 8px 9px 7px; background: linear-gradient(to top, rgba(0,0,0,.62), rgba(0,0,0,0)); color: #fff; font-size: 10.5px; }\n\n  .gs-gal-svc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 10px; }\n  .gs-gal-svc-row { display: flex; align-items: center; gap: 9px; padding: 6px; border-radius: 7px; cursor: pointer; }\n  .gs-gal-svc-row:hover { background: #F7F6F3; }\n  .gs-gal-svc-thumb { position: relative; width: 1.5in; height: 1.5in; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: #eee; }\n  .gs-gal-svc-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }\n  .gs-gal-svc-thumb.video::after { content: \"\\25B6\"; position: absolute; bottom: 4px; right: 4px; color: #FFF3D6; font-size: 11px; background: rgba(17,17,17,.6); width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }\n  .gs-gal-svc-info { min-width: 0; }\n  .gs-gal-svc-name { font-size: 12px; font-weight: 700; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n  .gs-gal-svc-level { font-weight: 400; color: #6B6B6B; }\n  .gs-gal-svc-reason { font-size: 10.5px; color: #8C6F2A; font-style: italic; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n  .gs-gal-svc-date { font-size: 10.5px; color: #6B6B6B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n\n  /* Tarjetas de ORDEN en 2 columnas (no las fotos de adentro -- eso\n     se malentendio antes). En mobile 1 sola columna: 2 tarjetas\n     abiertas, cada una con su propia cuadricula de fotos adentro, no\n     caben lado a lado en un telefono sin verse aplastadas. */\n  .gs-gal-cards-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }\n  @media (max-width: 700px) {\n    .gs-gal-cards-2col { grid-template-columns: 1fr; }\n  }\n";
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
     cual a este componente, sin formatear, asi que el encabezado de
     cada grupo de fotos mostraba la fecha Y HORA UTC crudas. Solo
     Tech lo formateaba ANTES de llamar (fmtDate(g.date) en
     supervisor.html). Se arregla aqui adentro -- asi ningun llamador
     tiene que acordarse. Si detecta un timestamp ISO completo, lo
     convierte a fecha local corta (solo dia, sin hora -- un grupo de
     fotos puede tener varias del mismo dia a horas distintas, la
     hora individual ya la trae cada foto en su propio caption). Si
     ya viene como texto corto (por compatibilidad con quien lo siga
     pre-formateando), se deja tal cual, sin tocarlo. */
  function fmtGroupDate(v) {
    if (!v) return '';
    if (!/^\d{4}-\d{2}-\d{2}T/.test(String(v))) return String(v);
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /* Clave de ordenar por fecha: usa sortKey (ISO) si la foto lo trae
     -- compara bien como texto porque ISO ya viene año-mes-dia. Si
     falta (dato viejo, backend sin actualizar todavia), se cae al
     caption tal cual -- no es exacto entre meses/años distintos pero
     no truena. */
  function dateSortKey(p) {
    return (p && (p.sortKey || p.caption)) || '';
  }

  function renderDeptSection(gi, deptEntries) {
    if (!deptEntries.length) return '';
    var tiles = deptEntries.map(function (e) {
      var p = e.photo, pi = e.index;
      var videoClass = p.isVideo ? ' video' : '';
      /* clase "gs-gal-ph" a proposito, sin estilos propios aqui --
         es el gancho que gsocd-shared/photo-hover-preview usa para
         detectar miniaturas de Gallery (closest('.gs-gal-ph')). Se
         perdio en el rediseño (19/09/2026, reportado por el dueño:
         "se me hace que les quitaste... que se hicieran grandes si
         se dejaba el mouse ahi") porque las clases nuevas no la
         traian -- sin tocar photo-hover-preview.js, que sigue
         sirviendo a Admin/Orders fuera de Gallery tambien. */
      return '<div class="gs-gal-dept-ph gs-gal-ph' + videoClass + '" data-gi="' + gi + '" data-pi="' + pi + '">' +
        '<img src="' + escAttr(p.downloadUrl) + '" loading="lazy" alt="">' +
        (p.caption ? '<div class="gs-gal-dept-cap">' + esc(p.caption) + '</div>' : '') +
      '</div>';
    }).join('');
    return '<div class="gs-gal-section-label">Fotos del departamento</div>' +
      '<div class="gs-gal-dept-grid">' + tiles + '</div>';
  }

  function renderSvcSection(gi, svcEntries) {
    if (!svcEntries.length) return '';
    var rows = svcEntries.map(function (e) {
      var p = e.photo, pi = e.index;
      var videoClass = p.isVideo ? ' video' : '';
      return '<div class="gs-gal-svc-row" data-gi="' + gi + '" data-pi="' + pi + '">' +
        '<div class="gs-gal-svc-thumb gs-gal-ph' + videoClass + '"><img src="' + escAttr(p.downloadUrl) + '" loading="lazy" alt=""></div>' +
        '<div class="gs-gal-svc-info">' +
          '<div class="gs-gal-svc-name">' + esc(p.serviceName) + (p.level ? ' <span class="gs-gal-svc-level">— ' + esc(p.level) + '</span>' : '') + '</div>' +
          (p.reason ? '<div class="gs-gal-svc-reason">' + esc(p.reason) + '</div>' : '') +
          (p.caption ? '<div class="gs-gal-svc-date">' + esc(p.caption) + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="gs-gal-section-label">Por servicio</div>' +
      '<div class="gs-gal-svc-grid">' + rows + '</div>';
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

    /* sortState: por-grupo (gi -> 'date' | 'service'), asi cada
       orden mantiene su propio "Ordenar" de forma independiente --
       a peticion explicita del dueño, no es un control global para
       toda la galeria. Vive en closure de render(); se reinicia si
       se vuelve a llamar render() con una lista nueva de grupos. */
    var sortState = {};

    function bodyHtml(gi) {
      var g = groups[gi];
      var all = (g.photos || []).map(function (p, pi) { return { photo: p, index: pi }; });
      var dept = all.filter(function (e) { return !e.photo.serviceName; });
      var svc = all.filter(function (e) { return !!e.photo.serviceName; });

      dept.sort(function (a, b) { return dateSortKey(b.photo).localeCompare(dateSortKey(a.photo)); });

      var mode = sortState[gi] || 'date';
      svc = svc.slice();
      if (mode === 'service') {
        svc.sort(function (a, b) {
          var byName = String(a.photo.serviceName).localeCompare(String(b.photo.serviceName));
          return byName !== 0 ? byName : dateSortKey(b.photo).localeCompare(dateSortKey(a.photo));
        });
      } else {
        svc.sort(function (a, b) { return dateSortKey(b.photo).localeCompare(dateSortKey(a.photo)); });
      }

      var toolsHtml = svc.length ? (
        '<div class="gs-gal-tools">' +
          '<div class="gs-gal-sort-btn" data-sort-toggle="' + gi + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M6 12h12M10 18h4"/></svg>' +
            'Ordenar' +
          '</div>' +
          '<div class="gs-gal-sort-pop" data-sort-pop="' + gi + '">' +
            '<div class="gs-gal-sort-opt' + (mode === 'date' ? ' active' : '') + '" data-sort-opt="' + gi + '" data-sort-mode="date"><span class="gs-gal-sort-dot"></span>Por fecha</div>' +
            '<div class="gs-gal-sort-opt' + (mode === 'service' ? ' active' : '') + '" data-sort-opt="' + gi + '" data-sort-mode="service"><span class="gs-gal-sort-dot"></span>Por servicio</div>' +
          '</div>' +
        '</div>'
      ) : '';

      return toolsHtml + renderDeptSection(gi, dept) + renderSvcSection(gi, svc);
    }

    container.innerHTML = groups.map(function (g, gi) {
      var count = (g.photos || []).length;
      var isOpen = opts.openOrderId && g.orderId === opts.openOrderId;

      return '' +
        '<div class="gs-gal-grp' + (isOpen ? ' open' : '') + '"' + (isOpen ? ' id="gs-gal-open-target"' : '') + '>' +
          '<div class="gs-gal-grp-header" data-grp-header="' + gi + '">' +
            '<span class="gs-gal-grp-order">' + esc(g.orderId) + '</span>' +
            '<span class="gs-gal-grp-count">' + count + '</span>' +
            '<span class="gs-gal-grp-meta">' + esc(fmtGroupDate(g.date)) +
              (g.clientLabel ? '<span class="gs-gal-client">' + esc(g.clientLabel) + '</span>' : '') +
            '</span>' +
            '<span class="gs-gal-grp-arrow">\u25B8</span>' +
          '</div>' +
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

      var sortBtn = body.querySelector('[data-sort-toggle="' + gi + '"]');
      var sortPop = body.querySelector('[data-sort-pop="' + gi + '"]');
      if (sortBtn && sortPop) {
        sortBtn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var willOpen = !sortPop.classList.contains('open');
          container.querySelectorAll('.gs-gal-sort-pop.open').forEach(function (p) { p.classList.remove('open'); });
          container.querySelectorAll('.gs-gal-sort-btn.open').forEach(function (b) { b.classList.remove('open'); });
          if (willOpen) { sortPop.classList.add('open'); sortBtn.classList.add('open'); }
        });
        body.querySelectorAll('[data-sort-opt="' + gi + '"]').forEach(function (opt) {
          opt.addEventListener('click', function (ev) {
            ev.stopPropagation();
            sortState[gi] = opt.getAttribute('data-sort-mode');
            body.innerHTML = bodyHtml(gi);
            wireBody(gi);
          });
        });
      }

      body.querySelectorAll('.gs-gal-dept-ph, .gs-gal-svc-row').forEach(function (el) {
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var gi2 = parseInt(el.dataset.gi, 10);
          var pi2 = parseInt(el.dataset.pi, 10);
          var group = groups[gi2];
          if (opts.onPhotoClick) {
            opts.onPhotoClick(gi2, pi2, group);
          } else if (window.GSLightbox) {
            window.GSLightbox.open(group.photos, pi2);
          }
        });
      });
    }

    container.querySelectorAll('[data-grp-header]').forEach(function (header) {
      header.addEventListener('click', function () {
        header.parentElement.classList.toggle('open');
      });
    });

    groups.forEach(function (g, gi) { wireBody(gi); });

    /* cerrar cualquier popover de "Ordenar" abierto al hacer clic
       fuera -- un solo listener en el container, no uno por grupo */
    container.addEventListener('click', function () {
      container.querySelectorAll('.gs-gal-sort-pop.open').forEach(function (p) { p.classList.remove('open'); });
      container.querySelectorAll('.gs-gal-sort-btn.open').forEach(function (b) { b.classList.remove('open'); });
    });
  }

  function searchHtml(inputId, placeholder) {
    return '<div class="gs-gal-search">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '<input type="text" id="' + escAttr(inputId) + '" placeholder="' + escAttr(placeholder || 'Search by order number or client...') + '">' +
      '</div>';
  }

  window.GSGalleryGroups = { render: render, searchHtml: searchHtml };
})();
