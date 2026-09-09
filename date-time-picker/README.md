# Reloj y Calendario

Selector de fecha (calendario) y de hora (reloj circular), en el estilo oficial ya usado en toda
la app. Depende de la paleta de colores de marca (`--gold`, `--black`, `--white`, `--off`,
`--gray`, `--border`, `--gold-dk`) — si la página no los define, cada color tiene un respaldo
razonable, pero se ve mejor si la página ya los define (los 3 portales ya los tienen).

## Uso

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@v1.0.0/date-time-picker/date-time-picker.js"></script>
```

### Campo de fecha

```js
GSDateTimePicker.dateHtml(fieldId, initialISO, placeholder, options)
```

- `fieldId`: id único para este campo (se usa como id del `<input type="hidden">` real).
- `initialISO`: fecha ya elegida, formato `'YYYY-MM-DD'`, o `null` si no hay ninguna todavía.
- `placeholder`: texto del botón cuando no hay fecha (opcional, por defecto "Pick a date").
- `options` (opcional): `{ min, max }`, cada uno `'YYYY-MM-DD'` o `null`. Los días fuera de ese
  rango se ven apagados y no se pueden elegir — igual que `min`/`max` en un `<input type="date">`
  nativo, pero respetado por este calendario propio.

Devuelve el HTML completo (input oculto + botón + calendario) — se inserta donde se necesite,
normalmente dentro de un template string junto al resto del formulario.

### Campo de hora

```js
GSDateTimePicker.timeHtml(fieldId, initialHHMM, placeholder)
```

Igual que arriba, pero `initialHHMM` es formato 24 horas (`'14:30'`), y por defecto dice "Pick a
time".

### Leer el valor elegido

```js
GSDateTimePicker.getDate(fieldId)   // 'YYYY-MM-DD' o null
GSDateTimePicker.getTime(fieldId)   // 'HH:MM' (24h) o null
```

También se puede leer directo del input oculto: `document.getElementById(fieldId).value`.

### Cuando el valor se cambia desde fuera (cargar un borrador, editar una orden existente)

Si el código de la página pone `document.getElementById(fieldId).value = '2026-09-15'` directamente
(sin pasar por el calendario/reloj), el botón visible no se entera solo — hay que avisarle:

```js
document.getElementById('entryDate').value = '2026-09-15';
GSDateTimePicker.syncDate('entryDate');   // el boton ahora dice "Sep 15, 2026"

document.getElementById('entryTime').value = '14:30';
GSDateTimePicker.syncTime('entryTime');   // el boton ahora dice "2:30 PM"
```

Si el input queda vacío, `syncDate`/`syncTime` regresan el botón a su texto de "Pick a date/time".

### Reaccionar cuando se elige algo (por ejemplo, para guardar automático)

```js
document.addEventListener('gs-date-picked', (e) => {
  console.log(e.detail.fieldId, e.detail.value); // 'entryDate', '2026-09-15'
});
document.addEventListener('gs-time-picked', (e) => {
  console.log(e.detail.fieldId, e.detail.value); // 'entryTime', '14:30'
});
```

## Comportamiento

- Cada campo es independiente — pueden convivir varios en la misma pantalla (ej. Entry Date +
  Entry Time + Due Date), cada uno con su propio `fieldId`.
- Abrir cualquier calendario o reloj cierra cualquier otro que estuviera abierto en la página.
- Clic fuera de un popover abierto lo cierra.
- El reloj primero pide la hora, luego pasa solo a minutos — se puede tocar el número de hora o
  de minuto en el resultado (arriba del reloj) para regresar a ese paso.
- Al elegir una fecha u hora, el input oculto también dispara su propio evento nativo `'change'`
  (además del `'gs-date-picked'`/`'gs-time-picked'` de arriba) — así una página que ya escuche
  `change` en ese input (patrón común) sigue funcionando sin cambios.

## Historial

- **v1.1.7** — `dateHtml` acepta un 4to parámetro `options` con `{ min, max }` (fechas límite en
  formato `'YYYY-MM-DD'`). Los días fuera de ese rango se ven apagados y no se pueden elegir.
  Necesario para el panel de "Assign" en `admin.html`, que ya usaba `min`/`max` nativos del
  navegador (la fecha asignada tiene que caer entre Entry Date y Due Date de la orden).
- **v1.1.6** — `dateHtml`/`timeHtml` ahora SI limpian el estado interno cuando se llaman sin valor
  inicial (antes solo lo hacía `syncDate`/`syncTime`, no la generación del HTML). Encontrado al
  conectar Create Order en `admin.html`: el formulario se regenera con el mismo `fieldId` cada
  vez que se abre para un cliente distinto — sin este arreglo, el calendario podía seguir
  mostrando el mes/día que había dejado el cliente anterior, aunque el botón dijera "Pick a date".
- **v1.1.5** — El popover cambia de `position: absolute` a `position: fixed`, con su propio
  cálculo de posición en JS (relativo al botón que lo abre, recorriéndose si se saldría de
  pantalla por la derecha). Encontrado al conectar Create Order en `admin.html`: ese formulario
  vive dentro de una tarjeta con `overflow: hidden` — con `position: absolute`, el calendario/reloj
  se hubiera recortado o desaparecido al abrirse ahí. `position: fixed` no depende de ningún
  ancestro, funciona igual sin importar qué contenedor envuelva al campo.
- **v1.1.2** — Al elegir fecha/hora, el input oculto también dispara su evento nativo `'change'`
  (compatible con paginas que ya escuchaban ese patron estandar).
- **v1.1.1** — Se agrega `syncDate`/`syncTime`, para cuando el valor se pone desde fuera (cargar un
  borrador, editar una orden existente) sin pasar por el calendario/reloj.
- **v1.0.0** — Primera versión. Extraído de las copias que vivían por separado en `admin.html` y
  `developer.html` (Admingsocd.com), y en `tracking.html`, `customer.html`, y `profile.html`
  (ordersgsocd.com).
