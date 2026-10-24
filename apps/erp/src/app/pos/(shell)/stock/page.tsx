"use client";

import { ChevronDown, PackageX, Search, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, Input, Money, PageHeader, Segmented, cn } from "@/components/ui";
import { categoryLabel, date } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { PhoneUnit, Product, ProductCategory } from "@/lib/types";

/**
 * Stock for the shop floor: what's available and at what price, plus each phone's details.
 * Read-only, and deliberately without costs, stock value or profit — those stay on the owner's dashboard.
 */

const LOW_QTY = 10; // quantity items at or below this are "running low"
const screenLabel = { excellent: "شاشة ممتازة", scratches: "شاشة فيها خدوش", cracked: "شاشة مكسورة" } as const;
const bodyLabel = { excellent: "بودي ممتاز", good: "بودي كويس", worn: "بودي مستهلك" } as const;

type Filter = "all" | ProductCategory;

export default function StockPage() {
  const products = useStore((s) => s.products);
  const units = useStore((s) => s.units);
  const contacts = useStore((s) => s.contacts);
  const purchases = useStore((s) => s.purchases);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [onlyLow, setOnlyLow] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const inStock = useMemo(() => units.filter((u) => u.status === "in_stock"), [units]);

  const rows = useMemo(() => {
    return products.map((p) => {
      const myUnits = p.tracking === "imei" ? inStock.filter((u) => u.productId === p.id) : [];
      const count = p.tracking === "imei" ? myUnits.length : p.quantity;
      const low = count > 0 && (p.tracking === "imei" ? count <= 1 : count <= LOW_QTY);
      return { p, units: myUnits, count, low, out: count <= 0 };
    });
  }, [products, inStock]);

  const term = q.trim().toLowerCase();
  const matches = (r: (typeof rows)[number]) =>
    !term ||
    r.p.name.toLowerCase().includes(term) ||
    r.p.brand.toLowerCase().includes(term) ||
    !!r.p.barcode?.includes(term) ||
    r.units.some((u) => u.imei.includes(term));

  const shown = rows
    .filter((r) => (filter === "all" || r.p.category === filter) && (!onlyLow || r.low || r.out) && matches(r))
    .sort((a, b) => Number(a.out) - Number(b.out) || a.p.name.localeCompare(b.p.name));

  const totalPieces = rows.reduce((a, r) => a + Math.max(0, r.count), 0);
  const lowCount = rows.filter((r) => r.low || r.out).length;
  // Searching an IMEI opens that phone's model straight away.
  const imeiHit = term.length >= 5 ? shown.find((r) => r.units.some((u) => u.imei.includes(term))) : undefined;
  const expanded = open ?? imeiHit?.p.id ?? null;

  const supplierOf = (u: PhoneUnit) => {
    const c = contacts.find((x) => x.id === u.supplierId);
    if (u.condition === "used") return "اتشرى مستعمل"; // the seller is a private customer: not shown
    return c?.kind === "supplier" ? c.name : "—";
  };
  const lastDelivery = (p: Product) => {
    const inv = [...purchases].reverse().find((x) => x.lines.some((l) => l.productId === p.id));
    if (!inv) return null;
    return { supplier: contacts.find((c) => c.id === inv.supplierId)?.name ?? "—", at: inv.createdAt };
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="المخزون" subtitle={`${totalPieces.toLocaleString("en")} قطعة متاحة — للعرض بس`} />

      <div className="relative mb-3">
        <Search size={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-12 ps-11 text-base" placeholder="ابحث بالاسم أو الماركة أو الباركود أو IMEI" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          className="max-w-full overflow-x-auto"
          options={[{ value: "all", label: "الكل" }, ...(Object.keys(categoryLabel) as ProductCategory[]).map((c) => ({ value: c, label: categoryLabel[c] }))]}
        />
        <button
          onClick={() => setOnlyLow(!onlyLow)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition",
            onlyLow ? "border-warn bg-warn-soft text-warn" : "border-border text-ink-2 hover:bg-surface-2",
          )}
        >
          قربت تخلص أو خلصت ({lowCount})
        </button>
      </div>

      <Card>
        {shown.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-sm text-ink-3">
            <PackageX size={32} className="mb-2 opacity-50" />
            مفيش أصناف بالبحث ده
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((r) => {
              const isOpen = expanded === r.p.id;
              const delivery = r.p.tracking === "quantity" ? lastDelivery(r.p) : null;
              return (
                <li key={r.p.id} className={cn(r.out && "bg-surface-2")}>
                  <button onClick={() => setOpen(isOpen ? null : r.p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className={cn("font-medium", r.out && "text-ink-3")}>{r.p.name}</div>
                      <div className="text-xs text-ink-3">
                        {categoryLabel[r.p.category]} · {r.p.brand}
                        {r.p.barcode && (
                          <>
                            {" · "}
                            <span className="num">{r.p.barcode}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <Money value={r.p.retailPrice} className="font-semibold" />
                      <div className="mt-0.5">
                        {r.out ? (
                          <Badge tone="bad">خلص</Badge>
                        ) : r.low ? (
                          <Badge tone="warn">باقي {r.count}</Badge>
                        ) : (
                          <Badge tone="good">متاح {r.count}</Badge>
                        )}
                      </div>
                    </div>
                    <ChevronDown size={16} className={cn("shrink-0 text-ink-3 transition", isOpen && "rotate-180")} />
                  </button>

                  {isOpen && (
                    <div className="border-t border-border bg-surface-2 px-4 py-3">
                      {r.p.tracking === "imei" ? (
                        r.units.length === 0 ? (
                          <p className="text-sm text-ink-3">مفيش أجهزة من الموديل ده في المخزن دلوقتي.</p>
                        ) : (
                          <ul className="space-y-2">
                            {r.units.map((u) => (
                              <li key={u.imei} className={cn("rounded-lg border border-border bg-surface px-3 py-2.5 text-sm", term && u.imei.includes(term) && "border-brand")}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1.5">
                                    <Smartphone size={14} className="text-ink-3" />
                                    <span className="num">{u.imei}</span>
                                  </span>
                                  {u.condition === "used" ? <Badge>مستعمل</Badge> : <Badge tone="brand">جديد</Badge>}
                                </div>
                                {u.inspection && (
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    <Badge tone={u.inspection.batteryHealth >= 85 ? "good" : "warn"}>بطارية {u.inspection.batteryHealth}%</Badge>
                                    <Badge>{screenLabel[u.inspection.screen]}</Badge>
                                    <Badge>{bodyLabel[u.inspection.body]}</Badge>
                                    {u.inspection.hasBox && <Badge>بالعلبة</Badge>}
                                    {u.inspection.hasCharger && <Badge>بالشاحن</Badge>}
                                  </div>
                                )}
                                {u.inspection?.notes && <p className="mt-1 text-xs text-ink-2">{u.inspection.notes}</p>}
                                <div className="mt-1 text-xs text-ink-3">
                                  {supplierOf(u)} · دخل المخزن {date(u.purchasedAt)}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )
                      ) : (
                        <div className="space-y-1 text-sm text-ink-2">
                          <div>
                            الكمية المتاحة: <b className="num text-ink">{r.count}</b>
                          </div>
                          <div>{delivery ? `آخر توريد: ${delivery.supplier} — ${date(delivery.at)}` : "مفيش توريد متسجل للصنف ده لسه"}</div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
