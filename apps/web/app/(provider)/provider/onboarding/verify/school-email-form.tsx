"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";

import {
  sendSchoolEmailOtp,
  useAccountEmailAsSchool,
  verifySchoolEmailOtp,
  type SchoolEmailFormState,
} from "../actions";

type Props = {
  /** The provider's already-verified .edu, if any. */
  verifiedEmail: string | null;
  /** The address a code was last sent to (verification in progress). */
  pendingEmail: string | null;
  /** Confirmed .edu login email eligible for the one-click shortcut. */
  accountEmail: string | null;
};

const EMPTY: SchoolEmailFormState = {};

export function SchoolEmailForm({
  verifiedEmail,
  pendingEmail,
  accountEmail,
}: Props) {
  const [sendState, sendAction, sending] = useActionState(
    sendSchoolEmailOtp,
    EMPTY,
  );
  const [verifyState, verifyAction, verifying] = useActionState(
    verifySchoolEmailOtp,
    EMPTY,
  );
  const [shortcutState, shortcutAction, shortcutting] = useActionState(
    useAccountEmailAsSchool,
    EMPTY,
  );

  if (verifiedEmail) {
    return (
      <div className="rounded-lg border border-quad-200 bg-quad-50 p-3 text-sm text-quad-800">
        School email verified ✓ —{" "}
        <span className="font-medium">{verifiedEmail}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sendState.notice ? (
        <p className="rounded-lg border border-quad-200 bg-quad-50 p-2.5 text-xs font-medium text-quad-800">
          {sendState.notice}
        </p>
      ) : null}

      {pendingEmail ? (
        <form action={verifyAction} className="space-y-3">
          <p className="text-sm text-ink-soft">
            Enter the 6-digit code we emailed to{" "}
            <span className="font-medium">{pendingEmail}</span>.
          </p>
          <div>
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              required
            />
          </div>
          <FieldError>{verifyState.error}</FieldError>
          <Button type="submit" size="lg" disabled={verifying}>
            {verifying ? "Verifying…" : "Verify school email"}
          </Button>
        </form>
      ) : (
        <form action={sendAction} className="space-y-3">
          <div>
            <Label htmlFor="school-email">School email (.edu)</Label>
            <Input
              id="school-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@school.edu"
              defaultValue={accountEmail ?? ""}
              required
            />
            <FieldHint>
              We&apos;ll email a 6-digit code to confirm you own it — this is how
              we verify you&apos;re a student.
            </FieldHint>
          </div>
          <FieldError>{sendState.error}</FieldError>
          <Button type="submit" size="lg" disabled={sending}>
            {sending ? "Sending code…" : "Send code"}
          </Button>
        </form>
      )}

      {pendingEmail ? (
        <form action={sendAction} className="space-y-2 border-t border-line pt-3">
          <Label htmlFor="resend-email" className="text-xs text-mist">
            Didn&apos;t get it? Resend, or use a different address.
          </Label>
          <div className="flex gap-2">
            <Input
              id="resend-email"
              name="email"
              type="email"
              defaultValue={pendingEmail}
              placeholder="you@school.edu"
              required
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={sending}
            >
              {sending ? "Sending…" : "Resend"}
            </Button>
          </div>
          <FieldError>{sendState.error}</FieldError>
        </form>
      ) : null}

      {/* Stays available even while a code is pending: if that code never shows
          up, this is the way out. */}
      {accountEmail ? (
        <form action={shortcutAction} className="border-t border-line pt-3">
          <p className="text-xs text-ink-soft">
            Your account email{" "}
            <span className="font-medium">{accountEmail}</span> is already a
            confirmed .edu — you can use it directly, no code needed.
          </p>
          <FieldError>{shortcutState.error}</FieldError>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={shortcutting}
            className="mt-2"
          >
            {shortcutting ? "Verifying…" : "Use my account email"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
