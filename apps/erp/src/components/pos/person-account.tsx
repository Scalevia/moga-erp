"use client";

import { CheckCircle2, HandCoins, HeartHandshake } from "lucide-react";
import { useState } from "react";
import { Button, Field, Input, Modal, Money, Segmented, cn } from "@/components/ui";
import { personAccounts } from "@/lib/debts";
import { lentRemaining, loanRemaining, useStore } from "@/lib/store";
import { CallButton, Statement } from "./statement";

type Action = "collect" | "forgiveTheirs" | "repayOurs" | "forgivenOurs";

const actionText: Record<Action, { title: string; button: string; hint: string }> = {
  collect: { title: "سداد", button: "تسجيل السداد", hint: "الفلوس بتدخل الدرج أو المحفظة" },
  forgiveTheirs: { title: "مسامحة", button: "تأكيد المسامحة", hint: "المبلغ ده هيتشال من عليه، وهيتحسب خسارة على المحل" },
  repayOurs: { title: "سدّدنا له", button: "تسجيل السداد", hint: "الفلوس بتطلع من الدرج أو المحفظة" },
  forgivenOurs: { title: "سامح المحل", button: "تأكيد", hint: "المبلغ ده هيتشال من اللي على المحل له" },
};

/** One person's statement: everything borrowed and lent with dates, plus repay / forgive actions. */
export function PersonAccountModal({ phone, onClose }: { phone: string; onClose: () => void }) {
  const store = useStore();
  const me = store.staff.find((e) => e.id === store.currentEmployeeId);
  const isOwner = me?.role === "admin";
  const account = personAccounts(store).find((p) => p.phone === phone);
  const [action, setAction] = useState<Action | null>(null);
  const [amount, setAmount] = useState("");
  const [via, setVia] = useState<"cash" | "wallet">("cash");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);

  if (!account) return null;

  const max = action === "collect" || action === "forgiveTheirs" ? account.owesShop : account.shopOwes;
  const a = Number(amount) || 0;
  const valid = a > 0 && a <= max;

  function open(next: Action) {
    setAction(next);
    setAmount(String(next === "collect" || next === "forgiveTheirs" ? account!.owesShop : account!.shopOwes));
    setVia("cash");
    setNote("");
    setDone(null);
  }

  function submit() {
    if (!action || !valid) return;
    const n = note.trim() || undefined;
    if (action === "collect" || action === "forgiveTheirs") {
      // Spread over every borrower record of this person, oldest first.
      let left = a;
      for (const id of account!.borrowerIds) {
        const owed = store.lentOut.filter((l) => l.borrowerId === id).reduce((s, l) => s + lentRemaining(l), 0);
        const take = Math.min(left, owed);
        if (take > 0) store.settleLent({ borrowerId: id, amount: take, type: action === "collect" ? "repaid" : "forgiven", via, note: n });
        left -= take;
      }
    } else {
      let left = a;
      for (const id of account!.lenderIds) {
        const owed = store.loans.filter((l) => l.lenderId === id).reduce((s, l) => s + loanRemaining(l), 0);
        const take = Math.min(left, owed);
        if (take > 0) store.settleLoan({ lenderId: id, amount: take, type: action === "repayOurs" ? "repaid" : "forgiven", via, note: n });
        left -= take;
      }
    }
    setDone(`${actionText[action].title}: ${a.toLocaleString("en")} ج.م`);
    setAction(null);
  }

  return (
    <Modal open onClose={onClose} title={`حساب ${account.name}`} width="max-w-lg">
      <div className="space-y-4">
        {account.phone && (
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <CallButton phone={account.phone} name={account.name} /> اتصال
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className={cn("rounded-lg p-3", account.owesShop > 0 ? "bg-good-soft" : "bg-surface-2")}>
            <div className="text-xs text-ink-3">عليه للمحل</div>
            <Money value={account.owesShop} className={cn("text-lg font-bold", account.owesShop > 0 && "text-good")} />
          </div>
          <div className={cn("rounded-lg p-3", account.shopOwes > 0 ? "bg-bad-soft" : "bg-surface-2")}>
            <div className="text-xs text-ink-3">المحل عليه له</div>
            <Money value={account.shopOwes} className={cn("text-lg font-bold", account.shopOwes > 0 && "text-bad")} />
          </div>
        </div>

        {/* actions */}
        {!action && (
          <div className="grid grid-cols-2 gap-2">
            {account.owesShop > 0 && (
              <Button size="sm" onClick={() => open("collect")}>
                <HandCoins size={15} /> سداد
              </Button>
            )}
            {account.owesShop > 0 && isOwner && (
              <Button size="sm" variant="secondary" onClick={() => open("forgiveTheirs")}>
                <HeartHandshake size={15} /> مسامحة
              </Button>
            )}
            {account.shopOwes > 0 && (
              <Button size="sm" onClick={() => open("repayOurs")}>
                <HandCoins size={15} /> سدّدنا له
              </Button>
            )}
            {account.shopOwes > 0 && isOwner && (
              <Button size="sm" variant="secondary" onClick={() => open("forgivenOurs")}>
                <HeartHandshake size={15} /> سامح المحل
              </Button>
            )}
          </div>
        )}

        {action && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="font-semibold">{actionText[action].title}</div>
            <Field
              label="المبلغ"
              hint={a > max ? <span className="text-bad">أكتر من المتبقي (<Money value={max} />)</span> : actionText[action].hint}
            >
              <Input autoFocus type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-lg font-semibold" />
            </Field>
            {(action === "collect" || action === "repayOurs") && (
              <Segmented
                value={via}
                onChange={setVia}
                options={[
                  { value: "cash", label: "كاش (الدرج)" },
                  { value: "wallet", label: "فودافون كاش" },
                ]}
              />
            )}
            <Field label="ملاحظة (اختياري)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={action === "forgiveTheirs" ? "مثال: ظروفه صعبة" : ""} />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" disabled={!valid} onClick={submit}>
                {actionText[action].button}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAction(null)}>
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {done && (
          <div className="flex items-center gap-2 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
            <CheckCircle2 size={16} /> اتسجل — {done}
          </div>
        )}

        {/* Balance from the shop's side: positive = he owes the shop, negative = the shop owes him. */}
        <Statement
          lines={account.lines}
          upIsGood
          describe={(b) => (b > 0 ? `عليه ${b.toLocaleString("en")}` : b < 0 ? `ليه ${(-b).toLocaleString("en")}` : "خالص")}
          legend="الأحدث فوق · «عليه» = عليه فلوس للمحل، «ليه» = المحل عليه له"
        />
      </div>
    </Modal>
  );
}
