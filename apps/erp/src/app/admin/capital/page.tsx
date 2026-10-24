"use client";

import { useState } from "react";
import { Card, CardHeader, Money, cn } from "@/components/ui";
import { capital } from "@/lib/capital";
import { useStore } from "@/lib/store";

// Categorical slots in fixed order — the four asset groups keep these colors everywhere.
const groupColor = {
  cash: "var(--series-1)",
  stock: "var(--series-2)",
  receivables: "var(--series-3)",
  fixed: "var(--series-4)",
} as const;

export default function CapitalPage() {
  const store = useStore();
  const c = capital(store);
  const [hover, setHover] = useState<string | null>(null);
  const unrealized = c.stockAtRetail - (c.assets.find((g) => g.key === "stock")?.total ?? 0);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="text-sm text-ink-3">صافي رأس مال المحل</div>
        <Money value={c.net} className="mt-1 block text-4xl font-bold" />
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-ink-3">كل اللي المحل يملكه</div>
            <Money value={c.totalAssets} className="font-semibold" />
          </div>
          <div>
            <div className="text-xs text-ink-3">ناقص اللي عليه</div>
            <Money value={c.totalLiabilities} className="font-semibold text-bad" />
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
          لو كل البضاعة اتباعت بسعر البيع، رأس المال يبقى <Money value={c.net + unrealized} className="font-semibold text-ink" />
        </p>
      </Card>

      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold">رأس المال متوزع فين</div>
        <div className="flex h-4 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="توزيع الأصول">
          {c.assets.map((g) => (
            <div
              key={g.key}
              onMouseEnter={() => setHover(g.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(hover === g.key ? null : g.key)}
              className="h-full transition-opacity"
              style={{
                width: `${c.totalAssets ? (Math.max(0, g.total) / c.totalAssets) * 100 : 0}%`,
                background: groupColor[g.key],
                opacity: hover && hover !== g.key ? 0.35 : 1,
              }}
              title={`${g.label}: ${Math.round(g.total).toLocaleString("en")}`}
            />
          ))}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {c.assets.map((g) => (
            <li
              key={g.key}
              onMouseEnter={() => setHover(g.key)}
              onMouseLeave={() => setHover(null)}
              className={cn("transition-opacity", hover && hover !== g.key && "opacity-40")}
            >
              <div className="flex items-center gap-1.5 text-xs text-ink-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: groupColor[g.key] }} />
                {g.label}
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <Money value={g.total} className="font-semibold" />
                <span className="num text-xs text-ink-3">{c.totalAssets ? Math.round((g.total / c.totalAssets) * 100) : 0}%</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {c.assets.map((g) => (
        <Card key={g.key}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: groupColor[g.key] }} />
                {g.label}
              </span>
            }
            action={<Money value={g.total} className="font-bold" />}
          />
          <ul className="divide-y divide-border">
            {g.lines.map((l) => (
              <li key={l.label} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm">{l.label}</div>
                  {l.sub && <div className="text-xs text-ink-3">{l.sub}</div>}
                </div>
                <Money value={l.value} className="shrink-0 font-semibold" />
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <Card className="border-bad/30">
        <CardHeader title="اللي على المحل" action={<Money value={c.totalLiabilities} className="font-bold text-bad" />} />
        <ul className="divide-y divide-border">
          {c.liabilities.map((l) => (
            <li key={l.label} className="flex justify-between px-4 py-3 text-sm">
              <span>{l.label}</span>
              <Money value={l.value} className="font-semibold text-bad" />
            </li>
          ))}
        </ul>
      </Card>

      <p className="px-1 pb-2 text-xs text-ink-3">
        البضاعة محسوبة بسعر التكلفة، والأقساط بالمبلغ الأصلي من غير الزيادة — علشان الرقم يبقى حقيقي مش متضخم.
      </p>
    </div>
  );
}
