/* ============================================================
   service-change-panel.js -- "lista + selector + diff" de servicios,
   la pieza reusable detras de "Request a Change" (cliente, Recurring y
   Processing) y de la edicion de servicios en Admin. Extraido el
   14/09/2026 de lo que ya se construyo y probo inline en
   ordersgsocd.com (recurring.html / customer.html) -- mismo patron que
   ya usaba Supervisor (tech.gsocd.com, "Update Services") con
   GSServicePicker + diff propio.

   Tres piezas, cada pagina usa las que necesita:

   1. GSServiceChangePanel.currentListHtml(services, opts)
      HTML de "Currently on this contract/order": un renglon por
      servicio con nombre + nota (opcional) + camara. Mismo look que
      buildAdminSelectedListHtml() en admin.html (Active > Edit).
      La nota y la foto de estos renglones NO se ligan a un servicio
      especifico en el backend -- la nota se junta al mensaje general
      (ver collectNotes), la camara dispara opts.onCamera (la pagina
      decide que hacer, p.ej. reusar addClientPhoto()).

   2. GSServiceChangePanel.mount(opts)
      Monta el GSServicePicker real precargado con los servicios
      actuales, y pinta el diff en vivo (verde = agregado, rojo =
      quitado con nota obligatoria). Regresa un controlador.

   3. controller.collect()
      Junta todo listo para mandar: { ok, services, removedNotes,
      message }. Si falta una nota obligatoria de un quitado, marca el
      error en pantalla y regresa ok:false.

   Cero onclick inline: la camara y todo lo demas van por delegacion
   de eventos sobre el contenedor, asi nunca choca con nombres de
   funciones globales de la pagina que lo usa (leccion real del
   14/09/2026: toggleChangePanel/renderChangePanel ya existian en
   customer.html para el Request Change de ordenes normales, y la
   copia de Recurring las piso).

   Quirk heredado del picker, documentado para no confundirse: los
   servicios que YA estan en el contrato/orden no traen sku real (solo
   nombre), asi que initialSelected usa el nombre como llave temporal
   -- por eso el primer clic en CUALQUIER nivel de un servicio ya
   existente lo RE-selecciona (guarda el sku real) en vez de quitarlo,
   y se necesita un segundo clic en ese mismo nivel para de verdad
   des-seleccionarlo. Mismo comportamiento que ya tiene Supervisor.
============================================================ */
(function () {
  'use strict';

  if (window.GSServiceChangePanel) return;

  var STYLE_ID = 'gs-service-change-panel-style';
  var CAM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      /* Renglon de servicio actual: nombre + nota + camara (copiado de admin.html) */
      '.gs-scp-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border, #E0D9CC); }' +
      '.gs-scp-row:last-child { border-bottom: none; }' +
      '.gs-scp-row-name { flex: 0 0 auto; max-width: 240px; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
      '.gs-scp-row-notewrap { flex: 1; min-width: 0; }' +
      '.gs-scp-row-note { width: 100%; border: 1.5px solid var(--border, #E0D9CC); border-radius: 5px; padding: 7px 10px; font-size: 12.5px; font-family: inherit; color: var(--black, #111); background: var(--off, #F7F6F3); outline: none; box-sizing: border-box; transition: border-color .15s, background .15s; }' +
      '.gs-scp-row-note:focus { border-color: var(--gold, #C9A84C); background: var(--white, #fff); }' +
      '.gs-scp-row-note::placeholder { color: #A9A49A; }' +
      '.gs-scp-row-cam { flex-shrink: 0; width: 32px; height: 32px; border-radius: 6px; border: 1.5px solid var(--border, #E0D9CC); background: var(--white, #fff); color: var(--gray, #6B6B6B); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: border-color .15s, color .15s; position: relative; padding: 0; }' +
      '.gs-scp-row-cam:hover { border-color: var(--gold, #C9A84C); color: var(--gold-dk, #8C6F2A); }' +
      '.gs-scp-row-cam svg { width: 14px; height: 14px; }' +
      /* Apilado (nombre arriba, nota+camara abajo) -- para columnas
         angostas, mismo breakpoint que admin.html trae en movil */
      '.gs-scp-stack .gs-scp-row { flex-wrap: wrap; }' +
      '.gs-scp-stack .gs-scp-row-name { max-width: none; flex-basis: 100%; white-space: normal; }' +
      '@media (max-width: 640px) { .gs-scp-row { flex-wrap: wrap; } .gs-scp-row-name { max-width: none; flex-basis: 100%; white-space: normal; } }' +
      /* Diff agregados/quitados (mismo patron que Supervisor) */
      '.gs-scp-diff { background: var(--white, #fff); border: 1px solid var(--border, #E0D9CC); padding: 12px 14px; margin: 14px 0; border-radius: 4px; }' +
      '.gs-scp-diff-line { font-size: 12px; margin-bottom: 4px; }' +
      '.gs-scp-diff-line.removed { color: var(--red, #c0392b); }' +
      '.gs-scp-diff-line.added { color: var(--green, #2E7D4F); }' +
      '.gs-scp-diff-empty { font-size: 12px; color: var(--gray, #6B6B6B); }' +
      '.gs-scp-note-box { background: var(--off, #F7F6F3); border: 1px solid var(--border, #E0D9CC); padding: 12px; margin: 6px 0 10px; }' +
      '.gs-scp-note-box label { font-size: 10px; text-transform: uppercase; color: var(--gray, #6B6B6B); font-weight: 700; display: block; margin-bottom: 6px; }' +
      '.gs-scp-note-box textarea { width: 100%; padding: 10px; border: 1px solid var(--border, #E0D9CC); font-size: 12px; font-family: inherit; resize: vertical; min-height: 56px; box-sizing: border-box; }' +
      '.gs-scp-note-error { font-size: 11px; color: var(--red, #c0392b); margin-top: 6px; display: none; }' +
      '.gs-scp-note-error.show { display: block; }';
    document.head.appendChild(s);
  }

  /* Contador para dar un id unico a cada instancia (varios paneles
     pueden coexistir en la misma pagina, p.ej. una tarjeta por orden). */
  var seq = 0;

  /* ---- 1. Lista de servicios actuales -------------------------- */
  function currentListHtml(services, opts) {
    injectStyle();
    opts = opts || {};
    var listId = opts.listId || ('gs-scp-list-' + (++seq));
    var placeholder = opts.notePlaceholder || 'Note about this service (optional)';
    var showCamera = opts.showCamera !== false;
    var stackClass = opts.stack ? ' gs-scp-stack' : '';
    var rows = (services || []).map(function (s, i) {
      var label = esc(s.ServiceName) + (s.Level ? ' \u2014 ' + esc(s.Level) : '');
      return '<div class="gs-scp-row" data-index="' + i + '">' +
        '<b class="gs-scp-row-name">' + label + '</b>' +
        '<div class="gs-scp-row-notewrap"><input type="text" class="gs-scp-row-note" data-index="' + i + '" placeholder="' + esc(placeholder) + '"></div>' +
        (showCamera ? '<button type="button" class="gs-scp-row-cam" data-index="' + i + '" title="Add a photo">' + CAM_ICON + '</button>' : '') +
      '</div>';
    }).join('');
    if (!rows) return '';
    return '<div class="gs-scp-list' + stackClass + '" id="' + esc(listId) + '">' + rows + '</div>';
  }

  /* Conecta la camara de la lista por delegacion: opts.onCamera(index,
     service). Se llama una vez por lista, sobre su contenedor. */
  function wireList(listEl, services, opts) {
    if (!listEl || listEl.__gsScpWired) return;
    listEl.__gsScpWired = true;
    listEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.gs-scp-row-cam');
      if (!btn) return;
      var idx = parseInt(btn.getAttribute('data-index'), 10);
      if (opts && typeof opts.onCamera === 'function') opts.onCamera(idx, (services || [])[idx]);
    });
  }

  /* Junta las notas por servicio de la lista, prefijadas con el nombre
     ("Vacuum Carpets: ...") -- van al mensaje general, no ligadas a un
     servicio especifico en el backend. */
  function collectNotes(listEl, services) {
    var parts = [];
    if (!listEl) return parts;
    (services || []).forEach(function (s, i) {
      var input = listEl.querySelector('.gs-scp-row-note[data-index="' + i + '"]');
      if (input && input.value.trim()) parts.push(s.ServiceName + ': ' + input.value.trim());
    });
    return parts;
  }

  /* ---- 2. Selector + diff ---------------------------------------- */
  function mount(opts) {
    injectStyle();
    opts = opts || {};
    var pickerMountEl = typeof opts.pickerMount === 'string' ? document.getElementById(opts.pickerMount) : opts.pickerMount;
    var diffEl = typeof opts.diffMount === 'string' ? document.getElementById(opts.diffMount) : opts.diffMount;
    if (!pickerMountEl || !diffEl || !window.GSServicePicker) return null;

    var instanceId = opts.instanceId || ('gs-scp-' + (++seq));
    var propertyType = opts.propertyType || 'Commercial';
    var baseNames = [];
    var initialSelected = {};
    var initialLevels = {};
    initialSelected[propertyType] = {};
    (opts.currentServices || []).forEach(function (s) {
      initialSelected[propertyType][s.ServiceName] = s.ServiceName; // sin sku real, el nombre es la llave (ver quirk arriba)
      if (s.Level) initialLevels[propertyType + '|' + s.ServiceName] = s.Level;
      baseNames.push(s.ServiceName);
    });

    var picker = null;
    var ctrl = {
      id: instanceId,
      picker: null,
      baseNames: baseNames,

      /* Nombres agregados / quitados respecto a lo que habia. */
      getDiff: function () {
        var nowNames = {};
        var selected = picker ? picker.getSelected() : {};
        Object.keys(selected).forEach(function (pt) {
          Object.keys(selected[pt] || {}).forEach(function (n) { nowNames[n] = true; });
        });
        var removed = baseNames.filter(function (n) { return !nowNames[n]; });
        var added = Object.keys(nowNames).filter(function (n) { return baseNames.indexOf(n) === -1; });
        return { added: added, removed: removed };
      },

      renderDiff: function () {
        var d = ctrl.getDiff();
        if (!d.added.length && !d.removed.length) {
          diffEl.innerHTML = '<div class="gs-scp-diff"><span class="gs-scp-diff-empty">No changes yet.</span></div>';
          return;
        }
        var html = '<div class="gs-scp-diff">';
        d.added.forEach(function (n) { html += '<div class="gs-scp-diff-line added">+ ' + esc(n) + '</div>'; });
        d.removed.forEach(function (n, i) {
          html += '<div class="gs-scp-diff-line removed">\u2212 ' + esc(n) + '</div>';
          html += '<div class="gs-scp-note-box">' +
            '<label>Why remove "' + esc(n) + '"? (required)</label>' +
            '<textarea data-removed-index="' + i + '"></textarea>' +
            '<p class="gs-scp-note-error" data-removed-index="' + i + '">Please add a note.</p>' +
          '</div>';
        });
        html += '</div>';
        diffEl.innerHTML = html;
        if (typeof opts.onDiffChange === 'function') opts.onDiffChange(d);
      },

      /* Junta todo listo para mandar. Si falta una nota obligatoria de
         un quitado, marca el error y regresa ok:false. */
      collect: function () {
        var d = ctrl.getDiff();
        var levels = picker ? picker.getLevels() : {};
        var removedNotes = [];
        var ok = true;
        d.removed.forEach(function (n, i) {
          var ta = diffEl.querySelector('textarea[data-removed-index="' + i + '"]');
          var err = diffEl.querySelector('.gs-scp-note-error[data-removed-index="' + i + '"]');
          if (!ta || !ta.value.trim()) {
            if (err) err.classList.add('show');
            ok = false;
            return;
          }
          if (err) err.classList.remove('show');
          removedNotes.push({ serviceName: n, note: ta.value.trim() });
        });
        var services = d.added.map(function (n) {
          return { serviceName: n, level: levels[propertyType + '|' + n] || '' };
        });
        return { ok: ok, services: services, removedNotes: removedNotes, added: d.added, removed: d.removed };
      }
    };

    picker = GSServicePicker.mount(instanceId, pickerMountEl, {
      catalog: opts.catalog || [],
      division: opts.division || 'Janitorial',
      mode: opts.mode || 'levels',
      showSelectAll: !!opts.showSelectAll,
      groupByCategory: opts.groupByCategory !== false,
      propertyType: propertyType,
      showPropertyToggle: opts.showPropertyToggle !== false,
      initialSelected: initialSelected,
      initialLevels: initialLevels,
      onChange: function () { ctrl.renderDiff(); }
    });
    ctrl.picker = picker;
    ctrl.renderDiff();
    return ctrl;
  }

  window.GSServiceChangePanel = {
    currentListHtml: currentListHtml,
    wireList: wireList,
    collectNotes: collectNotes,
    mount: mount
  };
})();
