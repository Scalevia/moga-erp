"use client";

import { CheckCircle2, Printer } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button, Modal } from "@/components/ui";
import { dateTime, num, paymentLabel } from "@/lib/format";
import { orderDiscount, orderTotal, useStore } from "@/lib/store";
import type { Order } from "@/lib/types";

export function ReceiptModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  return (
    <Modal open={!!order} onClose={onClose} title="تم البيع" width="max-w-md">
      {order && (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-good-soft px-4 py-3 text-sm font-medium text-good">
            <CheckCircle2 size={18} /> فاتورة #{order.number} اتسجلت
          </div>
          <div className="flex justify-center bg-surface-2 py-4">
            <Receipt order={order} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" size="lg" onClick={() => window.print()}>
              <Printer size={18} /> طباعة
            </Button>
            <Button variant="secondary" size="lg" onClick={onClose}>
              بيعة جديدة
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function Receipt({ order }: { order: Order }) {
  const contacts = useStore((s) => s.contacts);
  const employees = useStore((s) => s.staff);
  const shop = useStore((s) => s.settings);
  const plans = useStore((s) => s.plans);
  const customer = contacts.find((c) => c.id === order.customerId);
  const cashier = employees.find((e) => e.id === order.employeeId);
  const plan = plans.find((p) => p.id === order.installmentPlanId);
  const total = orderTotal(order);
  const discount = orderDiscount(order);

  return (
    <div className="print-area w-[302px] bg-white px-4 py-5 text-[12px] leading-relaxed text-black shadow-sm">
      <div className="text-center">
        <Logo height={30} tone="black" className="mx-auto mb-1.5 block" />
        <div className="text-base font-bold">{shop.shopName}</div>
        <div>{shop.address}</div>
        <div className="num">{shop.phone}</div>
      </div>
      <Divider />
      <div className="flex justify-between">
        <span>فاتورة رقم</span>
        <span className="num">#{order.number}</span>
      </div>
      <div className="flex justify-between">
        <span>التاريخ</span>
        <span>{dateTime(order.createdAt)}</span>
      </div>
      <div className="flex justify-between">
        <span>الكاشير</span>
        <span>{cashier?.name}</span>
      </div>
      {customer && (
        <div className="flex justify-between">
          <span>العميل</span>
          <span>
            {customer.name} · <span className="num">{customer.phone}</span>
          </span>
        </div>
      )}
      <Divider />
      {order.items.map((i, k) => (
        <div key={k} className="mb-1.5">
          <div className="flex justify-between gap-2">
            <span>
              {i.qty > 1 && <span className="num">{i.qty}× </span>}
              {i.name}
            </span>
            <span className="num shrink-0">{num(i.qty * (i.listPrice ?? i.unitPrice))}</span>
          </div>
          {i.imei && <div className="num text-[11px]">IMEI: {i.imei}</div>}
          {i.note && <div className="text-[11px]">{i.note}</div>}
        </div>
      ))}
      <Divider />
      {discount > 0 && (
        <>
          <div className="flex justify-between">
            <span>المجموع</span>
            <span className="num">{num(total - (order.extra ?? 0) + discount)}</span>
          </div>
          <div className="flex justify-between">
            <span>الخصم</span>
            <span className="num">− {num(discount)}</span>
          </div>
        </>
      )}
      {order.extra ? (
        <div className="flex justify-between">
          <span>زيادة من الزبون</span>
          <span className="num">+ {num(order.extra)}</span>
        </div>
      ) : null}
      <div className="flex justify-between text-sm font-bold">
        <span>الإجمالي</span>
        <span className="num">{num(total)} ج.م</span>
      </div>
      {order.payments.map((p, k) => (
        <div key={k} className="flex justify-between">
          <span>{p.method === "installment" ? "متبقي بالتقسيط" : paymentLabel[p.method]}</span>
          <span className="num">{num(p.amount)}</span>
        </div>
      ))}
      {plan && (
        <>
          <Divider />
          <div className="font-bold">خطة التقسيط</div>
          <div className="flex justify-between">
            <span>عدد الأقساط</span>
            <span className="num">{plan.months}</span>
          </div>
          <div className="flex justify-between">
            <span>القسط الشهري</span>
            <span className="num">{num(plan.schedule[0].amount)} ج.م</span>
          </div>
        </>
      )}
      <Divider />
      <p className="text-center text-[10.5px]">{shop.warranty}</p>
      <p className="mt-2 text-center">شكراً لزيارتكم ❤</p>
    </div>
  );
}

function Divider() {
  return <div className="my-2 border-t border-dashed border-black" />;
}
