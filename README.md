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

*(Siguen pendientes de mover aquí: reloj/calendario, selector de servicios por chips/niveles —
ver el `CHANGELOG.md` conforme se vayan agregando.)*

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
