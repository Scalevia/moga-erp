"use client";

import { ArrowDownToLine, ArrowUpFromLine, BatteryCharging, CheckCircle2, Coins, RefreshCw } from "lucide-react";
import { useState } from "react";
import { AgentCard } from "@/components/pos/agents";
import { Button, Card, Field, Input, Money, PageHeader, Segmented, cn } from "@/components/ui";
import { balanceCompany, balanceIds, balanceLabel, ledgerLabel, machineIds } from "@/lib/format";
import { machineBalance, useStore, walletBalance } from "@/lib/store";
import type { BalanceId, LedgerKind } from "@/lib/types";

type Op = Extract<LedgerKind, "vf_deposit" | "vf_withdrawal" | "topup_sale" | "wallet_liquidation">;

// "المبلغ" means something different per operation, so each says exactly what to write.
const ops: { kind: Op; icon: typeof Coins; help: string; amountLabel: string; feeLabel: string; feeHint: string }[] = [
  { kind: "vf_deposit", icon: ArrowDownToLine, help: "الزبون بيدفع كاش وإنت بتحوّل له من محفظة المحل", amountLabel: "المبلغ اللي هيتحوّل للزبون", feeLabel: "عمولة المحل", feeHint: "الزبون بيدفعها زيادة على المبلغ" },
  { kind: "vf_withdrawal", icon: ArrowUpFromLine, help: "الزبون بيحوّل لمحفظة المحل وإنت بتديله كاش", amountLabel: "المبلغ اللي الزبون حوّله للمحفظة", feeLabel: "عمولة المحل", feeHint: "بتتخصم من الكاش اللي بياخده" },
  { kind: "topup_sale", icon: BatteryCharging, help: "الزبون بيدفع كاش والرصيد بيتخصم من الماكينة — شحن الموبايلات من Air time، والفواتير والخدمات من رصيد فوري العام", amountLabel: "اللي الزبون دفعه كله (شامل العمولة)", feeLabel: "عمولة المحل", feeHint: "جوه المبلغ اللي الزبون دفعه" },
  { kind: "wallet_liquidation", icon: RefreshCw, help: "سحب فلوس من المحفظة للدرج (تسييل) — الرسوم مصروف", amountLabel: "المبلغ اللي اتسحب من المحفظة", feeLabel: "رسوم السحب", feeHint: "مصروف — بتتخصم من الكاش اللي دخل الدرج" },
];

export default function ServicesPage() {
  const store = useStore();
  const [kind, setKind] = useState<Op>("vf_deposit");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [phone, setPhone] = useState("");
  const [account, setAccount] = useState<BalanceId>("fawry_airtime");
  const [done, setDone] = useState<string | null>(null);

  const a = Number(amount) || 0;
  const f = Number(fee) || 0;
  const effect = {
    vf_deposit: { cash: a + f, wallet: -a, topup: 0, commission: f },
    vf_withdrawal: { cash: -a + f, wallet: a, topup: 0, commission: f },
    topup_sale: { cash: a, topup: -(a - f), wallet: 0, commission: f },
    wallet_liquidation: { cash: a - f, wallet: -a, topup: 0, commission: -f },
  }[kind];

  const op = ops.find((o) => o.kind === kind)!;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="فودافون كاش وفوري وممكن" />
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-ink-3">محفظة فودافون كاش</div>
          <Money value={walletBalance(store)} className="text-xl font-bold" />
        </Card>
        {balanceIds.map((id) => (
          <Card key={id} className="p-4">
            <div className="text-xs text-ink-3">{balanceLabel[id]}</div>
            <Money value={machineBalance(store, id)} className="text-xl font-bold" />
          </Card>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {ops.map(({ kind: k, icon: Icon }) => (
          <button
            key={k}
            onClick={() => { setKind(k); setDone(null); }}
            className={cn("flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition", kind === k ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface hover:bg-surface-2")}
          >
            <Icon size={22} /> {ledgerLabel[k]}
          </button>
        ))}
      </div>

      <Card className="p-5">
        <p className="mb-4 text-sm text-ink-3">{op.help}</p>
        {kind === "topup_sale" && (
          <Segmented
            value={account}
            onChange={setAccount}
            className="mb-4"
            options={balanceIds.map((id) => ({ value: id, label: balanceLabel[id] }))}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={op.amountLabel}>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-lg font-semibold" />
          </Field>
          <Field label={op.feeLabel} hint={op.feeHint}>
            <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} className="num" />
          </Field>
          {kind !== "wallet_liquidation" && (
            <Field label="رقم الزبون">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="num" />
            </Field>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-3 text-center text-sm">
          <Effect label="الدرج" v={effect.cash} />
          <Effect label="المحفظة" v={effect.wallet} />
          <Effect label={balanceLabel[account]} v={effect.topup} />
        </div>

        <Button
          size="lg"
          className="mt-4 w-full"
          // No negatives; the fee can't be more than the amount, except a deposit's fee which comes on top.
          disabled={!(a > 0) || f < 0 || (kind !== "vf_deposit" && f > a)}
          onClick={() => {
            store.recordMovement({ kind, ...effect, ...(kind === "topup_sale" ? { machineId: balanceCompany[account], balanceId: account } : {}), description: phone ? `${ledgerLabel[kind]} — ${phone}` : ledgerLabel[kind] });
            setDone(`${ledgerLabel[kind]} ${a.toLocaleString("en")} ج.م`);
            setAmount(""); setFee(""); setPhone("");
          }}
        >
          تسجيل العملية
        </Button>
        {done && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
            <CheckCircle2 size={16} /> اتسجل: {done}
          </div>
        )}
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold">حسابات المناديب</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {machineIds.map((id) => (
          <AgentCard key={id} id={id} />
        ))}
      </div>
    </div>
  );
}

function Effect({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className={cn("num font-semibold", v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-ink-3")}>
        {v > 0 ? "+" : v < 0 ? "−" : ""}{Math.abs(v).toLocaleString("en")}
      </div>
    </div>
  );
}
