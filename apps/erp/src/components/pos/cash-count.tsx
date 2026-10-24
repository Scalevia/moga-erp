"use client";

import { Card, CardHeader, Field, Input } from "@/components/ui";
import { balanceIds, balanceLabel } from "@/lib/format";
import type { BalanceId } from "@/lib/types";

/** The cash count: the employee counts the drawer and types the total. */
export function CashCount({ value, onChange, title = "النقدية في الدرج" }: { value: string; onChange: (v: string) => void; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} subtitle="عدّ الفلوس اللي في الدرج واكتب الإجمالي" />
      <div className="p-4">
        <Field label="إجمالي الدرج">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="num h-14 text-center text-2xl font-bold"
            placeholder="0"
            aria-label="إجمالي الدرج"
          />
        </Field>
      </div>
    </Card>
  );
}

export interface BalanceInputs {
  wallet: string;
  machines: Record<BalanceId, string>;
}

export const emptyBalances = (): BalanceInputs => ({ wallet: "", machines: { fawry_airtime: "", fawry_general: "", momkn: "" } });

export function balancesFilled(b: BalanceInputs) {
  return b.wallet !== "" && balanceIds.every((id) => b.machines[id] !== "");
}

export function toCount(b: BalanceInputs) {
  return {
    wallet: Number(b.wallet) || 0,
    machines: Object.fromEntries(balanceIds.map((id) => [id, Number(b.machines[id]) || 0])) as Record<BalanceId, number>,
  };
}

export function BalanceFields({ value, onChange }: { value: BalanceInputs; onChange: (b: BalanceInputs) => void }) {
  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="font-semibold">المحافظ والماكينات</h3>
        <p className="text-xs text-ink-3">افتح كل ماكينة وتطبيق واكتب الرصيد اللي ظاهر</p>
      </div>
      <Field label="رصيد فودافون كاش">
        <Input type="number" value={value.wallet} onChange={(e) => onChange({ ...value, wallet: e.target.value })} className="num" />
      </Field>
      {balanceIds.map((id) => (
        <Field key={id} label={`رصيد ${balanceLabel[id]}`}>
          <Input
            type="number"
            value={value.machines[id]}
            onChange={(e) => onChange({ ...value, machines: { ...value.machines, [id]: e.target.value } })}
            className="num"
          />
        </Field>
      ))}
    </Card>
  );
}
