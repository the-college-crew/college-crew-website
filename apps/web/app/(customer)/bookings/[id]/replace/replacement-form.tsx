"use client";

import { useActionState, useState } from "react";

import { FormLoader } from "@/components/form-loader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Label, Select } from "@/components/ui/field";
import { formatMoney } from "@/lib/utils";

import {
  createReplacementRequest,
  type ReplacementFormState,
} from "./actions";

export type ReplacementCandidate = {
  providerServiceId: string;
  providerId: string;
  providerName: string;
  hourlyRateCents: number;
  rating: { avg: number; count: number } | null;
};

export function ReplacementForm({
  bookingId,
  candidates,
  responseOptions,
}: {
  bookingId: string;
  candidates: ReplacementCandidate[];
  responseOptions: number[];
}) {
  const [state, formAction, pending] = useActionState<
    ReplacementFormState,
    FormData
  >(createReplacementRequest, {});
  const [selectedId, setSelectedId] = useState(candidates[0]?.providerServiceId ?? "");
  const defaultResponse = responseOptions.includes(3) ? 3 : responseOptions[0];

  return (
    <form action={formAction} className="space-y-5">
      <FormLoader />
      <input type="hidden" name="originalBookingId" value={bookingId} />

      <div className="space-y-3">
        {candidates.map((candidate) => (
          <label key={candidate.providerServiceId} className="block cursor-pointer">
            <input
              type="radio"
              name="providerServiceId"
              value={candidate.providerServiceId}
              checked={selectedId === candidate.providerServiceId}
              onChange={() => setSelectedId(candidate.providerServiceId)}
              className="peer sr-only"
            />
            <Card className="p-4 peer-checked:border-crew-600 peer-checked:ring-2 peer-checked:ring-crew-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-semibold">
                    {candidate.providerName}
                  </p>
                  <p className="mt-1 text-xs text-mist">
                    {candidate.rating
                      ? `${candidate.rating.avg.toFixed(1)} ★ · ${candidate.rating.count} review${candidate.rating.count === 1 ? "" : "s"}`
                      : "New to the crew"}
                  </p>
                </div>
                <span className="font-semibold text-quad-700">
                  {formatMoney(candidate.hourlyRateCents)}/hr
                </span>
              </div>
            </Card>
          </label>
        ))}
      </div>

      <div>
        <Label htmlFor="replacementResponseWindow">New response window</Label>
        <Select
          id="replacementResponseWindow"
          name="responseWindowHours"
          defaultValue={defaultResponse}
          required
        >
          {responseOptions.map((hours) => (
            <option key={hours} value={hours}>
              {hours} hour{hours === 1 ? "" : "s"}
            </option>
          ))}
        </Select>
      </div>

      <p className="text-xs text-mist">
        Sending this request atomically withdraws the original. Only one
        provider can win if the original provider accepts at the same moment.
      </p>
      <FieldError>{state.error}</FieldError>
      <Button type="submit" size="lg" className="w-full" disabled={pending || !selectedId}>
        {pending ? "Sending replacement…" : "Withdraw original & send replacement"}
      </Button>
    </form>
  );
}
