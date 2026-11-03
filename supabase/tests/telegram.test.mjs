// Telegram: a message for every sale and for every shift closing, written from the saved records, each
// sent once, and nothing at all until the owner links their chat.
import { freshDb, makeApi, ok, results } from "./harness.mjs";

const db = await freshDb();
const { as, root, rpc, fails, q, one } = makeApi(db);
const U = { owner: "00000000-0000-0000-0000-0000000000c1", emp: "00000000-0000-0000-0000-0000000000c2" };
const asService = async () => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: "service_role" })]);
  await db.exec("set role service_role");
};
const sent = async () => (await q(`select body from net.sent`)).map((r) => r.body);
const count = { wallet: 1000, machines: { fawry_airtime: 500, fawry_general: 300, momkn: 200 } };

await root();
await db.exec(`insert into auth.users (id) values ('${U.owner}'), ('${U.emp}')`);
await db.exec(`insert into public.staff (auth_user_id, name, role, username) values ('${U.owner}', 'المالك', 'admin', 'owner')`);
await as(U.owner);
const empId = await rpc("add_staff", { p_name: "محمد سامي", p_role: "employee", p_username: "mohamed" });
await root();
await db.exec(`update public.staff set auth_user_id = '${U.emp}' where id = '${empId}'`);
await as(U.owner);
await rpc("initialize_shop", {
  p_data: {
    cash: 5000, wallet: 1000, machines: count.machines,
    products: [
      { name: "شاحن Anker", category: "accessory", cost: 450, retail: 750, qty: 10 },
      { name: "كابل", category: "accessory", cost: 50, retail: 100, qty: 10 },
    ],
  },
});
const P = Object.fromEntries((await q(`select id, name from public.products`)).map((p) => [p.name, p.id]));

// ---------------------------------------------------------------- before linking: nothing goes out
await as(U.emp);
await rpc("open_shift", { p_float: 5000, p_count: count });
const s1 = await rpc("complete_sale", { p_items: [{ product_id: P["كابل"], qty: 1, unit_price: 100 }], p_payments: [{ method: "cash", amount: 100 }] });
ok("no chat linked: no request is made", (await sent()).length === 0);
await asService();
ok("…and no message for it", (await rpc("telegram_message", { p_event: "sale", p_id: s1.id })) === null);

// ---------------------------------------------------------------- linked
await rpc("telegram_link", { p_chat_id: 123456789 });
ok("the owner's chat is linked", Number(await rpc("telegram_chat_id")) === 123456789);
await as(U.emp);
const s2 = await rpc("complete_sale", {
  p_items: [{ product_id: P["شاحن Anker"], qty: 2, unit_price: 750 }, { product_id: P["كابل"], qty: 1, unit_price: 100 }],
  p_payments: [{ method: "cash", amount: 1000 }, { method: "vodafone_cash", amount: 650 }],
  p_customer: { name: "زبون", phone: "01500000001" },
});
let out = await sent();
ok("a sale asks the Edge Function to send it, after it's saved", out.length === 1 && out[0].event === "sale" && out[0].id === s2.id);
try {
  await rpc("complete_sale", { p_items: [{ product_id: P["كابل"], qty: 100, unit_price: 100 }], p_payments: [{ method: "cash", amount: 10000 }] });
} catch {
  // not enough in stock: refused
}
ok("a sale that fails sends nothing", (await sent()).length === 1);

await asService();
const m = await rpc("telegram_message", { p_event: "sale", p_id: s2.id });
console.log(m.text, "\n");
ok("the sale's message: invoice, seller, lines, payments, customer, profit",
  Number(m.chat_id) === 123456789 && m.text.includes("فاتورة #2 — 1,650 ج.م") && m.text.includes("محمد سامي") &&
  m.text.includes("• شاحن Anker × 2 — 1,500") && m.text.includes("نقدي 1,000 + فودافون كاش 650") && m.text.includes("الزبون: زبون") && m.text.includes("• زيادة سابها الزبون — 50") && m.text.includes("الربح: 700"));
ok("each message goes out once", (await rpc("telegram_message", { p_event: "sale", p_id: s2.id })) === null);
await as(U.emp);
const r = await fails("telegram_message", { p_event: "sale", p_id: s2.id }, "permission denied");
ok("staff can't ask for messages", r.ok, r.msg);
const r2 = await fails("telegram_link", { p_chat_id: 1 }, "permission denied");
ok("…or link another chat", r2.ok, r2.msg);

// ---------------------------------------------------------------- the shift closes
await rpc("record_expense", { p_category: "كهرباء", p_amount: 150 });
await rpc("return_order", { p_order_id: s1.id, p_reason: "تجربة" });
await rpc("close_shift", { p_counted: 5900, p_count: { ...count, wallet: 1630 } });
out = await sent();
const shiftId = (await one(`select id from public.shifts where employee_id = $1`, [empId])).id;
ok("closing the shift asks to send the day's figures", out.length === 2 && out[1].event === "shift_closed" && out[1].id === shiftId);
await asService();
const day = await rpc("telegram_message", { p_event: "shift_closed", p_id: shiftId });
console.log(day.text, "\n");
ok("the shift's message: sales, invoices and returns, profit, payments, expenses",
  day.text.includes("تقفيل وردية محمد سامي") && day.text.includes("المبيعات: 1,650 ج.م (2 فاتورة، منهم 1 اترجعت)") &&
  day.text.includes("مجمل الربح: 700") && day.text.includes("الدفع: نقدي 1,000 · فودافون كاش 650") && day.text.includes("المصروفات: 150"));
ok("…the drawer against what was expected (5,000 + 100 + 1,000 − 150 − 100 = 5,850; counted 5,900)",
  day.text.includes("الدرج: المفروض 5,850 — اتعدّ 5,900 — زيادة 50"));
ok("…and the wallet counted 20 short", day.text.includes("فودافون كاش: عجز 20"));

// ---------------------------------------------------------------- the next shift opens
await as(U.emp);
await rpc("record_agent_load", { p_machine_id: "fawry", p_balance_id: "fawry_airtime", p_amount: 1000 });
const before = (await sent()).length;
await rpc("open_shift", { p_float: 5880, p_count: { wallet: 1610, machines: { ...count.machines, fawry_airtime: 1510 } } });
out = await sent();
const opened = (await one(`select id from public.shifts where closed_at is null`)).id;
ok("opening a shift asks to send it", out.length === before + 1 && out.at(-1).event === "shift_opened" && out.at(-1).id === opened);
await asService();
const open = await rpc("telegram_message", { p_event: "shift_opened", p_id: opened });
console.log(open.text, "\n");
ok("the opening's message: who and when, the drawer against the last close (5,900 → 5,880: 20 short)",
  open.text.includes("🟢 محمد سامي فتح الوردية") && open.text.includes("الدرج: المفروض 5,900 — اتعدّ 5,880 — عجز 20"));
ok("…the wallet 20 short, and this morning's agent load", open.text.includes("فودافون كاش: عجز 20") && open.text.includes("المندوب شحن قبل الفتح: فوري — شحن (Air time) 1,000"));
ok("the setup's shift (saved closed) sent nothing", !(await sent()).some((b) => b.event === "shift_opened" && b.id !== opened));

const { pass, fail } = results();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
