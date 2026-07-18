"use client";

import { useActionState, useState } from "react";

import { submitSupportTicket } from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FieldError,
  FieldHint,
  Input,
  Label,
  Textarea,
} from "@/components/ui/field";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_SENTIMENTS,
} from "@/lib/support/tickets";
import { cn } from "@/lib/utils";
import {
  INITIAL_SUPPORT_FORM_STATE,
  type SupportFormState,
} from "@/lib/validation/support";

export function SupportForm({
  defaultEmail,
  sourcePath,
}: {
  defaultEmail?: string;
  sourcePath?: string;
}) {
  const [state, formAction, pending] = useActionState<
    SupportFormState,
    FormData
  >(submitSupportTicket, INITIAL_SUPPORT_FORM_STATE);
  const [wantsReply, setWantsReply] = useState(false);
  const [sentiment, setSentiment] = useState("");

  if (state.success) {
    return (
      <Card className="p-6 sm:p-8" pennant>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-honeydew text-xl text-viridian"
          aria-hidden
        >
          ✓
        </div>
        <h2 className="mt-5 font-display text-2xl font-semibold text-viridian">
          Message received
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {state.message}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          If you requested a response, a founder will follow up at the email
          you provided.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-6"
          onClick={() => window.location.assign("/support")}
        >
          Send another message
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-7" pennant>
      <form action={formAction} className="space-y-7">
        <input type="hidden" name="sourcePath" value={sourcePath ?? ""} />
        <div
          aria-hidden="true"
          className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
        >
          <label htmlFor="support-website">Website</label>
          <input
            id="support-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-ink">
            What is this about?
          </legend>
          <p className="mt-1 text-xs text-mist">Choose the closest match.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {SUPPORT_CATEGORIES.map((category) => (
              <label
                key={category.value}
                className="block h-full cursor-pointer rounded-xl border border-stone bg-paper p-4 transition-colors hover:border-viridian/45 hover:bg-shell has-[:checked]:border-viridian has-[:checked]:bg-honeydew/45"
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="category"
                    value={category.value}
                    required
                    className="mt-1 accent-viridian"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">
                      {category.label}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-mist">
                      {category.description}
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </div>
          <FieldError>{state.errors?.category?.[0]}</FieldError>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-ink">
            How has this experience felt?{" "}
            <span className="ml-2 text-xs font-normal text-mist">Optional</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUPPORT_SENTIMENTS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                  sentiment === option.value
                    ? "border-viridian bg-viridian text-shell"
                    : "border-stone bg-paper text-ink-soft hover:border-viridian/45",
                )}
              >
                <input
                  type="radio"
                  name="sentiment"
                  value={option.value}
                  checked={sentiment === option.value}
                  onChange={() => setSentiment(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
            {sentiment ? (
              <button
                type="button"
                onClick={() => setSentiment("")}
                className="px-2 text-xs font-semibold text-mist underline hover:text-ink"
              >
                Clear
              </button>
            ) : null}
          </div>
          <FieldError>{state.errors?.sentiment?.[0]}</FieldError>
        </fieldset>

        <div>
          <Label htmlFor="support-message">Tell us more</Label>
          <Textarea
            id="support-message"
            name="message"
            rows={8}
            minLength={10}
            maxLength={5000}
            required
            placeholder="What happened, what did you expect, or what would make College Crew more useful?"
            aria-describedby="support-message-hint"
          />
          <FieldHint id="support-message-hint">
            Please don’t include passwords, payment-card details, or identity
            documents.
          </FieldHint>
          <FieldError>{state.errors?.message?.[0]}</FieldError>
        </div>

        <div className="rounded-xl border border-stone bg-shell p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="wantsReply"
              checked={wantsReply}
              onChange={(event) => setWantsReply(event.target.checked)}
              className="mt-1 accent-viridian"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">
                I’d like a response
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-mist">
                A founder can follow up during the pilot. We don’t promise an
                immediate response.
              </span>
            </span>
          </label>

          {wantsReply ? (
            <div className="mt-4">
              <Label htmlFor="support-email">Reply email</Label>
              <Input
                id="support-email"
                name="contactEmail"
                type="email"
                defaultValue={defaultEmail}
                maxLength={320}
                required
                autoComplete="email"
              />
              {defaultEmail ? (
                <FieldHint>
                  Your account email is prefilled, but you can change it for
                  this message.
                </FieldHint>
              ) : null}
              <FieldError>{state.errors?.contactEmail?.[0]}</FieldError>
            </div>
          ) : null}
        </div>

        {state.message ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {state.message}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={pending}
        >
          {pending ? "Sending…" : "Send feedback"}
        </Button>
      </form>
    </Card>
  );
}
