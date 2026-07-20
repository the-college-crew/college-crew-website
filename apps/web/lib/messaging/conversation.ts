import type { createClient } from "@/lib/supabase/server";

/**
 * Shared conversation helpers used from both dashboards and the booking flow.
 * One thread per *booking* (schema: unique booking_id), so two jobs with the
 * same person are two separate chats.
 *
 * A customer can also open a booking-less "inquiry" thread from a provider's
 * public profile — at most one per pair. Their next booking request with that
 * provider claims it (`claim_conversation_for_booking`), so the pre-booking chat
 * and the job it led to end up in one thread; every booking after that opens its
 * own. Kept in one place so accept, decline, "Message", and the initial booking
 * request can't drift apart.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

type BookingThread = {
  bookingId: string;
  customerId: string;
  providerId: string;
};

async function findByBooking(
  supabase: ServerClient,
  bookingId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Find (or open) the one conversation for a booking and return its id. Runs
 * under the caller's session, so RLS still enforces membership.
 */
export async function getConversationIdForBooking(
  supabase: ServerClient,
  { bookingId, customerId, providerId }: BookingThread,
): Promise<string> {
  const existing = await findByBooking(supabase, bookingId);
  if (existing) return existing;

  // Adopt the pre-booking inquiry thread with this provider, if there is one.
  // A single conditional UPDATE in the database, so concurrent requests can't
  // both claim it — the loser gets null back and opens its own thread below.
  const { data: claimed } = await supabase.rpc("claim_conversation_for_booking", {
    target_booking_id: bookingId,
  });
  if (claimed) return claimed;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      customer_id: customerId,
      provider_id: providerId,
      booking_id: bookingId,
    })
    .select("id")
    .single();
  if (created) return created.id;

  // unique(booking_id) race — the thread appeared meanwhile.
  if (error?.code === "23505") {
    const raced = await findByBooking(supabase, bookingId);
    if (raced) return raced;
  }
  throw new Error("Could not open the conversation.");
}

/**
 * Find (or open) the booking-less inquiry thread for a customer+provider pair —
 * the chat that opens from a public profile before any booking exists.
 */
export async function getInquiryConversationId(
  supabase: ServerClient,
  { customerId, providerId }: { customerId: string; providerId: string },
): Promise<string> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", customerId)
    .eq("provider_id", providerId)
    .is("booking_id", null)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      customer_id: customerId,
      provider_id: providerId,
      booking_id: null,
    })
    .select("id")
    .single();
  if (created) return created.id;

  // unique(customer, provider) where booking_id is null — raced, or claimed by a
  // booking request between the select and the insert. Either way, re-read.
  if (error?.code === "23505") {
    const { data: raced } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", customerId)
      .eq("provider_id", providerId)
      .is("booking_id", null)
      .maybeSingle();
    if (raced) return raced.id;
  }
  throw new Error("Could not open the conversation.");
}

/**
 * Send a message into a conversation through the moderate-message Edge Function
 * — the only write path into `messages`, so contact-info scanning always
 * applies. Carries the caller's session so the function attributes the message
 * to whoever is signed in. Returns whether the send succeeded (callers decide
 * whether a failure is fatal).
 */
export async function sendModeratedMessage(
  supabase: ServerClient,
  conversationId: string,
  body: string,
): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { error } = await supabase.functions.invoke("moderate-message", {
    body: {
      conversation_id: conversationId,
      body,
      image_path: null,
      attachments: [],
    },
    headers: session
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  });
  return !error;
}
