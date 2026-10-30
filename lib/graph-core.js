/* ============================================================
   gsocd-shared/lib/graph-core.js -- el cliente de Microsoft Graph de los
   3 portales. Antes cada uno tenia su lib/graph.js (472, 419 y 387
   renglones) con el mismo token, reintentos y helpers, y diferencias
   que nadie habia escogido (ver README "graph-core"). Ahora cada portal:

     module.exports = require('gsocd-shared/lib/graph-core')({
       portal: 'Admin',                                   // 'Admin' | 'Orders' | 'Tech' (logs de sp-heal)
       catalog: () => require('./sp-columns').SPEC       // sin catalog: sin sp-heal
     });

   Igual en los 3 (como ya estaba): token de aplicacion con cache ~55 min
   por instancia; reintentos ante 429/503 con lo que pide SharePoint
   (lib/graph-retry); copia de cada guardado a SQL (lib/sql-mirror).
   Variables: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
   GRAPH_HOSTNAME, GRAPH_SITE_PATH, GRAPH_ORDERS_FOLDER (opts.env o
   process.env). Permiso Azure: Sites.ReadWrite.All (sp-heal: Sites.Manage.All).
============================================================ */
'use strict';

const { fetchWithRetry } = require('./graph-retry');
const spHeal = require('./sp-heal');
const GRAPH = 'https://graph.microsoft.com/v1.0';

/* Listas del sitio (la union de lo que usaban los 3 portales; es el mismo SharePoint). */
const LISTS = {
  CLIENTS_LIST: 'Clients',
  ORDERS_LIST: 'Orders',
  ORDER_SERVICES_LIST: 'OrderServices',
  ORDER_HISTORY_LIST: 'OrderHistory',
  ORDER_SEEN_BY_LIST: 'OrderSeenBy',               // OrderID, ViewerId, SeenAt -- lib/seen-tracking.js
  DRAFTS_LIST: 'Drafts',
  CLIENT_HISTORY_LIST: 'ClientHistory',
  CLIENT_ADDRESSES_LIST: 'ClientAddresses',
  CLIENT_CONTACTS_LIST: 'ClientContacts',
  SERVICES_LIST: 'Services',
  /* "Assign by service": una fila por servicio de una orden en modo por servicio (OrderID+Category+ServiceName);
     AssignedTo es texto (nombres separados por coma). */
  SERVICE_ASSIGNMENTS_LIST: 'ServiceAssignments',
  SERVICES_CATALOG_LIST: 'ServicesCatalog',
  SERVICE_TEMPLATES_LIST: 'ServiceTemplates',
  STAFF_LIST: 'Staff',
  SETTINGS_LIST: 'Settings',
  FIELD_EMPLOYEES_LIST: 'FieldEmployees',
  SCHEDULING_LIST: 'Scheduling',                   // donde Admin guarda las asignaciones (la de verdad)
  WEEKLY_HOURS_LIST: 'WeeklyHours',
  REPORT_UPLOADS_LIST: 'ReportUploads',
  RECURRING_SERVICES_LIST: 'RecurringServices',
  RECURRING_ASSIGNMENTS_LIST: 'RecurringAssignments',
  RECURRING_LOG_LIST: 'RecurringLog',
  RECURRING_IMPORT_MATRIX_LIST: 'RecurringImportMatrix',
  TECHS_LIST: 'Techs',
  ORDER_ASSIGNMENTS_LIST: 'OrderAssignments',
  SERVICE_TIMES_LIST: 'ServiceTimes',              // minutos por servicio
  CLIENT_PACKAGES_LIST: 'ClientPackages',          // ClientID, PackageSKU, Items -- lib/client-packages.js
  PUSH_SUBSCRIPTIONS_LIST: 'PushSubscriptions',    // Tech las crea; Admin manda el push
  /* Holidays: lista maestra (RuleType 'Fixed' = Month+Day; 'NthWeekday' = Nth 1-5, Weekday 0=Sunday).
     ClientHolidays: la eleccion de cada cliente (y building; BuildingId vacio = direccion principal). */
  HOLIDAYS_LIST: 'Holidays',
  CLIENT_HOLIDAYS_LIST: 'ClientHolidays',
  /* Acceso por QR: SetupToken de un uso; DeviceToken el permanente (uno activo por tecnico). */
  TECH_DEVICE_TOKENS_LIST: 'TechDeviceTokens',
  TECH_PHOTO_LOG_LIST: 'TechPhotoLog',             // cada foto/video subido: quien, cuando, donde
  SUGGESTIONS_LIST: 'Suggestions',                 // sugerencias del staff (Changelog); solo Developer
  /* Codigos de promo (Orders): PromoCodes = catalogo; RedeemedPromoCodes = quien canjeo cual. */
  PROMO_CODES_LIST: 'PromoCodes',
  REDEEMED_PROMO_CODES_LIST: 'RedeemedPromoCodes'
};

/* Rutas fijas dentro del drive */
const PATHS = {
  categoryImages: 'Assets/CategoryImages',
  servicesImages: 'Assets/Services'
};

/* Respuesta JSON estandar para handlers */
function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj)
  };
}

function createGraph(opts) {
  opts = opts || {};
  const portal = opts.portal || 'portal';
  const env = opts.env || process.env;
  /* Sin respaldo a proposito para las credenciales: son reales y estan en Vercel. */
  const TENANT_ID = env.GRAPH_TENANT_ID;
  const CLIENT_ID = env.GRAPH_CLIENT_ID;
  const CLIENT_SECRET = env.GRAPH_CLIENT_SECRET;
  const HOSTNAME = env.GRAPH_HOSTNAME || 'netorgft10263312.sharepoint.com';
  const SITE_PATH = env.GRAPH_SITE_PATH || '/sites/Onlineorders';
  /* Carpeta raiz de los PDF de las ordenes: Orders / <ClientID> - <Business Name> / <OrderID>-rN.pdf */
  const ORDERS_FOLDER = env.GRAPH_ORDERS_FOLDER || 'Orders';

  /* ===== Token de aplicación (cacheado ~55 min por proceso) ===== */
  let _tokenCache = null;

  async function getGraphToken() {
    if (_tokenCache && _tokenCache.exp > Date.now()) return _tokenCache.token;


    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    });

    const res = await fetch('https://login.microsoftonline.com/' + TENANT_ID + '/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!res.ok) throw new Error('Token request failed: ' + res.status + ' ' + (await res.text()).slice(0, 200));

    const data = await res.json();
    _tokenCache = { token: data.access_token, exp: Date.now() + ((data.expires_in || 3600) - 60) * 1000 };
    return _tokenCache.token;
  }

  /* ===== Fetch autenticado por RUTA, con retry ante 429/503 =====
     raw=true devuelve la Response cruda (descargas binarias).
     Si no, devuelve JSON parseado y lanza error si !ok. */
  async function rawGraphFetch(path, options = {}, raw = false) {
    const token = await getGraphToken();
    const url = path.startsWith('http') ? path : GRAPH + path;

    /* "throttled" (429) / 503: se espera lo que SharePoint pide (gsocd-shared/lib/graph-retry). */
    const res = await fetchWithRetry(() => fetch(url, Object.assign({}, options, {
      headers: Object.assign({ Authorization: 'Bearer ' + token }, options.headers || {})
    })));

    if (raw) return res;

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* respuesta vacía */ }
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || ('Graph API error ' + res.status + ': ' + text.slice(0, 300));
      /* Con su status: asi se distingue "la lista no existe" (404) de "fallo la lectura". */
      const err = new Error(msg); err.status = res.status;
      throw err;
    }
    return data;
  }

  /* sp-heal (opts.catalog): la lista, columna o indice que falta y esta en el catalogo se crea sola la primera
     vez que se necesita y se reintenta una vez. Lo que no esta en el catalogo no se crea: console.error y el
     error original sigue. Sin catalogo no se crea nada desde ese portal. */
  const healer = opts.catalog ? spHeal.createHealer({
    portal, rawFetch: rawGraphFetch, getSiteId: () => getSiteId(), catalog: opts.catalog
  }) : null;
  /* Cada guardado en una lista se copia tambien a SQL (gsocd-shared/lib/sql-mirror); SharePoint sigue mandando. */
  const graphFetch = require('./sql-mirror').wrap(healer ? healer.graphFetch : rawGraphFetch);

  /* ===== Sitio y drive (resueltos una vez por proceso) ===== */
  let _siteId = null;

  async function getSiteId() {
    if (_siteId) return _siteId;
    const site = await rawGraphFetch('/sites/' + HOSTNAME + ':' + SITE_PATH);
    _siteId = site.id;
    return _siteId;
  }

  let _driveId = null;

  async function getDriveId() {
    if (_driveId) return _driveId;
    const siteId = await getSiteId();
    const data = await graphFetch('/sites/' + siteId + '/drives');
    const drives = data.value || [];
    const chosen = drives.find(d => d.name === 'Documents') ||
                   drives.find(d => d.driveType === 'documentLibrary') || drives[0];
    if (!chosen) throw new Error('No document library found on site.');
    _driveId = chosen.id;
    return _driveId;
  }

  /* ===== HELPERS DE LISTAS ===== */

  function siteListPath(listName) {
    return '/sites/' + HOSTNAME + ':' + SITE_PATH + ':/lists/' + encodeURIComponent(listName) + '/items';
  }

  async function createListItem(listName, fields) {
    return graphFetch(siteListPath(listName), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
  }

  async function updateListItemByItemId(listName, itemId, fields) {
    return graphFetch(siteListPath(listName) + '/' + itemId + '/fields', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields)
    });
  }

  /* DELETE de un item usando siteId resuelto — la ruta con colon-encoding no funciona para DELETE */
  async function deleteListItem(listName, itemId) {
    const siteId = await getSiteId();
    return graphFetch("/sites/" + siteId + "/lists/" + encodeURIComponent(listName) + "/items/" + itemId, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" }
    });
  }

  /* Consulta con $filter/$expand/$orderby/$top opcionales.
     Ej.: queryList(ORDERS_LIST, '$expand=fields&$top=200') */
  async function queryList(listName, odata) {
    const qs = odata ? '?' + String(odata).replace(/^\?/, '') : '?$expand=fields';
    const data = await graphFetch(siteListPath(listName) + qs);
    return data.value || [];
  }

  /* ===== HELPERS DE DRIVE (archivos e imágenes) ===== */

  /* Codifica una URL compartida al formato que espera Graph (/shares/) */
  function encodeShareLink(url) {
    return 'u!' + Buffer.from(url, 'utf-8').toString('base64')
      .replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  }

  /* Resuelve un enlace compartido (":x:/s/...", ":f:/..." etc.) al item real */
  async function driveItemByShareLink(shareUrl) {
    const data = await graphFetch('/shares/' + encodeURIComponent(encodeShareLink(shareUrl)) + '/driveItem');
    return data;   // incluye id y parentReference.driveId
  }

  /* Item por ruta relativa al root del drive · null si no existe */
  async function driveItemByPath(relPath) {
    const driveId = await getDriveId();
    const clean = String(relPath || '').replace(/^\/+|\/+$/g, '');
    try {
      return await graphFetch('/drives/' + driveId + '/root:/'
        + clean.split('/').map(encodeURIComponent).join('/'));
    } catch (e) { return null; }
  }

  /* Hijos de una carpeta: [{name,id,size,isFile,isFolder}] · [] si no existe */
  /* opts.thumbs: también la miniatura de cada foto (para no cargar cada foto completa, varios MB, para un cuadrito). */
  async function listChildren(folderRelPath, opts) {
    const driveId = await getDriveId();
    const clean = String(folderRelPath || '').replace(/^\/+|\/+$/g, '');
    try {
      /* Graph entrega los hijos en paginas de 200: se siguen todas las
         paginas. Con solo la primera, con mas de 200 archivos (PDFs de un
         cliente, fotos, respaldos) o mas de 200 clientes en la carpeta de
         Orders, lo demas "no existiria" (un PDF nuevo podria pisar uno viejo,
         o crearse otra carpeta del mismo cliente). */
      const items = [];
      let url = '/drives/' + driveId + '/root:/'
        + clean.split('/').map(encodeURIComponent).join('/') + ':/children' + (opts && opts.thumbs ? '?$expand=thumbnails' : '');
      while (url) {
        const data = await graphFetch(url);
        items.push(...(data.value || []));
        url = data['@odata.nextLink'] || null;
      }
      return items.map(x => ({
        name: x.name, id: x.id, size: x.size || 0,
        isFile: !!x.file, isFolder: !!x.folder,
        /* URL de descarga temporal (pre-autenticada, ~1h) que Graph ya
           incluye en cada item de archivo -- sirve directo como src de
           una imagen sin necesitar otro endpoint aparte. Igual que
           tech.gsocd.com/lib/graph.js. */
        downloadUrl: x['@microsoft.graph.downloadUrl'] || null,
        thumb: (x.thumbnails && x.thumbnails[0] && ((x.thumbnails[0].medium || x.thumbnails[0].small || {}).url)) || null,
        createdDateTime: x.createdDateTime || null,
        webUrl: x.webUrl || null
      }));
    } catch (e) { return []; }
  }

  /* Primer archivo cuyo nombre EMPIEZA con prefix (case-insensitive)
     Regla CategoryImages: "kitchen" → Kitchen-Image.png */
  async function findByPrefix(folderRelPath, prefix) {
    const kids = await listChildren(folderRelPath);
    const p = String(prefix || '').toLowerCase();
    return kids.find(k => k.isFile && k.name.toLowerCase().startsWith(p)) || null;
  }

  /* Archivo por nombre EXACTO sin importar mayúsculas ni extensión
     "Kitchen-Stove-DeepClean" encuentra .png/.jpg/.jpeg/.webp */
  async function findByName(folderRelPath, baseName) {
    const kids = await listChildren(folderRelPath);
    const target = String(baseName || '').toLowerCase();
    return kids.find(k => {
      if (!k.isFile) return false;
      const dot = k.name.lastIndexOf('.');
      const stem = (dot >= 0 ? k.name.slice(0, dot) : k.name).toLowerCase();
      return stem === target;
    }) || null;
  }

  /* Descarga un item por ID → Buffer */
  async function downloadById(itemId) {
    const driveId = await getDriveId();
    const res = await graphFetch('/drives/' + driveId + '/items/' + itemId + '/content', {}, true);
    if (!res.ok) throw new Error('Download failed (' + res.status + ')');
    return Buffer.from(await res.arrayBuffer());
  }


  /* ===== ESCRITURA EN EL DRIVE (carpetas y subida de archivos) ===== */

  function encodePath(relPath) {
    return String(relPath || '').replace(/^\/+|\/+$/g, '')
      .split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  /* Primera CARPETA cuyo nombre empieza con prefix (case-insensitive).
     Se usa para hallar "GS-6062 - Cualquier Nombre" solo con "GS-6062 -". */
  async function findFolderByPrefix(parentRelPath, prefix) {
    const kids = await listChildren(parentRelPath);
    const p = String(prefix || '').trim().toLowerCase();
    if (!p) return null;
    return kids.find(k => k.isFolder && k.name.trim().toLowerCase().startsWith(p)) || null;
  }

  /* Crea la carpeta si no existe y devuelve su ruta relativa.
     Crea cada nivel por separado: Graph no crea rutas intermedias. */
  async function ensureFolder(relPath) {
    const driveId = await getDriveId();
    const parts = String(relPath || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    let walked = '';
    for (const part of parts) {
      const next = walked ? walked + '/' + part : part;
      const existing = await driveItemByPath(next);
      if (existing && existing.folder) { walked = next; continue; }
      const parentUrl = walked
        ? '/drives/' + driveId + '/root:/' + encodePath(walked) + ':/children'
        : '/drives/' + driveId + '/root/children';
      try {
        await graphFetch(parentUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: part,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'replace'
          })
        });
      } catch (e) {
        /* Otra ejecucion pudo crearla al mismo tiempo: solo falla si sigue ausente */
        const check = await driveItemByPath(next);
        if (!check) throw e;
      }
      walked = next;
    }
    return walked;
  }

  /* Sube (o reemplaza) un archivo. Usa PUT simple hasta 4 MB, que es de sobra
     para un PDF de una orden. Devuelve { id, name, webUrl }. */
  async function uploadFile(folderRelPath, fileName, buffer, contentType) {
    const driveId = await getDriveId();
    await ensureFolder(folderRelPath);
    const target = '/drives/' + driveId + '/root:/' + encodePath(folderRelPath)
      + '/' + encodeURIComponent(fileName) + ':/content';
    const item = await graphFetch(target, {
      method: 'PUT',
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
      body: buffer
    });
    return { id: item.id, name: item.name, webUrl: item.webUrl };
  }

  /* Descarga un archivo por ruta relativa -> Buffer, o null si no existe */
  async function downloadByPath(relPath) {
    const driveId = await getDriveId();
    try {
      const res = await graphFetch('/drives/' + driveId + '/root:/'
        + encodePath(relPath) + ':/content', {}, true);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch (e) { return null; }
  }

  /* Nominatim (OpenStreetMap) -- gratis, sin cuenta, sin tarjeta. Nunca
     debe tronar quien la llame si falla o no encuentra nada; regresa
     null y ya, las coordenadas se pueden rellenar despues con el
     backfill de Developer si esta vez no jalo. Compartido por
     admin-update-client.js (crear/editar building) y developer-admin.js
     (backfill de los que ya existen). */
  /* Borra un archivo o carpeta por su id (recursivo si es carpeta --
     asi es como Graph maneja DELETE, de una sola vez). Usado SOLO por
     wipe-test-data (Developer > Debug) para de verdad tirar fotos y
     documentos de ordenes de prueba, no solo las filas de las listas.
     Silencioso si ya no existe (pudo borrarse en una corrida anterior). */
  async function deleteDriveItemById(itemId) {
    const driveId = await getDriveId();
    try {
      await graphFetch('/drives/' + driveId + '/items/' + itemId, { method: 'DELETE' }, true);
    } catch (e) { /* ya no existia, o error transitorio -- no es critico para un wipe de prueba */ }
  }

  async function geocodeAddress(address, city, zip) {
    const rawAddr = String(address || '').trim();
    const cty = String(city || '').trim();
    const z = String(zip || '').trim();
    if (!rawAddr && !cty && !z) return null;

    /* Nunca nos importa la suite/local para geocodificar -- solo
       necesitamos el punto del EDIFICIO (lat/lon), y encima Nominatim
       casi nunca tiene registrada la suite individual, solo el
       edificio completo. Se quita de una vez, sin intentar mandarla
       primero. */
    const addr = rawAddr.replace(/,?\s*(suite|ste|apt|apartment|unit|#)\s*[a-z0-9-]+\s*$/i, '').trim();

    async function tryQuery(url) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'GS-Solutions-Scheduling/1.0 (internal tool)' } });
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data) || !data.length) return null;
        const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
        if (isNaN(lat) || isNaN(lon)) return null;
        return { lat, lon };
      } catch (e) { return null; }
    }

    /* Intento 1: busqueda ESTRUCTURADA -- mucho mas confiable que un
       solo texto libre, sin ambiguedad de donde termina la calle y
       empieza la ciudad. */
    const structParams = new URLSearchParams({ format: 'json', limit: '1', country: 'USA' });
    if (addr) structParams.set('street', addr);
    if (cty) structParams.set('city', cty);
    if (z) structParams.set('postalcode', z);
    const structResult = await tryQuery('https://nominatim.openstreetmap.org/search?' + structParams.toString());
    if (structResult) return structResult;

    /* Intento 2: si la estructurada no encontro nada (direccion
       incompleta, formato raro, etc), texto libre de respaldo -- mejor
       que nada. */
    const q = [addr, cty, z, 'USA'].filter(Boolean).join(', ');
    if (!q.trim()) return null;
    return await tryQuery('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
  }

  return Object.assign({}, LISTS, {
    PATHS, ORDERS_FOLDER, portal,
    getGraphToken, graphFetch, rawGraphFetch, getSiteId, getDriveId, healer,
    siteListPath, queryList, createListItem, updateListItemByItemId, deleteListItem,
    encodeShareLink, driveItemByShareLink,
    driveItemByPath, listChildren, findByPrefix, findByName, downloadById,
    findFolderByPrefix, ensureFolder, uploadFile, downloadByPath, deleteDriveItemById,
    geocodeAddress,
    jsonResponse
  });
}

module.exports = createGraph;
module.exports.LISTS = LISTS;
module.exports.PATHS = PATHS;
module.exports.jsonResponse = jsonResponse;
