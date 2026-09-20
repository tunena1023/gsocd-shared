/* ============================================================
   gsocd-shared/index.js
   Punto de entrada para las piezas de BACKEND (Node) de este repo,
   una vez instalado como dependencia real (require('gsocd-shared')).
   Las piezas de NAVEGADOR (order-tracker, service-picker, etc.) siguen
   sirviendose tal cual, por <script src="...jsdelivr...">, sin pasar
   por aqui -- este archivo es solo para lo que un backend Node de los
   3 portales necesite requerir.

   Cada pieza tambien se puede requerir por su ruta directa, sin pasar
   por este indice -- por ejemplo:
     require('gsocd-shared/lib/division-rules')
   Este archivo es nomas la forma corta (require('gsocd-shared')) para
   cuando se usa mas de una pieza junta.
============================================================ */
module.exports = {
  divisionRules: require('./lib/division-rules')
};
