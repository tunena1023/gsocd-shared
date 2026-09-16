# NOTES.md — Cómo se trabaja en este proyecto

Este archivo existe para que cualquier chat de Claude (u otra persona) que entre
a este repo después no tenga que adivinar el proceso, ni repetir preguntas ya
resueltas, ni subir cosas sin permiso. Léelo completo antes de tocar código.

## Reglas de trabajo con el dueño del proyecto

1. **Nada se sube al repo sin permiso explícito.** El dueño dice cómo quiere
   que algo funcione (el resultado, no el código línea por línea). Quien
   programa se inventa la forma técnica de lograrlo, pero antes de tocar el
   repo real, regresa y explica: "encontré esto, funciona así, ¿le entro?" —
   sobre todo si hay una decisión de por medio (crear una columna nueva,
   elegir entre 2 formas de resolverlo, etc.). Solo con un "dale"/"súbelo"
   explícito se sube. Sin excepción, aunque el fix se vea obvio.

2. **No asumas silenciosamente.** Si algo es ambiguo, o si el código actual
   sugiere un mecanismo distinto al que el dueño describe, se pregunta o se
   verifica ANTES de decidir por cuenta propia. Leer el código para entender
   cómo funciona hoy está bien y se espera — pero eso no reemplaza confirmar
   qué se quiere que pase.

3. **"Minis" antes de tocar UI/visual.** Para cualquier cambio visual o de
   comportamiento de interfaz, se arma una vista previa interactiva (HTML
   autocontenido, publicado como artifact) ANTES de tocar el repo real. Si
   el cambio usa un componente de `gsocd-shared`, el mini debe inyectar el
   componente REAL (el archivo tal cual, no una reconstrucción) para que lo
   que se prueba sea exactamente el comportamiento real, no una simulación.

4. **Los cambios se pueden acumular en local sin subir.** El dueño puede
   pedir varios cambios seguidos y decir "no subas nada todavía" — en ese
   caso los cambios se hacen sobre copias locales (en el sandbox de la
   sesión) y se van apilando, hasta que se den todos juntos con un solo
   "dale". Cuando esto pase, quien retome la conversación (aunque sea otra
   sesión) debe saber que puede haber cambios locales sin commitear — si el
   dueño menciona algo que "quedó pendiente" y no aparece en el repo, no es
   un error, probablemente sigue en el sandbox de la sesión anterior sin
   subir. Pregúntale directo si quiere que se rehaga o si ya se perdió.

5. **Cada commit debe explicar el porqué, no solo el qué.** El mensaje de
   commit tiene que ser lo bastante específico para que una sesión nueva
   entienda el contexto completo sin tener que re-investigar: qué problema
   real se encontró, por qué se eligió esa solución y no otra, y si hay
   trade-offs o casos que se dejaron fuera a propósito.

6. **El tono del dueño es directo y con groserías — no es un ataque
   personal, es como habla.** Se puede hablar de igual a igual, con más
   soltura de la que se usaría normalmente, sin necesidad de ser cortante
   ni de disculparse en exceso. Dicho eso: no hay que auto-insultarse ni
   quedarse callado si algo cruza a un insulto directo — se puede reconocer
   el error real sin necesidad de repetir el insulto.

7. **Antes de subir CUALQUIER cambio al repo (aunque ya esté "confirmado" y
   listo para el commit), hay que revisarlo de punta a punta como si fuera
   un caso real** — seguir el flujo completo, paso a paso, desde que algo
   se crea/pide hasta que se completa/cierra, buscando específicamente: dos
   flujos que puedan pisarse o duplicarse, un dato que se pierda en el
   camino entre una pantalla y otra, una pantalla que no se entere de un
   cambio que hizo otra, y campos usados en el código que no coincidan con
   lo documentado como columnas necesarias en SharePoint. Esto no es
   opcional ni solo para features grandes — es el último paso antes de
   cualquier "dale", cada vez. En esta sesión, esta revisión encontró 7
   bugs reales que el código "ya terminado" traía escondidos — ninguno era
   un error de sintaxis (esos ya se habían validado con `node --check`),
   todos eran de lógica: cosas que se ven perfectas archivo por archivo
   pero fallan en la costura entre dos archivos.

8. **Todo cambio visual o de comportamiento se considera en mobile ANTES de
   proponerlo o subirlo — no después.** No basta con que se vea bien en
   desktop. En la sesión del 13/09/2026 esto se pasó por alto varias veces
   seguidas sobre el mismo componente compartido
   (`gsocd-shared/order-form-premium`): un fix se probaba, se declaraba
   listo, se subía, y el dueño encontraba en su propio celular que seguía
   roto — o que se veía distinto entre Admin y Orders aunque los dos usan
   el mismo componente, porque el padding/contexto que lo envuelve en cada
   app es distinto. Esto obligó a repetir el mismo ciclo de investigación
   3-4 veces sobre lo mismo (filas de unidad, pestañas de división, padding
   de tarjetas). La lección: antes de decir "ya está" sobre cualquier
   componente visual — sobre todo uno compartido, usado en más de un lugar
   — hay que verificar con un render real (no solo leer el CSS) a un ancho
   angosto realista (320-375px, el peor caso siendo un iPhone SE de 320px),
   y hacerlo DENTRO de cada contexto donde ese componente se usa, no solo
   uno — un componente puede verse perfecto en una pantalla y roto en otra
   por lo que lo rodea, no por el componente en sí.

## Mapa de la arquitectura (para no perderse)

**4 repos, todos de `tunena1023` en GitHub, cada uno su propio proyecto en
Vercel (equipo "GS Solutions"):**

| Repo | Dominio | Para quién | Notas |
|---|---|---|---|
| `tech.gsocd.com` | tech.gsocd.com | Empleados/supervisores en campo | Login por QR + DeviceToken (sin password). Nunca se crean órdenes aquí. |
| `Admingsocd.com` | admin.gsocd.com | Oficina/staff | Aprobar órdenes, catálogo de servicios, scheduling |
| `ordersgsocd.com` | orders.gsocd.com | Clientes | Pedir servicio, tracking, portal de cliente |
| `gsocd-shared` | — (no se despliega) | — | Componentes de UI reutilizados por los 3 portales, vía jsDelivr + git tags |

**Cómo se consume `gsocd-shared`:** cada componente se referencia en el HTML
con una URL fija a una versión (`https://cdn.jsdelivr.net/gh/tunena1023/
gsocd-shared@vX.X.X/nombre-componente/archivo.js`). Los tags son de TODO el
repo (no por componente), así que subir un fix implica: 1) editar el archivo
en `main`, 2) crear un tag nuevo (`git/refs` con `refs/tags/vX.X.X` apuntando
al commit), 3) actualizar el `<script src>` en cada HTML que lo usa a la
versión nueva. Sin el paso 3, el fix vive en el repo pero nadie lo usa
todavía — cada consumidor está pegado a la versión que tenga escrita.

**El catálogo de servicios tiene 2 listas de SharePoint, NO conectadas entre
sí por el sistema — son fuentes independientes, a propósito:**
- **`ServicesCatalog`** — SKUs importados de QuickBooks (Division,
  PropertyType, Price, ServiceName se sobreescriben en cada import). El
  campo `Category` es la ÚNICA excepción: el import nunca la toca, se
  mantiene a mano desde `developer.html` > tab "Services" (botón junto a
  cada renglón). Esta es la lista real que alimenta el selector de
  servicios en TODO lugar donde se pone o edita una orden.
- **`Services`** — lista vieja, migrada de un Excel el 30/08/2026. Ya no es
  la fuente real para nada activo del selector de servicios nuevo (ver
  historial de conversación del 10/09/2026 para el porqué se descartó como
  fuente — quedó documentado ahí que mezclar las 2 listas fue un error).

**El selector de servicios compartido (`gsocd-shared/service-picker`)**
tiene una opción `groupByCategory: true` que agrupa por `Category` en un
acordeón (categorías sin asignar caen en "Uncategorized", nunca se pierden).
Por regla del dueño (confirmada 10/09/2026): **este acordeón es el estándar
en TODO lugar de Admin u Orders donde se pone o edita una orden** — no
aplica a Tech (ahí nunca se crean órdenes). Los 6 lugares que existen hoy:
`create-order` y `appr-`/`admin-` (edición) en Admin, `customer-order` en
Orders, más `tpl-admin` (Admin) y `template-editor` (Orders) para
plantillas — estos últimos 2 se estandarizaron el 10/09/2026, antes se
habían quedado en una versión vieja del componente sin el acordeón.

## Pendientes conocidos (al 10/09/2026)

- **En local, sin subir al repo:** fix en `service-picker.js` para que solo
  una categoría del acordeón esté abierta a la vez (hoy se pueden abrir
  varias al mismo tiempo). Vive en el sandbox de la sesión del 10/09/2026,
  no en GitHub — si no aparece en el repo y no se sabe por qué, es por esto.
- Bug sin resolver: banner "File downloaded... sharepoint.com" en Tech
  (portal de empleados, celular) — el fondo o logo se descarga como archivo
  en vez de solo mostrarse. No tocar hasta que el dueño lo pida
  explícitamente.
- 404 de `Logo.jpg` / `NavBackground.jpg` en Orders (`/api/site-image`) —
  pendiente de que el dueño confirme el nombre real de esos archivos en la
  raíz del drive de SharePoint (Onlineorders).
# NOTES.md — Cómo se trabaja en este proyecto

Este repo no tenía NOTES.md propio todavía — se crea ahora (12/09/2026)
porque por primera vez se editó directamente, no solo se consumió desde
Admin/Orders/Tech. Lee también el NOTES.md de cualquiera de los otros 3
repos para las reglas generales de trabajo (nada se sube sin "dale"
explícito, minis antes de UI, etc.) — son las mismas aquí.

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
