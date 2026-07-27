import type { Metadata } from "next";

import { requireRole } from "@/lib/auth/session";
import { getBookingCopyOverrides } from "@/lib/content/booking-copy.server";

import { BookingCopyManager } from "./booking-copy-manager";

export const metadata: Metadata = { title: "Booking copy" };

export default async function BookingCopyPage() {
  await requireRole("admin", "/admin/booking-copy");
  const overrides = await getBookingCopyOverrides();

  return <BookingCopyManager initialOverrides={overrides} />;
}
