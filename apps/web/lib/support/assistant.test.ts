import { describe, expect, it } from "vitest";

import { buildSupportInstructions, classifySupportPath, hashSafetyIdentifier, safeActionsForContext } from "./assistant";
import { supportAssistantRequestSchema } from "./assistant-contracts";

describe("AI support request validation", () => {
  it("accepts an alternating bounded transcript and clean pathname", () => {
    expect(supportAssistantRequestSchema.safeParse({ sourcePath: "/bookings/123/invoice", messages: [{ role: "user", content: "What next?" }] }).success).toBe(true);
  });

  it.each(["https://evil.example", "//evil.example", "/dashboard?booking=secret", "/dashboard#private"])("rejects unsafe source path %s", (sourcePath) => {
    expect(supportAssistantRequestSchema.safeParse({ sourcePath, messages: [{ role: "user", content: "Help" }] }).success).toBe(false);
  });

  it("rejects nonalternating and oversized transcripts", () => {
    expect(supportAssistantRequestSchema.safeParse({ sourcePath: "/", messages: [{ role: "user", content: "a" }, { role: "user", content: "b" }] }).success).toBe(false);
    expect(supportAssistantRequestSchema.safeParse({ sourcePath: "/", messages: [{ role: "user", content: "a".repeat(2001) }] }).success).toBe(false);
  });
});

describe("AI support routing and prompt safety", () => {
  it.each([
    ["/provider/onboarding/verify", "provider_onboarding"], ["/provider/jobs", "provider"], ["/dashboard", "customer_dashboard"], ["/bookings/abc/invoice", "booking"], ["/messages/abc", "messages"], ["/browse", "public"],
  ] as const)("classifies %s", (path, category) => expect(classifySupportPath(path)).toBe(category));

  it("maps only fixed internal navigation", () => {
    const actions = safeActionsForContext({ category: "booking", bookings: [] });
    expect(actions).toEqual([{ key: "dashboard", label: "View my bookings", href: "/dashboard" }, { key: "messages", label: "Open messages", href: "/messages" }]);
    expect(actions.every((action) => action.href.startsWith("/") && !action.href.startsWith("//"))).toBe(true);
  });

  it("hashes stable nonidentifying safety identifiers", () => {
    const hash = hashSafetyIdentifier("user@example.test");
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashSafetyIdentifier("user@example.test"));
    expect(hash).not.toContain("user");
  });

  it("labels context verified and prohibits user override", () => {
    const prompt = buildSupportInstructions({ category: "public" });
    expect(prompt).toContain("VERIFIED PAGE CONTEXT");
    expect(prompt).toContain("untrusted content");
    expect(prompt).toContain("plain text only");
  });
});
