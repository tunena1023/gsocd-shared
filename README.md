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

Por npm se usan `lib/order-pdf`, `lib/pdf`, `lib/push`, `lib/order-seq`, `lib/site-readiness`,
`lib/schedule-entries` y `lib/service-notes`. Para pasar a una versión nueva: cambiar el SHA en el `package.json` de
Admin y Orders (Vercel instala solo en cada deploy).

**Excepción, van como COPIA en cada portal:** `lib/notify.js` (copia idéntica en Admin, Orders y Tech) y
`lib/division-rules.js` (copia en Admin y Orders). Si cambian aquí, se copian a mano a esos portales en el mismo
cambio; el encabezado de la copia dice "no editar aquí".

Las piezas de backend son funciones **puras**: no hacen sus propias consultas a SharePoint/Graph; cada portal hace
sus consultas y guarda sus datos. Se prueban con Node solo: `node lib/<pieza>.test.js`.

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
