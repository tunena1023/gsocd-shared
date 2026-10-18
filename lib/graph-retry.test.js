'use strict';
const assert = require('assert');
const { fetchWithRetry } = require('./graph-retry');
const resp = (status, ra) => ({ status, headers: { get: k => (k === 'retry-after' && ra ? String(ra) : null) } });
(async () => {
  let waits = [], plan = [resp(429, 1), resp(429, 3), resp(200)];
  let r = await fetchWithRetry(async () => plan.shift(), { sleep: async ms => waits.push(ms) });
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(waits, [1000, 3000]);
  waits = []; plan = [resp(503), resp(503), resp(503), resp(503), resp(200)];
  r = await fetchWithRetry(async () => plan.shift(), { sleep: async ms => waits.push(ms) });
  assert.strictEqual(r.status, 503); assert.deepStrictEqual(waits, [2000, 4000, 8000]);
  waits = []; plan = [resp(429, 30), resp(429, 30), resp(429, 30), resp(429, 30)];
  r = await fetchWithRetry(async () => plan.shift(), { sleep: async ms => waits.push(ms) });
  assert.deepStrictEqual(waits, [8000, 8000]); /* tope de 20 s en total */
  waits = []; plan = [resp(404)];
  r = await fetchWithRetry(async () => plan.shift(), { sleep: async ms => waits.push(ms) });
  assert.strictEqual(r.status, 404); assert.deepStrictEqual(waits, []);
  console.log('graph-retry ok');
})().catch(e => { console.error(e); process.exit(1); });
