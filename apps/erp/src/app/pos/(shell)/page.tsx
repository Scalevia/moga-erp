"use client";

import { AlertTriangle, Barcode, Minus, Plus, ScanLine, Trash2, UserRound, Wrench } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CheckoutModal } from "@/components/pos/checkout";
import { ReceiptModal } from "@/components/pos/receipt";
import { Badge, Button, Card, Field, Input, Modal, Money, Textarea, cn } from "@/components/ui";
import { OTHER_SERVICE_ID, categoryLabel, itemCategoryLabel } from "@/lib/format";
import { unitPrice, useStore } from "@/lib/store";
import type { Order, OrderItem, PhoneUnit, Product } from "@/lib/types";

type CartLine = OrderItem & { key: string; available: number };

export default function SalePage() {
  const products = useStore((s) => s.products);
  const units = useStore((s) => s.units);
  const services = useStore((s) => s.services);
  const employeeId = useStore((s) => s.currentEmployeeId);
  const employees = useStore((s) => s.staff);
  const isAdmin = employees.find((e) => e.id === employeeId)?.role === "admin";

  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState({ name: "", phone: "", nationalId: "" });
  const [pickModel, setPickModel] = useState<Product | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [serviceDraft, setServiceDraft] = useState<{ id: string; name: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const inStock = useMemo(() => units.filter((u) => u.status === "in_stock"), [units]);
  const inCart = new Set(cart.map((c) => c.imei).filter(Boolean));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.barcode?.includes(q))
      .slice(0, 8);
  }, [query, products]);

  const stockOf = (p: Product) =>
    p.tracking === "imei" ? inStock.filter((u) => u.productId === p.id).length : p.quantity;

  function notify(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  function addUnit(unit: PhoneUnit) {
    if (inCart.has(unit.imei)) return notify("الجهاز ده موجود في الفاتورة بالفعل");
    const p = products.find((x) => x.id === unit.productId)!;
    setCart((c) => [
      ...c,
      { key: unit.imei, productId: p.id, name: p.name, category: p.category, imei: unit.imei, qty: 1, listPrice: unitPrice(unit, p), unitPrice: unitPrice(unit, p), unitCost: unit.cost, available: 1 },
    ]);
  }

  function addQuantity(p: Product) {
    // No selling below zero: stock that arrived has to be received first.
    const inCartQty = cart.find((l) => l.productId === p.id && !l.imei)?.qty ?? 0;
    if (inCartQty >= p.quantity) return notify(outOfStock(p.quantity));
    setCart((c) => {
      const existing = c.find((l) => l.productId === p.id && !l.imei);
      if (existing) return c.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key: p.id, productId: p.id, name: p.name, category: p.category, qty: 1, listPrice: p.retailPrice, unitPrice: p.retailPrice, unitCost: p.avgCost, available: p.quantity }];
    });
  }

  function choose(p: Product) {
    setQuery("");
    if (p.tracking === "imei") setPickModel(p);
    else addQuantity(p);
    scanRef.current?.focus();
  }

  function onScan(e: React.FormEvent) {
    e.preventDefault();
    const code = query.trim();
    if (!code) return;
    const unit = units.find((u) => u.imei === code);
    if (unit) {
      if (unit.status !== "in_stock") notify("الجهاز ده متباع قبل كده — راجع المرتجعات");
      else addUnit(unit);
      setQuery("");
      return;
    }
    const byBarcode = products.find((p) => p.barcode === code);
    if (byBarcode) {
      addQuantity(byBarcode);
      setQuery("");
      return;
    }
    if (results.length === 1) choose(results[0]);
  }

  const total = cart.reduce((a, l) => a + l.qty * l.unitPrice, 0);
  const subtotal = cart.reduce((a, l) => a + l.qty * (l.listPrice ?? l.unitPrice), 0);
  const discount = subtotal - total;
  // Lines priced under their cost — the employee is warned, the cost itself stays hidden.
  const lossLines = cart.filter((l) => l.unitPrice < l.unitCost);
  const profit = cart.reduce((a, l) => a + l.qty * (l.unitPrice - l.unitCost), 0);
  const hasPhone = cart.some((l) => l.imei);
  // Quantity items are checked against the stock right now, not when they were added.
  const availableOf = (l: CartLine) => (l.imei || l.category === "service" ? l.available : (products.find((p) => p.id === l.productId)?.quantity ?? 0));
  const overStock = cart.some((l) => l.qty > availableOf(l));
  const customerMissing = hasPhone && (!customer.name || !customer.phone);

  function reset() {
    setCart([]);
    setCustomer({ name: "", phone: "", nationalId: "" });
    scanRef.current?.focus();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-4">
        <form onSubmit={onScan} className="relative">
          <ScanLine className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-3" size={22} />
          <input
            ref={scanRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="امسح الـ IMEI أو الباركود، أو اكتب اسم المنتج…"
            className="h-14 w-full rounded-xl border-2 border-border bg-surface ps-12 pe-4 text-lg outline-none transition focus:border-brand"
          />
          {results.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
              {results.map((p) => {
                const stock = stockOf(p);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => choose(p)}
                    disabled={stock === 0}
                    className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-start last:border-0 hover:bg-surface-2 disabled:opacity-40"
                  >
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-ink-3">
                        {categoryLabel[p.category]} · {p.tracking === "imei" ? "بالـ IMEI" : `باركود ${p.barcode}`}
                      </div>
                    </div>
                    <div className="text-end">
                      <Money value={p.retailPrice} className="font-semibold" />
                      <div className={cn("text-xs", stock <= 2 ? "text-warn" : "text-ink-3")}>متاح {stock}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </form>

        <Card className="p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-2">
            <Wrench size={15} /> خدمات
          </div>
          <div className="flex flex-wrap gap-2">
            {services.map((svc) => (
              <button
                key={svc.id}
                onClick={() => setServiceDraft({ id: svc.id, name: svc.name })}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-ink-2 transition hover:border-brand hover:text-brand"
              >
                + {svc.name}
              </button>
            ))}
            <button
              onClick={() => setServiceDraft({ id: OTHER_SERVICE_ID, name: "" })}
              className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-ink-2 transition hover:border-brand hover:text-brand"
            >
              + أخرى
            </button>
          </div>
        </Card>

        {flash && (
          <div className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn">
            <AlertTriangle size={16} /> {flash}
          </div>
        )}

        <Card>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-semibold">الفاتورة الحالية</h2>
            {cart.length > 0 && (
              <button onClick={reset} className="text-sm text-ink-3 hover:text-bad">
                تفريغ
              </button>
            )}
          </div>
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-ink-3">
              <Barcode size={40} className="mb-3 opacity-40" />
              <p>امسح أول منتج علشان تبدأ</p>
              <QuickPicks onPick={choose} products={products} />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {cart.map((l) => {
                const list = l.listPrice ?? l.unitPrice;
                const lineDiscount = list - l.unitPrice;
                const setPrice = (price: number) => setCart((c) => c.map((x) => (x === l ? { ...x, unitPrice: Math.max(0, price) } : x)));
                const available = availableOf(l);
                const lineOverStock = l.qty > available;
                const atLoss = l.unitPrice < l.unitCost; // below what the item cost us
                const isService = l.category === "service";
                return (
                  <li key={l.key} className="flex flex-wrap items-end gap-x-3 gap-y-2 px-4 py-3 sm:items-center sm:gap-4">
                    <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                      <div className="font-medium">{l.name}</div>
                      {l.note && <div className="text-xs text-ink-2">{l.note}</div>}
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                        {l.imei ? <span className="num">IMEI {l.imei}</span> : <span>{itemCategoryLabel[l.category]}</span>}
                        {isService && (
                          <span>
                            كلّفت <Money value={l.unitCost} />
                          </span>
                        )}
                        {!isService && (
                          <span>
                            السعر <Money value={list} className={cn(lineDiscount > 0 && "line-through")} />
                          </span>
                        )}
                        {lineDiscount > 0 && (
                          <Badge tone="warn">
                            خصم <Money value={lineDiscount * l.qty} />
                          </Badge>
                        )}
                        {atLoss && (
                          <Badge tone="bad">
                            <AlertTriangle size={11} /> البيعة دي بخسارة — خلي بالك
                          </Badge>
                        )}
                        {lineOverStock && <Badge tone="bad">المتاح {available} بس</Badge>}
                        {isAdmin && <span>ربح {Math.round((l.unitPrice - l.unitCost) * l.qty)}</span>}
                      </div>
                    </div>
                    {!l.imei && !isService && (
                      <div className="flex items-center gap-1 rounded-lg border border-border">
                        <button className="p-2 text-ink-3 hover:text-ink" onClick={() => setCart((c) => c.map((x) => (x === l ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>
                          <Minus size={14} />
                        </button>
                        <span className="num w-6 text-center font-semibold">{l.qty}</span>
                        <button
                          className="p-2 text-ink-3 hover:text-ink disabled:opacity-30"
                          disabled={l.qty >= available}
                          onClick={() => setCart((c) => c.map((x) => (x === l ? { ...x, qty: x.qty + 1 } : x)))}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    )}
                    <label className={cn("w-20 sm:w-24", isService && "hidden")}>
                      <span className="mb-0.5 block text-[11px] text-ink-3">خصم {l.qty > 1 ? "للقطعة" : ""}</span>
                      <Input
                        type="number"
                        min={0}
                        value={lineDiscount > 0 ? lineDiscount : ""}
                        placeholder="0"
                        onChange={(e) => setPrice(list - Math.max(0, Number(e.target.value) || 0))}
                        className="num text-end"
                        aria-label="الخصم"
                      />
                    </label>
                    <label className="w-28 flex-1 sm:w-32 sm:flex-none">
                      <span className="mb-0.5 block text-[11px] text-ink-3">سعر البيع</span>
                      <Input
                        type="number"
                        value={l.unitPrice || ""}
                        placeholder="0"
                        onChange={(e) => setPrice(Number(e.target.value))}
                        className={cn("num text-end font-semibold", atLoss && "border-bad text-bad")}
                        aria-label="سعر البيع"
                      />
                    </label>
                    <button onClick={() => setCart((c) => c.filter((x) => x !== l))} className="rounded-lg p-2 text-ink-3 hover:bg-bad-soft hover:text-bad" aria-label="حذف">
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserRound size={18} className="text-ink-3" />
            <h2 className="font-semibold">بيانات الزبون</h2>
            {hasPhone ? <Badge tone="brand">مطلوبة للضمان</Badge> : <Badge>اختياري</Badge>}
          </div>
          <div className="space-y-3">
            <Field label="رقم التليفون">
              <Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="num" placeholder="01xxxxxxxxx" />
            </Field>
            <Field label="الاسم">
              <Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
            </Field>
          </div>
        </Card>

        <Card className="p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-ink-2">
              <span>عدد القطع</span>
              <span className="num">{cart.reduce((a, l) => a + l.qty, 0)}</span>
            </div>
            {discount > 0 && (
              <>
                <div className="flex justify-between text-ink-2">
                  <span>قبل الخصم</span>
                  <Money value={subtotal} />
                </div>
                <div className="flex justify-between text-warn">
                  <span>الخصم</span>
                  <span>
                    − <Money value={discount} />
                  </span>
                </div>
              </>
            )}
            {isAdmin && (
              <div className="flex justify-between text-ink-2">
                <span>ربح الفاتورة</span>
                <Money value={profit} className={profit < 0 ? "text-bad" : "text-good"} />
              </div>
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
            <span className="font-semibold">الإجمالي</span>
            <Money value={total} className="text-3xl font-bold" />
          </div>
          {lossLines.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                <b>البيعة دي بخسارة — خلي بالك</b>
                <span className="block text-xs">{lossLines.map((l) => l.name).join("، ")}</span>
              </span>
            </div>
          )}
          <Button size="lg" className="mt-4 w-full" disabled={!cart.length || customerMissing || overStock} onClick={() => setCheckoutOpen(true)}>
            الدفع
          </Button>
          {customerMissing && <p className="mt-2 text-center text-xs text-warn">اكتب اسم وتليفون الزبون قبل بيع الموبايل</p>}
          {overStock && <p className="mt-2 text-center text-xs text-bad">فيه صنف كميته أكتر من الموجود في المخزن — قلّل الكمية، ولو البضاعة جت سجّلها في استلام بضاعة الأول</p>}
        </Card>
      </div>

      {pickModel && (
        <ImeiPicker
          product={pickModel}
          units={inStock.filter((u) => u.productId === pickModel.id && !inCart.has(u.imei))}
          onPick={(u) => {
            addUnit(u);
            setPickModel(null);
          }}
          onClose={() => setPickModel(null)}
        />
      )}

      {checkoutOpen && <CheckoutModal
        open
        onClose={() => setCheckoutOpen(false)}
        cart={cart}
        customer={customer}
        onCustomerChange={setCustomer}
        onDone={(order) => {
          setCheckoutOpen(false);
          setReceipt(order);
          reset();
        }}
      />}
      <ReceiptModal order={receipt} onClose={() => setReceipt(null)} />
      {serviceDraft && (
        <ServiceModal
          service={serviceDraft}
          onClose={() => setServiceDraft(null)}
          onAdd={(line) => {
            setCart((c) => [...c, line]);
            setServiceDraft(null);
          }}
        />
      )}
    </div>
  );
}

function ServiceModal({ service, onClose, onAdd }: { service: { id: string; name: string }; onClose: () => void; onAdd: (line: CartLine) => void }) {
  const other = service.id === OTHER_SERVICE_ID;
  const [name, setName] = useState(service.name);
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const c = Number(cost) || 0;
  const p = Number(price) || 0;
  // "Other" needs a description of what was done; the listed services can add one if useful.
  const valid = name.trim() && cost !== "" && c >= 0 && p > 0 && (!other || note.trim());

  return (
    <Modal open onClose={onClose} title={other ? "خدمة أخرى" : service.name} width="max-w-sm">
      <div className="space-y-3">
        {other && (
          <Field label="اسم الخدمة">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: كارت شحن لعبة" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="كلّفتك كام؟" hint="0 لو ملهاش تكلفة">
            <Input autoFocus={!other} type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className="num" placeholder="0" />
          </Field>
          <Field label="اتباعت بكام؟">
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="num font-semibold" />
          </Field>
        </div>
        <Field label={other ? "اللي اتعمل" : "اللي اتعمل (اختياري)"}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: حساب جوجل + تحميل واتساب وفيسبوك" />
        </Field>
        {p > 0 && cost !== "" && (
          <div className={cn("flex justify-between rounded-lg px-3 py-2 text-sm", p < c ? "bg-bad-soft text-bad" : "bg-surface-2")}>
            <span>{p < c ? "الخدمة دي بخسارة — خلي بالك" : "مكسب الخدمة"}</span>
            <Money value={p - c} className="font-semibold" />
          </div>
        )}
        <Button
          className="w-full"
          disabled={!valid}
          onClick={() =>
            onAdd({
              key: `svc-${Math.random().toString(36).slice(2, 9)}`,
              productId: service.id,
              name: name.trim(),
              category: "service",
              qty: 1,
              note: note.trim() || undefined,
              listPrice: p,
              unitPrice: p,
              unitCost: c,
              available: Number.POSITIVE_INFINITY,
            })
          }
        >
          إضافة للفاتورة
        </Button>
      </div>
    </Modal>
  );
}

function QuickPicks({ products, onPick }: { products: Product[]; onPick: (p: Product) => void }) {
  const quick = products.filter((p) => ["p-case", "p-scr", "p-cbl", "p-chg"].includes(p.id));
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {quick.map((p) => (
        <button key={p.id} onClick={() => onPick(p)} className="rounded-full border border-border px-3 py-1.5 text-sm text-ink-2 hover:border-brand hover:text-brand">
          + {p.name}
        </button>
      ))}
    </div>
  );
}

function ImeiPicker({ product, units, onPick, onClose }: { product: Product; units: PhoneUnit[]; onPick: (u: PhoneUnit) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <Card className="w-full max-w-md" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-border px-5 py-3">
          <h3 className="font-semibold">{product.name}</h3>
          <p className="text-xs text-ink-3">اختار الجهاز — أو امسح الـ IMEI من على العلبة</p>
        </div>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {units.map((u) => (
            <li key={u.imei}>
              <button onClick={() => onPick(u)} className="flex w-full items-center justify-between px-5 py-3 hover:bg-surface-2">
                <span className="num text-sm">{u.imei}</span>
                <span className="flex items-center gap-2">
                  {u.inspection && <Badge tone="neutral">بطارية {u.inspection.batteryHealth}%</Badge>}
                  <Money value={unitPrice(u, product)} className="text-sm font-semibold" />
                </span>
              </button>
            </li>
          ))}
          {units.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-3">مفيش أجهزة متاحة</li>}
        </ul>
      </Card>
    </div>
  );
}

const outOfStock = (qty: number) =>
  qty > 0 ? `المتاح ${qty} بس — لو جالك بضاعة سجّلها في استلام بضاعة الأول` : "المنتج ده خلصان من المخزن — لو جالك بضاعة سجّلها في استلام بضاعة الأول";
