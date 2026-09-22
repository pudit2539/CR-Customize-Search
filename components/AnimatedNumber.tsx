"use client";

import { useEffect, useRef, useState } from "react";

// Eases the visible number from its previous value to the new one instead
// of snapping straight to it — used for KPI tiles (dashboard/insights) so a
// filter change reads as "the data moved" rather than a silent swap.
export default function AnimatedNumber({
  value,
  duration = 600,
  format,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  return <>{format ? format(display) : display.toLocaleString()}</>;
}
