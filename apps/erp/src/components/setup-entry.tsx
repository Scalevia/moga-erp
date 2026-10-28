"use client";

import Link from "next/link";
import { cn } from "@/components/ui";
import { useStore } from "@/lib/store";

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
