/* node lib/action-key.test.js */
'use strict';
const ak = require('./action-key');
let ok = 0, fail = 0;
const assert = (n, c) => { if (c) { ok++; console.log('OK   - ' + n); } else { fail++; console.log('FAIL - ' + n); } };
(async () => {
  const f = {};
  const K = 'a1b2c3d4-e5f6-7788-9900-aabbccddeeff';
  assert('llave nueva: no vista', !ak.seen(f, K));
  let patched = null;
  assert('stamp guarda la llave', await ak.stamp(p => { patched = p; return Promise.resolve(); }, f, K) && JSON.parse(patched.ActionKeys).includes(K));
  assert('la misma llave ya se vio (no se repite)', ak.seen(f, K) && ak.duplicate().duplicate === true);
  assert('una llave rara no cuenta', !ak.seen({ ActionKeys: '["x"]' }, 'x') && ak.clean('<script>') === '');
  for (let i = 0; i < 40; i++) await ak.stamp(() => Promise.resolve(), f, 'key-number-' + i);
  assert('solo guarda las ultimas ' + ak.MAX, ak.keysOf(f).length === ak.MAX && !ak.seen(f, K) && ak.seen(f, 'key-number-39'));
  assert('sin la columna (PATCH falla): no truena', (await ak.stamp(() => Promise.reject(new Error('Field not found')), {}, K)) === false);
  assert('ActionKeys basura: lista vacia', ak.keysOf({ ActionKeys: '{bad' }).length === 0);
  console.log(ok + ' OK, ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
})();
