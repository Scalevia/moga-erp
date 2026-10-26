"use client";

import { BellRing, CheckCircle2, ClipboardList, Plus, Sunrise } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Money, cn } from "@/components/ui";
import { dayKey } from "@/lib/analytics";
import { balanceIds, balanceLabel, balancesOf, dateTime, machineIds, machineLabel, sinceDays, time } from "@/lib/format";
import { daysSince, lastClosedShift, machineBalance, repBalance, repUnpaidSince, useStore, walletBalance } from "@/lib/store";
import { AgentLoadForm } from "./agents";
import type { BalanceId, CashMovement } from "@/lib/types";
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
  // Loads recorded on this screen before the shift opens (no shift yet) — kept in the store, so a
  // refresh still lists them and nobody records the same load twice.
  const loads = store.movements.filter((m) => m.kind === "rep_load" && m.shiftId === "none" && (!last?.closedAt || m.createdAt > last.closedAt));
  const [agentCame, setAgentCame] = useState<boolean | null>(() => (loads.length > 0 ? true : null));
  const [addingLoad, setAddingLoad] = useState(false);
  // Agents still waiting to be paid from before — e.g. a load left unpaid over a holiday. This morning's loads are listed below instead.
  const owedAgents = machineIds
    .map((id) => {
      const today = loads.filter((m) => m.machineId === id).reduce((a, m) => a - (m.rep ?? 0), 0);
      const since = repUnpaidSince(store, id);
      return { id, owed: -repBalance(store, id) - today, days: since ? daysSince(since) : 0 };
    })
    .filter((a) => a.owed > 0);
  // "Yes" needs at least one load recorded, otherwise the machine counts below won't match.
  const agentsDone = agentCame === false || (agentCame === true && loads.length > 0);
  const loadText = (m: CashMovement) => {
    const id = m.machineId!;
    const account = balancesOf(id).length > 1 && m.balanceId ? ` — ${balanceLabel[m.balanceId].replace(`${machineLabel[id]} — `, "")}` : "";
    return `مندوب ${machineLabel[id]}${account}: ${(-(m.rep ?? 0)).toLocaleString("en")}`;
  };

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
                <Step n={2} title="المناديب" />
                {owedAgents.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {owedAgents.map(({ id, owed, days }) => (
                      <div key={id} className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-sm text-warn">
                        <BellRing size={16} className="mt-0.5 shrink-0" />
                        <span>
                          مندوب {machineLabel[id]} ليه <Money value={owed} className="font-bold" /> — {sinceDays(days)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <Card className="p-4">
                  <p className="mb-3 text-sm font-medium">هل في مندوب شحن الماكينات قبل ما تفتح؟</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([false, true] as const).map((v) => (
                      <button
                        key={String(v)}
                        onClick={() => setAgentCame(v)}
                        // Once a load is recorded the answer is "yes".
                        disabled={!v && loads.length > 0}
                        className={cn(
                          "rounded-lg border py-2.5 text-sm font-medium transition disabled:opacity-40",
                          agentCame === v ? "border-brand bg-brand-soft text-brand" : "border-border hover:bg-surface-2",
                        )}
                      >
                        {v ? "أيوه" : "لأ"}
                      </button>
                    ))}
                  </div>
                  {agentCame && (
                    <div className="mt-4 space-y-3 border-t border-border pt-4">
                      {loads.length > 0 && (
                        <ul className="space-y-1.5">
                          {loads.map((m) => (
                            <li key={m.id} className="flex items-center gap-2 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
                              <CheckCircle2 size={15} className="shrink-0" /> اتسجل {time(m.createdAt)} — {loadText(m)}
                            </li>
                          ))}
                        </ul>
                      )}
                      {loads.length === 0 || addingLoad ? (
                        <AgentLoadForm onRecorded={() => setAddingLoad(false)} />
                      ) : (
                        <Button variant="secondary" size="sm" className="w-full" onClick={() => setAddingLoad(true)}>
                          <Plus size={15} /> مندوب تاني شحن
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              </div>
              <div>
                <Step n={3} title="أرصدة المحافظ والماكينات" />
                <p className="-mt-1 mb-3 text-xs text-ink-3">اكتب الرصيد اللي ظاهر على الماكينة دلوقتي — بعد شحنة المندوب.</p>
                <BalanceFields value={balances} onChange={setBalances} />
              </div>
            </div>
          </div>
          <Button size="lg" className="mt-5 w-full" disabled={cash === "" || !agentsDone || !balancesFilled(balances)} onClick={() => setReview(true)}>
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
