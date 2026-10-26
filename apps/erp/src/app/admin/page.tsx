"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, HandCoins, HandHelping, PackageMinus, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CategoryBars, RevenueProfitChart } from "@/components/admin/charts";
import { Card, CardHeader, Money, cn } from "@/components/ui";
import { cashCollected, dayKey, growth, monthExpenses, monthRevaluation, monthToDate, monthly, profitByCategory, todayStats, type ServiceCategory } from "@/lib/analytics";
import { StockPriceLine } from "@/components/stock-price-line";

const serviceLabel: Record<ServiceCategory, string> = {
  vodafone_cash: "فودافون كاش (عمولات − رسوم التسييل)",
  fawry: "عمولات فوري (شامل بونص Air time)",
  momkn: "عمولات ممكن",
  installments: "أرباح التقسيط (الزيادة المحصّلة)",
};
import { balanceIds, balanceLabel, categoryLabel, dateTime, machineIds, machineLabel, pct, sinceDays } from "@/lib/format";
import { drawerCash } from "@/lib/capital";
import { closingDiffs, describeDiffs, openingDiffs } from "@/lib/shifts";
import { daysSince, lentOverdueDays, lentRemaining, machineBalance, planOverdue, repBalance, repUnpaidSince, useStore, walletBalance } from "@/lib/store";

export default function Dashboard() {
  const store = useStore();
  const [now] = useState(() => Date.now());
  const months = monthly(store.orders, store.movements);
  const curr = months[months.length - 1];
  const prev = months[months.length - 2];
  const dayOfMonth = Number(dayKey(new Date().toISOString()).slice(8, 10));
  const prevMtd = monthToDate(store.orders, store.movements, prev.key, dayOfMonth);
  const collected = cashCollected(store.orders, store.movements, curr.key, dayOfMonth);
  const prevCollected = cashCollected(store.orders, store.movements, prev.key, dayOfMonth);
  const today = todayStats(store.orders, store.movements);
  const cats = profitByCategory(store.orders, store.movements, curr.key);
  const expenses = monthExpenses(store, curr.key, dayOfMonth);
  const net = curr.profit - expenses.total + expenses.overages;
  const prevExpenses = monthExpenses(store, prev.key);
  const prevNet = prev.profit - prevExpenses.total + prevExpenses.overages;
  const stockGain = monthRevaluation(store.revaluations, curr.key, dayOfMonth);

  const overdue = store.plans.map((p) => ({ p, o: planOverdue(p) })).filter((x) => x.o.count > 0);
  const lowStock = store.products.filter((p) => p.tracking === "quantity" && p.quantity <= 10);
  // Differences found when a shift was closed (last 7 days), per shift — missing or extra.
  const closingIssues = store.shifts
    .filter((s) => s.closedAt && s.closedAt >= new Date(now - 7 * 86400000).toISOString())
    .map((s) => ({ s, diffs: closingDiffs(s) }))
    .filter((x) => x.diffs.length > 0)
    .reverse();
  const owedReps = machineIds.filter((id) => repBalance(store, id) < 0);
  const lateLent = store.lentOut.filter((l) => lentOverdueDays(l) > 0);
  // Gaps found when someone opened a shift (last 7 days): money missing between two counts.
  const weekAgo = new Date(now - 7 * 86400000).toISOString();
  const openingIssues = store.shifts
    .filter((s) => s.openedAt >= weekAgo)
    .map((s) => ({ s, diffs: openingDiffs(s) }))
    .filter((x) => x.diffs.length > 0)
    .reverse();
  const staffName = (id?: string) => store.staff.find((e) => e.id === id)?.name ?? "—";
  // Sales where an item went for less than it cost us (last 7 days) — the cashier was warned, the owner is told here.
  const lossSales = store.orders
    .filter((o) => o.status === "completed" && o.createdAt >= weekAgo)
    .map((o) => {
      const lines = o.items.filter((i) => i.unitPrice < i.unitCost);
      return { o, lines, loss: lines.reduce((a, i) => a + (i.unitCost - i.unitPrice) * i.qty, 0) };
    })
    .filter((x) => x.lines.length > 0)
    .sort((a, b) => b.o.createdAt.localeCompare(a.o.createdAt));
  const drawer = drawerCash(store);

  return (
    <div className="space-y-4">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink-3">النهارده</h2>
        <div className="grid grid-cols-3 gap-2">
          <Tile label="المبيعات" value={<Money value={today.revenue} />} />
          <Tile label="مجمل الربح" value={<Money value={today.profit} />} />
          <Tile label="الفواتير" value={<span className="num">{today.orders}</span>} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <GrowthTile label={`إيرادات ${curr.label} لحد النهارده`} value={curr.revenue} change={growth(curr.revenue, prevMtd.revenue)} />
        <GrowthTile label={`مجمل ربح ${curr.label} لحد النهارده`} value={curr.profit} change={growth(curr.profit, prevMtd.profit)} />
        <div className="col-span-2">
          <GrowthTile
            label={`الكاش اللي اتحصّل في ${curr.label}`}
            value={collected.total}
            change={growth(collected.total, prevCollected.total)}
            detail={
              <>
                مبيعات ومقدمات <Money value={collected.sales} /> · أقساط <Money value={collected.installments} />
              </>
            }
          />
        </div>
      </section>

      <Card>
        <CardHeader title={`الربح الحقيقي — ${curr.label} لحد النهارده`} subtitle="مجمل الربح ناقص كل مصاريف المحل" />
        <dl className="divide-y divide-border text-sm">
          <div className="flex justify-between px-4 py-2.5">
            <dt>مجمل الربح (مبيعات وخدمات وتقسيط)</dt>
            <dd>
              <Money value={curr.profit} className="font-semibold" />
            </dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt>
              مصروفات التشغيل
              {expenses.operating.length > 0 && (
                <span className="block text-xs text-ink-3">
                  {expenses.operating
                    .slice(0, 3)
                    .map((x) => `${x.category} ${Math.round(x.amount).toLocaleString("en")}`)
                    .join(" · ")}
                </span>
              )}
            </dt>
            <dd className="text-bad">
              − <Money value={expenses.operatingTotal} />
            </dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt>
              المرتبات
              <span className="block text-xs text-ink-3">بتتحسب لما تتصرف من «الموظفين»</span>
            </dt>
            <dd className="text-bad">
              − <Money value={expenses.salaries} />
            </dd>
          </div>
          {expenses.shortages > 0 && (
            <div className="flex justify-between px-4 py-2.5">
              <dt>
                عجز في العدّ
                <span className="block text-xs text-ink-3">الدرج والمحفظة والماكينات — في استلام وتقفيل الشيفتات</span>
              </dt>
              <dd className="text-bad">
                − <Money value={expenses.shortages} />
              </dd>
            </div>
          )}
          {expenses.overages > 0 && (
            <div className="flex justify-between px-4 py-2.5">
              <dt>
                زيادة في العدّ
                <span className="block text-xs text-ink-3">فلوس طلعت زيادة عن المتوقع — راجع سببها</span>
              </dt>
              <dd className="text-good">
                + <Money value={expenses.overages} />
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between bg-surface-2 px-4 py-3">
            <dt className="font-semibold">صافي الربح</dt>
            <dd>
              <Money value={net} className={cn("text-xl font-bold", net < 0 ? "text-bad" : "text-good")} />
            </dd>
          </div>
          <StockPriceLine value={stockGain} />
        </dl>
        <p className="px-4 py-2 text-xs text-ink-3">
          الشهر اللي فات كله: صافي <Money value={prevNet} />
        </p>
      </Card>

      {(overdue.length > 0 || lowStock.length > 0 || closingIssues.length > 0 || owedReps.length > 0 || lateLent.length > 0 || openingIssues.length > 0 || lossSales.length > 0) && (
        <Card>
          <CardHeader title="محتاج انتباهك" />
          <ul className="divide-y divide-border text-sm">
            {lossSales.slice(0, 3).map(({ o, lines, loss }) => (
              <li key={`loss-${o.id}`} className="flex items-start gap-3 px-4 py-3">
                <TrendingDown size={16} className="mt-0.5 shrink-0 text-bad" />
                <span className="flex-1">
                  بيعة بخسارة — فاتورة #{o.number} · {staffName(o.employeeId)}
                  <span className="block text-xs text-ink-3">{lines.map((i) => i.name).join("، ")}</span>
                  <span className="block text-xs text-ink-3">{dateTime(o.createdAt)}</span>
                </span>
                <span className="shrink-0 text-end">
                  <Money value={loss} className="font-semibold text-bad" />
                  <span className="block text-[11px] text-ink-3">تحت التكلفة</span>
                </span>
              </li>
            ))}
            {lossSales.length > 3 && (
              <li className="px-4 py-2 text-xs text-ink-3">
                و{lossSales.length - 3} بيعات تانية بخسارة الأسبوع ده — إجمالي الخسارة <Money value={lossSales.reduce((a, x) => a + x.loss, 0)} />
              </li>
            )}
            {openingIssues.map(({ s, diffs }) => {
              const missing = diffs.some((d) => d.diff < 0);
              return (
                <li key={`open-${s.id}`} className="flex items-start gap-3 px-4 py-3">
                  <AlertTriangle size={16} className={cn("mt-0.5 shrink-0", missing ? "text-bad" : "text-warn")} />
                  <span className="flex-1">
                    فرق عند استلام وردية {staffName(s.employeeId)}
                    {s.previousEmployeeId && <> من {staffName(s.previousEmployeeId)}</>}
                    <span className={cn("block text-xs", missing ? "text-bad" : "text-warn")}>{describeDiffs(diffs)}</span>
                    <span className="block text-xs text-ink-3">{dateTime(s.openedAt)}</span>
                  </span>
                </li>
              );
            })}
            {closingIssues.map(({ s, diffs }) => {
              const missing = diffs.some((d) => d.diff < 0);
              return (
                <li key={`close-${s.id}`} className="flex items-start gap-3 px-4 py-3">
                  <AlertTriangle size={16} className={cn("mt-0.5 shrink-0", missing ? "text-bad" : "text-warn")} />
                  <span className="flex-1">
                    فرق في تقفيل شيفت {staffName(s.employeeId)}
                    <span className={cn("block text-xs", missing ? "text-bad" : "text-warn")}>{describeDiffs(diffs)}</span>
                    <span className="block text-xs text-ink-3">{dateTime(s.closedAt!)}</span>
                  </span>
                </li>
              );
            })}
            {owedReps.map((id) => (
              <li key={id} className="flex items-center gap-3 px-4 py-3">
                <HandCoins size={16} className="text-warn" />
                <span className="flex-1">
                  عليك لمندوب {machineLabel[id]}
                  <span className="block text-xs text-ink-3">
                    {(() => {
                      const since = repUnpaidSince(store, id);
                      const d = since ? daysSince(since) : 0;
                      return d === 0 ? "شحن النهارده" : sinceDays(d);
                    })()}
                  </span>
                </span>
                <Money value={-repBalance(store, id)} className="font-semibold text-warn" />
              </li>
            ))}
            {lateLent.map((l) => (
              <li key={l.id}>
                <Link href="/admin/money" className="flex items-center gap-3 px-4 py-3">
                  <HandHelping size={16} className="text-bad" />
                  <span className="flex-1">
                    سلفة {store.contacts.find((c) => c.id === l.borrowerId)?.name}
                    <span className="block text-xs text-ink-3">ميعادها عدّى {sinceDays(lentOverdueDays(l))}</span>
                  </span>
                  <Money value={lentRemaining(l)} className="font-semibold text-bad" />
                </Link>
              </li>
            ))}
            {overdue.length > 0 && (
              <li>
                <Link href="/admin/money" className="flex items-center gap-3 px-4 py-3">
                  <CalendarClock size={16} className="text-bad" />
                  <span className="flex-1">{overdue.length} عملاء متأخرين في الأقساط</span>
                  <Money value={overdue.reduce((a, x) => a + x.o.amount, 0)} className="font-semibold text-bad" />
                </Link>
              </li>
            )}
            {lowStock.length > 0 && (
              <li>
                <Link href="/admin/inventory" className="flex items-center gap-3 px-4 py-3">
                  <PackageMinus size={16} className="text-warn" />
                  <span className="flex-1">{lowStock.length} أصناف قربت تخلص</span>
                  <span className="text-xs text-ink-3">{lowStock.map((p) => p.name.split(" ")[0]).slice(0, 3).join("، ")}</span>
                </Link>
              </li>
            )}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="الإيرادات مقابل مجمل الربح" subtitle="آخر 12 شهر — قبل المصروفات" />
        <div className="p-4">
          <RevenueProfitChart data={months} />
        </div>
      </Card>

      <Card>
        <CardHeader title={`توزيع الربح — ${curr.label}`} />
        <div className="p-4">
          <CategoryBars rows={(Object.keys(cats) as (keyof typeof cats)[]).map((k) => ({ label: k in serviceLabel ? serviceLabel[k as ServiceCategory] : k === "service" ? "خدمات المحل" : categoryLabel[k as keyof typeof categoryLabel], value: cats[k] })).sort((a, b) => b.value - a.value)} />
        </div>
      </Card>

      <Card>
        <CardHeader title="الأرصدة اللحظية" />
        <div className="grid grid-cols-2 gap-px bg-border">
          <Balance label="درج الكاش" value={drawer.value} sub={drawer.sub} />
          <Balance label="فودافون كاش" value={walletBalance(store)} />
          {balanceIds.map((id) => (
            <Balance key={id} label={balanceLabel[id]} value={machineBalance(store, id)} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </Card>
  );
}

function GrowthTile({ label, value, change, detail }: { label: string; value: number; change: number; detail?: React.ReactNode }) {
  const up = change >= 0;
  return (
    <Card className="p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 text-lg font-bold">
        <Money value={value} />
      </div>
      <div className={cn("mt-1 flex items-center gap-1 text-xs font-medium", up ? "text-good" : "text-bad")}>
        {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        <span className="num">{pct(change)}</span>
        <span className="text-ink-3">عن نفس الفترة الشهر اللي فات</span>
      </div>
      {detail && <div className="mt-1.5 border-t border-border pt-1.5 text-[11px] text-ink-3">{detail}</div>}
    </Card>
  );
}

function Balance({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-surface p-4">
      <div className="text-xs text-ink-3">{label}</div>
      <Money value={value} className="mt-1 block text-lg font-bold" />
      {sub && <div className="text-[11px] text-ink-3">{sub}</div>}
    </div>
  );
}
