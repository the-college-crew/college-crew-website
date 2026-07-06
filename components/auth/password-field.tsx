"use client";

import { useId, useState } from "react";

import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import {
  evaluatePassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth/password-strength";
import { cn } from "@/lib/utils";

type PasswordFieldProps = {
  /** Name of the primary password input. */
  name?: string;
  label?: string;
  autoComplete?: "new-password" | "current-password";
  /** Render a paired confirm-password input with live match feedback. */
  confirm?: boolean;
  confirmName?: string;
  confirmLabel?: string;
  /** Show the strength meter + checklist (off for a plain login field). */
  meter?: boolean;
};

const SEGMENT_COLORS = [
  "bg-red-500", // score 1
  "bg-amber-500", // score 2
  "bg-yellow-500", // score 3
  "bg-green-600", // score 4
];

const LABEL_COLORS: Record<string, string> = {
  "Too weak": "text-mist",
  Weak: "text-red-700",
  Fair: "text-amber-700",
  Good: "text-yellow-700",
  Strong: "text-green-700",
};

/**
 * Password entry with a show/hide toggle, a rules-based strength meter, and an
 * optional confirm field. The meter uses the same lib/auth/password-strength
 * evaluator the Server Action enforces, so the live feedback matches what the
 * server will accept. Shared by signup, provider onboarding, reset-password,
 * and settings.
 */
export function PasswordField({
  name = "password",
  label = "Password",
  autoComplete = "new-password",
  confirm = false,
  confirmName = "confirmPassword",
  confirmLabel = "Confirm password",
  meter = true,
}: PasswordFieldProps) {
  const [password, setPassword] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [show, setShow] = useState(false);

  const strength = evaluatePassword(password);
  const meterId = useId();
  const mismatch = confirm && confirmValue.length > 0 && confirmValue !== password;

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={name}>{label}</Label>
        <div className="relative">
          <Input
            id={name}
            name={name}
            type={show ? "text" : "password"}
            autoComplete={autoComplete}
            minLength={MIN_PASSWORD_LENGTH}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={meter ? meterId : undefined}
            className="pr-14"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-ink-soft hover:text-ink"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>

        {meter && password.length > 0 && (
          <div id={meterId} className="mt-2">
            <div className="flex gap-1" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    i < strength.score ? SEGMENT_COLORS[strength.score - 1] : "bg-line",
                  )}
                />
              ))}
            </div>
            <p
              className={cn(
                "mt-1.5 text-xs font-medium",
                LABEL_COLORS[strength.label],
              )}
            >
              Strength: {strength.label}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-mist">
              <Check ok={strength.checks.length}>
                At least {MIN_PASSWORD_LENGTH} characters
              </Check>
              <Check ok={strength.checks.lower && strength.checks.upper}>
                Upper &amp; lowercase letters
              </Check>
              <Check ok={strength.checks.number}>A number</Check>
              <Check ok={strength.checks.symbol}>A symbol</Check>
            </ul>
          </div>
        )}
        {meter && password.length === 0 && (
          <FieldHint>
            At least {MIN_PASSWORD_LENGTH} characters, with a mix of letters,
            numbers, and symbols.
          </FieldHint>
        )}
      </div>

      {confirm && (
        <div>
          <Label htmlFor={confirmName}>{confirmLabel}</Label>
          <Input
            id={confirmName}
            name={confirmName}
            type={show ? "text" : "password"}
            autoComplete={autoComplete}
            required
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            aria-invalid={mismatch || undefined}
          />
          {mismatch && <FieldError>Passwords don&apos;t match.</FieldError>}
        </div>
      )}
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-1.5", ok && "text-green-700")}>
      <span aria-hidden="true">{ok ? "✓" : "○"}</span>
      {children}
    </li>
  );
}
