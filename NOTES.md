# NOTES.md — Historial y estado del proyecto (gsocd-shared)

Reglas de proceso -> ver WORKFLOW.md (léelo primero). Aquí vive el historial
de features, bugs, decisiones y pendientes, en orden cronológico.

**Si este archivo supera ~600 líneas**, es hora de resumir entradas viejas
(más de ~3 semanas sin tocarse) a un párrafo o moverlas a NOTES_ARCHIVE.md,
en vez de seguir apilando sin límite.

## Cómo se versiona este repo (importante, ya se aprendió una vez)

Los tags son de TODO el repo, no por componente. Antes de crear un tag
nuevo, correr `git tag --sort=-v:refname | head -1` para saber cuál es
el más alto de verdad — NO asumir que el siguiente número es "uno más"
que el tag que trae puesto el componente que estás tocando (otros
componentes pueden haber avanzado más adelante mientras el tuyo se quedó
quieto). Ejemplo real: `order-form-premium` estaba en v1.19.0 pero el
repo ya iba en v1.24.0 por cambios a `nav-premium`/`gallery-groups` — el
tag correcto para el siguiente cambio fue v1.25.0, no v1.20.0.

Subir un fix implica: 1) editar el archivo en `main`, 2) crear un tag
nuevo apuntando a ese commit, 3) actualizar el `<script src>` en CADA
HTML que lo consume (buscar `gsocd-shared@vX.X.X/nombre-componente/` en
los 3 repos consumidores).

## SUBIDO Y DESPLEGADO (12/09/2026): unificar Office Access en order-form-premium

`order-form-premium.js`: se agregó `officeAccessHtml(dom, opts)`,
`setOfficeNeed(dom, yes)`, `getOfficeNeedValue(dom)`,
`getOfficeNeedNotes(dom)` y `onOfficeNeedChange(dom, fn)`. Antes la
tarjeta "Need anything from the office?" vivía duplicada 4 veces (2 en
el flujo de crear orden de Admin/Orders, 2 en "Add Unit" de ambos), cada
una con texto ligeramente distinto y sin forma de que un cambio se
reflejara en las 4 a la vez. El dueño pidió unificarlo explícitamente
("por que motivo estaria pagando por ti... si es para hacer todo el
trabajo y dejarlo bien conectado en lugar de hacer parches") — no fue
decisión unilateral.

`onOfficeNeedChange` existe porque Orders/create-order hace algo que es
SOLO SUYO al prender el toggle (renombra "Entry time" a "Office
availability time" en otro campo de esa pantalla) — en vez de que el
shared conozca esa lógica ajena, la página se suscribe con un callback.

Cambios de contenido pedidos por el dueño:
- Título: "Need anything from the office?" → "Do we need anything from
  you?"
- Se quitó el label de adentro de la caja ("What do we need from the
  office?") — el placeholder sube a ocupar ese espacio.
- Nuevos ejemplos en el placeholder: "Access keys, materials, special
  instructions..." en vez de "Keys for the mailroom, gate code, access
  to the roof...".

`opts.compact=true` trae la versión delgada (aprobada en el mini de Add
Unit) — sin `compact`, mantiene el tamaño original del flujo de crear
orden.

Tag **v1.25.0** subido y confirmado en vivo (GitHub y jsDelivr) el
12/09/2026 — se autorizó explícitamente después de que Admin y Orders
quedaran listos y aprobados. Se subió primero (antes que Admin/Orders,
que ya referencian este tag en su `<script src>`).

Probado con jsdom (16/16): render normal y compact, título, quitar
label, placeholder nuevo, toggle, candado, `getOfficeNeedNotes` regresa
vacío con el toggle apagado, y el listener `onOfficeNeedChange`. Después
de subir, se confirmó con `raw.githubusercontent.com` que el contenido
real del tag en GitHub trae el texto nuevo.

## Nuevo componente (13/09/2026): photo-hover-preview

`GSPhotoHoverPreview.setup()` + `GSPhotoHoverPreview.stripHtml(photos)`.
Consolida lo que hasta ahora vivía copiado a mano, por separado, en
Admingsocd.com y ordersgsocd.com (y en Orders, además, dos veces: una
para `.order-photo-thumb` en `tracking.html`, otra para `.gs-gal-ph` en
`customer.html`) — el preview de foto al pasar el mouse (1 segundo,
tamaño máximo posible en pantalla, sin necesidad de clic) y la función
que arma la tira de miniaturas de una orden.

Cubre los dos tipos de miniatura que existen hoy:
- `.order-photo-thumb` — el `<img>` mismo (Admin: Approvals/Review/
  Active/History/Schedule. Orders: Processing/History).
- `.gs-gal-ph` — un `<div>` que envuelve un `<img>` adentro, del
  componente `gallery-groups`. También se usa para videos
  (`.gs-gal-ph.video`) — los videos se excluyen del preview, un video
  pausado agrandado no da el mismo vistazo rápido que una foto.

`stripHtml(photos)` devuelve SOLO la tira (miniaturas + "+N"), sin
envolverla en ningún link — Admin sigue envolviendo el resultado en su
propio `<a onclick="openGalleryForOrder(...)">` porque esa navegación es
específica de Admin, no algo que el componente compartido deba conocer.

Tag **v1.26.0** (bump de MENOR, es un componente nuevo). Confirmado en
vivo (GitHub raw + jsDelivr) el 13/09/2026. Conectado en
`Admingsocd.com/admin.html` y en `ordersgsocd.com/customer.html` +
`tracking.html` el mismo día — verificado que el comportamiento es
idéntico al de las copias locales que reemplazó (mismas pruebas de
Puppeteer que ya existían para cada página, todas siguen pasando igual).

**Pendiente:** conectar en `tech.gsocd.com`, que todavía no tiene ni el
hover-preview ni Gallery.

## Nuevo componente (14/09/2026): service-change-panel (v1.27.0 → v1.27.2)

"Lista + selector + diff" de servicios: la pieza reusable detrás de
"Request a Change" del cliente (Recurring y Processing) y de la edición
de servicios en Admin. Extraído de lo que primero se construyó y probó
inline en `ordersgsocd.com` para Recurring — mismo patrón que ya usaba
Supervisor (tech.gsocd.com, "Update Services") con GSServicePicker +
diff propio.

- `currentListHtml(services, opts)` — un renglón por servicio con nombre
  + nota (opcional) + cámara, mismo look que `buildAdminSelectedListHtml`
  de admin.html (Active > Edit). Cero `onclick` inline: la cámara va por
  delegación (`wireList` + `opts.onCamera`). **Lección real:**
  `toggleChangePanel`/`renderChangePanel` ya existían en customer.html
  para el Request Change de órdenes normales y la copia de Recurring las
  pisó — por eso todo lo del componente va con prefijo `gs-scp-` y sin
  nombres globales.
- `collectNotes(listEl, services)` — notas por servicio prefijadas con el
  nombre, listas para el mensaje general (NO van ligadas a un servicio en
  el backend, confirmado con el dueño).
- `mount(opts)` — GSServicePicker real precargado + diff en vivo; regresa
  controlador con `getDiff()`/`renderDiff()`/`collect()`. `collect()`
  exige nota por cada quitado y arma `{services, removedNotes}` en el
  mismo formato que `submit-recurring-update.js` /
  `request-recurring-change.js` / `request-change.js`.
- v1.27.1: cada servicio actual puede traer `Category` (propertyType del
  picker) y `SubOption` (sku real). Con sku real quitar toma **un** clic;
  sin sku (Recurring guarda solo nombre) queda el quirk heredado del
  doble clic (el primer clic en cualquier nivel re-selecciona con el sku
  real, el segundo sí quita). Mismo comportamiento que Supervisor.
- v1.27.2: `diffHtml(baseNames, nowNames, {requireNotes, emptyText})` y
  `namesOf(selected)` — diff puro para páginas con picker propio (Admin),
  sin nota obligatoria por default porque ahí se aplica directo.

Conectado en: Orders `recurring.html` + `customer.html` (Recurring, manda
a Pending Review), Orders `tracking.html` + `customer.html` (Processing,
Request a change, manda a Pending Review vía historial), Admin
`admin.html` (Active > Edit y Approvals > Update, diff informativo,
aplica directo). Todo verificado con Puppeteer y los componentes reales.

## Proyecto grande (15/09/2026): cámara propia + cola offline real

**Origen real:** un técnico tomó ~8 fotos en un edificio con punto muerto
conocido; solo se guardó 1. La cámara nativa del teléfono sube cada foto al
tomarla, una por una, sin ninguna cola -- si falla, la foto se descarta por
completo, no queda registro. Regla de oro que el dueño repitió varias veces
sin excepción: **LAS FOTOS SIEMPRE SE DEBEN GUARDAR, no importa qué.**

### Arquitectura (por qué quedó así, no de otra forma)

- **`camera-queue/camera-queue.js`** (aquí, compartido) -- toda la lógica de
  guardar/reintentar/reportar estado. Ver CHANGELOG v1.28.0/v1.28.1 para el
  detalle técnico completo. Genérico a propósito: no sabe de endpoints ni de
  la forma del body, cada app decide eso.
- **`camera-capture.html`** (la página con la cámara en vivo en sí) --
  **NO vive aquí**, existe UNA COPIA POR DOMINIO (`tech.gsocd.com/
  camera-capture.html`, `Admingsocd.com/camera-capture.html`,
  `ordersgsocd.com/camera-capture.html`). Esto no es duplicación evitable:
  IndexedDB (donde vive la cola) **no cruza dominios** -- si la página de
  cámara viviera en el CDN compartido (otro dominio), la cola de esa sesión
  quedaría atrapada ahí y la app real (Tech/Admin/Orders) nunca podría
  verla ni reintentarla. Las 3 copias son casi idénticas (mismo HTML/CSS/
  flujo de captura), solo cambian: qué `shared.js`/`api()` usan para
  autenticar, y qué contextos soportan.
- **Video se queda con la cámara nativa del teléfono**, sin tocar --
  grabar en vivo desde el navegador es notoriamente menos estable entre
  teléfonos (sobre todo Android), y ya había bugs reales documentados en
  este mismo código sobre eso. Confirmado con el dueño: solo fotos pasan a
  la cámara nueva.
- **`notReady`/`release`/`remove`** (v1.28.1) existen por un solo caso: la
  foto de un cliente creando una orden nueva, donde el `OrderID` real no
  existe todavía cuando se toma la foto.

### Los 9 puntos de captura conectados (confirmado con el dueño: TODOS, sin
excepción -- no se dejó ninguno con la cámara vieja a propósito)

**Tech** (`employee.html` + `supervisor.html`, ambos igual):
1. Take a photo (orden normal)
2. Mark as Completed (foto obligatoria -- `requireAtLeastOne=1&completeAfter=1`)
3. Foto de Recurring (opcional)

**Admin** (`admin.html`):
4. Foto de "Not Completed" en Active > Update Services

**Orders** (`customer.html` + `recurring.html`/`tracking.html` standalone):
5. Recurring (+ el ícono de cámara dentro de "Request a Change")
6. Tracking/Processing (+ el ícono dentro de "Request a Change" ahí también)
7. Orden nueva sin `OrderID` todavía -- usa `notReady`/`release`, ver abajo

### El caso de la orden nueva (el más raro de los 9)

Cuando el cliente toma una foto mientras llena el formulario de "New Order",
la orden no existe todavía. Diseño final:
- Antes de ir a la cámara, se fuerza `saveDraft()` (ya existía, normalmente
  se dispara solo cada 3 segundos) -- así el RESTO del formulario (edificio,
  unidad, servicios, fechas) también queda a salvo del lado del servidor,
  no solo la foto.
- La foto se guarda con `notReady:true` -- nunca intenta subir sola.
- Al volver de la cámara, se reusa `?continue=<draftOrderId>` (mecanismo que
  YA EXISTÍA, es el mismo que usa el botón "Continue" del diálogo de
  drafts) para rellenar el formulario solo, sin reinventar nada.
- Cuando `submitOrder()` de verdad confirma el/los `OrderID(s)` reales
  (puede ser más de uno si es un lote de varias unidades -- la MISMA foto
  se manda a cada uno), se llama `release()` para el primero y se
  `enqueue()` una copia nueva por cada `OrderID` adicional.
- **Si se está EDITANDO una orden existente** (no creando una nueva), el
  `OrderID` ya es real desde el principio -- la foto sube directo, sin
  `notReady`, sin esperar nada. Este caso se encontró a tiempo revisando el
  código antes de romperlo (el botón "Add Photo" del formulario se
  reutiliza para ambos modos).

### Protección de "no perder edición sin guardar" (efecto secundario real)

Al construir esto se encontró un problema aparte, no relacionado con fotos
en sí: en varios lugares (`Update Services` de Admin y de Supervisor,
`Request a Change` del cliente en Recurring y Tracking) hay edición viva
que solo existe en memoria del navegador -- si la cámara nueva navega fuera
de la página por completo (confirmado con el dueño: navegación completa, no
iframe, por temas de permisos de cámara entre dominios), esa edición se
perdería sin necesidad.

Solución, mismo patrón en los 4 lugares: justo antes de navegar a la
cámara, se guarda un snapshot completo del panel abierto en
`sessionStorage` (para paneles con picker real como `GSServicePicker`, esto
significa hacer awaitable la cadena de montaje que antes no lo era --
`toggleRcUpdate`, `rcToggleChangePanel`, `toggleChangePanel`, etc., todas
se volvieron `async` para poder saber desde afuera cuándo el picker ya está
listo para pisarle la selección con `setSelected()`). Al volver, se
reabre exactamente el mismo panel y se restaura el estado guardado encima.

### Pendiente -- para la siguiente sesión

- Los paneles de "Update Services" de `supervisor.html` (tech.gsocd.com)
  siguen con su diseño viejo (modal aparte) -- el dueño ya confirmó que se
  quiere rediseñar para que se vean como las tarjetas de Active en Admin
  (X/undo en línea, pills L1/L2/L3, cámara por servicio individual), pero
  eso se dejó **a propósito** para una sesión aparte de diseño. Lo que se
  hizo en esta sesión fue solo proteger que la edición actual (con el
  diseño viejo) no se pierda al ir a la cámara -- no tocar el diseño en sí.

## Pendiente (21/09/2026): lib/order-pdf.js + lib/pdf.js existen, pero NADIE los usa todavia

Se creo `lib/order-pdf.js` (contenido puro del PDF de ordenes -- buildOrderPdf/
buildCompletionPdf/buildRequestPdf/historyDetailLine/renderServicesTable/etc,
la logica que antes vivia duplicada a mano en Admingsocd.com y ordersgsocd.com)
y `lib/pdf.js` (el generador de PDF de bajo nivel, PdfDoc). Etiquetados v1.45.0.
Ambos estan probados y funcionan bien por su cuenta -- generan un PDF real y
valido con Node directo (`buildOrderPdf({...}) ` produce bytes de PDF correctos,
confirmado visualmente con pdftoppm).

**Pero ningun portal los usa en produccion ahorita.** Se intento conectar los
2 (Admin y Orders, cambiando su `package.json` a `gsocd-shared#v1.45.0` y su
`lib/orderpdf.js` local para hacer `require('gsocd-shared/lib/order-pdf')`) y
tumbo produccion en los 2 -- `Cannot find module 'gsocd-shared/lib/order-pdf'`
en tiempo de ejecucion, aunque `npm install` local SI lo encontraba bien.

Causa real, confirmada con el log de build de Vercel (no es un misterio):
Vercel restauro el cache de build del deploy ANTERIOR (uno que no tenia
v1.45.0 en su node_modules) y el `npm install` dijo "up to date" en 484ms --
demasiado rapido para haber ido a buscar algo nuevo a GitHub. Como este repo
no comitea `package-lock.json` (gitignored, a proposito, documentado arriba
en este mismo archivo) no hay nada que le avise a Vercel que la dependencia
de verdad cambio.

Confirmado con clones 100% frescos (sin nada de cache local) que el codigo en
si esta bien -- `npm install` desde cero SI baja el paquete correcto y todo
carga y funciona.

**Se revirtio la conexion en los 2 portales** -- cada uno se quedo otra vez
con su propia copia local completa de `orderpdf.js` (con el arreglo de
"Assign by service" aplicado a mano, por separado, en cada uno).

### Si alguien quiere volver a intentar conectar esto:

- Verificar en el log de build que de verdad diga algo como "added N packages"
  (bajando de verdad) y NO "up to date" en menos de 1 segundo -- eso es la
  señal de que esta reusando cache viejo.
- Considerar dejar de ignorar `package-lock.json` (o al menos para los
  portales que dependen de `gsocd-shared` va Node), para que exista algo
  real que le diga a Vercel "esta dependencia cambio" -- no se investigo a
  fondo si esto resuelve el problema de raiz, solo es la sospecha mas fuerte.
- Probar en un portal a la vez, no los 2 juntos -- mas facil de diagnosticar
  y revertir si algo sale mal.
- El dueño pidio explicitamente pausar esto por ahora -- no retomar sin que
  el lo pida.
