"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();

export async function retryAutomationJob(formData: FormData) {
  await requireRole("admin");
  const jobId = idSchema.parse(formData.get("jobId"));
  const supabase = await createClient();
  const result = await supabase.rpc("admin_retry_booking_automation_job", {
    p_job_id: jobId,
  });
  if (result.error || !result.data) throw new Error("Could not retry automation job.");
  revalidatePath("/admin/operations");
}

export async function retryOutboxEmail(formData: FormData) {
  await requireRole("admin");
  const outboxId = idSchema.parse(formData.get("outboxId"));
  const supabase = await createClient();
  const result = await supabase.rpc("admin_retry_email_outbox", {
    p_outbox_id: outboxId,
  });
  if (result.error || !result.data) throw new Error("Could not retry email delivery.");
  revalidatePath("/admin/operations");
}
