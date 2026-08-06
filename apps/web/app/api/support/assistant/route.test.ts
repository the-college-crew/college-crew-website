import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/support/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("AI support route pre-stream errors", () => {
  beforeEach(() => {
    process.env.AI_SUPPORT_ENABLED = "true";
    process.env.OPENAI_SUPPORT_API_KEY = "test-key";
    mocks.getUser.mockResolvedValue({ data: { user: null } });
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
    const response = await POST(request({ sourcePath: "/dashboard", messages: [{ role: "user", content: "Help" }] }));
    expect(response.status).toBe(401);
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });
});
