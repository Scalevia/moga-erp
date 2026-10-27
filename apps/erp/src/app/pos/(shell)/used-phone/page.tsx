"use client";

import { Camera, CheckCircle2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardHeader, Field, Input, Money, PageHeader, Segmented, Textarea } from "@/components/ui";
import { date } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { UsedInspection } from "@/lib/types";

const empty = {
  productName: "",
  brand: "",
  imei: "",
  price: "",
  retailPrice: "",
  seller: { name: "", phone: "", nationalId: "" },
};

export default function UsedPhonePage() {
  const buyUsedPhone = useStore((s) => s.buyUsedPhone);
  const units = useStore((s) => s.units);
  const orders = useStore((s) => s.orders);
  const contacts = useStore((s) => s.contacts);
  const [f, setF] = useState(empty);
  const [insp, setInsp] = useState<UsedInspection>({ batteryHealth: 85, screen: "excellent", body: "good", hasBox: false, hasCharger: false, notes: "" });
  const [done, setDone] = useState(false);

  // A phone on the shelf can't be bought again; one the shop sold before can — it comes back as used.
  const known = f.imei.length === 15 ? units.find((u) => u.imei === f.imei) : undefined;
  const onShelf = known?.status === "in_stock";
  const lastSale = known?.soldOrderId ? orders.find((o) => o.id === known.soldOrderId) : undefined;
  const boughtBy = contacts.find((c) => c.id === lastSale?.customerId)?.name;
  const valid =
    f.productName && f.imei.length === 15 && !onShelf && Number(f.price) > 0 && Number(f.retailPrice) > Number(f.price) &&
    f.seller.name && f.seller.phone && f.seller.nationalId.length === 14;

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
        <CheckCircle2 size={48} className="mb-3 text-good" />
        <h2 className="text-xl font-bold">الجهاز اتضاف للمخزن</h2>
        <p className="mt-1 text-sm text-ink-3">واتخصم تمنه من الدرج واتسجل باسمك</p>
        <Button className="mt-6" onClick={() => { setF(empty); setDone(false); }}>
          شراء جهاز تاني
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="شراء موبايل مستعمل" subtitle="من زبون — الدفع كاش من الدرج" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="الجهاز" />
          <div className="grid grid-cols-2 gap-3 p-4">
            <Field label="الموديل" className="col-span-2">
              <Input value={f.productName} onChange={(e) => setF({ ...f, productName: e.target.value })} placeholder="iPhone 13 128GB (مستعمل)" />
            </Field>
            <Field label="الماركة">
              <Input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} placeholder="Apple" />
            </Field>
            <Field
              label="IMEI"
              hint={
                onShelf ? (
                  <span className="text-bad">الجهاز ده موجود في المخزن دلوقتي — مينفعش يتشرى تاني</span>
                ) : known ? (
                  <span className="text-brand">
                    الجهاز ده اتباع من المحل{lastSale && ` يوم ${date(lastSale.createdAt)}`}
                    {boughtBy && ` لـ ${boughtBy}`} — هيرجع المخزن كمستعمل
                  </span>
                ) : (
                  "اطلب *#06# من الجهاز"
                )
              }
            >
              <Input inputMode="numeric" value={f.imei} maxLength={15} onChange={(e) => setF({ ...f, imei: e.target.value.replace(/\D/g, "") })} className="num" />
            </Field>
            <Field label="سعر الشراء">
              <Input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className="num font-semibold" />
            </Field>
            <Field label="سعر البيع المقترح" hint={Number(f.retailPrice) > 0 && Number(f.price) > 0 ? <>ربح متوقع <Money value={Number(f.retailPrice) - Number(f.price)} /></> : undefined}>
              <Input type="number" value={f.retailPrice} onChange={(e) => setF({ ...f, retailPrice: e.target.value })} className="num" />
            </Field>
          </div>

          <CardHeader title="الفحص" />
          <div className="space-y-4 p-4">
            <Field label={`صحة البطارية: ${insp.batteryHealth}%`}>
              <input type="range" min={50} max={100} value={insp.batteryHealth} onChange={(e) => setInsp({ ...insp, batteryHealth: Number(e.target.value) })} className="w-full accent-[var(--brand)]" />
            </Field>
            <div>
              <span className="mb-1 block text-sm font-medium text-ink-2">الشاشة</span>
              <Segmented value={insp.screen} onChange={(v) => setInsp({ ...insp, screen: v })} options={[{ value: "excellent", label: "ممتازة" }, { value: "scratches", label: "خدوش" }, { value: "cracked", label: "مكسورة" }]} />
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-ink-2">البودي</span>
              <Segmented value={insp.body} onChange={(v) => setInsp({ ...insp, body: v })} options={[{ value: "excellent", label: "ممتاز" }, { value: "good", label: "كويس" }, { value: "worn", label: "مستهلك" }]} />
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={insp.hasBox} onChange={(e) => setInsp({ ...insp, hasBox: e.target.checked })} /> معاه العلبة</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={insp.hasCharger} onChange={(e) => setInsp({ ...insp, hasCharger: e.target.checked })} /> معاه الشاحن</label>
            </div>
            <Textarea rows={2} value={insp.notes} onChange={(e) => setInsp({ ...insp, notes: e.target.value })} placeholder="ملاحظات: فيس آيدي، كاميرا، سماعة…" />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="البائع" subtitle="بيانات البطاقة إجبارية لحماية المحل من الأجهزة المسروقة" />
            <div className="grid grid-cols-2 gap-3 p-4">
              <Field label="الاسم (زي البطاقة)" className="col-span-2">
                <Input value={f.seller.name} onChange={(e) => setF({ ...f, seller: { ...f.seller, name: e.target.value } })} />
              </Field>
              <Field label="التليفون">
                <Input type="tel" inputMode="tel" autoComplete="off" value={f.seller.phone} onChange={(e) => setF({ ...f, seller: { ...f.seller, phone: e.target.value } })} className="num" />
              </Field>
              <Field label="الرقم القومي">
                <Input inputMode="numeric" value={f.seller.nationalId} maxLength={14} onChange={(e) => setF({ ...f, seller: { ...f.seller, nationalId: e.target.value.replace(/\D/g, "") } })} className="num" />
              </Field>
              <div className="col-span-2 grid grid-cols-2 gap-2">
                {["صورة البطاقة (وش)", "صورة البطاقة (ضهر)"].map((d) => (
                  <button key={d} className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-xs text-ink-3 hover:border-brand hover:text-brand">
                    <Camera size={16} /> {d}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <div className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn">
            <ShieldAlert size={20} className="shrink-0" />
            <p>اتأكد إن الجهاز مش عليه iCloud / Google account، وإن البطاقة بتاعة الشخص اللي قدامك.</p>
          </div>

          <Button
            size="lg"
            className="w-full"
            disabled={!valid}
            onClick={() => {
              buyUsedPhone({ ...f, price: Number(f.price), retailPrice: Number(f.retailPrice), inspection: insp });
              setDone(true);
            }}
          >
            تأكيد الشراء ودفع {f.price ? <Money value={Number(f.price)} /> : ""} من الدرج
          </Button>
        </div>
      </div>
    </div>
  );
}
