"use client";

import { useEffect, useMemo, useState } from "react";

export function Countdown({ minutes = 15, compact = false }: { minutes?: number; compact?: boolean }) {
  const expiresAt = useMemo(() => Date.now() + minutes * 60 * 1000, [minutes]);
  const [remaining, setRemaining] = useState(minutes * 60);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemaining(Math.max(Math.floor((expiresAt - Date.now()) / 1000), 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [expiresAt]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  if (compact) {
    return (
      <div className="timer-pill">
        <span aria-hidden="true">◷</span>
        <div>
          <p>PHIÊN CÒN</p>
          <strong>{mm}:{ss}</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="timer-card">
      <p>Phiên làm việc còn:</p>
      <strong>{mm}:{ss}</strong>
    </div>
  );
}
