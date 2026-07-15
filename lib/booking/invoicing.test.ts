import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOURLY_RATE_MAX_CENTS,
  HOURLY_RATE_MIN_CENTS,
  billableMinutesFromElapsed,
  calculateInvoiceAllocation,
} from "./policy";

/**
 * SQL parity: the invoice money identity is enforced by the
 * booking_invoices_money_valid CHECK and computed in submit_job_invoice. These
 * mirror that exact integer math so the TS preview can never drift from what the
 * database will accept.
 */
function sqlSubtotal(rate: number, minutes: number) {
  return Math.floor((rate * minutes + 30) / 60);
}
function sqlFee(subtotal: number) {
  return Math.floor((subtotal * 500 + 5000) / 10000);
}

describe("billableMinutesFromElapsed", () => {
  it("rounds elapsed wall time up to the next quarter hour", () => {
    expect(billableMinutesFromElapsed(61)).toBe(75);
    expect(billableMinutesFromElapsed(90)).toBe(90);
    expect(billableMinutesFromElapsed(90.1)).toBe(105);
  });

  it("applies the one-hour minimum", () => {
    expect(billableMinutesFromElapsed(0)).toBe(60);
    expect(billableMinutesFromElapsed(5)).toBe(60);
    expect(billableMinutesFromElapsed(59)).toBe(60);
  });

  it("caps at 24 hours", () => {
    expect(billableMinutesFromElapsed(2000)).toBe(1440);
  });
});

describe("invoice allocation SQL parity", () => {
  it("matches the SQL money identity across rate edges and durations", () => {
    for (const rate of [HOURLY_RATE_MIN_CENTS, 5000, 9999, HOURLY_RATE_MAX_CENTS]) {
      for (const minutes of [60, 75, 90, 120, 465, 1440]) {
        const a = calculateInvoiceAllocation(rate, minutes);
        const subtotal = sqlSubtotal(rate, minutes);
        expect(a.subtotalCents).toBe(subtotal);
        expect(a.totalPlatformFeeCents).toBe(sqlFee(subtotal));
        expect(a.firstHourCents).toBe(rate);
        expect(a.remainingBalanceCents).toBe(Math.max(0, subtotal - rate));
        // The split fee is the remainder, never a re-rounded percentage.
        expect(a.remainingPlatformFeeCents).toBe(
          Math.max(0, a.totalPlatformFeeCents - a.firstHourPlatformFeeCents),
        );
      }
    }
  });

  it("leaves a one-hour job with no remaining balance", () => {
    const a = calculateInvoiceAllocation(5000, 60);
    expect(a.subtotalCents).toBe(5000);
    expect(a.remainingBalanceCents).toBe(0);
    expect(a.remainingPlatformFeeCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// attemptDueInvoiceCharge — outcome mapping with the Stripe seam mocked
// ---------------------------------------------------------------------------
const rpc = vi.fn();
const createBalancePaymentIntent = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));
vi.mock("@/lib/stripe/connect", () => ({
  createBalancePaymentIntent: (...args: unknown[]) =>
    createBalancePaymentIntent(...args),
}));

type ClaimRow = {
  payment_id: string;
  booking_id: string;
  idempotency_key: string;
  amount_cents: number;
  application_fee_cents: number;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_connected_account_id: string;
};

const CLAIM: ClaimRow = {
  payment_id: "pay_1",
  booking_id: "bk_1",
  idempotency_key: "bal_bk_1_0",
  amount_cents: 2500,
  application_fee_cents: 125,
  stripe_customer_id: "cus_1",
  stripe_payment_method_id: "pm_1",
  stripe_connected_account_id: "acct_1",
};

/** claim_due_invoice is `.rpc(...).maybeSingle()`; every other rpc is awaited. */
function mockRpc(claim: ClaimRow | null) {
  rpc.mockImplementation((fn: string) => {
    if (fn === "claim_due_invoice") {
      return { maybeSingle: () => Promise.resolve({ data: claim, error: null }) };
    }
    return Promise.resolve({ data: null, error: null });
  });
}

describe("attemptDueInvoiceCharge", () => {
  beforeEach(() => {
    rpc.mockReset();
    createBalancePaymentIntent.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("returns not_claimable when nothing is due", async () => {
    const { attemptDueInvoiceCharge } = await import("./invoicing");
    mockRpc(null);
    expect(await attemptDueInvoiceCharge("inv_1")).toBe("not_claimable");
    expect(createBalancePaymentIntent).not.toHaveBeenCalled();
  });

  it("flags requires_action when there is no saved method", async () => {
    const { attemptDueInvoiceCharge } = await import("./invoicing");
    mockRpc({ ...CLAIM, stripe_payment_method_id: null });
    expect(await attemptDueInvoiceCharge("inv_1")).toBe("requires_action");
    expect(rpc).toHaveBeenCalledWith(
      "mark_balance_payment_unsuccessful_by_invoice",
      expect.objectContaining({
        p_invoice_id: "inv_1",
        p_target_status: "requires_action",
      }),
    );
  });

  it("releases the invoice claim when Stripe is unconfigured", async () => {
    const { attemptDueInvoiceCharge } = await import("./invoicing");
    mockRpc(CLAIM);
    createBalancePaymentIntent.mockResolvedValue({ configured: false });
    expect(await attemptDueInvoiceCharge("inv_1")).toBe("unconfigured");
    expect(rpc).toHaveBeenCalledWith("release_due_invoice_claim", {
      p_invoice_id: "inv_1",
    });
  });

  it("returns processing on a synchronous success", async () => {
    const { attemptDueInvoiceCharge } = await import("./invoicing");
    mockRpc(CLAIM);
    createBalancePaymentIntent.mockResolvedValue({
      configured: true,
      paymentIntentId: "pi_1",
      clientSecret: "cs",
      status: "succeeded",
    });
    expect(await attemptDueInvoiceCharge("inv_1")).toBe("processing");
    expect(rpc).toHaveBeenCalledWith("attach_balance_payment_intent", {
      p_invoice_id: "inv_1",
      p_stripe_payment_intent_id: "pi_1",
    });
    expect(createBalancePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ confirm: true, offSession: true }),
    );
  });

  it("records requires_action when the bank needs authentication", async () => {
    const { attemptDueInvoiceCharge } = await import("./invoicing");
    mockRpc(CLAIM);
    createBalancePaymentIntent.mockResolvedValue({
      configured: true,
      paymentIntentId: "pi_1",
      clientSecret: "cs",
      status: "requires_action",
    });
    expect(await attemptDueInvoiceCharge("inv_1")).toBe("requires_action");
  });

  it("records a hard decline as failed", async () => {
    const { attemptDueInvoiceCharge } = await import("./invoicing");
    mockRpc(CLAIM);
    createBalancePaymentIntent.mockResolvedValue({
      configured: true,
      paymentIntentId: "pi_1",
      clientSecret: null,
      status: "requires_payment_method",
    });
    expect(await attemptDueInvoiceCharge("inv_1")).toBe("failed");
    expect(rpc).toHaveBeenCalledWith(
      "mark_balance_payment_unsuccessful",
      expect.objectContaining({ p_target_status: "failed" }),
    );
  });

  it("returns unconfigured when Stripe keys are absent", async () => {
    const { attemptDueInvoiceCharge } = await import("./invoicing");
    mockRpc(CLAIM);
    createBalancePaymentIntent.mockResolvedValue({
      configured: false,
      reason: "no key",
    });
    expect(await attemptDueInvoiceCharge("inv_1")).toBe("unconfigured");
  });
});
