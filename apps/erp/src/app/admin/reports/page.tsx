"use client";

import { ChevronLeft, ChevronRight, Download, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge, Card, CardHeader, Money, cn } from "@/components/ui";
import { dailySummaries, dayExpenses, dayKey, dayReport, monthExpenses, monthKey, monthRevaluation, toCsv, type DaySummary, type ServiceCategory } from "@/lib/analytics";
import { StockPriceLine } from "@/components/stock-price-line";
import { itemCategoryLabel, num, paymentLabel, time } from "@/lib/format";
import { openingDiffs } from "@/lib/shifts";
import { orderDiscount, orderProfit, orderTotal, useStore } from "@/lib/store";
import type { ItemCategory, Order, PaymentMethod } from "@/lib/types";

const monthFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const weekdayFmt = new Intl.DateTimeFormat("ar-EG", { weekday: "short", timeZone: "UTC" });

const asDate = (key: string) => new Date(`${key.length === 7 ? `${key}-15` : key}T12:00:00Z`);
const shiftMonth = (month: string, by: number) => {
  const d = asDate(month);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
const shiftDay = (day: string, by: number) => {
  const d = asDate(day);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};
const employeeName = (id: string) => useStore.getState().staff.find((e) => e.id === id)?.name ?? "—";

const serviceLabel: Record<ServiceCategory, string> = {
  vodafone_cash: "فودافون كاش",
  fawry: "فوري (شامل البونص)",
  momkn: "ممكن",
  installments: "أرباح التقسيط",
};

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [today] = useState(() => dayKey(new Date().toISOString()));
  const [month, setMonth] = useState(() => monthKey(new Date().toISOString()));
  const [day, setDay] = useState<string | null>(null);

  const openDay = (d: string | null) => {
    setDay(d);
    window.scrollTo({ top: 0 });
  };

  return day ? (
    <DayView day={day} today={today} onChange={openDay} onBack={() => openDay(null)} />
  ) : (
    <MonthView month={month} today={today} onMonth={setMonth} onDay={openDay} />
  );
}

// ---------------------------------------------------------------- month

function MonthView({ month, today, onMonth, onDay }: { month: string; today: string; onMonth: (m: string) => void; onDay: (d: string) => void }) {
  const store = useStore();
  const { orders, movements } = store;
  const days = dailySummaries(orders, movements, month);
  const expenses = monthExpenses(store, month);
  const t = days.reduce(
    (a, d) => ({ sales: a.sales + d.sales, profit: a.profit + d.profit, discount: a.discount + d.discount, invoices: a.invoices + d.invoices }),
    { sales: 0, profit: 0, discount: 0, invoices: 0 },
  );
  const isCurrent = month === today.slice(0, 7);
  const net = t.profit - expenses.total + expenses.overages;
  const stockGain = monthRevaluation(store.revaluations, month);

  function exportMonth() {
    const rows: (string | number)[][] = [["اليوم", "التاريخ", "عدد الفواتير", "المبيعات", "الخصومات", "ربح المبيعات", "ربح الخدمات", "مجمل الربح", "مرتجعات"]];
    for (const d of [...days].reverse()) {
      rows.push([weekdayFmt.format(asDate(d.day)), d.day, d.invoices, d.sales, d.discount, d.salesProfit, d.servicesProfit, d.profit, d.returns]);
    }
    rows.push(["الإجمالي", "", t.invoices, t.sales, t.discount, "", "", t.profit, ""]);
    rows.push([]);
    for (const x of expenses.operating) rows.push(["مصروف", x.category, "", "", "", "", "", -x.amount, ""]);
    rows.push(["مرتبات", "", "", "", "", "", "", -expenses.salaries, ""]);
    if (expenses.shortages) rows.push(["عجز في العدّ", "", "", "", "", "", "", -expenses.shortages, ""]);
    if (expenses.overages) rows.push(["زيادة في العدّ", "", "", "", "", "", "", expenses.overages, ""]);
    rows.push(["صافي الربح", "", "", "", "", "", "", net, ""]);
    if (stockGain) rows.push([stockGain > 0 ? "مكسب غلاء البضاعة (بره صافي الربح)" : "خسارة نزول أسعار البضاعة (بره صافي الربح)", "", "", "", "", "", "", stockGain, ""]);
    download(`مبيعات-${month}.csv`, toCsv(rows));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => onMonth(shiftMonth(month, -1))} className="rounded-lg p-2 hover:bg-surface-2" aria-label="الشهر اللي فات">
          <ChevronRight size={20} />
        </button>
        <h1 className="text-lg font-bold">تقرير {monthFmt.format(asDate(month))}</h1>
        <button onClick={() => onMonth(shiftMonth(month, 1))} disabled={isCurrent} className="rounded-lg p-2 hover:bg-surface-2 disabled:opacity-30" aria-label="الشهر الجاي">
          <ChevronLeft size={20} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="المبيعات" value={<Money value={t.sales} />} sub={`${t.invoices} فاتورة`} />
        <Tile label="الخصومات" value={<Money value={t.discount} />} tone={t.discount ? "warn" : undefined} />
      </div>

      <Card>
        <CardHeader title="الربح" subtitle={isCurrent ? "لحد النهارده" : undefined} />
        <dl className="divide-y divide-border text-sm">
          <Line label="مجمل الربح" value={t.profit} />
          {expenses.operating.map((x) => (
            <Line key={x.category} label={`مصروف: ${x.category}`} value={-x.amount} />
          ))}
          <Line label="المرتبات" value={-expenses.salaries} />
          {expenses.shortages > 0 && <Line label="عجز في العدّ" value={-expenses.shortages} />}
          {expenses.overages > 0 && <Line label="زيادة في العدّ" value={expenses.overages} />}
          <div className="flex items-baseline justify-between bg-surface-2 px-4 py-3">
            <dt className="font-semibold">صافي الربح</dt>
            <dd>
              <Money value={net} className={cn("text-lg font-bold", net < 0 ? "text-bad" : "text-good")} />
            </dd>
          </div>
          <StockPriceLine value={stockGain} />
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="المبيعات يوم بيوم"
          subtitle="اضغط على أي يوم للتفاصيل"
          action={
            <button onClick={exportMonth} className="flex items-center gap-1 text-xs text-brand">
              <Download size={14} /> إكسيل
            </button>
          }
        />
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-b border-border bg-surface-2 px-4 py-2 text-[11px] text-ink-3">
          <span>اليوم</span>
          <span className="w-10 text-center">فواتير</span>
          <span className="w-20 text-end">مبيعات</span>
          <span className="w-16 text-end">مجمل</span>
        </div>
        <ul className="divide-y divide-border">
          {days.map((d) => (
            <DayRow key={d.day} d={d} today={today} onClick={() => onDay(d.day)} />
          ))}
          {days.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">مفيش أيام في الشهر ده لسه</li>}
        </ul>
      </Card>
    </div>
  );
}

function DayRow({ d, today, onClick }: { d: DaySummary; today: string; onClick: () => void }) {
  const empty = d.invoices === 0 && d.profit === 0;
  return (
    <li>
      <button onClick={onClick} className={cn("grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-4 py-2.5 text-start text-sm hover:bg-surface-2", empty && "text-ink-3")}>
        <span>
          <span className="font-medium">{weekdayFmt.format(asDate(d.day))}</span> <span className="num text-ink-3">{Number(d.day.slice(8))}</span>
          {d.day === today && (
            <Badge tone="brand" className="ms-1.5">
              النهارده
            </Badge>
          )}
          {d.discount > 0 && <span className="block text-[11px] text-warn">خصم {num(d.discount)}</span>}
        </span>
        <span className="num w-10 text-center">{d.invoices}</span>
        <span className="num w-20 text-end font-semibold">{num(d.sales)}</span>
        <span className={cn("num w-16 text-end", d.profit < 0 ? "text-bad" : "text-good")}>{num(d.profit)}</span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------- day

function DayView({ day, today, onChange, onBack }: { day: string; today: string; onChange: (d: string) => void; onBack: () => void }) {
  const store = useStore();
  const { orders, movements, contacts } = store;
  const r = dayReport(orders, movements, day);
  const [open, setOpen] = useState<string | null>(null);

  function exportDay() {
    const rows: (string | number)[][] = [["رقم الفاتورة", "الوقت", "الموظف", "العميل", "الصنف", "IMEI", "الكمية", "السعر الأصلي", "سعر البيع", "الخصم", "الربح", "طريقة الدفع", "الحالة"]];
    for (const o of [...r.orders].reverse()) {
      const customer = contacts.find((c) => c.id === o.customerId);
      const pay = o.payments.map((p) => paymentLabel[p.method]).join(" + ");
      for (const i of o.items) {
        const list = i.listPrice ?? i.unitPrice;
        rows.push([o.number, time(o.createdAt), employeeName(o.employeeId), customer ? `${customer.name} ${customer.phone}` : "", i.name, i.imei ?? "", i.qty, list, i.unitPrice, (list - i.unitPrice) * i.qty, (i.unitPrice - i.unitCost) * i.qty, pay, o.status === "returned" ? "مرتجع" : "تمام"]);
      }
    }
    download(`مبيعات-${day}.csv`, toCsv(rows));
  }

  const methods = Object.entries(r.byMethod) as [PaymentMethod, number][];
  const cats = (Object.keys(r.byCategory) as ItemCategory[]).filter((c) => r.byCategory[c].qty > 0);
  const services = (Object.keys(r.services) as ServiceCategory[]).filter((s) => r.services[s] !== 0);
  const spent = dayExpenses(movements, day);
  // Shifts opened today whose count didn't match what the previous close left.
  const handovers = store.shifts.filter((s) => dayKey(s.openedAt) === day).map((s) => ({ s, diffs: openingDiffs(s) })).filter((x) => x.diffs.length > 0);
  const spentTotal = spent.reduce((a, m) => a - (m.cash + m.wallet + (m.bank ?? 0)), 0);
  const lending = movements.filter((m) => (m.kind === "lent_out" || m.kind === "lent_repaid") && dayKey(m.createdAt) === day && m.cash + m.wallet !== 0);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-brand">
        → كل الأيام
      </button>
      <div className="flex items-center justify-between">
        <button onClick={() => onChange(shiftDay(day, -1))} className="rounded-lg p-2 hover:bg-surface-2" aria-label="اليوم اللي فات">
          <ChevronRight size={20} />
        </button>
        <h1 className="text-lg font-bold">{dayFmt.format(asDate(day))}</h1>
        <button onClick={() => onChange(shiftDay(day, 1))} disabled={day >= today} className="rounded-lg p-2 hover:bg-surface-2 disabled:opacity-30" aria-label="اليوم الجاي">
          <ChevronLeft size={20} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="المبيعات" value={<Money value={r.sales} />} />
        <Tile label="مجمل الربح" value={<Money value={r.profit} />} sub={r.servicesProfit ? `منه خدمات ${num(r.servicesProfit)}` : undefined} />
        <Tile label="عدد الفواتير" value={<span className="num">{r.invoices}</span>} sub={r.invoices ? `متوسط الفاتورة ${num(r.sales / r.invoices)}` : undefined} />
        <Tile label="الخصومات" value={<Money value={r.discount} />} tone={r.discount ? "warn" : undefined} sub={r.returns ? `${r.returns} مرتجع` : undefined} />
      </div>

      {methods.length > 0 && (
        <Card>
          <CardHeader title="طرق الدفع" />
          <dl className="divide-y divide-border text-sm">
            {methods.map(([m, v]) => (
              <Line key={m} label={m === "installment" ? "تقسيط (متبقي على العملاء)" : paymentLabel[m]} value={v} />
            ))}
          </dl>
        </Card>
      )}

      {cats.length > 0 && (
        <Card>
          <CardHeader title="حسب النوع" />
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-b border-border bg-surface-2 px-4 py-2 text-[11px] text-ink-3">
            <span>النوع</span>
            <span className="w-8 text-center">قطع</span>
            <span className="w-20 text-end">مبيعات</span>
            <span className="w-16 text-end">ربح</span>
          </div>
          {cats.map((c) => (
            <div key={c} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
              <span>{c === "service" ? "خدمات المحل" : itemCategoryLabel[c]}</span>
              <span className="num w-8 text-center">{r.byCategory[c].qty}</span>
              <span className="num w-20 text-end">{num(r.byCategory[c].sales)}</span>
              <span className="num w-16 text-end text-good">{num(r.byCategory[c].profit)}</span>
            </div>
          ))}
        </Card>
      )}

      {Object.keys(r.byEmployee).length > 0 && (
        <Card>
          <CardHeader title="حسب الموظف" />
          <ul className="divide-y divide-border text-sm">
            {Object.entries(r.byEmployee).map(([id, e]) => (
              <li key={id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <div className="font-medium">{employeeName(id)}</div>
                  <div className="text-xs text-ink-3">
                    {e.invoices} فاتورة{e.discount > 0 && <span className="text-warn"> · خصم {num(e.discount)}</span>}
                  </div>
                </div>
                <div className="text-end">
                  <Money value={e.sales} className="font-semibold" />
                  <div className="text-xs text-good">ربح {num(e.profit)}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {handovers.length > 0 && (
        <Card>
          <CardHeader title="فروقات استلام الورديات" subtitle="اللي اتعدّ عند الفتح مقارنة باللي اتساب عند التقفيل اللي قبله" />
          <ul className="divide-y divide-border text-sm">
            {handovers.map(({ s, diffs }) => (
              <li key={s.id} className="px-4 py-2.5">
                <div className="font-medium">
                  {employeeName(s.employeeId)} استلم {s.previousEmployeeId ? `من ${employeeName(s.previousEmployeeId)}` : ""} · {time(s.openedAt)}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {diffs.map((d) => (
                    <Badge key={d.label} tone={d.diff < 0 ? "bad" : "warn"}>
                      {d.label} {d.diff < 0 ? "ناقص" : "زيادة"} {num(Math.abs(d.diff))}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {spent.length > 0 && (
        <Card>
          <CardHeader title="مصروفات اليوم" subtitle={`مجمل الربح ناقص المصروفات = ${num(r.profit - spentTotal)} ج.م`} />
          <ul className="divide-y divide-border text-sm">
            {spent.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <div>{m.description}</div>
                  <div className="text-xs text-ink-3">
                    {time(m.createdAt)} · {employeeName(m.employeeId)}
                  </div>
                </div>
                <span className="num font-semibold text-bad">−{num(-(m.cash + m.wallet + (m.bank ?? 0)))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {lending.length > 0 && (
        <Card>
          <CardHeader title="سُلف لناس" subtitle="مين ادّى ومين استلم" />
          <ul className="divide-y divide-border text-sm">
            {lending.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <div>{m.description}</div>
                  <div className="text-xs text-ink-3">
                    {time(m.createdAt)} · {employeeName(m.employeeId)}
                  </div>
                </div>
                <span className={cn("num font-semibold", m.kind === "lent_repaid" ? "text-good" : "text-bad")}>
                  {m.kind === "lent_repaid" ? "+" : "−"}
                  {num(Math.abs(m.cash + m.wallet))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {services.length > 0 && (
        <Card>
          <CardHeader title="أرباح الخدمات والتقسيط" />
          <dl className="divide-y divide-border text-sm">
            {services.map((s) => (
              <Line key={s} label={serviceLabel[s]} value={r.services[s]} />
            ))}
          </dl>
        </Card>
      )}

      <Card>
        <CardHeader
          title="الفواتير"
          subtitle={`${r.orders.length} فاتورة`}
          action={
            r.orders.length > 0 && (
              <button onClick={exportDay} className="flex items-center gap-1 text-xs text-brand">
                <Download size={14} /> إكسيل
              </button>
            )
          }
        />
        <ul className="divide-y divide-border">
          {r.orders.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">مفيش فواتير اليوم ده</li>}
          {r.orders.map((o) => (
            <Invoice key={o.id} o={o} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)} customer={contacts.find((c) => c.id === o.customerId)?.name} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Invoice({ o, open, onToggle, customer }: { o: Order; open: boolean; onToggle: () => void; customer?: string }) {
  const discount = orderDiscount(o);
  const returned = o.status === "returned";
  return (
    <li>
      <button onClick={onToggle} className={cn("flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-surface-2", returned && "opacity-60")}>
        <div className="min-w-0">
          <div className="font-medium">
            <span className="num">#{o.number}</span> · {time(o.createdAt)}
            {returned && (
              <Badge tone="bad" className="ms-1.5">
                <RotateCcw size={10} /> مرتجع
              </Badge>
            )}
            {o.installmentPlanId && (
              <Badge tone="brand" className="ms-1.5">
                تقسيط
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-ink-3">
            {employeeName(o.employeeId)}
            {customer && ` · ${customer}`} · {o.items.map((i) => i.name).join("، ")}
          </div>
        </div>
        <div className="shrink-0 text-end">
          <Money value={orderTotal(o)} className={cn("font-semibold", returned && "line-through")} />
          {discount > 0 && <div className="text-[11px] text-warn">خصم {num(discount)}</div>}
        </div>
      </button>
      {open && (
        <div className="space-y-1.5 bg-surface-2 px-4 py-3 text-xs">
          {o.items.map((i, k) => {
            const list = i.listPrice ?? i.unitPrice;
            return (
              <div key={k} className="flex justify-between gap-3">
                <div className="min-w-0">
                  <div>
                    {i.qty > 1 && <span className="num">{i.qty}× </span>}
                    {i.name}
                  </div>
                  {i.imei && <div className="num text-ink-3">{i.imei}</div>}
                  {i.note && <div className="text-ink-3">{i.note}</div>}
                </div>
                <div className="shrink-0 text-end">
                  <div className="flex items-baseline justify-end gap-1.5">
                    {list !== i.unitPrice && <span className="num text-ink-3 line-through">{num(list)}</span>}
                    <span className="num font-semibold">{num(i.unitPrice)}</span>
                  </div>
                  <div className="text-good">ربح {num((i.unitPrice - i.unitCost) * i.qty)}</div>
                </div>
              </div>
            );
          })}
          <div className="flex justify-between border-t border-border pt-1.5 text-ink-2">
            <span>{o.payments.map((p) => `${paymentLabel[p.method]} ${num(p.amount)}`).join(" + ")}</span>
            <span className="text-good">ربح الفاتورة {num(orderProfit(o))}</span>
          </div>
        </div>
      )}
    </li>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "warn" }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className={cn("mt-1 text-lg font-bold", tone === "warn" && "text-warn")}>{value}</div>
      {sub && <div className="text-[11px] text-ink-3">{sub}</div>}
    </Card>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between px-4 py-2.5">
      <dt className="text-ink-2">{label}</dt>
      <dd>
        {/* `|| 0` turns -0 into 0 so an empty line never reads "-0". */}
        <Money value={value || 0} className={value < 0 ? "text-bad" : ""} />
      </dd>
    </div>
  );
}
