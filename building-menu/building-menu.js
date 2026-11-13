(function (root) {
  'use strict';
  /* ================================================================
     GSBuildingMenu -- la lista que sale al hacer clic en Building # (Create Order de Admin, el portal del cliente y el Edit
     de la orden), y la misma para Address en el Edit de la orden (Fernanda #20, CFO 12/11/2026): al hacer clic sale la
     lista del cliente, escribir la filtra, flechas/Enter/Escape, escoger pone el valor y se puede escribir cualquier otra cosa.
     Antes era una copia en admin.html y otra en customer.html (Orders).

       GSBuildingMenu.attach({ isInput(el) -> modo o '' , items(input, modo) -> [item], heading(input, modo) -> texto })
         UNA vez por pagina (un solo menu #bldg-suggest-menu, clase .bldg-menu: el CSS es el de cada pagina).
       item = { name, num, addr, value, find: [textos donde busca lo escrito] }
       GSBuildingMenu.buildingItems(buildings)       -> Building #: edificios no archivados con # o nombre; value = # (o nombre)
       GSBuildingMenu.addressItems(client, buildings) -> Address: la principal y cada edificio no archivado con direccion;
                                                         value = la direccion en un renglon
       GSBuildingMenu.filter(items, q)                -> los que traen q (sin mayusculas)
     Prueba: node building-menu/building-menu.test.js
  ================================================================ */
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return MAP[c]; }); }
  function s(v) { return String(v == null ? '' : v).trim(); }
  function line(b) { return [b.address, b.suite, b.city, b.zip].map(s).filter(Boolean).join(', '); }

  function buildingItems(buildings) {
    return (buildings || []).filter(function (b) { return !b.archived && (b.buildingNumber || b.label); }).map(function (b) {
      return { name: b.label || ('Building ' + b.buildingNumber), num: s(b.buildingNumber), addr: [b.address, b.suite, b.city].map(s).filter(Boolean).join(', '),
        value: String(b.buildingNumber || b.label || ''), find: [b.buildingNumber, b.label, b.address] };
    });
  }
  function addressItems(client, buildings) {
    var out = [];
    var c = client || {};
    if (s(c.address)) out.push({ name: 'Primary address', num: '', addr: line(c), value: line(c), find: [line(c), c.address, c.city, c.zip, 'primary'] });
    (buildings || c.buildings || []).filter(function (b) { return !b.archived && s(b.address); }).forEach(function (b) {
      out.push({ name: b.label || b.address, num: s(b.buildingNumber), addr: line(b), value: line(b), find: [line(b), b.buildingNumber, b.label, b.address, b.city, b.zip] });
    });
    return out;
  }
  function filter(items, q) {
    q = s(q).toLowerCase();
    return (items || []).filter(function (it) { return !q || (it.find || [it.name, it.addr]).some(function (v) { return String(v || '').toLowerCase().indexOf(q) !== -1; }); });
  }

  var attached = false;
  function attach(o) {
    if (attached || typeof document === 'undefined') return;
    attached = true;
    var menuFor = null, mode = '', active = -1;
    function el() {
      var m = document.getElementById('bldg-suggest-menu');
      if (!m) { m = document.createElement('div'); m.id = 'bldg-suggest-menu'; m.className = 'bldg-menu'; document.body.appendChild(m); }
      return m;
    }
    function close() { var m = document.getElementById('bldg-suggest-menu'); if (m) m.style.display = 'none'; menuFor = null; mode = ''; active = -1; }
    function open(input) {
      var md = o.isInput(input);
      var all = o.items(input, md) || [];
      if (!all.length) return close();
      var list = filter(all, input.value);
      if (!list.length) return close();
      var m = el();
      menuFor = input; mode = md; active = -1;
      m.innerHTML = '<div class="bldg-menu-h">' + esc(o.heading ? o.heading(input, md) : 'Buildings') + '</div>' + list.map(function (b, i) {
        return '<div class="bldg-opt" data-i="' + i + '" data-val="' + esc(b.value) + '">' +
          '<div class="bldg-opt-top"><span class="bldg-opt-name">' + esc(b.name) + '</span>' + (b.num ? '<span class="bldg-opt-num">#' + esc(b.num) + '</span>' : '') + '</div>' +
          (b.addr ? '<div class="bldg-opt-addr">' + esc(b.addr) + '</div>' : '') + '</div>';
      }).join('');
      var r = input.getBoundingClientRect();
      m.style.left = Math.max(8, r.left + window.scrollX) + 'px';
      m.style.top = (r.bottom + window.scrollY + 4) + 'px';
      m.style.width = Math.min(Math.max(r.width, 260), window.innerWidth - 16) + 'px';
      m.style.display = 'block';
    }
    function pick(val) {
      if (!menuFor) return;
      var inp = menuFor;
      inp.value = val;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    }
    var isIn = function (t) { return !!(t && t.tagName === 'INPUT' && o.isInput(t)); };
    document.addEventListener('focusin', function (e) { if (isIn(e.target)) open(e.target); });
    document.addEventListener('click', function (e) {
      if (isIn(e.target)) { open(e.target); return; }
      if (!(e.target.closest && e.target.closest('#bldg-suggest-menu'))) close();
    });
    document.addEventListener('input', function (e) { if (isIn(e.target) && e.isTrusted) open(e.target); });
    document.addEventListener('focusout', function (e) { if (isIn(e.target)) setTimeout(function () { if (document.activeElement !== menuFor) close(); }, 150); });
    document.addEventListener('mousedown', function (e) { var opt = e.target.closest && e.target.closest('#bldg-suggest-menu .bldg-opt'); if (opt) { e.preventDefault(); pick(opt.dataset.val); } });
    document.addEventListener('keydown', function (e) {
      if (!menuFor || e.target !== menuFor) return;
      var opts = Array.prototype.slice.call(document.querySelectorAll('#bldg-suggest-menu .bldg-opt'));
      if (!opts.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        opts.forEach(function (x, i) { x.classList.toggle('on', i === active); });
        opts[active].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && active > -1) { e.preventDefault(); pick(opts[active].dataset.val); }
      else if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', close);
  }

  root.GSBuildingMenu = { attach: attach, buildingItems: buildingItems, addressItems: addressItems, filter: filter };
})(typeof window !== 'undefined' ? window : this);
