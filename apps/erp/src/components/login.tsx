"use client";

import type { AuthError } from "@supabase/supabase-js";
import { BarChart3, Boxes, Eye, EyeOff, KeyRound, LogIn, ShoppingCart, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { ResetDemo } from "@/components/reset-demo";
import { Button, Field, Input, useHydrated } from "@/components/ui";
import { time } from "@/lib/format";
import { clearNotice, readNotice, staffAccounts, startSession, useSession } from "@/lib/session";
import { currentShift, useStore } from "@/lib/store";
import { getSupabase, isLive, loginEmail } from "@/lib/supabase";

const features = [
  { icon: ShoppingCart, text: "بيع ومرتجع وتقسيط من شاشة واحدة" },
  { icon: Boxes, text: "المخزون بالـ IMEI والباركود" },
  { icon: Wallet, text: "الدرج والمحافظ والماكينات والحسابات" },
  { icon: BarChart3, text: "الأرباح والتقارير لحظة بلحظة" },
];

/**
 * The one way in: username and password. The owner lands on the dashboard, an employee on the POS.
 * With real accounts Supabase Auth checks them; in the demo the browser does.
 *
 * One person works a shift: while it's open, only whoever opened it — or the owner — can get in.
 * Anyone else takes over through a handover (close and count, then open and count).
 */
export function LoginScreen() {
  const hydrated = useHydrated();
  const ready = useSession((s) => s.ready);
  if (!hydrated || !ready) return null;

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
      <section className="flex items-center justify-center px-6 py-10">{isLive ? <LiveSignIn /> : <DemoSignIn />}</section>
    </main>
  );
}

function UsernameInput({ value, onChange, autoFocus = true }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoCapitalize="none"
      autoComplete="username"
      dir="ltr"
      className="h-12 text-base"
    />
  );
}

function PasswordInput({ value, onChange, autoComplete = "current-password" }: { value: string; onChange: (v: string) => void; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
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
  );
}

function ErrorLine({ text }: { text: string | null }) {
  return text ? <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{text}</p> : null;
}

// ---------------------------------------------------------------- demo: checked in the browser

function DemoSignIn() {
  const router = useRouter();
  const login = useStore((s) => s.login);
  const staff = useStore((s) => s.staff);
  const isDemo = useStore((s) => s.isDemo);
  const shift = useStore(currentShift);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

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
          <UsernameInput
            value={username}
            onChange={(v) => {
              setUsername(v);
              setError(null);
            }}
          />
        </Field>
        <Field label="كلمة السر">
          <PasswordInput
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError(null);
            }}
          />
        </Field>
      </div>

      <ErrorLine text={error} />

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
  );
}

// ---------------------------------------------------------------- real accounts: Supabase Auth

/** What a refused sign-in means for the person typing. */
function signInMessage(error: AuthError) {
  if (error.code === "invalid_credentials") return "اسم المستخدم أو كلمة السر غلط";
  if (error.status === 429 || error.code === "over_request_rate_limit") return "محاولات كتير ورا بعض — استنى دقيقة وجرّب تاني";
  if (!error.status) return "مفيش اتصال بالإنترنت — جرّب تاني";
  return "حصلت مشكلة — جرّب تاني";
}

/** Signs in, then lets the staff member in if they may come in; returns why not. */
async function signIn(username: string, password: string) {
  const { data, error } = await getSupabase()!.auth.signInWithPassword({ email: loginEmail(username), password });
  return error ? signInMessage(error) : startSession(data.user.id);
}

function LiveSignIn() {
  const router = useRouter();
  const me = useStore((s) => s.staff.find((e) => e.id === s.currentEmployeeId));
  // Until the owner's account exists, the page offers to create it (once).
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null);
  // Why the app signed someone out, if it did (the idle lock, a stopped account).
  const [notice] = useState(readNotice);

  useEffect(() => clearNotice(), []);
  useEffect(() => {
    if (me) router.replace(me.role === "admin" ? "/admin" : "/pos");
  }, [me, router]);
  useEffect(() => {
    getSupabase()!
      .rpc("owner_setup_needed")
      .then(({ data, error }) => setSetupNeeded(!error && data === true));
  }, []);

  if (me || setupNeeded === null) return null;
  return setupNeeded ? <OwnerSetup /> : <SignInForm notice={notice} />;
}

function SignInForm({ notice }: { notice: string | null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const problem = await signIn(username, password);
    setBusy(false);
    if (problem) setError(problem); // otherwise the page moves on to the dashboard or the POS
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <h2 className="text-2xl font-bold">تسجيل الدخول</h2>
      <p className="mt-1 text-sm text-ink-3">ادخل باسم المستخدم وكلمة السر بتوعك</p>

      {notice && <div className="mt-5 rounded-lg bg-warn-soft px-3 py-2.5 text-xs leading-relaxed text-warn">{notice}</div>}

      <div className="mt-6 space-y-4">
        <Field label="اسم المستخدم">
          <UsernameInput
            value={username}
            onChange={(v) => {
              setUsername(v);
              setError(null);
            }}
          />
        </Field>
        <Field label="كلمة السر">
          <PasswordInput
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError(null);
            }}
          />
        </Field>
      </div>

      <ErrorLine text={error} />

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy || !username.trim() || !password}>
        <LogIn size={18} /> {busy ? "لحظة…" : "دخول"}
      </Button>
    </form>
  );
}

/** The shop's first account, the owner's: needs the one-time code, then signs straight in. */
function OwnerSetup() {
  const [f, setF] = useState({ code: "", name: "", username: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => {
    setF({ ...f, [k]: v });
    setError(null);
  };

  const user = f.username.trim().toLowerCase();
  const userOk = /^[a-z0-9._-]{2,32}$/.test(user);
  const mismatch = f.confirm !== "" && f.confirm !== f.password;
  const valid = f.code.trim() !== "" && f.name.trim() !== "" && userOk && f.password.length >= 6 && f.password === f.confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const made = await staffAccounts({ action: "setup_owner", code: f.code, name: f.name.trim(), username: user, password: f.password });
    const problem = made.error ?? (await signIn(user, f.password));
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <h2 className="flex items-center gap-2 text-2xl font-bold">
        <KeyRound size={22} className="text-brand" /> أول مرة: حساب المالك
      </h2>
      <p className="mt-1 text-sm text-ink-3">اكتب كود التفعيل اللي معاك، واختار اسم المستخدم وكلمة السر بتوعك. الخطوة دي بتتعمل مرة واحدة بس.</p>

      <div className="mt-6 space-y-4">
        <Field label="كود التفعيل">
          <Input autoFocus value={f.code} onChange={(e) => set("code")(e.target.value)} inputMode="numeric" autoComplete="off" dir="ltr" className="num h-12 text-base" />
        </Field>
        <Field label="اسمك">
          <Input value={f.name} onChange={(e) => set("name")(e.target.value)} className="h-12 text-base" />
        </Field>
        <Field
          label="اسم المستخدم"
          hint={f.username && !userOk ? <span className="text-bad">حروف إنجليزي وأرقام بس، من 2 لـ 32</span> : "حروف إنجليزي وأرقام — بيه هتدخل كل مرة"}
        >
          <UsernameInput value={f.username} onChange={(v) => set("username")(v.replace(/\s/g, ""))} autoFocus={false} />
        </Field>
        <Field label="كلمة السر" hint="6 حروف أو أرقام على الأقل">
          <PasswordInput value={f.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        <Field label="اكتب كلمة السر تاني" hint={mismatch ? <span className="text-bad">مش زي اللي فوق</span> : undefined}>
          <PasswordInput value={f.confirm} onChange={set("confirm")} autoComplete="new-password" />
        </Field>
      </div>

      <ErrorLine text={error} />

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy || !valid}>
        <KeyRound size={18} /> {busy ? "لحظة…" : "اعمل الحساب وادخل"}
      </Button>
    </form>
  );
}
