"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import type { LegalDocumentKind } from "@/lib/legal/waivers";

import { acceptLegalDocument, type LegalDocumentState } from "./actions";

const LABELS: Record<LegalDocumentKind, string> = {
  platform_terms: "I have read and accept the College Crew Platform Terms.",
  customer_booking_terms: "I have read and accept the Customer Booking Terms.",
  provider_terms: "I have read and accept the Provider Addendum.",
};

export function LegalDocumentForm({
  kind,
  next,
  renderedHash,
}: {
  kind: LegalDocumentKind;
  next: string;
  renderedHash: string;
}) {
  const [state, formAction, pending] = useActionState<LegalDocumentState, FormData>(
    acceptLegalDocument,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="renderedHash" value={renderedHash} />
      <label className="flex gap-3 rounded-xl border border-line bg-court p-4 text-sm text-ink-soft">
        <input
          type="checkbox"
          name="acceptLegalDocument"
          className="mt-1 h-4 w-4 rounded border-line"
        />
        <span>{LABELS[kind]}</span>
      </label>
      <FieldError>{state.error}</FieldError>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving acceptance…" : "Accept and continue"}
      </Button>
    </form>
  );
}
