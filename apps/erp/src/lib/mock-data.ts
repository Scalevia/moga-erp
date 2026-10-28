// Deterministic demo data so every screen has something realistic to show.
// Replaced by Supabase queries once the backend is connected.

import type {
  CashMovement,
  Contact,
  Employee,
  InstallmentPlan,
  LentOut,
  Loan,
  Order,
  OrderItem,
  PhoneUnit,
  Product,
  BalanceId,
  MachineId,
  PayrollEntry,
  PurchaseInvoice,
  Shift,
  ShopSettings,
} from "./types";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const rand = rng(42);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));

function makeImei(): string {
  let s = "35";
  for (let i = 0; i < 13; i++) s += Math.floor(rand() * 10);
  return s;
}

export const initialStaff: Employee[] = [
  { id: "emp-owner", name: "المالك", role: "admin", salary: 0, active: true, username: "owner", password: "1234" },
  { id: "emp-1", name: "محمد سامي", role: "employee", phone: "01011111111", salary: 6000, active: true, username: "mohamed", password: "1111" },
  { id: "emp-2", name: "كريم عادل", role: "employee", phone: "01022222222", salary: 5500, active: true, username: "karim", password: "2222" },
];

export const initialSettings: ShopSettings = {
  shopName: "موجه للموبايلات",
  address: "شارع الجمهورية — أمام البنك الأهلي",
  phone: "0100 000 0000",
  warranty: "ضمان الموبايلات الجديدة حسب ضمان الوكيل. المستعمل ضمان 14 يوم ضد عيوب التشغيل. الإكسسوارات بدون ضمان بعد الخروج من المحل.",
  usedWarrantyDays: 14,
  agentVfFeePercent: 1,
  employeeLendLimit: 1000,
};

export const initialContacts: Contact[] = [
  { id: "sup-1", kind: "supplier", name: "يتاجر", phone: "01000000001" },
  { id: "sup-2", kind: "supplier", name: "النور للموبايلات", phone: "01000000002" },
  { id: "sup-3", kind: "supplier", name: "مخزن الإكسسوارات", phone: "01000000003" },
  { id: "len-1", kind: "lender", name: "الحاج سعيد", phone: "01100000001" },
  { id: "len-2", kind: "lender", name: "عمرو (صديق)", phone: "01100000002" },
  { id: "cus-1", kind: "customer", name: "أحمد فتحي", phone: "01012345678", nationalId: "29801011234567" },
  { id: "cus-2", kind: "customer", name: "منى إبراهيم", phone: "01123456789", nationalId: "29505051234567" },
  { id: "cus-3", kind: "customer", name: "يوسف خالد", phone: "01234567890", nationalId: "30002021234567" },
  { id: "cus-4", kind: "customer", name: "سارة محمود", phone: "01555555555" },
  { id: "bor-1", kind: "borrower", name: "محمود (البقال اللي جنبنا)", phone: "01200000001" },
  { id: "bor-2", kind: "borrower", name: "عم سيد (السايس)", phone: "01200000002" },
  { id: "gua-1", kind: "guarantor", name: "خالد فتحي", phone: "01099999999", nationalId: "27001011234567" },
];

export const initialProducts: Product[] = [
  { id: "p-a16", name: "Samsung Galaxy A16 128GB", brand: "Samsung", category: "new_phone", tracking: "imei", retailPrice: 8499, avgCost: 0, quantity: 0 },
  { id: "p-a26", name: "Samsung Galaxy A26 256GB", brand: "Samsung", category: "new_phone", tracking: "imei", retailPrice: 12999, avgCost: 0, quantity: 0 },
  { id: "p-rn14", name: "Xiaomi Redmi Note 14 256GB", brand: "Xiaomi", category: "new_phone", tracking: "imei", retailPrice: 11499, avgCost: 0, quantity: 0 },
  { id: "p-r13", name: "Xiaomi Redmi 13 128GB", brand: "Xiaomi", category: "new_phone", tracking: "imei", retailPrice: 6999, avgCost: 0, quantity: 0 },
  { id: "p-oa3", name: "OPPO A3x 128GB", brand: "OPPO", category: "new_phone", tracking: "imei", retailPrice: 6299, avgCost: 0, quantity: 0 },
  { id: "p-rc75", name: "realme C75 256GB", brand: "realme", category: "new_phone", tracking: "imei", retailPrice: 8999, avgCost: 0, quantity: 0 },
  { id: "p-ip13u", name: "iPhone 13 128GB (مستعمل)", brand: "Apple", category: "used_phone", tracking: "imei", retailPrice: 19500, avgCost: 0, quantity: 0 },
  { id: "p-s22u", name: "Samsung S22 Ultra (مستعمل)", brand: "Samsung", category: "used_phone", tracking: "imei", retailPrice: 17500, avgCost: 0, quantity: 0 },
  { id: "p-n105", name: "Nokia 105", brand: "Nokia", category: "feature_phone", tracking: "quantity", barcode: "6438409012345", retailPrice: 650, avgCost: 520, quantity: 18 },
  { id: "p-it2", name: "itel it2163", brand: "itel", category: "feature_phone", tracking: "quantity", barcode: "6937014112233", retailPrice: 480, avgCost: 380, quantity: 25 },
  { id: "p-chg", name: "شاحن Anker 20W Type-C", brand: "Anker", category: "accessory", tracking: "quantity", barcode: "0194644098765", retailPrice: 750, avgCost: 520, quantity: 12 },
  { id: "p-cbl", name: "كابل Type-C to Type-C 1m", brand: "Joyroom", category: "accessory", tracking: "quantity", barcode: "6956116711111", retailPrice: 150, avgCost: 70, quantity: 60 },
  { id: "p-case", name: "جراب سيليكون شفاف", brand: "Generic", category: "accessory", tracking: "quantity", barcode: "6200000000011", retailPrice: 100, avgCost: 30, quantity: 85 },
  { id: "p-scr", name: "اسكرينة زجاج 9D", brand: "Generic", category: "accessory", tracking: "quantity", barcode: "6200000000028", retailPrice: 80, avgCost: 15, quantity: 140 },
  { id: "p-ear", name: "سماعة Bluetooth Lenovo LP40", brand: "Lenovo", category: "accessory", tracking: "quantity", barcode: "6970000000035", retailPrice: 450, avgCost: 260, quantity: 20 },
  { id: "p-pb", name: "باور بانك 10000mAh", brand: "Oraimo", category: "accessory", tracking: "quantity", barcode: "6970000000042", retailPrice: 950, avgCost: 700, quantity: 9 },
];

const phoneCost: Record<string, [number, number]> = {
  "p-a16": [7500, 7800],
  "p-a26": [11400, 11800],
  "p-rn14": [10100, 10400],
  "p-r13": [6000, 6250],
  "p-oa3": [5400, 5650],
  "p-rc75": [7900, 8150],
  "p-ip13u": [15500, 17000],
  "p-s22u": [13500, 15000],
};

const DAY = 86400000;
// Anchored to today (12:00 Cairo) so the current month always has data.
const today = new Date();
const NOW = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 9);
export const DEMO_NOW = new Date(NOW).toISOString();

function isoDaysAgo(days: number, hour = between(11, 22)): string {
  const d = new Date(NOW - days * DAY);
  d.setUTCHours(hour - 3, between(0, 59), 0, 0);
  return d.toISOString();
}

function supplierFor(productId: string) {
  return productId.startsWith("p-ip") || productId.startsWith("p-s22")
    ? undefined
    : pick(["sup-1", "sup-2"]);
}

function usedInspection() {
  return {
    batteryHealth: between(78, 96),
    screen: pick(["excellent", "excellent", "scratches"] as const),
    body: pick(["excellent", "good", "good", "worn"] as const),
    hasBox: rand() > 0.5,
    hasCharger: rand() > 0.4,
  };
}

// --- Stock currently on the shelf ---------------------------------------
const units: PhoneUnit[] = [];
for (const [productId, [lo, hi]] of Object.entries(phoneCost)) {
  const used = productId === "p-ip13u" || productId === "p-s22u";
  const count = used ? 2 : between(2, 5);
  for (let i = 0; i < count; i++) {
    units.push({
      imei: makeImei(),
      productId,
      condition: used ? "used" : "new",
      cost: between(lo, hi),
      status: "in_stock",
      supplierId: supplierFor(productId),
      purchasedAt: isoDaysAgo(between(2, 40)),
      inspection: used ? usedInspection() : undefined,
    });
  }
}

// --- 12 months of history, growing slowly ------------------------------
const orders: Order[] = [];
let orderNo = 1000;
const customers = ["cus-1", "cus-2", "cus-3", "cus-4", undefined];
const sampleServices = [
  { id: "svc-google", name: "عمل حساب جوجل / متجر", prices: [50, 75, 100], cost: 0, note: "حساب جوجل وتفعيل بلاي ستور" },
  { id: "svc-apps", name: "تحميل برامج وألعاب", prices: [30, 50, 75], cost: 0, note: "واتساب، فيسبوك، 3 ألعاب" },
  { id: "svc-transfer", name: "نقل بيانات من موبايل لموبايل", prices: [75, 100, 150], cost: 0, note: "صور وأرقام وواتساب" },
  { id: "svc-software", name: "تحديث سوفت وير / فورمات", prices: [100, 150, 200], cost: 0, note: "فورمات وتحديث لآخر إصدار" },
  { id: "svc-other", name: "خدمة تانية", prices: [150, 250], cost: 80, note: "كارت شحن لعبة PUBG" },
];

for (let day = 365; day >= 1; day--) {
  const growth = 1 + (365 - day) / 365 * 0.45;
  const monthDay = new Date(NOW - day * DAY).getUTCDate();
  const eidBoost = monthDay > 25 ? 1.15 : 1;
  const perDay = Math.round((2 + rand() * 4) * growth * eidBoost);

  for (let k = 0; k < perDay; k++) {
    const items: OrderItem[] = [];
    const roll = rand();
    if (roll > 0.94) {
      // Shop services: no stock, the employee entered cost and price.
      const svc = pick(sampleServices);
      const price = pick(svc.prices);
      items.push({ productId: svc.id, name: svc.name, category: "service", qty: 1, note: svc.note, listPrice: price, unitPrice: price, unitCost: svc.cost });
    } else if (roll < 0.35) {
      const pid = pick(Object.keys(phoneCost));
      const product = initialProducts.find((p) => p.id === pid)!;
      const [lo, hi] = phoneCost[pid];
      const cost = between(lo, hi);
      // Most phones sell at the shelf price; some get a discount rounded to 50.
      const price = rand() < 0.55 ? product.retailPrice : product.retailPrice - Math.round(between(0, product.retailPrice * 0.05) / 50) * 50;
      const imei = makeImei();
      units.push({
        imei,
        productId: pid,
        condition: product.category === "used_phone" ? "used" : "new",
        cost,
        status: "sold",
        supplierId: supplierFor(pid),
        purchasedAt: isoDaysAgo(day + between(1, 20)),
        inspection: product.category === "used_phone" ? usedInspection() : undefined,
        soldOrderId: `ord-${orderNo}`,
      });
      items.push({ productId: pid, name: product.name, category: product.category, imei, qty: 1, listPrice: product.retailPrice, unitPrice: price, unitCost: cost });
      if (rand() < 0.5) {
        const accId = pick(["p-case", "p-scr", "p-cbl"]);
        const acc = initialProducts.find((p) => p.id === accId)!;
        items.push({ productId: acc.id, name: acc.name, category: acc.category, qty: 1, listPrice: acc.retailPrice, unitPrice: acc.retailPrice, unitCost: acc.avgCost });
      }
    } else {
      const qtyItems = initialProducts.filter((p) => p.tracking === "quantity");
      const n = between(1, 2);
      for (let j = 0; j < n; j++) {
        const p = pick(qtyItems);
        items.push({ productId: p.id, name: p.name, category: p.category, qty: between(1, 2), listPrice: p.retailPrice, unitPrice: rand() < 0.7 ? p.retailPrice : p.retailPrice - Math.round(between(0, p.retailPrice * 0.15) / 5) * 5, unitCost: p.avgCost });
      }
    }
    const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const method = pick(["cash", "cash", "cash", "vodafone_cash", "instapay", "card"] as const);
    orders.push({
      id: `ord-${orderNo}`,
      number: orderNo,
      createdAt: isoDaysAgo(day),
      employeeId: pick(["emp-1", "emp-2"]),
      shiftId: `shift-hist-${day}`,
      customerId: items.some((i) => i.imei) ? pick(customers) : undefined,
      items,
      payments: [{ method, amount: total }],
      status: rand() < 0.01 ? "returned" : "completed",
    });
    orderNo++;
  }
}

// --- Installment plans --------------------------------------------------
function schedule(total: number, months: number, start: number, paidCount: number) {
  const each = Math.round(total / months);
  return Array.from({ length: months }, (_, i) => ({
    n: i + 1,
    dueDate: new Date(start + (i + 1) * 30 * DAY).toISOString(),
    amount: i === months - 1 ? total - each * (months - 1) : each,
    paid: i < paidCount ? each : 0,
  }));
}

export const initialPlans: InstallmentPlan[] = [
  {
    id: "plan-1", orderId: orders[orders.length - 120].id, customerId: "cus-1", guarantorId: "gua-1",
    cashPrice: 12999, downPayment: 3000, markupPercent: 20, months: 10, startDate: isoDaysAgo(125),
    schedule: schedule(Math.round((12999 - 3000) * 1.2), 10, NOW - 125 * DAY, 3),
  },
  {
    id: "plan-2", orderId: orders[orders.length - 60].id, customerId: "cus-2",
    cashPrice: 8499, downPayment: 2000, markupPercent: 15, months: 6, startDate: isoDaysAgo(70),
    schedule: schedule(Math.round((8499 - 2000) * 1.15), 6, NOW - 70 * DAY, 2),
  },
  {
    id: "plan-3", orderId: orders[orders.length - 20].id, customerId: "cus-3",
    cashPrice: 19500, downPayment: 6000, markupPercent: 25, months: 12, startDate: isoDaysAgo(20),
    schedule: schedule(Math.round((19500 - 6000) * 1.25), 12, NOW - 20 * DAY, 0),
  },
];

// A neighbour borrowed 200 two days ago "until tomorrow" and hasn't returned it yet.
export const initialLentOut: LentOut[] = [
  { id: "lent-1", borrowerId: "bor-1", amount: 200, repaid: 0, givenAt: isoDaysAgo(2, 16), dueDate: isoDaysAgo(1, 12).slice(0, 10), givenBy: "emp-2", notes: "لحد بكره" },
  {
    id: "lent-2", borrowerId: "bor-2", amount: 500, repaid: 300, givenAt: isoDaysAgo(12, 13), dueDate: isoDaysAgo(5, 12).slice(0, 10), givenBy: "emp-1", notes: "لحد أول الشهر",
    history: [{ at: isoDaysAgo(6, 18), type: "repaid", amount: 300, by: "emp-1", via: "cash" }],
  },
];

export const initialLoans: Loan[] = [
  {
    id: "loan-1", lenderId: "len-1", amount: 50000, repaid: 20000, receivedAt: isoDaysAgo(160), receivedBy: "emp-owner", notes: "لشراء بضاعة العيد",
    history: [
      { at: isoDaysAgo(120, 19), type: "repaid", amount: 10000, by: "emp-owner", via: "cash" },
      { at: isoDaysAgo(60, 19), type: "repaid", amount: 10000, by: "emp-owner", via: "cash" },
    ],
  },
  { id: "loan-2", lenderId: "len-2", amount: 15000, repaid: 0, receivedAt: isoDaysAgo(25) },
];

export const openingBalances = {
  wallet: 18500,
  machines: { fawry_airtime: 1500, fawry_general: 500, momkn: 1200 } as Record<BalanceId, number>,
  reps: { fawry: 0, momkn: 0 } as Record<MachineId, number>,
  // Fawry adds 1% on Air time top-ups: pay 1,000 → 1,010 on the Air time balance.
  bonusPercent: { fawry_airtime: 1, fawry_general: 0, momkn: 0 } as Record<BalanceId, number>,
  bank: 42000,
  supplierPayables: { "sup-1": 36000, "sup-2": 12500, "sup-3": 4200 } as Record<string, number>,
  savings: 24000,
  fixedAssets: 65000,
};

// Yesterday's shift reuses the id of yesterday's historical orders so its cash sales count.
const YESTERDAY = "shift-hist-1";

export const initialMovements: CashMovement[] = [
  // Fawry agent loaded 5,000 on credit two days ago — the shop still owes him.
  { id: "mv-0", createdAt: isoDaysAgo(2, 13), shiftId: "shift-hist-2", employeeId: "emp-2", kind: "rep_load", cash: 0, wallet: 0, topup: 5050, commission: 50, machineId: "fawry", balanceId: "fawry_airtime", rep: -5000, description: "مندوب فوري شحن Air time 5,000 + بونص 50 (على الحساب)" },
  // Mohamed took a 500 advance this month — deducted from his salary at month end.
  { id: "mv-adv", createdAt: isoDaysAgo(3, 13), shiftId: "shift-hist-3", employeeId: "emp-owner", kind: "employee_advance", cash: -500, wallet: 0, topup: 0, commission: 0, targetEmployeeId: "emp-1", description: "سلفة محمد سامي" },
  { id: "mv-1", createdAt: isoDaysAgo(1, 12), shiftId: YESTERDAY, employeeId: "emp-1", kind: "expense", cash: -150, wallet: 0, topup: 0, commission: 0, category: "بوفيه", description: "بوفيه — شاي وقهوة" },
  // The neighbour's 200 left the drawer in an older shift, already reflected in the opening balances.
  { id: "mv-lent", createdAt: isoDaysAgo(2, 16), shiftId: "shift-hist-2", employeeId: "emp-2", kind: "lent_out", cash: 0, wallet: 0, topup: 0, commission: 0, description: "سلفة لـ محمود (البقال اللي جنبنا) — لحد بكره" },
  { id: "mv-2", createdAt: isoDaysAgo(1, 14), shiftId: YESTERDAY, employeeId: "emp-1", kind: "vf_deposit", cash: 1010, wallet: -1000, topup: 0, commission: 10, description: "إيداع لعميل 01012223334" },
  // Momkn agent loaded 3,000 on credit yesterday and was paid from the drawer at closing.
  { id: "mv-3", createdAt: isoDaysAgo(1, 15), shiftId: YESTERDAY, employeeId: "emp-1", kind: "rep_load", cash: 0, wallet: 0, topup: 3000, commission: 0, machineId: "momkn", balanceId: "momkn", rep: -3000, description: "مندوب ممكن شحن 3,000" },
  { id: "mv-4", createdAt: isoDaysAgo(1, 22), shiftId: YESTERDAY, employeeId: "emp-1", kind: "rep_payment", cash: -3000, wallet: 0, topup: 0, commission: 0, machineId: "momkn", rep: 3000, description: "دفع لمندوب ممكن" },
];

// Service history: one summary line per service per day. Their effect on the drawer, wallet and
// machines is already folded into the opening balances, so only the profit (commission) is kept.
const serviceHistory: CashMovement[] = [];
const summary = (day: number, kind: CashMovement["kind"], commission: number, description: string, extra: Partial<CashMovement> = {}) =>
  serviceHistory.push({
    id: `svc-${day}-${serviceHistory.length}`,
    createdAt: isoDaysAgo(day, 22),
    shiftId: `shift-hist-${day}`,
    employeeId: pick(["emp-1", "emp-2"]),
    kind,
    cash: 0,
    wallet: 0,
    topup: 0,
    commission,
    description,
    ...extra,
  });

for (let day = 365; day >= 2; day--) {
  const growth = 1 + ((365 - day) / 365) * 0.4;
  const vfOps = Math.round(between(4, 10) * growth);
  let vf = 0;
  for (let i = 0; i < vfOps; i++) vf += between(5, 15);
  summary(day, "vf_deposit", vf, `ملخص فودافون كاش — ${vfOps} عملية`);
  if (rand() < 0.15) summary(day, "wallet_liquidation", -between(10, 30), "رسوم تسييل المحفظة");

  const bills = Math.round(between(3, 9) * growth);
  summary(day, "topup_sale", bills * between(2, 5), `ملخص فواتير فوري — ${bills} عملية`, { machineId: "fawry", balanceId: "fawry_general" });
  const momkn = Math.round(between(1, 5) * growth);
  summary(day, "topup_sale", momkn * between(2, 4), `ملخص خدمات ممكن — ${momkn} عملية`, { machineId: "momkn", balanceId: "momkn" });

  // Monthly running costs, paid from the drawer of that day's (historic) shift.
  const monthDay = new Date(NOW - day * DAY).getUTCDate();
  const bill = (category: string, amount: number, note: string) =>
    serviceHistory.push({ id: `exp-${day}-${category}`, createdAt: isoDaysAgo(day, 13), shiftId: `shift-hist-${day}`, employeeId: "emp-owner", kind: "expense", cash: -amount, wallet: 0, topup: 0, commission: 0, category, description: `${category} — ${note}` });
  if (monthDay === 1) bill("إيجار", 8000, "إيجار المحل");
  if (monthDay === 5) bill("كهرباء", between(900, 1600), "فاتورة الكهربا");
  if (monthDay === 10) bill("إنترنت", 450, "الراوتر");
  if (day % 7 === 0) bill("بوفيه", between(150, 300), "شاي وقهوة ومية");

  if (day % 5 === 0) {
    const load = between(3, 8) * 1000;
    summary(day, "rep_load", load / 100, `بونص فوري على شحن Air time ${load.toLocaleString("en")}`, { machineId: "fawry", balanceId: "fawry_airtime" });
  }
}
initialMovements.unshift(...serviceHistory);

const yesterdayExpected =
  2000 +
  orders.filter((o) => o.shiftId === YESTERDAY).flatMap((o) => o.payments).filter((p) => p.method === "cash").reduce((a, p) => a + p.amount, 0) +
  initialMovements.filter((m) => m.shiftId === YESTERDAY).reduce((a, m) => a + m.cash, 0);

// Closed last night: the count matched and everything stays in the drawer for today's shift.
export const initialShifts: Shift[] = [
  {
    id: YESTERDAY,
    employeeId: "emp-1",
    openedAt: isoDaysAgo(1, 10),
    openingFloat: 2000,
    closedAt: isoDaysAgo(1, 23),
    countedCash: yesterdayExpected,
    expectedCash: yesterdayExpected,
    closingCount: { wallet: 17500, machines: { fawry_airtime: 6550, fawry_general: 500, momkn: 4200 } },
  },
];

// --- Supplier deliveries behind the stock above --------------------------
// Each supplier's phones arrive in a few deliveries; accessories come from the accessories store.
// No rand() here, so the rest of the demo data stays the same. Payments at delivery are real cash
// movements in older (already counted) shifts; whatever is still unpaid is part of supplierPayables.
const purchases: PurchaseInvoice[] = [];
{
  const deliveries: { supplierId: string; at: string; lines: PurchaseInvoice["lines"] }[] = [];
  for (const supplierId of ["sup-1", "sup-2"]) {
    const mine = units.filter((u) => u.supplierId === supplierId).sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt));
    for (let i = 0; i < mine.length; i += 5) {
      const batch = mine.slice(i, i + 5);
      for (const u of batch) u.purchasedAt = batch[0].purchasedAt;
      const lines: PurchaseInvoice["lines"] = [];
      for (const u of batch) {
        const line = lines.find((l) => l.productId === u.productId && l.unitCost === u.cost);
        if (line) {
          line.qty++;
          line.imeis!.push(u.imei);
        } else {
          lines.push({ productId: u.productId, name: initialProducts.find((p) => p.id === u.productId)!.name, qty: 1, unitCost: u.cost, imeis: [u.imei] });
        }
      }
      deliveries.push({ supplierId, at: batch[0].purchasedAt, lines });
    }
  }
  const qtyLine = (productId: string, qty: number) => {
    const p = initialProducts.find((x) => x.id === productId)!;
    return { productId, name: p.name, qty, unitCost: p.avgCost };
  };
  deliveries.push({ supplierId: "sup-3", at: isoDaysAgo(26, 14), lines: [qtyLine("p-cbl", 30), qtyLine("p-chg", 6), qtyLine("p-ear", 10)] });
  deliveries.push({ supplierId: "sup-3", at: isoDaysAgo(9, 13), lines: [qtyLine("p-case", 50), qtyLine("p-scr", 80), qtyLine("p-pb", 5)] });
  deliveries.push({ supplierId: "sup-2", at: isoDaysAgo(18, 15), lines: [qtyLine("p-n105", 10), qtyLine("p-it2", 12)] });
  deliveries.sort((a, b) => a.at.localeCompare(b.at));

  // Newest deliveries are the unpaid ones, up to what each supplier is still owed.
  const owed = { ...openingBalances.supplierPayables };
  const paidAt = new Map<number, number>();
  for (let i = deliveries.length - 1; i >= 0; i--) {
    const d = deliveries[i];
    const total = d.lines.reduce((a, l) => a + l.qty * l.unitCost, 0);
    const unpaid = Math.min(total, owed[d.supplierId] ?? 0);
    owed[d.supplierId] -= unpaid;
    paidAt.set(i, total - unpaid);
  }
  deliveries.forEach((d, i) => {
    const total = d.lines.reduce((a, l) => a + l.qty * l.unitCost, 0);
    const paid = paidAt.get(i) ?? 0;
    const employeeId = i % 2 ? "emp-2" : "emp-1";
    const number = i + 1;
    purchases.push({ id: `pur-${number}`, number, supplierId: d.supplierId, supplierRef: String(4100 + number * 37), createdAt: d.at, employeeId, lines: d.lines, total, paid, via: "cash" });
    if (paid) {
      const day = Math.max(2, Math.round((NOW - new Date(d.at).getTime()) / DAY));
      initialMovements.push({
        id: `mv-pur-${number}`,
        createdAt: d.at,
        shiftId: `shift-hist-${day}`,
        employeeId,
        kind: "supplier_payment",
        cash: -paid,
        wallet: 0,
        topup: 0,
        commission: 0,
        contactId: d.supplierId,
        description: `دفعة لـ ${initialContacts.find((c) => c.id === d.supplierId)!.name} — فاتورة استلام #${number}`,
      });
    }
  });
}

export const initialPurchases = purchases;
export const initialUnits = units;
export const initialOrders = orders;
export const initialOrderNo = orderNo;

// Salaries already paid for the previous 11 months (each month's salary paid on the 1st of the next).
export const initialPayroll: PayrollEntry[] = Array.from({ length: 11 }, (_, i) => {
  const worked = new Date(NOW);
  worked.setUTCDate(15);
  worked.setUTCMonth(worked.getUTCMonth() - (i + 1));
  const month = worked.toISOString().slice(0, 7);
  const paidAt = new Date(Date.UTC(worked.getUTCFullYear(), worked.getUTCMonth() + 1, 1, 18)).toISOString();
  return [
    { id: `pay-${month}-1`, employeeId: "emp-1", month, salary: 6000, advances: 0, net: 6000, paidAt, via: "cash" as const },
    { id: `pay-${month}-2`, employeeId: "emp-2", month, salary: 5500, advances: 0, net: 5500, paidAt, via: "cash" as const },
  ];
}).flat();
