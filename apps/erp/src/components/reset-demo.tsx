"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";

export function ResetDemo() {
  const resetDemo = useStore((s) => s.resetDemo);
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        resetDemo();
        setDone(true);
      }}
      className="mx-auto mt-8 flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink"
    >
      <RotateCcw size={12} /> {done ? "البيانات التجريبية رجعت لأولها" : "إرجاع البيانات التجريبية لأولها"}
    </button>
  );
}
