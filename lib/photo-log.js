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

   De donde salio (17/10/2026, dueño: "ponlo en la metadata para reports
   mas adelante"): Source = 'gallery' (del telefono) | 'computer' (de la
   PC) y TakenAt = la fecha del archivo; vacio = la camara de la app.
   Ademas el nombre del archivo lleva "-gal" (galTag), asi el registro
   queda aunque falten esas columnas. Si las columnas no existen todavia
   (el dueño las crea con el boton de Developer › SharePoint columns),
   el renglon se guarda sin ellas.

   MISMO archivo en Admin, Orders y Tech.
============================================================ */
const LIST = 'TechPhotoLog';

/* 'gallery' | 'computer' | '' (camara de la app), del body que manda gsocd-shared/camera-capture. */
function sourceOf(b) {
  const s = String((b && b.source) || '').toLowerCase();
  return s === 'gallery' || s === 'computer' ? s : '';
}
/* "-gal" para el nombre del archivo de una foto que no se tomo con la camara de la app. */
function galTag(b) { return sourceOf(b) ? '-gal' : ''; }
/* Nombre de una foto de servicio (18/10/2026: UN solo patron para Admin, Orders, Tech y QuickBooks; antes cada
   uno aceptaba un solo sufijo y "svc-<srv>-<fecha>_<hora>-<random>-gal.jpg" quedaba sin servicio):
     svc-<Servicio_Seguro>-AAAA-MM-DD_HHMMSS[-<random>][-gal].<ext>
   Grupos: 1 servicio, 2-7 fecha y hora (UTC), 8 random, 9 "-gal". */
const SVC_PHOTO_NAME = /^svc-(.+?)-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})(?:-((?!gal\.)[a-z0-9]+))?(-gal)?\.[a-z0-9]+$/i;
/* El sello de cuando se tomo ("AAAA-MM-DD_HHMMSS[-random]") de cualquier foto (svc-, insp-, ...), o ''. */
const PHOTO_STAMP = /(\d{4}-\d{2}-\d{2}_\d{6}(?:-(?!gal\.)[a-z0-9]+)?)(?:-gal)?\.[a-z0-9]+$/i;
function parseServicePhoto(fileName) {
  const m = SVC_PHOTO_NAME.exec(String(fileName || ''));
  if (!m) return null;
  return { serviceSafe: m[1], service: m[1].replace(/_+/g, ' ').trim(), y: m[2], mo: m[3], d: m[4], h: m[5], mi: m[6], s: m[7], rand: m[8] || '', gallery: !!m[9] };
}
/* El nombre que ven el cliente y el tecnico (18/10/2026, dueña: "From gallery" / "PC" solo lo ve Admin): sin el "-gal". */
function publicName(fileName) { return String(fileName || '').replace(/-gal(\.[a-z0-9]+)$/i, '$1'); }
function photoStamp(fileName) { const m = PHOTO_STAMP.exec(String(fileName || '')); return m ? m[1] : ''; }
/* ¿El nombre dice que se subio de la galeria o de la PC? */
function isFromGallery(fileName) { return /-gal\.[a-z0-9]+$/i.test(String(fileName || '')); }

async function logPhoto(g, { orderId, fileName, by, isVideo, latitude, longitude, source, takenAt }) {
  try {
    const q = g.siteListPath(LIST) + '?$expand=fields&$top=1&$filter=' +
      encodeURIComponent(`fields/FileName eq '${String(fileName).replace(/'/g, "''")}'`);
    const found = await g.graphFetch(q, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } }).catch(() => null);
    if (found && found.value && found.value.length) return; /* reenvio de la misma foto */
    const row = { Title: orderId, TechId: String(by || ''), FileName: fileName, IsVideo: !!isVideo, CapturedDate: new Date().toISOString() };
    if (latitude != null) row.Latitude = latitude;
    if (longitude != null) row.Longitude = longitude;
    const src = sourceOf({ source });
    if (!src) { await g.createListItem(LIST, row); return; }
    const when = takenAt && !isNaN(new Date(takenAt).getTime()) ? new Date(takenAt).toISOString() : '';
    try {
      await g.createListItem(LIST, Object.assign({}, row, { Source: src }, when ? { TakenAt: when } : {}));
    } catch (e) {
      /* Columnas Source/TakenAt todavia sin crear: el renglon sin ellas (el "-gal" del nombre ya lo dice). */
      await g.createListItem(LIST, row);
    }
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

module.exports = { logPhoto, takenByMap, labelOf, sourceOf, galTag, isFromGallery, SVC_PHOTO_NAME, PHOTO_STAMP, parseServicePhoto, photoStamp, publicName };
