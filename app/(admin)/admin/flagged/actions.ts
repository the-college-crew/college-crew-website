"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolve every flag on a conversation in one action (admin only).
 *
 * Flags live in moderation_events keyed by message_id, so "resolve the whole
 * chat" means: find this conversation's messages, then mark all their still-open
 * events resolved. A NEW flag inserted later lands unresolved (resolved_at null)
 * and re-surfaces on the dashboard — resolving is a snapshot, not a mute.
 *
 * Writes use the service-role client (moderation_events has no client-write RLS
 * policy); the requireRole("admin") gate above is the authorization check.
 */
export async function resolveConversationFlags(formData: FormData) {
  const session = await requireRole("admin");
  const conversationId = z.string().uuid().parse(formData.get("conversationId"));

  const admin = createAdminClient();

  // moderation_events references messages, not conversations directly — gather
  // this chat's message ids first, then resolve their open events.
  const { data: messages } = await admin
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId);
  const messageIds = (messages ?? []).map((m) => m.id);
  if (messageIds.length === 0) return;

  await admin
    .from("moderation_events")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: session.user.id,
    })
    .in("message_id", messageIds)
    .is("resolved_at", null);

  revalidatePath("/admin/flagged");
}

/**
 * Resolve one flagged profile field (admin only).
 *
 * Profile moderation is flag-only, so the flagged bio or display name is LIVE on
 * the public profile. Resolving means "I looked at it" — it does NOT change the
 * text. To actually remove bad content, edit the field on /admin/providers, which
 * writes through updateProviderText; then resolve the flag here.
 *
 * Resolving is a snapshot, not a mute: if the provider edits the field again and
 * it trips the scan again, a new unresolved event appears.
 */
export async function resolveProfileFlag(formData: FormData) {
  const session = await requireRole("admin");
  const eventId = z.string().uuid().parse(formData.get("eventId"));

  const admin = createAdminClient();
  await admin
    .from("profile_moderation_events")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: session.user.id,
    })
    .eq("id", eventId)
    .is("resolved_at", null);

  revalidatePath("/admin/flagged");
}
