"use client";

import { useState } from "react";
import { cn } from "@/components/ui";
import type { MonthStat } from "@/lib/analytics";
import { num } from "@/lib/format";

/** Bar with 4px rounded data-end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function niceMax(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v || 1)));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

export function RevenueProfitChart({ data }: { data: MonthStat[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const W = 360;
  const H = 200;
  const pad = { t: 10, r: 4, b: 22, l: 34 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const max = niceMax(Math.max(...data.map((d) => d.revenue)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const gw = pw / data.length;
  const bw = Math.max(3, (gw - 6) / 2 - 1);
  const y = (v: number) => pad.t + ph - (v / max) * ph;

  const active = hover ?? data.length - 1;
  const a = data[active];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-1)" }} /> الإيرادات
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--series-2)" }} /> مجمل الربح
          </span>
        </div>
        <button onClick={() => setAsTable(!asTable)} className="text-xs text-brand hover:underline">
          {asTable ? "عرض كرسم" : "عرض كجدول"}
        </button>
      </div>

      {asTable ? (
        <table className="w-full text-sm">
          <thead className="text-xs text-ink-3">
            <tr>
              <th className="py-1 text-start font-medium">الشهر</th>
              <th className="py-1 text-start font-medium">الإيرادات</th>
              <th className="py-1 text-start font-medium">الربح</th>
              <th className="py-1 text-start font-medium">هامش</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((d) => (
              <tr key={d.key}>
                <td className="py-1.5">{d.label}</td>
                <td className="num py-1.5">{num(d.revenue)}</td>
                <td className="num py-1.5">{num(d.profit)}</td>
                <td className="num py-1.5 text-ink-3">{d.revenue ? ((d.profit / d.revenue) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="mb-2 flex items-baseline gap-4 text-sm">
            <span className="font-semibold">{a.label}</span>
            <span className="text-ink-2">
              إيرادات <b className="num text-ink">{num(a.revenue)}</b>
            </span>
            <span className="text-ink-2">
              ربح <b className="num text-ink">{num(a.profit)}</b>
            </span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" direction="ltr" role="img" aria-label="الإيرادات مقابل مجمل الربح لآخر 12 شهر" onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--ink-3)">
                  {compact(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const gx = pad.l + i * gw + (gw - (bw * 2 + 2)) / 2;
              const dim = hover !== null && hover !== i;
              return (
                <g key={d.key} opacity={dim ? 0.45 : 1}>
                  <path d={barPath(gx, y(d.revenue), bw, pad.t + ph - y(d.revenue))} fill="var(--series-1)" />
                  <path d={barPath(gx + bw + 2, y(d.profit), bw, pad.t + ph - y(d.profit))} fill="var(--series-2)" />
                  {(i % 2 === 1 || data.length <= 6) && (
                    <text x={pad.l + i * gw + gw / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--ink-3)">
                      {d.label}
                    </text>
                  )}
                  <rect
                    x={pad.l + i * gw}
                    y={pad.t}
                    width={gw}
                    height={ph}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onClick={() => setHover(i)}
                  />
                </g>
              );
            })}
          </svg>
        </>
      )}
    </div>
  );
}

export function CategoryBars({ rows }: { rows: { label: string; value: number }[] }) {
  const total = rows.reduce((a, r) => a + Math.max(0, r.value), 0);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{r.label}</span>
            <span className="text-ink-2">
              <span className="num font-semibold text-ink">{num(r.value)}</span>
              <span className="num ms-2 text-xs">{total ? Math.round((r.value / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className={cn("h-2 rounded-full")} style={{ width: `${(Math.max(0, r.value) / max) * 100}%`, background: "var(--series-1)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
