"use client";

import { Banknote, CalendarRange, CreditCard, FileUp, Plus, Smartphone, Trash2, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Field, Input, Modal, Money, Segmented, Select, cn } from "@/components/ui";
import { date, paymentLabel } from "@/lib/format";
import { buildSchedule, useStore } from "@/lib/store";
import type { Order, OrderItem, Payment, PaymentMethod } from "@/lib/types";

const methods: { value: Exclude<PaymentMethod, "installment" | "credit">; icon: typeof Banknote }[] = [
  { value: "cash", icon: Banknote },
  { value: "vodafone_cash", icon: Smartphone },
  { value: "instapay", icon: Zap },
  { value: "card", icon: CreditCard },
];

type PayWay = Exclude<PaymentMethod, "installment" | "credit"> | "split";

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
  // One way for the whole amount (the usual case), or several ways that add up to the total.
  const [way, setWay] = useState<PayWay>("cash");
  const [amountStr, setAmountStr] = useState(String(total)); // what was actually paid, one way
  const [payments, setPayments] = useState<Payment[]>([{ method: "cash", amount: total }]);

  const [down, setDown] = useState(Math.round((total * 0.25) / 100) * 100);
  const [downMethod, setDownMethod] = useState<Exclude<PaymentMethod, "installment" | "credit">>("cash");
  const [markup, setMarkup] = useState(20);
  const [months, setMonths] = useState(6);
  const [guarantor, setGuarantor] = useState({ name: "", phone: "", nationalId: "" });

  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const remaining = total - paid;
  // Paid more: the extra is part of the sale (profit). Paid less: the rest goes on the customer's account.
  const paidNow = way === "split" ? paid : Math.max(0, Number(amountStr) || 0);
  const diff = paidNow - total;
  const fullPayments: Payment[] = [
    ...(way === "split" ? payments.filter((p) => p.amount > 0) : paidNow > 0 ? [{ method: way, amount: paidNow }] : []),
    ...(diff < 0 ? [{ method: "credit" as const, amount: -diff }] : []),
  ];
  const fullValid = diff >= 0 || (customer.name.trim() !== "" && customer.phone.trim() !== "");

  const financed = Math.max(0, Math.round((total - down) * (1 + markup / 100)));
  const schedule = useMemo(() => buildSchedule(financed, months, new Date()), [financed, months]);
  const monthly = schedule[0]?.amount ?? 0;

  const installmentValid =
    customer.name && customer.phone && customer.nationalId.length === 14 && down >= 0 && down < total && months > 0;

  function submit() {
    const order =
      mode === "full"
        ? completeSale({ items: cart, payments: fullPayments, customer: customer.phone ? customer : undefined })
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
        <div className="space-y-4">
          <div>
            <span className="mb-2 block text-sm font-semibold text-ink-2">الزبون دفع إزاي؟</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[...methods.map((m) => ({ value: m.value as PayWay, label: paymentLabel[m.value], icon: m.icon })), { value: "split" as PayWay, label: "أكتر من طريقة", icon: Plus }].map(
                ({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setWay(value)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition",
                      way === value ? "border-brand bg-brand-soft text-brand" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <Icon size={16} /> {label}
                  </button>
                ),
              )}
            </div>
          </div>

          {way !== "split" && (
            <Field label="المبلغ اللي اتدفع">
              <Input type="number" min={0} value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0" className="num text-lg font-semibold" aria-label="المبلغ اللي اتدفع" />
            </Field>
          )}

          {way === "split" && (
            <div className="space-y-3">
              {/* Method and amount side by side, half each, so the amount is always readable on a phone. */}
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.25rem] gap-2 text-xs text-ink-3">
                <span>طريقة الدفع</span>
                <span>المبلغ</span>
              </div>
              {payments.map((p, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center gap-2">
                  <Select
                    value={p.method}
                    onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, method: e.target.value as PaymentMethod } : x)))}
                    aria-label="طريقة الدفع"
                  >
                    {methods.map((m) => (
                      <option key={m.value} value={m.value}>
                        {paymentLabel[m.value]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    value={p.amount || ""}
                    placeholder="0"
                    onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, amount: Math.max(0, Number(e.target.value)) } : x)))}
                    className="num text-lg font-semibold"
                    aria-label="المبلغ"
                  />
                  {payments.length > 1 ? (
                    <button onClick={() => setPayments(payments.filter((_, j) => j !== i))} className="rounded-lg p-2 text-ink-3 hover:text-bad" aria-label="حذف طريقة الدفع">
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setPayments([...payments, { method: "vodafone_cash", amount: Math.max(0, remaining) }])}>
                <Plus size={14} /> طريقة تانية
              </Button>

            </div>
          )}

          <div className={cn("flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium", diff < 0 ? "bg-warn-soft text-warn" : "bg-good-soft text-good")}>
            <span>{diff === 0 ? "المبلغ مكتمل" : diff > 0 ? "الزبون دفع زيادة — هتتسجل ربح" : "باقي — هيتسجل على حساب الزبون"}</span>
            {diff !== 0 && <Money value={Math.abs(diff)} />}
          </div>
          {diff < 0 && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-warn/40 p-3">
              <Field label="اسم الزبون">
                <Input value={customer.name} onChange={(e) => onCustomerChange({ ...customer, name: e.target.value })} />
              </Field>
              <Field label="تليفونه">
                <Input value={customer.phone} onChange={(e) => onCustomerChange({ ...customer, phone: e.target.value })} className="num" />
              </Field>
              <p className="col-span-2 text-xs text-ink-3">الباقي هيظهر في الحسابات تحت «فلوس للمحل»، وتحصّله منه بعدين.</p>
            </div>
          )}

          <Button size="lg" className="w-full" disabled={!fullValid} onClick={submit}>
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
                <Input type="number" value={down || ""} placeholder="0" onChange={(e) => setDown(Math.max(0, Number(e.target.value)))} className="num text-lg font-semibold" />
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
                <Input type="number" value={markup || ""} placeholder="0" onChange={(e) => setMarkup(Math.max(0, Number(e.target.value)))} className="num" />
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
