"use client";

import Image from "next/image";
import { useState } from "react";

import { FieldError } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

// Google's official multicolor G, downloaded from its current identity brand
// assets and embedded so auth pages do not make a tracking request to Google.
export const GOOGLE_G =
  "data:image/png;base64,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";

export function GoogleAuthOption({
  next,
  returnTo,
  initialError,
  emailFirst = false,
}: {
  next?: string;
  returnTo: string;
  initialError?: string;
  emailFirst?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);

  async function continueWithGoogle() {
    setPending(true);
    setError(undefined);

    try {
      const callback = new URL("/auth/callback", window.location.origin);
      if (next) callback.searchParams.set("next", next);
      callback.searchParams.set("returnTo", returnTo);

      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString() },
      });

      if (oauthError) {
        setError("Google sign-in couldn't start. Please try again.");
        setPending(false);
      }
    } catch {
      setError("Google sign-in couldn't start. Please try again.");
      setPending(false);
    }
  }

  return (
    <div>
      {emailFirst ? (
        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs font-medium text-mist">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}
      <button
        type="button"
        className="inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full border border-[#747775] bg-white px-4 py-2.5 text-sm font-medium text-[#1f1f1f] transition duration-200 hover:bg-[#f8f9fa] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        disabled={pending}
        onClick={continueWithGoogle}
      >
        <Image
          src={GOOGLE_G}
          alt=""
          width={18}
          height={19}
          className="h-[18px] w-auto"
          unoptimized
          aria-hidden="true"
        />
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      <div aria-live="polite">
        <FieldError>{error}</FieldError>
      </div>
      {!emailFirst ? (
        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs font-medium text-mist">or use email</span>
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}
    </div>
  );
}
