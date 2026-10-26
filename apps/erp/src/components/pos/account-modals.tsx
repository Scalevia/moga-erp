"use client";

import { CheckCircle2, ChevronRight, HandCoins } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Field, Input, Modal, Money, Segmented, cn } from "@/components/ui";
import { balanceLabel, date, machineLabel } from "@/lib/format";
import { planOverdue, planRemaining, repBalance, useStore } from "@/lib/store";
import type { MachineId } from "@/lib/types";
import { AgentCard } from "./agents";
import { InvoiceDetails } from "./purchase-invoice";
import { CallButton, Statement, type Line } from "./statement";

const owesDescribe = (b: number) => (b > 0 ? `عليك ${b.toLocaleString("en")}` : b < 0 ? `ليك ${(-b).toLocaleString("en")}` : "خالص");

/** Supplier: every delivery and payment, with what the shop still owes. */
export function SupplierAccountModal({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const store = useStore();
  const supplier = store.contacts.find((c) => c.id === supplierId);
  const owed = store.supplierPayables[supplierId] ?? 0;
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [via, setVia] = useState<"cash" | "wallet" | "bank">("cash");
  const [done, setDone] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  if (!supplier) return null;
  const invoice = store.purchases.find((x) => x.id === invoiceId);

  if (invoice)
    return (
      <Modal open onClose={onClose} title={`فاتورة استلام #${invoice.number}`} width="max-w-lg">
        <button onClick={() => setInvoiceId(null)} className="mb-3 flex items-center gap-1 text-sm text-brand">
          <ChevronRight size={16} /> رجوع لكشف الحساب
        </button>
        <InvoiceDetails invoiceId={invoice.id} />
      </Modal>
    );

  // Balance from the shop's side: positive = the shop owes the supplier.
  const lines: Line[] = [];
  for (const inv of store.purchases.filter((x) => x.supplierId === supplierId)) {
    const pieces = inv.lines.reduce((a, l) => a + l.qty, 0);
    lines.push({
      key: `${inv.id}-in`,
      at: inv.createdAt,
      label: `فاتورة استلام #${inv.number}`,
      change: inv.total,
      by: inv.employeeId,
      note: `${pieces} قطعة${inv.supplierRef ? ` · فاتورة المورد ${inv.supplierRef}` : ""}`,
      onOpen: () => setInvoiceId(inv.id),
    });
  }
  for (const m of store.movements.filter((x) => x.kind === "supplier_payment" && x.contactId === supplierId)) {
    const paid = -(m.cash + m.wallet + (m.bank ?? 0));
    lines.push({ key: m.id, at: m.createdAt, label: "دفعنا له", change: -paid, by: m.employeeId, via: m.cash ? "cash" : m.wallet ? "wallet" : "bank" });
  }
  // Whatever the lines don't explain was owed before the system started.
  const opening = owed - lines.reduce((a, l) => a + l.change, 0);
  if (Math.round(opening) !== 0) lines.push({ key: "opening", at: "", label: "رصيد قديم", change: opening });

  const a = Number(amount) || 0;
  const valid = a > 0 && a <= owed;

  return (
    <Modal open onClose={onClose} title={`حساب ${supplier.name}`} width="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className={cn("flex-1 rounded-lg p-3", owed > 0 ? "bg-bad-soft" : "bg-surface-2")}>
            <div className="text-xs text-ink-3">المحل عليه له</div>
            <Money value={owed} className={cn("text-lg font-bold", owed > 0 && "text-bad")} />
          </div>
          <CallButton phone={supplier.phone} name={supplier.name} className="h-11 w-11" />
        </div>

        {!paying && owed > 0 && (
          <Button size="sm" className="w-full" onClick={() => { setPaying(true); setAmount(String(owed)); setDone(null); }}>
            <HandCoins size={15} /> دفعت للمورد
          </Button>
        )}
        {paying && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <Field label="المبلغ" hint={a > owed ? <span className="text-bad">أكتر من اللي عليك له</span> : undefined}>
              <Input autoFocus type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-lg font-semibold" />
            </Field>
            <Segmented
              value={via}
              onChange={setVia}
              options={[
                { value: "cash", label: "كاش (الدرج)" },
                { value: "wallet", label: "فودافون كاش" },
                { value: "bank", label: "إنستاباي" },
              ]}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={!valid}
                onClick={() => {
                  store.paySupplier({ supplierId, amount: a, via });
                  setDone(`دفعت ${a.toLocaleString("en")} ج.م`);
                  setPaying(false);
                }}
              >
                تسجيل الدفع
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPaying(false)}>
                إلغاء
              </Button>
            </div>
          </div>
        )}
        {done && (
          <div className="flex items-center gap-2 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
            <CheckCircle2 size={16} /> اتسجل — {done}
          </div>
        )}

        <Statement lines={lines} upIsGood={false} describe={owesDescribe} legend="الأحدث فوق · «عليك» = المحل عليه للمورد" />
      </div>
    </Modal>
  );
}

/** Agent: every load and payment; the agent card on top records new ones. */
export function AgentAccountModal({ id, onClose }: { id: MachineId; onClose: () => void }) {
  const store = useStore();
  // Balance from the shop's side: positive = the shop owes the agent.
  const lines: Line[] = store.movements
    .filter((m) => m.machineId === id && m.rep)
    .map((m) => ({
      key: m.id,
      at: m.createdAt,
      label: (m.rep ?? 0) < 0 ? `المندوب شحن${m.balanceId ? ` ${balanceLabel[m.balanceId]}` : ""}` : "دفعنا له",
      change: -(m.rep ?? 0),
      by: m.employeeId,
      via: (m.rep ?? 0) > 0 ? (m.cash ? "cash" : m.wallet ? "wallet" : "bank") : undefined,
    }));
  const opening = -repBalance(store, id) - lines.reduce((a, l) => a + l.change, 0);
  if (Math.round(opening) !== 0) lines.push({ key: "opening", at: "", label: "رصيد قديم", change: opening });

  return (
    <Modal open onClose={onClose} title={`حساب مندوب ${machineLabel[id]}`} width="max-w-lg">
      <div className="space-y-4">
        <AgentCard id={id} />
        <Statement lines={lines} upIsGood={false} describe={owesDescribe} legend="الأحدث فوق · «عليك» = المحل عليه للمندوب" />
      </div>
    </Modal>
  );
}

/** Installment customer: every plan's schedule — what's paid, late and coming. */
export function InstallmentAccountModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const store = useStore();
  const customer = store.contacts.find((c) => c.id === customerId);
  const plans = store.plans.filter((p) => p.customerId === customerId && planRemaining(p) > 0);
  if (!customer) return null;
  const remaining = plans.reduce((a, p) => a + planRemaining(p), 0);
  const late = plans.reduce((a, p) => a + planOverdue(p).amount, 0);

  return (
    <Modal open onClose={onClose} title={`حساب ${customer.name}`} width="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="grid flex-1 grid-cols-2 gap-2">
            <div className="rounded-lg bg-good-soft p-3">
              <div className="text-xs text-ink-3">المتبقي عليه</div>
              <Money value={remaining} className="text-lg font-bold text-good" />
            </div>
            <div className={cn("rounded-lg p-3", late ? "bg-bad-soft" : "bg-surface-2")}>
              <div className="text-xs text-ink-3">متأخر</div>
              <Money value={late} className={cn("text-lg font-bold", late > 0 && "text-bad")} />
            </div>
          </div>
          <CallButton phone={customer.phone} name={customer.name} className="h-11 w-11" />
        </div>

        <Link href="/pos/installments" className="flex h-10 items-center justify-center gap-2 rounded-lg bg-brand text-sm font-medium text-brand-ink">
          <HandCoins size={15} /> تحصيل قسط
        </Link>

        {plans.map((p) => (
          <div key={p.id}>
            <div className="mb-2 text-sm font-semibold text-ink-2">
              جدول الأقساط · {p.months} شهور
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {p.schedule.map((d) => {
                const isLate = new Date(d.dueDate) < new Date() && d.paid < d.amount;
                return (
                  <li key={d.n} className="flex items-center justify-between px-3 py-2">
                    <span>
                      <span className="num text-ink-3">{d.n}.</span> {date(d.dueDate)}
                    </span>
                    <span className="flex items-center gap-2">
                      <Money value={d.amount} />
                      {d.paid >= d.amount ? <Badge tone="good">مدفوع</Badge> : isLate ? <Badge tone="bad">متأخر</Badge> : d.paid > 0 ? <Badge tone="warn">جزئي</Badge> : <Badge>قادم</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
