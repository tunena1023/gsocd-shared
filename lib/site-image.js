/* ============================================================
   gsocd-shared/lib/site-image.js -- proxy PUBLICO de imagenes desde
   SharePoint (site-image.js de cada portal). Antes Admin y Orders tenian
   casi el mismo archivo (~150 renglones) y Tech una version minima.

   Uso (site-image.js del portal, una linea):
     module.exports = require('gsocd-shared/lib/site-image')(require('./lib/graph'), { supply: true });

   Modos (GET):
     ?cat=Kitchen                  -> Assets/CategoryImages/Kitchen-Image.*  (prefijo)
     ?name=Logo.jpg                -> imagen exacta en la raiz del drive
     ?svc=Kitchen-Stove-DeepClean  -> Assets/Services/{nombre} (sin extension)
     ?gallery-list=Kitchen         -> JSON {files:[...]} de Assets/Services/Kitchen/
     ?gallery=Kitchen&file=x.jpg   -> esa foto de la carpeta de la categoria
     ?supply=J-001-x.jpg           -> foto de un articulo de bodega (solo con opts.supply: Admin)
   opts.modes: los modos que contesta el portal (Tech: ['name']); por defecto todos.
   opts.maxAge: segundos de Cache-Control (300).

   SEGURIDAD: es PUBLICA (no pide sesion). Cada nombre es un solo segmento
   (sin '/', '\\' ni '..') y ?name= / ?supply= solo entregan imagenes, para que
   una ruta no pueda bajar cualquier archivo del SharePoint (fotos de
   ordenes, PDFs...). Fotos de mas de 4.5 MB no se mandan (limite de la
   respuesta); el front cae a su placeholder.
============================================================ */
'use strict';

const ALL_MODES = ['cat', 'name', 'svc', 'gallery-list', 'gallery', 'supply'];

module.exports = function siteImage(g, opts) {
  opts = opts || {};
  const maxAge = opts.maxAge || 300;
  const modes = new Set((opts.modes || ALL_MODES).filter(m => m !== 'supply' || opts.supply));

  const MAX_BYTES = 4.5 * 1024 * 1024;
  const CACHE_TTL = 5 * 60 * 1000;

  /* ===== Content-Type por extensión ===== */
  const EXT_TYPES = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml'
  };

  function typeOf(name) {
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? (EXT_TYPES[name.slice(dot).toLowerCase()] || 'application/octet-stream') : 'application/octet-stream';
  }

  /* ===== Respuesta binaria con caché de navegador ===== */
  function binaryResponse(buffer, contentType) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=' + maxAge
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  }

  function notFound() {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: '{"error":"not found"}' };
  }

  /* ===== Listados con caché de proceso (evita golpear Graph por imagen) ===== */
  const _listings = {};

  async function cachedChildren(folderPath) {
    const key = folderPath.toLowerCase();
    const hit = _listings[key];
    if (hit && hit.exp > Date.now()) return hit.data;
    const kids = await g.listChildren(folderPath);
    _listings[key] = { exp: Date.now() + CACHE_TTL, data: kids };
    return kids;
  }

  /* SEGURIDAD: esta funcion es PUBLICA (no pide sesion). Cada nombre es un
     solo segmento (sin '/', '\\' ni '..'), para que una ruta no pueda bajar
     cualquier archivo del SharePoint (fotos de ordenes, PDFs...), y ?name=
     solo entrega imagenes de la raiz (Logo.jpg, NavBackground.jpg,
     LoginBackground.jpg). */
  function safeSegment(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s || s.length > 120 || /[\\/]|\.\.|[\u0000-\u001f]/.test(s)) return null;
    return s;
  }

  /* ===== Modos ===== */

  /* ?cat=Categoria — Assets/CategoryImages/{Categoria}-Image.* */
  async function serveCategory(cat) {
    const item = await g.findByPrefix(g.PATHS.categoryImages, cat);
    if (!item || item.size > MAX_BYTES) return notFound();
    return binaryResponse(await g.downloadById(item.id), typeOf(item.name));
  }

  /* ?name=Logo.png / ?name=Logo.jpg — archivo en la raíz del drive buscado por ruta directa */
  async function serveRootFile(name) {
    const item = await g.driveItemByPath(String(name));
    if (!item || (item.size || 0) > MAX_BYTES) return notFound();
    return binaryResponse(await g.downloadById(item.id), typeOf(item.name));
  }

  /* ?svc=Categoria-Servicio[-Subopcion] — Assets/Services/ */
  async function serveServiceImage(baseName) {
    /* Acepta el nombre tal cual (el front ya normaliza sin espacios) */
    const item = await g.findByName(g.PATHS.servicesImages, baseName);
    if (!item || item.size > MAX_BYTES) return notFound();
    return binaryResponse(await g.downloadById(item.id), typeOf(item.name));
  }

  /* ?gallery-list=Categoria — nombres de imagen de Assets/Services/Categoria/ */
  async function serveGalleryList(cat) {
    const kids = await cachedChildren(g.PATHS.servicesImages + '/' + String(cat));
    const files = kids
      .filter(k => k.isFile && k.size <= MAX_BYTES && typeOf(k.name).startsWith('image/') && typeOf(k.name) !== 'image/svg+xml')
      .map(k => k.name)
      .sort();
    return g.jsonResponse(200, { files });
  }

  /* ?gallery=Categoria&file=x.jpg — foto individual de la categoría */
  async function serveGalleryPhoto(cat, file) {
    const kids = await cachedChildren(g.PATHS.servicesImages + '/' + String(cat));
    const wanted = String(file).toLowerCase();
    const item = kids.find(k => k.isFile && k.name.toLowerCase() === wanted);
    if (!item || item.size > MAX_BYTES) return notFound();
    return binaryResponse(await g.downloadById(item.id), typeOf(item.name));
  }

  /* ?supply=J-001-xxxx.jpg — foto de un articulo de bodega (Warehouse/Items) */
  async function serveSupplyPhoto(file) {
    const item = await g.driveItemByPath('Warehouse/Items/' + String(file));
    if (!item || (item.size || 0) > MAX_BYTES) return notFound();
    return binaryResponse(await g.downloadById(item.id), typeOf(item.name));
  }

  async function handler(event) {
    if (event.httpMethod !== 'GET') {
      return g.jsonResponse(405, { error: 'Method not allowed' });
    }
    const p = event.queryStringParameters || {};
    try {
      const bad = ['cat', 'name', 'svc', 'gallery-list', 'gallery', 'file', 'supply'].some(k => p[k] != null && !safeSegment(p[k]));
      if (bad) return notFound();
      if (p.name && !/^image\//.test(typeOf(String(p.name)))) return notFound();
      if (p.supply && !/^image\//.test(typeOf(String(p.supply)))) return notFound();
      if (p.supply && modes.has('supply')) return await serveSupplyPhoto(p.supply);
      if (p.cat && modes.has('cat')) return await serveCategory(p.cat);
      if (p.name && modes.has('name')) return await serveRootFile(p.name);
      if (p.svc && modes.has('svc')) return await serveServiceImage(p.svc);
      if (p['gallery-list'] && modes.has('gallery-list')) return await serveGalleryList(p['gallery-list']);
      if (p.gallery && p.file && modes.has('gallery')) return await serveGalleryPhoto(p.gallery, p.file);
      return g.jsonResponse(400, { error: 'Missing parameters' });
    } catch (err) {
      return g.jsonResponse(500, { error: err.message });
    }
  }

  return { handler, safeSegment, typeOf };
};
