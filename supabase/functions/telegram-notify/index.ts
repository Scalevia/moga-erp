// Moga ERP — the owner's Telegram bot.
//
// The bot's token is an Edge Function secret (TELEGRAM_BOT_TOKEN), set by the owner in Supabase. Two kinds
// of call come here:
//   {event: "sale" | "shift_closed", id}  from the database, after an invoice or a shift closing is saved.
//       The text comes back from the database (written from the saved records), and each goes out once,
//       so a call made up by anyone else can only repeat nothing.
//   {action: "status" | "link" | "test"}   from the owner's settings page (signed in as the owner).
//       "link" takes the chat of the last message sent to the bot: the owner sends it one first.

import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const url = Deno.env.get("SUPABASE_URL")!;
const secretKey = defaultKey("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

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

async function telegram(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok: boolean; result?: unknown; description?: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("طلب غلط", 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("طلب غلط");
  }
  try {
    if (body.event === "sale" || body.event === "shift_closed") return await notify(String(body.event), String(body.id));
    if (!(await isOwner(req))) return fail("دي للمالك بس", 403);
    if (body.action === "status") return await status();
    if (!token) return fail("حط توكن البوت في Supabase الأول (TELEGRAM_BOT_TOKEN)");
    if (body.action === "link") return await link();
    if (body.action === "test") return await test();
    return fail("طلب غلط");
  } catch (e) {
    console.error(e);
    return fail("حصلت مشكلة — جرّب تاني", 500);
  }
});

async function isOwner(req: Request) {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data } = await admin.auth.getUser(jwt);
  if (!data.user) return false;
  const caller = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: me } = await caller.from("staff").select("role, active").eq("auth_user_id", data.user.id).maybeSingle();
  return me?.active === true && me.role === "admin";
}

async function notify(event: string, id: string) {
  if (!token) return reply({ sent: false });
  const { data, error } = await admin.rpc("telegram_message", { p_event: event, p_id: id });
  if (error || !data) return reply({ sent: false });
  const sent = await telegram("sendMessage", { chat_id: data.chat_id, text: data.text });
  if (!sent.ok) console.error(sent.description);
  return reply({ sent: sent.ok });
}

async function status() {
  const { data } = await admin.rpc("telegram_chat_id");
  return reply({ token: Boolean(token), linked: data != null });
}

async function link() {
  const updates = await telegram("getUpdates", { allowed_updates: ["message"] });
  if (!updates.ok) return fail("التوكن مش شغال — اتأكد إنك نسخته صح من BotFather");
  const chats = (updates.result as { message?: { chat: { id: number; type: string } } }[])
    .map((u) => u.message?.chat)
    .filter((c) => c?.type === "private");
  const chat = chats.at(-1);
  if (!chat) return fail("ابعت أي رسالة للبوت من تليجرام الأول، وبعدين دوس ربط");
  const { error } = await admin.rpc("telegram_link", { p_chat_id: chat.id });
  if (error) return fail(error.message);
  await telegram("sendMessage", {
    chat_id: chat.id,
    text: "✅ البوت اتربط بـ MOGA — هيوصلك هنا إشعار بكل بيعة، وملخص اليوم مع تقفيل كل وردية.",
  });
  return reply({ ok: true });
}

async function test() {
  const { data: chat } = await admin.rpc("telegram_chat_id");
  if (chat == null) return fail("اربط البوت الأول");
  const sent = await telegram("sendMessage", { chat_id: chat, text: "🔔 رسالة تجربة من MOGA — الإشعارات شغالة." });
  return sent.ok ? reply({ ok: true }) : fail("الرسالة ما وصلتش — جرّب تربط تاني");
}
