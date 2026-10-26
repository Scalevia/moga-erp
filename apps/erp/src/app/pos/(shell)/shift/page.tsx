"use client";

import { AlertTriangle, CheckCircle2, EyeOff, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgentCard } from "@/components/pos/agents";
import { BalanceFields, CashCount, balancesFilled, emptyBalances, toCount } from "@/components/pos/cash-count";
import { Badge, Button, Card, CardHeader, Money, PageHeader, cn } from "@/components/ui";
import { balanceIds, balanceLabel, dateTime, ledgerLabel, machineIds } from "@/lib/format";
import { currentShift, machineBalance, repBalance, shiftBreakdown, useStore, walletBalance } from "@/lib/store";
import type { Shift } from "@/lib/types";

export default function ShiftClosePage() {
  const store = useStore();
  const employees = store.staff;
  const shift = currentShift(store);
  const [cash, setCash] = useState("");
  const [balances, setBalances] = useState(emptyBalances);
  const [confirm, setConfirm] = useState(false);
  const [closed, setClosed] = useState<Shift | null>(null);

  const counted = Number(cash) || 0;
  // Agents owed money when the page opened stay visible after payment, so the "settled" state shows.
  const [owedAgents] = useState(() => machineIds.filter((id) => repBalance(store, id) < 0));

  if (closed) return <ShiftResult shift={closed} />;

  if (!shift) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-ink-3">
        <Lock size={40} className="mb-3" />
        <p>مفيش شيفت مفتوح. افتح شيفت من أي صفحة تانية.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="تقفيل الشيفت" subtitle={`مفتوح من ${dateTime(shift.openedAt)} — ${employees.find((e) => e.id === shift.employeeId)?.name}`} />

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-brand/20 bg-brand-soft p-4 text-sm text-brand">
        <EyeOff size={20} className="shrink-0" />
        <p>
          <b>عدّ أعمى:</b> عدّ الفلوس اللي في الدرج واكتبها. النظام مش هيقولك المفروض يكون كام غير بعد ما تأكد العدّ — علشان العدّ يبقى حقيقي.
        </p>
      </div>

      {owedAgents.length > 0 && (
        <div className="mb-4">
          <h2 className="mb-1 font-semibold">المندوب جه يحصّل؟</h2>
          <p className="mb-3 text-sm text-ink-3">
            لو دفعتله النهارده، سجّل الدفعة قبل العدّ — علشان الفلوس طالعة من الدرج. لو لسه ما جاش (إجازة أو البنوك قافلة) سيبه، الحساب بيفضل لحد ما يحصّل.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {owedAgents.map((id) => (
              <AgentCard key={id} id={id} />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <CashCount value={cash} onChange={setCash} />

        <div className="space-y-4">
          <BalanceFields value={balances} onChange={setBalances} />

          {!confirm ? (
            <Button size="lg" className="w-full" disabled={cash === "" || !balancesFilled(balances)} onClick={() => setConfirm(true)}>
              تأكيد العدّ
            </Button>
          ) : (
            <Card className="border-warn/40 p-4">
              <p className="mb-3 text-sm">
                متأكد إن الدرج فيه <Money value={counted} className="font-bold" />؟ بعد التأكيد مش هينفع تعدّل، والشاشة هتتقفل.
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => setClosed(store.closeShift({ counted, count: toCount(balances) }))}>
                  نعم، قفّل الشيفت
                </Button>
                <Button variant="secondary" onClick={() => setConfirm(false)}>
                  رجوع
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ShiftResult({ shift }: { shift: Shift }) {
  const store = useStore();
  const router = useRouter();
  const { cashSales, byKind, orders } = shiftBreakdown(store, shift);
  const count = shift.closingCount!;
  const cards = [
    { label: "النقدية", counted: shift.countedCash!, expected: shift.expectedCash! },
    // Compared with what was expected at closing — the balances themselves now follow the count.
    { label: "فودافون كاش", counted: count.wallet, expected: shift.closingExpected?.wallet ?? walletBalance(store) },
    ...balanceIds.map((id) => ({ label: balanceLabel[id], counted: count.machines[id], expected: shift.closingExpected?.machines[id] ?? machineBalance(store, id) })),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="نتيجة تقفيل الشيفت" subtitle={`اتقفل ${dateTime(shift.closedAt!)}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <DiffCard key={c.label} {...c} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="تفاصيل النقدية المتوقعة" subtitle={`${orders.length} فاتورة في الشيفت`} />
          <dl className="divide-y divide-border text-sm">
            <Line label="رصيد أول المدة" value={shift.openingFloat} />
            <Line label="مبيعات كاش" value={cashSales} />
            {[...byKind.entries()].filter(([, v]) => v !== 0).map(([k, v]) => (
              <Line key={k} label={ledgerLabel[k]} value={v} />
            ))}
            <div className="flex justify-between bg-surface-2 px-4 py-3 font-semibold">
              <dt>المتوقع في الدرج</dt>
              <dd>
                <Money value={shift.expectedCash!} />
              </dd>
            </div>
            <div className="flex justify-between px-4 py-2 font-semibold">
              <dt>
                فاضل في الدرج للوردية الجاية
                <span className="block text-xs font-normal text-ink-3">الوردية الجاية هتبدأ بالمبلغ ده بالظبط</span>
              </dt>
              <dd>
                <Money value={shift.countedCash!} />
              </dd>
            </div>
          </dl>
        </Card>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-ink-2">حسابات المناديب</h3>
          {machineIds.map((id) => (
            <AgentCard key={id} id={id} compact />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <Lock size={14} /> الوردية اتقفلت. اللي هيستلم هيعدّ الدرج ويتقارن باللي فاضل فيه.
        </p>
        <Button
          onClick={() => {
            store.logout();
            router.push("/pos/login");
          }}
        >
          تسليم الوردية لموظف تاني
        </Button>
      </div>
    </div>
  );
}

function DiffCard({ label, counted, expected }: { label: string; counted: number; expected: number }) {
  const diff = counted - expected;
  const ok = diff === 0;
  return (
    <Card className={cn("p-4", !ok && (diff < 0 ? "border-bad/40" : "border-warn/40"))}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{label}</span>
        {ok ? (
          <Badge tone="good">
            <CheckCircle2 size={12} /> مظبوط
          </Badge>
        ) : diff < 0 ? (
          <Badge tone="bad">
            <AlertTriangle size={12} /> عجز
          </Badge>
        ) : (
          <Badge tone="warn">
            <AlertTriangle size={12} /> زيادة
          </Badge>
        )}
      </div>
      <div className={cn("mt-2 text-2xl font-bold", ok ? "text-good" : diff < 0 ? "text-bad" : "text-warn")}>
        <Money value={Math.abs(diff)} />
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-ink-3">
        <div className="flex justify-between">
          <span>الفعلي</span>
          <Money value={counted} />
        </div>
        <div className="flex justify-between">
          <span>المتوقع</span>
          <Money value={expected} />
        </div>
      </div>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between px-4 py-2">
      <dt className="text-ink-2">{label}</dt>
      <dd className={value < 0 ? "text-bad" : ""}>
        {value < 0 ? "−" : "+"}
        <Money value={Math.abs(value)} />
      </dd>
    </div>
  );
}
