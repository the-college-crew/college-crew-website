"use client";

import { useActionState, useMemo, useState } from "react";

import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/field";
import type { OfferedService } from "@/lib/db/queries";
import { PLATFORM_FEE_RATE } from "@/lib/site";
import { formatOfferedPrice } from "@/lib/utils";

import { createBookingRequest, type BookingFormState } from "./actions";

export function BookingRequestForm({
  providerId,
  services,
}: {
  providerId: string;
  services: OfferedService[];
}) {
  const platformFeePercent = Math.round(PLATFORM_FEE_RATE * 100);
  const [state, formAction, pending] = useActionState<
    BookingFormState,
    FormData
  >(createBookingRequest, {});
  const [selectedId, setSelectedId] = useState(services[0]?.id ?? "");

  const selected = services.find((s) => s.id === selectedId);

  // datetime-local needs local time without seconds, e.g. 2026-07-04T09:00
  const minDateTime = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      <FormLoader />
      <input type="hidden" name="providerId" value={providerId} />

      <div>
        <Label htmlFor="providerServiceId">Service</Label>
        <Select
          id="providerServiceId"
          name="providerServiceId"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          required
        >
          {services.map((offered) => (
            <option key={offered.id} value={offered.id}>
              {offered.service.name} — {formatOfferedPrice(offered)}
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
          min={minDateTime}
          required
        />
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          name="address"
          autoComplete="street-address"
          placeholder="Street address for the job"
          required
        />
      </div>

      <div>
        <Label htmlFor="details">Details</Label>
        <Textarea
          id="details"
          name="details"
          rows={4}
          placeholder="Anything the provider should know — size of the job, pets, gate codes to arrange later…"
        />
      </div>

      {/* Price panel */}
      <div className="rounded-lg border border-line bg-court p-4 text-sm">
        <div className="flex items-center justify-between font-semibold">
          <span>Job price</span>
          <span className="text-quad-700">
            {selected
              ? selected.price_type === "quote"
                ? "Quoted in chat"
                : formatOfferedPrice(selected)
              : "—"}
          </span>
        </div>
        <p className="mt-2 text-xs text-mist">
          You pay exactly the price shown. College Crew&apos;s {platformFeePercent}%
          comes out of the provider&apos;s earnings — never added to your bill.
          Nothing is charged until the provider accepts and you confirm.
        </p>
      </div>

      <FieldError>{state.error}</FieldError>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Sending request…" : "Send booking request"}
      </Button>
    </form>
  );
}
