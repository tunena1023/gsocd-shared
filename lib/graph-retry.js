/* gsocd-shared (17/10/2026, dueño: "lo compartido va en gsocd-shared, sin copias"): el reintento de las llamadas a
   SharePoint/Graph cuando contesta "throttled" (429) o "no disponible" (503). Antes cada portal tenia su copia en su
   lib/graph.js con 1.2 s y 2.4 s fijos, que casi siempre volvian a chocar. Ahora se espera lo que SharePoint pide
   (Retry-After, en segundos), maximo 8 s por espera y 20 s en total para que la funcion no se pase de su tiempo;
   sin Retry-After, 2 s, 4 s y 8 s.

   Uso (lib/graph.js de cada portal):
     const { fetchWithRetry } = require('gsocd-shared/lib/graph-retry');
     const res = await fetchWithRetry(() => fetch(url, opts));
*/
'use strict';

const MAX_WAIT = 8000, MAX_TOTAL = 20000, TRIES = 4;

function waitFor(res, attempt) {
  const ra = Number((res && res.headers && typeof res.headers.get === 'function' && res.headers.get('retry-after')) || 0);
  return Math.min(MAX_WAIT, ra > 0 ? ra * 1000 : 2000 * Math.pow(2, attempt));
}

async function fetchWithRetry(doFetch, opts) {
  const sleep = (opts && opts.sleep) || (ms => new Promise(r => setTimeout(r, ms)));
  let res, waited = 0;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    res = await doFetch();
    if (res.status !== 429 && res.status !== 503) break;
    if (attempt === TRIES - 1) break;
    const wait = waitFor(res, attempt);
    if (waited + wait > MAX_TOTAL) break;
    waited += wait;
    await sleep(wait);
  }
  return res;
}

module.exports = { fetchWithRetry, waitFor };
