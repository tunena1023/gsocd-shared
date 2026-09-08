# Selector de servicios

Buscador + cuadritos (chips) o filas con niveles L1/L2/L3, para elegir servicios de un catálogo.
Dos modos: `'toggle'` (un chip, se prende o apaga) y `'levels'` (fila con 3 botones de nivel).

## Uso

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@v1.0.0/service-picker/service-picker.js"></script>
```

```js
const picker = GSServicePicker.mount(pickerId, container, options);
```

- `pickerId`: id único para esta instancia (puede haber varias en la misma pantalla).
- `container`: elemento del DOM, o el id de uno, donde se dibuja el selector completo.
- `options`:
  - `catalog`: arreglo de servicios `{ sku, serviceName, division, propertyType }`.
  - `division`: qué división mostrar (ej. `'Janitorial'`).
  - `mode`: `'toggle'` o `'levels'`.
  - `filterMode`: `'all'` (por defecto) muestra todo el catálogo de entrada, se va acotando al
    buscar. `'selected-plus-search'` no muestra nada hasta que se escribe algo — **excepto** lo
    que ya está elegido, que siempre se ve (para poder quitarlo o cambiarle el nivel sin tener
    que volver a buscarlo). Útil al editar algo que ya existe (una orden, un template) en vez de
    armar uno desde cero.
  - `crossDivision`: si es `true`, la búsqueda no se limita a `division` — cruza todo el catálogo
    (por defecto `false`).
  - `propertyType`: `'Commercial'` (por defecto) o `'Residential'`.
  - `showPropertyToggle`: mostrar el interruptor Residential/Commercial (por defecto `true`).
  - `showSelectAll`: mostrar el control "Select all L1/L2/L3" (por defecto `false`, típico solo en
    modo `'levels'`).
  - `initialSelected` / `initialLevels`: para pre-llenar (ej. al editar una orden que ya tiene
    servicios elegidos).
  - `onChange(selected, svcLevel, propertyType)`: función que se llama cada vez que algo cambia —
    ya sea la selección o el tipo de propiedad (opcional).

`mount()` devuelve un objeto con:

```js
picker.getSelected()          // { propertyType: { nombreServicio: sku } }
picker.getLevels()            // { 'propertyType|nombreServicio': 'Level 2' }
picker.getPropertyType()      // 'Commercial' o 'Residential', el actual
picker.setSelected(sel, lvl)  // pre-llenar despues de montado
picker.setDivision(div)       // cambiar de division sin volver a montar
picker.setPropertyType(tipo)
picker.setCatalog(catalogo)
picker.destroy()
```

## Reaccionar a los cambios (alternativa a `onChange`)

```js
document.addEventListener('gs-services-changed', (e) => {
  console.log(e.detail.pickerId, e.detail.selected, e.detail.svcLevel);
});
```

## Historial

- **v1.2.0** — Se agrega `filterMode` (`'selected-plus-search'`, para editar algo que ya existe
  sin mostrar el catálogo completo de entrada), `crossDivision` (buscar sin límite de división),
  y `getPropertyType()` — el tipo de propiedad ahora también se puede leer desde fuera, y cambiar
  de tipo también dispara `onChange`/`gs-services-changed`. Encontrado al revisar TODOS los
  lugares candidatos a usar este componente (customer.html, templates.html, admin.html ×3,
  developer.html, recurring.html) antes de conectar el primero, en vez de ir descubriendo huecos
  uno a la vez.
- **v1.0.0** — Primera versión. Extraído de las 3 copias que vivían dentro de `admin.html`
  (Approvals/Review, Active, Create Order), más las de `developer.html`, `recurring.html`,
  `customer.html`, y `templates.html`. (`supervisor.html` de tech.gsocd.com se ve parecido —
  mismo estilo de botones L1/L2/L3 — pero es una herramienta distinta: modifica los servicios de
  una orden que ya existe, con quitar/deshacer, no arma una selección desde el catálogo. No es
  candidato a este componente.)
