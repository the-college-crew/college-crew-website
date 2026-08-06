import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  buildContext: vi.fn(),
  responsesCreate: vi.fn(),
  reserveRequest: vi.fn(),
  updateRequest: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mocks.reserveRequest,
    from: vi.fn(() => ({ update: mocks.updateRequest })),
  })),
}));
vi.mock("@/lib/support/assistant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/support/assistant")>();
  return { ...actual, buildSupportPageContext: mocks.buildContext };
});
vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create: mocks.responsesCreate };
  },
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/support/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function* streamEvents(events: unknown[]) {
  for (const event of events) yield event;
}

function successfulReservation() {
  mocks.reserveRequest.mockResolvedValue({
    data: [{ request_id: "00000000-0000-4000-8000-000000000001", retry_after_seconds: 0 }],
    error: null,
  });
  mocks.updateRequest.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
}

describe("AI support route", () => {
  beforeEach(() => {
    process.env.AI_SUPPORT_ENABLED = "true";
    process.env.OPENAI_SUPPORT_API_KEY = "test-key";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "00000000-0000-4000-8000-000000000002" } }, error: null });
    mocks.buildContext.mockResolvedValue({ category: "public" });
    successfulReservation();
  });

  afterEach(() => {
    delete process.env.AI_SUPPORT_ENABLED;
    delete process.env.OPENAI_SUPPORT_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.clearAllMocks();
  });

  it("returns 503 when the server flag is disabled", async () => {
    process.env.AI_SUPPORT_ENABLED = "false";
    expect((await POST(request({}))).status).toBe(503);
  });

  it("returns 503 when no dedicated or fallback key exists", async () => {
    delete process.env.OPENAI_SUPPORT_API_KEY;
    expect((await POST(request({}))).status).toBe(503);
  });

  it("returns 400 for malformed JSON and unsafe paths", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request({ sourcePath: "/dashboard?forged=1", messages: [{ role: "user", content: "Help" }] }))).status).toBe(400);
  });

  it("returns 401 before reading account context", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(request({ sourcePath: "/dashboard", messages: [{ role: "user", content: "Help" }] }));
    expect(response.status).toBe(401);
    expect(mocks.buildContext).not.toHaveBeenCalled();
  });

  it("returns a JSON 503 when authenticated context cannot be built", async () => {
    mocks.buildContext.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request({ sourcePath: "/dashboard", messages: [{ role: "user", content: "Help" }] }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "context_unavailable" } });
  });

  it("streams sanitized text and marks a completed OpenAI response", async () => {
    mocks.responsesCreate.mockResolvedValue(streamEvents([
      { type: "response.output_text.delta", delta: "Open https://evil" },
      { type: "response.output_text.delta", delta: ".example instead. " },
      { type: "response.completed", response: { model: "gpt-5.6-luna", usage: { input_tokens: 10, output_tokens: 5 } } },
    ]));

    const response = await POST(request({ sourcePath: "/dashboard", messages: [{ role: "user", content: "Help" }] }));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("[link removed]");
    expect(body).not.toContain("evil.example");
    expect(body).toContain('"type":"done"');
  });

  it("marks an incomplete stream as failed without a done event", async () => {
    mocks.responsesCreate.mockResolvedValue(streamEvents([
      { type: "response.output_text.delta", delta: "Partial response" },
      { type: "response.incomplete" },
    ]));

    const response = await POST(request({ sourcePath: "/dashboard", messages: [{ role: "user", content: "Help" }] }));
    const body = await response.text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"type":"done"');
  });

  it("returns 429 when the atomic quota reservation is exhausted", async () => {
    mocks.reserveRequest.mockResolvedValue({ data: [{ request_id: null, retry_after_seconds: 42 }], error: null });
    const response = await POST(request({ sourcePath: "/dashboard", messages: [{ role: "user", content: "Help" }] }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
  });
});
