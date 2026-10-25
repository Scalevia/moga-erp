"use client";

import {
  ArrowLeftRight,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  HandCoins,
  Menu,
  PackagePlus,
  RotateCcw,
  Scale,
  ShoppingCart,
  Smartphone,
  UserRoundCog,
  Users,
  Wallet,
  Wifi,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo, LogoIcon } from "@/components/logo";
import { OpenDay } from "@/components/pos/open-day";
import { DemoNotice } from "@/components/setup-entry";
import { cn, useHydrated } from "@/components/ui";
import { balanceIds, time } from "@/lib/format";
import { currentShift, expectedCash, machineBalance, useStore, walletBalance } from "@/lib/store";
import type { Employee, Shift } from "@/lib/types";

const nav = [
  { href: "/pos", label: "بيع", icon: ShoppingCart },
  { href: "/pos/stock", label: "المخزون", icon: Boxes },
  { href: "/pos/customers", label: "العملاء", icon: Users },
  { href: "/pos/accounts", label: "الحسابات", icon: Scale },
  { href: "/pos/returns", label: "مرتجع", icon: RotateCcw },
  { href: "/pos/installments", label: "تحصيل أقساط", icon: CalendarClock },
  { href: "/pos/services", label: "فودافون كاش وفوري", icon: Wallet },
  { href: "/pos/used-phone", label: "شراء مستعمل", icon: Smartphone },
  { href: "/pos/purchases", label: "استلام بضاعة", icon: PackagePlus },
  { href: "/pos/finance", label: "مصروفات وحركات", icon: HandCoins },
  { href: "/pos/shift", label: "تقفيل الشيفت", icon: ClipboardCheck },
];

export default function PosShell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const pathname = usePathname();
  const employeeId = useStore((s) => s.currentEmployeeId);
  const employees = useStore((s) => s.staff);
  const shift = useStore(currentShift);
  const employee = employees.find((e) => e.id === employeeId);
  const logout = useStore((s) => s.logout);
  // One person works a shift: only whoever opened it — or the owner — can use the POS until it's closed.
  const blocked = !!shift && !!employee && employee.role !== "admin" && shift.employeeId !== employee.id;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);

  // Close the phone menu after navigating.
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!hydrated) return;
    if (blocked) logout();
    if (!employeeId || blocked) router.replace("/pos/login");
  }, [hydrated, employeeId, blocked, logout, router]);

  if (!hydrated || !employee || blocked) return null;
  const current = nav.find((n) => (n.href === "/pos" ? pathname === "/pos" : pathname.startsWith(n.href)));
  // Owner only: employees count the drawer, wallet and machines blind when opening and closing a shift.
  const showBalances = !!shift && employee.role === "admin";

  return (
    <div className="min-h-screen md:flex">
      {/* Laptop: fixed sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-e border-border bg-surface md:flex">
        <SidebarContent employee={employee} shift={shift} pathname={pathname} />
      </aside>

      {/* Phone: top bar + slide-in menu */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <LogoIcon size={32} />
            <div className="leading-tight">
              <div className="text-sm font-bold">{shift ? (current?.label ?? "موجه") : "موجه"}</div>
              <div className="text-[11px] text-ink-3">{employee.name}</div>
            </div>
          </div>
          <button onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2" aria-label="القائمة">
            <Menu size={22} />
          </button>
        </div>
        {showBalances && <BalancesBar shift={shift} className="border-t border-border" />}
      </header>
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85%] flex-col bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setMenuOpen(false)} className="absolute end-3 top-4 rounded-lg p-1.5 text-ink-3 hover:bg-surface-2" aria-label="إغلاق">
              <X size={18} />
            </button>
            <SidebarContent employee={employee} shift={shift} pathname={pathname} />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {showBalances && <BalancesBar shift={shift} className="sticky top-0 z-20 hidden border-b border-border bg-surface/95 backdrop-blur md:grid" />}
        <main className="p-4 md:p-6">{shift || pathname === "/pos/shift" ? children : <OpenDay />}</main>
      </div>
    </div>
  );
}

const barLabel = { fawry_airtime: "فوري Air time", fawry_general: "فوري عام", momkn: "ممكن" } as const;

/** What the system expects in the drawer, the Vodafone Cash wallet and each machine right now. */
function BalancesBar({ shift, className }: { shift: Shift; className?: string }) {
  const store = useStore();
  const items = [
    { label: "كاش الدرج", value: expectedCash(store, shift) },
    { label: "فودافون كاش", value: walletBalance(store) },
    ...balanceIds.map((id) => ({ label: barLabel[id], value: machineBalance(store, id) })),
  ];
  return (
    <div className={cn("grid grid-cols-5 divide-x divide-x-reverse divide-border", className)} title="حسب السيستم">
      {items.map((i) => (
        <div key={i.label} className="min-w-0 px-1 py-1.5 text-center md:py-2.5">
          <div className="truncate text-[10px] text-ink-3 md:text-xs">{i.label}</div>
          <div className={cn("num text-xs font-semibold md:text-base", i.value < 0 && "text-bad")}>{Math.round(i.value).toLocaleString("en")}</div>
        </div>
      ))}
    </div>
  );
}

function SidebarContent({ employee, shift, pathname }: { employee: Employee; shift?: Shift; pathname: string }) {
  const router = useRouter();
  const logout = useStore((s) => s.logout);
  return (
    <>
      <div className="flex items-center gap-2 px-5 py-4">
        <div>
          <Logo height={24} className="block" />
          <div className="mt-1.5 text-xs text-ink-3">الفرع الرئيسي</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/pos" ? pathname === "/pos" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2",
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        {employee.role === "admin" && <DemoNotice className="mb-2" />}
        <div className="mb-2 flex items-center gap-2 px-2 text-xs text-good">
          <Wifi size={14} /> متصل — كل العمليات متزامنة
        </div>
        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
          <div>
            <div className="text-sm font-semibold">{employee.name}</div>
            <div className="text-xs text-ink-3">{shift ? `شيفت مفتوح من ${time(shift.openedAt)}` : "لا يوجد شيفت مفتوح"}</div>
          </div>
          <button
            title="تبديل الموظف"
            onClick={() => {
              logout();
              router.push("/pos/login");
            }}
            className="rounded-md p-1.5 text-ink-3 hover:bg-border hover:text-ink"
          >
            <ArrowLeftRight size={16} />
          </button>
        </div>
        {employee.role === "admin" && (
          <Link href="/admin" className="mt-2 flex items-center gap-2 px-2 text-xs text-brand hover:underline">
            <UserRoundCog size={14} /> لوحة المالك
          </Link>
        )}
      </div>
    </>
  );
}
