"use client";

import { CheckCircle2, ChevronLeft, Percent } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Money, Segmented, Select, cn } from "@/components/ui";
import { inventoryValue } from "@/lib/analytics";
import { categoryLabel, date } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ProductCategory } from "@/lib/types";

export default function InventoryPage() {
  const products = useStore((s) => s.products);
  const units = useStore((s) => s.units);
  const revaluations = useStore((s) => s.revaluations);
  const [filter, setFilter] = useState<"all" | ProductCategory>("all");
  const [now] = useState(() => Date.now());
  const [editing, setEditing] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const inv = inventoryValue(products, units);
  // Models with nothing in stock still get a row, so their price can be set before the next delivery.
  const listed = new Set(inv.rows.map((r) => r.product.id));
  const rows = [...inv.rows, ...products.filter((p) => !listed.has(p.id)).map((product) => ({ product, count: 0, cost: 0, retail: 0 }))]
    .filter((r) => filter === "all" || r.product.category === filter)
    .sort((a, b) => b.cost - a.cost);

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

      {done && (
        <div className="flex items-center gap-2 rounded-xl bg-good-soft px-4 py-3 text-sm text-good">
          <CheckCircle2 size={16} className="shrink-0" /> {done}
        </div>
      )}

      <Segmented
        value={filter}
        onChange={setFilter}
        className="w-full overflow-x-auto"
        options={[{ value: "all", label: "الكل" }, ...(Object.keys(categoryLabel) as ProductCategory[]).map((k) => ({ value: k, label: categoryLabel[k] }))]}
      />

      <Card>
        <CardHeader
          title="الأصناف"
          subtitle="اضغط على أي صنف تعدّل سعره"
          action={
            <Button size="sm" variant="secondary" onClick={() => setBulk(true)}>
              <Percent size={14} /> أسعار قسم كامل
            </Button>
          }
        />
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.product.id}>
              <button onClick={() => setEditing(r.product.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-surface-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.product.name}</div>
                  <div className="text-xs text-ink-3">
                    {categoryLabel[r.product.category]} · بيتباع بـ {r.product.retailPrice.toLocaleString("en")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-end">
                  {r.count <= (r.product.tracking === "imei" ? 1 : 10) ? <Badge tone="warn">{r.count}</Badge> : <Badge>{r.count}</Badge>}
                  <div className="text-xs">
                    <Money value={r.cost} className="block font-semibold" />
                    <Money value={r.retail} className="block text-ink-3" />
                  </div>
                  <ChevronLeft size={16} className="text-ink-3" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {revaluations.length > 0 && (
        <Card>
          <CardHeader title="غلاء ونزول الأسعار" subtitle="كل مرة اتعدّلت فيها تكلفة البضاعة اللي في المحل" />
          <ul className="divide-y divide-border text-sm">
            {[...revaluations].reverse().slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium">{products.find((p) => p.id === r.productId)?.name ?? "—"}</div>
                  <div className="text-xs text-ink-3">
                    {date(r.at)} · {r.qty} قطعة · التكلفة {Math.round(r.oldCost / r.qty).toLocaleString("en")} ← {r.newUnitCost.toLocaleString("en")}
                  </div>
                </div>
                <span className={cn("num shrink-0 font-semibold", r.amount > 0 ? "text-good" : "text-bad")}>
                  {r.amount > 0 ? "+" : "−"}
                  {Math.abs(Math.round(r.amount)).toLocaleString("en")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing && <RepriceModal productId={editing} onClose={() => setEditing(null)} onDone={setDone} />}
      {bulk && <BulkPriceModal onClose={() => setBulk(false)} onDone={setDone} />}
    </div>
  );
}

/** New selling price for one model, and — if wholesale prices moved — today's cost for the pieces in stock. */
function RepriceModal({ productId, onClose, onDone }: { productId: string; onClose: () => void; onDone: (msg: string) => void }) {
  const store = useStore();
  const product = store.products.find((p) => p.id === productId)!;
  const pieces = product.tracking === "imei" ? store.units.filter((u) => u.productId === productId && u.status === "in_stock") : [];
  const qty = product.tracking === "imei" ? pieces.length : product.quantity;
  const totalCost = product.tracking === "imei" ? pieces.reduce((a, u) => a + u.cost, 0) : qty * product.avgCost;
  const unitNow = qty ? Math.round(totalCost / qty) : 0;
  const costs = pieces.map((u) => u.cost);
  const mixed = costs.length > 1 && Math.min(...costs) !== Math.max(...costs);
  const [price, setPrice] = useState(String(product.retailPrice));
  const [cost, setCost] = useState(String(unitNow));
  const p = Number(price) || 0;
  const c = Number(cost) || 0;
  const recost = qty > 0 && cost !== "" && c !== unitNow;
  const gain = recost ? qty * c - totalCost : 0;
  const effectiveCost = recost ? c : unitNow;

  function save() {
    store.repriceProduct({ productId, retailPrice: p, unitCost: recost ? c : undefined });
    const parts = [`${product.name}: سعر البيع ${p.toLocaleString("en")}`];
    if (gain) parts.push(`${gain > 0 ? "مكسب غلاء" : "خسارة نزول سعر"} ${Math.abs(gain).toLocaleString("en")}`);
    onDone(parts.join(" · "));
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`تعديل سعر — ${product.name}`}>
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">
          في المحل: <span className="num font-semibold">{qty}</span> قطعة
          {qty > 0 && (
            <>
              {" · "}التكلفة دلوقتي{" "}
              {mixed ? (
                <>
                  من <span className="num">{Math.min(...costs).toLocaleString("en")}</span> لـ <span className="num">{Math.max(...costs).toLocaleString("en")}</span> (متوسط{" "}
                  <span className="num">{unitNow.toLocaleString("en")}</span>)
                </>
              ) : (
                <span className="num font-semibold">{unitNow.toLocaleString("en")}</span>
              )}{" "}
              للقطعة
            </>
          )}
        </div>

        <Field label="سعر البيع" hint={p > 0 && qty > 0 && p < effectiveCost ? <span className="text-bad">أقل من التكلفة</span> : undefined}>
          <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="num text-lg font-semibold" />
        </Field>

        {qty > 0 ? (
          <Field label="التكلفة النهارده (سعر الجملة للقطعة)" hint="غيّرها بس لو سعر الجملة نفسه اتغيّر">
            <Input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className="num text-lg font-semibold" />
          </Field>
        ) : (
          <p className="text-xs text-ink-3">مفيش قطع في المحل — التكلفة بتتحدد لما تستلم البضاعة.</p>
        )}

        {gain !== 0 && (
          <div className={cn("rounded-lg px-3 py-2.5 text-sm", gain > 0 ? "bg-good-soft" : "bg-bad-soft")}>
            <div className={cn("font-semibold", gain > 0 ? "text-good" : "text-bad")}>
              {gain > 0 ? "مكسب غلاء" : "خسارة نزول سعر"}: {gain > 0 ? "+" : "−"}
              <Money value={Math.abs(gain)} />
            </div>
            <div className="mt-0.5 text-xs text-ink-2">
              {qty} قطعة × {Math.abs(c - totalCost / qty).toLocaleString("en", { maximumFractionDigits: 0 })} — بيتسجل لوحده بره ربح البيع. ولما القطعة تتباع، ربحها هيتحسب على التكلفة الجديدة.
            </div>
          </div>
        )}

        <Button className="w-full" disabled={p <= 0 || (qty > 0 && cost === "")} onClick={save}>
          حفظ
        </Button>
      </div>
    </Modal>
  );
}

/** Raise or lower the selling price of a whole category at once. */
function BulkPriceModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const store = useStore();
  const [category, setCategory] = useState<ProductCategory>("new_phone");
  const [percent, setPercent] = useState("");
  const pct = Number(percent) || 0;
  const items = store.products.filter((p) => p.category === category);
  const next = (v: number) => Math.max(5, Math.round((v * (1 + pct / 100)) / 5) * 5);

  return (
    <Modal open onClose={onClose} title="أسعار قسم كامل">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="القسم">
            <Select value={category} onChange={(e) => setCategory(e.target.value as ProductCategory)}>
              {(Object.keys(categoryLabel) as ProductCategory[]).map((k) => (
                <option key={k} value={k}>
                  {categoryLabel[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="النسبة %" hint="بالسالب لو هتنزّل">
            <Input type="number" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="5" className="num text-lg font-semibold" />
          </Field>
        </div>

        {pct !== 0 && items.length > 0 && (
          <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
            {items.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{p.name}</span>
                <span className="num shrink-0 text-xs">
                  <span className="text-ink-3">{p.retailPrice.toLocaleString("en")}</span> ← <span className="font-semibold">{next(p.retailPrice).toLocaleString("en")}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-3">ده بيغيّر سعر البيع بس، والأسعار بتتقرّب لأقرب 5 جنيه. لو التكلفة كمان اتغيّرت، عدّلها لكل صنف من القايمة.</p>

        <Button
          className="w-full"
          disabled={pct === 0 || pct <= -100 || items.length === 0}
          onClick={() => {
            store.repriceCategory({ category, percent: pct });
            onDone(`${categoryLabel[category]}: الأسعار اتغيّرت ${pct > 0 ? "+" : ""}${pct}% (${items.length} صنف)`);
            onClose();
          }}
        >
          تطبيق على {items.length} صنف
        </Button>
      </div>
    </Modal>
  );
}
