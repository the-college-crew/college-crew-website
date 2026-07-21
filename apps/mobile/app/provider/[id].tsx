import { Alert, ScrollView, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  Avatar,
  Badge,
  Banner,
  BillingNote,
  Button,
  Card,
  Center,
  Chip,
  Divider,
  ErrorNote,
  Loading,
  Rating,
  Row,
  SectionHeader,
  VerifiedBadge,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import {
  WEEKDAY_LABELS,
  fetchProviderDetail,
  formatLocalTime,
  type ProviderDetail,
} from "@/lib/queries";
import { formatOfferedPrice, formatShortDate } from "@/lib/format";
import { color, space, type } from "@/lib/theme";

export default function ProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();

  const query = useQuery({
    queryKey: ["provider", id],
    queryFn: () => fetchProviderDetail(id),
  });

  async function message() {
    if (!session) {
      router.push("/(auth)/login");
      return;
    }
    // Find-or-open the booking-less inquiry thread for this pair (RLS lets a
    // member insert; unique(customer, provider) where booking_id is null).
    const existing = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", session.user.id)
      .eq("provider_id", id)
      .is("booking_id", null)
      .maybeSingle();
    let convId = existing.data?.id as string | undefined;
    if (!convId) {
      const created = await supabase
        .from("conversations")
        .insert({ customer_id: session.user.id, provider_id: id, booking_id: null })
        .select("id")
        .single();
      convId = created.data?.id as string | undefined;
      if (created.error && created.error.code === "23505") {
        const raced = await supabase
          .from("conversations")
          .select("id")
          .eq("customer_id", session.user.id)
          .eq("provider_id", id)
          .is("booking_id", null)
          .maybeSingle();
        convId = raced.data?.id as string | undefined;
      }
    }
    if (!convId) {
      Alert.alert("Could not open chat", "Please try again in a moment.");
      return;
    }
    router.push(`/messages/${convId}`);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "", headerBackTitle: "Back" }} />
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <Center>
          <ErrorNote message="Could not load this profile." />
        </Center>
      ) : !query.data ? (
        <Center>
          <ErrorNote message="This provider is no longer listed." />
        </Center>
      ) : (
        <ProviderBody provider={query.data} onMessage={message} />
      )}
    </>
  );
}

function ProviderBody({
  provider,
  onMessage,
}: {
  provider: ProviderDetail;
  onMessage: () => void;
}) {
  const name = provider.company_name || provider.display_name;
  const bookable = provider.services.filter((s) => s.is_hourly_bookable);

  return (
    <ScrollView
      style={{ backgroundColor: color.cream }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
    >
      <Card padded={false}>
        <Banner height={104} />
        <View style={{ padding: space.md, gap: space.sm }}>
          <View style={{ marginTop: -52 }}>
            <Avatar name={name} size={72} onBanner />
          </View>
          <Text style={{ ...type.title1, color: color.ink }}>{name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
            <VerifiedBadge />
            <Rating avg={provider.rating?.avg ?? null} count={provider.rating?.count ?? null} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
            <Badge
              label={
                provider.provider_type === "business" ? "Student business" : "Hardworking individual"
              }
              tone={provider.provider_type === "business" ? "sky" : "stone"}
            />
            {provider.neighborhood ? (
              <Text style={{ ...type.footnote, color: color.inkSoft }}>{provider.neighborhood}</Text>
            ) : null}
          </View>

          {provider.bio ? (
            <Text style={{ ...type.body, color: color.inkSoft, lineHeight: 23 }}>{provider.bio}</Text>
          ) : null}

          <View style={{ gap: space.sm, marginTop: space.xs }}>
            <Button
              title="Request booking"
              onPress={() => router.push(`/book/${provider.id}`)}
              disabled={bookable.length === 0}
            />
            <Button title="Message" variant="secondary" onPress={onMessage} />
          </View>
          {bookable.length === 0 ? (
            <Text style={{ ...type.footnote, color: color.inkSoft }}>
              This provider is finishing setup and isn&apos;t taking bookings yet.
            </Text>
          ) : (
            <BillingNote />
          )}
        </View>
      </Card>

      <Card>
        <SectionHeader title="Services & pricing" />
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          {provider.services.map((s) => (
            <Row key={s.id} label={s.service_name} value={formatOfferedPrice(s)} />
          ))}
        </View>
      </Card>

      {provider.availability_windows.length > 0 || provider.availability_note ? (
        <Card>
          <SectionHeader title="Availability" />
          <View style={{ gap: space.sm, marginTop: space.sm }}>
            {groupWindows(provider.availability_windows).map((g, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {g.weekdays.map((w) => (
                    <Chip key={w} label={WEEKDAY_LABELS[w]} />
                  ))}
                </View>
                <Text style={{ ...type.subhead, color: color.inkSoft }}>
                  {formatLocalTime(g.start)}–{formatLocalTime(g.end)} CT
                </Text>
              </View>
            ))}
            {provider.availability_note ? (
              <Text style={{ ...type.subhead, color: color.inkSoft }}>{provider.availability_note}</Text>
            ) : null}
            <Text style={{ ...type.footnote, color: color.mist }}>
              Request at least {provider.minimum_notice_hours} hours ahead.
            </Text>
          </View>
        </Card>
      ) : null}

      {provider.reviews.length > 0 ? (
        <Card>
          <SectionHeader title="Reviews" />
          <View style={{ gap: space.md, marginTop: space.sm }}>
            {provider.reviews.map((r, i) => (
              <View key={r.id} style={{ gap: 4 }}>
                {i > 0 ? <Divider /> : null}
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center", marginTop: i > 0 ? space.sm : 0 }}>
                  <Text style={{ color: color.goldStar, letterSpacing: 1 }}>
                    {"★".repeat(r.rating)}
                    <Text style={{ color: color.line }}>{"★".repeat(5 - r.rating)}</Text>
                  </Text>
                  <Text style={{ ...type.footnote, color: color.mist }}>
                    {r.service_name ? `${r.service_name} · ` : ""}
                    {formatShortDate(r.created_at)}
                  </Text>
                </View>
                {r.text ? (
                  <Text style={{ ...type.subhead, color: color.inkSoft, lineHeight: 20 }}>{r.text}</Text>
                ) : null}
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

/** Collapse windows that share a time range into one weekday-chip group. */
function groupWindows(
  windows: ProviderDetail["availability_windows"],
): { weekdays: number[]; start: string; end: string }[] {
  const byRange = new Map<string, { weekdays: number[]; start: string; end: string }>();
  for (const w of [...windows].sort((a, b) => a.weekday - b.weekday)) {
    const key = `${w.start_local}-${w.end_local}`;
    if (!byRange.has(key)) byRange.set(key, { weekdays: [], start: w.start_local, end: w.end_local });
    byRange.get(key)!.weekdays.push(w.weekday);
  }
  return [...byRange.values()];
}
