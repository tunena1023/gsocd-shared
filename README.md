# gsocd-shared

Componentes de código (JS/CSS) que usan más de uno de los 3 portales de GS Solutions:

- `tech.gsocd.com`
- `admin.gsocd.com` (repo: Admingsocd.com)
- `orders.gsocd.com` (repo: ordersgsocd.com)

## Por qué existe este repo

Antes, piezas como el visor de fotos, el reloj/calendario, o el selector de servicios estaban
pegadas a mano en cada portal por separado. Cuando aparecía un bug en una de esas piezas, había
que arreglarlo varias veces — una por cada lugar donde vivía copiada — y era fácil que se te
olvidara alguno.

Aquí cada pieza vive **una sola vez**. Los 3 portales la usan desde aquí, sin copiar nada.

Esto **no** hace que los 3 portales dependan uno del otro para funcionar — cada uno sigue siendo
su propia app, en su propio dominio. Si `tech.gsocd.com` se cae, `orders.gsocd.com` sigue
funcionando exactamente igual. Lo único que comparten es de dónde traen estas piezas de código.

## Cómo lo usa cada portal

Cada componente se sirve gratis a través de [jsDelivr](https://www.jsdelivr.com/), que toma
cualquier archivo de este repo (público) y lo entrega por internet sin que haya que configurar
ni pagar nada.

**Siempre se usa una versión fija, por SHA de commit, nunca "lo que esté ahora".** Así un cambio aquí no le
llega a ningún portal hasta que alguien cambia a propósito el SHA en ese portal (en su rama `preview`):

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@<sha>/lightbox/lightbox.js"></script>
```

Algunos componentes que no se han tocado en mucho tiempo todavía se cargan por un tag viejo (`@v1.x.y`); al
cambiarlos, pasarlos a SHA. Ya no se crean tags.

## Piezas de backend (Node)

Admin y Orders instalan este repo como dependencia de npm, fijado por SHA en su `package.json`
(`"gsocd-shared": "github:tunena1023/gsocd-shared#<sha>"`); Tech no lo usa por npm. Se usa con `require()`:

```js
const orderPdf = require('gsocd-shared/lib/order-pdf');
```

`lib/fields.js` (un dato por campo) y `lib/split-fields.js` (propone donde va cada parte de un campo con dos cosas; Admin › Developer › Contacts (Excel)) van igual, por los dos lados (21/10/2026). `lib/phone.js` (21/10/2026) va por los dos lados: en el navegador por jsDelivr (`window.GSPhone`; un input con `data-gs-phone` se engancha solo) y en el servidor por npm (`normalize()`), para que pantalla y servidor revisen igual el telefono de 10 digitos. Un telefono viejo mal puesto sale en ambar (Admin); con `data-gs-phone-quiet` en `<body>` (o `{ quietOld: true }`) no ensena nada (Orders y Tech: el cliente no ve nada, CFO 21/10/2026).

Por npm se usan `lib/order-pdf`, `lib/pdf`, `lib/push`, `lib/order-seq`, `lib/site-readiness`,
`lib/schedule-entries`, `lib/service-notes`, `lib/submit-key` y `lib/order-rooms`. Para pasar a una versión nueva: cambiar el SHA en el `package.json` de
Admin y Orders (Vercel instala solo en cada deploy).

**Excepción, van como COPIA en cada portal:** `lib/notify.js` (copia idéntica en Admin, Orders y Tech) y
`lib/division-rules.js` (copia en Admin y Orders). Si cambian aquí, se copian a mano a esos portales en el mismo
cambio; el encabezado de la copia dice "no editar aquí".

Las piezas de backend son funciones **puras**: no hacen sus propias consultas a SharePoint/Graph; cada portal hace
sus consultas y guarda sus datos. Se prueban con Node solo: `node lib/<pieza>.test.js`.

**Excepción: `lib/sql-mirror` (CFO 22/10/2026)** sí escribe, en SQL (Postgres en Neon), no en SharePoint: envuelve el
`graphFetch` de cada portal y copia a la tabla del mismo nombre cada guardado en una lista (crear, cambiar, borrar).
SharePoint sigue siendo lo que se usa y se lee; si la copia falla, el guardado sigue normal y se escribe en el log.
Sin la variable `SQL_MIRROR_URL` no hace nada. Su prueba usa un Postgres en memoria:
`npm i --no-save @electric-sql/pglite && node lib/sql-mirror.test.js`. Es la única pieza con dependencia
(`@neondatabase/serverless`).
Con él va `lib/sql-read` (CFO 22/10/2026): las lecturas de listas (GET) según el switch Developer › SQL migration ›
Read from (Settings `SqlReadMode`, uno para test y otro para producción): `sharepoint` (como siempre), `compare`
(contesta SharePoint y anota en la tabla `_read_diffs` lo que SQL contestaría distinto) o `sql` (contesta SQL; si
falla o tarda, SharePoint). Los crons (`context({ background: true })` en el ruteador de cada portal), la copia, el
Compare, `Settings` y `EquipmentPieces` (candado If-Match) leen siempre de SharePoint. Prueba: `node lib/sql-read.test.js`.

**Fotos: `lib/photo-link` y `lib/gallery-build` (CFO 30/10/2026).** Estas sí consultan Graph (con el `graph` del portal).
`photo-link`: la liga de cada foto que regresan las galerías ya no es la de SharePoint (caduca en ~1 h) sino
`/api/photo?i=<id>&e=<vence>&s=<firma>` (HMAC con `PHOTO_LINK_SECRET` o, si no hay, una llave sacada de
`GRAPH_CLIENT_SECRET`; vence en 7–14 días, igual toda la semana) y el servidor contesta 302 a un downloadUrl fresco
(memoria de 20 min por id; lo que trae el listado de la carpeta ya cuenta). `&k=t` = miniatura, `&f=1` = los bytes
desde el mismo dominio (zip de "Download all"). Cada portal: `lib/photo-link.js` (una línea) y la ruta pública `photo`
en `api/[...slug].js`. `gallery-build`: lo común de las 3 galerías (carpetas, pie por servicio, fechas en hora de
Iowa, `photoFields` con la liga nueva, `photoMarker` = "llegó una foto" para `GSGalleryGroups.watch`).
Pruebas: `node lib/photo-link.test.js`, `node lib/gallery-build.test.js`.

**`live-refresh`: modo idle (CFO 22/10/2026).** A los 10 min sin mover nada la pantalla se oscurece un poco y deja de
revisar; con cualquier movimiento se aclara y revisa al momento. Prueba: `npm i --no-save jsdom && node live-refresh/live-refresh.test.js`.

### Lo del servidor que antes estaba copiado en los portales (Arreglo 30/10/2026)

Cada portal lo carga con UNA linea desde su archivo de siempre (`lib/graph.js`, `site-image.js`, ...). Pruebas:
`node lib/<pieza>.test.js`.

- **`lib/graph-core`**: el cliente de Graph. `require('gsocd-shared/lib/graph-core')({ portal, catalog })`.
  Antes 3 `lib/graph.js` (Admin 472, Orders 419, Tech 387 renglones). Lo que era distinto y como quedo:
  1. sp-heal: Admin y Tech si, Orders no (lo que faltaba lo creaba el cron de Admin) -> los 3 con el mismo catalogo.
  2. Catalogo: Admin `lib/sp-columns.js` tenia el SPEC y Tech una copia de 30 renglones -> uno solo, `lib/sp-catalog.js`;
     los dos lo leen completo.
  3. Error de Graph con `.status`: Admin y Tech si, Orders no -> los 3 si (en Orders `order-docs` ahora contesta el
     status de SharePoint en vez de 500, como Admin y Tech).
  4. `getSiteId`: Orders por el `graphFetch` envuelto, Admin/Tech directo -> directo (es un GET; no cambia nada).
  5. `listChildren(path, { thumbs })`, `thumb` y `webUrl`: solo Admin -> los 3 (campos de mas, nadie los pierde).
  6. `deleteDriveItemById` solo Admin; `geocodeAddress` Admin y Orders -> los 3.
  7. Listas: cada uno exportaba las suyas -> la union (mismo SharePoint; `PromoCodes`/`RedeemedPromoCodes` de Orders).
  Igual en los 3, como ya estaba: token con cache ~55 min por instancia, reintentos 429/503 (`lib/graph-retry`),
  copia a SQL de cada guardado (`lib/sql-mirror.wrap`), `jsonResponse`.
- **`lib/sp-catalog`**: las listas/columnas/indices que el codigo necesita (antes en Admin `lib/sp-columns.js`).
- **`lib/list-query` `fetchByField(list, field, value, opts)`**: un valor exacto, con el apostrofo escapado ("O'Brien").
  Reemplaza 35 copias en los endpoints (varias sin escapar, algunas sin paginar). Si falla, lanza (como las copias);
  `opts.fallback` para leer la lista completa; `opts.fields` para regresar solo los fields.
- **`lib/recurring-published`** (`audience: office | client | tech`): contratos sin publicar. Si la lista de
  contratos no se puede leer: office no esconde nada (y lo anota en el log); client y tech contestan 503 (la pantalla
  se queda con lo ultimo que vio y reintenta). Antes Admin ensenaba todo y Orders/Tech escondian sin avisar.
- **`lib/history-dedupe`**, **`lib/photo-name`** (nombre de las fotos subidas), **`lib/site-image`** (proxy publico
  de imagenes; `supply` solo Admin, Tech solo `name`), **`lib/order-document`** (get-order-document) y
  **`lib/order-detail`** (get-order-detail; `audience: 'client'` es una lista cerrada de campos: lo de la oficina
  nunca le llega al cliente).

## Reglas que siguen vigentes

- **`camera-capture.html` va una copia por dominio** (vive en los 3 repos), porque IndexedDB no cruza dominios.
- **Las fotos siempre se guardan:** `camera-queue` es genérico y no sabe de endpoints; `notReady`/`release` existen
  solo para la orden nueva que todavía no tiene OrderID. El video sigue con la cámara nativa del teléfono.
- **`ServicesCatalog` es la fuente del selector de servicios**; `Services` es la lista vieja. `Category` no la toca el
  import; se edita a mano en Admin › Developer.
- **`groupByCategory: true`** es el estándar donde se crea o edita una orden o plantilla (Admin y Orders).

## Componentes disponibles

| Componente | Carpeta | Qué hace |
|---|---|---|
| Lightbox de fotos | [`lightbox/`](./lightbox) | Ver fotos en pantalla completa con flechas, sin descargarlas ni navegar a otra pestaña |
| Reloj y calendario | [`date-time-picker/`](./date-time-picker) | Elegir fecha y/o hora con el estilo oficial ya usado en toda la app |
| Selector de servicios | [`service-picker/`](./service-picker) | Buscador + chips o filas con niveles L1/L2/L3, para elegir servicios de un catálogo |
| Barra de navegación | [`nav-premium/`](./nav-premium) | Tarjeta dorada de pestañas + `<nav>` con logo -- usada por las 3 apps |
| Preview de foto al pasar el mouse | [`photo-hover-preview/`](./photo-hover-preview) | Al quedarse 1s con el mouse sobre una miniatura, crece a tamaño máximo en pantalla sin clic. Usado en Admin y Orders. |
| Lista + selector + diff de servicios | [`service-change-panel/`](./service-change-panel) | Servicios actuales (nombre + nota + cámara), selector real y diff agregados/quitados con nota obligatoria. Usado en Orders (Recurring, Processing) y Admin. |
| Llave contra órdenes duplicadas | [`submit-key/`](./submit-key) + [`lib/submit-key.js`](./lib/submit-key.js) | Cada envío que crea una orden lleva `SubmitKey` (amarrada al contenido del formulario); reintentar lo mismo regresa la orden que ya existía, también en un PO a medias. Admin (Create Order, Add Unit) y Orders (New Order, Add Unit). |
| Cargar sin error | [`load/`](./load) | `GSLoad.get(key, fn)`: si leer algo falla por la señal o el sistema (5xx, 504, sin red), la pantalla se queda en "Loading…" y se reintenta sola (2 s … 5 min, y al volver la señal); solo un error de dato (400/403/404/409) llega a la pantalla. `onStuck` a los 15 min a la vista y despierta (sin alerta si ya enseña lo guardado; `info.kind = 'load'`). Tiempo límite por intento (60 s, `opts.timeoutMs`; fn recibe `{ signal }`), solo lecturas. Regla del dueño 05/10; arreglo 30/10. Los 3 portales. |
| Recámaras y baños de una orden | [`lib/order-rooms.js`](./lib/order-rooms.js) + `GSOrderFormPremium.roomsNone / setRoomsHidden` | Bedrooms/Bathrooms son columnas de número: `roomNumber` (vacío -> null). Una orden de Recurring (áreas comunes) va sin ellos (dueño 16/10/2026): en el formulario se esconden y no se piden; agregar una unidad a un lote que ya va sin ellos tampoco los pide (`roomsNone`). Admin y Orders, por npm y en el navegador. |
| Paquetes = templates | [`templates/templates.js`](./templates/templates.js) | `GSTemplates` (navegador) y `require('gsocd-shared/templates/templates')` (servidor): un template / My package es la foto de servicios sueltos con nivel y cantidad; los paquetes se guardan desarmados (`itemsFromPicker`), los templates viejos con el SKU del paquete se desarman al leerlos (`itemsOf`, `toSets`, `pickerStateOf`), `normalize` / `check` (nada vacío ni repetido), `sameName` (mismo nombre = se actualiza), `forClient` (propios + públicos, sin el público igual al suyo), `divisionFor`. CFO 22/10/2026. Orders (New Order, Templates) y Admin (Create Order, Developer › Templates). |
| Fechas en día de Iowa | [`dates/`](./dates) | `GSDates.day / fmtDate / fmtDateTime / today`: una fecha sola o a medianoche UTC sale en su día (antes salía un día antes en Chicago); con hora, su día y hora de Iowa. Los 3 portales. Prueba `node dates/dates.test.js`. |
| Escapar texto | [`escape/`](./escape) | `GSEscape.esc / escAttr / jsStr`: escapa & < > " ' (la copia con el DOM no escapaba comillas dentro de atributos). Los 3 portales. Prueba `node escape/escape.test.js`. |
| Login de Admin en cada petición | [`admin-auth/`](./admin-auth) | `GSAdminAuth.fetch / token / query / msal`: ID token de Microsoft en cada `/api`, se renueva solo, un 401 pide token nuevo y reintenta, un 401 doble = UNA vuelta al login (sin rebotar sin fin). Todas las páginas de Admin. Prueba `node admin-auth/admin-auth.test.js`. |
| Cliente de API de Orders y Tech | [`api-client/`](./api-client) | `GSApiClient.create({...})` -> `GS.api` + `GS.offline`: `opts.load` por GSLoad, lecturas guardadas para sin señal (mismas llaves de antes), 401 de sesión -> login, errores con `.status`. Prueba `node api-client/api-client.test.js`. |
| Regla de Division Mixed (backend) | [`lib/division-rules.js`](./lib/division-rules.js) | Detecta si los servicios que se van a guardar en una orden pertenecen a otra división y calcula el cambio a 'Mixed' -- función pura de Node, no de navegador. Va como copia en Admin y Orders. |

## Cómo agregar un componente nuevo (para referencia futura)

1. Crear su propia carpeta (ej. `reloj/`).
2. El archivo debe inyectarse su propio HTML/CSS solo si los necesita — el portal que lo use no
   debería tener que copiar nada más que la línea del `<script>`.
3. Documentar arriba del archivo: para qué sirve, y cómo se usa (mismo formato que
   `lightbox/lightbox.js`).
4. Agregar el componente a la tabla de arriba en este README.
5. Subirlo a `main` de este repo y, en el portal que lo use, poner el SHA nuevo (en su rama `preview`).

## order-history

Componente compartido para armar el historial de una orden -- una sola pieza para Admingsocd.com (staff), tech.gsocd.com (staff) y ordersgsocd.com (cliente). Agrupa/etiqueta/filtra igual sin importar quien la llama; el filtrado por modo (`staff` vs `client`) es lo único que cambia qué se ve, nunca cómo se llama lo que sí se ve.

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@<sha>/order-history/order-history.js"></script>
```

```js
// modo staff (Admin, Tech) -- todo, sin filtrar
const html = GSOrderHistory.html(orderId, history, { mode: 'staff' });

// modo client (Orders) -- filtrado a lo que le corresponde ver al cliente
const html = GSOrderHistory.html(orderId, history, { mode: 'client' });
```

`history` es el arreglo COMPLETO tal cual viene del backend -- este componente nunca lo trunca por fecha ni por contexto (quien llama nunca debe recortarlo antes de mandarlo).

## nav-premium

Formato OFICIAL de la barra de navegación superior -- tarjeta dorada con el logo real de GS Solutions flotando y rebotando dentro, destellos animados, y pestañas con línea subrayada deslizante. La usan las 3 apps (Admin, Orders, Tech) para su barra de pestañas.

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@<sha>/nav-premium/nav-premium.js"></script>
```

**`GSNavPremium.init(containerId, tabs)`** -- construye la tarjeta dorada completa dentro de `<div id="containerId"></div>`. Cada pestaña acepta:

```js
GSNavPremium.init('gsNav', [
  { label: 'New Order', href: 'customer.html', active: true },
  { label: 'Templates', dataView: 'templates', onclick: "showTab('templates')" },
  { label: 'Approvals', badgeHtml: '<span class="tab-count" id="appr-count">0</span>' }
]);
```
- `label` (obligatorio)
- `href` **o** `onclick` (string de JS) -- nunca ambos
- `active` -- cuál pestaña corresponde a la página actual
- `id` -- id personalizado del elemento (para páginas con lógica propia, ej. tracking.html)
- `dataView` -- para páginas que buscan su pestaña por `[data-view]` (Tech)
- `badgeHtml` -- HTML crudo de un contador, se agrega tal cual después del texto

**`GSNavPremium.showPanel(tab)`** -- cambia de pestaña SIN recargar ni parpadear: marca `[data-view="tab"]` como activo y muestra solo `#panel-tab` (oculta los demás `.panel`). Es la parte genérica de cambiar de vista en una página de un solo archivo con varios paneles fusionados (ej. admin.html: Approvals/Review/Gallery/Developer/etc, todos viven en el mismo archivo). El `showTab()` propio de cada página llama a esto adentro, y encima le agrega sus propios redirects o callbacks:

```js
function showTab(tab) {
  if (tab === 'assigned') { showTab('active'); showActiveSubTab('employee'); return; } // redirect propio
  GSNavPremium.showPanel(tab); // parte generica
  if (tab === 'schedule') onScheduleTabOpened(); // callback propio
}
```

**`GSNavPremium.applyChrome()`** -- inyecta las dimensiones OFICIALES del `<nav>` de arriba (el que trae el logo, distinto de la tarjeta dorada de pestañas): padding, alto mínimo, tamaño del logo. Se llama una vez al arrancar la página; inyecta un `<style>` una sola vez aunque se llame varias veces. Con esto, ningún portal necesita repetir estos valores a mano en su propio CSS -- si hay que ajustar el tamaño, se cambia aquí una vez y las 3 apps se actualizan solas la próxima vez que suban esa versión:

```js
if (client) {
  GSNavPremium.applyChrome();
  // ... resto del arranque de la pagina
}
```

Para que `applyChrome()` funcione, el HTML de cada página debe usar estos nombres: `<nav>` (el contenedor), y el logo dentro de `.nav-logo img` o con clase `.logo-diamond` -- si el logo usa otro selector, `applyChrome()` no lo va a alcanzar.

**`GSNavPremium.refresh(containerId)`** -- reacomoda la línea dorada debajo de la pestaña activa actual. Se llama después de que algo de afuera le cambia el ancho a una pestaña YA renderizada (ej. un contador que arranca en 0 y luego se actualiza al número real).

## order-details

`GSOrderDetails` (02/10/2026): el bloque "Order Details" en 3 grupos (When / Where / Who), el día asignado de una
orden (`assignedDayText`) y la ventana corta (`shortWindow`). Ver el comentario de arriba del archivo para las opciones.
```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@<sha>/order-details/order-details.js"></script>
```

## order-badges

Componente compartido para los badges de "unidad ocupada" y "se necesita algo de la oficina" -- una sola pieza para Admingsocd.com, tech.gsocd.com y ordersgsocd.com.

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@<sha>/order-badges/order-badges.js"></script>
```

```js
GSOrderBadges.occupied(o)       // badge azul, o '' si no aplica
GSOrderBadges.officeNeed(o)     // badge morado, o '' si no aplica
GSOrderBadges.officeNeedNote(o) // texto completo, o '' si no aplica
```

## print-button

Botón "Print"/"Print PDF" de una orden -- una sola pieza para Admingsocd.com (staff) y ordersgsocd.com (cliente), para que los 2 portales impriman bajo las mismas reglas.

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@<sha>/print-button/print-button.js"></script>
```

```js
GSPrintButton.html(order, { label: 'Print', className: 'gs-ofp-btn-secondary', storedDoc: null })
```

Se habilita desde que la orden ya se asignó (`Status !== 'Received'`) -- ya no depende de que exista un archivo guardado en ese momento; el backend (`get-order-document.js`) genera uno sobre la marcha si hace falta. Si el estatus es `Completed`, pide el documento de completion (con fotos) en vez del normal -- todo esto resuelto adentro del `onclick` que ya trae el HTML, sin que el portal tenga que conectar nada aparte.
