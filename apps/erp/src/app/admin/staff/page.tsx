"use client";

import { Banknote, ChevronLeft, ChevronRight, Pencil, Plus, Power, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Money, Segmented, cn } from "@/components/ui";
import { monthKey } from "@/lib/analytics";
import { dateTime } from "@/lib/format";
import { currentShift, orderProfit, orderTotal, outstandingAdvances, useStore } from "@/lib/store";
import type { Employee, Role } from "@/lib/types";

const monthFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" });
const shiftMonth = (month: string, by: number) => {
  const d = new Date(`${month}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
const viaLabel = { cash: "كاش من الدرج", wallet: "فودافون كاش", bank: "إنستاباي" } as const;

export default function StaffPage() {
  const store = useStore();
  const { staff } = store;
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ emp: Employee; action: "deactivate" | "delete" } | null>(null);

  const activeAdmins = staff.filter((e) => e.role === "admin" && e.active).length;
  const hasRecords = (id: string) =>
    store.orders.some((o) => o.employeeId === id) ||
    store.movements.some((m) => m.employeeId === id || m.targetEmployeeId === id) ||
    store.shifts.some((s) => s.employeeId === id) ||
    store.payroll.some((p) => p.employeeId === id);

  const sorted = [...staff].sort((a, b) => Number(b.active) - Number(a.active) || (a.role === "admin" ? -1 : 1));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="الموظفين"
          subtitle="الموظف المتوقف مش بيقدر يدخل، وتاريخه بيفضل في التقارير"
          action={
            <Button size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setEditing("new")}>
              <UserPlus size={14} /> موظف جديد
            </Button>
          }
        />
        <ul className="divide-y divide-border">
          {sorted.map((e) => {
            const lastAdmin = e.role === "admin" && e.active && activeAdmins === 1;
            return (
              <li key={e.id} className={cn("px-4 py-3", !e.active && "bg-surface-2")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold", e.active ? "bg-brand-soft text-brand" : "bg-border text-ink-3")}>
                      {e.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className={cn("font-semibold", !e.active && "text-ink-3")}>{e.name}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                        {e.role === "admin" ? <Badge tone="brand">مالك</Badge> : <Badge>موظف</Badge>}
                        {!e.active && <Badge tone="bad">متوقف</Badge>}
                        {e.phone && <span className="num">{e.phone}</span>}
                        {e.salary > 0 && (
                          <span>
                            مرتب <Money value={e.salary} />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <SmallAction onClick={() => setEditing(e)} icon={<Pencil size={13} />}>
                    تعديل
                  </SmallAction>
                  {e.active ? (
                    <SmallAction onClick={() => setConfirm({ emp: e, action: "deactivate" })} icon={<Power size={13} />} disabled={lastAdmin} title={lastAdmin ? "لازم يفضل مالك واحد على الأقل" : undefined}>
                      إيقاف
                    </SmallAction>
                  ) : (
                    <SmallAction onClick={() => store.updateEmployee(e.id, { active: true })} icon={<Power size={13} />}>
                      إعادة تفعيل
                    </SmallAction>
                  )}
                  {!hasRecords(e.id) && !lastAdmin && (
                    <SmallAction onClick={() => setConfirm({ emp: e, action: "delete" })} icon={<Trash2 size={13} />} danger>
                      حذف
                    </SmallAction>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Payroll />
      <Performance />
      <RecentShifts />

      {editing && <EmployeeForm employee={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {confirm && (
        <Modal open onClose={() => setConfirm(null)} title={confirm.action === "delete" ? "حذف موظف" : "إيقاف موظف"} width="max-w-sm">
          <p className="mb-4 text-sm">
            {confirm.action === "delete"
              ? `${confirm.emp.name} ما سجّلش أي عملية، فهيتمسح نهائي.`
              : `${confirm.emp.name} مش هيظهر تاني في قايمة الموظفين عند فتح نقطة البيع، بس كل عملياته هتفضل في التقارير. تقدر ترجّعه في أي وقت.`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                if (confirm.action === "delete") store.deleteEmployee(confirm.emp.id);
                else store.updateEmployee(confirm.emp.id, { active: false });
                setConfirm(null);
              }}
            >
              {confirm.action === "delete" ? "حذف" : "إيقاف"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              رجوع
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SmallAction({
  children,
  icon,
  onClick,
  disabled,
  danger,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40",
        danger ? "border-bad/30 text-bad hover:bg-bad-soft" : "border-border text-ink-2 hover:bg-surface-2",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function EmployeeForm({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const staff = useStore((s) => s.staff);
  const addEmployee = useStore((s) => s.addEmployee);
  const updateEmployee = useStore((s) => s.updateEmployee);
  const [name, setName] = useState(employee?.name ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [role, setRole] = useState<Role>(employee?.role ?? "employee");
  const [salary, setSalary] = useState(employee ? String(employee.salary) : "");

  const lastAdmin = employee?.role === "admin" && employee.active && staff.filter((e) => e.role === "admin" && e.active).length === 1;
  const valid = name.trim().length > 0;

  return (
    <Modal open onClose={onClose} title={employee ? `تعديل ${employee.name}` : "موظف جديد"} width="max-w-sm">
      <div className="space-y-3">
        <Field label="الاسم">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="التليفون">
          <Input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} className="num" placeholder="01xxxxxxxxx" />
        </Field>
        <div>
          <span className="mb-1 block text-sm font-medium text-ink-2">الصلاحية</span>
          <Segmented
            value={role}
            onChange={(v) => !lastAdmin && setRole(v)}
            options={[
              { value: "employee", label: "موظف" },
              { value: "admin", label: "مالك (كل الصلاحيات)" },
            ]}
          />
          {lastAdmin && <p className="mt-1 text-xs text-ink-3">ده المالك الوحيد — لازم يفضل مالك</p>}
        </div>
        <Field label="المرتب الشهري">
          <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} className="num" placeholder="0" />
        </Field>
        <Button
          className="w-full"
          disabled={!valid}
          onClick={() => {
            const data = { name: name.trim(), phone: phone.trim() || undefined, role, salary: Number(salary) || 0 };
            if (employee) updateEmployee(employee.id, data);
            else addEmployee(data);
            onClose();
          }}
        >
          {employee ? "حفظ" : <><Plus size={16} /> إضافة الموظف</>}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- payroll

function Payroll() {
  const store = useStore();
  const [month, setMonth] = useState(() => monthKey(new Date().toISOString()));
  const [paying, setPaying] = useState<Employee | null>(null);
  const thisMonth = monthKey(new Date().toISOString());
  const payable = store.staff.filter((e) => e.salary > 0 && (e.active || store.payroll.some((p) => p.employeeId === e.id && p.month === month)));
  const entries = store.payroll.filter((p) => p.month === month);
  const total = payable.reduce((a, e) => a + (entries.find((p) => p.employeeId === e.id)?.net ?? e.salary - Math.min(e.salary, outstandingAdvances(store, e.id))), 0);

  return (
    <Card>
      <CardHeader title="المرتبات" subtitle="السُّلف بتتخصم من المرتب تلقائي" />
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg p-1.5 hover:bg-surface-2" aria-label="الشهر اللي فات">
          <ChevronRight size={18} />
        </button>
        <span className="text-sm font-semibold">{monthFmt.format(new Date(`${month}-15T12:00:00Z`))}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth} className="rounded-lg p-1.5 hover:bg-surface-2 disabled:opacity-30" aria-label="الشهر الجاي">
          <ChevronLeft size={18} />
        </button>
      </div>
      <ul className="divide-y divide-border">
        {payable.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-3">مفيش موظفين ليهم مرتب — حدّد المرتب من «تعديل»</li>}
        {payable.map((e) => {
          const paid = entries.find((p) => p.employeeId === e.id);
          const adv = paid ? paid.advances : Math.min(e.salary, outstandingAdvances(store, e.id));
          const net = paid ? paid.net : e.salary - adv;
          return (
            <li key={e.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-ink-3">
                    مرتب <Money value={paid?.salary ?? e.salary} />
                    {adv > 0 && (
                      <span className="text-warn">
                        {" "}
                        − سُلف <Money value={adv} />
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-end">
                  <Money value={net} className="font-bold" />
                  <div className="mt-0.5">
                    {paid ? (
                      <Badge tone="good">اتصرف · {viaLabel[paid.via]}</Badge>
                    ) : (
                      <Button size="sm" onClick={() => setPaying(e)}>
                        <Banknote size={14} /> صرف
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {payable.length > 0 && (
        <div className="flex justify-between border-t border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold">
          <span>إجمالي المرتبات</span>
          <Money value={total} />
        </div>
      )}
      {paying && <PaySalary employee={paying} month={month} onClose={() => setPaying(null)} />}
    </Card>
  );
}

function PaySalary({ employee, month, onClose }: { employee: Employee; month: string; onClose: () => void }) {
  const store = useStore();
  const shift = currentShift(store);
  const [via, setVia] = useState<"cash" | "wallet" | "bank">(shift ? "cash" : "wallet");
  const adv = Math.min(employee.salary, outstandingAdvances(store, employee.id));
  const net = employee.salary - adv;

  return (
    <Modal open onClose={onClose} title={`صرف مرتب ${employee.name}`} width="max-w-sm">
      <dl className="mb-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-2">المرتب</dt>
          <dd>
            <Money value={employee.salary} />
          </dd>
        </div>
        <div className="flex justify-between text-warn">
          <dt>سُلف هتتخصم</dt>
          <dd>
            − <Money value={adv} />
          </dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 font-bold">
          <dt>هيقبض</dt>
          <dd>
            <Money value={net} />
          </dd>
        </div>
      </dl>
      <span className="mb-1 block text-sm font-medium text-ink-2">هيتصرف منين؟</span>
      <Segmented
        value={via}
        onChange={(v) => (v !== "cash" || shift) && setVia(v)}
        options={[
          { value: "cash", label: "كاش من الدرج" },
          { value: "wallet", label: "فودافون كاش" },
          { value: "bank", label: "إنستاباي" },
        ]}
      />
      {!shift && <p className="mt-1 text-xs text-ink-3">الكاش من الدرج محتاج شيفت مفتوح</p>}
      <Button
        className="mt-4 w-full"
        disabled={via === "cash" && !shift}
        onClick={() => {
          store.paySalary({ employeeId: employee.id, month, via });
          onClose();
        }}
      >
        تأكيد صرف <Money value={net} />
      </Button>
    </Modal>
  );
}

// ---------------------------------------------------------------- performance

function Performance() {
  const { orders, movements, shifts, staff } = useStore();
  const [period, setPeriod] = useState<"month" | "all">("month");
  const thisMonth = monthKey(new Date().toISOString());

  const rows = staff
    .filter((e) => e.role === "employee")
    .map((e) => {
      const mine = orders.filter((o) => o.employeeId === e.id && o.status === "completed" && (period === "all" || monthKey(o.createdAt) === thisMonth));
      const advances = movements
        .filter((m) => m.kind === "employee_advance" && m.targetEmployeeId === e.id && (period === "all" || monthKey(m.createdAt) === thisMonth))
        .reduce((a, m) => a - m.cash - m.wallet, 0);
      const myShifts = shifts.filter((s) => s.employeeId === e.id && s.closedAt);
      const shortage = myShifts.reduce((a, s) => a + Math.min(0, (s.countedCash ?? 0) - (s.expectedCash ?? 0)), 0);
      return {
        e,
        count: mine.length,
        revenue: mine.reduce((a, o) => a + orderTotal(o), 0),
        profit: mine.reduce((a, o) => a + orderProfit(o), 0),
        advances,
        shortage: -shortage,
        shifts: myShifts,
      };
    })
    .filter((r) => r.e.active || r.count > 0);

  return (
    <>
      <div className="flex items-center justify-between pt-2">
        <h2 className="font-semibold">الأداء</h2>
        <Segmented value={period} onChange={setPeriod} options={[{ value: "month", label: "الشهر ده" }, { value: "all", label: "من الأول" }]} />
      </div>
      {rows.map((s) => (
        <Card key={s.e.id} className="p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold">
            {s.e.name}
            {!s.e.active && <Badge tone="bad">متوقف</Badge>}
          </div>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="فواتير" value={<span className="num">{s.count}</span>} />
            <Stat label="مبيعات" value={<Money value={s.revenue} />} />
            <Stat label="ربح" value={<Money value={s.profit} />} />
            <Stat label="سُلف" value={<Money value={s.advances} />} />
            <Stat label="عجز شيفتات" value={<Money value={s.shortage} className={s.shortage ? "text-bad" : ""} />} />
            <Stat label="شيفتات مقفولة" value={<span className="num">{s.shifts.length}</span>} />
          </dl>
        </Card>
      ))}
    </>
  );
}

function RecentShifts() {
  const { shifts, staff } = useStore();
  const closed = shifts.filter((s) => s.closedAt).slice(-10).reverse();
  return (
    <Card>
      <CardHeader title="آخر تقفيلات الشيفت" />
      <ul className="divide-y divide-border">
        {closed.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-3">لسه مفيش شيفتات مقفولة — جرّب تقفّل شيفت من نقطة البيع</li>}
        {closed.map((sh) => {
          const diff = (sh.countedCash ?? 0) - (sh.expectedCash ?? 0);
          return (
            <li key={sh.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{staff.find((e) => e.id === sh.employeeId)?.name}</div>
                <div className="text-xs text-ink-3">{dateTime(sh.closedAt!)}</div>
              </div>
              {diff === 0 ? <Badge tone="good">مظبوط</Badge> : <Badge tone={diff < 0 ? "bad" : "warn"}>{diff < 0 ? "عجز" : "زيادة"} <Money value={Math.abs(diff)} /></Badge>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
