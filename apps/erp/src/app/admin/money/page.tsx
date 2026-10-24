"use client";

import { ChevronLeft } from "lucide-react";
import { Badge, Card, CardHeader, Money, cn } from "@/components/ui";
import { date, machineIds, machineLabel, sinceDays } from "@/lib/format";
import { savingsBalance } from "@/lib/capital";
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

/** One person or party in the "who owes whom" summary; `href` jumps to its details below. */
interface Party {
  key: string;
  name: string;
  kind: string;
  amount: number;
  href: string;
  late?: string;
}

export default function MoneyPage() {
  const store = useStore();
  const employees = store.staff;
  const { plans, loans, contacts, supplierPayables } = store;
  const name = (id?: string) => contacts.find((c) => c.id === id)?.name ?? "—";

  // ---- who owes the shop
  const owedToUs: Party[] = [];
  const byCustomer = new Map<string, { amount: number; lateDays: number }>();
  for (const p of plans) {
    const rem = planRemaining(p);
    if (rem <= 0) continue;
    const x = byCustomer.get(p.customerId) ?? { amount: 0, lateDays: 0 };
    x.amount += rem;
    x.lateDays = Math.max(x.lateDays, planOverdue(p).days);
    byCustomer.set(p.customerId, x);
  }
  for (const [id, x] of byCustomer)
    owedToUs.push({ key: `plan-${id}`, name: name(id), kind: "عميل تقسيط", amount: x.amount, href: "#sec-installments", late: x.lateDays ? `متأخر ${x.lateDays} يوم` : undefined });
  const byBorrower = new Map<string, { amount: number; lateDays: number }>();
  for (const l of store.lentOut) {
    const rem = lentRemaining(l);
    if (rem <= 0) continue;
    const x = byBorrower.get(l.borrowerId) ?? { amount: 0, lateDays: 0 };
    x.amount += rem;
    x.lateDays = Math.max(x.lateDays, lentOverdueDays(l));
    byBorrower.set(l.borrowerId, x);
  }
  for (const [id, x] of byBorrower)
    owedToUs.push({ key: `lent-${id}`, name: name(id), kind: "سلفة", amount: x.amount, href: "#sec-lent", late: x.lateDays ? `متأخر ${sinceDays(x.lateDays).replace("من ", "")}` : undefined });
  const advances = employees.map((e) => ({ e, amount: outstandingAdvances(store, e.id) })).filter((x) => x.amount > 0);
  for (const { e, amount } of advances) owedToUs.push({ key: `adv-${e.id}`, name: e.name, kind: "سلفة موظف — بتتخصم من المرتب", amount, href: "#sec-advances" });
  const savings = savingsBalance(store);
  if (savings > 0) owedToUs.push({ key: "savings", name: "الجمعية", kind: "اللي دفعته ولسه ما قبضتهاش", amount: savings, href: "#sec-savings" });
  for (const id of machineIds) {
    const b = repBalance(store, id);
    if (b > 0) owedToUs.push({ key: `rep-in-${id}`, name: `مندوب ${machineLabel[id]}`, kind: "اتدفعله ولسه ما شحنش", amount: b, href: "#sec-agents" });
  }

  // ---- who the shop owes
  const weOwe: Party[] = [];
  for (const [id, v] of Object.entries(supplierPayables)) if (v > 0) weOwe.push({ key: `sup-${id}`, name: name(id), kind: "مورد", amount: v, href: "#sec-suppliers" });
  const byLender = new Map<string, number>();
  for (const l of loans) if (l.amount - l.repaid > 0) byLender.set(l.lenderId, (byLender.get(l.lenderId) ?? 0) + l.amount - l.repaid);
  for (const [id, v] of byLender) weOwe.push({ key: `loan-${id}`, name: name(id), kind: "سلفة خارجية", amount: v, href: "#sec-loans" });
  for (const id of machineIds) {
    const b = repBalance(store, id);
    if (b < 0) {
      const since = repUnpaidSince(store, id);
      const d = since ? daysSince(since) : 0;
      weOwe.push({ key: `rep-${id}`, name: `مندوب ${machineLabel[id]}`, kind: "شحن لسه ما اتدفعش", amount: -b, href: "#sec-agents", late: d ? sinceDays(d) : undefined });
    }
  }

  owedToUs.sort((a, b) => b.amount - a.amount);
  weOwe.sort((a, b) => b.amount - a.amount);
  const agents = machineIds.map((id) => ({ id, balance: repBalance(store, id) }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <PartyList title="ليا عند" tone="good" parties={owedToUs} empty="مفيش حد عليه فلوس للمحل" />
        <PartyList title="عليا لـ" tone="bad" parties={weOwe} empty="المحل مش عليه فلوس لحد" />
      </div>

      <Card id="sec-installments" className="scroll-mt-20">
        <CardHeader title="الأقساط" subtitle="مرتبة بالأكثر تأخيراً" />
        <ul className="divide-y divide-border">
          {plans
            .map((p) => ({ p, o: planOverdue(p), rem: planRemaining(p) }))
            .filter((x) => x.rem > 0)
            .sort((a, b) => b.o.days - a.o.days)
            .map(({ p, o, rem }) => {
              const paidCount = p.schedule.filter((d) => d.paid >= d.amount).length;
              return (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{name(p.customerId)}</div>
                      <div className="text-xs text-ink-3">
                        دفع {paidCount} من {p.months} · ضامن: {name(p.guarantorId)}
                      </div>
                    </div>
                    <div className="text-end">
                      <Money value={rem} className="font-semibold" />
                      <div className="mt-0.5">{o.count ? <Badge tone="bad">متأخر {o.days} يوم · <Money value={o.amount} /></Badge> : <Badge tone="good">منتظم</Badge>}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-0.5">
                    {p.schedule.map((d) => (
                      <span
                        key={d.n}
                        className="h-1.5 flex-1 rounded-full"
                        style={{
                          background:
                            d.paid >= d.amount ? "var(--good)" : new Date(d.dueDate) < new Date() ? "var(--bad)" : "var(--border)",
                        }}
                        title={`قسط ${d.n} — ${date(d.dueDate)}`}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
        </ul>
      </Card>

      {store.lentOut.some((l) => lentRemaining(l) > 0) && (
        <Card id="sec-lent" className="scroll-mt-20">
          <CardHeader title="سُلف عند ناس" subtitle="فلوس المحل اتسلّفت وهترجع" />
          <ul className="divide-y divide-border">
            {store.lentOut
              .filter((l) => lentRemaining(l) > 0)
              .sort((a, b) => lentOverdueDays(b) - lentOverdueDays(a))
              .map((l) => {
                const late = lentOverdueDays(l);
                return (
                  <li key={l.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="font-medium">{name(l.borrowerId)}</div>
                      <div className="text-xs text-ink-3">
                        {date(l.givenAt)} · ادّاها {employees.find((e) => e.id === l.givenBy)?.name ?? "—"}
                        {l.notes && ` · ${l.notes}`}
                      </div>
                    </div>
                    <div className="text-end">
                      <Money value={lentRemaining(l)} className="font-semibold" />
                      <div className="mt-0.5">
                        {late ? <Badge tone="bad">متأخر {sinceDays(late).replace("من ", "")}</Badge> : <Badge>ترجع {date(`${l.dueDate}T12:00:00Z`)}</Badge>}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>
        </Card>
      )}

      {advances.length > 0 && (
        <Card id="sec-advances" className="scroll-mt-20">
          <CardHeader title="سُلف الموظفين" subtitle="بتتخصم تلقائي من المرتب لما يتصرف من «الموظفين»" />
          <ul className="divide-y divide-border">
            {advances.map(({ e, amount }) => (
              <li key={e.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-ink-3">مرتبه <Money value={e.salary} /></div>
                </div>
                <Money value={amount} className="font-semibold" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {savings > 0 && (
        <Card id="sec-savings" className="scroll-mt-20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">الجمعية</div>
              <div className="text-xs text-ink-3">اللي دفعته لحد دلوقتي ولسه ما قبضتهاش</div>
            </div>
            <Money value={savings} className="font-semibold" />
          </div>
        </Card>
      )}

      <Card id="sec-loans" className="scroll-mt-20">
        <CardHeader title="السُّلف الخارجية" subtitle="التزامات على المحل — مش داخلة في الربح" />
        <ul className="divide-y divide-border">
          {loans.map((l) => (
            <li key={l.id} className="px-4 py-3">
              <div className="flex justify-between">
                <div>
                  <div className="font-medium">{name(l.lenderId)}</div>
                  <div className="text-xs text-ink-3">
                    {date(l.receivedAt)}
                    {l.notes && ` · ${l.notes}`}
                  </div>
                </div>
                <div className="text-end">
                  <Money value={l.amount - l.repaid} className="font-semibold" />
                  <div className="text-xs text-ink-3">من <Money value={l.amount} /></div>
                </div>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-surface-2">
                <div className="h-1.5 rounded-full bg-good" style={{ width: `${(l.repaid / l.amount) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card id="sec-agents" className="scroll-mt-20">
        <CardHeader title="حسابات المناديب" subtitle="المندوب بيشحن الماكينة وبيتحاسب بعدين" />
        <ul className="divide-y divide-border">
          {agents.map(({ id, balance }) => (
            <li key={id} className="flex items-center justify-between px-4 py-3">
              <span className="font-medium">مندوب {machineLabel[id]}</span>
              {balance < 0 ? (
                <span className="text-end">
                  <Money value={-balance} className="font-semibold text-bad" />
                  <span className="block text-xs text-ink-3">عليك له</span>
                </span>
              ) : balance > 0 ? (
                <span className="text-end">
                  <Money value={balance} className="font-semibold text-good" />
                  <span className="block text-xs text-ink-3">ليك عنده</span>
                </span>
              ) : (
                <Badge tone="good">الحساب مقفول</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card id="sec-suppliers" className="scroll-mt-20">
        <CardHeader title="حسابات الموردين" />
        <ul className="divide-y divide-border">
          {Object.entries(supplierPayables).map(([id, v]) => (
            <li key={id} className="flex justify-between px-4 py-3">
              <span>{name(id)}</span>
              <Money value={v} className="font-semibold" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function PartyList({ title, tone, parties, empty }: { title: string; tone: "good" | "bad"; parties: Party[]; empty: string }) {
  const total = parties.reduce((a, p) => a + p.amount, 0);
  return (
    <Card className="flex flex-col">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="text-xs text-ink-3">{parties.length} اسم</span>
      </div>
      {parties.length === 0 ? (
        <div className="flex-1 px-4 py-8 text-center text-sm text-ink-3">{empty}</div>
      ) : (
        <ul className="flex-1 divide-y divide-border">
          {parties.map((p) => (
            <li key={p.key}>
              <a href={p.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block text-xs text-ink-3">
                    {p.kind}
                    {p.late && <span className="text-bad"> · {p.late}</span>}
                  </span>
                </span>
                <Money value={p.amount} className={cn("shrink-0 font-semibold", tone === "good" ? "text-good" : "text-bad")} />
                <ChevronLeft size={14} className="shrink-0 text-ink-3" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className={cn("flex items-baseline justify-between border-t border-border px-4 py-3", tone === "good" ? "bg-good-soft" : "bg-bad-soft")}>
        <span className="font-semibold">الإجمالي</span>
        <Money value={total} className={cn("text-xl font-bold", tone === "good" ? "text-good" : "text-bad")} />
      </div>
    </Card>
  );
}
