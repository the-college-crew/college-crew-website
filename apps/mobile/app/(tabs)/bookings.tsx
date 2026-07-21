import { useMemo } from "react";
import { ActivityIndicator, SectionList, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, ErrorNote } from "@/components/ui";
import { BookingRow } from "@/components/booking-row";
import { useSession } from "@/lib/session";
import { fetchMyBookings, isActive } from "@/lib/bookings";
import { color, space, type } from "@/lib/theme";

export default function Bookings() {
  const { session } = useSession();

  const bookings = useQuery({
    queryKey: ["my-bookings", session?.user.id],
    enabled: !!session,
    queryFn: fetchMyBookings,
  });

  // Only the bookings where I'm the customer belong on this tab.
  const sections = useMemo(() => {
    const mine = (bookings.data ?? []).filter((b) => b.customer_id === session?.user.id);
    const active = mine.filter((b) => isActive(b.status));
    const past = mine.filter((b) => !isActive(b.status));
    return [
      { title: "Active", data: active },
      { title: "Past", data: past },
    ].filter((s) => s.data.length > 0);
  }, [bookings.data, session?.user.id]);

  if (!session) {
    return (
      <EmptyState
        title="Your bookings live here"
        body="Log in to request services and track every booking from request to completion."
        action={<Button title="Log in" onPress={() => router.push("/(auth)/login")} />}
      />
    );
  }

  if (bookings.isLoading) {
    return <ActivityIndicator color={color.viridian} style={{ marginTop: space.xxl }} />;
  }

  if (bookings.isError) {
    return <ErrorNote message="Could not load your bookings. Pull to retry." />;
  }

  if (sections.length === 0) {
    return (
      <EmptyState
        title="No bookings yet"
        body="Browse verified students nearby and send your first request."
        action={<Button title="Browse the crew" onPress={() => router.push("/(tabs)/browse")} />}
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
        <Text style={{ ...type.footnote, color: color.mist, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginTop: space.sm }}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <View style={{ marginTop: space.sm }}>
          <BookingRow
            booking={item}
            counterparty="provider"
            onPress={() => router.push(`/bookings/${item.id}`)}
          />
        </View>
      )}
      refreshing={bookings.isRefetching}
      onRefresh={() => bookings.refetch()}
    />
  );
}
