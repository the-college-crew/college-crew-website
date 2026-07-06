import type { Metadata } from "next";
import Link from "next/link";

import { VerifyEmailForm } from "./verify-email-form";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const { error, email } = await searchParams;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
        Verify your email
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Confirm your email to finish setting up your account. Link expired or
        didn&apos;t arrive? Send yourself a fresh one.
      </p>

      <div className="mt-6">
        <VerifyEmailForm initialError={error} defaultEmail={email} />
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Already confirmed?{" "}
        <Link href="/login" className="font-semibold text-crew-700">
          Log in
        </Link>
      </p>
    </div>
  );
}
