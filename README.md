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

## Componentes disponibles

| Componente | Carpeta | Qué hace |
|---|---|---|
| Lightbox de fotos | [`lightbox/`](./lightbox) | Ver fotos en pantalla completa con flechas, sin descargarlas ni navegar a otra pestaña |
| Reloj y calendario | [`date-time-picker/`](./date-time-picker) | Elegir fecha y/o hora con el estilo oficial ya usado en toda la app |
| Selector de servicios | [`service-picker/`](./service-picker) | Buscador + chips o filas con niveles L1/L2/L3, para elegir servicios de un catálogo |
| Barra de navegación | [`nav-premium/`](./nav-premium) | Tarjeta dorada de pestañas + `<nav>` con logo -- usada por las 3 apps |

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
