import { useMemo } from "react";
import { ActivityIndicator, SectionList, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorNote } from "@/components/ui";
import { BookingRow } from "@/components/booking-row";
import { useSession } from "@/lib/session";
import { fetchMyBookings } from "@/lib/bookings";
import type { BookingStatus } from "@/lib/status";
import { color, space, type } from "@/lib/theme";

const ACTIVE: BookingStatus[] = ["accepted", "booked", "in_progress", "invoice_review", "paid", "disputed"];

/**
 * Provider work surface. Only reachable when the account owns a
 * provider_profiles row (the tab is hidden otherwise; see (tabs)/_layout).
 * "My jobs" = bookings I'm party to where I'm NOT the customer.
 */
export default function Provider() {
  const { session } = useSession();

  const bookings = useQuery({
    queryKey: ["provider-jobs", session?.user.id],
    enabled: !!session,
    queryFn: fetchMyBookings,
  });

  const sections = useMemo(() => {
    const jobs = (bookings.data ?? []).filter((b) => b.customer_id !== session?.user.id);
    const requests = jobs.filter((b) => b.status === "requested");
    const active = jobs.filter((b) => ACTIVE.includes(b.status));
    const past = jobs.filter((b) => b.status !== "requested" && !ACTIVE.includes(b.status));
    return [
      { title: "New requests", data: requests },
      { title: "Active jobs", data: active },
      { title: "Past", data: past },
    ].filter((s) => s.data.length > 0);
  }, [bookings.data, session?.user.id]);

  if (bookings.isLoading) {
    return <ActivityIndicator color={color.viridian} style={{ marginTop: space.xxl }} />;
  }
  if (bookings.isError) {
    return <ErrorNote message="Could not load your jobs. Pull to retry." />;
  }
  if (sections.length === 0) {
    return (
      <EmptyState
        title="No jobs yet"
        body="When neighbors request you, their bookings show up here to accept, run, and invoice."
      />
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(b) => b.id}
      contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <Text
          style={{
            ...type.footnote,
            color: color.mist,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginTop: space.sm,
          }}
        >
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <View style={{ marginTop: space.sm }}>
          <BookingRow
            booking={item}
            counterparty="customer"
            onPress={() => router.push(`/bookings/${item.id}`)}
          />
        </View>
      )}
      refreshing={bookings.isRefetching}
      onRefresh={() => bookings.refetch()}
    />
  );
}
