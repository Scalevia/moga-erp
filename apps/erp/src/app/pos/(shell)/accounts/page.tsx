"use client";

import { Phone } from "lucide-react";
import { Badge, Card, CardHeader, Money, PageHeader, cn } from "@/components/ui";
import { date, machineIds, machineLabel, sinceDays } from "@/lib/format";
import {
  daysSince,
  lentOverdueDays,
  lentRemaining,
  outstandingAdvances,
  planOverdue,
  planRemaining,
  repBalance,
  repUnpaidSince,
  useStore,
} from "@/lib/store";

/**
 * Accounts for the shop floor: who owes the shop and whom the shop owes, so employees can collect
 * and pay. Read-only. Left out on purpose: other employees' advances, the savings circle (الجمعية)
 * and grand totals — those stay on the owner's dashboard.
 */

interface Row {
  key: string;
  name: string;
  phone?: string;
  detail: string;
  amount: number;
  late?: string;
}

export default function AccountsPage() {
  const store = useStore();
  const { plans, contacts, loans, supplierPayables } = store;
  const contact = (id?: string) => contacts.find((c) => c.id === id);
  const me = store.staff.find((e) => e.id === store.currentEmployeeId);
  const myAdvance = me ? outstandingAdvances(store, me.id) : 0;

  // ---- money owed to the shop
  const installments: Row[] = plans
    .map((p) => ({ p, rem: planRemaining(p), late: planOverdue(p) }))
    .filter((x) => x.rem > 0)
    .sort((a, b) => b.late.days - a.late.days)
    .map(({ p, rem, late }) => {
      const c = contact(p.customerId);
      const next = p.schedule.find((d) => d.paid < d.amount);
      return {
        key: p.id,
        name: c?.name ?? "—",
        phone: c?.phone,
        detail: late.count ? `متأخر عليه ${late.amount.toLocaleString("en")}` : next ? `القسط الجاي ${date(next.dueDate)}` : "",
        amount: rem,
        late: late.days ? `متأخر ${late.days} يوم` : undefined,
      };
    });

  const lent: Row[] = store.lentOut
    .filter((l) => lentRemaining(l) > 0)
    .sort((a, b) => lentOverdueDays(b) - lentOverdueDays(a))
    .map((l) => {
      const c = contact(l.borrowerId);
      const late = lentOverdueDays(l);
      return {
        key: l.id,
        name: c?.name ?? "—",
        phone: c?.phone,
        detail: `اتسلّف ${date(l.givenAt)} · يرجّعها ${date(`${l.dueDate}T12:00:00Z`)}`,
        amount: lentRemaining(l),
        late: late ? `متأخر ${sinceDays(late).replace("من ", "")}` : undefined,
      };
    });

  // ---- money the shop owes
  const suppliers: Row[] = Object.entries(supplierPayables)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => ({ key: id, name: contact(id)?.name ?? "—", phone: contact(id)?.phone, detail: "مورد", amount: v }));

  const agents: Row[] = machineIds
    .filter((id) => repBalance(store, id) < 0)
    .map((id) => {
      const since = repUnpaidSince(store, id);
      const d = since ? daysSince(since) : 0;
      return { key: id, name: `مندوب ${machineLabel[id]}`, detail: `شحن لسه ما اتدفعش · ${sinceDays(d)}`, amount: -repBalance(store, id) };
    });

  const borrowed: Row[] = loans
    .filter((l) => l.amount - l.repaid > 0)
    .map((l) => {
      const c = contact(l.lenderId);
      return {
        key: l.id,
        name: c?.name ?? "—",
        phone: c?.phone,
        detail: `اتسلّف ${date(l.receivedAt)}${l.notes ? ` · ${l.notes}` : ""}`,
        amount: l.amount - l.repaid,
      };
    });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="الحسابات" subtitle="مين عليه فلوس للمحل، والمحل عليه فلوس لمين — للعرض بس" />

      {myAdvance > 0 && (
        <Card className="mb-4 flex items-center justify-between border-warn/40 p-4">
          <div>
            <div className="font-semibold">سلفتك</div>
            <div className="text-xs text-ink-3">بتتخصم من مرتبك آخر الشهر</div>
          </div>
          <Money value={myAdvance} className="text-lg font-bold text-warn" />
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-good">فلوس للمحل عند</h2>
          <Section title="عملاء التقسيط" rows={installments} tone="good" empty="مفيش أقساط مفتوحة" />
          <Section title="سُلف عند ناس" rows={lent} tone="good" empty="محدش مستلف من المحل" />
        </div>
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-bad">فلوس على المحل لـ</h2>
          <Section title="المناديب" rows={agents} tone="bad" empty="حساب المناديب مقفول" />
          <Section title="الموردين" rows={suppliers} tone="bad" empty="مفيش حسابات للموردين" />
          <Section title="سُلف المحل من ناس" rows={borrowed} tone="bad" empty="المحل مش مستلف من حد" />
        </div>
      </div>
    </div>
  );
}

function Section({ title, rows, tone, empty }: { title: string; rows: Row[]; tone: "good" | "bad"; empty: string }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={rows.length ? `${rows.length} اسم` : undefined} />
      {rows.length === 0 ? (
        <div className="px-4 py-5 text-center text-sm text-ink-3">{empty}</div>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-xs text-ink-3">{r.detail}</div>
                {r.phone && (
                  <a href={`tel:${r.phone}`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand">
                    <Phone size={11} /> <span className="num">{r.phone}</span>
                  </a>
                )}
              </div>
              <div className="shrink-0 text-end">
                <Money value={r.amount} className={cn("font-semibold", tone === "good" ? "text-good" : "text-bad")} />
                {r.late && (
                  <div className="mt-0.5">
                    <Badge tone="bad">{r.late}</Badge>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
