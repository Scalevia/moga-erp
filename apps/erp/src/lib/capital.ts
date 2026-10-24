// Shop net worth (رأس المال): what the shop owns minus what it owes.
// Becomes a balance-sheet query over the ledger once the backend exists.

import { inventoryValue } from "./analytics";
import { balanceIds, balanceLabel, machineIds, machineLabel } from "./format";
import { bankBalance, currentShift, lentRemaining, expectedCash, lastClosedShift, machineBalance, outstandingAdvances, planRemaining, repBalance, useStore, walletBalance } from "./store";
import type { ProductCategory } from "./types";

type StoreState = ReturnType<typeof useStore.getState>;

export interface CapitalLine {
  label: string;
  value: number;
  sub?: string;
}

export interface CapitalGroup {
  key: "cash" | "stock" | "receivables" | "fixed";
  label: string;
  lines: CapitalLine[];
  total: number;
}

export function drawerCash(s: StoreState) {
  const open = currentShift(s);
  if (open) return { value: expectedCash(s, open), sub: "متوقع — الشيفت مفتوح" };
  const last = lastClosedShift(s);
  return { value: last?.countedCash ?? 0, sub: "اللي اتعدّ في الدرج عند آخر تقفيل" };
}

export function savingsBalance(s: StoreState) {
  // savings_payment takes cash out of the drawer into the جمعية, savings_collection brings it back.
  return s.extraOpening.savings - s.movements.filter((m) => m.kind === "savings_payment" || m.kind === "savings_collection").reduce((a, m) => a + m.cash, 0);
}

export function capital(s: StoreState) {
  const drawer = drawerCash(s);
  const cash: CapitalGroup = {
    key: "cash",
    label: "السيولة",
    lines: [
      { label: "درج الكاش", value: drawer.value, sub: drawer.sub },
      { label: "محفظة فودافون كاش", value: walletBalance(s) },
      ...balanceIds.map((id) => ({ label: `ماكينة ${balanceLabel[id]}`, value: machineBalance(s, id) })),
      { label: "البنك (إنستاباي)", value: bankBalance(s) },
    ],
    total: 0,
  };

  const inv = inventoryValue(s.products, s.units);
  const byCat: Record<ProductCategory, { cost: number; retail: number; count: number }> = {
    new_phone: { cost: 0, retail: 0, count: 0 },
    used_phone: { cost: 0, retail: 0, count: 0 },
    feature_phone: { cost: 0, retail: 0, count: 0 },
    accessory: { cost: 0, retail: 0, count: 0 },
  };
  for (const r of inv.rows) {
    const c = byCat[r.product.category];
    c.cost += r.cost;
    c.retail += r.retail;
    c.count += r.count;
  }
  const catLabels: Record<ProductCategory, string> = {
    new_phone: "موبايلات جديدة",
    used_phone: "موبايلات مستعملة",
    feature_phone: "موبايلات زراير",
    accessory: "إكسسوارات",
  };
  const stock: CapitalGroup = {
    key: "stock",
    label: "البضاعة (بسعر التكلفة)",
    lines: (Object.keys(byCat) as ProductCategory[]).map((k) => ({
      label: catLabels[k],
      value: byCat[k].cost,
      sub: `${byCat[k].count} قطعة · تتباع بـ ${Math.round(byCat[k].retail).toLocaleString("en")}`,
    })),
    total: 0,
  };

  // Count only the unpaid principal; the markup is profit that isn't earned until collected.
  const principal = s.plans.reduce((a, p) => a + planRemaining(p) / (1 + p.markupPercent / 100), 0);
  const withMarkup = s.plans.reduce((a, p) => a + planRemaining(p), 0);
  const receivables: CapitalGroup = {
    key: "receivables",
    label: "فلوس ليك برّه",
    lines: [
      { label: "أقساط عند العملاء", value: principal, sub: `بالزيادة ${Math.round(withMarkup).toLocaleString("en")} — الزيادة بتتحسب لما تتحصل` },
      { label: "الجمعية", value: savingsBalance(s), sub: "اللي دفعته ولسه ما قبضتهاش" },
      ...(() => {
        const open = s.lentOut.filter((l) => lentRemaining(l) > 0);
        return open.length
          ? [{ label: "سُلف عند ناس", value: open.reduce((a, l) => a + lentRemaining(l), 0), sub: `${open.length} شخص — هترجع` }]
          : [];
      })(),
      // An advance left the drawer but is still the shop's money until it's deducted from a salary.
      ...(() => {
        const owing = s.staff.map((e) => outstandingAdvances(s, e.id)).filter((v) => v > 0);
        return owing.length
          ? [{ label: "سُلف الموظفين", value: owing.reduce((a, v) => a + v, 0), sub: `${owing.length} موظف — بتتخصم من المرتب` }]
          : [];
      })(),
    ],
    total: 0,
  };

  const assetPurchases = -s.movements.filter((m) => m.kind === "asset_purchase").reduce((a, m) => a + m.cash, 0);
  const fixed: CapitalGroup = {
    key: "fixed",
    label: "أصول ثابتة",
    lines: [{ label: "ديكور، لابتوب، طابعة، ماكينات", value: s.extraOpening.fixedAssets + assetPurchases, sub: "بسعر الشراء" }],
    total: 0,
  };

  const assets = [cash, stock, receivables, fixed].map((g) => ({ ...g, total: g.lines.reduce((a, l) => a + l.value, 0) }));
  const totalAssets = assets.reduce((a, g) => a + g.total, 0);

  const suppliers = Object.values(s.supplierPayables).reduce((a, v) => a + v, 0);
  const loans = s.loans.reduce((a, l) => a + l.amount - l.repaid, 0);
  const liabilities: CapitalLine[] = [
    { label: "حسابات الموردين", value: suppliers },
    { label: "سُلف خارجية", value: loans },
    ...machineIds
      .filter((id) => repBalance(s, id) < 0)
      .map((id) => ({ label: `لمندوب ${machineLabel[id]} (شحن على الحساب)`, value: -repBalance(s, id) })),
  ];
  const totalLiabilities = liabilities.reduce((a, l) => a + l.value, 0);

  return {
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    net: totalAssets - totalLiabilities,
    stockAtRetail: inv.retail,
  };
}
