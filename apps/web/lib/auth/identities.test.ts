import { describe, expect, it } from "vitest";

import { getGoogleIdentityState } from "./identities";

describe("getGoogleIdentityState", () => {
  it("reports an account without a Google identity as disconnected", () => {
    expect(
      getGoogleIdentityState([
        { provider: "email", identity_data: { email: "alex@example.com" } },
      ]),
    ).toEqual({ connected: false, email: null });
  });

  it("returns the linked Google email", () => {
    expect(
      getGoogleIdentityState([
        {
          provider: "google",
          identity_data: { email: " alex@gmail.com " },
        },
      ]),
    ).toEqual({ connected: true, email: "alex@gmail.com" });
  });

  it("still reports a Google identity when the provider omits an email", () => {
    expect(
      getGoogleIdentityState([{ provider: "google", identity_data: {} }]),
    ).toEqual({ connected: true, email: null });
  });
});
