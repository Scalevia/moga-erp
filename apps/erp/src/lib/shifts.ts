// Differences found when counting the drawer, the Vodafone Cash wallet and the machines: at opening
// (what the next person counted vs. what the previous close left behind — cash never leaves the drawer
// between shifts) and at closing (what was counted vs. what the shift should have ended with).
// Shortages and overages both count in the real net profit.

import { balanceIds, balanceLabel } from "./format";
import type { Shift } from "./types";

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
