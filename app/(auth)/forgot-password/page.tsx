import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
        Reset your password
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Enter your email and we&apos;ll send you a link to set a new password.
      </p>

      <div className="mt-6">
        <ForgotPasswordForm initialError={error} />
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-crew-700">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
