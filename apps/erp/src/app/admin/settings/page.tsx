"use client";

import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { machineIds, machineLabel } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { MachineId } from "@/lib/types";

export default function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const airtimeBonus = useStore((s) => s.bonusPercent.fawry_airtime);
  const updateSettings = useStore((s) => s.updateSettings);
  const setBonusPercent = useStore((s) => s.setBonusPercent);
  const savedServices = useStore((s) => s.services);
  const setServices = useStore((s) => s.setServices);
  const [services, setServiceList] = useState(savedServices);
  const editServices = (list: typeof services) => {
    setServiceList(list);
    setSaved(false);
  };
  function addService() {
    const n = Math.max(0, ...services.map((s) => Number(s.id.match(/^svc-n(\d+)$/)?.[1] ?? 0))) + 1;
    editServices([...services, { id: `svc-n${n}`, name: "" }]);
  }

  const [f, setF] = useState({
    shopName: settings.shopName,
    address: settings.address,
    phone: settings.phone,
    warranty: settings.warranty,
    usedWarrantyDays: String(settings.usedWarrantyDays),
    agentVfFeePercent: String(settings.agentVfFeePercent),
    employeeLendLimit: String(settings.employeeLendLimit),
    airtimeBonus: String(airtimeBonus),
  });
  const [saved, setSaved] = useState(false);
  const [agentPhones, setAgentPhones] = useState<Partial<Record<MachineId, string>>>(settings.agentPhones ?? {});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF({ ...f, [k]: e.target.value });
    setSaved(false);
  };

  const valid = f.shopName.trim() && Number(f.usedWarrantyDays) >= 0 && Number(f.agentVfFeePercent) >= 0 && Number(f.employeeLendLimit) >= 0 && Number(f.airtimeBonus) >= 0;

  function save() {
    updateSettings({
      shopName: f.shopName.trim(),
      address: f.address.trim(),
      phone: f.phone.trim(),
      warranty: f.warranty.trim(),
      usedWarrantyDays: Number(f.usedWarrantyDays) || 0,
      agentVfFeePercent: Number(f.agentVfFeePercent) || 0,
      employeeLendLimit: Number(f.employeeLendLimit) || 0,
      agentPhones: Object.fromEntries(machineIds.map((id) => [id, (agentPhones[id] ?? "").trim()])),
    });
    setBonusPercent("fawry_airtime", Number(f.airtimeBonus) || 0);
    const cleaned = services.map((s) => ({ ...s, name: s.name.trim() })).filter((s) => s.name);
    setServices(cleaned);
    setServiceList(cleaned);
    setSaved(true);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">الإعدادات</h1>

      <Card>
        <CardHeader title="بيانات المحل" subtitle="بتظهر في أول الفاتورة" />
        <div className="space-y-3 p-4">
          <Field label="اسم المحل">
            <Input value={f.shopName} onChange={set("shopName")} />
          </Field>
          <Field label="العنوان">
            <Input value={f.address} onChange={set("address")} />
          </Field>
          <Field label="التليفون">
            <Input value={f.phone} onChange={set("phone")} className="num" />
          </Field>
          <Field label="شروط الضمان" hint="بتتطبع في آخر الفاتورة">
            <Textarea rows={3} value={f.warranty} onChange={set("warranty")} />
          </Field>
          <Field label="مدة ضمان الموبايل المستعمل (أيام)" hint="بتظهر في صفحة العملاء: الجهاز لسه في الضمان ولا لأ">
            <Input type="number" value={f.usedWarrantyDays} onChange={set("usedWarrantyDays")} className="num" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="شكل الفاتورة" subtitle="معاينة سريعة لأول وآخر الفاتورة" />
        <div className="flex justify-center bg-surface-2 p-4">
          <div className="w-[302px] bg-white px-4 py-5 text-center text-[12px] leading-relaxed text-black shadow-sm">
            <Logo height={30} tone="black" className="mx-auto mb-1.5 block" />
            <div className="text-base font-bold">{f.shopName || "—"}</div>
            <div>{f.address}</div>
            <div className="num">{f.phone}</div>
            <div className="my-2 border-t border-dashed border-black" />
            <div className="py-3 text-[11px] text-gray-500">… الأصناف والإجمالي …</div>
            <div className="my-2 border-t border-dashed border-black" />
            <p className="text-[10.5px]">{f.warranty}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="الخدمات" subtitle="بتظهر في شاشة البيع — «أخرى» موجودة دايماً" />
        <div className="space-y-2 p-4">
          {services.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <Input
                value={s.name}
                onChange={(e) => editServices(services.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
                placeholder="اسم الخدمة"
                aria-label="اسم الخدمة"
              />
              <button
                onClick={() => editServices(services.filter((x) => x.id !== s.id))}
                className="shrink-0 rounded-lg p-2 text-ink-3 hover:bg-bad-soft hover:text-bad"
                aria-label={`حذف ${s.name}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={addService}>
            <Plus size={14} /> خدمة جديدة
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="أرقام المناديب" subtitle="بيظهر جنب كل مندوب زرار اتصال" />
        <div className="space-y-3 p-4">
          {machineIds.map((id) => (
            <Field key={id} label={`مندوب ${machineLabel[id]}`}>
              <Input
                value={agentPhones[id] ?? ""}
                onChange={(e) => {
                  setAgentPhones({ ...agentPhones, [id]: e.target.value });
                  setSaved(false);
                }}
                className="num"
                placeholder="01xxxxxxxxx"
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="النسب والحدود" />
        <div className="space-y-3 p-4">
          <Field label="بونص فوري على شحن Air time (%)" hint="بيتضاف تلقائي على رصيد Air time لما المندوب يشحن">
            <Input type="number" step="0.1" value={f.airtimeBonus} onChange={set("airtimeBonus")} className="num" />
          </Field>
          <Field label="رسوم تسييل المندوب لو اتدفعله فودافون كاش (%)">
            <Input type="number" step="0.1" value={f.agentVfFeePercent} onChange={set("agentVfFeePercent")} className="num" />
          </Field>
          <Field label="أقصى سلفة يدّيها الموظف لحد (ج.م)" hint="أكتر من كده المالك بس اللي يسجّلها">
            <Input type="number" value={f.employeeLendLimit} onChange={set("employeeLendLimit")} className="num" />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-20 z-10">
        <Button size="lg" className="w-full shadow-lg" disabled={!valid} onClick={save}>
          حفظ الإعدادات
        </Button>
        {saved && (
          <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-good-soft py-2 text-sm text-good">
            <CheckCircle2 size={16} /> اتحفظت
          </div>
        )}
      </div>
    </div>
  );
}
