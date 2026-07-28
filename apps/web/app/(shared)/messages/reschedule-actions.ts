"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { captureFirstHourHold } from "@/lib/booking/first-hour-hold";
import { pilotLocalDateTimeToUtc } from "@/lib/booking/policy";
import { requestOperationMessage } from "@/lib/booking/requests";
import {
  hasAcceptedCurrentLegalDocument,
  legalDocumentPath,
} from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";

export type RescheduleActionState = { error?: string };

type UntypedRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: string | null; error: { message: string } | null }>;

const proposalSchema = z.object({
  bookingId: z.string().uuid(),
  conversationId: z.string().uuid(),
  scheduledLocal: z.string().min(1, "Choose a date and time."),
});

export async function proposeChatReschedule(
  _previous: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  await requireUser();
  const parsed = proposalSchema.safeParse({
    bookingId: formData.get("bookingId"),
    conversationId: formData.get("conversationId"),
    scheduledLocal: formData.get("scheduledLocal"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const proposed = pilotLocalDateTimeToUtc(parsed.data.scheduledLocal);
  if (!proposed.ok) return { error: "Choose a valid date and time." };

  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { error } = await rpc("propose_hourly_chat_reschedule", {
    p_booking_id: parsed.data.bookingId,
    p_proposed_start_at: proposed.date.toISOString(),
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not suggest that time."),
    };
  }
  revalidatePath(`/messages/${parsed.data.conversationId}`);
  redirect(`/messages/${parsed.data.conversationId}`);
}

const responseSchema = z.object({
  proposalId: z.string().uuid(),
  bookingId: z.string().uuid(),
  conversationId: z.string().uuid(),
  accept: z.enum(["true", "false"]),
});

export async function respondToChatReschedule(
  _previous: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  const user = await requireUser();
  const parsed = responseSchema.safeParse({
    proposalId: formData.get("proposalId"),
    bookingId: formData.get("bookingId"),
    conversationId: formData.get("conversationId"),
    accept: formData.get("accept"),
  });
  if (!parsed.success) return { error: "Could not respond to that suggestion." };

  const accepting = parsed.data.accept === "true";
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (
    accepting &&
    profile?.role === "customer" &&
    !(await hasAcceptedCurrentLegalDocument(supabase, {
      userId: user.id,
      kind: "customer_booking_terms",
    }))
  ) {
    redirect(
      legalDocumentPath(
        "customer_booking_terms",
        `/messages/${parsed.data.conversationId}`,
      ),
    );
  }
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { error } = await rpc("respond_to_hourly_chat_reschedule", {
    p_proposal_id: parsed.data.proposalId,
    p_accept: accepting,
  });
  if (error) {
    return {
      error: requestOperationMessage(error, "Could not update that suggestion."),
    };
  }

  if (accepting) {
    // Same booking and provider, so this captures the existing first-hour hold.
    // A webhook/retry reconciles an unusual capture failure.
    try {
      await captureFirstHourHold(parsed.data.bookingId);
    } catch (captureError) {
      console.error("[chat-reschedule] first-hour capture failed", captureError);
    }
  }
  revalidatePath(`/messages/${parsed.data.conversationId}`);
  revalidatePath("/provider/dashboard");
  revalidatePath("/dashboard");
  redirect(`/messages/${parsed.data.conversationId}`);
}
