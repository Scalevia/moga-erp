// Moga ERP — staff sign-in accounts.
//
// Staff sign in with a username and a password. Supabase Auth signs in by email, so each username becomes
// username@moga-erp.vercel.app (nothing is ever sent there). Making and changing those accounts needs the
// project's secret key, which only this function has, from its environment:
//   setup_owner  the shop's first account, the owner's, with the one-time code (before anyone signs in)
//   create       a new staff member with their sign-in (the owner)
//   update       their details, username or password (the owner)
//   delete       someone with nothing recorded, and their sign-in (the owner)
// The rest goes through the database's own functions, which check who is asking.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";

const url = Deno.env.get("SUPABASE_URL")!;
const secretKey = defaultKey("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const MIN_PASSWORD = 6; // Supabase Auth's own minimum
const loginEmail = (username: string) => `${username}@moga-erp.vercel.app`;
const usernameOk = (username: string) => /^[a-z0-9._-]{2,32}$/.test(username);

type Body = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v : "");
const username = (v: unknown) => text(v).trim().toLowerCase();

function defaultKey(name: string): string | undefined {
  try {
    return JSON.parse(Deno.env.get(name) ?? "{}").default;
  } catch {
    return undefined;
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (error: string, status = 400) => reply({ error }, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("طلب غلط", 405);
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return fail("طلب غلط");
  }
  try {
    if (body.action === "setup_owner") return await setupOwner(body);
    const caller = await ownerClient(req);
    if (caller instanceof Response) return caller;
    if (body.action === "create") return await createStaff(caller, body);
    if (body.action === "update") return await updateStaff(caller, body);
    if (body.action === "delete") return await deleteStaff(caller, body);
    return fail("طلب غلط");
  } catch (e) {
    console.error(e);
    return fail("حصلت مشكلة — جرّب تاني", 500);
  }
});

/**
 * A client acting as the signed-in caller, if they're the owner: their row-level security and the
 * database functions' own checks apply to everything it does.
 */
async function ownerClient(req: Request): Promise<SupabaseClient | Response> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return fail("لازم تسجّل دخول الأول", 401);
  const caller = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: me } = await caller.from("staff").select("role, active").eq("auth_user_id", data.user.id).maybeSingle();
  if (!me?.active || me.role !== "admin") return fail("دي للمالك بس", 403);
  return caller;
}

function passwordProblem(password: string) {
  return password.length < MIN_PASSWORD ? `كلمة السر لازم تكون ${MIN_PASSWORD} حروف أو أرقام على الأقل` : null;
}

/** What Supabase Auth's refusals mean for the person typing. */
function authMessage(error: { code?: string; message?: string } | null) {
  if (error?.code === "email_exists" || error?.code === "user_already_exists") return "اسم المستخدم ده مستخدم قبل كده";
  if (error?.code === "weak_password") return `كلمة السر ضعيفة — خليها ${MIN_PASSWORD} حروف أو أرقام على الأقل`;
  if (error?.code === "email_address_invalid" || error?.code === "validation_failed") return "اسم المستخدم ده مينفعش — جرّب اسم تاني";
  console.error(error);
  return "حصلت مشكلة في حساب الدخول — جرّب تاني";
}

/** Makes the sign-in for a staff member and ties it to them. Returns what went wrong, if anything. */
async function newLogin(staffId: string, name: string, password: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.createUser({ email: loginEmail(name), password, email_confirm: true });
  if (error || !data.user) return authMessage(error);
  const { error: linkError } = await admin.rpc("link_staff_login", { p_staff_id: staffId, p_auth_user_id: data.user.id });
  if (linkError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return linkError.message;
  }
  return null;
}

async function setupOwner(body: Body) {
  const code = text(body.code);
  const name = text(body.name).trim();
  const user = username(body.username);
  const password = text(body.password);
  if (!name) return fail("اكتب الاسم");
  if (!usernameOk(user)) return fail("اسم المستخدم: حروف إنجليزي وأرقام بس، من 2 لـ 32");
  const weak = passwordProblem(password);
  if (weak) return fail(weak);
  const { data: needed } = await admin.rpc("owner_setup_needed");
  if (needed !== true) return fail("حساب المالك اتعمل قبل كده — ادخل باسم المستخدم وكلمة السر");
  const { data: codeOk } = await admin.rpc("owner_setup_code_ok", { p_code: code });
  if (codeOk !== true) return fail("كود التفعيل غلط");
  const { data, error } = await admin.auth.admin.createUser({ email: loginEmail(user), password, email_confirm: true });
  if (error || !data.user) return fail(authMessage(error));
  const { error: setupError } = await admin.rpc("setup_owner", {
    p_code: code,
    p_auth_user_id: data.user.id,
    p_name: name,
    p_username: user,
  });
  if (setupError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return fail(setupError.message);
  }
  return reply({ ok: true });
}

async function createStaff(caller: SupabaseClient, body: Body) {
  const user = username(body.username);
  const password = text(body.password);
  if (!usernameOk(user)) return fail("اسم المستخدم: حروف إنجليزي وأرقام بس، من 2 لـ 32");
  const weak = passwordProblem(password);
  if (weak) return fail(weak);
  const { data: id, error } = await caller.rpc("add_staff", {
    p_name: text(body.name),
    p_role: text(body.role),
    p_username: user,
    p_salary: Number(body.salary) || 0,
    p_phone: text(body.phone) || null,
  });
  if (error) return fail(error.message);
  const problem = await newLogin(id, user, password);
  if (problem) {
    await caller.rpc("delete_staff", { p_id: id });
    return fail(problem);
  }
  return reply({ id });
}

async function updateStaff(caller: SupabaseClient, body: Body) {
  const id = text(body.staff_id);
  const password = text(body.password);
  const { data: before } = await caller.from("staff").select("username, auth_user_id").eq("id", id).maybeSingle();
  if (!before) return fail("الموظف مش موجود");
  const user = body.username == null ? before.username : username(body.username);
  if (!usernameOk(user)) return fail("اسم المستخدم: حروف إنجليزي وأرقام بس، من 2 لـ 32");
  const weak = password ? passwordProblem(password) : null;
  if (weak) return fail(weak);
  const { error } = await caller.rpc("update_staff", {
    p_id: id,
    p_name: body.name == null ? null : text(body.name),
    p_role: body.role == null ? null : text(body.role),
    p_phone: body.phone == null ? null : text(body.phone),
    p_salary: body.salary == null ? null : Number(body.salary) || 0,
    p_username: user,
  });
  if (error) return fail(error.message);

  if (!before.auth_user_id) {
    // No sign-in yet: make one if a password was given.
    const problem = password ? await newLogin(id, user, password) : null;
    return problem ? fail(problem) : reply({ ok: true });
  }
  const changes: { email?: string; email_confirm?: boolean; password?: string } = {};
  if (user !== before.username) Object.assign(changes, { email: loginEmail(user), email_confirm: true });
  if (password) changes.password = password;
  if (!changes.email && !changes.password) return reply({ ok: true });
  const { error: authError } = await admin.auth.admin.updateUserById(before.auth_user_id, changes);
  if (authError) {
    // Keep the username and the sign-in the same.
    if (changes.email) await caller.rpc("update_staff", { p_id: id, p_username: before.username });
    return fail(authMessage(authError));
  }
  return reply({ ok: true });
}

async function deleteStaff(caller: SupabaseClient, body: Body) {
  const id = text(body.staff_id);
  const { data: before } = await caller.from("staff").select("auth_user_id").eq("id", id).maybeSingle();
  if (!before) return fail("الموظف مش موجود");
  const { error } = await caller.rpc("delete_staff", { p_id: id });
  if (error) return fail(error.message);
  if (before.auth_user_id) await admin.auth.admin.deleteUser(before.auth_user_id);
  return reply({ ok: true });
}
