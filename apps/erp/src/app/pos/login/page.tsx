"use client";

import { ChevronLeft, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Badge, cn, useHydrated } from "@/components/ui";
import { time } from "@/lib/format";
import { currentShift, useStore } from "@/lib/store";

/**
 * Who's working now? Picking a name is enough in the prototype — every sale, return and shift
 * is recorded under it. Real sign-in (with expiring sessions) comes with Supabase Auth.
 *
 * One person works a shift: while it's open, only whoever opened it — or the owner — can get in.
 * Anyone else takes over through a handover (close and count, then open and count).
 */
export default function EmployeePicker() {
  const router = useRouter();
  const hydrated = useHydrated();
  const login = useStore((s) => s.login);
  const staff = useStore((s) => s.staff);
  const shift = useStore(currentShift);
  const employees = staff.filter((e) => e.active); // deactivated employees don't appear
  const shiftHolder = shift ? staff.find((e) => e.id === shift.employeeId) : undefined;
  const allowed = (id: string, role: string) => !shift || id === shift.employeeId || role === "admin";

  if (!hydrated) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand/10 to-bg p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-8 shadow-lg">
        <div className="mb-6 text-center">
          <Logo height={36} className="mx-auto mb-5 block" />
          <h1 className="text-xl font-bold">مين شغال دلوقتي؟</h1>
          <p className="mt-1 text-sm text-ink-3">اختار اسمك — كل العمليات هتتسجل باسمك</p>
        </div>

        {shift && (
          <div className="mb-4 rounded-lg bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn">
            وردية <b>{shiftHolder?.name ?? "موظف"}</b> مفتوحة من {time(shift.openedAt)}. علشان موظف تاني يستلم، لازم الوردية تتقفل الأول ويتعدّ الدرج
            (تسليم واستلام). المالك بس يقدر يدخل وسط الوردية.
          </div>
        )}

        <ul className="space-y-2">
          {employees.map((e) => {
            const ok = allowed(e.id, e.role);
            return (
              <li key={e.id}>
                <button
                  disabled={!ok}
                  onClick={() => {
                    login(e.id);
                    router.push("/pos");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-start transition",
                    ok ? "hover:border-brand hover:bg-brand-soft" : "cursor-not-allowed opacity-45",
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-base font-semibold">{e.name.charAt(0)}</span>
                  <span className="flex-1 font-medium">{e.name}</span>
                  {shift && e.id === shift.employeeId && <Badge tone="good">ورديته مفتوحة</Badge>}
                  {e.role === "admin" && <Badge tone="brand">مالك</Badge>}
                  {ok ? <ChevronLeft size={18} className="text-ink-3" /> : <Lock size={16} className="text-ink-3" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
