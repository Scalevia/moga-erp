"use client";

import { CalendarClock, ChevronLeft, HandHelping, Landmark, Receipt, Search, Smartphone, Truck } from "lucide-react";
import { useState } from "react";
import { AgentAccountModal, CreditAccountModal, InstallmentAccountModal, SupplierAccountModal } from "@/components/pos/account-modals";
import { PersonAccountModal } from "@/components/pos/person-account";
import { CallButton } from "@/components/pos/statement";
import { Badge, Card, Input, Money, PageHeader, Segmented, cn } from "@/components/ui";
import { personAccounts } from "@/lib/debts";
import { dayMonth, machineIds, machineLabel, sinceDays } from "@/lib/format";
import { creditBalance, creditCustomerIds, daysSince, lentOverdueDays, outstandingAdvances, planOverdue, planRemaining, repBalance, repUnpaidSince, useStore } from "@/lib/store";
import type { MachineId } from "@/lib/types";

/**
 * Accounts for the shop floor, as two lists: who owes the shop, and whom the shop owes. Every row
 * opens that account's dated statement with its actions. Left out on purpose: other employees'
 * advances, the savings circle (الجمعية) and grand totals — those stay on the owner's dashboard.
 */

type Kind = "installment" | "credit" | "lent" | "agent" | "supplier" | "loan";
type Open =
  | { kind: "person"; phone: string }
  | { kind: "supplier"; id: string }
  | { kind: "agent"; id: MachineId }
  | { kind: "installment"; id: string }
  | { kind: "credit"; id: string };

interface Entry {
  key: string;
  kind: Kind;
  name: string;
  detail: string;
  amount: number;
  phone?: string;
  late?: string;
  settled: boolean;
  open: Open;
}

const kinds: Record<Kind, { label: string; filter: string; icon: typeof Truck }> = {
  installment: { label: "تقسيط", filter: "تقسيط", icon: CalendarClock },
  credit: { label: "باقي فواتير (آجل)", filter: "آجل", icon: Receipt },
  lent: { label: "سلفة من المحل", filter: "سُلف", icon: HandHelping },
  agent: { label: "مندوب", filter: "مناديب", icon: Smartphone },
  supplier: { label: "مورد", filter: "موردين", icon: Truck },
  loan: { label: "المحل مستلف منه", filter: "سُلف", icon: Landmark },
};

export default function AccountsPage() {
  const store = useStore();
  const me = store.staff.find((e) => e.id === store.currentEmployeeId);
  const myAdvance = me ? outstandingAdvances(store, me.id) : 0;
  const [side, setSide] = useState<"owed" | "owes">("owed");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [q, setQ] = useState("");
  const [showSettled, setShowSettled] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  const contact = (id?: string) => store.contacts.find((c) => c.id === id);
  const people = personAccounts(store);

  // ---- owed to the shop
  const owed: Entry[] = [];
  const byCustomer = new Map<string, { amount: number; late: number; next?: string }>();
  for (const p of store.plans) {
    const rem = planRemaining(p);
    if (rem <= 0) continue;
    const x = byCustomer.get(p.customerId) ?? { amount: 0, late: 0 };
    x.amount += rem;
    x.late = Math.max(x.late, planOverdue(p).days);
    const next = p.schedule.find((d) => d.paid < d.amount)?.dueDate;
    if (next && (!x.next || next < x.next)) x.next = next;
    byCustomer.set(p.customerId, x);
  }
  for (const [id, x] of byCustomer) {
    const c = contact(id);
    owed.push({
      key: `inst-${id}`,
      kind: "installment",
      name: c?.name ?? "—",
      detail: x.next ? `الجاي ${dayMonth(x.next)}` : "",
      amount: x.amount,
      phone: c?.phone,
      late: x.late ? `متأخر ${x.late} يوم` : undefined,
      settled: false,
      open: { kind: "installment", id },
    });
  }
  for (const id of creditCustomerIds(store)) {
    const c = contact(id);
    const b = creditBalance(store, id);
    owed.push({ key: `credit-${id}`, kind: "credit", name: c?.name ?? "—", detail: "", amount: Math.max(0, b), phone: c?.phone, settled: b <= 0, open: { kind: "credit", id } });
  }
  for (const p of people.filter((x) => x.borrowerIds.length > 0)) {
    const late = Math.max(0, ...store.lentOut.filter((l) => p.borrowerIds.includes(l.borrowerId)).map((l) => lentOverdueDays(l)));
    owed.push({
      key: `lent-${p.phone}`,
      kind: "lent",
      name: p.name,
      detail: "",
      amount: p.owesShop,
      phone: p.phone,
      late: late && p.owesShop > 0 ? `متأخر ${sinceDays(late).replace("من ", "")}` : undefined,
      settled: p.owesShop === 0,
      open: { kind: "person", phone: p.phone },
    });
  }

  // ---- the shop owes
  const owes: Entry[] = [];
  for (const id of machineIds) {
    const b = -repBalance(store, id);
    const since = repUnpaidSince(store, id);
    owes.push({
      key: `agent-${id}`,
      kind: "agent",
      name: `مندوب ${machineLabel[id]}`,
      detail: b > 0 && since ? `مستني فلوسه ${sinceDays(daysSince(since))}` : "",
      amount: Math.max(0, b),
      phone: store.settings.agentPhones?.[id] || undefined,
      settled: b <= 0,
      open: { kind: "agent", id },
    });
  }
  for (const c of store.contacts.filter((x) => x.kind === "supplier")) {
    const v = store.supplierPayables[c.id] ?? 0;
    owes.push({ key: `sup-${c.id}`, kind: "supplier", name: c.name, detail: "", amount: Math.max(0, v), phone: c.phone, settled: v <= 0, open: { kind: "supplier", id: c.id } });
  }
  for (const p of people.filter((x) => x.lenderIds.length > 0)) {
    owes.push({
      key: `loan-${p.phone}`,
      kind: "loan",
      name: p.name,
      detail: "",
      amount: p.shopOwes,
      phone: p.phone,
      settled: p.shopOwes === 0,
      open: { kind: "person", phone: p.phone },
    });
  }

  const list = side === "owed" ? owed : owes;
  // Lent and loan both show as "سُلف", so filter by label rather than kind.
  const filters = [...new Set(list.map((e) => kinds[e.kind].filter))];
  const term = q.trim();
  const visible = list
    .filter((e) => (kind === "all" || kinds[e.kind].filter === kinds[kind].filter) && (!term || e.name.includes(term)))
    .sort((a, b) => Number(!!b.late) - Number(!!a.late) || b.amount - a.amount);
  const active = visible.filter((e) => !e.settled);
  const settled = visible.filter((e) => e.settled);
  const tone = side === "owed" ? "good" : "bad";
  const count = (l: Entry[]) => l.filter((e) => !e.settled).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="الحسابات" subtitle="اضغط على أي اسم تشوف حسابه بالتاريخ" />

      {myAdvance > 0 && (
        <Card className="mb-4 flex items-center justify-between border-warn/40 p-4">
          <div>
            <div className="font-semibold">سلفتك</div>
            <div className="text-xs text-ink-3">بتتخصم من مرتبك آخر الشهر</div>
          </div>
          <Money value={myAdvance} className="text-lg font-bold text-warn" />
        </Card>
      )}

      <Segmented
        value={side}
        onChange={(v) => {
          setSide(v);
          setKind("all");
          setShowSettled(false);
        }}
        className="mb-3 grid w-full grid-cols-2 [&>button]:py-2.5"
        options={[
          { value: "owed", label: <span className={cn(side === "owed" && "text-good")}>فلوس للمحل ({count(owed)})</span> },
          { value: "owes", label: <span className={cn(side === "owes" && "text-bad")}>فلوس على المحل ({count(owes)})</span> },
        ]}
      />

      <div className="mb-3 space-y-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم" className="ps-9" />
        </div>
        {filters.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {(["all", ...filters] as const).map((f) => {
              const value = f === "all" ? "all" : (Object.keys(kinds) as Kind[]).find((k) => kinds[k].filter === f && list.some((e) => e.kind === k))!;
              const on = f === "all" ? kind === "all" : kind !== "all" && kinds[kind].filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setKind(value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    on ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-2 hover:bg-surface-2",
                  )}
                >
                  {f === "all" ? "الكل" : f}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Card>
        {active.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-ink-3">
            {term ? "مفيش اسم بالشكل ده" : side === "owed" ? "محدش عليه فلوس للمحل" : "المحل مش عليه فلوس لحد"}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((e) => (
              <Row key={e.key} entry={e} tone={tone} onOpen={() => setOpen(e.open)} />
            ))}
          </ul>
        )}
      </Card>

      {settled.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowSettled(!showSettled)} className="text-sm font-medium text-brand">
            {showSettled ? "إخفاء الحسابات الخالصة" : `الحسابات الخالصة (${settled.length})`}
          </button>
          {showSettled && (
            <Card className="mt-2">
              <ul className="divide-y divide-border">
                {settled.map((e) => (
                  <Row key={e.key} entry={e} tone={tone} onOpen={() => setOpen(e.open)} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {open?.kind === "person" && <PersonAccountModal phone={open.phone} onClose={() => setOpen(null)} />}
      {open?.kind === "supplier" && <SupplierAccountModal supplierId={open.id} onClose={() => setOpen(null)} />}
      {open?.kind === "agent" && <AgentAccountModal id={open.id} onClose={() => setOpen(null)} />}
      {open?.kind === "installment" && <InstallmentAccountModal customerId={open.id} onClose={() => setOpen(null)} />}
      {open?.kind === "credit" && <CreditAccountModal customerId={open.id} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Row({ entry: e, tone, onOpen }: { entry: Entry; tone: "good" | "bad"; onOpen: () => void }) {
  const Icon = kinds[e.kind].icon;
  return (
    <li className="flex items-center gap-1 pe-3">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-3 ps-4 pe-1 text-start transition hover:bg-surface-2">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", e.settled ? "bg-surface-2 text-ink-3" : tone === "good" ? "bg-good-soft text-good" : "bg-bad-soft text-bad")}>
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-snug">{e.name}</span>
          <span className="block text-xs text-ink-3">
            {kinds[e.kind].label}
            {e.detail && ` · ${e.detail}`}
          </span>
        </span>
        <span className="shrink-0 text-end">
          {e.settled ? <Badge tone="good">خالص</Badge> : <Money value={e.amount} className={cn("font-semibold", tone === "good" ? "text-good" : "text-bad")} />}
          {e.late && (
            <span className="mt-0.5 block">
              <Badge tone="bad">{e.late}</Badge>
            </span>
          )}
        </span>
        <ChevronLeft size={16} className="shrink-0 text-ink-3" />
      </button>
      {e.phone ? <CallButton phone={e.phone} name={e.name} /> : <span className="w-9 shrink-0" />}
    </li>
  );
}
