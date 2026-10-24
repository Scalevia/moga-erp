"use client";

import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardHeader, Combobox, Field, Input, Modal, Money, PageHeader, Segmented, Textarea, cn } from "@/components/ui";
import { categoryLabel, date } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ProductCategory, PurchaseInvoice } from "@/lib/types";

interface Line {
  key: string;
  productId: string;
  imeiText: string;
  qty: string;
  cost: string;
}

const newLine = (): Line => ({ key: Math.random().toString(36).slice(2, 9), productId: "", imeiText: "", qty: "", cost: "" });
const viaLabel = { cash: "كاش من الدرج", wallet: "فودافون كاش", bank: "إنستاباي" } as const;

export default function PurchasesPage() {
  const contacts = useStore((s) => s.contacts);
  const products = useStore((s) => s.products);
  const units = useStore((s) => s.units);
  const payables = useStore((s) => s.supplierPayables);
  const purchases = useStore((s) => s.purchases);
  const receiveDelivery = useStore((s) => s.receiveDelivery);

  const suppliers = contacts.filter((c) => c.kind === "supplier");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [supplierRef, setSupplierRef] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [paid, setPaid] = useState("0");
  const [via, setVia] = useState<"cash" | "wallet" | "bank">("cash");
  const [done, setDone] = useState<PurchaseInvoice | null>(null);
  const [newSupplier, setNewSupplier] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<{ name: string; lineKey: string } | null>(null);

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const stockOf = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p?.tracking === "imei" ? units.filter((u) => u.productId === id && u.status === "in_stock").length : (p?.quantity ?? 0);
  };
  const productItems = products
    .filter((p) => p.category !== "used_phone")
    .map((p) => ({ value: p.id, label: p.name, sub: `${categoryLabel[p.category]} · متاح ${stockOf(p.id)}` }));

  // Check every IMEI against stock and against the other lines of this delivery.
  const known = useMemo(() => new Set(units.map((u) => u.imei)), [units]);
  const checked = useMemo(() => {
    const seen = new Set<string>();
    return lines.map((l) => {
      const product = products.find((p) => p.id === l.productId);
      if (product?.tracking !== "imei") return { line: l, product, imeis: [] as { imei: string; problem: string | null }[], count: Number(l.qty) || 0 };
      const imeis = l.imeiText
        .split(/[\s,]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((imei) => {
          const problem = !/^\d{15}$/.test(imei) ? "لازم 15 رقم" : known.has(imei) ? "موجود في المخزن" : seen.has(imei) ? "مكرر" : null;
          seen.add(imei);
          return { imei, problem };
        });
      return { line: l, product, imeis, count: imeis.filter((x) => !x.problem).length };
    });
  }, [lines, products, known]);

  const total = checked.reduce((a, c) => a + c.count * (Number(c.line.cost) || 0), 0);
  const pieces = checked.reduce((a, c) => a + c.count, 0);
  const paidNum = Number(paid) || 0;
  const lineOk = (c: (typeof checked)[number]) => c.product && c.count > 0 && Number(c.line.cost) > 0 && c.imeis.every((x) => !x.problem);
  const valid = supplierId && checked.length > 0 && checked.every(lineOk) && paidNum <= total;
  const supplierName = (id: string) => contacts.find((c) => c.id === id)?.name ?? "—";

  function submit() {
    const invoice = receiveDelivery({
      supplierId,
      supplierRef: supplierRef.trim(),
      lines: checked.map((c) => ({
        productId: c.line.productId,
        imeis: c.imeis.map((x) => x.imei),
        quantity: Number(c.line.qty) || 0,
        unitCost: Number(c.line.cost),
      })),
      paid: paidNum,
      via,
    });
    setDone(invoice);
    setLines([newLine()]);
    setSupplierRef("");
    setPaid("0");
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="استلام بضاعة من مورد" subtitle="فاتورة واحدة فيها كل الأصناف — والباقي بيتسجل على حساب المورد" />
      {done && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
          <CheckCircle2 size={16} /> فاتورة استلام #{done.number} من {supplierName(done.supplierId)}: {done.lines.reduce((a, l) => a + l.qty, 0)} قطعة بـ <Money value={done.total} /> — اتضافت للمخزن
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px] [&>*]:min-w-0">
        <div className="space-y-3">
          <Card className="grid gap-3 p-4 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-sm font-medium text-ink-2">المورد</span>
              <Combobox
                value={supplierId}
                onChange={setSupplierId}
                placeholder="ابحث عن مورد…"
                items={suppliers.map((s) => ({ value: s.id, label: s.name, sub: <span className="num">{s.phone}</span> }))}
                onCreate={(q) => setNewSupplier(q)}
                createLabel="مورد جديد"
              />
            </div>
            <Field label="رقم فاتورة المورد (اختياري)">
              <Input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} className="num" />
            </Field>
          </Card>

          {checked.map((c, i) => {
            const { line } = c;
            const imei = c.product?.tracking === "imei";
            return (
              <Card key={line.key} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-2">صنف {i + 1}</span>
                  {lines.length > 1 && (
                    <button onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))} className="rounded-lg p-1.5 text-ink-3 hover:bg-bad-soft hover:text-bad" aria-label="حذف الصنف">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
                  <div>
                    <span className="mb-1 block text-sm font-medium text-ink-2">المنتج</span>
                    <Combobox
                      value={line.productId}
                      onChange={(v) => setLine(line.key, { productId: v })}
                      placeholder="ابحث بالاسم أو الماركة…"
                      items={productItems}
                      onCreate={(q) => setNewProduct({ name: q, lineKey: line.key })}
                      createLabel="منتج جديد"
                    />
                  </div>
                  {c.product && !imei && (
                    <Field label="الكمية" hint={`الموجود ${stockOf(c.product.id)}`}>
                      <Input type="number" value={line.qty} onChange={(e) => setLine(line.key, { qty: e.target.value })} className="num" />
                    </Field>
                  )}
                  {c.product && (
                    <Field label="تكلفة القطعة" hint={!imei && c.product.avgCost ? `المتوسط الحالي ${c.product.avgCost}` : undefined} className={cn(imei && "sm:col-span-2")}>
                      <Input type="number" value={line.cost} onChange={(e) => setLine(line.key, { cost: e.target.value })} className="num font-semibold" />
                    </Field>
                  )}
                </div>
                {imei && (
                  <div className="mt-3">
                    <Field label="أرقام الـ IMEI" hint="امسحهم ورا بعض بالسكانر، أو الصق لستة من الإكسيل">
                      <Textarea rows={4} value={line.imeiText} onChange={(e) => setLine(line.key, { imeiText: e.target.value })} className="num font-mono" />
                    </Field>
                    {c.imeis.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.imeis.map((x, k) => (
                          <Badge key={k} tone={x.problem ? "bad" : "good"} title={x.problem ?? ""}>
                            <span className="num">…{x.imei.slice(-6)}</span>
                            {x.problem && ` · ${x.problem}`}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {c.product && c.count > 0 && Number(line.cost) > 0 && (
                  <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm text-ink-2">
                    <span>{c.count} قطعة</span>
                    <Money value={c.count * Number(line.cost)} className="font-semibold text-ink" />
                  </div>
                )}
              </Card>
            );
          })}

          <Button variant="secondary" className="w-full" onClick={() => setLines((ls) => [...ls, newLine()])}>
            <Plus size={16} /> إضافة صنف تاني
          </Button>
        </div>

        <div className="space-y-4">
          <Card className="h-fit">
            <CardHeader title="الحساب" />
            <div className="space-y-3 p-4">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-ink-2">
                  <span>{checked.filter((c) => c.product).length} صنف · {pieces} قطعة</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">إجمالي الفاتورة</span>
                  <Money value={total} className="text-xl font-bold" />
                </div>
              </div>
              <Field label="المدفوع دلوقتي" hint={paidNum > total ? <span className="text-bad">أكتر من إجمالي الفاتورة</span> : undefined}>
                <Input type="number" value={paid} onChange={(e) => setPaid(e.target.value)} className="num" />
              </Field>
              {paidNum > 0 && (
                <Segmented
                  value={via}
                  onChange={setVia}
                  className="w-full"
                  options={[
                    { value: "cash", label: "الدرج" },
                    { value: "wallet", label: "فودافون كاش" },
                    { value: "bank", label: "إنستاباي" },
                  ]}
                />
              )}
              <div className="space-y-1 rounded-lg bg-surface-2 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-2">على الحساب</span>
                  <Money value={Math.max(0, total - paidNum)} />
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">رصيد المورد بعدها</span>
                  <Money value={(payables[supplierId] ?? 0) + Math.max(0, total - paidNum)} className="font-semibold" />
                </div>
              </div>
              <Button size="lg" className="w-full" disabled={!valid} onClick={submit}>
                استلام البضاعة
              </Button>
            </div>
          </Card>

          {purchases.length > 0 && (
            <Card>
              <CardHeader title="آخر فواتير استلام" />
              <ul className="divide-y divide-border text-sm">
                {[...purchases].reverse().slice(0, 5).map((p) => (
                  <li key={p.id} className="px-4 py-2.5">
                    <div className="flex justify-between">
                      <span className="font-medium">
                        #{p.number} · {supplierName(p.supplierId)}
                      </span>
                      <Money value={p.total} className="font-semibold" />
                    </div>
                    <div className="text-xs text-ink-3">
                      {date(p.createdAt)} · {p.lines.reduce((a, l) => a + l.qty, 0)} قطعة
                      {p.supplierRef && ` · فاتورة المورد ${p.supplierRef}`}
                      {p.paid > 0 && ` · اتدفع ${p.paid.toLocaleString("en")} (${viaLabel[p.via]})`}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {newSupplier !== null && (
        <NewSupplierModal
          initialName={newSupplier}
          onClose={() => setNewSupplier(null)}
          onCreated={(id) => {
            setSupplierId(id);
            setNewSupplier(null);
          }}
        />
      )}
      {newProduct !== null && (
        <NewProductModal
          initialName={newProduct.name}
          onClose={() => setNewProduct(null)}
          onCreated={(id) => {
            setLine(newProduct.lineKey, { productId: id });
            setNewProduct(null);
          }}
        />
      )}
    </div>
  );
}

function NewSupplierModal({ initialName, onClose, onCreated }: { initialName: string; onClose: () => void; onCreated: (id: string) => void }) {
  const addSupplier = useStore((s) => s.addSupplier);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  return (
    <Modal open onClose={onClose} title="مورد جديد" width="max-w-sm">
      <div className="space-y-3">
        <Field label="اسم المورد">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="التليفون">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="num" placeholder="01xxxxxxxxx" />
        </Field>
        <Button className="w-full" disabled={!name.trim() || !phone.trim()} onClick={() => onCreated(addSupplier({ name: name.trim(), phone: phone.trim() }))}>
          إضافة المورد
        </Button>
      </div>
    </Modal>
  );
}

const newCategories: { value: Exclude<ProductCategory, "used_phone">; label: string; hint: string }[] = [
  { value: "new_phone", label: "موبايل جديد", hint: "كل جهاز بيتسجل برقم الـ IMEI بتاعه" },
  { value: "feature_phone", label: "موبايل زراير", hint: "بيتسجل بالكمية والباركود" },
  { value: "accessory", label: "إكسسوار", hint: "بيتسجل بالكمية والباركود" },
];

function NewProductModal({ initialName, onClose, onCreated }: { initialName: string; onClose: () => void; onCreated: (id: string) => void }) {
  const addProduct = useStore((s) => s.addProduct);
  const products = useStore((s) => s.products);
  const [f, setF] = useState({ name: initialName, brand: "", category: "new_phone" as (typeof newCategories)[number]["value"], barcode: "", retailPrice: "" });
  const cat = newCategories.find((c) => c.value === f.category)!;
  const byQuantity = f.category !== "new_phone";
  const barcodeTaken = !!f.barcode && products.some((p) => p.barcode === f.barcode);
  const nameTaken = products.some((p) => p.name.trim().toLowerCase() === f.name.trim().toLowerCase());
  const retail = Number(f.retailPrice);
  const valid = f.name.trim() && !nameTaken && !barcodeTaken && retail > 0;

  return (
    <Modal open onClose={onClose} title="منتج جديد" width="max-w-md">
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-ink-2">النوع</span>
          <Segmented value={f.category} onChange={(v) => setF({ ...f, category: v })} options={newCategories.map((c) => ({ value: c.value, label: c.label }))} />
          <p className="mt-1 text-xs text-ink-3">{cat.hint}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="اسم المنتج" className="col-span-2" hint={nameTaken ? <span className="text-bad">فيه منتج بنفس الاسم</span> : "مثال: Samsung Galaxy A36 256GB"}>
            <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="الماركة">
            <Input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} />
          </Field>
          {byQuantity && (
            <Field label="الباركود" hint={barcodeTaken ? <span className="text-bad">الباركود ده متسجل لمنتج تاني</span> : "امسحه بالسكانر"}>
              <Input value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value.trim() })} className="num" />
            </Field>
          )}
          <Field label="سعر البيع">
            <Input type="number" value={f.retailPrice} onChange={(e) => setF({ ...f, retailPrice: e.target.value })} className="num" />
          </Field>
        </div>
        <Button
          className="w-full"
          disabled={!valid}
          onClick={() =>
            onCreated(addProduct({ name: f.name.trim(), brand: f.brand.trim(), category: f.category, barcode: f.barcode, retailPrice: retail }))
          }
        >
          إضافة المنتج
        </Button>
      </div>
    </Modal>
  );
}
