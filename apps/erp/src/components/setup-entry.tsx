"use client";

import { DatabaseZap } from "lucide-react";
import Link from "next/link";
import { cn, useHydrated } from "@/components/ui";
import { useStore } from "@/lib/store";

/** Start-page card for shop initialization; highlighted while the demo data is still loaded. */
export function SetupCard() {
  const hydrated = useHydrated();
  const isDemo = useStore((s) => s.isDemo);
  const demo = !hydrated || isDemo;
  return (
    <Link
      href="/setup"
      className={cn(
        "mt-4 flex items-center gap-4 rounded-2xl border p-5 transition hover:shadow-md",
        demo ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-brand",
      )}
    >
      <DatabaseZap className="shrink-0 text-brand" size={28} />
      <div>
        <h2 className="font-semibold">تهيئة المحل</h2>
        <p className="text-sm text-ink-3">
          {demo ? "السيستم شغال ببيانات تجريبية — دخّل البضاعة والأرصدة الحقيقية وابدأ التشغيل" : "إعادة إدخال البضاعة والأرصدة من الأول"}
        </p>
      </div>
    </Link>
  );
}

/** Small notice for the POS and the dashboard while demo data is loaded. */
export function DemoNotice({ className }: { className?: string }) {
  const isDemo = useStore((s) => s.isDemo);
  if (!isDemo) return null;
  return (
    <Link href="/setup" className={cn("block rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn hover:underline", className)}>
      بيانات تجريبية — اضغط لتهيئة المحل بالأرقام الحقيقية
    </Link>
  );
}
