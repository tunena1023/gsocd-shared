/* ============================================================
   doc-viewer -- documentos por orden (PDF, Word, TXT) para Admin,
   Orders y Tech (25/09/2026, pedido del dueño: "cada orden ya creada
   deberia tener algun tipo de boton para subir un documento... y en el
   tab de gallery haces subtabs: Gallery y Docs").

   Reglas del dueño:
     - Todos los documentos son publicos (el cliente ve todo lo de su
       orden, igual que las fotos).
     - Tecnicos: solo ver.
     - Borrar: la oficina cualquiera; el cliente solo los que subio el.
   (Quien puede que lo decide cada portal con opts.canUpload/canDelete;
   el servidor lo vuelve a revisar.)

   API (window.GSDocViewer):
     renderGroups(containerId, groups, opts)
        groups: [{ orderId, clientLabel, date, docs: [doc] }]
        doc:    { id, name, size, by: 'Client'|'Office', uploaderName, uploadedAt }
        opts:   { emptyMessage, openOrderId, canDelete(doc, group),
                  onView(doc, group), onDelete(doc, group) }
     renderList(el, docs, opts)       lista compacta dentro de una orden
     searchHtml(inputId, placeholder) mismo buscador que la galeria
     open({ name, viewUrl, downloadUrl })   visor (modal a pantalla)
     upload(file, { start, finish, onProgress })
        start(file)  -> { uploadUrl }  (sesion de subida de Graph)
        finish(file, driveItem) -> lo que regrese el servidor
        Sube en pedazos directo a SharePoint (sin pasar por Vercel, que
        no acepta mas de ~4 MB por peticion).
     pickFile(cb)     abre el selector de archivos (PDF, Word, TXT)
     ACCEPT, MAX_BYTES, allowed(file) -> '' | mensaje de error
============================================================ */
(function () {
  'use strict';
  if (window.GSDocViewer) return;

  var MAX_BYTES = 25 * 1024 * 1024;
  var EXTS = ['pdf', 'doc', 'docx', 'txt'];
  var ACCEPT = '.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
  var CHUNK = 320 * 1024 * 12; /* 3.75 MB: Graph pide multiplos de 320 KB */

  var STYLE_ID = 'gs-doc-viewer-style';
  function styleTag() {
    if (document.getElementById(STYLE_ID)) return;
    var t = document.createElement('style');
    t.id = STYLE_ID;
    t.textContent =
      '.gs-doc-search{display:flex;align-items:center;gap:10px;border:1px solid #E0D9CC;border-radius:6px;padding:10px 14px;margin-bottom:18px}' +
      '.gs-doc-search svg{width:15px;height:15px;color:#8C6F2A;flex-shrink:0}' +
      '.gs-doc-search input{border:none;outline:none;font-size:13px;font-family:inherit;color:#111;width:100%;background:none}' +
      '.gs-doc-grp{border:1px solid #F0EBDD;border-radius:6px;margin-bottom:10px;overflow:hidden}' +
      '.gs-doc-grp-h{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;padding:14px 16px;background:#F7F6F3;cursor:pointer}' +
      '.gs-doc-grp.open>.gs-doc-grp-h{background:#EDE7D8}' +
      '.gs-doc-grp-h:focus-visible{outline:2px solid #C9A227;outline-offset:-2px}' +
      '.gs-doc-grp-main{flex:1;min-width:0}' +
      '.gs-doc-grp-title{font-size:14px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.gs-doc-grp-sub{font-size:11.5px;color:#6B6B6B;margin-top:2px}' +
      '.gs-doc-count{background:#E9DDBB;color:#6B5A22;font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px;flex-shrink:0}' +
      '.gs-doc-arrow{display:inline-block;color:#999;font-size:11px;transition:transform .2s;flex-shrink:0}' +
      '.gs-doc-grp.open .gs-doc-arrow{transform:rotate(90deg)}' +
      '.gs-doc-grp-body{display:none;padding:6px 16px 10px;background:#fff}' +
      '.gs-doc-grp.open>.gs-doc-grp-body{display:block}' +
      '.gs-doc-empty{font-size:13px;color:#999;text-align:center;padding:40px 0}' +
      '.gs-doc-list{list-style:none;margin:0;padding:0}' +
      '.gs-doc-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #F0EBDD}' +
      '.gs-doc-row:last-child{border-bottom:none}' +
      '.gs-doc-ic{flex-shrink:0;width:34px;height:40px;border-radius:4px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:5px;box-sizing:border-box;font:700 9px/1 Inter,sans-serif;letter-spacing:.04em;color:#fff;position:relative}' +
      '.gs-doc-ic::before{content:"";position:absolute;top:0;right:0;width:10px;height:10px;background:rgba(255,255,255,.45);border-bottom-left-radius:3px}' +
      '.gs-doc-ic.pdf{background:#B23B2E}.gs-doc-ic.doc,.gs-doc-ic.docx{background:#2B5797}.gs-doc-ic.txt{background:#6B6B6B}' +
      '.gs-doc-info{flex:1;min-width:0}' +
      '.gs-doc-name{all:unset;cursor:pointer;display:block;font-size:13px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}' +
      '.gs-doc-name:hover{text-decoration:underline}' +
      '.gs-doc-name:focus-visible{outline:2px solid #C9A227;outline-offset:2px}' +
      '.gs-doc-meta{font-size:11px;color:#6B6B6B;margin-top:2px}' +
      '.gs-doc-acts{display:flex;gap:6px;flex-shrink:0}' +
      '.gs-doc-btn{all:unset;cursor:pointer;font:600 11.5px/1 Inter,sans-serif;padding:8px 11px;border-radius:5px;border:1px solid #E0D9CC;color:#111;background:#fff;min-height:16px}' +
      '.gs-doc-btn:hover{border-color:#C9A227}' +
      '.gs-doc-btn.del{color:#c0392b}' +
      '.gs-doc-btn:focus-visible{outline:2px solid #C9A227;outline-offset:1px}' +
      '@media(max-width:420px){.gs-doc-btn.view{display:none}}' +
      /* visor */
      '.gs-doc-modal{position:fixed;inset:0;z-index:10000;background:rgba(17,17,17,.82);display:flex;flex-direction:column}' +
      '.gs-doc-modal-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#111;color:#fff}' +
      '.gs-doc-modal-title{flex:1;min-width:0;font:600 14px/1.3 Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.gs-doc-modal-bar a,.gs-doc-modal-bar button{all:unset;cursor:pointer;font:600 12px/1 Inter,sans-serif;padding:9px 12px;border-radius:5px;border:1px solid rgba(255,255,255,.3);color:#fff}' +
      '.gs-doc-modal-bar a:focus-visible,.gs-doc-modal-bar button:focus-visible{outline:2px solid #C9A227}' +
      '.gs-doc-modal-body{flex:1;min-height:0;background:#F7F6F3;display:flex;align-items:center;justify-content:center}' +
      '.gs-doc-modal-body iframe{width:100%;height:100%;border:0;background:#fff}' +
      '.gs-doc-modal-msg{color:#111;font:14px/1.5 Inter,sans-serif;text-align:center;padding:24px;max-width:360px}' +
      /* subida */
      '.gs-doc-up{display:flex;align-items:center;gap:10px;font-size:12px;color:#6B6B6B;margin-top:8px}' +
      '.gs-doc-up-bar{flex:1;height:6px;background:#F0EBDD;border-radius:3px;overflow:hidden}' +
      '.gs-doc-up-bar i{display:block;height:100%;width:0;background:#C9A227;transition:width .2s}';
    document.head.appendChild(t);
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
  function extOf(name) { var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }
  function fmtDate(v) {
    if (!v) return '';
    var d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function byLabel(doc) {
    if (doc.by === 'Client') return doc.uploaderName ? doc.uploaderName : 'Client';
    return 'GS Solutions';
  }

  function allowed(file) {
    if (!file) return 'Choose a file.';
    if (EXTS.indexOf(extOf(file.name)) === -1) return 'Only PDF, Word (.doc, .docx) or text (.txt) files.';
    if (file.size > MAX_BYTES) return 'That file is ' + fmtSize(file.size) + '. The limit is 25 MB.';
    if (!file.size) return 'That file is empty.';
    return '';
  }

  function rowHtml(doc, gi, di, canDel) {
    var ext = extOf(doc.name);
    return '<li class="gs-doc-row">' +
      '<span class="gs-doc-ic ' + escAttr(ext) + '" aria-hidden="true">' + esc(ext.toUpperCase()) + '</span>' +
      '<div class="gs-doc-info"><button type="button" class="gs-doc-name" data-act="view" data-g="' + gi + '" data-d="' + di + '" title="' + escAttr(doc.name) + '">' + esc(doc.name) + '</button>' +
      '<div class="gs-doc-meta">' + esc([byLabel(doc), fmtDate(doc.uploadedAt), fmtSize(doc.size)].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div class="gs-doc-acts"><button type="button" class="gs-doc-btn view" data-act="view" data-g="' + gi + '" data-d="' + di + '">View</button>' +
      (canDel ? '<button type="button" class="gs-doc-btn del" data-act="del" data-g="' + gi + '" data-d="' + di + '" aria-label="Delete ' + escAttr(doc.name) + '">Delete</button>' : '') +
      '</div></li>';
  }

  function wire(el, groups, opts) {
    el.onclick = function (ev) {
      var h = ev.target.closest('.gs-doc-grp-h');
      if (h) {
        var g = h.parentNode;
        g.classList.toggle('open');
        h.setAttribute('aria-expanded', g.classList.contains('open') ? 'true' : 'false');
        return;
      }
      var b = ev.target.closest('[data-act]');
      if (!b) return;
      var grp = groups[Number(b.getAttribute('data-g'))];
      var doc = grp && grp.docs[Number(b.getAttribute('data-d'))];
      if (!doc) return;
      if (b.getAttribute('data-act') === 'view' && opts.onView) opts.onView(doc, grp);
      if (b.getAttribute('data-act') === 'del' && opts.onDelete) opts.onDelete(doc, grp);
    };
  }

  function renderGroups(containerId, groups, opts) {
    styleTag();
    opts = opts || {};
    var el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el) return;
    groups = (groups || []).filter(function (g) { return g.docs && g.docs.length; });
    if (!groups.length) { el.innerHTML = '<p class="gs-doc-empty">' + esc(opts.emptyMessage || 'No documents yet.') + '</p>'; return; }
    el.innerHTML = groups.map(function (g, gi) {
      var open = opts.openOrderId && g.orderId === opts.openOrderId;
      return '<div class="gs-doc-grp' + (open ? ' open' : '') + '" data-order="' + escAttr(g.orderId) + '">' +
        '<button type="button" class="gs-doc-grp-h" aria-expanded="' + (open ? 'true' : 'false') + '">' +
        '<span class="gs-doc-grp-main"><span class="gs-doc-grp-title">' + esc(g.clientLabel || g.orderId) + '</span>' +
        '<span class="gs-doc-grp-sub" style="display:block">' + esc([g.orderId, fmtDate(g.date)].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="gs-doc-count">' + g.docs.length + '</span><span class="gs-doc-arrow" aria-hidden="true">▶</span></button>' +
        '<div class="gs-doc-grp-body"><ul class="gs-doc-list">' +
        g.docs.map(function (d, di) { return rowHtml(d, gi, di, !!(opts.canDelete && opts.canDelete(d, g))); }).join('') +
        '</ul></div></div>';
    }).join('');
    wire(el, groups, opts);
    var openEl = opts.openOrderId && el.querySelector('.gs-doc-grp.open');
    if (openEl && openEl.scrollIntoView) openEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function renderList(el, docs, opts) {
    styleTag();
    opts = opts || {};
    if (!el) return;
    var groups = [{ orderId: opts.orderId || '', docs: docs || [] }];
    if (!docs || !docs.length) { el.innerHTML = opts.emptyHtml || ''; return; }
    el.innerHTML = '<ul class="gs-doc-list">' + docs.map(function (d, di) {
      return rowHtml(d, 0, di, !!(opts.canDelete && opts.canDelete(d, groups[0])));
    }).join('') + '</ul>';
    wire(el, groups, opts);
  }

  function searchHtml(inputId, placeholder) {
    styleTag();
    return '<div class="gs-doc-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input type="search" id="' + escAttr(inputId) + '" placeholder="' + escAttr(placeholder || 'Search by order, client or file name…') + '" aria-label="Search documents"></div>';
  }

  /* ---------- visor ---------- */
  var lastFocus = null;
  function close() {
    var m = document.getElementById('gs-doc-modal');
    if (m) m.remove();
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function open(d) {
    styleTag();
    close();
    lastFocus = document.activeElement;
    var m = document.createElement('div');
    m.id = 'gs-doc-modal';
    m.className = 'gs-doc-modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', d.name || 'Document');
    var body;
    if (d.loading) body = '<div class="gs-doc-modal-msg">Opening…</div>';
    else if (d.viewUrl) body = '<iframe src="' + escAttr(d.viewUrl) + '" title="' + escAttr(d.name || 'Document') + '"></iframe>';
    else body = '<div class="gs-doc-modal-msg">' + esc(d.error || 'This file can\'t be shown here.') + (d.downloadUrl ? '<br>Use Download to open it on your device.' : '') + '</div>';
    m.innerHTML = '<div class="gs-doc-modal-bar"><span class="gs-doc-modal-title">' + esc(d.name || '') + '</span>' +
      (d.downloadUrl ? '<a href="' + escAttr(d.downloadUrl) + '" target="_blank" rel="noopener" download>Download</a>' : '') +
      '<button type="button" class="gs-doc-close">Close</button></div><div class="gs-doc-modal-body">' + body + '</div>';
    m.querySelector('.gs-doc-close').onclick = close;
    document.body.appendChild(m);
    document.addEventListener('keydown', onKey);
    m.querySelector('.gs-doc-close').focus();
  }

  /* ---------- subida en pedazos ---------- */
  function pickFile(cb) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = ACCEPT;
    inp.style.display = 'none';
    inp.onchange = function () { var f = inp.files && inp.files[0]; inp.remove(); if (f) cb(f); };
    document.body.appendChild(inp);
    inp.click();
  }

  function putChunk(url, blob, from, to, total) {
    return fetch(url, {
      method: 'PUT',
      headers: { 'Content-Range': 'bytes ' + from + '-' + (to - 1) + '/' + total },
      body: blob
    }).then(function (r) {
      if (!r.ok && r.status !== 202) return r.text().then(function (t) { throw new Error('Upload failed (' + r.status + ')' + (t ? ': ' + t.slice(0, 120) : '')); });
      return r.status === 202 ? null : r.json();
    });
  }

  function upload(file, h) {
    var err = allowed(file);
    if (err) return Promise.reject(new Error(err));
    return Promise.resolve(h.start(file)).then(function (s) {
      if (!s || !s.uploadUrl) throw new Error('Could not start the upload.');
      var from = 0, total = file.size, item = null;
      function next() {
        if (from >= total) return Promise.resolve(item);
        var to = Math.min(from + CHUNK, total);
        return putChunk(s.uploadUrl, file.slice(from, to), from, to, total).then(function (res) {
          from = to;
          if (res && res.id) item = res;
          if (h.onProgress) h.onProgress(from / total);
          return next();
        });
      }
      return next();
    }).then(function (item) {
      if (!item || !item.id) throw new Error('The upload did not finish. Please try again.');
      return h.finish(file, item);
    });
  }

  window.GSDocViewer = {
    renderGroups: renderGroups, renderList: renderList, searchHtml: searchHtml,
    open: open, close: close, upload: upload, pickFile: pickFile, allowed: allowed,
    ACCEPT: ACCEPT, MAX_BYTES: MAX_BYTES, fmtSize: fmtSize, styleTag: styleTag
  };
})();
