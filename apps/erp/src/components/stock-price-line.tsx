import { Money, cn } from "@/components/ui";

/** The month's gain or loss from prices moving on stock in the shop — shown under net profit, not in it. */
export function StockPriceLine({ value }: { value: number }) {
  if (!value) return null;
  const up = value > 0;
  return (
    <div className="flex justify-between gap-3 px-4 py-2.5">
      <dt>
        {up ? "مكسب غلاء البضاعة" : "خسارة نزول أسعار البضاعة"}
        <span className="block text-xs text-ink-3">
          {up ? "بره صافي الربح · زوّد رأس المال، بس هتحتاجه عشان تجيب البضاعة بالسعر الجديد" : "بره صافي الربح · قلّل قيمة البضاعة اللي في المحل"}
        </span>
      </dt>
      <dd className={cn("shrink-0", up ? "text-good" : "text-bad")}>
        {up ? "+ " : "− "}
        <Money value={Math.abs(value)} />
      </dd>
    </div>
  );
}
