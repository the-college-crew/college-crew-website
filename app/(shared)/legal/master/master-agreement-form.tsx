"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import type { UserRole } from "@/lib/db/types";

import {
  acceptMasterAgreement,
  type MasterAgreementState,
} from "./actions";

export function MasterAgreementForm({
  next,
  renderedVariant,
  renderedHash,
}: {
  next: string;
  /** The agreement variant + content hash this page actually rendered; the
   * action refuses to record an acceptance that doesn't match them. */
  renderedVariant: UserRole;
  renderedHash: string;
}) {
  const [state, formAction, pending] = useActionState<
    MasterAgreementState,
    FormData
  >(acceptMasterAgreement, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="renderedVariant" value={renderedVariant} />
      <input type="hidden" name="renderedHash" value={renderedHash} />

      <label className="flex gap-3 rounded-xl border border-line bg-court p-4 text-sm text-ink-soft">
        <input
          type="checkbox"
          name="acceptMaster"
          className="mt-1 h-4 w-4 rounded border-line"
        />
        <span>
          I have read and accept the College Crew Master Service Agreement.
        </span>
      </label>

      <FieldError>{state.error}</FieldError>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving acceptance..." : "Accept and continue"}
      </Button>
    </form>
  );
}
