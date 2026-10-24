import type { BalanceId, ItemCategory, LedgerKind, MachineId, PaymentMethod, ProductCategory } from "./types";

export const machineLabel: Record<MachineId, string> = {
  fawry: "فوري",
  momkn: "ممكن",
};
export const machineIds: MachineId[] = ["fawry", "momkn"];

export const balanceLabel: Record<BalanceId, string> = {
  fawry_airtime: "فوري — شحن (Air time)",
  fawry_general: "فوري — عام",
  momkn: "ممكن",
};
export const balanceIds: BalanceId[] = ["fawry_airtime", "fawry_general", "momkn"];
export const balanceCompany: Record<BalanceId, MachineId> = { fawry_airtime: "fawry", fawry_general: "fawry", momkn: "momkn" };
export const balancesOf = (id: MachineId) => balanceIds.filter((b) => balanceCompany[b] === id);

/** "من النهارده" / "من يوم" / "من يومين" / "من 3 أيام" / "من 12 يوم" */
export function sinceDays(days: number): string {
  if (days <= 0) return "من النهارده";
  if (days === 1) return "من يوم";
  if (days === 2) return "من يومين";
  return `من ${days} ${days <= 10 ? "أيام" : "يوم"}`;
}

const money = new Intl.NumberFormat("en-EG", { maximumFractionDigits: 0 });

export function egp(n: number): string {
  return `${money.format(Math.round(n))} ج.م`;
}

export function num(n: number): string {
  return money.format(Math.round(n));
}

export function pct(n: number, digits = 1): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

const dateFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Cairo",
});
const timeFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Africa/Cairo",
});

export function date(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function time(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function dateTime(iso: string): string {
  return `${date(iso)} · ${time(iso)}`;
}

export const categoryLabel: Record<ProductCategory, string> = {
  new_phone: "موبايل جديد",
  used_phone: "موبايل مستعمل",
  feature_phone: "موبايل زراير",
  accessory: "إكسسوار",
};

export const itemCategoryLabel: Record<ItemCategory, string> = { ...categoryLabel, service: "خدمة" };

/** Services the shop performs, sold from the sale screen. The employee enters cost and price each time. */
export const shopServices = [
  { id: "svc-google", name: "عمل حساب جوجل / متجر" },
  { id: "svc-apps", name: "تحميل برامج وألعاب" },
  { id: "svc-transfer", name: "نقل بيانات من موبايل لموبايل" },
  { id: "svc-software", name: "تحديث سوفت وير / فورمات" },
  { id: "svc-setup", name: "إعداد واتساب أو آي كلاود" },
] as const;
export const OTHER_SERVICE_ID = "svc-other";

export const paymentLabel: Record<PaymentMethod, string> = {
  cash: "كاش",
  vodafone_cash: "فودافون كاش",
  instapay: "إنستاباي",
  card: "فيزا",
  installment: "تقسيط",
};

export const ledgerLabel: Record<LedgerKind, string> = {
  expense: "مصروف",
  employee_advance: "سلفة موظف",
  owner_contribution: "إيداع من المالك",
  owner_drawing: "مسحوبات المالك",
  loan_received: "استلام سلفة خارجية",
  loan_repayment: "سداد سلفة خارجية",
  asset_purchase: "شراء أصل",
  savings_payment: "دفع قسط جمعية",
  savings_collection: "قبض جمعية",
  supplier_payment: "دفع لمورد",
  used_phone_purchase: "شراء موبايل مستعمل",
  vf_deposit: "إيداع فودافون كاش",
  vf_withdrawal: "سحب فودافون كاش",
  wallet_liquidation: "تسييل محفظة",
  topup_sale: "شحن / دفع فواتير",
  rep_payment: "دفع لمندوب",
  rep_load: "المندوب شحن الماكينة",
  lent_out: "سلفة لحد",
  salary_payment: "صرف مرتب",
  refund: "رد فلوس مرتجع",
  lent_repaid: "استرداد سلفة",
  installment_collection: "تحصيل قسط",
};
