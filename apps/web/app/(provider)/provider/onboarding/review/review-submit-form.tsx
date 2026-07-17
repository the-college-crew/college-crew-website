"use client";

import { useActionState } from "react";

import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import { submitForReview, type OnboardingFormState } from "../actions";

export function ReviewSubmitForm({
  ready,
  providerTermsAccepted,
  renderedProviderTermsHash,
}: {
  ready: boolean;
  providerTermsAccepted: boolean;
  renderedProviderTermsHash: string;
}) {
  const [state, formAction, pending] = useActionState<OnboardingFormState, FormData>(
    submitForReview,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <FormLoader />
      <input
        type="hidden"
        name="renderedProviderTermsHash"
        value={renderedProviderTermsHash}
      />
      {!providerTermsAccepted ? (
        <label className="flex gap-3 rounded-xl border border-line bg-court p-4 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="acceptProviderTerms"
            className="mt-1 h-4 w-4 rounded border-line"
          />
          <span>I have read and accept the Provider Addendum.</span>
        </label>
      ) : null}
      <FieldError>{state.error}</FieldError>
      <Button type="submit" size="lg" disabled={!ready || pending}>
        {pending ? "Submitting…" : "Submit for review"}
      </Button>
    </form>
  );
}
