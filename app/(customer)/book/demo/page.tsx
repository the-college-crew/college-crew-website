import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormLoader } from "@/components/form-loader";
import { SamplePreviewBanner } from "@/components/sample-preview-banner";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import {
  demoBookings,
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

  const sampleDateTime = demoBookings[0].scheduled_at.slice(0, 16);

  return (
    <div className="mx-auto max-w-xl space-y-6">
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

          <div>
            <Label htmlFor="scheduledAt">Date & time</Label>
            <Input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
              defaultValue={sampleDateTime}
              required
            />
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
              <span>Job price</span>
              <span className="text-quad-700">
                {formatOfferedPrice(demoOfferings[0])}
              </span>
            </div>
            <p className="mt-2 text-xs text-mist">
              No charge until the provider accepts. This sample submit only
              returns to the dashboard with a request-sent notice.
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
