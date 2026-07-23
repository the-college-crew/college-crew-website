import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { legalDocumentPath } from "@/lib/legal/acceptance";
import {
  CUSTOMER_BOOKING_TERMS_VERSION,
  PLATFORM_TERMS_VERSION,
  PROVIDER_TERMS_VERSION,
} from "@/lib/legal/waivers";
import type { ReadinessIssue } from "@/lib/provider/settings-readiness";

import { PanelNotices } from "../_components/panel-notices";
import { Section } from "../_components/section";

export function LegalPanel({
  isAdmin,
  isProvider,
  platformTermsAccepted,
  customerTermsAccepted,
  providerTermsAccepted,
  issues,
}: {
  isAdmin: boolean;
  isProvider: boolean;
  platformTermsAccepted: boolean;
  customerTermsAccepted: boolean;
  providerTermsAccepted: boolean;
  issues: readonly ReadinessIssue[];
}) {
  const agreements = [
    {
      label: "Platform Terms",
      version: PLATFORM_TERMS_VERSION,
      accepted: platformTermsAccepted,
      href: "/legal#platform-terms",
      acceptHref: legalDocumentPath("platform_terms", "/account?tab=legal"),
    },
    {
      label: "Customer Booking Terms",
      version: CUSTOMER_BOOKING_TERMS_VERSION,
      accepted: customerTermsAccepted,
      href: "/legal#customer-booking-terms",
      acceptHref: legalDocumentPath(
        "customer_booking_terms",
        "/account?tab=legal",
      ),
    },
    ...(isProvider
      ? [
          {
            label: "Provider Terms",
            version: PROVIDER_TERMS_VERSION,
            accepted: providerTermsAccepted,
            href: "/legal#provider-terms",
            acceptHref: legalDocumentPath(
              "provider_terms",
              "/account?tab=legal",
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PanelNotices issues={issues} />

      <Section
        title="Agreements"
        description={
          isAdmin
            ? "Founder accounts are exempt from marketplace user agreements."
            : "Your current account and action-specific legal status."
        }
      >
        <div className="space-y-3 text-sm">
          {agreements.map((agreement) => (
            <div
              key={agreement.label}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"
            >
              <div>
                <p className="font-medium">{agreement.label}</p>
                <p className="text-xs text-mist">Version {agreement.version}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={agreement.accepted ? "green" : "gold"}>
                  {isAdmin
                    ? "Exempt"
                    : agreement.accepted
                      ? "Accepted"
                      : "Required when used"}
                </Badge>
                {agreement.accepted || isAdmin ? (
                  <Link
                    href={agreement.href}
                    className={buttonClasses({ size: "sm", variant: "ghost" })}
                  >
                    View
                  </Link>
                ) : (
                  <Link
                    href={agreement.acceptHref}
                    className={buttonClasses({ size: "sm" })}
                  >
                    Review &amp; accept
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
