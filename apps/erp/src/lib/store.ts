"use client";

// In-browser store standing in for Supabase during the UI prototype.
// Each action here maps 1:1 to a planned Postgres RPC function.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { idbStorage } from "./browser-storage";
import {
  initialContacts,
  initialLentOut,
  initialLoans,
  initialMovements,
  initialOrderNo,
  initialOrders,
  initialPlans,
  initialProducts,
  initialPayroll,
  initialPurchases,
  initialSettings,
  initialShifts,
  initialStaff,
  initialUnits,
  openingBalances,
} from "./mock-data";
import type {
  BalanceCount,
  Employee,
  PayrollEntry,
  PurchaseInvoice,
  ShopSettings,
  CashMovement,
  Contact,
  InstallmentPlan,
  LedgerKind,
  DebtEvent,
  LentOut,
  Loan,
  BalanceId,
  MachineId,
  Order,
  OrderItem,
  Payment,
  PhoneUnit,
  Product,
  ProductCategory,
  Revaluation,
  Shift,
  ShopService,
  UsedInspection,
} from "./types";
import { balanceIds, balanceLabel, defaultServices } from "./format";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
const nowIso = () => new Date().toISOString();

export interface InstallmentInput {
  downPayment: number;
  markupPercent: number;
  months: number;
  guarantor?: { name: string; phone: string; nationalId: string };
}

export interface SaleInput {
  items: OrderItem[];
  payments: Payment[];
  customer?: { name: string; phone: string; nationalId?: string };
  installment?: InstallmentInput;
}

export interface NewProductInput {
  name: string;
  brand: string;
  category: Product["category"];
  barcode?: string;
  retailPrice: number;
}

export interface ExtraOpening {
  bank: number;
  savings: number; // paid into the جمعية and not collected yet
  fixedAssets: number;
}

/** Everything the setup wizard produces — replaces the demo data in one go. */
export type InitData = Pick<
  State,
  | "products"
  | "units"
  | "contacts"
  | "plans"
  | "loans"
  | "shifts"
  | "supplierPayables"
  | "walletOpening"
  | "machineOpening"
  | "repOpening"
  | "extraOpening"
>;

interface State {
  products: Product[];
  units: PhoneUnit[];
  contacts: Contact[];
  orders: Order[];
  plans: InstallmentPlan[];
  loans: Loan[];
  lentOut: LentOut[];
  movements: CashMovement[];
  shifts: Shift[];
  nextOrderNo: number;
  supplierPayables: Record<string, number>;
  walletOpening: number;
  machineOpening: Record<BalanceId, number>;
  repOpening: Record<MachineId, number>;
  bonusPercent: Record<BalanceId, number>;
  extraOpening: ExtraOpening;
  staff: Employee[];
  settings: ShopSettings;
  purchases: PurchaseInvoice[];
  payroll: PayrollEntry[];
  revaluations: Revaluation[];
  services: ShopService[];
  isDemo: boolean;
  currentEmployeeId: string | null;

  login: (employeeId: string) => void;
  logout: () => void;
  completeSale: (input: SaleInput) => Order;
  /** Return a whole order. `via` = the money went back another way than it was paid (all of it from there). */
  returnOrder: (orderId: string, input: { reason: string; via?: "cash" | "wallet" | "bank" }) => void;
  recordMovement: (m: Omit<CashMovement, "id" | "createdAt" | "shiftId" | "employeeId">) => void;
  buyUsedPhone: (input: {
    productName: string;
    brand: string;
    imei: string;
    price: number;
    retailPrice: number;
    seller: { name: string; phone: string; nationalId: string };
    inspection: UsedInspection;
  }) => void;
  receiveDelivery: (input: {
    supplierId: string;
    supplierRef?: string;
    lines: { productId: string; imeis: string[]; quantity: number; unitCost: number }[];
    paid: number;
    via: "cash" | "wallet" | "bank";
  }) => PurchaseInvoice;
  addEmployee: (input: Omit<Employee, "id" | "active">) => string;
  updateEmployee: (id: string, patch: Partial<Pick<Employee, "name" | "phone" | "salary" | "role" | "active" | "username" | "password">>) => void;
  deleteEmployee: (id: string) => void;
  updateSettings: (patch: Partial<ShopSettings>) => void;
  setServices: (list: ShopService[]) => void;
  paySalary: (input: { employeeId: string; month: string; via: "cash" | "wallet" | "bank" }) => PayrollEntry;
  addSupplier: (input: { name: string; phone: string }) => string;
  /** A customer pays (part of) what's on their account from sales they didn't pay in full. */
  collectCredit: (input: { customerId: string; amount: number; via: "cash" | "wallet" }) => void;
  /** Pay a supplier part of what the shop owes them. */
  paySupplier: (input: { supplierId: string; amount: number; via: "cash" | "wallet" | "bank"; note?: string }) => void;
  addProduct: (input: NewProductInput) => string;
  /** New selling price; with `unitCost`, also re-costs the pieces in stock to today's wholesale price. */
  repriceProduct: (input: { productId: string; retailPrice: number; unitCost?: number }) => void;
  /** Raise (or lower) the selling price of a whole category by a percentage, rounded to 5. */
  repriceCategory: (input: { category: ProductCategory; percent: number }) => void;
  payInstallment: (planId: string, amount: number, method: Payment["method"]) => void;
  addLoan: (lenderName: string, lenderPhone: string, amount: number, notes?: string) => void;
  repayLoan: (loanId: string, amount: number) => void;
  lendMoney: (input: { name: string; phone: string; amount: number; dueDate: string; from: "cash" | "wallet"; notes?: string }) => void;
  collectLent: (id: string, amount: number, to: "cash" | "wallet") => void;
  /** Settle what someone owes the shop (oldest loan first): a repayment, or the owner forgiving it. */
  settleLent: (input: { borrowerId: string; amount: number; type: DebtEvent["type"]; via?: "cash" | "wallet"; note?: string }) => void;
  /** Settle what the shop owes a lender (oldest first): the shop repays, or the lender forgives it. */
  settleLoan: (input: { lenderId: string; amount: number; type: DebtEvent["type"]; via?: "cash" | "wallet"; note?: string }) => void;
  openShift: (input: { float: number; count: BalanceCount; expected: NonNullable<Shift["openingExpected"]> }) => void;
  closeShift: (input: { counted: number; count: BalanceCount }) => Shift;
  setBonusPercent: (id: BalanceId, percent: number) => void;
  initializeShop: (data: InitData) => void;
  resetDemo: () => void;
}

function initialState() {
  return {
    products: initialProducts,
    units: initialUnits,
    contacts: initialContacts,
    orders: initialOrders,
    plans: initialPlans,
    loans: initialLoans,
    lentOut: initialLentOut,
    movements: initialMovements,
    shifts: initialShifts,
    nextOrderNo: initialOrderNo,
    supplierPayables: openingBalances.supplierPayables,
    walletOpening: openingBalances.wallet,
    machineOpening: openingBalances.machines,
    repOpening: openingBalances.reps,
    bonusPercent: openingBalances.bonusPercent,
    extraOpening: { bank: openingBalances.bank, savings: openingBalances.savings, fixedAssets: openingBalances.fixedAssets },
    isDemo: true,
    staff: initialStaff,
    settings: initialSettings,
    purchases: initialPurchases,
    payroll: initialPayroll,
    revaluations: [] as Revaluation[],
    services: defaultServices,
    currentEmployeeId: null as string | null,
  };
}

/**
 * Monthly due dates on the same day of the month as `start`, the first one `firstMonth` months after it
 * (0 = on `start` itself). In a shorter month the installment falls on its last day: a sale on Jan 31 is
 * due Feb 28, Mar 31, Apr 30… Equal installments, or `each` when the agreed monthly amount is known —
 * the last one takes what's left either way.
 */
export function buildSchedule(financed: number, months: number, start: Date, each = Math.round(financed / months), firstMonth = 1) {
  return Array.from({ length: months }, (_, i) => {
    const due = new Date(start);
    due.setDate(1);
    due.setMonth(start.getMonth() + i + firstMonth);
    const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
    due.setDate(Math.min(start.getDate(), lastDay));
    return {
      n: i + 1,
      dueDate: due.toISOString(),
      amount: i === months - 1 ? financed - each * (months - 1) : each,
      paid: 0,
    };
  });
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const openShift = () => get().shifts.find((s) => !s.closedAt);
      const upsertContact = (kind: Contact["kind"], c: { name: string; phone: string; nationalId?: string }) => {
        const existing = get().contacts.find((x) => x.phone === c.phone && x.kind === kind);
        if (existing) return existing.id;
        const id = uid(kind.slice(0, 3));
        set((s) => ({ contacts: [...s.contacts, { id, kind, ...c }] }));
        return id;
      };
      const movement = (m: Omit<CashMovement, "id" | "createdAt" | "shiftId" | "employeeId">) => {
        const shift = openShift();
        set((s) => ({
          movements: [
            ...s.movements,
            { ...m, id: uid("mv"), createdAt: nowIso(), shiftId: shift?.id ?? "none", employeeId: s.currentEmployeeId ?? "unknown" },
          ],
        }));
      };

      // A count that differs from the system sets the wallet and machine balances to what was counted, so the
      // difference is taken once (in the net profit, from the shift's counts) and not again at the next count.
      const adjustToCount = (count: BalanceCount, expected: { wallet: number; machines: Record<BalanceId, number> }, when: string) => {
        const wallet = count.wallet - expected.wallet;
        if (wallet) movement({ kind: "count_adjustment", cash: 0, wallet, topup: 0, commission: 0, description: `فرق عدّ فودافون كاش ${when}` });
        for (const id of balanceIds) {
          const diff = count.machines[id] - expected.machines[id];
          if (diff) movement({ kind: "count_adjustment", cash: 0, wallet: 0, topup: diff, balanceId: id, commission: 0, description: `فرق عدّ ${balanceLabel[id]} ${when}` });
        }
      };

      return {
        ...initialState(),

        login: (employeeId) => set({ currentEmployeeId: employeeId }),
        logout: () => set({ currentEmployeeId: null }),

        completeSale: (input) => {
          const s = get();
          const shift = openShift();
          const orderId = uid("ord");
          const customerId = input.customer?.phone ? upsertContact("customer", input.customer) : undefined;

          let planId: string | undefined;
          if (input.installment && customerId) {
            const total = input.items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
            const financed = Math.round((total - input.installment.downPayment) * (1 + input.installment.markupPercent / 100));
            const guarantorId = input.installment.guarantor?.phone ? upsertContact("guarantor", input.installment.guarantor) : undefined;
            planId = uid("plan");
            const plan: InstallmentPlan = {
              id: planId, orderId, customerId, guarantorId,
              cashPrice: total, downPayment: input.installment.downPayment,
              markupPercent: input.installment.markupPercent, months: input.installment.months,
              startDate: nowIso(), schedule: buildSchedule(financed, input.installment.months, new Date()),
            };
            set((st) => ({ plans: [...st.plans, plan] }));
          }

          // Paid more than the price and left it: it's part of the sale (and its profit).
          const extra = Math.max(0, input.payments.reduce((a, p) => a + p.amount, 0) - input.items.reduce((a, i) => a + i.qty * i.unitPrice, 0));
          const order: Order = {
            id: orderId, number: s.nextOrderNo, createdAt: nowIso(), extra: extra || undefined,
            employeeId: s.currentEmployeeId ?? "unknown", shiftId: shift?.id ?? "none",
            customerId, items: input.items, payments: input.payments, installmentPlanId: planId, status: "completed",
          };

          const soldImeis = new Set(input.items.filter((i) => i.imei).map((i) => i.imei));
          const qtyByProduct = new Map<string, number>();
          input.items.filter((i) => !i.imei).forEach((i) => qtyByProduct.set(i.productId, (qtyByProduct.get(i.productId) ?? 0) + i.qty));

          set((st) => ({
            orders: [...st.orders, order],
            nextOrderNo: st.nextOrderNo + 1,
            units: st.units.map((u) => (soldImeis.has(u.imei) ? { ...u, status: "sold", soldOrderId: orderId } : u)),
            products: st.products.map((p) => (qtyByProduct.has(p.id) ? { ...p, quantity: p.quantity - qtyByProduct.get(p.id)! } : p)),
          }));
          return order;
        },

        returnOrder: (orderId, { reason, via }) => {
          const order = get().orders.find((o) => o.id === orderId);
          if (!order || order.status === "returned") return;
          const imeis = new Set(order.items.filter((i) => i.imei).map((i) => i.imei));
          const refund = refundFor(get(), order, via);
          const returned = { at: nowIso(), by: get().currentEmployeeId ?? "unknown", reason };
          set((st) => ({
            orders: st.orders.map((o) => (o.id === orderId ? { ...o, status: "returned", returned } : o)),
            units: st.units.map((u) => (imeis.has(u.imei) ? { ...u, status: "in_stock", soldOrderId: undefined } : u)),
            products: st.products.map((p) => {
              const q = order.items.filter((i) => !i.imei && i.productId === p.id).reduce((a, i) => a + i.qty, 0);
              return q ? { ...p, quantity: p.quantity + q } : p;
            }),
            // An installment sale that comes back has nothing left to collect.
            plans: refund.plan ? st.plans.map((p) => (p.id === refund.plan!.id ? { ...p, cancelledAt: nowIso() } : p)) : st.plans,
          }));
          // Everything the customer paid goes back the way it came in. The markup already counted as profit
          // on collected installments is reversed; the sale's own profit drops out with the order's status.
          // What they had paid off their account toward this sale is a reversed collection, so their account
          // ends at zero for it rather than showing the shop owing them.
          const out = { cash: refund.cash, wallet: refund.wallet, bank: refund.bank };
          out[refund.fromAccountVia] -= refund.fromAccount;
          if (refund.fromAccount)
            movement({
              kind: "credit_collection",
              cash: refund.fromAccountVia === "cash" ? -refund.fromAccount : 0,
              wallet: refund.fromAccountVia === "wallet" ? -refund.fromAccount : 0,
              bank: refund.fromAccountVia === "bank" ? -refund.fromAccount : 0,
              topup: 0,
              commission: 0,
              contactId: order.customerId,
              description: `رد اللي اتدفع من الحساب — مرتجع فاتورة #${order.number}`,
            });
          if (out.cash + out.wallet + out.bank || refund.markup)
            movement({
              kind: "refund",
              cash: -out.cash || 0, // `|| 0` keeps a zero from being stored as -0
              wallet: -out.wallet || 0,
              bank: -out.bank || 0,
              topup: 0,
              commission: -refund.markup || 0,
              planId: refund.plan?.id,
              description: `مرتجع فاتورة #${order.number}${refund.installments ? ` (منها أقساط اتدفعت ${refund.installments.toLocaleString("en")})` : ""} — ${reason}`,
            });
        },

        recordMovement: movement,

        buyUsedPhone: ({ productName, brand, imei, price, retailPrice, seller, inspection }) => {
          const known = get().units.find((u) => u.imei === imei);
          if (known?.status === "in_stock") return; // already on the shelf — can't be bought twice
          const sellerId = upsertContact("customer", seller);
          let product = get().products.find((p) => p.name === productName && p.category === "used_phone");
          if (!product) {
            product = { id: uid("p"), name: productName, brand, category: "used_phone", tracking: "imei", retailPrice, avgCost: 0, quantity: 0 };
            set((st) => ({ products: [...st.products, product!] }));
          }
          const unit: PhoneUnit = { imei, productId: product.id, condition: "used", cost: price, status: "in_stock", supplierId: sellerId, purchasedAt: nowIso(), inspection, retailPrice };
          // A phone the shop sold before (e.g. new) and is buying back: same IMEI, so the record comes back to
          // stock as a used phone, keeping its earlier sales as history.
          set((st) => ({
            units: known
              ? st.units.map((u) => (u.imei === imei ? { ...unit, pastOrderIds: [...(u.pastOrderIds ?? []), ...(u.soldOrderId ? [u.soldOrderId] : [])] } : u))
              : [...st.units, unit],
          }));
          movement({ kind: "used_phone_purchase", cash: -price, wallet: 0, topup: 0, commission: 0, description: `${productName} من ${seller.name}` });
        },

        receiveDelivery: ({ supplierId, supplierRef, lines, paid, via }) => {
          const products = get().products;
          const invoiceLines = lines.map((l) => {
            const product = products.find((p) => p.id === l.productId)!;
            const qty = product.tracking === "imei" ? l.imeis.length : l.quantity;
            return { productId: l.productId, name: product.name, qty, unitCost: l.unitCost, imeis: product.tracking === "imei" ? l.imeis : undefined };
          });
          const total = invoiceLines.reduce((a, l) => a + l.qty * l.unitCost, 0);
          const now = nowIso();
          set((st) => ({
            units: [
              ...st.units,
              ...invoiceLines.flatMap((l) =>
                (l.imeis ?? []).map((imei) => ({ imei, productId: l.productId, condition: "new" as const, cost: l.unitCost, status: "in_stock" as const, supplierId, purchasedAt: now })),
              ),
            ],
            products: st.products.map((p) => {
              const added = invoiceLines.filter((l) => l.productId === p.id && !l.imeis).reduce((a, l) => a + l.qty, 0);
              if (!added) return p;
              const cost = invoiceLines.filter((l) => l.productId === p.id && !l.imeis).reduce((a, l) => a + l.qty * l.unitCost, 0);
              return { ...p, quantity: p.quantity + added, avgCost: Math.round((p.avgCost * p.quantity + cost) / (p.quantity + added)) };
            }),
            supplierPayables: { ...st.supplierPayables, [supplierId]: (st.supplierPayables[supplierId] ?? 0) + total - paid },
          }));
          const invoice: PurchaseInvoice = {
            id: uid("pur"),
            number: get().purchases.length + 1,
            supplierId,
            supplierRef: supplierRef || undefined,
            createdAt: now,
            employeeId: get().currentEmployeeId ?? "unknown",
            lines: invoiceLines,
            total,
            paid,
            via,
          };
          set((st) => ({ purchases: [...st.purchases, invoice] }));
          const supplier = get().contacts.find((c) => c.id === supplierId);
          if (paid)
            movement({
              kind: "supplier_payment",
              cash: via === "cash" ? -paid : 0,
              wallet: via === "wallet" ? -paid : 0,
              bank: via === "bank" ? -paid : 0,
              topup: 0,
              commission: 0,
              contactId: supplierId,
              description: `دفعة لـ ${supplier?.name ?? ""} — فاتورة استلام #${invoice.number}`,
            });
          return invoice;
        },

        collectCredit: ({ customerId, amount, via }) => {
          const name = get().contacts.find((c) => c.id === customerId)?.name ?? "";
          movement({
            kind: "credit_collection",
            cash: via === "cash" ? amount : 0,
            wallet: via === "wallet" ? amount : 0,
            topup: 0,
            commission: 0,
            contactId: customerId,
            description: `${name} دفع من حسابه ${amount.toLocaleString("en")}`,
          });
        },

        paySupplier: ({ supplierId, amount, via, note }) => {
          const supplier = get().contacts.find((c) => c.id === supplierId);
          set((st) => ({ supplierPayables: { ...st.supplierPayables, [supplierId]: (st.supplierPayables[supplierId] ?? 0) - amount } }));
          movement({
            kind: "supplier_payment",
            cash: via === "cash" ? -amount : 0,
            wallet: via === "wallet" ? -amount : 0,
            bank: via === "bank" ? -amount : 0,
            topup: 0,
            commission: 0,
            contactId: supplierId,
            description: `دفعة لـ ${supplier?.name ?? ""}${note ? ` — ${note}` : ""}`,
          });
        },

        addEmployee: (input) => {
          const id = uid("emp");
          set((st) => ({ staff: [...st.staff, { ...input, id, active: true }] }));
          return id;
        },

        updateEmployee: (id, patch) => set((st) => ({ staff: st.staff.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),

        deleteEmployee: (id) => set((st) => ({ staff: st.staff.filter((e) => e.id !== id) })),

        updateSettings: (patch) => set((st) => ({ settings: { ...st.settings, ...patch } })),

        setServices: (list) => set({ services: list }),

        paySalary: ({ employeeId, month, via }) => {
          const s = get();
          const emp = s.staff.find((e) => e.id === employeeId)!;
          const advances = Math.min(emp.salary, outstandingAdvances(s, employeeId));
          const entry: PayrollEntry = { id: uid("pay"), employeeId, month, salary: emp.salary, advances, net: emp.salary - advances, paidAt: nowIso(), via };
          set((st) => ({ payroll: [...st.payroll, entry] }));
          movement({
            kind: "salary_payment",
            cash: via === "cash" ? -entry.net : 0,
            wallet: via === "wallet" ? -entry.net : 0,
            bank: via === "bank" ? -entry.net : 0,
            topup: 0,
            commission: 0,
            targetEmployeeId: employeeId,
            description: `مرتب ${emp.name} — ${month}${advances ? ` (اتخصم سُلف ${advances.toLocaleString("en")})` : ""}`,
          });
          return entry;
        },


        addSupplier: ({ name, phone }) => {
          const id = uid("sup");
          set((st) => ({
            contacts: [...st.contacts, { id, kind: "supplier", name, phone }],
            supplierPayables: { ...st.supplierPayables, [id]: 0 },
          }));
          return id;
        },

        addProduct: (input) => {
          const id = uid("p");
          const tracking = input.category === "new_phone" || input.category === "used_phone" ? "imei" : "quantity";
          set((st) => ({
            products: [...st.products, { ...input, id, tracking, barcode: input.barcode || undefined, avgCost: 0, quantity: 0 }],
          }));
          return id;
        },

        repriceProduct: ({ productId, retailPrice, unitCost }) => {
          const s = get();
          const product = s.products.find((p) => p.id === productId);
          if (!product) return;
          set((st) => ({
            products: st.products.map((p) => (p.id === productId ? { ...p, retailPrice } : p)),
            // Pieces with their own price (used phones) take the model's new price too.
            units: st.units.map((u) => (u.productId === productId && u.status === "in_stock" && u.retailPrice !== undefined ? { ...u, retailPrice } : u)),
          }));
          if (unitCost === undefined) return;

          const pieces = product.tracking === "imei" ? s.units.filter((u) => u.productId === productId && u.status === "in_stock") : [];
          const qty = product.tracking === "imei" ? pieces.length : product.quantity;
          const oldCost = product.tracking === "imei" ? pieces.reduce((a, u) => a + u.cost, 0) : product.quantity * product.avgCost;
          if (product.tracking === "imei") {
            const imeis = new Set(pieces.map((u) => u.imei));
            set((st) => ({ units: st.units.map((u) => (imeis.has(u.imei) ? { ...u, cost: unitCost } : u)) }));
          } else {
            set((st) => ({ products: st.products.map((p) => (p.id === productId ? { ...p, avgCost: unitCost } : p)) }));
          }
          const amount = qty * unitCost - oldCost;
          if (qty > 0 && amount !== 0) {
            const entry: Revaluation = { id: uid("rv"), at: nowIso(), by: s.currentEmployeeId ?? "unknown", productId, qty, oldCost, newUnitCost: unitCost, amount };
            set((st) => ({ revaluations: [...st.revaluations, entry] }));
          }
        },

        repriceCategory: ({ category, percent }) =>
          set((st) => ({
            products: st.products.map((p) =>
              p.category === category ? { ...p, retailPrice: Math.max(5, Math.round((p.retailPrice * (1 + percent / 100)) / 5) * 5) } : p,
            ),
          })),

        payInstallment: (planId, amount, method) => {
          let remaining = amount;
          set((st) => ({
            plans: st.plans.map((p) =>
              p.id !== planId
                ? p
                : {
                    ...p,
                    schedule: p.schedule.map((d) => {
                      const due = d.amount - d.paid;
                      const take = Math.min(due, remaining);
                      remaining -= take;
                      return { ...d, paid: d.paid + take };
                    }),
                  },
            ),
          }));
          const plan = get().plans.find((p) => p.id === planId);
          const customer = get().contacts.find((c) => c.id === plan?.customerId);
          // The markup is earned as it is collected: every installment carries the same share of it.
          // (The cash-price profit was already counted on the sale day.)
          const markup = plan?.markupPercent ?? 0;
          const markupProfit = Math.round((amount * markup) / (100 + markup));
          movement({
            kind: "installment_collection",
            cash: method === "cash" ? amount : 0,
            wallet: method === "vodafone_cash" ? amount : 0,
            topup: 0,
            commission: markupProfit,
            planId,
            description: `قسط ${customer?.name ?? ""}${markupProfit ? ` (منه ربح زيادة ${markupProfit.toLocaleString("en")})` : ""}`,
          });
        },

        addLoan: (lenderName, lenderPhone, amount, notes) => {
          const lenderId = upsertContact("lender", { name: lenderName, phone: lenderPhone });
          set((st) => ({ loans: [...st.loans, { id: uid("loan"), lenderId, amount, repaid: 0, receivedAt: nowIso(), receivedBy: st.currentEmployeeId ?? undefined, notes }] }));
          movement({ kind: "loan_received", cash: amount, wallet: 0, topup: 0, commission: 0, description: `سلفة من ${lenderName}` });
        },

        repayLoan: (loanId, amount) => {
          const loan = get().loans.find((l) => l.id === loanId);
          const lender = get().contacts.find((c) => c.id === loan?.lenderId);
          const event: DebtEvent = { at: nowIso(), type: "repaid", amount, by: get().currentEmployeeId ?? "unknown", via: "cash" };
          set((st) => ({ loans: st.loans.map((l) => (l.id === loanId ? { ...l, repaid: l.repaid + amount, history: [...(l.history ?? []), event] } : l)) }));
          movement({ kind: "loan_repayment", cash: -amount, wallet: 0, topup: 0, commission: 0, description: `سداد لـ ${lender?.name}` });
        },

        lendMoney: ({ name, phone, amount, dueDate, from, notes }) => {
          const borrowerId = upsertContact("borrower", { name, phone });
          set((st) => ({
            lentOut: [...st.lentOut, { id: uid("lent"), borrowerId, amount, repaid: 0, givenAt: nowIso(), dueDate, givenBy: st.currentEmployeeId ?? "unknown", notes }],
          }));
          movement({
            kind: "lent_out",
            cash: from === "cash" ? -amount : 0,
            wallet: from === "wallet" ? -amount : 0,
            topup: 0,
            commission: 0,
            description: `سلفة لـ ${name}${notes ? ` — ${notes}` : ""}`,
          });
        },

        collectLent: (id, amount, to) => {
          const loan = get().lentOut.find((l) => l.id === id);
          const borrower = get().contacts.find((c) => c.id === loan?.borrowerId);
          const event: DebtEvent = { at: nowIso(), type: "repaid", amount, by: get().currentEmployeeId ?? "unknown", via: to };
          set((st) => ({ lentOut: st.lentOut.map((l) => (l.id === id ? { ...l, repaid: l.repaid + amount, history: [...(l.history ?? []), event] } : l)) }));
          movement({
            kind: "lent_repaid",
            cash: to === "cash" ? amount : 0,
            wallet: to === "wallet" ? amount : 0,
            topup: 0,
            commission: 0,
            description: `${borrower?.name ?? ""} رجّع ${amount.toLocaleString("en")}`,
          });
        },

        settleLent: ({ borrowerId, amount, type, via = "cash", note }) => {
          const by = get().currentEmployeeId ?? "unknown";
          const at = nowIso();
          let left = amount;
          set((st) => ({
            lentOut: st.lentOut
              .slice()
              .sort((a, b) => a.givenAt.localeCompare(b.givenAt))
              .map((l) => {
                if (l.borrowerId !== borrowerId || left <= 0 || lentRemaining(l) <= 0) return l;
                const take = Math.min(left, lentRemaining(l));
                left -= take;
                const event: DebtEvent = { at, type, amount: take, by, via: type === "repaid" ? via : undefined, note };
                return type === "repaid"
                  ? { ...l, repaid: l.repaid + take, history: [...(l.history ?? []), event] }
                  : { ...l, forgiven: (l.forgiven ?? 0) + take, history: [...(l.history ?? []), event] };
              }),
          }));
          // A repayment brings money in; forgiving moves no cash (it's counted as a loss in the owner's net profit).
          if (type === "repaid") {
            const name = get().contacts.find((c) => c.id === borrowerId)?.name ?? "";
            movement({ kind: "lent_repaid", cash: via === "cash" ? amount : 0, wallet: via === "wallet" ? amount : 0, topup: 0, commission: 0, description: `${name} رجّع ${amount.toLocaleString("en")}` });
          }
        },

        settleLoan: ({ lenderId, amount, type, via = "cash", note }) => {
          const by = get().currentEmployeeId ?? "unknown";
          const at = nowIso();
          let left = amount;
          set((st) => ({
            loans: st.loans
              .slice()
              .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
              .map((l) => {
                if (l.lenderId !== lenderId || left <= 0 || loanRemaining(l) <= 0) return l;
                const take = Math.min(left, loanRemaining(l));
                left -= take;
                const event: DebtEvent = { at, type, amount: take, by, via: type === "repaid" ? via : undefined, note };
                return type === "repaid"
                  ? { ...l, repaid: l.repaid + take, history: [...(l.history ?? []), event] }
                  : { ...l, forgiven: (l.forgiven ?? 0) + take, history: [...(l.history ?? []), event] };
              }),
          }));
          if (type === "repaid") {
            const name = get().contacts.find((c) => c.id === lenderId)?.name ?? "";
            movement({ kind: "loan_repayment", cash: via === "cash" ? -amount : 0, wallet: via === "wallet" ? -amount : 0, topup: 0, commission: 0, description: `سداد لـ ${name}` });
          }
        },

        openShift: ({ float, count, expected }) => {
          // (cash needs no adjustment: the shift's drawer starts from the counted float)
          set((st) => ({
            shifts: [
              ...st.shifts,
              {
                id: uid("shift"),
                employeeId: st.currentEmployeeId ?? "unknown",
                openedAt: nowIso(),
                openingFloat: float,
                openingCount: count,
                openingExpected: expected,
                previousEmployeeId: lastClosedShift(st)?.employeeId,
              },
            ],
          }));
          adjustToCount(count, expected, "عند استلام الشيفت");
        },

        closeShift: ({ counted, count }) => {
          const shift = openShift()!;
          const s = get();
          const expected = expectedCash(s, shift);
          const closingExpected: BalanceCount = {
            wallet: walletBalance(s),
            machines: Object.fromEntries(balanceIds.map((id) => [id, machineBalance(s, id)])) as Record<BalanceId, number>,
          };
          adjustToCount(count, closingExpected, "عند تقفيل الشيفت"); // while the shift is still open, so it's recorded in it
          const closed = { ...shift, closedAt: nowIso(), countedCash: counted, expectedCash: expected, closingCount: count, closingExpected };
          set((st) => ({ shifts: st.shifts.map((x) => (x.id === shift.id ? closed : x)) }));
          return closed;
        },

        setBonusPercent: (id, percent) => set((st) => ({ bonusPercent: { ...st.bonusPercent, [id]: percent } })),

        initializeShop: (data) =>
          set({
            ...data,
            orders: [],
            movements: [],
            lentOut: [],
            purchases: [],
            payroll: [],
            revaluations: [],
            nextOrderNo: 1,
            isDemo: false,
            currentEmployeeId: null,
          }),

        resetDemo: () => set({ ...initialState() }),
      };
    },
    {
      name: "moga-demo-v18",
      storage: idbStorage,
    },
  ),
);

// ---------- Derived values (become SQL views later) ----------

export function currentShift(s: Pick<State, "shifts">) {
  return s.shifts.find((x) => !x.closedAt);
}

/** A phone's selling price: its own (used phones), or its model's. */
export function unitPrice(u: PhoneUnit, p: Product) {
  return u.retailPrice ?? p.retailPrice;
}

/** What the customer paid for the order: the items, plus any extra they left. */
export function orderTotal(o: Order) {
  return o.items.reduce((a, i) => a + i.qty * i.unitPrice, 0) + (o.extra ?? 0);
}

export function orderDiscount(o: Order) {
  return o.items.reduce((a, i) => a + i.qty * Math.max(0, (i.listPrice ?? i.unitPrice) - i.unitPrice), 0);
}

export function orderProfit(o: Order) {
  return o.items.reduce((a, i) => a + i.qty * (i.unitPrice - i.unitCost), 0) + (o.extra ?? 0);
}

export function shiftBreakdown(s: Pick<State, "orders" | "movements">, shift: Shift) {
  // Every sale made in the shift brought its cash in, even if it was returned later: the return is its own
  // "refund" movement in whichever shift it happened. Dropping returned orders here would count it twice.
  const orders = s.orders.filter((o) => o.shiftId === shift.id);
  const cashSales = orders.flatMap((o) => o.payments).filter((p) => p.method === "cash").reduce((a, p) => a + p.amount, 0);
  const moves = s.movements.filter((m) => m.shiftId === shift.id);
  const byKind = new Map<LedgerKind, number>();
  moves.forEach((m) => byKind.set(m.kind, (byKind.get(m.kind) ?? 0) + m.cash));
  return { orders, cashSales, moves, byKind };
}

export function expectedCash(s: Pick<State, "orders" | "movements">, shift: Shift) {
  const { cashSales, moves } = shiftBreakdown(s, shift);
  return shift.openingFloat + cashSales + moves.reduce((a, m) => a + m.cash, 0);
}

export function walletBalance(s: Pick<State, "walletOpening" | "movements" | "orders">) {
  // Historical demo orders are already folded into the opening balance.
  const sales = s.orders.filter((o) => !o.shiftId.startsWith("shift-hist")).flatMap((o) => o.payments).filter((p) => p.method === "vodafone_cash").reduce((a, p) => a + p.amount, 0);
  return s.walletOpening + sales + s.movements.reduce((a, m) => a + m.wallet, 0);
}

/** The bank account: InstaPay and card (فيزا) payments for sales land here. */
export function bankBalance(s: Pick<State, "extraOpening" | "movements" | "orders">) {
  // Historical demo orders are already folded into the opening balance.
  const sales = s.orders
    .filter((o) => !o.shiftId.startsWith("shift-hist"))
    .flatMap((o) => o.payments)
    .filter((p) => p.method === "instapay" || p.method === "card")
    .reduce((a, p) => a + p.amount, 0);
  return s.extraOpening.bank + sales + s.movements.reduce((a, m) => a + (m.bank ?? 0), 0);
}

export function machineBalance(s: Pick<State, "machineOpening" | "movements">, id: BalanceId) {
  return (s.machineOpening[id] ?? 0) + s.movements.filter((m) => m.balanceId === id).reduce((a, m) => a + m.topup, 0);
}

export function topupBalance(s: Pick<State, "machineOpening" | "movements">) {
  return (Object.keys(s.machineOpening) as BalanceId[]).reduce((a, id) => a + machineBalance(s, id), 0);
}

/** Agent account: > 0 the agent was paid and still owes us balance; < 0 we owe the agent. */
export function repBalance(s: Pick<State, "repOpening" | "movements">, id: MachineId) {
  return s.repOpening[id] + s.movements.filter((m) => m.machineId === id).reduce((a, m) => a + (m.rep ?? 0), 0);
}

/** Airtime bonus received on agent top-ups for a machine, optionally within one month (YYYY-MM). */
export function bonusTotal(s: Pick<State, "movements">, id: MachineId, month?: string) {
  return s.movements
    .filter((m) => m.machineId === id && m.kind === "rep_load" && (!month || m.createdAt.slice(0, 7) === month))
    .reduce((a, m) => a + m.commission, 0);
}

/**
 * Date of the oldest top-up the shop hasn't paid for yet (payments settle the oldest loads first).
 * The agent may wait days to collect, e.g. over a holiday while the banks are closed.
 */
export function repUnpaidSince(s: Pick<State, "repOpening" | "movements">, id: MachineId): string | null {
  if (repBalance(s, id) >= 0) return null;
  const moves = s.movements.filter((m) => m.machineId === id && m.rep);
  const opening = s.repOpening[id];
  const loads: { at: string; amount: number }[] = [];
  if (opening < 0) loads.push({ at: moves[0]?.createdAt ?? new Date().toISOString(), amount: -opening });
  for (const m of moves) if ((m.rep ?? 0) < 0) loads.push({ at: m.createdAt, amount: -(m.rep ?? 0) });
  let paid = Math.max(0, opening) + moves.reduce((a, m) => a + Math.max(0, m.rep ?? 0), 0);
  for (const l of loads) {
    if (paid < l.amount) return l.at;
    paid -= l.amount;
  }
  return null;
}

const cairoDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar days in Cairo: something from 11pm yesterday is "from yesterday" this morning, not "today". */
export function daysSince(iso: string) {
  const day = (d: Date) => Date.parse(cairoDate.format(d));
  return Math.max(0, Math.round((day(new Date()) - day(new Date(iso))) / 86400000));
}

export function repHistory(s: Pick<State, "movements">, id: MachineId) {
  return s.movements.filter((m) => m.machineId === id && m.rep).reverse();
}

export function lastClosedShift(s: Pick<State, "shifts">) {
  return s.shifts.filter((x) => x.closedAt).at(-1);
}


export function lentRemaining(l: LentOut) {
  return l.amount - l.repaid - (l.forgiven ?? 0);
}

export function loanRemaining(l: Loan) {
  return l.amount - l.repaid - (l.forgiven ?? 0);
}

/** Whole days past the agreed return date (0 if not due yet). */
export function lentOverdueDays(l: LentOut, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(now);
  if (lentRemaining(l) <= 0 || l.dueDate >= today) return 0;
  return Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${l.dueDate}T12:00:00Z`).getTime()) / 86400000);
}

export function planRemaining(p: InstallmentPlan) {
  if (p.cancelledAt) return 0;
  return p.schedule.reduce((a, d) => a + d.amount - d.paid, 0);
}

export function planOverdue(p: InstallmentPlan, now = new Date()) {
  const late = p.cancelledAt ? [] : p.schedule.filter((d) => new Date(d.dueDate) < now && d.paid < d.amount);
  const amount = late.reduce((a, d) => a + d.amount - d.paid, 0);
  const oldest = late[0];
  const days = oldest ? Math.floor((now.getTime() - new Date(oldest.dueDate).getTime()) / 86400000) : 0;
  return { count: late.length, amount, days };
}

/**
 * What returning a whole order gives back to the customer, by where the money leaves from: each payment
 * goes back the way it came in (cash → drawer, Vodafone Cash → wallet, InstaPay/card → bank). For an
 * installment sale it also includes the installments already collected, and the markup profit counted
 * on them, which the return reverses. `via` sends the whole amount back from one place instead.
 */
export function refundFor(s: Pick<State, "plans" | "movements" | "orders">, order: Order, via?: "cash" | "wallet" | "bank") {
  const by = { cash: 0, wallet: 0, bank: 0 };
  for (const p of order.payments) {
    if (p.method === "cash") by.cash += p.amount;
    else if (p.method === "vodafone_cash") by.wallet += p.amount;
    else if (p.method === "instapay" || p.method === "card") by.bank += p.amount;
    // "installment" (financed) and "credit" (on account): nothing was received for them at the sale.
  }
  // Bought partly on account: whatever they already paid off toward this sale comes back (as cash).
  const onAccount = order.payments.filter((p) => p.method === "credit").reduce((a, p) => a + p.amount, 0);
  const fromAccount = onAccount && order.customerId ? Math.min(onAccount, Math.max(0, onAccount - creditBalance(s, order.customerId))) : 0;
  by.cash += fromAccount;
  const plan = order.installmentPlanId ? s.plans.find((p) => p.id === order.installmentPlanId && !p.cancelledAt) : undefined;
  let installments = 0;
  let markup = 0;
  if (plan) {
    installments = plan.schedule.reduce((a, d) => a + d.paid, 0);
    let traced = 0;
    for (const m of s.movements.filter((x) => x.kind === "installment_collection" && x.planId === plan.id)) {
      by.cash += m.cash;
      by.wallet += m.wallet;
      by.bank += m.bank ?? 0;
      traced += m.cash + m.wallet + (m.bank ?? 0);
      markup += m.commission;
    }
    // Collections recorded before they were linked to their plan go back as cash, with the same markup share.
    const untraced = Math.max(0, installments - traced);
    by.cash += untraced;
    markup += Math.round((untraced * plan.markupPercent) / (100 + plan.markupPercent));
  }
  const total = by.cash + by.wallet + by.bank;
  // Given back another way than it was paid (e.g. paid by card, refunded in cash): all of it from there.
  const out = via ? { cash: 0, wallet: 0, bank: 0, [via]: total } : by;
  // `fromAccount` is part of the amounts above, leaving from `fromAccountVia`.
  return { ...out, total, installments, markup, plan, fromAccount, onAccount, fromAccountVia: via ?? ("cash" as const) };
}

/**
 * A customer's account (آجل): what they left unpaid on their sales, less what they paid off since.
 * The sale's profit counts on the sale day like any sale; this is money still to come in.
 */
export function creditBalance(s: Pick<State, "orders" | "movements">, customerId: string) {
  const owed = s.orders
    .filter((o) => o.status === "completed" && o.customerId === customerId)
    .flatMap((o) => o.payments)
    .filter((p) => p.method === "credit")
    .reduce((a, p) => a + p.amount, 0);
  const paid = s.movements.filter((m) => m.kind === "credit_collection" && m.contactId === customerId).reduce((a, m) => a + m.cash + m.wallet + (m.bank ?? 0), 0);
  return owed - paid;
}

/** Customers who ever bought on account. */
export function creditCustomerIds(s: Pick<State, "orders">) {
  return [...new Set(s.orders.filter((o) => o.customerId && o.payments.some((p) => p.method === "credit")).map((o) => o.customerId!))];
}

/** Advances given to an employee and not yet deducted from a salary. */
export function outstandingAdvances(s: Pick<State, "movements" | "payroll">, employeeId: string) {
  const given = s.movements.filter((m) => m.kind === "employee_advance" && m.targetEmployeeId === employeeId).reduce((a, m) => a + m.cash + m.wallet, 0);
  const deducted = s.payroll.filter((p) => p.employeeId === employeeId).reduce((a, p) => a + p.advances, 0);
  return Math.max(0, -given - deducted); // advances are money out, so `given` is negative
}
