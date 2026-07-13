import { cache } from "react";

import {
  getEffectiveRole,
  getSession,
  type Session,
} from "@/lib/auth/session";
import type {
  BookingStatus,
  Message,
  ProviderProfile,
  Service,
  UserRole,
} from "@/lib/db/types";

export type DemoRole = Extract<UserRole, "customer" | "provider">;

export type DemoPreview = {
  role: DemoRole;
  session: Session;
};

export const getDemoPreview = cache(
  async (role: DemoRole): Promise<DemoPreview | null> => {
    const session = await getSession();
    if (!session || session.profile.role !== "admin") return null;

    const effectiveRole = await getEffectiveRole();
    return effectiveRole === role ? { role, session } : null;
  },
);

const today = new Date();
const isoInDays = (days: number, hour: number) => {
  const date = new Date(today);
  date.setDate(today.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const isoAgoDays = (days: number, hour: number) => {
  const date = new Date(today);
  date.setDate(today.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

export const demoServices: Service[] = [
  {
    id: "demo-service-lawn",
    name: "Lawn care",
    slug: "lawn-care",
    category: "Yard",
    is_live: true,
  },
  {
    id: "demo-service-window",
    name: "Window washing",
    slug: "window-washing",
    category: "Home",
    is_live: true,
  },
  {
    id: "demo-service-moving",
    name: "Moving help",
    slug: "moving-help",
    category: "Errands",
    is_live: true,
  },
];

export const demoProviderProfile: ProviderProfile = {
  id: "demo-provider",
  user_id: "demo-provider-user",
  display_name: "Avery's Student Services",
  bio: "Junior at the local university helping neighbors with yard work, window washing, and weekend odd jobs.",
  provider_type: "business",
  neighborhood: "Pilot neighborhood",
  verification_status: "approved",
  id_document_url: null,
  id_document_back_url: null,
  background_check_status: "passed",
  stripe_account_id: null,
  availability: {
    days: ["mon", "wed", "fri", "sat"],
    note: "Weekday afternoons after class, Saturdays 9am-4pm.",
  },
  created_at: isoAgoDays(45, 12),
};

export const demoOfferings = [
  {
    id: "demo-offering-lawn",
    service_id: demoServices[0].id,
    price_cents: 5500,
    price_type: "fixed" as const,
    unit: "per_job" as const,
    preview_image_path: null,
    service: demoServices[0],
  },
  {
    id: "demo-offering-window",
    service_id: demoServices[1].id,
    price_cents: 8500,
    price_type: "fixed" as const,
    unit: "per_job" as const,
    preview_image_path: null,
    service: demoServices[1],
  },
  {
    id: "demo-offering-moving",
    service_id: demoServices[2].id,
    price_cents: 0,
    price_type: "quote" as const,
    unit: "per_job" as const,
    preview_image_path: null,
    service: demoServices[2],
  },
];

export type DemoBooking = {
  id: string;
  status: BookingStatus;
  scheduled_at: string;
  address: string;
  details: string;
  price_cents: number;
  platform_fee_cents: number;
  service: { name: string };
  customer: { full_name: string };
  provider: { display_name: string };
  review?: { id: string } | null;
};

export const demoBookings: DemoBooking[] = [
  {
    id: "demo-booking-requested",
    status: "requested",
    scheduled_at: isoInDays(1, 15),
    address: "1420 Maple Lane",
    details: "Front and back yard. Please bring bags for clippings.",
    price_cents: 5500,
    platform_fee_cents: 825,
    service: { name: "Lawn care" },
    customer: { full_name: "Jordan Lee" },
    provider: { display_name: demoProviderProfile.display_name },
    review: null,
  },
  {
    id: "demo-booking-accepted",
    status: "accepted",
    scheduled_at: isoInDays(3, 10),
    address: "88 College Ave",
    details: "Six first-floor windows and four second-floor windows.",
    price_cents: 8500,
    platform_fee_cents: 1275,
    service: { name: "Window washing" },
    customer: { full_name: "Maya Patel" },
    provider: { display_name: demoProviderProfile.display_name },
    review: null,
  },
  {
    id: "demo-booking-paid",
    status: "paid",
    scheduled_at: isoInDays(6, 13),
    address: "509 Oak Street",
    details: "Help move boxes from garage to basement.",
    price_cents: 12000,
    platform_fee_cents: 1800,
    service: { name: "Moving help" },
    customer: { full_name: "Chris Morgan" },
    provider: { display_name: demoProviderProfile.display_name },
    review: null,
  },
  {
    id: "demo-booking-declined",
    status: "declined",
    scheduled_at: isoInDays(2, 9),
    address: "17 Birch Road",
    details: "Trash & recycling take-out.",
    price_cents: 3000,
    platform_fee_cents: 450,
    service: { name: "Trash & bin service" },
    customer: { full_name: "Sam Rivera" },
    provider: { display_name: demoProviderProfile.display_name },
    review: null,
  },
  {
    id: "demo-booking-completed",
    status: "completed",
    scheduled_at: isoAgoDays(9, 11),
    address: "24 Elm Court",
    details: "Yard cleanup.",
    price_cents: 6500,
    platform_fee_cents: 975,
    service: { name: "Lawn care" },
    customer: { full_name: "Taylor Brooks" },
    provider: { display_name: demoProviderProfile.display_name },
    review: null,
  },
];

export const demoConversation = {
  id: "demo",
  customerName: "Maya Patel",
  providerName: demoProviderProfile.display_name,
  created_at: isoAgoDays(1, 16),
};

export function demoMessagesFor(viewer: DemoRole): Message[] {
  const customerId = viewer === "customer" ? "demo-current-user" : "demo-other";
  const providerId = viewer === "provider" ? "demo-current-user" : "demo-other";

  return [
    {
      id: "demo-message-1",
      conversation_id: demoConversation.id,
      sender_id: customerId,
      body: "Hi Avery, could you do the window washing Friday morning?",
      image_path: null,
      moderation_status: "clean",
      created_at: isoAgoDays(1, 9),
    },
    {
      id: "demo-message-2",
      conversation_id: demoConversation.id,
      sender_id: providerId,
      body: "Friday at 10 works. I can bring the ladder and cleaning supplies.",
      image_path: null,
      moderation_status: "clean",
      created_at: isoAgoDays(1, 10),
    },
    {
      id: "demo-message-3",
      conversation_id: demoConversation.id,
      sender_id: customerId,
      body: "Great. The driveway gate will be open, and the job address on the booking is correct.",
      image_path: null,
      moderation_status: "clean",
      created_at: isoAgoDays(1, 11),
    },
  ];
}
