"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";

/**
 * Persistent nudge for a provider who created an account but hasn't finished
 * verification, so they never get stranded on the dashboard with no way back.
 * The layout computes what's missing and where to send them; this just renders
 * and self-hides inside the onboarding wizard (where the nag is redundant).
 */
export function ProviderVerifyBanner({
  href,
  message,
}: {
  href: string;
  message: string;
}) {
  const pathname = usePathname();
  if (pathname?.startsWith("/provider/onboarding")) return null;

  return (
    <div className="border-b border-gold-400/60 bg-gold-100 text-gold-900">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-medium">{message}</p>
        <Link
          href={href}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          Finish verifying →
        </Link>
      </div>
    </div>
  );
}
