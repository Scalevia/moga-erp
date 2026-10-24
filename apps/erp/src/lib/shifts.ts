// Differences found when a shift was opened: what the next person counted vs. what the previous
// close left behind. Cash never leaves the drawer between shifts, so any gap means money went
// missing (or was miscounted) between the two counts.

import { balanceIds, balanceLabel } from "./format";
import type { Shift } from "./types";

export interface OpeningDiff {
  label: string;
  diff: number; // counted − expected (negative = missing)
}

export function openingDiffs(shift: Shift): OpeningDiff[] {
  const expected = shift.openingExpected;
  if (!expected) return [];
  const out: OpeningDiff[] = [];
  if (expected.cash !== null) out.push({ label: "الدرج", diff: shift.openingFloat - expected.cash });
  if (shift.openingCount) {
    out.push({ label: "فودافون كاش", diff: shift.openingCount.wallet - expected.wallet });
    for (const id of balanceIds) out.push({ label: balanceLabel[id], diff: shift.openingCount.machines[id] - expected.machines[id] });
  }
  return out.filter((d) => d.diff !== 0);
}

/** "الدرج −200 · ممكن +50" */
export function describeDiffs(diffs: OpeningDiff[]) {
  return diffs.map((d) => `${d.label} ${d.diff > 0 ? "+" : "−"}${Math.abs(Math.round(d.diff)).toLocaleString("en")}`).join(" · ");
}
