(function () {
  'use strict';

  if (window.GSServicePicker) return;

  var instances = {};

  function styleTag() {
    if (document.getElementById('gs-sp-style')) return;
    var style = document.createElement('style');
    style.id = 'gs-sp-style';
    style.textContent =
      '.gs-sp-res-wrap{display:flex;align-items:center;gap:8px;margin:16px 0}' +
      '.gs-sp-res-label{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--gray,#6B6B6B)}' +
      '.gs-sp-toggle{position:relative;display:inline-block;width:40px;height:22px;vertical-align:middle;cursor:pointer}' +
      '.gs-sp-toggle input{opacity:0;width:0;height:0}' +
      '.gs-sp-toggle-track{position:absolute;inset:0;background:var(--border,#E0D9CC);border-radius:22px;transition:background .2s}' +
      '.gs-sp-toggle-track::before{content:"";position:absolute;height:18px;width:18px;left:2px;top:2px;background:var(--white,#fff);border-radius:50%;transition:transform .2s;box-shadow:0 1px 2px rgba(0,0,0,.25)}' +
      '.gs-sp-toggle input:checked+.gs-sp-toggle-track{background:var(--gold,#C9A84C)}' +
      '.gs-sp-toggle input:checked+.gs-sp-toggle-track::before{transform:translateX(18px)}' +
      '.gs-sp-toolbar-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;flex-wrap:wrap}' +
      '.gs-sp-search{flex:1;min-width:140px;max-width:none;padding:9px 12px;border:1px solid var(--border,#E0D9CC);border-radius:3px;font-size:13px;font-family:inherit}' +
      '.gs-sp-selall{display:flex;align-items:center;gap:10px;flex-shrink:0}' +
      '.gs-sp-selall-label{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--gray,#6B6B6B)}' +
      '.gs-sp-lvl3{position:relative;display:flex;width:180px;height:34px;background:var(--border,#E0D9CC);border-radius:17px;padding:3px;flex-shrink:0}' +
      '.gs-sp-lvl3-thumb{position:absolute;top:3px;left:3px;width:calc(33.333% - 2px);height:calc(100% - 6px);background:var(--gold,#C9A84C);border-radius:14px;transition:transform .25s cubic-bezier(.4,0,.2,1),opacity .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);opacity:0}' +
      '.gs-sp-lvl3-opt{position:relative;flex:1;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--gray,#6B6B6B);cursor:pointer;z-index:1;transition:color .25s}' +
      '.gs-sp-lvl3-opt.active{color:var(--black,#111)}' +
      '.gs-sp-chip-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}' +
      '.gs-sp-chip-btn{border:1px solid var(--border,#E0D9CC);background:var(--white,#fff);padding:10px 12px;font-size:12px;text-align:left;cursor:pointer;border-radius:2px;font-family:inherit;color:var(--black,#111)}' +
      '.gs-sp-chip-btn.active{background:var(--gold,#C9A84C);border-color:var(--gold,#C9A84C);font-weight:700}' +
      '.gs-sp-row-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}' +
      '.gs-sp-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 10px;border:1px solid var(--border,#E0D9CC);border-radius:3px;background:var(--white,#fff);transition:border-color .15s,background .15s}' +
      '.gs-sp-row.selected{border-color:var(--gold,#C9A84C);background:#FEFBF3}' +
      '.gs-sp-row-name{font-size:12px}' +
      '.gs-sp-lvl-group{display:flex;border:1px solid var(--border,#E0D9CC);border-radius:20px;overflow:hidden;flex-shrink:0}' +
      '.gs-sp-lvl-btn{width:34px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;cursor:pointer;background:var(--white,#fff);color:var(--gray,#6B6B6B);border-right:1px solid var(--border,#E0D9CC)}' +
      '.gs-sp-lvl-btn:last-child{border-right:none}' +
      '.gs-sp-lvl-btn.active{background:var(--gold,#C9A84C);color:var(--black,#111)}' +
      '.gs-sp-lvl-btn:hover:not(.active){background:var(--off,#F7F6F3)}' +
      '.gs-sp-empty{color:var(--gray,#6B6B6B);font-size:13px}' +
      '@media (max-width:900px){.gs-sp-chip-grid,.gs-sp-row-grid{grid-template-columns:1fr 1fr}}' +
      '@media (max-width:640px){.gs-sp-chip-grid,.gs-sp-row-grid{grid-template-columns:1fr}}' +
      /* Acordeon por categoria -- confirmado con el usuario: sin
         categorias no tiene caso, y su catalogo (importado de
         QuickBooks) no traia ese campo, asi que ahora se mantiene a
         mano (Developer > Catalog). Servicios sin categoria caen en
         "Uncategorized", nunca se pierden. */
      '.gs-sp-cat-group{border:1px solid var(--border,#E0D9CC);margin-bottom:8px;border-radius:4px;overflow:hidden}' +
      '.gs-sp-cat-header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;cursor:pointer;background:var(--white,#fff)}' +
      '.gs-sp-cat-header.has-selected{background:#FEFBF3}' +
      '.gs-sp-cat-name{font-size:13px;font-weight:600}' +
      '.gs-sp-cat-count{font-size:10px;color:var(--gold-dk,#8C6F2A);font-weight:700;background:#F0E4C4;padding:2px 8px;border-radius:10px;margin-left:8px}' +
      '.gs-sp-cat-arrow{font-size:11px;color:var(--gray,#6B6B6B);transition:transform .2s;flex-shrink:0}' +
      '.gs-sp-cat-arrow.open{transform:rotate(90deg)}' +
      '.gs-sp-cat-body{display:none;padding:8px 12px 12px;border-top:1px solid var(--border,#E0D9CC)}' +
      '.gs-sp-cat-body.open{display:block}' +
      '.gs-sp-cat-body .gs-sp-chip-grid,.gs-sp-cat-body .gs-sp-row-grid{grid-template-columns:1fr}';
    document.head.appendChild(style);
  }

  function svcKey(propertyType, name) { return propertyType + '|' + name; }

  function fireChange(pickerId) {
    var inst = instances[pickerId];
    if (inst.onChange) inst.onChange(inst.selected, inst.svcLevel, inst.propertyType);
    document.dispatchEvent(new CustomEvent('gs-services-changed', {
      detail: { pickerId: pickerId, selected: inst.selected, svcLevel: inst.svcLevel, propertyType: inst.propertyType }
    }));
  }

  function visibleList(inst) {
    var q = inst.searchEl ? (inst.searchEl.value || '').trim().toLowerCase() : '';
    var list = inst.catalog.filter(function (s) {
      var divMatch = inst.crossDivision || s.division.toLowerCase() === inst.division.toLowerCase();
      return divMatch && s.propertyType === inst.propertyType;
    });
    if (inst.filterMode === 'selected-plus-search') {
      var selectedNames = Object.keys(inst.selected[inst.propertyType] || {});
      list = list.filter(function (s) {
        return selectedNames.indexOf(s.serviceName) !== -1 || (q && s.serviceName.toLowerCase().indexOf(q) !== -1);
      });
    } else if (q) {
      list = list.filter(function (s) { return s.serviceName.toLowerCase().indexOf(q) !== -1; });
    }
    list.sort(function (a, b) { return a.serviceName.localeCompare(b.serviceName); });
    return list;
  }

  function itemHtml(inst, s) {
    if (inst.mode === 'levels') {
      var sel = String((inst.selected[inst.propertyType] || {})[s.serviceName]) === String(s.sku);
      var lvl = sel ? inst.svcLevel[svcKey(inst.propertyType, s.serviceName)] : null;
      var levels = ['Level 1', 'Level 2', 'Level 3'];
      var btns = levels.map(function (l, i) {
        return '<div class="gs-sp-lvl-btn' + (lvl === l ? ' active' : '') + '" data-sku="' + escapeAttr(s.sku) + '" data-level="' + l + '">L' + (i + 1) + '</div>';
      }).join('');
      return '<div class="gs-sp-row' + (lvl ? ' selected' : '') + '">' +
        '<span class="gs-sp-row-name">' + escapeHtml(s.serviceName) + '</span>' +
        '<div class="gs-sp-lvl-group">' + btns + '</div></div>';
    }
    var active = String((inst.selected[inst.propertyType] || {})[s.serviceName]) === String(s.sku);
    return '<button type="button" class="gs-sp-chip-btn' + (active ? ' active' : '') + '" data-sku="' + escapeAttr(s.sku) + '">' + escapeHtml(s.serviceName) + '</button>';
  }

  function bindItemEvents(inst, pickerId, scopeEl) {
    if (inst.mode === 'levels') {
      Array.prototype.forEach.call(scopeEl.querySelectorAll('.gs-sp-lvl-btn'), function (btn) {
        btn.addEventListener('click', function () { pickLevel(pickerId, btn.dataset.sku, btn.dataset.level); });
      });
    } else {
      Array.prototype.forEach.call(scopeEl.querySelectorAll('.gs-sp-chip-btn'), function (btn) {
        btn.addEventListener('click', function () { toggleChip(pickerId, btn.dataset.sku); });
      });
    }
  }

  function isSelected(inst, s) {
    return String((inst.selected[inst.propertyType] || {})[s.serviceName]) === String(s.sku);
  }

  /* Acordeon por categoria -- confirmado con el usuario: sin
     categorias reales de su catalogo (viene de QuickBooks, sin ese
     campo), se mantiene a mano desde Developer. Servicios sin
     categoria asignada todavia caen en "Uncategorized" al final, sin
     perderse. Buscar abre solo las categorias con resultados (mismo
     criterio ya aprobado en el mini). */
  function renderGroupedGrid(pickerId, inst, list) {
    var grid = inst.gridEl;
    var q = inst.searchEl ? (inst.searchEl.value || '').trim().toLowerCase() : '';
    var groups = {};
    var order = [];
    list.forEach(function (s) {
      var cat = s.category || 'Uncategorized';
      if (!groups[cat]) { groups[cat] = []; order.push(cat); }
      groups[cat].push(s);
    });
    order.sort(function (a, b) {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    });

    grid.className = 'gs-sp-accordion';
    grid.innerHTML = order.map(function (cat, i) {
      var items = groups[cat];
      var count = items.filter(function (s) { return isSelected(inst, s); }).length;
      var isOpen = q ? true : !!inst.openCats[cat];
      var gridClass = inst.mode === 'levels' ? 'gs-sp-row-grid' : 'gs-sp-chip-grid';
      return '<div class="gs-sp-cat-group">' +
        '<div class="gs-sp-cat-header' + (count ? ' has-selected' : '') + '" data-cat="' + escapeAttr(cat) + '">' +
        '<span class="gs-sp-cat-name">' + escapeHtml(cat) + (count ? '<span class="gs-sp-cat-count">' + count + '</span>' : '') + '</span>' +
        '<span class="gs-sp-cat-arrow' + (isOpen ? ' open' : '') + '">\u25B8</span>' +
        '</div>' +
        '<div class="gs-sp-cat-body' + (isOpen ? ' open' : '') + '"><div class="' + gridClass + '">' +
        items.map(function (s) { return itemHtml(inst, s); }).join('') +
        '</div></div></div>';
    }).join('');

    Array.prototype.forEach.call(grid.querySelectorAll('.gs-sp-cat-header'), function (header) {
      header.addEventListener('click', function () {
        var cat = header.dataset.cat;
        inst.openCats[cat] = !inst.openCats[cat];
        renderGrid(pickerId);
      });
    });
    bindItemEvents(inst, pickerId, grid);
  }

  function renderGrid(pickerId) {
    var inst = instances[pickerId];
    var grid = inst.gridEl;
    var list = visibleList(inst);

    if (!list.length) {
      grid.className = '';
      var emptyMsg = (inst.filterMode === 'selected-plus-search' && !(inst.searchEl && inst.searchEl.value.trim()))
        ? 'Type to search services\u2026'
        : 'No services match.';
      grid.innerHTML = '<p class="gs-sp-empty">' + emptyMsg + '</p>';
      return;
    }

    if (inst.groupByCategory) {
      renderGroupedGrid(pickerId, inst, list);
      return;
    }

    if (inst.mode === 'levels') {
      grid.className = 'gs-sp-row-grid';
      grid.innerHTML = list.map(function (s) { return itemHtml(inst, s); }).join('');
    } else {
      grid.className = 'gs-sp-chip-grid';
      grid.innerHTML = list.map(function (s) { return itemHtml(inst, s); }).join('');
    }
    bindItemEvents(inst, pickerId, grid);
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  function toggleChip(pickerId, sku) {
    var inst = instances[pickerId];
    var svc = inst.catalog.find(function (s) { return String(s.sku) === String(sku); });
    if (!svc) return;
    if (!inst.selected[inst.propertyType]) inst.selected[inst.propertyType] = {};
    if (String(inst.selected[inst.propertyType][svc.serviceName]) === String(sku)) {
      delete inst.selected[inst.propertyType][svc.serviceName];
      if (!Object.keys(inst.selected[inst.propertyType]).length) delete inst.selected[inst.propertyType];
    } else {
      inst.selected[inst.propertyType][svc.serviceName] = sku;
    }
    renderGrid(pickerId);
    fireChange(pickerId);
  }

  function pickLevel(pickerId, sku, level) {
    var inst = instances[pickerId];
    var svc = inst.catalog.find(function (s) { return String(s.sku) === String(sku); });
    if (!svc) return;
    var k = svcKey(inst.propertyType, svc.serviceName);
    if (!inst.selected[inst.propertyType]) inst.selected[inst.propertyType] = {};
    var already = String(inst.selected[inst.propertyType][svc.serviceName]) === String(sku) && inst.svcLevel[k] === level;
    if (already) {
      delete inst.selected[inst.propertyType][svc.serviceName];
      if (!Object.keys(inst.selected[inst.propertyType]).length) delete inst.selected[inst.propertyType];
      delete inst.svcLevel[k];
    } else {
      inst.selected[inst.propertyType][svc.serviceName] = sku;
      inst.svcLevel[k] = level;
    }
    renderGrid(pickerId);
    fireChange(pickerId);
  }

  function selectAllLevel(pickerId, level, idx) {
    var inst = instances[pickerId];
    var visible = visibleList(inst);
    if (!inst.selected[inst.propertyType]) inst.selected[inst.propertyType] = {};

    if (inst.selAllActive === idx) {
      visible.forEach(function (s) {
        delete inst.selected[inst.propertyType][s.serviceName];
        delete inst.svcLevel[svcKey(inst.propertyType, s.serviceName)];
      });
      inst.selAllActive = null;
      if (inst.selAllThumbEl) inst.selAllThumbEl.style.opacity = '0';
    } else {
      visible.forEach(function (s) {
        inst.selected[inst.propertyType][s.serviceName] = s.sku;
        inst.svcLevel[svcKey(inst.propertyType, s.serviceName)] = level;
      });
      inst.selAllActive = idx;
      if (inst.selAllThumbEl) {
        inst.selAllThumbEl.style.opacity = '1';
        inst.selAllThumbEl.style.transform = 'translateX(' + (idx * 100) + '%)';
      }
    }
    if (inst.selAllOptsEl) {
      Array.prototype.forEach.call(inst.selAllOptsEl.querySelectorAll('.gs-sp-lvl3-opt'), function (el, i) {
        el.classList.toggle('active', i === inst.selAllActive);
      });
    }
    renderGrid(pickerId);
    fireChange(pickerId);
  }

  function mount(pickerId, container, options) {
    styleTag();
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) return null;

    var inst = {
      catalog: options.catalog || [],
      division: options.division || '',
      propertyType: options.propertyType || 'Commercial',
      mode: options.mode || 'toggle',
      filterMode: options.filterMode || 'all',
      crossDivision: !!options.crossDivision,
      showPropertyToggle: options.showPropertyToggle !== false,
      showSelectAll: !!options.showSelectAll,
      groupByCategory: !!options.groupByCategory,
      openCats: {},
      selected: options.initialSelected || {},
      svcLevel: options.initialLevels || {},
      selAllActive: null,
      onChange: options.onChange || null
    };
    instances[pickerId] = inst;

    var html = '';
    if (inst.showPropertyToggle) {
      html +=
        '<div class="gs-sp-res-wrap">' +
        '<span class="gs-sp-res-label">Commercial</span>' +
        '<label class="gs-sp-toggle">' +
        '<input type="checkbox" id="gs-sp-restoggle-' + pickerId + '"' + (inst.propertyType === 'Residential' ? ' checked' : '') + '>' +
        '<span class="gs-sp-toggle-track"></span></label>' +
        '<span class="gs-sp-res-label">Residential</span></div>';
    }
    html +=
      '<div class="gs-sp-toolbar-row">' +
      '<input type="text" class="gs-sp-search" id="gs-sp-search-' + pickerId + '" placeholder="Search services\u2026">';
    if (inst.showSelectAll) {
      html +=
        '<div class="gs-sp-selall">' +
        '<span class="gs-sp-selall-label">Select all</span>' +
        '<div class="gs-sp-lvl3" id="gs-sp-selalltoggle-' + pickerId + '">' +
        '<div class="gs-sp-lvl3-thumb" id="gs-sp-selallthumb-' + pickerId + '"></div>' +
        '<div class="gs-sp-lvl3-opt" data-idx="0">L1</div>' +
        '<div class="gs-sp-lvl3-opt" data-idx="1">L2</div>' +
        '<div class="gs-sp-lvl3-opt" data-idx="2">L3</div>' +
        '</div></div>';
    }
    html += '</div><div id="gs-sp-grid-' + pickerId + '"></div>';

    container.innerHTML = html;

    inst.searchEl = document.getElementById('gs-sp-search-' + pickerId);
    inst.gridEl = document.getElementById('gs-sp-grid-' + pickerId);
    inst.selAllThumbEl = document.getElementById('gs-sp-selallthumb-' + pickerId);
    inst.selAllOptsEl = document.getElementById('gs-sp-selalltoggle-' + pickerId);

    inst.searchEl.addEventListener('input', function () { renderGrid(pickerId); });

    var toggleEl = document.getElementById('gs-sp-restoggle-' + pickerId);
    if (toggleEl) {
      toggleEl.addEventListener('change', function () {
        inst.propertyType = toggleEl.checked ? 'Residential' : 'Commercial';
        renderGrid(pickerId);
        fireChange(pickerId);
      });
    }

    if (inst.selAllOptsEl) {
      var levelNames = ['Level 1', 'Level 2', 'Level 3'];
      Array.prototype.forEach.call(inst.selAllOptsEl.querySelectorAll('.gs-sp-lvl3-opt'), function (el, i) {
        el.addEventListener('click', function () { selectAllLevel(pickerId, levelNames[i], i); });
      });
    }

    renderGrid(pickerId);

    return {
      getSelected: function () { return inst.selected; },
      getLevels: function () { return inst.svcLevel; },
      getPropertyType: function () { return inst.propertyType; },
      setSelected: function (selected, levels) {
        inst.selected = selected || {};
        inst.svcLevel = levels || {};
        renderGrid(pickerId);
      },
      setDivision: function (division) { inst.division = division; renderGrid(pickerId); },
      setPropertyType: function (type) {
        inst.propertyType = type;
        if (toggleEl) toggleEl.checked = type === 'Residential';
        renderGrid(pickerId);
      },
      setCatalog: function (catalog) { inst.catalog = catalog; renderGrid(pickerId); },
      destroy: function () { delete instances[pickerId]; container.innerHTML = ''; }
    };
  }

  window.GSServicePicker = { mount: mount };
})();
