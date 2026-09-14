/* ============================================================
   photo-hover-preview.js — preview de foto al pasar el mouse (1s,
   tamano maximo posible en pantalla, sin necesidad de clic), mas la
   funcion que arma la tira de miniaturas de una orden. Aprobado con
   mini en Admingsocd.com el 13/09/2026, extendido despues a
   ordersgsocd.com -- este componente consolida lo que hasta ahora
   vivia copiado a mano en los 2 repos (setupOrderPhotoHoverPreview()/
   setupGalleryHoverPreview() y orderPhotoStripHtml(), identicos salvo
   detalles menores).

   Cubre DOS tipos de miniatura, cada uno con su propia estructura:
   - .order-photo-thumb (Admin: Approvals/Review/Active/History/
     Schedule/Gallery. Orders: Processing/History) -- el <img> mismo.
   - .gs-gal-ph (Gallery, via gsocd-shared/gallery-groups) -- un <div>
     que envuelve un <img> adentro, y tambien se usa para videos
     (.gs-gal-ph.video) -- los videos se excluyen del preview (un
     video pausado agrandado no da el mismo vistazo rapido que una
     foto).

   Uso:
     GSPhotoHoverPreview.setup();               // una sola vez, al cargar la pagina
     GSPhotoHoverPreview.stripHtml(photosArray); // el HTML de la tira, dado un arreglo de fotos

   stripHtml() NO envuelve el resultado en ningun link -- si una
   pagina quiere que la tira completa sea clickeable (como hace Admin,
   mandando a Gallery filtrado a esa orden), envuelve el HTML que este
   devuelve en su propio <a onclick="...">.
============================================================ */
(function () {
  'use strict';

  if (window.GSPhotoHoverPreview) return;

  var STYLE_ID = 'gs-photo-hover-preview-style';
  var OVERLAY_ID = 'gs-hover-preview-overlay';
  var HOVER_DELAY_MS = 1000;

  var hoverTimer = null;
  var overlay = null;
  var previewImg = null;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.order-photo-strip { display: flex; align-items: center; gap: 6px; margin-top: 8px; }' +
      '.order-photo-thumb { width: 34px; height: 34px; border-radius: 4px; object-fit: cover; border: 1px solid var(--border); cursor: pointer; transition: border-color .15s; }' +
      '.order-photo-thumb:hover { border-color: var(--gold); }' +
      '.order-photo-more { font-size: 11px; color: var(--gold-dk, #8C6F2A); font-weight: 700; }' +
      '.gs-hover-preview-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0); z-index: 99999; display: flex; align-items: center; justify-content: center; pointer-events: none; opacity: 0; transition: opacity .15s ease, background .15s ease; }' +
      '.gs-hover-preview-overlay.show { opacity: 1; background: rgba(0,0,0,.82); }' +
      '.gs-hover-preview-overlay img { max-width: 94vw; max-height: 94vh; object-fit: contain; border-radius: 6px; }';
    document.head.appendChild(s);
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'gs-hover-preview-overlay';
      overlay.id = OVERLAY_ID;
      overlay.innerHTML = '<img id="gs-hover-preview-img" src="" alt="">';
      document.body.appendChild(overlay);
    }
    previewImg = document.getElementById('gs-hover-preview-img');
  }

  function hidePreview() {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    if (overlay) overlay.classList.remove('show');
  }

  function findThumb(target) {
    var direct = target.closest('.order-photo-thumb');
    if (direct) return direct;
    var galPh = target.closest('.gs-gal-ph');
    if (galPh && !galPh.classList.contains('video')) return galPh;
    return null;
  }

  function srcOf(thumb) {
    if (thumb.tagName === 'IMG') return thumb.src;
    var img = thumb.querySelector('img');
    return img ? img.src : null;
  }

  var wired = false;
  function setup() {
    injectStyle();
    ensureOverlay();
    if (wired) return;
    wired = true;

    document.addEventListener('mouseover', function (e) {
      var thumb = findThumb(e.target);
      if (!thumb) return;
      var src = srcOf(thumb);
      if (!src) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () {
        previewImg.src = src;
        overlay.classList.add('show');
      }, HOVER_DELAY_MS);
    });

    document.addEventListener('mouseout', function (e) {
      var thumb = findThumb(e.target);
      if (!thumb) return;
      if (thumb.contains(e.relatedTarget)) return;
      hidePreview();
    });
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function stripHtml(photos) {
    if (!photos || !photos.length) return '';
    var shown = photos.slice(0, 3);
    var extra = photos.length - shown.length;
    var thumbsHtml = shown.map(function (p) {
      return '<img class="order-photo-thumb" src="' + esc(p.downloadUrl) + '" loading="lazy">';
    }).join('');
    var moreHtml = extra > 0 ? '<span class="order-photo-more">+' + extra + '</span>' : '';
    return '<div class="order-photo-strip">' + thumbsHtml + moreHtml + '</div>';
  }

  window.GSPhotoHoverPreview = { setup: setup, stripHtml: stripHtml };
})();
