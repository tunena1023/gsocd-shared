/* ============================================================
   gsocd-shared / estimated-time / unit-time.js  (CFO 15/11/2026)
   El tiempo estandar de una orden con los tiempos POR UNIDAD del catalogo 111/222 (los mismos de Marketing,
   seed/standard-times.json), no con la suma de los tiempos por tarea de Service Times (Clara).
   Navegador (window.GSUnitTime, jsDelivr por SHA) y Node (require('gsocd-shared/estimated-time/unit-time')).

   - Tamano de la unidad = la banda del catalogo por recamaras / banos de la orden: A estudio, B 1 rec, C 2 rec / 1 bano,
     D 2 rec / 2 banos, E 3 rec o mas. Sin recamaras en la orden: B (1 rec / 1 bano, la unidad que mas se limpia:
     115 de 222 ordenes con tamano, produccion 15/11/2026), y el renglon lo dice ("size not on the order").
   - Un paquete por unidad (move-in, move-out, touch-up, regular, post-construction, detail) cuenta UNA vez su tiempo
     por unidad; las tareas de la orden que vienen de ese paquete (Orders.PackageContents) ya no suman por su cuenta.
     Nivel del paquete = el que tienen mas tareas del paquete (empate: el mas alto). Si la persona solo tiene parte de
     las tareas (Tech, por servicio), cuenta esa parte del paquete.
   - Lo que el catalogo no tiene por unidad (tareas de oficina, paquetes por edificio): opts.perTask(sku, level, qty),
     o sea los minutos de Service Times; asi nada de lo que ya tenia tiempo se queda sin el. Una tarea de limpieza
     (11x) en una orden sin recamaras (areas comunes, oficinas) tambien sigue con Service Times.
   - Rango para el tecnico: de X a Y, Y = X x (1 + MARGIN), MARGIN 15 % (una pausa corta o un paso mas lento sin que
     la empresa pierda). Precio y piso de comision usan X.
   El bloque DATA lo escribe estimated-time/build-unit-times.js desde el seed de Marketing (no editar a mano).
============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GSUnitTime = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MARGIN = 0.15;
  /*DATA*/
  var DATA = {"source":"Marketing seed/standard-times.json (CFO 15/11/2026)","entries":{"222-10":{"n":"Wall painting - Full Unit","u":"per unit, by size option A-E","o":[["A · 1 coat",318],["B · 1 coat",396],["C · 1 coat",480],["D · 1 coat",618],["E · 1 coat",720],["A · 2 coats",486],["B · 2 coats",606],["C · 2 coats",744],["D · 2 coats",966],["E · 2 coats",1128]]},"222-13":{"n":"Unit Full paint- PRIMER","u":"per unit, by size option A-E","o":[["A · Primer + 2 coats",804],["B · Primer + 2 coats",1002],["C · Primer + 2 coats",1224],["D · Primer + 2 coats",1584],["E · Primer + 2 coats",1848]]},"222-19":{"n":"Ceiling Paint","u":"per unit, by size option A-E","o":[["A · 1 coat",162],["B · 1 coat",198],["C · 1 coat",240],["D · 1 coat",306],["E · 1 coat",354]]},"222-48":{"n":"Touch-Up Paint","u":"per job, by scope option","o":[["A",47],["B",75],["C",39],["D · A",159],["D · B",198],["D · C",240],["D · D",309],["D · E",360]]},"222-52":{"n":"Prime Patches","u":"per job, by number of patches","o":[["A",30],["B",55]]},"222-103":{"n":"Common Area & Office Painting","u":"per 100 sq ft of wall or ceiling","o":[["A",30],["B",51],["C",75],["D",36]]},"222-11":{"n":"Door painting","u":"per door","o":[["A",25],["B",45]]},"222-95":{"n":"Door trim painting","u":"per piece","o":[["A",24]]},"222-96":{"n":"Window trim painting","u":"per piece","o":[["B",30]]},"222-39":{"n":"Trim painting (door and window)","u":"per piece","o":[["A",24],["B",30]]},"222-49":{"n":"Baseboard Painting","u":"per unit, by size option A-E","o":[["A",96],["B",120],["C",150],["D",180],["E",210]]},"222-14":{"n":"Caulking","u":"per area","o":[["A",55],["B",30],["C",30]]},"222-97":{"n":"Kitchen cabinet painting","u":"per kitchen / vanity, by scope","o":[["A",375],["B",180]]},"222-98":{"n":"Bathroom cabinet painting","u":"per vanity","o":[["C",83]]},"222-28":{"n":"Cabinet touch-up / repaint","u":"per job, by scope","o":[["D",60],["A",375],["B",180],["C",83]]},"222-27":{"n":"Drywall & wall repair - minor to moderate","u":"per job, by level","o":[["A",150],["B",270],["C",60,"per hour"]]},"222-30":{"n":"Drywall sanding & finishing","u":"per job, by scope","o":[["A",95],["B",350]]},"222-44":{"n":"Ceiling Repair","u":"per job, by level","o":[["A",150],["B",270],["C",60,"per hour"]]},"222-90":{"n":"Ceiling texture removal","u":"per unit, by size option A-E","o":[["A",675],["B",940],["C",1205],["D",1500],["E",1855]]},"222-91":{"n":"Ceiling texture application","u":"per unit, by size option A-E","o":[["A",210],["B",270],["C",330],["D",420],["E",480]]},"222-46":{"n":"Treat Mold","u":"per job, by scope","o":[["A",60],["B",60,"per hour"]]},"222-105":{"n":"Plaster Repair & Skim Coat","u":"per job / per area","o":[["A",120],["B",60,"per 25 sq ft"],["C",60,"per 20 sq ft"]]},"222-56":{"n":"Bathtub Resurfacing","u":"per tub","o":[["A",270],["B",360]]},"222-21":{"n":"Bathtub Paint","u":"per tub","o":[["A",150]]},"222-51":{"n":"Bath Tub Repair","u":"per tub, by scope","o":[["A",90],["B",180]]},"222-38":{"n":"Stove Resurfacing","u":"per stove","o":[["A",75]]},"222-22":{"n":"Faucet replacement","u":"per piece","o":[["A",75]]},"222-23":{"n":"Toilet replacement","u":"per piece","o":[["B",120],["G",25]]},"222-53":{"n":"Toilet- Remove and install wax ring","u":"per piece","o":[["C",60]]},"222-63":{"n":"Drain","u":"per piece","o":[["D",60],["E",45],["F",240]]},"222-24":{"n":"Vanity installation","u":"per piece","o":[["A",215]]},"222-25":{"n":"Mirror installation","u":"per piece","o":[["B",45]]},"222-29":{"n":"Closet shelf installation","u":"per piece","o":[["C",60]]},"222-33":{"n":"Tile repair & Install","u":"per tile / per 10 sq ft","o":[["A",35,"per tile"],["B",60,"per 10 sq ft"]]},"222-31":{"n":"Backsplash installation","u":"per 10 sq ft","o":[["C",75,"per 10 sq ft"]]},"222-36":{"n":"Garbage Disposal Install & Replacement","u":"per piece","o":[["A",120]]},"222-60":{"n":"Dishwasher Replacement","u":"per piece","o":[["B",105]]},"222-106":{"n":"Appliance Installation","u":"per appliance","o":[["A",120],["B",60],["C",35],["D",60],["E",60]]},"222-58":{"n":"Cabinet Repair","u":"per piece","o":[["A",30,"per piece"]]},"222-80":{"n":"Kitchen cabinet removal","u":"per kitchen","o":[["B",180]]},"222-81":{"n":"Bathroom cabinet removal","u":"per vanity","o":[["C",45]]},"222-26":{"n":"Flooring installation & Repair","u":"per 100 sq ft / per hour","o":[["A",150,"per 100 sq ft"],["B",60,"per hour"]]},"222-61":{"n":"Install New Floor","u":"per 100 sq ft","o":[["A",150,"per 100 sq ft"]]},"222-67":{"n":"New Vinyl Floor","u":"per 100 sq ft","o":[["A",150,"per 100 sq ft"]]},"222-16":{"n":"Carpet Installation","u":"per room / per piece / per 50 sq ft","o":[["A",45,"per room"],["B",60],["C",40,"per 50 sq ft"]]},"222-88":{"n":"Floor removal","u":"per 100 sq ft","o":[["E",36,"per 100 sq ft"]]},"222-89":{"n":"Carpet removal","u":"per 100 sq ft","o":[["D",20,"per 100 sq ft"]]},"222-78":{"n":"Baseboard installation","u":"per 25 linear ft","o":[["A",65,"per 25 linear ft"]]},"222-77":{"n":"Baseboard removal","u":"per 50 linear ft","o":[["B",40,"per 50 linear ft"]]},"222-79":{"n":"Baseboard repair","u":"per piece","o":[["C",30,"per piece"]]},"222-15":{"n":"Baseboard installation, repair & Removal","u":"per linear ft / per piece","o":[["A",65,"per 25 linear ft"],["B",40,"per 50 linear ft"],["C",30,"per piece"]]},"222-66":{"n":"Trim Repair","u":"per piece","o":[["A",30,"per piece"]]},"222-93":{"n":"Trim removal","u":"per piece","o":[["B",15,"per piece"]]},"222-94":{"n":"Crown molding","u":"per 12 linear ft","o":[["C",60,"per 12 linear ft"]]},"222-17":{"n":"Interior door replacement","u":"per door","o":[["A",95]]},"222-86":{"n":"Door removal","u":"per door","o":[["C",30]]},"222-87":{"n":"Door frame removal","u":"per frame","o":[["D",45]]},"222-40":{"n":"Storm Door Installation","u":"per door","o":[["B",180]]},"222-18":{"n":"Hardware replacement","u":"per piece","o":[["A",30],["B",10,"per piece"]]},"222-68":{"n":"Door Knob","u":"per knob / lock","o":[["A",30]]},"222-12":{"n":"Blind Installation and Removal","u":"per window","o":[["A",20,"per window"]]},"222-75":{"n":"New Blinds Install & Removal","u":"per window","o":[["A",20,"per window"]]},"222-55":{"n":"Blinds Bracket Removal","u":"per window","o":[["B",10,"per window"]]},"222-45":{"n":"Curtain Rods and Hooks Removal & Install","u":"per window","o":[["C",20,"per window"]]},"222-74":{"n":"Windows repair","u":"per window","o":[["A",60,"per window"]]},"222-72":{"n":"Window Screen","u":"per screen","o":[["B",30,"per screen"]]},"222-42":{"n":"Exterior Window track detailing","u":"per track","o":[["C",15,"per track"]]},"222-20":{"n":"Ceiling fan & light fixture installation","u":"per piece","o":[["A",60],["B",90]]},"222-83":{"n":"Handyman - Ceiling fan installation","u":"per piece","o":[["B",90]]},"222-82":{"n":"Handyman - Ceiling fan removal","u":"per piece","o":[["C",30]]},"222-84":{"n":"Handyman - Light fixture installation","u":"per piece","o":[["A",60]]},"222-104":{"n":"Bathroom Exhaust Fan Replacement","u":"per fan","o":[["A",90],["B",180]]},"222-76":{"n":"Switches, Outlets & Covers","u":"per piece","o":[["A",15,"per piece"]]},"222-41":{"n":"Smoke Detector Installatiion and Removal","u":"per piece","o":[["B",15,"per piece"]]},"222-32":{"n":"Fire extinguisher Installation and Removal","u":"per piece","o":[["C",15,"per piece"]]},"222-59":{"n":"Fire Extinguisher install","u":"per piece","o":[["C",15,"per piece"]]},"222-62":{"n":"A/C Filter","u":"per filter","o":[["D",10,"per filter"]]},"222-100":{"n":"Dispenser installation","u":"per dispenser","o":[["A",30,"per dispenser"]]},"222-101":{"n":"Dispenser replacement","u":"per dispenser","o":[["B",24,"per dispenser"]]},"222-102":{"n":"Dispenser repair","u":"per dispenser","o":[["C",18,"per dispenser"]]},"222-107":{"n":"Furnace & A/C Preventive Maintenance","u":"per system","o":[["A",90,"per system"],["B",60]]},"222-85":{"n":"Handyman - Appliance removal","u":"per appliance","o":[["A",60,"per appliance"]]},"222-92":{"n":"Trash-out","u":"per unit, by scope","o":[["B",120],["C",240]]},"222-69":{"n":"Remove Cable & Wires","u":"per room","o":[["A",30,"per room"]]},"222-43":{"n":"Internet Anthena or Plate Removing","u":"per piece","o":[["B",60]]},"222-70":{"n":"Dish Antena Removal","u":"per piece","o":[["B",60]]},"222-54":{"n":"Misc Repairs & Requests (Handyman - Hourly)","u":"per hour (1.5 h minimum per visit)","o":[["A",60,"per hour"]]},"222-73":{"n":"Garage Repair","u":"per hour (1.5 h minimum per visit)","o":[["A",60,"per hour"]]},"222-65":{"n":"Inspect Roofing","u":"per hour (1.5 h minimum per visit)","o":[["A",60,"per hour"]]},"222-71":{"n":"Skirting","u":"per hour (1.5 h minimum per visit)","o":[["A",60,"per hour"]]},"222-64":{"n":"A/C","u":"per hour (1.5 h minimum per visit)","o":[["A",60,"per hour"]]},"222-35":{"n":"Make-ready / rental turnover package","u":"per unit, by size option A-E","o":[["A · Renovation hours",583],["B · Renovation hours",661],["C · Renovation hours",745],["D · Renovation hours",883],["E · Renovation hours",985]]},"222-34":{"n":"Kitchen Refresh Package","u":"per kitchen","o":[["A",530]]},"333-20":{"n":"Pressure Washing","u":"per area","o":[["A",35,"per 500 sq ft"],["B",30,"per 300 sq ft"]]},"333-22":{"n":"Deck cleaning & sealing","u":"per 100 sq ft","o":[["A",60,"per 100 sq ft"]]},"222-50":{"n":"Deck Repair","u":"per hour","o":[["B",60,"per hour"]]},"333-10":{"n":"Trash pick up","u":"per visit","o":[["A",60,"per visit"]]},"333-18":{"n":"Gutter cleaning","u":"per 100 linear ft","o":[["B",65,"per 100 linear ft"]]},"333-21":{"n":"Fence cleaning & staining","u":"per 50 linear ft","o":[["C",130,"per 50 linear ft"]]},"333-17":{"n":"Grass Mowing","u":"per acre","o":[["A",70,"per acre"]]},"333-11":{"n":"Mulch installation","u":"per cubic yard","o":[["A",42,"per cubic yard"]]},"333-12":{"n":"Weed control","u":"per 1,000 sq ft","o":[["A",16,"per 1,000 sq ft"]]},"333-13":{"n":"Bush trimming & shaping","u":"per shrub","o":[["A",8,"per shrub"]]},"333-14":{"n":"Fall cleanup","u":"per 1,000 sq ft","o":[["A",20,"per 1,000 sq ft"]]},"111-48":{"n":"Move-In Cleaning","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",120],["A · L2",156],["A · L3",210],["B · L1",150],["B · L2",192],["B · L3",270],["C · L1",180],["C · L2",234],["C · L3",330],["D · L1",228],["D · L2",294],["D · L3",408],["E · L1",264],["E · L2",342],["E · L3",480],["F · L1",21.1,"per 100 sq ft"],["F · L2",27.4,"per 100 sq ft"],["F · L3",38.4,"per 100 sq ft"]]},"111-50":{"n":"Move-out cleaning","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",156],["A · L2",210],["A · L3",312],["B · L1",186],["B · L2",252],["B · L3",372],["C · L1",216],["C · L2",294],["C · L3",426],["D · L1",264],["D · L2",354],["D · L3",510],["E · L1",300],["E · L2",402],["E · L3",576],["F · L1",24,"per 100 sq ft"],["F · L2",32.2,"per 100 sq ft"],["F · L3",46.1,"per 100 sq ft"]]},"111-42":{"n":"Touch-Up Cleaning","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",48],["A · L2",84],["A · L3",108],["B · L1",60],["B · L2",96],["B · L3",126],["C · L1",72],["C · L2",96],["C · L3",126],["D · L1",90],["D · L2",144],["D · L3",192],["E · L1",108],["E · L2",162],["E · L3",222],["F · L1",7.2,"per 100 sq ft"],["F · L2",9,"per 100 sq ft"],["F · L3",12,"per 100 sq ft"]]},"111-43":{"n":"Regular Cleaning","u":"per visit, by unit size option A-F and level 1-3","o":[["A · L1",90],["A · L2",120],["A · L3",186],["B · L1",120],["B · L2",198],["B · L3",264],["C · L1",150],["C · L2",252],["C · L3",336],["D · L1",210],["D · L2",318],["D · L3",420],["E · L1",264],["E · L2",396],["E · L3",528],["F · L1",19,"per 100 sq ft"],["F · L2",28,"per 100 sq ft"],["F · L3",38,"per 100 sq ft"]]},"111-10":{"n":"Post-construction cleaning","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",180],["A · L2",234],["A · L3",306],["B · L1",240],["B · L2",312],["B · L3",408],["C · L1",300],["C · L2",390],["C · L3",510],["D · L1",330],["D · L2",432],["D · L3",558],["E · L1",420],["E · L2",546],["E · L3",714],["F · L1",28.2,"per 100 sq ft"],["F · L2",36.6,"per 100 sq ft"],["F · L3",47.4,"per 100 sq ft"]]},"111-85":{"n":"Detail Package","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",42],["A · L2",66],["A · L3",108],["B · L1",60],["B · L2",96],["B · L3",150],["C · L1",78],["C · L2",126],["C · L3",204],["D · L1",96],["D · L2",150],["D · L3",234],["E · L1",114],["E · L2",186],["E · L3",294],["F · L1",9.1,"per 100 sq ft"],["F · L2",14.9,"per 100 sq ft"],["F · L3",23.5,"per 100 sq ft"]]},"111-75":{"n":"Interior appliance deep cleaning","u":"per appliance","o":[["Refrigerator",20,"per appliance"],["Oven",30,"per appliance"],["Microwave",5,"per appliance"]]},"111-27":{"n":"Restroom deep scrub","u":"per bathroom","o":[["A",27,"per bathroom"]]},"111-74":{"n":"Tile & grout cleaning","u":"per bathroom","o":[["A",30,"per bathroom"]]},"111-78":{"n":"Wall washing","u":"per room","o":[["A",40,"per room"]]},"111-56":{"n":"Clean Balcony","u":"per balcony","o":[["A",10,"per balcony"]]},"111-84":{"n":"Pet hair removal","u":"per room","o":[["A",10,"per room"]]},"111-46":{"n":"Odor Treatment","u":"per room","o":[["A",15,"per room"]]},"111-54":{"n":"Ozone Machine","u":"per unit","o":[["A",20,"per unit"]]},"111-51":{"n":"Regular Floor Cleaning","u":"per 1,000 sq ft","o":[["A",18,"per 1,000 sq ft"]]},"111-20":{"n":"Floor machine scrubbing","u":"per 1,000 sq ft","o":[["A",8,"per 1,000 sq ft"]]},"111-52":{"n":"Floor Polishing","u":"per 1,000 sq ft","o":[["A",6,"per 1,000 sq ft"]]},"111-53":{"n":"Strip And Wax","u":"per 1,000 sq ft","o":[["A",135,"per 1,000 sq ft"]]},"111-55":{"n":"Carpet Shampoo","u":"per room / per hallway / per 1,000 sq ft","o":[["Room",20,"per room"],["Hallway",10,"per hallway"],["Offices",85,"per 1,000 sq ft"],["Setup",15,"per visit"]]},"111-22":{"n":"Carpet spot cleaning","u":"per spot","o":[["A",4,"per spot"]]},"111-86":{"n":"Water extraction (flooded carpet)","u":"per hour, per cleaner","o":[["A",60,"per hour"]]},"111-70":{"n":"Extra cleaning request (hourly)","u":"per hour, per cleaner","o":[["A",60,"per hour"]]},"110-10":{"n":"Move-In Cleaning","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",120],["A · L2",156],["A · L3",210],["B · L1",150],["B · L2",192],["B · L3",270],["C · L1",180],["C · L2",234],["C · L3",330],["D · L1",228],["D · L2",294],["D · L3",408],["E · L1",264],["E · L2",342],["E · L3",480],["F · L1",21.1,"per 100 sq ft"],["F · L2",27.4,"per 100 sq ft"],["F · L3",38.4,"per 100 sq ft"]]},"110-13":{"n":"Carpet cleaning (Shampoo)","u":"per room / per hallway / per 1,000 sq ft","o":[["Room",20,"per room"],["Hallway",10,"per hallway"],["Offices",85,"per 1,000 sq ft"],["Setup",15,"per visit"]]},"110-18":{"n":"Wall washing","u":"per room","o":[["A",40,"per room"]]},"110-23":{"n":"Post-construction cleaning","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",180],["A · L2",234],["A · L3",306],["B · L1",240],["B · L2",312],["B · L3",408],["C · L1",300],["C · L2",390],["C · L3",510],["D · L1",330],["D · L2",432],["D · L3",558],["E · L1",420],["E · L2",546],["E · L3",714],["F · L1",28.2,"per 100 sq ft"],["F · L2",36.6,"per 100 sq ft"],["F · L3",47.4,"per 100 sq ft"]]},"110-24":{"n":"Move-out cleaning","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",156],["A · L2",210],["A · L3",312],["B · L1",186],["B · L2",252],["B · L3",372],["C · L1",216],["C · L2",294],["C · L3",426],["D · L1",264],["D · L2",354],["D · L3",510],["E · L1",300],["E · L2",402],["E · L3",576],["F · L1",24,"per 100 sq ft"],["F · L2",32.2,"per 100 sq ft"],["F · L3",46.1,"per 100 sq ft"]]},"110-29":{"n":"Interior appliance deep cleaning","u":"per appliance","o":[["Refrigerator",20,"per appliance"],["Oven",30,"per appliance"],["Microwave",5,"per appliance"]]},"110-30":{"n":"Tile & grout cleaning","u":"per bathroom","o":[["A",30,"per bathroom"]]},"110-35":{"n":"Clean Balcony","u":"per balcony","o":[["A",10,"per balcony"]]},"110-37":{"n":"Odor Treatment","u":"per room","o":[["A",15,"per room"]]},"110-38":{"n":"Carpet Cleaning (Spot)","u":"per spot","o":[["A",4,"per spot"]]},"110-39":{"n":"Regular Cleaning","u":"per visit, by unit size option A-F and level 1-3","o":[["A · L1",90],["A · L2",120],["A · L3",186],["B · L1",120],["B · L2",198],["B · L3",264],["C · L1",150],["C · L2",252],["C · L3",336],["D · L1",210],["D · L2",318],["D · L3",420],["E · L1",264],["E · L2",396],["E · L3",528],["F · L1",19,"per 100 sq ft"],["F · L2",28,"per 100 sq ft"],["F · L3",38,"per 100 sq ft"]]},"110-40":{"n":"Touch-Up Cleaning","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",48],["A · L2",84],["A · L3",108],["B · L1",60],["B · L2",96],["B · L3",126],["C · L1",72],["C · L2",96],["C · L3",126],["D · L1",90],["D · L2",144],["D · L3",192],["E · L1",108],["E · L2",162],["E · L3",222],["F · L1",7.2,"per 100 sq ft"],["F · L2",9,"per 100 sq ft"],["F · L3",12,"per 100 sq ft"]]},"110-43":{"n":"Extra cleaning request (hourly)","u":"per hour, per cleaner","o":[["A",60,"per hour"]]},"110-48":{"n":"Restroom deep scrub","u":"per bathroom","o":[["A",27,"per bathroom"]]},"110-54":{"n":"Regular Floor Cleaning","u":"per 1,000 sq ft","o":[["A",18,"per 1,000 sq ft"]]},"110-55":{"n":"Floor machine scrubbing","u":"per 1,000 sq ft","o":[["A",8,"per 1,000 sq ft"]]},"110-56":{"n":"Floor Polishing","u":"per 1,000 sq ft","o":[["A",6,"per 1,000 sq ft"]]},"110-57":{"n":"Strip and Wax","u":"per 1,000 sq ft","o":[["A",135,"per 1,000 sq ft"]]},"110-58":{"n":"Ozone Machine","u":"per unit","o":[["A",20,"per unit"]]},"110-59":{"n":"Pet hair removal","u":"per room","o":[["A",10,"per room"]]},"210-10":{"n":"Wall painting","u":"per unit, by size option A-E","o":[["A · 1 coat",318],["B · 1 coat",396],["C · 1 coat",480],["D · 1 coat",618],["E · 1 coat",720],["A · 2 coats",486],["B · 2 coats",606],["C · 2 coats",744],["D · 2 coats",966],["E · 2 coats",1128]]},"210-11":{"n":"Door painting","u":"per door","o":[["A",25],["B",45]]},"210-12":{"n":"Blind Installation and Removal","u":"per window","o":[["A",20,"per window"]]},"210-13":{"n":"Unit Full paint- PRIMER","u":"per unit, by size option A-E","o":[["A · Primer + 2 coats",804],["B · Primer + 2 coats",1002],["C · Primer + 2 coats",1224],["D · Primer + 2 coats",1584],["E · Primer + 2 coats",1848]]},"210-14":{"n":"Caulking","u":"per area","o":[["A",55],["B",30],["C",30]]},"210-15":{"n":"Baseboard installation, repair & Removal","u":"per linear ft / per piece","o":[["A",65,"per 25 linear ft"],["B",40,"per 50 linear ft"],["C",30,"per piece"]]},"210-16":{"n":"Carpet Installation","u":"per room / per piece / per 50 sq ft","o":[["A",45,"per room"],["B",60],["C",40,"per 50 sq ft"]]},"210-17":{"n":"Interior door replacement","u":"per door","o":[["A",95]]},"210-18":{"n":"Hardware replacement","u":"per piece","o":[["A",30],["B",10,"per piece"]]},"210-19":{"n":"Ceiling Paint","u":"per unit, by size option A-E","o":[["A · 1 coat",162],["B · 1 coat",198],["C · 1 coat",240],["D · 1 coat",306],["E · 1 coat",354]]},"210-20":{"n":"Ceiling fan & light fixture installation","u":"per piece","o":[["A",60],["B",90]]},"210-21":{"n":"Bathtub Paint","u":"per tub","o":[["A",150]]},"210-22":{"n":"Faucet replacement","u":"per piece","o":[["A",75]]},"210-23":{"n":"Toilet replacement","u":"per piece","o":[["B",120],["G",25]]},"210-24":{"n":"Vanity installation","u":"per piece","o":[["A",215]]},"210-25":{"n":"Mirror installation","u":"per piece","o":[["B",45]]},"210-26":{"n":"Flooring installation & Repair","u":"per 100 sq ft / per hour","o":[["A",150,"per 100 sq ft"],["B",60,"per hour"]]},"210-27":{"n":"Drywall & wall repair - minor to moderate","u":"per job, by level","o":[["A",150],["B",270],["C",60,"per hour"]]},"210-28":{"n":"Cabinet touch-up / repaint","u":"per job, by scope","o":[["D",60],["A",375],["B",180],["C",83]]},"210-29":{"n":"Closet shelf installation","u":"per piece","o":[["C",60]]},"210-30":{"n":"Drywall sanding & finishing","u":"per job, by scope","o":[["A",95],["B",350]]},"210-31":{"n":"Backsplash installation","u":"per 10 sq ft","o":[["C",75,"per 10 sq ft"]]},"210-32":{"n":"Fire extinguisher Installation and Removal","u":"per piece","o":[["C",15,"per piece"]]},"210-33":{"n":"Tile repair & Install","u":"per tile / per 10 sq ft","o":[["A",35,"per tile"],["B",60,"per 10 sq ft"]]},"210-34":{"n":"Kitchen refresh package","u":"per kitchen","o":[["A",530]]},"210-35":{"n":"Make-ready / rental turnover package","u":"per unit, by size option A-E","o":[["A · Renovation hours",583],["B · Renovation hours",661],["C · Renovation hours",745],["D · Renovation hours",883],["E · Renovation hours",985]]},"210-36":{"n":"Garbage Disposal Install & Replacement","u":"per piece","o":[["A",120]]},"210-38":{"n":"Stove Resurfacing","u":"per stove","o":[["A",75]]},"210-39":{"n":"Trim painting (door and window)","u":"per piece","o":[["A",24],["B",30]]},"210-40":{"n":"Storm Door Installation","u":"per door","o":[["B",180]]},"210-41":{"n":"Smoke Detector Installatiion and Removal","u":"per piece","o":[["B",15,"per piece"]]},"210-42":{"n":"Exterior Window track detailing","u":"per track","o":[["C",15,"per track"]]},"210-43":{"n":"Internet Anthena or Plate Removing","u":"per piece","o":[["B",60]]},"210-44":{"n":"Ceiling Repair","u":"per job, by level","o":[["A",150],["B",270],["C",60,"per hour"]]},"210-45":{"n":"Curtain Rods and Hooks Removal & Install","u":"per window","o":[["C",20,"per window"]]},"210-46":{"n":"Treat Mold","u":"per job, by scope","o":[["A",60],["B",60,"per hour"]]},"210-48":{"n":"Touch-Up Paint","u":"per job, by scope option","o":[["A",47],["B",75],["C",39],["D · A",159],["D · B",198],["D · C",240],["D · D",309],["D · E",360]]},"210-49":{"n":"Baseboard Painting","u":"per unit, by size option A-E","o":[["A",96],["B",120],["C",150],["D",180],["E",210]]},"210-50":{"n":"Deck Repair","u":"per hour","o":[["B",60,"per hour"]]},"210-51":{"n":"Bathtub Repair","u":"per tub, by scope","o":[["A",90],["B",180]]},"210-52":{"n":"Prime Patches","u":"per job, by number of patches","o":[["A",30],["B",55]]},"210-53":{"n":"Toilet - Remove and install wax ring","u":"per piece","o":[["C",60]]},"210-54":{"n":"Misc Repairs & Requests","u":"per hour (1.5 h minimum per visit)","o":[["A",60,"per hour"]]},"210-55":{"n":"Blinds Bracket Removal","u":"per window","o":[["B",10,"per window"]]},"210-56":{"n":"Bathtub Resurfacing","u":"per tub","o":[["A",270],["B",360]]},"210-58":{"n":"Cabinet Repair","u":"per piece","o":[["A",30,"per piece"]]},"210-60":{"n":"Dishwasher Replacement","u":"per piece","o":[["B",105]]},"210-61":{"n":"Install New Floor","u":"per 100 sq ft","o":[["A",150,"per 100 sq ft"]]},"210-62":{"n":"A/C Filter","u":"per filter","o":[["D",10,"per filter"]]},"210-63":{"n":"Drain","u":"per piece","o":[["D",60],["E",45],["F",240]]},"210-64":{"n":"A/C","u":"per hour (1.5 h minimum per visit)","o":[["A",60,"per hour"]]},"210-65":{"n":"Inspect Roofing","u":"per hour (1.5 h minimum per visit)","o":[["A",60,"per hour"]]},"210-66":{"n":"Trim Repair","u":"per piece","o":[["A",30,"per piece"]]},"210-67":{"n":"New Vinyl Floor","u":"per 100 sq ft","o":[["A",150,"per 100 sq ft"]]},"210-68":{"n":"Door Knob","u":"per knob / lock","o":[["A",30]]},"210-69":{"n":"Remove Cable & Wires","u":"per room","o":[["A",30,"per room"]]},"210-70":{"n":"Dish Antenna Removal","u":"per piece","o":[["B",60]]},"210-71":{"n":"Skirting","u":"per hour (1.5 h minimum per visit)","o":[["A",60,"per hour"]]},"210-72":{"n":"Window Screen","u":"per screen","o":[["B",30,"per screen"]]},"210-73":{"n":"Garage Repair","u":"per hour (1.5 h minimum per visit)","o":[["A",60,"per hour"]]},"210-74":{"n":"Window Repair","u":"per window","o":[["A",60,"per window"]]},"210-75":{"n":"New Blinds Install & Removal","u":"per window","o":[["A",20,"per window"]]},"210-76":{"n":"Switches, Outlets & Covers","u":"per piece","o":[["A",15,"per piece"]]},"210-77":{"n":"Baseboard removal","u":"per 50 linear ft","o":[["B",40,"per 50 linear ft"]]},"210-78":{"n":"Baseboard installation","u":"per 25 linear ft","o":[["A",65,"per 25 linear ft"]]},"210-79":{"n":"Baseboard repair","u":"per piece","o":[["C",30,"per piece"]]},"210-80":{"n":"Kitchen cabinet removal","u":"per kitchen","o":[["B",180]]},"210-81":{"n":"Bathroom cabinet removal","u":"per vanity","o":[["C",45]]},"210-82":{"n":"Handyman - Ceiling fan removal","u":"per piece","o":[["C",30]]},"210-83":{"n":"Handyman - Ceiling fan installation","u":"per piece","o":[["B",90]]},"210-84":{"n":"Handyman - Light fixture installation","u":"per piece","o":[["A",60]]},"210-85":{"n":"Handyman - Appliance removal","u":"per appliance","o":[["A",60,"per appliance"]]},"210-86":{"n":"Door removal","u":"per door","o":[["C",30]]},"210-87":{"n":"Door frame removal","u":"per frame","o":[["D",45]]},"210-88":{"n":"Floor removal","u":"per 100 sq ft","o":[["E",36,"per 100 sq ft"]]},"210-89":{"n":"Carpet removal","u":"per 100 sq ft","o":[["D",20,"per 100 sq ft"]]},"210-90":{"n":"Ceiling texture removal","u":"per unit, by size option A-E","o":[["A",675],["B",940],["C",1205],["D",1500],["E",1855]]},"210-91":{"n":"Ceiling texture application","u":"per unit, by size option A-E","o":[["A",210],["B",270],["C",330],["D",420],["E",480]]},"210-92":{"n":"Trash-out","u":"per unit, by scope","o":[["B",120],["C",240]]},"210-93":{"n":"Trim removal","u":"per piece","o":[["B",15,"per piece"]]},"210-94":{"n":"Crown molding","u":"per 12 linear ft","o":[["C",60,"per 12 linear ft"]]},"210-95":{"n":"Door trim painting","u":"per piece","o":[["A",24]]},"210-96":{"n":"Window trim painting","u":"per piece","o":[["B",30]]},"210-97":{"n":"Kitchen cabinet painting","u":"per kitchen / vanity, by scope","o":[["A",375],["B",180]]},"210-98":{"n":"Bathroom cabinet painting","u":"per vanity","o":[["C",83]]},"111-76":{"n":"Blinds dusted (unit add-on)","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",5.2],["A · L2",8.4],["A · L3",13.1],["B · L1",7],["B · L2",11.2],["B · L3",17.5],["C · L1",10.5],["C · L2",16.8],["C · L3",26.2],["D · L1",12.2],["D · L2",19.6],["D · L3",30.6],["E · L1",15.8],["E · L2",25.2],["E · L3",39.4],["F · L1",1.3,"per 100 sq ft"],["F · L2",2,"per 100 sq ft"],["F · L3",3.2,"per 100 sq ft"]],"a":1},"110-28":{"n":"Blinds dusted (unit add-on)","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",5.2],["A · L2",8.4],["A · L3",13.1],["B · L1",7],["B · L2",11.2],["B · L3",17.5],["C · L1",10.5],["C · L2",16.8],["C · L3",26.2],["D · L1",12.2],["D · L2",19.6],["D · L3",30.6],["E · L1",15.8],["E · L2",25.2],["E · L3",39.4],["F · L1",1.3,"per 100 sq ft"],["F · L2",2,"per 100 sq ft"],["F · L3",3.2,"per 100 sq ft"]],"a":1},"111-79":{"n":"Window tracks vacuumed and wiped (unit add-on)","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",5.2],["A · L2",8.4],["A · L3",13.1],["B · L1",7],["B · L2",11.2],["B · L3",17.5],["C · L1",10.5],["C · L2",16.8],["C · L3",26.2],["D · L1",12.2],["D · L2",19.6],["D · L3",30.6],["E · L1",15.8],["E · L2",25.2],["E · L3",39.4],["F · L1",1.3,"per 100 sq ft"],["F · L2",2,"per 100 sq ft"],["F · L3",3.2,"per 100 sq ft"]],"a":1},"110-17":{"n":"Window tracks vacuumed and wiped (unit add-on)","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",5.2],["A · L2",8.4],["A · L3",13.1],["B · L1",7],["B · L2",11.2],["B · L3",17.5],["C · L1",10.5],["C · L2",16.8],["C · L3",26.2],["D · L1",12.2],["D · L2",19.6],["D · L3",30.6],["E · L1",15.8],["E · L2",25.2],["E · L3",39.4],["F · L1",1.3,"per 100 sq ft"],["F · L2",2,"per 100 sq ft"],["F · L3",3.2,"per 100 sq ft"]],"a":1},"111-36":{"n":"Inside window glass (unit add-on)","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",7.5],["A · L2",12],["A · L3",18.8],["B · L1",10],["B · L2",16],["B · L3",25],["C · L1",15],["C · L2",24],["C · L3",37.5],["D · L1",17.5],["D · L2",28],["D · L3",43.8],["E · L1",22.5],["E · L2",36],["E · L3",56.2],["F · L1",1.8,"per 100 sq ft"],["F · L2",2.9,"per 100 sq ft"],["F · L3",4.5,"per 100 sq ft"]],"a":1},"110-51":{"n":"Inside window glass (unit add-on)","u":"per unit, by size option A-F and level 1-3","o":[["A · L1",7.5],["A · L2",12],["A · L3",18.8],["B · L1",10],["B · L2",16],["B · L3",25],["C · L1",15],["C · L2",24],["C · L3",37.5],["D · L1",17.5],["D · L2",28],["D · L3",43.8],["E · L1",22.5],["E · L2",36],["E · L3",56.2],["F · L1",1.8,"per 100 sq ft"],["F · L2",2.9,"per 100 sq ft"],["F · L3",4.5,"per 100 sq ft"]],"a":1}}};
  /*END DATA*/
  var E = DATA.entries;
  var BAND_SQFT = { A: 500, B: 700, C: 900, D: 1125, E: 1400 };
  var BAND_TEXT = { A: 'studio', B: '1 bed', C: '2 bed / 1 bath', D: '2 bed / 2 bath', E: '3 bed' };
  /* opcion por defecto de un servicio con varias (sin dato en la orden): puertas por los dos lados, paredes 1 mano */
  var DEFAULT_OPT = { '222-11': 'B', '210-11': 'B', '222-48': 'A', '210-48': 'A', '111-55': 'Room', '110-13': 'Room' };

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : null; }
  function levelOf(l) { var m = /(\d)/.exec(String(l || '')); var n = m ? +m[1] : 1; return n >= 1 && n <= 3 ? n : 1; }
  function bandOf(bedrooms, bathrooms) {
    var b = num(bedrooms), ba = num(bathrooms);
    if (b == null) return null;
    if (b < 1) return 'A';
    if (b < 2) return 'B';
    if (b < 3) return ba != null && ba >= 2 ? 'D' : 'C';
    return 'E';
  }
  function perOf(p) {
    var s = String(p || '').toLowerCase().replace(/,/g, ''), m;
    if ((m = /per\s*(\d+)\s*(sq ?ft|square)/.exec(s))) return { kind: 'area', per: +m[1] };
    if ((m = /per\s*(\d+)\s*linear/.exec(s))) return { kind: 'lin', per: +m[1] };
    if (/per hour/.test(s)) return { kind: 'hour', per: 1 };
    return { kind: 'each', per: 1 };
  }
  var SCALE_FROM = 1250;
  function addOn(e) { return !!(e && e.a); }
  function entry(sku) { return E[String(sku || '').trim()] || null; }
  function sized(e) { return !!e && /by (unit )?size option/i.test(e.u); }
  /* the option of a line -> [key, minutes, per] */
  function optionOf(e, sku, band, level) {
    var o = e.o, b = band || 'B', x;
    if (sized(e)) {
      x = o.filter(function (r) { return r[0] === b + ' · L' + level; })[0] ||
        o.filter(function (r) { return r[0] === b || r[0].indexOf(b + ' · ') === 0; })[0];
      return x || null;
    }
    var d = DEFAULT_OPT[sku];
    return (d && o.filter(function (r) { return r[0] === d; })[0]) || o.filter(function (r) { return r[1] > 0; })[0] || null;
  }
  /* minutes of ONE line from the catalog. ctx: { band, assumed } -> { minutes, key, note } | null */
  function lineMinutes(sku, level, qty, ctx) {
    sku = String(sku || '').trim();
    var e = entry(sku); if (!e) return null;
    ctx = ctx || {};
    var band = ctx.band || null, lv = levelOf(level), q = num(qty);
    var o = optionOf(e, sku, band, lv); if (!o || !(o[1] > 0)) return null;
    var p = perOf(o[2] || e.u), m = o[1], note = '';
    if (sized(e)) {
      /* limpieza de unidad arriba de 1,250 sq ft (CFO 15/11/2026 14:16): minutos = tamano E x sq ft / 1,250, igual que el precio
         (sin tramo plano de 1,251 a 1,600 ni brinco en 1,601). Solo si la orden trae los sq ft; sin ellos, la banda. */
      var sq = num(ctx.sqft), eo = sq > SCALE_FROM ? e.o.filter(function (r) { return r[0] === 'E · L' + lv; })[0] : null;
      if (eo && e.o.some(function (r) { return r[0].charAt(0) === 'F'; })) { m = eo[1] * sq / SCALE_FROM; o = eo; note = Math.round(sq) + ' sq ft'; }
      else if (!band) note = 'size not on the order, 1 bed assumed';
      m = m * (q > 1 ? q : 1);
    }
    else if (/^11[01]-(55|13)$/.test(sku) && o[0] === 'Room' && !(q > 0)) {
      /* carpet shampoo of a unit: bedrooms + living room, plus the set-up */
      var rooms = ({ A: 1, B: 1, C: 2, D: 2, E: 3 }[band || 'B']) + 1;
      var setup = e.o.filter(function (r) { return r[0] === 'Setup'; })[0];
      m = rooms * m + (setup ? setup[1] : 0); note = rooms + ' rooms';
    }
    else if (p.kind === 'area') {
      if (q > 0) m = q >= p.per ? m * q / p.per : m * q;
      else if (band || ctx.unit) { m = m * BAND_SQFT[band || 'B'] / p.per; note = 'whole unit (' + BAND_SQFT[band || 'B'] + ' sq ft)'; }
    }
    else m = m * (q > 0 ? q : 1);
    return { minutes: Math.round(m), key: o[0], note: note };
  }
  function packagesOf(pc) {
    if (!pc) return {};
    if (typeof pc === 'object') return pc;
    try { var v = JSON.parse(pc); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
  }
  function nc(s) { var v = s && s.NotCompleted; return v === true || v === 'true' || v === 'Yes' || v === 1; }
  /* services: [{ ServiceName, SubOption, Level, Quantity, NotCompleted }]
     order: { Bedrooms, Bathrooms, PackageContents }   opts: { perTask(sku, level, qty) -> minutes | null }
     -> { per: minutes of each service (same index; a unit package's time spread over its tasks by their Service Times
          minutes, else evenly), lines, total, band, unknown } */
  function compute(services, order, opts) {
    order = order || {}; opts = opts || {};
    var band = bandOf(order.Bedrooms, order.Bathrooms), ctx = { band: band, unit: true, sqft: order.UnitSqft || order.SquareFeet || order.sqft };
    var all = services || [], per = all.map(function () { return 0; });
    var live = []; all.forEach(function (s, i) { if (s && !nc(s)) live.push(i); });
    var used = {}, lines = [], total = 0, unknown = 0;
    var pk = packagesOf(order.PackageContents);
    Object.keys(pk).forEach(function (psku) {
      var e = entry(psku); if (!sized(e)) return;
      /* los extras (persianas, rieles, vidrio por dentro) ya no van dentro del paquete: si la orden los trae, cuentan aparte */
      var items = (Array.isArray(pk[psku]) ? pk[psku] : []).map(function (x) { return String((x && x.sku) || '').trim(); }).filter(function (k) { return k && !addOn(entry(k)); });
      if (!items.length) return;
      var set = {}; items.forEach(function (k) { set[k] = 1; });
      var idx = live.filter(function (i) { return !used[i] && set[String(all[i].SubOption || '').trim()]; });
      if (!idx.length) return;
      var cnt = {}; idx.forEach(function (i) { var lv = levelOf(all[i].Level); cnt[lv] = (cnt[lv] || 0) + 1; });
      var lv = [3, 2, 1].reduce(function (best, l) { return (cnt[l] || 0) > (cnt[best] || 0) ? l : best; }, 3);
      var r = lineMinutes(psku, 'Level ' + lv, 1, ctx); if (!r) return;
      var share = Math.min(1, idx.length / items.length);
      var m = Math.round(r.minutes * share);
      var w = idx.map(function (i) { var t = opts.perTask ? opts.perTask(String(all[i].SubOption || '').trim(), all[i].Level, 1) : null; return t > 0 ? Number(t) : 0; });
      var wsum = w.reduce(function (a, b) { return a + b; }, 0);
      idx.forEach(function (i, k) { used[i] = 1; per[i] = wsum > 0 ? m * w[k] / wsum : m / idx.length; });
      total += m;
      lines.push({ sku: psku, label: e.n + ' (' + BAND_TEXT[band || 'B'] + ', Level ' + lv + (share < 1 ? ', ' + idx.length + ' of ' + items.length + ' tasks' : '') + ')', minutes: m, from: 'unit', note: r.note });
    });
    live.forEach(function (i) {
      if (used[i]) return;
      var s = all[i], sku = String(s.SubOption || '').trim(), e = entry(sku), m = null, from = 'unit', r = null;
      /* a cleaning task outside a unit (no bed / bath: common areas, offices) keeps its Service Times minutes */
      var task = opts.perTask && !band && /^11/.test(sku) && (!sized(e) || addOn(e)) ? opts.perTask(sku, s.Level, s.Quantity) : null;
      if (task != null) { m = task; from = 'task'; }
      else {
        r = e ? lineMinutes(sku, s.Level, s.Quantity, ctx) : null;
        if (r) m = r.minutes;
        else if (opts.perTask) { m = opts.perTask(sku, s.Level, s.Quantity); from = 'task'; }
      }
      if (m == null) { unknown++; return; }
      per[i] = Number(m) || 0;
      total += per[i];
      var q = num(s.Quantity);
      lines.push({ sku: sku, label: (s.ServiceName || s.SubOption) + (q > 1 ? ' x' + q : ''), minutes: Math.round(per[i]), from: from, note: r ? r.note : '' });
    });
    return { per: per, lines: lines, total: Math.round(total), band: band, unknown: unknown };
  }
  /* -> { totalMinutes, toMinutes, lines: [{ sku, label, minutes, from }], band, bandAssumed, unknown } | null */
  function orderMinutes(services, order, opts) {
    var c = compute(services, order, opts);
    if (!c.lines.length) return null;
    return { totalMinutes: c.total, toMinutes: rangeTo(c.total), lines: c.lines, band: c.band || 'B', bandAssumed: !c.band, unknown: c.unknown };
  }
  /* The day of a date (date only or midnight UTC = that day; with a time, its Iowa day). */
  function dayOf(v) {
    var s = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}(T00:00(:00(\.0+)?)?Z?)?$/.test(s)) return s.slice(0, 10);
    var d = new Date(s); if (isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); } catch (e) { return ''; }
  }
  var DONE = { Completed: 1, 'Pending Review': 1 };
  /* Per technician, only what is assigned to each one (CFO 15/11/2026): the same person can come back on other days
     and different people do different parts, so nobody sees the whole order's time.
     o: { today: 'YYYY-MM-DD', perTask, assignments: [{ Category, ServiceName, AssignedTo (names, comma), ScheduledDate, WorkStatus }]
          (Assign by service), scheduling: [{ who, date, division }] (the whole order by day: Admin Scheduling) }
     - assigned (by service): each service's minutes go to the names on its row (split between them); a row of
       today -> today; not done and not today -> remaining. Done (Completed / Pending Review) counts nowhere.
     - share (whole order): the minutes of each division (or the whole order) per day of work, split between the
       people of that day; today -> today, a later day -> remaining, a past day -> nothing.
     -> { mode: 'assigned' | 'share' | '', people: [{ who, today, todayTo, remaining, remainingTo }] } */
  function techSplit(services, order, o) {
    o = o || {};
    var all = services || [], per = compute(all, order, o).per, today = String(o.today || '');
    var acc = {};
    var add = function (who, k, m) { who = String(who || '').trim(); if (!who || !(m > 0)) return; var p = acc[who] = acc[who] || { who: who, today: 0, remaining: 0 }; p[k] += m; };
    var key = function (x) { return String(x.Category || '') + '|' + String(x.ServiceName || ''); };
    var mode = '';
    var asg = (o.assignments || []).filter(function (a) { return a && String(a.AssignedTo || '').trim(); });
    if (asg.length) {
      mode = 'assigned';
      var minByKey = {}, rowsByKey = {};
      all.forEach(function (s, i) { if (s && !nc(s)) minByKey[key(s)] = (minByKey[key(s)] || 0) + per[i]; });
      asg.forEach(function (a) { rowsByKey[key(a)] = (rowsByKey[key(a)] || 0) + 1; });
      asg.forEach(function (a) {
        if (DONE[a.WorkStatus]) return;
        var m = (minByKey[key(a)] || 0) / rowsByKey[key(a)];
        var names = String(a.AssignedTo).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        var k = dayOf(a.ScheduledDate) === today ? 'today' : 'remaining';
        names.forEach(function (n) { add(n, k, m / names.length); });
      });
    } else if ((o.scheduling || []).length) {
      mode = 'share';
      var divs = {}; all.forEach(function (s) { if (s && s.Division) divs[s.Division] = 1; });
      var pools = {};
      o.scheduling.forEach(function (r) {
        var d = r && r.division && divs[r.division] && /^(Janitorial|Renovations|Exteriors)$/.test(r.division) ? r.division : '*';
        var day = dayOf(r && r.date); if (!day || !r.who) return;
        (pools[d] = pools[d] || []).push({ who: r.who, day: day });
      });
      Object.keys(pools).forEach(function (d) {
        var min = 0; all.forEach(function (s, i) { if (s && !nc(s) && (d === '*' || s.Division === d)) min += per[i]; });
        var byDay = {}; pools[d].forEach(function (r) { (byDay[r.day] = byDay[r.day] || {})[r.who] = 1; });
        var days = Object.keys(byDay), perDay = days.length ? min / days.length : 0;
        days.forEach(function (day) {
          var ppl = Object.keys(byDay[day]), k = day === today ? 'today' : day > today ? 'remaining' : '';
          if (!k) return;
          ppl.forEach(function (w) { add(w, k, perDay / ppl.length); });
        });
      });
    }
    var people = Object.keys(acc).sort().map(function (w) {
      var p = acc[w], t = Math.round(p.today), r = Math.round(p.remaining);
      return { who: w, today: t, todayTo: rangeTo(t), remaining: r, remainingTo: rangeTo(r) };
    }).filter(function (p) { return p.today > 0 || p.remaining > 0; });
    return { mode: mode, people: people };
  }
  /* skus of the services that a unit package of the order already covers (their own time is not added) */
  function coveredSkus(services, order) {
    var pk = packagesOf((order || {}).PackageContents), out = {};
    var have = {}; (services || []).forEach(function (s) { if (s) have[String(s.SubOption || '').trim()] = 1; });
    Object.keys(pk).forEach(function (psku) {
      if (!sized(entry(psku))) return;
      (Array.isArray(pk[psku]) ? pk[psku] : []).forEach(function (x) { var k = String((x && x.sku) || '').trim(); if (have[k] && !addOn(entry(k))) out[k] = psku; });
    });
    return out;
  }
  function rangeTo(x) { return Math.round((Number(x) || 0) * (1 + MARGIN)); }
  function range(x) { x = Math.round(Number(x) || 0); return { from: x, to: rangeTo(x) }; }
  function fmt(mins) {
    mins = Math.round(Number(mins) || 0);
    var h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + 'h ' + m + 'min';
    if (h) return h + 'h';
    return m + 'min';
  }
  function fmtRange(x) { var r = range(x); return fmt(r.from) + ' – ' + fmt(r.to); }
  /* a range already split (from, to) */
  function fmtFromTo(a, b) { return fmt(a) + ' – ' + fmt(b); }

  return { MARGIN: MARGIN, DATA: DATA, BAND_SQFT: BAND_SQFT, BAND_TEXT: BAND_TEXT, bandOf: bandOf, levelOf: levelOf, entry: entry, isUnitSku: function (s) { return sized(entry(s)) && !addOn(entry(s)); }, isAddOn: function (s) { return addOn(entry(s)); },
    hasSku: function (s) { return !!entry(s); }, lineMinutes: lineMinutes, orderMinutes: orderMinutes, techSplit: techSplit, dayOf: dayOf, coveredSkus: coveredSkus, range: range, rangeTo: rangeTo, fmt: fmt, fmtRange: fmtRange, fmtFromTo: fmtFromTo };
});
