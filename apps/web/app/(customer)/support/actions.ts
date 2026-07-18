"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { hasServiceRoleEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type SupportFormState,
  supportTicketSchema,
} from "@/lib/validation/support";

export async function submitSupportTicket(
  _previousState: SupportFormState,
  formData: FormData,
): Promise<SupportFormState> {
  // Honeypot: return the same success response a real submission receives so
  // automated senders do not learn how the trap works.
  const website = formData.get("website");
  if (typeof website === "string" && website.trim() !== "") {
    return {
      success: true,
      message: "Thanks! Your message was sent to the College Crew team.",
    };
  }

  if (!hasServiceRoleEnv()) {
    return {
      success: false,
      message: "Feedback is temporarily unavailable. Please try again shortly.",
    };
  }

  const session = await getSession();
  const submittedEmail = formData.get("contactEmail");
  const contactEmail =
    typeof submittedEmail === "string" && submittedEmail.trim()
      ? submittedEmail
      : session?.user.email;

  const parsed = supportTicketSchema.safeParse({
    category: formData.get("category"),
    sentiment: formData.get("sentiment"),
    message: formData.get("message"),
    wantsReply: formData.get("wantsReply") === "on",
    contactEmail,
    sourcePath: formData.get("sourcePath"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Check the highlighted fields and try again.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const {
    category,
    sentiment,
    message,
    wantsReply,
    contactEmail: validatedEmail,
    sourcePath,
  } = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.from("support_tickets").insert({
    submitter_id: session?.user.id ?? null,
    category,
    sentiment: sentiment ?? null,
    message,
    wants_reply: wantsReply,
    contact_email: wantsReply ? validatedEmail?.toLowerCase() : null,
    source_path: sourcePath ?? null,
  });

  if (error) {
    return {
      success: false,
      message: "We couldn’t send that message. Please try again.",
    };
  }

  revalidatePath("/admin/support");

  return {
    success: true,
    message: "Thanks! Your message was sent to the College Crew team.",
  };
}

