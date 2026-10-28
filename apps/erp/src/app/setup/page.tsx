"use client";

import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  HandCoins,
  Landmark,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AgentsStep, InstallmentsStep, LendersStep, MoneyStep, ProductsStep, SuppliersStep } from "@/components/setup/steps";
import { Badge, Button, Card, CardHeader, Input, Modal, Money, cn, useHydrated } from "@/components/ui";
import { balanceIds, machineIds } from "@/lib/format";
import { buildInitData, n, productCount, useSetupDraft, validate, type SetupDraft, type StepId } from "@/lib/setup";
import { useStore } from "@/lib/store";

const steps: { id: StepId; title: string; help: string; icon: typeof Wallet }[] = [
  { id: "money", title: "الفلوس", help: "الكاش والمحافظ والماكينات والبنك", icon: Wallet },
  { id: "products", title: "البضاعة", help: "كل صنف بالتكلفة وسعر البيع والكمية", icon: Boxes },
  { id: "suppliers", title: "الموردين", help: "وعليك لكل واحد كام", icon: Truck },
  { id: "lenders", title: "السُّلف الخارجية", help: "فلوس المحل مستلفها من حد", icon: Landmark },
  { id: "agents", title: "المناديب", help: "حساب مندوب فوري وممكن", icon: HandCoins },
  { id: "installments", title: "عملاء التقسيط", help: "اللي عليهم أقساط دلوقتي", icon: CalendarClock },
  { id: "review", title: "المراجعة والتأكيد", help: "رأس المال قبل ما تبدأ", icon: ClipboardCheck },
];

export default function SetupPage() {
  const hydrated = useHydrated();
  const router = useRouter();
  const [step, setStep] = useState<StepId>("money");
  const draft = useSetupDraft((s) => s.draft);
  // Setting up the shop replaces all its data — owner only.
  const isOwner = useStore((s) => s.staff.find((e) => e.id === s.currentEmployeeId)?.role === "admin");
  useEffect(() => {
    if (hydrated && !isOwner) router.replace("/");
  }, [hydrated, isOwner, router]);

  if (!hydrated || !isOwner) return null;

  const issues = validate(draft);
  const idx = steps.findIndex((s) => s.id === step);
  const current = steps[idx];

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-border bg-surface md:flex">
        <div className="px-5 py-4">
          <div className="font-bold">تهيئة المحل</div>
          <div className="text-xs text-ink-3">بتتحفظ تلقائي — تقدر تكمّل في أي وقت</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {steps.map((s, i) => {
            const stepIssues = issues.filter((x) => x.step === s.id && x.blocking).length;
            return (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm transition",
                  step === s.id ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2",
                )}
              >
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", step === s.id ? "bg-brand text-brand-ink" : "bg-surface-2")}>
                  {i + 1}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{s.title}</span>
                  <span className="block text-xs text-ink-3">{summaryFor(s.id, draft)}</span>
                </span>
                {stepIssues > 0 && <Badge tone="bad">{stepIssues}</Badge>}
              </button>
            );
          })}
        </nav>
        <Link href="/" className="px-5 py-4 text-xs text-ink-3 hover:text-ink">
          ← رجوع للبداية
        </Link>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6">
        {/* Phone: steps as a scrollable strip instead of the sidebar */}
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden">
          {steps.map((s, i) => {
            const stepIssues = issues.filter((x) => x.step === s.id && x.blocking).length;
            return (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                  step === s.id ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-ink-2",
                )}
              >
                <span className="num">{i + 1}</span> {s.title}
                {stepIssues > 0 && <span className="h-1.5 w-1.5 rounded-full bg-bad" />}
              </button>
            );
          })}
        </div>
        <div className="mx-auto max-w-6xl">
          <div className="mb-5">
            <h1 className="text-2xl font-bold">{current.title}</h1>
            <p className="mt-1 text-sm text-ink-3">{current.help}</p>
          </div>

          {step === "money" && <MoneyStep />}
          {step === "products" && <ProductsStep />}
          {step === "suppliers" && <SuppliersStep />}
          {step === "lenders" && <LendersStep />}
          {step === "agents" && <AgentsStep />}
          {step === "installments" && <InstallmentsStep />}
          {step === "review" && <Review onGoTo={setStep} />}

          {step !== "review" && (
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" disabled={idx === 0} onClick={() => setStep(steps[idx - 1].id)}>
                → السابق
              </Button>
              <Button onClick={() => setStep(steps[idx + 1].id)}>التالي ←</Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function summaryFor(id: StepId, d: SetupDraft) {
  switch (id) {
    case "money":
      return d.money.cash === "" ? "لسه" : "درج " + n(d.money.cash).toLocaleString("en");
    case "products":
      return `${d.products.length} صنف · ${d.products.reduce((a, p) => a + productCount(p), 0)} قطعة`;
    case "suppliers":
      return `${d.suppliers.length} مورد`;
    case "lenders":
      return `${d.lenders.length} سلفة`;
    case "agents":
      return machineIds.every((m) => d.agents[m].direction === "none") ? "مقفولين" : "فيه حساب مفتوح";
    case "installments":
      return `${d.installments.length} عميل`;
    case "review":
      return "";
  }
}

function totals(d: SetupDraft) {
  const cash = n(d.money.cash) + n(d.money.wallet) + n(d.money.bank) + balanceIds.reduce((a, id) => a + n(d.money[id]), 0);
  const stock = d.products.reduce((a, p) => a + productCount(p) * n(p.cost), 0);
  const stockRetail = d.products.reduce((a, p) => a + productCount(p) * n(p.retail), 0);
  const weOweAgents = machineIds.reduce((a, m) => a + (d.agents[m].direction === "we_owe" ? n(d.agents[m].amount) : 0), 0);
  const receivables = d.installments.reduce((a, x) => a + n(x.remaining), 0) + n(d.money.savings);
  const fixed = n(d.money.fixedAssets);
  const suppliers = d.suppliers.reduce((a, s) => a + n(s.balance), 0);
  const loans = d.lenders.reduce((a, l) => a + n(l.remaining), 0);
  const assets = cash + stock + receivables + fixed;
  const liabilities = suppliers + loans + weOweAgents;
  return { cash, stock, stockRetail, receivables, fixed, suppliers, loans, weOweAgents, assets, liabilities, net: assets - liabilities };
}

function Review({ onGoTo }: { onGoTo: (s: StepId) => void }) {
  const router = useRouter();
  const draft = useSetupDraft((s) => s.draft);
  const clear = useSetupDraft((s) => s.clear);
  const initializeShop = useStore((s) => s.initializeShop);
  const isDemo = useStore((s) => s.isDemo);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");

  const issues = validate(draft);
  const blocking = issues.filter((i) => i.blocking);
  const t = totals(draft);
  const owner = useStore((s) => s.staff.find((e) => e.role === "admin" && e.active))!;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card className="p-5">
          <div className="text-sm text-ink-3">صافي رأس مال المحل</div>
          <Money value={t.net} className="mt-1 block text-4xl font-bold" />
          <div className="mt-2 text-xs text-ink-3">
            البضاعة لو اتباعت كلها بسعر البيع: <Money value={t.stockRetail} />
          </div>
        </Card>
        <Card>
          <CardHeader title="اللي المحل يملكه" action={<Money value={t.assets} className="font-bold" />} />
          <dl className="divide-y divide-border text-sm">
            <Row label="كاش ومحافظ وماكينات وبنك" value={t.cash} />
            <Row label="البضاعة بسعر التكلفة" value={t.stock} />
            <Row label="أقساط وجمعية" value={t.receivables} />
            <Row label="أصول ثابتة" value={t.fixed} />
          </dl>
        </Card>
        <Card>
          <CardHeader title="اللي على المحل" action={<Money value={t.liabilities} className="font-bold text-bad" />} />
          <dl className="divide-y divide-border text-sm">
            <Row label="الموردين" value={t.suppliers} />
            <Row label="السُّلف الخارجية" value={t.loans} />
            <Row label="المناديب" value={t.weOweAgents} />
          </dl>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="المراجعة" subtitle={blocking.length ? "لازم تتصلح قبل التأكيد" : "مفيش أخطاء"} />
          {issues.length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-sm text-good">
              <CheckCircle2 size={16} /> كله تمام
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto text-sm">
              {issues.map((i, k) => (
                <li key={k}>
                  <button onClick={() => onGoTo(i.step)} className="flex w-full items-start gap-2 px-4 py-2.5 text-start hover:bg-surface-2">
                    <AlertTriangle size={14} className={cn("mt-0.5 shrink-0", i.blocking ? "text-bad" : "text-warn")} />
                    <span>{i.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Button size="lg" className="w-full" disabled={blocking.length > 0} onClick={() => setConfirm(true)}>
          تأكيد وبدء التشغيل
        </Button>
        <p className="text-xs text-ink-3">
          {isDemo ? "البيانات التجريبية هتتمسح والسيستم هيبدأ بأرقامك." : "تحذير: السيستم شغال ببيانات حقيقية — التأكيد هيمسح كل العمليات اللي اتسجلت ويبدأ من الأرقام دي."}
        </p>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="بدء التشغيل" width="max-w-md">
        <div className="space-y-4 text-sm">
          <p>
            السيستم هيبدأ برأس مال <Money value={t.net} className="font-bold" />، و{draft.products.length} صنف في المخزن. كل البيانات القديمة هتتمسح.
          </p>
          <p>
            اكتب <b>ابدأ</b> للتأكيد:
          </p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          <Button
            size="lg"
            className="w-full"
            disabled={typed.trim() !== "ابدأ"}
            onClick={() => {
              initializeShop(buildInitData(draft, owner.id));
              clear();
              router.push("/");
            }}
          >
            بدء التشغيل
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between px-4 py-2.5">
      <dt className="text-ink-2">{label}</dt>
      <dd>
        <Money value={value} />
      </dd>
    </div>
  );
}
