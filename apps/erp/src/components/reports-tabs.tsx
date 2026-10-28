"use client";

import Link from "next/link";
import { cn } from "@/components/ui";

/** Sales reports or shifts — the two views of the owner's reports tab. */
export function ReportsTabs({ active }: { active: "sales" | "shifts" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={cn("rounded-md py-2 text-center text-sm font-medium transition", on ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink-2")}>
      {label}
    </Link>
  );
  return (
    <div className="mb-4 grid grid-cols-2 rounded-lg border border-border bg-surface-2 p-1">
      {tab("/admin/reports", "المبيعات", active === "sales")}
      {tab("/admin/reports/shifts", "الورديات", active === "shifts")}
    </div>
  );
}
