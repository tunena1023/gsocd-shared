/* ============================================================
   gsocd-shared/lib/sp-catalog.js -- EL catalogo de listas, columnas e
   indices de SharePoint que usan los 3 portales (es el mismo sitio).
   Antes vivia en Admin lib/sp-columns.js y Tech tenia una copia de
   algunos renglones; ahora los dos lo leen de aqui.

   - lib/graph-core (sp-heal) crea lo que falta la primera vez que se
     necesita (Admin y Tech).
   - Admin lib/sp-columns.js: check()/fix()/nightly() (cron-backup-config)
     comparan esto contra las listas reales cada noche.
   Una columna nueva que use el codigo se agrega AQUI, en el mismo cambio
   (y el SHA de shared sube en los portales). Columna sin `type` = solo
   se revisa (ya existe; si faltara, se avisa pero no se adivina su tipo).
   Tipos: 'text' (una linea), 'note' (varias lineas), 'number', 'boolean' (Si/No).
   createList: la lista se crea sola si no existe. indexed: lleva indice
   (lo que se usa en $filter).
============================================================ */
'use strict';

const IDX = { indexed: true };
const SPEC = [
  { list: 'Orders', columns: [
    Object.assign({ name: 'Status' }, IDX), Object.assign({ name: 'ClientID' }, IDX), Object.assign({ name: 'OrderID' }, IDX),
    Object.assign({ name: 'Division' }, IDX), Object.assign({ name: 'BatchId' }, IDX), Object.assign({ name: 'DispatchDate' }, IDX),
    Object.assign({ name: 'CompletedDate' }, IDX), Object.assign({ name: 'VisitConfirmStatus' }, IDX),
    { name: 'RecurringServiceID', indexed: true, why: 'The monthly recurring report filters by it.' },
    { name: 'SubmitKey', type: 'text', indexed: true, why: 'So a retried Submit never creates the order twice.' },
    { name: 'ActionKeys', type: 'note', why: 'So an action the app retries in the background (Update, Done, Unit ready...) never happens twice.' },
    { name: 'InternalNotes', type: 'note', why: 'Office notes for supervisors (never shown to the client).' },
    { name: 'CustomerPO', type: 'text', why: "The client's own PO number." },
    { name: 'DelayedUntil', type: 'text', why: 'Active › Delayed: marks that the order waits for a new day after its due date (no maximum since 21/10). Office only.' },
    { name: 'DelayedNote', type: 'note', why: 'Active › Delayed: why it goes after the due date. Office only.' },
    { name: 'DelayedBy', type: 'text', why: 'Active › Delayed: who sent it back to Scheduling (goes to the history when it is assigned again).' },
    { name: 'KitStatus', type: 'text', why: 'Warehouse › Kits: the supplies kit of the unit (To pack, Packed, In closet, Picked up).' },
    { name: 'KitLog', type: 'note', why: 'Warehouse › Kits: who packed, dropped off and picked up the kit, and when.' },
    { name: 'KitItems', type: 'note', why: 'Warehouse › Kits › Create: what the kit of the unit really carries (empty = what Supplies per service says).' },
    { name: 'InspectionContractID', type: 'text', why: 'Recurring contract › Send to inspection (20/10/2026): the contract this inspection is for. It closes as Completed, never in Scheduling.' },
    { name: 'InspectionFloors', type: 'note', why: 'Recurring contract › Send to inspection (20/10/2026): what was signed, floor by floor, for the supervisor to check in Tech.' },
    { name: 'SentToOrderID', type: 'text', why: 'Developer › Internal inspections › Send to a client (30/10/2026): on the internal inspection (GS-1012), the order it was sent to in the client account.' },
    { name: 'InspectionFromOrderID', type: 'text', why: 'Developer › Internal inspections › Send to a client (30/10/2026): on the client copy, the internal inspection it came from. It is an inspection: not billed, no Completed email.' },
    { name: 'HiddenFromClient', type: 'boolean', why: 'Yes = the client does not see this order (portal and emails). Set on a contract inspection sent while the contract was not published (20/10/2026).' },
    { name: 'OutlookEvents', type: 'note', why: 'Schedule › Calendar › Send to Outlook (21/10/2026): the Outlook events of this order in its division calendar, so nothing is sent twice and a reschedule or cancel moves or removes them.' },
    { name: 'TechMarkedComplete', type: 'boolean', why: 'Yes = the tech marked the whole order as done in Tech (Completed shows "✓ (tech marked done)"; reopen clears it). Empty = not marked.' }
  ] },
  { list: 'OrderServices', columns: [Object.assign({ name: 'OrderID' }, IDX),
    { name: 'UnitPrice', type: 'number', why: 'Past jobs imported from a spreadsheet keep the price charged to that client (QuickBooks › Import past jobs). A recurring visit extra keeps its catalog price.' },
    { name: 'IsExtra', type: 'boolean', why: 'Correct this visit: a service the client asked for on top of the contract; it goes as its own line on the month estimate.' }] },
  { list: 'OrderHistory', columns: [Object.assign({ name: 'OrderID' }, IDX)] },
  { list: 'OrderSeenBy', columns: [
    { name: 'OrderID', indexed: true, why: 'Who saw each order and the job-alert checks (sent, delivered, opened) are read by order.' },
    { name: 'ViewerId', indexed: true, why: 'Marking an order as seen looks up that person\'s row.' }
  ] },
  { list: 'Scheduling', columns: [Object.assign({ name: 'OrderID' }, IDX), Object.assign({ name: 'PayrollNumber' }, IDX),
    { name: 'AssignedDate', indexed: true, why: 'Schedule (Review, Hours, Assigned) reads only recent days instead of the whole list.' }] },
  { list: 'WeeklyHours', columns: [{ name: 'Date', indexed: true, why: 'Hours reads only this week and last week instead of the whole list.' }] },
  { list: 'ServiceAssignments', columns: [
    { name: 'OrderID', indexed: true, why: 'Saving a schedule by service reads it; without the index it can time out.' },
    Object.assign({ name: 'ScheduledDate' }, IDX)
  ] },
  { list: 'RecurringAssignments', columns: [Object.assign({ name: 'PayrollNumber' }, IDX)] },
  { list: 'RecurringServices', columns: [
    { name: 'ClientID', indexed: true, why: 'The client portal reads the contracts of a client (and of every property of a master account) by it (18/10/2026).' },
    { name: 'Published', type: 'boolean', why: 'A recurring contract the client cannot see yet (no portal, no emails) until the office clicks Publish (11/10/2026).' },
    { name: 'OfficeNote', type: 'note', why: 'Office-only note on a recurring contract: what QuickBooks charges and what is left to check (never shown to the client).' },
    { name: 'ExpectedMinutes', type: 'number', why: 'How long each visit of a recurring contract should take, set by hand (11/10/2026); it is the estimated time of its visits.' },
    { name: 'MonthOverrides', type: 'note', why: 'Months of a recurring contract with their own days, time, people or services (11/10/2026); the other months follow the contract.' },
    { name: 'SignedHours', type: 'number', why: 'Hours per week signed in a recurring contract, to compare with the hours of its floors (20/10/2026). Empty = no comparison.' },
    { name: 'InspectionOrderID', type: 'text', why: 'Recurring contract › Send to inspection (20/10/2026): the last inspection order sent for this contract.' }
  ] },
  { list: 'RecurringLog', columns: [Object.assign({ name: 'RecurringServiceID' }, IDX),
    { name: 'Status', indexed: true, why: 'Recurring "pending review" reads only pending visits instead of every visit ever.' },
    { name: 'VisitDate', type: 'text', why: 'The day of the recurring visit (YYYY-MM-DD).' },
    { name: 'Source', type: 'text', why: 'Who logged the visit: Office, Field or Client.' },
    { name: 'LoggedBy', type: 'text', why: 'The name of who logged the visit.' },
    { name: 'PeopleJSON', type: 'note', why: 'Who went to the visit (JSON).' },
    { name: 'ServicesJSON', type: 'note', why: 'What was done at the visit when it is not exactly the contract (JSON; empty = the contract).' },
    { name: 'Notes', type: 'note', why: 'Notes of the visit or of the client change request.' },
    { name: 'ReviewedBy', type: 'text', why: 'Who approved, rejected or sent back the visit.' },
    { name: 'ReviewedDate', type: 'text', why: 'When the visit was reviewed (ISO).' },
    { name: 'ReviewNotes', type: 'note', why: 'Why the visit was rejected or sent back.' }] },
  { list: 'Clients', columns: [
    Object.assign({ name: 'ClientID' }, IDX),
    { name: 'LoginFailCount', type: 'number', why: 'Locks the client sign-in for 1 hour after 5 wrong tries.' },
    { name: 'LoginLockedUntil', type: 'text', why: 'Locks the client sign-in for 1 hour after 5 wrong tries.' },
    { name: 'IsMaster', type: 'boolean', why: 'Master ID: a sign-in-only account that sees several properties (no orders, not in QuickBooks).' },
    { name: 'MasterClientID', type: 'text', indexed: true, why: 'Master ID: which master account a property belongs to (the portal filters by it).' },
    { name: 'MasterInvite', type: 'note', why: 'Master ID: the set-up invitation (one-time link and 6-digit code, stored hashed).' },
    { name: 'MasterSetupAt', type: 'text', why: 'Master ID: when the manager set up the master account (nobody signs in before).' },
    { name: 'NotifyPrimary', type: 'boolean', why: 'The main account email also gets the client emails, together with the other contacts checked (13/10/2026: several people per account, building and order).' },
    { name: 'Closet', type: 'note', why: 'Warehouse: the supplies closet of the main address (where, keys, supervisor, status).' },
    { name: 'MonOpen', type: 'boolean', why: 'Office hours of the main address: the building office is open on Monday (Clients › Edit, client portal profile).' },
    { name: 'TueOpen', type: 'boolean', why: 'Office hours of the main address: the building office is open on Tuesday (Clients › Edit, client portal profile).' },
    { name: 'WedOpen', type: 'boolean', why: 'Office hours of the main address: the building office is open on Wednesday (Clients › Edit, client portal profile).' },
    { name: 'ThuOpen', type: 'boolean', why: 'Office hours of the main address: the building office is open on Thursday (Clients › Edit, client portal profile).' },
    { name: 'FriOpen', type: 'boolean', why: 'Office hours of the main address: the building office is open on Friday (Clients › Edit, client portal profile).' },
    { name: 'SatOpen', type: 'boolean', why: 'Office hours of the main address: the building office is open on Saturday (Clients › Edit, client portal profile).' },
    { name: 'SunOpen', type: 'boolean', why: 'Office hours of the main address: the building office is open on Sunday (Clients › Edit, client portal profile).' },
    { name: 'OfficeHours', type: 'text', why: 'Office hours of the main address, e.g. 9:00 AM - 5:00 PM (Clients › Edit, client portal profile).' },
    { name: 'Latitude', type: 'number', why: 'Where the main address is on the map (Routing); looked up again when the address changes.' },
    { name: 'Longitude', type: 'number', why: 'Where the main address is on the map (Routing); looked up again when the address changes.' },
    { name: 'SelfRegistered', type: 'boolean', why: 'Yes = the client signed up in the portal by itself; Admin shows it in QuickBooks › New clients.' },
    { name: 'UsualPackages', type: 'note', why: 'The packages this client usually orders (JSON), offered first in the order form.' }
  ] },
  /* Developer › Contacts (Excel): el puesto que venia en el nombre ("Sarah Krieger- Service Mgr")
     y los edificios de una persona que salia del contacto viejo de un edificio. */
  { list: 'ClientContacts', columns: [
    { name: 'Role', type: 'text', why: 'The job of a contact (e.g. Service Manager), so it is not written inside the name.' },
    { name: 'BuildingIds', type: 'note', why: 'Which buildings a contact belongs to (ClientAddresses ids, comma separated). Empty = the whole account.' }
  ] },
  { list: 'ClientAddresses', columns: [
    { name: 'Closet', type: 'note', why: 'Warehouse: the supplies closet of each building (where, keys, supervisor, status).' }
  ] },
  { list: 'Techs', columns: [
    { name: 'LoginFailCount', type: 'number', why: 'Locks the tech sign-in for 1 hour after 5 wrong tries.' },
    { name: 'LoginLockedUntil', type: 'text', why: 'Locks the tech sign-in for 1 hour after 5 wrong tries.' },
    { name: 'Language', type: 'text', why: "The tech's language in the Tech app (en / es), so it opens in it next time." }
  ] },
  { list: 'Drafts', columns: [{ name: 'CustomerPO', type: 'text', why: "Client drafts save the client's PO." }] },
  /* OrderID es la columna Title renombrada (nombre interno 'Title'). */
  { list: 'OrderDocuments', columns: [Object.assign({ name: 'Title', label: 'OrderID' }, IDX), Object.assign({ name: 'ClientID' }, IDX)] },
  { list: 'PushSubscriptions', columns: [Object.assign({ name: 'PayrollID' }, IDX)] },
  { list: 'ServicesCatalog', columns: [Object.assign({ name: 'SKU' }, IDX),
    { name: 'KitItems', type: 'note', why: 'Warehouse › Kits: what goes in the supplies kit of this service, by number of bedrooms.' },
    { name: 'ServiceNameES', type: 'text', why: 'The service name in Spanish for the Tech app (translated once and saved here).' }] },
  /* Source = 'gallery' | 'computer' (no se tomo con la camara de la app) y TakenAt = la fecha del archivo
     (para reportes; lib/photo-log.js de gsocd-shared). */
  /* Title = OrderID indexado: llegadas y Time on site leen la primera foto de cada persona por orden. */
  { list: 'TechPhotoLog', columns: [Object.assign({ name: 'FileName' }, IDX), Object.assign({ name: 'Title', label: 'OrderID' }, IDX), { name: 'Source', type: 'text', why: 'Photo not taken with the app camera: gallery (phone) or computer.' },
    { name: 'TakenAt', type: 'text', why: 'Date of the photo file, for photos uploaded from the gallery or the computer.' }] },
  { list: 'NotificationLog', columns: [Object.assign({ name: 'OrderID' }, IDX), Object.assign({ name: 'Event' }, IDX)] },
  /* createList: si la lista no existe, "Create missing" la crea con sus columnas. */
  /* Formulario de contacto del portal del cliente (Orders submit-contact.js): cada mensaje queda
     registrado, no solo en el correo. Title = nombre de quien escribe. */
  { list: 'ContactMessages', createList: true, columns: [
    { name: 'Email', type: 'text', why: 'Contact form of the client portal: who wrote (the email also goes to the office).' },
    { name: 'Message', type: 'note', why: 'Contact form of the client portal: what they wrote.' }
  ] },
  /* Warehouse › Inventory (plan material en sitio, fase 3): un renglon por articulo; Title = nombre. */
  { list: 'SupplyItems', createList: true, columns: [
    { name: 'Unit', type: 'text', why: 'Warehouse › Inventory: how the item is counted (bag, gallon, box, piece).' },
    { name: 'OnHand', type: 'number', why: 'Warehouse › Inventory: how many are in the warehouse now.' },
    { name: 'KeepAtLeast', type: 'number', why: 'Warehouse › Inventory: buy more below this.' },
    { name: 'ClosetKeep', type: 'number', why: 'Warehouse › Inventory: what each closet should have (below it goes to To restock).' },
    { name: 'Active', type: 'boolean', why: 'Warehouse › Inventory: items no longer used stay for the history.' },
    { name: 'Moves', type: 'note', why: 'Warehouse › Inventory: the last moves (received, packed in kits, sent to a closet, counts).' },
    { name: 'Category', type: 'text', why: 'Warehouse › Inventory: the tab of the item (Janitorial, Renovations, Equipment).' },
    { name: 'Variants', type: 'note', why: 'Developer › Supply item types: the types counted inside the item (Rags: Green, Blue...; Cleaner: Bleach, Windex...).' },
    { name: 'Code', type: 'text', why: 'Warehouse › Inventory: the ID of the item (J-001, R-001, E-001).' },
    { name: 'Photo', type: 'text', why: 'Warehouse › Inventory: the photo of the item (Warehouse/Items in SharePoint).' },
    { name: 'Cases', type: 'text', why: 'Warehouse › Inventory: unopened cases or boxes (e.g. "4 boxes").' },
    { name: 'Boxes', type: 'note', why: 'Warehouse › Inventory: unopened boxes, one row each (type, how many boxes, how many come in each, presentation and size).' },
    { name: 'Section', type: 'text', why: 'Warehouse › Inventory: the group inside the tab (Cleaning chemicals, Carpet chemicals...).' },
    { name: 'Supplier', type: 'text', why: 'Warehouse › Inventory: where it is bought (Amazon, Capsan, Menards...).' },
    { name: 'Notes', type: 'note', why: 'Warehouse › Inventory: notes of the item (last restocked, where it went...).' },
    { name: 'Tracked', type: 'boolean', why: 'Warehouse › Inventory › Equipment: each piece has its own Asset ID (machines and power tools; empty = the app proposes it in Needs a match).' }
  ] },
  /* Warehouse › Inventory: historial completo de cada artículo (como OrderHistory): un renglón por cambio,
     nunca se borra ni se recorta (SupplyItems.Moves solo guarda los últimos 30). Title = nombre del artículo. */
  { list: 'SupplyItemHistory', createList: true, columns: [
    { name: 'ItemID', type: 'text', indexed: true, why: 'Warehouse › Inventory › Last changes: the item (SupplyItems id); the panel reads it by this.' },
    { name: 'ChangeType', type: 'text', why: 'Warehouse › Inventory › Last changes: what happened (received 24, count: 20, packed in kit..., archived, note changed).' },
    { name: 'OldValue', type: 'note', why: 'Warehouse › Inventory › Last changes: the value before (for note changes).' },
    { name: 'NewValue', type: 'note', why: 'Warehouse › Inventory › Last changes: the value after (for note changes).' },
    { name: 'Qty', type: 'number', why: 'Warehouse › Inventory › Last changes: how many came in (+) or went out (-).' },
    { name: 'Note', type: 'note', why: 'Warehouse › Inventory › Last changes: the note written with it (e.g. what happens with the pieces of an archived item).' },
    { name: 'ChangedBy', type: 'text', why: 'Warehouse › Inventory › Last changes: who did it.' },
    { name: 'ChangedByName', type: 'text', why: 'Warehouse › Inventory › Last changes: the name of who did it, saved when it was written (CFO 21/10: never the email).' },
    { name: 'ChangeDate', type: 'text', indexed: true, why: 'Warehouse › Inventory › Last changes: when (ISO). Warehouse › Reports › Moves reads only its period by this.' },
    { name: 'Key', type: 'text', why: 'Warehouse › Inventory › Last changes: ItemID|when|what, so the one-time copy of Moves never duplicates.' },
    { name: 'AssetID', type: 'text', indexed: true, why: 'Warehouse › Inventory › Equipment: the piece (E-014-02) the change is about; its history reads it by this.' }
  ] },
  /* Warehouse › Inventory › Equipment con Asset ID: un renglón por pieza (máquina o herramienta eléctrica).
     Sale con una persona para sus órdenes de un día; Title = AssetID. */
  { list: 'EquipmentPieces', createList: true, columns: [
    { name: 'AssetID', type: 'text', indexed: true, why: 'Warehouse › Equipment: the Asset ID of the piece (item code + number, E-014-02).' },
    { name: 'ItemID', type: 'text', indexed: true, why: 'Warehouse › Equipment: the item it belongs to (SupplyItems id).' },
    { name: 'Status', type: 'text', why: 'Warehouse › Equipment: In, Out, Red tag or Retired.' },
    { name: 'Home', type: 'text', why: 'Warehouse › Equipment: where it lives (empty = Warehouse, or the Vehicles id of the truck).' },
    { name: 'With', type: 'text', indexed: true, why: 'Warehouse › Equipment: who has it (Techs id) while it is out.' },
    { name: 'ForOrders', type: 'note', why: 'Warehouse › Equipment: the orders of that day it goes out for (JSON list of OrderIDs).' },
    { name: 'Day', type: 'text', indexed: true, why: 'Warehouse › Equipment: the day of those orders (YYYY-MM-DD).' },
    { name: 'Since', type: 'text', why: 'Warehouse › Equipment: since when it is in its current state (ISO).' },
    { name: 'ReturnBy', type: 'text', why: 'Warehouse › Equipment: the day it should be back (the day of its orders).' },
    { name: 'Condition', type: 'text', why: 'Warehouse › Equipment: Good, Fair, Worn, Needs cleaning or Damaged.' },
    { name: 'Note', type: 'note', why: 'Warehouse › Equipment: what is wrong (Red tag) or why it was retired.' },
    { name: 'Serial', type: 'text', why: 'Warehouse › Equipment: the serial number, if it has one.' }
  ] },
  /* Warehouse › Reports: los reportes que la gente guarda con su nombre. Title = el nombre.
     Cada uno sale de un reporte ya hecho (Source) con sus columnas, filtros, grupo y orden. */
  { list: 'SavedReports', createList: true, columns: [
    { name: 'Source', type: 'text', why: 'Warehouse › Reports › Saved: the built-in report it comes from (out, who, home, where, tomorrow, moves, stock, closet, kits, redtag, trucks).' },
    { name: 'Columns', type: 'note', why: 'Warehouse › Reports › Saved: the columns shown, in order (JSON).' },
    { name: 'Filters', type: 'note', why: 'Warehouse › Reports › Saved: the filters (category, status, person, place, customer, dates; JSON).' },
    { name: 'GroupBy', type: 'text', why: 'Warehouse › Reports › Saved: group by (person, place, customer, category or status).' },
    { name: 'SortBy', type: 'text', why: 'Warehouse › Reports › Saved: the column it is sorted by and the direction (JSON).' },
    { name: 'SavedBy', type: 'text', why: 'Warehouse › Reports › Saved: who saved it (only that person, Director or the CFO can change or delete it).' }
  ] },
  /* Warehouse › Inventory › Vehicles: un renglon por vehiculo; Title = como le dicen (Van 1). */
  { list: 'Vehicles', createList: true, columns: [
    { name: 'Plate', type: 'text', why: 'Warehouse › Vehicles: license plate.' },
    { name: 'Make', type: 'text', why: 'Warehouse › Vehicles: make (Ford, Chevrolet...).' },
    { name: 'Model', type: 'text', why: 'Warehouse › Vehicles: model (Transit, Express...).' },
    { name: 'Year', type: 'text', why: 'Warehouse › Vehicles: year.' },
    { name: 'VIN', type: 'text', why: 'Warehouse › Vehicles: VIN.' },
    { name: 'Color', type: 'text', why: 'Warehouse › Vehicles: color.' },
    { name: 'AssignedTo', type: 'text', why: 'Warehouse › Vehicles: the tech who drives it (Techs id).' },
    { name: 'Carries', type: 'note', why: 'Warehouse › Vehicles: the equipment it carries ([{ item, qty }], items of Inventory).' },
    { name: 'Notes', type: 'note', why: 'Warehouse › Vehicles: notes (insurance, registration, service).' },
    { name: 'Active', type: 'boolean', why: 'Warehouse › Vehicles: vehicles no longer used stay for the history.' },
    { name: 'LastTruckCheck', type: 'note', why: 'Warehouse › Equipment › Truck check: the last weekly check (when, who, pieces not found).' }
  ] },
  /* Warehouse › Kits › Create kit: kit suelto, sin orden; Title = etiqueta. */
  { list: 'Kits', createList: true, columns: [
    { name: 'ClientID', type: 'text', why: 'Warehouse › Kits: the client of the kit.' },
    { name: 'BuildingKey', type: 'text', why: 'Warehouse › Kits: the building (and so its closet).' },
    { name: 'Day', type: 'text', why: 'Warehouse › Kits: the day it goes to the closet (YYYY-MM-DD).' },
    { name: 'Items', type: 'note', why: 'Warehouse › Kits: what goes in the kit ({ items: [{ item, qty }] }).' },
    { name: 'Person', type: 'text', why: 'Warehouse › Kits: who it is for.' },
    { name: 'Notes', type: 'note', why: 'Warehouse › Kits: notes of the kit.' },
    { name: 'KitStatus', type: 'text', why: 'Warehouse › Kits: To pack, Packed, In closet, Picked up.' },
    { name: 'KitLog', type: 'note', why: 'Warehouse › Kits: who moved the kit and when.' }
  ] },
  /* Admin › Client Relations: bitacora de clientes (CRM de Tony); Title = nombre del cliente. */
  { list: 'ClientLog', createList: true, columns: [
    { name: 'ClientID', type: 'text', why: 'Client Relations: the client of the touchpoint.' },
    { name: 'ClientName', type: 'text', why: 'Client Relations: the client name when it was logged.' },
    { name: 'Day', type: 'text', why: 'Client Relations: the day of the touchpoint (YYYY-MM-DD).' },
    { name: 'Type', type: 'text', why: 'Client Relations: Call, Email, Text, Visit or Meeting.' },
    { name: 'Mood', type: 'text', why: 'Client Relations: how the client is (Happy, Neutral, Upset, In resolution).' },
    { name: 'Spoke', type: 'text', why: 'Client Relations: who we talked to.' },
    { name: 'Notes', type: 'note', why: 'Client Relations: what happened.' },
    { name: 'NextStep', type: 'text', why: 'Client Relations: the next step (None, Call, Email, Visit, Send bid, Fix invoice).' },
    { name: 'FollowUp', type: 'text', why: 'Client Relations: the follow-up day (YYYY-MM-DD).' },
    { name: 'FollowUpDone', type: 'boolean', why: 'Client Relations: the follow-up was done.' },
    { name: 'Owner', type: 'text', why: 'Client Relations: who owns the follow-up.' },
    { name: 'CreatedByEmail', type: 'text', why: 'Client Relations: who logged it.' },
    { name: 'UpdatedBy', type: 'text', why: 'Client Relations: who last edited it.' },
    { name: 'UpdatedAt', type: 'text', why: 'Client Relations: when it was last edited (ISO).' },
    { name: 'DoneBy', type: 'text', why: 'Client Relations: who marked the follow-up done.' },
    { name: 'DoneAt', type: 'text', why: 'Client Relations: when the follow-up was marked done (ISO).' },
    { name: 'Deleted', type: 'boolean', why: 'Client Relations: deleted from the page but kept (nothing is lost).' },
    { name: 'DeletedBy', type: 'text', why: 'Client Relations: who deleted it.' },
    { name: 'DeletedAt', type: 'text', why: 'Client Relations: when it was deleted (ISO).' },
    { name: 'History', type: 'note', why: 'Client Relations: earlier versions when it was edited (JSON).' },
    { name: 'NextStepNote', type: 'note', why: 'Client Relations: details of the next step (who to call, what for, what time).' }
  ] },
  /* Admin › Tasks: tareas con responsable, fecha, plan y confirmacion; Title = la tarea. */
  { list: 'Tasks', createList: true, columns: [
    { name: 'Details', type: 'note', why: 'Tasks: what has to be done, in detail.' },
    { name: 'AssignedTo', type: 'text', why: 'Tasks: the one person who owns it (email).' },
    { name: 'AssignedBy', type: 'text', why: 'Tasks: who assigned it and confirms it (email).' },
    { name: 'Kind', type: 'text', why: 'Tasks: Task, or Commitment (something the person promised, with their date).' },
    { name: 'Block', type: 'text', why: 'Tasks: area of responsibility (Clients, Operations, Sales, Warehouse, Team).' },
    { name: 'Priority', type: 'text', why: 'Tasks: High or Normal.' },
    { name: 'Source', type: 'text', why: 'Tasks: where it came from (email, meeting, client).' },
    { name: 'DueDay', type: 'text', why: 'Tasks: due date (YYYY-MM-DD); only who assigned it can change it.' },
    { name: 'OriginalDue', type: 'text', why: 'Tasks: the first due date, before any extension.' },
    { name: 'Status', type: 'text', why: 'Tasks: New, Accepted, Waiting, Done, Confirmed, Cancelled.' },
    { name: 'Plan', type: 'note', why: 'Tasks: what the owner will do (written to accept it).' },
    { name: 'PlanDate', type: 'text', why: 'Tasks: the day the owner said it will be done.' },
    { name: 'WaitingOn', type: 'text', why: 'Tasks: who or what the owner is waiting on.' },
    { name: 'WaitingCheck', type: 'text', why: 'Tasks: when the owner checks again while waiting.' },
    { name: 'Result', type: 'note', why: 'Tasks: what was done and how it ended (written to mark it done).' },
    { name: 'ExtDate', type: 'text', why: 'Tasks: new date asked for (more time), waiting for an answer.' },
    { name: 'ExtReason', type: 'note', why: 'Tasks: why more time was asked for.' },
    { name: 'SeenAt', type: 'text', why: 'Tasks: when the owner first opened it (ISO).' },
    { name: 'AcceptedAt', type: 'text', why: 'Tasks: when the owner accepted it (ISO).' },
    { name: 'DoneAt', type: 'text', why: 'Tasks: when the owner marked it done (ISO).' },
    { name: 'ConfirmedAt', type: 'text', why: 'Tasks: when it was confirmed (ISO).' },
    { name: 'ConfirmedBy', type: 'text', why: 'Tasks: who confirmed it.' },
    { name: 'Events', type: 'note', why: 'Tasks: every step with who and when (JSON); nothing is deleted.' },
    { name: 'Thread', type: 'text', why: 'Tasks: the email conversation it came from, to show it again when the client writes again (17/10).' },
    { name: 'DueTime', type: 'text', why: 'Tasks: time of day it is due (HH:MM), picked when replying to an email (17/10).' },
    { name: 'NeedOrder', type: 'text', why: 'Tasks: Yes = to finish it, the person writes the order number that was created (17/10).' },
    { name: 'OrderRef', type: 'text', why: 'Tasks: the order number written when it was marked done (17/10).' }
  ] },
  /* Tasks › Closed, avisos "viewing / answering" y borradores (lib/tasks-activity.js). */
  { list: 'TasksActivity', createList: true, columns: [
    { name: 'Kind', type: 'text', indexed: true, why: 'Tasks activity: Handled (Closed), Watch (open in Approvals/Review) or Presence (viewing / answering).' },
    { name: 'Key', type: 'text', indexed: true, why: 'Tasks activity: which pending item (approval:<order>, review:<order>, followup:<id>, email:<id>).' },
    { name: 'Who', type: 'text', why: 'Tasks activity: who handled it, or who is viewing / answering it (email).' },
    { name: 'State', type: 'text', indexed: true, why: 'Tasks activity: Open / Closed (Watch), Viewing / Editing / Left (Presence).' },
    { name: 'At', type: 'text', why: 'Tasks activity: when (ISO).' },
    { name: 'Day', type: 'text', indexed: true, why: 'Tasks activity: the Iowa day (YYYY-MM-DD), to read only the last weeks.' },
    { name: 'OrderID', type: 'text', why: 'Tasks activity: the order, when there is one.' },
    { name: 'What', type: 'text', why: 'Tasks activity: what was done (Approved, Cancellation approved, Email answered...).' },
    { name: 'Details', type: 'note', why: 'Tasks activity: the note or the reply that was sent.' },
    { name: 'Draft', type: 'note', why: 'Tasks activity: what the person had written, kept when the 10-minute lock ends (JSON).' }
  ] },
  /* Llegadas: donde estaba el tecnico cada vez que abrio la app (Tech arrival-ping.js). Title = TechId. */
  { list: 'TechLocations', createList: true, columns: [
    { name: 'TechId', type: 'text', indexed: true, why: 'Arrivals: which tech (id in Techs) opened the app.' },
    { name: 'Name', type: 'text', why: 'Arrivals: the tech name, to read the list by hand.' },
    { name: 'At', type: 'text', why: 'Arrivals: when the app was opened (ISO).' },
    { name: 'Day', type: 'text', indexed: true, why: 'Arrivals: the Iowa day (YYYY-MM-DD), to read one day.' },
    { name: 'Latitude', type: 'number', why: 'Arrivals: where the tech was when the app opened.' },
    { name: 'Longitude', type: 'number', why: 'Arrivals: where the tech was when the app opened.' },
    { name: 'Accuracy', type: 'number', why: 'Arrivals: how precise the location was, in meters.' },
    { name: 'Event', type: 'text', why: 'Arrivals: open (app started) or resume (came back to the app).' }
  ] },
  { list: 'Suggestions', createList: true, columns: [
    { name: 'Text', type: 'note', why: 'Suggestions & comments from the staff (Changelog tab).' },
    { name: 'ByName', type: 'text', why: 'Who sent the suggestion.' },
    { name: 'ByEmail', type: 'text', why: 'Who sent the suggestion.' },
    { name: 'Reply', type: 'note', why: "The Developer's answer; the person who sent it sees it under the form (10/10/2026)." },
    { name: 'RepliedBy', type: 'text', why: 'Who answered the suggestion.' },
    { name: 'RepliedAt', type: 'text', why: 'When the suggestion was answered.' },
    { name: 'Files', type: 'note', why: 'Screenshots attached to the suggestion (names in Suggestions/attachments/<id>/).' }
  ] }
];

module.exports = { SPEC };
