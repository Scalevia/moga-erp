// Aggregations for the owner dashboard. These become SQL views/RPCs later.

import { orderProfit, orderTotal } from "./store";
import type { CashMovement, ItemCategory, Order, PayrollEntry, PhoneUnit, Product, Shift } from "./types";

// Service commissions and machine bonuses are profit with no revenue line of their own.
const serviceProfit = (m: CashMovement) => m.commission;

const cairoMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" });
const cairoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
const monthName = new Intl.DateTimeFormat("ar-EG", { month: "short", timeZone: "UTC" });

export const monthKey = (iso: string) => cairoMonth.format(new Date(iso));
export const dayKey = (iso: string) => cairoDay.format(new Date(iso));

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return monthName.format(new Date(Date.UTC(y, m - 1, 15)));
}

export interface MonthStat {
  key: string;
  label: string;
  revenue: number;
  profit: number;
  orders: number;
}

export function monthly(orders: Order[], movements: CashMovement[] = [], months = 12, now = new Date()): MonthStat[] {
  const keys: string[] = [];
  const d = new Date(now);
  d.setDate(15);
  for (let i = months - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setMonth(d.getMonth() - i);
    keys.push(monthKey(x.toISOString()));
  }
  const map = new Map(keys.map((k) => [k, { key: k, label: monthLabel(k), revenue: 0, profit: 0, orders: 0 }]));
  for (const o of orders) {
    if (o.status !== "completed") continue;
    const m = map.get(monthKey(o.createdAt));
    if (!m) continue;
    m.revenue += orderTotal(o);
    m.profit += orderProfit(o);
    m.orders += 1;
  }
  for (const mv of movements) {
    const m = map.get(monthKey(mv.createdAt));
    if (m) m.profit += serviceProfit(mv);
  }
  return [...map.values()];
}

/** Revenue/profit for a month up to a given day-of-month, for fair month-to-date comparisons. */
export function monthToDate(orders: Order[], movements: CashMovement[], month: string, uptoDay: number) {
  let revenue = 0;
  let profit = 0;
  for (const o of orders) {
    if (o.status !== "completed" || monthKey(o.createdAt) !== month) continue;
    if (Number(dayKey(o.createdAt).slice(8, 10)) > uptoDay) continue;
    revenue += orderTotal(o);
    profit += orderProfit(o);
  }
  for (const mv of movements) {
    if (monthKey(mv.createdAt) === month && Number(dayKey(mv.createdAt).slice(8, 10)) <= uptoDay) profit += serviceProfit(mv);
  }
  return { revenue, profit };
}

export function growth(curr: number, prev: number) {
  return prev ? ((curr - prev) / prev) * 100 : 0;
}

export type ServiceCategory = "vodafone_cash" | "fawry" | "momkn" | "installments";

function serviceCategory(m: CashMovement): ServiceCategory | null {
  // Paying an agent by Vodafone Cash costs a liquidation fee — same bucket as other wallet fees.
  if (m.kind === "vf_deposit" || m.kind === "vf_withdrawal" || m.kind === "wallet_liquidation" || m.kind === "rep_payment") return "vodafone_cash";
  // Fawry commissions include the Air time bonus the agent adds on top-ups.
  if (m.kind === "topup_sale" || m.kind === "rep_load") return m.machineId === "momkn" ? "momkn" : "fawry";
  if (m.kind === "installment_collection") return "installments";
  return null;
}

export function profitByCategory(orders: Order[], movements: CashMovement[], month: string) {
  const out: Record<ItemCategory | ServiceCategory, number> = {
    new_phone: 0,
    used_phone: 0,
    feature_phone: 0,
    accessory: 0,
    service: 0,
    vodafone_cash: 0,
    fawry: 0,
    momkn: 0,
    installments: 0,
  };
  for (const mv of movements) {
    const cat = serviceCategory(mv);
    if (cat && monthKey(mv.createdAt) === month) out[cat] += serviceProfit(mv);
  }
  for (const o of orders) {
    if (o.status !== "completed" || monthKey(o.createdAt) !== month) continue;
    for (const i of o.items) out[i.category] += i.qty * (i.unitPrice - i.unitCost);
  }
  return out;
}

/** Money that actually came in this month up to `uptoDay`: sale payments (incl. down payments) + installments collected. */
export function cashCollected(orders: Order[], movements: CashMovement[], month: string, uptoDay = 31) {
  const inRange = (iso: string) => monthKey(iso) === month && Number(dayKey(iso).slice(8, 10)) <= uptoDay;
  let sales = 0;
  for (const o of orders) {
    if (o.status !== "completed" || !inRange(o.createdAt)) continue;
    for (const p of o.payments) if (p.method !== "installment") sales += p.amount;
  }
  const installments = movements
    .filter((m) => m.kind === "installment_collection" && inRange(m.createdAt))
    .reduce((a, m) => a + m.cash + m.wallet + (m.bank ?? 0), 0);
  return { sales, installments, total: sales + installments };
}

export function todayStats(orders: Order[], movements: CashMovement[] = [], now = new Date()) {
  const today = dayKey(now.toISOString());
  const list = orders.filter((o) => o.status === "completed" && dayKey(o.createdAt) === today);
  const services = movements.filter((m) => dayKey(m.createdAt) === today).reduce((a, m) => a + serviceProfit(m), 0);
  return {
    orders: list.length,
    revenue: list.reduce((a, o) => a + orderTotal(o), 0),
    profit: list.reduce((a, o) => a + orderProfit(o), 0) + services,
  };
}

export function inventoryValue(products: Product[], units: PhoneUnit[]) {
  const byId = new Map(products.map((p) => [p.id, p]));
  let cost = 0;
  let retail = 0;
  const rows = new Map<string, { product: Product; count: number; cost: number; retail: number }>();
  for (const u of units) {
    if (u.status !== "in_stock") continue;
    const p = byId.get(u.productId);
    if (!p) continue;
    cost += u.cost;
    retail += p.retailPrice;
    const r = rows.get(p.id) ?? { product: p, count: 0, cost: 0, retail: 0 };
    r.count++;
    r.cost += u.cost;
    r.retail += p.retailPrice;
    rows.set(p.id, r);
  }
  for (const p of products) {
    if (p.tracking !== "quantity") continue;
    cost += p.quantity * p.avgCost;
    retail += p.quantity * p.retailPrice;
    rows.set(p.id, { product: p, count: p.quantity, cost: p.quantity * p.avgCost, retail: p.quantity * p.retailPrice });
  }
  return { cost, retail, gain: retail - cost, rows: [...rows.values()] };
}

// ---------------- Reports ----------------

export interface DaySummary {
  day: string; // yyyy-mm-dd (Cairo)
  invoices: number;
  sales: number;
  discount: number;
  salesProfit: number;
  servicesProfit: number;
  profit: number;
  returns: number;
}

function orderDiscount(o: Order) {
  return o.items.reduce((a, i) => a + i.qty * Math.max(0, (i.listPrice ?? i.unitPrice) - i.unitPrice), 0);
}

function emptyDay(day: string): DaySummary {
  return { day, invoices: 0, sales: 0, discount: 0, salesProfit: 0, servicesProfit: 0, profit: 0, returns: 0 };
}

/** One row per day of `month` (yyyy-mm), up to today for the current month. */
export function dailySummaries(orders: Order[], movements: CashMovement[], month: string, now = new Date()): DaySummary[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = dayKey(now.toISOString());
  const days = new Map<string, DaySummary>();
  for (let d = 1; d <= last; d++) {
    const key = `${month}-${String(d).padStart(2, "0")}`;
    if (key > today) break;
    days.set(key, emptyDay(key));
  }
  for (const o of orders) {
    const row = days.get(dayKey(o.createdAt));
    if (!row) continue;
    if (o.status === "returned") {
      row.returns += 1;
      continue;
    }
    row.invoices += 1;
    row.sales += orderTotal(o);
    row.discount += orderDiscount(o);
    row.salesProfit += orderProfit(o);
  }
  for (const mv of movements) {
    const row = days.get(dayKey(mv.createdAt));
    if (row) row.servicesProfit += serviceProfit(mv);
  }
  for (const r of days.values()) r.profit = r.salesProfit + r.servicesProfit;
  return [...days.values()].reverse();
}

export interface DayReport extends DaySummary {
  orders: Order[];
  byMethod: Record<string, number>;
  byCategory: Record<ItemCategory, { qty: number; sales: number; profit: number }>;
  byEmployee: Record<string, { invoices: number; sales: number; discount: number; profit: number }>;
  services: Record<ServiceCategory, number>;
}

export function dayReport(orders: Order[], movements: CashMovement[], day: string): DayReport {
  const list = orders.filter((o) => dayKey(o.createdAt) === day).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const base = emptyDay(day);
  const byMethod: Record<string, number> = {};
  const byCategory = {
    new_phone: { qty: 0, sales: 0, profit: 0 },
    used_phone: { qty: 0, sales: 0, profit: 0 },
    feature_phone: { qty: 0, sales: 0, profit: 0 },
    accessory: { qty: 0, sales: 0, profit: 0 },
    service: { qty: 0, sales: 0, profit: 0 },
  } as DayReport["byCategory"];
  const byEmployee: DayReport["byEmployee"] = {};
  for (const o of list) {
    if (o.status === "returned") {
      base.returns += 1;
      continue;
    }
    const total = orderTotal(o);
    const profit = orderProfit(o);
    const discount = orderDiscount(o);
    base.invoices += 1;
    base.sales += total;
    base.discount += discount;
    base.salesProfit += profit;
    for (const p of o.payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
    for (const i of o.items) {
      const c = byCategory[i.category];
      c.qty += i.qty;
      c.sales += i.qty * i.unitPrice;
      c.profit += i.qty * (i.unitPrice - i.unitCost);
    }
    const e = (byEmployee[o.employeeId] ??= { invoices: 0, sales: 0, discount: 0, profit: 0 });
    e.invoices += 1;
    e.sales += total;
    e.discount += discount;
    e.profit += profit;
  }
  const services = { vodafone_cash: 0, fawry: 0, momkn: 0, installments: 0 } as Record<ServiceCategory, number>;
  for (const mv of movements) {
    if (dayKey(mv.createdAt) !== day) continue;
    const cat = serviceCategory(mv);
    if (cat) services[cat] += serviceProfit(mv);
    base.servicesProfit += serviceProfit(mv);
  }
  base.profit = base.salesProfit + base.servicesProfit;
  return { ...base, orders: list, byMethod, byCategory, byEmployee, services };
}

/** CSV with a BOM so Excel opens Arabic text correctly. */
export function toCsv(rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

// ---------------- Expenses & net profit ----------------

export interface Expenses {
  operating: { category: string; amount: number }[]; // rent, electricity… largest first
  operatingTotal: number;
  salaries: number;
  shortages: number;
  total: number;
}

/**
 * What the month cost the shop, up to `uptoDay`:
 * operating expenses + salaries (counted in the month they're for, once paid) + shift cash shortages.
 * Not expenses: refunds (the sale's profit is already reversed), advances (deducted from salary),
 * asset purchases, loan repayments and owner drawings.
 */
export function monthExpenses(
  s: { movements: CashMovement[]; payroll: PayrollEntry[]; shifts: Shift[] },
  month: string,
  uptoDay = 31,
): Expenses {
  const inRange = (iso: string) => monthKey(iso) === month && Number(dayKey(iso).slice(8, 10)) <= uptoDay;
  const byCat = new Map<string, number>();
  for (const m of s.movements) {
    if (m.kind !== "expense" || !inRange(m.createdAt)) continue;
    const category = m.category || m.description.split(" — ")[0] || "أخرى";
    byCat.set(category, (byCat.get(category) ?? 0) - (m.cash + m.wallet + (m.bank ?? 0)));
  }
  const operating = [...byCat].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  const operatingTotal = operating.reduce((a, x) => a + x.amount, 0);
  const salaries = s.payroll.filter((p) => p.month === month).reduce((a, p) => a + p.salary, 0);
  const shortages = s.shifts
    .filter((x) => x.closedAt && inRange(x.closedAt))
    .reduce((a, x) => a + Math.max(0, (x.expectedCash ?? 0) - (x.countedCash ?? 0)), 0);
  return { operating, operatingTotal, salaries, shortages, total: operatingTotal + salaries + shortages };
}

export function dayExpenses(movements: CashMovement[], day: string) {
  return movements.filter((m) => m.kind === "expense" && dayKey(m.createdAt) === day);
}
