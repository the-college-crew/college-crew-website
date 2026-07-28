"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { openConversationForBooking } from "@/app/actions/messaging";
import { useBookingCopy } from "@/components/content/booking-copy-provider";
import { FormLoader } from "@/components/form-loader";
import { Button, buttonClasses } from "@/components/ui/button";
import {
  FieldError,
  FieldHint,
  Input,
  Select,
  Textarea,
} from "@/components/ui/field";
import {
  BASIS_POINTS_SCALE,
  PLATFORM_FEE_BPS,
} from "@/lib/booking/policy";
import {
  QUOTE_DAYPART_LABELS,
  QUOTE_DAYPARTS,
  quoteDaypartContainsStart,
  type QuoteDaypart,
} from "@/lib/booking/quote-dayparts";
import {
  buildDayRail,
  formatDurationLabel,
  groupScheduleDays,
  minutesToClock,
  validateRange,
} from "@/lib/booking/availability-grid";
import type { ProviderSchedule } from "@/lib/db/queries";
import type { BookingFlow } from "@/lib/db/types";

import {
  acceptBooking,
  counterBooking,
  counterQuote,
  declineBooking,
  sendQuote,
} from "../actions";

type RequestJob = {
  id: string;
  serviceName: string;
  customerName: string;
  whenLabel: string;
  address: string;
  bookingFlow: BookingFlow;
  /** "flexible" means the customer allows a different time to be suggested. */
  timeFlexibility: "flexible" | "fixed";
  requestedDate?: string | null;
  requestedDaypart?: QuoteDaypart | null;
  privateEstimatedMinutes?: number | null;
};

/**
 * Accept / decline for a pending request. Accept asks the provider to sign off
 * on the job details first; decline collects a note that opens the chat. Both
 * server actions redirect into the conversation, so there's no success state to
 * render here — the page navigates away.
 */
export function RequestActions({
  job,
  schedule,
}: {
  job: RequestJob;
  schedule: ProviderSchedule;
}) {
  const copy = useBookingCopy();
  const [mode, setMode] = useState<
    "idle" | "accept" | "quote" | "decline" | "counter" | "quoteCounter"
  >("idle");

  // Only offered when the customer said a different time may be suggested; the
  // RPC enforces the same rule server-side.
  const canCounter =
    job.bookingFlow === "hourly_v1" && job.timeFlexibility === "flexible";

  if (mode === "accept") {
    return (
      <ConfirmPanel job={job} onCancel={() => setMode("idle")} />
    );
  }
  if (mode === "decline") {
    return (
      <DeclinePanel job={job} onCancel={() => setMode("idle")} />
    );
  }
  if (mode === "counter") {
    return <CounterPanel job={job} onCancel={() => setMode("idle")} />;
  }
  if (mode === "quote") {
    return (
      <SendQuotePanel
        job={job}
        schedule={schedule}
        onCancel={() => setMode("idle")}
      />
    );
  }
  if (mode === "quoteCounter") {
    return <QuoteCounterPanel job={job} onCancel={() => setMode("idle")} />;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button
        type="button"
        variant="success"
        size="sm"
        onClick={() =>
          setMode(
            ["quote_v1", "quote_v2"].includes(job.bookingFlow)
              ? "quote"
              : "accept",
          )
        }
      >
        {["quote_v1", "quote_v2"].includes(job.bookingFlow)
          ? copy("booking-provider.dashboard.quote-start")
          : copy("booking-provider.dashboard.accept")}
      </Button>
      {canCounter ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setMode("counter")}
        >
          Suggest another time
        </Button>
      ) : null}
      {job.bookingFlow === "quote_v2" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setMode("quoteCounter")}
        >
          Offer other days
        </Button>
      ) : null}
      <Button
        type="button"
        variant="danger"
        size="sm"
        onClick={() => setMode("decline")}
      >
        Decline
      </Button>
    </div>
  );
}

/**
 * Propose a different start time. The customer keeps control — their hold stays
 * as-is and nothing is charged unless they accept the new time.
 */
function CounterPanel({
  job,
  onCancel,
}: {
  job: RequestJob;
  onCancel: () => void;
}) {
  const copy = useBookingCopy();
  const [state, formAction] = useActionState(counterBooking, {});

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <FormLoader />
      <input type="hidden" name="bookingId" value={job.id} />
      <label
        htmlFor={`counter-${job.id}`}
        className="block text-sm font-medium text-ink"
      >
        When could you do it?
      </label>
      <Input
        id={`counter-${job.id}`}
        name="proposedLocal"
        type="datetime-local"
        required
      />
      <FieldHint>
        They asked for {job.whenLabel}. Suggest the closest time that works for
        you.
      </FieldHint>
      <Textarea
        name="note"
        rows={2}
        maxLength={500}
        placeholder={copy(
          "booking-provider.dashboard.counter-placeholder",
        )}
      />
      <p className="text-xs text-mist">
        {job.customerName} chooses whether to take it. Nothing is charged unless
        they accept.
      </p>
      <FieldError>{state.error}</FieldError>
      <div className="flex gap-2">
        <SubmitButton variant="primary" pendingLabel="Sending…">
          {copy("booking-provider.dashboard.counter-submit")}
        </SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          Back
        </button>
      </div>
    </form>
  );
}

function SendQuotePanel({
  job,
  schedule,
  onCancel,
}: {
  job: RequestJob;
  schedule: ProviderSchedule;
  onCancel: () => void;
}) {
  const copy = useBookingCopy();
  const [state, formAction] = useActionState(sendQuote, {});
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    String(job.privateEstimatedMinutes ?? 120),
  );
  const [scheduledLocal, setScheduledLocal] = useState("");
  const requestedDate = job.requestedDate;
  const requestedDaypart = job.requestedDaypart;
  const availableStartTimes = useMemo(() => {
    const duration = Number(estimatedMinutes);
    if (
      !requestedDate ||
      !requestedDaypart ||
      !Number.isInteger(duration) ||
      duration < 60 ||
      duration > 720 ||
      duration % 15 !== 0
    ) {
      return [];
    }
    const periods = groupScheduleDays(schedule.days).get(requestedDate);
    if (!periods) return [];
    const rail = buildDayRail({
      day: periods,
      busy: schedule.busy,
      now: new Date(schedule.nowIso),
      minimumNoticeHours: 0,
    });
    return rail.slots.filter(
      (slot) =>
        quoteDaypartContainsStart(requestedDaypart, slot.startMinutes) &&
        validateRange(rail, slot.startMinutes, slot.startMinutes + duration, {
          min: duration,
          max: duration,
        }).ok,
    );
  }, [estimatedMinutes, requestedDate, requestedDaypart, schedule]);

  const selectedStartIsAvailable = availableStartTimes.some(
    (slot) =>
      scheduledLocal === `${requestedDate}T${minutesToClock(slot.startMinutes)}`,
  );

  return (
    <div className="mt-3 rounded-xl border border-viridian/25 bg-honeydew/40 p-3">
      <p className="font-display text-sm font-semibold text-viridian">
        {copy("booking-provider.dashboard.quote-title")}
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">
        {copy("booking-provider.dashboard.quote-body")}
      </p>

      <form action={openConversationForBooking} className="mt-3">
        <FormLoader />
        <input type="hidden" name="bookingId" value={job.id} />
        <button
          type="submit"
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          {copy("booking-provider.dashboard.quote-chat")}
        </button>
      </form>

      <form action={formAction} className="mt-4 space-y-2">
        <FormLoader />
        <input type="hidden" name="bookingId" value={job.id} />
        {job.bookingFlow === "quote_v2" ? (
          <>
            <label
              htmlFor={`quote-start-${job.id}`}
              className="block text-sm font-medium text-ink"
            >
              Exact start time on {requestedDate ?? "the requested date"}
            </label>
            <Select
              id={`quote-start-${job.id}`}
              name="scheduledLocal"
              value={selectedStartIsAvailable ? scheduledLocal : ""}
              onChange={(event) => setScheduledLocal(event.target.value)}
              required
            >
              <option value="">Choose a time</option>
              {availableStartTimes.map((slot) => {
                const value = `${requestedDate}T${minutesToClock(slot.startMinutes)}`;
                return (
                  <option
                    key={slot.startMinutes}
                    value={value}
                  >
                    {slot.label}
                  </option>
                );
              })}
            </Select>
            <FieldHint>
              Choose a 15-minute start within{" "}
              {job.requestedDaypart
                ? QUOTE_DAYPART_LABELS[job.requestedDaypart]
                : "the requested window"}. Only times that fit your current
              availability and this estimate are shown.
            </FieldHint>
            {availableStartTimes.length > 0 ? (
              <FieldHint>
                With this {formatDurationLabel(Number(estimatedMinutes))} estimate,
                the latest available start is{" "}
                {availableStartTimes[availableStartTimes.length - 1]?.label}.
              </FieldHint>
            ) : (
              <FieldHint>
                No start times fit this estimate. Adjust the private estimate
                or offer other days.
              </FieldHint>
            )}
            <label
              htmlFor={`quote-duration-${job.id}`}
              className="block text-sm font-medium text-ink"
            >
              Private calendar estimate
            </label>
            <Input
              id={`quote-duration-${job.id}`}
              name="estimatedMinutes"
              type="number"
              min={60}
              max={720}
              step={15}
              value={estimatedMinutes}
              onChange={(event) => setEstimatedMinutes(event.target.value)}
              required
            />
            <FieldHint>
              Minutes reserved on your calendar; the customer does not see this
              estimate and it cannot change the fixed quote.
            </FieldHint>
          </>
        ) : null}
        <label
          htmlFor={`quote-${job.id}`}
          className="block text-sm font-medium text-ink"
        >
          {copy("booking-provider.dashboard.quote-label")}
        </label>
        <div className="flex max-w-xs items-center rounded-xl border border-line bg-paper focus-within:border-viridian focus-within:ring-2 focus-within:ring-viridian/15">
          <span aria-hidden className="pl-3 text-sm font-semibold text-ink-soft">
            $
          </span>
          <Input
            id={`quote-${job.id}`}
            name="quoteAmount"
            type="number"
            min={20}
            max={10_000}
            step="0.01"
            inputMode="decimal"
            required
            className="border-0 bg-transparent focus:ring-0"
          />
        </div>
        <FieldHint>
          {copy("booking-provider.dashboard.quote-hint", {
            platform_fee_percent:
              (PLATFORM_FEE_BPS / BASIS_POINTS_SCALE) * 100,
          })}
        </FieldHint>
        <FieldError>{state.error}</FieldError>
        <div className="flex gap-2">
          <SubmitButton variant="success" pendingLabel="Sending...">
            {copy("booking-provider.dashboard.quote-submit")}
          </SubmitButton>
          <button
            type="button"
            onClick={onCancel}
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            Back
          </button>
        </div>
      </form>
    </div>
  );
}

function QuoteCounterPanel({
  job,
  onCancel,
}: {
  job: RequestJob;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(counterQuote, {});
  const [options, setOptions] = useState<
    Array<{ localDate: string; daypart: QuoteDaypart }>
  >([{ localDate: "", daypart: "either" }]);

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-xl border border-line bg-court p-3">
      <FormLoader />
      <input type="hidden" name="bookingId" value={job.id} />
      <input type="hidden" name="options" value={JSON.stringify(options)} />
      <div>
        <p className="text-sm font-medium text-ink">Offer other days</p>
        <FieldHint>
          Offer up to three different dates. The customer will choose one and
          send the request back to you.
        </FieldHint>
      </div>
      <label
        htmlFor={`counter-duration-${job.id}`}
        className="block text-sm font-medium text-ink"
      >
        Private job estimate
      </label>
      <Input
        id={`counter-duration-${job.id}`}
        name="estimatedMinutes"
        type="number"
        min={60}
        max={720}
        step={15}
        defaultValue={job.privateEstimatedMinutes ?? 120}
        required
      />
      {options.map((option, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            type="date"
            aria-label={`Alternative date ${index + 1}`}
            value={option.localDate}
            required
            onChange={(event) =>
              setOptions((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, localDate: event.target.value }
                    : item,
                ),
              )
            }
          />
          <Select
            aria-label={`Alternative daypart ${index + 1}`}
            value={option.daypart}
            onChange={(event) =>
              setOptions((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index
                    ? {
                        ...item,
                        daypart: event.target.value as QuoteDaypart,
                      }
                    : item,
                ),
              )
            }
          >
            {QUOTE_DAYPARTS.map((daypart) => (
              <option key={daypart} value={daypart}>
                {QUOTE_DAYPART_LABELS[daypart]}
              </option>
            ))}
          </Select>
          {options.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setOptions((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            >
              Remove
            </Button>
          ) : null}
        </div>
      ))}
      {options.length < 3 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setOptions((current) => [
              ...current,
              { localDate: "", daypart: "either" },
            ])
          }
        >
          Add another day
        </Button>
      ) : null}
      <Textarea
        name="note"
        rows={2}
        maxLength={500}
        placeholder="Optional note for the customer"
      />
      <FieldError>{state.error}</FieldError>
      <div className="flex gap-2">
        <SubmitButton variant="primary" pendingLabel="Sending…">
          Send alternatives
        </SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          Back
        </button>
      </div>
    </form>
  );
}

/**
 * The signature moment: a little work-order the provider signs off on. The
 * labelled rows restate exactly what they're committing to before it becomes a
 * job on the books.
 */
function ConfirmPanel({
  job,
  onCancel,
}: {
  job: RequestJob;
  onCancel: () => void;
}) {
  const copy = useBookingCopy();
  const [state, formAction] = useActionState(acceptBooking, {});
  const rows: [string, string][] = [
    ["Service", job.serviceName],
    ["For", job.customerName],
    ["When", job.whenLabel],
    ["Where", job.address],
  ];

  return (
    <div className="mt-3 rounded-xl border border-viridian/25 bg-honeydew/40 p-3">
      <p className="font-display text-sm font-semibold text-viridian">
        Can you make it?
      </p>
      <dl className="mt-2 divide-y divide-viridian/15 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline gap-3 py-1.5"
          >
            <dt className="w-14 shrink-0 font-display text-[11px] font-semibold uppercase tracking-wide text-mist">
              {label}
            </dt>
            <dd className="text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <form action={formAction} className="mt-3 space-y-2">
        <FormLoader />
        <input type="hidden" name="bookingId" value={job.id} />
        <FieldError>{state.error}</FieldError>
        <div className="flex gap-2">
          <SubmitButton
            variant="success"
            pendingLabel={copy("booking-provider.dashboard.accepting")}
          >
            Yes, I&apos;m in
          </SubmitButton>
          <button
            type="button"
            onClick={onCancel}
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            Back
          </button>
        </div>
      </form>
    </div>
  );
}

function DeclinePanel({
  job,
  onCancel,
}: {
  job: RequestJob;
  onCancel: () => void;
}) {
  const copy = useBookingCopy();
  const [note, setNote] = useState("");
  const [state, formAction] = useActionState(declineBooking, {});

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <FormLoader />
      <input type="hidden" name="bookingId" value={job.id} />
      <label
        htmlFor={`decline-${job.id}`}
        className="block text-sm font-medium text-ink"
      >
        What&apos;s the problem?
      </label>
      <Textarea
        id={`decline-${job.id}`}
        name="message"
        required
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={copy(
          "booking-provider.dashboard.decline-placeholder",
        )}
      />
      <p className="text-xs text-mist">
        This declines the request and opens a chat with {job.customerName} so
        you can explain or discuss another time.
      </p>
      <FieldError>{state.error}</FieldError>
      <div className="flex gap-2">
        <SubmitButton
          variant="primary"
          pendingLabel="Sending…"
          disabled={note.trim().length === 0}
        >
          {copy("booking-provider.dashboard.decline-submit")}
        </SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          Back
        </button>
      </div>
    </form>
  );
}

/** Submit button that reflects the server action's pending state. */
function SubmitButton({
  children,
  pendingLabel,
  variant,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant: "primary" | "success";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size="sm"
      disabled={pending || disabled}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
