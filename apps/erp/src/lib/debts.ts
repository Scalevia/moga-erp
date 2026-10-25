// Person-to-shop debts in both directions (money lent out, money borrowed), as one statement
// per person. A person is matched by phone: the same neighbour can owe the shop and be owed by it.

import { lentRemaining, loanRemaining } from "./store";
import type { Contact, DebtEvent, LentOut, Loan } from "./types";

export interface StatementLine {
  key: string;
  at: string;
  label: string;
  /** Effect on the balance from the shop's side: + he owes the shop more, − the shop owes him more. */
  change: number;
  by?: string;
  via?: DebtEvent["via"];
  note?: string;
}

export interface PersonAccount {
  phone: string;
  name: string;
  borrowerIds: string[];
  lenderIds: string[];
  owesShop: number; // still owed to the shop
  shopOwes: number; // the shop still owes him
  lines: StatementLine[]; // oldest first, with the running balance worked out by the caller
  lastAt: string;
}

/** Repayments recorded before history existed (sample data) show as one undated-by-event line. */
function legacyRepaid(total: number, history: DebtEvent[] | undefined) {
  const logged = (history ?? []).filter((e) => e.type === "repaid").reduce((a, e) => a + e.amount, 0);
  return Math.max(0, total - logged);
}

export function personAccounts(s: { contacts: Contact[]; lentOut: LentOut[]; loans: Loan[] }): PersonAccount[] {
  const byPhone = new Map<string, PersonAccount>();
  const person = (c: Contact) => {
    const key = c.phone || c.id;
    let p = byPhone.get(key);
    if (!p) {
      p = { phone: c.phone, name: c.name, borrowerIds: [], lenderIds: [], owesShop: 0, shopOwes: 0, lines: [], lastAt: "" };
      byPhone.set(key, p);
    }
    return p;
  };

  for (const l of s.lentOut) {
    const c = s.contacts.find((x) => x.id === l.borrowerId);
    if (!c) continue;
    const p = person(c);
    if (!p.borrowerIds.includes(c.id)) p.borrowerIds.push(c.id);
    p.owesShop += lentRemaining(l);
    p.lines.push({ key: `${l.id}-given`, at: l.givenAt, label: "اتسلّف من المحل", change: l.amount, by: l.givenBy, note: l.notes });
    const old = legacyRepaid(l.repaid, l.history);
    if (old) p.lines.push({ key: `${l.id}-old`, at: l.givenAt, label: "سدّد (قبل التسجيل بالتاريخ)", change: -old });
    (l.history ?? []).forEach((e, i) =>
      p.lines.push({
        key: `${l.id}-${i}`,
        at: e.at,
        label: e.type === "repaid" ? "سدّد للمحل" : "المحل سامحه",
        change: -e.amount,
        by: e.by,
        via: e.via,
        note: e.note,
      }),
    );
  }

  for (const l of s.loans) {
    const c = s.contacts.find((x) => x.id === l.lenderId);
    if (!c) continue;
    const p = person(c);
    if (!p.lenderIds.includes(c.id)) p.lenderIds.push(c.id);
    p.shopOwes += loanRemaining(l);
    p.lines.push({ key: `${l.id}-given`, at: l.receivedAt, label: "المحل اتسلّف منه", change: -l.amount, by: l.receivedBy, note: l.notes });
    const old = legacyRepaid(l.repaid, l.history);
    if (old) p.lines.push({ key: `${l.id}-old`, at: l.receivedAt, label: "المحل سدّد له (قبل التسجيل بالتاريخ)", change: old });
    (l.history ?? []).forEach((e, i) =>
      p.lines.push({
        key: `${l.id}-${i}`,
        at: e.at,
        label: e.type === "repaid" ? "المحل سدّد له" : "سامح المحل",
        change: e.amount,
        by: e.by,
        via: e.via,
        note: e.note,
      }),
    );
  }

  for (const p of byPhone.values()) {
    p.lines.sort((a, b) => a.at.localeCompare(b.at));
    p.lastAt = p.lines.at(-1)?.at ?? "";
  }
  return [...byPhone.values()];
}
