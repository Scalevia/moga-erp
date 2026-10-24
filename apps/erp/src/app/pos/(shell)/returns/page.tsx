"use client";

import { RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Input, Money, PageHeader } from "@/components/ui";
import { dateTime, paymentLabel } from "@/lib/format";
import { orderTotal, useStore } from "@/lib/store";

export default function ReturnsPage() {
  const orders = useStore((s) => s.orders);
  const employees = useStore((s) => s.staff);
  const contacts = useStore((s) => s.contacts);
  const returnOrder = useStore((s) => s.returnOrder);
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");

  const code = q.trim();
  const order = code
    ? orders.find((o) => String(o.number) === code.replace("#", "") || o.items.some((i) => i.imei === code))
    : undefined;
  const customer = contacts.find((c) => c.id === order?.customerId);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="مرتجع من زبون" subtitle="امسح الـ IMEI أو اكتب رقم الفاتورة" />
      <div className="relative mb-4">
        <Search size={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-3" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="h-12 ps-11 text-base" placeholder="IMEI أو رقم فاتورة (مثال: 1500)" />
      </div>

      {code && !order && <p className="text-center text-sm text-ink-3">مفيش فاتورة بالرقم ده</p>}

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
          {order.status === "completed" && (
            <div className="space-y-3 border-t border-border p-4">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب المرتجع (مطلوب)" />
              <Button variant="danger" size="lg" className="w-full" disabled={!reason} onClick={() => returnOrder(order.id)}>
                <RotateCcw size={18} /> تأكيد المرتجع ورد الفلوس
              </Button>
              <p className="text-xs text-ink-3">الأجهزة هترجع المخزن، والربح هيتلغي، والكاش هيتخصم من الدرج. العملية بتتسجل باسمك.</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
