import Link from "next/link";
import { LayoutDashboard, MonitorSmartphone } from "lucide-react";
import { ResetDemo } from "@/components/reset-demo";
import { SetupCard } from "@/components/setup-entry";
import { Logo } from "@/components/logo";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <Logo height={56} className="mx-auto mb-5 block" />
          <h1 className="text-3xl font-bold">موجه للموبايلات</h1>
          <p className="mt-2 text-ink-3">نظام إدارة المحل</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/pos/login"
            className="group rounded-2xl border border-border bg-surface p-6 transition hover:border-brand hover:shadow-md"
          >
            <MonitorSmartphone className="mb-4 text-brand" size={32} />
            <h2 className="text-xl font-semibold">نقطة البيع</h2>
            <p className="mt-1 text-sm text-ink-3">لابتوب المحل — بيع، مشتريات، أقساط، تقفيل الشيفت</p>
          </Link>
          <Link
            href="/admin"
            className="group rounded-2xl border border-border bg-surface p-6 transition hover:border-brand hover:shadow-md"
          >
            <LayoutDashboard className="mb-4 text-brand" size={32} />
            <h2 className="text-xl font-semibold">لوحة المالك</h2>
            <p className="mt-1 text-sm text-ink-3">موبايل الأيفون — أرباح، مخزون، فلوس، موظفين</p>
          </Link>
        </div>
        <SetupCard />
        <ResetDemo />
      </div>
    </main>
  );
}
