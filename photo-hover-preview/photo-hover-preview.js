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
   Picar una miniatura de la tira la abre en grande (necesita gsocd-shared/lightbox en la pagina), igual en
   los 3 portales.
     GSPhotoHoverPreview.stripHtml(photos, opts)   (30/10/2026, CFO: Tech usa esta tira, no la suya)
       opts.max       -- cuantas miniaturas (3); las demas son "+N"
       opts.more      -- false: sin "+N"
       opts.className -- clase de mas en la tira (tamaño propio de cada pantalla)
       opts.badge(p)  -- HTML encima de cada miniatura (Tech: ⏳ subiendo / ⚠️ no subio)
       opts.dim(p)    -- true: la miniatura medio transparente (todavia subiendo)
       opts.count     -- numero encima de la primera (Tech: fotos de ese servicio)
       opts.key       -- (opcional) nombre fijo de la tira, si la pantalla arma un arreglo nuevo cada vez
     Un video se enseña con su miniatura (p.thumbUrl) y no sale en la vista previa.

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
      '.order-photo-wrap { position: relative; display: inline-flex; flex-shrink: 0; cursor: pointer; }' +
      '.order-photo-wrap.dim .order-photo-thumb { opacity: .55; }' +
      '.order-photo-badge { position: absolute; right: 1px; bottom: 1px; font-size: 9px; line-height: 1; background: rgba(255,255,255,.9); border-radius: 3px; padding: 1px 2px; pointer-events: none; }' +
      '.order-photo-count { position: absolute; left: 1px; top: 1px; font-size: 9px; font-weight: 700; line-height: 1; background: var(--gold, #C9A84C); color: #111; border-radius: 3px; padding: 1px 3px; pointer-events: none; }' +
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
    if (direct) return direct.classList.contains('video') ? null : direct;
    var galPh = target.closest('.gs-gal-ph');
    if (galPh && !galPh.classList.contains('video')) return galPh;
    return null;
  }

  function srcOf(thumb) {
    if (thumb.tagName === 'IMG') return thumb.src;
    var img = thumb.querySelector('img');
    return img ? img.src : null;
  }

  /* Las fotos de cada tira, para abrirlas en el lightbox al picarlas (17/10/2026, dueño: "deben de funcionar
     igual en todas partes"; Admin lo tenia escrito aparte y el cliente en Orders solo veia las miniaturas). La
     misma lista (el mismo arreglo) usa siempre el mismo numero, asi repintar no llena la memoria. */
  var lists = {}, seq = 0, idOf = typeof WeakMap === 'function' ? new WeakMap() : null;
  function listId(photos, key) {
    /* key (opcional): la pantalla arma un arreglo nuevo en cada repintado (Tech) -> mismo lugar, sin llenar la memoria. */
    if (key != null) { lists['k:' + key] = photos; return 'k:' + key; }
    var id = idOf && idOf.get(photos);
    if (!id) { id = String(++seq); if (idOf) idOf.set(photos, id); }
    lists[id] = photos;
    return id;
  }

  /* Picar una miniatura abre esa foto en grande (gsocd-shared/lightbox), con flechas por todas las de la orden;
     el "+N" abre en la primera que no se ve. Va en captura para que no abra/cierre la tarjeta de abajo. */
  function onStripClick(e) {
    var strip = e.target.closest && e.target.closest('.order-photo-strip[data-gs-photos]');
    if (!strip || !window.GSLightbox) return;
    var photos = lists[strip.getAttribute('data-gs-photos')];
    if (!photos || !photos.length) return;
    var thumbs = Array.prototype.slice.call(strip.querySelectorAll('.order-photo-thumb'));
    var wrap = e.target.closest('.order-photo-wrap');
    var hit = e.target.closest('.order-photo-thumb') || (wrap && wrap.querySelector('.order-photo-thumb'));
    var i = e.target.closest('.order-photo-more') ? thumbs.length : thumbs.indexOf(hit);
    e.stopPropagation();
    e.preventDefault();
    window.GSLightbox.open(photos, Math.max(0, i));
  }

  var wired = false;
  function setup() {
    injectStyle();
    ensureOverlay();
    if (wired) return;
    wired = true;

    /* BUG REAL (26/09/2026, reportado por el dueño en su celular: "al
       abrir una foto no deja cerrar"): en telefono no hay mouse, pero el
       navegador inventa un 'mouseover' con cada tap. El tap abria el
       lightbox y, 1s despues, este preview salia ENCIMA (z-index mas
       alto), con fondo negro tapando la X del lightbox; tocar la foto
       solo quitaba el preview y el lightbox seguia abierto debajo.
       Ahora el preview solo existe con un mouse de verdad (pointerType
       'mouse'), y cualquier clic/tap lo quita al instante. */
    function isRealMouse(e) { return e.pointerType === 'mouse'; }
    document.addEventListener('pointerdown', hidePreview, true);
    document.addEventListener('click', hidePreview, true);
    document.addEventListener('click', onStripClick, true);

    document.addEventListener('pointerover', function (e) {
      if (!isRealMouse(e)) return;
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

    document.addEventListener('pointerout', function (e) {
      if (!isRealMouse(e)) return;
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

  function isVideo(p) { return !!(p && (p.isVideo || /\.(mp4|mov|m4v|webm)$/i.test(String(p.name || '')))); }
  function stripHtml(photos, opts) {
    if (!photos || !photos.length) return '';
    opts = opts || {};
    var shown = photos.slice(0, opts.max || 3);
    var extra = photos.length - shown.length;
    var thumbsHtml = shown.map(function (p, i) {
      var v = isVideo(p);
      var img = '<img class="order-photo-thumb' + (v ? ' video' : '') + '" src="' + esc((v && p.thumbUrl) || p.downloadUrl) + '" loading="lazy" alt="">';
      var badge = opts.badge ? (opts.badge(p) || '') : '';
      var count = opts.count && i === 0 && opts.count > 1 ? '<span class="order-photo-count">' + Number(opts.count) + '</span>' : '';
      var dim = opts.dim && opts.dim(p);
      if (!badge && !count && !dim && !v) return img;
      return '<span class="order-photo-wrap' + (dim ? ' dim' : '') + '">' + img + (v ? '<span class="order-photo-badge">▶</span>' : '') + badge + count + '</span>';
    }).join('');
    var moreHtml = extra > 0 && opts.more !== false ? '<span class="order-photo-more">+' + extra + '</span>' : '';
    return '<div class="order-photo-strip' + (opts.className ? ' ' + esc(opts.className) : '') + '" data-gs-photos="' + esc(listId(photos, opts.key)) + '" title="View photos" style="cursor:pointer">' + thumbsHtml + moreHtml + '</div>';
  }

  window.GSPhotoHoverPreview = { setup: setup, stripHtml: stripHtml };
})();
