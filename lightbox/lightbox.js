/* ============================================================
   GS Lightbox -- visor de fotos compartido, para los 3 portales
   (tech.gsocd.com, Admingsocd.com, ordersgsocd.com).

   Por que existe: antes cada portal tenia su propia copia de este
   mismo componente, pegada a mano en cada archivo -- cuando aparecio
   un bug (las fotos se descargaban en vez de verse), hubo que
   arreglarlo por separado en Tech y en Admin, en 2 momentos
   distintos. Con esto, se arregla una vez, aqui, y los 3 portales
   quedan al dia solos.

   USO (una sola linea en el HTML del portal que lo necesite):
     <script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@v1.0.0/lightbox/lightbox.js"></script>

   El script se inyecta su propio HTML y CSS solo -- no hace falta
   copiar nada mas. Para abrir una foto:
     GSLightbox.open(photos, index)
   donde "photos" es un arreglo de objetos { downloadUrl, name } y
   "index" es la posicion (0-based) de la foto que se acaba de
   apretar. GSLightbox.open() reemplaza cualquier onclick="window.open(...)"
   que navegaba directo al link de descarga (eso era lo que causaba
   que la foto se bajara en vez de abrirse en movil).

   Version: 1.0.0
============================================================ */
(function () {
  'use strict';

  if (window.GSLightbox) return; // ya cargado, no duplicar

  /* ===== CSS, inyectado una sola vez ===== */
  var style = document.createElement('style');
  style.textContent =
    '.gs-lightbox-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;align-items:center;justify-content:center}' +
    '.gs-lightbox-overlay.open{display:flex}' +
    '.gs-lightbox-img{max-width:90vw;max-height:82vh;object-fit:contain;border-radius:4px}' +
    '.gs-lightbox-close{position:absolute;top:18px;right:22px;background:none;border:none;color:#fff;font-size:28px;line-height:1;cursor:pointer;padding:6px}' +
    '.gs-lightbox-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);border:none;color:#fff;font-size:28px;line-height:1;cursor:pointer;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center}' +
    '.gs-lightbox-nav:disabled{opacity:.25;cursor:default}' +
    '.gs-lightbox-prev{left:16px}' +
    '.gs-lightbox-next{right:16px}' +
    '.gs-lightbox-counter{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);color:#ddd;font-size:12px;letter-spacing:.04em;font-family:sans-serif}';
  document.head.appendChild(style);

  /* ===== HTML, inyectado una sola vez ===== */
  var overlay = document.createElement('div');
  overlay.className = 'gs-lightbox-overlay';
  overlay.id = 'gs-lightbox-overlay';
  overlay.innerHTML =
    '<button type="button" class="gs-lightbox-close" aria-label="Close">\u2715</button>' +
    '<button type="button" class="gs-lightbox-nav gs-lightbox-prev" aria-label="Previous">\u2039</button>' +
    '<img class="gs-lightbox-img" id="gs-lightbox-img" src="" alt="Photo">' +
    '<button type="button" class="gs-lightbox-nav gs-lightbox-next" aria-label="Next">\u203a</button>' +
    '<div class="gs-lightbox-counter" id="gs-lightbox-counter"></div>';
  document.body.appendChild(overlay);

  var imgEl = overlay.querySelector('#gs-lightbox-img');
  var counterEl = overlay.querySelector('#gs-lightbox-counter');
  var prevBtn = overlay.querySelector('.gs-lightbox-prev');
  var nextBtn = overlay.querySelector('.gs-lightbox-next');
  var closeBtn = overlay.querySelector('.gs-lightbox-close');

  var currentPhotos = [];
  var currentIndex = null;

  function render() {
    var photo = currentPhotos[currentIndex];
    if (!photo) return;
    imgEl.src = photo.downloadUrl;
    imgEl.alt = photo.name || 'Photo';
    counterEl.textContent = (currentIndex + 1) + ' / ' + currentPhotos.length;
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === currentPhotos.length - 1;
  }

  function open(photos, index) {
    currentPhotos = photos || [];
    currentIndex = index || 0;
    if (!currentPhotos.length) return;
    render();
    overlay.classList.add('open');
  }

  function close() {
    overlay.classList.remove('open');
    currentPhotos = [];
    currentIndex = null;
  }

  function nav(delta) {
    var next = currentIndex + delta;
    if (next < 0 || next >= currentPhotos.length) return;
    currentIndex = next;
    render();
  }

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
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
