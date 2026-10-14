/* ============================================================
   lib/order-building.js -- la orden usa la direccion de su edificio
   (14/10/2026, dueño: "eso ya es un cambio de como escribe el app en QB?").

   La orden se crea con la direccion principal del cliente y un Building #
   de texto libre. Si ese # es de un edificio guardado del cliente
   (ClientAddresses), la orden se guarda con la direccion de ese edificio;
   asi el "Ship to" del estimado/factura en QuickBooks (que sale de la
   direccion de la orden) es el del edificio. Lo que se escribe a
   QuickBooks no cambia.

   Sirve al crear y al cambiar el Building # de una orden que ya existe
   (dueño 14/10: "una cosa no cambia la otra"). Solo se mueve a una
   direccion registrada (la de un edificio guardado, o la principal si el #
   es el de su calle). Un # que no esta registrado (edificio nuevo) no
   cambia nada: la orden se queda con la direccion que trae. Una direccion
   escrita a mano se respeta. Nunca se borra nada. Si el # es el de la calle principal, o
   cuadra con mas de un edificio, no se toca.

   forOrder(client, addresses, buildingNumber, orderAddress)
     client     fields de Clients
     addresses  renglones de ClientAddresses ({ id, fields } o fields)
     -> { addressId ('main' o id), Address, Suite, City, Zip, Latitude, Longitude }
        o null = la orden se queda como esta
============================================================ */
'use strict';

const str = v => String(v == null ? '' : v).trim();
const norm = s => str(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const truthy = v => v === true || v === 'true' || v === 1 || v === '1' || v === 'Yes';
const streetNo = s => { const m = /^\s*(\d+[A-Za-z]?)\b/.exec(str(s)); return m ? m[1].toLowerCase() : ''; };
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);

function forOrder(client, addresses, buildingNumber, orderAddress) {
  const c = client || {};
  const cid = norm(c.ClientID);
  if (!cid) return null;
  const bn = norm(buildingNumber);
  const list = (addresses || []).map(a => ({ id: str(a.id || (a.fields || a).id), f: a.fields || a }))
    .filter(x => norm(x.f.ClientID) === cid && !truthy(x.f.Archived) && str(x.f.Address));
  const oa = norm(orderAddress);
  const onMain = !oa || oa === norm(c.Address);
  /* Direccion escrita a mano (ni la principal ni la de un edificio): se respeta. */
  if (!onMain && !list.some(x => norm(x.f.Address) === oa)) return null;
  /* El # es el de la calle principal: la principal. */
  const main = () => onMain || !str(c.Address) ? null : {
    addressId: 'main', Address: str(c.Address), Suite: str(c.Suite), City: str(c.City), Zip: str(c.Zip),
    Latitude: num(c.Latitude), Longitude: num(c.Longitude)
  };
  /* Sin # o un # que no esta registrado: la orden se queda con la direccion
     que trae (dueño 14/10: "en la app nunca se borra ni se pierde nada"). */
  if (!bn) return null;
  if (streetNo(c.Address) === bn) return main();

  const one = arr => {
    /* Varios renglones con la misma calle cuentan como uno. */
    const streets = new Set(arr.map(x => norm(x.f.Address)));
    return streets.size === 1 ? arr[0] : null;
  };
  const labelIs = x => { const l = norm(x.f.Label || x.f.Title); return l === bn || l === 'building' + bn || l === 'bldg' + bn; };
  /* El primer criterio que encuentra algo decide (si ahi hay dos, no se toca). */
  const tiers = [x => norm(x.f.BuildingNumber) === bn, labelIs, x => streetNo(x.f.Address) === bn];
  let hit = null, ambiguous = false;
  for (const t of tiers) { const arr = list.filter(t); if (arr.length) { hit = one(arr); ambiguous = !hit; break; } }
  if (ambiguous || !hit) return null;
  const f = hit.f;
  /* Ya trae esa direccion, o el edificio es la misma calle que la principal. */
  if (norm(f.Address) === oa && !onMain) return null;
  if (norm(f.Address) === norm(c.Address) && !str(f.Suite)) return main();
  return {
    addressId: hit.id,
    Address: str(f.Address),
    Suite: str(f.Suite),
    City: str(f.City) || str(c.City),
    Zip: str(f.Zip) || str(c.Zip),
    Latitude: num(f.Latitude),
    Longitude: num(f.Longitude)
  };
}

module.exports = { forOrder };
