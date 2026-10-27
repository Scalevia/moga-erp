"use client";

import {
  Building2,
  CheckCircle2,
  HandHelping,
  HandCoins,
  Landmark,
  Lock,
  PiggyBank,
  Receipt,
  Truck,
  Undo2,
  UserMinus,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Button, Card, Field, Input, Money, PageHeader, Segmented, Select, cn } from "@/components/ui";
import { personAccounts, type PersonAccount } from "@/lib/debts";
import { dateTime, ledgerLabel, sinceDays } from "@/lib/format";
import { currentShift, lentOverdueDays, lentRemaining, useStore, loanRemaining } from "@/lib/store";
import type { LedgerKind } from "@/lib/types";

type Kind = Extract<
  LedgerKind,
  | "expense"
  | "employee_advance"
  | "supplier_payment"
  | "loan_received"
  | "loan_repayment"
  | "owner_contribution"
  | "owner_drawing"
  | "savings_payment"
  | "savings_collection"
  | "asset_purchase"
  | "lent_out"
  | "lent_repaid"
>;

const info: Record<Kind, { direction: 1 | -1; help: string }> = {
  expense: { direction: -1, help: "إيجار، كهربا، بوفيه، مواصلات…" },
  employee_advance: { direction: -1, help: "بتتخصم من المرتب آخر الشهر" },
  supplier_payment: { direction: -1, help: "سداد جزء من حساب مورد" },
  lent_out: { direction: -1, help: "فلوس المحل اتسلّفت لحد وهترجع — مش مصروف ومش هتعمل عجز في الدرج" },
  lent_repaid: { direction: 1, help: "حد رجّع سلفة كان واخدها من المحل — ينفع جزء منها" },
  loan_received: { direction: 1, help: "المحل اتسلّف فلوس من حد — دي التزام على المحل مش ربح" },
  loan_repayment: { direction: -1, help: "المحل بيرجّع سلفة كان واخدها — ينفع جزء منها" },
  owner_contribution: { direction: 1, help: "ضخ رأس مال من جيبك الشخصي" },
  owner_drawing: { direction: -1, help: "سحب أرباح لنفسك" },
  savings_payment: { direction: -1, help: "قسط الجمعية الشهري" },
  savings_collection: { direction: 1, help: "قبض الجمعية" },
  asset_purchase: { direction: -1, help: "ديكور، لابتوب، ماكينة…" },
};

// The four loan movements share one "سُلف" tile; the form then asks which one happened.
const loanKinds = ["lent_out", "lent_repaid", "loan_received", "loan_repayment"] as const;
const loanChoice: Record<(typeof loanKinds)[number], { label: string; icon: typeof Wallet }> = {
  lent_out: { label: "سلّفنا حد", icon: HandHelping },
  lent_repaid: { label: "حد رجّعلنا سلفة", icon: Undo2 },
  loan_received: { label: "اتسلّفنا من حد", icon: HandCoins },
  loan_repayment: { label: "رجّعنا سلفة لحد", icon: Landmark },
};
const isLoan = (k: Kind): k is (typeof loanKinds)[number] => (loanKinds as readonly Kind[]).includes(k);

const tiles: { id: Kind | "loans"; icon: typeof Wallet; adminOnly?: boolean }[] = [
  { id: "expense", icon: Receipt },
  { id: "employee_advance", icon: UserMinus },
  { id: "supplier_payment", icon: Truck },
  { id: "loans", icon: HandHelping },
  { id: "owner_contribution", icon: Wallet, adminOnly: true },
  { id: "owner_drawing", icon: Wallet, adminOnly: true },
  { id: "savings_payment", icon: PiggyBank, adminOnly: true },
  { id: "savings_collection", icon: PiggyBank, adminOnly: true },
  { id: "asset_purchase", icon: Building2, adminOnly: true },
];

const expenseCats = ["إيجار", "كهرباء", "إنترنت", "بوفيه", "مواصلات", "صيانة", "نظافة", "أخرى"];

export default function FinancePage() {
  const store = useStore();
  const employees = store.staff;
  const me = employees.find((e) => e.id === store.currentEmployeeId)!;
  const isAdmin = me.role === "admin";
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [target, setTarget] = useState("");
  const [lender, setLender] = useState({ name: "", phone: "" });
  const [borrower, setBorrower] = useState({ name: "", phone: "" });
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(d);
  });
  const [via, setVia] = useState<"cash" | "wallet">("cash");
  const [done, setDone] = useState<string | null>(null);

  const tile = info[kind];
  const shift = currentShift(store);
  const recent = store.movements.filter((m) => m.shiftId === shift?.id).slice(-6).reverse();
  const suppliers = store.contacts.filter((c) => c.kind === "supplier");
  const openLoans = store.loans.filter((l) => loanRemaining(l) > 0);
  const openLent = store.lentOut.filter((l) => lentRemaining(l) > 0);
  const lentTarget = openLent.find((l) => l.id === target);
  const loanTarget = openLoans.find((l) => l.id === target);
  const overLimit = kind === "lent_out" && !isAdmin && Number(amount) > store.settings.employeeLendLimit;
  const repayMax =
    kind === "lent_repaid" && lentTarget
      ? lentRemaining(lentTarget)
      : kind === "loan_repayment" && loanTarget
        ? loanRemaining(loanTarget)
        : kind === "supplier_payment" && target
          ? Math.max(0, store.supplierPayables[target] ?? 0)
          : Infinity;
  const overRepay = Number(amount) > repayMax;

  function submit() {
    const a = Number(amount);
    if (kind === "loan_received") store.addLoan(lender.name, lender.phone, a, note);
    else if (kind === "loan_repayment") store.repayLoan(target, a);
    else if (kind === "lent_out") {
      store.lendMoney({ name: borrower.name.trim(), phone: borrower.phone.trim(), amount: a, dueDate, from: via, notes: note || undefined });
      setBorrower({ name: "", phone: "" });
    } else if (kind === "lent_repaid") store.collectLent(target, a, via);
    else if (kind === "supplier_payment") store.paySupplier({ supplierId: target, amount: a, via: "cash", note: note || undefined });
    else {
      let description = note || ledgerLabel[kind];
      if (kind === "employee_advance") description = `سلفة ${employees.find((e) => e.id === target)?.name ?? ""}`;
      if (kind === "expense") description = `${target || "مصروف"}${note ? ` — ${note}` : ""}`;
      store.recordMovement({ kind, cash: tile.direction * a, wallet: 0, topup: 0, commission: 0, description, targetEmployeeId: kind === "employee_advance" ? target : undefined, category: kind === "expense" ? target : undefined });
    }
    setDone(`${ledgerLabel[kind]}: ${a.toLocaleString("en")} ج.م`);
    setAmount("");
    setNote("");
  }

  const needsTarget = ["employee_advance", "supplier_payment", "loan_repayment", "expense", "lent_repaid"].includes(kind);
  const valid =
    Number(amount) > 0 &&
    (!needsTarget || target) &&
    (kind !== "loan_received" || (lender.name && lender.phone)) &&
    (kind !== "lent_out" || (borrower.name.trim() && dueDate)) &&
    !overLimit &&
    !overRepay;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="مصروفات وحركات مالية" subtitle="كل حركة بتأثر على الدرج وبتتسجل في الشيفت باسمك" />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {tiles.map(({ id, icon: Icon, adminOnly }) => {
              const locked = adminOnly && !isAdmin;
              const active = id === "loans" ? isLoan(kind) : kind === id;
              return (
                <button
                  key={id}
                  disabled={locked}
                  onClick={() => {
                    setKind(id === "loans" ? (isLoan(kind) ? kind : "lent_out") : id);
                    setTarget("");
                    setDone(null);
                  }}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center text-xs font-medium transition disabled:opacity-40",
                    active ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface hover:bg-surface-2",
                  )}
                >
                  {locked && <Lock size={12} className="absolute end-2 top-2" />}
                  <Icon size={20} /> {id === "loans" ? "سُلف" : ledgerLabel[id]}
                </button>
              );
            })}
          </div>
          {!isAdmin && <p className="mb-4 flex items-center gap-1.5 text-xs text-ink-3"><Lock size={12} /> الحركات المقفولة للمالك بس</p>}

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{isLoan(kind) ? "سُلف" : ledgerLabel[kind]}</h2>
              <span className={cn("text-xs font-medium", tile.direction > 0 ? "text-good" : "text-bad")}>
                {(kind === "lent_out" || kind === "lent_repaid") && via === "wallet"
                  ? tile.direction > 0 ? "داخل المحفظة" : "خارج من المحفظة"
                  : tile.direction > 0 ? "داخل للدرج" : "خارج من الدرج"}
              </span>
            </div>
            {isLoan(kind) && (
              <div className="mb-4 grid grid-cols-2 gap-2">
                {loanKinds.map((k) => {
                  const { label, icon: Icon } = loanChoice[k];
                  return (
                    <button
                      key={k}
                      onClick={() => {
                        setKind(k);
                        setTarget("");
                        setAmount("");
                        setDone(null);
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-start text-sm font-medium transition",
                        kind === k ? "border-brand bg-brand-soft text-brand" : "border-border hover:bg-surface-2",
                      )}
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="min-w-0 flex-1">{label}</span>
                      <span className={cn("shrink-0 text-[11px]", info[k].direction > 0 ? "text-good" : "text-bad")}>
                        {info[k].direction > 0 ? "داخلة" : "خارجة"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mb-4 text-sm text-ink-3">{tile.help}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {kind === "expense" && (
                <Field label="البند">
                  <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">اختار…</option>
                    {expenseCats.map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </Field>
              )}
              {kind === "employee_advance" && (
                <Field label="الموظف">
                  <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">اختار…</option>
                    {employees.filter((e) => e.role === "employee" && e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </Select>
                </Field>
              )}
              {kind === "supplier_payment" && (
                <Field label="المورد">
                  <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">اختار…</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} — ليه {(store.supplierPayables[s.id] ?? 0).toLocaleString("en")}</option>)}
                  </Select>
                </Field>
              )}
              {kind === "loan_repayment" && (
                <Field label="السلفة">
                  <Select
                    value={target}
                    onChange={(e) => {
                      setTarget(e.target.value);
                      const l = openLoans.find((x) => x.id === e.target.value);
                      if (l) setAmount(String(loanRemaining(l)));
                    }}
                  >
                    <option value="">اختار…</option>
                    {openLoans.map((l) => (
                      <option key={l.id} value={l.id}>
                        {store.contacts.find((c) => c.id === l.lenderId)?.name} — متبقي {loanRemaining(l).toLocaleString("en")}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {kind === "lent_out" && (
                <>
                  <PersonField label="اسمه" value={borrower} onChange={setBorrower} placeholder="مثال: محمود البقال" />
                  <Field label="تليفونه">
                    <Input type="tel" inputMode="tel" autoComplete="off" value={borrower.phone} onChange={(e) => setBorrower({ ...borrower, phone: e.target.value })} className="num" />
                  </Field>
                  <Field label="هيرجّعها إمتى؟">
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </Field>
                </>
              )}
              {kind === "lent_repaid" && (
                <Field label="مين رجّع؟" className="sm:col-span-2">
                  <Select
                    value={target}
                    onChange={(e) => {
                      setTarget(e.target.value);
                      const l = openLent.find((x) => x.id === e.target.value);
                      if (l) setAmount(String(lentRemaining(l)));
                    }}
                  >
                    <option value="">اختار…</option>
                    {openLent.map((l) => {
                      const late = lentOverdueDays(l);
                      return (
                        <option key={l.id} value={l.id}>
                          {store.contacts.find((c) => c.id === l.borrowerId)?.name} — عليه {lentRemaining(l).toLocaleString("en")}
                          {late ? ` — متأخر ${sinceDays(late).replace("من ", "")}` : ""}
                        </option>
                      );
                    })}
                  </Select>
                </Field>
              )}
              {kind === "loan_received" && (
                <>
                  <PersonField label="اسم المُقرض" value={lender} onChange={setLender} />
                  <Field label="تليفونه">
                    <Input type="tel" inputMode="tel" autoComplete="off" value={lender.phone} onChange={(e) => setLender({ ...lender, phone: e.target.value })} className="num" />
                  </Field>
                </>
              )}
              <Field
                label="المبلغ"
                hint={
                  overLimit ? (
                    <span className="text-bad">أكتر من {store.settings.employeeLendLimit.toLocaleString("en")} محتاج المالك يسجّلها</span>
                  ) : overRepay ? (
                    <span className="text-bad">
                      {kind === "lent_repaid" ? "أكتر من اللي عليه" : kind === "supplier_payment" ? "أكتر من اللي ليه" : "أكتر من اللي على المحل له"} ({repayMax.toLocaleString("en")})
                    </span>
                  ) : kind === "lent_out" && !isAdmin ? (
                    `الحد الأقصى ليك ${store.settings.employeeLendLimit.toLocaleString("en")} ج.م`
                  ) : undefined
                }
              >
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-lg font-semibold" />
              </Field>
              {(kind === "lent_out" || kind === "lent_repaid") && (
                <div className="sm:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-ink-2">{kind === "lent_out" ? "طلعت من" : "دخلت"}</span>
                  <Segmented value={via} onChange={setVia} options={[{ value: "cash", label: "الدرج (كاش)" }, { value: "wallet", label: "فودافون كاش" }]} />
                </div>
              )}
              <Field label="ملاحظة" className={kind === "loan_received" ? "" : "sm:col-span-2"}>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
            <Button size="lg" className="mt-4 w-full" disabled={!valid} onClick={submit}>
              تسجيل
            </Button>
            {done && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
                <CheckCircle2 size={16} /> {done}
              </div>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <div className="border-b border-border px-4 py-3 font-semibold">حركات الشيفت الحالي</div>
          <ul className="divide-y divide-border">
            {recent.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-3">لسه مفيش حركات</li>}
            {recent.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <div>{m.description}</div>
                  <div className="text-xs text-ink-3">{dateTime(m.createdAt)}</div>
                </div>
                <span className={cn("num font-semibold", m.cash >= 0 ? "text-good" : "text-bad")}>
                  {m.cash >= 0 ? "+" : "−"}<Money value={Math.abs(m.cash)} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

const balanceText = (p: PersonAccount) =>
  [p.owesShop > 0 && `عليه ${p.owesShop.toLocaleString("en")}`, p.shopOwes > 0 && `ليه ${p.shopOwes.toLocaleString("en")}`].filter(Boolean).join(" · ") || "خالص";

/** Name field that suggests people who already borrowed from or lent to the shop; picking one fills the phone too. */
function PersonField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: { name: string; phone: string };
  onChange: (v: { name: string; phone: string }) => void;
  placeholder?: string;
}) {
  const store = useStore();
  const people = personAccounts(store);
  const picked = people.find((p) => p.phone === value.phone && p.name === value.name);
  const term = value.name.trim();
  const matches = term && !picked ? people.filter((p) => p.name.includes(term)).slice(0, 5) : [];

  return (
    <div>
      <Field label={label} hint={picked ? <span className="text-brand">حساب موجود · {balanceText(picked)}</span> : undefined}>
        <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder={placeholder} autoComplete="off" />
      </Field>
      {matches.length > 0 && (
        <ul className="mt-1 divide-y divide-border rounded-lg border border-border text-sm">
          {matches.map((p) => (
            <li key={p.phone}>
              <button
                type="button"
                onClick={() => onChange({ name: p.name, phone: p.phone })}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start hover:bg-surface-2"
              >
                <span className="min-w-0 truncate">{p.name}</span>
                <span className="shrink-0 text-xs text-ink-3">{balanceText(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
