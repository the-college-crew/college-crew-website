import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  BillingNote,
  Button,
  Card,
  Center,
  Chip,
  ErrorNote,
  Field,
  Loading,
  SectionHeader,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { fetchProviderDetail } from "@/lib/queries";
import { formatMinutes, formatMoney, formatShortDate } from "@/lib/format";
import { color, space, type } from "@/lib/theme";

const DURATIONS = [60, 90, 120, 180, 240, 300];
const RESPONSE_WINDOWS = [12, 24, 48];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function hourLabel(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}

function dayOptions(): { date: Date; label: string }[] {
  const out: { date: Date; label: string }[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatShortDate(d.toISOString());
    out.push({ date: d, label });
  }
  return out;
}

export default function BookScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { session, role } = useSession();

  const provider = useQuery({
    queryKey: ["provider", providerId],
    queryFn: () => fetchProviderDetail(providerId),
  });
  const profile = useQuery({
    queryKey: ["my-profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("address_line1, city, state, postal_code, latitude, longitude")
        .eq("id", session!.user.id)
        .maybeSingle();
      return data;
    },
  });

  const bookable = useMemo(
    () => (provider.data?.services ?? []).filter((s) => s.is_hourly_bookable),
    [provider.data],
  );

  const days = useMemo(dayOptions, []);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [dayIdx, setDayIdx] = useState(1);
  const [hour, setHour] = useState(10);
  const [minutes, setMinutes] = useState(60);
  const [window, setWindow] = useState(24);
  const [details, setDetails] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [zip, setZip] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed defaults once provider + profile arrive.
  const selectedService = serviceId ?? bookable[0]?.id ?? null;
  const addr = address ?? profile.data?.address_line1 ?? "";
  const zipVal = zip ?? profile.data?.postal_code ?? "";
  const cityVal = city ?? profile.data?.city ?? "";

  const scheduledAt = useMemo(() => {
    const d = new Date(days[dayIdx].date);
    d.setHours(hour, 0, 0, 0);
    return d;
  }, [days, dayIdx, hour]);

  const chosen = bookable.find((s) => s.id === selectedService);
  const subtotal =
    chosen?.hourly_rate_cents != null
      ? Math.round((chosen.hourly_rate_cents * minutes) / 60)
      : null;

  async function submit() {
    if (!selectedService) {
      Alert.alert("Pick a service", "Choose what you need help with.");
      return;
    }
    if (addr.trim().length < 5 || !/^\d{5}$/.test(zipVal.trim())) {
      Alert.alert("Add your address", "Enter the job address and a 5-digit ZIP code.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_hourly_booking_request", {
      p_provider_service_id: selectedService,
      p_scheduled_at: scheduledAt.toISOString(),
      p_estimated_minutes: minutes,
      p_response_window_hours: window,
      p_address: addr.trim(),
      p_job_zip: zipVal.trim(),
      p_service_city: cityVal.trim() || undefined,
      p_address_kind: "home",
      p_latitude: profile.data?.latitude ?? undefined,
      p_longitude: profile.data?.longitude ?? undefined,
      p_details: details.trim() || undefined,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Could not send request", friendlyRequestError(error.message));
      return;
    }
    Alert.alert("Request sent", "The provider has been notified. You can track it under Bookings.", [
      { text: "OK", onPress: () => router.replace(`/bookings/${data as string}`) },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Request booking", headerBackTitle: "Back" }} />
      {!session ? (
        <Center>
          <ErrorNote message="Log in to request a booking." />
          <Button title="Log in" onPress={() => router.push("/(auth)/login")} />
        </Center>
      ) : role === "admin" ? (
        <Center>
          <ErrorNote message="Admin accounts can't book. Use a customer account." />
        </Center>
      ) : provider.isLoading || profile.isLoading ? (
        <Loading />
      ) : bookable.length === 0 ? (
        <Center>
          <ErrorNote message="This provider isn't taking bookings yet." />
        </Center>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={{ backgroundColor: color.cream }}
            contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
            keyboardShouldPersistTaps="handled"
          >
            <Card>
              <SectionHeader title="What do you need?" />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm }}>
                {bookable.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.service_name}
                    selected={selectedService === s.id}
                    onPress={() => setServiceId(s.id)}
                  />
                ))}
              </View>
            </Card>

            <Card>
              <SectionHeader title="When?" />
              <Text style={styles.subLabel}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {days.map((d, i) => (
                  <Chip key={i} label={d.label} selected={dayIdx === i} onPress={() => setDayIdx(i)} />
                ))}
              </ScrollView>
              <Text style={styles.subLabel}>Start time (CT)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {HOURS.map((h) => (
                  <Chip key={h} label={hourLabel(h)} selected={hour === h} onPress={() => setHour(h)} />
                ))}
              </ScrollView>
              <Text style={styles.subLabel}>Estimated time</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {DURATIONS.map((m) => (
                  <Chip key={m} label={formatMinutes(m)} selected={minutes === m} onPress={() => setMinutes(m)} />
                ))}
              </View>
            </Card>

            <Card>
              <SectionHeader title="Where?" />
              <View style={{ gap: space.md, marginTop: space.sm }}>
                <Field label="Address" value={addr} onChangeText={setAddress} placeholder="123 Maple St" />
                <View style={{ flexDirection: "row", gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Field label="City" value={cityVal} onChangeText={setCity} placeholder="Chicago" />
                  </View>
                  <View style={{ width: 120 }}>
                    <Field
                      label="ZIP"
                      value={zipVal}
                      onChangeText={setZip}
                      keyboardType="number-pad"
                      maxLength={5}
                      placeholder="60614"
                    />
                  </View>
                </View>
              </View>
            </Card>

            <Card>
              <SectionHeader title="Details & response window" />
              <View style={{ gap: space.md, marginTop: space.sm }}>
                <Field
                  label="Anything the provider should know?"
                  value={details}
                  onChangeText={setDetails}
                  multiline
                  placeholder="Optional — gate code, what to bring, etc."
                  maxLength={2000}
                />
                <Text style={styles.subLabel}>Give the provider this long to respond</Text>
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  {RESPONSE_WINDOWS.map((w) => (
                    <Chip key={w} label={`${w} hr`} selected={window === w} onPress={() => setWindow(w)} />
                  ))}
                </View>
              </View>
            </Card>

            <Card>
              {subtotal != null ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ ...type.body, color: color.inkSoft }}>Estimated first charge</Text>
                  <Text style={{ ...type.title2, color: color.ink }}>{formatMoney(subtotal)}</Text>
                </View>
              ) : null}
              <View style={{ marginTop: space.sm }}>
                <BillingNote />
              </View>
            </Card>

            <Button title="Send request" onPress={submit} loading={busy} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </>
  );
}

/** Map the RPC's typed error codes to human copy (see requests.ts on the web). */
function friendlyRequestError(code: string): string {
  const map: Record<string, string> = {
    SELF_BOOKING_NOT_ALLOWED: "You can't book your own listing.",
    ADMIN_BOOKING_NOT_ALLOWED: "Admin accounts can't book.",
    EMAIL_CONFIRMATION_REQUIRED: "Confirm your email before booking.",
    LEGAL_ACCEPTANCE_REQUIRED: "You'll need to accept the booking terms on the website first.",
    OFFERING_NOT_BOOKABLE: "That service isn't bookable yet.",
    INVALID_DURATION: "Pick a valid estimated time.",
    INVALID_RESPONSE_WINDOW: "Pick a valid response window.",
    RESPONSE_WINDOW_REACHES_START: "The response window is longer than the time until the job.",
    INVALID_JOB_ZIP: "Enter a valid 5-digit ZIP code.",
    INVALID_JOB_ADDRESS: "Enter a valid job address.",
    MINIMUM_NOTICE_NOT_MET: "This provider needs more notice. Pick a later time.",
    OUTSIDE_PROVIDER_AVAILABILITY: "That time is outside the provider's availability.",
    PROVIDER_SLOT_ALREADY_RESERVED: "That slot was just taken. Try another time.",
    PROVIDER_NO_LONGER_READY: "This provider is no longer taking bookings.",
    REQUEST_EXPIRED: "That request expired. Please start again.",
  };
  for (const key of Object.keys(map)) {
    if (code.includes(key)) return map[key];
  }
  return code;
}

const styles = {
  subLabel: {
    ...type.subhead,
    color: color.inkSoft,
    fontWeight: "500" as const,
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  chipRow: { gap: space.sm, paddingVertical: 2, paddingRight: space.md },
};
