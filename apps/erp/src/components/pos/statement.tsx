"use client";

import { Phone } from "lucide-react";
import { cn } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { useStore } from "@/lib/store";

/** Round call button — the number itself isn't shown, tapping dials it. */
export function CallButton({ phone, name, className }: { phone?: string; name: string; className?: string }) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone}`}
      onClick={(e) => e.stopPropagation()}
      aria-label={`اتصال بـ ${name}`}
      title="اتصال"
      className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand transition hover:bg-brand hover:text-brand-ink", className)}
    >
      <Phone size={16} />
    </a>
  );
}

export interface Line {
  key: string;
  at: string; // "" when the date isn't known (balances from before the system)
  label: string;
  change: number;
  by?: string;
  via?: "cash" | "wallet" | "bank";
  note?: string;
}

const viaLabel = { cash: "كاش", wallet: "فودافون كاش", bank: "إنستاباي" } as const;

/**
 * A dated statement, newest first, with the balance after each line.
 * `describe` words a balance ("عليه 200", "ليه 500"…); `upIsGood` colors increases green.
 */
export function Statement({ lines, describe, upIsGood, legend }: { lines: Line[]; describe: (balance: number) => string; upIsGood: boolean; legend?: string }) {
  const staff = useStore((s) => s.staff);
  const ordered = [...lines].sort((a, b) => a.at.localeCompare(b.at));
  const withBalance = ordered.map((l, i) => ({ ...l, balance: ordered.slice(0, i + 1).reduce((s, x) => s + x.change, 0) }));
  const name = (id?: string) => staff.find((e) => e.id === id)?.name;

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-ink-2">كشف الحساب</div>
      {withBalance.length === 0 ? (
        <div className="rounded-lg border border-border px-3 py-6 text-center text-sm text-ink-3">مفيش حركات لسه</div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {withBalance.reverse().map((l) => (
            <li key={l.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="font-medium">{l.label}</div>
                <div className="text-xs text-ink-3">
                  {l.at ? dateTime(l.at) : "قبل السيستم"}
                  {name(l.by) && ` · ${name(l.by)}`}
                  {l.via && ` · ${viaLabel[l.via]}`}
                </div>
                {l.note && <div className="text-xs text-ink-2">{l.note}</div>}
              </div>
              <div className="shrink-0 text-end">
                <span className={cn("num font-semibold", l.change > 0 === upIsGood ? "text-good" : "text-bad")}>
                  {l.change > 0 ? "+" : "−"}
                  {Math.abs(Math.round(l.change)).toLocaleString("en")}
                </span>
                <div className="text-[11px] text-ink-3">{describe(Math.round(l.balance))}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {legend && <p className="mt-1.5 text-[11px] text-ink-3">{legend}</p>}
    </div>
  );
}
