"use client";

import { useMemo, useState, useTransition } from "react";

import {
  resetSiteContent,
  updateSiteContent,
} from "@/app/actions/site-content";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import {
  BOOKING_COPY_SCREENS,
  bookingCopyTokens,
  bookingCopyValue,
  type BookingCopyField,
  type BookingCopyKey,
  type BookingCopyOverrides,
  type BookingCopyPerspective,
  type BookingCopyPreviewStyle,
} from "@/lib/content/booking-copy";

const SAMPLE_VALUES: Record<string, string | number> = {
  provider_name: "Maya",
  hold_amount: "$45.00",
  first_hour_amount: "$45.00",
  response_hours: 2,
  billing_increment: 15,
  cancellation_hours: 12,
  invoice_hours: 24,
  platform_fee_percent: 5,
  max_photos: 6,
  max_mb: 10,
  ready_count: 3,
  added_count: 2,
  photo_word: "photos",
};

function PreviewText({
  style,
  children,
}: {
  style: BookingCopyPreviewStyle;
  children: React.ReactNode;
}) {
  if (style === "title") {
    return (
      <span className="block whitespace-pre-line font-display text-3xl font-semibold leading-tight text-viridian">
        {children}
      </span>
    );
  }
  if (style === "description") {
    return (
      <span className="block max-w-2xl whitespace-pre-line text-sm leading-relaxed text-ink-soft">
        {children}
      </span>
    );
  }
  if (style === "section") {
    return (
      <span className="block whitespace-pre-line font-display text-lg font-semibold text-ink">
        {children}
      </span>
    );
  }
  if (style === "label") {
    return (
      <span className="block whitespace-pre-line text-sm font-medium text-ink">
        {children}
      </span>
    );
  }
  if (style === "muted") {
    return (
      <span className="block whitespace-pre-line text-xs leading-relaxed text-mist">
        {children}
      </span>
    );
  }
  if (style === "placeholder") {
    return (
      <span className="block whitespace-pre-line rounded-xl border-[1.4px] border-viridian/25 bg-paper px-3.5 py-3 text-left text-sm text-mist">
        {children}
      </span>
    );
  }
  if (style === "button" || style === "secondary-button") {
    return (
      <span
        className={buttonClasses({
          variant: style === "button" ? "primary" : "secondary",
          className: "pointer-events-none whitespace-pre-line",
        })}
      >
        {children}
      </span>
    );
  }
  if (style === "success") {
    return (
      <span className="block whitespace-pre-line rounded-lg border border-quad-200 bg-quad-50 p-3 text-sm text-quad-800">
        {children}
      </span>
    );
  }
  if (style === "warning") {
    return (
      <span className="block whitespace-pre-line rounded-lg border border-gold-300 bg-gold-100 p-3 text-sm text-gold-900">
        {children}
      </span>
    );
  }
  if (style === "error") {
    return (
      <span className="block whitespace-pre-line rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {children}
      </span>
    );
  }
  if (style === "callout") {
    return (
      <span className="block whitespace-pre-line rounded-xl border border-line bg-court p-3 text-sm leading-relaxed text-ink-soft">
        {children}
      </span>
    );
  }
  return (
    <span className="block whitespace-pre-line text-sm leading-relaxed text-ink-soft">
      {children}
    </span>
  );
}

function EditablePreviewField({
  field,
  value,
  overridden,
  active,
  onActivate,
  onSaved,
  onReset,
}: {
  field: BookingCopyField;
  value: string;
  overridden: boolean;
  active: boolean;
  onActivate: () => void;
  onSaved: (value: string) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const preview = active
    ? draft.replace(/\{([a-z0-9_]+)\}/g, (token, name: string) =>
        Object.hasOwn(SAMPLE_VALUES, name)
          ? String(SAMPLE_VALUES[name])
          : token,
      )
    : bookingCopyValue(
        { [field.key]: value } as BookingCopyOverrides,
        field.key as BookingCopyKey,
        SAMPLE_VALUES,
      );
  const tokens = bookingCopyTokens(field.defaultValue);

  if (!active) {
    return (
      <div>
        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-mist">
          {field.label}
        </p>
        <button
          type="button"
          onClick={onActivate}
          className="group/field relative block w-full rounded-lg p-1 text-left outline-none transition hover:bg-amber-50/70 focus-visible:ring-2 focus-visible:ring-amber-500"
          title={`Edit ${field.label}`}
        >
          <PreviewText style={field.style}>{preview}</PreviewText>
          <span className="pointer-events-none absolute -right-1 -top-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 opacity-0 shadow-sm transition group-hover/field:opacity-100 group-focus-visible/field:opacity-100">
            Edit
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50/60 p-3">
      <div className="mb-3 rounded-lg bg-paper p-2">
        <PreviewText style={field.style}>{preview}</PreviewText>
      </div>
      <label className="text-xs font-semibold uppercase tracking-wide text-amber-900">
        {field.label}
      </label>
      <Textarea
        value={draft}
        rows={Math.min(7, Math.max(2, draft.split("\n").length + 1))}
        maxLength={4000}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        className="mt-1.5 bg-paper"
        autoFocus
      />
      {tokens.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-amber-900">
          <span>Locked:</span>
          {tokens.map((token) => (
            <code
              key={token}
              className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px]"
            >
              {`{${token}}`}
            </code>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-medium text-red-700">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending || draft.trim() === value.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await updateSiteContent(field.key, draft);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onSaved(draft.trim());
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        {overridden ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await resetSiteContent(field.key);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setDraft(field.defaultValue);
                onReset();
              })
            }
          >
            Reset to default
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setDraft(value);
            setError(null);
            onActivate();
          }}
        >
          Close
        </Button>
      </div>
    </div>
  );
}

export function BookingCopyManager({
  initialOverrides,
}: {
  initialOverrides: BookingCopyOverrides;
}) {
  const [perspective, setPerspective] =
    useState<BookingCopyPerspective>("customer");
  const [overrides, setOverrides] =
    useState<BookingCopyOverrides>(initialOverrides);
  const [activeKey, setActiveKey] = useState<BookingCopyKey | null>(null);
  const screens = useMemo(
    () =>
      BOOKING_COPY_SCREENS.filter(
        (screen) => screen.perspective === perspective,
      ),
    [perspective],
  );

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-quad-700">
          Live web copy
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-viridian sm:text-4xl">
          Booking copy
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">
          These previews use sample booking data, but every saved generic text
          field updates the matching live web page. Names, dates, prices, policy
          values, and other locked placeholders stay connected to real data.
        </p>
      </div>

      <div className="rounded-xl border border-gold-300 bg-gold-100 p-4 text-sm text-gold-900">
        <p className="font-semibold">Copy changes do not change booking rules.</p>
        <p className="mt-1">
          Payment behavior, response windows, cancellation outcomes, invoice
          timing, and dispute eligibility remain controlled by application and
          database logic.
        </p>
      </div>

      <div className="sticky top-0 z-20 -mx-4 border-y border-line bg-shell/95 px-4 py-3 backdrop-blur">
        <div
          role="tablist"
          aria-label="Booking perspective"
          className="flex gap-2"
        >
          {(["customer", "provider"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={perspective === tab}
              onClick={() => {
                setPerspective(tab);
                setActiveKey(null);
              }}
              className={buttonClasses({
                variant: perspective === tab ? "primary" : "secondary",
                size: "sm",
              })}
            >
              {tab === "customer" ? "Customer POV" : "Provider POV"}
            </button>
          ))}
        </div>
        <nav
          aria-label={`${perspective} booking screens`}
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          {screens.map((screen) => (
            <a
              key={screen.id}
              href={`#${screen.id}`}
              className="shrink-0 rounded-full bg-stone px-3 py-1 text-xs font-medium text-viridian hover:bg-honeydew"
            >
              {screen.title}
            </a>
          ))}
        </nav>
      </div>

      {screens.map((screen, index) => (
        <section
          key={screen.id}
          id={screen.id}
          className="scroll-mt-32 border-t border-line pt-8 first:border-0 first:pt-0"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-quad-700">
                {String(index + 1).padStart(2, "0")} · {screen.route}
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold text-viridian">
                {screen.title}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">
                {screen.purpose}
              </p>
            </div>
            <span className="rounded-full border border-line bg-court px-3 py-1 text-xs font-medium text-mist">
              {screen.fields.length} editable fields
            </span>
          </div>

          <div className="rounded-[1.4rem] border border-viridian/15 bg-shell p-3 shadow-inner sm:p-6">
            <div className="mx-auto max-w-2xl">
              <Card pennant className="space-y-4 p-5 sm:p-6">
                {screen.fields.map((field) => {
                  const key = field.key as BookingCopyKey;
                  const value = overrides[key] ?? field.defaultValue;
                  return (
                    <EditablePreviewField
                      key={field.key}
                      field={field}
                      value={value}
                      overridden={overrides[key] != null}
                      active={activeKey === key}
                      onActivate={() =>
                        setActiveKey((current) => (current === key ? null : key))
                      }
                      onSaved={(nextValue) => {
                        setOverrides((current) => ({
                          ...current,
                          [key]: nextValue,
                        }));
                        setActiveKey(null);
                      }}
                      onReset={() => {
                        setOverrides((current) => {
                          const next = { ...current };
                          delete next[key];
                          return next;
                        });
                        setActiveKey(null);
                      }}
                    />
                  );
                })}
              </Card>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
