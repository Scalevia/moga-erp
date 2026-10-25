// Domain types for the UI prototype. They mirror the planned Supabase schema
// closely so the screens can switch from mock data to real RPC calls later.

export type Role = "admin" | "employee";

export interface Employee {
  id: string;
  name: string;
  role: Role;
  phone?: string;
  salary: number; // monthly
  active: boolean; // deactivated employees can't log in but keep their history
}

/** Owner-editable settings (shown on the receipt and used in calculations). */
export interface ShopSettings {
  shopName: string;
  address: string;
  phone: string;
  warranty: string;
  usedWarrantyDays: number;
  agentVfFeePercent: number;
  employeeLendLimit: number;
}

export interface PurchaseLine {
  productId: string;
  name: string;
  qty: number;
  unitCost: number;
  imeis?: string[];
}

/** A supplier delivery received as one invoice. */
export interface PurchaseInvoice {
  id: string;
  number: number;
  supplierId: string;
  supplierRef?: string; // the supplier's own invoice number
  createdAt: string;
  employeeId: string;
  lines: PurchaseLine[];
  total: number;
  paid: number;
  via: "cash" | "wallet" | "bank";
}

/**
 * The owner re-costed a model's stock to today's wholesale price because prices moved while it sat
 * in the shop. The difference is a gain (or loss) on holding stock, kept apart from sales profit.
 */
export interface Revaluation {
  id: string;
  at: string;
  by: string;
  productId: string;
  qty: number; // pieces in stock when it was re-costed
  oldCost: number; // what those pieces cost in total before
  newUnitCost: number;
  amount: number; // qty × newUnitCost − oldCost: + prices rose, − prices fell
}

export interface PayrollEntry {
  id: string;
  employeeId: string;
  month: string; // yyyy-mm
  salary: number;
  advances: number; // advances deducted from this salary
  net: number;
  paidAt: string;
  via: "cash" | "wallet" | "bank";
}

/** What an invoice line can be: a stocked product, or a service the shop performs (no stock). */
export type ItemCategory = ProductCategory | "service";

export type ProductCategory =
  | "new_phone"
  | "used_phone"
  | "feature_phone"
  | "accessory";

export type TrackingType = "imei" | "quantity";

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  tracking: TrackingType;
  barcode?: string;
  retailPrice: number;
  avgCost: number; // quantity items only
  quantity: number; // quantity items only
}

export type UnitStatus = "in_stock" | "sold" | "returned" | "reserved";

export interface PhoneUnit {
  imei: string;
  productId: string;
  condition: "new" | "used";
  cost: number;
  status: UnitStatus;
  supplierId?: string;
  purchasedAt: string;
  inspection?: UsedInspection;
  soldOrderId?: string;
}

export interface UsedInspection {
  batteryHealth: number;
  screen: "excellent" | "scratches" | "cracked";
  body: "excellent" | "good" | "worn";
  hasBox: boolean;
  hasCharger: boolean;
  notes?: string;
}

export type ContactKind = "customer" | "supplier" | "lender" | "guarantor" | "borrower";

export interface Contact {
  id: string;
  kind: ContactKind;
  name: string;
  phone: string;
  nationalId?: string;
}

export type PaymentMethod =
  | "cash"
  | "vodafone_cash"
  | "instapay"
  | "card"
  | "installment";

export interface Payment {
  method: PaymentMethod;
  amount: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  category: ItemCategory;
  imei?: string;
  qty: number;
  note?: string; // services: what was actually done for the customer
  listPrice?: number; // shelf price before the cashier's discount
  unitPrice: number; // what the customer actually paid per unit
  unitCost: number;
}

export interface Order {
  id: string;
  number: number;
  createdAt: string;
  employeeId: string;
  shiftId: string;
  customerId?: string;
  items: OrderItem[];
  payments: Payment[];
  installmentPlanId?: string;
  status: "completed" | "returned";
}

export interface InstallmentPlan {
  id: string;
  orderId: string;
  customerId: string;
  guarantorId?: string;
  cashPrice: number;
  downPayment: number;
  markupPercent: number;
  months: number;
  startDate: string;
  schedule: InstallmentDue[];
}

export interface InstallmentDue {
  n: number;
  dueDate: string;
  amount: number;
  paid: number;
}

export type LedgerKind =
  | "expense"
  | "employee_advance"
  | "owner_contribution"
  | "owner_drawing"
  | "loan_received"
  | "loan_repayment"
  | "asset_purchase"
  | "savings_payment"
  | "savings_collection"
  | "supplier_payment"
  | "used_phone_purchase"
  | "vf_deposit"
  | "vf_withdrawal"
  | "wallet_liquidation"
  | "topup_sale"
  | "rep_payment"
  | "rep_load"
  | "lent_out"
  | "salary_payment"
  | "refund"
  | "lent_repaid"
  | "installment_collection";

/** Service companies whose machines are topped up by an agent (مندوب). One agent account per company. */
export type MachineId = "fawry" | "momkn";

/** Separate balances on the machines — Fawry keeps Air time (with bonus) apart from General services. */
export type BalanceId = "fawry_airtime" | "fawry_general" | "momkn";

export interface CashMovement {
  id: string;
  createdAt: string;
  shiftId: string;
  employeeId: string;
  kind: LedgerKind;
  // Signed effect on each money account (+ in, − out).
  cash: number;
  wallet: number;
  topup: number; // effect on machine balance `balanceId`
  bank?: number; // InstaPay / bank account
  commission: number;
  machineId?: MachineId; // company whose agent account `rep` applies to
  balanceId?: BalanceId;
  targetEmployeeId?: string; // whose advance / salary this is
  contactId?: string; // the supplier a payment went to
  category?: string; // expense category (إيجار، كهرباء…)
  // Effect on the agent account of `machineId`: + means the agent owes us balance, − means we owe the agent.
  rep?: number;
  description: string;
}

export interface BalanceCount {
  wallet: number;
  machines: Record<BalanceId, number>;
}

export interface Shift {
  id: string;
  employeeId: string;
  openedAt: string;
  openingFloat: number; // the cash actually counted at opening
  openingCount?: BalanceCount;
  /**
   * What should have been there at opening: the previous close's counts (cash stays in the drawer
   * between shifts — the owner never takes it home). Kept to show money missing between two shifts.
   */
  openingExpected?: { cash: number | null; wallet: number; machines: Record<BalanceId, number> };
  previousEmployeeId?: string; // who closed the shift before this one (the handover)
  closedAt?: string;
  countedCash?: number;
  expectedCash?: number;
  closingCount?: BalanceCount;
}

/** One settlement on a debt: a repayment, or the creditor forgiving (part of) it. */
export interface DebtEvent {
  at: string;
  type: "repaid" | "forgiven";
  amount: number;
  by: string; // employee id who recorded it
  via?: "cash" | "wallet";
  note?: string;
}

/** Money the shop lent to someone (a neighbour, a friend) — still shop money, expected back. */
export interface LentOut {
  id: string;
  borrowerId: string;
  amount: number;
  repaid: number;
  forgiven?: number; // written off by the shop — a loss
  history?: DebtEvent[];
  givenAt: string;
  dueDate: string; // yyyy-mm-dd
  givenBy: string; // employee id
  notes?: string;
}

export interface Loan {
  id: string;
  lenderId: string;
  amount: number;
  repaid: number;
  forgiven?: number; // the lender let the shop off this part
  history?: DebtEvent[];
  receivedBy?: string;
  receivedAt: string;
  notes?: string;
}
