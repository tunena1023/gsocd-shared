/* ============================================================
   gsocd-shared / admin-tab-counts
   Calcula los contadores de Approvals/Review/Active a partir de la
   lista completa de ordenes (misma que regresa /admin-get-orders),
   con el MISMO criterio exacto que usa admin.html -- para que las
   paginas standalone de Admin (Gallery, Developer, QuickBooks,
   Recurring) puedan mostrar los mismos numeros en su barra de
   navegacion, no solo admin.html.

   Si el criterio de que cuenta como "Approvals" o "Review" o
   "Active" cambia algun dia, se cambia AQUI y en admin.html --
   son las 2 unicas copias de esta logica (antes de esto ni existia
   en ningun otro lado).

   Uso:
     const orders = (await api('/admin-get-orders', {body:{}})).orders || [];
     const counts = GSAdminCounts.compute(orders);
     // counts = { approvals: 3, review: 1, active: 12 }

     tabs.push({ label: 'Approvals', href: 'admin.html?tab=approvals',
       badgeHtml: GSAdminCounts.badgeHtml(counts.approvals, 'appr-count') });
============================================================ */
(function () {
  'use strict';
  if (window.GSAdminCounts) return;

  var NEW_ORDER_STATUSES = ['Received'];
  var REVIEW_STATUSES = ['Change Requested', 'Cancellation Requested'];
  var ACTIVE_STATUSES = ['Assigned', 'Updated'];

  function isFullyScheduled(o) {
    return !!(o.Supervisor && String(o.Supervisor).trim()
      && o.ServiceWindow && String(o.ServiceWindow).trim()
      && o.DispatchDate && String(o.DispatchDate).trim());
  }

  function compute(orders) {
    orders = orders || [];
    var approvals = orders.filter(function (o) {
      return NEW_ORDER_STATUSES.indexOf(o.Status) !== -1 && !isFullyScheduled(o);
    }).length;
    var review = orders.filter(function (o) {
      return REVIEW_STATUSES.indexOf(o.Status) !== -1 || (o.Status === 'Cancelled' && !o.Archived);
    }).length;
    var active = orders.filter(function (o) {
      return ACTIVE_STATUSES.indexOf(o.Status) !== -1 ||
        (NEW_ORDER_STATUSES.indexOf(o.Status) !== -1 && isFullyScheduled(o));
    }).length;
    return { approvals: approvals, review: review, active: active };
  }

  function badgeHtml(count, id) {
    count = count || 0;
    return '<span class="tab-count' + (count === 0 ? ' zero' : '') + '" id="' + id + '">' + count + '</span>';
  }

  window.GSAdminCounts = { compute: compute, badgeHtml: badgeHtml };
})();
