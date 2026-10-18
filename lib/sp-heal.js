/* ============================================================
   gsocd-shared/lib/sp-heal.js -- la lista o columna de SharePoint que
   falta se crea sola la primera vez que el codigo la necesita
   (dueña 18/10/2026: que nunca tenga que picar Developer › SharePoint
   columns › "Create missing").

   Cada portal envuelve su graphFetch (lib/graph.js):
     const healer = require('gsocd-shared/lib/sp-heal').createHealer({
       portal: 'Admin', rawFetch, getSiteId, catalog: () => require('./sp-columns').SPEC });
     const graphFetch = healer.graphFetch;

   Solo mira llamadas a renglones de una lista (/lists/<nombre>/items...).
   Cuando SharePoint contesta:
     - "la lista no existe"         -> si el catalogo la tiene con createList,
                                       se crea con sus columnas y se reintenta 1 vez.
                                       Una lectura de esa lista, si no se pudo
                                       crear (sin permiso), regresa vacia.
     - "Field 'X' is not recognized" -> se crean las columnas del catalogo (con
                                       `type`) que el guardado trae y la lista no
                                       tiene, y se reintenta 1 vez.
     - "... is not indexed"          -> si el catalogo dice indexed, se le pone
                                       indice y se reintenta 1 vez.
   Crear una lista sale con console.error (que se vea). Nunca borra ni renombra nada. Lo que NO esta en el catalogo no se crea:
   se avisa con console.error y el error original sigue (nada se descarta
   en silencio, dueña 18/10). Cada cosa se intenta una sola vez por
   instancia (arranque en frio): un "sin permiso" no se repite en cada
   guardado, y dos guardados a la vez esperan el mismo intento.
============================================================ */
'use strict';

/* Mismo cuerpo de columna que Admin lib/sp-columns.js (Admin lo toma de aqui). */
function columnBody(c) {
  const b = { name: c.name, displayName: c.name, indexed: !!c.indexed };
  if (c.type === 'note') b.text = { allowMultipleLines: true, linesForEditing: 6 };
  else if (c.type === 'number') b.number = {};
  else if (c.type === 'boolean') b.boolean = {};
  else b.text = { allowMultipleLines: false, maxLength: 255 };
  return b;
}

const ITEMS_RE = /\/lists\/([^/?]+)\/items(\/[^?]*)?(?:\?|$)/;
const NOT_INDEXED_RE = /field '([^']+)' cannot be referenced in filter or orderby as it is not indexed/i;
const COL_MISSING_RE = /\b(?:field|column)\b\s*'([^']*)'?[^.]*?\b(?:is not recognized|not recognized|does not exist)\b/i;
const LIST_MISSING_RE = /\blist\b[^.]*\b(?:not found|does not exist)\b/i;
const EXISTS_RE = /already exists|nameAlreadyExists|\b409\b|duplicate/i;
const DENIED_RE = /access ?denied|forbidden|insufficient privileges|accessDenied|\b403\b/i;

function errStatus(e) {
  if (e && e.status) return Number(e.status);
  const m = /\b(4\d\d|5\d\d)\b/.exec(String(e && e.message || ''));
  return m ? Number(m[1]) : 0;
}

/* Las llaves del guardado (POST {fields} o PATCH .../fields) que son columnas. */
function payloadKeys(options) {
  let b = null;
  try { b = options && options.body && typeof options.body === 'string' ? JSON.parse(options.body) : null; } catch (e) { b = null; }
  if (!b || typeof b !== 'object') return [];
  const f = b.fields && typeof b.fields === 'object' ? b.fields : b;
  return Object.keys(f).filter(k => k && k[0] !== '@' && !k.includes('@odata')).map(k => k.replace(/LookupId$/, ''));
}

function createHealer(cfg) {
  const portal = cfg.portal || 'portal';
  const rawFetch = cfg.rawFetch;
  const log = cfg.log || console;
  const tag = '[sp-heal] ' + portal + ': ';
  const tried = new Map(); /* llave -> promesa del unico intento de esta instancia */
  const told = new Set();   /* lo que no se puede crear se avisa una vez por instancia (el error sigue saliendo cada vez) */
  const loud = (key, msg) => { if (told.has(key)) return; told.add(key); log.error(tag + msg); };

  const catalog = () => { try { return (cfg.catalog && cfg.catalog()) || []; } catch (e) { return []; } };
  const specOf = list => catalog().find(L => L.list === list) || null;
  const once = (key, fn) => {
    if (!tried.has(key)) tried.set(key, Promise.resolve().then(fn).catch(e => { log.error(tag + key + ' failed: ' + (e && e.message || e)); return 'unknown'; }));
    return tried.get(key);
  };
  const json = { 'Content-Type': 'application/json' };
  const listBase = (siteId, list) => '/sites/' + siteId + '/lists/' + encodeURIComponent(list);
  const said = e => (DENIED_RE.test(String(e && e.message)) ? 'no permission (the app needs Sites.Manage.All in Azure)' : String(e && e.message || e));

  async function columnsOf(siteId, list) {
    const d = await rawFetch(listBase(siteId, list) + '/columns?$select=id,name,displayName,indexed');
    return (d && d.value) || [];
  }
  const has = (cols, name) => cols.find(c => c.name === name) || cols.find(c => c.displayName === name);

  /* Una columna del catalogo -> 'ok' (creada o ya estaba) | 'failed'. */
  function createColumn(siteId, list, c) {
    return once('column ' + list + '.' + c.name, async () => {
      try {
        await rawFetch(listBase(siteId, list) + '/columns', { method: 'POST', headers: json, body: JSON.stringify(columnBody(c)) });
        log.log(tag + 'created column ' + list + '.' + c.name + ' (' + (c.type || 'text') + (c.indexed ? ', indexed' : '') + ')');
        return 'ok';
      } catch (e) {
        if (EXISTS_RE.test(String(e && e.message)) || errStatus(e) === 409) return 'ok';
        log.error(tag + 'could not create column ' + list + '.' + c.name + ': ' + said(e));
        return 'failed';
      }
    });
  }

  /* Lista del catalogo: 'ok' (existe o se creo) | 'missing' (confirmado que no existe y no se pudo crear) | 'unknown'. */
  function ensureList(L) {
    return once('list ' + L.list, async () => {
      const siteId = await cfg.getSiteId();
      try { await rawFetch(listBase(siteId, L.list) + '?$select=id'); return 'ok'; } /* si existe: fue otra cosa, se reintenta */
      catch (e) { if (errStatus(e) !== 404) { log.error(tag + 'could not check list ' + L.list + ': ' + said(e)); return 'unknown'; } }
      const typed = L.columns.filter(c => c.type);
      try {
        await rawFetch('/sites/' + siteId + '/lists', { method: 'POST', headers: json,
          body: JSON.stringify({ displayName: L.list, list: { template: 'genericList' }, columns: typed.map(columnBody) }) });
        /* console.error a proposito (revision 18/10): crear una lista nunca debe pasar sin que se vea en los errores
           (p. ej. alguien renombro SupplyItems y la app crea otra vacia con el nombre viejo). */
        log.error(tag + 'created list ' + L.list + ' with ' + typed.length + ' columns (it did not exist)');
      } catch (e) {
        if (!EXISTS_RE.test(String(e && e.message)) && errStatus(e) !== 409) {
          /* Una respuesta cortada puede haberla creado igual: se vuelve a ver antes de darla por perdida. */
          let there = false;
          try { await rawFetch(listBase(siteId, L.list) + '?$select=id'); there = true; } catch (x) { there = false; }
          if (!there) {
            log.error(tag + 'list ' + L.list + ' does not exist and could not be created: ' + said(e));
            return 'missing';
          }
          log.error(tag + 'created list ' + L.list + ' (the create answered an error but the list is there; checking its columns)');
        }
      }
      /* Por si la lista quedo a medias (o la creo otra instancia con menos columnas): las que falten. */
      try {
        const cols = await columnsOf(siteId, L.list);
        for (const c of typed) if (!has(cols, c.name)) await createColumn(siteId, L.list, c);
      } catch (e) { log.error(tag + 'list ' + L.list + ': columns not checked after creating it: ' + said(e)); }
      return 'ok';
    });
  }

  /* -> 'retry' | 'empty' | null (null = se lanza el error original). */
  async function heal(path, options, e) {
    const m = ITEMS_RE.exec(String(path || ''));
    if (!m) return null;
    let list; try { list = decodeURIComponent(m[1]); } catch (x) { return null; }
    const method = String((options && options.method) || 'GET').toUpperCase();
    if (method === 'DELETE') return null;
    const isCollectionRead = method === 'GET' && !m[2];
    const msg = String(e && e.message || '');
    const status = errStatus(e);
    const L = specOf(list);

    /* 1) La lista no existe (en una lectura de la lista entera un 404 solo puede ser eso). */
    if (status === 404 && (LIST_MISSING_RE.test(msg) || (!m[2] && /itemNotFound|not found/i.test(msg)))) {
      if (!L || !L.createList) {
        loud('list ' + list, 'list ' + list + ' does not exist' + (L ? ' (it is in lib/sp-columns.js but without createList, so it is not created by itself)' : ' and it is not in lib/sp-columns.js') + ': ' + msg);
        return null;
      }
      const r = await ensureList(L);
      if (r === 'ok') return 'retry';
      return r === 'missing' && isCollectionRead ? 'empty' : null;
    }

    /* 2) Un filtro sobre una columna sin indice. */
    const ni = NOT_INDEXED_RE.exec(msg);
    if (ni) {
      const c = L && L.columns.find(x => x.name === ni[1] || x.label === ni[1]);
      if (!c || !c.indexed) return null; /* list-query se cae a leer sin filtro, como antes */
      const r = await once('index ' + list + '.' + c.name, async () => {
        const siteId = await cfg.getSiteId();
        const col = has(await columnsOf(siteId, list), c.name);
        if (!col) return 'failed';
        if (col.indexed) return 'ok';
        try {
          await rawFetch(listBase(siteId, list) + '/columns/' + encodeURIComponent(col.id), { method: 'PATCH', headers: json, body: JSON.stringify({ indexed: true }) });
          log.log(tag + 'indexed column ' + list + '.' + c.name);
          return 'ok';
        } catch (x) { log.error(tag + 'could not index ' + list + '.' + c.name + ': ' + said(x)); return 'failed'; }
      });
      return r === 'ok' ? 'retry' : null;
    }

    /* 3) Una columna que la lista no tiene. */
    const cm = COL_MISSING_RE.exec(msg);
    if (cm && (status === 400 || !status)) {
      const names = [...new Set([cm[1]].concat(payloadKeys(options)).filter(Boolean))];
      if (!L) { loud('column ' + list + '.' + cm[1], list + ': column ' + (cm[1] || '?') + ' does not exist and the list is not in lib/sp-columns.js: ' + msg); return null; }
      const siteId = await cfg.getSiteId();
      let cols;
      try { cols = await columnsOf(siteId, list); } catch (x) { log.error(tag + list + ': columns not read: ' + said(x)); return null; }
      const missing = names.filter(n => !has(cols, n));
      if (!missing.length) return null;
      const unknown = [], results = [];
      for (const n of missing) {
        const c = L.columns.find(x => x.name === n);
        if (!c || !c.type) { unknown.push(n); continue; }
        results.push(await createColumn(siteId, list, c));
      }
      if (unknown.length) {
        loud('column ' + list + '.' + unknown.join(','), list + ': column(s) ' + unknown.join(', ') + ' do not exist and are not in lib/sp-columns.js with a type, so they are not created: ' + msg);
        return null;
      }
      return results.length && results.every(r => r === 'ok') ? 'retry' : null;
    }
    return null;
  }

  async function graphFetch(path, options, raw) {
    options = options || {};
    if (raw) return rawFetch(path, options, raw);
    try { return await rawFetch(path, options, raw); }
    catch (e) {
      let what = null;
      try { what = await heal(path, options, e); } catch (x) { log.error(tag + 'heal failed: ' + (x && x.message || x)); }
      if (what === 'retry') return rawFetch(path, options, raw); /* una sola vez */
      if (what === 'empty') return { value: [] };
      throw e;
    }
  }

  return { graphFetch, heal, ensureList, _tried: tried, _reset: () => { tried.clear(); told.clear(); } };
}

module.exports = { createHealer, columnBody };
