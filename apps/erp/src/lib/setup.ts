"use client";

// Shop initialization (تهيئة المحل): the owner enters the real stock and balances once,
// and they replace the demo data. The draft persists so entry can span several sessions.
// In the real backend this becomes one "opening balances" journal entry plus stock import.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildSchedule, type InitData } from "./store";
import type { BalanceId, Contact, InstallmentPlan, Loan, MachineId, PhoneUnit, Product, ProductCategory, Shift } from "./types";

export interface DraftProduct {
  key: string;
  category: ProductCategory;
  name: string;
  brand: string;
  barcode: string;
  cost: string;
  retail: string;
  qty: string; // quantity items
  imeis: string; // IMEI items: one per line
}

export interface DraftSupplier {
  key: string;
  name: string;
  phone: string;
  balance: string; // what the shop owes them
}

export interface DraftLender {
  key: string;
  name: string;
  phone: string;
  remaining: string;
  notes: string;
}

export interface DraftInstallment {
  key: string;
  name: string;
  phone: string;
  nationalId: string;
  item: string;
  remaining: string;
  monthly: string;
  nextDue: string; // yyyy-mm-dd
  guarantorName: string;
  guarantorPhone: string;
}

export type AgentDirection = "none" | "we_owe";

export interface SetupDraft {
  money: Record<"cash" | "wallet" | BalanceId | "bank" | "savings" | "fixedAssets", string>;
  products: DraftProduct[];
  suppliers: DraftSupplier[];
  lenders: DraftLender[];
  agents: Record<MachineId, { direction: AgentDirection; amount: string }>;
  installments: DraftInstallment[];
}

export const key = () => Math.random().toString(36).slice(2, 10);

export const emptyProduct = (category: ProductCategory = "accessory"): DraftProduct => ({
  key: key(),
  category,
  name: "",
  brand: "",
  barcode: "",
  cost: "",
  retail: "",
  qty: "",
  imeis: "",
});

const emptyDraft = (): SetupDraft => ({
  money: { cash: "", wallet: "", fawry_airtime: "", fawry_general: "", momkn: "", bank: "", savings: "", fixedAssets: "" },
  products: [],
  suppliers: [],
  lenders: [],
  agents: { fawry: { direction: "none", amount: "" }, momkn: { direction: "none", amount: "" } },
  installments: [],
});

interface DraftStore {
  draft: SetupDraft;
  update: (fn: (d: SetupDraft) => SetupDraft) => void;
  clear: () => void;
}

export const useSetupDraft = create<DraftStore>()(
  persist(
    (set) => ({
      draft: emptyDraft(),
      update: (fn) => set((s) => ({ draft: fn(s.draft) })),
      clear: () => set({ draft: emptyDraft() }),
    }),
    { name: "moga-setup-draft-v1" },
  ),
);

export const n = (v: string) => Number(v) || 0;
export const isImeiCategory = (c: ProductCategory) => c === "new_phone" || c === "used_phone";
export const imeiList = (text: string) => text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
export const productCount = (p: DraftProduct) => (isImeiCategory(p.category) ? imeiList(p.imeis).length : n(p.qty));

// ---------- Paste from Excel ----------

const categoryWords: [RegExp, ProductCategory][] = [
  [/مستعمل|used/i, "used_phone"],
  [/زرا?ير|feature|ساده|سادة/i, "feature_phone"],
  [/جديد|new|smart|سمارت/i, "new_phone"],
  [/اكسسوار|إكسسوار|accessor/i, "accessory"],
];

export function parseCategory(text: string): ProductCategory {
  for (const [re, c] of categoryWords) if (re.test(text)) return c;
  return "accessory";
}

/** Column order of the Excel template; IMEIs may be separated by spaces or commas. */
export const PASTE_COLUMNS = ["النوع", "اسم المنتج", "الماركة", "الباركود", "التكلفة", "سعر البيع", "الكمية", "أرقام IMEI"];

export function parsePasted(text: string): DraftProduct[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((c) => c.trim()))
    .filter((cols) => cols.some(Boolean))
    .filter((cols) => !PASTE_COLUMNS.slice(0, 2).every((h, i) => cols[i] === h)) // skip header row
    .map((cols) => {
      const [cat = "", name = "", brand = "", barcode = "", cost = "", retail = "", qty = "", imeis = ""] = cols;
      const category = parseCategory(cat);
      const clean = (v: string) => v.replace(/[,،\s]/g, "");
      return {
        key: key(),
        category,
        name,
        brand,
        barcode: isImeiCategory(category) ? "" : barcode,
        cost: clean(cost),
        retail: clean(retail),
        qty: isImeiCategory(category) ? "" : clean(qty),
        imeis: imeis.split(/[\s,]+/).filter(Boolean).join("\n"),
      };
    });
}

// ---------- Validation ----------

export interface Issue {
  step: StepId;
  text: string;
  blocking: boolean;
}

export type StepId = "money" | "products" | "suppliers" | "lenders" | "agents" | "installments" | "review";

export function validate(d: SetupDraft): Issue[] {
  const issues: Issue[] = [];
  const seenImei = new Map<string, string>();
  const seenBarcode = new Map<string, string>();
  const seenName = new Set<string>();

  d.products.forEach((p, i) => {
    const label = p.name || `سطر ${i + 1}`;
    if (!p.name.trim()) issues.push({ step: "products", text: `سطر ${i + 1}: اسم المنتج فاضي`, blocking: true });
    const nm = p.name.trim().toLowerCase();
    if (nm && seenName.has(nm)) issues.push({ step: "products", text: `«${p.name}» متكرر — اجمعهم في سطر واحد`, blocking: true });
    seenName.add(nm);
    if (n(p.cost) <= 0) issues.push({ step: "products", text: `${label}: التكلفة مش مكتوبة`, blocking: true });
    if (n(p.retail) <= 0) issues.push({ step: "products", text: `${label}: سعر البيع مش مكتوب`, blocking: true });
    else if (n(p.retail) < n(p.cost)) issues.push({ step: "products", text: `${label}: سعر البيع أقل من التكلفة`, blocking: false });
    if (productCount(p) <= 0) issues.push({ step: "products", text: `${label}: الكمية صفر`, blocking: false });

    if (isImeiCategory(p.category)) {
      for (const imei of imeiList(p.imeis)) {
        if (!/^\d{15}$/.test(imei)) issues.push({ step: "products", text: `${label}: IMEI «${imei}» لازم يكون 15 رقم`, blocking: true });
        const other = seenImei.get(imei);
        if (other) issues.push({ step: "products", text: `IMEI ${imei} متكرر (${other} و ${label})`, blocking: true });
        seenImei.set(imei, label);
      }
    } else if (p.barcode) {
      const other = seenBarcode.get(p.barcode);
      if (other) issues.push({ step: "products", text: `الباركود ${p.barcode} متكرر (${other} و ${label})`, blocking: true });
      seenBarcode.set(p.barcode, label);
    }
  });

  d.suppliers.forEach((s, i) => {
    if (!s.name.trim()) issues.push({ step: "suppliers", text: `مورد ${i + 1}: الاسم فاضي`, blocking: true });
  });
  d.lenders.forEach((l, i) => {
    if (!l.name.trim()) issues.push({ step: "lenders", text: `سلفة ${i + 1}: اسم المُقرض فاضي`, blocking: true });
    if (n(l.remaining) <= 0) issues.push({ step: "lenders", text: `${l.name || `سلفة ${i + 1}`}: المبلغ المتبقي صفر`, blocking: true });
  });
  d.installments.forEach((x, i) => {
    const label = x.name || `عميل ${i + 1}`;
    if (!x.name.trim() || !x.phone.trim()) issues.push({ step: "installments", text: `${label}: الاسم والتليفون مطلوبين`, blocking: true });
    if (n(x.remaining) <= 0 || n(x.monthly) <= 0) issues.push({ step: "installments", text: `${label}: المتبقي والقسط الشهري مطلوبين`, blocking: true });
    else if (n(x.monthly) > n(x.remaining)) issues.push({ step: "installments", text: `${label}: القسط أكبر من المتبقي`, blocking: true });
    if (!x.nextDue) issues.push({ step: "installments", text: `${label}: تاريخ القسط الجاي مطلوب`, blocking: true });
  });
  (Object.keys(d.agents) as MachineId[]).forEach((id) => {
    const a = d.agents[id];
    if (a.direction !== "none" && n(a.amount) <= 0) issues.push({ step: "agents", text: "اكتب مبلغ حساب المندوب", blocking: true });
  });
  if (d.money.cash === "") issues.push({ step: "money", text: "اكتب الكاش اللي في الدرج (ولو صفر اكتب 0)", blocking: true });
  return issues;
}

// ---------- Draft → system data ----------

export function buildInitData(d: SetupDraft, ownerId: string): InitData {
  const now = new Date().toISOString();
  const products: Product[] = [];
  const units: PhoneUnit[] = [];
  const contacts: Contact[] = [];
  const supplierPayables: Record<string, number> = {};

  for (const p of d.products) {
    const id = `p-${p.key}`;
    const imei = isImeiCategory(p.category);
    products.push({
      id,
      name: p.name.trim(),
      brand: p.brand.trim(),
      category: p.category,
      tracking: imei ? "imei" : "quantity",
      barcode: imei ? undefined : p.barcode || undefined,
      retailPrice: n(p.retail),
      avgCost: imei ? 0 : n(p.cost),
      quantity: imei ? 0 : n(p.qty),
    });
    if (imei) {
      for (const code of imeiList(p.imeis)) {
        units.push({ imei: code, productId: id, condition: p.category === "used_phone" ? "used" : "new", cost: n(p.cost), status: "in_stock", purchasedAt: now });
      }
    }
  }

  for (const s of d.suppliers) {
    const id = `sup-${s.key}`;
    contacts.push({ id, kind: "supplier", name: s.name.trim(), phone: s.phone.trim() });
    supplierPayables[id] = n(s.balance);
  }

  const loans: Loan[] = d.lenders.map((l) => {
    const lenderId = `len-${l.key}`;
    contacts.push({ id: lenderId, kind: "lender", name: l.name.trim(), phone: l.phone.trim() });
    return { id: `loan-${l.key}`, lenderId, amount: n(l.remaining), repaid: 0, receivedAt: now, notes: l.notes || "رصيد افتتاحي" };
  });

  const plans: InstallmentPlan[] = d.installments.map((x) => {
    const customerId = `cus-${x.key}`;
    contacts.push({ id: customerId, kind: "customer", name: x.name.trim(), phone: x.phone.trim(), nationalId: x.nationalId || undefined });
    let guarantorId: string | undefined;
    if (x.guarantorName.trim()) {
      guarantorId = `gua-${x.key}`;
      contacts.push({ id: guarantorId, kind: "guarantor", name: x.guarantorName.trim(), phone: x.guarantorPhone.trim() });
    }
    const remaining = n(x.remaining);
    const months = Math.max(1, Math.ceil(remaining / n(x.monthly)));
    // Existing plans: the markup was agreed before the system, so the remaining amount is taken as-is,
    // in the agreed monthly installments starting on the next due date.
    return {
      id: `plan-${x.key}`,
      orderId: "",
      customerId,
      guarantorId,
      cashPrice: remaining,
      downPayment: 0,
      markupPercent: 0,
      months,
      startDate: now,
      schedule: buildSchedule(remaining, months, new Date(x.nextDue), n(x.monthly), 0),
    };
  });

  const machineOpening = { fawry_airtime: n(d.money.fawry_airtime), fawry_general: n(d.money.fawry_general), momkn: n(d.money.momkn) };
  const repOpening = Object.fromEntries(
    (Object.keys(d.agents) as MachineId[]).map((id) => {
      const a = d.agents[id];
      return [id, a.direction === "we_owe" ? -n(a.amount) : 0];
    }),
  ) as Record<MachineId, number>;

  // A closed "opening" shift: the first real shift's checklist compares against these counts.
  const cash = n(d.money.cash);
  const openingShift: Shift = {
    id: "shift-opening",
    employeeId: ownerId,
    openedAt: now,
    closedAt: now,
    openingFloat: cash,
    countedCash: cash,
    expectedCash: cash,
    closingCount: { wallet: n(d.money.wallet), machines: machineOpening },
  };

  return {
    products,
    units,
    contacts,
    plans,
    loans,
    shifts: [openingShift],
    supplierPayables,
    walletOpening: n(d.money.wallet),
    machineOpening,
    repOpening,
    extraOpening: { bank: n(d.money.bank), savings: n(d.money.savings), fixedAssets: n(d.money.fixedAssets) },
  };
}
