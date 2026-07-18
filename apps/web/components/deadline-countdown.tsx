"use client";

import { useEffect, useState } from "react";

function remainingLabel(target: string) {
  const remainingMs = new Date(target).getTime() - Date.now();
  if (remainingMs <= 0) return "Reached";
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h remaining`;
  }
  return hours > 0 ? `${hours}h ${minutes}m remaining` : `${minutes}m remaining`;
}

export function DeadlineCountdown({
  target,
  label,
}: {
  target: string;
  label: string;
}) {
  const [remaining, setRemaining] = useState(() => remainingLabel(target));

  useEffect(() => {
    const update = () => setRemaining(remainingLabel(target));
    update();
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, [target]);

  return (
    <span className="text-xs text-mist">
      {label}: {remaining}
    </span>
  );
}
