"use client";

import { CheckCircle2, ClipboardList, Sunrise } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Money, cn } from "@/components/ui";
import { dayKey } from "@/lib/analytics";
import { balanceIds, balanceLabel, dateTime, machineIds } from "@/lib/format";
import { lastClosedShift, machineBalance, useStore, walletBalance } from "@/lib/store";
import { AgentCard } from "./agents";
import type { BalanceId } from "@/lib/types";
import { BalanceFields, CashCount, balancesFilled, emptyBalances, toCount } from "./cash-count";

interface Row {
  label: string;
  expected: number | null;
  actual: number;
}

export function OpenDay() {
  const store = useStore();
  const employees = store.staff;
  const last = lastClosedShift(store);
  const firstOfDay = !last?.closedAt || dayKey(last.closedAt) !== dayKey(new Date().toISOString());
  const lastBy = employees.find((e) => e.id === last?.employeeId)?.name;

  const [cash, setCash] = useState("");
  const [balances, setBalances] = useState(emptyBalances);
  const [review, setReview] = useState(false);

  const counted = Number(cash) || 0;
  const leftInDrawer = last ? (last.countedCash ?? 0) : null; // cash never leaves the drawer between shifts
  const actual = toCount(balances);

  const rows: Row[] = [
    { label: "الدرج", expected: leftInDrawer, actual: counted },
    { label: "فودافون كاش", expected: walletBalance(store), actual: actual.wallet },
    ...balanceIds.map((id) => ({ label: balanceLabel[id], expected: machineBalance(store, id), actual: actual.machines[id] })),
  ];
  const hasIssues = rows.some((r) => r.expected !== null && r.actual !== r.expected);
  const expected = {
    cash: leftInDrawer,
    wallet: walletBalance(store),
    machines: Object.fromEntries(balanceIds.map((id) => [id, machineBalance(store, id)])) as Record<BalanceId, number>,
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          {firstOfDay ? <Sunrise size={22} /> : <ClipboardList size={22} />}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{firstOfDay ? "بداية اليوم" : "استلام الشيفت"}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {last?.closedAt
              ? `آخر تقفيل: ${dateTime(last.closedAt)} — ${lastBy}. `
              : ""}
            الشاشة هتفتح بعد ما تعدّ الدرج وتراجع المناديب والأرصدة.
          </p>
        </div>
      </div>

      {!review ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <Step n={1} title="عدّ الفلوس اللي في الدرج" />
              <CashCount value={cash} onChange={setCash} title="عدّ الدرج" />
            </div>
            <div className="space-y-4">
              <div>
                <Step n={2} title="المناديب — حد شحن الماكينات؟" />
                <p className="-mt-1 mb-3 text-xs text-ink-3">لو المندوب شحن الماكينة قبل ما تفتح، سجّله هنا قبل ما تكتب رصيد الماكينات.</p>
                <div className="space-y-3">
                  {machineIds.map((id) => (
                    <AgentCard key={id} id={id} />
                  ))}
                </div>
              </div>
              <div>
                <Step n={3} title="أرصدة المحافظ والماكينات" />
                <BalanceFields value={balances} onChange={setBalances} />
              </div>
            </div>
          </div>
          <Button size="lg" className="mt-5 w-full" disabled={cash === "" || !balancesFilled(balances)} onClick={() => setReview(true)}>
            مراجعة وفتح الشيفت
          </Button>
        </>
      ) : (
        <div className="mx-auto max-w-2xl space-y-4">
          <Card>
            <CardHeader title="مقارنة بآخر تقفيل" subtitle="المتوقع = اللي اتساب بعد آخر تقفيل + أي شحن اتسجل من المناديب" />
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">البند</th>
                  <th className="px-4 py-2 text-start font-medium">المتوقع</th>
                  <th className="px-4 py-2 text-start font-medium">الفعلي</th>
                  <th className="px-4 py-2 text-start font-medium">الفرق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const diff = r.expected === null ? 0 : r.actual - r.expected;
                  return (
                    <tr key={r.label}>
                      <td className="px-4 py-2.5 font-medium">{r.label}</td>
                      <td className="px-4 py-2.5">{r.expected === null ? "—" : <Money value={r.expected} />}</td>
                      <td className="px-4 py-2.5">
                        <Money value={r.actual} />
                      </td>
                      <td className="px-4 py-2.5">
                        {diff === 0 ? (
                          <Badge tone="good">
                            <CheckCircle2 size={12} /> مظبوط
                          </Badge>
                        ) : (
                          <Badge tone={diff < 0 ? "bad" : "warn"}>
                            {diff < 0 ? "ناقص" : "زيادة"} <Money value={Math.abs(diff)} />
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <div className={cn("rounded-lg px-4 py-3 text-sm", hasIssues ? "bg-bad-soft text-bad" : "bg-good-soft text-good")}>
            {hasIssues ? "في فرق بين العدّ والمتوقع — راجع العدّ مرة تانية قبل ما تفتح الوردية." : "كل حاجة مظبوطة. يوم موفق 👌"}
          </div>

          <div className="flex gap-2">
            <Button size="lg" className="flex-1" onClick={() => store.openShift({ float: counted, count: actual, expected })}>
              فتح الشيفت برصيد <Money value={counted} />
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setReview(false)}>
              رجوع للتعديل
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-ink">{n}</span>
      <h2 className="font-semibold">{title}</h2>
    </div>
  );
}
