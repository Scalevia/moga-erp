"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { ReportsTabs } from "@/components/reports-tabs";
import { Badge, Card, Money } from "@/components/ui";
import { time, weekdayDate } from "@/lib/format";
import { shiftReport, shiftStatus } from "@/lib/shifts";
import { useStore } from "@/lib/store";

/** Every shift, newest first; each opens with everything that happened in it. */
export default function ShiftsPage() {
  const store = useStore();
  const shifts = [...store.shifts].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  const name = (id?: string) => store.staff.find((e) => e.id === id)?.name ?? "—";

  return (
    <div>
      <ReportsTabs active="shifts" />
      <Card>
        {shifts.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-ink-3">لسه مفيش ورديات</div>
        ) : (
          <ul className="divide-y divide-border">
            {shifts.map((s) => {
              const r = shiftReport(store, s);
              const status = shiftStatus(s);
              return (
                <li key={s.id}>
                  <Link href={`/admin/reports/shifts/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {weekdayDate(s.openedAt)} · {name(s.employeeId)}
                      </span>
                      <span className="block text-xs text-ink-3">
                        {time(s.openedAt)} ← {s.closedAt ? time(s.closedAt) : "لسه مفتوحة"} · {r.orders.length} فاتورة
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <Money value={r.sales} className="block font-semibold" />
                      <Badge tone={status.tone}>{status.text}</Badge>
                    </span>
                    <ChevronLeft size={16} className="shrink-0 text-ink-3" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
