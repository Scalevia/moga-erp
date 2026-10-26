"use client";

import { Badge, Button, Modal, Money } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { invoicePieces, invoiceRemaining } from "@/lib/purchases";
import { useStore } from "@/lib/store";
import { CallButton } from "./statement";

const viaLabel = { cash: "كاش من الدرج", wallet: "فودافون كاش", bank: "إنستاباي" } as const;

export function InvoiceStatus({ total, remaining }: { total: number; remaining: number }) {
  if (remaining <= 0) return <Badge tone="good">مدفوعة</Badge>;
  if (remaining < total) return <Badge tone="warn">فاضل {remaining.toLocaleString("en")}</Badge>;
  return <Badge tone="bad">على الحساب</Badge>;
}

/** One delivery: what came in, at what cost, who received it, and how much of it is still unpaid. */
export function InvoiceDetails({ invoiceId, onOpenSupplier }: { invoiceId: string; onOpenSupplier?: () => void }) {
  const store = useStore();
  const inv = store.purchases.find((x) => x.id === invoiceId);
  if (!inv) return null;
  const supplier = store.contacts.find((c) => c.id === inv.supplierId);
  const receivedBy = store.staff.find((e) => e.id === inv.employeeId)?.name;
  const remaining = invoiceRemaining(store.purchases, store.supplierPayables).get(inv.id) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{supplier?.name ?? "—"}</div>
          <div className="text-xs text-ink-3">
            {dateTime(inv.createdAt)}
            {receivedBy && ` · استلم ${receivedBy}`}
            {inv.supplierRef && ` · فاتورة المورد ${inv.supplierRef}`}
          </div>
        </div>
        <CallButton phone={supplier?.phone} name={supplier?.name ?? ""} />
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
        {inv.lines.map((l, i) => (
          <li key={i} className="px-3 py-2.5">
            <div className="flex justify-between gap-3">
              <span className="min-w-0 font-medium">{l.name}</span>
              <Money value={l.qty * l.unitCost} className="shrink-0 font-semibold" />
            </div>
            <div className="num text-xs text-ink-3">
              {l.qty} × {l.unitCost.toLocaleString("en")}
            </div>
            {l.imeis && l.imeis.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {l.imeis.map((imei) => (
                  <span key={imei} className="num rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
                    {imei}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <dl className="space-y-1.5 rounded-lg bg-surface-2 p-3 text-sm">
        <div className="flex justify-between font-semibold">
          <dt>الإجمالي · {invoicePieces(inv)} قطعة</dt>
          <dd>
            <Money value={inv.total} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-2">اتدفع وقت الاستلام{inv.paid > 0 && ` (${viaLabel[inv.via]})`}</dt>
          <dd>
            <Money value={inv.paid} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-2">اتضاف على حساب المورد</dt>
          <dd>
            <Money value={inv.total - inv.paid} />
          </dd>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-1.5">
          <dt className="font-medium">فاضل منها دلوقتي</dt>
          <dd>
            <InvoiceStatus total={inv.total} remaining={remaining} />
          </dd>
        </div>
      </dl>
      <p className="text-[11px] text-ink-3">الدفعات للمورد بتتخصم من أقدم فاتورة الأول.</p>

      {onOpenSupplier && (
        <Button variant="secondary" className="w-full" onClick={onOpenSupplier}>
          كشف حساب {supplier?.name}
        </Button>
      )}
    </div>
  );
}

export function PurchaseInvoiceModal({ invoiceId, onClose, onOpenSupplier }: { invoiceId: string; onClose: () => void; onOpenSupplier?: () => void }) {
  const number = useStore((s) => s.purchases.find((x) => x.id === invoiceId)?.number);
  return (
    <Modal open onClose={onClose} title={`فاتورة استلام #${number ?? ""}`}>
      <InvoiceDetails invoiceId={invoiceId} onOpenSupplier={onOpenSupplier} />
    </Modal>
  );
}
