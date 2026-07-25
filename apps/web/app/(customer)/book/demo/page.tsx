import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormLoader } from "@/components/form-loader";
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
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={demoProviderProfile.display_name}
        description="Sample booking request"
      />
      <SamplePreviewBanner role="customer" />

      <Card pennant className="p-6">
        <form action={submitDemoBookingRequest} className="space-y-4">
          <FormLoader />
          <div>
            <Label htmlFor="providerServiceId">Service</Label>
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
              When do you need this?
            </legend>
            <SchedulePicker
              days={demoSchedule.days}
              busy={demoSchedule.busy}
              nowIso={demoSchedule.nowIso}
              minimumNoticeHours={MINIMUM_NOTICE_HOURS.default}
              horizonStart={demoSchedule.horizonStart}
              horizonEnd={demoSchedule.horizonEnd}
              gridLabel="Choose a date to book"
            />
          </fieldset>

          <div>
            <Label htmlFor="responseWindowHours">Response window</Label>
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
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              name="address"
              defaultValue="1420 Maple Lane"
              required
            />
          </div>

          <div>
            <Label htmlFor="jobZip">Job ZIP</Label>
            <Input id="jobZip" name="jobZip" defaultValue="60614" required />
          </div>

          <div>
            <Label htmlFor="details">Details</Label>
            <Textarea
              id="details"
              name="details"
              rows={4}
              defaultValue="Front and back yard. Please bring bags for clippings."
            />
          </div>

          <div className="rounded-lg border border-line bg-court p-4 text-sm">
            <div className="flex items-center justify-between font-semibold">
              <span>Hourly rate</span>
              <span className="text-quad-700">
                {formatOfferedPrice(demoOfferings[0])}
              </span>
            </div>
            <p className="mt-2 text-xs text-mist">
              One-hour minimum, then 15-minute increments. After acceptance,
              the first hour is due; final billing uses actual submitted time.
              This sample submit only returns to the dashboard.
            </p>
          </div>

          <button type="submit" className={buttonClasses({ size: "lg", className: "w-full" })}>
            Send sample request
          </button>
        </form>
      </Card>

      <p className="text-center text-sm">
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
