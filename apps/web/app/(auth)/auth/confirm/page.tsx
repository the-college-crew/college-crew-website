import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { safeNext } from "@/lib/auth/post-auth";

import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Confirm your email" };

/**
 * The landing page for every Supabase email link. It shows a button rather than
 * confirming on sight: the token is single-use, and mail scanners fetch links
 * before the recipient does. One human click spends it — nothing else can.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : null;

  const tokenHash = read("token_hash");
  const type = read("type");
  const next = safeNext(read("next"));
  const isRecovery = type === "recovery";

  if (!tokenHash || !type) {
    return (
      <Card pennant className="p-6">
        <h1 className="font-display text-2xl font-semibold">
          This link is incomplete
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          It may have been cut in half by your email app. Send yourself a fresh
          one and open it directly.
        </p>
        <Link
          href="/verify-email"
          className={buttonClasses({
            variant: "secondary",
            size: "sm",
            className: "mt-5",
          })}
        >
          Get a new link
        </Link>
      </Card>
    );
  }

  return (
    <Card pennant className="p-6">
      <h1 className="font-display text-2xl font-semibold">
        {isRecovery ? "Reset your password" : "Confirm your email"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {isRecovery
          ? "Click below to continue and choose a new password."
          : "One click and your College Crew account is ready to go."}
      </p>

      <ConfirmForm
        tokenHash={tokenHash}
        type={type}
        next={next}
        label={isRecovery ? "Reset my password" : "Confirm my email"}
      />
    </Card>
  );
}
