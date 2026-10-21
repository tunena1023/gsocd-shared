/* ============================================================
   gsocd-shared / report-table  (21/10/2026)
   Reportes tipo Excel, la pieza de Warehouse › Reports hecha común (CFO 20/10: "como Blackbaud"; CFO 21/10: "así de
   detallados quiero reportes de TODA la información de la app"). La usa primero el dashboard de Jorge
   (Admin dashboard.html); Warehouse sigue con su copia hasta que se pruebe aparte con esta.

   Izquierda los reportes ya hechos (por secciones si se dan) y abajo los Saved; derecha la tabla: encabezado fijo,
   scroll en su caja, ordenar al picar el encabezado, Group by con subtotales y Total abajo. Arriba, en un renglón:
   As of (opcional) · Columns · Filters · Group by · Save as · Download Excel · Print. Picar un renglón llama onOpen.
   En celular (< 700 px): la lista, y al picar uno el reporte en renglones con Download Excel.

   GSReportTable.mount(el, {
     reports: { key: { name, sub, cols: [[key, label, type, sum]], def: [keys], main: [keys], group: [keys],
                       filters: [keys], date: 'key', sort: { k, d }, grp: 'key', note, rows: () => [ {...} ] } },
       type: 'num' | 'date' | ''   sum: 1 = nunca se suma; 'q' = solo si todos los renglones son del mismo `item`
       un renglón puede traer `_<key>` para ordenar o agrupar por otra cosa (fecha real detrás de "Week of Oct 4"),
       `_go` (lo que recibe onOpen) y `_tone: { key: 'bad' | 'warn' }` para pintar una celda.
     sections: [[título, [keys]]]   (opcional; sin esto, todos en una lista)
     saved: [{ id, name, source, cols, filters, group, sort, by }], current: 'key', savedId: '',
     asOf: { value: '', max: 'AAAA-MM-DD', onChange(v) }   (opcional)
     onSave(p) -> Promise<{ saved, id }>   p = { id, name, source, cols, filters, group, sort }
     onDelete(id) -> Promise<{ saved }>,  onXlsx({ name, rows, dates }) -> Promise,  onOpen(row._go, row),
     leftExtra: html debajo de la lista, mobile: bool (si no, por el ancho), toast(msg)
   }) -> { set(partial), use(key, savedId), refresh(), state() }

   Funciones puras (las prueba report-table.test.js): view(def, rows, st), total(def, rows, k), sheet(def, rows, st).
   Sin opciones nuevas pinta como Warehouse › Reports. Usa GSMultiSelect y GSDateTimePicker de shared si están cargados.
============================================================ */
(function (root) {
  'use strict';
  if (root.GSReportTable) return;
  var STYLE_ID = 'gs-rt-style', seq = 0;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function colDef(def, k) { return (def.cols || []).filter(function (c) { return c[0] === k; })[0] || [k, k]; }
  function sortKey(r, k) { return r['_' + k] !== undefined ? r['_' + k] : r[k]; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(v) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? MON[+m[2] - 1] + ' ' + (+m[3]) : String(v || ''); }
  function fmt(v, t) { return v === '' || v == null ? '' : t === 'date' ? day(v) : t === 'num' ? (Math.round(Number(v) * 10) / 10).toLocaleString('en-US') : String(v); }

  /* ---------- lo puro ---------- */
  function filtered(def, rows, st) {
    var f = st.filters || {}, q = String(f.q || '').trim().toLowerCase();
    return rows.filter(function (r) {
      if (q && !(def.cols || []).some(function (c) { return String(r[c[0]] == null ? '' : r[c[0]]).toLowerCase().indexOf(q) >= 0; })) return false;
      if (!(def.filters || []).every(function (k) { return !f[k] || String(r[k] == null ? '' : r[k]) === f[k]; })) return false;
      if (def.date) { var d = String(sortKey(r, def.date) || '').slice(0, 10); if (f.from && d < f.from) return false; if (f.to && d > f.to) return false; }
      return true;
    });
  }
  function sorted(def, rows, s) {
    if (!s || !s.k) return rows;
    var t = colDef(def, s.k)[2], dir = s.d || 1;
    return rows.slice().sort(function (a, b) {
      var x = sortKey(a, s.k), y = sortKey(b, s.k);
      if (t === 'num' && typeof x !== 'string') return ((Number(x) || 0) - (Number(y) || 0)) * dir;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), undefined, { numeric: true }) * dir;
    });
  }
  /* Lo que se ve: [{ name, rows }]. Grupos en orden de su `_<grupo>` si lo traen (fechas: el más nuevo arriba), si no por nombre. */
  function view(def, rows, st) {
    var rs = sorted(def, filtered(def, rows, st), st.sort), g = st.group;
    if (!g) return [{ name: '', rows: rs }];
    var gs = [], by = {};
    rs.forEach(function (r) { var n = String(r[g] == null || r[g] === '' ? '—' : r[g]); if (!by[n]) { by[n] = { name: n, key: r['_' + g], rows: [] }; gs.push(by[n]); } by[n].rows.push(r); });
    var dated = gs.some(function (x) { return x.key !== undefined; });
    return gs.sort(function (a, b) { return dated ? (a.key < b.key ? 1 : a.key > b.key ? -1 : 0) : a.name.localeCompare(b.name); });
  }
  /* El total de una columna: '' = no hay. Mínimos y "por unidad" (1) nunca; cantidades de cosas ('q') solo de UN artículo. */
  function total(def, rows, k) {
    var d = colDef(def, k);
    if (d[2] !== 'num' || d[3] === 1 || !rows.length) return '';
    if (d[3] === 'q') { var items = {}; rows.forEach(function (r) { items[r.item] = 1; }); if (Object.keys(items).length > 1) return ''; }
    return Math.round(rows.reduce(function (t, r) { return t + (Number(r[k]) || 0); }, 0) * 10) / 10;
  }
  /* El Excel: tabla plana (la columna del grupo primero), sin renglones de grupo, y el Total al final. */
  function sheet(def, rows, st) {
    var v = view(def, rows, st), cols = st.group ? [st.group].concat(st.cols.filter(function (k) { return k !== st.group; })) : st.cols;
    var all = []; v.forEach(function (g) { all = all.concat(g.rows); });
    var out = [cols.map(function (k) { return colDef(def, k)[1]; })];
    all.forEach(function (r) { out.push(cols.map(function (k) { var t = colDef(def, k)[2], x = r[k]; return t === 'num' ? (x === '' || x == null ? '' : Number(x)) : x == null ? '' : String(x); })); });
    out.push(cols.map(function (k, n) { return n === 0 ? 'Total · ' + all.length : total(def, all, k); }));
    return { rows: out, dates: cols.map(function (k, n) { return colDef(def, k)[2] === 'date' ? n : -1; }).filter(function (n) { return n >= 0; }) };
  }

  /* ---------- pantalla ---------- */
  function styleTag() {
    if (!root.document || document.getElementById(STYLE_ID)) return;
    var t = document.createElement('style'); t.id = STYLE_ID;
    t.textContent =
      '.gs-rt{display:grid;grid-template-columns:minmax(0,240px) minmax(0,1fr);border:1px solid var(--border,#E0DDD6);border-radius:6px;background:var(--white,#fff);height:calc(100vh - 170px);min-height:460px;overflow:hidden}' +
      '.gs-rt-l{overflow-y:auto;border-right:1px solid var(--border,#E0DDD6);background:var(--bg,#F8F7F4)}' +
      '.gs-rt-sec{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--gray,#6B6B6B);margin:14px 16px 4px;font-weight:600}' +
      '.gs-rt-row{display:block;width:100%;text-align:left;background:none;border:0;border-left:3px solid transparent;padding:9px 16px 9px 13px;cursor:pointer;font:inherit;color:var(--black,#111)}' +
      '.gs-rt-row:hover{background:var(--white,#fff)}.gs-rt-row.on{background:var(--white,#fff);border-left-color:var(--gold,#C9A84C)}' +
      '.gs-rt-row b{display:block;font-size:13.5px;font-weight:600}.gs-rt-row i{display:block;font-style:normal;font-size:12px;color:var(--gray,#6B6B6B);margin-top:1px}' +
      '.gs-rt-r{padding:14px 16px;display:flex;flex-direction:column;min-width:0;min-height:0}' +
      '.gs-rt-top{display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap}' +
      '.gs-rt-t{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gray,#6B6B6B);font-weight:600;margin-right:auto}' +
      '.gs-rt-k{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--gray,#6B6B6B);white-space:nowrap}' +
      '.gs-rt-b{border:1px solid var(--border,#E0DDD6);background:var(--white,#fff);border-radius:6px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer;color:var(--black,#111);white-space:nowrap}' +
      '.gs-rt-b.on{border-color:var(--gold,#C9A84C);background:#FBF6E8;font-weight:600}.gs-rt-b.gold{background:var(--gold,#C9A84C);border-color:var(--gold,#C9A84C);font-weight:600}.gs-rt-b:disabled{opacity:.5;cursor:default}' +
      '.gs-rt-asof{display:inline-block;width:124px}' +
      '.gs-rt-note{font-size:12px;color:var(--gray,#6B6B6B);margin:0 0 8px}' +
      '.gs-rt-pan{border:1px solid var(--border,#E0DDD6);border-radius:6px;padding:12px 14px;margin-bottom:10px;background:var(--bg,#F8F7F4)}' +
      '.gs-rt-pan .pl{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.gs-rt-pill{border:1px solid var(--border,#E0DDD6);background:var(--white,#fff);border-radius:999px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer}.gs-rt-pill.on{border-color:var(--gold,#C9A84C);background:#FBF6E8;font-weight:600}' +
      '.gs-rt-pan select,.gs-rt-pan input{border:1px solid var(--border,#E0DDD6);border-radius:4px;padding:6px 8px;font:inherit;font-size:12.5px;background:var(--white,#fff)}' +
      '.gs-rt-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #E6D6A6;background:#FFFBEF;border-radius:999px;padding:4px 10px;font-size:12px;margin:0 6px 8px 0}' +
      '.gs-rt-chip button{background:none;border:0;cursor:pointer;color:var(--gray,#6B6B6B);font-size:13px;padding:0}' +
      '.gs-rt-tb{flex:1;overflow:auto;border:1px solid var(--border,#E0DDD6);border-radius:4px;min-height:0}' +
      '.gs-rt-tb table{border-collapse:collapse;width:100%;font-size:13px}' +
      '.gs-rt-tb th{position:sticky;top:0;z-index:1;background:var(--bg,#F8F7F4);text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--gray,#6B6B6B);font-weight:600;padding:10px 12px;border-bottom:1px solid var(--border,#E0DDD6);white-space:nowrap;cursor:pointer}' +
      '.gs-rt-tb td{padding:9px 12px;border-bottom:1px solid rgba(0,0,0,.06);white-space:nowrap}' +
      '.gs-rt-tb tr.r:hover td{background:#F3ECD9;cursor:pointer}.gs-rt-tb tr.g td{background:var(--bg,#F8F7F4);font-weight:600}.gs-rt-tb tr.g span{font-weight:400;color:var(--gray,#6B6B6B)}' +
      '.gs-rt-tb tr.s td{color:var(--gray,#6B6B6B)}.gs-rt-tb tfoot td{position:sticky;bottom:0;background:#FBFAF7;border-top:1px solid var(--border,#E0DDD6);font-weight:600}' +
      '.gs-rt-tb .n{text-align:right}.gs-rt-tb .bad{color:#A33A2E;font-weight:600}.gs-rt-tb .warn{color:#8a5200;font-weight:600}' +
      '.gs-rt-empty{padding:16px;color:var(--gray,#6B6B6B);font-size:12.5px}' +
      '.gs-rt-m{border:1px solid var(--border,#E0DDD6);border-radius:8px;background:var(--white,#fff);max-height:calc(100vh - 220px);overflow-y:auto}' +
      '.gs-rt-m .it{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid rgba(0,0,0,.06);padding:10px 14px;font:inherit;cursor:pointer}' +
      '.gs-rt-m .it b{display:block;font-size:13.5px;font-weight:600}.gs-rt-m .it i{display:block;font-style:normal;font-size:12px;color:var(--gray,#6B6B6B);margin-top:2px}' +
      '.gs-rt-m .gh{padding:10px 14px 6px;font-weight:600;font-size:12.5px;background:var(--bg,#F8F7F4)}.gs-rt-m .gh span{font-weight:400;color:var(--gray,#6B6B6B)}.gs-rt-m .tot{padding:10px 14px;font-weight:600;font-size:12.5px}' +
      '.gs-rt-back{background:none;border:0;font:inherit;font-size:14px;font-weight:600;color:#8C6F2A;cursor:pointer;padding:4px 0 10px}' +
      '.gs-rt-ml{border:1px solid var(--border,#E0DDD6);border-radius:8px;background:var(--bg,#F8F7F4);max-height:70vh;overflow-y:auto}' +
      '@media print{body.gs-rt-printing>*:not(.gs-rt-print){display:none!important}.gs-rt-print{display:block!important}.gs-rt-print table{border-collapse:collapse;font-size:10px}.gs-rt-print td,.gs-rt-print th{border:1px solid #ccc;padding:3px 5px;text-align:left}}' +
      '.gs-rt-print{display:none}';
    document.head.appendChild(t);
  }

  function mount(el, o) {
    styleTag();
    var id = 'gsrt' + (++seq), S = { key: '', savedId: '', cols: null, filters: {}, group: '', sort: null, open: '', step: '' }, ROWS = [];
    var defOf = function () { return o.reports[S.key]; };
    var isMob = function () { return o.mobile != null ? !!o.mobile : (root.innerWidth || 1000) < 700; };
    var toast = function (m) { if (o.toast) o.toast(m); };
    function use(key, savedId) {
      var sv = savedId && (o.saved || []).filter(function (x) { return x.id === savedId; })[0];
      S.key = sv ? sv.source : (o.reports[key] ? key : Object.keys(o.reports)[0]); S.savedId = sv ? sv.id : '';
      var d = defOf(), has = function (k) { return d.cols.some(function (c) { return c[0] === k; }); };
      S.cols = sv && sv.cols && sv.cols.length ? sv.cols.filter(has) : d.def.slice();
      S.filters = sv ? Object.assign({}, sv.filters) : {};
      S.group = sv ? sv.group || '' : d.grp || '';
      S.sort = sv && sv.sort ? sv.sort : d.sort ? Object.assign({}, d.sort) : null; S.open = '';
    }
    function rows() { var d = defOf(); try { return d.rows ? d.rows() : []; } catch (e) { return []; } }
    function title() { var sv = S.savedId && (o.saved || []).filter(function (x) { return x.id === S.savedId; })[0]; return (sv ? sv.name : defOf().name) + (o.asOf && o.asOf.value ? ' · as of ' + day(o.asOf.value) : ''); }
    var fkeys = function () { var d = defOf(); return (d.filters || []).filter(function (k) { return S.filters[k]; }); };
    var nFil = function () { return fkeys().length + (S.filters.from || S.filters.to ? 1 : 0); };
    function cell(r, k) {
      var d = defOf(), t = colDef(d, k)[2], tone = r._tone && r._tone[k];
      return '<td class="' + (t === 'num' ? 'n' : '') + (tone ? ' ' + tone : '') + '">' + esc(fmt(r[k], t)).replace(/\n/g, '<br>') + '</td>';
    }
    function table(v) {
      var d = defOf(), cols = S.group && S.cols.length > 1 ? S.cols.filter(function (k) { return k !== S.group; }) : S.cols, all = [];
      v.forEach(function (g) { all = all.concat(g.rows); }); ROWS = [];
      var tot = function (rs) { return cols.map(function (k, n) { var x = n === 0 ? '' : total(d, rs, k); return '<td class="' + (colDef(d, k)[2] === 'num' ? 'n' : '') + '">' + (x === '' ? '' : fmt(x, 'num')) + '</td>'; }); };
      var th = cols.map(function (k) { var s = S.sort && S.sort.k === k ? (S.sort.d === -1 ? ' ▾' : ' ▴') : '';
        return '<th class="' + (colDef(d, k)[2] === 'num' ? 'n' : '') + '" data-rt="sort" data-k="' + esc(k) + '">' + esc(colDef(d, k)[1]) + s + '</th>'; }).join('');
      var gl = S.group ? colDef(d, S.group)[1] : '';
      var body = v.map(function (g) {
        return (S.group ? '<tr class="g"><td colspan="' + cols.length + '">' + esc(gl + ': ' + fmt(g.name === '—' ? '—' : g.rows[0][S.group], colDef(d, S.group)[2])) + ' <span>· ' + g.rows.length + '</span></td></tr>' : '') +
          g.rows.map(function (r) { ROWS.push(r); return '<tr class="r" data-rt="open" data-i="' + (ROWS.length - 1) + '">' + cols.map(function (k) { return cell(r, k); }).join('') + '</tr>'; }).join('') +
          (S.group && g.rows.length > 1 && cols.some(function (k, n) { return n && total(d, g.rows, k) !== ''; }) ? '<tr class="s">' + tot(g.rows).map(function (x, n) { return n === 0 ? '<td>Subtotal</td>' : x; }).join('') + '</tr>' : '');
      }).join('');
      return '<div class="gs-rt-tb"><table><thead><tr>' + th + '</tr></thead><tbody>' +
        (all.length ? body : '<tr><td colspan="' + cols.length + '" class="gs-rt-empty">Nothing here' + (nFil() ? ' with these filters.' : '.') + '</td></tr>') + '</tbody>' +
        (all.length ? '<tfoot><tr>' + tot(all).map(function (x, n) { return n === 0 ? '<td>Total · ' + all.length + '</td>' : x; }).join('') + '</tr></tfoot>' : '') + '</table></div>';
    }
    function asOfHtml() {
      if (!o.asOf || !root.GSDateTimePicker) return '';
      return '<span class="gs-rt-k">As of</span><span class="gs-rt-asof">' + GSDateTimePicker.dateHtml(id + '-asof', o.asOf.value || '', 'Today', o.asOf.max ? { max: o.asOf.max } : undefined) + '</span>';
    }
    function tools() {
      var b = function (k, l) { return '<button class="gs-rt-b' + (S.open === k ? ' on' : '') + '" data-rt="panel" data-k="' + k + '">' + l + '</button>'; };
      return asOfHtml() + b('cols', 'Columns') + b('fil', 'Filters' + (nFil() ? ' · ' + nFil() : '')) + b('grp', S.group ? 'Group: ' + esc(colDef(defOf(), S.group)[1]) : 'Group by') + b('save', 'Save as') +
        '<button class="gs-rt-b" data-rt="xlsx">Download Excel</button><button class="gs-rt-b" data-rt="print">Print</button>';
    }
    function panel() {
      var d = defOf();
      if (S.open === 'cols') return '<div class="gs-rt-pan"><div class="pl" style="align-items:flex-start"><div id="' + id + '-cols" style="flex:0 0 260px"></div><div style="flex:1 1 300px"><div class="gs-rt-k" style="margin-bottom:6px">Order</div>' +
        S.cols.map(function (k, n) { return '<span class="gs-rt-chip">' + esc(colDef(d, k)[1]) + (n ? '<button data-rt="move" data-i="' + n + '" data-d="-1" title="Move left">‹</button>' : '') + (n < S.cols.length - 1 ? '<button data-rt="move" data-i="' + n + '" data-d="1" title="Move right">›</button>' : '') + '</span>'; }).join('') + '</div></div></div>';
      if (S.open === 'fil') {
        var rs = rows(), sel = function (k) { var vals = {}; rs.forEach(function (r) { var x = String(r[k] == null ? '' : r[k]); if (x) vals[x] = 1; });
          return '<span class="gs-rt-k">' + esc(colDef(d, k)[1]) + '</span><select data-rt="fil" data-k="' + esc(k) + '"><option value="">All</option>' + Object.keys(vals).sort().map(function (x) { return '<option' + (S.filters[k] === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>'; };
        var dates = d.date && root.GSDateTimePicker ? '<span class="gs-rt-k">From</span><span class="gs-rt-asof">' + GSDateTimePicker.dateHtml(id + '-from', S.filters.from || '', 'Any day') + '</span><span class="gs-rt-k">To</span><span class="gs-rt-asof">' + GSDateTimePicker.dateHtml(id + '-to', S.filters.to || '', 'Any day') + '</span>' : '';
        return '<div class="gs-rt-pan"><div class="pl">' + (d.filters || []).map(sel).join('') + dates + (d.search ? '<input data-rt="q" placeholder="Search" value="' + esc(S.filters.q || '') + '">' : '') + '</div>' +
          (nFil() ? '<button class="gs-rt-b" style="margin-top:8px" data-rt="clear">Clear filters</button>' : '') + '</div>';
      }
      if (S.open === 'grp') return '<div class="gs-rt-pan"><div class="pl">' + [''].concat(d.group || []).map(function (k) { return '<button class="gs-rt-pill' + (S.group === k ? ' on' : '') + '" data-rt="grp" data-k="' + esc(k) + '">' + (k ? esc(colDef(d, k)[1]) : 'None') + '</button>'; }).join('') + '</div></div>';
      if (S.open === 'save') { var sv = S.savedId && (o.saved || []).filter(function (x) { return x.id === S.savedId; })[0];
        return '<div class="gs-rt-pan"><div class="pl"><input id="' + id + '-name" placeholder="Name of the report" value="' + esc(sv ? sv.name : '') + '" style="flex:1 1 220px;max-width:360px"><button class="gs-rt-b gold" data-rt="save">Save</button>' +
          (sv ? '<button class="gs-rt-b" data-rt="del">Delete this saved report</button>' : '') + '</div><p class="gs-rt-note" style="margin:8px 0 0">Saves the columns, filters, group and order. It shows under Saved.</p></div>'; }
      return '';
    }
    function chips() {
      var d = defOf(), c = fkeys().map(function (k) { return [k, colDef(d, k)[1] + ': ' + S.filters[k]]; });
      if (S.filters.from || S.filters.to) c.push(['dates', (S.filters.from ? day(S.filters.from) : '…') + ' – ' + (S.filters.to ? day(S.filters.to) : 'today')]);
      if (!c.length || S.open === 'fil') return '';
      return '<div>' + c.map(function (x) { return '<span class="gs-rt-chip">' + esc(x[1]) + '<button data-rt="unfil" data-k="' + esc(x[0]) + '" title="Remove">×</button></span>'; }).join('') + '</div>';
    }
    function left() {
      var row = function (k, sid, name, sub) { return '<button class="gs-rt-row' + (!isMob() && S.key === k && S.savedId === sid ? ' on' : '') + '" data-rt="pick" data-k="' + esc(k) + '" data-s="' + esc(sid) + '"><b>' + esc(name) + '</b><i>' + esc(sub) + '</i></button>'; };
      var secs = o.sections || [['', Object.keys(o.reports)]], saved = (o.saved || []).filter(function (s) { return o.reports[s.source]; });
      return secs.map(function (s) { return (s[0] ? '<div class="gs-rt-sec">' + esc(s[0]) + '</div>' : '') + s[1].filter(function (k) { return o.reports[k]; }).map(function (k) { return row(k, '', o.reports[k].name, o.reports[k].sub || ''); }).join(''); }).join('') +
        '<div class="gs-rt-sec">Saved' + (saved.length ? ' · ' + saved.length : '') + '</div>' +
        (saved.length ? saved.map(function (s) { return row(s.source, s.id, s.name, o.reports[s.source].name + (s.by ? ' · ' + s.by : '')); }).join('') : '<p class="gs-rt-note" style="margin:0 16px 14px">Set up a report and use Save as.</p>') + (o.leftExtra || '');
    }
    function paint() {
      var d = defOf(), v = view(d, rows(), S), n = 0; v.forEach(function (g) { n += g.rows.length; });
      if (isMob()) {
        if (S.step !== 'r') { el.innerHTML = '<div class="gs-rt-ml">' + left() + '</div>'; return; }
        ROWS = [];
        var m0 = d.main || d.def.slice(0, 3), main = S.group ? m0.filter(function (k) { return k !== S.group; }) : m0, all = [];
        var items = v.map(function (g) { all = all.concat(g.rows);
          return (S.group ? '<div class="gh">' + esc(colDef(d, S.group)[1] + ': ' + g.name) + ' <span>· ' + g.rows.length + '</span></div>' : '') + g.rows.map(function (r) { ROWS.push(r);
            return '<button class="it" data-rt="open" data-i="' + (ROWS.length - 1) + '"><b>' + esc(fmt(r[main[0]], colDef(d, main[0])[2])) + '</b><i>' + main.slice(1).map(function (k) { var t = colDef(d, k)[2]; return (t === 'num' ? esc(colDef(d, k)[1]) + ' ' : '') + esc(fmt(r[k], t)); }).filter(Boolean).join(' · ') + '</i></button>'; }).join(''); }).join('');
        var tk = d.def.filter(function (k) { return total(d, all, k) !== ''; })[0];
        el.innerHTML = '<button class="gs-rt-back" data-rt="back">‹ Reports</button><div class="gs-rt-top"><span class="gs-rt-t">' + esc(title()) + ' · ' + n + '</span><button class="gs-rt-b" data-rt="xlsx">Download Excel</button></div>' +
          (o.asOf ? '<div class="gs-rt-top">' + asOfHtml() + '</div>' : '') + (d.note ? '<p class="gs-rt-note">' + esc(d.note) + '</p>' : '') + chips() +
          (n ? '<div class="gs-rt-m">' + items + (tk ? '<div class="tot">Total · ' + all.length + ' · ' + esc(colDef(d, tk)[1]) + ' ' + fmt(total(d, all, tk), 'num') + '</div>' : '') + '</div>' : '<p class="gs-rt-empty">Nothing here.</p>');
        return;
      }
      el.innerHTML = '<div class="gs-rt"><div class="gs-rt-l">' + left() + '</div><div class="gs-rt-r"><div class="gs-rt-top"><span class="gs-rt-t">' + esc(title()) + ' · ' + n + (n === 1 ? ' row' : ' rows') + '</span>' + tools() + '</div>' +
        (d.note ? '<p class="gs-rt-note">' + esc(d.note) + '</p>' : '') + panel() + chips() + table(v) + '</div></div>';
      if (S.open === 'cols' && root.GSMultiSelect) {
        var c = document.getElementById(id + '-cols'), lab = function (k) { return colDef(d, k)[1]; };
        if (c) GSMultiSelect.mount(c, { options: d.cols.map(function (x) { return x[1]; }), selected: S.cols.map(lab), placeholder: 'Pick the columns…', onChange: function (vals) {
          var keys = d.cols.filter(function (x) { return vals.indexOf(x[1]) >= 0; }).map(function (x) { return x[0]; });
          S.cols = S.cols.filter(function (k) { return keys.indexOf(k) >= 0; }).concat(keys.filter(function (k) { return S.cols.indexOf(k) < 0; }));
          if (!S.cols.length) S.cols = [d.cols[0][0]];
          paint(); } });
      }
    }
    function busy(btn, txt) { if (!btn || btn.disabled) return false; btn.disabled = true; btn._was = btn.textContent; btn.textContent = txt; return true; }
    function unbusy(btn) { if (btn) { btn.disabled = false; btn.textContent = btn._was || btn.textContent; } }
    function printIt() {
      var sh = sheet(defOf(), rows(), S), r = sh.rows.map(function (x, i) { return x.map(function (v, n) { return i && sh.dates.indexOf(n) >= 0 && v ? day(v) : v; }); });
      var p = document.createElement('div'); p.className = 'gs-rt-print';
      p.innerHTML = '<h3>' + esc(title()) + '</h3><table><thead><tr>' + r[0].map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        r.slice(1).map(function (x) { return '<tr>' + x.map(function (v) { return '<td>' + esc(v == null ? '' : v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
      document.body.appendChild(p); document.body.classList.add('gs-rt-printing');
      try { root.print(); } finally { document.body.classList.remove('gs-rt-printing'); p.remove(); }
    }
    el.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-rt]') : null; if (!t || !el.contains(t)) return;
      var a = t.getAttribute('data-rt'), k = t.getAttribute('data-k');
      if (a === 'pick') { use(k, t.getAttribute('data-s')); S.step = 'r'; paint(); if (o.onPick) o.onPick(S.key, S.savedId); }
      else if (a === 'back') { S.step = ''; paint(); }
      else if (a === 'panel') { S.open = S.open === k ? '' : k; paint(); }
      else if (a === 'sort') { S.sort = S.sort && S.sort.k === k ? { k: k, d: -(S.sort.d || 1) } : { k: k, d: 1 }; paint(); }
      else if (a === 'grp') { S.group = k; S.open = ''; paint(); }
      else if (a === 'unfil') { if (k === 'dates') { delete S.filters.from; delete S.filters.to; } else delete S.filters[k]; paint(); }
      else if (a === 'clear') { S.filters = {}; paint(); }
      else if (a === 'move') { var i = +t.getAttribute('data-i'), j = i + (+t.getAttribute('data-d')), c = S.cols.slice(); if (j >= 0 && j < c.length) { var x = c[i]; c[i] = c[j]; c[j] = x; S.cols = c; paint(); } }
      else if (a === 'open') { var r = ROWS[+t.getAttribute('data-i')]; if (r && r._go && o.onOpen) o.onOpen(r._go, r); }
      else if (a === 'print') printIt();
      else if (a === 'xlsx') { if (!o.onXlsx || !busy(t, 'Preparing…')) return; var sh = sheet(defOf(), rows(), S);
        Promise.resolve().then(function () { return o.onXlsx({ name: title(), rows: sh.rows, dates: sh.dates }); }).catch(function (er) { toast('Not downloaded: ' + er.message); }).then(function () { unbusy(t); }); }
      else if (a === 'save') { var nm = ((document.getElementById(id + '-name') || {}).value || '').trim(); if (!nm) { toast('Write a name for the report.'); return; }
        if (!o.onSave || !busy(t, 'Saving…')) return; var sv = S.savedId && (o.saved || []).filter(function (x) { return x.id === S.savedId; })[0];
        o.onSave({ id: sv && sv.name.toLowerCase() === nm.toLowerCase() ? sv.id : '', name: nm, source: S.key, cols: S.cols, filters: S.filters, group: S.group, sort: S.sort })
          .then(function (r) { o.saved = r.saved || o.saved; S.savedId = r.id || ''; S.open = ''; toast('Saved.'); paint(); }).catch(function (er) { unbusy(t); toast('Not saved: ' + er.message); }); }
      else if (a === 'del') { if (!o.onDelete || !(root.confirm ? root.confirm('Delete this saved report? The built-in report stays.') : true) || !busy(t, 'Deleting…')) return;
        o.onDelete(S.savedId).then(function (r) { o.saved = r.saved || o.saved; use(S.key, ''); paint(); }).catch(function (er) { unbusy(t); toast('Not deleted: ' + er.message); }); }
    });
    el.addEventListener('change', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-rt') === 'fil') { S.filters[t.getAttribute('data-k')] = t.value; if (!t.value) delete S.filters[t.getAttribute('data-k')]; paint(); } });
    el.addEventListener('input', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-rt') === 'q') { S.filters.q = t.value; var tb = el.querySelector('.gs-rt-tb'); if (tb) tb.outerHTML = table(view(defOf(), rows(), S)); } });
    if (root.document) document.addEventListener('gs-date-picked', function (e) {
      var f = e.detail && e.detail.fieldId; if (!f || f.indexOf(id + '-') !== 0) return;
      if (f === id + '-asof') { if (o.asOf && o.asOf.onChange) o.asOf.onChange(e.detail.value); return; }
      S.filters[f === id + '-from' ? 'from' : 'to'] = e.detail.value; paint();
    });
    use(o.current, o.savedId);
    if (o.current) S.step = 'r';
    paint();
    return {
      set: function (p) { Object.keys(p || {}).forEach(function (k) { o[k] = p[k]; }); if (!o.reports[S.key]) use(Object.keys(o.reports)[0], ''); paint(); },
      use: function (k, s) { use(k, s); S.step = 'r'; paint(); },
      refresh: paint,
      state: function () { return Object.assign({}, S); }
    };
  }

  root.GSReportTable = { mount: mount, view: view, total: total, sheet: sheet, fmt: fmt };
})(typeof window !== 'undefined' ? window : globalThis);
