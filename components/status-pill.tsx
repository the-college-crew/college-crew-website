import type { BookingStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * Booking state machine, visualized. One pill per status, used identically
 * on customer and provider dashboards so the vocabulary stays consistent.
 */
const config: Record<BookingStatus, { label: string; classes: string }> = {
  requested: {
    label: "Requested",
    classes: "border-gold-400/60 bg-gold-100 text-gold-800",
  },
  accepted: {
    label: "Accepted — awaiting payment",
    classes: "border-crew-200 bg-crew-100 text-crew-800",
  },
  paid: {
    label: "Confirmed",
    classes: "border-quad-200 bg-quad-100 text-quad-800",
  },
  completed: {
    label: "Completed",
    classes: "border-quad-200 bg-paper text-quad-700",
  },
  declined: {
    label: "Declined",
    classes: "border-line bg-court text-ink-soft",
  },
  cancelled: {
    label: "Cancelled",
    classes: "border-line bg-court text-ink-soft",
  },
};

export function StatusPill({ status }: { status: BookingStatus }) {
  const { label, classes } = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        classes,
      )}
    >
      {label}
    </span>
  );
}
