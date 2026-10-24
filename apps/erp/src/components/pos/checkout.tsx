"use client";

import { Banknote, CalendarRange, CreditCard, FileUp, Plus, Smartphone, Trash2, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Field, Input, Modal, Money, Segmented, Select, cn } from "@/components/ui";
import { date, paymentLabel } from "@/lib/format";
import { buildSchedule, useStore } from "@/lib/store";
import type { Order, OrderItem, Payment, PaymentMethod } from "@/lib/types";

const methods: { value: Exclude<PaymentMethod, "installment">; icon: typeof Banknote }[] = [
  { value: "cash", icon: Banknote },
  { value: "vodafone_cash", icon: Smartphone },
  { value: "instapay", icon: Zap },
  { value: "card", icon: CreditCard },
];

interface Customer {
  name: string;
  phone: string;
  nationalId: string;
}

export function CheckoutModal({
  open,
  onClose,
  cart,
  customer,
  onCustomerChange,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  cart: OrderItem[];
  customer: Customer;
  onCustomerChange: (c: Customer) => void;
  onDone: (o: Order) => void;
}) {
  const completeSale = useStore((s) => s.completeSale);
  const total = cart.reduce((a, l) => a + l.qty * l.unitPrice, 0);
  const canInstall = cart.some((l) => l.imei);

  // The parent mounts this component fresh for each checkout, so initial state is the reset.
  const [mode, setMode] = useState<"full" | "installment">("full");
  const [payments, setPayments] = useState<Payment[]>([{ method: "cash", amount: total }]);
  const [tendered, setTendered] = useState("");

  const [down, setDown] = useState(Math.round((total * 0.25) / 100) * 100);
  const [downMethod, setDownMethod] = useState<Exclude<PaymentMethod, "installment">>("cash");
  const [markup, setMarkup] = useState(20);
  const [months, setMonths] = useState(6);
  const [guarantor, setGuarantor] = useState({ name: "", phone: "", nationalId: "" });

  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const remaining = total - paid;
  const cashPart = payments.filter((p) => p.method === "cash").reduce((a, p) => a + p.amount, 0);
  const change = Number(tendered) - cashPart;

  const financed = Math.max(0, Math.round((total - down) * (1 + markup / 100)));
  const schedule = useMemo(() => buildSchedule(financed, months, new Date()), [financed, months]);
  const monthly = schedule[0]?.amount ?? 0;

  const installmentValid =
    customer.name && customer.phone && customer.nationalId.length === 14 && down >= 0 && down < total && months > 0;

  function submit() {
    const order =
      mode === "full"
        ? completeSale({ items: cart, payments: payments.filter((p) => p.amount > 0), customer: customer.phone ? customer : undefined })
        : completeSale({
            items: cart,
            payments: [
              ...(down > 0 ? [{ method: downMethod, amount: down }] : []),
              { method: "installment" as const, amount: total - down },
            ],
            customer,
            installment: {
              downPayment: down,
              markupPercent: markup,
              months,
              guarantor: guarantor.phone ? guarantor : undefined,
            },
          });
    onDone(order);
  }

  return (
    <Modal open={open} onClose={onClose} title="الدفع" width={mode === "installment" ? "max-w-3xl" : "max-w-lg"}>
      <div className="mb-5 flex items-center justify-between">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "full", label: "دفع كامل" },
            ...(canInstall ? [{ value: "installment" as const, label: "تقسيط" }] : []),
          ]}
        />
        <div className="text-end">
          <div className="text-xs text-ink-3">الإجمالي</div>
          <Money value={total} className="text-2xl font-bold" />
        </div>
      </div>

      {mode === "full" ? (
        <div className="space-y-3">
          {payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={p.method}
                onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, method: e.target.value as PaymentMethod } : x)))}
                className="w-40"
              >
                {methods.map((m) => (
                  <option key={m.value} value={m.value}>
                    {paymentLabel[m.value]}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                value={p.amount}
                onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))}
                className="num flex-1 text-end text-lg font-semibold"
              />
              {payments.length > 1 && (
                <button onClick={() => setPayments(payments.filter((_, j) => j !== i))} className="rounded-lg p-2 text-ink-3 hover:text-bad">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {methods.map(({ value, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setPayments([...payments, { method: value, amount: Math.max(0, remaining) }])}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-ink-2 hover:border-brand hover:text-brand"
              >
                <Plus size={14} />
                <Icon size={14} /> {paymentLabel[value]}
              </button>
            ))}
          </div>

          <div
            className={cn(
              "flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium",
              remaining === 0 ? "bg-good-soft text-good" : "bg-warn-soft text-warn",
            )}
          >
            <span>{remaining === 0 ? "المبلغ مكتمل" : remaining > 0 ? "متبقي" : "زيادة"}</span>
            {remaining !== 0 && <Money value={Math.abs(remaining)} />}
          </div>

          {cashPart > 0 && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
              <Field label="الزبون دفع كاش">
                <Input type="number" value={tendered} onChange={(e) => setTendered(e.target.value)} className="num text-lg" placeholder={String(cashPart)} />
              </Field>
              <div>
                <span className="mb-1 block text-sm font-medium text-ink-2">الباقي للزبون</span>
                <div className="flex h-10 items-center text-xl font-bold">{tendered && change >= 0 ? <Money value={change} /> : "—"}</div>
              </div>
            </div>
          )}

          <Button size="lg" className="w-full" disabled={remaining !== 0} onClick={submit}>
            تأكيد البيع وطباعة الفاتورة
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink-2">العميل</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="الاسم">
                  <Input value={customer.name} onChange={(e) => onCustomerChange({ ...customer, name: e.target.value })} />
                </Field>
                <Field label="التليفون">
                  <Input value={customer.phone} onChange={(e) => onCustomerChange({ ...customer, phone: e.target.value })} className="num" />
                </Field>
                <Field label="الرقم القومي (14 رقم)" className="col-span-2">
                  <Input value={customer.nationalId} maxLength={14} onChange={(e) => onCustomerChange({ ...customer, nationalId: e.target.value.replace(/\D/g, "") })} className="num tracking-wider" />
                </Field>
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink-2">الضامن</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="الاسم">
                  <Input value={guarantor.name} onChange={(e) => setGuarantor({ ...guarantor, name: e.target.value })} />
                </Field>
                <Field label="التليفون">
                  <Input value={guarantor.phone} onChange={(e) => setGuarantor({ ...guarantor, phone: e.target.value })} className="num" />
                </Field>
                <Field label="الرقم القومي" className="col-span-2">
                  <Input value={guarantor.nationalId} maxLength={14} onChange={(e) => setGuarantor({ ...guarantor, nationalId: e.target.value.replace(/\D/g, "") })} className="num tracking-wider" />
                </Field>
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink-2">المستندات</h3>
              <div className="grid grid-cols-3 gap-2">
                {["بطاقة العميل", "بطاقة الضامن", "إيصالات الأمانة"].map((d) => (
                  <button key={d} className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-2 py-3 text-xs text-ink-3 hover:border-brand hover:text-brand">
                    <FileUp size={18} />
                    {d}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="grid grid-cols-2 gap-3">
              <Field label="المقدم">
                <Input type="number" value={down} onChange={(e) => setDown(Number(e.target.value))} className="num text-lg font-semibold" />
              </Field>
              <Field label="طريقة دفع المقدم">
                <Select value={downMethod} onChange={(e) => setDownMethod(e.target.value as typeof downMethod)}>
                  {methods.map((m) => (
                    <option key={m.value} value={m.value}>
                      {paymentLabel[m.value]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="نسبة الزيادة %">
                <Input type="number" value={markup} onChange={(e) => setMarkup(Number(e.target.value))} className="num" />
              </Field>
              <Field label="عدد الشهور">
                <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {[3, 4, 6, 8, 10, 12].map((m) => (
                    <option key={m} value={m}>
                      {m} شهور
                    </option>
                  ))}
                </Select>
              </Field>
            </section>

            <section className="rounded-xl bg-brand-soft p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand">
                <CalendarRange size={16} /> ملخص الخطة
              </div>
              <dl className="mt-3 space-y-1.5 text-sm">
                <Row label="سعر الكاش" value={<Money value={total} />} />
                <Row label="المقدم" value={<Money value={down} />} />
                <Row label={`المتبقي + ${markup}%`} value={<Money value={financed} />} />
                <Row label="إجمالي ما سيدفعه العميل" value={<Money value={financed + down} className="font-semibold" />} />
              </dl>
              <div className="mt-3 flex items-baseline justify-between border-t border-brand/20 pt-3">
                <span className="font-semibold">القسط الشهري</span>
                <Money value={monthly} className="text-2xl font-bold text-brand" />
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink-2">جدول الأقساط</h3>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                {schedule.map((d) => (
                  <div key={d.n} className="flex justify-between border-b border-border px-3 py-1.5 text-sm last:border-0">
                    <span className="text-ink-3">
                      قسط {d.n} · {date(d.dueDate)}
                    </span>
                    <Money value={d.amount} />
                  </div>
                ))}
              </div>
            </section>

            {!guarantor.phone && <Badge tone="warn">بدون ضامن</Badge>}
            <Button size="lg" className="w-full" disabled={!installmentValid} onClick={submit}>
              تأكيد البيع بالتقسيط
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-2">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
