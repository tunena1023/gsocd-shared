/* gsocd-shared (06/10/2026): antes era una copia identica en Admin, Orders y
   Tech; ahora vive aqui y cada portal la carga desde su lib/ con una linea
   (los portales fijan gsocd-shared por SHA en package.json). */
/* ============================================================
   lib/gallery-scan.js -- galerias mas rapidas (25/09/2026, "arregla
   toda la A").

   Antes cada galeria abria la carpeta de fotos de CADA orden (aunque
   nunca le hubieran tomado una foto) -- una consulta a SharePoint por
   orden, en cada carga. Ahora primero se lista, UNA vez por cliente, que
   carpetas de orden existen (TechPhotos/<ClientID - Negocio>/) y solo se
   abren esas. Si esa lista falla por algo que no sea "no existe", se
   abren todas las de ese cliente como antes (nunca se esconde una foto).

   MISMO archivo en Admin, Orders y Tech.
============================================================ */
/* Uso desde un portal: require('gsocd-shared/lib/gallery-scan')(require('./graph')) */
module.exports = function galleryScan(g) {
const { graphFetch, getDriveId } = g;

const enc = p => String(p).replace(/^\/+|\/+$/g, '').split('/').map(encodeURIComponent).join('/');

/* Nombres (en minusculas) de las subcarpetas de relPath. Set vacio si la
   carpeta no existe; null si no se pudo saber. */
async function folderNames(relPath) {
  try {
    const driveId = await getDriveId();
    let url = '/drives/' + driveId + '/root:/' + enc(relPath) + ':/children?$select=name,folder&$top=999';
    const out = new Set();
    while (url) {
      const data = await graphFetch(url);
      (data.value || []).forEach(x => { if (x.folder) out.add(String(x.name || '').toLowerCase()); });
      url = data['@odata.nextLink'] || null;
    }
    return out;
  } catch (e) {
    /* 08/10/2026 (logs de produccion): para una carpeta que no existe, el
       SharePoint real contesta "The resource could not be found." y eso no
       entraba aqui; un cliente sin fotos todavia se tomaba como falla y se
       abrian una por una todas sus ordenes en cada carga de la galeria. */
    if (/not ?found|could not be found|404|itemNotFound/i.test(e.message)) return new Set();
    console.warn('gallery-scan: could not list ' + relPath + ' (' + e.message + ') -- opening every order of this client');
    return null;
  }
}

/* orders: renglones de Orders ({ fields }). Regresa solo los que tienen
   carpeta de orden, en el mismo orden en que llegaron. */
async function ordersWithFolders(orders, clientFolderName, photosRoot) {
  const byClient = new Map();
  orders.forEach(it => {
    const key = clientFolderName(it.fields);
    if (!byClient.has(key)) byClient.set(key, null);
  });
  const keys = [...byClient.keys()];
  for (let i = 0; i < keys.length; i += 8) {
    const part = keys.slice(i, i + 8);
    const sets = await Promise.all(part.map(k => folderNames(photosRoot + '/' + k)));
    part.forEach((k, j) => byClient.set(k, sets[j]));
  }
  return orders.filter(it => {
    const set = byClient.get(clientFolderName(it.fields));
    if (set === null) return true;
    return set.has(String(it.fields.OrderID || it.fields.Title || '').toLowerCase());
  });
}

return { ordersWithFolders, folderNames };
};
