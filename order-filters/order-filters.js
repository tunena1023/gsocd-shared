/* ============================================================
   gsocd-shared / order-filters
   La barra de ORDENAR y FILTRAR de las listas de ordenes, igual en
   los 3 portales y en todos sus tabs (26/09/2026, pedido del dueño:
   "los filtros deberian de estar en shared, y que todos los repos y
   todas las tabs tengan esos filtros").

   Nace de la que ya tenia Admin (renderSortFilterToolbar /
   applyOrderFilters / sortOrders en admin.html): mismos ids, mismas
   opciones, mismo look -- Admin solo delega aqui, no cambia nada para
   quien ya la usa.

   - Ordenar: Most recent change (default: lo que cambio al ultimo va
     hasta arriba) · Order number · Due date · Entry date · Client.
   - Filtrar: Division · Status (con cuantas hay de cada uno).
     (El filtro por Service se quito el 26/09/2026: "esta de mas", dueño.)
     Las opciones salen de la lista COMPLETA del tab (no de lo ya
     filtrado), para que nunca se encojan solas.
   - Lo elegido se guarda por tab (sessionStorage): sobrevive al
     repintado en vivo, a la camara y a la actualizacion automatica.

   Uso:
     // <div id="active-toolbar"></div> donde va la barra
     GSOrderFilters.render('active', fullList, { onChange: 'renderActive' });
     const shown = GSOrderFilters.apply('active', fullList);   // filtra + ordena
   Opciones (render y apply, las mismas en los dos):
     statusOf(o)   -> texto del estatus a mostrar (default o.Status)
     recentOf(o)   -> fecha del ultimo cambio (default lastModifiedDateTime
                      || createdDateTime)
     hide: ['division','status']  -> quitar filtros que no aplican
============================================================ */
(function () {
  'use strict';
  if (window.GSOrderFilters) return;

  var SORTS = [
    ['recent', 'Sort: Most recent change'],
    ['orderNum', 'Sort: Order number'],
    ['dueDate', 'Sort: Due date'],
    ['entryDate', 'Sort: Entry date'],
    ['client', 'Sort: Client (A-Z)']
  ];
  var FIELDS = ['sort', 'filter-division', 'filter-status'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function statusOf(o, opts) { return String((opts && opts.statusOf) ? opts.statusOf(o) : (o.Status || '')); }
  function recentOf(o, opts) {
    return String((opts && opts.recentOf) ? opts.recentOf(o) : (o.lastModifiedDateTime || o.createdDateTime || ''));
  }

  function storeKey(prefix) { return 'gs_order_filters_' + prefix; }
  function saved(prefix) {
    try { return JSON.parse(sessionStorage.getItem(storeKey(prefix)) || '{}') || {}; } catch (e) { return {}; }
  }
  function save(prefix) {
    var st = {};
    FIELDS.forEach(function (f) { var el = document.getElementById(prefix + '-' + f); if (el) st[f] = el.value; });
    try { sessionStorage.setItem(storeKey(prefix), JSON.stringify(st)); } catch (e) {}
  }
  /* Lo elegido: primero lo que hay en pantalla, si no lo guardado. */
  function value(prefix, field) {
    var el = document.getElementById(prefix + '-' + field);
    if (el) return el.value || '';
    return saved(prefix)[field] || '';
  }

  function styleTag() {
    if (document.getElementById('gs-order-filters-style')) return;
    var s = document.createElement('style');
    s.id = 'gs-order-filters-style';
    s.textContent =
      '.gs-ofl{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 12px}' +
      '.gs-ofl select{font-size:12px;padding:8px 10px;border:1px solid var(--border,#E0DDD6);background:var(--white,#fff);' +
      'color:var(--black,#111);font-family:inherit;border-radius:0;max-width:100%}' +
      '@media (max-width:600px){.gs-ofl select{flex:1 1 calc(50% - 4px);min-width:0}}';
    document.head.appendChild(s);
  }

  function uniq(values) {
    var seen = {}, out = [];
    values.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out;
  }

  function toolbarHtml(prefix, fullList, opts) {
    opts = opts || {};
    styleTag();
    var hide = opts.hide || [];
    var st = saved(prefix);
    var keep = function (f, dflt) {
      var el = document.getElementById(prefix + '-' + f);
      return el ? (el.value || '') : (st[f] != null ? st[f] : (dflt || ''));
    };
    var keepSort = keep('sort', 'recent') || 'recent';
    var list = fullList || [];
    var divisions = uniq(list.map(function (o) { return o.Division; })).sort();
    var statusCount = {};
    list.forEach(function (o) { var s = statusOf(o, opts); if (s) statusCount[s] = (statusCount[s] || 0) + 1; });
    var statuses = Object.keys(statusCount).sort();
    var onchange = 'GSOrderFilters._changed(\'' + esc(prefix) + '\');' + (opts.onChange ? opts.onChange + '()' : '');

    var opt = function (values, keepVal, allLabel, labelOf) {
      return '<option value="">' + esc(allLabel) + '</option>' + values.map(function (v) {
        return '<option value="' + esc(v) + '"' + (keepVal === v ? ' selected' : '') + '>' + esc(labelOf ? labelOf(v) : v) + '</option>';
      }).join('');
    };
    var sel = function (field, inner, cls) {
      return '<select id="' + esc(prefix) + '-' + field + '" class="' + (cls || '') + '" onchange="' + onchange + '" aria-label="' + field.replace('filter-', 'Filter by ') + '">' + inner + '</select>';
    };
    var html = sel('sort', SORTS.map(function (s) {
      return '<option value="' + s[0] + '"' + (keepSort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
    }).join(''));
    if (hide.indexOf('division') === -1 && divisions.length > 1) html += sel('filter-division', opt(divisions, keep('filter-division'), 'All divisions'));
    if (hide.indexOf('status') === -1 && statuses.length) html += sel('filter-status', opt(statuses, keep('filter-status'), 'All statuses', function (v) { return v + ' (' + statusCount[v] + ')'; }));
    return '<div class="gs-ofl">' + html + '</div>';
  }

  function render(prefix, fullList, opts) {
    var box = document.getElementById(prefix + '-toolbar');
    if (!box) return;
    box.innerHTML = toolbarHtml(prefix, fullList, opts);
    save(prefix);
  }

  function filter(prefix, list, opts) {
    var division = value(prefix, 'filter-division');
    var status = value(prefix, 'filter-status');
    return (list || []).filter(function (o) {
      if (division && o.Division !== division) return false;
      if (status && statusOf(o, opts) !== status) return false;
      return true;
    });
  }

  function sort(list, sortBy, opts) {
    var arr = (list || []).slice();
    var by = function (f) { return function (a, b) { return String(f(a) || '').localeCompare(String(f(b) || '')); }; };
    if (sortBy === 'orderNum') {
      arr.sort(function (a, b) { return String(a.OrderID || '').localeCompare(String(b.OrderID || ''), undefined, { numeric: true }); });
    } else if (sortBy === 'dueDate') {
      arr.sort(by(function (o) { return o.DueDate; }));
    } else if (sortBy === 'entryDate') {
      arr.sort(by(function (o) { return o.EntryDate; }));
    } else if (sortBy === 'client') {
      arr.sort(by(function (o) { return o.BusinessName; }));
    } else {
      arr.sort(function (a, b) { return recentOf(b, opts).localeCompare(recentOf(a, opts)); });
    }
    return arr;
  }

  function apply(prefix, list, opts) {
    return sort(filter(prefix, list, opts), value(prefix, 'sort') || 'recent', opts);
  }

  window.GSOrderFilters = {
    render: render, toolbarHtml: toolbarHtml, filter: filter, sort: sort, apply: apply,
    value: value, recentOf: recentOf,
    _changed: save
  };
})();
