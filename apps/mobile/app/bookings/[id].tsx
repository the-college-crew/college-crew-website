import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BillingNote,
  Button,
  Card,
  Center,
  Chip,
  Divider,
  ErrorNote,
  Field,
  Loading,
  Row,
  SectionHeader,
  StatusBadge,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import {
  fetchBooking,
  fetchMyReviewedBookingIds,
  openBookingConversation,
  type Booking,
} from "@/lib/bookings";
import { formatDateTime, formatMinutes, formatMoney } from "@/lib/format";
import { color, space, type } from "@/lib/theme";

/** Runs a Supabase mutation (a PromiseLike resolving to {error}), then refreshes. */
type Runner = (
  fn: () => PromiseLike<{ error: { message: string } | null }>,
  ok?: string,
) => Promise<void>;

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const qc = useQueryClient();

  const booking = useQuery({ queryKey: ["booking", id], queryFn: () => fetchBooking(id) });
  const reviewed = useQuery({
    queryKey: ["reviewed-bookings", session?.user.id],
    enabled: !!session,
    queryFn: fetchMyReviewedBookingIds,
  });

  const [busy, setBusy] = useState(false);

  const run: Runner = async (fn, okMessage) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      Alert.alert("Something went wrong", error.message);
      return;
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["booking", id] }),
      qc.invalidateQueries({ queryKey: ["my-bookings"] }),
      qc.invalidateQueries({ queryKey: ["provider-jobs"] }),
      qc.invalidateQueries({ queryKey: ["reviewed-bookings"] }),
    ]);
    if (okMessage) Alert.alert(okMessage);
  }

  async function message(b: Booking) {
    const convId = await openBookingConversation(b);
    if (!convId) {
      Alert.alert("Could not open chat", "Please try again in a moment.");
      return;
    }
    router.push(`/messages/${convId}`);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Booking", headerBackTitle: "Back" }} />
      {booking.isLoading ? (
        <Loading />
      ) : booking.isError || !booking.data ? (
        <Center>
          <ErrorNote message="This booking could not be found." />
        </Center>
      ) : (
        <Body
          booking={booking.data}
          amCustomer={booking.data.customer_id === session?.user.id}
          alreadyReviewed={reviewed.data?.has(booking.data.id) ?? false}
          busy={busy}
          run={run}
          onMessage={() => message(booking.data!)}
        />
      )}
    </>
  );
}

function Body({
  booking,
  amCustomer,
  alreadyReviewed,
  busy,
  run,
  onMessage,
}: {
  booking: Booking;
  amCustomer: boolean;
  alreadyReviewed: boolean;
  busy: boolean;
  run: Runner;
  onMessage: () => void;
}) {
  const who = amCustomer ? booking.provider_name : booking.customer_name;

  return (
    <ScrollView
      style={{ backgroundColor: color.cream }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
    >
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
          <Text style={{ ...type.title2, color: color.ink, flexShrink: 1 }}>{booking.service_name}</Text>
          <StatusBadge status={booking.status} />
        </View>
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Row label={amCustomer ? "Provider" : "Customer"} value={who} />
          <Row label="When" value={formatDateTime(booking.scheduled_at)} />
          {booking.address ? <Row label="Where" value={booking.address} /> : null}
          {booking.estimated_minutes ? (
            <Row label="Estimated" value={formatMinutes(booking.estimated_minutes)} />
          ) : null}
          {booking.hourly_rate_cents_snapshot ? (
            <Row label="Rate" value={`${formatMoney(booking.hourly_rate_cents_snapshot)}/hr`} />
          ) : null}
        </View>
        {booking.details ? (
          <>
            <View style={{ marginVertical: space.md }}>
              <Divider />
            </View>
            <Text style={{ ...type.subhead, color: color.inkSoft, lineHeight: 20 }}>
              {booking.details}
            </Text>
          </>
        ) : null}
      </Card>

      {booking.invoice ? <InvoiceCard invoice={booking.invoice} /> : null}

      <Button title="Message" variant="secondary" onPress={onMessage} />

      {amCustomer ? (
        <CustomerActions booking={booking} alreadyReviewed={alreadyReviewed} busy={busy} run={run} />
      ) : (
        <ProviderActions booking={booking} busy={busy} run={run} />
      )}
    </ScrollView>
  );
}

function InvoiceCard({ invoice }: { invoice: NonNullable<Booking["invoice"]> }) {
  return (
    <Card>
      <SectionHeader title="Invoice" />
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {invoice.submitted_minutes != null ? (
          <Row label="Time worked" value={formatMinutes(invoice.submitted_minutes)} />
        ) : null}
        {invoice.subtotal_cents != null ? (
          <Row label="Subtotal" value={formatMoney(invoice.subtotal_cents)} />
        ) : null}
        {invoice.remaining_balance_cents != null ? (
          <Row label="Balance due" value={formatMoney(invoice.remaining_balance_cents)} emphasize />
        ) : null}
        {invoice.provider_explanation ? (
          <Text style={{ ...type.footnote, color: color.inkSoft, marginTop: space.xs }}>
            {invoice.provider_explanation}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/* ------------------------------- customer -------------------------------- */

function CustomerActions({
  booking,
  alreadyReviewed,
  busy,
  run,
}: {
  booking: Booking;
  alreadyReviewed: boolean;
  busy: boolean;
  run: Runner;
}) {
  const s = booking.status;

  function confirmCancel() {
    Alert.alert("Cancel this booking?", "This can't be undone.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: () =>
          run(
            () =>
              supabase.rpc(
                s === "requested" ? "cancel_booking_request" : "cancel_booking_as_customer",
                { p_booking_id: booking.id },
              ),
            "Booking cancelled.",
          ),
      },
    ]);
  }

  return (
    <View style={{ gap: space.md }}>
      {(s === "accepted" || s === "invoice_review") ? <PaymentNotice status={s} /> : null}

      {(s === "requested" || s === "accepted" || s === "booked") ? (
        <Button title="Cancel booking" variant="secondary" onPress={confirmCancel} loading={busy} />
      ) : null}

      {s === "declined" ? (
        <Button
          title="Dismiss"
          variant="secondary"
          onPress={() =>
            run(() => supabase.rpc("dismiss_booking", { p_booking_id: booking.id }))
          }
          loading={busy}
        />
      ) : null}

      {s === "completed" && !alreadyReviewed ? (
        <ReviewForm booking={booking} busy={busy} run={run} />
      ) : null}
      {s === "completed" && alreadyReviewed ? (
        <Text style={{ ...type.subhead, color: color.success, textAlign: "center" }}>
          ✓ You reviewed this booking
        </Text>
      ) : null}
    </View>
  );
}

/** First-hour / balance payment both need the in-app payment sheet (Stripe). */
function PaymentNotice({ status }: { status: string }) {
  const first = status === "accepted";
  return (
    <Card>
      <SectionHeader title={first ? "Pay the first hour" : "Review & pay the balance"} />
      <Text style={{ ...type.subhead, color: color.inkSoft, lineHeight: 20, marginTop: space.sm }}>
        {first
          ? "Your provider accepted. Pay the first hour to confirm the booking."
          : "Your provider submitted an invoice. Pay the remaining balance to complete the job."}
      </Text>
      <View style={{ marginTop: space.md }}>
        <Button
          title={first ? "Pay first hour" : "Review & pay"}
          onPress={() =>
            Alert.alert(
              "In-app payment coming soon",
              "Secure card payment lands with the next app update. For now, complete this payment on thecollegecrew.com.",
            )
          }
        />
      </View>
      <View style={{ marginTop: space.sm }}>
        <BillingNote />
      </View>
    </Card>
  );
}

function ReviewForm({
  booking,
  busy,
  run,
}: {
  booking: Booking;
  busy: boolean;
  run: Runner;
}) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  return (
    <Card>
      <SectionHeader title="Leave a review" />
      <View style={{ flexDirection: "row", gap: space.xs, marginTop: space.sm }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Text
            key={n}
            onPress={() => setRating(n)}
            style={{ fontSize: 30, color: n <= rating ? color.goldStar : color.line }}
          >
            ★
          </Text>
        ))}
      </View>
      <View style={{ marginTop: space.md, gap: space.md }}>
        <Field
          label="Your review"
          value={text}
          onChangeText={setText}
          multiline
          placeholder="How did it go?"
          maxLength={2000}
        />
        <Button
          title="Submit review"
          loading={busy}
          onPress={() =>
            run(
              () =>
                supabase
                  .from("reviews")
                  .insert({ booking_id: booking.id, rating, text: text.trim() }),
              "Thanks for the review!",
            )
          }
        />
      </View>
    </Card>
  );
}

/* ------------------------------- provider -------------------------------- */

function ProviderActions({
  booking,
  busy,
  run,
}: {
  booking: Booking;
  busy: boolean;
  run: Runner;
}) {
  const s = booking.status;

  function confirmDecline() {
    Alert.alert("Decline this request?", "The customer will be notified.", [
      { text: "Back", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: () =>
          run(
            () => supabase.rpc("decline_booking_request", { p_booking_id: booking.id }),
            "Request declined.",
          ),
      },
    ]);
  }

  function cancelJob() {
    Alert.prompt?.("Cancel job", "Give the customer a brief reason (required).", (reason) => {
      if (!reason || reason.trim().length < 3) return;
      run(
        () =>
          supabase.rpc("cancel_booking_as_provider", {
            p_booking_id: booking.id,
            p_reason: reason.trim(),
          }),
        "Job cancelled.",
      );
    });
  }

  return (
    <View style={{ gap: space.md }}>
      {s === "requested" ? (
        <>
          <Button
            title="Accept request"
            loading={busy}
            onPress={() =>
              run(
                () => supabase.rpc("accept_booking_request", { p_booking_id: booking.id }),
                "Accepted. The customer will pay the first hour to confirm.",
              )
            }
          />
          <Button title="Decline" variant="secondary" onPress={confirmDecline} loading={busy} />
        </>
      ) : null}

      {s === "accepted" ? (
        <Text style={{ ...type.subhead, color: color.inkSoft, textAlign: "center" }}>
          Waiting for the customer to pay the first hour.
        </Text>
      ) : null}

      {s === "booked" ? (
        <>
          <Button
            title="I've arrived"
            loading={busy}
            onPress={() =>
              run(() => supabase.rpc("mark_booking_arrived", { p_booking_id: booking.id }))
            }
          />
          <Button title="Cancel job" variant="secondary" onPress={cancelJob} loading={busy} />
        </>
      ) : null}

      {s === "in_progress" ? <InvoiceForm booking={booking} busy={busy} run={run} /> : null}

      {s === "invoice_review" ? (
        <Text style={{ ...type.subhead, color: color.inkSoft, textAlign: "center" }}>
          Invoice submitted. Waiting for the customer to pay the balance.
        </Text>
      ) : null}
    </View>
  );
}

function InvoiceForm({
  booking,
  busy,
  run,
}: {
  booking: Booking;
  busy: boolean;
  run: Runner;
}) {
  const floor = Math.max(60, booking.estimated_minutes ?? 60);
  const options = [floor, floor + 15, floor + 30, floor + 60, floor + 120];
  const [minutes, setMinutes] = useState(floor);
  const [explanation, setExplanation] = useState("");
  const overEstimate = minutes > (booking.estimated_minutes ?? 60);

  return (
    <Card>
      <SectionHeader title="Complete & invoice" />
      <Text style={{ ...type.subhead, color: color.inkSoft, marginTop: space.sm }}>
        How long did the job take?
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm }}>
        {options.map((m) => (
          <Chip key={m} label={formatMinutes(m)} selected={minutes === m} onPress={() => setMinutes(m)} />
        ))}
      </View>
      <View style={{ marginTop: space.md, gap: space.md }}>
        <Field
          label={overEstimate ? "Explain the extra time (required)" : "Note (optional)"}
          value={explanation}
          onChangeText={setExplanation}
          multiline
          placeholder="What did the job involve?"
          maxLength={2000}
        />
        <Button
          title="Submit invoice"
          loading={busy}
          disabled={overEstimate && explanation.trim().length === 0}
          onPress={() =>
            run(
              () =>
                supabase.rpc("submit_job_invoice", {
                  p_booking_id: booking.id,
                  p_submitted_minutes: minutes,
                  p_provider_explanation: explanation.trim(),
                }),
              "Invoice submitted.",
            )
          }
        />
      </View>
    </Card>
  );
}
