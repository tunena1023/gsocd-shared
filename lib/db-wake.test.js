/* lib/db-wake.js: la marca fuera de la base (drive de SharePoint falso). Correr: node lib/db-wake.test.js
   Caminos: apagado = siempre corre y no escribe; nunca ha corrido; hay trabajo / no hay; el minuto de espera y su
   margen; until; revision de seguridad (cambio de horario); Microsoft caido (502/503/504/429/timeout) al leer = corre;
   al escribir = no truena y el siguiente reintenta; carpeta que no existe; JSON roto; quiet(). */
'use strict';
const W = require('./db-wake');
const R = require('./sql-read');

let ok = 0, fail = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK  ', n); } else { fail++; console.log('FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 500) : ''); } };

/* Drive falso: files[path] = texto; down = status que contesta todo; hang = no contesta. */
const D = { files: {}, down: 0, hang: false, puts: 0, gets: 0, noFolder: false, uploads: 0 };
const resp = (status, text) => ({ status, ok: status >= 200 && status < 300, text: async () => text || '' });
const g = {
  getDriveId: async () => 'drv',
  rawGraphFetch: async (url, opts) => {
    if (D.hang) return new Promise(() => {});
    const m = /^\/drives\/drv\/root:\/(.+):\/content$/.exec(url);
    if (!m) return resp(400);
    const p = decodeURIComponent(m[1]);
    if (opts && opts.method === 'PUT') {
      D.puts++;
      if (D.down) return resp(D.down);
      if (D.noFolder) return resp(404);
      D.files[p] = String(opts.body);
      return resp(200, '{}');
    }
    D.gets++;
    if (D.down) return resp(D.down);
    return D.files[p] === undefined ? resp(404) : resp(200, D.files[p]);
  },
  uploadFile: async (folder, name, buf) => { D.uploads++; D.noFolder = false; D.files[folder + '/' + name] = String(buf); return {}; }
};
const reset = () => { D.files = {}; D.down = 0; D.hang = false; D.puts = 0; D.gets = 0; D.noFolder = false; D.uploads = 0; W._reset(); };

(async () => {
  /* ---- apagado ---- */
  delete process.env.DB_WAKE; reset();
  let d = await W.due(g, 'mail', { flags: ['mail-production'] });
  await W.touch(g, 'mail-production');
  await W.done(g, 'mail', Date.now(), {});
  check('apagado: due siempre corre, touch/done no escriben nada ni leen', d.run && D.puts === 0 && D.gets === 0, { d, D });

  process.env.DB_WAKE = 'on';
  /* ---- nunca ha corrido ---- */
  reset();
  d = await W.due(g, 'mail', { flags: ['mail-production'] });
  check('prendido, sin marcas: corre (primera vez)', d.run && d.why === 'first run', d);
  const t0 = Date.parse('2026-11-12T08:00:00Z');
  await W.done(g, 'mail', t0, { until: null });
  d = await W.due(g, 'mail', { flags: ['mail-production'], now: t0 + 5 * 60000 });
  check('sin trabajo: no corre (no toca la base)', !d.run && d.why === 'nothing to do', d);

  /* ---- hay trabajo ---- */
  const realNow = Date.now;
  Date.now = () => t0 + 6 * 60000;
  await W.touch(g, 'mail-production');
  d = await W.due(g, 'mail', { flags: ['mail-production'], now: t0 + 7 * 60000 });
  check('touch despues de la ultima vuelta: corre', d.run && /new work/.test(d.why), d);
  await W.done(g, 'mail', t0 + 7 * 60000, {});
  d = await W.due(g, 'mail', { flags: ['mail-production'], now: t0 + 12 * 60000 });
  check('ya se reviso: no corre', !d.run, d);

  /* ---- el minuto de espera: el segundo touch del minuto no escribe; el margen lo cubre ---- */
  Date.now = () => t0 + 20 * 60000;
  const w1 = await W.touch(g, 'mail-production');
  Date.now = () => t0 + 20 * 60000 + 30000;
  const w2 = await W.touch(g, 'mail-production');
  /* La vuelta empezo a los 20:10 (vio el de 20:00, no el de 20:30): el de 20:30 no escribio, pero el margen la vuelve a correr. */
  await W.done(g, 'mail', t0 + 20 * 60000 + 10000, {});
  d = await W.due(g, 'mail', { flags: ['mail-production'], now: t0 + 25 * 60000 });
  check('doble clic en el mismo minuto: una escritura, y la siguiente vuelta corre por el margen', w1 === true && w2 === false && d.run, { w1, w2, d });
  await W.done(g, 'mail', t0 + 25 * 60000, {});
  d = await W.due(g, 'mail', { flags: ['mail-production'], now: t0 + 30 * 60000 });
  check('pasado el margen: ya no corre', !d.run, d);
  const fw = await W.touch(g, 'keys', { force: true }) && await W.touch(g, 'keys', { force: true });
  check('force: escribe aunque sea el mismo minuto', fw === true);

  /* ---- until ---- */
  await W.done(g, 'mail', t0 + 30 * 60000, { until: t0 + 40 * 60000 });
  const a = await W.due(g, 'mail', { flags: ['mail-production'], now: t0 + 35 * 60000 });
  const b = await W.due(g, 'mail', { flags: ['mail-production'], now: t0 + 40 * 60000 });
  check('until: espera hasta que vence y entonces corre', !a.run && b.run && b.why === 'something is due', { a, b });

  /* ---- info de la vuelta (switches guardados) ---- */
  await W.done(g, 'arrivals', t0, { info: { switches: { client: false } } });
  d = await W.due(g, 'arrivals', { flags: ['saves'], now: t0 + 60000 });
  check('info: la ultima vuelta deja datos (los switches) para la siguiente', !d.run && d.done && d.done.info.switches.client === false, d);

  /* ---- revision de seguridad, con cambio de horario ---- */
  const s5 = W.safetyHourly(5);
  check('seguridad: 5:00 de Iowa en invierno (11:00 UTC) y en verano (10:00 UTC)',
    s5(new Date('2026-12-01T11:02:00Z')) && s5(new Date('2026-07-01T10:02:00Z')) && !s5(new Date('2026-12-01T10:02:00Z')) && !s5(new Date('2026-07-01T11:02:00Z')));
  check('seguridad: cada hora de trabajo, solo la primera vuelta; nada a las 2 am',
    s5(new Date('2026-12-01T15:00:00Z')) && !s5(new Date('2026-12-01T15:05:00Z')) && !s5(new Date('2026-12-01T08:00:00Z')) && W.safetyHourly(1)(new Date('2026-12-01T15:00:30Z')) && !W.safetyHourly(1)(new Date('2026-12-01T15:01:00Z')));
  await W.done(g, 'mail', Date.parse('2026-12-01T15:30:00Z'), {});
  d = await W.due(g, 'mail', { flags: ['mail-production'], now: Date.parse('2026-12-01T15:45:00Z'), safety: s5 });
  check('seguridad: a media hora, sin trabajo, no corre', !d.run, d);
  d = await W.due(g, 'mail', { flags: ['mail-production'], now: Date.parse('2026-12-01T16:01:00Z'), safety: s5 });
  check('seguridad: aunque la marca diga que no hay nada, a la hora en punto corre', d.run && d.why === 'safety check', d);

  /* ---- Microsoft caido: leer ---- */
  for (const st of [502, 503, 504, 429]) {
    D.down = st;
    d = await W.due(g, 'mail', { flags: ['mail-production'], now: t0 + 60000 });
    check('leer la marca con ' + st + ': corre (camino seguro)', d.run && d.why === 'flag not readable', d);
  }
  D.down = 0; D.hang = true;
  const tA = realNow();
  d = await W.due(g, 'mail', { flags: ['mail-production'], now: t0 + 60000 });
  check('leer la marca sin respuesta: a los 8 s corre (camino seguro)', d.run && d.why === 'flag not readable' && realNow() - tA < 9500, { d, ms: realNow() - tA });
  D.hang = false;
  D.files['App Data/DB wake/done-mail.json'] = '{roto';
  d = await W.due(g, 'mail', { flags: ['mail-production'], now: t0 + 60000 });
  check('marca rota (JSON): corre', d.run, d);

  /* ---- Microsoft caido: escribir ---- */
  reset(); Date.now = () => t0;
  D.down = 503;
  const tw = await W.touch(g, 'sp-outbox');
  const dw = await W.done(g, 'sp', t0, {});
  D.down = 0;
  const tw2 = await W.touch(g, 'sp-outbox');
  check('escribir con 503: no truena, regresa false, y el siguiente touch (mismo minuto) reintenta', tw === false && dw === false && tw2 === true, { tw, dw, tw2 });
  d = await W.due(g, 'sp', { flags: ['sp-outbox'], now: t0 + 60000 });
  check('done que no se guardo: la siguiente vuelta corre', d.run, d);

  /* ---- la carpeta no existe ---- */
  reset(); D.noFolder = true;
  await W.touch(g, 'saves');
  check('carpeta que no existe: la crea uploadFile y queda la marca', D.uploads === 1 && D.files['App Data/DB wake/flag-saves.json'] !== undefined, D);

  /* ---- quiet ---- */
  reset(); Date.now = () => t0 + 99 * 60000;
  const q = await R.context({}, () => W.quiet(['saves'], () => W.touch(g, 'saves')));
  const q2 = await W.quiet(['saves'], () => W.touch(g, 'keys'));
  check('quiet: lo que guarda el propio cron no lo vuelve a despertar; otras marcas si', q === false && q2 === true && !D.files['App Data/DB wake/flag-saves.json'], { q, q2 });

  /* ---- sin g ---- */
  check('sin graph: touch no truena', (await W.touch(null, 'x')) === false);
  Date.now = realNow;

  console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
