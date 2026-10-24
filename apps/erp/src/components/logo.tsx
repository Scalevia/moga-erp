// MOGA brand marks (concept A: the phone is the "O"). Source files live in /brand at the repo root.

const BRAND = "#0f766e";
const INK = "#111827";

type Tone = "color" | "white" | "black";

/** Full wordmark. `height` in px; width follows the 410×106 aspect ratio. */
export function Logo({ height = 28, tone = "color", className }: { height?: number; tone?: Tone; className?: string }) {
  const ink = tone === "white" ? "#ffffff" : tone === "black" ? "#000000" : INK;
  const phone = tone === "color" ? BRAND : ink;
  return (
    <svg
      viewBox="-2 -2 410 106"
      height={height}
      width={(height * 410) / 106}
      fill="none"
      strokeWidth={18}
      strokeLinejoin="round"
      role="img"
      aria-label="MOGA"
      className={className}
    >
      <path d="M9 100 V9 L42 60 L75 9 V100" stroke={ink} />
      <rect x="111" y="9" width="60" height="82" rx="14" stroke={phone} />
      <path d="M133 27 H149" stroke={phone} strokeWidth={7} strokeLinecap="round" />
      <path d="M277 21 A41 41 0 1 0 289 50 H254" stroke={ink} />
      <path d="M325 100 L361 9 L397 100 M340 66 H382" stroke={ink} />
    </svg>
  );
}

/** App icon: green rounded square with the phone and M. */
export function LogoIcon({ size = 32, className }: { size?: number; className?: string }) {
  const small = size < 40;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="MOGA" className={className}>
      <rect width="120" height="120" rx="28" fill={BRAND} />
      <rect x="38" y="20" width="44" height="80" rx="11" fill="none" stroke="#ffffff" strokeWidth={small ? 10 : 8} />
      {!small && <path d="M54 32 H66" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" />}
      <path d="M48 82 V52 L60 68 L72 52 V82" fill="none" stroke="#ffffff" strokeWidth={small ? 9 : 6} strokeLinejoin="round" />
    </svg>
  );
}
