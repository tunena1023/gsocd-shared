# Selector de servicios

Buscador + cuadritos (chips) o filas con niveles L1/L2/L3, para elegir servicios de un catálogo.
Dos modos: `'toggle'` (un chip, se prende o apaga) y `'levels'` (fila con 3 botones de nivel).

## Uso

```html
<script src="https://cdn.jsdelivr.net/gh/tunena1023/gsocd-shared@<sha>/service-picker/service-picker.js"></script>
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
    Con el interruptor, al buscar también salen abajo ("Also in Residential") los que coinciden del
    otro tipo; al picar uno el interruptor se pasa a ese tipo (16/10/2026).
  - `otherTypeSearch`: `false` apaga ese "Also in …" (la CFO lo descartó el 18/10; Admin y Orders lo pasan en
    `false`). Sin la opción queda prendido, como antes (v1.68.0).
  - `packageEdit.clientName` (v1.70.0, 21/10/2026): el nombre del cliente que sale en el editor de paquete por cliente
    ("Save for …", "Only … gets this version", "Custom for …"). Sin él dice "this client"; el `clientId` ya no se enseña.
  - v1.72.0 (22/10/2026, CFO: paquetes = templates, "debe funcionar igual en todas partes"):
    - `place: 'template'`: el Edit de un paquete ya no tiene "Apply"; `commitEdit()` (lo llama Save Template) pasa
      lo editado a lo escogido y regresa `''` o el aviso. Cambiar de tarjeta con un Edit abierto se queda con lo editado.
      `hasOpenEdit()` dice si hay uno abierto.
    - `usualEdit.onSave(name, items, source, templateId)`: `items` traen `qty` en los que piden cantidad; `source` es
      `'usual'`, `'package'` o `'saved'` (un My package propio, con `templateId` para actualizarlo). Al guardar, la orden
      se queda con lo editado (el paquete sale y quedan sus servicios; lo que se quitó sale).
    - `savedSets[].shared: true` dice "Shared" y no trae Edit; los propios traen Edit.
    - `packageEdit.resetOnly: true` (Admin › Create Order): el Edit es el del portal (Save my package); solo queda
      "Reset to standard" para las versiones por cliente que ya existían.
  - `categoryStyle`: `'soft'` redondea las categorías (`groupByCategory`) y les pone borde y fondo más suaves
    (Developer › Package contents, variante A que escogió la CFO el 21/10/2026). Sin la opción, como antes (v1.71.0).
  - `categoryColumns`: `1` pone las categorías (`groupByCategory`) en una sola columna, para cuando el picker va en
    una columna angosta (Developer › Package contents, 21/10/2026: en 2 se cortaban los botones L1 L2 L3). Sin la
    opción, como antes: 2 columnas, y 1 a 640px o menos (v1.69.0).
  - v1.68.0 (21/10/2026, CFO: "todos los servicios los pueda ver todo mundo"): en Units ya salen los de Category
    "Common Areas" (antes v1.66.0 los quitaba). Van como la última categoría, cerrada; al buscar salen como cualquier
    otro. Recurring sigue igual (solo Commercial, tarjetas por área, sin paquetes).
  - `showSelectAll`: mostrar el control "Select all L1/L2/L3" (por defecto `false`, típico solo en
    modo `'levels'`).
  - `initialSelected` / `initialLevels`: para pre-llenar (ej. al editar una orden que ya tiene
    servicios elegidos).
  - `onChange(selected, svcLevel, propertyType)`: función que se llama cada vez que algo cambia —
    ya sea la selección o el tipo de propiedad (opcional).
  - v1.67.0 (19/10/2026, Admin "Correct this visit"), todo opcional; sin esto el picker pinta igual que antes:
    - `allowOff` + `offList` `{ sku: true }`: en cada servicio escogido, "Mark not done" / "Undo". Queda escogido y
      tachado ("Not done this visit").
    - `people`: `{ choices: [{ id, name }], bySku: { sku: [ids] } }`: chips de quién lo hizo, con × y "+ person…".
    - `tagOf(servicio) -> 'Extra' | ''`: etiqueta chica debajo del servicio.
    - `keepSelected` `{ sku: true }`: esos no se pueden quitar (se marcan "Not done").

`mount()` devuelve un objeto con:

```js
picker.getSelected()          // { propertyType: { nombreServicio: sku } }
picker.getLevels()            // { 'propertyType|nombreServicio': 'Level 2' }
picker.getOff()               // v1.67.0: { sku: true } escogidos marcados "Not done"
picker.getPeople()            // v1.67.0: { sku: [ids] } quién hizo cada escogido
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
