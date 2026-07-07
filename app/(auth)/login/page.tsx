import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">
        Welcome back
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Log in to manage bookings, messages, and your profile.
      </p>

      <div className="mt-6">
        <LoginForm next={next} initialError={error} />
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-crew-700">
          Create an account
        </Link>
      </p>
    </div>
  );
}
