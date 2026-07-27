import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormLoader } from "@/components/form-loader";
import { BookingCopyProvider } from "@/components/content/booking-copy-provider";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { StatusPill } from "@/components/status-pill";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  bookingCopyValue,
  type BookingCopyKey,
} from "@/lib/content/booking-copy";
import { getBookingCopyOverrides } from "@/lib/content/booking-copy.server";
import { demoBookings, getDemoPreview } from "@/lib/demo/sample-preview";
import { formatDateTime, formatMoney } from "@/lib/utils";

import { confirmDemoPayment } from "./actions";

export const metadata: Metadata = { title: "Sample confirm & pay" };

export default async function DemoConfirmPayPage() {
  const preview = await getDemoPreview("customer");
  if (!preview) notFound();

  const booking = demoBookings.find((item) => item.status === "accepted");
  if (!booking) notFound();
  const copyOverrides = await getBookingCopyOverrides("customer");
  const copy = (key: BookingCopyKey) =>
    bookingCopyValue(copyOverrides, key);

  const rows = [
    {
      label: copy("booking-customer.demo-confirm.service-label"),
      value: booking.service.name,
    },
    {
      label: copy("booking-customer.demo-confirm.provider-label"),
      value: booking.provider.display_name,
    },
    {
      label: copy("booking-customer.demo-confirm.when-label"),
      value: formatDateTime(booking.scheduled_at),
    },
    {
      label: copy("booking-customer.demo-confirm.where-label"),
      value: booking.address,
    },
    {
      label: copy("booking-customer.demo-confirm.price-label"),
      value: formatMoney(booking.price_cents),
    },
  ];

  return (
    <BookingCopyProvider overrides={copyOverrides}>
      <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title={copy("booking-customer.demo-confirm.title")}
        description={copy("booking-customer.demo-confirm.description")}
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
          {copy("booking-customer.demo-confirm.notice")}
        </p>

        <form action={confirmDemoPayment} className="mt-6">
          <FormLoader />
          <Button type="submit" size="lg" className="w-full">
            {copy("booking-customer.demo-confirm.submit")}
          </Button>
        </form>
      </Card>

      <p className="text-center">
        <Link
          href="/dashboard"
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          {copy("booking-customer.demo-confirm.back")}
        </Link>
      </p>
      </div>
    </BookingCopyProvider>
  );
}
