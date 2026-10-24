"use client";

import { CheckCircle2, HandCoins, PackageCheck } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Field, Input, Money, Segmented, cn } from "@/components/ui";
import { balanceLabel, balancesOf, machineLabel, sinceDays } from "@/lib/format";
import { bonusTotal, daysSince, machineBalance, repBalance, repHistory, repUnpaidSince, useStore } from "@/lib/store";
import type { BalanceId, MachineId } from "@/lib/types";

/**
 * The agent loads the machine on credit and collects later — usually at the end of the day, but it can
 * wait several days (holidays, banks closed). So the account is either settled or the shop owes the agent.
 */
export function repStatus(balance: number) {
  if (balance < 0) return { tone: "warn" as const, text: "عليك للمندوب" };
  return { tone: "good" as const, text: "الحساب مقفول" };
}

export function AgentCard({ id, compact = false }: { id: MachineId; compact?: boolean }) {
  const store = useStore();
  const balance = repBalance(store, id);
  const accounts = balancesOf(id);
  const owed = Math.max(0, -balance);
  const since = repUnpaidSince(store, id);
  const days = since ? daysSince(since) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const loadedToday = repHistory(store, id)
    .filter((m) => m.kind === "rep_load" && m.createdAt.slice(0, 10) === today)
    .reduce((s, m) => s - (m.rep ?? 0), 0);
  const [mode, setMode] = useState<"none" | "load" | "pay">("none");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "wallet" | "instapay">("cash");
  const [target, setTarget] = useState<BalanceId>(accounts[0]);
  const [done, setDone] = useState<string | null>(null);

  const status = repStatus(balance);
  const a = Number(amount) || 0;
  const bonusPct = store.bonusPercent[target] ?? 0;
  const bonus = Math.round((a * bonusPct) / 100);
  const monthBonus = bonusTotal(store, id, new Date().toISOString().slice(0, 7));
  const overpay = mode === "pay" && a > owed;
  const vfFee = method === "wallet" ? Math.round((a * store.settings.agentVfFeePercent) / 100) : 0;
  const methodLabel = { cash: "كاش من الدرج", wallet: "فودافون كاش", instapay: "إنستاباي" }[method];

  function submit() {
    if (!a || overpay) return;
    if (mode === "load") {
      // The agent account moves by what we pay; the bonus is extra balance on the machine and counts as profit.
      store.recordMovement({
        kind: "rep_load",
        cash: 0,
        wallet: 0,
        topup: a + bonus,
        commission: bonus,
        machineId: id,
        balanceId: target,
        rep: -a,
        description: `مندوب ${machineLabel[id]} شحن ${balanceLabel[target]} ${a.toLocaleString("en")}${bonus ? ` + بونص ${bonus.toLocaleString("en")}` : ""}`,
      });
      setDone(`اتسجل: ${balanceLabel[target]} زاد ${(a + bonus).toLocaleString("en")}${bonus ? ` (منها بونص ${bonus.toLocaleString("en")})` : ""}`);
    } else {
      store.recordMovement({
        kind: "rep_payment",
        cash: method === "cash" ? -a : 0,
        // By Vodafone Cash the agent charges a liquidation fee on top: it leaves the wallet and is an expense.
        wallet: method === "wallet" ? -(a + vfFee) : 0,
        bank: method === "instapay" ? -a : 0,
        topup: 0,
        commission: -vfFee,
        machineId: id,
        rep: a,
        description: `دفع لمندوب ${machineLabel[id]} — ${methodLabel}${vfFee ? ` + رسوم تسييل ${vfFee.toLocaleString("en")}` : ""}`,
      });
      setDone(`اتسجل: دفعت للمندوب ${a.toLocaleString("en")} (${methodLabel})${vfFee ? ` + رسوم ${vfFee.toLocaleString("en")}` : ""}`);
    }
    setMode("none");
    setAmount("");
  }

  return (
    <Card className={cn("p-4", owed > 0 && "border-warn/40")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">مندوب {machineLabel[id]}</div>
          {accounts.map((b) => (
            <div key={b} className="text-xs text-ink-3">
              {accounts.length > 1 ? balanceLabel[b].replace(`${machineLabel[id]} — `, "") : "رصيد الماكينة"} في السيستم <Money value={machineBalance(store, b)} />
            </div>
          ))}
          {monthBonus > 0 && (
            <div className="text-xs text-good">
              بونص الشهر ده <Money value={monthBonus} />
            </div>
          )}
        </div>
        <Badge tone={status.tone} className="shrink-0 whitespace-nowrap">{status.text}</Badge>
      </div>

      {owed > 0 && (
        <div className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          عليك للمندوب <Money value={owed} className="font-bold" /> — {sinceDays(days)}
          {loadedToday > 0 && (
            <span className="block text-xs">
              منهم شحن النهارده <Money value={loadedToday} />
            </span>
          )}
        </div>
      )}

      {mode === "none" ? (
        <div className={cn("mt-3 grid gap-2 [&>button]:whitespace-nowrap", compact ? "grid-cols-1" : "grid-cols-2")}>
          <Button
            variant={owed > 0 ? "secondary" : "primary"}
            size="sm"
            onClick={() => {
              setMode("load");
              setAmount("");
              setDone(null);
            }}
          >
            <PackageCheck size={16} /> المندوب شحن
          </Button>
          <Button
            variant={owed > 0 ? "primary" : "secondary"}
            size="sm"
            disabled={owed === 0}
            onClick={() => {
              setMode("pay");
              setAmount(String(owed));
              setDone(null);
            }}
          >
            <HandCoins size={16} /> دفعت للمندوب
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
          <Field
            label={mode === "load" ? "قيمة الشحنة (اللي هتدفعها للمندوب)" : "المبلغ اللي اتدفع للمندوب"}
            hint={overpay ? <span className="text-bad">أكتر من اللي عليك له (<Money value={owed} />)</span> : undefined}
          >
            <Input autoFocus type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="num font-semibold" />
          </Field>
          {mode === "load" && (
            <>
              {accounts.length > 1 && (
                <div>
                  <span className="mb-1 block text-sm font-medium text-ink-2">اتشحن على أنهي رصيد؟</span>
                  <Segmented
                    value={target}
                    onChange={setTarget}
                    options={accounts.map((b) => ({ value: b, label: balanceLabel[b].replace(`${machineLabel[id]} — `, "") }))}
                  />
                </div>
              )}
              {bonusPct > 0 && <p className="text-xs text-good">بونص {bonusPct}% بيتضاف تلقائي على الرصيد ده — بيتحسب ربح</p>}
              {a > 0 && bonusPct > 0 && (
                <div className="space-y-1 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-2">البونص</span>
                    <Money value={bonus} className="text-good" />
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>الرصيد هيزيد</span>
                    <Money value={a + bonus} />
                  </div>
                </div>
              )}
            </>
          )}
          {mode === "pay" && (
            <>
              <Segmented
                value={method}
                onChange={setMethod}
                options={[
                  { value: "cash", label: "كاش من الدرج" },
                  { value: "wallet", label: "فودافون كاش" },
                  { value: "instapay", label: "إنستاباي" },
                ]}
              />
              {method === "wallet" && a > 0 && (
                <div className="space-y-1 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-2">رسوم تسييل {store.settings.agentVfFeePercent}% (مصروف)</span>
                    <Money value={vfFee} className="text-bad" />
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>هيطلع من المحفظة</span>
                    <Money value={a + vfFee} />
                  </div>
                </div>
              )}
            </>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={!Number(amount) || overpay} onClick={submit}>
              تسجيل
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("none")}>
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {done && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-good">
          <CheckCircle2 size={14} /> {done}
        </div>
      )}
    </Card>
  );
}
