/* ============================================================
   gsocd-shared / gallery-groups
   Formato OFICIAL para mostrar fotos/videos agrupados por orden --
   cada orden es una tarjeta desplegable (mismo lenguaje visual que
   las categorias de servicio: beige F7F6F3 cerrada, EDE7D8 abierta,
   flechita que gira), con su cuadricula de miniaturas adentro.

   Reemplaza el HTML de galeria que se repetia por separado en
   Tech (employee.html/supervisor.html) y ahora tambien en Admin.

   Uso:
     <div id="myGallery"></div>
     <script>
       GSGalleryGroups.render('myGallery', groups, {
         emptyMessage: 'No photos yet.',
         onPhotoClick: function(groupIndex, photoIndex, group) {
           GSLightbox.open(group.photos, photoIndex);
         }
       });
     </script>

   "groups" es un arreglo de:
     { orderId, clientLabel, date (string ya formateada), photos: [
         { downloadUrl, isVideo (opcional, bool) }
     ] }

   Si se omite onPhotoClick, se usa GSLightbox.open(group.photos, i)
   automaticamente si GSLightbox esta disponible en la pagina.

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
    tag.textContent = "\n  .gs-gal-search { display: flex; align-items: center; gap: 10px; border: 1px solid #E0D9CC; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; }\n  .gs-gal-search svg { width: 15px; height: 15px; color: #8C6F2A; flex-shrink: 0; }\n  .gs-gal-search input { border: none; outline: none; font-size: 13px; font-family: inherit; color: #111; width: 100%; background: none; }\n  .gs-gal-search input::placeholder { color: #999; }\n\n  .gs-gal-grp { border: 1px solid #F0EBDD; border-radius: 6px; margin-bottom: 10px; overflow: hidden; }\n  .gs-gal-grp-header { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #F7F6F3; cursor: pointer; transition: background .15s; }\n  .gs-gal-grp.open > .gs-gal-grp-header { background: #EDE7D8; }\n  .gs-gal-grp-order { font-weight: 700; font-size: 14px; color: #111; white-space: nowrap; }\n  .gs-gal-grp-count { background: #E9DDBB; color: #6B5A22; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px; }\n  .gs-gal-grp-meta { font-size: 12px; color: #8C6F2A; margin-left: auto; text-align: right; }\n  .gs-gal-grp-meta .gs-gal-client { display: block; color: #6B6B6B; font-weight: 400; }\n  .gs-gal-grp-arrow { color: #999; font-size: 11px; transition: transform .2s; flex-shrink: 0; }\n  .gs-gal-grp.open > .gs-gal-grp-header .gs-gal-grp-arrow { transform: rotate(90deg); }\n\n  .gs-gal-grp-body { display: none; padding: 16px; background: #fff; }\n  .gs-gal-grp.open > .gs-gal-grp-body { display: block; }\n\n  .gs-gal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; }\n  .gs-gal-ph { position: relative; aspect-ratio: 1; border-radius: 6px; overflow: hidden; cursor: pointer; background: #eee; }\n  .gs-gal-ph img { width: 100%; height: 100%; object-fit: cover; display: block; }\n  .gs-gal-ph.video::after { content: \"\\25B6\"; position: absolute; bottom: 4px; right: 5px; color: #FFF3D6; font-size: 9px; background: rgba(17,17,17,.55); width: 15px; height: 15px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }\n\n  .gs-gal-empty { font-size: 13px; color: #999; text-align: center; padding: 40px 0; }\n";
    document.head.appendChild(tag);
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function render(containerId, groups, opts) {
    styleTag();
    opts = opts || {};
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!groups || !groups.length) {
      container.innerHTML = '<p class="gs-gal-empty">' + esc(opts.emptyMessage || 'No photos yet.') + '</p>';
      return;
    }

    container.innerHTML = groups.map(function (g, gi) {
      var count = (g.photos || []).length;
      var photosHtml = (g.photos || []).map(function (p, pi) {
        var videoClass = p.isVideo ? ' video' : '';
        return '<div class="gs-gal-ph' + videoClass + '" data-gi="' + gi + '" data-pi="' + pi + '">' +
          '<img src="' + escAttr(p.downloadUrl) + '" loading="lazy" alt="">' +
          '</div>';
      }).join('');

      return '' +
        '<div class="gs-gal-grp">' +
          '<div class="gs-gal-grp-header">' +
            '<span class="gs-gal-grp-order">' + esc(g.orderId) + '</span>' +
            '<span class="gs-gal-grp-count">' + count + '</span>' +
            '<span class="gs-gal-grp-meta">' + esc(g.date || '') +
              (g.clientLabel ? '<span class="gs-gal-client">' + esc(g.clientLabel) + '</span>' : '') +
            '</span>' +
            '<span class="gs-gal-grp-arrow">\u25B8</span>' +
          '</div>' +
          '<div class="gs-gal-grp-body"><div class="gs-gal-grid">' + photosHtml + '</div></div>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.gs-gal-grp-header').forEach(function (header) {
      header.addEventListener('click', function () {
        header.parentElement.classList.toggle('open');
      });
    });

    container.querySelectorAll('.gs-gal-ph').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var gi = parseInt(el.dataset.gi, 10);
        var pi = parseInt(el.dataset.pi, 10);
        var group = groups[gi];
        if (opts.onPhotoClick) {
          opts.onPhotoClick(gi, pi, group);
        } else if (window.GSLightbox) {
          window.GSLightbox.open(group.photos, pi);
        }
      });
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
