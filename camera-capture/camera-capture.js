/* ============================================================
   gsocd-shared / camera-capture  (17/10/2026)
   La pagina de camara de Admin, Orders y Tech. Antes era camera-capture.html
   copiada a mano en los 3 portales y ya se habian separado (Tech tenia Full HD,
   Orders tenia "escoger de la computadora", Admin ninguno de los dos). Dueño:
   "la camara ya deberia estar en shared".

   Cada portal deja su camera-capture.html con su <head>, su forma de llamar al
   servidor (api) y lo que cambia por contexto (a que endpoint va cada foto):

     GSCameraCapture.start({
       dbName: 'gs-tech-camera-queue',     // cajon propio de IndexedDB (no cambiar: ahi esperan las fotos sin subir)
       api: function (endpoint, body) {},  // regresa una promesa
       defaultReturn: 'employee.html',     // a donde regresa si la URL no trae ?return=
       allowComputer: true,                // en computadora: escoger fotos de la PC (Admin y Orders; Tech no)
       withLocation: true,                 // pedir la ubicacion en cada foto (Tech)
       title: function (p) {},             // opcional: titulo (default: label o "Order <id>")
       upload: function (ctx) {            // ctx = { params, imageBase64, loc }
         return { endpoint, body, notReady, meta };
       },
       finish: function (p) {}             // opcional: URL al terminar (si regresa algo); si no, ?return=
     });

   Siempre (los 3 portales):
     - Camara trasera en Full HD (tope 1920 px), no guarda fotos negras.
     - La cola de gsocd-shared/camera-queue: la foto se guarda en el telefono
       antes de subirla y nunca se pierde.
     - En celular, boton "Gallery" junto al disparador (dueño 17/10: "la galeria
       es para gente en celular, todos: admin, tech y orders"): fotos que ya
       estan en el telefono.
     - En computadora, si allowComputer: escoger o arrastrar fotos de la PC
       ("la de escritorio deja subir a admin y orders").
     - ?requireAtLeastOne=1: no deja terminar sin al menos 1 foto.

   Registro (dueño 17/10: "ponlo en la metadata para reportes mas adelante"):
   una foto que NO se tomo con esta camara lleva en el body
     source: 'gallery' (del telefono) | 'computer' (de la PC)
     takenAt: fecha del archivo (cuando se tomo de verdad, si el telefono la da)
   y cada portal la guarda con un "-gal" al final del nombre del archivo y en
   TechPhotoLog (Source / TakenAt, lib/photo-log.js). Las de la camara no
   llevan source.

   Fuera de la camara (29/10/2026): GSCameraCapture.pastedPhotos(e) / stripHoles(s) para las fotos que vienen
   pegadas junto con un texto (ver abajo), y fileToJpeg(file). Estas no necesitan start().

   Necesita en la pagina: gsocd-shared/camera-queue (GSCameraQueue).
============================================================ */
(function () {
  'use strict';

  if (window.GSCameraCapture) return;

  var MAX_SIDE = 1920;

  function css() {
    return '' +
      ':root{--black:#111;--gold:#C9A84C;--gold-lt:#E2C97E;--gold-dk:#8C6F2A;--white:#fff;--off:#F7F6F3;--gray:#6B6B6B;--border:#E0D9CC;--red:#c0392b;--green:#27ae60}' +
      '*{box-sizing:border-box}' +
      /* Alto de la pantalla (18/10/2026, CFO en iPhone: "abajo no sale ningun boton"): en Safari de iPhone 100dvh puede
         quedar mas alto que lo que se ve (la barra de Safari tapa lo de abajo) y con overflow:hidden el disparador,
         Gallery y Done quedaban fuera. Ahora el body es fixed y fitScreen() le pone el alto que de verdad se ve
         (visualViewport / innerHeight); 100dvh queda solo de respaldo. Nunca hay scroll. */
      'html{height:100%;overflow:hidden;background:#000}' +
      'body{margin:0;font-family:"Inter",-apple-system,sans-serif;background:#000;color:var(--white);position:fixed;top:0;left:0;right:0;height:100%;height:100dvh;overflow:hidden;display:flex;flex-direction:column}' +
      '.top-bar{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:rgba(0,0,0,.65);position:relative;z-index:5;flex-shrink:0}' +
      '.top-bar h1{font-size:14px;margin:0;font-weight:600}' +
      '.close-btn{background:none;border:none;color:var(--white);font-size:20px;cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center}' +
      /* min-height:0 (no el "auto" de flex): un <video> de mas resolucion que el espacio no empuja el panel de abajo fuera. */
      '.camera-wrap{flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;background:#1a1a1a;overflow:hidden}' +
      'video{width:100%;height:100%;object-fit:cover;display:block}' +
      '.camera-error{color:var(--gray);font-size:13px;text-align:center;padding:24px;display:none}' +
      '.counter-pill{position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.55);border-radius:20px;padding:6px 14px;font-size:12px;font-weight:600;letter-spacing:.02em}' +
      '.bottom-panel{background:var(--black);padding:14px 16px calc(20px + env(safe-area-inset-bottom, 0px));flex-shrink:0}' +
      '.thumb-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;min-height:60px}' +
      '.thumb{width:52px;height:52px;border-radius:6px;flex-shrink:0;position:relative;background:#333;overflow:hidden;border:1px solid rgba(255,255,255,.15);cursor:default}' +
      '.thumb img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.thumb-gal{position:absolute;left:2px;top:2px;font-size:8px;font-weight:700;background:rgba(0,0,0,.7);color:var(--gold-lt);border-radius:3px;padding:1px 3px}' +
      '.thumb-status{position:absolute;bottom:2px;right:2px;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700}' +
      '.thumb-status.uploading{background:var(--gold);color:var(--black)}' +
      '.thumb-status.waiting{background:#555;color:#fff}' +
      '.thumb-status.done{background:var(--green);color:#fff}' +
      '.thumb-status.failed{background:var(--red);color:#fff;cursor:pointer}' +
      '.controls{display:flex;align-items:center;justify-content:space-between;gap:16px}' +
      '.spacer-btn{width:64px}' +
      '.gal-btn{width:64px;height:52px;border-radius:10px;border:1.5px solid rgba(255,255,255,.35);background:transparent;color:var(--white);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;padding:0}' +
      '.gal-btn svg{width:20px;height:20px}' +
      '.gal-btn:disabled{opacity:.3;cursor:not-allowed}' +
      '.shutter-btn{width:64px;height:64px;border-radius:50%;border:3px solid var(--white);background:var(--white);cursor:pointer;flex-shrink:0;position:relative}' +
      '.shutter-btn:active{transform:scale(.94)}' +
      '.shutter-btn:disabled{opacity:.3;cursor:not-allowed}' +
      '.done-btn{background:var(--gold);color:var(--black);border:none;border-radius:24px;padding:12px 22px;font-size:13px;font-weight:700;cursor:pointer;width:64px;display:flex;justify-content:center}' +
      '.status-line{text-align:center;font-size:11px;color:var(--gray);margin-top:10px;min-height:14px}' +
      '.status-line.warn{color:var(--gold-lt)}' +
      /* Computadora (24/09/2026, Orders): no se abre la camara, se escogen fotos de la PC. */
      '.pc-pick{display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px;width:min(460px,90%);border:1.5px dashed rgba(226,201,126,.55);border-radius:14px}' +
      '.pc-pick.drag{border-color:var(--gold);background:rgba(201,168,76,.08)}' +
      '.pc-pick svg{width:44px;height:44px;color:var(--gold-lt)}' +
      '.pc-pick p{margin:0;font-size:15px;font-weight:600}' +
      '.pc-pick-btn{background:var(--gold);color:var(--black);border:none;border-radius:24px;padding:12px 26px;font-size:13px;font-weight:700;cursor:pointer}' +
      '.pc-pick-note{font-size:11px;color:var(--gray)}' +
      'body.pc .pc-pick{display:flex}' +
      'body.pc video,body.pc #shutter-btn,body.pc #gal-btn{display:none}';
  }

  var PIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M21 16l-5-5-9 9"/></svg>';

  function html(maxPhotos) {
    return '' +
      '<div class="top-bar"><h1 id="page-title">Camera</h1><button class="close-btn" id="close-btn" title="Close">✕</button></div>' +
      '<div class="camera-wrap">' +
        '<video id="video" autoplay playsinline muted></video>' +
        '<div class="camera-error" id="camera-error">Could not open the camera — check that you gave permission, then reload this page.</div>' +
        '<div class="pc-pick" id="pc-pick">' + PIC +
          '<p>Add photos from your computer</p>' +
          '<button type="button" class="pc-pick-btn" id="pc-pick-btn">Choose photos</button>' +
          '<span class="pc-pick-note">Up to ' + maxPhotos + ' photos. You can also drag them here.</span>' +
        '</div>' +
        '<div class="counter-pill" id="counter-pill">0 / ' + maxPhotos + ' photos</div>' +
      '</div>' +
      '<div class="bottom-panel">' +
        '<div class="thumb-row" id="thumb-row"></div>' +
        '<div class="controls">' +
          '<button type="button" class="gal-btn" id="gal-btn" title="Photos already on your phone">' + PIC + '<span>Gallery</span></button>' +
          '<button class="shutter-btn" id="shutter-btn" aria-label="Take photo"></button>' +
          '<button class="done-btn" id="done-btn">Done</button>' +
        '</div>' +
        '<div class="status-line" id="status-line"></div>' +
      '</div>' +
      '<input type="file" id="pick-file" accept="image/*" multiple style="display:none">';
  }

  function $(id) { return document.getElementById(id); }

  /* El body mide lo que se ve de verdad (ver css()): el menor entre visualViewport y innerHeight. Si el navegador no da
     ninguno, se queda el 100dvh del CSS. */
  function fitScreen() {
    var vv = window.visualViewport, h = Math.min(window.innerHeight || Infinity, vv && vv.height ? vv.height : Infinity);
    if (!isFinite(h) || h < 100) return;
    document.body.style.height = Math.round(h) + 'px';
    document.body.style.top = (vv && vv.offsetTop > 0 ? Math.round(vv.offsetTop) : 0) + 'px';
  }

  /* Celular o tablet (pantalla tactil) -> camara + Gallery. Computadora -> fotos de la PC (si allowComputer). */
  function isPhone() {
    return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  /* Nunca bloquea la subida si falla o la niegan. */
  function getLocationSafe() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
        function () { resolve(null); },
        { timeout: 8000, maximumAge: 0 }
      );
    });
  }

  /* Fotos negras (12/10/2026): si la camara todavia no da imagen se guardaba un cuadro negro. */
  function frameIsBlack(canvas) {
    var s = document.createElement('canvas'); s.width = 32; s.height = 18;
    var c = s.getContext('2d'); c.drawImage(canvas, 0, 0, 32, 18);
    var d = c.getImageData(0, 0, 32, 18).data;
    var max = 0;
    for (var i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2]);
    return max < 8;
  }

  /* Una imagen (camara o archivo) a JPEG con tope de 1920 px del lado largo (~0.4-0.7 MB). */
  function toJpeg(src, w, h) {
    var k = Math.min(1, MAX_SIDE / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  /* Cuando se TOMO una foto de la galeria (18/10/2026, dueña: "lo que no quiero es que vayan a subir fotos viejas"): la
     fecha que la camara del telefono escribe dentro del JPEG (EXIF DateTimeOriginal, hora local del telefono).
     -> Promise<{ y, mo, d, h, mi, s } | null> (null = el archivo no la trae: captura de pantalla, reenviada...). */
  function exifTakenAt(file) {
    if (!file || !file.slice || !/jpe?g/i.test(file.type || '')) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onerror = function () { resolve(null); };
      fr.onload = function () {
        try { resolve(parseExifDate(new DataView(fr.result))); } catch (e) { resolve(null); }
      };
      fr.readAsArrayBuffer(file.slice(0, 256 * 1024));
    });
  }
  function parseExifDate(v) {
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
    var off = 2;
    while (off + 4 <= v.byteLength) {
      if (v.getUint8(off) !== 0xFF) return null;
      var marker = v.getUint8(off + 1), len = v.getUint16(off + 2);
      if (marker === 0xE1 && v.getUint32(off + 4) === 0x45786966) return readTiffDate(v, off + 10);
      if (marker === 0xDA) return null;
      off += 2 + len;
    }
    return null;
  }
  function readTiffDate(v, t) {
    var le = v.getUint16(t) === 0x4949;
    var u16 = function (o) { return v.getUint16(o, le); }, u32 = function (o) { return v.getUint32(o, le); };
    var ascii = function (o, n) { var x = ''; for (var i = 0; i < n; i++) { var c = v.getUint8(o + i); if (!c) break; x += String.fromCharCode(c); } return x; };
    var tagIn = function (ifd, want) {
      var n = u16(ifd);
      for (var i = 0; i < n; i++) { var e = ifd + 2 + i * 12; if (u16(e) === want) return e; }
      return 0;
    };
    var ifd0 = t + u32(t + 4);
    var exifPtr = tagIn(ifd0, 0x8769);
    var e = exifPtr ? tagIn(t + u32(exifPtr + 8), 0x9003) : 0;
    if (!e) e = tagIn(ifd0, 0x0132); /* DateTime, si no trae la original */
    if (!e) return null;
    var str = ascii(t + u32(e + 8), 19);
    var m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(str);
    if (!m || m[1] === '0000') return null;
    return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +m[6] };
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function ymdOf(x) { return x.y + '-' + String(x.mo).padStart(2, '0') + '-' + String(x.d).padStart(2, '0'); }
  function todayLocal() { var n = new Date(); return ymdOf({ y: n.getFullYear(), mo: n.getMonth() + 1, d: n.getDate() }); }

  /* rawHeic (Admin, cfg.serverHeic, 18/10/2026): una HEIC que este navegador no sabe leer (Windows/Chrome, Android) va
     tal cual y el servidor la pasa a JPEG. */
  function isHeic(file) { return /hei[cf]/i.test(file.type || '') || /\.hei[cf]$/i.test(file.name || ''); }
  function fileToJpeg(file, rawHeic) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('Could not read ' + file.name)); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () {
          if (rawHeic && isHeic(file)) {
            if (file.size > 3.2 * 1024 * 1024) { reject(new Error(file.name + ' is too big to send. Save it as JPEG first.')); return; }
            resolve(String(fr.result).replace(/^data:[^;,]*;/, 'data:image/heic;'));
            return;
          }
          reject(new Error(file.name + ' is not an image we can read'));
        };
        img.onload = function () { resolve(toJpeg(img, img.width, img.height).toDataURL('image/jpeg', 0.85)); };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* Fotos pegadas en un cuadro de texto (CFO 29/10/2026, caso real GS-1012-1175): quien escribe en las Notas del
     telefono con fotos entre los renglones y lo pega en las notas de la app solo pasaba el texto; cada foto quedaba
     como un cuadrito (U+FFFC) y se perdia sin aviso. pastedPhotos(e), llamado DENTRO del evento paste (el portapapeles
     solo se lee ahi), saca las imagenes: los archivos o, si el navegador no los da, las <img> del HTML pegado (blob:
     o data:). Ya en JPEG como las de la galeria.
     -> Promise<{ photos: [dataUrl], holes: n }>  (holes = cuadritos que traia el texto pegado). */
  var HOLE = /￼/g;
  /* Sin los cuadritos; un renglon que solo tenia cuadritos se va completo (no deja huecos en las notas). */
  function stripHoles(s) { return String(s == null ? '' : s).replace(/^[ \t]*\uFFFC[\uFFFC \t]*(\r?\n|$)/gm, '').replace(HOLE, ''); }
  function pastedPhotos(e) {
    var cd = e && e.clipboardData;
    if (!cd) return Promise.resolve({ photos: [], holes: 0 });
    var holes = ((cd.getData('text/plain') || '').match(HOLE) || []).length;
    var files = Array.prototype.filter.call(cd.files || [], function (f) { return /^image\//.test(f.type); });
    if (!files.length) {
      Array.prototype.forEach.call(cd.items || [], function (it) {
        if (it.kind === 'file' && /^image\//.test(it.type)) { var f = it.getAsFile(); if (f) files.push(f); }
      });
    }
    var html = files.length ? '' : (cd.getData('text/html') || '');
    var srcs = [];
    html.replace(/<img\b[^>]*\bsrc\s*=\s*["']((?:blob:|data:image\/)[^"']+)["']/gi, function (m, s) { if (srcs.indexOf(s) < 0) srcs.push(s); return m; });
    var blobs = files.length ? Promise.resolve(files)
      : Promise.all(srcs.map(function (s) { return fetch(s).then(function (r) { return r.blob(); }, function () { return null; }); }))
        .then(function (list) { return list.filter(function (b) { return b && /^image\//.test(b.type); }); });
    return blobs.then(function (list) {
      return list.reduce(function (p, b) {
        return p.then(function (out) {
          return fileToJpeg(b).then(function (j) { out.push(j); return out; }, function () { return out; });
        });
      }, Promise.resolve([]));
    }).then(function (photos) { return { photos: photos, holes: holes }; });
  }

  function start(cfg) {
    cfg = cfg || {};
    var params = new URLSearchParams(location.search);
    var MAX = cfg.maxPhotos || 10;
    var returnTo = params.get('return') || cfg.defaultReturn || '/';
    var requireAtLeastOne = params.get('requireAtLeastOne') === '1';
    var phone = isPhone();
    var pcMode = !phone && !!cfg.allowComputer;

    var st = document.createElement('style'); st.textContent = css(); document.head.appendChild(st);
    document.body.innerHTML = html(MAX);
    fitScreen();
    if (window.visualViewport) visualViewport.addEventListener('resize', fitScreen);
    ['resize', 'orientationchange', 'pageshow'].forEach(function (ev) { window.addEventListener(ev, fitScreen); });
    document.addEventListener('visibilitychange', fitScreen);
    if (pcMode) document.body.classList.add('pc');
    /* Gallery solo en celular; en computadora sin allowComputer (Tech) queda la camara como siempre. */
    if (!phone) $('gal-btn').outerHTML = '<div class="spacer-btn"></div>';

    var orderId = params.get('orderId');
    $('page-title').textContent = (cfg.title && cfg.title(params)) || params.get('label') || (orderId ? 'Order ' + orderId : 'Camera');

    var stream = null, count = 0, thumbById = {}, pickNote = '';

    function stopStream() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); }
    /* Fotos que todavia se estan guardando (18/10/2026): Done y ✕ esperan a que queden en el telefono. */
    var saving = [];
    function whenSaved(fn) {
      if (!saving.length) { fn(); return; }
      status('Saving photos…');
      Promise.all(saving.slice()).then(function () { whenSaved(fn); }, function () { whenSaved(fn); });
    }
    function goBack() { whenSaved(function () { stopStream(); location.href = returnTo; }); }
    function status(text, warn) { var s = $('status-line'); s.textContent = text || ''; s.className = 'status-line' + (warn ? ' warn' : ''); }
    function finish() {
      if (requireAtLeastOne && count === 0) { status('Take at least 1 photo before finishing.', true); return; }
      whenSaved(function () { stopStream(); location.href = (cfg.finish && cfg.finish(params)) || returnTo; });
    }
    $('close-btn').addEventListener('click', goBack);
    $('done-btn').addEventListener('click', finish);

    GSCameraQueue.init({
      dbName: cfg.dbName,
      maxAttempts: 10,
      retryIntervalMs: 20000,
      uploadFn: function (item) { return cfg.api(item.endpoint, item.body); },
      onChange: onQueueChange
    });

    async function initCamera() {
      try {
        /* Full HD (07/10/2026, dueño: "dale full HD"); 'ideal' nunca falla, el telefono da lo mas cercano. */
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        } catch (e) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        }
        $('video').srcObject = stream;
      } catch (e) {
        $('video').style.display = 'none';
        $('camera-error').style.display = 'block';
      }
    }
    if (!pcMode) initCamera();

    function captureFrame() {
      var video = $('video');
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return null;
      var c = toJpeg(video, video.videoWidth, video.videoHeight);
      if (frameIsBlack(c)) return null;
      return c.toDataURL('image/jpeg', 0.85);
    }
    function cameraNotReady() {
      var t = $('cam-not-ready');
      if (!t) {
        t = document.createElement('div'); t.id = 'cam-not-ready';
        t.style.cssText = 'position:fixed;left:50%;top:20%;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;z-index:99;text-align:center;max-width:80vw';
        document.body.appendChild(t);
      }
      t.textContent = 'The camera is still starting. Try again in a second.';
      t.style.display = 'block';
      clearTimeout(cameraNotReady.timer);
      cameraNotReady.timer = setTimeout(function () { t.style.display = 'none'; }, 2500);
    }

    function addThumb(imageBase64, source) {
      var thumb = document.createElement('div');
      thumb.className = 'thumb';
      var img = document.createElement('img'); img.src = imageBase64; thumb.appendChild(img);
      if (source) { var g = document.createElement('span'); g.className = 'thumb-gal'; g.textContent = source === 'computer' ? 'PC' : 'Gallery'; thumb.appendChild(g); }
      var s = document.createElement('div'); s.className = 'thumb-status uploading'; s.textContent = '↑'; thumb.appendChild(s);
      $('thumb-row').appendChild(thumb);
      $('thumb-row').scrollLeft = 999999;
      return { thumb: thumb, status: s };
    }

    function full() {
      var dis = count >= MAX;
      $('shutter-btn').disabled = dis;
      if ($('gal-btn')) $('gal-btn').disabled = dis;
    }

    /* Guarda y sube UNA imagen. source/takenAt solo si no viene de esta camara.
       18/10/2026 (revision): PRIMERO se guarda en el telefono (IndexedDB) y despues se le pone la ubicacion; antes se
       esperaba el GPS (hasta 8 s) por foto y si cerraban o la app se iba al fondo, la foto se perdia. Una de la galeria
       tambien lleva la ubicacion (dueña 18/10): es donde se subio, no donde se tomo. */
    function sendImage(imageBase64, source, takenAt) {
      if (count >= MAX) return Promise.resolve();
      count++;
      $('counter-pill').textContent = count + ' / ' + MAX + ' photos';
      var t = addThumb(imageBase64, source);
      var wantLoc = !!cfg.withLocation;
      var p = (async function () {
        try {
          var up = cfg.upload({ params: params, imageBase64: imageBase64, loc: null }) || {};
          var body = Object.assign({}, up.body);
          if (source) { body.source = source; if (takenAt) body.takenAt = takenAt; }
          var waitLoc = wantLoc && !up.notReady;
          /* enqueue() guarda la foto ANTES de intentar subirla (regla de oro: nunca se pierde). */
          var id = await GSCameraQueue.enqueue({ endpoint: up.endpoint, body: body, notReady: !!up.notReady, waitLoc: waitLoc, meta: up.meta || { orderId: orderId } });
          thumbById[id] = t;
          if (waitLoc) {
            getLocationSafe().then(function (loc) {
              var patch = {};
              if (loc) {
                var b2 = (cfg.upload({ params: params, imageBase64: imageBase64, loc: loc }) || {}).body || {};
                Object.keys(b2).forEach(function (k) { if (k !== 'imageBase64' && JSON.stringify(b2[k]) !== JSON.stringify(body[k])) patch[k] = b2[k]; });
              }
              GSCameraQueue.addLocation(id, patch);
            });
          }
        } finally { full(); }
      })();
      saving.push(p);
      var drop = function () { var i = saving.indexOf(p); if (i >= 0) saving.splice(i, 1); };
      p.then(drop, drop);
      return p;
    }

    /* Sin candado entre fotos (25/09/2026): cada toque toma SU foto (cada una lleva su photoKey). */
    function capture() {
      if (count >= MAX || !stream) return;
      pickNote = '';
      var shot = captureFrame();
      if (!shot) { cameraNotReady(); return; }
      sendImage(shot, null);
    }
    $('shutter-btn').addEventListener('click', capture);

    /* cfg.gallerySameDay (Tech, dueña 18/10/2026): una foto de la galeria tiene que ser de un dia del trabajo (su
       fecha EXIF, hora local del telefono, comparada como AAAA-MM-DD sin pasar por UTC): hoy o cualquiera de
       cfg.jobDays(params) (dias programados de la orden, el de la visita en un recurrente) que no sea despues de hoy.
       Una de otro dia no entra. Sin fecha (captura de pantalla, reenviada): entra con takenAt vacio y Admin la ve como
       "date unknown". */
    var jobDaysP = Promise.resolve(typeof cfg.jobDays === 'function' ? cfg.jobDays(params) : (cfg.jobDays || []))
      .then(function (d) { return Array.isArray(d) ? d.map(String) : []; }, function () { return []; });
    function shortDay(ymd) { var p = String(ymd).split('-'); return MONTHS[+p[1] - 1] + ' ' + (+p[2]); }
    async function addFiles(files, source) {
      /* La lista ANTES de cualquier await: quien llama limpia el input (value = '') en cuanto regresa. */
      var list = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); });
      var jobDays = cfg.gallerySameDay ? await jobDaysP : [];
      var today = todayLocal();
      var okDay = function (day) { return day === today || (day < today && jobDays.indexOf(day) >= 0); };
      var room = MAX - count, old = [];
      pickNote = '';
      if (list.length > room) status('Only ' + room + ' more photo' + (room === 1 ? '' : 's') + ' fit — the rest were skipped.', true);
      for (var i = 0; i < Math.min(list.length, Math.max(0, room)); i++) {
        var f = list[i];
        try {
          var ex = await exifTakenAt(f);
          if (cfg.gallerySameDay && ex && !okDay(ymdOf(ex))) { old.push(ex); continue; }
          var takenAt = ex ? new Date(ex.y, ex.mo - 1, ex.d, ex.h, ex.mi, ex.s).toISOString()
            : (cfg.gallerySameDay ? '' : (f.lastModified ? new Date(f.lastModified).toISOString() : ''));
          await sendImage(await fileToJpeg(f, !!cfg.serverHeic), source, takenAt);
        }
        catch (e) { status(e.message, true); }
      }
      if (old.length) {
        var when = MONTHS[old[0].mo - 1] + ' ' + old[0].d;
        var days = jobDays.filter(function (d) { return d <= today; }).concat(jobDays.indexOf(today) < 0 ? [today] : []).sort();
        var jobTxt = days.length > 1 ? 'This job is on ' + days.slice(0, -1).map(shortDay).join(', ') + ' and ' + shortDay(days[days.length - 1]) + '.'
          : 'This job is today.';
        pickNote = (old.length === 1 ? 'This photo was taken on ' + when + '. ' : old.length + ' photos are from another day (one on ' + when + '). ') +
          jobTxt + ' Take ' + (old.length === 1 ? 'a new one' : 'new ones') + ' with the camera.';
        status(pickNote, true);
      }
    }
    /* En celular salen de la galeria; en computadora, de la PC. */
    var pickSource = pcMode ? 'computer' : 'gallery';
    $('pick-file').addEventListener('change', function (e) { addFiles(e.target.files, pickSource); e.target.value = ''; });
    if ($('gal-btn')) $('gal-btn').addEventListener('click', function () { $('pick-file').click(); });
    $('pc-pick-btn').addEventListener('click', function () { $('pick-file').click(); });
    var pick = $('pc-pick');
    ['dragenter', 'dragover'].forEach(function (ev) { pick.addEventListener(ev, function (e) { e.preventDefault(); pick.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { pick.addEventListener(ev, function (e) { e.preventDefault(); pick.classList.remove('drag'); }); });
    pick.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files, pickSource); });

    function onQueueChange(pending) {
      var byId = {};
      pending.forEach(function (p) { byId[p.id] = p; });
      var waiting = 0, failed = 0, saved = 0;
      Object.keys(thumbById).forEach(function (idStr) {
        var id = Number(idStr), entry = thumbById[id], item = byId[id];
        if (item) {
          if (item.notReady) { entry.status.className = 'thumb-status waiting'; entry.status.textContent = '💾'; saved++; }
          else if (item.failed) { entry.status.className = 'thumb-status failed'; entry.status.textContent = '!'; entry.status.onclick = function () { GSCameraQueue.retryNow(id); }; failed++; }
          else { entry.status.className = 'thumb-status waiting'; entry.status.textContent = '⏳'; waiting++; }
        } else {
          entry.status.className = 'thumb-status done';
          entry.status.textContent = '✓';
        }
      });
      var q = failed ? failed + ' photo' + (failed === 1 ? '' : 's') + ' could not be uploaded — tap it to try again.'
        : waiting ? waiting + ' photo' + (waiting === 1 ? '' : 's') + ' waiting for signal — will upload automatically.'
        : saved ? saved + ' photo' + (saved === 1 ? '' : 's') + ' saved — will attach once you submit the order.' : '';
      /* El aviso de una foto vieja que no entro se queda a la vista hasta la siguiente foto. */
      var msg = [pickNote, q].filter(Boolean).join(' ');
      status(msg, !!msg);
    }
  }

  window.GSCameraCapture = { start: start, fileToJpeg: fileToJpeg, pastedPhotos: pastedPhotos, stripHoles: stripHoles };
})();
