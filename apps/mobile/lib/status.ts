import { color } from "./theme";

/**
 * Booking state machine, visualized — the exact vocabulary the website uses
 * (apps/web components/status-pill.tsx) so the two surfaces stay consistent.
 * `tone` maps to a {bg, fg} pair rendered by <StatusBadge> in components/ui.
 */
export type BookingStatus =
  | "requested"
  | "accepted"
  | "booked"
  | "in_progress"
  | "invoice_review"
  | "disputed"
  | "paid"
  | "completed"
  | "declined"
  | "withdrawn"
  | "expired"
  | "cancelled";

export type Tone = "honeydew" | "sky" | "amber" | "stone" | "danger" | "paper";

export const toneColors: Record<Tone, { bg: string; fg: string }> = {
  honeydew: { bg: color.honeydew, fg: color.viridian },
  sky: { bg: color.sky, fg: color.viridian },
  amber: { bg: color.amber, fg: color.amberInk },
  stone: { bg: color.stone, fg: color.inkSoft },
  danger: { bg: color.dangerSoft, fg: color.danger },
  paper: { bg: color.paper, fg: color.viridian },
};

const STATUS: Record<BookingStatus, { label: string; tone: Tone }> = {
  requested: { label: "Requested", tone: "honeydew" },
  accepted: { label: "Awaiting payment", tone: "sky" },
  booked: { label: "Booked", tone: "honeydew" },
  in_progress: { label: "In progress", tone: "sky" },
  invoice_review: { label: "Invoice review", tone: "amber" },
  disputed: { label: "Under review", tone: "danger" },
  paid: { label: "Confirmed", tone: "honeydew" },
  completed: { label: "Completed", tone: "paper" },
  declined: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "stone" },
  expired: { label: "Expired", tone: "stone" },
  cancelled: { label: "Cancelled", tone: "stone" },
};

export function statusMeta(status: BookingStatus): { label: string; tone: Tone } {
  return STATUS[status] ?? { label: status, tone: "stone" };
}
