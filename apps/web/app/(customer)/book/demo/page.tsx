import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormLoader } from "@/components/form-loader";
import { BookingCopyProvider } from "@/components/content/booking-copy-provider";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { SchedulePicker } from "@/components/scheduling/schedule-picker";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import {
  expandWeeklyWindows,
  pilotDateKey,
  shiftDateKey,
} from "@/lib/booking/availability-grid";
import { MINIMUM_NOTICE_HOURS } from "@/lib/booking/policy";
import {
  bookingCopyValue,
  type BookingCopyKey,
} from "@/lib/content/booking-copy";
import { getBookingCopyOverrides } from "@/lib/content/booking-copy.server";
import {
  demoAvailabilityWindows,
  demoOfferings,
  demoProviderProfile,
  getDemoPreview,
} from "@/lib/demo/sample-preview";
import { formatOfferedPrice } from "@/lib/utils";

import { submitDemoBookingRequest } from "./actions";

export const metadata: Metadata = { title: "Sample booking request" };

export default async function DemoBookingPage() {
  const preview = await getDemoPreview("customer");
  if (!preview) notFound();
  const copyOverrides = await getBookingCopyOverrides("customer");
  const copy = (key: BookingCopyKey) =>
    bookingCopyValue(copyOverrides, key);

  // The sample uses the same picker as the real flow, driven off the sample
  // provider's weekly hours, so the preview can't drift from what customers see.
  const now = new Date();
  const horizonStart = pilotDateKey(now);
  const horizonEnd = shiftDateKey(horizonStart, 60);
  const demoSchedule = {
    days: expandWeeklyWindows(demoAvailabilityWindows, horizonStart, 60),
    busy: [],
    horizonStart,
    horizonEnd,
    nowIso: now.toISOString(),
  };

  return (
    <BookingCopyProvider overrides={copyOverrides}>
      <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={demoProviderProfile.display_name}
        description={copy("booking-customer.demo-request.description")}
      />
      <SamplePreviewBanner role="customer" />

      <Card pennant className="p-6">
        <form action={submitDemoBookingRequest} className="space-y-4">
          <FormLoader />
          <div>
            <Label htmlFor="providerServiceId">
              {copy("booking-customer.demo-request.service-label")}
            </Label>
            <Select id="providerServiceId" name="providerServiceId" required>
              {demoOfferings.map((offered) => (
                <option key={offered.id} value={offered.id}>
                  {offered.service.name} - {formatOfferedPrice(offered)}
                </option>
              ))}
            </Select>
          </div>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-ink">
              {copy("booking-customer.demo-request.schedule-label")}
            </legend>
            <SchedulePicker
              days={demoSchedule.days}
              busy={demoSchedule.busy}
              nowIso={demoSchedule.nowIso}
              minimumNoticeHours={MINIMUM_NOTICE_HOURS.default}
              horizonStart={demoSchedule.horizonStart}
              horizonEnd={demoSchedule.horizonEnd}
              gridLabel={copy("booking-customer.demo-request.calendar-label")}
            />
          </fieldset>

          <div>
            <Label htmlFor="responseWindowHours">
              {copy("booking-customer.demo-request.response-label")}
            </Label>
            <Select
              id="responseWindowHours"
              name="responseWindowHours"
              defaultValue="3"
            >
              <option value="1">1 hour</option>
              <option value="3">3 hours</option>
              <option value="5">5 hours</option>
              <option value="12">12 hours</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="address">
              {copy("booking-customer.demo-request.address-label")}
            </Label>
            <Input
              id="address"
              name="address"
              defaultValue="1420 Maple Lane"
              required
            />
          </div>

          <div>
            <Label htmlFor="jobZip">
              {copy("booking-customer.demo-request.zip-label")}
            </Label>
            <Input id="jobZip" name="jobZip" defaultValue="60614" required />
          </div>

          <div>
            <Label htmlFor="details">
              {copy("booking-customer.demo-request.details-label")}
            </Label>
            <Textarea
              id="details"
              name="details"
              rows={4}
              defaultValue="Front and back yard. Please bring bags for clippings."
            />
          </div>

          <div className="rounded-lg border border-line bg-court p-4 text-sm">
            <div className="flex items-center justify-between font-semibold">
              <span>{copy("booking-customer.demo-request.rate-label")}</span>
              <span className="text-quad-700">
                {formatOfferedPrice(demoOfferings[0])}
              </span>
            </div>
            <p className="mt-2 text-xs text-mist">
              {copy("booking-customer.demo-request.policy-note")}
            </p>
          </div>

          <button type="submit" className={buttonClasses({ size: "lg", className: "w-full" })}>
            {copy("booking-customer.demo-request.submit")}
          </button>
        </form>
      </Card>

      <p className="text-center text-sm">
        <Link
          href="/dashboard"
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          {copy("booking-customer.demo-request.back")}
        </Link>
      </p>
      </div>
    </BookingCopyProvider>
  );
}
