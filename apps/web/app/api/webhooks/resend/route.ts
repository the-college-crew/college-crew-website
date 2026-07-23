import { Resend } from "resend";

import { normalizeResendDeliveryEvent } from "@/lib/email/resend-webhooks";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!webhookSecret || !apiKey) {
    console.error("[resend-webhook] Resend environment is not configured");
    return new Response("Webhook is not configured", { status: 503 });
  }
  const resend = new Resend(apiKey);

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return new Response("Missing webhook signature", { status: 400 });
  }

  const payload = await request.text();
  let verified;
  try {
    verified = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret,
    });
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  const event = normalizeResendDeliveryEvent(verified);
  if (!event) {
    return Response.json({ received: true, ignored: true });
  }

  const admin = createAdminClient();
  const result = await admin.rpc("record_resend_webhook_event", {
    p_svix_id: id,
    p_provider_message_id: event.providerMessageId,
    p_recipient_email: event.recipientEmail,
    p_event_type: event.eventType,
    p_event_created_at: event.eventCreatedAt,
    p_detail: event.detail,
  });
  if (result.error) {
    console.error("[resend-webhook] database reconciliation failed", {
      code: result.error.code,
    });
    return new Response("Webhook processing failed", { status: 500 });
  }

  return Response.json({ received: true });
}
