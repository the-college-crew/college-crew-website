import type { createClient } from "@/lib/supabase/server";

/**
 * Shared conversation helpers used from both dashboards and the booking flow.
 * One thread per customer+provider pair (schema unique constraint); the booking
 * that opened it is recorded on the thread. Kept in one place so accept,
 * decline, "Message", and the initial booking request can't drift apart.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

type Parties = {
  customerId: string;
  providerId: string;
  bookingId?: string | null;
};

/**
 * Find (or open) the one conversation for a customer+provider pair and return
 * its id. Runs under the caller's session, so RLS still enforces membership.
 */
export async function getOrCreateConversationId(
  supabase: ServerClient,
  { customerId, providerId, bookingId = null }: Parties,
): Promise<string> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", customerId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (existing) return existing.id;

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

  // Unique(customer, provider) race — the thread appeared meanwhile.
  if (error?.code === "23505") {
    const { data: raced } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", customerId)
      .eq("provider_id", providerId)
      .single();
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
    body: { conversation_id: conversationId, body, image_path: null },
    headers: session
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  });
  return !error;
}
