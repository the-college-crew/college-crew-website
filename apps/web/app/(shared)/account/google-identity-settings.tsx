"use client";

import Image from "next/image";
import { useState } from "react";

import { GOOGLE_G } from "@/components/auth/google-auth-option";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

export function GoogleIdentitySettings({
  connected,
  email,
  initialError = false,
}: {
  connected: boolean;
  email: string | null;
  initialError?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(
    initialError ? "Google couldn't be connected. Please try again." : null,
  );

  async function connectGoogle() {
    setPending(true);
    setError(null);

    try {
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", "/account?tab=account");
      callback.searchParams.set("returnTo", "/account?tab=account");

      const { error: linkError } = await createClient().auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: callback.toString(),
          queryParams: { prompt: "select_account" },
        },
      });

      if (linkError) {
        setError("Google couldn't be connected. Please try again.");
        setPending(false);
      }
    } catch {
      setError("Google couldn't be connected. Please try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-court/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-white">
            <Image
              src={GOOGLE_G}
              alt=""
              width={18}
              height={19}
              className="h-[18px] w-auto"
              unoptimized
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0">
            <p className="font-medium">Google</p>
            <p className="truncate text-sm text-ink-soft">
              {connected
                ? email ?? "Connected to your Google account"
                : "Sign in with Google without entering your password."}
            </p>
          </div>
        </div>

        {connected ? (
          <Badge tone="green" className="self-start sm:self-auto">
            Connected
          </Badge>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="self-start sm:self-auto"
            disabled={pending}
            onClick={connectGoogle}
          >
            {pending ? "Opening Google…" : "Connect Google"}
          </Button>
        )}
      </div>
      <div aria-live="polite">
        <FieldError>{error}</FieldError>
      </div>
    </div>
  );
}
