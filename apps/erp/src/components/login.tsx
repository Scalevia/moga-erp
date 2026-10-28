"use client";

import { BarChart3, Boxes, Eye, EyeOff, LogIn, ShoppingCart, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { ResetDemo } from "@/components/reset-demo";
import { Button, Field, Input, useHydrated } from "@/components/ui";
import { time } from "@/lib/format";
import { currentShift, useStore } from "@/lib/store";

const features = [
  { icon: ShoppingCart, text: "بيع ومرتجع وتقسيط من شاشة واحدة" },
  { icon: Boxes, text: "المخزون بالـ IMEI والباركود" },
  { icon: Wallet, text: "الدرج والمحافظ والماكينات والحسابات" },
  { icon: BarChart3, text: "الأرباح والتقارير لحظة بلحظة" },
];

/**
 * The one way in: username and password. The owner lands on the dashboard, an employee on the POS.
 * In the prototype the check happens in the browser; with Supabase Auth it moves to the server.
 *
 * One person works a shift: while it's open, only whoever opened it — or the owner — can get in.
 * Anyone else takes over through a handover (close and count, then open and count).
 */
export function LoginScreen() {
  const router = useRouter();
  const hydrated = useHydrated();
  const login = useStore((s) => s.login);
  const staff = useStore((s) => s.staff);
  const isDemo = useStore((s) => s.isDemo);
  const shift = useStore(currentShift);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return null;
  const shiftHolder = shift ? staff.find((e) => e.id === shift.employeeId) : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const user = staff.find((x) => x.active && x.username.toLowerCase() === username.trim().toLowerCase());
    if (!user || user.password !== password) return setError("اسم المستخدم أو كلمة السر غلط");
    if (shift && shift.employeeId !== user.id && user.role !== "admin")
      return setError(`وردية ${shiftHolder?.name ?? "موظف تاني"} مفتوحة — لازم تتقفل ويتعدّ الدرج الأول (تسليم واستلام)`);
    login(user.id);
    router.push(user.role === "admin" ? "/admin" : "/pos");
  }

  return (
    <main className="grid min-h-screen bg-bg lg:grid-cols-2">
      {/* Right side (RTL): what this is */}
      <section className="flex flex-col justify-center bg-brand px-6 py-8 text-brand-ink sm:px-10 lg:px-14">
        <Logo height={40} tone="white" className="mb-6 block" />
        <h1 className="text-2xl font-bold sm:text-3xl">موجه للموبايلات</h1>
        <p className="mt-2 text-brand-ink/80">نظام إدارة المحل — كل حاجة في مكان واحد</p>
        <ul className="mt-8 hidden space-y-4 sm:block">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Icon size={20} />
              </span>
              <span className="text-brand-ink/90">{text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Left side: sign in */}
      <section className="flex items-center justify-center px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-2xl font-bold">تسجيل الدخول</h2>
          <p className="mt-1 text-sm text-ink-3">ادخل باسم المستخدم وكلمة السر بتوعك</p>

          {shift && (
            <div className="mt-5 rounded-lg bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn">
              وردية <b>{shiftHolder?.name ?? "موظف"}</b> مفتوحة من {time(shift.openedAt)} — هو والمالك بس اللي يقدروا يدخلوا لحد ما تتقفل.
            </div>
          )}

          <div className="mt-6 space-y-4">
            <Field label="اسم المستخدم">
              <Input
                autoFocus
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                autoCapitalize="none"
                autoComplete="username"
                dir="ltr"
                className="h-12 text-base"
              />
            </Field>
            <Field label="كلمة السر">
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  autoComplete="current-password"
                  dir="ltr"
                  className="h-12 pe-11 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-3 hover:text-ink"
                  aria-label={show ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
          </div>

          {error && <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

          <Button type="submit" size="lg" className="mt-6 w-full" disabled={!username.trim() || !password}>
            <LogIn size={18} /> دخول
          </Button>

          {isDemo && (
            <div className="mt-6 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-3">
              <div className="mb-1 font-medium">بيانات الدخول التجريبية</div>
              {staff
                .filter((x) => x.active)
                .map((x) => (
                  <div key={x.id} className="flex justify-between py-0.5">
                    <span>{x.name}</span>
                    <span className="num">
                      {x.username} / {x.password}
                    </span>
                  </div>
                ))}
            </div>
          )}
          <ResetDemo />
        </form>
      </section>
    </main>
  );
}
