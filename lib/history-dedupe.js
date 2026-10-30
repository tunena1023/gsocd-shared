/* ============================================================
   gsocd-shared/lib/history-dedupe.js -- renglones de historial repetidos se ENSEÑAN una sola vez (CFO 21/10/2026, despues de
   GS-1028-1061: el "Done" picado dos veces dejo 15 "Service Completed" y 15 recaps "Completed" de mas). No se borra
   nada en SharePoint: solo se quitan al leer, antes de mandarlos a la pantalla.

   Regla de la CFO: misma orden, mismo tipo de cambio, mismo contenido (mismo servicio o mismo texto) y misma persona,
   en el mismo minuto = uno. "El mismo minuto" se cuenta como menos de 60 s desde el primero que se enseña (no el
   minuto del reloj: 13:45:53 y 13:46:31 son el mismo clic repetido). La hora exacta, la nota "Confirmed by office..."
   y el id del renglon no cuentan como contenido distinto.

   Vive aqui (gsocd-shared/lib/history-dedupe.js); antes era el mismo archivo copiado en Admin, Orders y Tech.
   Cada portal lo carga desde su lib/history-dedupe.js con una linea.
   Uso: rows = dedupe(rows)  -- rows de Graph ({ fields }) o ya planos ({ ChangeType, ... }); regresa los mismos
   objetos, en el mismo orden, sin los repetidos.
============================================================ */
'use strict';

const WINDOW_MS = 60000;
/* "Service Scheduled" no: sus renglones viejos no traen el lugar y dos servicios con el mismo nombre en lugares
   distintos (GS-1048-1120-PO5006: Pantry cleaning Commercial y Residential) se verian como uno. save-service-
   assignment ya no repite uno igual (contesta unchanged). */
const SKIP_TYPES = new Set(['Service Scheduled']);
/* Lo que cambia entre dos clics iguales sin que cambie lo que se hizo. */
const NOISE = new Set(['finishedText', 'confirmedNote', 'at', 'time', 'ts']);

function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => !NOISE.has(k)).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
function contentOf(f) {
  const raw = f.NewValue == null ? '' : String(f.NewValue);
  let nv = raw;
  try { const j = JSON.parse(raw); if (j && typeof j === 'object') nv = stable(j); } catch (e) { /* texto */ }
  return [nv, String(f.OldValue == null ? '' : f.OldValue), String(f.Notes == null ? '' : f.Notes)].join('\u0001');
}
function keyOf(f) {
  return [f.OrderID || '', f.ChangeType || '', f.FieldChanged || '', String(f.ChangedBy || '').trim().toLowerCase(), contentOf(f)].join('\u0002');
}
function timeOf(f, it) {
  const t = Date.parse(f.ChangeDate || (it && it.createdDateTime) || f.Created || '');
  return isNaN(t) ? null : t;
}

function dedupe(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return rows;
  const entries = rows.map((it, i) => {
    const f = (it && it.fields) || it || {};
    return { it, i, f, t: timeOf(f, it) };
  });
  /* Se compara en orden de hora; el resultado sale en el orden en que llego. */
  const byTime = entries.filter(e => e.t != null && e.f.ChangeType && !SKIP_TYPES.has(e.f.ChangeType)).sort((a, b) => a.t - b.t || a.i - b.i);
  const kept = new Map(), hide = new Set();
  byTime.forEach(e => {
    const k = keyOf(e.f), first = kept.get(k);
    if (first != null && e.t - first < WINDOW_MS) { hide.add(e.i); return; }
    kept.set(k, e.t);
  });
  return hide.size ? entries.filter(e => !hide.has(e.i)).map(e => e.it) : rows;
}

module.exports = { dedupe, WINDOW_MS, _keyOf: keyOf };
