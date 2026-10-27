"use client";

import { ClipboardPaste, Copy, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Money, Segmented, cn } from "@/components/ui";
import { balanceIds, balanceLabel, categoryLabel, machineIds, machineLabel } from "@/lib/format";
import {
  PASTE_COLUMNS,
  emptyProduct,
  imeiList,
  isImeiCategory,
  key,
  n,
  parsePasted,
  productCount,
  useSetupDraft,
  type AgentDirection,
  type DraftProduct,
  type SetupDraft,
} from "@/lib/setup";
import type { ProductCategory } from "@/lib/types";

const cell =
  "h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition hover:border-border focus:border-brand focus:bg-surface";

function useDraft() {
  // Two selectors: a selector returning a fresh tuple would re-render forever.
  const draft = useSetupDraft((s) => s.draft);
  const update = useSetupDraft((s) => s.update);
  return [draft, update] as const;
}

// ---------------------------------------------------------------- money

const moneyFields: { key: keyof SetupDraft["money"]; label: string; hint?: string; group: string }[] = [
  { key: "cash", label: "الكاش اللي في الدرج", hint: "عدّه دلوقتي — ده رصيد أول شيفت", group: "الكاش" },
  { key: "wallet", label: "رصيد محفظة فودافون كاش", group: "المحافظ والماكينات" },
  ...balanceIds.map((id) => ({ key: id, label: `رصيد ${balanceLabel[id]}`, group: "المحافظ والماكينات" })),
  { key: "bank", label: "رصيد البنك (إنستاباي)", group: "البنك والجمعية" },
  { key: "savings", label: "الجمعية — اللي اتدفع لحد دلوقتي", hint: "لو لسه ما قبضتهاش", group: "البنك والجمعية" },
  { key: "fixedAssets", label: "قيمة الأصول الثابتة", hint: "ديكور، فاترينات، لابتوب، طابعة، ماكينات — بسعر الشراء", group: "أصول" },
];

export function MoneyStep() {
  const [draft, update] = useDraft();
  const groups = [...new Set(moneyFields.map((f) => f.group))];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((g) => (
        <Card key={g}>
          <CardHeader title={g} />
          <div className="space-y-3 p-4">
            {moneyFields
              .filter((f) => f.group === g)
              .map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <Input
                    type="number"
                    value={draft.money[f.key]}
                    onChange={(e) => update((d) => ({ ...d, money: { ...d.money, [f.key]: e.target.value } }))}
                    className="num"
                    placeholder="0"
                  />
                </Field>
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- products

const categories = Object.keys(categoryLabel) as ProductCategory[];

export function ProductsStep() {
  const [draft, update] = useDraft();
  const [filter, setFilter] = useState<"all" | ProductCategory>("all");
  const [q, setQ] = useState("");
  const [paste, setPaste] = useState(false);
  const [openImei, setOpenImei] = useState<string | null>(null);

  const setP = (k: string, patch: Partial<DraftProduct>) =>
    update((d) => ({ ...d, products: d.products.map((p) => (p.key === k ? { ...p, ...patch } : p)) }));
  const add = (c: ProductCategory) => {
    const p = emptyProduct(c);
    update((d) => ({ ...d, products: [...d.products, p] }));
    if (isImeiCategory(c)) setOpenImei(p.key);
  };

  const rows = draft.products.filter(
    (p) => (filter === "all" || p.category === filter) && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q) || p.imeis.includes(q)),
  );
  const totals = useMemo(() => {
    let pieces = 0, cost = 0, retail = 0;
    for (const p of draft.products) {
      const c = productCount(p);
      pieces += c;
      cost += c * n(p.cost);
      retail += c * n(p.retail);
    }
    return { pieces, cost, retail };
  }, [draft.products]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <Button key={c} variant="secondary" size="sm" onClick={() => add(c)}>
            <Plus size={14} /> {categoryLabel[c]}
          </Button>
        ))}
        <Button size="sm" onClick={() => setPaste(true)}>
          <ClipboardPaste size={14} /> لصق من إكسيل
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="عدد الأصناف" value={<span className="num">{draft.products.length}</span>} />
        <Stat label="عدد القطع" value={<span className="num">{totals.pieces}</span>} />
        <Stat label="القيمة بالتكلفة" value={<Money value={totals.cost} />} />
        <Stat label="القيمة بسعر البيع" value={<Money value={totals.retail} />} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <Segmented
            className="max-w-full overflow-x-auto"
            value={filter}
            onChange={setFilter}
            options={[{ value: "all", label: "الكل" }, ...categories.map((c) => ({ value: c, label: categoryLabel[c] }))]}
          />
          <div className="relative w-full sm:ms-auto sm:w-64">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الباركود أو IMEI" className="h-9 ps-8" />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="py-14 text-center text-sm text-ink-3">
            {draft.products.length === 0 ? "ابدأ بإضافة صنف، أو الصق لستة البضاعة من إكسيل" : "مفيش أصناف بالفلتر ده"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-surface-2 text-xs text-ink-3">
                <tr>
                  <th className="w-32 px-2 py-2 text-start font-medium">النوع</th>
                  <th className="px-2 py-2 text-start font-medium">اسم المنتج</th>
                  <th className="w-28 px-2 py-2 text-start font-medium">الماركة</th>
                  <th className="w-36 px-2 py-2 text-start font-medium">الباركود / IMEI</th>
                  <th className="w-24 px-2 py-2 text-start font-medium">التكلفة</th>
                  <th className="w-24 px-2 py-2 text-start font-medium">سعر البيع</th>
                  <th className="w-20 px-2 py-2 text-start font-medium">الكمية</th>
                  <th className="w-28 px-2 py-2 text-start font-medium">الإجمالي</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => {
                  const imei = isImeiCategory(p.category);
                  const count = productCount(p);
                  const bad = n(p.retail) > 0 && n(p.retail) < n(p.cost);
                  return (
                    <ProductRow key={p.key}>
                      <tr className="align-middle">
                        <td className="px-1 py-1">
                          <select value={p.category} onChange={(e) => setP(p.key, { category: e.target.value as ProductCategory })} className={cell}>
                            {categories.map((c) => (
                              <option key={c} value={c}>
                                {categoryLabel[c]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input value={p.name} onChange={(e) => setP(p.key, { name: e.target.value })} className={cn(cell, !p.name && "border-warn/40")} placeholder="مثال: Samsung A16 128GB" />
                        </td>
                        <td className="px-1 py-1">
                          <input value={p.brand} onChange={(e) => setP(p.key, { brand: e.target.value })} className={cell} />
                        </td>
                        <td className="px-1 py-1">
                          {imei ? (
                            <button onClick={() => setOpenImei(openImei === p.key ? null : p.key)} className="flex h-9 w-full items-center justify-between rounded-md px-2 text-brand hover:bg-brand-soft">
                              <span>أرقام IMEI</span>
                              <Badge tone="brand">{count}</Badge>
                            </button>
                          ) : (
                            <input value={p.barcode} onChange={(e) => setP(p.key, { barcode: e.target.value.trim() })} className={cn(cell, "num")} placeholder="امسح الباركود" />
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" inputMode="numeric" value={p.cost} onChange={(e) => setP(p.key, { cost: e.target.value })} className={cn(cell, "num")} />
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" inputMode="numeric" value={p.retail} onChange={(e) => setP(p.key, { retail: e.target.value })} className={cn(cell, "num", bad && "text-bad")} />
                        </td>
                        <td className="px-1 py-1">
                          {imei ? (
                            <span className="num block px-2 text-ink-2">{count}</span>
                          ) : (
                            <input type="number" inputMode="numeric" value={p.qty} onChange={(e) => setP(p.key, { qty: e.target.value })} className={cn(cell, "num")} />
                          )}
                        </td>
                        <td className="px-2 py-1">
                          <Money value={count * n(p.cost)} className="text-ink-2" />
                        </td>
                        <td className="px-1 py-1">
                          <button
                            onClick={() => update((d) => ({ ...d, products: d.products.filter((x) => x.key !== p.key) }))}
                            className="rounded-md p-2 text-ink-3 hover:bg-bad-soft hover:text-bad"
                            aria-label="حذف"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      {imei && openImei === p.key && (
                        <tr className="bg-surface-2">
                          <td colSpan={9} className="px-3 py-3">
                            <div className="mb-1 text-xs text-ink-3">امسح الـ IMEI بتاع كل جهاز ورا بعض بالسكانر — كل جهاز في سطر. كل الأجهزة في السطر ده بنفس التكلفة.</div>
                            <textarea
                              autoFocus
                              rows={4}
                              value={p.imeis}
                              onChange={(e) => setP(p.key, { imeis: e.target.value })}
                              className="num w-full rounded-lg border border-border bg-surface p-2 font-mono text-sm outline-none focus:border-brand"
                            />
                            <div className="mt-2 flex flex-wrap gap-1">
                              {imeiList(p.imeis).map((code, i) => (
                                <Badge key={i} tone={/^\d{15}$/.test(code) ? "good" : "bad"}>
                                  <span className="num">…{code.slice(-6)}</span>
                                </Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </ProductRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {paste && <PasteModal onClose={() => setPaste(false)} />}
    </div>
  );
}

function ProductRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function PasteModal({ onClose }: { onClose: () => void }) {
  const update = useSetupDraft((s) => s.update);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const parsed = useMemo(() => parsePasted(text), [text]);
  const header = PASTE_COLUMNS.join("\t");
  const example = ["جديد\tSamsung A16 128GB\tSamsung\t\t7600\t8499\t\t356789012345678 356789012345679", "إكسسوار\tجراب سيليكون\tGeneric\t6200000000011\t30\t100\t85\t"].join("\n");

  return (
    <Modal open onClose={onClose} title="لصق البضاعة من إكسيل" width="max-w-3xl">
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <p className="mb-2">رتّب الأعمدة في إكسيل بالترتيب ده، وبعدين ظلّل الصفوف وانسخها (Ctrl+C) والصقها تحت:</p>
          <div className="flex flex-wrap gap-1">
            {PASTE_COLUMNS.map((c, i) => (
              <Badge key={c}>
                <span className="num">{i + 1}</span> {c}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">
            النوع: جديد / مستعمل / زراير / إكسسوار. الموبايلات اكتب أرقام الـ IMEI بمسافة بينهم بدل الكمية. الإكسسوارات والزراير اكتب الكمية والباركود.
          </p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(`${header}\n${example}`);
              setCopied(true);
            }}
            className="mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline"
          >
            <Copy size={12} /> {copied ? "اتنسخ — الصقه في إكسيل كبداية" : "انسخ شكل الجدول مع مثال"}
          </button>
        </div>
        <textarea
          autoFocus
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="الصق هنا…"
          className="num w-full rounded-lg border border-border p-3 font-mono text-xs outline-none focus:border-brand"
          dir="ltr"
        />
        {parsed.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border">
                {parsed.map((p) => (
                  <tr key={p.key}>
                    <td className="px-2 py-1.5">
                      <Badge>{categoryLabel[p.category]}</Badge>
                    </td>
                    <td className="px-2 py-1.5">{p.name || <span className="text-bad">بدون اسم</span>}</td>
                    <td className="num px-2 py-1.5">{p.cost}</td>
                    <td className="num px-2 py-1.5">{p.retail}</td>
                    <td className="num px-2 py-1.5">{productCount(p)} قطعة</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button
          size="lg"
          className="w-full"
          disabled={!parsed.length}
          onClick={() => {
            update((d) => ({ ...d, products: [...d.products, ...parsed] }));
            onClose();
          }}
        >
          إضافة {parsed.length} صنف
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- simple lists

interface Col<T> {
  key: keyof T & string;
  label: string;
  type?: "text" | "number" | "date" | "tel" | "digits"; // tel: phone keypad · digits: number pad, kept as text (IDs)
  width?: string;
  placeholder?: string;
}

function ListEditor<T extends { key: string }>({
  rows,
  cols,
  onChange,
  make,
  addLabel,
  empty,
  total,
}: {
  rows: T[];
  cols: Col<T>[];
  onChange: (rows: T[]) => void;
  make: () => T;
  addLabel: string;
  empty: string;
  total?: { label: string; value: number };
}) {
  return (
    <Card>
      {rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-3">{empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-2 text-xs text-ink-3">
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className={cn("px-2 py-2 text-start font-medium", c.width)}>
                    {c.label}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key}>
                  {cols.map((c) => (
                    <td key={c.key} className="px-1 py-1">
                      <input
                        type={c.type === "digits" ? "text" : (c.type ?? "text")}
                        inputMode={c.type === "number" || c.type === "digits" ? "numeric" : c.type === "tel" ? "tel" : undefined}
                        value={r[c.key] as string}
                        placeholder={c.placeholder}
                        onChange={(e) => onChange(rows.map((x) => (x.key === r.key ? { ...x, [c.key]: e.target.value } : x)))}
                        className={cn(cell, (c.type === "number" || c.type === "tel" || c.type === "digits") && "num")}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <button onClick={() => onChange(rows.filter((x) => x.key !== r.key))} className="rounded-md p-2 text-ink-3 hover:bg-bad-soft hover:text-bad" aria-label="حذف">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border p-3">
        <Button variant="secondary" size="sm" onClick={() => onChange([...rows, make()])}>
          <Plus size={14} /> {addLabel}
        </Button>
        {total && (
          <span className="text-sm text-ink-2">
            {total.label} <Money value={total.value} className="font-bold text-ink" />
          </span>
        )}
      </div>
    </Card>
  );
}

export function SuppliersStep() {
  const [draft, update] = useDraft();
  return (
    <ListEditor
      rows={draft.suppliers}
      onChange={(suppliers) => update((d) => ({ ...d, suppliers }))}
      make={() => ({ key: key(), name: "", phone: "", balance: "" })}
      addLabel="إضافة مورد"
      empty="أضف كل الموردين اللي بتتعامل معاهم — حتى لو مش عليك لهم حاجة"
      cols={[
        { key: "name", label: "اسم المورد" },
        { key: "phone", label: "التليفون", type: "tel", width: "w-40" },
        { key: "balance", label: "عليك له كام", type: "number", width: "w-36", placeholder: "0" },
      ]}
      total={{ label: "إجمالي اللي عليك للموردين", value: draft.suppliers.reduce((a, s) => a + n(s.balance), 0) }}
    />
  );
}

export function LendersStep() {
  const [draft, update] = useDraft();
  return (
    <ListEditor
      rows={draft.lenders}
      onChange={(lenders) => update((d) => ({ ...d, lenders }))}
      make={() => ({ key: key(), name: "", phone: "", remaining: "", notes: "" })}
      addLabel="إضافة سلفة"
      empty="لو المحل مستلف فلوس من حد، سجّل المتبقي عليه هنا"
      cols={[
        { key: "name", label: "اسم المُقرض" },
        { key: "phone", label: "التليفون", type: "tel", width: "w-40" },
        { key: "remaining", label: "المتبقي", type: "number", width: "w-32" },
        { key: "notes", label: "ملاحظات", width: "w-48" },
      ]}
      total={{ label: "إجمالي السُّلف", value: draft.lenders.reduce((a, l) => a + n(l.remaining), 0) }}
    />
  );
}

export function AgentsStep() {
  const [draft, update] = useDraft();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {machineIds.map((id) => {
        const a = draft.agents[id];
        const set = (patch: Partial<typeof a>) => update((d) => ({ ...d, agents: { ...d.agents, [id]: { ...d.agents[id], ...patch } } }));
        return (
          <Card key={id} className="space-y-3 p-4">
            <h3 className="font-semibold">مندوب {machineLabel[id]}</h3>
            <Segmented<AgentDirection>
              value={a.direction}
              onChange={(direction) => set({ direction })}
              options={[
                { value: "none", label: "الحساب مقفول" },
                { value: "we_owe", label: "شحن ولسه ما دفعتلوش" },
              ]}
            />
            {a.direction !== "none" && (
              <Field label="المبلغ">
                <Input type="number" value={a.amount} onChange={(e) => set({ amount: e.target.value })} className="num" />
              </Field>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export function InstallmentsStep() {
  const [draft, update] = useDraft();
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-3">
        لكل عميل عليه أقساط: المتبقي عليه كله، والقسط الشهري، وميعاد القسط الجاي — السيستم هيعمل جدول الأقساط الباقية لوحده.
      </p>
      <ListEditor
        rows={draft.installments}
        onChange={(installments) => update((d) => ({ ...d, installments }))}
        make={() => ({ key: key(), name: "", phone: "", nationalId: "", item: "", remaining: "", monthly: "", nextDue: "", guarantorName: "", guarantorPhone: "" })}
        addLabel="إضافة عميل"
        empty="لو مفيش عملاء عليهم أقساط دلوقتي، كمّل للخطوة الجاية"
        cols={[
          { key: "name", label: "العميل" },
          { key: "phone", label: "التليفون", type: "tel", width: "w-32" },
          { key: "nationalId", label: "الرقم القومي", type: "digits", width: "w-36" },
          { key: "item", label: "الجهاز", width: "w-36" },
          { key: "remaining", label: "المتبقي", type: "number", width: "w-24" },
          { key: "monthly", label: "القسط", type: "number", width: "w-24" },
          { key: "nextDue", label: "القسط الجاي", type: "date", width: "w-36" },
          { key: "guarantorName", label: "الضامن", width: "w-32" },
          { key: "guarantorPhone", label: "تليفون الضامن", type: "tel", width: "w-32" },
        ]}
        total={{ label: "إجمالي الأقساط عند العملاء", value: draft.installments.reduce((a, x) => a + n(x.remaining), 0) }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </Card>
  );
}
