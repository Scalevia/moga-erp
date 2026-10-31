"use client";

// Signing in with real accounts (Supabase Auth): who is signed in, the staff list, the staff-accounts
// Edge Function, and signing out. In the demo none of this talks to a server.

import { create } from "zustand";
import { useStore } from "./store";
import { getSupabase, isLive } from "./supabase";
import type { Employee, Role } from "./types";

/** Whether the app knows yet who is signed in (always, in the demo). Pages wait for it. */
export const useSession = create<{ ready: boolean }>(() => ({ ready: !isLive }));

/** A line for the sign-in page after the app signed someone out (the idle lock, a stopped account). */
const NOTICE_KEY = "moga-signin-notice";

export function leaveNotice(text: string) {
  try {
    sessionStorage.setItem(NOTICE_KEY, text);
  } catch {
    // storage blocked: the sign-in page just won't say why
  }
}

export function readNotice(): string | null {
  try {
    return sessionStorage.getItem(NOTICE_KEY);
  } catch {
    return null;
  }
}

export function clearNotice() {
  try {
    sessionStorage.removeItem(NOTICE_KEY);
  } catch {
    // nothing to clear
  }
}

interface StaffRow {
  id: string;
  name: string;
  role: Role;
  phone: string | null;
  username: string;
  active: boolean;
}

/** The staff list from the database. Salaries aren't in it; the owner gets them separately. */
export async function loadStaff(owner: boolean) {
  const sb = getSupabase()!;
  const { data, error } = await sb.from("staff").select("id, name, role, phone, username, active").order("created_at");
  if (error) throw error;
  const salaries = new Map<string, number>();
  if (owner) {
    const { data: rows } = await sb.rpc("staff_salaries");
    for (const r of (rows ?? []) as { staff_id: string; salary: number }[]) salaries.set(r.staff_id, Number(r.salary));
  }
  useStore.getState().setStaff(
    (data as StaffRow[]).map(
      (e): Employee => ({
        id: e.id,
        name: e.name,
        role: e.role,
        phone: e.phone ?? undefined,
        salary: salaries.get(e.id) ?? 0,
        active: e.active,
        username: e.username,
        password: "", // kept by Supabase Auth, never in the app
      }),
    ),
  );
}

/**
 * After signing in, or when the app opens already signed in: the staff member behind the account, if they
 * may come in. Returns why not: a stopped account, or someone else's shift open (one person works a
 * shift; while it's open only whoever opened it, or the owner, can get in).
 */
export async function startSession(userId: string): Promise<string | null> {
  const sb = getSupabase()!;
  const { data: me, error } = await sb.from("staff").select("id, role").eq("auth_user_id", userId).maybeSingle();
  if (error) return "مفيش اتصال بالسيرفر — جرّب تاني";
  if (!me) {
    await sb.auth.signOut({ scope: "local" });
    return "الحساب ده متوقف — كلّم المالك";
  }
  const { data: open } = await sb.from("shifts").select("employee_id").is("closed_at", null).maybeSingle();
  if (open && open.employee_id !== me.id && me.role !== "admin") {
    const { data: holder } = await sb.from("staff").select("name").eq("id", open.employee_id).maybeSingle();
    await sb.auth.signOut({ scope: "local" });
    return `وردية ${holder?.name ?? "موظف تاني"} مفتوحة — لازم تتقفل ويتعدّ الدرج الأول (تسليم واستلام)`;
  }
  try {
    await loadStaff(me.role === "admin");
  } catch {
    return "مفيش اتصال بالسيرفر — جرّب تاني";
  }
  useStore.getState().login(me.id);
  return null;
}

/** Signs out on this device only; other devices stay signed in. */
export async function signOut() {
  useStore.getState().logout();
  await getSupabase()?.auth.signOut({ scope: "local" });
}

/**
 * The staff-accounts Edge Function (sign-in accounts need the project's secret key, which only it has).
 * Returns its answer, or its error message.
 */
export async function staffAccounts(body: Record<string, unknown>): Promise<{ data?: unknown; error?: string }> {
  const { data, error } = await getSupabase()!.functions.invoke("staff-accounts", { body });
  if (!error) return { data };
  try {
    const answer = await (error as { context?: Response }).context?.json();
    if (typeof answer?.error === "string") return { error: answer.error };
  } catch {
    // not the function's answer: no connection
  }
  return { error: "مفيش اتصال بالسيرفر — جرّب تاني" };
}
