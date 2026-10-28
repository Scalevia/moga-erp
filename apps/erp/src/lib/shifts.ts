// Differences found when counting the drawer, the Vodafone Cash wallet and the machines: at opening
// (what the next person counted vs. what the previous close left behind — cash never leaves the drawer
// between shifts) and at closing (what was counted vs. what the shift should have ended with).
// Shortages and overages both count in the real net profit.

import { balanceIds, balanceLabel } from "./format";
import { expectedCash, orderDiscount, orderProfit, orderTotal } from "./store";
import type { CashMovement, Order, PaymentMethod, Shift } from "./types";

export interface CountDiff {
  label: string;
  diff: number; // counted − expected (negative = missing)
}

export function openingDiffs(shift: Shift): CountDiff[] {
  const expected = shift.openingExpected;
  if (!expected) return [];
  const out: CountDiff[] = [];
  if (expected.cash !== null) out.push({ label: "الدرج", diff: shift.openingFloat - expected.cash });
  if (shift.openingCount) {
    out.push({ label: "فودافون كاش", diff: shift.openingCount.wallet - expected.wallet });
    for (const id of balanceIds) out.push({ label: balanceLabel[id], diff: shift.openingCount.machines[id] - expected.machines[id] });
  }
  return out.filter((d) => d.diff !== 0);
}

export function closingDiffs(shift: Shift): CountDiff[] {
  if (!shift.closedAt) return [];
  const out: CountDiff[] = [{ label: "الدرج", diff: (shift.countedCash ?? 0) - (shift.expectedCash ?? 0) }];
  const expected = shift.closingExpected;
  if (expected && shift.closingCount) {
    out.push({ label: "فودافون كاش", diff: shift.closingCount.wallet - expected.wallet });
    for (const id of balanceIds) out.push({ label: balanceLabel[id], diff: shift.closingCount.machines[id] - expected.machines[id] });
  }
  return out.filter((d) => d.diff !== 0);
}

/** "الدرج −200 · ممكن +50" */
export function describeDiffs(diffs: CountDiff[]) {
  return diffs.map((d) => `${d.label} ${d.diff > 0 ? "+" : "−"}${Math.abs(Math.round(d.diff)).toLocaleString("en")}`).join(" · ");
}

/** Everything that happened in one shift, for the owner's shift page. Open shifts give the numbers so far. */
export function shiftReport(s: { orders: Order[]; movements: CashMovement[]; shifts: Shift[] }, shift: Shift) {
  const orders = s.orders.filter((o) => o.shiftId === shift.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const kept = orders.filter((o) => o.status === "completed");
  const moves = s.movements.filter((m) => m.shiftId === shift.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const byMethod = new Map<PaymentMethod, number>();
  for (const p of kept.flatMap((o) => o.payments)) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
  // Agent loads recorded on the opening screen, before this shift existed.
  const previousClose = s.shifts.filter((x) => x.closedAt && x.closedAt <= shift.openedAt).at(-1)?.closedAt ?? "";
  const loadsBefore = s.movements.filter((m) => m.kind === "rep_load" && m.shiftId === "none" && m.createdAt > previousClose && m.createdAt <= shift.openedAt);
  const services = moves.reduce((a, m) => a + m.commission, 0);
  return {
    orders,
    returned: orders.filter((o) => o.status === "returned"),
    sales: kept.reduce((a, o) => a + orderTotal(o), 0),
    discount: kept.reduce((a, o) => a + orderDiscount(o), 0),
    profit: kept.reduce((a, o) => a + orderProfit(o), 0) + services,
    byMethod: [...byMethod].sort((a, b) => b[1] - a[1]),
    moves: moves.filter((m) => m.kind !== "count_adjustment"),
    loadsBefore,
    cashNow: shift.closedAt ? (shift.countedCash ?? 0) : expectedCash(s, shift),
  };
}

/** Closed: matched, or the total missing / extra found when closing. */
export function shiftStatus(shift: Shift) {
  if (!shift.closedAt) return { tone: "brand" as const, text: "مفتوحة دلوقتي" };
  const diffs = closingDiffs(shift);
  const missing = diffs.filter((d) => d.diff < 0).reduce((a, d) => a - d.diff, 0);
  const extra = diffs.filter((d) => d.diff > 0).reduce((a, d) => a + d.diff, 0);
  if (missing) return { tone: "bad" as const, text: `عجز ${Math.round(missing).toLocaleString("en")}` };
  if (extra) return { tone: "warn" as const, text: `زيادة ${Math.round(extra).toLocaleString("en")}` };
  return { tone: "good" as const, text: "مظبوط" };
}
