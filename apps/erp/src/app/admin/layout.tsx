"use client";

import { Boxes, FileBarChart, Home, Landmark, LogOut, ScanSearch, Settings, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogoIcon } from "@/components/logo";
import { DemoNotice } from "@/components/setup-entry";
import { cn, useHydrated } from "@/components/ui";
import { signOut, useSession } from "@/lib/session";
import { useStore } from "@/lib/store";

const tabs = [
  { href: "/admin", label: "الرئيسية", icon: Home },
  { href: "/admin/reports", label: "التقارير", icon: FileBarChart },
  { href: "/admin/capital", label: "رأس المال", icon: Landmark },
  { href: "/admin/money", label: "الفلوس", icon: Wallet },
  { href: "/admin/inventory", label: "المخزون", icon: Boxes },
  { href: "/admin/staff", label: "الموظفين", icon: Users },
  { href: "/admin/imei", label: "IMEI", icon: ScanSearch },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const ready = useSession((s) => s.ready) && hydrated;
  // Owner only: anyone else (or nobody signed in) goes back to the login page.
  const isOwner = useStore((s) => s.staff.find((e) => e.id === s.currentEmployeeId)?.role === "admin");
  useEffect(() => {
    if (ready && !isOwner) router.replace("/");
  }, [ready, isOwner, router]);
  if (!ready || !isOwner) return null;
  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <LogoIcon size={32} />
          <span className="font-bold">موجه · لوحة المالك</span>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/pos" className="me-2 text-xs text-brand">
            نقطة البيع ←
          </Link>
          <Link href="/admin/settings" className={cn("rounded-lg p-2 hover:bg-surface-2", pathname.startsWith("/admin/settings") ? "text-brand" : "text-ink-2")} aria-label="الإعدادات">
            <Settings size={18} />
          </Link>
          <button
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
            className="rounded-lg p-2 text-ink-2 hover:bg-surface-2"
            aria-label="خروج"
            title="خروج"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main className="px-4 pt-4">
        <DemoNotice className="mb-3" />
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-2xl grid-cols-7">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium whitespace-nowrap", active ? "text-brand" : "text-ink-3")}>
                <Icon size={20} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
