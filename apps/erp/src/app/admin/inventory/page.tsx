"use client";

import { useState } from "react";
import { Badge, Card, CardHeader, Money, Segmented } from "@/components/ui";
import { inventoryValue } from "@/lib/analytics";
import { categoryLabel } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ProductCategory } from "@/lib/types";

export default function InventoryPage() {
  const products = useStore((s) => s.products);
  const units = useStore((s) => s.units);
  const [filter, setFilter] = useState<"all" | ProductCategory>("all");
  const [now] = useState(() => Date.now());
  const inv = inventoryValue(products, units);
  const rows = inv.rows.filter((r) => filter === "all" || r.product.category === filter).sort((a, b) => b.cost - a.cost);

  const aged = units
    .filter((u) => u.status === "in_stock")
    .map((u) => ({ u, days: Math.floor((now - new Date(u.purchasedAt).getTime()) / 86400000) }))
    .filter((x) => x.days > 30);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xs text-ink-3">بسعر التكلفة</div>
            <Money value={inv.cost} className="mt-1 block text-lg font-bold" />
          </div>
          <div>
            <div className="text-xs text-ink-3">بسعر البيع</div>
            <Money value={inv.retail} className="mt-1 block text-lg font-bold" />
          </div>
          <div>
            <div className="text-xs text-ink-3">ربح غير محقق</div>
            <Money value={inv.gain} className="mt-1 block text-lg font-bold text-good" />
          </div>
        </div>
      </Card>

      {aged.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          {aged.length} أجهزة في المخزن من أكتر من 30 يوم — فكّر في عرض عليهم
        </div>
      )}

      <Segmented
        value={filter}
        onChange={setFilter}
        className="w-full overflow-x-auto"
        options={[{ value: "all", label: "الكل" }, ...(Object.keys(categoryLabel) as ProductCategory[]).map((k) => ({ value: k, label: categoryLabel[k] }))]}
      />

      <Card>
        <CardHeader title="الأصناف" subtitle="الكمية · التكلفة · القيمة البيعية" />
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.product.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.product.name}</div>
                <div className="text-xs text-ink-3">{categoryLabel[r.product.category]}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-end">
                {r.count <= (r.product.tracking === "imei" ? 1 : 10) ? <Badge tone="warn">{r.count}</Badge> : <Badge>{r.count}</Badge>}
                <div className="text-xs">
                  <Money value={r.cost} className="block font-semibold" />
                  <Money value={r.retail} className="block text-ink-3" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
