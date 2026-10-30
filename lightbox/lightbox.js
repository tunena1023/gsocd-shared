(function () {
  'use strict';

  if (window.GSLightbox) return;

  var style = document.createElement('style');
  style.textContent =
    '.gs-lightbox-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;align-items:center;justify-content:center}' +
    '.gs-lightbox-overlay.open{display:flex}' +
    '.gs-lightbox-img{max-width:90vw;max-height:82vh;object-fit:contain;border-radius:4px}' +
    '.gs-lightbox-video{display:none;max-width:90vw;max-height:82vh;border-radius:4px;background:#000}' +
    '.gs-lightbox-close{position:absolute;top:max(18px,env(safe-area-inset-top));right:max(22px,env(safe-area-inset-right));z-index:2;background:none;border:none;color:#fff;font-size:28px;line-height:1;cursor:pointer;padding:6px}' +
    '.gs-lightbox-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);border:none;color:#fff;font-size:28px;line-height:1;cursor:pointer;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center}' +
    '.gs-lightbox-nav:disabled{opacity:.25;cursor:default}' +
    '.gs-lightbox-prev{left:16px}' +
    '.gs-lightbox-next{right:16px}' +
    '.gs-lightbox-counter{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);color:#ddd;font-size:12px;letter-spacing:.04em;font-family:sans-serif}';
  document.head.appendChild(style);

  var overlay = document.createElement('div');
  overlay.className = 'gs-lightbox-overlay';
  overlay.id = 'gs-lightbox-overlay';
  overlay.innerHTML =
    '<button type="button" class="gs-lightbox-close" aria-label="Close">\u2715</button>' +
    '<button type="button" class="gs-lightbox-nav gs-lightbox-prev" aria-label="Previous">\u2039</button>' +
    '<img class="gs-lightbox-img" id="gs-lightbox-img" src="" alt="Photo">' +
    '<video class="gs-lightbox-video" id="gs-lightbox-video" controls playsinline preload="metadata"></video>' +
    '<button type="button" class="gs-lightbox-nav gs-lightbox-next" aria-label="Next">\u203a</button>' +
    '<div class="gs-lightbox-counter" id="gs-lightbox-counter"></div>';
  document.body.appendChild(overlay);

  var imgEl = overlay.querySelector('#gs-lightbox-img');
  var videoEl = overlay.querySelector('#gs-lightbox-video');
  var counterEl = overlay.querySelector('#gs-lightbox-counter');
  var prevBtn = overlay.querySelector('.gs-lightbox-prev');
  var nextBtn = overlay.querySelector('.gs-lightbox-next');
  var closeBtn = overlay.querySelector('.gs-lightbox-close');

  var currentPhotos = [];
  var currentIndex = null;
  /* opts.sections (21/10/2026, gallery-groups con antes/despues): [{ label, start, count }] -- el contador dice
     "Before 2 / 4" en vez de "2 / 10". Sin sections, el contador de siempre. */
  var currentSections = null;
  function counterOf(i) {
    var secs = currentSections || [];
    for (var k = 0; k < secs.length; k++) {
      if (i >= secs[k].start && i < secs[k].start + secs[k].count) return secs[k].label + ' ' + (i - secs[k].start + 1) + ' / ' + secs[k].count;
    }
    return (i + 1) + ' / ' + currentPhotos.length;
  }

  function render() {
    var photo = currentPhotos[currentIndex];
    if (!photo) return;
    /* Video (CFO 30/10/2026): se reproduce aqui mismo (isVideo, o el nombre .mp4/.mov). */
    var isVideo = !!photo.isVideo || /\.(mp4|mov|m4v|webm)$/i.test(String(photo.name || ''));
    if (isVideo) {
      imgEl.style.display = 'none'; imgEl.removeAttribute('src');
      videoEl.style.display = 'block';
      if (videoEl.getAttribute('src') !== photo.downloadUrl) videoEl.setAttribute('src', photo.downloadUrl);
    } else {
      stopVideo();
      imgEl.style.display = '';
      imgEl.src = photo.downloadUrl;
    }
    imgEl.alt = photo.name || 'Photo';
    /* "From gallery" (17/10/2026): subida de la galeria o de la PC (nombre "-gal", gsocd-shared/camera-capture). */
    counterEl.textContent = counterOf(currentIndex) + (/-gal\.[a-z0-9]+$/i.test(String(photo.name || '')) ? ' · From gallery' + (photo.dateUnknown ? ' · date unknown' : '') : '');
    /* Da la vuelta (dueño, 07/10/2026): de la ultima pasa a la primera y de
       la primera a la ultima, asi que las flechas nunca se apagan; con una
       sola foto no hay a donde ir y se esconden. */
    var single = currentPhotos.length < 2;
    prevBtn.style.display = single ? 'none' : '';
    nextBtn.style.display = single ? 'none' : '';
  }

  function open(photos, index, opts) {
    currentPhotos = photos || [];
    currentIndex = index || 0;
    currentSections = (opts && opts.sections) || null;
    if (!currentPhotos.length) return;
    render();
    overlay.classList.add('open');
  }

  function stopVideo() {
    try { videoEl.pause(); } catch (e) { /* sin video */ }
    videoEl.removeAttribute('src'); videoEl.style.display = 'none';
    try { videoEl.load(); } catch (e) { /* sin video */ }
  }

  function close() {
    stopVideo();
    overlay.classList.remove('open');
    currentPhotos = [];
    currentIndex = null;
    currentSections = null;
  }

  function nav(delta) {
    var n = currentPhotos.length;
    if (n < 2) return;
    currentIndex = ((currentIndex + delta) % n + n) % n;
    render();
  }

  /* A peticion del dueño (26/09/2026, en su celular): "con un tap se
     deberia cerrar". Antes solo cerraba el fondo negro o la X -- en
     telefono la foto llena casi toda la pantalla y el fondo casi no se
     ve, asi que tocar la foto no hacia nada. Ahora tocar CUALQUIER
     parte cierra, menos las flechas (siguen cambiando de foto). */
  overlay.addEventListener('click', function (e) {
    if (e.target.closest && (e.target.closest('.gs-lightbox-nav') || e.target.closest('.gs-lightbox-video'))) return;
    close();
  });
  prevBtn.addEventListener('click', function () { nav(-1); });
  nextBtn.addEventListener('click', function () { nav(1); });

  document.addEventListener('keydown', function (e) {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') nav(-1);
    if (e.key === 'ArrowRight') nav(1);
  });

  window.GSLightbox = { open: open, close: close, nav: nav };
})();
