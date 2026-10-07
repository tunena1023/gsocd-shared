/* ============================================================
   unit-services.js -- servicios propios de UNA unidad en una orden de
   varias unidades (07/10/2026, dueño: "en multi order cuando seleccionen
   Customize que se abra una barra de busqueda ... nomas la barra y al
   escribir se popula y se agrega el servicio seleccionado"). Lo usan
   Orders (customer.html) y Admin (Create Order), dentro del Customize de
   cada unidad.

   Solo una barra: al escribir sale la lista de servicios que coinciden;
   al escoger uno se agrega como etiqueta (con su nivel si es Janitorial y
   su cantidad si el catalogo la pide) y se puede quitar con la x.
   Sin servicios agregados, la unidad usa los de la orden (eso lo decide
   quien lo usa: getItems() regresa []).

   GSUnitServices.mount(container, {
     catalog, division, crossDivision, propertyType,
     levelFor: sku => 'Level 2' (opcional: nivel con el que arranca),
     onChange: items => {}
   }) -> { getItems() -> [{ sku, level, qty }], setItems(items),
           setCatalog(c), setDivision(d, cross), setPropertyType(t), destroy() }
============================================================ */
(function () {
  'use strict';
  if (window.GSUnitServices) return;

  var LEVELS = ['Level 1', 'Level 2', 'Level 3'];

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  function styleTag() {
    if (document.getElementById('gs-us-style')) return;
    var st = document.createElement('style');
    st.id = 'gs-us-style';
    st.textContent =
      '.gs-us{position:relative}' +
      '.gs-us-search{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border,#E0D9CC);border-radius:3px;font-size:13px;font-family:inherit;background:var(--white,#fff)}' +
      '.gs-us-search:focus{outline:none;border-color:var(--gold,#C9A84C)}' +
      '.gs-us-drop{position:absolute;left:0;right:0;z-index:30;margin-top:2px;background:var(--white,#fff);border:1px solid var(--border,#E0D9CC);border-radius:3px;box-shadow:0 6px 18px rgba(0,0,0,.08);max-height:260px;overflow:auto}' +
      '.gs-us-opt{padding:9px 12px;font-size:13px;cursor:pointer;display:flex;justify-content:space-between;gap:10px}' +
      '.gs-us-opt:hover,.gs-us-opt.on{background:#FEFBF3}' +
      '.gs-us-opt small{color:var(--gray,#6B6B6B)}' +
      '.gs-us-empty{padding:9px 12px;font-size:13px;color:var(--gray,#6B6B6B)}' +
      '.gs-us-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}' +
      '.gs-us-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 10px;border:1px solid var(--gold,#C9A84C);background:#FEFBF3;border-radius:16px;font-size:12px}' +
      '.gs-us-chip select,.gs-us-chip input{font-size:11px;font-family:inherit;border:1px solid var(--border,#E0D9CC);border-radius:10px;padding:2px 4px;background:var(--white,#fff)}' +
      '.gs-us-chip input{width:44px;text-align:center}' +
      '.gs-us-x{border:none;background:none;cursor:pointer;font-size:15px;line-height:1;color:var(--gray,#6B6B6B);padding:0 4px}' +
      '.gs-us-x:hover{color:var(--black,#111)}';
    document.head.appendChild(st);
  }

  function mount(container, options) {
    styleTag();
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) return null;
    var o = options || {};
    var st = {
      catalog: o.catalog || [], division: o.division || '', cross: !!o.crossDivision,
      propertyType: o.propertyType || 'Commercial', items: [], hi: -1
    };

    container.innerHTML = '<div class="gs-us">' +
      '<input type="text" class="gs-us-search" placeholder="Search a service to add…" autocomplete="off">' +
      '<div class="gs-us-drop" style="display:none"></div>' +
      '<div class="gs-us-chips"></div></div>';
    var input = container.querySelector('.gs-us-search');
    var drop = container.querySelector('.gs-us-drop');
    var chips = container.querySelector('.gs-us-chips');

    function bySku(sku) { return st.catalog.find(function (c) { return String(c.sku) === String(sku); }); }
    function leveled(s) { return String(s.division || '').toLowerCase() === 'janitorial'; }

    /* Mismo criterio que el picker de la orden: division (o todas en Mixed),
       tipo de propiedad, sin areas comunes ni paquetes. */
    function matches(q) {
      q = q.trim().toLowerCase();
      if (!q) return [];
      var have = {};
      st.items.forEach(function (it) { have[String(it.sku)] = true; });
      return st.catalog.filter(function (s) {
        if (have[String(s.sku)]) return false;
        if (!st.cross && String(s.division || '').toLowerCase() !== String(st.division || '').toLowerCase()) return false;
        if (s.propertyType && s.propertyType !== st.propertyType) return false;
        if (String(s.category || '') === 'Common Areas') return false;
        if (Array.isArray(s.packageItems) && s.packageItems.length) return false;
        return String(s.serviceName || '').toLowerCase().indexOf(q) !== -1;
      }).sort(function (a, b) { return String(a.serviceName).localeCompare(String(b.serviceName)); }).slice(0, 12);
    }

    var list = [];
    function paintDrop() {
      list = matches(input.value);
      if (!input.value.trim()) { drop.style.display = 'none'; return; }
      drop.style.display = 'block';
      drop.innerHTML = list.length
        ? list.map(function (s, i) {
            return '<div class="gs-us-opt' + (i === st.hi ? ' on' : '') + '" data-i="' + i + '"><span>' + esc(s.serviceName) + '</span>' +
              (s.category ? '<small>' + esc(s.category) + '</small>' : '') + '</div>';
          }).join('')
        : '<div class="gs-us-empty">No services match.</div>';
    }

    function changed() { if (o.onChange) o.onChange(api.getItems()); }

    function add(s) {
      if (!s) return;
      var lv = leveled(s) ? ((o.levelFor && o.levelFor(String(s.sku))) || 'Level 1') : '';
      st.items.push({ sku: String(s.sku), level: lv, qty: s.requiresQuantity ? '1' : '' });
      input.value = ''; st.hi = -1; paintDrop(); paintChips(); changed();
      input.focus();
    }

    function paintChips() {
      chips.innerHTML = st.items.map(function (it, i) {
        var s = bySku(it.sku) || { serviceName: it.sku };
        return '<span class="gs-us-chip" data-i="' + i + '">' + esc(s.serviceName) +
          (it.level ? '<select data-lv="' + i + '">' + LEVELS.map(function (l) {
            return '<option value="' + l + '"' + (l === it.level ? ' selected' : '') + '>' + l.replace('Level ', 'L') + '</option>'; }).join('') + '</select>' : '') +
          (s.requiresQuantity ? '<input type="number" min="1" data-qty="' + i + '" value="' + esc(it.qty || '1') + '" title="Quantity">' : '') +
          '<button type="button" class="gs-us-x" data-x="' + i + '" title="Remove">×</button></span>';
      }).join('');
    }

    input.addEventListener('input', function () { st.hi = -1; paintDrop(); });
    input.addEventListener('keydown', function (e) {
      if (drop.style.display === 'none' || !list.length) return;
      if (e.key === 'ArrowDown') { st.hi = Math.min(list.length - 1, st.hi + 1); paintDrop(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { st.hi = Math.max(0, st.hi - 1); paintDrop(); e.preventDefault(); }
      else if (e.key === 'Enter') { add(list[st.hi >= 0 ? st.hi : 0]); e.preventDefault(); }
      else if (e.key === 'Escape') { input.value = ''; paintDrop(); }
    });
    /* mousedown (no click): se agrega antes de que el blur cierre la lista. */
    drop.addEventListener('mousedown', function (e) {
      var opt = e.target.closest('.gs-us-opt');
      if (!opt) return;
      e.preventDefault();
      add(list[Number(opt.dataset.i)]);
    });
    input.addEventListener('blur', function () { setTimeout(function () { drop.style.display = 'none'; }, 120); });
    input.addEventListener('focus', paintDrop);
    chips.addEventListener('click', function (e) {
      var x = e.target.closest('[data-x]');
      if (!x) return;
      st.items.splice(Number(x.dataset.x), 1); paintChips(); changed();
    });
    chips.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.lv !== undefined) st.items[Number(t.dataset.lv)].level = t.value;
      else if (t.dataset.qty !== undefined) st.items[Number(t.dataset.qty)].qty = String(Math.max(1, parseInt(t.value, 10) || 1));
      else return;
      changed();
    });

    var api = {
      getItems: function () { return st.items.map(function (it) { return { sku: it.sku, level: it.level, qty: it.qty }; }); },
      setItems: function (items) {
        st.items = (items || []).filter(function (it) { return it && it.sku; })
          .map(function (it) { return { sku: String(it.sku), level: it.level || '', qty: it.qty || '' }; });
        paintChips();
      },
      setCatalog: function (c) { st.catalog = c || []; paintChips(); paintDrop(); },
      setDivision: function (d, cross) { st.division = d || ''; st.cross = !!cross; paintDrop(); },
      setPropertyType: function (t) { st.propertyType = t || 'Commercial'; paintDrop(); },
      destroy: function () { container.innerHTML = ''; }
    };
    return api;
  }

  window.GSUnitServices = { mount: mount };
})();
