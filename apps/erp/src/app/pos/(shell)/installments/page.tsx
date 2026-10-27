"use client";

import { CheckCircle2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardHeader, Field, Input, Money, PageHeader, Segmented, cn } from "@/components/ui";
import { date } from "@/lib/format";
import { planOverdue, planRemaining, useStore } from "@/lib/store";

export default function InstallmentsPage() {
  const plans = useStore((s) => s.plans);
  const contacts = useStore((s) => s.contacts);
  const orders = useStore((s) => s.orders);
  const payInstallment = useStore((s) => s.payInstallment);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "vodafone_cash">("cash");
  const [done, setDone] = useState<number | null>(null);

  const rows = useMemo(
    () =>
      plans
        .map((p) => ({ plan: p, customer: contacts.find((c) => c.id === p.customerId)!, overdue: planOverdue(p), remaining: planRemaining(p) }))
        .filter((r) => r.remaining > 0)
        .filter((r) => !q || r.customer.name.includes(q) || r.customer.phone.includes(q) || r.customer.nationalId?.includes(q))
        .sort((a, b) => b.overdue.days - a.overdue.days),
    [plans, contacts, q],
  );

  const selected = rows.find((r) => r.plan.id === selectedId) ?? rows[0];
  const nextDue = selected?.plan.schedule.find((d) => d.paid < d.amount);
  const item = selected && orders.find((o) => o.id === selected.plan.orderId)?.items.find((i) => i.imei);

  return (
    <div>
      <PageHeader title="تحصيل الأقساط" subtitle="ابحث بالاسم أو التليفون أو الرقم القومي" />
      <div className="grid gap-5 lg:grid-cols-[360px_1fr] [&>*]:min-w-0">
        <Card>
          <div className="relative border-b border-border p-3">
            <Search size={16} className="pointer-events-none absolute start-6 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="ps-9" placeholder="بحث…" />
          </div>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.plan.id}>
                <button
                  onClick={() => {
                    setSelectedId(r.plan.id);
                    setDone(null);
                    setAmount("");
                  }}
                  className={cn("flex w-full items-center justify-between px-4 py-3 text-start hover:bg-surface-2", selected?.plan.id === r.plan.id && "bg-brand-soft")}
                >
                  <div>
                    <div className="font-medium">{r.customer.name}</div>
                    <div className="num text-xs text-ink-3">{r.customer.phone}</div>
                  </div>
                  <div className="text-end">
                    <Money value={r.remaining} className="text-sm font-semibold" />
                    <div className="mt-0.5">
                      {r.overdue.count > 0 ? <Badge tone="bad">متأخر {r.overdue.days} يوم</Badge> : <Badge tone="good">منتظم</Badge>}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <Stat label="المتبقي على العميل" value={<Money value={selected.remaining} />} />
              <Stat label="متأخرات" value={<Money value={selected.overdue.amount} />} tone={selected.overdue.amount ? "bad" : undefined} />
              <Stat label="القسط الجاي" value={nextDue ? <Money value={nextDue.amount - nextDue.paid} /> : "—"} sub={nextDue && date(nextDue.dueDate)} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_300px] [&>*]:min-w-0">
              <Card>
                <CardHeader title={item?.name ?? "خطة تقسيط"} subtitle={`كاش ${selected.plan.cashPrice.toLocaleString("en")} · مقدم ${selected.plan.downPayment.toLocaleString("en")} · ${selected.plan.months} شهور · زيادة ${selected.plan.markupPercent}%`} />
                <div className="overflow-x-auto">
                <table className="w-full min-w-[440px] text-sm">
                  <thead className="bg-surface-2 text-xs text-ink-3">
                    <tr>
                      <th className="px-4 py-2 text-start font-medium">#</th>
                      <th className="px-4 py-2 text-start font-medium">الاستحقاق</th>
                      <th className="px-4 py-2 text-start font-medium">القيمة</th>
                      <th className="px-4 py-2 text-start font-medium">المدفوع</th>
                      <th className="px-4 py-2 text-start font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selected.plan.schedule.map((d) => {
                      const late = new Date(d.dueDate) < new Date() && d.paid < d.amount;
                      return (
                        <tr key={d.n}>
                          <td className="num px-4 py-2">{d.n}</td>
                          <td className="whitespace-nowrap px-4 py-2">{date(d.dueDate)}</td>
                          <td className="px-4 py-2"><Money value={d.amount} /></td>
                          <td className="px-4 py-2"><Money value={d.paid} /></td>
                          <td className="px-4 py-2">
                            {d.paid >= d.amount ? <Badge tone="good">مدفوع</Badge> : late ? <Badge tone="bad">متأخر</Badge> : d.paid > 0 ? <Badge tone="warn">جزئي</Badge> : <Badge>قادم</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </Card>

              <Card className="h-fit space-y-3 p-4">
                <h3 className="font-semibold">تحصيل دفعة</h3>
                <Field label="المبلغ" hint="ينفع قسط كامل، أو جزء، أو أكتر من قسط — بيتوزع على الأقدم أولاً">
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(selected.overdue.amount || (nextDue ? nextDue.amount - nextDue.paid : 0))} className="num text-lg font-semibold" />
                </Field>
                <Segmented value={method} onChange={setMethod} options={[{ value: "cash", label: "نقدي" }, { value: "vodafone_cash", label: "فودافون كاش" }]} className="w-full" />
                <Button
                  size="lg"
                  className="w-full"
                  disabled={!(Number(amount) > 0) || Number(amount) > selected.remaining}
                  onClick={() => {
                    payInstallment(selected.plan.id, Number(amount), method);
                    setDone(Number(amount));
                    setAmount("");
                  }}
                >
                  تحصيل وطباعة إيصال
                </Button>
                {done !== null && (
                  <div className="flex items-center gap-2 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
                    <CheckCircle2 size={16} /> اتحصّل <Money value={done} />
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "bad" }) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="text-[11px] text-ink-3 sm:text-xs">{label}</div>
      <div className={cn("mt-1 text-base font-bold sm:text-xl", tone === "bad" && "text-bad")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </Card>
  );
}
