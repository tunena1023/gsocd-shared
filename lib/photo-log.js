/* gsocd-shared (06/10/2026): antes era una copia identica en Admin, Orders y
   Tech; ahora vive aqui y cada portal la carga desde su lib/ con una linea
   (los portales fijan gsocd-shared por SHA en package.json). */
/* ============================================================
   lib/photo-log.js — quien tomo cada foto (26/09/2026, pedido del
   dueño: "los supervisores quieren saber quien tomo cada foto").

   Todas las fotos de una orden viven en la misma carpeta, sin decir de
   quien son. La lista TechPhotoLog ya existia (Tech la llenaba solo
   con las fotos de orden y de recurrentes); ahora cada subida de los 3
   portales deja su renglon: Title = OrderID, FileName, TechId = quien.
     TechId "13"            -> un tecnico (id de la lista Techs)
     TechId "staff:<email>" -> alguien de la oficina (Admin)
     TechId "client:<id>"   -> el cliente (Orders)
   Nunca tumba la subida: si esto falla, la foto ya quedo guardada.

   MISMO archivo en Admin, Orders y Tech.
============================================================ */
const LIST = 'TechPhotoLog';

async function logPhoto(g, { orderId, fileName, by, isVideo, latitude, longitude }) {
  try {
    const q = g.siteListPath(LIST) + '?$expand=fields&$top=1&$filter=' +
      encodeURIComponent(`fields/FileName eq '${String(fileName).replace(/'/g, "''")}'`);
    const found = await g.graphFetch(q, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } }).catch(() => null);
    if (found && found.value && found.value.length) return; /* reenvio de la misma foto */
    const row = { Title: orderId, TechId: String(by || ''), FileName: fileName, IsVideo: !!isVideo, CapturedDate: new Date().toISOString() };
    if (latitude != null) row.Latitude = latitude;
    if (longitude != null) row.Longitude = longitude;
    await g.createListItem(LIST, row);
  } catch (e) {
    console.error('photo-log write failed:', e.message);
  }
}

/* { fileName: TechId } para esas fotos. Sin datos -> {}. */
async function takenByMap(lq, fileNames) {
  const names = [...new Set((fileNames || []).filter(Boolean))];
  if (!names.length) return {};
  try {
    const rows = await lq.fetchByValues(LIST, 'FileName', names);
    const out = {};
    rows.forEach(it => { if (it.fields && it.fields.FileName) out[it.fields.FileName] = String(it.fields.TechId || ''); });
    return out;
  } catch (e) {
    return {};
  }
}

/* Nombre para mostrar. techNames: { id: "Nombre Apellido" },
   staffNames: { email: "Nombre" } (opcional). */
function labelOf(by, fileName, techNames, staffNames) {
  const v = String(by || '');
  if (v.indexOf('client:') === 0 || (!v && /^client-/i.test(String(fileName || '')))) return 'Client';
  if (v.indexOf('staff:') === 0) {
    const email = v.slice(6).toLowerCase();
    return (staffNames && staffNames[email]) || 'Office';
  }
  if (v) return (techNames && techNames[v]) || 'Technician';
  return '';
}

module.exports = { logPhoto, takenByMap, labelOf };
