import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormLoader } from "@/components/form-loader";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { StatusPill } from "@/components/status-pill";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { demoBookings, getDemoPreview } from "@/lib/demo/sample-preview";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { confirmDemoPayment } from "./actions";

export const metadata: Metadata = { title: "Sample confirm & pay" };

export default async function DemoConfirmPayPage() {
  const preview = await getDemoPreview("customer");
  if (!preview) notFound();

  const booking = demoBookings.find((item) => item.status === "accepted");
  if (!booking) notFound();

  const rows = [
    { label: "Service", value: booking.service.name },
    { label: "Provider", value: booking.provider.display_name },
    { label: "When", value: formatDateTime(booking.scheduled_at) },
    { label: "Where", value: booking.address },
    { label: "Price", value: formatMoney(booking.price_cents) },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Confirm & pay"
        description="Sample accepted booking details before payment."
      />
      <SamplePreviewBanner role="customer" />

      <Card pennant className="p-6">
        <div className="flex justify-end">
          <StatusPill status={booking.status} />
        </div>
        <dl className="mt-2 divide-y divide-line text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 py-3">
              <dt className="text-mist">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-mist">
          This demo does not create a Stripe PaymentIntent or charge a card.
        </p>

        <form action={confirmDemoPayment} className="mt-6">
          <FormLoader />
          <Button type="submit" size="lg" className="w-full">
            Confirm sample payment
          </Button>
        </form>
      </Card>

      <p className="text-center">
        <Link
          href="/dashboard"
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
