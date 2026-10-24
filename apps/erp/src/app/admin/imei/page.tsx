"use client";

import { PackageCheck, ScanSearch, ShoppingBag, Truck } from "lucide-react";
import { useState } from "react";
import { Badge, Card, Input, Money } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { useStore } from "@/lib/store";

const screenLabel = { excellent: "ممتازة", scratches: "خدوش", cracked: "مكسورة" };

export default function ImeiLookup() {
  const { units, products, contacts, orders, staff: employees } = useStore();
  const [q, setQ] = useState("");
  const code = q.trim();
  const unit = code.length >= 6 ? units.find((u) => u.imei === code || u.imei.endsWith(code)) : undefined;
  const product = products.find((p) => p.id === unit?.productId);
  const supplier = contacts.find((c) => c.id === unit?.supplierId);
  const order = orders.find((o) => o.id === unit?.soldOrderId);
  const line = order?.items.find((i) => i.imei === unit?.imei);
  const customer = contacts.find((c) => c.id === order?.customerId);
  const sample = units.find((u) => u.status === "sold" && orders.find((o) => o.id === u.soldOrderId)?.customerId);

  return (
    <div className="space-y-4">
      <div className="relative">
        <ScanSearch size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, ""))} className="num h-12 ps-10 text-base" placeholder="IMEI كامل أو آخر 6 أرقام" inputMode="numeric" />
      </div>
      {!unit && sample && (
        <button onClick={() => setQ(sample.imei)} className="text-xs text-brand">
          جرّب: <span className="num">{sample.imei}</span>
        </button>
      )}

      {unit && product && (
        <>
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{product.name}</div>
                <div className="num mt-0.5 text-xs text-ink-3">{unit.imei}</div>
              </div>
              <Badge tone={unit.status === "sold" ? "brand" : unit.status === "in_stock" ? "good" : "warn"}>
                {unit.status === "sold" ? "متباع" : unit.status === "in_stock" ? "في المخزن" : "مرتجع"}
              </Badge>
            </div>
            {unit.inspection && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge>بطارية {unit.inspection.batteryHealth}%</Badge>
                <Badge>شاشة {screenLabel[unit.inspection.screen]}</Badge>
                {unit.inspection.hasBox && <Badge>بالعلبة</Badge>}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <ol className="relative space-y-6 border-s-2 border-border ps-6">
              <Step icon={<Truck size={14} />} title={unit.condition === "used" ? "اتشرى مستعمل" : "اتشرى من مورد"} when={dateTime(unit.purchasedAt)}>
                {supplier ? `${supplier.name}${supplier.nationalId ? ` · بطاقة ${supplier.nationalId}` : ""}` : "—"}
                <div>
                  التكلفة <Money value={unit.cost} className="font-semibold" />
                </div>
              </Step>
              {unit.status === "in_stock" && (
                <Step icon={<PackageCheck size={14} />} title="في المخزن دلوقتي" when="">
                  سعر البيع المعروض <Money value={product.retailPrice} />
                </Step>
              )}
              {order && line && (
                <Step icon={<ShoppingBag size={14} />} title={`اتباع — فاتورة #${order.number}`} when={dateTime(order.createdAt)}>
                  <div>العميل: {customer ? <>{customer.name} · <span className="num">{customer.phone}</span></> : "بدون بيانات"}</div>
                  <div>الكاشير: {employees.find((e) => e.id === order.employeeId)?.name}</div>
                  <div className="mt-1 flex gap-4">
                    <span>سعر البيع <Money value={line.unitPrice} className="font-semibold" /></span>
                    <span className="text-good">ربح <Money value={line.unitPrice - line.unitCost} className="font-semibold" /></span>
                  </div>
                  {order.installmentPlanId && <Badge tone="brand" className="mt-1">بالتقسيط</Badge>}
                </Step>
              )}
            </ol>
          </Card>
        </>
      )}
      {code.length >= 6 && !unit && <p className="text-center text-sm text-ink-3">الـ IMEI ده مش موجود في السيستم</p>}
    </div>
  );
}

function Step({ icon, title, when, children }: { icon: React.ReactNode; title: string; when: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="absolute -start-[13px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-brand text-brand-ink">{icon}</span>
      <div className="font-medium">{title}</div>
      {when && <div className="text-xs text-ink-3">{when}</div>}
      <div className="mt-1 space-y-0.5 text-sm text-ink-2">{children}</div>
    </li>
  );
}
