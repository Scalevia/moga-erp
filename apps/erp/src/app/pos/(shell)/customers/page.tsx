"use client";

import { Search, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, CardHeader, Input, Money, PageHeader, cn } from "@/components/ui";
import { date, num } from "@/lib/format";
import { creditBalance, orderTotal, planOverdue, planRemaining, useStore } from "@/lib/store";
import type { Contact } from "@/lib/types";

const DAY = 86400000;

export default function CustomersPage() {
  const store = useStore();
  const { contacts, orders, plans, units, products, settings, movements } = store;
  const isAdmin = store.staff.find((e) => e.id === store.currentEmployeeId)?.role === "admin";
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return contacts
      .filter((c) => c.kind === "customer")
      .map((c) => {
        const mine = orders.filter((o) => o.customerId === c.id && o.status === "completed");
        const myPlans = plans.filter((p) => p.customerId === c.id && planRemaining(p) > 0);
        return {
          c,
          invoices: mine.length,
          spent: mine.reduce((a, o) => a + orderTotal(o), 0),
          last: mine.reduce((a, o) => (o.createdAt > a ? o.createdAt : a), ""),
          owes: myPlans.reduce((a, p) => a + planRemaining(p), 0) + Math.max(0, creditBalance({ orders, movements }, c.id)),
          late: myPlans.some((p) => planOverdue(p).count > 0),
        };
      })
      .filter((r) => !term || r.c.name.toLowerCase().includes(term) || r.c.phone.includes(term) || r.c.nationalId?.includes(term))
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [contacts, orders, plans, movements, q]);

  const selected = rows.find((r) => r.c.id === selectedId) ?? (q ? rows[0] : undefined);

  return (
    <div>
      <PageHeader title="العملاء" subtitle="ابحث بالتليفون أو الاسم — مشترياته وضمان أجهزته وأقساطه" />
      <div className="grid gap-5 lg:grid-cols-[340px_1fr] [&>*]:min-w-0">
        <Card className="h-fit">
          <div className="relative border-b border-border p-3">
            <Search size={16} className="pointer-events-none absolute start-6 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="ps-9" placeholder="01xxxxxxxxx أو الاسم…" />
          </div>
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
            {rows.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">مفيش عميل بالبيانات دي</li>}
            {rows.map((r) => (
              <li key={r.c.id}>
                <button
                  onClick={() => setSelectedId(r.c.id)}
                  className={cn("flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-surface-2", selected?.c.id === r.c.id && "bg-brand-soft")}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.c.name}</div>
                    <div className="num text-xs text-ink-3">{r.c.phone}</div>
                  </div>
                  <div className="shrink-0 text-end text-xs">
                    <div className="text-ink-2">{r.invoices} فاتورة</div>
                    {r.owes > 0 && <Badge tone={r.late ? "bad" : "warn"}>{r.late ? "متأخر" : "عليه أقساط"}</Badge>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {selected ? (
          <CustomerDetail contact={selected.c} spent={selected.spent} invoices={selected.invoices} isAdmin={isAdmin} now={now} />
        ) : (
          <Card className="flex items-center justify-center py-20 text-sm text-ink-3">اختار عميل من القايمة</Card>
        )}
      </div>
    </div>
  );

  function CustomerDetail({ contact, spent, invoices, isAdmin, now }: { contact: Contact; spent: number; invoices: number; isAdmin: boolean; now: number }) {
    const myOrders = orders.filter((o) => o.customerId === contact.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const phones = myOrders.flatMap((o) => o.items.filter((i) => i.imei).map((i) => ({ o, i })));
    const myPlans = plans.filter((p) => p.customerId === contact.id);
    const soldToUs = units.filter((u) => u.supplierId === contact.id && u.condition === "used");
    const owes = myPlans.reduce((a, p) => a + planRemaining(p), 0);
    const nid = contact.nationalId ? (isAdmin ? contact.nationalId : `•••• ${contact.nationalId.slice(-4)}`) : null;

    return (
      <div className="space-y-4">
        <Card className="p-4">
          <div className="text-lg font-bold">{contact.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-4 text-sm text-ink-3">
            <span className="num">{contact.phone}</span>
            {nid && <span className="num">الرقم القومي {nid}</span>}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Mini label="اشترى بـ" value={<Money value={spent} />} />
            <Mini label="فواتير" value={<span className="num">{invoices}</span>} />
            <Mini label="عليه أقساط" value={<Money value={owes} className={owes ? "text-warn" : ""} />} />
          </div>
        </Card>

        {phones.length > 0 && (
          <Card>
            <CardHeader title="الأجهزة والضمان" subtitle={`${phones.length} جهاز`} />
            <Capped
              items={phones}
              render={({ o, i }) => {
                const product = products.find((p) => p.id === i.productId);
                const used = product?.category === "used_phone";
                const until = new Date(new Date(o.createdAt).getTime() + settings.usedWarrantyDays * DAY);
                const covered = until.getTime() > now;
                return (
                  <li key={`${o.id}-${i.imei}`} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 gap-2">
                      <Smartphone size={16} className="mt-0.5 shrink-0 text-ink-3" />
                      <div className="min-w-0">
                        <div className="font-medium">{i.name}</div>
                        <div className="num text-xs text-ink-3">{i.imei}</div>
                        <div className="text-xs text-ink-3">
                          فاتورة #{o.number} · {date(o.createdAt)} · {num(i.unitPrice)} ج.م
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {o.status === "returned" ? (
                        <Badge tone="neutral">مرتجع</Badge>
                      ) : !used ? (
                        <Badge tone="brand">
                          <ShieldCheck size={12} /> ضمان الوكيل
                        </Badge>
                      ) : covered ? (
                        <Badge tone="good">
                          <ShieldCheck size={12} /> ضمان لحد {date(until.toISOString())}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">
                          <ShieldOff size={12} /> الضمان خلص
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              }}
            />
          </Card>
        )}

        {myPlans.length > 0 && (
          <Card>
            <CardHeader title="الأقساط" />
            <ul className="divide-y divide-border text-sm">
              {myPlans.map((p) => {
                const late = planOverdue(p);
                const next = p.schedule.find((d) => d.paid < d.amount);
                const paidCount = p.schedule.filter((d) => d.paid >= d.amount).length;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="font-medium">
                        دفع {paidCount} من {p.months}
                      </div>
                      <div className="text-xs text-ink-3">
                        {p.cancelledAt ? `اتلغت ${date(p.cancelledAt)} — الجهاز رجع` : next ? `القسط الجاي ${num(next.amount - next.paid)} ج.م يوم ${date(next.dueDate)}` : "خلّص"}
                      </div>
                    </div>
                    <div className="text-end">
                      <Money value={planRemaining(p)} className="font-semibold" />
                      <div className="mt-0.5">
                        {p.cancelledAt ? <Badge>اتلغت</Badge> : planRemaining(p) === 0 ? <Badge tone="good">خلّص</Badge> : late.count ? <Badge tone="bad">متأخر {late.days} يوم</Badge> : <Badge tone="good">منتظم</Badge>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card>
          <CardHeader title="الفواتير" subtitle={`${myOrders.length} فاتورة${myOrders.length - invoices ? ` (منها ${myOrders.length - invoices} مرتجع)` : ""} — الأحدث الأول`} />
          {myOrders.length === 0 && <div className="px-4 py-6 text-center text-sm text-ink-3">مفيش فواتير</div>}
          <Capped
            items={myOrders}
            render={(o) => (
              <li key={o.id} className={cn("flex items-center justify-between gap-3 px-4 py-2.5", o.status === "returned" && "opacity-60")}>
                <div className="min-w-0">
                  <div className="font-medium">
                    #{o.number} · {date(o.createdAt)}
                    {o.status === "returned" && <Badge tone="neutral" className="ms-1.5">مرتجع</Badge>}
                    {o.installmentPlanId && <Badge tone="brand" className="ms-1.5">تقسيط</Badge>}
                  </div>
                  <div className="truncate text-xs text-ink-3">{o.items.map((i) => i.name).join("، ")}</div>
                </div>
                <Money value={orderTotal(o)} className="shrink-0 font-semibold" />
              </li>
            )}
          />
        </Card>

        {soldToUs.length > 0 && (
          <Card>
            <CardHeader title="أجهزة باعها للمحل" />
            <ul className="divide-y divide-border text-sm">
              {soldToUs.map((u) => (
                <li key={u.imei} className="flex justify-between px-4 py-2.5">
                  <div>
                    <div>{products.find((p) => p.id === u.productId)?.name}</div>
                    <div className="num text-xs text-ink-3">
                      {u.imei} · {date(u.purchasedAt)}
                    </div>
                  </div>
                  <Money value={u.cost} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    );
  }
}

/** Shows the latest `limit` rows with a toggle for the rest — regular customers can have hundreds. */
function Capped<T>({ items, limit = 5, render }: { items: T[]; limit?: number; render: (item: T) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <>
      <ul className="divide-y divide-border text-sm">{shown.map(render)}</ul>
      {items.length > limit && (
        <button onClick={() => setAll(!all)} className="w-full border-t border-border py-2.5 text-sm font-medium text-brand hover:bg-surface-2">
          {all ? "عرض أقل" : `عرض الكل (${items.length})`}
        </button>
      )}
    </>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-2">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="mt-0.5 font-bold">{value}</div>
    </div>
  );
}
