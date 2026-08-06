import OpenAI from "openai";

import { buildSupportInstructions, buildSupportPageContext, hashSafetyIdentifier, isAiSupportEnabled, safeActionsForContext, SupportPlainTextStreamSanitizer, SUPPORT_MODEL, SUPPORT_PROMPT_VERSION } from "@/lib/support/assistant";
import { SUPPORT_KNOWLEDGE_VERSION } from "@/lib/support/assistant-manual";
import { supportAssistantRequestSchema, type SupportStreamEvent } from "@/lib/support/assistant-contracts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

function jsonError(status: number, code: string, message: string, retryAfter?: number) {
  return Response.json({ error: { code, message } }, { status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined });
}

function sse(event: SupportStreamEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  if (!isAiSupportEnabled()) return jsonError(503, "disabled", "AI support is currently unavailable.");
  const apiKey = process.env.OPENAI_SUPPORT_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonError(503, "unconfigured", "AI support is currently unavailable.");

  let body: unknown;
  try { body = await request.json(); } catch { return jsonError(400, "invalid_json", "Send a valid JSON request."); }
  const parsed = supportAssistantRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "invalid_request", parsed.error.issues[0]?.message || "Invalid request.");

  const admin = createAdminClient();
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let user: { id: string } | null;
  let context: Awaited<ReturnType<typeof buildSupportPageContext>>;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    user = data.user;
    if (!user) return jsonError(401, "sign_in_required", "Please sign in to use AI support.");
    context = await buildSupportPageContext(supabase, admin, user.id, parsed.data.sourcePath);
  } catch {
    return jsonError(503, "context_unavailable", "AI support is currently unavailable.");
  }
  const { data: quotaRows, error: quotaError } = await admin.rpc("reserve_ai_support_request", {
    p_user_id: user.id,
    p_page_category: context.category,
    p_requested_model: SUPPORT_MODEL,
    p_prompt_version: SUPPORT_PROMPT_VERSION,
    p_knowledge_version: SUPPORT_KNOWLEDGE_VERSION,
  });
  const quota = quotaRows?.[0];
  if (quotaError) return jsonError(503, "quota_unavailable", "AI support is currently unavailable.");
  if (!quota?.request_id) return jsonError(429, "rate_limited", "You’ve reached the AI support limit. Ticket and email support are still available.", quota?.retry_after_seconds || 600);

  const requestId = quota.request_id;
  const startedAt = Date.now();
  const upstreamController = new AbortController();
  const timeout = setTimeout(() => upstreamController.abort("timeout"), 20_000);
  request.signal.addEventListener("abort", () => upstreamController.abort("client"), { once: true });
  const openai = new OpenAI({ apiKey });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: SupportStreamEvent) => controller.enqueue(encoder.encode(sse(event)));
      let completed = false;
      try {
        send({ type: "meta", actions: safeActionsForContext(context) });
        const response = await openai.responses.create({
          model: SUPPORT_MODEL,
          instructions: buildSupportInstructions(context),
          input: parsed.data.messages,
          stream: true,
          store: false,
          reasoning: { effort: "none", context: "current_turn" },
          text: { verbosity: "low" },
          max_output_tokens: 800,
          safety_identifier: hashSafetyIdentifier(user.id),
        }, { signal: upstreamController.signal });

        const textSanitizer = new SupportPlainTextStreamSanitizer();
        let returnedModel: string | null = null;
        let inputTokens: number | null = null;
        let outputTokens: number | null = null;
        for await (const event of response) {
          if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") {
            const text = textSanitizer.push(event.delta);
            if (text) send({ type: "delta", text });
          }
          if (event.type === "response.completed") {
            returnedModel = event.response.model;
            inputTokens = event.response.usage?.input_tokens ?? null;
            outputTokens = event.response.usage?.output_tokens ?? null;
            completed = true;
          }
          if (event.type === "error" || event.type === "response.failed" || event.type === "response.incomplete") throw new Error("upstream_failed");
        }
        const trailingText = textSanitizer.flush();
        if (trailingText) send({ type: "delta", text: trailingText });
        if (!completed) throw new Error("upstream_incomplete");
        send({ type: "done" });
        await admin.from("ai_support_requests").update({ status: "completed", returned_model: returnedModel, input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: Date.now() - startedAt, completed_at: new Date().toISOString() }).eq("id", requestId);
      } catch {
        const timedOut = upstreamController.signal.aborted && upstreamController.signal.reason === "timeout";
        const clientAborted = request.signal.aborted;
        await admin.from("ai_support_requests").update({ status: timedOut ? "timed_out" : clientAborted ? "aborted" : "failed", latency_ms: Date.now() - startedAt, completed_at: new Date().toISOString() }).eq("id", requestId);
        if (!clientAborted) send({ type: "error", code: timedOut ? "timeout" : "interrupted" });
      } finally {
        clearTimeout(timeout);
        if (!completed && request.signal.aborted) upstreamController.abort("client");
        try { controller.close(); } catch { /* client disconnected */ }
      }
    },
    cancel() { upstreamController.abort("client"); },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Content-Type-Options": "nosniff" } });
}
