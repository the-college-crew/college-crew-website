"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { hasServiceRoleEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { supportTicketStatusSchema } from "@/lib/validation/support";

const updateSchema = z.object({
  ticketId: z.uuid(),
  status: supportTicketStatusSchema,
});

export async function updateSupportTicketStatus(formData: FormData) {
  const session = await requireRole("admin");
  if (!hasServiceRoleEnv()) {
    redirect("/admin/support?err=env");
  }

  const parsed = updateSchema.parse({
    ticketId: formData.get("ticketId"),
    status: formData.get("status"),
  });
  const now = new Date().toISOString();
  const resolved = parsed.status === "resolved";

  const admin = createAdminClient();
  const { error } = await admin
    .from("support_tickets")
    .update({
      status: parsed.status,
      updated_at: now,
      resolved_at: resolved ? now : null,
      resolved_by: resolved ? session.user.id : null,
    })
    .eq("id", parsed.ticketId);

  if (error) {
    throw new Error(`Could not update support ticket: ${error.message}`);
  }

  revalidatePath("/admin/support");
}

