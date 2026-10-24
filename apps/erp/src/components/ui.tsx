"use client";

import { Plus, Search, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { useStore } from "@/lib/store";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** True once the saved data has been loaded on this device (it loads asynchronously from IndexedDB). */
export function useHydrated() {
  return useSyncExternalStore(
    (onChange) => useStore.persist.onFinishHydration(onChange),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink hover:brightness-110 shadow-sm",
  secondary: "bg-surface text-ink border border-border hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2",
  danger: "bg-bad text-white hover:brightness-110",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-40 disabled:pointer-events-none",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-14 px-6 text-base",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 placeholder:text-ink-3";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "pe-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "h-auto py-2", className)} {...props} />;
}

export interface ComboItem {
  value: string;
  label: string;
  sub?: ReactNode;
}

/** Searchable picker; the last row offers to create a new entry from the typed text. */
export function Combobox({
  items,
  value,
  onChange,
  onCreate,
  createLabel,
  placeholder,
}: {
  items: ComboItem[];
  value: string;
  onChange: (value: string) => void;
  onCreate?: (query: string) => void;
  createLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = items.find((i) => i.value === value);
  const q = query.trim().toLowerCase();
  const matches = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;

  const pick = (v: string) => {
    onChange(v);
    setQuery("");
    setOpen(false);
  };
  const create = () => {
    onCreate?.(query.trim());
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        value={open ? query : (selected?.label ?? "")}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (matches[0]) pick(matches[0].value);
          else if (onCreate) create();
        }}
        placeholder={placeholder}
        className={cn(inputClass, "ps-9")}
      />
      {open && (
        <ul
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {matches.map((i) => (
            <li key={i.value}>
              <button
                type="button"
                onClick={() => pick(i.value)}
                className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm hover:bg-surface-2", i.value === value && "bg-brand-soft")}
              >
                <span>{i.label}</span>
                {i.sub && <span className="shrink-0 text-xs text-ink-3">{i.sub}</span>}
              </button>
            </li>
          ))}
          {matches.length === 0 && !onCreate && <li className="px-3 py-3 text-center text-sm text-ink-3">مفيش نتايج</li>}
          {onCreate && (
            <li className="border-t border-border">
              <button type="button" onClick={create} className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm font-medium text-brand hover:bg-brand-soft">
                <Plus size={16} /> {createLabel}
                {query.trim() && <span className="text-ink-2">«{query.trim()}»</span>}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

type Tone = "neutral" | "brand" | "good" | "warn" | "bad";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-border",
  brand: "bg-brand-soft text-brand border-brand/20",
  good: "bg-good-soft text-good border-good/20",
  warn: "bg-warn-soft text-warn border-warn/20",
  bad: "bg-bad-soft text-bad border-bad/20",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-surface shadow-xl", width)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2" aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-border bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      <span className="num">{new Intl.NumberFormat("en-EG", { maximumFractionDigits: 0 }).format(Math.round(value))}</span>
      <span className="ms-1 text-[0.8em] font-normal text-ink-3">ج.م</span>
    </span>
  );
}
