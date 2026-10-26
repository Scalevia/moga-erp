"use client";

import { RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Input, Money, PageHeader } from "@/components/ui";
import { dateTime, paymentLabel } from "@/lib/format";
import { orderTotal, planRemaining, refundFor, useStore } from "@/lib/store";

export default function ReturnsPage() {
  const orders = useStore((s) => s.orders);
  const employees = useStore((s) => s.staff);
  const contacts = useStore((s) => s.contacts);
  const returnOrder = useStore((s) => s.returnOrder);
  const plans = useStore((s) => s.plans);
  const movements = useStore((s) => s.movements);
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");

  const code = q.trim();
  // By IMEI: the phone may have been sold more than once (sold, returned or bought back, sold again) —
  // the latest sale is the one to return.
  const byNumber = code ? orders.find((o) => String(o.number) === code.replace("#", "")) : undefined;
  const byImei = code && !byNumber ? orders.filter((o) => o.items.some((i) => i.imei === code)) : [];
  const order = byNumber ?? byImei.at(-1);
  const earlier = byImei.slice(0, -1);
  const customer = contacts.find((c) => c.id === order?.customerId);
  const refund = order?.status === "completed" ? refundFor({ plans, movements }, order) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="مرتجع من زبون" subtitle="امسح الـ IMEI أو اكتب رقم الفاتورة" />
      <div className="relative mb-4">
        <Search size={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-3" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="h-12 ps-11 text-base" placeholder="IMEI أو رقم فاتورة (مثال: 1500)" />
      </div>

      {code && !order && <p className="text-center text-sm text-ink-3">مفيش فاتورة بالرقم ده</p>}
      {earlier.length > 0 && (
        <p className="mb-3 text-center text-xs text-ink-3">
          ده آخر بيعة للجهاز. اتباع قبل كده في: {earlier.map((o) => `#${o.number}${o.status === "returned" ? " (مرتجعة)" : ""}`).join("، ")}
        </p>
      )}

      {order && (
        <Card>
          <CardHeader
            title={`فاتورة #${order.number}`}
            subtitle={`${dateTime(order.createdAt)} · ${employees.find((e) => e.id === order.employeeId)?.name ?? ""}`}
            action={order.status === "returned" ? <Badge tone="bad">مرتجعة</Badge> : <Badge tone="good">مكتملة</Badge>}
          />
          <ul className="divide-y divide-border">
            {order.items.map((i, k) => (
              <li key={k} className="flex justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{i.qty > 1 && `${i.qty}× `}{i.name}</div>
                  {i.imei && <div className="num text-xs text-ink-3">IMEI {i.imei}</div>}
                </div>
                <Money value={i.qty * i.unitPrice} />
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-border bg-surface-2 px-4 py-3 text-sm">
            {customer && <div className="text-ink-2">العميل: {customer.name} · <span className="num">{customer.phone}</span></div>}
            <div className="text-ink-2">الدفع: {order.payments.map((p) => `${paymentLabel[p.method]} ${p.amount.toLocaleString("en")}`).join(" + ")}</div>
            <div className="flex justify-between pt-1 font-semibold">
              <span>الإجمالي</span>
              <Money value={orderTotal(order)} />
            </div>
          </div>
          {order.status === "completed" && refund && (
            <div className="space-y-3 border-t border-border p-4">
              <div className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-1.5 font-semibold">هيرجع للزبون</div>
                <dl className="space-y-1">
                  {refund.cash > 0 && <RefundLine label="كاش من الدرج" value={refund.cash} />}
                  {refund.wallet > 0 && <RefundLine label="فودافون كاش من المحفظة" value={refund.wallet} />}
                  {refund.bank > 0 && <RefundLine label="إنستاباي / فيزا من حساب البنك" value={refund.bank} />}
                  <div className="flex justify-between border-t border-border pt-1 font-semibold">
                    <dt>الإجمالي</dt>
                    <dd>
                      <Money value={refund.total} />
                    </dd>
                  </div>
                </dl>
                {refund.plan && (
                  <p className="mt-2 rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
                    بيعة تقسيط: المبلغ ده فيه المقدم{refund.installments > 0 && <> وأقساط اتدفعت <Money value={refund.installments} /></>}. خطة الأقساط هتتلغي، والباقي على الزبون (
                    <Money value={planRemaining(refund.plan)} />) مش هيتحصّل.
                  </p>
                )}
              </div>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب المرتجع (مطلوب)" />
              <Button variant="danger" size="lg" className="w-full" disabled={!reason} onClick={() => returnOrder(order.id)}>
                <RotateCcw size={18} /> تأكيد المرتجع ورد الفلوس
              </Button>
              <p className="text-xs text-ink-3">الأجهزة هترجع المخزن، والربح هيتلغي، والفلوس بترجع بنفس الطريقة اللي اتدفعت بيها. العملية بتتسجل باسمك.</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function RefundLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-2">{label}</dt>
      <dd>
        <Money value={value} />
      </dd>
    </div>
  );
}
