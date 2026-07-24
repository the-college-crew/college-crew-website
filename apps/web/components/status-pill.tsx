import type { BookingStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * Booking state machine, visualized. One pill per status, used identically
 * on customer and provider dashboards so the vocabulary stays consistent.
 */
const config: Record<BookingStatus, { label: string; classes: string }> = {
  requested: {
    label: "Requested",
    classes: "border-honeydew bg-honeydew text-viridian",
  },
  countered: {
    label: "New time suggested",
    classes: "border-amber-200 bg-amber-50 text-amber-900",
  },
  accepted: {
    label: "Accepted, awaiting payment",
    classes: "border-sky bg-sky text-viridian",
  },
  booked: {
    label: "Booked",
    classes: "border-honeydew bg-honeydew text-viridian",
  },
  in_progress: {
    label: "In progress",
    classes: "border-sky bg-sky text-viridian",
  },
  invoice_review: {
    label: "Invoice review",
    classes: "border-amber-200 bg-amber-50 text-amber-900",
  },
  disputed: {
    label: "Under review",
    classes: "border-red-200 bg-red-50 text-red-800",
  },
  paid: {
    label: "Confirmed",
    classes: "border-honeydew bg-honeydew text-viridian",
  },
  completed: {
    label: "Completed",
    classes: "border-honeydew bg-paper text-viridian",
  },
  declined: {
    label: "Declined",
    classes: "border-red-200 bg-red-50 text-red-800",
  },
  withdrawn: {
    label: "Withdrawn",
    classes: "border-stone bg-stone text-ink-soft",
  },
  expired: {
    label: "Expired",
    classes: "border-stone bg-stone text-ink-soft",
  },
  cancelled: {
    label: "Cancelled",
    classes: "border-stone bg-stone text-ink-soft",
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
