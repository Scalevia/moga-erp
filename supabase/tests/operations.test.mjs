// Every server operation against a local Postgres: the money effects, the rules, and who may do what.
import { freshDb, makeApi, ok, results } from "./harness.mjs";

const db = await freshDb();
const { as, root, rpc, fails, q, one } = makeApi(db);
const N = (x) => Number(x);
const U = {
  owner: "00000000-0000-0000-0000-0000000000a1",
  mohamed: "00000000-0000-0000-0000-0000000000a2",
  karim: "00000000-0000-0000-0000-0000000000a3",
  stranger: "00000000-0000-0000-0000-0000000000a4",
  old: "00000000-0000-0000-0000-0000000000a5",
};
const expectFail = async (name, fn, args, part) => {
  const r = await fails(fn, args, part);
  ok(`${name} → «${part}»`, r.ok, r.msg);
};

// ---------------------------------------------------------------- people
await root();
await db.exec(`insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(", ")}`);
await db.exec(`insert into public.staff (auth_user_id, name, role, username) values ('${U.owner}', 'المالك', 'admin', 'owner')`);
await as(U.owner);
const mohamedId = await rpc("add_staff", { p_name: "محمد سامي", p_role: "employee", p_username: "Mohamed", p_salary: 6000, p_phone: "01011111111" });
const karimId = await rpc("add_staff", { p_name: "كريم عادل", p_role: "employee", p_username: "karim", p_salary: 5000 });
const oldId = await rpc("add_staff", { p_name: "موظف قديم", p_role: "employee", p_username: "old" });
await expectFail("username taken", "add_staff", { p_name: "تاني", p_role: "employee", p_username: "KARIM" }, "مستخدم لموظف تاني");
await expectFail("username with spaces", "add_staff", { p_name: "تاني", p_role: "employee", p_username: "a b" }, "اسم المستخدم");
await root();
await db.exec(`update public.staff set auth_user_id = '${U.mohamed}' where id = '${mohamedId}';
  update public.staff set auth_user_id = '${U.karim}' where id = '${karimId}';
  update public.staff set auth_user_id = '${U.old}' where id = '${oldId}'`);
ok("username saved in lower case", (await one(`select username from public.staff where id = $1`, [mohamedId])).username === "mohamed");
await as(U.owner);
await rpc("update_staff", { p_id: oldId, p_active: false });

// ---------------------------------------------------------------- who can call what
await as("anon");
let r = await fails("record_expense", { p_category: "x", p_amount: 1 });
ok("anonymous key can't call operations (permission denied)", r.code === "42501" && /permission denied/.test(r.msg), r.msg);
await as(U.stranger);
await expectFail("signed in but not staff", "record_expense", { p_category: "x", p_amount: 1 }, "لازم تسجّل دخول الأول");
await as(U.old);
await expectFail("deactivated staff", "record_expense", { p_category: "x", p_amount: 1 }, "لازم تسجّل دخول الأول");
await as(U.mohamed);
await expectFail("employee can't run the setup", "initialize_shop", { p_data: {} }, "دي للمالك بس");
try {
  await db.query("insert into public.cash_movements (kind, description) values ('expense', 'x')");
  ok("no direct writes to tables", false, "insert worked");
} catch (e) {
  ok("no direct writes to tables", /permission denied/.test(e.message), e.message);
}
try {
  await db.query("select salary from public.staff");
  ok("salaries hidden from staff reads", false, "select worked");
} catch (e) {
  ok("salaries hidden from staff reads", /permission denied/.test(e.message), e.message);
}

// ---------------------------------------------------------------- first-time setup
await as(U.owner);
const init = await rpc("initialize_shop", {
  p_data: {
    cash: 50000, wallet: 17500, bank: 2000, savings: 0, fixed_assets: 30000,
    machines: { fawry_airtime: 3000, fawry_general: 2000, momkn: 1500 },
    reps: { fawry: 0, momkn: -1000 },
    products: [
      { name: "iPhone 15 128GB", brand: "Apple", category: "new_phone", cost: 40000, retail: 45000, imeis: ["356000000000001", "356000000000002", "356000000000003"] },
      { name: "شاحن Anker", brand: "Anker", category: "accessory", barcode: "6900000000011", cost: 450, retail: 750, qty: 10 },
      { name: "كابل Type-C", brand: "", category: "accessory", cost: 50, retail: 100, qty: 20 },
      { name: "Nokia 105", brand: "Nokia", category: "feature_phone", cost: 600, retail: 850, qty: 5 },
    ],
    suppliers: [{ name: "مورد الجملة", phone: "01000000001", balance: 10000 }],
    lenders: [{ name: "الحاج سعيد", phone: "01100000001", remaining: 50000, notes: "" }],
    installments: [
      { name: "عميل قديم", phone: "01200000001", national_id: "29001011234567", remaining: 3000, monthly: 1000, next_due: "2026-11-05", guarantor_name: "ضامن", guarantor_phone: "01200000002" },
    ],
  },
});
ok("setup entered everything", init.products === 4 && init.phones === 3 && init.suppliers === 1 && init.loans === 1 && init.installment_plans === 1, JSON.stringify(init));
await expectFail("setup runs only once", "initialize_shop", { p_data: { cash: 1 } }, "اتهيّأ قبل كده");
await root();
const oldPlan = await one(`select id from public.installment_plans where order_id is null`);
const oldDues = await q(`select due_date::text, amount from public.installment_dues where plan_id = $1 order by n`, [oldPlan.id]);
ok("old plan: 3 × 1,000 from the next due date", JSON.stringify(oldDues.map((d) => [d.due_date, N(d.amount)])) === JSON.stringify([["2026-11-05", 1000], ["2026-12-05", 1000], ["2027-01-05", 1000]]), JSON.stringify(oldDues));
const setupShift = await one(`select * from public.shifts`);
ok("setup leaves a closed opening shift with the counted cash", setupShift.closed_at && N(setupShift.counted_cash) === 50000);
const P = Object.fromEntries((await q(`select id, name from public.products`)).map((p) => [p.name, p.id]));
const firstService = (await one(`select id from public.services order by sort limit 1`)).id;

// ---------------------------------------------------------------- the day starts (Mohamed)
let drawer = 50000; // what the drawer should hold, worked out here independently
await as(U.mohamed);
await expectFail("no selling before the shift opens", "complete_sale", { p_items: [{ product_id: P["كابل Type-C"], qty: 1, unit_price: 100 }], p_payments: [{ method: "cash", amount: 100 }] }, "افتح الوردية الأول");
await expectFail("no expenses before the shift opens", "record_expense", { p_category: "كهرباء", p_amount: 10 }, "افتح الوردية الأول");
const loaded = await rpc("record_agent_load", { p_machine_id: "fawry", p_balance_id: "fawry_airtime", p_amount: 1000 });
ok(`agent load before opening: balance +1,010 with the 1% bonus (${loaded})`, N(loaded) === 1010);
ok("…recorded with no shift", (await one(`select shift_id from public.cash_movements where kind = 'rep_load'`)).shift_id === null);
await expectFail("load on another company's balance", "record_agent_load", { p_machine_id: "momkn", p_balance_id: "fawry_airtime", p_amount: 10 }, "اختار المندوب");

const shift1 = await rpc("open_shift", { p_float: 50000, p_count: { wallet: 17500, machines: { fawry_airtime: 4010, fawry_general: 2000, momkn: 1500 } } });
let s = await one(`select * from public.shifts where id = $1`, [shift1]);
ok("opening expected: last close's cash, wallet, machines incl. this morning's load",
  N(s.opening_expected.cash) === 50000 && N(s.opening_expected.wallet) === 17500 && N(s.opening_expected.machines.fawry_airtime) === 4010, JSON.stringify(s.opening_expected));
ok("handover: previous shift's employee recorded", s.previous_employee_id === (await one(`select id from public.staff where username = 'owner'`)).id);
ok("matching count: no adjustments", (await one(`select count(*)::int as n from public.cash_movements where kind = 'count_adjustment'`)).n === 0);

await as(U.karim);
await expectFail("a second shift can't open", "open_shift", { p_float: 1, p_count: { wallet: 1, machines: { fawry_airtime: 1, fawry_general: 1, momkn: 1 } } }, "فيه وردية مفتوحة باسم محمد سامي");
await expectFail("another employee can't work in Mohamed's shift", "record_expense", { p_category: "كهرباء", p_amount: 10 }, "فيه وردية مفتوحة باسم محمد سامي");

// ---------------------------------------------------------------- selling
await as(U.mohamed);
const sale = (items, payments, extra = {}) => rpc("complete_sale", { p_items: items, p_payments: payments, ...extra });
const s1 = await sale([{ product_id: P["شاحن Anker"], qty: 1, unit_price: 750 }], [{ method: "cash", amount: 750 }]);
drawer += 750;
ok(`cash sale: invoice #${s1.number}, total 750`, N(s1.number) === 1 && N(s1.total) === 750);
const item1 = await one(`select unit_cost, list_price from public.order_items where order_id = $1`, [s1.id]);
ok("cost and shelf price come from the stock (450 / 750)", N(item1.unit_cost) === 450 && N(item1.list_price) === 750);
ok("stock 10 → 9", N((await one(`select quantity from public.product_stock where product_id = $1`, [P["شاحن Anker"]])).quantity) === 9);

const s2 = await sale([{ product_id: P["كابل Type-C"], qty: 2, unit_price: 100 }], [{ method: "cash", amount: 250 }]);
drawer += 250;
ok("paid 250 for 200: extra 50 kept as part of the sale", N(s2.extra) === 50 && N((await one(`select extra from public.orders where id = $1`, [s2.id])).extra) === 50);

const s3 = await sale([{ product_id: P["كابل Type-C"], qty: 1, unit_price: 100 }], [{ method: "cash", amount: 60 }, { method: "credit", amount: 40 }], { p_customer: { name: "زبون آجل", phone: "01500000001" } });
drawer += 60;
const credCust = (await one(`select customer_id from public.orders where id = $1`, [s3.id])).customer_id;
await expectFail("credit needs the customer's name and phone", "complete_sale", { p_items: [{ product_id: P["كابل Type-C"], qty: 1, unit_price: 100 }], p_payments: [{ method: "cash", amount: 60 }, { method: "credit", amount: 40 }] }, "محتاج اسم الزبون");
await expectFail("paying less with nothing on account", "complete_sale", { p_items: [{ product_id: P["كابل Type-C"], qty: 1, unit_price: 100 }], p_payments: [{ method: "cash", amount: 50 }] }, "المدفوع أقل");
await expectFail("no selling more than in stock", "complete_sale", { p_items: [{ product_id: P["كابل Type-C"], qty: 1000, unit_price: 100 }], p_payments: [{ method: "cash", amount: 100000 }] }, "سجّلها في استلام بضاعة");
await expectFail("negative price", "complete_sale", { p_items: [{ product_id: P["كابل Type-C"], qty: 1, unit_price: -5 }], p_payments: [] }, "السعر غلط");
await expectFail("extra and credit together", "complete_sale", { p_items: [{ product_id: P["كابل Type-C"], qty: 1, unit_price: 100 }], p_payments: [{ method: "cash", amount: 90 }, { method: "credit", amount: 20 }], p_customer: { name: "س", phone: "01500000009" } }, "زيادة وباقي");
await expectFail("unknown payment method", "complete_sale", { p_items: [{ product_id: P["كابل Type-C"], qty: 1, unit_price: 100 }], p_payments: [{ method: "bitcoin", amount: 100 }] }, "طريقة دفع غلط");
ok("failed sales left nothing behind (stock, invoices)", N((await one(`select quantity from public.product_stock where product_id = $1`, [P["كابل Type-C"]])).quantity) === 17 && (await one(`select count(*)::int as n from public.orders`)).n === 3);
const s3b = await sale([{ product_id: P["كابل Type-C"], qty: 1, unit_price: 100 }], [{ method: "cash", amount: 100 }], { p_customer: { name: "", phone: "01500000077" } });
drawer += 100;
ok(`invoice numbers have no gaps after failed sales (#${s3b.number})`, N(s3b.number) === 4);
ok("only a phone on a plain sale: kept, the number stands in for the name", (await one(`select name from public.contacts where phone = '01500000077'`)).name === "01500000077");
await sale([{ product_id: P["كابل Type-C"], qty: 1, unit_price: 100 }], [{ method: "cash", amount: 100 }], { p_customer: { name: "أحمد", phone: "01500000077" } });
drawer += 100;
ok("…a later sale with the name fills it in", (await one(`select name from public.contacts where phone = '01500000077'`)).name === "أحمد");
await expectFail("a phone sale needs the customer's name", "complete_sale", { p_items: [{ imei: "356000000000003", unit_price: 45000 }], p_payments: [{ method: "cash", amount: 45000 }], p_customer: { name: "", phone: "01500000078" } }, "قبل بيع الموبايل");
await expectFail("credit needs a name, not just a phone", "complete_sale", { p_items: [{ product_id: P["كابل Type-C"], qty: 1, unit_price: 100 }], p_payments: [{ method: "credit", amount: 100 }], p_customer: { name: " ", phone: "01500000077" } }, "محتاج اسم الزبون");

const s4 = await sale([{ imei: "356000000000001", unit_price: 45000 }], [{ method: "instapay", amount: 45000 }], { p_customer: { name: "مشتري آيفون", phone: "01700000001" } });
ok("phone sold by IMEI: unit marked sold under the invoice", (await one(`select status, sold_order_id from public.phone_units where imei = '356000000000001'`)).sold_order_id === s4.id);
await expectFail("the same phone can't be sold twice", "complete_sale", { p_items: [{ imei: "356000000000001", unit_price: 1 }], p_payments: [{ method: "cash", amount: 1 }] }, "مش في المخزن");
await expectFail("unknown IMEI", "complete_sale", { p_items: [{ imei: "111111111111111", unit_price: 1 }], p_payments: [{ method: "cash", amount: 1 }] }, "مش متسجّل");
await expectFail("a phone model can't be sold by count", "complete_sale", { p_items: [{ product_id: P["iPhone 15 128GB"], qty: 1, unit_price: 1 }], p_payments: [{ method: "cash", amount: 1 }] }, "بالـ IMEI");

const s5 = await sale([{ category: "service", service_id: firstService, name: "عمل حساب جوجل", unit_price: 100, unit_cost: 20 }], [{ method: "cash", amount: 100 }]);
drawer += 100;
ok("service sale with its own cost", N((await one(`select unit_cost from public.order_items where order_id = $1`, [s5.id])).unit_cost) === 20);
await expectFail("«أخرى» service needs what was done", "complete_sale", { p_items: [{ category: "service", service_id: null, name: "كارت لعبة", unit_price: 50, unit_cost: 0 }], p_payments: [{ method: "cash", amount: 50 }] }, "اكتب اللي اتعمل");

const s6 = await sale(
  [{ imei: "356000000000002", unit_price: 45000 }],
  [{ method: "cash", amount: 15000 }, { method: "installment", amount: 30000 }],
  { p_customer: { name: "عميل تقسيط", phone: "01600000001", national_id: "29505051234567" }, p_installment: { markup_percent: 20, months: 6, guarantor: { name: "ضامن ٢", phone: "01600000002" } } },
);
drawer += 15000;
const plan = await one(`select * from public.installment_plans where order_id = $1`, [s6.id]);
const dues = await q(`select due_date::text, amount from public.installment_dues where plan_id = $1 order by n`, [plan.id]);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
ok(`installments: 30,000 × 1.2 = 36,000 over 6 → 6,000 each (${dues.map((d) => N(d.amount)).join(",")})`, dues.length === 6 && dues.every((d) => N(d.amount) === 6000));
ok(`first due a month after today (${today} → ${dues[0].due_date})`, dues[0].due_date.slice(8) === today.slice(8) || N(today.slice(8)) > 28);
ok("plan: cash price, down payment, guarantor", N(plan.cash_price) === 45000 && N(plan.down_payment) === 15000 && plan.guarantor_id !== null);
await expectFail("installments need the national ID", "complete_sale", { p_items: [{ imei: "356000000000003", unit_price: 45000 }], p_payments: [{ method: "installment", amount: 45000 }], p_customer: { name: "بدون بطاقة", phone: "01600000009" }, p_installment: { markup_percent: 10, months: 3 } }, "رقمه القومي");
await expectFail("installments are for phones", "complete_sale", { p_items: [{ product_id: P["Nokia 105"], qty: 1, unit_price: 850 }], p_payments: [{ method: "installment", amount: 850 }], p_customer: { name: "عميل تقسيط", phone: "01600000001" }, p_installment: { markup_percent: 10, months: 3 } }, "للموبايلات بس");
await expectFail("installment payment line without the plan details", "complete_sale", { p_items: [{ imei: "356000000000003", unit_price: 45000 }], p_payments: [{ method: "installment", amount: 45000 }], p_customer: { name: "عميل تقسيط", phone: "01600000001" } }, "بيانات التقسيط ناقصة");

// month-end dates
await root();
await db.exec(`insert into public.installment_plans (id, customer_id, cash_price, months) values ('00000000-0000-0000-0000-00000000c001', '${credCust}', 0, 4);
  select private.add_schedule('00000000-0000-0000-0000-00000000c001', 400, 4, '2028-01-31');`);
const clamp = (await q(`select due_date::text as d from public.installment_dues where plan_id = '00000000-0000-0000-0000-00000000c001' order by n`)).map((x) => x.d);
ok(`a Jan 31 sale is due Feb 29 (leap), Mar 31, Apr 30, May 31 (${clamp.join(" ")})`, clamp.join(" ") === "2028-02-29 2028-03-31 2028-04-30 2028-05-31");
await db.exec(`delete from public.installment_plans where id = '00000000-0000-0000-0000-00000000c001'`);

// ---------------------------------------------------------------- installments
await as(U.mohamed);
await rpc("pay_installment", { p_plan_id: plan.id, p_amount: 6000, p_method: "cash" });
drawer += 6000;
await rpc("pay_installment", { p_plan_id: plan.id, p_amount: 7000, p_method: "vodafone_cash" });
const paidDues = (await q(`select paid from public.installment_dues where plan_id = $1 order by n`, [plan.id])).map((d) => N(d.paid));
ok(`payments go to the oldest due first (${paidDues.join(",")})`, paidDues.join(",") === "6000,6000,1000,0,0,0");
const instMoves = await q(`select cash, wallet, commission, plan_id from public.cash_movements where kind = 'installment_collection' order by created_at, commission`);
ok(`markup earned as collected: 1,000 and 1,167 (${instMoves.map((m) => N(m.commission)).join(", ")})`, instMoves.map((m) => N(m.commission)).sort().join(",") === "1000,1167" && instMoves.every((m) => m.plan_id === plan.id));
await expectFail("more than what's left on the plan", "pay_installment", { p_plan_id: plan.id, p_amount: 30000, p_method: "cash" }, "أكتر من الباقي");
await expectFail("installments by card not allowed", "pay_installment", { p_plan_id: plan.id, p_amount: 10, p_method: "card" }, "اختار طريقة الدفع");

// ---------------------------------------------------------------- expenses, the owner, services
await rpc("record_expense", { p_category: "كهرباء", p_amount: 150, p_note: "فاتورة أكتوبر" });
drawer -= 150;
ok("expense with its category and note", (await one(`select description, category, cash from public.cash_movements where kind = 'expense'`)).description === "كهرباء — فاتورة أكتوبر");
await expectFail("expense without a category", "record_expense", { p_category: " ", p_amount: 10 }, "اختار البند");
await expectFail("zero amount", "record_expense", { p_category: "كهرباء", p_amount: 0 }, "أكبر من صفر");
await rpc("record_employee_advance", { p_employee_id: karimId, p_amount: 500 });
drawer -= 500;
await expectFail("advances are for employees", "record_employee_advance", { p_employee_id: (await one(`select id from public.staff where username='owner'`)).id, p_amount: 100 }, "اختار الموظف");
await expectFail("employee can't record owner's money", "record_owner_movement", { p_kind: "owner_drawing", p_amount: 100 }, "دي للمالك بس");

await as(U.owner);
await rpc("record_owner_movement", { p_kind: "owner_contribution", p_amount: 1000 });
drawer += 1000;
const contribution = await one(`select shift_id, employee_id, description from public.cash_movements where kind = 'owner_contribution'`);
ok("owner's money in goes into the open shift, under the owner's name", contribution.shift_id === shift1 && contribution.description === "إيداع من المالك");
await expectFail("unknown owner movement", "record_owner_movement", { p_kind: "expense", p_amount: 100 }, "نوع الحركة غلط");

await as(U.mohamed);
const svc = (kind, amount, fee, extra = {}) => rpc("record_service_operation", { p_kind: kind, p_amount: amount, p_fee: fee, ...extra });
await svc("vf_deposit", 1000, 10, { p_phone: "01099999999" });
drawer += 1010;
await svc("vf_withdrawal", 500, 5);
drawer -= 495;
await svc("topup_sale", 100, 5, { p_balance_id: "fawry_general" });
drawer += 100;
await svc("wallet_liquidation", 1000, 10);
drawer += 990;
const ops = Object.fromEntries((await q(`select kind, cash, wallet, topup, commission, machine_id, description from public.cash_movements where kind in ('vf_deposit','vf_withdrawal','topup_sale','wallet_liquidation')`)).map((m) => [m.kind, m]));
ok("VF deposit: drawer +1,010, wallet −1,000, fee 10", N(ops.vf_deposit.cash) === 1010 && N(ops.vf_deposit.wallet) === -1000 && N(ops.vf_deposit.commission) === 10 && ops.vf_deposit.description === "إيداع فودافون كاش — 01099999999");
ok("VF withdrawal: drawer −495, wallet +500", N(ops.vf_withdrawal.cash) === -495 && N(ops.vf_withdrawal.wallet) === 500);
ok("top-up: drawer +100, Fawry general −95, fee 5", N(ops.topup_sale.cash) === 100 && N(ops.topup_sale.topup) === -95 && ops.topup_sale.machine_id === "fawry");
ok("liquidation: drawer +990, wallet −1,000, fee is an expense", N(ops.wallet_liquidation.cash) === 990 && N(ops.wallet_liquidation.commission) === -10);
await expectFail("fee more than the amount", "record_service_operation", { p_kind: "vf_withdrawal", p_amount: 10, p_fee: 20 }, "العمولة أكبر");
await expectFail("negative fee", "record_service_operation", { p_kind: "vf_deposit", p_amount: 10, p_fee: -1 }, "بالسالب");
await expectFail("top-up without a machine", "record_service_operation", { p_kind: "topup_sale", p_amount: 10, p_fee: 1 }, "اختار الماكينة");

// ---------------------------------------------------------------- agents
await rpc("record_agent_payment", { p_machine_id: "momkn", p_amount: 600, p_method: "wallet" });
const agentPay = await one(`select wallet, commission, rep, description from public.cash_movements where kind = 'rep_payment'`);
ok(`agent paid by VF: wallet −606 (1% fee), fee is an expense (${agentPay.description})`, N(agentPay.wallet) === -606 && N(agentPay.commission) === -6 && N(agentPay.rep) === 600);
await expectFail("can't pay an agent more than owed", "record_agent_payment", { p_machine_id: "momkn", p_amount: 500, p_method: "cash" }, "أكتر من اللي عليك للمندوب (400)");
await rpc("record_agent_payment", { p_machine_id: "fawry", p_amount: 1000, p_method: "cash" });
drawer -= 1000;

// ---------------------------------------------------------------- loans both ways
const loanA = await rpc("receive_loan", { p_name: "أبو أحمد", p_phone: "01100000009", p_amount: 2000 });
drawer += 2000;
const saeed = (await one(`select id from public.contacts where kind = 'lender' and phone = '01100000001'`)).id;
await rpc("settle_loan", { p_lender_id: saeed, p_amount: 5000, p_type: "repaid", p_via: "cash" });
drawer -= 5000;
await expectFail("employee can't record a lender forgiving", "settle_loan", { p_lender_id: saeed, p_amount: 1000, p_type: "forgiven" }, "دي للمالك بس");
await as(U.owner);
await rpc("settle_loan", { p_lender_id: saeed, p_amount: 1000, p_type: "forgiven", p_note: "سامحنا" });
const saeedLoan = await one(`select repaid, forgiven from public.loans where lender_id = $1`, [saeed]);
ok("lender: repaid 5,000 and forgave 1,000 (no money moved for it)", N(saeedLoan.repaid) === 5000 && N(saeedLoan.forgiven) === 1000 && (await one(`select count(*)::int as n from public.cash_movements where kind = 'loan_repayment'`)).n === 1);
await as(U.mohamed);
await expectFail("can't settle more than the shop owes", "settle_loan", { p_lender_id: saeed, p_amount: 50000, p_type: "repaid" }, "أكتر من اللي على المحل له");
await rpc("repay_loan", { p_loan_id: loanA, p_amount: 500 });
drawer -= 500;
await expectFail("can't repay a loan beyond what's left", "repay_loan", { p_loan_id: loanA, p_amount: 2000 }, "(1,500)");

await expectFail("employee lending over the limit", "lend_money", { p_name: "جار المحل", p_phone: "01300000001", p_amount: 1500, p_due_date: "2026-11-30" }, "محتاج المالك");
const lent = await rpc("lend_money", { p_name: "جار المحل", p_phone: "01300000001", p_amount: 800, p_due_date: "2026-11-30", p_notes: "لحد أول الشهر" });
drawer -= 800;
await rpc("collect_lent", { p_lent_id: lent, p_amount: 300 });
drawer += 300;
const neighbour = (await one(`select borrower_id from public.lent_out where id = $1`, [lent])).borrower_id;
await expectFail("employee can't forgive a debt", "settle_lent", { p_borrower_id: neighbour, p_amount: 100, p_type: "forgiven" }, "دي للمالك بس");
await as(U.owner);
await rpc("settle_lent", { p_borrower_id: neighbour, p_amount: 500, p_type: "forgiven", p_note: "ظروفه صعبة" });
const lentRow = await one(`select amount - repaid - forgiven as left from public.lent_out where id = $1`, [lent]);
ok("borrower: lent 800, paid 300, owner forgave 500 → nothing left", N(lentRow.left) === 0);
const events = await q(`select type, amount, note from public.lent_events where lent_id = $1 order by at, type`, [lent]);
ok("the statement has both events with the note", events.length === 2 && events.some((e) => e.type === "forgiven" && e.note === "ظروفه صعبة"));
await as(U.mohamed);
await expectFail("nothing left to collect", "settle_lent", { p_borrower_id: neighbour, p_amount: 100, p_type: "repaid" }, "أكتر من اللي عليه");

// ---------------------------------------------------------------- customers' accounts, suppliers
await rpc("collect_credit", { p_customer_id: credCust, p_amount: 40, p_via: "cash" });
drawer += 40;
await expectFail("can't collect more than the account", "collect_credit", { p_customer_id: credCust, p_amount: 1, p_via: "cash" }, "أكتر من اللي عليه");
const bulk = (await one(`select id from public.contacts where kind = 'supplier' and phone = '01000000001'`)).id;
await rpc("pay_supplier", { p_supplier_id: bulk, p_amount: 3000, p_via: "cash", p_note: "دفعة أكتوبر" });
drawer -= 3000;
await expectFail("can't pay a supplier more than owed", "pay_supplier", { p_supplier_id: bulk, p_amount: 7001, p_via: "bank" }, "أكتر من اللي ليه (7,000)");
await expectFail("supplier phone already used", "add_supplier", { p_name: "تاني", p_phone: "01000000001" }, "لمورد موجود");
const phones = await rpc("add_supplier", { p_name: "مورد الموبايلات", p_phone: "01000000002" });

// ---------------------------------------------------------------- receiving stock
const caseId = await rpc("add_product", { p_name: "جراب سيليكون", p_brand: "", p_category: "accessory", p_retail_price: 150 });
await expectFail("same product name", "add_product", { p_name: "جراب سيليكون", p_brand: "", p_category: "accessory", p_retail_price: 150 }, "فيه منتج بنفس الاسم");
await expectFail("barcode taken", "add_product", { p_name: "جراب تاني", p_brand: "", p_category: "accessory", p_retail_price: 150, p_barcode: "6900000000011" }, "الباركود ده متسجّل");
const inv = await rpc("receive_delivery", {
  p_supplier_id: phones,
  p_lines: [
    { product_id: caseId, quantity: 10, unit_cost: 30 },
    { product_id: P["كابل Type-C"], quantity: 10, unit_cost: 60 },
    { product_id: P["iPhone 15 128GB"], imeis: ["356000000000009"], unit_cost: 41000 },
  ],
  p_paid: 500,
  p_via: "cash",
  p_supplier_ref: "F-77",
});
drawer -= 500;
ok(`delivery invoice #${inv.number}: 300 + 600 + 41,000 = 41,900`, N(inv.total) === 41900);
const cable = await one(`select quantity, avg_cost from public.product_stock where product_id = $1`, [P["كابل Type-C"]]);
ok(`cable: 15 at 50 + 10 at 60 → 25 at 54 (${cable.quantity} at ${cable.avg_cost})`, N(cable.quantity) === 25 && N(cable.avg_cost) === 54);
await as(U.owner);
const supplierOwed = await one(`select private.supplier_balance($1) as b`, [phones]).catch((e) => ({ err: e.message }));
await root();
ok("supplier owed 41,900 − 500 paid = 41,400", N((await one(`select private.supplier_balance($1) as b`, [phones])).b) === 41400);
ok("…and the first supplier 10,000 − 3,000 = 7,000", N((await one(`select private.supplier_balance($1) as b`, [bulk])).b) === 7000);
ok("helpers can't be called by staff directly", supplierOwed.err && /permission denied/.test(supplierOwed.err), JSON.stringify(supplierOwed));
await as(U.mohamed);
await expectFail("an IMEI already in the system", "receive_delivery", { p_supplier_id: phones, p_lines: [{ product_id: P["iPhone 15 128GB"], imeis: ["356000000000003"], unit_cost: 40000 }] }, "متسجّل قبل كده");
await expectFail("an IMEI that isn't 15 digits", "receive_delivery", { p_supplier_id: phones, p_lines: [{ product_id: P["iPhone 15 128GB"], imeis: ["12345"], unit_cost: 40000 }] }, "15 رقم");
await expectFail("paid more than the invoice", "receive_delivery", { p_supplier_id: phones, p_lines: [{ product_id: caseId, quantity: 1, unit_cost: 30 }], p_paid: 31 }, "أكتر من الفاتورة");
ok("failed deliveries left nothing behind", (await one(`select count(*)::int as n from public.purchase_invoices`)).n === 1);

// ---------------------------------------------------------------- buying a used phone (buy-back of a phone sold today)
const seller = { name: "مشتري آيفون", phone: "01700000001", national_id: "29801011234567" };
const insp = { batteryHealth: 88, screen: "excellent", body: "good", hasBox: true, hasCharger: false };
await expectFail("a used phone can't take a new model's name", "buy_used_phone", { p_product_name: "iPhone 15 128GB", p_brand: "Apple", p_imei: "356000000000001", p_price: 20000, p_retail_price: 25000, p_seller: seller, p_inspection: insp }, "زوّد «مستعمل»");
await expectFail("a phone on the shelf can't be bought", "buy_used_phone", { p_product_name: "iPhone 15 مستعمل", p_brand: "Apple", p_imei: "356000000000003", p_price: 20000, p_retail_price: 25000, p_seller: seller, p_inspection: insp }, "موجود في المخزن");
await expectFail("seller's national ID required", "buy_used_phone", { p_product_name: "iPhone 15 مستعمل", p_brand: "Apple", p_imei: "356000000000001", p_price: 20000, p_retail_price: 25000, p_seller: { ...seller, national_id: "" }, p_inspection: insp }, "بيانات البائع ناقصة");
await expectFail("selling price must be above the buying price", "buy_used_phone", { p_product_name: "iPhone 15 مستعمل", p_brand: "Apple", p_imei: "356000000000001", p_price: 20000, p_retail_price: 20000, p_seller: seller, p_inspection: insp }, "سعر البيع لازم");
const usedProduct = await rpc("buy_used_phone", { p_product_name: "iPhone 15 مستعمل", p_brand: "Apple", p_imei: "356000000000001", p_price: 20000, p_retail_price: 25000, p_seller: seller, p_inspection: insp });
drawer -= 20000;
const bought = await one(`select * from public.phone_units where imei = '356000000000001'`);
ok("bought back: same IMEI, used, in stock, own price, earlier sale kept",
  bought.status === "in_stock" && bought.condition === "used" && N(bought.retail_price) === 25000 && bought.product_id === usedProduct && bought.past_order_ids.includes(s4.id) && bought.sold_order_id === null);
ok("seller is the same customer (by phone), national ID filled in", (await one(`select count(*)::int as n, max(national_id) as nid from public.contacts where kind = 'customer' and phone = '01700000001'`)).nid === "29801011234567");

// ---------------------------------------------------------------- returns
await expectFail("return needs a reason", "return_order", { p_order_id: s1.id, p_reason: "  " }, "اكتب سبب المرتجع");
let preview = await rpc("refund_preview", { p_order_id: s2.id });
ok("preview: overpaid sale gives back all 250 in cash", N(preview.cash) === 250 && N(preview.total) === 250);
let back = await rpc("return_order", { p_order_id: s1.id, p_reason: "العميل غيّر رأيه" });
drawer -= 750;
ok("cash sale returned: 750 back from the drawer, stock 9 → 10", N(back.cash) === 750 && N((await one(`select quantity from public.product_stock where product_id = $1`, [P["شاحن Anker"]])).quantity) === 10);
const o1 = await one(`select status, return_reason, returned_by from public.orders where id = $1`, [s1.id]);
ok("invoice marked returned with the reason and who did it", o1.status === "returned" && o1.return_reason === "العميل غيّر رأيه" && o1.returned_by === mohamedId);
await expectFail("can't return twice", "return_order", { p_order_id: s1.id, p_reason: "تاني" }, "اترجعت قبل كده");
await expectFail("can't return a phone the shop has since bought back", "return_order", { p_order_id: s4.id, p_reason: "عطل" }, "اتشرى تاني");

back = await rpc("return_order", { p_order_id: s3.id, p_reason: "مقاس غلط" });
drawer -= 100;
const credMoves = await q(`select cash from public.cash_movements where kind = 'credit_collection' and contact_id = $1 order by created_at, cash desc`, [credCust]);
ok(`partly on account: paid 60 + paid off 40 → 100 back, the 40 as a reversed collection (${credMoves.map((m) => N(m.cash)).join(", ")})`, N(back.from_account) === 40 && credMoves.map((m) => N(m.cash)).join(",") === "40,-40");
await root();
ok("customer's account ends at 0", N((await one(`select private.credit_balance($1) as b`, [credCust])).b) === 0);
await as(U.mohamed);

back = await rpc("return_order", { p_order_id: s6.id, p_reason: "الزبون مقدرش يكمل" });
drawer -= 21000;
ok(`installment sale returned: down 15,000 + 6,000 cash back, 7,000 to the wallet, markup 2,167 reversed (${back.cash}/${back.wallet}/${back.markup})`, N(back.cash) === 21000 && N(back.wallet) === 7000 && N(back.markup) === 2167);
ok("plan cancelled, phone back on the shelf", (await one(`select cancelled_at from public.installment_plans where id = $1`, [plan.id])).cancelled_at !== null && (await one(`select status from public.phone_units where imei = '356000000000002'`)).status === "in_stock");
const refundMove = await one(`select commission, description, plan_id from public.cash_movements where kind = 'refund' and order_id = $1`, [s6.id]);
ok(`refund movement: ${refundMove.description}`, N(refundMove.commission) === -2167 && refundMove.plan_id === plan.id && refundMove.description.includes("منها أقساط اتدفعت 13,000"));
await expectFail("no installments on a returned sale", "pay_installment", { p_plan_id: plan.id, p_amount: 100, p_method: "cash" }, "اترجعت");

back = await rpc("return_order", { p_order_id: s5.id, p_reason: "معرفناش نعملها", p_via: "wallet" });
ok("refund another way: paid cash, given back by Vodafone Cash", N(back.wallet) === 100 && N(back.cash) === 0);

// ---------------------------------------------------------------- closing (wallet counted 30 short)
await as(U.karim);
await expectFail("another employee can't close Mohamed's shift", "close_shift", { p_counted: 1, p_count: { wallet: 1, machines: { fawry_airtime: 1, fawry_general: 1, momkn: 1 } } }, "مش بتاعتك");
await root();
const walletNow = N((await one(`select private.wallet_balance('main') as b`)).b);
const sumCash = N((await one(`select private.expected_cash($1) as c`, [shift1])).c);
ok(`wallet: 17,500 + 7,000 − 1,000 + 500 − 1,000 − 606 − 7,000 − 100 = 15,294 (${walletNow})`, walletNow === 15294);
ok(`expected drawer matches the independent tally (${drawer} / ${sumCash})`, sumCash === drawer);
await as(U.mohamed);
const closed = await rpc("close_shift", { p_counted: drawer, p_count: { wallet: walletNow - 30, machines: { fawry_airtime: 4010, fawry_general: 1905, momkn: 1500 } } });
ok("closed: expected cash stored, counts and what the system expected", N(closed.expected_cash) === drawer && N(closed.counted_cash) === drawer && N(closed.closing_expected.wallet) === walletNow && N(closed.closing_expected.machines.fawry_general) === 1905);
const adj = await q(`select wallet, topup, shift_id, description from public.cash_movements where kind = 'count_adjustment'`);
ok(`only the wallet differed: −30 recorded in the shift (${adj.map((a) => a.description).join(" | ")})`, adj.length === 1 && N(adj[0].wallet) === -30 && adj[0].shift_id === shift1);
await expectFail("after closing: nothing until a shift opens", "record_expense", { p_category: "كهرباء", p_amount: 10 }, "افتح الوردية الأول");

// ---------------------------------------------------------------- the owner without a shift
await expectFail("employees can't pay salaries", "pay_salary", { p_employee_id: karimId, p_month: "2026-10", p_via: "wallet" }, "دي للمالك بس");
await as(U.owner);
await expectFail("owner: cash needs an open shift", "record_owner_movement", { p_kind: "owner_drawing", p_amount: 100 }, "الكاش من الدرج محتاج وردية مفتوحة");
const pay = await rpc("pay_salary", { p_employee_id: karimId, p_month: "2026-10", p_via: "wallet" });
ok(`salary 5,000 less the 500 advance → 4,500 from the wallet`, N(pay.advances) === 500 && N(pay.net) === 4500);
await expectFail("a month's salary paid once", "pay_salary", { p_employee_id: karimId, p_month: "2026-10", p_via: "bank" }, "اتصرف قبل كده");
await expectFail("salary month format", "pay_salary", { p_employee_id: karimId, p_month: "10-2026", p_via: "bank" }, "الشهر غلط");
await expectFail("salary in cash with no shift open", "pay_salary", { p_employee_id: mohamedId, p_month: "2026-10", p_via: "cash" }, "الكاش من الدرج محتاج وردية مفتوحة");
ok("the failed cash salary left no payroll row", (await one(`select count(*)::int as n from public.payroll where employee_id = $1`, [mohamedId])).n === 0);

// prices
await rpc("reprice_product", { p_product_id: P["iPhone 15 128GB"], p_retail_price: 46000, p_unit_cost: 41000 });
const reval = await one(`select qty, old_cost, amount from public.revaluations`);
ok(`re-costing 3 iPhones in stock (40,000 + 40,000 + 41,000 → 3 × 41,000): +2,000 (${reval?.amount})`, N(reval.qty) === 3 && N(reval.old_cost) === 121000 && N(reval.amount) === 2000);
await rpc("reprice_product", { p_product_id: usedProduct, p_retail_price: 26000 });
ok("used phones with their own price take the model's new price", N((await one(`select retail_price from public.phone_units where imei = '356000000000001'`)).retail_price) === 26000);
const changed = await rpc("reprice_category", { p_category: "accessory", p_percent: 10 });
const prices = Object.fromEntries((await q(`select name, retail_price from public.products where category = 'accessory'`)).map((p) => [p.name, N(p.retail_price)]));
ok(`accessories +10%, rounded to 5 (${JSON.stringify(prices)})`, changed === 3 && prices["شاحن Anker"] === 825 && prices["كابل Type-C"] === 110 && prices["جراب سيليكون"] === 165);

// settings and services
await rpc("update_settings", { p_bonus_percent: { fawry_airtime: 2 }, p_employee_lend_limit: 1500, p_agent_phones: { fawry: "01012345678" } });
const st = await one(`select bonus_percent, employee_lend_limit, agent_phones, shop_name from public.settings`);
ok("settings: bonus merged, limit, agent phone; untouched fields kept", N(st.bonus_percent.fawry_airtime) === 2 && N(st.bonus_percent.momkn) === 0 && N(st.employee_lend_limit) === 1500 && st.agent_phones.fawry === "01012345678" && st.shop_name === "موجه للموبايلات");
await expectFail("bad bonus key", "update_settings", { p_bonus_percent: { visa: 3 } }, "نسبة البونص غلط");
await rpc("set_services", { p_services: [{ id: firstService, name: "عمل حساب جوجل / متجر" }, { name: "تركيب سكرينة" }] });
const svcs = await q(`select name, sort, active from public.services order by active desc, sort`);
ok("services: kept one, added one, hid the other four", svcs.filter((x) => x.active).map((x) => x.name).join(" | ") === "عمل حساب جوجل / متجر | تركيب سكرينة" && svcs.filter((x) => !x.active).length === 4);

// staff
const ownerId = (await one(`select id from public.staff where username = 'owner'`)).id;
await expectFail("the last owner can't become an employee", "update_staff", { p_id: ownerId, p_role: "employee" }, "لازم يفضل مالك");
await expectFail("the last owner can't be stopped", "update_staff", { p_id: ownerId, p_active: false }, "لازم يفضل مالك");
await expectFail("username taken (edit)", "update_staff", { p_id: karimId, p_username: "mohamed" }, "مستخدم لموظف تاني");
await rpc("update_staff", { p_id: mohamedId, p_phone: "", p_salary: 6500 });
await root();
const m = await one(`select phone, salary from public.staff where id = $1`, [mohamedId]);
ok("edit: phone cleared, salary changed", m.phone === null && N(m.salary) === 6500);
await as(U.owner);
await expectFail("someone with records can't be deleted", "delete_staff", { p_id: karimId }, "اوقفه بدل ما تمسحه");
await expectFail("can't delete yourself", "delete_staff", { p_id: ownerId }, "مينفعش تمسح نفسك");
const temp = await rpc("add_staff", { p_name: "تجربة", p_role: "employee", p_username: "temp" });
await rpc("delete_staff", { p_id: temp });
ok("someone with no records is deleted", (await one(`select count(*)::int as n from public.staff where id = $1`, [temp])).n === 0);

// ---------------------------------------------------------------- the next shift (Karim) and a handover
await as(U.karim);
const loaded2 = await rpc("record_agent_load", { p_machine_id: "fawry", p_balance_id: "fawry_airtime", p_amount: 1000 });
ok(`new bonus applies: 1,000 → 1,020 (${loaded2})`, N(loaded2) === 1020);
const shift2 = await rpc("open_shift", { p_float: drawer - 20, p_count: { wallet: walletNow - 30 - 4500 + 10, machines: { fawry_airtime: 4010 + 1020 - 5, fawry_general: 1905, momkn: 1500 } } });
s = await one(`select * from public.shifts where id = $1`, [shift2]);
ok("Karim's opening expects Mohamed's counted cash and the adjusted wallet", N(s.opening_expected.cash) === drawer && N(s.opening_expected.wallet) === walletNow - 30 - 4500 && s.previous_employee_id === mohamedId);
const adj2 = await q(`select wallet, topup, balance_id from public.cash_movements where kind = 'count_adjustment' and shift_id = $1 order by balance_id nulls first`, [shift2]);
ok(`opening differences recorded: wallet +10, Air time −5 (${JSON.stringify(adj2.map((a) => [N(a.wallet), N(a.topup), a.balance_id]))})`, adj2.length === 2 && N(adj2[0].wallet) === 10 && N(adj2[1].topup) === -5);
await as(U.owner);
const closed2 = await rpc("close_shift", { p_counted: drawer - 20, p_count: { wallet: walletNow - 30 - 4500 + 10, machines: { fawry_airtime: 4010 + 1020 - 5, fawry_general: 1905, momkn: 1500 } } });
ok("the owner can close an employee's shift", closed2.closed_at !== null && closed2.employee_id === karimId);

const { pass, fail } = results();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
