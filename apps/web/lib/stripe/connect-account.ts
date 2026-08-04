import type Stripe from "stripe";

/** Public-free construction of the minimal Accounts v2 recipient request. */
export function buildProviderConnectAccountParams(input: {
  providerId: string;
  contactEmail: string;
}): Stripe.V2.Core.AccountCreateParams {
  return {
    contact_email: input.contactEmail,
    metadata: { college_crew_provider_id: input.providerId },
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
  };
}

export function providerConnectIdempotencyKey(providerId: string) {
  return `college-crew-provider-${providerId}-recipient-v1`;
}
