import { describe, expect, it } from "vitest";

import {
  buildProviderConnectAccountParams,
  providerConnectIdempotencyKey,
} from "./connect-account";

describe("provider Connect account creation", () => {
  it("builds the minimal Accounts v2 marketplace recipient", () => {
    expect(
      buildProviderConnectAccountParams({
        providerId: "31311b70-3653-4d0f-b53d-bd87cbe9d87e",
        contactEmail: "student@example.edu",
      }),
    ).toEqual({
      contact_email: "student@example.edu",
      metadata: {
        college_crew_provider_id: "31311b70-3653-4d0f-b53d-bd87cbe9d87e",
      },
      identity: { country: "US" },
      dashboard: "express",
      defaults: {
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: { stripe_transfers: { requested: true } },
          },
        },
      },
    });
  });

  it("uses one stable, provider-scoped idempotency key", () => {
    expect(
      providerConnectIdempotencyKey(
        "31311b70-3653-4d0f-b53d-bd87cbe9d87e",
      ),
    ).toBe(
      "college-crew-provider-31311b70-3653-4d0f-b53d-bd87cbe9d87e-recipient-v1",
    );
  });
});
