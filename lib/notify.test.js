const notify = require('./notify');
const { shouldSend, pickRecipient, matchAddress, fmtDay } = notify;

function assert(name, cond) {
  if (cond) {
    console.log('OK   - ' + name);
  } else {
    console.error('FAIL - ' + name);
    process.exitCode = 1;
  }
}

// ---------- shouldSend ----------
{
  assert('cuenta sin ajustes (vacio) -> si manda Updates', shouldSend('updates', {}, {}) === true);
  assert('cuenta maestro No -> no manda Changes', shouldSend('changes', {}, { NotificationsEnabled: false }) === false);
  assert('Confirmations sale aunque todo este apagado',
    shouldSend('confirmations', { OrderNotificationsEnabled: 'No', OrderNotifyConfirmations: 'No' }, { NotificationsEnabled: false }) === true);
  assert('cuenta Updates No -> no manda Updates', shouldSend('updates', {}, { NotifyUpdates: false }) === false);
  assert('cuenta Updates No pero la orden dice Yes -> manda', shouldSend('updates', { OrderNotifyUpdates: 'Yes' }, { NotifyUpdates: false }) === true);
  assert('orden Updates No gana sobre cuenta Si', shouldSend('updates', { OrderNotifyUpdates: 'No' }, { NotifyUpdates: true }) === false);
  assert('orden hereda ("") -> usa la cuenta', shouldSend('changes', { OrderNotifyChanges: '' }, { NotifyChanges: false }) === false);
  assert('maestro de la orden No apaga Updates aunque la cuenta diga Si',
    shouldSend('updates', { OrderNotificationsEnabled: 'No' }, { NotificationsEnabled: true, NotifyUpdates: true }) === false);
  assert('maestro de la orden Yes prende aunque la cuenta tenga el maestro en No',
    shouldSend('updates', { OrderNotificationsEnabled: 'Yes' }, { NotificationsEnabled: false }) === true);
  assert('SharePoint "Yes" como texto en la cuenta', shouldSend('updates', {}, { NotificationsEnabled: 'Yes', NotifyUpdates: 'Yes' }) === true);
}

// ---------- pickRecipient ----------
const client = { ClientID: 'GS-1042', Contact: 'main@parkview.com', ClientName: 'Maria Lopez' };
const contacts = [
  { id: '11', Name: 'Leasing', ContactType: 'Email', Value: 'leasing@parkview.com', NotifyRecipient: false },
  { id: '12', Name: 'Maint', ContactType: 'Email', Value: 'maint@parkview.com', NotifyRecipient: true },
  { id: '13', Name: 'Cell', ContactType: 'Phone', Value: '515-555-0101', NotifyRecipient: false },
  { id: '14', Name: 'Old', ContactType: 'Email', Value: 'old@parkview.com', Archived: true }
];
const addresses = [
  { id: '1', Address: '1800 Grand Ave', BuildingNumber: '4', ContactId: '11' },
  { id: '2', Address: '1800 Grand Ave', BuildingNumber: '5', ContactId: '' },
  { id: '3', Address: '99 Elm St', BuildingNumber: '', ContactId: '14', Archived: false }
];
{
  const r = pickRecipient({ OrderContactId: '11' }, client, contacts, addresses);
  assert('contacto de la orden gana', r && r.email === 'leasing@parkview.com' && r.source === 'order');
}
{
  const r = pickRecipient({ Address: '1800 GRAND AVE.', BuildingNumber: '4' }, client, contacts, addresses);
  assert('contacto del edificio (direccion normalizada)', r && r.email === 'leasing@parkview.com' && r.source === 'building');
}
{
  const r = pickRecipient({ Address: '1800 Grand Ave', BuildingNumber: '5' }, client, contacts, addresses);
  assert('edificio sin contacto -> el marcado como receptor', r && r.email === 'maint@parkview.com' && r.source === 'recipient');
}
{
  const r = pickRecipient({ OrderContactId: '13' }, client, contacts, addresses);
  assert('contacto de tipo Phone se salta', r && r.email === 'maint@parkview.com');
}
{
  const r = pickRecipient({ Address: '99 Elm St' }, client, contacts, addresses);
  assert('contacto archivado del edificio se salta', r && r.email === 'maint@parkview.com');
}
{
  const r = pickRecipient({}, client, contacts.map(c => Object.assign({}, c, { NotifyRecipient: false })), []);
  assert('sin receptor marcado -> email principal', r && r.email === 'main@parkview.com' && r.source === 'account');
}
{
  const r = pickRecipient({ Email: 'orderer@x.com' }, { Contact: '' }, [], []);
  assert('sin nada en la cuenta -> email de la orden', r && r.email === 'orderer@x.com');
}
{
  const r = pickRecipient({}, { Contact: 'not an email' }, [], []);
  assert('sin ningun email -> null', r === null);
}
{
  const a = matchAddress({ Address: '1800 Grand Ave', BuildingNumber: '9' }, addresses);
  assert('edificio que no existe -> cae a una direccion igual', a && a.Address === '1800 Grand Ave');
}

// ---------- formato ----------
assert('fmtDay no se mueve por zona horaria', fmtDay('2026-09-30T12:00:00Z') === 'Wed, Sep 30, 2026');
assert('fmtDay con solo el dia', fmtDay('2026-10-02') === 'Fri, Oct 2, 2026');

// ---------- plantillas: escapan lo que escribe el usuario ----------
{
  const t = notify.OFFICE_TEMPLATES['contact-form']({ name: '<b>x</b>', email: 'a@b.co', message: '<script>alert(1)</script>' });
  assert('contact-form escapa HTML', t.html.indexOf('<script>alert') === -1 && t.html.indexOf('&lt;script&gt;') !== -1);
}
{
  const order = { OrderID: 'GS-1042-2609', ClientID: 'GS-1042', BusinessName: 'Parkview', Address: '1800 Grand Ave', DispatchDate: '2026-09-30T12:00:00Z', ServiceWindow: '8:00 AM - 11:00 AM' };
  for (const ev of Object.keys(notify.CLIENT_TEMPLATES)) {
    const t = notify.CLIENT_TEMPLATES[ev]({ order, services: [{ ServiceName: 'Move-out clean', Level: 'L2', Quantity: 2 }], diff: [{ label: 'Date', old: 'Tue, Sep 30, 2026', next: 'Thu, Oct 2, 2026' }], kind: 'cancel', approved: true, completedAt: '2026-10-02T18:47:00Z' });
    assert('plantilla ' + ev + ' arma asunto y html', !!t.subject && t.html.indexOf('GS-1042-2609') !== -1);
  }
  const t = notify.CLIENT_TEMPLATES.scheduled({ order });
  assert('scheduled trae fecha y ventana en el asunto', t.subject === 'Scheduled: GS-1042-2609 on Wed, Sep 30, 2026, 8:00 AM - 11:00 AM');
}

// ---------- modo off: no manda nada ni toca Graph ----------
(async () => {
  delete process.env.NOTIFY_MODE;
  let touched = false;
  const g = { graphFetch: async () => { touched = true; return {}; }, siteListPath: x => x, createListItem: async () => { touched = true; } };
  const r = await notify.notifyClient(g, { event: 'scheduled', orderId: 'X' });
  assert('NOTIFY_MODE sin definir = off, no toca Graph', r.sent === false && !touched);

  // modo test: desvia al correo de prueba y respeta preferencias
  process.env.NOTIFY_MODE = 'test';
  process.env.NOTIFY_TEST_TO = 'tester@gsocd.com';
  const sent = [];
  const g2 = {
    siteListPath: x => '/list/' + x,
    createListItem: async () => {},
    graphFetch: async (url, opts) => {
      if (url.indexOf('/sendMail') !== -1) { sent.push(JSON.parse(opts.body)); return null; }
      if (url.indexOf('/list/Orders') === 0) return { value: [{ id: '1', fields: { OrderID: 'GS-1-1', ClientID: 'GS-1', DispatchDate: '2026-09-30T12:00:00Z', ServiceWindow: '8:00 AM - 11:00 AM' } }] };
      if (url.indexOf('/list/Clients') === 0) return { value: [{ id: '2', fields: { ClientID: 'GS-1', Contact: 'real@client.com', NotifyUpdates: false } }] };
      return { value: [] };
    }
  };
  const r1 = await notify.notifyClient(g2, { event: 'scheduled', orderId: 'GS-1-1' });
  assert('Updates apagado en la cuenta -> no manda', r1.sent === false && sent.length === 0);
  const r2 = await notify.notifyClient(g2, { event: 'confirm', orderId: 'GS-1-1', diff: [] });
  const m = sent[0] && sent[0].message;
  assert('Confirmation sale y en modo test va al correo de prueba',
    r2.sent === true && m && m.toRecipients[0].emailAddress.address === 'tester@gsocd.com' && m.subject.indexOf('real@client.com') !== -1);

  assert('correo al cliente: Reply-To = orders@ (el grupo)', m && m.replyTo && m.replyTo[0].emailAddress.address === 'orders@gsocd.com');
  const r3 = await notify.notifyOffice(g2, { event: 'contact-form', name: 'Ana', email: 'ana@x.com', message: 'hi' });
  assert('aviso de oficina con replyTo', r3.sent === true && sent[1].message.replyTo[0].emailAddress.address === 'ana@x.com');

  const g3 = Object.assign({}, g2, { graphFetch: async () => { throw new Error('boom'); } });
  const r4 = await notify.notifyClient(g3, { event: 'scheduled', orderId: 'GS-1-1' });
  assert('si Graph falla, regresa el error sin tronar', r4.sent === false && r4.error === 'boom');
})();
