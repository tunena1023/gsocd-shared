/* ============================================================
   lib/split-fields.js -- propone donde va cada parte de un campo con dos cosas (CFO 21/10/2026: "que ponga la parte de
   mas en el lugar que le toca, para que no se pierda nada"). La usan Admin › Developer › Fields with two things (todos
   juntos) y, despues, el Fix de la pantalla de contactos (uno por uno). SOLO PROPONE: nunca escribe. La oficina confirma
   o cambia; lo que no entiende queda como 'unknown' (Needs a match) con su texto, sin adivinar.
   El mismo archivo en el navegador (window.GSSplitFields) y en el servidor (require).

   Cada propuesta: { parts: [...], summary } y cada parte:
     keep    -> el mismo renglon queda limpio: { name, role, email, phone } (solo lo que trae)
     person  -> un contacto nuevo: { name, role, email, phone, buildingIds, phoneNote }
     link    -> ya es un contacto (mismo telefono o correo): { linkId, linkName, buildingIds }
     unknown -> Needs a match: { text, why }
   ctx = { contacts:[{id,name,type,value,phone,archived}], primaryName, buildings:[{id,label}], buildingId }
============================================================ */
(function (root) {
  'use strict';
  const F = typeof module === 'object' && module.exports ? require('./fields') : root.GSFields;
  const digits = v => String(v || '').replace(/\D/g, '');
  const fmt = d => (d = digits(d)).length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : String(d || '');
  const PHONE_RE = /\+?\(?\d[\d().\s-]{5,}\d/g;
  const LABEL_RE = /^(office|cell|mobile|work|home|main|fax|lease|leasing|desk|direct|phone|tel)\b/i;
  const NAME_OK = n => !!n && !F.personName(n);
  const phoneOf = c => c.phone || (c.type === 'Phone' ? c.value : '');
  const emailOf = c => c.type === 'Phone' ? '' : String(c.value || '').trim();

  /* "Customer contact- Megan 515-412-4020 Cintas contact- Sarah 815-573-3768" -> [{ label, name, phone, text }] */
  function pieces(text) {
    const t = String(text || ''); const out = []; let last = 0, m;
    PHONE_RE.lastIndex = 0;
    while ((m = PHONE_RE.exec(t))) {
      if (digits(m[0]).length < 7) continue;
      const before = t.slice(last, m.index).trim().replace(/^[,;·|]+|[,;·|:]+$/g, '').trim();
      const lm = /^(.*?)\s*[-:]\s*(.*)$/.exec(before);
      let label = '', name = '';
      if (lm && lm[1]) { label = lm[1].trim(); name = lm[2].trim(); }
      else if (before) { if (LABEL_RE.test(before)) label = before; else name = before; }
      if (name && LABEL_RE.test(name) && !label) { label = name; name = ''; }
      out.push({ label, name, phone: digits(m[0]), text: (before ? before + ' ' : '') + m[0].trim() });
      last = m.index + m[0].length;
    }
    return out;
  }
  const live = ctx => (ctx.contacts || []).filter(c => !c.archived);
  const byPhone = (ctx, d, notId) => d.length === 10 ? live(ctx).find(c => String(c.id) !== String(notId) && c.type !== 'Phone' && digits(phoneOf(c)).slice(-10) === d) : null;
  const byEmail = (ctx, e, notId) => e ? live(ctx).find(c => String(c.id) !== String(notId) && emailOf(c).toLowerCase() === String(e).toLowerCase()) : null;
  const buildingOf = (ctx, c) => {
    const b = (ctx.buildings || []).find(x => String(x.label).trim().toLowerCase() === String(c.name || '').trim().toLowerCase());
    return b ? [String(b.id)] : (ctx.buildingId ? [String(ctx.buildingId)] : []);
  };
  /* Varias personas en un nombre: "Megan & Sarah", "Megan / Sarah", "Steven or Jordan". */
  const namesIn = n => String(n || '').split(/\s*(?:&|\/|\+|,|;|\band\b|\bor\b|\by\b)\s*/i).map(x => x.trim()).filter(Boolean);
  function summary(parts) {
    return parts.map(p => p.kind === 'keep' ? 'keep ' + [p.name && 'name "' + p.name + '"', p.role && 'role "' + p.role + '"', p.email, p.phone && fmt(p.phone)].filter(Boolean).join(', ')
      : p.kind === 'person' ? 'new contact ' + p.name + (p.role ? ' (' + p.role + ')' : '') + (p.phone ? ' ' + fmt(p.phone) : '') + (p.email ? ' ' + p.email : '')
      : p.kind === 'link' ? 'same person: ' + p.linkName : 'needs a match: "' + p.text + '"').join(' · ');
  }
  const done = parts => ({ parts, summary: summary(parts), ready: parts.every(p => p.kind !== 'unknown') });

  /* Un contacto mal puesto. */
  function proposeContact(c, ctx) {
    const parts = [];
    /* Viejo tipo 'Phone' ("Add building" con su campo Phone): cada pedazo con persona y 10 digitos es una persona; si ya
       existe (mismo telefono) se liga. Quedan en el edificio del nombre viejo. El renglon viejo se archiva al aplicar. */
    if (c.type === 'Phone') {
      const bIds = buildingOf(ctx, c);
      const ps = pieces(c.value);
      if (!ps.length) parts.push({ kind: 'unknown', text: String(c.value || ''), why: 'No phone number in it' });
      ps.forEach(p => {
        const ex = p.phone.length === 10 ? byPhone(ctx, p.phone, c.id) : null;
        if (ex) parts.push({ kind: 'link', linkId: String(ex.id), linkName: ex.name, buildingIds: bIds, text: p.text, why: 'Same phone as ' + ex.name });
        else if (p.phone.length === 10 && NAME_OK(p.name)) parts.push({ kind: 'person', name: p.name, role: p.label, phone: p.phone, email: '', buildingIds: bIds, text: p.text });
        else parts.push({ kind: 'unknown', text: p.text, why: !p.name ? 'No person' : !NAME_OK(p.name) ? 'More than one person' : 'Phone is not 10 digits' });
      });
      return done(parts);
    }
    /* Contacto normal: el mismo renglon queda limpio con la primera parte de cada campo; lo demas, aparte. */
    const keep = {};
    const name = String(c.name || '').trim();
    const job = /^(.+?)\s*-\s+(.+)$/.exec(name) || /^(.+?)\s+-\s*(.+)$/.exec(name);
    if (F.personName(name)) {
      if (job && NAME_OK(job[1].trim())) { keep.name = job[1].trim(); keep.role = job[2].trim(); }
      else {
        const ns = namesIn(name);
        if (ns.length > 1 && ns.every(NAME_OK)) { keep.name = ns[0]; ns.slice(1).forEach(n => parts.push({ kind: 'unknown', text: n, why: 'Another person in the name: their own email and phone?' })); }
        else parts.push({ kind: 'unknown', text: name, why: 'Name has more than a person in it' });
      }
    }
    const em = emailOf(c);
    if (em && F.email(em)) {
      const list = F.emailsIn(em);
      if (list.length) { keep.email = list[0]; list.slice(1).forEach(e => { const ex = byEmail(ctx, e, c.id); parts.push(ex ? { kind: 'link', linkId: String(ex.id), linkName: ex.name, buildingIds: [], text: e, why: 'Same email as ' + ex.name } : { kind: 'unknown', text: e, why: 'Another email: whose is it?' }); }); }
      else parts.push({ kind: 'unknown', text: em, why: 'Not a valid email' });
    }
    const ph = phoneOf(c);
    if (ph && digits(ph).length !== 10) {
      const ps = pieces(ph);
      if (ps.length && ps[0].phone.length === 10) {
        keep.phone = ps[0].phone;
        ps.slice(1).forEach(p => { const ex = byPhone(ctx, p.phone, c.id); parts.push(ex ? { kind: 'link', linkId: String(ex.id), linkName: ex.name, buildingIds: [], text: p.text, why: 'Same phone as ' + ex.name }
          : p.phone.length === 10 && NAME_OK(p.name) ? { kind: 'person', name: p.name, role: p.label, phone: p.phone, email: '', buildingIds: [], text: p.text } : { kind: 'unknown', text: p.text, why: 'Another phone: whose is it?' }); });
      } else parts.push({ kind: 'unknown', text: ph, why: 'Phone is not 10 digits' });
    }
    if (Object.keys(keep).length) parts.unshift(Object.assign({ kind: 'keep' }, keep));
    return done(parts);
  }

  /* Un campo del cliente (Clients): Phone, Contact (correo) o ClientName (persona). El primero se queda en su campo. */
  function proposeClient(field, text, ctx) {
    const parts = [];
    if (field === 'Phone') {
      const ps = pieces(text);
      if (!ps.length) return done([{ kind: 'unknown', text: String(text || ''), why: 'No phone number in it' }]);
      ps.forEach((p, i) => {
        if (p.phone.length !== 10) { parts.push({ kind: 'unknown', text: p.text, why: 'Phone is not 10 digits' }); return; }
        if (i === 0) { parts.push({ kind: 'keep', phone: p.phone, text: p.text }); return; }
        const ex = byPhone(ctx, p.phone);
        if (ex) { parts.push({ kind: 'link', linkId: String(ex.id), linkName: ex.name, buildingIds: [], text: p.text, why: 'Same phone as ' + ex.name }); return; }
        /* "Cell"/"Office" no es un puesto: queda solo en el historial (con el texto original). */
        const who = NAME_OK(p.name) ? p.name : (p.label && ctx.primaryName && NAME_OK(ctx.primaryName) ? ctx.primaryName : '');
        if (who) parts.push({ kind: 'person', name: who, role: '', email: '', phone: p.phone, phoneNote: p.label, buildingIds: [], text: p.text, why: p.name ? '' : 'the main contact; "' + p.label + '" stays in the history' });
        else parts.push({ kind: 'unknown', text: p.text, why: 'Doesn\'t say whose phone it is' });
      });
      return done(parts);
    }
    if (field === 'Contact') {
      const list = F.emailsIn(text);
      if (!list.length) return done([{ kind: 'unknown', text: String(text || ''), why: 'Not a valid email' }]);
      parts.push({ kind: 'keep', email: list[0], text: list[0] });
      list.slice(1).forEach(e => { const ex = byEmail(ctx, e); parts.push(ex ? { kind: 'link', linkId: String(ex.id), linkName: ex.name, buildingIds: [], text: e, why: 'Same email as ' + ex.name } : { kind: 'unknown', text: e, why: 'Another email: whose is it?' }); });
      return done(parts);
    }
    /* ClientName */
    const ns = namesIn(text);
    if (ns.length > 1 && ns.every(NAME_OK)) { parts.push({ kind: 'keep', name: ns[0], text: ns[0] }); ns.slice(1).forEach(n => parts.push({ kind: 'unknown', text: n, why: 'Another person: their own email and phone?' })); }
    else parts.push({ kind: 'unknown', text: String(text || ''), why: 'Not one person\'s name' });
    return done(parts);
  }
  const api = { pieces, proposeContact, proposeClient, fmt, namesIn };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GSSplitFields = api;
})(typeof window !== 'undefined' ? window : null);
