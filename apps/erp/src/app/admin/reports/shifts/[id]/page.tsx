"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Card, CardHeader, Money, cn } from "@/components/ui";
import { balanceIds, balanceLabel, ledgerLabel, machineLabel, paymentLabel, time, weekdayDate } from "@/lib/format";
import { shiftReport, shiftStatus } from "@/lib/shifts";
import { orderTotal, useStore } from "@/lib/store";
import type { BalanceId, CashMovement } from "@/lib/types";

// Short names so the count tables fit on a phone.
const shortLabel: Record<BalanceId, string> = { fawry_airtime: "فوري Air time", fawry_general: "فوري عام", momkn: "ممكن" };

interface CountRow {
  label: string;
  counted?: number;
  expected?: number | null;
}

/** One shift: how it opened, what was sold and paid, every movement, and how it closed. Open shifts show the numbers so far. */
export default function ShiftPage() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  const [now] = useState(() => Date.now());
  const shift = store.shifts.find((s) => s.id === id);
  const name = (staffId?: string) => store.staff.find((e) => e.id === staffId)?.name ?? "—";

  if (!shift)
    return (
      <div className="py-10 text-center text-sm text-ink-3">
        الوردية دي مش موجودة —{" "}
        <Link href="/admin/reports/shifts" className="text-brand">
          كل الورديات
        </Link>
      </div>
    );

  const r = shiftReport(store, shift);
  const status = shiftStatus(shift);
  const minutes = Math.max(0, Math.round(((shift.closedAt ? Date.parse(shift.closedAt) : now) - Date.parse(shift.openedAt)) / 60000));
  const hours = Math.floor(minutes / 60);
  const duration = [hours && `${hours} ساعة`, (minutes % 60 || !hours) && `${minutes % 60} دقيقة`].filter(Boolean).join(" و ");

  const opening: CountRow[] = [
    { label: "الدرج", counted: shift.openingFloat, expected: shift.openingExpected?.cash },
    ...(shift.openingCount
      ? [
          { label: "فودافون كاش", counted: shift.openingCount.wallet, expected: shift.openingExpected?.wallet },
          ...balanceIds.map((b) => ({ label: shortLabel[b], counted: shift.openingCount!.machines[b], expected: shift.openingExpected?.machines[b] })),
        ]
      : []),
  ];
  const closing: CountRow[] = shift.closedAt
    ? [
        { label: "الدرج", counted: shift.countedCash, expected: shift.expectedCash },
        ...(shift.closingCount
          ? [
              { label: "فودافون كاش", counted: shift.closingCount.wallet, expected: shift.closingExpected?.wallet },
              ...balanceIds.map((b) => ({ label: shortLabel[b], counted: shift.closingCount!.machines[b], expected: shift.closingExpected?.machines[b] })),
            ]
          : []),
      ]
    : [];

  return (
    <div className="space-y-4">
      <Link href="/admin/reports/shifts" className="inline-flex items-center gap-1 text-sm text-brand">
        <ChevronRight size={16} /> كل الورديات
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">وردية {name(shift.employeeId)}</h1>
          <p className="text-sm text-ink-3">
            {weekdayDate(shift.openedAt)} · {time(shift.openedAt)} ← {shift.closedAt ? time(shift.closedAt) : "لسه مفتوحة"} · {duration}
          </p>
        </div>
        <Badge tone={status.tone} className="shrink-0">
          {status.text}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="المبيعات" value={<Money value={r.sales} />} sub={r.discount > 0 ? <>منها خصومات <Money value={r.discount} /></> : undefined} />
        <Tile label="مجمل الربح" value={<Money value={r.profit} />} sub="مبيعات وخدمات" />
        <Tile label="الفواتير" value={<span className="num">{r.orders.length}</span>} sub={r.returned.length ? `منها ${r.returned.length} اترجعت` : undefined} />
        <Tile label={shift.closedAt ? "الدرج اتعدّ في التقفيل" : "المفروض في الدرج دلوقتي"} value={<Money value={r.cashNow} />} />
      </div>

      <Card>
        <CardHeader title="الفتح" subtitle={`${name(shift.employeeId)} الساعة ${time(shift.openedAt)}${shift.previousEmployeeId ? ` — استلمها من ${name(shift.previousEmployeeId)}` : ""}`} />
        <Counts rows={opening} />
        {r.loadsBefore.length > 0 && (
          <div className="border-t border-border px-4 py-3 text-sm">
            <div className="mb-1 font-medium">المناديب شحنوا قبل الفتح</div>
            {r.loadsBefore.map((m) => (
              <div key={m.id} className="flex justify-between text-ink-2">
                <span>
                  مندوب {m.machineId ? machineLabel[m.machineId] : ""}
                  {m.balanceId && m.machineId === "fawry" ? ` — ${balanceLabel[m.balanceId].replace("فوري — ", "")}` : ""} · {time(m.createdAt)}
                </span>
                <Money value={-(m.rep ?? 0)} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="المبيعات" subtitle={`${r.orders.length} فاتورة`} />
        {r.byMethod.length > 0 && (
          <dl className="divide-y divide-border border-b border-border text-sm">
            {r.byMethod.map(([method, amount]) => (
              <div key={method} className="flex justify-between px-4 py-2">
                <dt className="text-ink-2">{paymentLabel[method]}</dt>
                <dd>
                  <Money value={amount} />
                </dd>
              </div>
            ))}
          </dl>
        )}
        {r.orders.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-ink-3">مفيش فواتير في الوردية دي</div>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {r.orders.map((o) => {
              const returned = o.status === "returned";
              return (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate">
                      <span className="num text-ink-3">#{o.number}</span> · {o.items.map((i) => i.name).join("، ")}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {time(o.createdAt)}
                      {o.employeeId !== shift.employeeId && ` · ${name(o.employeeId)}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <Money value={orderTotal(o)} className={cn("font-semibold", returned && "text-ink-3 line-through")} />
                    {returned && (
                      <span className="block">
                        <Badge tone="bad">اترجعت</Badge>
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="الحركات" subtitle="مصروفات، فودافون كاش وفوري، مناديب، سُلف، أقساط، مرتجعات…" />
        {r.moves.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-ink-3">مفيش حركات</div>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {r.moves.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block">{m.description || ledgerLabel[m.kind]}</span>
                  <span className="block text-xs text-ink-3">
                    {ledgerLabel[m.kind]} · {time(m.createdAt)}
                    {m.employeeId !== shift.employeeId && ` · ${name(m.employeeId)}`}
                  </span>
                </span>
                <span className="num shrink-0 text-end text-xs">{effects(m)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="التقفيل" subtitle={shift.closedAt ? `الساعة ${time(shift.closedAt)}` : undefined} />
        {shift.closedAt ? (
          <Counts rows={closing} />
        ) : (
          <div className="px-4 py-4 text-sm text-ink-2">
            الوردية لسه مفتوحة — المفروض في الدرج دلوقتي <Money value={r.cashNow} className="font-semibold" />
          </div>
        )}
      </Card>
    </div>
  );
}

/** What a movement did to the drawer, the wallet, the bank and the machines: "الدرج −150 · المحفظة +1,000". */
function effects(m: CashMovement) {
  const parts = [
    ["الدرج", m.cash],
    ["المحفظة", m.wallet],
    ["البنك", m.bank ?? 0],
    [m.balanceId ? shortLabel[m.balanceId] : "الماكينة", m.topup],
  ] as const;
  const shown = parts.filter(([, v]) => v !== 0);
  if (!shown.length) return <span className="text-ink-3">—</span>;
  return shown.map(([label, v]) => (
    <span key={label} className={cn("block", v > 0 ? "text-good" : "text-bad")}>
      {label} {v > 0 ? "+" : "−"}
      {Math.abs(Math.round(v)).toLocaleString("en")}
    </span>
  ));
}

function Counts({ rows }: { rows: CountRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-surface-2 text-xs text-ink-3">
        <tr>
          <th className="px-4 py-2 text-start font-medium">البند</th>
          <th className="px-2 py-2 text-start font-medium">اتعدّ</th>
          <th className="px-2 py-2 text-start font-medium">المتوقع</th>
          <th className="px-4 py-2 text-start font-medium">الفرق</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row) => {
          const known = row.expected !== undefined && row.expected !== null && row.counted !== undefined;
          const diff = known ? row.counted! - row.expected! : 0;
          return (
            <tr key={row.label}>
              <td className="px-4 py-2.5">{row.label}</td>
              <td className="px-2 py-2.5">{row.counted !== undefined ? <Money value={row.counted} /> : "—"}</td>
              <td className="px-2 py-2.5">{known ? <Money value={row.expected!} /> : "—"}</td>
              <td className="px-4 py-2.5">
                {!known ? (
                  <span className="text-ink-3">—</span>
                ) : diff === 0 ? (
                  <Badge tone="good">مظبوط</Badge>
                ) : (
                  <Badge tone={diff < 0 ? "bad" : "warn"}>
                    {diff < 0 ? "عجز" : "زيادة"} <Money value={Math.abs(diff)} />
                  </Badge>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      {sub && <div className="text-[11px] text-ink-3">{sub}</div>}
    </Card>
  );
}
