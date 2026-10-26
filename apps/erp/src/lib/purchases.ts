// Supplier invoices: what's still unpaid on each one. Becomes a SQL view later.

import type { PurchaseInvoice } from "./types";

/**
 * Unpaid amount per invoice, assuming payments to a supplier clear their oldest invoices first:
 * the supplier's current balance is spread over their newest invoices, and anything left over
 * is older than the system.
 */
export function invoiceRemaining(purchases: PurchaseInvoice[], payables: Record<string, number>) {
  const left = new Map(Object.entries(payables).map(([id, v]) => [id, Math.max(0, v)]));
  const out = new Map<string, number>();
  for (const inv of [...purchases].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const owed = left.get(inv.supplierId) ?? 0;
    const unpaid = Math.min(inv.total - inv.paid, owed);
    out.set(inv.id, unpaid);
    left.set(inv.supplierId, owed - unpaid);
  }
  return out;
}

export function invoicePieces(inv: PurchaseInvoice) {
  return inv.lines.reduce((a, l) => a + l.qty, 0);
}
