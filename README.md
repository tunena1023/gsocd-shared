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

**Siempre se usa una versión específica, nunca "lo que sea que esté ahora".** Así, un cambio aquí
nunca le llega a un portal hasta que alguien decide a propósito subirlo a esa versión nueva —
igual que ya se usa `ultimo-build-bueno-2026-09-08` en los otros 3 repos como punto seguro de
regreso.

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@v1.0.0/lightbox/lightbox.js"></script>
```

Para pasar a una versión nueva, se cambia el número (`@v1.0.0` → `@v1.1.0`) en cada portal que la
use, uno a la vez — nunca los 3 al mismo tiempo sin haber probado primero.

## Piezas de backend (Node) -- desde v1.34.0

Hasta v1.33.0, todo lo de este repo era código de **navegador**: se sirve por jsDelivr y se
carga con `<script src="...">` en las páginas HTML de los 3 portales.

Desde v1.34.0 este repo *también* puede tener piezas de **backend (Node)** -- lógica que corre
del lado del servidor, en las funciones serverless de cada portal (`admin-update-order.js`,
`submit-supervisor-update.js`, etc.), no en el navegador. Esas piezas viven en `lib/` (ver
`lib/division-rules.js` para el primer ejemplo real).

**Cómo lo usa cada portal (distinto al navegador):** en vez de una URL de jsDelivr, el repo se
instala como una dependencia real de `npm`, apuntando a un tag fijo (mismo criterio de "nunca
la más nueva, siempre una versión específica" que ya usa todo lo demás aquí):

```json
"dependencies": {
  "gsocd-shared": "github:tunena1023/gsocd-shared#v1.34.0"
}
```

Y se usa con `require()` normal, como cualquier otro paquete de `node_modules`:

```js
const { resolveOrderDivision } = require('gsocd-shared/lib/division-rules');
// o, si se necesita mas de una pieza:
const { divisionRules } = require('gsocd-shared');
```

Para pasar a una versión nueva: cambiar el tag en el `package.json` de cada portal (uno a la
vez, igual que con las piezas de navegador) y correr `npm install` de nuevo -- Vercel lo hace
solo en cada deploy.

Las piezas de backend son funciones **puras** a propósito: no hacen sus propias consultas a
SharePoint/Graph ni saben nada de `createListItem`/`updateListItemByItemId` -- cada portal
sigue siendo el que hace sus propias consultas y guarda sus propios datos; estas piezas solo
calculan, para poder probarlas con Node solo (`node lib/division-rules.test.js`), sin necesitar
credenciales ni conexión a nada.

## Componentes disponibles

| Componente | Carpeta | Qué hace |
|---|---|---|
| Lightbox de fotos | [`lightbox/`](./lightbox) | Ver fotos en pantalla completa con flechas, sin descargarlas ni navegar a otra pestaña |
| Reloj y calendario | [`date-time-picker/`](./date-time-picker) | Elegir fecha y/o hora con el estilo oficial ya usado en toda la app |
| Selector de servicios | [`service-picker/`](./service-picker) | Buscador + chips o filas con niveles L1/L2/L3, para elegir servicios de un catálogo |
| Barra de navegación | [`nav-premium/`](./nav-premium) | Tarjeta dorada de pestañas + `<nav>` con logo -- usada por las 3 apps |
| Preview de foto al pasar el mouse | [`photo-hover-preview/`](./photo-hover-preview) | Al quedarse 1s con el mouse sobre una miniatura, crece a tamaño máximo en pantalla sin clic. Usado en Admin y Orders. |
| Lista + selector + diff de servicios | [`service-change-panel/`](./service-change-panel) | Servicios actuales (nombre + nota + cámara), selector real y diff agregados/quitados con nota obligatoria. Usado en Orders (Recurring, Processing) y Admin. |
| Regla de Division Mixed (backend) | [`lib/division-rules.js`](./lib/division-rules.js) | Detecta si los servicios que se van a guardar en una orden pertenecen a otra división y calcula el cambio a 'Mixed' -- función pura de Node, no de navegador. Usado en Admin, Tech y Orders. |

Los 3 quedan listos para conectar — todavía ningún portal usa el reloj/calendario ni el selector
de servicios (solo Tech está conectado al lightbox por ahora).

## Cómo se numeran las versiones

`vMAYOR.MENOR.PARCHE` (ej. `v1.2.0`):

- **PARCHE** (`v1.0.0` → `v1.0.1`): se arregló un bug, nadie tiene que cambiar cómo lo usa.
- **MENOR** (`v1.0.0` → `v1.1.0`): se agregó algo nuevo (otro componente, u otra opción en uno
  que ya existía), sin romper lo que ya funcionaba.
- **MAYOR** (`v1.0.0` → `v2.0.0`): algo que ya funcionaba de una forma, ahora funciona distinto —
  el portal que lo use tiene que revisar su código, no solo cambiar el número.

## Cómo agregar un componente nuevo (para referencia futura)

1. Crear su propia carpeta (ej. `reloj/`).
2. El archivo debe inyectarse su propio HTML/CSS solo si los necesita — el portal que lo use no
   debería tener que copiar nada más que la línea del `<script>`.
3. Documentar arriba del archivo: para qué sirve, y cómo se usa (mismo formato que
   `lightbox/lightbox.js`).
4. Agregar el componente a la tabla de arriba en este README.
5. Subir una nueva versión (`git tag vX.X.X`) — nunca se sube sin etiqueta, porque los portales
   siempre piden una versión específica, nunca "lo más nuevo".

## order-history

Componente compartido para armar el historial de una orden -- una sola pieza para Admingsocd.com (staff), tech.gsocd.com (staff) y ordersgsocd.com (cliente). Agrupa/etiqueta/filtra igual sin importar quien la llama; el filtrado por modo (`staff` vs `client`) es lo único que cambia qué se ve, nunca cómo se llama lo que sí se ve.

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@v1.3.0/order-history/order-history.js"></script>
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
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@v1.24.0/nav-premium/nav-premium.js"></script>
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

## order-badges

Componente compartido para los badges de "unidad ocupada" y "se necesita algo de la oficina" -- una sola pieza para Admingsocd.com, tech.gsocd.com y ordersgsocd.com.

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@v1.7.0/order-badges/order-badges.js"></script>
```

```js
GSOrderBadges.occupied(o)       // badge azul, o '' si no aplica
GSOrderBadges.officeNeed(o)     // badge morado, o '' si no aplica
GSOrderBadges.officeNeedNote(o) // texto completo, o '' si no aplica
```

## print-button

Botón "Print"/"Print PDF" de una orden -- una sola pieza para Admingsocd.com (staff) y ordersgsocd.com (cliente), para que los 2 portales impriman bajo las mismas reglas.

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@v1.30.0/print-button/print-button.js"></script>
```

```js
GSPrintButton.html(order, { label: 'Print', className: 'gs-ofp-btn-secondary', storedDoc: null })
```

Se habilita desde que la orden ya se asignó (`Status !== 'Received'`) -- ya no depende de que exista un archivo guardado en ese momento; el backend (`get-order-document.js`) genera uno sobre la marcha si hace falta. Si el estatus es `Completed`, pide el documento de completion (con fotos) en vez del normal -- todo esto resuelto adentro del `onclick` que ya trae el HTML, sin que el portal tenga que conectar nada aparte.
